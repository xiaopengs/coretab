/* CoreTab Recent Tabs: tracking, grouping, and rendering. */
// ============================================================
// RECENT TABS
// ============================================================

// Check if a URL should be tracked
async function shouldTrackUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const trackedDomains = await getTrackedDomains();
    return trackedDomains.some(domain => {
      if (domain.includes('*')) {
        // Simple wildcard support (e.g., *.example.com)
        const wildcardDomain = domain.replace('*.', '');
        return hostname === wildcardDomain || hostname.endsWith('.' + wildcardDomain);
      }
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch {
    return false;
  }
}

// Get recent tabs from storage (chrome.storage.local for cross-context access)
async function getRecentTabs() {
  try {
    const result = await chrome.storage.local.get(RECENT_TABS_KEY);
    return result[RECENT_TABS_KEY] || [];
  } catch {
    return [];
  }
}

// Save recent tabs to storage
async function saveRecentTabs(tabs) {
  try {
    await chrome.storage.local.set({ [RECENT_TABS_KEY]: tabs });
  } catch (err) {
    console.error('[coretab] saveRecentTabs: chrome.storage.local write failed', err);
  }
}

// Pure: drop recent entries older than the retention window. Returns
// the filtered array. Safe to call on any input.
function pruneRecentTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  const cutoff = Date.now() - MAX_RECENT_TABS_AGE_DAYS * 86400000;
  return tabs.filter(t => t && typeof t.visitedAt === 'number' && t.visitedAt >= cutoff);
}

// Convenience: load → prune → save (no-op if nothing to prune).
async function pruneAndSaveRecentTabs() {
  try {
    const tabs = await getRecentTabs();
    const pruned = pruneRecentTabs(tabs);
    if (pruned.length < tabs.length) {
      await saveRecentTabs(pruned);
      console.log(`[coretab] Pruned ${tabs.length - pruned.length} expired recent-tab entries`);
    }
  } catch (err) {
    console.error('[coretab] pruneAndSaveRecentTabs failed:', err);
  }
}

// Add or update a tab visit
async function addRecentTab(url, title, visitedAt) {
  if (!(await shouldTrackUrl(url))) return;

  const hostname = extractHostname(url);
  const now = visitedAt || Date.now();
  let tabs = await getRecentTabs();

  // Check if tab already exists
  const existingIndex = tabs.findIndex(t => t.url === url);
  if (existingIndex !== -1) {
    // Only update visitedAt if newer (for backfill merging)
    if (now > tabs[existingIndex].visitedAt) {
      tabs[existingIndex].visitedAt = now;
    }
    tabs[existingIndex].visitCount = (tabs[existingIndex].visitCount || 1) + 1;
    tabs[existingIndex].title = title || tabs[existingIndex].title;
  } else {
    // Add new tab
    tabs.unshift({
      url,
      title: title || url,
      hostname,
      visitedAt: now,
      visitCount: 1
    });
  }

  // Sort by visitedAt (newest first)
  tabs.sort((a, b) => b.visitedAt - a.visitedAt);

  // Drop entries older than the retention window, then enforce the count cap.
  // Pruning here means the on-disk set is bounded by both time and count
  // even if pruneAndSaveRecentTabs() was never called at startup.
  tabs = pruneRecentTabs(tabs);
  tabs = tabs.slice(0, RECENT_MAX_TOTAL);

  await saveRecentTabs(tabs);
}

// Group recent tabs by domain
async function getRecentTabsGrouped() {
  const tabs = await getRecentTabs();
  const trackedDomains = await getTrackedDomains();

  // Group by hostname (only tracked domains)
  const groups = {};
  for (const tab of tabs) {
    const isTracked = trackedDomains.some(d => {
      if (d.includes('*')) {
        const wildcard = d.replace('*.', '');
        return tab.hostname === wildcard || tab.hostname.endsWith('.' + wildcard);
      }
      return tab.hostname === d || tab.hostname.endsWith('.' + d);
    });
    if (!isTracked) continue;
    if (!groups[tab.hostname]) {
      groups[tab.hostname] = [];
    }
    groups[tab.hostname].push(tab);
  }

  // Convert to array and limit per domain
  const domains = Object.keys(groups).map(hostname => ({
    domain: hostname,
    label: friendlyDomain(hostname),
    entries: groups[hostname].slice(0, RECENT_MAX_PER_DOMAIN)
  }));

  // Sort by first tab's visit time
  domains.sort((a, b) => b.entries[0].visitedAt - a.entries[0].visitedAt);

  return domains;
}

// Load and render recent tabs
async function loadRecentTabs() {
  try {
    const groups = await getRecentTabsGrouped();
    renderRecentTabs(groups);
  } catch (err) {
    console.error('[coretab] Failed to load recent tabs:', err);
  }
}

// Render recent tabs
function renderRecentTabs(groups) {
  const container = document.getElementById('recentTabsContainer');
  const empty = document.getElementById('recentEmpty');
  const countEl = document.getElementById('recentSectionCount');

  if (!container) return;

  // Count total recent tabs
  let totalRecent = 0;
  for (const site of groups) {
    totalRecent += site.entries.length;
  }

  if (totalRecent === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = `${totalRecent} pages`;

  container.innerHTML = `
    <div class="recent-sites">
      ${groups.map(site => `
        <div class="recent-card">
          <div class="recent-card-header">
            <div class="recent-card-info">
              <img class="recent-card-favicon" src="${getFaviconSrc(site.domain)}" alt="" data-fallback loading="lazy" decoding="async">
              <span class="recent-card-name">${escapeHtml(site.label)}</span>
              <span class="recent-card-badge">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                ${site.entries.length}
              </span>
            </div>
          </div>
          <div class="recent-pages">
            ${site.entries.slice(0, 5).map(entry => `
              <div class="recent-page-item" data-action="open-recent" data-tab-url="${escapeHtml(entry.url)}">
                <span class="recent-page-title">${escapeHtml(smartTitle(entry.title, entry.url))}</span>
                <span class="recent-page-time">${timeAgo(entry.visitedAt)}</span>
              </div>
            `).join('')}
            ${site.entries.length > 5 ? `
              <button class="page-more-btn" data-action="more-recent" data-domain="${escapeHtml(site.domain)}" data-label="${escapeHtml(site.label)}">
                +${site.entries.length - 5} more
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
