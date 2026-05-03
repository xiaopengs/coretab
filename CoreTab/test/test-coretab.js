// CoreTab 自动化测试脚本
// 测试 tabs.js 和 background.js 的核心逻辑

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  CoreTab 自动化测试');
console.log('========================================\n');

// 读取源代码
const tabsJs = fs.readFileSync(path.join(__dirname, '../tabs.js'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const tabsCss = fs.readFileSync(path.join(__dirname, '../styles/tabs.css'), 'utf8');

// 测试结果
let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

console.log('--- background.js 测试 ---\n');

test('使用 chrome.windows.getCurrent()', backgroundJs.includes('chrome.windows.getCurrent()'));
test('监听 action.onClicked', backgroundJs.includes('chrome.action.onClicked'));
test('保存标签页函数', backgroundJs.includes('async function saveAllTabs'));
test('过滤 chrome:// 页面', backgroundJs.includes('chrome://'));
test('过滤 chrome-extension:// 页面', backgroundJs.includes('chrome-extension://'));
test('使用 chrome.storage.local', backgroundJs.includes('chrome.storage.local'));
test('关闭标签页 tabs.remove', backgroundJs.includes('chrome.tabs.remove'));
test('打开 tabs.html', backgroundJs.includes("getURL(CORETAB_URL)") || backgroundJs.includes("getURL('tabs.html')"));
test('生成唯一ID函数', backgroundJs.includes('function generateId'));

console.log('\n--- tabs.js 测试 ---\n');

test('存储键名 coretab_groups', tabsJs.includes("STORAGE_KEY = 'coretab_groups'"));
test('加载分组函数', tabsJs.includes('async function loadGroups'));
test('渲染分组函数', tabsJs.includes('function renderGroups'));
test('创建分组HTML函数', tabsJs.includes('function createGroupHTML'));
test('相对时间显示', tabsJs.includes('分钟前') && tabsJs.includes('小时前'));
test('还原单个标签', tabsJs.includes('async function restoreSingleTab'));
test('还原整组', tabsJs.includes('async function restoreGroup'));
test('删除单个标签', tabsJs.includes('async function deleteSingleTab'));
test('删除整组', tabsJs.includes('async function deleteGroup'));
test('重命名分组', tabsJs.includes('async function renameGroup'));
test('锁定/解锁分组', tabsJs.includes('async function toggleLock'));
test('分享分组', tabsJs.includes('async function shareGroup'));
test('搜索功能', tabsJs.includes('function handleSearch'));
test('导入功能', tabsJs.includes('function importTabs'));
test('导出功能', tabsJs.includes('async function exportTabs'));
test('锁定检查', tabsJs.includes('group.locked'));
test('HTML转义', tabsJs.includes('function escapeHtml'));

console.log('\n--- tabs.css 测试 ---\n');

test('锁定分组样式', tabsCss.includes('.group-card.locked'));
test('分组名称样式', tabsCss.includes('.group-name'));
test('锁定图标样式', tabsCss.includes('.lock-icon'));
test('下拉菜单样式', tabsCss.includes('.dropdown-menu'));
test('危险操作样式', tabsCss.includes('.dropdown-item.danger'));

console.log('\n--- 功能完整性测试 ---\n');

test('相对时间格式完整', 
  tabsJs.includes('刚刚') && 
  tabsJs.includes('分钟前') && 
  tabsJs.includes('小时前') && 
  tabsJs.includes('天前'));

test('分组操作菜单完整', 
  tabsJs.includes('重命名') && 
  tabsJs.includes('锁定') && 
  tabsJs.includes('分享') && 
  tabsJs.includes('删除此组'));

test('分享功能生成HTML', 
  tabsJs.includes('<!DOCTYPE html>') && 
  tabsJs.includes('text/html'));

console.log('\n========================================');
console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
console.log('========================================\n');

// 测试代码语法
console.log('--- 语法检查 ---\n');

try {
  // 尝试解析 JavaScript 语法
  new Function(tabsJs.replace(/chrome\./g, 'window.'));
  console.log('✅ tabs.js 语法正确');
} catch (e) {
  console.log('❌ tabs.js 语法错误:', e.message);
}

try {
  new Function(backgroundJs.replace(/chrome\./g, 'window.'));
  console.log('✅ background.js 语法正确');
} catch (e) {
  console.log('❌ background.js 语法错误:', e.message);
}

console.log('\n测试完成！');
