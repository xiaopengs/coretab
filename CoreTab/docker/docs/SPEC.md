# CoreTab - Technical Specification

## 1. Architecture Overview

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   tabs.html │  │  Background │  │   Content  │    │
│  │   (Full UI) │  │   Script    │  │   Scripts  │    │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘    │
│         │                │                              │
│         └────────┬───────┘                              │
│                  ▼                                      │
│         ┌────────────────┐                              │
│         │ Chrome Storage │                              │
│         │    (Local)     │                              │
│         └────────────────┘                              │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Key Changes from Original Design

| 旧设计 (弹窗) | 新设计 (独立页面) |
|--------------|------------------|
| popup.html | tabs.html |
| 弹窗显示 | 全屏标签页显示 |
| 保存后留在原页面 | 保存后关闭所有标签页，打开CoreTab页面 |
| 列表展示 | 按日期分组展示 |

### 1.2 Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | HTML5, CSS3, JavaScript | ES6+ |
| Extension API | Chrome Extension API | Manifest V3 |
| Storage | chrome.storage.local | - |
| Build | None (Vanilla JS) | - |

---

## 2. Component Design

### 2.1 Popup Module (popup.html + popup.js)

**Responsibilities:**
- Display saved tabs list
- Handle user interactions
- Manage CRUD operations

**Key Functions:**

```javascript
// Core functions
saveAllTabs()     // Save all tabs to storage
closeAllTabs()    // Save and close all tabs
loadSavedTabs()   // Load tabs from storage
restoreTab(tab)   // Restore single tab
deleteTab(id)     // Delete single tab
```

### 2.2 Background Module (background.js)

**Responsibilities:**
- Handle keyboard shortcuts
- Manage extension lifecycle
- Listen for storage changes

**Key Functions:**

```javascript
// Event handlers
onCommand(command)    // Handle keyboard shortcuts
onInstalled()       // Extension installed callback
```

### 2.3 Storage Schema

```typescript
interface SavedTab {
  id: string;          // Unique identifier
  title: string;       // Page title
  url: string;         // Page URL
  favIconUrl: string;  // Favicon URL
  savedAt: number;     // Timestamp (Unix ms)
  groupId: string;     // Group identifier
}

interface TabGroup {
  id: string;           // Group identifier (timestamp-based)
  savedAt: number;      // Group creation timestamp
  tabs: SavedTab[];     // Tabs in this group
  restored: boolean;   // Whether this group has been restored
}

interface StorageData {
  coretab_groups: TabGroup[];   // All saved groups
  coretab_settings: Settings;  // User settings
}

interface Settings {
  theme: 'light' | 'dark';
  restoreInCurrentWindow: boolean;
}
```

---

## 3. Data Flow

### 3.1 Save Tabs Flow (核心流程)

```
User clicks "Save" (from toolbar)
    │
    ▼
Query all tabs in current window (chrome.tabs.query)
    │
    ▼
Filter system tabs (chrome://*, etc.)
    │
    ▼
Check duplicates within the new group
    │
    ▼
Create new TabGroup with timestamp
    │
    ▼
Save group to chrome.storage.local
    │
    ▼
Close all tabs in current window (except pinned)
    │
    ▼
Open CoreTab tabs.html in current window
    │
    ▼
Display saved tabs grouped by date
```

### 3.2 Restore Single Tab Flow

```
User clicks on a tab item
    │
    ▼
Create new tab with the URL
    │
    ▼
Mark tab as restored (optional: remove from list)
    │
    ▼
Show success notification
```

### 3.3 Restore Group Flow

```
User clicks "Restore All" on a group
    │
    ▼
Get all tabs in the group
    │
    ▼
Create new tabs for each URL
    │
    ▼
Mark group as restored
    │
    ▼
Update UI to show restored state
```

---

## 4. UI/UX Design

### 4.1 Layout Structure (OneTab-style)

```
┌──────────────────────────────────────────────────────────────┐
│  CoreTab                                    [🔍] [⚙️] [📥]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📅 今天 14:30                      5 个标签页  [还原] ▶│  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🔗 Google                                        Google │  │
│  │ 🔗 GitHub                                      GitHub  │  │
│  │ 🔗 Stack Overflow                        Stack Overflow│  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📅 昨天 09:15                      3 个标签页  [还原] ▶│  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🔗 Baidu                                          Baidu │  │
│  │ 🔗 微博                                            微博  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Color Palette

| Purpose | Color | Hex |
|---------|-------|-----|
| Primary | Google Blue | #1a73e8 |
| Success | Green | #34a853 |
| Danger | Red | #ea4335 |
| Background | Light Gray | #f8f9fa |
| Card Background | White | #ffffff |
| Text Primary | Dark Gray | #333333 |
| Text Secondary | Gray | #666666 |
| Border | Light Gray | #e0e0e0 |

### 4.3 Dimensions

| Element | Value |
|---------|-------|
| Page Max Width | 800px |
| Card Padding | 16px |
| Card Margin | 12px |
| Tab Item Height | 40px |
| Button Padding | 8px 16px |
| Border Radius | 8px |

---

## 5. API Usage

### 5.1 Chrome Tabs API

```javascript
// Get all tabs
chrome.tabs.query({}, callback)

// Create new tab
chrome.tabs.create({ url: "https://...", active: false })

// Close tabs
chrome.tabs.remove(tabIds, callback)

// Get tab info
chrome.tabs.get(tabId, callback)
```

### 5.2 Chrome Storage API

```javascript
// Save data
chrome.storage.local.set({ key: value }, callback)

// Load data
chrome.storage.local.get(['key'], callback)

// Remove data
chrome.storage.local.remove('key', callback)
```

### 5.3 Chrome Commands API

```javascript
// Register in manifest.json
"commands": {
  "save-all-tabs": {
    "suggested_key": { "default": "Ctrl+Shift+S" },
    "description": "Save all tabs"
  }
}

// Handle in background.js
chrome.commands.onCommand.addListener((command) => {
  // Handle command
});
```

---

## 6. Security Considerations

### 6.1 Permissions

| Permission | Purpose |
|------------|---------|
| tabs | Access tab URLs and titles |
| storage | Store saved tabs locally |
| notifications | Show operation feedback |
| <all_urls> | Allow restoring any URL |

### 6.2 Security Measures

- **URL Validation**: Validate all URLs before saving
- **XSS Prevention**: Escape HTML in tab titles
- **No External Calls**: All data stays local
- **No Tracking**: No analytics or telemetry

---

## 7. Error Handling

### 7.1 Error Cases

| Error | Handling |
|-------|----------|
| No tabs to save | Show "No tabs to save" message |
| Storage full | Show "Storage full" warning |
| Invalid URL | Skip invalid tabs |
| Network error (sync) | Queue for retry |

### 7.2 Logging

- Use `console.error` for errors
- Include error context
- No sensitive data in logs

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Test individual functions
- Mock Chrome APIs

### 8.2 Integration Tests
- Test full user flows
- Test extension loading

### 8.3 Manual Testing
- Test on different Chrome versions
- Test edge cases

---

## 9. File Structure

```
CoreTab/
├── manifest.json           # Extension manifest
├── _locales/               # Localization
│   └── zh_CN/
│       └── messages.json
├── tabs.html               # Main management page (OneTab-style)
├── tabs.js                 # Main page logic
├── styles/
│   └── tabs.css           # Styles for main page
├── background.js           # Background service worker
├── icons/
│   ├── icon16.png         # 16x16 icon
│   ├── icon48.png         # 48x48 icon
│   └── icon128.png        # 128x128 icon
├── doc/
│   ├── PRD.md             # Product Requirements (Chinese)
│   ├── SPEC.md            # Technical Specification
│   ├── TODO.md            # Task List
│   └── TEST.md            # Test Plan
└── README.md              # Documentation
```

---

## 10. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-21 | Initial release - MVP |

---

*Document Version: 1.0*
*Last Updated: 2026-03-21*
