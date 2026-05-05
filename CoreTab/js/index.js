/* ================================================================
   CoreTab - Core JavaScript Logic
   主渲染引擎：标签页管理、历史记录、GitHub热门项目、UI渲染
   ================================================================ */

'use strict';

// ── Favicon Fallback ───────────────────────────────────
// Default SVG globe icon shown when favicon fails to load
const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5">' +
  '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
);

// Capture-phase error handler — catches all [data-fallback] img errors
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.matches && img.matches('[data-fallback]')) {
    img.src = DEFAULT_FAVICON;
  }
}, true);

/* ----------------------------------------------------------------
   1. TAB MANAGEMENT - 标签页管理
   ---------------------------------------------------------------- */

/**
 * fetchOpenTabs()
 * 获取当前所有打开的标签页
 * @returns {Promise<Array>} 标签页数组
 */
async function fetchOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      windowId: t.windowId,
      active: t.active,
      pinned: t.pinned,
      favIconUrl: t.favIconUrl,
    }));
  } catch (error) {
    console.error('[CoreTab] 获取标签页失败:', error);
    return [];
  }
}

/**
 * groupTabsByDomain(tabs)
 * 按域名分组标签页
 * @param {Array} tabs - 标签页数组
 * @returns {Array} 分组后的域名数组
 */
function groupTabsByDomain(tabs) {
  const groups = {};
  const INTERNAL_PROTOCOLS = ['chrome://', 'chrome-extension://', 'about:', 'file://'];

  for (const tab of tabs) {
    if (!tab.url) continue;

    // 过滤内部页面
    const isInternal = INTERNAL_PROTOCOLS.some(p => tab.url.startsWith(p));
    if (isInternal) continue;

    let hostname;
    try {
      hostname = new URL(tab.url).hostname;
    } catch {
      continue;
    }

    if (!hostname) continue;

    if (!groups[hostname]) {
      groups[hostname] = {
        domain: hostname,
        label: friendlyDomain(hostname),
        tabs: [],
      };
    }
    groups[hostname].tabs.push(tab);
  }

  // 按标签页数量排序
  return Object.values(groups).sort((a, b) => b.tabs.length - a.tabs.length);
}

/**
 * closeTabsByUrls(urls)
 * 关闭指定 URL 的标签页
 * @param {Array<string>} urls - URL数组
 */
async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith('file://')) {
      exactUrls.add(u);
    } else {
      try {
        targetHostnames.push(new URL(u).hostname);
      } catch {
        // 跳过无法解析的URL
      }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(tab => {
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('file://') && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch {
        return false;
      }
    })
    .map(tab => tab.id);

  if (toClose.length > 0) {
    await chrome.tabs.remove(toClose);
  }
}

/**
 * closeAllTabsInWindow()
 * 关闭当前窗口所有标签页
 */
async function closeAllTabsInWindow() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });

    // 过滤固定标签页
    const tabsToClose = tabs.filter(tab => !tab.pinned).map(tab => tab.id);

    if (tabsToClose.length > 0) {
      await chrome.tabs.remove(tabsToClose);
    }
  } catch (error) {
    console.error('[CoreTab] 关闭所有标签页失败:', error);
  }
}

/**
 * focusTab(url)
 * 聚焦到指定标签页
 * @param {string} url - 目标URL
 */
async function focusTab(url) {
  if (!url) return;

  try {
    const allTabs = await chrome.tabs.query({});
    const currentWindow = await chrome.windows.getCurrent();

    // 优先精确匹配
    let matches = allTabs.filter(t => t.url === url);

    // 回退到域名匹配
    if (matches.length === 0) {
      try {
        const targetHost = new URL(url).hostname;
        matches = allTabs.filter(t => {
          try {
            return new URL(t.url).hostname === targetHost;
          } catch {
            return false;
          }
        });
      } catch {}
    }

    if (matches.length === 0) return;

    // 优先切换到不同窗口的标签
    const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
    await chrome.tabs.update(match.id, { active: true });
    await chrome.windows.update(match.windowId, { focused: true });
  } catch (error) {
    console.error('[CoreTab] 聚焦标签页失败:', error);
  }
}


/* ----------------------------------------------------------------
   2. BROWSING HISTORY - 历史记录（使用 chrome.history API）
   ---------------------------------------------------------------- */

/**
 * fetchBrowsingHistory(limit)
 * 获取浏览历史
 * @param {number} limit - 限制数量，默认100
 * @returns {Promise<Array>} 历史记录数组
 */
async function fetchBrowsingHistory(limit = 100) {
  return new Promise((resolve) => {
    try {
      chrome.history.search(
        {
          text: '',
          maxResults: limit,
          startTime: 0,
        },
        (historyItems) => {
          if (chrome.runtime.lastError) {
            console.error('[CoreTab] 获取历史记录失败:', chrome.runtime.lastError);
            resolve([]);
            return;
          }

          const history = historyItems
            .filter(item => item.url && !isInternalUrl(item.url))
            .map(item => ({
              id: item.id,
              url: item.url,
              title: item.title || item.url,
              lastVisitTime: item.lastVisitTime,
              visitCount: item.visitCount || 0,
            }));

          resolve(history);
        }
      );
    } catch (error) {
      console.error('[CoreTab] 获取历史记录失败:', error);
      resolve([]);
    }
  });
}

/**
 * groupHistoryByDomain(history)
 * 按网站分组历史记录
 * @param {Array} history - 历史记录数组
 * @returns {Array} 分组后的数组
 */
function groupHistoryByDomain(history) {
  const groups = {};

  for (const item of history) {
    if (!item.url) continue;

    let hostname;
    try {
      hostname = new URL(item.url).hostname;
    } catch {
      continue;
    }

    if (!hostname) continue;

    if (!groups[hostname]) {
      groups[hostname] = {
        domain: hostname,
        label: friendlyDomain(hostname),
        items: [],
      };
    }
    groups[hostname].items.push(item);
  }

  // 按最后访问时间排序
  return Object.values(groups).sort((a, b) => {
    const aTime = Math.max(...a.items.map(i => i.lastVisitTime || 0));
    const bTime = Math.max(...b.items.map(i => i.lastVisitTime || 0));
    return bTime - aTime;
  });
}


/* ----------------------------------------------------------------
   3. GITHUB TRENDING - GitHub 热门项目
   ---------------------------------------------------------------- */

const GITHUB_API_URL = 'https://api.github.com/search/repositories';
const GITHUB_TRENDING_URL = `${GITHUB_API_URL}?q=stars:>1&sort=stars&per_page=6`;

/**
 * fetchGitHubTrending()
 * 从 GitHub API 获取热门项目
 * @returns {Promise<Array>} 项目数组
 */
async function fetchGitHubTrending() {
  try {
    const response = await fetch(GITHUB_TRENDING_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    return (data.items || []).map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '暂无描述',
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      url: repo.html_url,
      avatarUrl: repo.owner.avatar_url,
      owner: repo.owner.login,
    }));
  } catch (error) {
    console.error('[CoreTab] 获取GitHub热门失败:', error);
    return [];
  }
}

/**
 * renderGitHubCards(projects)
 * 渲染项目卡片
 * @param {Array} projects - 项目数组
 * @returns {string} HTML字符串
 */
function renderGitHubCards(projects) {
  if (!projects || projects.length === 0) {
    return '<div class="empty-message">暂无热门项目</div>';
  }

  return projects.map(project => {
    const stars = formatNumber(project.stars);
    const forks = formatNumber(project.forks);
    const safeUrl = encodeURIComponent(project.url);
    const safeTitle = escapeHtml(project.fullName);

    return `
      <div class="github-card">
        <div class="github-card-header">
          <img class="github-avatar" src="${project.avatarUrl}" alt="${escapeHtml(project.owner)}" data-fallback loading="lazy" decoding="async">
          <div class="github-owner">${escapeHtml(project.owner)}</div>
        </div>
        <a class="github-card-title" href="${project.url}" target="_blank" rel="noopener" title="${safeTitle}">
          ${escapeHtml(project.name)}
        </a>
        <p class="github-card-desc">${escapeHtml(project.description)}</p>
        <div class="github-card-footer">
          <span class="github-stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            ${stars}
          </span>
          <span class="github-stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 2L6 8L12 8L12 2L6 2ZM6 16L6 22L12 22L12 16L6 16ZM18 2L18 8L24 8L24 2L18 2ZM2 10L8 10L8 16L2 16L2 10ZM16 10L22 10L22 16L16 16L16 10ZM10 6L14 6L14 8L10 8L10 6ZM6 10L8 10L8 12L6 12L6 10ZM16 18L18 18L18 20L16 20L16 18ZM10 18L14 18L14 20L10 20L10 18ZM18 14L22 14L22 16L18 16L18 14Z"/>
            </svg>
            ${forks}
          </span>
          ${project.language ? `<span class="github-language">${escapeHtml(project.language)}</span>` : ''}
        </div>
        <div class="github-card-actions">
          <button class="github-btn" data-action="open-github" data-url="${encodeURIComponent(project.url)}">
            打开
          </button>
          <button class="github-btn github-btn-secondary" data-action="save-github" data-url="${safeUrl}" data-title="${safeTitle}">
            收藏
          </button>
        </div>
      </div>
    `;
  }).join('');
}


/* ----------------------------------------------------------------
   4. UI RENDERING - UI渲染
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 * 主渲染函数 - 渲染整个仪表板
 */
async function renderStaticDashboard() {
  try {
    // 渲染头部信息
    renderHeader();

    // 获取并渲染标签页
    const tabs = await fetchOpenTabs();
    const domainGroups = groupTabsByDomain(tabs);
    renderDomainCards(domainGroups);

    // 获取并渲染历史记录（异步，不阻塞）
    renderHistorySectionAsync();

    // 获取并渲染GitHub热门（异步，不阻塞）
    renderGitHubSectionAsync();

    // 更新统计
    updateStats(tabs.length, domainGroups.length);

  } catch (error) {
    console.error('[CoreTab] 渲染仪表板失败:', error);
  }
}

/**
 * renderHeader()
 * 渲染头部：问候语和日期
 */
function renderHeader() {
  const greetingEl = document.getElementById('greeting');
  const dateEl = document.getElementById('dateDisplay');

  if (greetingEl) {
    greetingEl.textContent = getGreeting();
  }
  if (dateEl) {
    dateEl.textContent = getDateDisplay();
  }
}

/**
 * renderDomainCards(groups)
 * 渲染域名分组卡片
 * @param {Array} groups - 分组数组
 */
function renderDomainCards(groups) {
  const container = document.getElementById('domainCardsContainer');
  const section = document.getElementById('domainSection');
  const countEl = document.getElementById('domainCount');

  if (!container || !section) return;

  if (groups.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  if (countEl) {
    countEl.textContent = `${groups.length} 个域名`;
  }

  container.innerHTML = groups.map(group => renderDomainCard(group)).join('');

  // 绑定卡片事件
  bindDomainCardEvents(container);
}

/**
 * renderDomainCard(group)
 * 渲染单个域名卡片
 * @param {Object} group - 分组对象
 * @returns {string} HTML字符串
 */
function renderDomainCard(group) {
  const tabCount = group.tabs.length;
  const stableId = 'domain-' + group.domain.replace(/[^a-z0-9]/g, '-');
  const totalTabs = group.tabs.length;

  // 显示每个URL一次，带计数标签
  const seen = new Set();
  const uniqueTabs = [];
  const urlCounts = {};

  for (const tab of group.tabs) {
    if (!seen.has(tab.url)) {
      seen.add(tab.url);
      uniqueTabs.push(tab);
      urlCounts[tab.url] = 1;
    } else {
      urlCounts[tab.url]++;
    }
  }

  const pageChips = uniqueTabs.slice(0, 6).map(tab => {
    const label = smartTitle(tab.title || '', tab.url);
    const count = urlCounts[tab.url];
    const dupeTag = count > 1 ? `<span class="chip-dupe">(${count}x)</span>` : '';
    const safeUrl = encodeURIComponent(tab.url);
    const safeTitle = escapeHtml(label);
    const faviconUrl = getFaviconUrl(tab.url);

    return `
      <div class="page-chip" data-action="focus-tab" data-tab-url="${encodeURIComponent(tab.url)}" title="${safeTitle}">
        <img class="chip-favicon" src="${faviconUrl}" alt="" data-fallback loading="lazy" decoding="async">
        <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
        <div class="chip-actions">
          <button class="chip-action" data-action="close-single-tab" data-tab-url="${safeUrl}" title="关闭">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  const extraCount = uniqueTabs.length - 6;
  const overflowHtml = extraCount > 0
    ? `<div class="page-chip page-chip-overflow" data-action="expand-chips" data-domain-id="${stableId}">
        +${extraCount} more
       </div>`
    : '';

  const safeDomain = escapeHtml(group.label || friendlyDomain(group.domain));

  return `
    <div class="domain-card" data-domain-id="${stableId}">
      <div class="domain-card-header">
        <div class="domain-info">
          <span class="domain-name">${safeDomain}</span>
          <span class="domain-badge">${tabCount} tabs</span>
        </div>
        <button class="domain-close-btn" data-action="close-domain-tabs" data-domain-id="${stableId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="domain-card-pages">
        ${pageChips}${overflowHtml}
      </div>
    </div>
  `;
}

/**
 * renderHistorySection(historyGroups)
 * 渲染历史记录区
 * @param {Array} historyGroups - 分组后的历史记录
 */
function renderHistorySection(historyGroups) {
  const container = document.getElementById('historyContainer');
  const section = document.getElementById('historySection');

  if (!container || !section) return;

  if (historyGroups.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  container.innerHTML = historyGroups.slice(0, 8).map(group => {
    const items = group.items.slice(0, 5).map(item => {
      const title = smartTitle(item.title || '', item.url);
      const safeUrl = encodeURIComponent(item.url);
      const timeAgoStr = timeAgo(item.lastVisitTime);
      const faviconUrl = getFaviconUrl(item.url);

      return `
        <div class="history-item" data-action="focus-tab" data-tab-url="${safeUrl}">
          <img class="history-favicon" src="${faviconUrl}" alt="" data-fallback loading="lazy" decoding="async">
          <div class="history-info">
            <span class="history-title">${escapeHtml(title)}</span>
            <span class="history-time">${timeAgoStr}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="history-group">
        <div class="history-group-header">
          <span class="history-group-name">${escapeHtml(group.label)}</span>
          <span class="history-group-count">${group.items.length} 条</span>
        </div>
        <div class="history-group-items">${items}</div>
      </div>
    `;
  }).join('');
}

/**
 * renderHistorySectionAsync()
 * 异步渲染历史记录区
 */
async function renderHistorySectionAsync() {
  try {
    const history = await fetchBrowsingHistory(100);
    const historyGroups = groupHistoryByDomain(history);
    renderHistorySection(historyGroups);
  } catch (error) {
    console.error('[CoreTab] 渲染历史记录失败:', error);
  }
}

/**
 * renderGitHubSection(projects)
 * 渲染GitHub热门区
 * @param {Array} projects - 项目数组
 */
function renderGitHubSection(projects) {
  const container = document.getElementById('githubContainer');
  const section = document.getElementById('githubSection');

  if (!container || !section) return;

  section.style.display = 'block';
  container.innerHTML = renderGitHubCards(projects);
}

/**
 * renderGitHubSectionAsync()
 * 异步渲染GitHub热门区
 */
async function renderGitHubSectionAsync() {
  try {
    const projects = await fetchGitHubTrending();
    renderGitHubSection(projects);
  } catch (error) {
    console.error('[CoreTab] 渲染GitHub热门失败:', error);
  }
}

/**
 * updateStats(tabCount, domainCount)
 * 更新底部统计
 * @param {number} tabCount - 标签页数量
 * @param {number} domainCount - 域名数量
 */
function updateStats(tabCount, domainCount) {
  const tabCountEl = document.getElementById('totalTabsCount');
  const domainCountEl = document.getElementById('totalDomainsCount');

  if (tabCountEl) tabCountEl.textContent = tabCount;
  if (domainCountEl) domainCountEl.textContent = domainCount;
}


/* ----------------------------------------------------------------
   5. EVENT HANDLING - 事件处理（使用事件委托）
   ---------------------------------------------------------------- */

/**
 * 初始化事件监听
 */
function initEventListeners() {
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
}

/**
 * handleClick(e)
 * 处理点击事件
 * @param {Event} e - 点击事件
 */
async function handleClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  switch (action) {
    case 'focus-tab':
      await handleFocusTab(actionEl);
      break;

    case 'close-single-tab':
      await handleCloseSingleTab(actionEl, e);
      break;

    case 'close-domain-tabs':
      await handleCloseDomainTabs(actionEl);
      break;

    case 'close-all-tabs':
      await handleCloseAllTabs();
      break;

    case 'expand-chips':
      handleExpandChips(actionEl);
      break;

    case 'open-github':
      await handleOpenGitHub(actionEl);
      break;

    case 'save-github':
      await handleSaveGitHub(actionEl);
      break;

    case 'refresh-dashboard':
      await handleRefreshDashboard();
      break;
  }
}

/**
 * handleInput(e)
 * 处理输入事件
 * @param {Event} e - 输入事件
 */
function handleInput(e) {
  // 搜索功能预留
  if (e.target.dataset.action === 'search') {
    handleSearch(e.target.value);
  }
}

/**
 * handleFocusTab(el)
 * 聚焦标签页
 */
async function handleFocusTab(el) {
  const url = decodeURIComponent(el.dataset.tabUrl || '');
  if (url) {
    await focusTab(url);
  }
}

/**
 * handleCloseSingleTab(el, e)
 * 关闭单个标签页
 */
async function handleCloseSingleTab(el, e) {
  e.stopPropagation();

  const url = decodeURIComponent(el.dataset.tabUrl || '');
  if (!url) return;

  try {
    const allTabs = await chrome.tabs.query({});
    const match = allTabs.find(t => t.url === url);
    if (match) {
      await chrome.tabs.remove(match.id);
    }

    // 动画效果
    const chip = el.closest('.page-chip');
    if (chip) {
      chip.style.opacity = '0';
      chip.style.transform = 'scale(0.8)';
      setTimeout(() => chip.remove(), 200);
    }

    showToast('标签页已关闭');

    // 刷新仪表板
    setTimeout(() => renderStaticDashboard(), 300);
  } catch (error) {
    console.error('[CoreTab] 关闭标签页失败:', error);
    showToast('关闭失败');
  }
}

/**
 * handleCloseDomainTabs(el)
 * 关闭域名下所有标签页
 */
async function handleCloseDomainTabs(el) {
  const domainId = el.dataset.domainId;
  const domainCard = el.closest('.domain-card');

  if (!domainId) return;

  // 获取该域名下的所有URL
  const chips = document.querySelectorAll(`.domain-card[data-domain-id="${domainId}"] .page-chip[data-tab-url]`);
  const urls = Array.from(chips).map(chip => decodeURIComponent(chip.dataset.tabUrl || '')).filter(Boolean);

  if (urls.length === 0) return;

  try {
    await closeTabsByUrls(urls);

    if (domainCard) {
      domainCard.style.opacity = '0';
      domainCard.style.transform = 'scale(0.9)';
      setTimeout(() => {
        domainCard.remove();
        checkEmptyState();
      }, 300);
    }

    showToast(`已关闭 ${urls.length} 个标签页`);
  } catch (error) {
    console.error('[CoreTab] 关闭域名标签页失败:', error);
    showToast('关闭失败');
  }
}

/**
 * handleCloseAllTabs()
 * 关闭所有标签页
 */
async function handleCloseAllTabs() {
  try {
    const tabs = await fetchOpenTabs();
    const urls = tabs.map(t => t.url).filter(Boolean);

    await closeTabsByUrls(urls);
    showToast('已关闭所有标签页');

    // 刷新
    await renderStaticDashboard();
  } catch (error) {
    console.error('[CoreTab] 关闭所有标签页失败:', error);
    showToast('关闭失败');
  }
}

/**
 * handleExpandChips(el)
 * 展开更多标签页
 */
function handleExpandChips(el) {
  const domainId = el.dataset.domainId;
  const domainCard = document.querySelector(`.domain-card[data-domain-id="${domainId}"]`);

  if (domainCard) {
    const overflowChips = domainCard.querySelectorAll('.page-chip-overflow');
    overflowChips.forEach(chip => {
      chip.style.display = 'none';
    });

    // 这里可以加载更多标签页的逻辑
    el.remove();
  }
}

/**
 * handleOpenGitHub(el)
 * 打开GitHub项目
 */
async function handleOpenGitHub(el) {
  const url = decodeURIComponent(el.dataset.url || '');
  if (url) {
    await chrome.tabs.create({ url, active: true });
  }
}

/**
 * handleSaveGitHub(el)
 * 收藏GitHub项目
 */
async function handleSaveGitHub(el) {
  const url = decodeURIComponent(el.dataset.url || '');
  const title = el.dataset.title || url;

  try {
    const savedData = await chrome.storage.local.get('savedProjects');
    const savedProjects = savedData.savedProjects || [];

    // 检查是否已收藏
    if (savedProjects.some(p => p.url === url)) {
      showToast('已收藏过该项目');
      return;
    }

    savedProjects.push({
      id: generateId(),
      url,
      title: decodeURIComponent(title),
      savedAt: Date.now(),
    });

    await chrome.storage.local.set({ savedProjects });
    showToast('已收藏项目');
  } catch (error) {
    console.error('[CoreTab] 收藏项目失败:', error);
    showToast('收藏失败');
  }
}

/**
 * handleRefreshDashboard()
 * 刷新仪表板
 */
async function handleRefreshDashboard() {
  await renderStaticDashboard();
  showToast('已刷新');
}

/**
 * handleSearch(query)
 * 处理搜索
 */
function handleSearch(query) {
  const domainCards = document.querySelectorAll('.domain-card');
  const queryLower = query.toLowerCase().trim();

  domainCards.forEach(card => {
    const domainName = card.querySelector('.domain-name')?.textContent?.toLowerCase() || '';
    const chips = card.querySelectorAll('.page-chip');
    let hasMatch = domainName.includes(queryLower);

    chips.forEach(chip => {
      const title = chip.querySelector('.chip-text')?.textContent?.toLowerCase() || '';
      const matches = title.includes(queryLower);
      chip.style.display = matches || !queryLower ? '' : 'none';
      if (matches) hasMatch = true;
    });

    card.style.display = hasMatch ? '' : 'none';
  });
}


/* ----------------------------------------------------------------
   6. UTILITY FUNCTIONS - 工具函数
   ---------------------------------------------------------------- */

/**
 * getGreeting()
 * 获取问候语
 * @returns {string} 问候语
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，注意休息';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了，注意休息';
}

/**
 * getDateDisplay()
 * 获取日期显示
 * @returns {string} 日期字符串
 */
function getDateDisplay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[now.getDay()];

  return `${year}年${month}月${day}日 ${weekday}`;
}

/**
 * timeAgo(dateStr)
 * 相对时间
 * @param {number|string} dateStr - 时间戳或ISO字符串
 * @returns {string} 相对时间字符串
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';

  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;

  if (diffMs < 0) return '刚刚';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

/**
 * friendlyDomain(hostname)
 * 友好域名显示
 * @param {string} hostname - 主机名
 * @returns {string} 友好域名
 */
function friendlyDomain(hostname) {
  if (!hostname) return '';

  const FRIENDLY_DOMAINS = {
    'github.com': 'GitHub',
    'www.github.com': 'GitHub',
    'youtube.com': 'YouTube',
    'www.youtube.com': 'YouTube',
    'twitter.com': 'X',
    'www.twitter.com': 'X',
    'x.com': 'X',
    'www.x.com': 'X',
    'reddit.com': 'Reddit',
    'www.reddit.com': 'Reddit',
    'stackoverflow.com': 'Stack Overflow',
    'www.stackoverflow.com': 'Stack Overflow',
    'medium.com': 'Medium',
    'www.medium.com': 'Medium',
    'github.io': 'GitHub Pages',
    'npmjs.com': 'npm',
    'www.npmjs.com': 'npm',
  };

  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  // 处理 localhost 显示端口号
  if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
    return hostname;
  }

  // 移除 www. 前缀
  let clean = hostname.replace(/^www\./, '');

  // 移除常见后缀
  clean = clean.replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk)$/, '');

  return clean.split('.').map(part => capitalize(part)).join(' ');
}

/**
 * smartTitle(title, url)
 * 智能标题处理
 * @param {string} title - 原始标题
 * @param {string} url - URL
 * @returns {string} 处理后的标题
 */
function smartTitle(title, url) {
  if (!url) return title || '';

  // 清理通知计数，如 "(2) Title" -> "Title"
  if (title) {
    title = title.replace(/^\(\d+\+?\)\s*/, '');
    title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  }

  let pathname = '', hostname = '';
  try {
    const u = new URL(url);
    pathname = u.pathname;
    hostname = u.hostname;
  } catch {
    return title || url;
  }

  // GitHub URL 智能处理
  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull' && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      return `${owner}/${repo}`;
    }
  }

  // localhost 显示端口号
  if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
    const portMatch = hostname.match(/localhost:(\d+)/);
    if (portMatch && title) {
      return `[${portMatch[1]}] ${title}`;
    }
  }

  return title || url;
}

/**
 * showToast(message)
 * 显示通知
 * @param {string} message - 消息内容
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');

  if (!toast) return;

  if (toastText) {
    toastText.textContent = message;
  } else {
    toast.textContent = message;
  }

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}


/* ----------------------------------------------------------------
   7. HELPER FUNCTIONS - 辅助函数
   ---------------------------------------------------------------- */

/**
 * isInternalUrl(url)
 * 检查是否为内部页面
 * @param {string} url - URL
 * @returns {boolean}
 */
function isInternalUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('file://') ||
    url.startsWith('devtools://') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://')
  );
}

/**
 * getFaviconUrl(url)
 * 获取网站favicon URL
 * @param {string} url - 网站URL
 * @returns {string} favicon URL
 */
function getFaviconUrl(url) {
  if (!url) return '';

  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return '';
  }
}

/**
 * formatNumber(num)
 * 格式化数字（如 1234 -> 1.2k）
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

/**
 * capitalize(str)
 * 首字母大写
 * @param {string} str - 字符串
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * escapeHtml(text)
 * HTML转义
 * @param {string} text - 文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * generateId()
 * 生成唯一ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * checkEmptyState()
 * 检查并显示空状态
 */
function checkEmptyState() {
  const domainCards = document.querySelectorAll('.domain-card');
  const emptyState = document.getElementById('emptyState');

  if (domainCards.length === 0 && emptyState) {
    emptyState.style.display = 'flex';
  }
}

/**
 * bindDomainCardEvents(container)
 * 绑定域名卡片事件
 * @param {HTMLElement} container - 容器元素
 */
function bindDomainCardEvents(container) {
  if (!container) return;

  // 绑定溢出卡片的展开事件
  const overflowChips = container.querySelectorAll('.page-chip-overflow');
  overflowChips.forEach(chip => {
    chip.addEventListener('click', () => handleExpandChips(chip));
  });
}


/* ----------------------------------------------------------------
   INITIALIZATION - 初始化
   ---------------------------------------------------------------- */

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderStaticDashboard();
});

// 暴露给外部的API（可选）
window.CoreTab = {
  fetchOpenTabs,
  groupTabsByDomain,
  closeTabsByUrls,
  closeAllTabsInWindow,
  focusTab,
  fetchBrowsingHistory,
  groupHistoryByDomain,
  fetchGitHubTrending,
  renderStaticDashboard,
  showToast,
};
