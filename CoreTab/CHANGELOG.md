# 更新日志

所有重要的更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [2.4.0] - 2026-06-06

### 新增

- ✨ Open Tabs 顶部 "全部关闭标签" Hero Banner — 在 `#openTabsSection` 顶部展示一个醒目的提示卡片，显示当前打开的标签数，0 时变成 "All caught up" 状态，一键关闭所有标签
- ✨ Closed Tabs 重新设计为密集合并 — 从卡片网格改为按日期分组的单行列表，一次展示全部历史，header 上加当日小计，hover 时才出现 "重新打开" 箭头
- ✨ Closed Tabs 日期标签本地化 — `formatClosedDateLabel()` 支持 "Today / Yesterday / 周几 / Mon, Mar 5 / Mon, Mar 5, 2024"

### 修复

- 🐛 Closed Tabs 数据层去重 — `addClosedTab` 现在在写入前查找已有的 `(date, host, url)` 三元组，重复关闭同一 URL 只刷新 `closedAt` 并移到头部，存储不再无谓增长
- 🐛 DST 夏令时边界修复 — `formatClosedDateLabel` 的 day-diff 改用 `Date.UTC` 计算，DST 切换当天（23h/25h）标签不再算错一天
- 🐛 Recent Tabs 并发写入竞态 — 多个 `addRecentTab` 并发会丢失 `visitCount` 累加；现在 `coretab-recent.js` 和 `background.js` 各有一个 `enqueueRecent` 串行队列保护 read-modify-write
- 🐛 双写存储漂移 — `restoreClosedTabsFromStorage` 从单向 fallback 改为按条目数比较、取较大集合并写回两侧
- 🐛 `chrome.storage.local` 写入失败不再静默 — `saveClosedTabs` / `saveRecentTabs` / favicon persist 失败时改为 `console.error` 记录原因（quota 满、SW 休眠等）

### 优化

- ⚡ 60 天过期清理 — `MAX_CLOSED_TABS_AGE_DAYS = 60`，`addClosedTab` 和启动 `init()` 时自动 prune
- ⚡ 30 天过期清理 — `MAX_RECENT_TABS_AGE_DAYS = 30`，`addRecentTab` 写时过滤 + `onInstalled/onStartup/init` 三处 prune
- ⚡ Favicon 缓存 LRU 500 — `MAX_FAVICON_CACHE_ENTRIES = 500`，`getFaviconSrc` 命中时重插入标记 MRU，persist 前裁掉最旧
- ⚡ `onUpdated` 60s/URL 去重 — SPA 路由切换、redirect 链、刷新 burst 不再反复写 `chrome.storage.local`
- ⚡ `visitCount` 上限 999 — 长期访问同一页面不再涨到 4-5 位数
- ⚡ 合并两个 `document click` 监听器 — 减少一次事件分发

### 技术细节

- 新增 `MAX_CLOSED_TABS_AGE_DAYS=60`, `MAX_RECENT_TABS_AGE_DAYS=30`, `MAX_FAVICON_CACHE_ENTRIES=500`, `RECENT_DEDUPE_WINDOW_MS=60*1000` 常量
- 新增 `pruneClosedTabs()` / `pruneRecentTabs()` 纯函数，在 `add*` 和启动 `init` 时调用
- 新增 `enqueueRecent(fn)` 串行 Promise 链包装 `addRecentTab`，失败不污染后续
- `getDateKey` 加注释说明 local-date 设计意图
- `formatClosedDateLabel` 改用 `Date.UTC(y, m-1, d)` 比较日期差
- `restoreClosedTabsFromStorage` 双向合并 + JSON 解析容错
- favicon 缓存 `init` 时也调 `_enforceFaviconCap()` 裁剪历史遗留超额

---

## [2.3.0] - 2026-05-03

### 新增

- ✨ 添加 Recent Tabs 功能 - 智能追踪并显示 Feishu、Notion、Google Docs 等重要网站的最近访问页面
- ✨ 按网站分组显示 Recent Tabs - 方便快速访问常用文档和页面
- ✨ 支持在 Recent Tabs 中点击打开页面 - 可以选择聚焦已打开标签或在新标签页中打开
- ✨ 自动跟踪指定网站访问 - 默认追踪 Feishu、Notion、Google Docs 等常用文档网站

### 优化

- ⚡ 设计了美观的 Recent Tabs 界面风格 - 与 Closed Tabs 保持一致的视觉风格
- ⚡ 添加了友好的空状态提示 - 指导用户开始使用 Recent Tabs 功能

---

## [2.2.0] - 2026-05-03

### 修复

- 🐛 修复点击"全部关闭"后确认对话框无法关闭，导致页面无响应的问题（移除了强制覆盖内联样式的CSS规则）
- 🐛 修复History卡片链接无法跳转的问题（找不到已打开标签页时现在会在新标签页中打开）

### 优化

- ⚡ 优化搜索功能 - 现在同时搜索Open Tabs和Closed Tabs（搜索范围包括标题、URL和主机名）
- ⚡ 搜索结果区分显示 - Open Tabs在前，Closed Tabs在后并标记[Closed]徽章
- ⚡ 优化标签页显示规则 - 总是过滤掉当前CoreTab标签页自己
- ⚡ 扩展了允许的系统页面 - chrome://newtab/ 和 chrome://extensions/ 现在也会显示在Open Tabs中
- ⚡ 改进了confirm dialog的处理逻辑 - 确保对话框先隐藏再执行确认操作
- ⚡ 优化GitHub Trending缓存策略 - 从每5分钟获取一次改为每24小时获取一次，大幅减少API请求
- ⚡ 优化Closed Tabs重复项 - 对new-tab、extensions等特殊页面只保留最近的2个，避免重复过多

### 技术细节

- 添加了ALLOWED_CHROME_PAGES配置，允许特定的chrome://页面显示
- 修改了isSystemUrl函数，添加例外处理
- 优化了hideConfirmDialog函数，添加立即恢复pointer-events的逻辑
- 修改了performConfirmedAction函数，确保先隐藏对话框再执行操作
- 更新了background.js，保持与app.js的逻辑一致性
- 添加了调试日志，方便排查问题

---

## [2.1.0] - 2026-05-03

### 新增

- ✨ Closed Tabs功能 - 记录已关闭的标签页，按日期和网站分组
- ✨ GitHub Trending展示 - 显示热门GitHub项目卡片
- ✨ 新标签页替代功能 - CoreTab现在作为默认新标签页
- ✨ Clay/Swatch设计系统 - 全新的视觉设计

---

## [1.0.0] - 2026-03-22

### 新增

- ✨ 一键保存当前窗口所有标签页
- ✨ 按日期分组展示（今天/昨天/更早）
- ✨ 相对时间显示（刚刚、5分钟前、2小时前等）
- ✨ 单个标签页还原（点击打开）
- ✨ 整组标签页还原（在新窗口中打开）
- ✨ 全部还原功能
- ✨ 分组重命名功能
- ✨ 分组锁定/解锁功能
- ✨ 分组分享（导出为HTML）
- ✨ 标签页搜索功能
- ✨ JSON格式导入/导出
- ✨ 快捷键支持（Ctrl+Shift+S）
- ✨ 多CoreTab自动合并
- ✨ 窗口隔离（仅操作当前窗口）
- ✨ 过滤系统页面（chrome://、about://等）

### 技术细节

- 使用Chrome Extension Manifest V3
- 数据存储在chrome.storage.local
- Service Worker后台脚本
- 响应式UI设计

---

## 即将推出

- 标签页自定义分组
- 标签页备注功能
- 云同步（可选）

---

[2.4.0]: https://github.com/xiaopengs/coretab/releases/tag/v2.4.0
[2.3.0]: https://github.com/xiaopengs/coretab/releases/tag/v2.3.0
[2.2.0]: https://github.com/xiaopengs/coretab/releases/tag/v2.2.0
[2.1.0]: https://github.com/xiaopengs/coretab/releases/tag/v2.1.0
[1.0.0]: https://github.com/xiaopengs/coretab/releases/tag/v1.0.0
