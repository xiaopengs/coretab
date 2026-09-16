/* Local-first Prompt Library, isolated from browser-tab storage. */
'use strict';

(() => {
  const W = window.CoreTabWorkspace;
  const { icon, escape: esc } = W;
  const KEY = 'coretab_prompts_v1';
  const categories = [['全部', 'folder'], ['我的收藏', 'star'], ['技术', 'note'], ['产品', 'folder'], ['编程', 'code'], ['图片', 'image'], ['写作', 'pen'], ['学习', 'book'], ['其他', 'note'], ['回收站', 'trash']];
  const templates = [
    ['GitHub 项目架构分析', '分析 GitHub 项目的整体架构、设计思路、核心模块及工作原理。', '技术', ['架构分析', '开源', 'GitHub'], '请分析项目 {{github_url}} 的整体架构、核心模块和设计取舍。先概述，再给出模块关系与改进建议。'],
    ['图片生成 · 角色设定', '根据参考描述生成风格统一、细节丰富的角色设定与视觉提示词。', '图片', ['图片', '角色', '创意'], '为 {{character}} 编写角色设定。视觉风格为 {{style}}。请描述外貌、服饰、场景、光线和构图。'],
    ['商业分析报告', '洞察行业与用户，生成一份完整的商业分析报告。', '产品', ['商业', '分析', '报告'], '请对 {{product}} 进行商业分析，涵盖目标用户、市场需求、竞争格局、盈利模式及风险。区分事实与假设。'],
    ['汇报优化建议', '帮我优化汇报的表达逻辑，让信息更清晰、更有说服力。', '写作', ['写作', 'PPT', '汇报'], '请优化以下汇报：\n{{content}}\n保留事实，用结论先行的方式整理，突出成果、问题和下一步行动。'],
    ['代码开发助手', '把需求转化为清晰、可维护的代码，并补充关键测试。', '编程', ['编程', 'React', '前端'], '请使用 {{language}} 实现以下需求：\n{{requirements}}\n解释关键设计，并提供边界情况的测试。'],
    ['学习笔记总结', '将知识整理为结构化笔记，建立清晰的学习路径。', '学习', ['学习', '总结', '笔记'], '请整理以下学习材料：\n{{notes}}\n输出核心概念、知识结构、易错点和三个自测问题。']
  ].map((t, i) => ({ id: `template-${i}`, title: t[0], description: t[1], category: t[2], tags: t[3], content: t[4], model: '通用模型', favorite: false, usageCount: 0, createdAt: 0, updatedAt: 0, lastUsedAt: 0, deleted: false }));
  const root = document.getElementById('promptsWorkspace');
  let initialized = false;
  let prompts = [];
  let category = '全部';
  let query = '';
  let model = '';
  let tag = '';
  let sort = 'recent';
  let page = 1;
  let draft = null;

  function valid(p) {
    return p && ['id', 'title', 'description', 'content', 'model', 'category'].every(k => typeof p[k] === 'string') &&
      Array.isArray(p.tags) && p.tags.every(t => typeof t === 'string') && typeof p.favorite === 'boolean' &&
      ['usageCount', 'createdAt', 'updatedAt', 'lastUsedAt'].every(k => Number.isFinite(p[k]) && p[k] >= 0);
  }

  function load() { return W.read(KEY, templates, valid); }

  function update(change) {
    try {
      const next = change(load());
      if (!W.save(KEY, next)) return false;
      prompts = next;
      renderResults();
      return true;
    } catch {
      showToast('无法读取 Prompt 数据，请保留本地数据并重试。');
      return false;
    }
  }

  function selectedItems() {
    const text = query.trim().toLocaleLowerCase();
    return prompts.filter(p => category === '回收站' ? p.deleted : !p.deleted).filter(p =>
      (['全部', '回收站'].includes(category) || (category === '我的收藏' ? p.favorite : p.category === category)) &&
      (!model || p.model === model) && (!tag || p.tags.includes(tag)) &&
      (!text || [p.title, p.description, p.content, ...p.tags].join(' ').toLocaleLowerCase().includes(text))
    ).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') :
      sort === 'usage' ? b.usageCount - a.usageCount : sort === 'created' ? b.createdAt - a.createdAt : b.lastUsedAt - a.lastUsedAt);
  }

  function renderResults() {
    const live = prompts.filter(p => !p.deleted);
    root.querySelector('#promptCategories').innerHTML = categories.map(([name, symbol]) => {
      const count = name === '全部' ? live.length : name === '我的收藏' ? live.filter(p => p.favorite).length : name === '回收站' ? prompts.filter(p => p.deleted).length : live.filter(p => p.category === name).length;
      return `<button class="prompt-category ${category === name ? 'selected' : ''}" data-p-category="${name}" aria-pressed="${category === name}">${icon(symbol)}<span>${name}</span><small>${count}</small></button>`;
    }).join('');
    const options = (values, label, current) => `<option value="">${label}</option>` + [...new Set(values)].sort().map(v => `<option value="${esc(v)}" ${current === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
    root.querySelector('#promptModelFilter').innerHTML = options(prompts.map(p => p.model), '全部模型', model);
    root.querySelector('#promptTagFilter').innerHTML = options(prompts.flatMap(p => p.tags), '全部标签', tag);
    const items = selectedItems();
    const pages = Math.max(1, Math.ceil(items.length / 6));
    page = Math.min(page, pages);
    root.querySelector('#promptResultCount').textContent = `${items.length} 个 Prompt${category === '回收站' ? ' · 可恢复' : ' · 本地保存'}`;
    root.querySelector('#promptGrid').innerHTML = items.length ? items.slice((page - 1) * 6, page * 6).map(p => {
      const symbol = categories.find(c => c[0] === p.category)?.[1] || 'note';
      const tone = ['图片', '学习'].includes(p.category) ? 'lemon' : p.category === '写作' ? 'ube' : 'blue';
      return `<article class="prompt-card ws-panel" data-p-id="${esc(p.id)}">
        <div class="prompt-card-head"><span class="prompt-card-icon ${tone}">${icon(symbol)}</span><h2>${esc(p.title)}</h2><button class="ws-icon-btn prompt-favorite ${p.favorite ? 'is-favorite' : ''}" data-p-action="favorite" aria-label="${p.favorite ? '取消收藏' : '收藏'} ${esc(p.title)}" aria-pressed="${p.favorite}">${icon('star')}</button></div>
        <p class="prompt-description">${esc(p.description || '暂无描述，打开查看完整提示词。')}</p>
        <div class="prompt-tags">${p.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>
        <div class="prompt-meta"><span>${icon('spark')}${esc(p.model)}</span><span>使用 ${p.usageCount} 次</span></div>
        <div class="prompt-card-actions">${p.deleted ? `<button class="ws-btn" data-p-action="restore">${icon('clock')}恢复 Prompt</button>` : `<button class="ws-btn" data-p-action="copy">${icon('copy')}复制</button><button class="ws-btn primary" data-p-action="edit">${icon('code')}打开</button>`}</div>
      </article>`;
    }).join('') : `<div class="ws-empty prompt-no-results">${icon('search')}<h2>${category === '回收站' ? '回收站为空' : '没有找到 Prompt'}</h2><p>试试其他关键词，或新建一个属于你的提示词。</p><button class="ws-btn" data-p-action="reset">清除筛选</button></div>`;
    root.querySelector('#promptPagination').innerHTML = `<button class="ws-icon-btn" data-p-page="${page - 1}" aria-label="上一页" ${page === 1 ? 'disabled' : ''}>${icon('arrow')}</button>${Array.from({ length: pages }, (_, i) => `<button class="ws-icon-btn ${page === i + 1 ? 'current' : ''}" data-p-page="${i + 1}" ${page === i + 1 ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}<button class="ws-icon-btn" data-p-page="${page + 1}" aria-label="下一页" ${page === pages ? 'disabled' : ''}>${icon('arrow')}</button>`;
  }

  function setQuery(value) {
    query = value;
    page = 1;
    W.setSearch('prompts', value);
    root.querySelector('#promptSearch').value = value;
    renderResults();
  }

  async function copyPrompt(p) {
    if (!await W.copy(p.content)) return;
    if (update(items => items.map(item => item.id === p.id ? { ...item, usageCount: item.usageCount + 1, lastUsedAt: Date.now() } : item))) showToast('Prompt 已复制');
  }

  function openEditor(prompt) {
    const data = prompt || draft || { title: '', description: '', category: '技术', model: '通用模型', tags: [], content: '' };
    let saved = false;
    const values = Object.create(null);
    W.openDialog(`<div class="ws-dialog-head"><div><h2 id="wsDialogTitle">${prompt ? '编辑 Prompt' : '新建 Prompt'}</h2><p>让灵感成为可复用的工作资产 · 仅保存在本地</p></div><button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭编辑器">${icon('close')}</button></div>
      <form id="promptForm"><div class="prompt-editor-grid"><div>
        <label>名称<input name="title" required maxlength="100" value="${esc(data.title)}" placeholder="为你的 Prompt 起个名字" autofocus></label>
        <label>描述<input name="description" maxlength="300" value="${esc(data.description)}" placeholder="这个 Prompt 可以帮你做什么？"></label>
        <div class="prompt-form-row"><label>分类<select name="category">${categories.slice(2, -1).map(([c]) => `<option ${c === data.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>模型名称<input name="model" required maxlength="60" value="${esc(data.model)}"></label></div>
        <label>标签 · 用逗号分隔<input name="tags" maxlength="200" value="${esc(data.tags.join(', '))}" placeholder="工作, 创意, 效率"></label>
        <label>Prompt 正文<textarea name="content" required maxlength="30000" rows="9" placeholder="在这里写下提示词，用 {{变量名}} 插入变量…">${esc(data.content)}</textarea></label>
      </div><aside class="prompt-preview"><h3>${icon('spark')}变量预览</h3><p>填写变量，即时预览替换结果。仅本地替换，不调用 AI 模型。</p><div id="promptVariables"></div><pre id="promptPreview"></pre><button type="button" class="ws-btn" id="copyPromptPreview">${icon('copy')}复制预览</button><p id="promptCopyStatus" role="status"></p></aside></div>
      <div class="ws-dialog-actions">${prompt ? `<button type="button" class="ws-btn danger" id="deletePrompt">${icon('trash')}移入回收站</button>` : ''}<button type="button" class="ws-btn" data-ws-close>取消</button><button type="submit" class="ws-btn primary">保存 Prompt</button></div></form>`, () => {
      if (!prompt && !saved) draft = formData();
    });
    const form = document.getElementById('promptForm');
    function formData() {
      const fields = new FormData(form);
      return { title: fields.get('title').trim(), description: fields.get('description').trim(), category: fields.get('category'), model: fields.get('model').trim(), content: fields.get('content').trim(), tags: [...new Set(fields.get('tags').split(/[,，]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean))] };
    }
    function preview(rebuild = false) {
      const content = form.elements.content.value;
      const names = [...new Set([...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m => m[1]))];
      if (rebuild) {
        document.getElementById('promptVariables').innerHTML = names.length ? names.map((name, i) => `<label>${esc(name)}<input data-variable="${esc(name)}" aria-label="变量 ${esc(name)}" value="${esc(values[name] || '')}" placeholder="填写 ${esc(name)}" id="promptVar${i}"></label>`).join('') : '<p class="ws-muted">正文中的 {{变量名}} 会自动出现在这里。</p>';
      }
      document.getElementById('promptPreview').textContent = content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => values[name] || match) || '你的 Prompt 预览将显示在这里。';
    }
    form.elements.content.addEventListener('input', () => preview(true));
    document.getElementById('promptVariables').addEventListener('input', e => { values[e.target.dataset.variable] = e.target.value; preview(); });
    document.getElementById('copyPromptPreview').addEventListener('click', async () => {
      const ok = await W.copy(document.getElementById('promptPreview').textContent);
      document.getElementById('promptCopyStatus').textContent = ok ? '预览已复制' : '无法复制，请选中预览内容手动复制。';
    });
    document.getElementById('deletePrompt')?.addEventListener('click', () => {
      if (!window.confirm(`将“${prompt.title}”移入回收站？之后可以恢复。`)) return;
      if (update(items => items.map(p => p.id === prompt.id ? { ...p, deleted: true } : p))) { saved = true; W.closeDialog(); showToast('已移入回收站'); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fields = formData();
      if (!fields.title || !fields.content || !fields.model) { document.getElementById('wsDialogError').textContent = '名称、模型和正文不能为空。'; return; }
      const now = Date.now();
      const ok = update(items => prompt ? items.map(p => p.id === prompt.id ? { ...p, ...fields, updatedAt: now } : p) : [...items, { ...fields, id: crypto.randomUUID(), favorite: false, usageCount: 0, deleted: false, createdAt: now, updatedAt: now, lastUsedAt: 0 }]);
      if (ok) { saved = true; draft = null; W.closeDialog(); showToast('Prompt 已保存'); }
    });
    preview(true);
  }

  function init() {
    if (initialized) return;
    try { prompts = load(); } catch {
      root.innerHTML = '<div class="ws-empty ws-panel"><h1>Prompt 数据暂时无法加载</h1><p>原始数据未被覆盖。请检查浏览器存储后重试。</p><button class="ws-btn" id="retryPrompts">重新加载</button></div>';
      root.querySelector('#retryPrompts').onclick = init;
      return;
    }
    initialized = true;
    root.innerHTML = `<div class="ws-page-heading"><span class="ws-heading-icon">${icon('spark')}</span><div><h1>Prompt Library</h1><p>管理你的 AI 提示词，提升工作效率</p></div><button class="ws-btn primary" data-p-action="new">${icon('plus')}新建 Prompt</button></div>
      <div class="ws-toolbar"><label class="ws-search">${icon('search')}<input type="search" id="promptSearch" placeholder="搜索 Prompt…" aria-label="搜索 Prompt"></label><select id="promptModelFilter" aria-label="筛选模型"></select><select id="promptTagFilter" aria-label="筛选标签"></select><select id="promptSort" aria-label="Prompt 排序"><option value="recent">最近使用</option><option value="created">最近创建</option><option value="usage">使用最多</option><option value="name">名称排序</option></select></div>
      <div class="prompt-layout"><aside class="prompt-sidebar"><div id="promptCategories" aria-label="Prompt 分类"></div><div class="prompt-local-note">${icon('shield')}本地优先，灵感属于你</div></aside><div class="prompt-library"><div class="prompt-result-count" id="promptResultCount" role="status"></div><div class="prompt-grid" id="promptGrid"></div><nav class="prompt-pagination" id="promptPagination" aria-label="Prompt 分页"></nav><div class="ws-footer-note">${icon('spark')}<div><h3>高效的 Prompt 让 AI 更懂你</h3><p>保存、分类、搜索、编辑与复用，打造属于你的 AI 工作词库。</p></div><button class="ws-icon-btn" data-p-action="new" aria-label="添加 Prompt">${icon('plus')}</button></div></div></div>`;
    root.querySelector('#promptSearch').addEventListener('input', e => setQuery(e.target.value));
    W.onSearch('prompts', setQuery);
    root.addEventListener('change', e => {
      if (!['promptModelFilter', 'promptTagFilter', 'promptSort'].includes(e.target.id)) return;
      if (e.target.id === 'promptModelFilter') model = e.target.value;
      if (e.target.id === 'promptTagFilter') tag = e.target.value;
      if (e.target.id === 'promptSort') sort = e.target.value;
      page = 1;
      renderResults();
    });
    root.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button) return;
      if (button.dataset.pCategory) { category = button.dataset.pCategory; page = 1; renderResults(); }
      if (button.dataset.pPage) { page = Number(button.dataset.pPage); renderResults(); }
      const action = button.dataset.pAction;
      const p = prompts.find(item => item.id === button.closest('[data-p-id]')?.dataset.pId);
      if (action === 'new') openEditor();
      if (action === 'edit' && p) openEditor(p);
      if (action === 'copy' && p) copyPrompt(p);
      if (action === 'favorite' && p) update(items => items.map(item => item.id === p.id ? { ...item, favorite: !item.favorite } : item));
      if (action === 'restore' && p && update(items => items.map(item => item.id === p.id ? { ...item, deleted: false } : item))) showToast('Prompt 已恢复');
      if (action === 'reset') { category = '全部'; model = ''; tag = ''; setQuery(''); }
    });
    window.addEventListener('storage', e => {
      if (e.key === KEY) { try { prompts = load(); renderResults(); } catch { showToast('Prompt 数据读取失败，请刷新后重试。'); } }
    });
    renderResults();
  }
  window.addEventListener('coretab:workspace', e => { if (e.detail === 'prompts') init(); });
})();
