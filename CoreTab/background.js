// CoreTab - Background Service Worker
// Handles badge updates and extension lifecycle

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'
];

// Recent Tabs
const RECENT_TABS_KEY = 'coretab_recent_tabs';
const RECENT_TABS_CONFIG_KEY = 'coretab_recent_config';
const DEFAULT_TRACKED_DOMAINS = [
  'feishu.cn',
  'larksuite.com',
  'notion.so',
  'docs.google.com',
  'drive.google.com',
  'slides.google.com',
  'sheets.google.com',
  'elink.e.hihonor.com'
];
const RECENT_MAX_PER_DOMAIN = 50;
const RECENT_MAX_TOTAL = 200;
const MAX_RECENT_TABS_AGE_DAYS = 30;
let trackedDomainsCache = null;

// 例外：这些chrome://页面应该显示在opentabs下面
const ALLOWED_CHROME_PAGES = [
  'chrome://newtab/',
  'chrome://newtab',
  'chrome://extensions/',
  'chrome://extensions'
];

function isSystemUrl(url) {
  if (!url) return true;
  if (ALLOWED_CHROME_PAGES.some(p => url === p)) {
    return false;
  }
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
}

// Recent Tabs helper functions
function extractHostname(url) {
  if (!url) return null;
  if (url === 'chrome://newtab/' || url === 'chrome://newtab') {
    return 'new-tab';
  }
  if (url === 'chrome://extensions/' || url === 'chrome://extensions') {
    return 'extensions';
  }
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

async function getTrackedDomains() {
  if (trackedDomainsCache) return trackedDomainsCache;
  try {
    const result = await chrome.storage.local.get(RECENT_TABS_CONFIG_KEY);
    const configured = result[RECENT_TABS_CONFIG_KEY];
    trackedDomainsCache = Array.isArray(configured) && configured.length > 0
      ? configured
      : [...DEFAULT_TRACKED_DOMAINS];
  } catch {
    trackedDomainsCache = [...DEFAULT_TRACKED_DOMAINS];
  }
  return trackedDomainsCache;
}

function domainMatches(hostname, domain) {
  if (!hostname || !domain) return false;
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('*')) {
    const wildcardDomain = normalized.replace(/^\*\./, '');
    return hostname === wildcardDomain || hostname.endsWith('.' + wildcardDomain);
  }
  return hostname === normalized || hostname.endsWith('.' + normalized);
}

async function shouldTrackUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const trackedDomains = await getTrackedDomains();
    return trackedDomains.some(domain => domainMatches(hostname, domain));
  } catch {
    return false;
  }
}

// Use chrome.storage.local instead of localStorage (SV in MV3 has no localStorage)
async function getRecentTabs() {
  try {
    const result = await chrome.storage.local.get(RECENT_TABS_KEY);
    return result[RECENT_TABS_KEY] || [];
  } catch {
    return [];
  }
}

async function saveRecentTabs(tabs) {
  try {
    await chrome.storage.local.set({ [RECENT_TABS_KEY]: tabs });
  } catch (err) {
    console.error('[coretab-bg] saveRecentTabs: chrome.storage.local write failed', err);
  }
}

// Pure: drop recent entries older than the retention window.
function pruneRecentTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  const cutoff = Date.now() - MAX_RECENT_TABS_AGE_DAYS * 86400000;
  return tabs.filter(t => t && typeof t.visitedAt === 'number' && t.visitedAt >= cutoff);
}

// Convenience: load → prune → save (no-op if nothing to prune).
async function pruneAndSaveRecentTabs() {
  try {
    const tabs = await getRecentTabs();
    const pruned = pruneRecentTabs(tabs);
    if (pruned.length < tabs.length) {
      await saveRecentTabs(pruned);
      console.log(`[coretab-bg] Pruned ${tabs.length - pruned.length} expired recent-tab entries`);
    }
  } catch (err) {
    console.error('[coretab-bg] pruneAndSaveRecentTabs failed:', err);
  }
}

async function addRecentTab(url, title, visitedAt) {
  if (!(await shouldTrackUrl(url))) return;
  return enqueueRecent(async () => {
    const hostname = extractHostname(url);
    const now = visitedAt || Date.now();
    let tabs = await getRecentTabs();

    const existingIndex = tabs.findIndex(t => t.url === url);
    if (existingIndex !== -1) {
      // Only update visitedAt if newer (for backfill merging)
      if (now > tabs[existingIndex].visitedAt) {
        tabs[existingIndex].visitedAt = now;
      }
      // Cap visitCount so a long-lived page that the user keeps revisiting
      // (e.g. docs) doesn't grow the field without bound.
      tabs[existingIndex].visitCount = Math.min(
        (tabs[existingIndex].visitCount || 1) + 1,
        999
      );
      tabs[existingIndex].title = title || tabs[existingIndex].title;
    } else {
      tabs.unshift({
        url,
        title: title || url,
        hostname,
        visitedAt: now,
        visitCount: 1
      });
    }

    tabs.sort((a, b) => b.visitedAt - a.visitedAt);
    tabs = pruneRecentTabs(tabs);
    tabs = tabs.slice(0, RECENT_MAX_TOTAL);

    await saveRecentTabs(tabs);
  });
}

// Serial queue for chrome.storage.local read-modify-write on Recent Tabs.
// See coretab-recent.js for the rationale; mirrored here because the SW
// has its own module scope and cannot import from page-side scripts.
let _recentQueue = Promise.resolve();
function enqueueRecent(fn) {
  const next = _recentQueue.then(fn, fn);
  _recentQueue = next.catch(() => {});
  return next;
}

// Debounce window: a single URL completing multiple times within this many
// ms is treated as one navigation. Cuts down on chrome.storage.local reads
// and writes when SPA route changes, redirects, or refreshes fire onUpdated
// repeatedly for the same URL.
const RECENT_DEDUPE_WINDOW_MS = 60 * 1000;
const _recentLastWrite = new Map(); // url -> epoch ms of last addRecentTab

function shouldSkipRecentWrite(url) {
  const now = Date.now();
  const last = _recentLastWrite.get(url);
  if (typeof last === 'number' && (now - last) < RECENT_DEDUPE_WINDOW_MS) {
    return true;
  }
  _recentLastWrite.set(url, now);
  return false;
}

// History backfill: import existing browser history for tracked domains
// Tracks per-domain completion to avoid re-running for already-backfilled domains
const RECENT_BACKFILL_STATE_KEY = 'coretab_recent_backfill_state';

async function backfillRecentTabs() {
  let backfilled = [];
  try {
    const result = await chrome.storage.local.get(RECENT_BACKFILL_STATE_KEY);
    backfilled = result[RECENT_BACKFILL_STATE_KEY] || [];
  } catch { backfilled = []; }

  const trackedDomains = await getTrackedDomains();
  const newDomains = trackedDomains.filter(d => !backfilled.includes(d));
  if (newDomains.length === 0) return;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let total = 0;

  for (const domain of newDomains) {
    try {
      const results = await chrome.history.search({
        text: domain,
        maxResults: 100,
        startTime: sevenDaysAgo
      });

      const filtered = results.filter(item => {
        try {
          const u = new URL(item.url);
          const hostname = u.hostname.toLowerCase();
          return domainMatches(hostname, domain);
        } catch { return false; }
      });

      for (const item of filtered) {
        await addRecentTab(item.url, item.title, item.lastVisitTime);
        total++;
      }
      backfilled.push(domain);
    } catch (err) {
      console.error(`[coretab] backfill failed for ${domain}:`, err);
    }
  }

  await chrome.storage.local.set({ [RECENT_BACKFILL_STATE_KEY]: backfilled });
  console.log(`[coretab] Backfilled ${total} history entries into Recent Tabs`);
}

const BADGE_COLORS = {
  low: '#10b981',    // Green — 1-10 tabs
  medium: '#f59e0b',  // Amber — 11-20 tabs
  high: '#ef4444'    // Red — 21+ tabs
};

let badgeUpdatePending = false;
let badgeUpdateScheduled = false;

async function updateBadge() {
  if (badgeUpdatePending) {
    badgeUpdateScheduled = true;
    return;
  }

  badgeUpdatePending = true;

  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(t => {
      const url = t.url || '';
      return !isSystemUrl(url);
    }).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) {
      badgeUpdatePending = false;
      return;
    }

    const color = count <= 10 ? BADGE_COLORS.low :
                  count <= 20 ? BADGE_COLORS.medium : BADGE_COLORS.high;
    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    chrome.action.setBadgeText({ text: '' });
  }

  badgeUpdatePending = false;

  if (badgeUpdateScheduled) {
    badgeUpdateScheduled = false;
    updateBadge();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  backfillRecentTabs();
  pruneAndSaveRecentTabs();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  backfillRecentTabs();
  pruneAndSaveRecentTabs();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[RECENT_TABS_CONFIG_KEY]) return;
  trackedDomainsCache = null;
  backfillRecentTabs();
});

chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadge();
    // 记录到 Recent Tabs
    if (changeInfo.status === 'complete' && tab.url && tab.title) {
      // Dedup: a single URL can complete multiple times in a short window
      // (SPA route changes, redirects, refresh bursts). The 60s window
      // keeps visitCount from inflating and avoids repeated
      // chrome.storage.local read-modify-write round-trips.
      if (!shouldSkipRecentWrite(tab.url)) {
        void addRecentTab(tab.url, tab.title);
      }
    }
  }
});

updateBadge();
