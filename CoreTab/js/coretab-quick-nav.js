/* CoreTab Quick Navigation: editable compact cards for frequently used websites. */

let _quickNavResizeObserver = null;
let _quickNavLastLinks = [];

function normalizeQuickNavUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
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

function buildQuickNavLink(link) {
  const url = normalizeQuickNavUrl(link.url);
  return {
    id: createQuickNavId(),
    title: link.title || getQuickNavDomain(url) || 'Untitled',
    url,
    createdAt: Date.now()
  };
}

async function getQuickNavLinks() {
  try {
    const result = await chrome.storage.local.get(QUICK_NAV_KEY);
    const links = result[QUICK_NAV_KEY];
    // Once quick nav has been initialized, storage is the source of truth.
    // Do not re-add deleted default links: user edits/deletions must stick.
    if (Array.isArray(links)) return links.filter(link => link && link.url);
  } catch (err) {
    console.error('[coretab] Failed to load quick nav:', err);
  }

  const defaults = DEFAULT_QUICK_NAV_LINKS.map(buildQuickNavLink).filter(link => link.url);
  await saveQuickNavLinks(defaults);
  return defaults;
}

async function saveQuickNavLinks(links) {
  try {
    await chrome.storage.local.set({ [QUICK_NAV_KEY]: links });
  } catch (err) {
    console.error('[coretab] Failed to save quick nav:', err);
    throw err;
  }
}

async function loadQuickNav() {
  const links = await getQuickNavLinks();
  setupQuickNavResizeObserver();
  renderQuickNav(links);
}

function setupQuickNavResizeObserver() {
  const grid = document.getElementById('quickNavGrid');
  if (!grid || _quickNavResizeObserver) return;
  _quickNavResizeObserver = new ResizeObserver(() => {
    if (_quickNavLastLinks.length > 0) renderQuickNav(_quickNavLastLinks);
  });
  _quickNavResizeObserver.observe(grid);
}

function getQuickNavCollapsedSlots(grid) {
  const minCardWidth = 156;
  const gap = 10;
  const width = grid?.clientWidth || window.innerWidth || minCardWidth;
  const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  return columns * 2;
}

function renderQuickNav(links) {
  const grid = document.getElementById('quickNavGrid');
  const count = document.getElementById('quickNavCount');
  if (!grid) return;

  const safeLinks = Array.isArray(links) ? links.filter(link => link && link.url) : [];
  _quickNavLastLinks = safeLinks;

  if (count) count.textContent = `${safeLinks.length} sites`;

  const slots = getQuickNavCollapsedSlots(grid);
  const hasOverflow = safeLinks.length > slots;
  const visibleLimit = hasOverflow ? Math.max(1, slots - 1) : slots;
  const visibleLinks = safeLinks.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, safeLinks.length - visibleLinks.length);

  grid.innerHTML = visibleLinks.map(link => quickNavCardTemplate(link)).join('') + (hasOverflow ? `
    <button class="quick-nav-more-card" data-action="more-quick-nav">
      <span>+${hiddenCount}</span>
      More
    </button>
  ` : '');
}

function quickNavCardTemplate(link, extraClass = '') {
  const domain = getQuickNavDomain(link.url);
  return `
    <div class="quick-nav-card ${extraClass}" data-action="open-quick-nav" data-url="${escapeHtml(link.url)}" title="${escapeHtml(link.url)}">
      <img class="quick-nav-favicon" src="${getFaviconSrc(domain)}" alt="" data-fallback loading="lazy" decoding="async">
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
}

function setQuickNavError(message) {
  const error = document.getElementById('quickNavError');
  if (!error) return;
  error.textContent = message || '';
  error.style.display = message ? 'block' : 'none';
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
  setQuickNavError('');

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('visible'));
  setTimeout(() => titleInput.focus(), 80);
}

function closeQuickNavModal() {
  const overlay = document.getElementById('quickNavOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setQuickNavError('');
  setTimeout(() => { overlay.style.display = 'none'; }, 160);
}

async function saveQuickNavFromModal() {
  const saveBtn = document.getElementById('quickNavSaveBtn');
  const id = document.getElementById('quickNavEditId')?.value || '';
  const rawTitle = (document.getElementById('quickNavTitleInput')?.value || '').trim();
  const normalizedUrl = normalizeQuickNavUrl(document.getElementById('quickNavUrlInput')?.value || '');

  if (!normalizedUrl) {
    setQuickNavError('Please enter a valid http/https URL.');
    return;
  }

  const title = rawTitle || getQuickNavDomain(normalizedUrl) || 'Untitled';
  const links = await getQuickNavLinks();
  const duplicate = links.find(link => link.id !== id && normalizeQuickNavUrl(link.url) === normalizedUrl);
  if (duplicate) {
    setQuickNavError(`This URL already exists: ${duplicate.title || getQuickNavDomain(duplicate.url)}`);
    return;
  }

  const existingIndex = links.findIndex(link => link.id === id);
  const nextLink = {
    id: id || createQuickNavId(),
    title,
    url: normalizedUrl,
    createdAt: existingIndex >= 0 ? links[existingIndex].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = existingIndex >= 0 ? 'Updating...' : 'Adding...';
    }

    if (existingIndex >= 0) {
      links[existingIndex] = nextLink;
    } else {
      links.push(nextLink);
    }

    await saveQuickNavLinks(links);
    closeQuickNavModal();
    renderQuickNav(links);
    showToast(existingIndex >= 0 ? 'Website updated' : 'Website added');
  } catch {
    setQuickNavError('Failed to save. Please try again.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Confirm';
    }
  }
}

async function editQuickNavLink(id) {
  const links = await getQuickNavLinks();
  const link = links.find(item => item.id === id);
  if (link) openQuickNavModal(link);
}

async function deleteQuickNavLink(id) {
  const links = await getQuickNavLinks();
  const target = links.find(link => link.id === id);
  const nextLinks = links.filter(link => link.id !== id);
  try {
    await saveQuickNavLinks(nextLinks);
    renderQuickNav(nextLinks);
    showToast(target ? `${target.title || 'Website'} removed` : 'Website removed');
    const moreOverlay = document.getElementById('moreModalOverlay');
    if (moreOverlay?.classList.contains('visible')) openQuickNavListModal();
  } catch {
    showToast('Failed to remove website');
  }
}

async function openQuickNavListModal() {
  const links = await getQuickNavLinks();
  openMoreModal(
    `Navigation — ${links.length} sites`,
    links,
    link => quickNavCardTemplate(link, 'quick-nav-list-card')
  );
}
