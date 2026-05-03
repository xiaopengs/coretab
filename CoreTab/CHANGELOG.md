# 更新日志

所有重要的更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

### [2.3.0] - 计划中

- 标签页去重选项
- 自动保存设置
- 分组排序功能
- 批量操作增强

### [2.4.0] - 计划中

- 标签页自定义分组
- 标签页备注功能
- 云同步（可选）

---

[2.3.0]: https://github.com/your-username/coretab/releases/tag/v2.3.0
[2.2.0]: https://github.com/your-username/coretab/releases/tag/v2.2.0
[2.1.0]: https://github.com/your-username/coretab/releases/tag/v2.1.0
[1.0.0]: https://github.com/your-username/coretab/releases/tag/v1.0.0
