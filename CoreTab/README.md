# CoreTab - 标签页管理器

<p align="center">
  <strong>简洁高效的 Chrome 标签页管理工具，灵感源自 OneTab</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装使用">安装使用</a> •
  <a href="#使用指南">使用指南</a> •
  <a href="#项目结构">项目结构</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#贡献指南">贡献指南</a>
</p>

---

## 简介

**CoreTab** 是一款 Chrome 浏览器扩展，帮助你高效管理标签页。一键保存当前窗口的所有标签页，释放浏览器内存，随时可以恢复。

### 解决什么问题？

- 🐌 打开太多标签页导致浏览器卡顿
- 😰 想关闭浏览器但舍不得关闭正在看的页面
- 📋 需要临时清理标签页但不想丢失工作进度
- 🔄 在不同窗口/会话之间整理标签页

### 核心特点

- ✅ **一键保存** - 点击图标即可保存当前窗口所有标签页并关闭
- 📅 **日期分组** - 自动按时间分组，支持相对时间显示（刚刚、5分钟前、昨天等）
- 🪟 **新窗口还原** - 还原时在新浏览器窗口中打开，不影响当前工作
- 🔒 **分组锁定** - 重要分组可锁定防止误删
- 📤 **导出分享** - 导出为 JSON 或 HTML 分享给他人
- 🔍 **快速搜索** - 搜索已保存的标签页
- ⌨️ **快捷键支持** - `Ctrl+Shift+S` 快速保存
- 🔒 **本地存储** - 所有数据存储在本地，保护隐私

---

## 功能特性

### 标签页管理

| 功能 | 描述 |
|------|------|
| 一键保存 | 保存当前窗口所有标签页，自动过滤系统页面 |
| 单个还原 | 点击标签页即可在新标签页中打开 |
| 整组还原 | 一键在新窗口中还原整组标签页 |
| 删除管理 | 支持删除单个标签或整组 |

### 分组功能

| 功能 | 描述 |
|------|------|
| 自动分组 | 按保存时间自动分组（今天/昨天/更早）|
| 自定义命名 | 点击分组名称可自定义命名 |
| 分组锁定 | 锁定重要分组，防止误删 |
| 分组分享 | 导出分组为 HTML 文件分享 |

### 数据管理

| 功能 | 描述 |
|------|------|
| JSON 导出 | 导出所有标签页为 JSON 文件备份 |
| JSON 导入 | 从 JSON 文件导入标签页 |
| HTML 分享 | 生成分组 HTML 页面分享给他人 |

### 窗口隔离

- 所有操作仅在**当前焦点窗口**进行
- 不影响其他浏览器窗口的标签页
- 自动处理多个 CoreTab 页面（只保留一个）

---

## 安装使用

### 方式一：开发者模式（推荐）

1. 下载或克隆本项目到本地
   ```bash
   git clone https://github.com/your-username/coretab.git
   ```

2. 打开 Chrome，访问 `chrome://extensions/`

3. 开启右上角的「**开发者模式**」

4. 点击「**加载已解压的扩展程序**」

5. 选择 `CoreTab` 文件夹

### 方式二：Chrome 商店（即将上线）

*待发布到 Chrome Web Store*

---

## 使用指南

### 基本操作

#### 保存标签页

1. 点击浏览器工具栏中的 **CoreTab 图标**
2. 或使用快捷键 `Ctrl+Shift+S`（Mac: `Cmd+Shift+S`）
3. 当前窗口的所有标签页将被保存并关闭
4. 自动打开 CoreTab 管理页面

#### 还原标签页

- **还原单个**：点击标签页列表中的链接
- **还原整组**：点击分组卡片中的「还原」按钮
- **还原全部**：点击底部「全部还原」按钮

> 💡 还原操作会在**新浏览器窗口**中打开，不影响当前工作

#### 管理分组

- **重命名**：点击分组名称或「更多」→「重命名」
- **锁定**：「更多」→「锁定」，防止误删
- **分享**：「更多」→「分享」，导出为 HTML
- **删除**：「更多」→「删除此组」（锁定的分组需先解锁）

### 搜索标签页

1. 点击右上角搜索图标 🔍
2. 输入关键词搜索标题或 URL
3. 点击关闭按钮退出搜索

### 导入/导出

- **导出**：点击导出图标 ⬆️，导出为 JSON 文件
- **导入**：点击导入图标 ⬇️，从 JSON 文件导入

---

## 项目结构

```
CoreTab/
├── manifest.json          # 扩展清单（Manifest V3）
├── background.js          # 后台服务脚本
├── tabs.html              # 管理页面
├── tabs.js                # 管理页面逻辑
├── styles/
│   └── tabs.css           # 样式文件
├── icons/
│   ├── icon16.png         # 16x16 图标
│   ├── icon48.png         # 48x48 图标
│   └── icon128.png        # 128x128 图标
├── doc/
│   ├── 需求说明书.md       # 产品需求文档
│   ├── SPEC.md            # 技术规格说明
│   ├── TODO.md            # 待办事项
│   └── TEST.md            # 测试方案
├── test/
│   └── test-coretab.js    # 测试脚本
└── README.md              # 项目说明
```

---

## 开发指南

### 技术栈

- **Manifest V3** - 最新的 Chrome 扩展规范
- **Vanilla JavaScript** - 无框架依赖，轻量高效
- **Chrome Extension APIs** - tabs, storage, windows, notifications
- **CSS3** - 现代化 UI 设计

### 核心 API

```javascript
// 获取当前窗口
chrome.windows.getCurrent()

// 获取窗口标签页
chrome.tabs.query({ windowId })

// 创建标签页
chrome.tabs.create({ url, windowId })

// 关闭标签页
chrome.tabs.remove(tabIds)

// 存储数据
chrome.storage.local.set({ key: value })
chrome.storage.local.get(['key'])
```

### 本地开发

1. 克隆项目
   ```bash
   git clone https://github.com/your-username/coretab.git
   cd coretab
   ```

2. 在 Chrome 中加载扩展（参见[安装使用](#安装使用)）

3. 修改代码后，在 `chrome://extensions/` 点击刷新按钮

### 调试

- **后台脚本**：在 `chrome://extensions/` 点击「Service Worker」链接
- **管理页面**：在 CoreTab 页面按 F12 打开开发者工具

---

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题

如果遇到 Bug 或有功能建议，请[创建 Issue](https://github.com/your-username/coretab/issues)，包含：

- 问题描述
- 复现步骤
- 预期行为
- 实际行为
- 浏览器版本

### 提交代码

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

### 代码规范

- 使用 2 空格缩进
- 函数和变量使用 camelCase 命名
- 添加必要的注释
- 保持代码简洁

---

## 版本规划

### v1.0.0（当前版本）

- [x] 一键保存所有标签页
- [x] 按日期分组展示
- [x] 相对时间显示
- [x] 单个/整组还原
- [x] 新窗口还原
- [x] 分组重命名
- [x] 分组锁定
- [x] 分享导出
- [x] 搜索功能
- [x] 导入/导出
- [x] 多 CoreTab 处理
- [x] 窗口隔离

### v1.1.0（计划中）

- [ ] 标签页去重选项
- [ ] 自动保存设置
- [ ] 分组排序（时间/名称/数量）
- [ ] 批量操作增强

### v1.2.0（计划中）

- [ ] 标签页分组（支持自定义分组）
- [ ] 标签页备注
- [ ] 云同步（可选）

### v2.0.0（未来）

- [ ] 跨设备同步
- [ ] 标签页快照历史
- [ ] AI 智能分组

---

## 常见问题

<details>
<summary><strong>Q: 标签页数据存储在哪里？</strong></summary>
<br>
所有数据存储在 Chrome 本地存储（chrome.storage.local），不会上传到任何服务器，保护你的隐私。
</details>

<details>
<summary><strong>Q: 卸载扩展后数据会丢失吗？</strong></summary>
<br>
是的，卸载扩展会清除本地存储。建议定期导出备份。
</details>

<details>
<summary><strong>Q: 支持哪些浏览器？</strong></summary>
<br>
支持所有基于 Chromium 的浏览器：Chrome、Edge、Brave 等。暂不支持 Firefox 和 Safari。
</details>

<details>
<summary><strong>Q: 为什么还原后是打开新窗口？</strong></summary>
<br>
这是有意设计的，目的是不影响你当前的工作窗口。你可以在新窗口中继续工作，或手动合并窗口。
</details>

<details>
<summary><strong>Q: 快捷键可以自定义吗？</strong></summary>
<br>
可以。在 `chrome://extensions/shortcuts` 中可以自定义所有扩展的快捷键。
</details>

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 致谢

- 设计灵感来自 [OneTab](https://www.one-tab.com/)
- 图标使用 SVG 绘制
- 感谢所有贡献者

---

<p align="center">
  如果这个项目对你有帮助，欢迎 ⭐ Star 支持！
</p>

<p align="center">
  Made with ❤️ by CoreTab Team
</p>
