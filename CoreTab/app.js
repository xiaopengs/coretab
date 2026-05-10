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

// ── Favicon Fallback ───────────────────────────────────
// Default SVG globe icon shown when favicon fails to load
const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5">' +
  '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
);

// Capture-phase error handler — catches all [data-fallback] img errors,
// including dynamically-added images (error event doesn't bubble on <img>)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.matches && img.matches('[data-fallback]')) {
    img.src = DEFAULT_FAVICON;
  }
}, true);
const GITHUB_CACHE_KEY = 'coretab_github_trending';
const GITHUB_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://', 'devtools://'
];

// 例外：这些chrome://页面应该显示在opentabs下面
const ALLOWED_CHROME_PAGES = [
  'chrome://newtab/',
  'chrome://newtab',
  'chrome://extensions/',
  'chrome://extensions'
];

const CLOSED_TABS_KEY = 'coretab_closed_tabs';
const MAX_TABS_PER_DOMAIN = 20;
const MAX_TABS_PER_DAY = 100;

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

// 当前跟踪域名列表（内存缓存，从 storage 或默认值加载）
let _trackedDomains = null;

async function getTrackedDomains() {
  if (_trackedDomains) return _trackedDomains;
  try {
    const data = await chrome.storage.local.get(RECENT_TABS_CONFIG_KEY);
    const domains = data[RECENT_TABS_CONFIG_KEY];
    if (domains && Array.isArray(domains) && domains.length > 0) {
      _trackedDomains = domains;
      return domains;
    }
  } catch (_) {}
  _trackedDomains = [...DEFAULT_TRACKED_DOMAINS];
  return _trackedDomains;
}

async function saveTrackedDomains(domains) {
  _trackedDomains = domains;
  try {
    await chrome.storage.local.set({ [RECENT_TABS_CONFIG_KEY]: domains });
  } catch (_) {}
}

// Initialization
async function init() {
  initGreeting();
  initDateDisplay();
  initSearch();
  await restoreClosedTabsFromStorage();
  await renderDashboard();
}

async function renderDashboard() {
  await Promise.all([
    loadOpenTabs(),
    loadClosedTabs(),
    loadRecentTabs(),
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

// Keyboard handler for dialogs
// Press Esc to close current open dialog
function getActiveDialog() {
  const moreOverlay = document.getElementById('moreModalOverlay');
  if (moreOverlay && moreOverlay.classList.contains('visible')) return 'more';
  const filterOverlay = document.getElementById('recentFilterOverlay');
  if (filterOverlay && filterOverlay.classList.contains('visible')) return 'filter';
  return 'confirm';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const active = getActiveDialog();
    if (active === 'more') { closeMoreModal(); return; }
    if (active === 'filter') { closeRecentFilterModal(); return; }
    hideConfirmDialog();
  }
  // Enter key in filter input
  if (e.key === 'Enter' && document.activeElement?.id === 'recentFilterInput') {
    addFilterDomain(document.activeElement.value);
  }
});

// Click on overlay (outside content) to close
// more-modal
let _moreOverlayPending = false;
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('moreModalOverlay');
  if (overlay && e.target === overlay && !_moreOverlayPending) {
    closeMoreModal();
  }
  const filterOverlay = document.getElementById('recentFilterOverlay');
  if (filterOverlay && e.target === filterOverlay) {
    closeRecentFilterModal();
  }
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

  // ---- Open recent tab ----
  if (action === 'open-recent') {
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

  // ---- More modal actions ----
  if (action === 'close-more-modal') {
    closeMoreModal();
    return;
  }

  if (action === 'close-recent-filter') {
    closeRecentFilterModal();
    return;
  }

  if (action === 'edit-recent-filter') {
    await openRecentFilterModal();
    return;
  }

  if (action === 'add-recent-filter') {
    e.stopPropagation();
    const input = document.getElementById('recentFilterInput');
    if (input) addFilterDomain(input.value);
    return;
  }

  if (action === 'remove-filter-domain') {
    e.stopPropagation();
    const idx = parseInt(actionEl.dataset.index);
    if (!isNaN(idx)) removeFilterDomain(idx);
    return;
  }

  if (action === 'save-recent-filter') {
    e.stopPropagation();
    await saveFilterDomains();
    return;
  }

  if (action === 'more-recent') {
    const domain = actionEl.dataset.domain;
    const label = actionEl.dataset.label;
    const recentTabs = await getRecentTabs();
    const entries = recentTabs.filter(t => {
      try { return new URL(t.url).hostname === domain; } catch { return false; }
    });
    openMoreModal(
      `${label} — ${entries.length} pages`,
      entries,
      entry => `
        <div class="more-modal-item" data-action="open-more-item" data-url="${escapeHtml(entry.url)}">
          <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" loading="lazy" decoding="async">
          <span class="more-modal-item-title">${escapeHtml(smartTitle(entry.title, entry.url))}</span>
          <span class="more-modal-item-time">${timeAgo(entry.visitedAt)}</span>
        </div>
      `
    );
    return;
  }

  if (action === 'more-closed') {
    const domain = actionEl.dataset.domain;
    const label = actionEl.dataset.label;
    const closedTabs = getClosedTabs();
    const seenUrls = new Set();
    const entries = [];
    for (const dateKey in closedTabs) {
      if (closedTabs[dateKey][domain]) {
        for (const entry of closedTabs[dateKey][domain]) {
          if (!seenUrls.has(entry.url)) {
            seenUrls.add(entry.url);
            entries.push(entry);
          }
        }
      }
    }
    entries.sort((a, b) => b.closedAt - a.closedAt);
    openMoreModal(
      `${label} — ${entries.length} closed`,
      entries,
      entry => `
        <div class="more-modal-item" data-action="open-more-item" data-url="${escapeHtml(entry.url)}">
          <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" loading="lazy" decoding="async">
          <span class="more-modal-item-title">${escapeHtml(entry.title || entry.url)}</span>
          <span class="more-modal-item-time">${timeAgo(entry.closedAt)}</span>
        </div>
      `
    );
    return;
  }

  if (action === 'more-history') {
    openMoreModal(
      `All Sites — ${historyGroups.length} sites`,
      historyGroups,
      g => `
        <div class="more-modal-item" data-action="open-more-item" data-url="https://${escapeHtml(g.domain)}">
          <img src="https://www.google.com/s2/favicons?domain=${escapeHtml(g.domain)}&sz=32" alt="" loading="lazy" decoding="async">
          <span class="more-modal-item-title">${escapeHtml(g.label)} (${g.visitCount} visits)</span>
          <span class="more-modal-item-time">${g.entries.length} pages</span>
        </div>
      `
    );
    return;
  }

  if (action === 'open-more-item') {
    const url = actionEl.dataset.url;
    if (url) {
      chrome.tabs.create({ url, active: true });
      closeMoreModal();
    }
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

  if (matches.length > 0) {
    // 找到已打开的标签页，聚焦它
    const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
    await chrome.tabs.update(match.id, { active: true });
    await chrome.windows.update(match.windowId, { focused: true });
  } else {
    // 没找到已打开的标签页，在新标签页中打开
    await chrome.tabs.create({ url: targetUrl, active: true });
  }
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
      overlay.style.pointerEvents = 'auto';
    }, 250);
    overlay.style.pointerEvents = 'auto';
  }
  pendingConfirmCallback = null;
}

// ============================================================
// MORE MODAL — 全量列表弹窗
// ============================================================

/**
 * openMoreModal(title, items, itemRenderer)
 * 打开全量列表弹窗
 * @param {string} title - 弹窗标题
 * @param {Array} items - 多条目的原始数据
 * @param {Function} itemRenderer - 条目渲染函数 (item) => htmlString
 */
function openMoreModal(title, items, itemRenderer) {
  const overlay = document.getElementById('moreModalOverlay');
  const titleEl = document.getElementById('moreModalTitle');
  const bodyEl = document.getElementById('moreModalBody');

  if (!overlay || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = items.map(itemRenderer).join('');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function closeMoreModal() {
  const overlay = document.getElementById('moreModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// ============================================================
// RECENT FILTER MODAL — 编辑 Recent Tabs 跟踪域名规则
// ============================================================

// 编辑中的域名临时副本
let _filterDraft = null;

async function openRecentFilterModal() {
  const overlay = document.getElementById('recentFilterOverlay');
  if (!overlay) return;
  _filterDraft = [...(await getTrackedDomains())];
  renderFilterList();
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('visible'));
  // Focus input
  setTimeout(() => {
    const input = document.getElementById('recentFilterInput');
    if (input) input.focus();
  }, 100);
}

function closeRecentFilterModal() {
  const overlay = document.getElementById('recentFilterOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
  _filterDraft = null;
}

function renderFilterList() {
  const listEl = document.getElementById('recentFilterList');
  const hintEl = document.getElementById('recentFilterHint');
  if (!listEl) return;

  if (!_filterDraft || _filterDraft.length === 0) {
    listEl.innerHTML = '<div class="filter-empty" style="text-align:center;padding:24px;color:var(--warm-silver);font-size:13px">No domains added yet</div>';
    if (hintEl) hintEl.textContent = 'Add domains below to start tracking.';
    return;
  }

  if (hintEl) hintEl.textContent = `Tracking ${_filterDraft.length} domain${_filterDraft.length > 1 ? 's' : ''}.`;

  listEl.innerHTML = _filterDraft.map((domain, idx) => `
    <div class="filter-item">
      <span class="filter-item-label">${escapeHtml(domain)}</span>
      <button class="filter-item-remove" data-action="remove-filter-domain" data-index="${idx}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('');
}

function addFilterDomain(raw) {
  let domain = raw.trim();
  if (!domain) return;

  // Strip protocol and path
  try {
    if (!domain.includes('://')) domain = 'https://' + domain;
    const u = new URL(domain);
    domain = u.hostname;
  } catch {
    // If it's just a hostname, use as-is
    if (domain.includes('/') || domain.includes(' ')) return;
  }

  if (_filterDraft.includes(domain)) {
    showToast('Domain already in list');
    return;
  }

  _filterDraft.push(domain);
  _filterDraft.sort();
  renderFilterList();

  const input = document.getElementById('recentFilterInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function removeFilterDomain(idx) {
  if (!_filterDraft) return;
  _filterDraft.splice(idx, 1);
  renderFilterList();
}

async function saveFilterDomains() {
  if (!_filterDraft) return;
  await saveTrackedDomains(_filterDraft);
  closeRecentFilterModal();
  // 重新加载 recent tabs 以反映新的过滤规则
  await loadRecentTabs();
  showToast('Tracking rules saved');
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
    console.log('[coretab] Current tab ID:', currentTab?.id);

    // 调试：打印所有标签页信息，看看哪些被过滤了
    console.log('[coretab] All tabs:');
    tabs.forEach((t, i) => {
      const isSystem = isSystemUrl(t.url);
      const isCurrentTab = currentTab?.id === t.id;
      console.log(`  ${i + 1}. [${isSystem ? 'SYSTEM' : 'NORMAL'}] [${isCurrentTab ? 'CURRENT' : ''}] ${t.title} - ${t.url}`);
    });

    // 先找出所有非系统的标签页
    const nonSystemTabs = tabs
      .filter(t => t.url && !isSystemUrl(t.url));
    
    // 过滤掉当前标签页（CoreTab自己）
    const realTabs = nonSystemTabs
      .filter(t => {
        const isCurrentTab = currentTab?.id === t.id;
        // 总是过滤掉自己这个标签页
        if (isCurrentTab) {
          return false;
        }
        return true;
      })
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

// 启动时从 chrome.storage.local 恢复数据（防止 localStorage 被清理）
async function restoreClosedTabsFromStorage() {
  try {
    const existing = getClosedTabs();
    if (Object.keys(existing).length > 0) return; // 已有数据，不需要恢复
    const result = await chrome.storage.local.get(CLOSED_TABS_KEY);
    if (result[CLOSED_TABS_KEY] && Object.keys(result[CLOSED_TABS_KEY]).length > 0) {
      localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(result[CLOSED_TABS_KEY]));
      console.log('[coretab] Restored closed tabs from chrome.storage.local');
    }
  } catch (_) {}
}

function saveClosedTabs(data) {
  try {
    localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(data));
    // 同时备份到 chrome.storage.local，防止清除浏览器数据时丢失
    chrome.storage.local.set({ [CLOSED_TABS_KEY]: data }).catch(() => {});
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

  // 按网站合并：同一域名跨所有日期合并
  const domainMap = {};

  for (const dateKey of Object.keys(closedTabs)) {
    for (const hostname in closedTabs[dateKey]) {
      const entries = closedTabs[dateKey][hostname];
      if (!entries || entries.length === 0) continue;

      if (!domainMap[hostname]) {
        domainMap[hostname] = [];
      }

      for (const entry of entries) {
        domainMap[hostname].push({
          ...entry,
          closedAt: entry.closedAt
        });
      }
    }
  }

  // 每个域名内部：去重 + 排序
  const domains = Object.keys(domainMap).map(hostname => {
    const seenUrls = new Set();
    const unique = domainMap[hostname].filter(e => {
      if (seenUrls.has(e.url)) return false;
      seenUrls.add(e.url);
      return true;
    });
    unique.sort((a, b) => b.closedAt - a.closedAt);
    return {
      domain: hostname,
      label: friendlyDomain(hostname),
      entries: unique
    };
  });

  // 按最新关闭时间排序域名
  domains.sort((a, b) => {
    const aTime = a.entries[0]?.closedAt || 0;
    const bTime = b.entries[0]?.closedAt || 0;
    return bTime - aTime;
  });

  // 保持与旧接口兼容：返回数组，第一个元素包含所有域名
  return [{ date: 'all', label: 'All Closed', domains }];
}

// URL Utilities
function isSystemUrl(url) {
  if (!url) return true;
  // 先检查是否是允许的页面
  if (ALLOWED_CHROME_PAGES.some(p => url === p)) {
    return false;
  }
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
}

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

function renderOpenTabs(windowGroups) {
  const container = document.getElementById('openTabsMissions');
  const empty = document.getElementById('openTabsEmpty');

  if (!container) return;

  // 计算总域名数
  const totalDomains = windowGroups.reduce((sum, wg) => sum + wg.domains.length, 0);

  if (totalDomains === 0) {
    container.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  container.style.display = 'block';
  empty.style.display = 'none';

  // 按窗口分组渲染，每组之间用全宽 tag 分割线分隔
  container.innerHTML = windowGroups.map((wg, wgIndex) => {
    const windowLabel = wg.isCurrent ? 'Current Window' : `Window ${wgIndex + 1}`;
    const windowTabCount = wg.domains.reduce((sum, d) => sum + d.tabs.length, 0);
    const domainCount = wg.domains.length;

    const domainsHtml = wg.domains.map(g => `
      <div class="mission-card">
        <div class="mission-top">
          <div class="mission-title-row">
            <span class="mission-name">${escapeHtml(g.label)}</span>
            <span class="open-tabs-badge">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              ${g.tabs.length} tabs
            </span>
          </div>
          <button class="action-btn close-all-inline top-right" data-action="close-domain" data-domain="${escapeHtml(g.domain)}" data-window-id="${wg.windowId}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
            Close all
          </button>
        </div>
        <div class="mission-pages">
          ${g.tabs.map(t => `
            <div class="page-chip" data-action="focus-tab" data-tab-url="${escapeHtml(t.url)}" title="${escapeHtml(smartTitle(t.title, t.url))}">
              <img class="chip-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(t.hostname)}&sz=16" alt="" data-fallback loading="lazy" decoding="async">
              <span class="chip-text">${escapeHtml(smartTitle(t.title, t.url))}</span>
              <div class="chip-actions">
                <button class="chip-action chip-close" data-action="close-tab" data-tab-url="${escapeHtml(t.url)}" aria-label="Close tab">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // 窗口分割线：全宽 tag 样式，横跨整个区域
    const dividerHtml = `
      <div class="window-divider">
        <span class="window-divider-tag">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
          ${windowLabel}
          <span class="window-tab-count">${windowTabCount} tabs &middot; ${domainCount} domains</span>
        </span>
        <div class="window-divider-line"></div>
      </div>`;

    return `
      ${wgIndex > 0 ? dividerHtml : ''}
      ${domainsHtml}
    `;
  }).join('');
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

  const visibleGroups = groups.slice(0, 10);
  const hiddenGroupCount = groups.length - 10;

  container.innerHTML = visibleGroups.map(g => `
    <div class="history-card">
      <div class="history-top">
        <img class="history-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(g.domain)}&sz=32" alt="" data-fallback loading="lazy" decoding="async">
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
  `).join('') +
    (hiddenGroupCount > 0 ? `
    <button class="page-more-btn" data-action="more-history" style="width:100%;margin-top:8px;">
      +${hiddenGroupCount} more sites
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
      </svg>
    </button>
  ` : '');
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

  // 合并后 groups[0].domains 包含所有域名
  const domains = groups[0]?.domains || [];
  let totalClosed = 0;
  for (const site of domains) {
    totalClosed += site.entries.length;
  }

  if (totalClosed === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = totalClosed + ' closed tabs';

  container.innerHTML = `
    <div class="closed-sites">
      ${domains.map(site => `
        <div class="closed-card">
          <div class="closed-card-header">
            <div class="closed-card-info">
              <img class="closed-card-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(site.domain)}&sz=32" alt="" data-fallback loading="lazy" decoding="async">
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
            ${site.entries.length > 5 ? `
              <button class="page-more-btn" data-action="more-closed" data-domain="${escapeHtml(site.domain)}" data-label="${escapeHtml(site.label)}">
                +${site.entries.length - 5} more
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// RECENT TABS
// ============================================================

// Check if a URL should be tracked
async function shouldTrackUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const trackedDomains = await getTrackedDomains();
    return trackedDomains.some(domain => {
      if (domain.includes('*')) {
        // Simple wildcard support (e.g., *.example.com)
        const wildcardDomain = domain.replace('*.', '');
        return hostname === wildcardDomain || hostname.endsWith('.' + wildcardDomain);
      }
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch {
    return false;
  }
}

// Get recent tabs from storage (chrome.storage.local for cross-context access)
async function getRecentTabs() {
  try {
    const result = await chrome.storage.local.get(RECENT_TABS_KEY);
    return result[RECENT_TABS_KEY] || [];
  } catch {
    return [];
  }
}

// Save recent tabs to storage
async function saveRecentTabs(tabs) {
  try {
    await chrome.storage.local.set({ [RECENT_TABS_KEY]: tabs });
  } catch {}
}

// Add or update a tab visit
async function addRecentTab(url, title, visitedAt) {
  if (!(await shouldTrackUrl(url))) return;

  const hostname = extractHostname(url);
  const now = visitedAt || Date.now();
  let tabs = await getRecentTabs();

  // Check if tab already exists
  const existingIndex = tabs.findIndex(t => t.url === url);
  if (existingIndex !== -1) {
    // Only update visitedAt if newer (for backfill merging)
    if (now > tabs[existingIndex].visitedAt) {
      tabs[existingIndex].visitedAt = now;
    }
    tabs[existingIndex].visitCount = (tabs[existingIndex].visitCount || 1) + 1;
    tabs[existingIndex].title = title || tabs[existingIndex].title;
  } else {
    // Add new tab
    tabs.unshift({
      url,
      title: title || url,
      hostname,
      visitedAt: now,
      visitCount: 1
    });
  }

  // Sort by visitedAt (newest first)
  tabs.sort((a, b) => b.visitedAt - a.visitedAt);

  // Limit total tabs
  tabs = tabs.slice(0, RECENT_MAX_TOTAL);

  await saveRecentTabs(tabs);
}

// Group recent tabs by domain
async function getRecentTabsGrouped() {
  const tabs = await getRecentTabs();
  const trackedDomains = await getTrackedDomains();

  // Group by hostname (only tracked domains)
  const groups = {};
  for (const tab of tabs) {
    const isTracked = trackedDomains.some(d => {
      if (d.includes('*')) {
        const wildcard = d.replace('*.', '');
        return tab.hostname === wildcard || tab.hostname.endsWith('.' + wildcard);
      }
      return tab.hostname === d || tab.hostname.endsWith('.' + d);
    });
    if (!isTracked) continue;
    if (!groups[tab.hostname]) {
      groups[tab.hostname] = [];
    }
    groups[tab.hostname].push(tab);
  }

  // Convert to array and limit per domain
  const domains = Object.keys(groups).map(hostname => ({
    domain: hostname,
    label: friendlyDomain(hostname),
    entries: groups[hostname].slice(0, RECENT_MAX_PER_DOMAIN)
  }));

  // Sort by first tab's visit time
  domains.sort((a, b) => b.entries[0].visitedAt - a.entries[0].visitedAt);

  return domains;
}

// Load and render recent tabs
async function loadRecentTabs() {
  try {
    const groups = await getRecentTabsGrouped();
    renderRecentTabs(groups);
  } catch (err) {
    console.error('[coretab] Failed to load recent tabs:', err);
  }
}

// Render recent tabs
function renderRecentTabs(groups) {
  const container = document.getElementById('recentTabsContainer');
  const empty = document.getElementById('recentEmpty');
  const countEl = document.getElementById('recentSectionCount');

  if (!container) return;

  // Count total recent tabs
  let totalRecent = 0;
  for (const site of groups) {
    totalRecent += site.entries.length;
  }

  if (totalRecent === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = `${totalRecent} pages`;

  container.innerHTML = `
    <div class="recent-sites">
      ${groups.map(site => `
        <div class="recent-card">
          <div class="recent-card-header">
            <div class="recent-card-info">
              <img class="recent-card-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(site.domain)}&sz=32" alt="" data-fallback loading="lazy" decoding="async">
              <span class="recent-card-name">${escapeHtml(site.label)}</span>
              <span class="recent-card-badge">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                ${site.entries.length}
              </span>
            </div>
          </div>
          <div class="recent-pages">
            ${site.entries.slice(0, 5).map(entry => `
              <div class="recent-page-item" data-action="open-recent" data-tab-url="${escapeHtml(entry.url)}">
                <span class="recent-page-title">${escapeHtml(smartTitle(entry.title, entry.url))}</span>
                <span class="recent-page-time">${timeAgo(entry.visitedAt)}</span>
              </div>
            `).join('')}
            ${site.entries.length > 5 ? `
              <button class="page-more-btn" data-action="more-recent" data-domain="${escapeHtml(site.domain)}" data-label="${escapeHtml(site.label)}">
                +${site.entries.length - 5} more
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
    // 1. 打开的标签页
    const allOpenTabs = await chrome.tabs.query({});
    const realOpenTabs = allOpenTabs.filter(t => t.url && !isSystemUrl(t.url)).map(tab => ({
      url: tab.url,
      title: tab.title,
      hostname: extractHostname(tab.url) || '',
      closed: false
    }));

    // 2. 关闭的标签页
    const allClosedTabs = getAllClosedTabs();

    // 3. 已保存的标签分组（tabs.html 的 coretab_groups）
    let savedTabs = [];
    try {
      const data = await chrome.storage.local.get('coretab_groups');
      const groups = data['coretab_groups'] || [];
      for (const group of groups) {
        if (group.tabs) {
          for (const tab of group.tabs) {
            savedTabs.push({
              url: tab.url,
              title: tab.title || tab.url,
              hostname: extractHostname(tab.url) || '',
              saved: true
            });
          }
        }
      }
    } catch (_) {}

    // 搜索 + 去重（按 URL）
    const seenUrls = new Set();
    const allMatches = [];

    const addIfMatch = (tab, badge) => {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      const hostname = (tab.hostname || '').toLowerCase();
      if (title.includes(query) || url.includes(query) || hostname.includes(query)) {
        if (!seenUrls.has(tab.url)) {
          seenUrls.add(tab.url);
          allMatches.push({ ...tab, _badge: badge });
        }
      }
    };

    for (const tab of realOpenTabs) addIfMatch(tab, 'Open');
    for (const tab of allClosedTabs) addIfMatch(tab, 'Closed');
    for (const tab of savedTabs) addIfMatch(tab, 'Saved');

    if (allMatches.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">No tabs found</div>';
    } else {
      const displayResults = allMatches.slice(0, 30);
      searchResults.innerHTML = displayResults.map(tab => {
        const hostname = tab.hostname || extractHostname(tab.url) || '';
        const isClosed = tab._badge === 'Closed';
        const isSaved = tab._badge === 'Saved';
        const action = isClosed ? 'reopen-tab' : 'focus-tab';
        return `
          <div class="search-result-item${isClosed ? ' closed' : ''}${isSaved ? ' saved' : ''}" data-action="${action}" data-tab-url="${escapeHtml(tab.url)}">
            <img src="https://www.google.com/s2/favicons?domain=${escapeHtml(hostname)}&sz=32" alt="" data-fallback loading="lazy" decoding="async">
            <div class="search-result-info">
              <div class="search-result-title">${escapeHtml(tab.title || tab.url)}</div>
              <div class="search-result-url">${escapeHtml(isClosed ? hostname : hostname)}</div>
            </div>
            <span class="search-result-badge">${escapeHtml(tab._badge)}</span>
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
