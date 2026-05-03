// CoreTab - Background Service Worker
// Handles badge updates and extension lifecycle

const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'
];

const BADGE_COLORS = {
  low: '#10b981',    // Green — 1-10 tabs
  medium: '#f59e0b',  // Amber — 11-20 tabs
  high: '#ef4444'    // Red — 21+ tabs
};

let badgeUpdatePending = false;
let badgeUpdateScheduled = false;

async function updateBadge() {
  if (badgeUpdatePending) {
    badgeUpdateScheduled = true;
    return;
  }

  badgeUpdatePending = true;

  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(t => {
      const url = t.url || '';
      return !SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
    }).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) {
      badgeUpdatePending = false;
      return;
    }

    const color = count <= 10 ? BADGE_COLORS.low :
                  count <= 20 ? BADGE_COLORS.medium : BADGE_COLORS.high;
    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    chrome.action.setBadgeText({ text: '' });
  }

  badgeUpdatePending = false;

  if (badgeUpdateScheduled) {
    badgeUpdateScheduled = false;
    updateBadge();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadge();
  }
});

updateBadge();
