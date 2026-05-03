// CoreTab - 弹窗逻辑

// DOM 元素
const elements = {
  saveAllTabs: document.getElementById('saveAllTabs'),
  closeAllTabs: document.getElementById('closeAllTabs'),
  tabsCount: document.getElementById('tabsCount'),
  tabList: document.getElementById('tabList'),
  emptyState: document.getElementById('emptyState'),
  batchActions: document.getElementById('batchActions'),
  selectAll: document.getElementById('selectAll'),
  restoreSelected: document.getElementById('restoreSelected'),
  deleteSelected: document.getElementById('deleteSelected'),
  clearAll: document.getElementById('clearAll')
};

// 存储键名
const STORAGE_KEY = 'coretab_saved_tabs';

// 初始化
document.addEventListener('DOMContentLoaded', init);

function init() {
  loadSavedTabs();
  bindEvents();
}

// 绑定事件
function bindEvents() {
  elements.saveAllTabs.addEventListener('click', saveAllTabs);
  elements.closeAllTabs.addEventListener('click', closeAllTabs);
  elements.selectAll.addEventListener('click', toggleSelectAll);
  elements.restoreSelected.addEventListener('click', restoreSelected);
  elements.deleteSelected.addEventListener('click', deleteSelected);
  elements.clearAll.addEventListener('click', clearAll);
}

// 保存所有标签页
async function saveAllTabs() {
  try {
    // 获取所有标签页
    const tabs = await chrome.tabs.query({});
    
    if (tabs.length === 0) {
      showNotification('没有打开的标签页');
      return;
    }

    // 过滤掉空白页
    const validTabs = tabs.filter(tab => tab.url && !tab.url.startsWith('chrome://'));
    
    if (validTabs.length === 0) {
      showNotification('没有有效的标签页可以保存');
      return;
    }

    // 获取已保存的标签页
    const savedData = await chrome.storage.local.get(STORAGE_KEY);
    const savedTabs = savedData[STORAGE_KEY] || [];

    // 添加新标签页（避免重复）
    const existingUrls = new Set(savedTabs.map(t => t.url));
    const newTabs = validTabs.filter(tab => !existingUrls.has(tab.url));
    
    const tabsToSave = newTabs.map(tab => ({
      id: generateId(),
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      savedAt: Date.now()
    }));

    // 合并并保存
    const updatedTabs = [...tabsToSave, ...savedTabs];
    await chrome.storage.local.set({
      [STORAGE_KEY]: updatedTabs
    });

    showNotification(`已保存 ${tabsToSave.length} 个标签页`);
    loadSavedTabs();
  } catch (error) {
    console.error('保存标签页失败:', error);
    showNotification('保存失败，请重试');
  }
}

// 关闭所有标签页
async function closeAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    
    if (tabs.length === 0) {
      showNotification('没有打开的标签页');
      return;
    }

    // 过滤掉固定标签页
    const tabsToClose = tabs.filter(tab => !tab.pinned);
    const tabIds = tabsToClose.map(tab => tab.id);

    // 先保存再关闭
    await saveAllTabs();
    
    // 关闭标签页
    await chrome.tabs.remove(tabIds);
    
    showNotification(`已关闭 ${tabsToClose.length} 个标签页`);
  } catch (error) {
    console.error('关闭标签页失败:', error);
    showNotification('关闭失败，请重试');
  }
}

// 加载已保存的标签页
async function loadSavedTabs() {
  try {
    const savedData = await chrome.storage.local.get(STORAGE_KEY);
    const savedTabs = savedData[STORAGE_KEY] || [];

    // 更新统计
    elements.tabsCount.textContent = `已保存 ${savedTabs.length} 个标签页`;

    // 显示/隐藏空状态
    if (savedTabs.length === 0) {
      elements.emptyState.style.display = 'block';
      elements.batchActions.style.display = 'none';
      elements.tabList.innerHTML = '';
      elements.tabList.appendChild(elements.emptyState);
      return;
    }

    elements.emptyState.style.display = 'none';
    elements.batchActions.style.display = 'flex';

    // 渲染列表
    renderTabList(savedTabs);
  } catch (error) {
    console.error('加载标签页失败:', error);
  }
}

// 渲染标签页列表
function renderTabList(tabs) {
  elements.tabList.innerHTML = '';

  tabs.forEach(tab => {
    const tabElement = createTabElement(tab);
    elements.tabList.appendChild(tabElement);
  });
}

// 创建标签页元素
function createTabElement(tab) {
  const div = document.createElement('div');
  div.className = 'tab-item';
  div.dataset.id = tab.id;

  div.innerHTML = `
    <input type="checkbox" class="tab-checkbox" data-id="${tab.id}">
    <div class="tab-icon">
      <img src="${tab.favIconUrl || 'icons/icon16.png'}" 
           onerror="this.src='icons/icon16.png'" 
           alt="">
    </div>
    <div class="tab-info">
      <div class="tab-title">${escapeHtml(tab.title)}</div>
      <div class="tab-url">${escapeHtml(tab.url)}</div>
    </div>
    <div class="tab-actions">
      <button class="btn-icon restore" title="恢复">🔗</button>
      <button class="btn-icon delete" title="删除">🗑️</button>
    </div>
  `;

  // 恢复按钮
  div.querySelector('.restore').addEventListener('click', () => restoreTab(tab));
  
  // 删除按钮
  div.querySelector('.delete').addEventListener('click', () => deleteTab(tab.id));

  return div;
}

// 恢复单个标签页
async function restoreTab(tab) {
  try {
    await chrome.tabs.create({ url: tab.url, active: false });
    showNotification('已恢复标签页');
  } catch (error) {
    console.error('恢复标签页失败:', error);
    showNotification('恢复失败，请重试');
  }
}

// 删除单个标签页
async function deleteTab(tabId) {
  try {
    const savedData = await chrome.storage.local.get(STORAGE_KEY);
    const savedTabs = savedData[STORAGE_KEY] || [];
    
    const updatedTabs = savedTabs.filter(t => t.id !== tabId);
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedTabs });
    
    loadSavedTabs();
    showNotification('已删除');
  } catch (error) {
    console.error('删除标签页失败:', error);
  }
}

// 全选/取消全选
function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('.tab-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = elements.selectAll.checked;
  });
}

// 恢复选中的标签页
async function restoreSelected() {
  const checkedBoxes = document.querySelectorAll('.tab-checkbox:checked');
  
  if (checkedBoxes.length === 0) {
    showNotification('请选择要恢复的标签页');
    return;
  }

  const savedData = await chrome.storage.local.get(STORAGE_KEY);
  const savedTabs = savedData[STORAGE_KEY] || [];
  const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);

  try {
    for (const id of selectedIds) {
      const tab = savedTabs.find(t => t.id === id);
      if (tab) {
        await chrome.tabs.create({ url: tab.url, active: false });
      }
    }
    
    showNotification(`已恢复 ${selectedIds.length} 个标签页`);
  } catch (error) {
    console.error('恢复失败:', error);
    showNotification('恢复失败，请重试');
  }
}

// 删除选中的标签页
async function deleteSelected() {
  const checkedBoxes = document.querySelectorAll('.tab-checkbox:checked');
  
  if (checkedBoxes.length === 0) {
    showNotification('请选择要删除的标签页');
    return;
  }

  const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
  
  try {
    const savedData = await chrome.storage.local.get(STORAGE_KEY);
    const savedTabs = savedData[STORAGE_KEY] || [];
    
    const updatedTabs = savedTabs.filter(t => !selectedIds.includes(t.id));
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedTabs });
    
    loadSavedTabs();
    showNotification(`已删除 ${selectedIds.length} 个标签页`);
  } catch (error) {
    console.error('删除失败:', error);
  }
}

// 清空所有
async function clearAll() {
  if (!confirm('确定要清空所有保存的标签页吗？')) {
    return;
  }

  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    loadSavedTabs();
    showNotification('已清空');
  } catch (error) {
    console.error('清空失败:', error);
  }
}

// 工具函数：生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 工具函数：转义 HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示通知
function showNotification(message) {
  // 使用 chrome 通知或者简单的 alert
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}
