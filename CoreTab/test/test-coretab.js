// CoreTab 自动化测试脚本
// 覆盖 Manifest V3 新标签页、app.js 主逻辑、background.js 后台逻辑和关键样式

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log('========================================');
console.log('  CoreTab 自动化测试');
console.log('========================================\n');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

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
test('host_permissions 已收窄到 GitHub API', JSON.stringify(manifest.host_permissions) === JSON.stringify(['https://api.github.com/*']));
test('不再申请 <all_urls> 权限', !JSON.stringify(manifest.host_permissions || []).includes('<all_urls>'));

console.log('\n--- index.html 测试 ---\n');

test('入口加载 app.js', html.includes('<script src="app.js"></script>'));
test('不依赖远程 Google Fonts', !html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'));
test('包含 Recent Tabs 区块', html.includes('id="recentSection"'));
test('包含 Open Tabs 区块', html.includes('id="openTabsSection"'));
test('包含 GitHub Trending 区块', html.includes('id="githubSection"'));
test('包含 History 区块', html.includes('id="historySection"'));

console.log('\n--- background.js 测试 ---\n');

test('后台使用 chrome.storage.local', backgroundJs.includes('chrome.storage.local'));
test('监听 storage 配置变化', backgroundJs.includes('chrome.storage.onChanged.addListener'));
test('Recent Tabs 使用可配置域名', backgroundJs.includes('RECENT_TABS_CONFIG_KEY') && backgroundJs.includes('getTrackedDomains'));
test('支持 wildcard 域名匹配', backgroundJs.includes('domainMatches') && backgroundJs.includes('replace(/^\\*\\./'));
test('历史回填使用用户配置域名', backgroundJs.includes('const trackedDomains = await getTrackedDomains()'));
test('更新标签页数量 badge', backgroundJs.includes('chrome.action.setBadgeText'));
test('过滤系统页面', backgroundJs.includes('SYSTEM_URL_PREFIXES') && backgroundJs.includes('ALLOWED_CHROME_PAGES'));

console.log('\n--- app.js 测试 ---\n');

test('初始化 Dashboard', appJs.includes('async function init()') && appJs.includes('renderDashboard'));
test('加载 Open Tabs', appJs.includes('loadOpenTabs'));
test('加载 Closed Tabs', appJs.includes('loadClosedTabs'));
test('加载 Recent Tabs', appJs.includes('loadRecentTabs'));
test('加载 History', appJs.includes('loadHistory'));
test('加载 GitHub Trending', appJs.includes('loadGitHubTrending'));
test('Recent Tabs 可编辑追踪规则', appJs.includes('openRecentFilterModal') && appJs.includes('saveTrackedDomains'));
test('支持搜索', appJs.includes('initSearch') && appJs.includes('searchResults'));
test('支持确认弹窗', appJs.includes('showConfirmDialog') && appJs.includes('hideConfirmDialog'));
test('HTML 转义存在', appJs.includes('function escapeHtml'));

console.log('\n--- style.css 测试 ---\n');

test('包含设计 token', css.includes(':root') && css.includes('--cream'));
test('包含响应式适配', css.includes('@media'));
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

checkSyntax('app.js');
checkSyntax('background.js');
checkSyntax('tabs.js');
checkSyntax('popup.js');

console.log('\n========================================');
console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
console.log('========================================\n');

if (failed > 0) {
  process.exitCode = 1;
}
