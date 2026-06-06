/* CoreTab utilities: URL/domain grouping, title/time/number helpers. */
// URL Utilities
function isSystemUrl(url) {
  if (!url) return true;
  // 先检查是否是允许的页面
  if (ALLOWED_CHROME_PAGES.some(p => url === p)) {
    return false;
  }
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
}

function extractHostname(url) {
  if (!url) return null;
  // 处理允许的chrome页面
  if (url === 'chrome://newtab/' || url === 'chrome://newtab') {
    return 'new-tab';
  }
  if (url === 'chrome://extensions/' || url === 'chrome://extensions') {
    return 'extensions';
  }
  try {
    if (url.startsWith('file://')) return 'local-files';
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isLandingPage(url) {
  try {
    const parsed = new URL(url);
    return LANDING_PAGE_PATTERNS.some(p => {
      if (parsed.hostname !== p.hostname) return false;
      if (p.pathExact) return p.pathExact.includes(parsed.pathname);
      return parsed.pathname === '/';
    });
  } catch {
    return false;
  }
}

function groupTabsByDomain(tabs) {
  const groupMap = {};
  const landingTabs = [];

  for (const tab of tabs) {
    if (!tab.hostname) continue;
    if (isLandingPage(tab.url)) {
      landingTabs.push(tab);
      continue;
    }
    if (!groupMap[tab.hostname]) {
      groupMap[tab.hostname] = { domain: tab.hostname, label: friendlyDomain(tab.hostname), tabs: [] };
    }
    groupMap[tab.hostname].tabs.push(tab);
  }

  const groups = Object.values(groupMap).sort((a, b) => b.tabs.length - a.tabs.length);
  if (landingTabs.length > 0) {
    groups.unshift({ domain: '__landing__', label: 'Homepages', tabs: landingTabs });
  }
  return groups;
}

function groupHistoryByDomain(history) {
  const groupMap = {};
  for (const entry of history) {
    const hostname = extractHostname(entry.url);
    if (!hostname || isSystemUrl(entry.url)) continue;
    if (!groupMap[hostname]) {
      groupMap[hostname] = { domain: hostname, label: friendlyDomain(hostname), visitCount: 0, entries: [] };
    }
    groupMap[hostname].entries.push(entry);
    groupMap[hostname].visitCount++;
  }
  return Object.values(groupMap).sort((a, b) => b.visitCount - a.visitCount);
}

function friendlyDomain(hostname) {
  if (!hostname) return '';
  const map = {
    'github.com': 'GitHub', 'youtube.com': 'YouTube', 'twitter.com': 'X', 'x.com': 'X',
    'reddit.com': 'Reddit', 'stackoverflow.com': 'Stack Overflow', 'google.com': 'Google',
    'mail.google.com': 'Gmail', 'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive',
    'localhost': 'Localhost', 'local-files': 'Local Files',
  };
  if (map[hostname]) return map[hostname];
  return hostname.replace(/\.(com|org|net|io|co|ai|dev|app)$/, '').split('.').pop();
}

function smartTitle(title, url) {
  if (!url) return title || '';
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'github.com' && pathname.startsWith('/')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const [owner, repo, ...rest] = parts;
        if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
        if (rest[0] === 'pull' && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
        if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
        if (parts.length === 2) return `${owner}/${repo}`;
      }
    }
    return stripTitleNoise(title) || hostname;
  } catch {
    return stripTitleNoise(title);
  }
}

function stripTitleNoise(title) {
  if (!title) return '';
  return title.replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\([\d,]+\+?\)\s*/g, ' ').replace(/\s*[\-‐-―]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '').trim();
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// Human-friendly label for a closed-tabs day group.
// Today / Yesterday / weekday name (within ~6 days) / "Mon, Mar 5" / "Mon, Mar 5, 2024"
function formatClosedDateLabel(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const todayStart = startOf(now);
  const thatStart = startOf(date);
  const diffDays = Math.round((todayStart - thatStart) / 86400000);
  const sameYear = date.getFullYear() === now.getFullYear();
  const monthShort = date.toLocaleDateString('en-US', { month: 'short' });
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  if (sameYear) {
    return `${date.toLocaleDateString('en-US', { weekday: 'short' })}, ${monthShort} ${d}`;
  }
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })}, ${monthShort} ${d}, ${y}`;
}

function formatNumber(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}
