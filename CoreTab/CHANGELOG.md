# 更新日志

所有重要的更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
- ✨ 分组分享（导出为 HTML）
- ✨ 标签页搜索功能
- ✨ JSON 格式导入/导出
- ✨ 快捷键支持（Ctrl+Shift+S）
- ✨ 多 CoreTab 自动合并
- ✨ 窗口隔离（仅操作当前窗口）
- ✨ 过滤系统页面（chrome://、about: 等）

### 技术细节

- 使用 Chrome Extension Manifest V3
- 数据存储在 chrome.storage.local
- Service Worker 后台脚本
- 响应式 UI 设计

---

## 即将推出

### [1.1.0] - 计划中

- 标签页去重选项
- 自动保存设置
- 分组排序功能
- 批量操作增强

### [1.2.0] - 计划中

- 标签页自定义分组
- 标签页备注功能
- 云同步（可选）

---

[1.0.0]: https://github.com/your-username/coretab/releases/tag/v1.0.0
