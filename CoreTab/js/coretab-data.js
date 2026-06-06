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

// 启动时合并两边存储的数据。chrome.storage.local 是 source of truth
// (MV3 友好,配额大),localStorage 作为热缓存。两侧可能因为用户清理
// 浏览器数据而短暂不一致 — 取较新的那份,并写回两边。
async function restoreClosedTabsFromStorage() {
  try {
    const localRaw = (() => {
      try { return localStorage.getItem(CLOSED_TABS_KEY); }
      catch { return null; }
    })();
    const localData = localRaw ? safeParseJson(localRaw) : null;
    const result = await chrome.storage.local.get(CLOSED_TABS_KEY);
    const remoteData = result[CLOSED_TABS_KEY] || null;

    // Pick the larger set as the merged source — whichever side has more
    // entries has seen more activity and is closer to ground truth.
    const localSize = localData ? countClosedTabsEntries(localData) : 0;
    const remoteSize = remoteData ? countClosedTabsEntries(remoteData) : 0;
    const merged = localSize >= remoteSize ? (localData || remoteData) : remoteData;
    if (!merged) return;

    // If the local copy is empty but remote has data (e.g. localStorage was
    // cleared by the user), restore it. If they diverge, prefer the merged
    // set and write it back to both stores.
    if (localSize < remoteSize) {
      try { localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(merged)); } catch {}
      console.log(`[coretab] Restored ${remoteSize} closed-tab entries from chrome.storage.local`);
    } else if (remoteSize < localSize) {
      chrome.storage.local.set({ [CLOSED_TABS_KEY]: merged }).catch((err) => {
        console.error('[coretab] restoreClosedTabsFromStorage: write to chrome.storage.local failed', err);
      });
      console.log(`[coretab] Pushed ${localSize} closed-tab entries to chrome.storage.local`);
    }
  } catch (err) {
    console.error('[coretab] restoreClosedTabsFromStorage failed:', err);
  }
}

function safeParseJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function countClosedTabsEntries(data) {
  if (!data || typeof data !== 'object') return 0;
  let n = 0;
  for (const dateKey of Object.keys(data)) {
    const hosts = data[dateKey];
    if (!hosts || typeof hosts !== 'object') continue;
    for (const host of Object.keys(hosts)) {
      const arr = hosts[host];
      if (Array.isArray(arr)) n += arr.length;
    }
  }
  return n;
}

function saveClosedTabs(data) {
  try {
    localStorage.setItem(CLOSED_TABS_KEY, JSON.stringify(data));
    // Mirror to chrome.storage.local so data survives a localStorage clear.
    // Log quota/IO failures instead of swallowing them silently.
    chrome.storage.local.set({ [CLOSED_TABS_KEY]: data }).catch((err) => {
      console.error('[coretab] saveClosedTabs: chrome.storage.local write failed', err);
    });
  } catch (err) {
    console.error('[coretab] saveClosedTabs: localStorage write failed', err);
  }
}

// Pure: mutate `closedTabs` in place, removing any dateKey older than the
// retention window. Returns the number of date groups removed.
function pruneClosedTabs(closedTabs) {
  if (!closedTabs || typeof closedTabs !== 'object') return 0;
  const cutoff = getDateKey(Date.now() - MAX_CLOSED_TABS_AGE_DAYS * 86400000);
  let removed = 0;
  for (const dateKey of Object.keys(closedTabs)) {
    if (dateKey < cutoff) {
      delete closedTabs[dateKey];
      removed++;
    }
  }
  return removed;
}

// Convenience: load → prune → save (no-op if nothing to prune).
async function pruneAndSaveClosedTabs() {
  try {
    const closedTabs = getClosedTabs();
    const removed = pruneClosedTabs(closedTabs);
    if (removed > 0) {
      saveClosedTabs(closedTabs);
      console.log(`[coretab] Pruned ${removed} expired closed-tab date group(s)`);
    }
  } catch (err) {
    console.error('[coretab] pruneAndSaveClosedTabs failed:', err);
  }
}

function getDateKey(timestamp) {
  const d = new Date(timestamp);
  // Use local-date components (timezone-naive) so the key matches the user's
  // wall-clock day, not UTC. This is the source of truth for grouping
  // closed/recent entries by day across the rest of the codebase.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addClosedTab(url, title) {
  const hostname = extractHostname(url) || 'unknown';
  const now = Date.now();
  const dateKey = getDateKey(now);

  const closedTabs = getClosedTabs();

  // Prune expired date groups on every write so storage stays bounded
  // even when the user never reloads the new-tab page.
  pruneClosedTabs(closedTabs);

  // Initialize date if not exists
  if (!closedTabs[dateKey]) {
    closedTabs[dateKey] = {};
  }
  if (!closedTabs[dateKey][hostname]) {
    closedTabs[dateKey][hostname] = [];
  }

  // Dedup: if the same (date, host, url) already exists, just refresh its
  // closedAt and move it to the head. Avoids storing N copies of the same URL
  // when a user reopens/recloses the same tab repeatedly.
  const existing = closedTabs[dateKey][hostname];
  const dupIdx = existing.findIndex(e => e.url === url);
  if (dupIdx >= 0) {
    const [entry] = existing.splice(dupIdx, 1);
    entry.closedAt = now;
    entry.title = title || entry.title;
    existing.unshift(entry);
    saveClosedTabs(closedTabs);
    return;
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

  // 按日期 → 扁平条目（每条带 hostname 便于渲染 favicon/标题）
  const dayMap = {};
  const seenByDay = {};

  for (const dateKey of Object.keys(closedTabs)) {
    dayMap[dateKey] = [];
    seenByDay[dateKey] = new Set();
    for (const hostname in closedTabs[dateKey]) {
      const entries = closedTabs[dateKey][hostname];
      if (!entries || entries.length === 0) continue;
      for (const entry of entries) {
        // 同一天内同一 url 去重
        const dedupeKey = `${dateKey}::${entry.url}`;
        if (seenByDay[dateKey].has(dedupeKey)) continue;
        seenByDay[dateKey].add(dedupeKey);
        dayMap[dateKey].push({
          ...entry,
          hostname,
          dateKey
        });
      }
    }
    // 当天内按 closedAt desc
    dayMap[dateKey].sort((a, b) => b.closedAt - a.closedAt);
  }

  // 排序日期（最新在前）
  const sortedDateKeys = Object.keys(dayMap).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return sortedDateKeys
    .filter(k => dayMap[k].length > 0)
    .map(dateKey => ({
      dateKey,
      label: typeof formatClosedDateLabel === 'function'
        ? formatClosedDateLabel(dateKey)
        : dateKey,
      entries: dayMap[dateKey]
    }));
}
