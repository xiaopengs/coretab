// CoreTab 自动化测试脚本
// 覆盖 Manifest V3 新标签页、拆分后的 JS 职责边界、background.js 后台逻辑和关键样式

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log('========================================');
console.log('  CoreTab 自动化测试');
console.log('========================================\n');

const root = path.join(__dirname, '..');
const jsRoot = path.join(root, 'js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const backgroundJs = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const appCompat = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const jsFiles = [
  'coretab-config.js',
  'coretab-events.js',
  'coretab-actions.js',
  'coretab-data.js',
  'coretab-utils.js',
  'coretab-render-tabs.js',
  'coretab-recent.js',
  'coretab-quick-nav.js',
  'coretab-ui.js',
  'coretab-main.js'
];
const js = Object.fromEntries(jsFiles.map(file => [file, fs.readFileSync(path.join(jsRoot, file), 'utf8')]));
const combinedAppJs = jsFiles.map(file => js[file]).join('\n');

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

console.log('--- manifest.json 测试 ---\n');

test('使用 Manifest V3', manifest.manifest_version === 3);
test('覆盖默认新标签页', manifest.chrome_url_overrides?.newtab === 'index.html');
test('声明 tabs 权限', manifest.permissions?.includes('tabs'));
test('声明 storage 权限', manifest.permissions?.includes('storage'));
test('声明 history 权限', manifest.permissions?.includes('history'));
test('host_permissions 包含 GitHub API', manifest.host_permissions?.includes('https://api.github.com/*'));
test('host_permissions 包含 Google favicon 服务（coretab-favicon-cache.js 依赖）', manifest.host_permissions?.includes('https://www.google.com/*'));
test('host_permissions 数量小且明确（<= 2 个）', Array.isArray(manifest.host_permissions) && manifest.host_permissions.length <= 2);
test('不再申请 <all_urls> 权限', !JSON.stringify(manifest.host_permissions || []).includes('<all_urls>'));

console.log('\n--- index.html / JS 拆分测试 ---\n');

test('入口不再直接加载 monolithic app.js', !html.includes('<script src="app.js"></script>'));
test('保留 app.js 兼容说明', appCompat.includes('split application entry'));
for (const file of jsFiles) {
  test(`加载 ${file}`, html.includes(`<script src="js/${file}"></script>`));
}
test('脚本按依赖顺序加载：config 在 main 前', html.indexOf('js/coretab-config.js') < html.indexOf('js/coretab-main.js'));
test('脚本按依赖顺序加载：ui 在 main 前', html.indexOf('js/coretab-ui.js') < html.indexOf('js/coretab-main.js'));
test('包含 Quick Navigation 弹窗确认/取消与错误提示', html.includes('id="quickNavSaveBtn"') && html.includes('quick-nav-confirm-btn') && html.includes('Confirm') && html.includes('id="quickNavError"') && html.includes('data-action="close-quick-nav-modal"'));
test('不依赖远程 Google Fonts', !html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'));

console.log('\n--- 拆分职责测试 ---\n');

test('config 管理常量和共享状态', js['coretab-config.js'].includes('DEFAULT_TRACKED_DOMAINS') && js['coretab-config.js'].includes('let windowGroups'));
test('events 只负责事件委托', js['coretab-events.js'].includes("document.addEventListener('click'") && js['coretab-events.js'].includes("document.addEventListener('keydown'"));
test('actions 包含标签操作和弹窗动作', js['coretab-actions.js'].includes('focusTabByUrl') && js['coretab-actions.js'].includes('showConfirmDialog'));
test('data 包含 Chrome API 数据加载', js['coretab-data.js'].includes('loadOpenTabs') && js['coretab-data.js'].includes('chrome.tabs.query'));
test('utils 包含 URL/标题/时间工具', js['coretab-utils.js'].includes('extractHostname') && js['coretab-utils.js'].includes('timeAgo'));
test('render-tabs 包含三类标签渲染', js['coretab-render-tabs.js'].includes('renderOpenTabs') && js['coretab-render-tabs.js'].includes('renderClosedTabs'));
test('recent 独立管理 Recent Tabs', js['coretab-recent.js'].includes('getRecentTabsGrouped') && js['coretab-recent.js'].includes('renderRecentTabs'));
test('quick-nav 独立管理常用网站导航', js['coretab-quick-nav.js'].includes('getQuickNavLinks') && js['coretab-quick-nav.js'].includes('renderQuickNav'));
test('quick-nav 包含新增默认 AI/SkillHub 站点', js['coretab-config.js'].includes('Kimi') && js['coretab-config.js'].includes('DeepSeek') && js['coretab-config.js'].includes('智谱 GLM') && js['coretab-config.js'].includes('腾讯 SkillHub'));
test('quick-nav 不会复活用户删除的默认站点', !js['coretab-quick-nav.js'].includes('mergeDefaultQuickNavLinks') && js['coretab-quick-nav.js'].includes('storage is the source of truth'));
test('quick-nav 支持两行折叠与更多列表', js['coretab-quick-nav.js'].includes('getQuickNavCollapsedSlots') && js['coretab-quick-nav.js'].includes('more-quick-nav') && js['coretab-quick-nav.js'].includes('openQuickNavListModal'));
test('quick-nav 支持保存异常与重复 URL 校验', js['coretab-quick-nav.js'].includes('setQuickNavError') && js['coretab-quick-nav.js'].includes('This URL already exists') && js['coretab-quick-nav.js'].includes('Failed to save'));
test('ui 包含搜索、toast、GitHub 渲染', js['coretab-ui.js'].includes('performSearch') && js['coretab-ui.js'].includes('showToast'));
test('main 负责初始化启动', js['coretab-main.js'].includes('async function init()') && js['coretab-main.js'].includes('DOMContentLoaded'));

console.log('\n--- background.js 测试 ---\n');

test('后台使用 chrome.storage.local', backgroundJs.includes('chrome.storage.local'));
test('监听 storage 配置变化', backgroundJs.includes('chrome.storage.onChanged.addListener'));
test('Recent Tabs 使用可配置域名', backgroundJs.includes('RECENT_TABS_CONFIG_KEY') && backgroundJs.includes('getTrackedDomains'));
test('支持 wildcard 域名匹配', backgroundJs.includes('domainMatches') && backgroundJs.includes('replace(/^\\*\\./'));
test('历史回填使用用户配置域名', backgroundJs.includes('const trackedDomains = await getTrackedDomains()'));
test('更新标签页数量 badge', backgroundJs.includes('chrome.action.setBadgeText'));
test('过滤系统页面', backgroundJs.includes('SYSTEM_URL_PREFIXES') && backgroundJs.includes('ALLOWED_CHROME_PAGES'));

console.log('\n--- 功能存在性测试 ---\n');

test('初始化 Dashboard', combinedAppJs.includes('async function init()') && combinedAppJs.includes('renderDashboard'));
test('加载 Open Tabs', combinedAppJs.includes('loadOpenTabs'));
test('加载 Closed Tabs', combinedAppJs.includes('loadClosedTabs'));
test('加载 Quick Navigation', combinedAppJs.includes('loadQuickNav'));
test('加载 Recent Tabs', combinedAppJs.includes('loadRecentTabs'));
test('加载 History', combinedAppJs.includes('loadHistory'));
test('加载 GitHub Trending', combinedAppJs.includes('loadGitHubTrending'));
test('Recent Tabs 可编辑追踪规则', combinedAppJs.includes('openRecentFilterModal') && combinedAppJs.includes('saveTrackedDomains'));
test('支持搜索', combinedAppJs.includes('initSearch') && combinedAppJs.includes('searchResults'));
test('支持确认弹窗', combinedAppJs.includes('showConfirmDialog') && combinedAppJs.includes('hideConfirmDialog'));
test('HTML 转义存在', combinedAppJs.includes('function escapeHtml'));

console.log('\n--- style.css 测试 ---\n');

test('包含设计 token', css.includes(':root') && css.includes('--cream'));
test('包含响应式适配', css.includes('@media'));
test('包含 Quick Navigation 样式', css.includes('.quick-nav-section') && css.includes('.quick-nav-card'));
test('Quick Navigation 主面板限制两行并提供 More 样式', css.includes('max-height: 118px') && css.includes('.quick-nav-more-card') && css.includes('.quick-nav-error'));
test('设计 token 补全 --matcha-500/700 避免按钮透明', css.includes('--matcha-500:') && css.includes('--matcha-700:') && css.includes('--matcha-200:') && css.includes('--matcha-400:'));
test('pill-btn hover 不再使用 rotateZ/translateY 飞出动画', !css.includes('rotateZ(-8deg) translateY(-80%)') && !css.includes('rotateZ(-8deg) translateY'));
test('Quick Navigation 确认按钮继承 pill-btn 尺寸仅覆盖颜色', css.includes('.quick-nav-confirm-btn') && css.includes('background: #078a52') && css.includes('border-color: #078a52') && !css.includes('.quick-nav-confirm-btn {\n  display: inline-flex'));
test('按钮 hover/active 不产生位移抖动', css.includes('transform: none !important') && css.includes('quick-nav-confirm-btn'));
test('其他模块 hover 不再定义 translateY/scale 抖动', !css.includes('transform: translateY(-') && !css.includes('transform: translateY(0) scale') && !css.includes('transform: scale(1.02)') && !css.includes('transform: scale(1.1)') && !css.includes('rotateZ(-4deg) scale'));
test('包含 Recent Tabs 样式', css.includes('.recent-section') && css.includes('.recent-card'));
test('包含 GitHub Trending 样式', css.includes('.github-section') && css.includes('.github-card'));
test('包含弹窗样式', css.includes('.confirm-dialog') && css.includes('.more-modal'));

console.log('\n--- 语法检查 ---\n');

function checkSyntax(file) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    test(`${file} 语法正确`, true);
  } catch (err) {
    test(`${file} 语法正确`, false);
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
    if (output) console.log(output);
  }
}

checkSyntax('background.js');
checkSyntax('tabs.js');
checkSyntax('popup.js');
checkSyntax('app.js');
for (const file of jsFiles) {
  checkSyntax(`js/${file}`);
}

console.log('\n========================================');
console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
console.log('========================================\n');

if (failed > 0) {
  process.exitCode = 1;
}
