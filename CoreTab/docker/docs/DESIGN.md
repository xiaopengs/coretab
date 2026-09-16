# CoreTab 设计文档

> 本文档基于 v2.4.0 源码的深入分析，记录架构决策、模块职责、数据流和关键实现细节。

---

## 1. 架构总览

### 1.1 运行时模型

CoreTab 是一个 Chrome Extension Manifest V3 扩展，由三个运行时上下文组成：

```
┌────────────────────────────────────────────────────────────────┐
│  Service Worker (background.js)                                │
│  生命周期：随浏览器启停，无 DOM，无 localStorage                 │
│  职责：Badge 计数、Recent Tabs 后台追踪、历史回填               │
├────────────────────────────────────────────────────────────────┤
│  Extension Page (index.html + 14 个 JS 模块)                   │
│  生命周期：每次打开新标签页时加载                                │
│  职责：三工作台 UI、所有用户交互                                 │
├────────────────────────────────────────────────────────────────┤
│  Storage (chrome.storage.local + localStorage)                 │
│  chrome.storage.local：跨上下文持久化（SW 和 Page 共享）         │
│  localStorage：页面级会话状态（仅 Extension Page 可用）          │
└────────────────────────────────────────────────────────────────┘
```

**为什么 Service Worker 和 Extension Page 各有一份 Recent Tabs 逻辑？**

MV3 的 Service Worker 没有 `localStorage`，也没有 DOM。它需要在后台追踪用户访问的 URL（通过 `chrome.tabs.onUpdated`），而页面端需要在 UI 中展示和操控这些数据。两端通过 `chrome.storage.local` 共享数据，但各自维护了独立的串行队列（`enqueueRecent`）来保护并发写入。

### 1.2 脚本加载顺序

```html
<!-- index.html 中的脚本加载顺序（严格依赖关系） -->
<script src="js/coretab-favicon-cache.js"></script>  <!-- 1. 无依赖 -->
<script src="js/coretab-config.js"></script>          <!-- 2. 无依赖 -->
<script src="js/coretab-events.js"></script>           <!-- 3. 依赖 data, actions, ui -->
<script src="js/coretab-actions.js"></script>          <!-- 4. 依赖 data, ui -->
<script src="js/coretab-data.js"></script>             <!-- 5. 依赖 config, favicon, recent -->
<script src="js/coretab-utils.js"></script>            <!-- 6. 无依赖 -->
<script src="js/coretab-render-tabs.js"></script>      <!-- 7. 依赖 data, favicon -->
<script src="js/coretab-recent.js"></script>           <!-- 8. 依赖 config -->
<script src="js/coretab-quick-nav.js"></script>        <!-- 9. 无依赖 -->
<script src="js/coretab-ui.js"></script>               <!-- 10. 依赖 data, render -->
<script src="js/coretab-main.js"></script>             <!-- 11. 入口：调用所有模块 -->
<script src="js/coretab-workspaces.js"></script>       <!-- 12. IIFE，暴露 CoreTabWorkspace -->
<script src="js/coretab-prompts.js"></script>          <!-- 13. 依赖 CoreTabWorkspace -->
<script src="js/coretab-meetings.js"></script>         <!-- 14. 依赖 CoreTabWorkspace -->
```

**关键约束**：所有 `coretab-*` 模块使用经典脚本（非 ES Module），函数声明在全局作用域。`coretab-workspaces.js` 之后的模块通过 `window.CoreTabWorkspace` 访问共享能力，与前面的 Tabs 模块完全隔离。

### 1.3 三工作台导航

```javascript
// coretab-workspaces.js — 导航核心
function route() {
  const target = location.hash.slice(1);          // #tabs | #prompts | #meetings
  const next = ['prompts', 'meetings'].includes(target) ? target : 'tabs';

  positions[active] = window.scrollY;             // 保存当前滚动位置
  active = next;

  document.body.dataset.workspace = next;         // CSS 选择器钩子
  // 隐藏/显示面板（hidden 属性，不销毁 DOM）
  document.querySelectorAll('[data-workspace-panel]').forEach(panel => {
    panel.hidden = panel.dataset.workspacePanel !== next;
  });
  // 更新导航高亮、搜索框 placeholder、页面标题
  // 派发自定义事件 coretab:workspace → 触发懒加载
  window.dispatchEvent(new CustomEvent('coretab:workspace', { detail: next }));
}
```

**设计要点**：

- 面板使用 `hidden` 属性切换，不销毁 DOM → 保留滚动位置、表单草稿、筛选状态
- `hashchange` 事件驱动 → 支持浏览器前进/后退
- `coretab:workspace` 自定义事件 → 各工作台监听并懒加载
- 每个工作台维护独立搜索关键词 → 切换时恢复

---

## 2. 模块详解

### 2.1 CoreTabWorkspace — 共享基础设施

`coretab-workspaces.js` 是一个 IIFE，暴露 `window.CoreTabWorkspace` 对象，为 Prompts 和 Meetings 提供：

| 方法 | 职责 |
|------|------|
| `icon(name)` | SVG 图标渲染，内联 30+ 个路径定义 |
| `escape(value)` | HTML 转义，防止 XSS |
| `read(key, initial, validate)` | 从 localStorage 读取并校验数据 |
| `save(key, data)` | 写入 localStorage，失败时显示 Toast |
| `copy(text)` | 剪贴板写入，失败时降级提示 |
| `openDialog(content, onClose)` | 模态对话框管理（`<dialog>` 元素） |
| `setSearch(workspace, query)` | 同步搜索关键词到对应工作台 |

**`escape()` 函数的故事**

在 v2.4.0 之前的版本中，`coretab-workspaces.js` 的 `escape()` 函数引用了一个未定义的 `escapeHtml` 全局函数。这个函数定义在 `coretab-ui.js` 中，但 `coretab-ui.js` 在 `coretab-workspaces.js` 之后加载。修复方案是将转义逻辑内联：

```javascript
const escape = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
```

### 2.2 Prompts — 提示词库

`coretab-prompts.js`（~189 行）实现了一个完整的 CRUD 应用：

**数据模型**：
```javascript
{
  id: string,              // crypto.randomUUID()
  title: string,           // 提示词名称
  description: string,     // 简短描述
  content: string,         // 提示词正文（支持 {{变量}} 语法）
  category: string,        // 分类：技术/产品/编程/图片/写作/学习/其他
  tags: string[],          // 标签数组
  model: string,           // 适用模型名称（元数据，不调用 API）
  favorite: boolean,       // 收藏状态
  usageCount: number,      // 使用次数（每次复制 +1）
  deleted: boolean,        // 软删除标记
  createdAt: number,       // 创建时间戳
  updatedAt: number,       // 更新时间戳
  lastUsedAt: number       // 最后使用时间戳
}
```

**存储**：`localStorage['coretab_prompts_v1']`，JSON 序列化。

**变量替换**：
```javascript
// 正则匹配 {{变量名}}，提取所有唯一变量名
const names = [...new Set([...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m => m[1]))];
// 渲染变量输入框 → 实时预览替换结果
document.getElementById('promptPreview').textContent =
  content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => values[name] || match);
```

**筛选管线**：
```
全量数据 → 分类过滤 → 模型筛选 → 标签筛选 → 关键词搜索 → 排序 → 分页（每页 6 条）
```

**预置模板**：首次加载时提供 6 个模板（架构分析、角色设定、商业分析、汇报优化、代码开发、学习笔记），帮助用户快速上手。

### 2.3 Meetings — 会议记录

`coretab-meetings.js`（~506 行）是最复杂的模块，集成了 Web Speech API：

**数据模型**：
```javascript
{
  id: string,              // crypto.randomUUID()
  title: string,           // 会议名称
  status: string,          // 'active' | 'ended'
  participants: string[],  // 参与人列表
  transcript: [{           // 转写记录
    speaker: string,       // 说话人
    text: string,          // 转写文本
    timestamp: number      // 相对时间（毫秒）
  }],
  summary: string[],       // 摘要条目
  keyPoints: string[],     // 关键结论
  actionItems: [{          // 行动项
    content: string,       // 内容
    completed: boolean     // 完成状态
  }],
  createdAt: number,       // 创建时间戳
  updatedAt: number,       // 更新时间戳
  duration: number         // 会议时长（毫秒）
}
```

**Web Speech API 集成**：
```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';           // 中文识别
  recognition.continuous = true;        // 持续识别
  recognition.interimResults = true;    // 中间结果（实时显示）

  recognition.onresult = (e) => {
    // 只处理 final 结果
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        active.transcript.push({
          speaker: currentSpeaker,
          text: e.results[i][0].transcript.trim(),
          timestamp: elapsed
        });
      }
    }
  };

  recognition.onend = () => {
    // 自动重连：如果会议仍在录音中，重新启动识别
    if (recognizing && active && !pausedAt) {
      try { recognition.start(); } catch { stopRecognition(); }
    }
  };
}
```

**暂停/恢复机制**：
```javascript
// 暂停：记录暂停时间戳，停止计时器和语音识别
pausedAt = Date.now();
stopRecognition();

// 恢复：计算暂停时长，调整计时器起点，重新启动语音识别
elapsed += Date.now() - pausedAt;  // 注意：这里实际是补偿暂停期间的偏移
pausedAt = null;
startRecognition();
```

**导出系统**：
```javascript
function exportTXT(m) { /* 纯文本格式，═══ 分隔符 */ }
function exportMarkdown(m) { /* Markdown 格式，## 标题 */ }
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);  // 延迟释放，确保下载开始
}
```

**内存泄漏修复**：`endMeeting()` 必须调用 `stopRecognition()`，否则 `SpeechRecognition` 对象会持续持有麦克风引用，即使会议已结束。

### 2.4 Background Service Worker

`background.js`（~330 行）在后台运行，无 DOM：

**Badge 更新**：
```javascript
async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const count = tabs.filter(t => !isSystemUrl(t.url)).length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

  // 颜色编码：绿(1-10) → 黄(11-20) → 红(21+)
  const color = count <= 10 ? '#10b981' : count <= 20 ? '#f59e0b' : '#ef4444';
  await chrome.action.setBadgeBackgroundColor({ color });
}
```

**Recent Tabs 追踪**：
```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.title) {
    // 60 秒去重窗口：同一 URL 在短时间内只记录一次
    if (!shouldSkipRecentWrite(tab.url)) {
      void addRecentTab(tab.url, tab.title);
    }
  }
});
```

**串行队列**（防止并发写入竞态）：
```javascript
let _recentQueue = Promise.resolve();
function enqueueRecent(fn) {
  const next = _recentQueue.then(fn, fn);   // 成功和失败都继续
  _recentQueue = next.catch(() => {});       // 队列本身不中断
  return next;
}
```

**历史回填**：首次安装时，从 `chrome.history` API 导入过去 7 天的浏览记录到 Recent Tabs，按域名过滤。使用 `coretab_recent_backfill_state` 键记录已回填的域名，避免重复执行。

### 2.5 Tabs 工作台

Tabs 工作台由多个模块协作完成：

| 模块 | 行数 | 职责 |
|------|------|------|
| `coretab-data.js` | ~350 | 数据加载：Open/Closed/Recent/History/Trending |
| `coretab-render-tabs.js` | ~400 | DOM 渲染：标签页列表、分组、日期标签 |
| `coretab-actions.js` | ~350 | 用户操作：关闭、还原、保存、导入导出 |
| `coretab-events.js` | ~280 | 事件绑定：点击委托、键盘快捷键 |
| `coretab-ui.js` | ~220 | 通用 UI：搜索、Toast、确认对话框 |
| `coretab-recent.js` | ~250 | Recent Tabs 页面端逻辑 |
| `coretab-config.js` | ~110 | 配置管理、域名追踪 |
| `coretab-favicon-cache.js` | ~220 | Favicon LRU 缓存 |
| `coretab-quick-nav.js` | ~260 | 快速导航链接管理 |

**数据流**：
```
chrome.tabs.query() ──→ loadOpenTabs() ──→ renderOpenTabs() ──→ DOM
                                            ↑
chrome.storage.local ──→ loadClosedTabs() ─┘
                                            ↑
chrome.storage.local ──→ loadRecentTabs() ─┘
                                            ↑
chrome.history ──→ loadHistory() ──────────┘
                                            ↑
fetch(github API) ──→ loadGitHubTrending() ┘
```

**Closed Tabs 去重**：
```javascript
// addClosedTab 写入前查找已有的 (date, host, url) 三元组
const existing = group.tabs.findIndex(t => t.url === tab.url);
if (existing !== -1) {
  // 重复关闭同一 URL：只刷新 closedAt 并移到头部
  group.tabs.splice(existing, 1);
}
group.tabs.unshift(newEntry);
```

**DST 夏令时修复**：
```javascript
// formatClosedDateLabel 的日期差计算改用 Date.UTC
// 避免 DST 切换当天（23h/25h）标签算错一天
const dayDiff = Math.floor(
  (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
   Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())) / 86400000
);
```

**双写存储同步**：
```javascript
// restoreClosedTabsFromStorage：localStorage 和 chrome.storage.local 双向同步
// 比较两侧条目数，取较大集合写回较小的一侧
const local = JSON.parse(localStorage.getItem(key) || '[]');
const result = await chrome.storage.local.get(key);
const synced = result[key] || [];
if (local.length > synced.length) {
  await chrome.storage.local.set({ [key]: local });
} else if (synced.length > local.length) {
  localStorage.setItem(key, JSON.stringify(synced));
}
```

---

## 3. 存储架构

### 3.1 存储分层

| 存储 | 容量 | 可见性 | 用途 |
|------|------|--------|------|
| `chrome.storage.local` | 10MB | SW + Page | Closed Tabs、Recent Tabs、配置 |
| `localStorage` | 5MB | 仅 Page | Prompts、Meetings、会话状态 |

**为什么 Prompts 和 Meetings 用 localStorage 而不是 chrome.storage.local？**

Prompts 和 Meetings 的数据只在 Extension Page 中使用，不需要 Service Worker 访问。使用 `localStorage` 更简单，且避免了 `chrome.storage.local` 的异步开销。

### 3.2 数据键清单

| 键名 | 存储位置 | 数据类型 | 过期策略 |
|------|---------|---------|---------|
| `coretab_closed_tabs` | 双写 | JSON 数组 | 60 天 |
| `coretab_recent_tabs` | chrome.storage.local | JSON 数组 | 30 天 |
| `coretab_recent_config` | chrome.storage.local | JSON 数组 | 无 |
| `coretab_recent_backfill_state` | chrome.storage.local | JSON 数组 | 无 |
| `coretab_prompts_v1` | localStorage | JSON 数组 | 无 |
| `coretab_meetings_v1` | localStorage | JSON 数组 | 无 |
| `coretab_favicon_cache` | localStorage | JSON 对象 | LRU 500 条 |
| `coretab_quick_nav` | localStorage | JSON 数组 | 无 |
| `coretab_github_trending` | localStorage | JSON + 时间戳 | 24 小时 |

### 3.3 数据验证

每个模块在读取存储数据时都进行结构验证：

```javascript
// Prompts 数据验证
function valid(p) {
  return p && ['id', 'title', 'description', 'content', 'model', 'category']
    .every(k => typeof p[k] === 'string') &&
    Array.isArray(p.tags) && p.tags.every(t => typeof t === 'string') &&
    typeof p.favorite === 'boolean' &&
    ['usageCount', 'createdAt', 'updatedAt', 'lastUsedAt']
    .every(k => Number.isFinite(p[k]) && p[k] >= 0);
}

// 验证失败时回退到默认值
function load() {
  return W.read(KEY, templates, valid);  // templates 是预置模板
}
```

---

## 4. 性能设计

### 4.1 并发控制

**问题**：多个 `addRecentTab` 并发执行时，read-modify-write 操作会丢失更新。

**解决方案**：串行 Promise 队列

```javascript
let _recentQueue = Promise.resolve();

function enqueueRecent(fn) {
  const next = _recentQueue.then(fn, fn);   // 前一个成功或失败都继续
  _recentQueue = next.catch(() => {});       // 队列链本身永不中断
  return next;
}
```

这个模式在 `coretab-recent.js` 和 `background.js` 中各实现了一份，因为它们运行在不同的上下文中。

### 4.2 去重策略

**URL 去重**（60 秒窗口）：
```javascript
const RECENT_DEDUPE_WINDOW_MS = 60 * 1000;
const _recentLastWrite = new Map();  // url → timestamp

function shouldSkipRecentWrite(url) {
  const now = Date.now();
  const last = _recentLastWrite.get(url);
  if (typeof last === 'number' && (now - last) < RECENT_DEDUPE_WINDOW_MS) {
    return true;
  }
  _recentLastWrite.set(url, now);
  return false;
}
```

**Closed Tabs 去重**：按 `(dateKey, hostname, url)` 三元组去重，重复关闭同一 URL 只刷新时间戳。

**visitCount 上限**：`Math.min(visitCount + 1, 999)`，防止长期访问同一页面导致数字无限增长。

### 4.3 Favicon LRU 缓存

```javascript
const MAX_FAVICON_CACHE_ENTRIES = 500;

function getFaviconSrc(url) {
  const hostname = extractHostname(url);
  if (cache[hostname]) {
    // 命中：标记为最近使用（删除再重新插入 → 移到末尾）
    const entry = cache[hostname];
    delete cache[hostname];
    cache[hostname] = entry;
    return entry.url;
  }
  // 未命中：返回 Google Favicon 服务 URL
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}

function _enforceFaviconCap() {
  const keys = Object.keys(cache);
  if (keys.length > MAX_FAVICON_CACHE_ENTRIES) {
    // 删除最旧的条目（对象键的第一个键）
    const toRemove = keys.slice(0, keys.length - MAX_FAVICON_CACHE_ENTRIES);
    toRemove.forEach(k => delete cache[k]);
  }
}
```

### 4.4 GitHub Trending 缓存

```javascript
async function loadGitHubTrending() {
  const cached = JSON.parse(localStorage.getItem('coretab_github_trending') || 'null');
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return cached.data;  // 24 小时内直接返回缓存
  }
  // 否则请求 GitHub API
  const response = await fetch('https://api.github.com/...');
  const data = await response.json();
  localStorage.setItem('coretab_github_trending', JSON.stringify({
    data,
    timestamp: Date.now()
  }));
  return data;
}
```

---

## 5. 安全设计

### 5.1 XSS 防护

所有动态内容在插入 DOM 前都经过 HTML 转义：

```javascript
// 统一的转义函数（在 coretab-workspaces.js 和 coretab-utils.js 中各有一份）
function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**使用场景**：
- 标签页标题、URL
- 提示词内容、变量名
- 会议转写文本、说话人名称
- 搜索结果

### 5.2 CSP

Manifest V3 默认启用严格的 CSP：
- `script-src 'self'`：只允许加载扩展自身的脚本
- `object-src 'self'`：禁止插件内容
- 不支持 `eval()`、`new Function()`、内联脚本

### 5.3 权限最小化

```json
{
  "permissions": ["tabs", "activeTab", "storage", "history"],
  "host_permissions": [
    "https://api.github.com/*",
    "https://www.google.com/*",
    "https://*.gstatic.com/*"
  ]
}
```

- `tabs`：查询标签页信息
- `activeTab`：访问当前活动标签页
- `storage`：读写 chrome.storage.local
- `history`：读取浏览历史（用于 Recent Tabs 回填）
- 不请求 `webRequest`、`notifications`、`cookies` 等高风险权限

---

## 6. 测试策略

### 6.1 端到端测试

使用 Playwright 进行自动化测试（`test/test-workspaces.js`）：

```javascript
test('Prompt Library CRUD', async ({ page }) => {
  await page.goto(extensionUrl);
  // 切换到 Prompts 工作台
  await page.click('[data-workspace-link="prompts"]');
  // 新建提示词
  await page.click('[data-p-action="new"]');
  await page.fill('input[name="title"]', '测试提示词');
  await page.fill('textarea[name="content"]', '你好 {{name}}');
  await page.click('button[type="submit"]');
  // 验证
  await expect(page.locator('.prompt-card')).toContainText('测试提示词');
});

test('Meeting export', async ({ page }) => {
  // 创建会议 → 添加转写 → 结束 → 导出 TXT
  const downloadPromise = page.waitForDownload(() =>
    page.click('[data-m-action="export-txt"]')
  );
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
});
```

### 6.2 测试覆盖

- 三工作台导航和状态保留
- Prompt CRUD、变量替换、收藏、回收站
- Meeting 创建、暂停/恢复、结束、导出
- 导出文件格式正确性
- 键盘快捷键和对话框交互

---

## 7. 设计决策记录

### 7.1 为什么不用 ES Modules？

Chrome Extension 的 Manifest V3 支持 ES Modules，但 CoreTab 选择了经典脚本：

- **简单性**：无需 `type="module"`，无需处理 CORS
- **兼容性**：经典脚本在所有 Chromium 浏览器中行为一致
- **调试友好**：错误堆栈更清晰，Source Map 更简单

### 7.2 为什么 Prompts/Meetings 用 localStorage？

- 数据不需要在 Service Worker 中访问
- `localStorage` 是同步 API，代码更简单
- 避免了 `chrome.storage.local` 的异步序列化开销
- 5MB 容量对提示词和会议记录足够

### 7.3 为什么面板用 hidden 而不是 display:none？

- `hidden` 是 HTML 标准属性，语义更清晰
- 可以被 CSS 覆盖（`[hidden] { display: none }`）
- 屏幕阅读器会忽略 hidden 元素
- 与 `aria-hidden` 配合使用更自然

### 7.4 为什么使用 Web Speech API 而不是第三方 ASR？

- **零依赖**：不需要额外的 API Key 或服务端
- **隐私**：语音数据不经过第三方服务器（直接发送到 Google）
- **成本**：完全免费
- **局限**：需要联网，识别质量取决于网络状况

### 7.5 为什么会议导出用 Blob + URL.createObjectURL？

- 不需要额外的文件写入权限
- 兼容所有现代浏览器
- `URL.revokeObjectURL` 延迟 5 秒确保下载开始
- 文件名自动处理中文和特殊字符

---

## 8. 已知限制与未来方向

### 8.1 当前限制

- **存储容量**：`chrome.storage.local` 10MB 上限，大量标签页历史可能触及
- **语音识别**：Web Speech API 需要联网，离线无法使用
- **跨设备**：数据仅存储在本地，不支持跨设备同步
- **协作**：不支持团队共享标签页或会议记录
- **Firefox/Safari**：API 差异导致不兼容

### 8.2 未来方向

- **云同步**：可选的跨设备数据同步
- **AI 摘要**：集成 LLM 自动生成会议摘要
- **标签页分组**：支持用户自定义分组
- **知识图谱**：可视化标签页之间的关系
- **PWA 化**：支持离线使用和安装

---

**文档版本**：v2.0  
**基于代码版本**：v2.4.0 (cf0069a)  
**最后更新**：2026-09-16
