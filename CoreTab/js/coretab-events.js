/* CoreTab events: document-level keyboard/click delegation. */
// Keyboard handler for dialogs
// Press Esc to close current open dialog
function getActiveDialog() {
  const quickNavOverlay = document.getElementById('quickNavOverlay');
  if (quickNavOverlay && quickNavOverlay.classList.contains('visible')) return 'quick-nav';
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
    if (active === 'quick-nav') { closeQuickNavModal(); return; }
    hideConfirmDialog();
  }
  // Enter key in filter input
  if (e.key === 'Enter' && document.activeElement?.id === 'recentFilterInput') {
    addFilterDomain(document.activeElement.value);
  }
  if (e.key === 'Enter' && (document.activeElement?.id === 'quickNavUrlInput' || document.activeElement?.id === 'quickNavTitleInput')) {
    saveQuickNavFromModal();
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
  const quickNavOverlay = document.getElementById('quickNavOverlay');
  if (quickNavOverlay && e.target === quickNavOverlay) {
    closeQuickNavModal();
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

  // ---- Quick Navigation ----
  if (action === 'open-quick-nav') {
    const url = actionEl.dataset.url;
    if (url) chrome.tabs.create({ url, active: true });
    return;
  }

  if (action === 'add-quick-nav') {
    e.stopPropagation();
    openQuickNavModal();
    return;
  }

  if (action === 'edit-quick-nav') {
    e.stopPropagation();
    await editQuickNavLink(actionEl.dataset.id);
    return;
  }

  if (action === 'delete-quick-nav') {
    e.stopPropagation();
    await deleteQuickNavLink(actionEl.dataset.id);
    return;
  }

  if (action === 'close-quick-nav-modal') {
    closeQuickNavModal();
    return;
  }

  if (action === 'save-quick-nav') {
    e.stopPropagation();
    await saveQuickNavFromModal();
    return;
  }

  if (action === 'more-quick-nav') {
    e.stopPropagation();
    await openQuickNavListModal();
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
          <img src="${getFaviconSrc(domain)}" alt="" data-fallback loading="lazy" decoding="async">
          <span class="more-modal-item-title">${escapeHtml(smartTitle(entry.title, entry.url))}</span>
          <span class="more-modal-item-time">${timeAgo(entry.visitedAt)}</span>
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
          <img src="${getFaviconSrc(g.domain)}" alt="" data-fallback loading="lazy" decoding="async">
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
