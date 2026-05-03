/* ============================================================
   CoreTab — Main Application Logic
   Default New Tab Page with Tab Management + GitHub Trending
   ============================================================ */

'use strict';

// State
let windowGroups = [];  // [{windowId, windowName, domains: [{domain, label, tabs}]}]
let historyGroups = [];

// Constants
const LANDING_PAGE_PATTERNS = [
  { hostname: 'mail.google.com', pathExact: ['/mail/u/0/', '/mail/u/1/'] },
  { hostname: 'github.com', pathExact: ['/'] },
  { hostname: 'twitter.com', pathExact: ['/home'] },
  { hostname: 'x.com', pathExact: ['/home'] },
];

const GITHUB_API_URL = 'https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=6';
const GITHUB_CACHE_KEY = 'coretab_github_trending';
const GITHUB_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://', 'devtools://'
];

const CLOSED_TABS_KEY = 'coretab_closed_tabs';
const MAX_TABS_PER_DOMAIN = 20;
const MAX_TABS_PER_DAY = 100;

// Initialization
async function init() {
  initGreeting();
  initDateDisplay();
  initSearch();
  await renderDashboard();
}

async function renderDashboard() {
  await Promise.all([
    loadOpenTabs(),
    loadClosedTabs(),
    loadHistory(),
    loadGitHubTrending()
  ]);
}

// Run init when DOM is ready (script is at end of body, so check if already loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM already loaded, run init immediately
  init();
}

// Keyboard handler for dialog
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideConfirmDialog();
});

// Single event listener on document - matches tab-out pattern
document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const tabUrl = actionEl.dataset.tabUrl;
  const domain = actionEl.dataset.domain;

  // ---- Focus a tab ----
  if (action === 'focus-tab') {
    if (tabUrl) {
      await focusTabByUrl(tabUrl);
      // Hide search results
      const searchResults = document.getElementById('searchResults');
      if (searchResults) searchResults.style.display = 'none';
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
    }
    return;
  }

  // ---- Close a single tab ----
  if (action === 'close-tab') {
    e.stopPropagation();
    if (tabUrl) {
      await closeTabByUrl(tabUrl);
    }
    return;
  }

  // ---- Close all tabs in a domain ----
  if (action === 'close-domain') {
    e.stopPropagation();
    if (domain) {
      const windowId = parseInt(actionEl.dataset.windowId);
      await closeDomainTabs(domain, windowId);
    }
    return;
  }

  // ---- Close all tabs in a window ----
  if (action === 'close-window') {
    e.stopPropagation();
    const windowId = parseInt(actionEl.dataset.windowId);
    if (!isNaN(windowId)) {
      await closeWindowTabs(windowId);
    }
    return;
  }

  // ---- Close all tabs ----
  if (action === 'close-all' || action === 'close-all-open-tabs') {
    console.log('[coretab] close-all action detected');
    e.stopPropagation();
    await closeAllTabs();
    return;
  }

  // ---- Visit history ----
  if (action === 'visit-history') {
    if (tabUrl) {
      await focusTabByUrl(tabUrl);
    }
    return;
  }

  // ---- Toggle history expand ----
  if (action === 'toggle-history') {
    toggleHistoryCard(actionEl);
    return;
  }

  // ---- Dialog actions ----
  if (action === 'close-confirm') {
    performConfirmedAction();
    return;
  }

  if (action === 'close-dialog') {
    hideConfirmDialog();
    return;
  }

  // ---- GitHub ----
  if (action === 'open-github') {
    const url = actionEl.dataset.url;
    if (url) chrome.tabs.create({ url, active: true });
    return;
  }

  // ---- Reopen closed tab ----
  if (action === 'reopen-tab') {
    e.stopPropagation();
    if (tabUrl) {
      chrome.tabs.create({ url: tabUrl, active: true });
      removeClosedTab(tabUrl);
      await loadClosedTabs();
      showToast('Tab reopened');
    }
    return;
  }

  // ---- Open all closed tabs for domain ----
  if (action === 'open-all-closed') {
    e.stopPropagation();
    if (domain) {
      const closedTabs = getClosedTabs();
      let count = 0;
      for (const dateKey in closedTabs) {
        if (closedTabs[dateKey][domain]) {
          for (const entry of closedTabs[dateKey][domain]) {
            chrome.tabs.create({ url: entry.url, active: false });
            count++;
          }
        }
      }
      if (count > 0) {
        removeClosedTabsForDomain(domain);
        await loadClosedTabs();
        showToast(`${count} tabs reopened`);
      }
    }
    return;
  }
});

// Focus tab by URL (matches tab-out behavior)
async function focusTabByUrl(targetUrl) {
  if (!targetUrl) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  let matches = allTabs.filter(t => t.url === targetUrl);

  if (matches.length === 0) {
    try {
      const targetHost = new URL(targetUrl).hostname;
      matches = allTabs.filter(t => {
        try { return new URL(t.url).hostname === targetHost; }
        catch { return false; }
      });
    } catch {}
  }

  if (matches.length === 0) return;

  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
}

// Close single tab by URL (matches tab-out behavior)
async function closeTabByUrl(tabUrl) {
  if (!tabUrl) return;

  const allTabs = await chrome.tabs.query({});
  const match = allTabs.find(t => t.url === tabUrl);
  if (match) {
    addClosedTab(match.url, match.title);
    await chrome.tabs.remove(match.id);
    // Immediately refresh closed tabs display
    await loadClosedTabs();
    await loadOpenTabs();
    showToast('Tab closed');
  }
}

let pendingConfirmCallback = null;

function showConfirmDialog(title, message, onConfirm) {
  pendingConfirmCallback = onConfirm;
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const overlay = document.getElementById('confirmDialogOverlay');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (overlay) {
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }
}

function hideConfirmDialog() {
  const overlay = document.getElementById('confirmDialogOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.style.display = 'none';
      // 确保任何可能残留的样式都被清理
      overlay.style.pointerEvents = 'auto';
    }, 250);
    // 立即恢复指针事件，防止页面卡住
    overlay.style.pointerEvents = 'auto';
  }
  pendingConfirmCallback = null;
}

async function performConfirmedAction() {
  if (pendingConfirmCallback) {
    const callback = pendingConfirmCallback;
    pendingConfirmCallback = null;
    try {
      hideConfirmDialog();
      await callback();
    } catch (err) {
      console.error('[coretab] Confirm action failed:', err);
    }
  } else {
    hideConfirmDialog();
  }
}

async function closeDomainTabs(domain, windowId) {
  const wg = windowGroups.find(w => w.windowId === windowId);
  if (!wg) return;
  const group = wg.domains.find(d => d.domain === domain);
  if (!group) return;

  // Record closed tabs before removing
  for (const tab of group.tabs) {
    addClosedTab(tab.url, tab.title);
  }

  const tabIds = group.tabs.map(t => t.id).filter(id => typeof id === 'number');
  if (tabIds.length > 0) {
    await chrome.tabs.remove(tabIds);
  }
  // Immediately refresh closed tabs display
  await loadClosedTabs();
  await Promise.all([loadOpenTabs(), loadHistory()]);
  showToast(`${group.tabs.length} tabs closed`);
}

async function closeAllTabs() {
  console.log('[coretab] closeAllTabs called');
  // Refresh tab list before closing to get latest state
  await loadOpenTabs();
  const totalTabs = windowGroups.reduce((sum, wg) => {
    return sum + wg.domains.reduce((ds, d) => ds + d.tabs.length, 0);
  }, 0);
  console.log('[coretab] Total tabs to close:', totalTabs);

  if (totalTabs === 0) {
    showToast('No tabs to close');
    return;
  }

  showConfirmDialog(
    'Close All Tabs',
    `Close all ${totalTabs} tabs across all windows? This will keep this page open.`,
    async () => {
      console.log('[coretab] Confirm callback started');
      try {
        // Close ALL tabs across ALL windows except current tab
        const allTabs = await chrome.tabs.query({});
        const currentTab = await chrome.tabs.getCurrent();
        console.log('[coretab] All tabs:', allTabs.length);
        const tabsToClose = allTabs.filter(t =>
          typeof t.id === 'number' &&
          t.id !== currentTab.id &&
          !isSystemUrl(t.url)
        );
        console.log('[coretab] Tabs to close:', tabsToClose.length);

        // Record closed tabs before removing
        for (const tab of tabsToClose) {
          addClosedTab(tab.url, tab.title);
        }

        const tabIdsToClose = tabsToClose.map(t => t.id);
        console.log('[coretab] Tab IDs to remove:', tabIdsToClose);

        if (tabIdsToClose.length > 0) {
          await chrome.tabs.remove(tabIdsToClose);
          console.log('[coretab] Tabs removed');
        }
        // Immediately refresh closed tabs display
        await loadClosedTabs();
        setTimeout(async () => {
          await Promise.all([loadOpenTabs(), loadHistory()]);
          showToast(`${tabIdsToClose.length} tabs closed`);
        }, 100);
      } catch (err) {
        console.error('[coretab] Failed to close tabs:', err);
        showToast('Failed to close tabs');
      }
    }
  );
}

async function closeWindowTabs(windowId) {
  console.log('[coretab] closeWindowTabs called for window:', windowId);
  const group = windowGroups.find(wg => wg.windowId === windowId);
  if (!group) return;

  const allTabsInWindow = group.domains.reduce((sum, d) => sum + d.tabs.length, 0);
  if (allTabsInWindow === 0) {
    showToast('No tabs to close');
    return;
  }

  showConfirmDialog(
    'Close Window Tabs',
    `Close all ${allTabsInWindow} tabs in this window?`,
    async () => {
      try {
        const allTabs = await chrome.tabs.query({ windowId });
        const currentTab = await chrome.tabs.getCurrent();
        const tabsToClose = allTabs.filter(t =>
          typeof t.id === 'number' &&
          t.id !== currentTab.id &&
          !isSystemUrl(t.url)
        );

        // Record closed tabs before removing
        for (const tab of tabsToClose) {
          addClosedTab(tab.url, tab.title);
        }

        const tabIdsToClose = tabsToClose.map(t => t.id);
        if (tabIdsToClose.length > 0) {
          await chrome.tabs.remove(tabIdsToClose);
        }
        // Immediately refresh closed tabs display
        await loadClosedTabs();
        setTimeout(async () => {
          await Promise.all([loadOpenTabs(), loadHistory()]);
          showToast(`${tabIdsToClose.length} tabs closed`);
        }, 100);
      } catch (err) {
        console.error('[coretab] Failed to close window tabs:', err);
        showToast('Failed to close tabs');
      }
    }
  );
}

// Data Loading
async function loadOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const currentTab = await chrome.tabs.getCurrent();
    const currentWindow = await chrome.windows.getCurrent();

    console.log('[coretab] Total tabs found:', tabs.length);
    console.log('[coretab] Current window ID:', currentWindow.id);

    const realTabs = tabs
      .filter(t => t.url && !isSystemUrl(t.url))
      .map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        hostname: extractHostname(t.url),
        windowId: t.windowId
      }));

    console.log('[coretab] Real tabs (non-system):', realTabs.length);

    windowGroups = groupTabsByWindow(realTabs, currentWindow.id);
    console.log('[coretab] Window groups:', windowGroups.length);

    renderOpenTabs(windowGroups);
    updateTabCounts();
  } catch (err) {
    console.error('[coretab] Failed to load tabs:', err);
  }
}

function groupTabsByWindow(tabs, currentWindowId) {
  // Group tabs by windowId first
  const windowMap = {};
  for (const tab of tabs) {
    if (!windowMap[tab.windowId]) {
      windowMap[tab.windowId] = {
        windowId: tab.windowId,
        isCurrent: tab.windowId === currentWindowId,
        label: tab.windowId === currentWindowId ? 'Current Window' : `Window ${Object.keys(windowMap).length + 1}`,
        domains: []
      };
    }
    // Add tab to domain group within this window
    const domain = tab.hostname || 'unknown';
    let domainGroup = windowMap[tab.windowId].domains.find(d => d.domain === domain);
    if (!domainGroup) {
      domainGroup = {
        domain,
        label: friendlyDomain(domain),
        tabs: []
      };
      windowMap[tab.windowId].domains.push(domainGroup);
    }
    domainGroup.tabs.push(tab);
  }
  return Object.values(windowMap);
}

async function loadHistory() {
  try {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const results = await chrome.history.search({
      text: '',
      maxResults: 100,
      startTime: oneWeekAgo
    });

    historyGroups = groupHistoryByDomain(results);
    renderHistory(historyGroups);
  } catch (err) {
    console.error('[coretab] Failed to load history:', err);
    const empty = document.getElementById('historyEmpty');
    if (empty) empty.style.display = 'block';
  }
}

async function loadGitHubTrending() {
  const grid = document.getElementById('githubGrid');
  if (!grid) return;

  // Check cache
  try {
    const cached = getCachedGitHub();
    if (cached) {
      renderGitHubTrending(cached);
      return;
    }
  } catch (_) {}

  try {
    const response = await fetch(GITHUB_API_URL);
    if (!response.ok) throw new Error('GitHub API error');
    const data = await response.json();
    const projects = data.items.slice(0, 6);
    setCachedGitHub(projects);
    renderGitHubTrending(projects);
  } catch (err) {
    console.error('[coretab] Failed to load GitHub trending:', err);
    if (grid) grid.innerHTML = '<p>Failed to load</p>';
  }
}

function getCachedGitHub() {
  const cached = localStorage.getItem(GITHUB_CACHE_KEY);
  if (!cached) return null;
  try {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < GITHUB_CACHE_DURATION) return data;
  } catch (_) {}
  return null;
}

function setCachedGitHub(data) {
  try {
    localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (_) {}
}

// Closed Tabs Storage
function getClosedTabs() {
  try {
    const raw = localStorage.getItem(CLOSED_TABS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveClosedTabs(data) {
  try {
    localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(data));
  } catch (_) {}
}

function getDateKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addClosedTab(url, title) {
  const hostname = extractHostname(url) || 'unknown';
  const now = Date.now();
  const dateKey = getDateKey(now);

  const closedTabs = getClosedTabs();

  // Initialize date if not exists
  if (!closedTabs[dateKey]) {
    closedTabs[dateKey] = {};
  }
  if (!closedTabs[dateKey][hostname]) {
    closedTabs[dateKey][hostname] = [];
  }

  // Add new closed tab at the beginning
  closedTabs[dateKey][hostname].unshift({
    url,
    title: title || url,
    closedAt: now
  });

  // Trim per domain
  if (closedTabs[dateKey][hostname].length > MAX_TABS_PER_DOMAIN) {
    closedTabs[dateKey][hostname] = closedTabs[dateKey][hostname].slice(0, MAX_TABS_PER_DOMAIN);
  }

  // Trim per day
  let totalForDay = 0;
  for (const h in closedTabs[dateKey]) {
    totalForDay += closedTabs[dateKey][h].length;
  }
  if (totalForDay > MAX_TABS_PER_DAY) {
    // Remove oldest entries from various hosts
    const allEntries = [];
    for (const h in closedTabs[dateKey]) {
      for (const entry of closedTabs[dateKey][h]) {
        allEntries.push({ hostname: h, ...entry });
      }
    }
    allEntries.sort((a, b) => a.closedAt - b.closedAt);
    const toRemove = totalForDay - MAX_TABS_PER_DAY;
    const toRemoveUrls = new Set(allEntries.slice(0, toRemove).map(e => e.url));

    for (const h in closedTabs[dateKey]) {
      closedTabs[dateKey][h] = closedTabs[dateKey][h].filter(e => !toRemoveUrls.has(e.url));
    }
  }

  saveClosedTabs(closedTabs);
}

function removeClosedTab(url) {
  const closedTabs = getClosedTabs();
  for (const dateKey in closedTabs) {
    for (const hostname in closedTabs[dateKey]) {
      closedTabs[dateKey][hostname] = closedTabs[dateKey][hostname].filter(e => e.url !== url);
    }
    // Clean up empty date keys
    if (Object.keys(closedTabs[dateKey]).length === 0) {
      delete closedTabs[dateKey];
    }
  }
  saveClosedTabs(closedTabs);
}

function removeClosedTabsForDomain(hostname) {
  const closedTabs = getClosedTabs();
  for (const dateKey in closedTabs) {
    if (closedTabs[dateKey][hostname]) {
      delete closedTabs[dateKey][hostname];
    }
    if (Object.keys(closedTabs[dateKey]).length === 0) {
      delete closedTabs[dateKey];
    }
  }
  saveClosedTabs(closedTabs);
}

function getClosedTabsGrouped() {
  const closedTabs = getClosedTabs();
  const today = getDateKey(Date.now());
  const yesterday = getDateKey(Date.now() - 86400000);

  const groups = [];

  for (const dateKey of Object.keys(closedTabs).sort().reverse()) {
    let label = dateKey;
    if (dateKey === today) label = 'Today';
    else if (dateKey === yesterday) label = 'Yesterday';

    const domains = [];
    for (const hostname in closedTabs[dateKey]) {
      if (closedTabs[dateKey][hostname].length > 0) {
        domains.push({
          domain: hostname,
          label: friendlyDomain(hostname),
          entries: closedTabs[dateKey][hostname]
        });
      }
    }

    if (domains.length > 0) {
      groups.push({ date: dateKey, label, domains });
    }
  }

  return groups;
}

// URL Utilities
function isSystemUrl(url) {
  if (!url) return true;
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
}

function extractHostname(url) {
  if (!url) return null;
  try {
    if (url.startsWith('file://')) return 'local-files';
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isLandingPage(url) {
  try {
    const parsed = new URL(url);
    return LANDING_PAGE_PATTERNS.some(p => {
      if (parsed.hostname !== p.hostname) return false;
      if (p.pathExact) return p.pathExact.includes(parsed.pathname);
      return parsed.pathname === '/';
    });
  } catch {
    return false;
  }
}

function groupTabsByDomain(tabs) {
  const groupMap = {};
  const landingTabs = [];

  for (const tab of tabs) {
    if (!tab.hostname) continue;
    if (isLandingPage(tab.url)) {
      landingTabs.push(tab);
      continue;
    }
    if (!groupMap[tab.hostname]) {
      groupMap[tab.hostname] = { domain: tab.hostname, label: friendlyDomain(tab.hostname), tabs: [] };
    }
    groupMap[tab.hostname].tabs.push(tab);
  }

  const groups = Object.values(groupMap).sort((a, b) => b.tabs.length - a.tabs.length);
  if (landingTabs.length > 0) {
    groups.unshift({ domain: '__landing__', label: 'Homepages', tabs: landingTabs });
  }
  return groups;
}

function groupHistoryByDomain(history) {
  const groupMap = {};
  for (const entry of history) {
    const hostname = extractHostname(entry.url);
    if (!hostname || isSystemUrl(entry.url)) continue;
    if (!groupMap[hostname]) {
      groupMap[hostname] = { domain: hostname, label: friendlyDomain(hostname), visitCount: 0, entries: [] };
    }
    groupMap[hostname].entries.push(entry);
    groupMap[hostname].visitCount++;
  }
  return Object.values(groupMap).sort((a, b) => b.visitCount - a.visitCount);
}

function friendlyDomain(hostname) {
  if (!hostname) return '';
  const map = {
    'github.com': 'GitHub', 'youtube.com': 'YouTube', 'twitter.com': 'X', 'x.com': 'X',
    'reddit.com': 'Reddit', 'stackoverflow.com': 'Stack Overflow', 'google.com': 'Google',
    'mail.google.com': 'Gmail', 'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive',
    'localhost': 'Localhost', 'local-files': 'Local Files',
  };
  if (map[hostname]) return map[hostname];
  return hostname.replace(/\.(com|org|net|io|co|ai|dev|app)$/, '').split('.').pop();
}

function smartTitle(title, url) {
  if (!url) return title || '';
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'github.com' && pathname.startsWith('/')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const [owner, repo, ...rest] = parts;
        if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
        if (rest[0] === 'pull' && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
        if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
        if (parts.length === 2) return `${owner}/${repo}`;
      }
    }
    return stripTitleNoise(title) || hostname;
  } catch {
    return stripTitleNoise(title);
  }
}

function stripTitleNoise(title) {
  if (!title) return '';
  return title.replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\([\d,]+\+?\)\s*/g, ' ').replace(/\s*[\-‐-―]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '').trim();
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function formatNumber(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

function renderOpenTabs(groups) {
  const container = document.getElementById('openTabsMissions');
  const section = document.getElementById('openTabsSection');
  const empty = document.getElementById('openTabsEmpty');

  if (!container) return;

  if (groups.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  container.style.display = 'block';
  empty.style.display = 'none';

  container.innerHTML = groups.map(wg => {
    const totalTabs = wg.domains.reduce((sum, d) => sum + d.tabs.length, 0);
    return `
    <div class="window-card">
      <div class="window-card-header">
        <div class="window-info">
          <span class="window-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18"/>
            </svg>
          </span>
          <span class="window-name">${escapeHtml(wg.label)}</span>
          <span class="window-count">${totalTabs} tabs</span>
        </div>
        <button class="action-btn close-window-btn compact" data-action="close-window" data-window-id="${wg.windowId}">
          Close all
        </button>
      </div>
      <div class="window-card-domains">
        ${wg.domains.map(g => `
          <div class="domain-section">
            <div class="domain-header">
              <span class="domain-name">${escapeHtml(g.label)}</span>
              <span class="domain-count">${g.tabs.length}</span>
            </div>
            <div class="domain-chips">
              ${g.tabs.slice(0, 8).map(t => `
                <div class="domain-chip" data-action="focus-tab" data-tab-url="${escapeHtml(t.url)}" title="${escapeHtml(smartTitle(t.title, t.url))}">
                  <img class="chip-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(t.hostname)}&sz=16" alt="" onerror="this.style.display='none'">
                  <span class="chip-text">${escapeHtml(smartTitle(t.title, t.url))}</span>
                  <button class="chip-close" data-action="close-tab" data-tab-url="${escapeHtml(t.url)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              `).join('')}
              ${g.tabs.length > 8 ? `<span class="domain-chip-overflow">+${g.tabs.length - 8}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `}).join('');
}function renderHistory(groups) {
  const container = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  const countEl = document.getElementById('historySectionCount');

  if (!container) return;

  if (groups.length === 0) {
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = `${groups.length} sites`;

  container.innerHTML = groups.slice(0, 10).map(g => `
    <div class="history-card">
      <div class="history-top">
        <img class="history-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(g.domain)}&sz=32" alt="" onerror="this.style.display='none'">
        <span class="history-name">${g.label}</span>
        <span class="history-badge">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          ${g.visitCount} visits
        </span>
      </div>
      <div class="history-pages">
        ${g.entries.map((e, i) => `
          <div class="history-page-item${i >= 3 ? ' hidden' : ''}" data-action="visit-history" data-tab-url="${escapeHtml(e.url)}">
            <span class="history-page-title">${escapeHtml(smartTitle(e.title, e.url))}</span>
            <span class="history-page-time">${timeAgo(e.lastVisitTime)}</span>
          </div>
        `).join('')}
      </div>
      ${g.entries.length > 3 ? `
        <div class="history-toggle" data-action="toggle-history" data-domain="${g.domain}">
          <span class="toggle-text">Show more</span>
          <svg class="toggle-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
          </svg>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function loadClosedTabs() {
  try {
    const groups = getClosedTabsGrouped();
    renderClosedTabs(groups);
  } catch (err) {
    console.error('[coretab] Failed to load closed tabs:', err);
  }
}

function renderClosedTabs(groups) {
  const container = document.getElementById('closedTabsContainer');
  const empty = document.getElementById('closedEmpty');
  const countEl = document.getElementById('closedSectionCount');

  if (!container) return;

  // Count total closed tabs
  let totalClosed = 0;
  for (const dateGroup of groups) {
    for (const site of dateGroup.domains) {
      totalClosed += site.entries.length;
    }
  }

  if (totalClosed === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = totalClosed + ' closed tabs';

  container.innerHTML = groups.map(dateGroup => `
    <div class="closed-date-group">
      <div class="closed-date-label">${dateGroup.label}</div>
      <div class="closed-sites">
        ${dateGroup.domains.map(site => `
          <div class="closed-card">
            <div class="closed-card-header">
              <div class="closed-card-info">
                <img class="closed-card-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(site.domain)}&sz=32" alt="" onerror="this.style.display='none'">
                <span class="closed-card-name">${escapeHtml(site.label)}</span>
                <span class="closed-card-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  ${site.entries.length} closed
                </span>
              </div>
              <button class="closed-open-all" data-action="open-all-closed" data-domain="${escapeHtml(site.domain)}" title="Open all">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            </div>
            <div class="closed-pages">
              ${site.entries.slice(0, 5).map(entry => `
                <div class="closed-page-item" data-action="reopen-tab" data-tab-url="${escapeHtml(entry.url)}">
                  <span class="closed-page-title">${escapeHtml(entry.title || entry.url)}</span>
                  <span class="closed-page-time">${timeAgo(entry.closedAt)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderGitHubTrending(projects) {
  const grid = document.getElementById('githubGrid');
  if (!grid) return;

  if (!projects || projects.length === 0) {
    grid.innerHTML = '<p>No trending projects</p>';
    return;
  }

  grid.innerHTML = projects.map(p => `
    <div class="github-card" data-action="open-github" data-url="${escapeHtml(p.html_url)}">
      <div class="github-card-header">
        <span class="github-card-name">${escapeHtml(p.full_name)}</span>
        <span class="github-card-stars">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          ${formatNumber(p.stargazers_count)}
        </span>
      </div>
      <p class="github-card-desc">${escapeHtml(p.description || 'No description')}</p>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// UI Helpers
function updateTabCounts() {
  const totalTabs = windowGroups.reduce((sum, wg) => {
    return sum + wg.domains.reduce((ds, d) => ds + d.tabs.length, 0);
  }, 0);
  const windowCount = windowGroups.length;
  const countEl = document.getElementById('openTabsSectionCount');
  const closeCountEl = document.getElementById('closeTabsCount');
  if (countEl) {
    countEl.innerHTML = `${windowCount} window${windowCount !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; ${totalTabs} tabs`;
  }
  if (closeCountEl) {
    closeCountEl.textContent = totalTabs;
  }
}

function initGreeting() {
  const el = document.getElementById('greeting');
  if (!el) return;
  const hour = new Date().getHours();
  el.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function initDateDisplay() {
  const el = document.getElementById('dateDisplay');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Search
function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const searchResults = document.getElementById('searchResults');

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (searchClear) {
      searchClear.style.display = query ? 'flex' : 'none';
    }
    if (!query) {
      if (searchResults) searchResults.style.display = 'none';
      return;
    }
    performSearch(query);
  });

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (searchClear) searchClear.style.display = 'none';
      if (searchResults) searchResults.style.display = 'none';
    });
  }

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search')) {
      if (searchResults) searchResults.style.display = 'none';
    }
  });
}

function getAllClosedTabs() {
  const closedTabsData = getClosedTabs();
  const allClosedTabs = [];
  
  for (const dateKey in closedTabsData) {
    for (const hostname in closedTabsData[dateKey]) {
      closedTabsData[dateKey][hostname].forEach(entry => {
        allClosedTabs.push({
          ...entry,
          closed: true,
          hostname: hostname,
          closedAt: entry.closedAt
        });
      });
    }
  }
  
  // 按关闭时间降序排列
  return allClosedTabs.sort((a, b) => b.closedAt - a.closedAt);
}

async function performSearch(query) {
  const searchResults = document.getElementById('searchResults');
  if (!searchResults) return;

  try {
    // 获取打开的标签页
    const allOpenTabs = await chrome.tabs.query({});
    const realOpenTabs = allOpenTabs.filter(t => t.url && !isSystemUrl(t.url)).map(tab => ({
      ...tab,
      closed: false
    }));
    
    // 获取关闭的标签页
    const allClosedTabs = getAllClosedTabs();

    // 搜索打开的标签页
    const openMatches = realOpenTabs.filter(tab => {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      const hostname = (tab.hostname || '').toLowerCase();
      return title.includes(query) || url.includes(query) || hostname.includes(query);
    }).slice(0, 10);
    
    // 搜索关闭的标签页
    const closedMatches = allClosedTabs.filter(tab => {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      const hostname = (tab.hostname || '').toLowerCase();
      return title.includes(query) || url.includes(query) || hostname.includes(query);
    }).slice(0, 10);

    // 合并搜索结果，打开的标签页在前
    const allMatches = [...openMatches, ...closedMatches].slice(0, 15);

    if (allMatches.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">No tabs found</div>';
    } else {
      searchResults.innerHTML = allMatches.map(tab => {
        const hostname = tab.closed ? tab.hostname : extractHostname(tab.url) || '';
        return `
          <div class="search-result-item${tab.closed ? ' closed' : ''}" data-action="${tab.closed ? 'reopen-tab' : 'focus-tab'}" data-tab-url="${escapeHtml(tab.url)}">
            <img src="https://www.google.com/s2/favicons?domain=${escapeHtml(hostname)}&sz=32" alt="" onerror="this.style.display='none'">
            <div class="search-result-info">
              <div class="search-result-title">${escapeHtml(tab.title || tab.url)}</div>
              <div class="search-result-url">${escapeHtml(tab.closed ? hostname : tab.hostname || '')}</div>
            </div>
            <span class="search-result-badge">${tab.closed ? 'Closed' : escapeHtml(hostname)}</span>
          </div>
        `;
      }).join('');
    }

    searchResults.style.display = 'block';
  } catch (err) {
    console.error('[coretab] Search failed:', err);
  }
}

// Toast
let toastTimeout = null;

function toggleHistoryCard(el) {
  const card = el.closest('.history-card');
  const toggleText = el.querySelector('.toggle-text');
  if (!card) return;

  const isExpanded = card.classList.toggle('expanded');
  el.classList.toggle('expanded', isExpanded);

  // Show/hide the hidden entries
  const hiddenItems = card.querySelectorAll('.history-page-item.hidden');
  hiddenItems.forEach(item => {
    item.style.display = isExpanded ? 'flex' : '';
  });

  if (toggleText) {
    toggleText.textContent = isExpanded ? 'Show less' : 'Show more';
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toastText');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('visible');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3000);
}
