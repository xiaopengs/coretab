# Recent Tabs 功能需求文档

## 1. 需求背景

### 1.1 问题描述
- 用户每天在飞书中打开大量文档链接
- 这些文档链接分散在不同的聊天、会议记录中，难以查找和归纳
- 用户需要快速访问最近打开的飞书文档
- 类似的场景：Notion文档、Confluence页面、内部系统链接等

### 1.2 目标
- 快速访问最近打开的特定类型的页面（如飞书文档）
- 自动记录访问历史
- 按网站分组显示，方便查找
- 支持快速搜索和过滤

---

## 2. 功能设计

### 2.1 核心功能

#### 2.1.1 Recent Tabs 区域
- 显示在页面顶部或 GitHub Trending 下方
- 只记录特定类型的链接（通过配置指定）
- 按访问时间倒序排列（最新的在最前面）

#### 2.1.2 智能分组
- 自动按网站/域名分组（如飞书文档、Notion、内部系统等）
- 每个分组显示最近访问的链接
- 分组按访问热度排序（最常访问的在最前面）

#### 2.1.3 快速搜索
- 在 Recent Tabs 区域内置搜索框
- 可以按标题、URL快速过滤
- 实时搜索，无需点击确认

#### 2.1.4 快速访问
- 点击链接直接打开
- 支持右键菜单（新标签页打开、复制链接等）
- 鼠标悬停显示预览信息

#### 2.1.5 配置功能
- 可自定义要记录的网站列表
- 可设置保留多少条记录
- 可手动删除不需要的记录

---

## 3. 用户体验设计

### 3.1 界面布局
```
┌─────────────────────────────────────────────────────────┐
│  [搜索 Recent Tabs...]  [⚙️ 设置]                       │
├─────────────────────────────────────────────────────────┤
│  📄 飞书文档 (12)                                        │
│  ├─ [项目进度报告] https://feishu.cn/doc/xxx...  2m ago │
│  ├─ [需求文档] https://feishu.cn/doc/yyy...      5m ago │
│  └─ [会议纪要] https://feishu.cn/doc/zzz...      10m ago│
│                                                         │
│  📝 Notion (8)                                          │
│  ├─ [个人笔记] https://notion.so/xxx...         15m ago│
│  └─ [技术备忘] https://notion.so/yyy...         20m ago│
│                                                         │
│  🏢 内部系统 (5)                                         │
│  ├─ [考勤系统] https://internal.company/...     25m ago│
│  └─ [报销系统] https://internal.company/...     30m ago│
└─────────────────────────────────────────────────────────┘
```

### 3.2 交互流程

#### 3.2.1 访问记录
1. 用户打开一个页面
2. 检查是否在配置的记录列表中
3. 如果是，记录到 Recent Tabs
4. 更新访问时间和计数

#### 3.2.2 搜索流程
1. 用户在搜索框输入关键词
2. 实时过滤匹配的链接
3. 高亮显示匹配的部分
4. 按相关度排序

#### 3.2.3 设置流程
1. 点击设置按钮
2. 弹出设置面板
3. 配置要记录的网站
4. 配置保留数量
5. 点击保存

---

## 4. 技术实现

### 4.1 数据结构

```javascript
// localStorage 存储结构
const RECENT_TABS_KEY = 'coretab_recent_tabs';

interface RecentTab {
  url: string;
  title: string;
  hostname: string;
  visitedAt: number; // 最后访问时间戳
  visitCount: number; // 访问次数
}

interface RecentTabsConfig {
  enabled: boolean;
  trackedDomains: string[]; // 要记录的域名列表
  maxPerDomain: number; // 每个域名最多保留多少条
  maxTotal: number; // 总共最多保留多少条
}
```

### 4.2 默认配置

```javascript
const DEFAULT_CONFIG: RecentTabsConfig = {
  enabled: true,
  trackedDomains: [
    'feishu.cn',
    'larksuite.com',
    'notion.so',
    'docs.google.com',
    'confluence.*' // 支持通配符
  ],
  maxPerDomain: 10,
  maxTotal: 50
};
```

### 4.3 关键函数

```javascript
// 检查是否应该记录该URL
function shouldTrackUrl(url: string): boolean

// 记录访问
function trackVisit(url: string, title: string): void

// 获取最近的标签页
function getRecentTabs(): RecentTab[]

// 按域名分组
function groupByDomain(tabs: RecentTab[]): Record<string, RecentTab[]>

// 搜索功能
function searchRecentTabs(keyword: string): RecentTab[]
```

---

## 5. 验收标准

### 5.1 功能验收
- [ ] 能正确记录飞书文档等指定网站的访问
- [ ] 能按网站分组显示最近访问的链接
- [ ] 能搜索并快速定位需要的文档
- [ ] 点击链接能正常打开
- [ ] 配置功能正常工作
- [ ] 数据持久化正常（刷新页面不丢失）

### 5.2 性能验收
- [ ] 记录访问延迟 < 10ms
- [ ] 搜索响应 < 50ms
- [ ] 页面加载不影响体验

### 5.3 兼容性验收
- [ ] Chrome 90+
- [ ] Edge 90+
- [ ] Brave 1.30+

---

## 6. 版本规划

### v2.3.0 (MVP)
- [x] 基本的记录功能
- [x] 按分组显示
- [x] 点击打开
- [x] 默认配置飞书、Notion等常见网站

### v2.4.0
- [ ] 搜索功能
- [ ] 设置面板
- [ ] 右键菜单

### v2.5.0
- [ ] 通配符支持
- [ ] 智能推荐（基于访问频率）
- [ ] 导出/导入功能

---

## 7. 风险评估

### 7.1 隐私风险
- 只记录用户配置的网站
- 不记录敏感信息
- 数据只在本地存储

### 7.2 性能风险
- 限制最大记录数量
- 使用 localStorage 而不是 chrome.storage（更快）
- 异步处理记录操作

---

## 8. 后续优化方向

1. **智能分类**：根据内容自动分类
2. **标签系统**：支持用户自定义标签
3. **云同步**：支持跨设备同步（可选）
4. **访问统计**：显示访问频率图表
5. **快捷命令**：支持键盘快捷键快速访问
