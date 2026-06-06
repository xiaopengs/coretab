/* CoreTab renderers: open/history/closed tab sections. */
function renderOpenTabs(windowGroups) {
  const container = document.getElementById('openTabsMissions');
  const empty = document.getElementById('openTabsEmpty');

  if (!container) return;

  // 计算总域名数
  const totalDomains = windowGroups.reduce((sum, wg) => sum + wg.domains.length, 0);

  if (totalDomains === 0) {
    container.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  container.style.display = 'block';
  empty.style.display = 'none';

  // 按窗口分组渲染，每组之间用全宽 tag 分割线分隔
  container.innerHTML = windowGroups.map((wg, wgIndex) => {
    const windowLabel = wg.isCurrent ? 'Current Window' : `Window ${wgIndex + 1}`;
    const windowTabCount = wg.domains.reduce((sum, d) => sum + d.tabs.length, 0);
    const domainCount = wg.domains.length;

    const domainsHtml = wg.domains.map(g => `
      <div class="mission-card">
        <div class="mission-top">
          <div class="mission-title-row">
            <span class="mission-name">${escapeHtml(g.label)}</span>
            <span class="open-tabs-badge">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              ${g.tabs.length} tabs
            </span>
          </div>
          <button class="action-btn close-all-inline top-right" data-action="close-domain" data-domain="${escapeHtml(g.domain)}" data-window-id="${wg.windowId}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
            Close all
          </button>
        </div>
        <div class="mission-pages">
          ${g.tabs.map(t => `
            <div class="page-chip" data-action="focus-tab" data-tab-url="${escapeHtml(t.url)}" title="${escapeHtml(smartTitle(t.title, t.url))}">
              <img class="chip-favicon" src="${getFaviconSrc(t.hostname, 16)}" alt="" data-fallback loading="lazy" decoding="async">
              <span class="chip-text">${escapeHtml(smartTitle(t.title, t.url))}</span>
              <div class="chip-actions">
                <button class="chip-action chip-close" data-action="close-tab" data-tab-url="${escapeHtml(t.url)}" aria-label="Close tab">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // 窗口分割线：全宽 tag 样式，横跨整个区域
    const dividerHtml = `
      <div class="window-divider">
        <span class="window-divider-tag">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
          ${windowLabel}
          <span class="window-tab-count">${windowTabCount} tabs &middot; ${domainCount} domains</span>
        </span>
        <div class="window-divider-line"></div>
      </div>`;

    return `
      ${wgIndex > 0 ? dividerHtml : ''}
      ${domainsHtml}
    `;
  }).join('');
}function renderHistory(groups) {
  const container = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  const countEl = document.getElementById('historySectionCount');

  if (!container) return;

  if (groups.length === 0) {
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = `${groups.length} sites`;

  const visibleGroups = groups.slice(0, 10);
  const hiddenGroupCount = groups.length - 10;

  container.innerHTML = visibleGroups.map(g => `
    <div class="history-card">
      <div class="history-top">
        <img class="history-favicon" src="${getFaviconSrc(g.domain)}" alt="" data-fallback loading="lazy" decoding="async">
        <span class="history-name">${g.label}</span>
        <span class="history-badge">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          ${g.visitCount} visits
        </span>
      </div>
      <div class="history-pages">
        ${g.entries.map((e, i) => `
          <div class="history-page-item${i >= 3 ? ' hidden' : ''}" data-action="visit-history" data-tab-url="${escapeHtml(e.url)}">
            <span class="history-page-title">${escapeHtml(smartTitle(e.title, e.url))}</span>
            <span class="history-page-time">${timeAgo(e.lastVisitTime)}</span>
          </div>
        `).join('')}
      </div>
      ${g.entries.length > 3 ? `
        <div class="history-toggle" data-action="toggle-history" data-domain="${g.domain}">
          <span class="toggle-text">Show more</span>
          <svg class="toggle-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
          </svg>
        </div>
      ` : ''}
    </div>
  `).join('') +
    (hiddenGroupCount > 0 ? `
    <button class="page-more-btn" data-action="more-history" style="width:100%;margin-top:8px;">
      +${hiddenGroupCount} more sites
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
      </svg>
    </button>
  ` : '');
}

async function loadClosedTabs() {
  try {
    const groups = getClosedTabsGrouped();
    renderClosedTabs(groups);
  } catch (err) {
    console.error('[coretab] Failed to load closed tabs:', err);
  }
}

function renderClosedTabs(groups) {
  const container = document.getElementById('closedTabsContainer');
  const empty = document.getElementById('closedEmpty');
  const countEl = document.getElementById('closedSectionCount');

  if (!container) return;

  // groups: [{dateKey, label, entries: [...]}], already sorted desc by date
  const totalClosed = groups.reduce((s, g) => s + g.entries.length, 0);

  if (totalClosed === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  if (countEl) countEl.textContent = `${totalClosed} closed`;

  container.innerHTML = `
    <div class="closed-day-list">
      ${groups.map(group => `
        <section class="closed-day-group">
          <header class="closed-day-head">
            <span class="closed-day-label">${escapeHtml(group.label)}</span>
            <span class="closed-day-count">${group.entries.length}</span>
          </header>
          <ul class="closed-day-rows" role="list">
            ${group.entries.map(entry => {
              const host = entry.hostname || '';
              const hostLabel = friendlyDomain(host) || host;
              return `
                <li class="closed-row" data-action="reopen-tab" data-tab-url="${escapeHtml(entry.url)}" title="${escapeHtml(entry.title || entry.url)}">
                  <img class="closed-row-favicon" src="${getFaviconSrc(host, 16)}" alt="" data-fallback loading="lazy" decoding="async">
                  <span class="closed-row-text">
                    <span class="closed-row-title">${escapeHtml(entry.title || entry.url)}</span>
                    <span class="closed-row-host">${escapeHtml(hostLabel)}</span>
                  </span>
                  <span class="closed-row-time">${timeAgo(entry.closedAt)}</span>
                  <span class="closed-row-reopen" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                </li>
              `;
            }).join('')}
          </ul>
        </section>
      `).join('')}
    </div>
  `;
}
