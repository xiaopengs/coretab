/* CoreTab Quick Navigation: editable compact cards for frequently used websites. */

function normalizeQuickNavUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return null;
  }
}

function createQuickNavId() {
  return 'nav-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function getQuickNavDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function getQuickNavLinks() {
  try {
    const result = await chrome.storage.local.get(QUICK_NAV_KEY);
    const links = result[QUICK_NAV_KEY];
    if (Array.isArray(links) && links.length > 0) return links;
  } catch (err) {
    console.error('[coretab] Failed to load quick nav:', err);
  }

  const defaults = DEFAULT_QUICK_NAV_LINKS.map(link => ({
    id: createQuickNavId(),
    title: link.title,
    url: normalizeQuickNavUrl(link.url),
    createdAt: Date.now()
  }));
  await saveQuickNavLinks(defaults);
  return defaults;
}

async function saveQuickNavLinks(links) {
  await chrome.storage.local.set({ [QUICK_NAV_KEY]: links });
}

async function loadQuickNav() {
  const links = await getQuickNavLinks();
  renderQuickNav(links);
}

function renderQuickNav(links) {
  const grid = document.getElementById('quickNavGrid');
  const count = document.getElementById('quickNavCount');
  if (!grid) return;

  if (count) count.textContent = `${links.length} sites`;

  grid.innerHTML = links.map(link => {
    const domain = getQuickNavDomain(link.url);
    return `
      <div class="quick-nav-card" data-action="open-quick-nav" data-url="${escapeHtml(link.url)}" title="${escapeHtml(link.url)}">
        <img class="quick-nav-favicon" src="https://www.google.com/s2/favicons?domain=${escapeHtml(domain)}&sz=32" alt="" data-fallback loading="lazy" decoding="async">
        <div class="quick-nav-text">
          <div class="quick-nav-title">${escapeHtml(link.title || domain || link.url)}</div>
          <div class="quick-nav-url">${escapeHtml(domain || link.url)}</div>
        </div>
        <div class="quick-nav-card-actions">
          <button class="quick-nav-icon-btn" data-action="edit-quick-nav" data-id="${escapeHtml(link.id)}" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </button>
          <button class="quick-nav-icon-btn danger" data-action="delete-quick-nav" data-id="${escapeHtml(link.id)}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('') + `
    <button class="quick-nav-add-card" data-action="add-quick-nav">
      <span>+</span>
      Add Site
    </button>
  `;
}

function openQuickNavModal(link) {
  const overlay = document.getElementById('quickNavOverlay');
  const title = document.getElementById('quickNavModalTitle');
  const idInput = document.getElementById('quickNavEditId');
  const titleInput = document.getElementById('quickNavTitleInput');
  const urlInput = document.getElementById('quickNavUrlInput');
  if (!overlay || !idInput || !titleInput || !urlInput) return;

  if (title) title.textContent = link ? 'Edit Website' : 'Add Website';
  idInput.value = link?.id || '';
  titleInput.value = link?.title || '';
  urlInput.value = link?.url || '';

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('visible'));
  setTimeout(() => titleInput.focus(), 80);
}

function closeQuickNavModal() {
  const overlay = document.getElementById('quickNavOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 160);
}

async function saveQuickNavFromModal() {
  const id = document.getElementById('quickNavEditId')?.value || '';
  const title = (document.getElementById('quickNavTitleInput')?.value || '').trim();
  const normalizedUrl = normalizeQuickNavUrl(document.getElementById('quickNavUrlInput')?.value || '');

  if (!title || !normalizedUrl) {
    showToast('Please enter a valid name and URL');
    return;
  }

  const links = await getQuickNavLinks();
  const existingIndex = links.findIndex(link => link.id === id);
  const nextLink = {
    id: id || createQuickNavId(),
    title,
    url: normalizedUrl,
    createdAt: existingIndex >= 0 ? links[existingIndex].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    links[existingIndex] = nextLink;
  } else {
    links.push(nextLink);
  }

  await saveQuickNavLinks(links);
  closeQuickNavModal();
  renderQuickNav(links);
  showToast(existingIndex >= 0 ? 'Website updated' : 'Website added');
}

async function editQuickNavLink(id) {
  const links = await getQuickNavLinks();
  const link = links.find(item => item.id === id);
  if (link) openQuickNavModal(link);
}

async function deleteQuickNavLink(id) {
  const links = await getQuickNavLinks();
  const nextLinks = links.filter(link => link.id !== id);
  await saveQuickNavLinks(nextLinks);
  renderQuickNav(nextLinks);
  showToast('Website removed');
}
