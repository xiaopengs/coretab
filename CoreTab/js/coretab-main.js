/* CoreTab bootstrap: initialize page after all feature files are loaded. */
// Initialization
async function init() {
  await initFaviconCache();
  initGreeting();
  initDateDisplay();
  initSearch();
  await restoreClosedTabsFromStorage();
  await renderDashboard();
}

async function renderDashboard() {
  await Promise.all([
    loadQuickNav(),
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
