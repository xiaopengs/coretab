# CoreTab API 参考文档

本文档提供 CoreTab 扩展的核心 API 和函数参考，帮助开发者快速理解和使用代码。

---

## 目录

- [全局配置](#全局配置)
- [数据管理 API](#数据管理-api)
- [标签页操作 API](#标签页操作-api)
- [Recent Tabs API](#recent-tabs-api)
- [Closed Tabs API](#closed-tabs-api)
- [Prompts API](#prompts-api)
- [Meetings API](#meetings-api)
- [UI 组件 API](#ui-组件-api)
- [工具函数](#工具函数)

---

## 全局配置

### coretab-config.js

#### `getTrackedDomains()`

获取需要追踪的域名列表。

```javascript
async function getTrackedDomains(): Promise<string[]>
```

**返回值**：域名数组，如 `['feishu.cn', 'notion.so']`

**示例**：
```javascript
const domains = await getTrackedDomains();
// ['feishu.cn', 'larksuite.com', 'notion.so', ...]
```

#### `DEFAULT_TRACKED_DOMAINS`

默认追踪的域名列表常量。

```javascript
const DEFAULT_TRACKED_DOMAINS = [
  'feishu.cn',
  'larksuite.com',
  'notion.so',
  'docs.google.com',
  'drive.google.com'
];
```

---

## 数据管理 API

### coretab-data.js

#### `loadOpenTabs()`

加载当前窗口所有打开的标签页。

```javascript
async function loadOpenTabs(): Promise<Tab[]>
```

**返回值**：标签页数组

**Tab 结构**：
```javascript
{
  id: number,           // Chrome tab ID
  url: string,          // 页面 URL
  title: string,        // 页面标题
  favIconUrl: string,   // Favicon URL
  windowId: number,     // 窗口 ID
  index: number         // 标签页索引
}
```

**示例**：
```javascript
const tabs = await loadOpenTabs();
console.log(tabs.length); // 10
```

#### `loadClosedTabs()`

加载已关闭的标签页历史。

```javascript
async function loadClosedTabs(): Promise<ClosedTabGroup[]>
```

**返回值**：关闭标签页分组数组

**ClosedTabGroup 结构**：
```javascript
{
  dateKey: string,      // 日期键，如 '2026-09-16'
  date: string,         // 格式化日期，如 '今天'
  tabs: ClosedTab[]     // 标签页数组
}
```

#### `loadHistory()`

加载浏览器历史记录。

```javascript
async function loadHistory(query?: string): Promise<HistoryItem[]>
```

**参数**：
- `query`：搜索关键词（可选）

**返回值**：历史记录数组

#### `loadGitHubTrending()`

加载 GitHub Trending 项目。

```javascript
async function loadGitHubTrending(): Promise<TrendingRepo[]>
```

**返回值**：热门项目数组（24 小时缓存）

---

## 标签页操作 API

### coretab-actions.js

#### `closeAllTabs()`

关闭当前窗口所有标签页。

```javascript
async function closeAllTabs(): Promise<void>
```

**行为**：
1. 显示确认对话框
2. 保存所有标签页到 Closed Tabs
3. 关闭标签页（保留当前 CoreTab 页面）

#### `closeWindowTabs()`

关闭当前窗口除 CoreTab 外的所有标签页。

```javascript
async function closeWindowTabs(): Promise<void>
```

#### `restoreTab(tabId)`

还原单个标签页。

```javascript
async function restoreTab(tabId: number): Promise<void>
```

**参数**：
- `tabId`：要还原的标签页 ID

#### `restoreGroup(dateKey)`

在新窗口中还原整组标签页。

```javascript
async function restoreGroup(dateKey: string): Promise<void>
```

**参数**：
- `dateKey`：日期键，如 `'2026-09-16'`

#### `deleteTab(dateKey, index)`

删除单个关闭的标签页。

```javascript
async function deleteTab(dateKey: string, index: number): Promise<void>
```

#### `deleteGroup(dateKey)`

删除整组关闭的标签页。

```javascript
async function deleteGroup(dateKey: string): Promise<void>
```

---

## Recent Tabs API

### coretab-recent.js

#### `loadRecentTabs()`

加载最近访问的标签页。

```javascript
async function loadRecentTabs(): Promise<RecentTab[]>
```

**RecentTab 结构**：
```javascript
{
  url: string,          // 页面 URL
  title: string,        // 页面标题
  hostname: string,     // 域名
  visitedAt: number,    // 最后访问时间（时间戳）
  visitCount: number    // 访问次数
}
```

#### `addRecentTab(url, title, visitedAt?)`

添加标签页到最近访问列表。

```javascript
async function addRecentTab(
  url: string,
  title: string,
  visitedAt?: number
): Promise<void>
```

**参数**：
- `url`：页面 URL
- `title`：页面标题
- `visitedAt`：访问时间（可选，默认当前时间）

**行为**：
- 自动去重（60 秒窗口）
- 自动排序（按访问时间）
- 自动裁剪（最多 200 条）

#### `pruneAndSaveRecentTabs()`

清理过期条目并保存。

```javascript
async function pruneAndSaveRecentTabs(): Promise<void>
```

**行为**：删除 30 天前的条目

---

## Closed Tabs API

### coretab-data.js (内部)

#### `addClosedTab(tab)`

添加标签页到关闭历史。

```javascript
async function addClosedTab(tab: Tab): Promise<void>
```

**行为**：
- 按日期分组
- 自动去重（URL + 日期）
- 自动清理（60 天过期）

#### `saveClosedTabs(groups)`

保存关闭标签页分组。

```javascript
async function saveClosedTabs(groups: ClosedTabGroup[]): Promise<void>
```

---

## Prompts API

### coretab-prompts.js

#### `loadPrompts()`

加载提示词库。

```javascript
async function loadPrompts(): Promise<Prompt[]>
```

**Prompt 结构**：
```javascript
{
  id: string,
  title: string,
  content: string,
  category: string,
  tags: string[],
  model: string,
  variables: Variable[],
  favorite: boolean,
  createdAt: number,
  updatedAt: number
}
```

#### `savePrompt(prompt)`

保存单个提示词。

```javascript
async function savePrompt(prompt: Prompt): Promise<void>
```

#### `deletePrompt(id)`

删除提示词。

```javascript
async function deletePrompt(id: string): Promise<void>
```

#### `toggleFavorite(id)`

切换收藏状态。

```javascript
async function toggleFavorite(id: string): Promise<void>
```

---

## Meetings API

### coretab-meetings.js

#### `loadMeetings()`

加载会议记录列表。

```javascript
async function loadMeetings(): Promise<Meeting[]>
```

**Meeting 结构**：
```javascript
{
  id: string,
  title: string,
  startTime: number,
  endTime: number | null,
  status: 'recording' | 'paused' | 'completed',
  transcript: TranscriptEntry[],
  summary: string,
  actionItems: string[],
  createdAt: number
}
```

#### `createMeeting(title)`

创建新会议。

```javascript
async function createMeeting(title: string): Promise<Meeting>
```

#### `endMeeting(id)`

结束会议。

```javascript
async function endMeeting(id: string): Promise<void>
```

**行为**：
- 停止语音识别（如果正在录音）
- 设置 endTime
- 更新状态为 'completed'

#### `exportMeeting(id, format)`

导出会议记录。

```javascript
async function exportMeeting(
  id: string,
  format: 'txt' | 'markdown'
): Promise<void>
```

**参数**：
- `id`：会议 ID
- `format`：导出格式（'txt' 或 'markdown'）

**行为**：触发浏览器下载

---

## UI 组件 API

### coretab-ui.js

#### `showToast(message, type?)`

显示 Toast 提示。

```javascript
function showToast(
  message: string,
  type?: 'success' | 'error' | 'info'
): void
```

**示例**：
```javascript
showToast('标签页已保存', 'success');
showToast('操作失败', 'error');
```

#### `showConfirm(message, onConfirm)`

显示确认对话框。

```javascript
function showConfirm(
  message: string,
  onConfirm: () => void
): void
```

**示例**：
```javascript
showConfirm('确定要关闭所有标签页吗？', () => {
  closeAllTabs();
});
```

#### `showModal(content)`

显示模态框。

```javascript
function showModal(content: string | HTMLElement): void
```

#### `hideModal()`

隐藏模态框。

```javascript
function hideModal(): void
```

---

## 工具函数

### coretab-utils.js

#### `escapeHtml(value)`

转义 HTML 特殊字符，防止 XSS。

```javascript
function escapeHtml(value: any): string
```

**示例**：
```javascript
escapeHtml('<script>alert("xss")</script>');
// '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

#### `formatRelativeTime(timestamp)`

格式化相对时间。

```javascript
function formatRelativeTime(timestamp: number): string
```

**返回值**：
- `'刚刚'`（< 1 分钟）
- `'5 分钟前'`
- `'2 小时前'`
- `'昨天'`
- `'3 天前'`

#### `extractHostname(url)`

从 URL 提取域名。

```javascript
function extractHostname(url: string): string | null
```

**示例**：
```javascript
extractHostname('https://www.google.com/search?q=test');
// 'www.google.com'
```

#### `debounce(fn, delay)`

防抖函数。

```javascript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void
```

**示例**：
```javascript
const debouncedSearch = debounce(search, 300);
input.addEventListener('input', debouncedSearch);
```

#### `throttle(fn, interval)`

节流函数。

```javascript
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void
```

---

## 常量参考

### 存储键

```javascript
'coretab_closed_tabs'           // 关闭的标签页
'coretab_recent_tabs'           // 最近访问
'coretab_recent_config'         // Recent 配置
'coretab_prompts_v1'            // 提示词库
'coretab_meetings_v1'           // 会议记录
'coretab_favicon_cache'         // Favicon 缓存
```

### 限制常量

```javascript
MAX_CLOSED_TABS_AGE_DAYS = 60        // Closed Tabs 过期天数
MAX_RECENT_TABS_AGE_DAYS = 30        // Recent Tabs 过期天数
MAX_FAVICON_CACHE_ENTRIES = 500      // Favicon 缓存条数
RECENT_MAX_TOTAL = 200               // Recent Tabs 最大条数
RECENT_MAX_PER_DOMAIN = 50           // 每个域名最大条数
RECENT_DEDUPE_WINDOW_MS = 60000      // 去重窗口（毫秒）
```

---

## 错误处理

所有异步 API 都包含错误处理：

```javascript
try {
  await loadOpenTabs();
} catch (error) {
  console.error('Failed to load tabs:', error);
  showToast('加载失败', 'error');
}
```

**常见错误**：
- `chrome.storage.local` 配额满
- Chrome API 权限不足
- 网络请求失败（GitHub API）

---

## 类型定义

### Tab

```typescript
interface Tab {
  id: number;
  url: string;
  title: string;
  favIconUrl: string;
  windowId: number;
  index: number;
}
```

### ClosedTab

```typescript
interface ClosedTab {
  url: string;
  title: string;
  hostname: string;
  closedAt: number;
}
```

### RecentTab

```typescript
interface RecentTab {
  url: string;
  title: string;
  hostname: string;
  visitedAt: number;
  visitCount: number;
}
```

### Prompt

```typescript
interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  model: string;
  variables: Variable[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### Meeting

```typescript
interface Meeting {
  id: string;
  title: string;
  startTime: number;
  endTime: number | null;
  status: 'recording' | 'paused' | 'completed';
  transcript: TranscriptEntry[];
  summary: string;
  actionItems: string[];
  createdAt: number;
}
```

---

**文档版本**：v1.0  
**最后更新**：2026-09-16  
**维护者**：CoreTab Team
