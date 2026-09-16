# CoreTab 架构设计文档

## 1. 系统架构概览

CoreTab 采用 **Chrome Extension Manifest V3** 架构，基于 **Service Worker + Content Script + Popup** 的三层模型，实现了零依赖、高性能的标签页管理解决方案。

### 1.1 核心架构组件

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
├─────────────────────────────────────────────────────────┤
│  Background Service Worker (background.js)              │
│  ├─ Badge 更新与生命周期管理                              │
│  ├─ Recent Tabs 后台追踪                                 │
│  ├─ 域名配置管理与缓存                                   │
│  └─ 历史回填任务                                         │
├─────────────────────────────────────────────────────────┤
│  Content Scripts (index.html + JS modules)              │
│  ├─ Tabs Workspace (标签页管理)                          │
│  ├─ Prompts Workspace (提示词库)                         │
│  ├─ Meetings Workspace (会议记录)                        │
│  └─ 共享 UI 组件与导航                                   │
├─────────────────────────────────────────────────────────┤
│  Storage Layer                                           │
│  ├─ chrome.storage.local (持久化数据)                    │
│  ├─ localStorage (会话状态)                              │
│  └─ IndexedDB (未来扩展预留)                             │
└─────────────────────────────────────────────────────────┘
```

### 1.2 设计原则

- **零依赖**：纯 Vanilla JavaScript，无框架、无构建工具
- **模块化**：按功能拆分为 15+ 个独立 JS 模块
- **性能优先**：事件委托、虚拟滚动、防抖节流
- **隐私保护**：所有数据本地存储，无外部服务依赖
- **渐进增强**：核心功能不依赖可选权限

---

## 2. 模块架构

### 2.1 核心模块分层

#### 数据层 (Data Layer)
```javascript
coretab-data.js        // 标签页数据加载与过滤
coretab-recent.js      // Recent Tabs 数据管理
coretab-config.js      // 配置管理与域名追踪
coretab-favicon-cache.js // Favicon LRU 缓存
```

**职责**：
- 从 Chrome API 获取标签页数据
- 实现数据过滤、去重、排序逻辑
- 管理 localStorage 与 chrome.storage.local 的同步
- 提供 LRU 缓存机制优化 Favicon 加载

#### 业务层 (Business Layer)
```javascript
coretab-actions.js     // 用户操作处理（关闭、还原、保存）
coretab-workspaces.js  // 三工作台导航与共享逻辑
coretab-prompts.js     // 提示词库 CRUD
coretab-meetings.js    // 会议记录与 ASR 集成
coretab-quick-nav.js   // 快速导航管理
```

**职责**：
- 处理用户交互事件
- 实现业务逻辑（批量操作、确认对话框）
- 管理各工作台的独立状态
- 协调跨模块数据流

#### 表现层 (Presentation Layer)
```javascript
coretab-render-tabs.js // 标签页渲染与分组
coretab-ui.js          // 通用 UI 组件（搜索、Toast、Modal）
coretab-events.js      // 事件绑定与委托
coretab-main.js        // 初始化入口
```

**职责**：
- DOM 渲染与更新
- 事件监听与委托
- UI 状态管理
- 动画与过渡效果

### 2.2 模块依赖关系

```
coretab-main.js
  ├─ coretab-data.js
  ├─ coretab-render-tabs.js
  ├─ coretab-actions.js
  ├─ coretab-events.js
  ├─ coretab-ui.js
  ├─ coretab-workspaces.js
  ├─ coretab-prompts.js
  └─ coretab-meetings.js

coretab-data.js
  ├─ coretab-config.js
  ├─ coretab-favicon-cache.js
  └─ coretab-recent.js

coretab-actions.js
  ├─ coretab-data.js
  └─ coretab-ui.js (Toast 提示)
```

**设计决策**：
- 采用单向依赖，避免循环引用
- 共享工具函数集中在 `coretab-utils.js`
- 各工作台模块独立，通过 `coretab-workspaces.js` 协调

---

## 3. 三工作台架构

### 3.1 导航系统

```javascript
// Hash-based routing
window.location.hash = '#tabs' | '#prompts' | '#meetings'

// 面板切换逻辑
function switchWorkspace(name) {
  // 1. 隐藏所有面板（display: none）
  // 2. 显示目标面板
  // 3. 更新导航高亮
  // 4. 触发懒加载（首次进入时）
}
```

**关键特性**：
- **状态保留**：面板隐藏而非销毁，保留滚动位置、筛选状态、草稿内容
- **浏览器集成**：支持前进/后退按钮
- **懒加载**：首次进入工作台时才初始化数据

### 3.2 Tabs Workspace

**核心功能**：
- Open Tabs：实时显示当前窗口标签页
- Closed Tabs：按日期分组的关闭历史
- Recent Tabs：智能追踪的重要网站访问记录
- GitHub Trending：每日热门项目推荐
- History：浏览器历史记录搜索

**数据流**：
```
chrome.tabs.query() → coretab-data.js → coretab-render-tabs.js → DOM
                                         ↓
                                    coretab-actions.js
                                         ↓
                                   chrome.tabs.remove()
```

### 3.3 Prompts Workspace

**核心功能**：
- 提示词模板管理（CRUD）
- 分类与标签系统
- 收藏与排序
- 变量替换与预览
- 模型元数据管理

**数据结构**：
```javascript
{
  id: string,
  title: string,
  content: string,
  category: string,
  tags: string[],
  model: string,
  variables: { name: string, defaultValue: string }[],
  favorite: boolean,
  createdAt: number,
  updatedAt: number
}
```

**存储键**：`coretab_prompts_v1`

### 3.4 Meetings Workspace

**核心功能**：
- 会议创建与计时
- 手动记录（带时间戳和说话人）
- Web Speech API 语音识别（实验性）
- 摘要与行动项编辑
- 会议导出（TXT/Markdown）
- 历史记录查询

**数据结构**：
```javascript
{
  id: string,
  title: string,
  startTime: number,
  endTime: number | null,
  status: 'recording' | 'paused' | 'completed',
  transcript: {
    timestamp: number,
    speaker: string,
    text: string
  }[],
  summary: string,
  actionItems: string[],
  createdAt: number
}
```

**存储键**：`coretab_meetings_v1`

---

## 4. 存储架构

### 4.1 存储策略

| 存储类型 | 用途 | 容量限制 | 持久性 |
|---------|------|---------|--------|
| chrome.storage.local | 核心数据 | 10MB | 永久 |
| localStorage | 会话状态 | 5MB | 会话级 |
| IndexedDB | 大数据（预留） | 无限制 | 永久 |

### 4.2 数据键设计

```javascript
// 标签页管理
'coretab_closed_tabs'      // 关闭的标签页历史
'coretab_recent_tabs'      // 最近访问的标签页
'coretab_recent_config'    // Recent Tabs 配置

// 工作台数据
'coretab_prompts_v1'       // 提示词库
'coretab_meetings_v1'      // 会议记录

// 缓存与配置
'coretab_favicon_cache'    // Favicon 缓存
'coretab_recent_backfill_state' // 历史回填状态
```

### 4.3 数据过期策略

```javascript
// Closed Tabs: 60 天过期
MAX_CLOSED_TABS_AGE_DAYS = 60

// Recent Tabs: 30 天过期
MAX_RECENT_TABS_AGE_DAYS = 30

// Favicon 缓存: LRU 500 条
MAX_FAVICON_CACHE_ENTRIES = 500

// 去重窗口: 60 秒
RECENT_DEDUPE_WINDOW_MS = 60 * 1000
```

---

## 5. 性能优化

### 5.1 渲染优化

- **事件委托**：所有列表项点击事件委托到父容器
- **虚拟滚动**：长列表使用 Intersection Observer 懒加载
- **批量 DOM 更新**：使用 DocumentFragment 减少重排
- **防抖节流**：搜索输入、滚动事件使用 debounce/throttle

### 5.2 存储优化

- **串行队列**：`enqueueRecent()` 防止并发写入竞态
- **去重机制**：60 秒内同一 URL 只记录一次
- **LRU 缓存**：Favicon 缓存自动淘汰最旧条目
- **增量更新**：只更新变化的 DOM 节点

### 5.3 网络优化

- **GitHub API 缓存**：24 小时缓存，减少 API 请求
- **Favicon 预加载**：页面加载时批量预加载可见 Favicon
- **离线优先**：核心功能不依赖网络

---

## 6. 安全设计

### 6.1 XSS 防护

所有用户输入通过 `escapeHtml()` 函数转义：

```javascript
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### 6.2 CSP 策略

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### 6.3 权限最小化

- 仅请求必要的权限：`tabs`, `activeTab`, `storage`, `history`
- 不使用 `webRequest` 等高风险权限
- 不访问外部网络（除 GitHub API）

---

## 7. 扩展性设计

### 7.1 插件化架构

各工作台模块独立，可通过以下方式扩展：

1. **新增工作台**：创建独立模块，在 `coretab-workspaces.js` 注册
2. **自定义数据源**：在 `coretab-data.js` 添加新的数据加载函数
3. **UI 组件复用**：`coretab-ui.js` 提供通用组件（Toast、Modal、Confirm）

### 7.2 配置化

```javascript
// 域名追踪配置
DEFAULT_TRACKED_DOMAINS = [
  'feishu.cn',
  'larksuite.com',
  'notion.so',
  'docs.google.com'
]

// 可通过 chrome.storage.local 动态配置
```

### 7.3 主题系统

基于 CSS 变量的 Clay/Swatch 设计系统：

```css
:root {
  --color-cream: #faf8f5;
  --color-matcha: #7ab57a;
  --color-oat: #d4c5b0;
  --swatch-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
```

---

## 8. 测试策略

### 8.1 自动化测试

使用 Playwright 进行端到端测试：

```javascript
test('should save all tabs', async ({ page }) => {
  await page.goto('chrome-extension://xxx/index.html');
  await page.click('#save-all-btn');
  await expect(page.locator('.closed-tabs-section')).toBeVisible();
});
```

### 8.2 测试覆盖

- 核心功能：保存、还原、删除、搜索
- 边界情况：空状态、大量数据、并发操作
- 跨工作台：导航、状态保留、数据隔离
- 导出功能：TXT/Markdown 格式正确性

---

## 9. 未来演进

### 9.1 短期目标（v2.5.0）

- [ ] 标签页去重选项
- [ ] 自动保存设置
- [ ] 分组排序（时间/名称/数量）
- [ ] 批量操作增强

### 9.2 中期目标（v3.0.0）

- [ ] 云同步（可选）
- [ ] 标签页快照历史
- [ ] AI 智能分组
- [ ] 跨设备同步

### 9.3 长期愿景

- [ ] 协作功能（团队标签页共享）
- [ ] 知识图谱（标签页关系可视化）
- [ ] 语音助手集成
- [ ] 跨浏览器支持（Firefox、Safari）

---

## 10. 附录

### 10.1 技术栈

- **Manifest V3**：Chrome Extension 最新规范
- **Vanilla JavaScript (ES2020+)**：无框架依赖
- **Chrome Extension APIs**：tabs, storage, windows, history
- **Web Speech API**：实验性语音识别
- **CSS3**：现代布局与动画

### 10.2 浏览器兼容性

- Chrome 88+（Manifest V3 支持）
- Edge 88+
- Brave（Chrome 内核）
- 不支持 Firefox/Safari（API 差异）

### 10.3 性能指标

- 首次加载：< 500ms
- 标签页渲染：1000 个标签页 < 1s
- 搜索响应：< 100ms
- 内存占用：< 50MB（1000 个标签页）

---

**文档版本**：v1.0  
**最后更新**：2026-09-16  
**维护者**：CoreTab Team
