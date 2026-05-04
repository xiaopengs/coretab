// CoreTab - Background Service Worker
// Handles badge updates and extension lifecycle

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'
];

// Recent Tabs
const RECENT_TABS_KEY = 'coretab_recent_tabs';
const RECENT_TRACKED_DOMAINS = [
  'feishu.cn',
  'larksuite.com',
  'notion.so',
  'docs.google.com',
  'drive.google.com',
  'slides.google.com',
  'sheets.google.com',
  'elink.e.hihonor.com'
];
const RECENT_MAX_PER_DOMAIN = 10;
const RECENT_MAX_TOTAL = 50;

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
  // 处理允许的chrome页面
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

function shouldTrackUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    return RECENT_TRACKED_DOMAINS.some(domain => {
      if (domain.includes('*')) {
        const wildcardDomain = domain.replace('*.', '');
        return hostname === wildcardDomain || hostname.endsWith('.' + wildcardDomain);
      }
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch {
    return false;
  }
}

function getRecentTabs() {
  try {
    const raw = localStorage.getItem(RECENT_TABS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentTabs(tabs) {
  try {
    localStorage.setItem(RECENT_TABS_KEY, JSON.stringify(tabs));
  } catch {}
}

function addRecentTab(url, title) {
  if (!shouldTrackUrl(url)) return;

  const hostname = extractHostname(url);
  const now = Date.now();
  let tabs = getRecentTabs();

  const existingIndex = tabs.findIndex(t => t.url === url);
  if (existingIndex !== -1) {
    tabs[existingIndex].visitedAt = now;
    tabs[existingIndex].visitCount = (tabs[existingIndex].visitCount || 1) + 1;
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
  tabs = tabs.slice(0, RECENT_MAX_TOTAL);

  saveRecentTabs(tabs);
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
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
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
      addRecentTab(tab.url, tab.title);
    }
  }
});

updateBadge();
