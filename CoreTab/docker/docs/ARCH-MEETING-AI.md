# 架构设计：会议实时 AI 分析引擎

> 版本 1.0 — 2026-09-17  
> 基于 PRD-MEETING-AI.md v1.0

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Meetings 工作台 UI                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 转写面板      │  │ 要点总结面板  │  │ 观点分析面板      │  │
│  │ (现有)        │  │ (新增)        │  │ (新增)            │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
└─────────┼─────────────────┼────────────────────┼─────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              MeetingAnalysisEngine (分析引擎)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 触发控制器    │  │ 增量分析器    │  │ 结果处理器        │  │
│  │ TriggerCtrl  │  │ Incremental  │  │ ResultHandler    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
└─────────┼─────────────────┼────────────────────┼─────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  AIProvider 抽象层                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ DeepSeek │  │  Kimi    │  │  智谱    │  │ 通义/其他 │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块设计

### 2.1 AIProvider 抽象层

与 ASRProvider 保持一致的设计模式，支持多 LLM 服务商。

```javascript
// js/ai/ai-provider.js

class AIProvider {
  constructor(config) {
    this.provider = config.provider;  // 'deepseek' | 'kimi' | 'zhipu' | 'qwen'
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
  }

  // 统一接口：流式聊天补全
  async chat(messages, options = {}) {
    // options: { temperature, maxTokens, stream }
    // 返回: { content, usage: { promptTokens, completionTokens } }
  }

  // 获取服务商元数据
  static getProviders() {
    return [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        keyFields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000 },
          { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 64000 }
        ],
        defaultModel: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1'
      },
      {
        id: 'kimi',
        name: 'Kimi (月之暗面)',
        keyFields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
        models: [
          { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', contextLength: 8000 },
          { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', contextLength: 32000 },
          { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', contextLength: 128000 }
        ],
        defaultModel: 'moonshot-v1-32k',
        baseUrl: 'https://api.moonshot.cn/v1'
      },
      {
        id: 'zhipu',
        name: '智谱 AI',
        keyFields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
        models: [
          { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', contextLength: 128000 },
          { id: 'glm-4', name: 'GLM-4', contextLength: 128000 }
        ],
        defaultModel: 'glm-4-flash',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
      }
    ];
  }

  static create(settings) {
    return new AIProvider(settings);
  }
}
```

### 2.2 MeetingAnalysisEngine 分析引擎

核心控制器，协调触发、分析、结果处理。

```javascript
// js/ai/meeting-analysis-engine.js

class MeetingAnalysisEngine {
  constructor(meeting, aiProvider) {
    this.meeting = meeting;
    this.ai = aiProvider;
    this.triggerCtrl = new TriggerController();
    this.incremental = new IncrementalAnalyzer();
    this.resultHandler = new ResultHandler();
    
    this.isRunning = false;
    this.lastAnalysisIndex = 0;  // 已分析到的转写索引
    this.tokenUsage = { prompt: 0, completion: 0 };
  }

  // 启动分析引擎
  start() {
    this.isRunning = true;
    this.triggerCtrl.onTrigger(() => this.runAnalysis());
    this.triggerCtrl.start();
  }

  // 停止分析引擎
  stop() {
    this.isRunning = false;
    this.triggerCtrl.stop();
  }

  // 执行一次分析
  async runAnalysis() {
    if (!this.isRunning) return;

    // 1. 获取新的转写内容
    const newTranscripts = this.meeting.transcript.slice(this.lastAnalysisIndex);
    if (newTranscripts.length === 0) return;

    // 2. 构建分析上下文
    const context = this.incremental.buildContext({
      meeting: this.meeting,
      newTranscripts,
      previousKeyPoints: this.meeting.analysis?.keyPoints || [],
      windowSize: 10
    });

    // 3. 调用 AI 分析
    try {
      const result = await this.ai.chat(context.messages, {
        temperature: 0.3,
        maxTokens: 2000
      });

      // 4. 解析和存储结果
      const analysis = this.resultHandler.parse(result.content);
      this.meeting.analysis = {
        ...this.meeting.analysis,
        keyPoints: analysis.keyPoints,
        viewpoints: [...(this.meeting.analysis?.viewpoints || []), ...analysis.viewpoints],
        lastAnalysisAt: Date.now()
      };

      // 5. 更新 token 统计
      this.tokenUsage.prompt += result.usage.promptTokens;
      this.tokenUsage.completion += result.usage.completionTokens;

      // 6. 更新分析窗口
      this.lastAnalysisIndex = this.meeting.transcript.length;

      // 7. 触发 UI 更新
      this.emit('analysis-updated', this.meeting.analysis);

    } catch (error) {
      console.error('Analysis failed:', error);
      this.emit('analysis-error', error);
    }
  }

  // 获取 token 使用统计
  getTokenUsage() {
    return this.tokenUsage;
  }

  // 估算费用（按 DeepSeek 价格）
  estimateCost() {
    const promptCost = (this.tokenUsage.prompt / 1_000_000) * 1;  // ¥1/百万token
    const completionCost = (this.tokenUsage.completion / 1_000_000) * 2;  // ¥2/百万token
    return promptCost + completionCost;
  }
}
```

### 2.3 TriggerController 触发控制器

控制分析触发的频率和条件。

```javascript
// js/ai/trigger-controller.js

class TriggerController {
  constructor() {
    this.callbacks = [];
    this.timer = null;
    this.debounceTimer = null;
    
    // 触发条件
    this.minTranscriptCount = 3;  // 最少积累 3 条新转写
    this.maxInterval = 30000;     // 最大间隔 30 秒
    this.debounceDelay = 5000;    // 防抖延迟 5 秒
    
    this.lastTriggerTime = 0;
    this.pendingTranscriptCount = 0;
  }

  // 注册触发回调
  onTrigger(callback) {
    this.callbacks.push(callback);
  }

  // 启动触发器
  start() {
    // 定时检查
    this.timer = setInterval(() => {
      this.checkTrigger();
    }, 5000);  // 每 5 秒检查一次
  }

  // 停止触发器
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  // 通知新的转写到达
  notifyNewTranscript() {
    this.pendingTranscriptCount++;
    
    // 防抖：延迟触发
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.checkTrigger();
    }, this.debounceDelay);
  }

  // 检查是否满足触发条件
  checkTrigger() {
    const now = Date.now();
    const timeSinceLastTrigger = now - this.lastTriggerTime;

    // 条件 1: 积累足够多的新转写
    const hasEnoughTranscripts = this.pendingTranscriptCount >= this.minTranscriptCount;
    
    // 条件 2: 超过最大间隔时间
    const hasExceededInterval = timeSinceLastTrigger >= this.maxInterval;

    if (hasEnoughTranscripts || hasExceededInterval) {
      this.lastTriggerTime = now;
      this.pendingTranscriptCount = 0;
      this.callbacks.forEach(cb => cb());
    }
  }
}
```

### 2.4 IncrementalAnalyzer 增量分析器

构建分析上下文，管理滑动窗口。

```javascript
// js/ai/incremental-analyzer.js

class IncrementalAnalyzer {
  constructor() {
    this.summaryCache = new Map();  // 缓存旧转写的摘要
  }

  // 构建分析上下文
  buildContext({ meeting, newTranscripts, previousKeyPoints, windowSize }) {
    const messages = [];

    // System prompt
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt(meeting)
    });

    // User prompt
    messages.push({
      role: 'user',
      content: this.buildUserPrompt({
        meeting,
        newTranscripts,
        previousKeyPoints,
        windowSize
      })
    });

    return { messages };
  }

  // 构建系统提示词
  buildSystemPrompt(meeting) {
    return `你是一位资深的会议分析顾问，专注于${meeting.meetingType || '评审会'}场景。

你的任务是：
1. 提炼当前会议的关键要点（最多 10 条）
2. 识别重要观点并分析其表面含义、隐含意思
3. 检测观点中的逻辑漏洞
4. 生成应对话术建议

输出格式要求（JSON）：
{
  "keyPoints": [
    {
      "id": "kp_1",
      "content": "要点内容",
      "speaker": "说话人",
      "timestamp": 123456,
      "confidence": 0.9
    }
  ],
  "viewpoints": [
    {
      "id": "vp_1",
      "originalText": "原始发言",
      "speaker": "说话人",
      "timestamp": 123456,
      "surface": "表面含义",
      "hidden": "隐含意思",
      "flaws": [
        {
          "type": "数据矛盾|逻辑跳跃|隐含假设|偷换概念|以偏概全|时间错位",
          "description": "漏洞描述",
          "evidence": "关联证据",
          "suggestion": "建议追问"
        }
      ],
      "responses": [
        {
          "style": "温和追问|数据反驳|转移焦点|共识确认|风险提示",
          "text": "话术内容"
        }
      ]
    }
  ]
}

注意：
- 要点要精炼，抓住核心议题
- 隐含意思要基于合理推断，标注确信度
- 逻辑漏洞要具体，指出与哪些已有信息矛盾
- 话术要自然，适合会议口语场景`;
  }

  // 构建用户提示词
  buildUserPrompt({ meeting, newTranscripts, previousKeyPoints, windowSize }) {
    // 获取最近的转写（滑动窗口）
    const recentTranscripts = meeting.transcript.slice(-windowSize);
    
    // 构建转写文本
    const transcriptText = recentTranscripts.map(t => 
      `[${this.formatTime(t.timestamp)}] ${t.speaker}: ${t.text}`
    ).join('\n');

    // 构建已有要点
    const keyPointsText = previousKeyPoints.length > 0
      ? previousKeyPoints.map(kp => `- ${kp.content}`).join('\n')
      : '暂无';

    return `## 会议信息
- 主题: ${meeting.title}
- 时长: ${this.formatDuration(meeting.duration)}
- 参会人: ${meeting.participants.join(', ')}

## 已有要点
${keyPointsText}

## 最近转写
${transcriptText}

## 新增转写（需要重点分析）
${newTranscripts.map(t => `[${this.formatTime(t.timestamp)}] ${t.speaker}: ${t.text}`).join('\n')}

请基于以上信息，更新要点列表并分析新增转写中的重要观点。`;
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    }
    return `${minutes}分钟`;
  }
}
```

### 2.5 ResultHandler 结果处理器

解析 AI 返回的 JSON，验证和清洗数据。

```javascript
// js/ai/result-handler.js

class ResultHandler {
  // 解析 AI 返回的分析结果
  parse(content) {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // 验证和清洗 keyPoints
      const keyPoints = (data.keyPoints || []).map(kp => ({
        id: kp.id || `kp_${Date.now()}_${Math.random()}`,
        content: String(kp.content || '').trim(),
        speaker: String(kp.speaker || 'Unknown').trim(),
        timestamp: Number(kp.timestamp) || Date.now(),
        confidence: Math.min(1, Math.max(0, Number(kp.confidence) || 0.5)),
        createdAt: Date.now()
      })).filter(kp => kp.content.length > 0);

      // 验证和清洗 viewpoints
      const viewpoints = (data.viewpoints || []).map(vp => ({
        id: vp.id || `vp_${Date.now()}_${Math.random()}`,
        originalText: String(vp.originalText || '').trim(),
        speaker: String(vp.speaker || 'Unknown').trim(),
        timestamp: Number(vp.timestamp) || Date.now(),
        surface: String(vp.surface || '').trim(),
        hidden: String(vp.hidden || '').trim(),
        flaws: (vp.flaws || []).map(f => ({
          type: this.validateFlawType(f.type),
          description: String(f.description || '').trim(),
          evidence: String(f.evidence || '').trim(),
          suggestion: String(f.suggestion || '').trim()
        })).filter(f => f.description.length > 0),
        responses: (vp.responses || []).map(r => ({
          style: this.validateResponseStyle(r.style),
          text: String(r.text || '').trim()
        })).filter(r => r.text.length > 0),
        feedback: null,
        createdAt: Date.now()
      })).filter(vp => vp.originalText.length > 0);

      return { keyPoints, viewpoints };

    } catch (error) {
      console.error('Failed to parse analysis result:', error);
      return { keyPoints: [], viewpoints: [] };
    }
  }

  validateFlawType(type) {
    const validTypes = ['数据矛盾', '逻辑跳跃', '隐含假设', '偷换概念', '以偏概全', '时间错位'];
    return validTypes.includes(type) ? type : '逻辑跳跃';
  }

  validateResponseStyle(style) {
    const validStyles = ['温和追问', '数据反驳', '转移焦点', '共识确认', '风险提示'];
    return validStyles.includes(style) ? style : '温和追问';
  }
}
```

---

## 3. 数据流设计

### 3.1 分析触发流程

```
ASR 转写完成
    ↓
coretab-meetings.js 接收转写
    ↓
调用 triggerCtrl.notifyNewTranscript()
    ↓
TriggerController 检查触发条件
    ├─ 积累 >= 3 条新转写？
    └─ 或距离上次分析 >= 30 秒？
    ↓
满足条件 → 触发 onTrigger 回调
    ↓
MeetingAnalysisEngine.runAnalysis()
    ↓
IncrementalAnalyzer.buildContext()
    ├─ 获取最近 10 条转写（滑动窗口）
    ├─ 构建 system prompt
    └─ 构建 user prompt
    ↓
AIProvider.chat(messages)
    ↓
ResultHandler.parse(response)
    ├─ 提取 JSON
    ├─ 验证 keyPoints
    └─ 验证 viewpoints
    ↓
更新 meeting.analysis
    ↓
触发 UI 更新事件
```

### 3.2 数据存储结构

```javascript
// localStorage: coretab_meetings_v1
{
  "id": "meeting_123",
  "title": "产品评审会",
  "meetingType": "review",  // 新增：会议类型
  "participants": ["张三", "李四"],
  "transcript": [...],
  "summary": [...],
  "keyPoints": [...],
  "actionItems": [...],
  
  // 新增：AI 分析结果
  "analysis": {
    "keyPoints": [
      {
        "id": "kp_1",
        "content": "Q3 上线时间可能延迟 2 周",
        "speaker": "张明",
        "timestamp": 123456,
        "confidence": 0.9,
        "createdAt": 1695000000000
      }
    ],
    "viewpoints": [
      {
        "id": "vp_1",
        "originalText": "这个功能两周内就能做完",
        "speaker": "张明",
        "timestamp": 123456,
        "surface": "承诺两周内完成功能开发",
        "hidden": "可能在低估复杂度以争取项目通过",
        "flaws": [
          {
            "type": "数据矛盾",
            "description": "与上次会议提到的需要一个月矛盾",
            "evidence": "[08/15 14:32 张明: 这个功能至少需要一个月]",
            "suggestion": "时间从4周缩短到2周，是技术方案有变化还是范围有调整？"
          }
        ],
        "responses": [
          {
            "style": "温和追问",
            "text": "两周开发可以，但我们需要明确联调和测试的时间安排，能否拆解一下里程碑？"
          }
        ],
        "feedback": null,
        "createdAt": 1695000000000
      }
    ],
    "lastAnalysisAt": 1695000000000,
    "analysisWindow": 10
  }
}

// localStorage: coretab_ai_settings_v1
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "apiKey": "sk-xxx",
  "baseUrl": "",
  "temperature": 0.3,
  "maxTokens": 2000,
  "analysisInterval": 30,
  "windowSize": 10,
  "enabled": true
}
```

---

## 4. UI 交互设计

### 4.1 布局调整

Meetings 工作台从两列布局改为三列布局：

```
┌─────────────────────────────────────────────────────────────┐
│  会议标题                          [ASR设置] [AI设置] [新建] │
├──────────────────┬──────────────────┬───────────────────────┤
│   实时转写        │   要点总结        │    观点分析            │
│   (现有)          │   (新增)          │    (新增)             │
│                  │                  │                       │
│  [说话人输入]     │  1. Q3上线延迟2周 │  [当前观点]            │
│  [转写输入]       │  2. 增加导出功能  │  张明: "两周内做完"    │
│                  │  3. 安全性质疑    │                       │
│  转写列表...      │                  │  表面: 承诺两周完成    │
│                  │  [上次更新: 12:34] │  隐含: 可能低估复杂度  │
│                  │                  │                       │
│                  │                  │  漏洞:                 │
│                  │                  │  ⚠️ 与上次说法矛盾     │
│                  │                  │                       │
│                  │                  │  话术:                 │
│                  │                  │  💬 能否拆解里程碑？    │
└──────────────────┴──────────────────┴───────────────────────┘
```

### 4.2 AI 设置对话框

```
┌─────────────────────────────────────────┐
│  AI 分析设置                              │
├─────────────────────────────────────────┤
│  服务商  [DeepSeek ▼]                    │
│  API Key [sk-xxxxxxxxxxxxxxxx]           │
│  模型    [DeepSeek Chat ▼]               │
│                                         │
│  分析参数                                │
│  ├─ 分析间隔: [30] 秒                    │
│  ├─ 滑动窗口: [10] 条                    │
│  ├─ 温度: [0.3]                          │
│  └─ 最大 Token: [2000]                   │
│                                         │
│  会议类型                                │
│  [● 评审会  ○ 谈判  ○ 脑暴  ○ 周会]      │
│                                         │
│  Token 使用                              │
│  ├─ 本次已用: 1,234 tokens               │
│  ├─ 预估费用: ¥0.003                     │
│  └─ 上限: [50000] tokens                 │
│                                         │
│  [测试连接]              [保存] [取消]    │
└─────────────────────────────────────────┘
```

### 4.3 观点分析卡片交互

```
┌─────────────────────────────────────────┐
│  🔍 观点分析                              │
├─────────────────────────────────────────┤
│  观点: "这个功能两周内就能做完"            │
│  说话人: 张明 · 12:35                     │
│                                         │
│  ── 表面含义 ──                          │
│  承诺两周内完成功能开发                    │
│                                         │
│  ── 隐含意思 ──                          │
│  • 可能在低估复杂度以争取项目通过          │
│  • 未提及测试和联调时间                   │
│                                         │
│  ── 逻辑漏洞 ──                          │
│  ⚠️ 数据矛盾                             │
│     与上次会议提到的需要一个月矛盾         │
│     [展开证据]                           │
│                                         │
│  ── 应对话术 ──                          │
│  💬 温和追问                             │
│     "两周开发可以，但我们需要明确联调      │
│      和测试的时间安排，能否拆解一下里程     │
│      碑？"                    [复制]     │
│                                         │
│  💬 数据反驳                             │
│     "上次提到需要一个月，是什么因素让      │
│      时间缩短了？我们可以对齐一下。"       │
│                             [复制]      │
│                                         │
│  [有用 👍] [有误 👎] [忽略 ✕]            │
└─────────────────────────────────────────┘
```

---

## 5. 文件结构

```
js/
├── ai/
│   ├── ai-provider.js              # AI Provider 抽象层
│   ├── ai-deepseek.js              # DeepSeek 实现
│   ├── ai-kimi.js                  # Kimi 实现
│   ├── ai-zhipu.js                 # 智谱实现
│   ├── ai-settings.js              # AI 设置管理
│   ├── meeting-analysis-engine.js  # 分析引擎主控制器
│   ├── trigger-controller.js       # 触发控制器
│   ├── incremental-analyzer.js     # 增量分析器
│   └── result-handler.js           # 结果处理器
├── coretab-meetings.js             # 修改：集成 AI 分析
└── ...

styles/
└── workspaces.css                  # 修改：新增 AI 面板样式

index.html                          # 修改：加载 AI 模块

manifest.json                       # 修改：添加 LLM API 权限
```

---

## 6. 关键算法

### 6.1 增量分析上下文构建

```javascript
// 问题：如何在不超出 context window 的前提下提供足够的上下文？

// 解决方案：滑动窗口 + 旧内容摘要

buildContext(meeting, newTranscripts) {
  const windowSize = 10;
  const recentTranscripts = meeting.transcript.slice(-windowSize);
  
  // 如果有旧转写，生成摘要
  if (meeting.transcript.length > windowSize) {
    const oldTranscripts = meeting.transcript.slice(0, -windowSize);
    const summary = this.getCachedSummary(oldTranscripts);
    
    return {
      summary,  // 旧内容的摘要
      recent: recentTranscripts,  // 最近的完整转写
      new: newTranscripts  // 新增的转写
    };
  }
  
  return {
    recent: recentTranscripts,
    new: newTranscripts
  };
}
```

### 6.2 要点去重和合并

```javascript
// 问题：AI 可能返回与已有要点重复的内容

// 解决方案：基于语义相似度去重

mergeKeyPoints(existing, newPoints) {
  const merged = [...existing];
  
  for (const newPoint of newPoints) {
    const similar = merged.find(ep => 
      this.calculateSimilarity(ep.content, newPoint.content) > 0.8
    );
    
    if (similar) {
      // 更新已有要点的置信度
      similar.confidence = (similar.confidence + newPoint.confidence) / 2;
      similar.updatedAt = Date.now();
    } else {
      // 添加新要点
      merged.push(newPoint);
    }
  }
  
  // 保持最多 10 条要点
  return merged
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

calculateSimilarity(text1, text2) {
  // 简单的 Jaccard 相似度
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  return intersection.length / union.size;
}
```

---

## 7. 集成方案

### 7.1 coretab-meetings.js 修改

```javascript
// 新增：AI 分析引擎实例
let analysisEngine = null;

// 修改：startRecognition 中启动 AI 分析
async function startRecognition() {
  // ... 现有 ASR 启动逻辑 ...
  
  // 新增：启动 AI 分析
  const aiSettings = getAISettings();
  if (aiSettings.enabled && aiSettings.apiKey) {
    const aiProvider = AIProvider.create(aiSettings);
    analysisEngine = new MeetingAnalysisEngine(active, aiProvider);
    analysisEngine.start();
    analysisEngine.on('analysis-updated', (analysis) => {
      renderAnalysisPanels(analysis);
    });
  }
}

// 修改：stopRecognition 中停止 AI 分析
function stopRecognition() {
  // ... 现有 ASR 停止逻辑 ...
  
  // 新增：停止 AI 分析
  if (analysisEngine) {
    analysisEngine.stop();
    analysisEngine = null;
  }
}

// 新增：渲染分析面板
function renderAnalysisPanels(analysis) {
  renderKeyPoints(analysis.keyPoints);
  renderViewpointAnalysis(analysis.viewpoints);
}

// 修改：导出时包含 AI 分析结果
function exportTXT(m) {
  // ... 现有导出逻辑 ...
  
  // 新增：添加 AI 分析结果
  if (m.analysis) {
    lines.push('═══ AI 要点总结 ═══');
    m.analysis.keyPoints.forEach(kp => {
      lines.push(`• ${kp.content} (${kp.speaker})`);
    });
    lines.push('');
    
    if (m.analysis.viewpoints.length > 0) {
      lines.push('═══ AI 观点分析 ═══');
      m.analysis.viewpoints.forEach(vp => {
        lines.push(`观点: ${vp.originalText} (${vp.speaker})`);
        lines.push(`  表面: ${vp.surface}`);
        lines.push(`  隐含: ${vp.hidden}`);
        if (vp.flaws.length > 0) {
          lines.push(`  漏洞:`);
          vp.flaws.forEach(f => {
            lines.push(`    ⚠️ ${f.type}: ${f.description}`);
          });
        }
        if (vp.responses.length > 0) {
          lines.push(`  话术:`);
          vp.responses.forEach(r => {
            lines.push(`    💬 ${r.style}: ${r.text}`);
          });
        }
        lines.push('');
      });
    }
  }
  
  return lines.join('\n');
}
```

### 7.2 index.html 修改

```html
<!-- 在 coretab-meetings.js 之前加载 AI 模块 -->
<script src="js/ai/ai-provider.js"></script>
<script src="js/ai/ai-deepseek.js"></script>
<script src="js/ai/ai-kimi.js"></script>
<script src="js/ai/ai-zhipu.js"></script>
<script src="js/ai/ai-settings.js"></script>
<script src="js/ai/meeting-analysis-engine.js"></script>
<script src="js/ai/trigger-controller.js"></script>
<script src="js/ai/incremental-analyzer.js"></script>
<script src="js/ai/result-handler.js"></script>
<script src="js/coretab-meetings.js"></script>
```

### 7.3 manifest.json 修改

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
    "https://nls-meta.cn-shanghai.aliyuncs.com/*",
    "https://api.deepseek.com/*",
    "https://api.moonshot.cn/*",
    "https://open.bigmodel.cn/*"
  ]
}
```

---

## 8. 性能优化

### 8.1 减少 API 调用

- **防抖控制**：5 秒内多次转写只触发一次分析
- **批量处理**：积累 3-5 条转写后再分析
- **时间间隔**：最长 30 秒触发一次
- **滑动窗口**：只发送最近 10 条转写

### 8.2 降低 Token 消耗

- **增量摘要**：旧转写压缩为摘要
- **要点去重**：避免重复分析相同内容
- **精简 Prompt**：系统提示词控制在 500 token 内

### 8.3 异步非阻塞

- **Web Worker**：将 JSON 解析和验证放到 Worker 中
- **流式输出**：如果 API 支持 SSE，逐步展示分析结果
- **延迟渲染**：分析结果到达后分批渲染到 UI

---

## 9. 错误处理

### 9.1 API 调用失败

```javascript
async runAnalysis() {
  try {
    const result = await this.ai.chat(messages);
    // 处理结果...
  } catch (error) {
    if (error.code === 'rate_limit') {
      // 限流：延迟重试
      setTimeout(() => this.runAnalysis(), 60000);
    } else if (error.code === 'invalid_api_key') {
      // API Key 无效：提示用户
      showToast('AI API Key 无效，请在设置中更新');
    } else {
      // 其他错误：静默失败
      console.error('Analysis failed:', error);
    }
  }
}
```

### 9.2 JSON 解析失败

```javascript
parse(content) {
  try {
    const data = JSON.parse(content);
    return this.validate(data);
  } catch (error) {
    // 尝试提取 JSON 片段
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // 完全失败：返回空结果
        return { keyPoints: [], viewpoints: [] };
      }
    }
  }
}
```

---

## 10. 测试策略

### 10.1 单元测试

- AIProvider 接口兼容性测试
- TriggerController 触发逻辑测试
- IncrementalAnalyzer 上下文构建测试
- ResultHandler JSON 解析测试

### 10.2 集成测试

- 端到端分析流程测试
- UI 渲染正确性测试
- 导出功能包含 AI 结果测试

### 10.3 性能测试

- API 调用频率控制测试
- Token 消耗统计测试
- 大量转写下的内存泄漏测试

---

## 11. 后续扩展

### 11.1 会议类型扩展

```javascript
const meetingTypes = {
  review: {
    name: '评审会',
    systemPrompt: '你是一位资深评审专家...'
  },
  negotiation: {
    name: '谈判',
    systemPrompt: '你是一位谈判策略顾问...'
  },
  brainstorm: {
    name: '脑暴',
    systemPrompt: '你是一位创意引导师...'
  },
  weekly: {
    name: '周会',
    systemPrompt: '你是一位项目管理专家...'
  }
};
```

### 11.2 说话人分离集成

```javascript
// 如果 ASR 支持说话人分离
if (transcript.speakerId) {
  // 使用 speakerId 追踪不同说话人的观点
  this.speakerProfiles[transcript.speakerId] = {
    name: transcript.speaker,
    viewpoints: [],
    stance: this.analyzeStance(transcript.text)
  };
}
```

### 11.3 自定义分析 Prompt

```javascript
// 允许高级用户自定义分析 Prompt
const customPrompt = userSettings.customAnalysisPrompt;
if (customPrompt) {
  systemPrompt = customPrompt.replace('{{meeting_type}}', meeting.meetingType);
}
```

---

*架构设计完成，下一步：交互设计 → 开发实现*
