/* CoreTab actions/modals: tab operations, confirmations, and filter modal behavior. */
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
let _filterListeners = [];

function _bindFilterListeners() {
  _cleanupFilterListeners();
  const add = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, handler);
      _filterListeners.push({ el, event, handler });
    }
  };
  add('recentFilterAddBtn', 'click', _onFilterAdd);
  add('recentFilterSaveBtn', 'click', _onFilterSave);
  add('recentFilterCloseBtn', 'click', closeRecentFilterModal);
  add('recentFilterInput', 'keydown', _onFilterInputKey);
}

function _cleanupFilterListeners() {
  for (const { el, event, handler } of _filterListeners) {
    el.removeEventListener(event, handler);
  }
  _filterListeners = [];
}

function _onFilterAdd(e) {
  e.preventDefault();
  e.stopPropagation();
  const input = document.getElementById('recentFilterInput');
  if (input) addFilterDomain(input.value);
}

async function _onFilterSave(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!_filterDraft) return;
  try {
    await saveTrackedDomains([..._filterDraft]);
  } catch (err) {
    console.error('[coretab] Failed to save filter domains:', err);
    showToast('Save failed, please try again');
    return;
  }
  closeRecentFilterModal();
  await loadRecentTabs();
  showToast('Tracking rules saved');
}

function _onFilterInputKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addFilterDomain(e.target.value);
  }
}

async function openRecentFilterModal() {
  const overlay = document.getElementById('recentFilterOverlay');
  if (!overlay) return;
  _filterDraft = [...(await getTrackedDomains())];
  renderFilterList();
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('visible'));
  _bindFilterListeners();
  setTimeout(() => {
    const input = document.getElementById('recentFilterInput');
    if (input) input.focus();
  }, 100);
}

function closeRecentFilterModal() {
  _cleanupFilterListeners();
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

// saveFilterDomains replaced by _onFilterSave (explicit listener)
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
