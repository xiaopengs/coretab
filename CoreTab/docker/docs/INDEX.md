# CoreTab 文档索引

> 本文档是 CoreTab 项目文档的中心索引，帮助开发者快速定位所需信息。

---

## 📚 文档结构

### 核心文档

| 文档 | 说明 | 适合谁 |
|------|------|--------|
| [README.md](../README.md) | 项目介绍、快速开始、功能特性 | 所有用户 |
| [DESIGN.md](./DESIGN.md) | 深度设计文档，架构决策、模块职责、数据流 | 开发者、架构师 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、模块分层、性能优化 | 开发者 |
| [API_REFERENCE.md](./API_REFERENCE.md) | 完整的 API 参考文档 | 开发者 |

### 产品文档

| 文档 | 说明 | 适合谁 |
|------|------|--------|
| [PRD.md](./PRD.md) | 产品需求文档 v2.2 | 产品经理、设计师 |
| [PRD-Recent-Tabs.md](./PRD-Recent-Tabs.md) | Recent Tabs 功能需求 | 产品经理 |
| [需求说明书.md](./需求说明书.md) | 详细需求说明 | 产品经理、开发者 |
| [WORKSPACES-PLAN.md](./WORKSPACES-PLAN.md) | 三工作台实施方案 | 产品经理、开发者 |

### 技术文档

| 文档 | 说明 | 适合谁 |
|------|------|--------|
| [SPEC.md](./SPEC.md) | 技术规格说明 v1.0 | 开发者 |
| [TEST.md](./TEST.md) | 测试方案 v2.1 | 测试工程师、开发者 |
| [TODO.md](./TODO.md) | 待办事项清单 | 项目管理者 |

### 历史文档

| 文档 | 说明 |
|------|------|
| [ONETAB_FEATURES.md](./ONETAB_FEATURES.md) | OneTab 功能参考 |

---

## 🎯 快速导航

### 我是新用户，从哪里开始？

1. 阅读 [README.md](../README.md) 了解 CoreTab 是什么
2. 按照「安装」章节安装扩展
3. 跟随「快速开始」学习基本操作
4. 查看「常见问题」解决常见疑问

### 我是开发者，想了解技术细节

1. 阅读 [DESIGN.md](./DESIGN.md) 了解架构设计
2. 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解模块分层
3. 参考 [API_REFERENCE.md](./API_REFERENCE.md) 学习 API 用法
4. 阅读 [SPEC.md](./SPEC.md) 了解技术规格

### 我想贡献代码

1. 阅读 [README.md](../README.md) 的「贡献指南」章节
2. 查看 [DESIGN.md](./DESIGN.md) 了解代码结构
3. 阅读 [TEST.md](./TEST.md) 了解测试策略
4. 查看 [TODO.md](./TODO.md) 找到可以做的任务

### 我是产品经理，想了解需求

1. 阅读 [PRD.md](./PRD.md) 了解产品定位和功能
2. 查看 [需求说明书.md](./需求说明书.md) 了解详细需求
3. 阅读 [WORKSPACES-PLAN.md](./WORKSPACES-PLAN.md) 了解三工作台设计

---

## 📖 文档详细说明

### DESIGN.md — 深度设计文档

**内容概览**：
- 运行时模型（Service Worker + Extension Page + Storage）
- 脚本加载顺序和依赖关系
- 三工作台导航实现细节
- 模块职责和数据流
- 存储架构和键清单
- 性能优化策略（并发控制、去重、缓存）
- 安全设计（XSS 防护、CSP、权限最小化）
- 设计决策记录（ADR）

**关键章节**：
- §1.2 脚本加载顺序：理解模块依赖关系
- §2.3 Meetings 模块：Web Speech API 集成细节
- §4.1 并发控制：串行 Promise 队列模式
- §7 设计决策记录：了解"为什么这样设计"

### ARCHITECTURE.md — 系统架构文档

**内容概览**：
- 系统架构概览
- 模块架构（数据层、业务层、表现层）
- 三工作台架构（导航、Tabs、Prompts、Meetings）
- 存储架构（策略、键设计、过期策略）
- 性能优化（渲染、存储、网络）
- 安全设计（XSS、CSP、权限）
- 扩展性设计（插件化、配置化、主题）
- 测试策略
- 未来演进

**关键章节**：
- §2.1 核心模块分层：理解三层架构
- §3 三工作台架构：导航和数据流
- §4 存储架构：数据键设计和过期策略

### API_REFERENCE.md — API 参考文档

**内容概览**：
- 全局配置 API
- 数据管理 API（loadOpenTabs、loadClosedTabs 等）
- 标签页操作 API（closeAllTabs、restoreTab 等）
- Recent Tabs API
- Closed Tabs API
- Prompts API
- Meetings API
- UI 组件 API（showToast、showConfirm 等）
- 工具函数（escapeHtml、formatRelativeTime 等）
- 常量参考
- 类型定义

**使用场景**：
- 开发新功能时查找可用的 API
- 理解现有代码时查看函数签名
- 学习数据类型和结构

---

## 🔍 主题索引

### 架构相关

- 运行时模型：[DESIGN.md §1.1](./DESIGN.md#11-运行时模型)
- 脚本加载顺序：[DESIGN.md §1.2](./DESIGN.md#12-脚本加载顺序)
- 模块分层：[ARCHITECTURE.md §2.1](./ARCHITECTURE.md#21-核心模块分层)
- 依赖关系：[ARCHITECTURE.md §2.2](./ARCHITECTURE.md#22-模块依赖关系)

### 三工作台

- 导航系统：[DESIGN.md §1.3](./DESIGN.md#13-三工作台导航)
- Tabs 工作台：[DESIGN.md §2.5](./DESIGN.md#25-tabs-工作台)
- Prompts 工作台：[DESIGN.md §2.2](./DESIGN.md#22-prompts--提示词库)
- Meetings 工作台：[DESIGN.md §2.3](./DESIGN.md#23-meetings--会议记录)

### 存储相关

- 存储分层：[DESIGN.md §3.1](./DESIGN.md#31-存储分层)
- 数据键清单：[DESIGN.md §3.2](./DESIGN.md#32-数据键清单)
- 数据验证：[DESIGN.md §3.3](./DESIGN.md#33-数据验证)
- 过期策略：[ARCHITECTURE.md §4.3](./ARCHITECTURE.md#43-数据过期策略)

### 性能优化

- 并发控制：[DESIGN.md §4.1](./DESIGN.md#41-并发控制)
- 去重策略：[DESIGN.md §4.2](./DESIGN.md#42-去重策略)
- Favicon 缓存：[DESIGN.md §4.3](./DESIGN.md#43-favicon-lru-缓存)
- GitHub 缓存：[DESIGN.md §4.4](./DESIGN.md#44-github-trending-缓存)

### 安全相关

- XSS 防护：[DESIGN.md §5.1](./DESIGN.md#51-xss-防护)
- CSP 策略：[DESIGN.md §5.2](./DESIGN.md#52-csp)
- 权限最小化：[DESIGN.md §5.3](./DESIGN.md#53-权限最小化)

### 设计决策

- 为什么不用 ES Modules：[DESIGN.md §7.1](./DESIGN.md#71-为什么不用-es-modules)
- 为什么用 localStorage：[DESIGN.md §7.2](./DESIGN.md#72-为什么-promptsmeetings-用-localstorage)
- 为什么用 hidden 属性：[DESIGN.md §7.3](./DESIGN.md#73-为什么面板用-hidden-而不是-displaynone)
- 为什么用 Web Speech API：[DESIGN.md §7.4](./DESIGN.md#74-为什么使用-web-speech-api-而不是第三方-asr)

---

## 📊 文档统计

| 类别 | 文档数 | 总行数 | 总大小 |
|------|--------|--------|--------|
| 核心文档 | 4 | 1,743 | ~47KB |
| 产品文档 | 4 | 867 | ~32KB |
| 技术文档 | 3 | 873 | ~31KB |
| 历史文档 | 1 | 95 | ~3KB |
| **总计** | **12** | **3,578** | **~113KB** |

---

## 🔄 文档维护

### 更新频率

- **README.md**：每个版本更新
- **DESIGN.md**：重大架构变更时更新
- **ARCHITECTURE.md**：新增模块或重构时更新
- **API_REFERENCE.md**：API 变更时更新
- **PRD.md**：需求变更时更新
- **TODO.md**：任务状态变化时更新

### 文档规范

- 使用 Markdown 格式
- 中文为主，技术术语保留英文
- 代码示例使用 JavaScript
- 图表使用 ASCII 或 Mermaid
- 保持简洁，避免冗余

### 文档审查

- 新功能：同步更新相关文档
- Bug 修复：更新 CHANGELOG.md
- 架构变更：更新 DESIGN.md 和 ARCHITECTURE.md
- API 变更：更新 API_REFERENCE.md

---

## 📝 文档历史

### v2.4.0 (2026-09-16)

**新增**：
- DESIGN.md：深度设计文档，648 行
- 重写 README.md：简化结构，突出核心价值
- 重写 ARCHITECTURE.md：基于源码的准确描述
- 重写 API_REFERENCE.md：完整的 API 参考

**改进**：
- 统一文档风格
- 增加交叉引用
- 补充设计决策记录
- 完善代码示例

### v2.3.0 (2026-05-03)

**新增**：
- PRD-Recent-Tabs.md：Recent Tabs 功能需求

### v2.2.0 (2026-05-03)

**更新**：
- PRD.md：更新为 v2.2
- TEST.md：更新为 v2.1

### v1.0.0 (2026-03-22)

**初始版本**：
- README.md
- PRD.md
- SPEC.md
- TEST.md
- TODO.md

---

## 💡 使用建议

### 对于开发者

1. **入门**：先读 README.md，再读 DESIGN.md §1-2
2. **深入**：阅读 DESIGN.md §3-5，理解存储和性能
3. **开发**：参考 API_REFERENCE.md 查找 API
4. **决策**：查看 DESIGN.md §7，了解设计理由

### 对于产品经理

1. **了解产品**：读 README.md 和 PRD.md
2. **理解设计**：读 WORKSPACES-PLAN.md
3. **规划功能**：读 TODO.md 和 PRD-Recent-Tabs.md

### 对于测试工程师

1. **了解功能**：读 README.md 和 PRD.md
2. **测试策略**：读 TEST.md
3. **边界情况**：读 DESIGN.md §4 性能设计

### 对于新贡献者

1. **了解项目**：读 README.md
2. **理解架构**：读 DESIGN.md §1-2
3. **找到任务**：读 TODO.md
4. **提交代码**：读 README.md 贡献指南

---

## 🔗 相关链接

- **GitHub 仓库**：https://github.com/xiaopengs/coretab
- **问题反馈**：https://github.com/xiaopengs/coretab/issues
- **更新日志**：[CHANGELOG.md](../CHANGELOG.md)
- **许可证**：[LICENSE](../LICENSE)

---

**文档版本**：v1.0  
**最后更新**：2026-09-16  
**维护者**：CoreTab Team
