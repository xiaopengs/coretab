/* CoreTab config/state: constants, shared state, Recent Tabs rule storage. */
/* ============================================================
   CoreTab — Main Application Logic
   Default New Tab Page with Tab Management + GitHub Trending
   ============================================================ */

'use strict';

// State
let windowGroups = [];  // [{windowId, windowName, domains: [{domain, label, tabs}]}]
let historyGroups = [];

// Constants
const LANDING_PAGE_PATTERNS = [
  { hostname: 'mail.google.com', pathExact: ['/mail/u/0/', '/mail/u/1/'] },
  { hostname: 'github.com', pathExact: ['/'] },
  { hostname: 'twitter.com', pathExact: ['/home'] },
  { hostname: 'x.com', pathExact: ['/home'] },
];

const GITHUB_API_URL = 'https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=6';

// DEFAULT_FAVICON and capture-phase error handler are now in coretab-favicon-cache.js

const GITHUB_CACHE_KEY = 'coretab_github_trending';
const GITHUB_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://', 'devtools://'
];

// 例外：这些chrome://页面应该显示在opentabs下面
const ALLOWED_CHROME_PAGES = [
  'chrome://newtab/',
  'chrome://newtab',
  'chrome://extensions/',
  'chrome://extensions'
];

const CLOSED_TABS_KEY = 'coretab_closed_tabs';
const MAX_TABS_PER_DOMAIN = 20;
const MAX_TABS_PER_DAY = 100;

// Quick Navigation
const QUICK_NAV_KEY = 'coretab_quick_nav';
const DEFAULT_QUICK_NAV_LINKS = [
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Notion', url: 'https://www.notion.so' },
  { title: 'Feishu', url: 'https://www.feishu.cn' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Kimi', url: 'https://kimi.moonshot.cn' },
  { title: 'DeepSeek', url: 'https://chat.deepseek.com' },
  { title: '智谱 GLM', url: 'https://chatglm.cn' },
  { title: '腾讯 SkillHub', url: 'https://skillhub.tencent.com' }
];

// Recent Tabs
const RECENT_TABS_KEY = 'coretab_recent_tabs';
const RECENT_TABS_CONFIG_KEY = 'coretab_recent_config';
const DEFAULT_TRACKED_DOMAINS = [
  'feishu.cn',
  'larksuite.com',
  'notion.so',
  'docs.google.com',
  'drive.google.com',
  'slides.google.com',
  'sheets.google.com',
  'elink.e.hihonor.com'
];
const RECENT_MAX_PER_DOMAIN = 50;
const RECENT_MAX_TOTAL = 200;

// 当前跟踪域名列表（内存缓存，从 storage 或默认值加载）
let _trackedDomains = null;

async function getTrackedDomains() {
  if (_trackedDomains !== null) return _trackedDomains;
  try {
    const data = await chrome.storage.local.get(RECENT_TABS_CONFIG_KEY);
    const domains = data[RECENT_TABS_CONFIG_KEY];
    if (domains && Array.isArray(domains)) {
      _trackedDomains = domains;
      return domains;
    }
  } catch (err) {
    console.error('[coretab] Failed to read filter config:', err);
  }
  _trackedDomains = [...DEFAULT_TRACKED_DOMAINS];
  return _trackedDomains;
}

async function saveTrackedDomains(domains) {
  _trackedDomains = domains;
  await chrome.storage.local.set({ [RECENT_TABS_CONFIG_KEY]: domains });
}
