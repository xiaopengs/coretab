// CoreTab - 主页面逻辑

// 存储键名
const STORAGE_KEY = 'coretab_groups';

// DOM 元素
const elements = {
  groupsContainer: document.getElementById('groupsContainer'),
  emptyState: document.getElementById('emptyState'),
  searchBar: document.getElementById('searchBar'),
  searchInput: document.getElementById('searchInput'),
  totalCount: document.getElementById('totalCount'),
  groupCount: document.getElementById('groupCount'),
  restoreAllBtn: document.getElementById('restoreAllBtn'),
  toast: document.getElementById('toast'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmOk: document.getElementById('confirmOk'),
  settingsDropdown: document.getElementById('settingsDropdown'),
  clearAllBtn: document.getElementById('clearAllBtn')
};

// 当前状态
let allGroups = [];
let searchMode = false;

// 初始化
document.addEventListener('DOMContentLoaded', init);

function init() {
  bindEvents();
  loadGroups();
}

function bindEvents() {
  // 搜索
  document.getElementById('searchBtn').addEventListener('click', toggleSearch);
  document.getElementById('closeSearch').addEventListener('click', closeSearch);
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // 导入导出
  document.getElementById('importBtn').addEventListener('click', importTabs);
  document.getElementById('exportBtn').addEventListener('click', exportTabs);

  // 设置
  document.getElementById('settingsBtn').addEventListener('click', toggleSettingsDropdown);
  
  // 清空所有
  document.getElementById('clearAllBtn').addEventListener('click', clearAllData);

  // 全部还原
  document.getElementById('restoreAllBtn').addEventListener('click', restoreAll);

  // 确认对话框
  document.getElementById('confirmCancel').addEventListener('click', hideConfirm);
}

// 加载所有分组
async function loadGroups() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    allGroups = data[STORAGE_KEY] || [];
    renderGroups(allGroups);
    updateStats();
  } catch (error) {
    console.error('加载失败:', error);
    showToast('加载失败', 'error');
  }
}

// 渲染分组列表
function renderGroups(groups) {
  if (groups.length === 0) {
    elements.emptyState.style.display = 'block';
    elements.groupsContainer.innerHTML = '';
    elements.restoreAllBtn.style.display = 'none';
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.restoreAllBtn.style.display = 'inline-flex';

  // 按时间倒序排列
  const sortedGroups = [...groups].sort((a, b) => b.savedAt - a.savedAt);

  elements.groupsContainer.innerHTML = sortedGroups.map(group => createGroupHTML(group)).join('');

  // 绑定分组事件
  sortedGroups.forEach(group => {
    // 还原整个分组
    const restoreBtn = document.getElementById(`restore-${group.id}`);
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => restoreGroup(group.id));
    }

    // 更多菜单
    const moreBtn = document.getElementById(`more-${group.id}`);
    const dropdown = document.getElementById(`dropdown-${group.id}`);
    if (moreBtn && dropdown) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      });
    }

    // 还原单个标签
    document.querySelectorAll(`[data-tab-id="${group.id}"]`).forEach(tabEl => {
      tabEl.addEventListener('click', () => restoreSingleTab(group.id, tabEl.dataset.tabUrl));
    });

    // 删除单个标签
    document.querySelectorAll(`[data-delete-id="${group.id}"]`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSingleTab(group.id, btn.dataset.deleteTab);
      });
    });

    // 删除整组
    const deleteGroupBtn = document.getElementById(`delete-group-${group.id}`);
    if (deleteGroupBtn) {
      deleteGroupBtn.addEventListener('click', () => deleteGroup(group.id));
    }

    // 重命名分组
    const renameBtn = document.getElementById(`rename-group-${group.id}`);
    if (renameBtn) {
      renameBtn.addEventListener('click', () => renameGroup(group.id));
    }

    // 锁定/解锁分组
    const toggleLockBtn = document.getElementById(`toggle-lock-${group.id}`);
    if (toggleLockBtn) {
      toggleLockBtn.addEventListener('click', () => toggleLock(group.id));
    }

    // 分享分组
    const shareBtn = document.getElementById(`share-group-${group.id}`);
    if (shareBtn) {
      shareBtn.addEventListener('click', () => shareGroup(group.id));
    }

    // 分组名称点击编辑
    const groupNameEl = document.querySelector(`.group-name[data-group-id="${group.id}"]`);
    if (groupNameEl) {
      groupNameEl.addEventListener('click', () => renameGroup(group.id));
    }
  });

  // 点击其他地方关闭下拉菜单
  document.addEventListener('click', closeAllDropdowns);
}

// 创建分组HTML
function createGroupHTML(group) {
  const dateStr = formatGroupDate(group.savedAt);
  const tabCount = group.tabs ? group.tabs.length : 0;
  const isLocked = group.locked || false;
  const groupName = group.name || dateStr;

  const tabsList = group.tabs ? group.tabs.map(tab => `
    <div class="tab-item" data-tab-id="${group.id}" data-tab-url="${escapeHtml(tab.url)}">
      <div class="tab-favicon">
        <img src="${tab.favIconUrl || 'icons/icon16.png'}" onerror="this.src='icons/icon16.png'" alt="">
      </div>
      <span class="tab-title">${escapeHtml(tab.title || tab.url)}</span>
      <button class="tab-delete" data-delete-id="${group.id}" data-delete-tab="${tab.id}" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('') : '';

  return `
    <div class="group-card ${isLocked ? 'locked' : ''}" data-group-id="${group.id}">
      <div class="group-header">
        <div class="group-info">
          <span class="group-name" data-group-id="${group.id}" title="点击编辑名称">${escapeHtml(groupName)}</span>
          ${isLocked ? '<span class="lock-icon" title="已锁定">🔒</span>' : ''}
          <span class="group-count">${tabCount} 个标签页</span>
        </div>
        <div class="group-actions">
          <button class="btn btn-small btn-primary" id="restore-${group.id}">
            还原
          </button>
          <div class="dropdown">
            <button class="icon-btn" id="more-${group.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
              </svg>
            </button>
            <div class="dropdown-menu" id="dropdown-${group.id}" style="display: none;">
              <button class="dropdown-item" id="rename-group-${group.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                重命名
              </button>
              <button class="dropdown-item" id="toggle-lock-${group.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${isLocked ?
                    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' :
                    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'
                  }
                </svg>
                ${isLocked ? '解锁' : '锁定'}
              </button>
              <button class="dropdown-item" id="share-group-${group.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                分享
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" id="delete-group-${group.id}" ${isLocked ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                删除此组
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="group-tabs">
        ${tabsList}
      </div>
    </div>
  `;
}

// 格式化分组日期（支持相对时间）
function formatGroupDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // 相对时间显示
  if (diffMins < 1) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays === 1) {
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `昨天 ${timeStr}`;
  } else if (diffDays < 7) {
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `${diffDays}天前 ${timeStr}`;
  } else {
    // 显示具体日期
    const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  }
}

// 还原单个标签页
async function restoreSingleTab(groupId, url) {
  try {
    await chrome.tabs.create({ url, active: false });
    showToast('已恢复标签页');
  } catch (error) {
    console.error('恢复失败:', error);
    showToast('恢复失败', 'error');
  }
}

// 还原整个分组（在新窗口中打开）
async function restoreGroup(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group || !group.tabs) return;

  try {
    // 创建新窗口并在其中打开所有标签
    const firstTab = group.tabs[0];
    const newWindow = await chrome.windows.create({
      url: firstTab.url,
      focused: true
    });

    // 在新窗口中打开剩余标签
    for (let i = 1; i < group.tabs.length; i++) {
      await chrome.tabs.create({
        url: group.tabs[i].url,
        windowId: newWindow.id,
        active: false
      });
    }

    showToast(`已在新窗口还原 ${group.tabs.length} 个标签页`);

    // 从列表中移除
    await deleteGroup(groupId, true);
  } catch (error) {
    console.error('还原失败:', error);
    showToast('还原失败', 'error');
  }
}

// 删除单个标签
async function deleteSingleTab(groupId, tabId) {
  try {
    const groupIndex = allGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    allGroups[groupIndex].tabs = allGroups[groupIndex].tabs.filter(t => t.id !== tabId);

    // 如果分组空了，删除整个分组
    if (allGroups[groupIndex].tabs.length === 0) {
      allGroups.splice(groupIndex, 1);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
    renderGroups(allGroups);
    updateStats();
    showToast('已删除');
  } catch (error) {
    console.error('删除失败:', error);
    showToast('删除失败', 'error');
  }
}

// 删除整个分组
async function deleteGroup(groupId, silent = false) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group) return;

  // 检查是否锁定
  if (group.locked) {
    showToast('该分组已锁定，请先解锁', 'error');
    return;
  }

  if (!silent) {
    showConfirm('删除分组', '确定要删除此分组吗？删除后可通过导入恢复。', async () => {
      await doDeleteGroup(groupId);
    });
  } else {
    await doDeleteGroup(groupId);
  }
}

async function doDeleteGroup(groupId) {
  try {
    allGroups = allGroups.filter(g => g.id !== groupId);
    await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
    renderGroups(allGroups);
    updateStats();
    showToast('已删除分组');
  } catch (error) {
    console.error('删除失败:', error);
    showToast('删除失败', 'error');
  }
}

// 重命名分组
async function renameGroup(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group) return;

  const newName = prompt('请输入新的分组名称:', group.name || formatGroupDate(group.savedAt));
  if (newName && newName.trim()) {
    group.name = newName.trim();
    await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
    renderGroups(allGroups);
    showToast('已重命名');
  }
}

// 锁定/解锁分组
async function toggleLock(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group) return;

  group.locked = !group.locked;
  await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
  renderGroups(allGroups);
  showToast(group.locked ? '已锁定' : '已解锁');
}

// 分享分组
async function shareGroup(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group || !group.tabs) return;

  // 生成简单的 HTML 列表
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CoreTab 分享 - ${group.name || formatGroupDate(group.savedAt)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { color: #1a73e8; }
    .tab-list { list-style: none; padding: 0; }
    .tab-item { padding: 10px; border-bottom: 1px solid #eee; }
    .tab-item a { text-decoration: none; color: #333; }
    .tab-item a:hover { color: #1a73e8; }
    .favicon { width: 16px; height: 16px; margin-right: 8px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>${group.name || formatGroupDate(group.savedAt)}</h1>
  <p>${group.tabs.length} 个标签页</p>
  <ul class="tab-list">
    ${group.tabs.map(tab => `
      <li class="tab-item">
        <a href="${escapeHtml(tab.url)}" target="_blank">
          ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="favicon" onerror="this.style.display='none'">` : ''}
          ${escapeHtml(tab.title)}
        </a>
      </li>
    `).join('')}
  </ul>
</body>
</html>`;

  // 下载为 HTML 文件
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coretab-share-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('已导出分享文件');
}

// 还原所有分组（在新窗口中打开）
async function restoreAll() {
  // 收集所有标签
  const allTabs = [];
  for (const group of allGroups) {
    if (group.tabs) {
      allTabs.push(...group.tabs);
    }
  }

  if (allTabs.length === 0) {
    showToast('没有可还原的标签页');
    return;
  }

  try {
    // 创建新窗口并打开所有标签
    const firstTab = allTabs[0];
    const newWindow = await chrome.windows.create({
      url: firstTab.url,
      focused: true
    });

    // 在新窗口中打开剩余标签
    for (let i = 1; i < allTabs.length; i++) {
      await chrome.tabs.create({
        url: allTabs[i].url,
        active: false,
        windowId: newWindow.id
      });
    }

    showToast(`已在新窗口还原 ${allTabs.length} 个标签页`);

    // 清空所有
    allGroups = [];
    await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
    renderGroups(allGroups);
    updateStats();
  } catch (error) {
    console.error('还原失败:', error);
    showToast('还原失败', 'error');
  }
}

// 更新统计
function updateStats() {
  const totalTabs = allGroups.reduce((sum, g) => sum + (g.tabs ? g.tabs.length : 0), 0);
  elements.totalCount.textContent = `共 ${totalTabs} 个标签页`;
  elements.groupCount.textContent = `${allGroups.length} 个分组`;
}

// 搜索功能
function toggleSearch() {
  searchMode = !searchMode;
  elements.searchBar.style.display = searchMode ? 'flex' : 'none';
  if (searchMode) {
    elements.searchInput.focus();
  } else {
    elements.searchInput.value = '';
    renderGroups(allGroups);
  }
}

function closeSearch() {
  searchMode = false;
  elements.searchBar.style.display = 'none';
  elements.searchInput.value = '';
  renderGroups(allGroups);
}

function handleSearch() {
  const query = elements.searchInput.value.toLowerCase().trim();

  if (!query) {
    renderGroups(allGroups);
    return;
  }

  // 过滤匹配的分组
  const filteredGroups = allGroups.map(group => ({
    ...group,
    tabs: group.tabs ? group.tabs.filter(tab =>
      tab.title.toLowerCase().includes(query) ||
      tab.url.toLowerCase().includes(query)
    ) : []
  })).filter(group => group.tabs.length > 0);

  renderGroups(filteredGroups);
}

// 导入功能
function importTabs() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (Array.isArray(imported)) {
        // 合并导入的数据
        const existingUrls = new Set();
        allGroups.forEach(g => g.tabs && g.tabs.forEach(t => existingUrls.add(t.url)));

        let newTabs = [];
        imported.forEach(item => {
          if (!existingUrls.has(item.url)) {
            newTabs.push({
              id: generateId(),
              title: item.title || item.url,
              url: item.url,
              favIconUrl: item.favIconUrl || '',
              savedAt: item.savedAt || Date.now()
            });
            existingUrls.add(item.url);
          }
        });

        if (newTabs.length > 0) {
          // 创建新分组
          const newGroup = {
            id: generateId(),
            savedAt: Date.now(),
            tabs: newTabs
          };
          allGroups.unshift(newGroup);
          await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
          renderGroups(allGroups);
          updateStats();
          showToast(`成功导入 ${newTabs.length} 个标签页`);
        } else {
          showToast('没有新的标签页需要导入');
        }
      } else {
        showToast('无效的导入文件格式', 'error');
      }
    } catch (error) {
      console.error('导入失败:', error);
      showToast('导入失败：' + error.message, 'error');
    }
  };
  input.click();
}

// 导出功能
async function exportTabs() {
  try {
    // 收集所有标签
    const allTabs = [];
    allGroups.forEach(group => {
      if (group.tabs) {
        group.tabs.forEach(tab => {
          allTabs.push({
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            savedAt: tab.savedAt
          });
        });
      }
    });

    if (allTabs.length === 0) {
      showToast('没有可导出的标签页');
      return;
    }

    const blob = new Blob([JSON.stringify(allTabs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coretab-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`已导出 ${allTabs.length} 个标签页`);
  } catch (error) {
    console.error('导出失败:', error);
    showToast('导出失败', 'error');
  }
}

// 切换设置下拉菜单
function toggleSettingsDropdown(e) {
  e.stopPropagation();
  closeAllDropdowns();
  const isVisible = elements.settingsDropdown.style.display === 'block';
  elements.settingsDropdown.style.display = isVisible ? 'none' : 'block';
}

// 一键清空所有数据
async function clearAllData() {
  // 关闭下拉菜单
  elements.settingsDropdown.style.display = 'none';
  
  if (allGroups.length === 0) {
    showToast('没有可清空的数据');
    return;
  }
  
  // 计算标签总数
  const totalTabs = allGroups.reduce((sum, g) => sum + (g.tabs ? g.tabs.length : 0), 0);
  
  showConfirm(
    '清空所有数据', 
    `确定要清空所有保存的标签页吗？\n将删除 ${allGroups.length} 个分组，共 ${totalTabs} 个标签页。\n此操作不可撤销！`, 
    async () => {
      try {
        allGroups = [];
        await chrome.storage.local.set({ [STORAGE_KEY]: allGroups });
        renderGroups(allGroups);
        updateStats();
        showToast('已清空所有数据');
      } catch (error) {
        console.error('清空失败:', error);
        showToast('清空失败', 'error');
      }
    }
  );
}

// Toast 提示
function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast toast-${type} show`;
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2000);
}

// 确认对话框
function showConfirm(title, message, onConfirm) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmModal.style.display = 'flex';

  elements.confirmOk.onclick = () => {
    hideConfirm();
    onConfirm();
  };
}

function hideConfirm() {
  elements.confirmModal.style.display = 'none';
}

// 关闭所有下拉菜单
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(el => {
    el.style.display = 'none';
  });
}

// 工具函数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}