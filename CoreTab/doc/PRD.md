# CoreTab PRD - 产品需求文档 (v2.1)

> 新标签页替代 + 标签管理 + 历史记录 + Closed Tabs

## 1. 产品概述

### 1.1 核心价值
CoreTab 是一款 Chrome 扩展，替代浏览器默认新标签页，提供：
- **标签管理** - 查看、关闭、分组当前打开的标签页
- **Closed Tabs** - 记录已关闭的标签，按日期和网站分组，可一键找回
- **历史记录** - 按网站分组浏览历史
- **快速操作** - 一键关闭所有标签
- **GitHub Trending** - 展示热门 GitHub 项目

### 1.2 目标用户
- 经常开大量标签页的用户
- 需要快速整理和关闭标签的工作者
- 希望查看浏览历史分布的用户
- 需要找回误关闭标签的用户

---

## 2. 功能规格

### 2.1 页面布局

> **区域顺序规则**：Open Tabs → Closed Tabs → GitHub Trending → History
> 此顺序为固定规则，后续不随功能增减而改变位置。

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo] CoreTab          Good morning              [⚙️]    │  ← Header
├──────────────────────────────────────────────────────────────┤
│  Open Tabs                                    3 domains · 8 tabs │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ 📦 github.com  │  │ 📦 google.com  │                   │  ← Open Tabs Cards
│  │   Close 5 tabs │  │   Close 3 tabs │                   │
│  └─────────────────┘  └─────────────────┘                   │
├──────────────────────────────────────────────────────────────┤
│  Closed Tabs                              Today · 12 tabs     │
│  Today                                                     │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ 📦 github.com  │  │ 📦 youtube.com │                   │  ← Closed Tabs Cards
│  │   5 closed  [⧉] │  │   3 closed  [⧉]│                   │
│  │   Show more ▼  │  │                 │                   │
│  └─────────────────┘  └─────────────────┘                   │
├──────────────────────────────────────────────────────────────┤
│  GitHub Trending                                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ 🔥 repo/name    │  │ 🔥 repo/name   │                   │  ← GitHub Cards
│  │   description   │  │   description   │                   │
│  │   ★ 12.5k      │  │   ★ 8.2k       │                   │
│  └─────────────────┘  └─────────────────┘                   │
├──────────────────────────────────────────────────────────────┤
│  History                                         4 sites     │  ← History Cards
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ 🕐 github.com  │  │ 🕐 google.com  │                   │
│  │   12 visits    │  │   8 visits     │                   │
│  │   Show more ▼  │  │   Show more ▼  │                   │
│  └─────────────────┘  └─────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 功能模块

#### 2.2.1 Header
| 元素 | 功能 |
|------|------|
| Logo + 名称 | 品牌标识 |
| 问候语 | 根据时间显示 Good morning/afternoon/evening |
| 日期 | 显示当前日期 |
| 设置按钮 | 预留功能入口 |

#### 2.2.2 Open Tabs 区域
| 功能 | 描述 |
|------|------|
| 域名分组卡片 | 按域名分组显示标签 |
| Tab 数量徽章 | 显示每个域名的标签数 |
| 单标签操作 | 点击打开，悬停显示关闭按钮 |
| 域名级别关闭 | Close X tabs 关闭该域名下所有标签 |

#### 2.2.3 Closed Tabs 区域 (新增)
| 功能 | 描述 |
|------|------|
| 日期分组 | 按关闭日期分组（Today / Yesterday / Earlier） |
| 域名分组卡片 | 同一天内按网站分组 |
| 标签列表 | 显示已关闭页面的标题和 URL |
| 单标签恢复 | 点击恢复该标签（在新标签页打开） |
| 一键全部恢复 | 卡片右上角 [⧉] 按钮恢复该网站下所有已关闭标签 |
| 本地存储 | localStorage，按日期分类，网站内按关闭时间倒序 |

#### 2.2.4 History 区域
| 功能 | 描述 |
|------|------|
| 历史分组卡片 | 按网站分组显示访问历史 |
| 访问次数徽章 | 显示每个站点的访问次数 |
| 历史页面列表 | 显示历史页面标题和时间 |
| Show more 展开 | 展开查看更多历史记录 |
| 点击访问 | 点击历史项打开该页面 |

#### 2.2.5 GitHub Trending 区域
| 功能 | 描述 |
|------|------|
| 卡片展示 | 2列卡片布局 |
| 仓库名称 | 显示 full_name |
| 描述 | 显示 description（一句话介绍） |
| Star 数量 | 显示星级数 |
| 点击跳转 | 在新标签页打开仓库页面 |

### 2.3 设计系统

#### 色彩
| 用途 | 颜色 | Hex |
|------|------|-----|
| 背景 | Warm Cream | #faf9f7 |
| 文字 | Clay Black | #000000 |
| 卡片背景 | Pure White | #ffffff |
| 边框 | Oat Border | #dad4c8 |
| 主强调 | Matcha Green | #078a52 |
| 次强调 | Slushie Cyan | #3bd3fd |
| 警告 | Pomegranate | #fc7981 |

#### 圆角
| 元素 | 圆角 |
|------|------|
| 卡片 | 12px |
| 特性卡片 | 24px |
| 按钮 | 1584px (胶囊) |

#### 悬停动画
- 轻微旋转 (-2° ~ -5°)
- 小幅放大 (1.02 ~ 1.08x)
- 柔和阴影替代硬偏移

---

## 3. 用户流程

### 3.1 打开新标签页
```
用户打开新标签页
    ↓
CoreTab 页面加载
    ↓
并行加载：Open Tabs + Closed Tabs + History + GitHub Trending
    ↓
渲染页面
```

### 3.2 关闭标签（记录到 Closed Tabs）
```
用户关闭某标签
    ↓
记录 URL、标题、关闭时间
    ↓
存储到 localStorage Closed Tabs
    ↓
Open Tabs 刷新显示
```

### 3.3 恢复单个已关闭标签
```
用户点击 Closed Tabs 中的某个标签
    ↓
在新标签页打开该 URL
    ↓
该记录从 Closed Tabs 移除
    ↓
添加到 Open Tabs
```

### 3.4 一键恢复网站下所有已关闭标签
```
用户点击卡片右上角 [⧉] 按钮
    ↓
该网站下所有已关闭标签在新标签页依次打开
    ↓
这些记录从 Closed Tabs 批量移除
```

### 3.5 关闭所有标签
```
用户点击 "Close All Tabs"
    ↓
弹出确认对话框
    ↓
用户确认
    ↓
刷新标签列表获取最新状态
    ↓
关闭当前窗口所有其他标签页（保留自己）
    ↓
被关闭的标签记录到 Closed Tabs
    ↓
重新加载 Open Tabs 和 History
    ↓
显示 Toast 提示
```

---

## 4. 数据规格

### 4.1 Chrome API 权限
```json
{
  "permissions": ["tabs", "activeTab", "storage", "history"],
  "host_permissions": ["<all_urls>"]
}
```

### 4.2 系统 URL 过滤
```javascript
const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:',
  'edge://', 'brave://', 'devtools://'
];
```

### 4.3 Closed Tabs 存储格式
```javascript
// localStorage key: "coretab_closed_tabs"
// 数据结构：按日期分组，日期内按网站分组
{
  "2026-05-03": {                                    // 日期字符串
    "github.com": [                                  // 网站域名
      { url: "https://github.com/user/repo", title: "Repo Name", closedAt: 1746259200000 },
      { url: "https://github.com/user/repo2", title: "Repo2", closedAt: 1746259100000 }
    ],
    "youtube.com": [
      { url: "https://youtube.com/watch?v=xxx", title: "Video", closedAt: 1746259000000 }
    ]
  },
  "2026-05-02": {
    "twitter.com": [...]
  }
}

// 最大存储：每个网站最多 20 条，每个日期最多 100 条
// 超过限制时删除最旧的记录
```

### 4.4 GitHub Trending API
- URL: `https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=6`
- 缓存: localStorage，5分钟 TTL

---

## 5. 验收标准

### 5.1 核心功能
- [ ] 新标签页显示 CoreTab 页面
- [ ] 正确显示当前窗口的标签页
- [ ] 按域名分组显示标签
- [ ] 显示历史记录（最近7天）
- [ ] Close All Tabs 关闭所有非系统标签
- [ ] 刷新按钮更新标签列表
- [ ] Show more 展开历史记录

### 5.2 交互反馈
- [ ] Toast 通知显示操作结果
- [ ] 确认对话框防止误操作
- [ ] 按钮悬停动画
- [ ] 空状态显示

### 5.3 设计规范
- [ ] Clay/Swatch Palette 设计系统
- [ ] 暖奶油色背景
- [ ] 燕麦色边框
- [ ] 胶囊按钮样式
- [ ] 悬停旋转动画

---

## 6. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 2.1.0 | 2026-05-03 | 新增 Closed Tabs + GitHub Trending 卡片展示 |
| 1.1.0 | 2026-05-03 | 新标签页替代 + Clay 设计系统 |
| 1.0.0 | 2026-03-21 | OneTab 风格标签管理 |

---

*文档版本: 2.1*
*最后更新: 2026-05-03*
