# ASR 云服务接入设计文档

> 版本 1.0 — 2026-09-17

## 1. 背景与目标

CoreTab Meetings 工作台当前使用浏览器内置 Web Speech API 进行实时语音识别。该方案零成本但存在以下限制：

- 仅 Chrome 支持，Firefox/Edge 兼容性有限
- 识别质量依赖 Google 服务端，中文场景准确率有限
- 无法选择专业领域模型（如会议、医疗、法律）
- 无说话人分离能力

本方案引入 **ASR Provider 抽象层**，支持用户自选国产云 ASR 服务商并填入自有 API Key，实现 BYOK（Bring Your Own Key）模式。

## 2. 支持的服务商

| 服务商 | 产品 | 实时识别价格 | 协议 | 优先级 |
|--------|------|-------------|------|--------|
| 浏览器内置 | Web Speech API | 免费 | 浏览器原生 | P0（默认） |
| 火山引擎 | 豆包流式语音识别 2.0 | 1 元/小时 | WebSocket | P1 |
| 腾讯云 | 实时语音识别（大模型 2.0） | 1 元/小时 | WebSocket | P2 |
| 阿里云 | 智能语音交互 | 资源包制 | WebSocket | P3 |

## 3. 架构设计

```
┌─────────────────────────────────────────────┐
│            coretab-meetings.js               │
│  (UI 层 — 不关心具体 ASR 实现)               │
│                                              │
│  startRecognition() ──► ASRProvider.start()  │
│  onResult callback  ◄── ASRProvider.onResult │
│  stopRecognition()  ──► ASRProvider.stop()   │
└──────────────────┬──────────────────────────┘
                   │
     ┌─────────────┼─────────────┬───────────┐
     ▼             ▼             ▼           ▼
┌─────────┐  ┌──────────┐  ┌──────────┐ ┌─────────┐
│ Browser │  │ AliCloud │  │Volcengine│ │ Tencent │
│ Speech  │  │   ISI    │  │  Doubao  │ │  Cloud  │
│   API   │  │(WebSocket)│ │(WebSocket)│ │(WebSocket)│
└─────────┘  └──────────┘  └──────────┘ └─────────┘
```

### 3.1 核心原则

- **零侵入**：现有 UI 逻辑不变，仅替换 ASR 引擎调用
- **BYOK 模式**：用户自行在各平台开通服务并填入凭证
- **优雅降级**：未配置云服务时自动回退到浏览器内置引擎
- **凭证本地存储**：API Key 仅存于 localStorage，不上传任何服务器

## 4. Provider 接口定义

```js
const ASRProviderInterface = {
  // 元数据
  id: string,              // 'browser' | 'alicloud' | 'volcengine' | 'tencent'
  name: string,            // 显示名称
  needsKey: boolean,       // 是否需要 API Key
  keyFields: KeyField[],   // 需要的凭证字段
  models: Model[],         // 可选模型列表

  // 生命周期
  async init(config),      // config = { credentials, model, lang }
  start(),                 // 开始流式识别
  stop(),                  // 停止
  pause(),                 // 暂停
  resume(),                // 恢复

  // 回调注册
  onResult(callback),      // callback({ text, isFinal, timestamp })
  onError(callback),       // callback(error)
  onStatusChange(callback) // callback('connecting'|'listening'|'stopped')
};
```

## 5. 文件结构

```
js/asr/
├── asr-provider.js      # Provider 注册表 + 工厂函数 + 统一接口
├── asr-browser.js       # Web Speech API 封装（默认 Provider）
├── asr-alicloud.js      # 阿里云智能语音交互 WebSocket 接入
├── asr-volcengine.js    # 火山引擎豆包 ASR WebSocket 接入
├── asr-tencent.js       # 腾讯云 ASR WebSocket 接入
└── asr-settings.js      # 设置 UI：服务商选择、Key 填写、模型选择
```

## 6. 存储设计

```js
// localStorage key: coretab_asr_settings_v1
{
  provider: 'volcengine',           // 当前选中的服务商
  model: 'doubao-streaming-2.0',    // 选中的模型 ID
  lang: 'zh-CN',                    // 识别语言
  credentials: {
    alicloud: {
      accessKeyId: '',
      accessKeySecret: '',
      appKey: ''                    // 项目 AppKey
    },
    volcengine: {
      accessKeyId: '',
      secretKey: '',
      appId: ''
    },
    tencent: {
      secretId: '',
      secretKey: ''
    }
  }
}
```

## 7. 音频采集方案

三家云服务均通过 WebSocket 传输 PCM 音频数据，采集流程：

```
getUserMedia({ audio: true })
    │
    ▼
AudioContext (sampleRate: 16000)
    │
    ▼
AudioWorklet / ScriptProcessorNode
    │
    ▼
PCM 16-bit 编码 → WebSocket.send(ArrayBuffer)
```

### 7.1 各服务商 WebSocket 端点

| 服务商 | WebSocket URL | 认证方式 |
|--------|--------------|----------|
| 火山引擎 | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel` | HMAC-SHA256 签名 |
| 腾讯云 | `wss://asr.cloud.tencent.com/asr/v2/` | Token（先 REST 获取） |
| 阿里云 | `wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1` | Token（先 REST 获取） |

### 7.2 签名计算

火山引擎使用 HMAC-SHA256 签名直接认证 WebSocket 连接，可在浏览器中通过 `crypto.subtle.sign()` 完成，无需后端。

腾讯云和阿里云需要先通过 HTTPS REST API 获取临时 Token，再携带 Token 建立 WebSocket 连接。

## 8. 设置 UI 设计

用户进入 Meetings 工作台 → 页面右上角「ASR 设置」按钮 → 弹出 Dialog：

```
┌─────────────────────────────────────────┐
│  ASR 语音识别设置                        │
│                                          │
│  服务商  [● 浏览器内置  ○ 阿里云         │
│           ○ 火山引擎   ○ 腾讯云]         │
│                                          │
│  ── 火山引擎 配置 ──                     │
│  AccessKey ID   [________________]       │
│  Secret Key     [________________]       │
│  App ID         [________________]       │
│                                          │
│  识别模型  [豆包流式语音识别2.0 ▼]       │
│  识别语言  [中文 ▼]                      │
│                                          │
│  💡 如何获取 API Key？                    │
│     → 火山引擎控制台开通语音技术          │
│                                          │
│           [测试连接]  [保存]              │
└─────────────────────────────────────────┘
```

### 8.1 交互细节

- 选择不同服务商时，动态显示对应的凭证输入字段
- 「浏览器内置」无需任何配置，选中即可
- 「测试连接」按钮验证凭证有效性（建立 WebSocket 连接并发送测试帧）
- 保存后即时生效，下次开始会议时使用新 Provider
- 当前会议进行中切换 Provider 需结束当前会议后生效

## 9. coretab-meetings.js 改造

### 9.1 改造范围

仅替换 ASR 相关代码（约 50 行），其余 UI 逻辑完全不变：

```js
// 改造前
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function startRecognition() {
  recognition = new SpeechRecognition();
  recognition.onresult = ...
  recognition.start();
}

// 改造后
let asrProvider = null;

function startRecognition() {
  asrProvider = ASRProvider.create();  // 根据设置创建对应 Provider
  asrProvider.onResult(({ text, isFinal }) => {
    if (isFinal && text) {
      active.transcript.push({ speaker: currentSpeaker, text, timestamp: elapsed });
      renderActive();
    }
  });
  asrProvider.start();
}
```

### 9.2 兼容性保障

- 未配置云服务 → 自动使用浏览器内置引擎（现有行为不变）
- 云服务连接失败 → 自动降级到浏览器内置引擎并提示用户
- 浏览器不支持 Web Speech API 且未配置云服务 → 仅手动输入模式

## 10. manifest.json 更新

需要新增 WebSocket 连接的 host_permissions：

```json
{
  "host_permissions": [
    "https://api.github.com/*",
    "https://www.google.com/*",
    "https://*.gstatic.com/*",
    "wss://openspeech.bytedance.com/*",
    "https://openspeech.bytedance.com/*",
    "wss://asr.cloud.tencent.com/*",
    "https://asr.api.tencentcloud.com/*",
    "wss://nls-gateway.cn-shanghai.aliyuncs.com/*",
    "https://nls-meta.cn-shanghai.aliyuncs.com/*"
  ]
}
```

## 11. 开发计划

| 阶段 | 内容 | 文件 |
|------|------|------|
| Phase 1 | Provider 抽象层 + 浏览器内置封装 | `asr-provider.js`, `asr-browser.js` |
| Phase 2 | 火山引擎接入 | `asr-volcengine.js` |
| Phase 3 | 腾讯云接入 | `asr-tencent.js` |
| Phase 4 | 阿里云接入 | `asr-alicloud.js` |
| Phase 5 | 设置 UI + meetings 改造 | `asr-settings.js`, `coretab-meetings.js` |
| Phase 6 | manifest 更新 + 样式 | `manifest.json`, `workspaces.css` |

## 12. 安全考量

- API Key 仅存储于 localStorage，不跨设备同步
- WebSocket 连接使用 WSS 加密传输
- 音频数据仅在用户主动开始会议时采集，页面关闭即停止
- 不存储音频数据，仅传输至用户选择的 ASR 服务进行实时识别
- 凭证字段使用 `type="password"` 输入框，防止肩窥
