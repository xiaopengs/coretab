/* Shared workspace shell. The original Tabs DOM and scripts remain mounted. */
'use strict';

window.CoreTabWorkspace = (() => {
  const paths = {
    tabs: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    folder: '<path d="M3 7V5h7l2 3h9v12H3V7Z"/>',
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
    pen: '<path d="m15 3 6 6-11 11-7 1 1-7L15 3Zm-2 2 6 6"/>',
    book: '<path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16"/>',
    copy: '<rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V3H4v14h4"/>',
    open: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    pause: '<path d="M8 5v14m8-14v14"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    note: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4V2h6v2M8 10h8m-8 4h8m-8 4h5"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>'
  };
  const icon = name => `<svg class="ws-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.note}</svg>`;
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const searches = { prompts: '', meetings: '' };
  const handlers = {};
  const positions = { tabs: 0, prompts: 0, meetings: 0 };
  let active = 'tabs';
  let modalTrigger;
  let onClose;

  function read(key, initial, validate) {
    const raw = localStorage.getItem(key);
    if (raw === null) return structuredClone(initial);
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(validate)) throw new Error('存储数据格式异常');
    return data;
  }

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      const error = document.getElementById('wsDialogError');
      if (document.getElementById('workspaceDialog').open && error) {
        error.textContent = '保存失败：本地存储不可用或空间不足，请保留内容后重试。';
      } else {
        showToast('保存失败：本地存储不可用或空间不足。');
      }
      return false;
    }
  }

  function openDialog(content, closeCallback) {
    const dialog = document.getElementById('workspaceDialog');
    modalTrigger = document.activeElement;
    onClose = closeCallback;
    dialog.innerHTML = `${content}<p id="wsDialogError" class="ws-error" role="alert"></p>`;
    dialog.showModal();
  }

  function closeDialog() {
    document.getElementById('workspaceDialog').close();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      showToast('复制失败，请打开内容后手动复制。');
      return false;
    }
  }

  function setSearch(workspace, query) {
    searches[workspace] = query;
    if (workspace === active) document.getElementById('workspaceSearch').value = query;
  }

  function route() {
    const target = location.hash.slice(1);
    const next = ['prompts', 'meetings'].includes(target) ? target : 'tabs';
    positions[active] = window.scrollY;
    const changed = active !== next;
    active = next;
    document.body.dataset.workspace = next;
    document.querySelectorAll('[data-workspace-panel]').forEach(panel => {
      panel.hidden = panel.dataset.workspacePanel !== next;
    });
    document.querySelectorAll('[data-workspace-link]').forEach(link => {
      if (link.dataset.workspaceLink === next) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.getElementById('tabsHeaderSearch').hidden = next !== 'tabs';
    document.getElementById('newWorkspaceSearch').hidden = next === 'tabs';
    document.getElementById('searchResults').style.display = 'none';
    const search = document.getElementById('workspaceSearch');
    search.placeholder = next === 'prompts' ? '搜索 Prompt…' : '搜索会议记录…';
    search.setAttribute('aria-label', search.placeholder);
    search.value = searches[next] || '';
    document.title = next === 'tabs' ? 'CoreTab' : `CoreTab · ${next === 'prompts' ? 'Prompts' : 'Meetings'}`;
    window.dispatchEvent(new CustomEvent('coretab:workspace', { detail: next }));
    if (changed) window.scrollTo(0, positions[next]);
  }

  function init() {
    document.querySelectorAll('[data-ws-icon]').forEach(el => { el.innerHTML = icon(el.dataset.wsIcon); });
    document.getElementById('workspaceSearch').addEventListener('input', e => {
      setSearch(active, e.target.value);
      handlers[active]?.(e.target.value);
    });
    const dialog = document.getElementById('workspaceDialog');
    dialog.addEventListener('click', e => {
      if (e.target.closest('[data-ws-close]')) closeDialog();
    });
    dialog.addEventListener('close', () => {
      onClose?.();
      onClose = null;
      modalTrigger?.focus();
    });
    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { icon, escape, read, save, copy, openDialog, closeDialog, setSearch,
    onSearch: (workspace, handler) => { handlers[workspace] = handler; } };
})();
