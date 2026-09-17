// ASR 模块自动化测试
// 覆盖 ASR Provider 抽象层、各服务商实现、设置管理

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  ASR 模块测试');
console.log('========================================\n');

const root = path.join(__dirname, '..');
const asrRoot = path.join(root, 'js', 'asr');

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

console.log('--- 文件存在性测试 ---\n');

const asrFiles = [
  'asr-provider.js',
  'asr-browser.js',
  'asr-volcengine.js',
  'asr-tencent.js',
  'asr-alicloud.js',
  'asr-settings.js'
];

for (const file of asrFiles) {
  const filePath = path.join(asrRoot, file);
  test(`${file} 文件存在`, fs.existsSync(filePath));
}

console.log('\n--- ASR Provider 抽象层测试 ---\n');

const providerJs = fs.readFileSync(path.join(asrRoot, 'asr-provider.js'), 'utf8');

test('Provider 定义 ASRProvider 类', providerJs.includes('class ASRProvider'));
test('Provider 实现 init 方法', providerJs.includes('async init()'));
test('Provider 实现 start 方法', providerJs.includes('async start()'));
test('Provider 实现 stop 方法', providerJs.includes('stop()'));
test('Provider 实现 pause 方法', providerJs.includes('pause()'));
test('Provider 实现 resume 方法', providerJs.includes('resume()'));
test('Provider 支持 onResult 回调', providerJs.includes('onResult'));
test('Provider 支持 onError 回调', providerJs.includes('onError'));
test('Provider 支持 onStatusChange 回调', providerJs.includes('onStatusChange'));
test('Provider 导出 getProviders 方法', providerJs.includes('ASRProvider.getProviders'));
test('Provider 导出 create 工厂方法', providerJs.includes('ASRProvider.create'));
test('Provider 支持 browser 引擎', providerJs.includes("'browser'"));
test('Provider 支持 volcengine 引擎', providerJs.includes("'volcengine'"));
test('Provider 支持 tencent 引擎', providerJs.includes("'tencent'"));
test('Provider 支持 alicloud 引擎', providerJs.includes("'alicloud'"));

console.log('\n--- 浏览器内置 ASR 测试 ---\n');

const browserJs = fs.readFileSync(path.join(asrRoot, 'asr-browser.js'), 'utf8');

test('Browser ASR 定义 ASRBrowser 类', browserJs.includes('class ASRBrowser'));
test('Browser ASR 使用 Web Speech API', browserJs.includes('webkitSpeechRecognition') || browserJs.includes('SpeechRecognition'));
test('Browser ASR 实现 init 方法', browserJs.includes('init(config)'));
test('Browser ASR 实现 start 方法', browserJs.includes('start()'));
test('Browser ASR 实现 stop 方法', browserJs.includes('stop()'));
test('Browser ASR 支持 continuous 模式', browserJs.includes('continuous'));
test('Browser ASR 支持 interimResults', browserJs.includes('interimResults'));
test('Browser ASR 处理 onresult 事件', browserJs.includes('onresult'));
test('Browser ASR 处理 onerror 事件', browserJs.includes('onerror'));
test('Browser ASR 处理 onend 事件', browserJs.includes('onend'));
test('Browser ASR 导出到 window.ASRBrowser', browserJs.includes('window.ASRBrowser'));

console.log('\n--- 火山引擎 ASR 测试 ---\n');

const volcengineJs = fs.readFileSync(path.join(asrRoot, 'asr-volcengine.js'), 'utf8');

test('Volcengine ASR 定义 ASRVolcengine 类', volcengineJs.includes('class ASRVolcengine'));
test('Volcengine ASR 使用 WebSocket', volcengineJs.includes('WebSocket'));
test('Volcengine ASR 连接火山引擎端点', volcengineJs.includes('openspeech.bytedance.com'));
test('Volcengine ASR 实现 HMAC-SHA256 签名', volcengineJs.includes('HMAC') && volcengineJs.includes('SHA-256'));
test('Volcengine ASR 使用 AudioContext', volcengineJs.includes('AudioContext'));
test('Volcengine ASR 使用 getUserMedia', volcengineJs.includes('getUserMedia'));
test('Volcengine ASR 实现 PCM 编码', volcengineJs.includes('Int16Array') || volcengineJs.includes('floatTo16BitPCM'));
test('Volcengine ASR 支持流式传输', volcengineJs.includes('onaudioprocess'));
test('Volcengine ASR 处理 WebSocket 消息', volcengineJs.includes('onmessage'));
test('Volcengine ASR 实现资源清理', volcengineJs.includes('cleanup'));
test('Volcengine ASR 导出到 window.ASRVolcengine', volcengineJs.includes('window.ASRVolcengine'));

console.log('\n--- 腾讯云 ASR 测试 ---\n');

const tencentJs = fs.readFileSync(path.join(asrRoot, 'asr-tencent.js'), 'utf8');

test('Tencent ASR 定义 ASRTencent 类', tencentJs.includes('class ASRTencent'));
test('Tencent ASR 使用 WebSocket', tencentJs.includes('WebSocket'));
test('Tencent ASR 连接腾讯云端点', tencentJs.includes('asr.cloud.tencent.com'));
test('Tencent ASR 使用 AudioContext', tencentJs.includes('AudioContext'));
test('Tencent ASR 使用 getUserMedia', tencentJs.includes('getUserMedia'));
test('Tencent ASR 实现 PCM 编码', tencentJs.includes('Int16Array') || tencentJs.includes('floatTo16BitPCM'));
test('Tencent ASR 实现二进制帧封装', tencentJs.includes('DataView') || tencentJs.includes('ArrayBuffer'));
test('Tencent ASR 处理 WebSocket 消息', tencentJs.includes('onmessage'));
test('Tencent ASR 实现资源清理', tencentJs.includes('cleanup'));
test('Tencent ASR 导出到 window.ASRTencent', tencentJs.includes('window.ASRTencent'));

console.log('\n--- 阿里云 ASR 测试 ---\n');

const alicloudJs = fs.readFileSync(path.join(asrRoot, 'asr-alicloud.js'), 'utf8');

test('Alicloud ASR 定义 ASRAlicloud 类', alicloudJs.includes('class ASRAlicloud'));
test('Alicloud ASR 使用 WebSocket', alicloudJs.includes('WebSocket'));
test('Alicloud ASR 连接阿里云端点', alicloudJs.includes('nls-gateway'));
test('Alicloud ASR 使用 AudioContext', alicloudJs.includes('AudioContext'));
test('Alicloud ASR 使用 getUserMedia', alicloudJs.includes('getUserMedia'));
test('Alicloud ASR 实现 PCM 编码', alicloudJs.includes('Int16Array') || alicloudJs.includes('floatTo16BitPCM'));
test('Alicloud ASR 处理 WebSocket 消息', alicloudJs.includes('onmessage'));
test('Alicloud ASR 实现资源清理', alicloudJs.includes('cleanup'));
test('Alicloud ASR 导出到 window.ASRAlicloud', alicloudJs.includes('window.ASRAlicloud'));

console.log('\n--- ASR 设置管理测试 ---\n');

const settingsJs = fs.readFileSync(path.join(asrRoot, 'asr-settings.js'), 'utf8');

test('Settings 定义 ASRSettings 对象', settingsJs.includes('ASRSettings'));
test('Settings 实现 load 方法', settingsJs.includes('load()'));
test('Settings 实现 save 方法', settingsJs.includes('save('));
test('Settings 使用 localStorage', settingsJs.includes('localStorage'));
test('Settings 定义存储键名', settingsJs.includes('coretab_asr_settings'));
test('Settings 实现 openDialog 方法', settingsJs.includes('openDialog'));
test('Settings 渲染服务商选择界面', settingsJs.includes('asr-provider'));
test('Settings 支持凭证输入', settingsJs.includes('asr-field-input'));
test('Settings 支持模型选择', settingsJs.includes('model'));
test('Settings 支持语言选择', settingsJs.includes('lang'));
test('Settings 导出到 window.ASRSettings', settingsJs.includes('window.ASRSettings'));

console.log('\n--- Meetings 集成测试 ---\n');

const meetingsJs = fs.readFileSync(path.join(root, 'js', 'coretab-meetings.js'), 'utf8');

test('Meetings 使用 ASRProvider', meetingsJs.includes('ASRProvider'));
test('Meetings 使用 ASRSettings', meetingsJs.includes('ASRSettings'));
test('Meetings 实现 getASRSettings 方法', meetingsJs.includes('getASRSettings'));
test('Meetings 实现 startRecognition 方法', meetingsJs.includes('startRecognition'));
test('Meetings 实现 stopRecognition 方法', meetingsJs.includes('stopRecognition'));
test('Meetings 处理 ASR 结果回调', meetingsJs.includes('onResult'));
test('Meetings 处理 ASR 错误回调', meetingsJs.includes('onError'));
test('Meetings 处理 ASR 状态变化', meetingsJs.includes('onStatusChange'));
test('Meetings 添加 ASR 设置按钮', meetingsJs.includes('asr-settings'));
test('Meetings 显示当前 ASR 引擎', meetingsJs.includes('providerName'));

console.log('\n--- index.html 集成测试 ---\n');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('HTML 加载 asr-provider.js', html.includes('js/asr/asr-provider.js'));
test('HTML 加载 asr-browser.js', html.includes('js/asr/asr-browser.js'));
test('HTML 加载 asr-volcengine.js', html.includes('js/asr/asr-volcengine.js'));
test('HTML 加载 asr-tencent.js', html.includes('js/asr/asr-tencent.js'));
test('HTML 加载 asr-alicloud.js', html.includes('js/asr/asr-alicloud.js'));
test('HTML 加载 asr-settings.js', html.includes('js/asr/asr-settings.js'));
test('ASR 脚本在 meetings 之前加载', html.indexOf('asr-settings.js') < html.indexOf('coretab-meetings.js'));

console.log('\n--- manifest.json 权限测试 ---\n');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest 包含火山引擎 WebSocket 权限', manifest.host_permissions?.some(p => p.includes('openspeech.bytedance.com')));
test('manifest 包含腾讯云 WebSocket 权限', manifest.host_permissions?.some(p => p.includes('asr.cloud.tencent.com')));
test('manifest 包含阿里云 WebSocket 权限', manifest.host_permissions?.some(p => p.includes('nls-gateway')));
test('manifest 包含阿里云 Token API 权限', manifest.host_permissions?.some(p => p.includes('nls-meta')));

console.log('\n--- 样式测试 ---\n');

const css = fs.readFileSync(path.join(root, 'styles', 'workspaces.css'), 'utf8');

test('CSS 包含 ASR 设置样式', css.includes('.asr-settings'));
test('CSS 包含服务商选择样式', css.includes('.asr-provider'));
test('CSS 包含字段输入样式', css.includes('.asr-field'));
test('CSS 包含帮助信息样式', css.includes('.asr-help'));
test('CSS 包含响应式适配', css.includes('@media') && css.includes('.asr-'));

console.log('\n========================================');
console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
console.log('========================================\n');

if (failed > 0) {
  process.exitCode = 1;
}
