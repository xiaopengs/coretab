/* ============================================================
   CoreTab — Favicon Cache Module
   缓存网站图标为 base64，避免每次渲染都从 Google 下载。
   下载失败时自动回退到 DEFAULT_FAVICON（globe SVG）。
   ============================================================ */

'use strict';

const FAVICON_CACHE_KEY = 'coretab_favicon_cache_v1';
const GOOGLE_FAVICON_BASE = 'https://www.google.com/s2/favicons';
const FAVICON_SIZE = 32;

// ── Default fallback SVG ────────────────────────────────
const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5">' +
  '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
);

// ── In-memory cache (domain → dataURL) ──────────────────
let _faviconCache = null;
let _faviconPending = new Set();

// ── Init: load persisted cache on startup ───────────────
async function initFaviconCache() {
  if (_faviconCache) return;
  try {
    const result = await chrome.storage.local.get(FAVICON_CACHE_KEY);
    const stored = result[FAVICON_CACHE_KEY] || {};
    _faviconCache = new Map(Object.entries(stored));
  } catch {
    _faviconCache = new Map();
  }
}

// ── Persist in-memory cache to storage (debounced) ──────
let _persistTimer = null;
function _schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    if (!_faviconCache) return;
    try {
      const obj = Object.fromEntries(_faviconCache);
      await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: obj });
    } catch { /* storage full or unavailable — tolerate */ }
  }, 2000);
}

// ── Get favicon src synchronously ───────────────────────
// Returns cached dataURL if available, otherwise Google favicon URL.
function getFaviconSrc(domain, size) {
  if (!domain) return DEFAULT_FAVICON;
  const sz = size || FAVICON_SIZE;
  if (_faviconCache && _faviconCache.has(domain)) {
    return _faviconCache.get(domain);
  }
  // First render still uses the remote URL so the UI appears immediately;
  // cacheFavicon() runs in the background and subsequent renders use local dataURL.
  cacheFavicon(domain);
  return GOOGLE_FAVICON_BASE + '?domain=' + encodeURIComponent(domain) + '&sz=' + sz;
}

// ── Fetch & cache a single domain's favicon ─────────────
async function cacheFavicon(domain) {
  if (!domain) return;
  // Already cached or fetching → skip
  if (_faviconCache && _faviconCache.has(domain)) return;
  if (_faviconPending.has(domain)) return;
  _faviconPending.add(domain);

  const url = GOOGLE_FAVICON_BASE + '?domain=' + encodeURIComponent(domain) + '&sz=' + FAVICON_SIZE;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return;

    const blob = await resp.blob();
    // Reject non-image responses (Google sometimes returns HTML error pages)
    if (!blob.type.startsWith('image/')) return;

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    if (!_faviconCache) _faviconCache = new Map();
    _faviconCache.set(domain, dataUrl);
    _schedulePersist();
  } catch {
    // Network error or CORS — silently skip, will try again next render
  } finally {
    _faviconPending.delete(domain);
  }
}

// ── Batch cache: cache all uncached domains from rendered page ──
async function cacheAllUncached(domains) {
  if (!domains || domains.length === 0) return;
  const uncached = domains.filter(d => d && !(_faviconCache && _faviconCache.has(d)));
  // Serial fetch to avoid flooding — one at a time with small delay
  for (const domain of uncached) {
    await cacheFavicon(domain);
    // Tiny delay between requests to be gentle
    await new Promise(r => setTimeout(r, 50));
  }
}

// ── Purge a domain from cache ───────────────────────────
async function invalidateFavicon(domain) {
  if (!domain || !_faviconCache) return;
  _faviconCache.delete(domain);
  _schedulePersist();
}

// ── Clear entire cache ──────────────────────────────────
async function clearFaviconCache() {
  _faviconCache = new Map();
  try {
    await chrome.storage.local.remove(FAVICON_CACHE_KEY);
  } catch { /* ok */ }
}

// ── Get cache size (for debugging) ──────────────────────
function getFaviconCacheSize() {
  return _faviconCache ? _faviconCache.size : 0;
}

// ── Error fallback: catch all [data-fallback] img errors ─
// Capture-phase ensures we catch dynamically-added images too
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.matches && img.matches('[data-fallback]')) {
    if (img.src !== DEFAULT_FAVICON) {
      img.src = DEFAULT_FAVICON;
    }
  }
}, true);
