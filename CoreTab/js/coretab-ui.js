/* CoreTab UI helpers: GitHub cards, search, counts, greeting/date, toast. */
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
            <img src="${getFaviconSrc(hostname)}" alt="" data-fallback loading="lazy" decoding="async">
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
