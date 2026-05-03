# CoreTab

> 下一代智能新标签页 — 标签管理 + Closed Tabs + GitHub Trending

<p align="center">
  <strong>告别混乱的标签页，一个清新高效的新标签页替代工具</strong>
</p>

<p align="center">
  <a href="https://github.com/xiaopengs/coretab">GitHub</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#安装使用">安装使用</a> •
  <a href="#设计规范">设计规范</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.1.0-078a52?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Manifest-V3-4285f4?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-fc7981?style=flat-square" alt="License">
</p>

---

## 简介

CoreTab 是一款 Chrome 扩展，替代浏览器默认新标签页，提供：

- **标签管理** — 查看、关闭、分组当前打开的标签页（按窗口分组）
- **Closed Tabs** — 记录已关闭的标签，按日期和网站分组，可一键找回
- **GitHub Trending** — 展示热门 GitHub 项目，发现有趣的开源仓库
- **历史记录** — 按网站分组浏览历史，快速访问常用网站

### 解决什么问题？

- 🐌 打开太多标签页导致浏览器卡顿
- 😰 误关闭标签页后找不到
- 📋 需要在新标签页快速访问常用网站
- 🔥 想发现 GitHub 上的热门项目

---

## 功能特性

### Open Tabs — 窗口分组管理

```
┌─────────────────────────────────────────────────────────────┐
│  Open Tabs                              2 windows · 15 tabs │
│  ┌───────────────────────┐  ┌───────────────────────┐      │
│  │ ▢ Current Window  [×] │  │ ▢ Window 2      [×] │      │
│  │ GitHub  5      [× 5] │  │ YouTube  3    [× 3] │      │
│  │ [repo] [issue] [pr]  │  │ [vid1] [vid2]       │      │
│  │ Google  3      [× 3] │  │ Twitter  2    [× 2] │      │
│  │ [search][mail][doc]  │  │                       │      │
│  └───────────────────────┘  └───────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

- **按窗口分组** — 多窗口时左右并排显示，紧凑高效
- **域名聚合** — 同一域名的标签合并显示
- **一键关闭** — 关闭单个、域名下全部、窗口全部
- **点击访问** — 点击标签页立即跳转

### Closed Tabs — 误关闭恢复

```
┌─────────────────────────────────────────────────────────────┐
│  Closed Tabs                              Today · 8 closed  │
│  Today                                                     │
│  ┌───────────────────┐  ┌───────────────────┐            │
│  │ 📦 GitHub    [⧉] │  │ 📦 YouTube  [⧉] │            │
│  │ 5 closed         │  │ 3 closed         │            │
│  │ [repo] [issue]  │  │ [vid1] [vid2]   │            │
│  │ Show more ▼      │  │                   │            │
│  └───────────────────┘  └───────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

- **按日期分组** — Today / Yesterday / Earlier
- **按网站聚合** — 同一天内按网站分组
- **一键恢复** — 点击标签页立即恢复，或一键恢复整个网站
- **本地存储** — 保护隐私，随时可查

### GitHub Trending — 发现热门项目

- **卡片展示** — 2列网格布局，清晰美观
- **显示详情** — 仓库名、描述、star数量
- **一键访问** — 点击跳转到 GitHub 页面

### History — 浏览足迹

- **按网站分组** — 自动聚合同一网站的访问记录
- **访问次数** — 显示每站点的访问次数
- **Show more** — 展开查看更多历史

---

## 安装使用

### 开发者模式安装

1. 下载或克隆本项目到本地
   ```bash
   git clone https://github.com/xiaopengs/coretab.git
   ```

2. 打开 Chrome，访问 `chrome://extensions/`

3. 开启右上角的「**开发者模式**」

4. 点击「**加载已解压的扩展程序**」

5. 选择 `CoreTab` 文件夹

6. 打开新标签页验证

---

## 设计规范

CoreTab 采用 **Clay/Swatch Palette** 设计系统：

| 用途 | 颜色 | Hex |
|------|------|-----|
| 背景 | Warm Cream | #faf9f7 |
| 卡片背景 | Pure White | #ffffff |
| 边框 | Oat Border | #dad4c8 |
| 主强调 | Matcha Green | #078a52 |
| 次强调 | Slushie Cyan | #3bd3fd |
| 警告 | Pomegranate | #fc7981 |

### 设计特点

- 暖奶油色背景，营造温暖氛围
- 燕麦色边框，柔和不刺眼
- 胶囊按钮，现代化交互
- 悬停动画，轻微旋转+放大

---

## 项目结构

```
CoreTab/
├── manifest.json          # 扩展清单（Manifest V3）
├── index.html             # 新标签页主页面
├── app.js                 # 主应用逻辑
├── style.css              # 样式文件
├── background.js          # 后台服务脚本
├── icons/                 # 图标资源
│   ├── icon.svg          # 矢量图标
│   ├── icon16.png        # 16px 图标
│   ├── icon48.png        # 48px 图标
│   └── icon128.png       # 128px 图标
└── doc/                   # 文档
    ├── PRD.md             # 产品需求文档
    └── TEST.md            # 测试用例文档
```

---

## 技术栈

- **Manifest V3** — 最新 Chrome 扩展规范
- **Vanilla JavaScript** — 无框架依赖，轻量高效
- **CSS Grid + Flexbox** — 现代布局方案
- **localStorage** — 本地数据存储

---

## 许可证

MIT License

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/xiaopengs">xiaopengs</a>
</p>
