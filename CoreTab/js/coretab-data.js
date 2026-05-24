/* CoreTab data loaders/storage: Chrome APIs, cache, closed-tab persistence. */
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
