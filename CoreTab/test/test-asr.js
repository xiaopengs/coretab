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
  'asr-capture.js',
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

// 伴生程序（免弹窗内录）相关文件
const nativeRoot = path.join(root, 'native');
const nativeFiles = [
  'coretab_audio_host.py',
  'make_manifest.py',
  'install_windows.bat'
];
for (const file of nativeFiles) {
  test(`native/${file} 文件存在`, fs.existsSync(path.join(nativeRoot, file)));
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
test('Provider 以属性方式接入 impl.onResult（修复回调未接通）', providerJs.includes('this.impl.onResult = this.onResult'));
test('Provider 以属性方式接入 impl.onError', providerJs.includes('this.impl.onError = this.onError'));
test('Provider 以属性方式接入 impl.onStatusChange', providerJs.includes('this.impl.onStatusChange = this.onStatusChange'));
test('Provider 支持内录来源 systemMode', providerJs.includes('systemMode'));
test('Provider 向内录引擎透传 captureSystem', providerJs.includes('captureSystem: this.captureSystem'));
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

console.log('\n--- 音频采集（外录 + 内录）测试 ---\n');

const captureJs = fs.readFileSync(path.join(asrRoot, 'asr-capture.js'), 'utf8');

test('ASRCapture 定义 ASRCapture 类', captureJs.includes('class ASRCapture'));
test('ASRCapture 使用 getUserMedia 采集麦克风（外录）', captureJs.includes('getUserMedia'));
test('ASRCapture 使用 getDisplayMedia 采集电脑声音（内录）', captureJs.includes('getDisplayMedia'));
test('ASRCapture 请求共享音频', captureJs.includes('audio: {'));
test('ASRCapture 保留视频轨并监听停止共享', captureJs.includes('getVideoTracks') && captureJs.includes("'ended'"));
test('ASRCapture 使用 AudioContext 混音', captureJs.includes('AudioContext') && captureJs.includes('mixGain'));
test('ASRCapture 同时接入麦克风与内录两路', captureJs.includes('connectSource(this.micStream') && captureJs.includes('connectSource(this.displayStream'));
test('ASRCapture 输出 16k 单声道 PCM 帧回调', captureJs.includes('onframe') && captureJs.includes('createScriptProcessor(CAPTURE_FRAME, 1, 1)'));
test('ASRCapture 未勾选分享音频时给出提示', captureJs.includes('未勾选'));
test('ASRCapture 所有来源都拿不到才抛错', captureJs.includes('!hasWebDriver && !this.nativeActive'));
test('ASRCapture 支持 systemMode 选择内录来源', captureJs.includes('systemMode'));
test('ASRCapture 通过 connectNative 连接伴生程序（免弹窗内录）', captureJs.includes('connectNative'));
test('ASRCapture 定义伴生程序主机名', captureJs.includes('com.coretab.audio_capture'));
test('ASRCapture 用环形缓冲缓存伴生程序音频', captureJs.includes('writeRing') && captureJs.includes('readRingInto'));
test('ASRCapture 把伴生程序音频与麦克风样本级混音', captureJs.includes('emitFrame') && captureJs.includes('nativeActive'));
test('ASRCapture 仅内录时用定时器驱动帧输出', captureJs.includes('pullTimer'));
test('ASRCapture 伴生程序未安装时给出安装引导', captureJs.includes('install_windows.bat'));
test('ASRCapture 导出到 window.ASRCapture', captureJs.includes('window.ASRCapture'));

console.log('\n--- 火山引擎 ASR 测试 ---\n');

const volcengineJs = fs.readFileSync(path.join(asrRoot, 'asr-volcengine.js'), 'utf8');

test('Volcengine ASR 定义 ASRVolcengine 类', volcengineJs.includes('class ASRVolcengine'));
test('Volcengine ASR 使用 WebSocket', volcengineJs.includes('WebSocket'));
test('Volcengine ASR 连接火山引擎端点', volcengineJs.includes('openspeech.bytedance.com'));
test('Volcengine ASR 实现 HMAC-SHA256 签名', volcengineJs.includes('HMAC') && volcengineJs.includes('SHA-256'));
test('Volcengine ASR 通过 ASRCapture 采集音频', volcengineJs.includes('ASRCapture'));
test('Volcengine ASR 支持电脑内录开关', volcengineJs.includes('captureSystem'));
test('Volcengine ASR 实现 PCM 编码', volcengineJs.includes('Int16Array') || volcengineJs.includes('floatTo16BitPCM'));
test('Volcengine ASR 支持流式传输', volcengineJs.includes('onframe'));
test('Volcengine ASR 处理 WebSocket 消息', volcengineJs.includes('onmessage'));
test('Volcengine ASR 实现资源清理', volcengineJs.includes('cleanup'));
test('Volcengine ASR 导出到 window.ASRVolcengine', volcengineJs.includes('window.ASRVolcengine'));

console.log('\n--- 腾讯云 ASR 测试 ---\n');

const tencentJs = fs.readFileSync(path.join(asrRoot, 'asr-tencent.js'), 'utf8');

test('Tencent ASR 定义 ASRTencent 类', tencentJs.includes('class ASRTencent'));
test('Tencent ASR 使用 WebSocket', tencentJs.includes('WebSocket'));
test('Tencent ASR 连接腾讯云端点', tencentJs.includes('asr.cloud.tencent.com'));
test('Tencent ASR 使用 V2 端点', tencentJs.includes('wss://asr.cloud.tencent.com/asr/v2/'));
test('Tencent ASR 通过 ASRCapture 采集音频', tencentJs.includes('ASRCapture'));
test('Tencent ASR 支持电脑内录开关', tencentJs.includes('captureSystem'));
test('Tencent ASR 实现 PCM 编码', tencentJs.includes('Int16Array') || tencentJs.includes('floatTo16BitPCM'));
test('Tencent ASR 使用 HMAC-SHA1 签名', tencentJs.includes('HMAC') && tencentJs.includes('SHA-1'));
test('Tencent ASR 对签名做 base64 编码', tencentJs.includes('btoa'));
test('Tencent ASR 拼接签名原文', tencentJs.includes('asr.cloud.tencent.com/asr/v2/'));
test('Tencent ASR 发送 URL 编码签名', tencentJs.includes('encodeURIComponent'));
test('Tencent ASR 发送裸 PCM 二进制数据', tencentJs.includes('floatTo16BitPCM(inputData).buffer'));
test('Tencent ASR 解析 V2 sentences 结果', tencentJs.includes('sentences'));
test('Tencent ASR 支持说话人分离', tencentJs.includes('speaker_id'));
test('Tencent ASR 发送结束消息', tencentJs.includes("type: 'end'"));
test('Tencent ASR 处理 WebSocket 消息', tencentJs.includes('onmessage'));
test('Tencent ASR 实现资源清理', tencentJs.includes('cleanup'));
test('Tencent ASR 提供连接测试方法', tencentJs.includes('testConnection'));
test('Tencent ASR 导出到 window.ASRTencent', tencentJs.includes('window.ASRTencent'));

console.log('\n--- 阿里云 ASR 测试 ---\n');

const alicloudJs = fs.readFileSync(path.join(asrRoot, 'asr-alicloud.js'), 'utf8');

test('Alicloud ASR 定义 ASRAlicloud 类', alicloudJs.includes('class ASRAlicloud'));
test('Alicloud ASR 使用 WebSocket', alicloudJs.includes('WebSocket'));
test('Alicloud ASR 连接阿里云端点', alicloudJs.includes('nls-gateway'));
test('Alicloud ASR 通过 ASRCapture 采集音频', alicloudJs.includes('ASRCapture'));
test('Alicloud ASR 支持电脑内录开关', alicloudJs.includes('captureSystem'));
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
test('Meetings 实现 ASR 启动方法', meetingsJs.includes('const ASR = {') && meetingsJs.includes('async start()'));
test('Meetings 实现 ASR 停止方法', meetingsJs.includes('state.recognizing'));
test('Meetings 处理 ASR 结果回调', meetingsJs.includes('onResult'));
test('Meetings 处理 ASR 错误回调', meetingsJs.includes('onError'));
test('Meetings 处理 ASR 状态变化', meetingsJs.includes('onStatusChange'));
test('Meetings 添加 ASR 设置按钮', meetingsJs.includes('asr-settings'));
test('Meetings 显示当前 ASR 引擎', meetingsJs.includes('providerName'));
test('Meetings 支持内录开关', meetingsJs.includes('captureSystem'));
test('Meetings 新建会议可勾选电脑内录', meetingsJs.includes('meetingCaptureSystem'));
test('Meetings 会议中可切换内录', meetingsJs.includes('toggleCaptureSystem'));
test('Meetings 处理内录告警回调', meetingsJs.includes('onWarning'));

console.log('\n--- index.html 集成测试 ---\n');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('HTML 加载 asr-provider.js', html.includes('js/asr/asr-provider.js'));
test('HTML 加载 asr-capture.js', html.includes('js/asr/asr-capture.js'));
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
test('manifest 声明 nativeMessaging 权限（伴生程序内录）', Array.isArray(manifest.permissions) && manifest.permissions.includes('nativeMessaging'));

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
