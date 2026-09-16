# CoreTab

<div align="center">

**不是又一个标签页管理器。**

一个将混乱的浏览器标签页转化为有序工作流的 Chrome 扩展。

[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](https://github.com/xiaopengs/coretab/releases)
[![Chrome](https://img.shields.io/badge/chrome-88+-green.svg)](https://www.google.com/chrome/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-V3-purple.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

[立即安装](#安装) · [查看文档](docs/) · [反馈问题](https://github.com/xiaopengs/coretab/issues)

</div>

---

## 为什么需要 CoreTab？

你是否有过这样的经历：

- 打开 50+ 个标签页，Chrome 开始卡顿，但你不敢关闭任何一个
- 想关闭浏览器，但舍不得关掉正在研究的页面
- 在不同项目间切换，标签页混乱不堪，找不到刚才看的文档
- 开会时手忙脚乱，无法同时记录讨论内容和查看相关资料

**CoreTab 解决的不是"如何关闭标签页"，而是"如何让工作流保持连贯"。**

它不只是一个标签页管理器，而是一个集标签页管理、提示词库、会议记录于一体的工作效率工具。

---

## 核心特性

### 三工作台架构

CoreTab 采用独特的三工作台设计，将不同场景的工作流隔离：

```
┌─────────────────────────────────────────────────────────┐
│  Tabs          │  Prompts       │  Meetings             │
│  标签页管理     │  提示词库       │  会议记录              │
├─────────────────────────────────────────────────────────┤
│  • Open Tabs   │  • 模板管理     │  • 实时录音            │
│  • Closed Tabs │  • 分类标签     │  • 语音转文字          │
│  • Recent Tabs │  • 收藏排序     │  • 自动摘要            │
│  • History     │  • 变量替换     │  • 导出分享            │
│  • Trending    │  • 模型标注     │  • 历史记录            │
└─────────────────────────────────────────────────────────┘
```

**为什么这样设计？**

传统的标签页管理器将所有功能堆砌在一个界面中，导致：
- 认知负担：用户需要在众多功能中找到当前需要的
- 上下文切换：从标签页管理切换到其他功能时，需要重新加载
- 性能问题：所有功能同时加载，即使只用其中一个

CoreTab 的三工作台设计解决了这些问题：
- **状态隔离**：每个工作台独立维护状态，切换时不丢失上下文
- **懒加载**：首次进入工作台时才初始化，减少启动时间
- **专注模式**：当前工作台占据全部注意力，减少干扰

### 标签页管理

**智能分组**

不是简单的列表，而是按时间维度组织的标签页历史：

- 按日期自动分组（今天/昨天/本周/更早）
- 相对时间显示（刚刚、5分钟前、2小时前）
- 自动去重：同一 URL 在同一天只记录一次
- 60 天自动清理，避免存储无限增长

**批量操作**

一键完成常见操作：

- 保存当前窗口所有标签页（保留 CoreTab 页面）
- 关闭所有标签页（带确认对话框）
- 批量还原、批量删除

**Recent Tabs**

智能追踪重要网站的访问记录：

- 自动追踪飞书、Notion、Google Docs 等常用网站
- 按域名分组显示，快速找到最近访问的文档
- 自动清理 30 天前的记录
- 支持自定义追踪域名

**GitHub Trending**

每日热门项目推荐：

- 24 小时缓存，减少 API 请求
- 支持多语言筛选
- 一键查看项目详情

### 提示词库

**本地优先**

所有提示词存储在浏览器本地，不上传到任何服务器：

- 创建、编辑、删除提示词模板
- 支持分类和标签系统
- 收藏常用模板，快速访问
- 支持回收站，误删可恢复

**变量替换**

```markdown
你好 {{name}}，请帮我分析以下代码：

{{code}}
```

支持 `{{变量名}}` 语法，使用时自动提示填充。

**模型标注**

为每个模板标注适用的 AI 模型：

- 快速筛选特定模型的提示词
- 支持自定义模型名称
- 记录使用次数，按使用频率排序

### 会议记录

**实时录音**

基于 Web Speech API 的语音识别：

- 支持中英文混合识别
- 自动添加时间戳
- 支持手动输入补充

**智能整理**

会议结束后自动生成结构化内容：

- 摘要：提取关键信息
- 关键结论：识别重要决策
- 行动项：识别待办事项，支持勾选完成状态

**导出分享**

支持多种导出格式：

- TXT 纯文本格式
- Markdown 格式（带格式）
- 一键复制到剪贴板

---

## 安装

### 方式一：Chrome 网上应用店（推荐）

> 🚧 即将上线，敬请期待

### 方式二：开发者模式安装

1. **下载代码**
   ```bash
   git clone https://github.com/xiaopengs/coretab.git
   cd coretab/CoreTab
   ```

2. **打开扩展管理页面**
   - 打开 Chrome
   - 访问 `chrome://extensions/`

3. **启用开发者模式**
   - 点击右上角「开发者模式」开关

4. **加载扩展**
   - 点击「加载已解压的扩展程序」
   - 选择 `CoreTab` 文件夹

5. **完成**
   - 看到 CoreTab 图标即安装成功
   - 打开新标签页即可使用

---

## 快速开始

### 1. 保存标签页

打开多个标签页后：

- 点击浏览器工具栏的 CoreTab 图标
- 或使用快捷键 `Ctrl+Shift+S`（Mac: `Cmd+Shift+S`）

所有标签页将被保存并关闭，自动跳转到 CoreTab 管理页面。

### 2. 还原标签页

在 CoreTab 页面：

- 点击单个标签页链接 → 在当前标签页打开
- 点击「还原」按钮 → 在新窗口打开整组标签页
- 点击「全部还原」→ 在新窗口打开所有标签页

### 3. 使用提示词

切换到 Prompts 工作台：

- 点击「新建提示词」创建模板
- 使用时点击「复制」或「使用」
- 支持变量替换，自动提示填充

### 4. 记录会议

切换到 Meetings 工作台：

- 点击「新建会议」
- 点击「开始录音」允许麦克风权限
- 会议结束后自动生成摘要和行动项
- 支持导出为 TXT 或 Markdown

---

## 技术架构

### 零依赖设计

CoreTab 采用纯原生 JavaScript 开发，**零框架依赖**：

```
CoreTab
├── Manifest V3          # Chrome 扩展规范
├── Vanilla JavaScript   # 原生 JS，无框架
├── Web Speech API       # 语音识别（实验性）
├── Chrome Storage API   # 本地存储
└── CSS3                 # 现代样式
```

**为什么不用框架？**

- **启动更快**：无框架加载开销，首次加载 < 500ms
- **体积更小**：扩展包仅 200KB，无第三方依赖
- **更安全**：无供应链攻击风险，代码完全可控
- **易维护**：代码直观，易于理解和修改

### 模块化架构

```
┌─────────────────────────────────────────┐
│         Content Scripts (UI)            │
│  ┌──────────┬──────────┬──────────┐    │
│  │  Tabs    │ Prompts  │ Meetings │    │
│  └──────────┴──────────┴──────────┘    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│    Background Service Worker            │
│  • Badge 更新                           │
│  • Recent Tabs 追踪                     │
│  • 历史回填                             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Storage Layer                   │
│  • chrome.storage.local (持久化)         │
│  • localStorage (会话状态)              │
└─────────────────────────────────────────┘
```

**关键设计决策**

1. **单向依赖**：模块间采用单向依赖，避免循环引用
2. **事件委托**：所有列表项点击事件委托到父容器，减少事件监听器
3. **串行队列**：使用 Promise 链防止并发写入竞态
4. **LRU 缓存**：Favicon 缓存自动淘汰最旧条目

### 性能优化

**渲染优化**

- 事件委托：减少事件监听器数量
- 虚拟滚动：长列表只渲染可见区域
- 批量 DOM 更新：使用 DocumentFragment 减少重排
- 防抖节流：搜索输入、滚动事件使用 debounce/throttle

**存储优化**

- 串行队列：`enqueueRecent()` 防止并发写入竞态
- 去重机制：60 秒内同一 URL 只记录一次
- LRU 缓存：Favicon 缓存自动淘汰（最多 500 条）
- 增量更新：只更新变化的 DOM 节点

**网络优化**

- GitHub API 24 小时缓存
- Favicon 预加载
- 离线优先设计

---

## 项目结构

```
CoreTab/
├── manifest.json              # 扩展清单
├── background.js              # Service Worker
├── index.html                 # 主页面
├── js/
│   ├── coretab-main.js        # 初始化入口
│   ├── coretab-workspaces.js  # 工作台导航
│   ├── coretab-data.js        # 数据加载
│   ├── coretab-render-tabs.js # 标签页渲染
│   ├── coretab-actions.js     # 用户操作
│   ├── coretab-events.js      # 事件处理
│   ├── coretab-ui.js          # UI 组件
│   ├── coretab-recent.js      # Recent Tabs
│   ├── coretab-prompts.js     # 提示词库
│   ├── coretab-meetings.js    # 会议记录
│   ├── coretab-config.js      # 配置管理
│   ├── coretab-favicon-cache.js # Favicon 缓存
│   ├── coretab-quick-nav.js   # 快速导航
│   └── coretab-utils.js       # 工具函数
├── styles/
│   └── workspaces.css         # 工作台样式
├── icons/                     # 扩展图标
├── docs/                      # 文档
│   ├── ARCHITECTURE.md        # 架构设计
│   ├── API_REFERENCE.md       # API 参考
│   └── ...
└── test/                      # 测试
    └── test-workspaces.js     # 工作台测试
```

---

## 开发指南

### 环境要求

- Chrome 88+ 或 Edge 88+
- Node.js 16+（仅用于测试）
- Git

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/xiaopengs/coretab.git
   cd coretab/CoreTab
   ```

2. **加载扩展**
   - 按照[安装指南](#安装)加载扩展

3. **修改代码**
   - 编辑代码后，在 `chrome://extensions/` 点击刷新按钮
   - 或使用 [Extension Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/) 自动刷新

4. **调试**
   - 按 `F12` 打开开发者工具
   - 查看 Console、Network、Storage 等

### 运行测试

```bash
# 安装依赖
npm install

# 运行测试
npm test
```

测试使用 [Playwright](https://playwright.dev/) 进行端到端测试。

### 代码规范

- 使用 2 空格缩进
- 函数和变量使用 camelCase 命名
- 常量使用 UPPER_SNAKE_CASE
- 添加必要的注释
- 保持函数简洁（< 50 行）

---

## 常见问题

<details>
<summary><strong>标签页数据存储在哪里？</strong></summary>

所有数据存储在 Chrome 本地存储（`chrome.storage.local`），不会上传到任何服务器。卸载扩展会清除所有数据，建议定期导出备份。
</details>

<details>
<summary><strong>支持哪些浏览器？</strong></summary>

支持所有基于 Chromium 的浏览器：
- Chrome 88+
- Edge 88+
- Brave
- Opera

不支持 Firefox 和 Safari（API 差异）。
</details>

<details>
<summary><strong>语音识别需要联网吗？</strong></summary>

Web Speech API 需要联网，语音数据会发送到 Google 服务器进行处理。如果不使用录音功能，无需联网。
</details>

<details>
<summary><strong>如何备份数据？</strong></summary>

目前需要手动备份：
1. 打开 `chrome://extensions/`
2. 找到 CoreTab，点击「详情」
3. 点击「扩展程序选项」
4. 使用导出功能备份标签页和会议记录

未来版本将支持自动云同步。
</details>

<details>
<summary><strong>为什么还原后是新窗口？</strong></summary>

这是有意设计，避免打乱当前工作流。你可以在新窗口中继续工作，或手动拖拽标签页到现有窗口。
</details>

<details>
<summary><strong>可以自定义快捷键吗？</strong></summary>

可以。访问 `chrome://extensions/shortcuts`，找到 CoreTab，自定义所有快捷键。
</details>

---

## 性能指标

基于实际测试的性能数据：

| 指标 | 数值 | 说明 |
|------|------|------|
| 扩展包大小 | ~200KB | 无框架依赖 |
| 首次加载时间 | < 500ms | 冷启动 |
| 标签页渲染 | < 1s | 1000 个标签页 |
| 搜索响应 | < 100ms | 实时搜索 |
| 内存占用 | < 50MB | 1000 个标签页 |
| 存储占用 | < 5MB | 10000 条记录 |

---

## 路线图

### v2.5.0（计划中）

- [ ] 标签页去重选项
- [ ] 自动保存设置
- [ ] 分组排序（时间/名称/数量）
- [ ] 批量操作增强

### v3.0.0（规划中）

- [ ] 云同步（可选）
- [ ] 标签页快照历史
- [ ] AI 智能分组
- [ ] 跨设备同步

### 长期愿景

- [ ] 协作功能（团队标签页共享）
- [ ] 知识图谱（标签页关系可视化）
- [ ] 语音助手集成
- [ ] 跨浏览器支持（Firefox、Safari）

---

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题

如果遇到 Bug 或有功能建议，请[创建 Issue](https://github.com/xiaopengs/coretab/issues)，包含：

- 问题描述
- 复现步骤
- 预期行为
- 实际行为
- 浏览器版本
- 截图（如适用）

### 提交代码

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

### 代码审查

所有 Pull Request 都需要经过代码审查。请确保：

- 代码符合项目规范
- 添加必要的测试
- 更新相关文档
- 通过所有 CI 检查

---

## 致谢

- 设计灵感来自 [OneTab](https://www.one-tab.com/)
- 图标使用 SVG 绘制
- 感谢所有贡献者和用户

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**如果这个项目对你有帮助，欢迎 ⭐ Star 支持！**

[GitHub](https://github.com/xiaopengs/coretab) · [Issues](https://github.com/xiaopengs/coretab/issues) · [Changelog](CHANGELOG.md)

Made with ❤️ by CoreTab Team

</div>
