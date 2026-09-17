/* Local-first Meetings workspace, isolated from browser-tab storage. */
'use strict';

(() => {
  const W = window.CoreTabWorkspace;
  const { icon, escape: esc } = W;
  const KEY = 'coretab_meetings_v1';
  const root = document.getElementById('meetingsWorkspace');
  let initialized = false;
  let meetings = [];
  let active = null;
  let timer = null;
  let elapsed = 0;
  let pausedAt = null;

  /* ── ASR Provider (multi-service) ── */
  let asrProvider = null;
  let recognizing = false;
  let currentSpeaker = 'Speaker';

  function getASRSettings() {
    return (window.ASRSettings && window.ASRSettings.load()) || { provider: 'browser' };
  }

  async function startRecognition() {
    if (recognizing) return;
    const settings = getASRSettings();
    try {
      asrProvider = window.ASRProvider.create({
        provider: settings.provider,
        credentials: settings.credentials,
        model: settings.model,
        lang: settings.lang,
        onResult: ({ text, isFinal }) => {
          if (!active || !isFinal || !text) return;
          active.transcript.push({ speaker: currentSpeaker, text, timestamp: elapsed });
          active.updatedAt = Date.now();
          renderActive();
          scrollTranscript();
        },
        onError: (err) => {
          showToast('语音识别出错：' + err.message);
          stopRecognition();
        },
        onStatusChange: (status) => {
          recognizing = status === 'listening';
          renderActive();
        }
      });
      await asrProvider.init();
      await asrProvider.start();
      recognizing = true;
    } catch (e) {
      showToast('无法启动语音识别：' + e.message);
      recognizing = false;
    }
  }

  function stopRecognition() {
    recognizing = false;
    if (asrProvider) {
      asrProvider.stop();
      asrProvider = null;
    }
  }

  function scrollTranscript() {
    const list = root.querySelector('#transcriptList');
    if (list) list.scrollTop = list.scrollHeight;
  }

  /* ── Export helpers ── */
  function exportTXT(m) {
    const lines = [];
    lines.push(`会议：${m.title}`);
    lines.push(`时间：${new Date(m.createdAt).toLocaleString('zh-CN')}`);
    lines.push(`时长：${formatDuration(m.duration)}`);
    lines.push(`参与人：${m.participants.join(', ')}`);
    lines.push('');

    if (m.summary.length) {
      lines.push('═══ 会议摘要 ═══');
      m.summary.forEach(s => lines.push(`• ${s}`));
      lines.push('');
    }
    if (m.keyPoints.length) {
      lines.push('═══ 关键结论 ═══');
      m.keyPoints.forEach(p => lines.push(`• ${p}`));
      lines.push('');
    }
    if (m.actionItems.length) {
      lines.push('═══ 行动项 ═══');
      m.actionItems.forEach(a => lines.push(`[${a.completed ? '✓' : ' '}] ${a.content}`));
      lines.push('');
    }
    if (m.transcript.length) {
      lines.push('═══ 完整转写 ═══');
      m.transcript.forEach(t => lines.push(`[${formatDuration(t.timestamp)}] ${t.speaker}：${t.text}`));
    }
    return lines.join('\n');
  }

  function exportMarkdown(m) {
    const lines = [];
    lines.push(`# ${m.title}`);
    lines.push('');
    lines.push(`- **时间**：${new Date(m.createdAt).toLocaleString('zh-CN')}`);
    lines.push(`- **时长**：${formatDuration(m.duration)}`);
    lines.push(`- **参与人**：${m.participants.join(', ')}`);
    lines.push('');

    if (m.summary.length) {
      lines.push('## 会议摘要');
      lines.push('');
      m.summary.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
    if (m.keyPoints.length) {
      lines.push('## 关键结论');
      lines.push('');
      m.keyPoints.forEach(p => lines.push(`- ${p}`));
      lines.push('');
    }
    if (m.actionItems.length) {
      lines.push('## 行动项');
      lines.push('');
      m.actionItems.forEach(a => lines.push(`- [${a.completed ? 'x' : ' '}] ${a.content}`));
      lines.push('');
    }
    if (m.transcript.length) {
      lines.push('## 完整转写');
      lines.push('');
      m.transcript.forEach(t => lines.push(`**${t.speaker}** (${formatDuration(t.timestamp)})：${t.text}`));
      lines.push('');
    }
    return lines.join('\n');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportMeeting(m, format) {
    const safeTitle = m.title.replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40);
    const date = new Date(m.createdAt).toISOString().slice(0, 10);
    if (format === 'txt') {
      downloadFile(exportTXT(m), `${date}_${safeTitle}.txt`, 'text/plain;charset=utf-8');
    } else {
      downloadFile(exportMarkdown(m), `${date}_${safeTitle}.md`, 'text/markdown;charset=utf-8');
    }
  }

  function valid(m) {
    return m && ['id', 'title', 'status'].every(k => typeof m[k] === 'string') &&
      Array.isArray(m.transcript) && Array.isArray(m.summary) && Array.isArray(m.keyPoints) && Array.isArray(m.actionItems) &&
      ['createdAt', 'updatedAt', 'duration'].every(k => Number.isFinite(m[k]) && m[k] >= 0);
  }

  function load() { return W.read(KEY, [], valid); }

  function update(change) {
    try {
      const next = change(load());
      if (!W.save(KEY, next)) return false;
      meetings = next;
      return true;
    } catch {
      showToast('无法读取会议数据，请保留本地数据并重试。');
      return false;
    }
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function renderList() {
    const list = meetings.filter(m => m.status === 'ended').sort((a, b) => b.updatedAt - a.updatedAt);
    root.querySelector('#meetingList').innerHTML = list.length ? list.map(m => `
      <article class="meeting-item ws-panel" data-m-id="${esc(m.id)}">
        <div class="meeting-item-head">
          <h2>${esc(m.title)}</h2>
          <span class="meeting-duration">${icon('clock')}${formatDuration(m.duration)}</span>
        </div>
        <div class="meeting-meta">
          <span>${icon('people')}${m.participants.length} 人</span>
          <span>${icon('note')}${m.transcript.length} 条记录</span>
          <span>${formatTime(m.updatedAt)}</span>
        </div>
        <div class="meeting-item-actions">
          <button class="ws-btn" data-m-action="view">${icon('open')}查看详情</button>
          <button class="ws-btn" data-m-action="export-txt" data-m-id="${esc(m.id)}">导出 TXT</button>
          <button class="ws-btn" data-m-action="export-md" data-m-id="${esc(m.id)}">导出 MD</button>
          <button class="ws-btn danger" data-m-action="delete">${icon('trash')}删除</button>
        </div>
      </article>
    `).join('') : `<div class="ws-empty"><h2>暂无会议记录</h2><p>开始你的第一次会议，让每次讨论都有价值。</p></div>`;
  }

  function renderActive() {
    if (!active) return;
    root.querySelector('#meetingTitle').textContent = active.title;
    root.querySelector('#meetingTimer').textContent = formatDuration(elapsed);
    const statusEl = root.querySelector('#meetingStatus');
    if (pausedAt) {
      statusEl.textContent = '已暂停';
      statusEl.className = 'meeting-status paused';
    } else if (recognizing) {
      statusEl.textContent = '正在录音';
      statusEl.className = 'meeting-status live';
    } else {
      statusEl.textContent = '手动模式';
      statusEl.className = 'meeting-status paused';
    }
    root.querySelector('#transcriptList').innerHTML = active.transcript.map(t => `
      <div class="transcript-item">
        <div class="transcript-speaker">${esc(t.speaker)}</div>
        <div class="transcript-time">${formatDuration(t.timestamp)}</div>
        <div class="transcript-text">${esc(t.text)}</div>
      </div>
    `).join('');
    root.querySelector('#summaryList').innerHTML = active.summary.map(s => `<li>${esc(s)}</li>`).join('') || '<li class="ws-muted">暂无摘要，会议进行中会自动生成。</li>';
    root.querySelector('#keyPointsList').innerHTML = active.keyPoints.map(p => `<li>${esc(p)}</li>`).join('') || '<li class="ws-muted">暂无关键结论。</li>';
    root.querySelector('#actionItemsList').innerHTML = active.actionItems.map((a, i) => `
      <li class="action-item ${a.completed ? 'completed' : ''}">
        <input type="checkbox" data-a-index="${i}" ${a.completed ? 'checked' : ''}>
        <span>${esc(a.content)}</span>
      </li>
    `).join('') || '<li class="ws-muted">暂无行动项。</li>';
  }

  function startTimer() {
    if (timer) return;
    const start = Date.now() - elapsed;
    timer = setInterval(() => {
      if (!pausedAt) {
        elapsed = Date.now() - start;
        if (active) root.querySelector('#meetingTimer').textContent = formatDuration(elapsed);
      }
    }, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function openMeeting(meeting) {
    active = meeting;
    elapsed = meeting.duration;
    pausedAt = null;
    root.querySelector('#meetingEmpty').hidden = true;
    root.querySelector('#meetingActive').hidden = false;
    renderActive();
    startTimer();
    startRecognition();
  }

  function endMeeting() {
    if (!active) return;
    stopTimer();
    stopRecognition();
    active.status = 'ended';
    active.duration = elapsed;
    active.updatedAt = Date.now();
    if (update(items => items.map(m => m.id === active.id ? { ...m, ...active } : m))) {
      active = null;
      elapsed = 0;
      root.querySelector('#meetingEmpty').hidden = false;
      root.querySelector('#meetingActive').hidden = true;
      renderList();
      showToast('会议已结束并保存');
    }
  }

  function addTranscript() {
    if (!active) return;
    const speaker = root.querySelector('#transcriptSpeaker').value.trim() || 'Speaker';
    const text = root.querySelector('#transcriptText').value.trim();
    if (!text) return;
    currentSpeaker = speaker;
    active.transcript.push({ speaker, text, timestamp: elapsed });
    active.updatedAt = Date.now();
    root.querySelector('#transcriptText').value = '';
    renderActive();
    scrollTranscript();
  }

  function addSummary() {
    if (!active) return;
    const text = root.querySelector('#summaryInput').value.trim();
    if (!text) return;
    active.summary.push(text);
    active.updatedAt = Date.now();
    root.querySelector('#summaryInput').value = '';
    renderActive();
  }

  function addKeyPoint() {
    if (!active) return;
    const text = root.querySelector('#keyPointInput').value.trim();
    if (!text) return;
    active.keyPoints.push(text);
    active.updatedAt = Date.now();
    root.querySelector('#keyPointInput').value = '';
    renderActive();
  }

  function addActionItem() {
    if (!active) return;
    const text = root.querySelector('#actionItemInput').value.trim();
    if (!text) return;
    active.actionItems.push({ content: text, completed: false });
    active.updatedAt = Date.now();
    root.querySelector('#actionItemInput').value = '';
    renderActive();
  }

  function toggleActionItem(index) {
    if (!active) return;
    active.actionItems[index].completed = !active.actionItems[index].completed;
    active.updatedAt = Date.now();
    renderActive();
  }

  function viewMeeting(meeting) {
    const m = meetings.find(item => item.id === meeting.id);
    if (!m) return;
    W.openDialog(`<div class="ws-dialog-head"><div><h2 id="wsDialogTitle">${esc(m.title)}</h2><p>${formatDuration(m.duration)} · ${m.participants.length} 人 · ${formatTime(m.updatedAt)}</p></div><button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">${icon('close')}</button></div>
      <div class="meeting-detail">
        <section><h3>${icon('note')}会议摘要</h3><ul>${m.summary.map(s => `<li>${esc(s)}</li>`).join('') || '<li class="ws-muted">暂无摘要</li>'}</ul></section>
        <section><h3>${icon('check')}关键结论</h3><ul>${m.keyPoints.map(p => `<li>${esc(p)}</li>`).join('') || '<li class="ws-muted">暂无关键结论</li>'}</ul></section>
        <section><h3>${icon('shield')}行动项</h3><ul>${m.actionItems.map(a => `<li class="action-item ${a.completed ? 'completed' : ''}"><input type="checkbox" disabled ${a.completed ? 'checked' : ''}><span>${esc(a.content)}</span></li>`).join('') || '<li class="ws-muted">暂无行动项</li>'}</ul></section>
        <section><h3>${icon('note')}完整转写</h3><div class="transcript-list">${m.transcript.map(t => `<div class="transcript-item"><div class="transcript-speaker">${esc(t.speaker)}</div><div class="transcript-time">${formatDuration(t.timestamp)}</div><div class="transcript-text">${esc(t.text)}</div></div>`).join('') || '<p class="ws-muted">暂无转写记录</p>'}</div></section>
      </div>
      <div class="ws-dialog-actions">
        <button type="button" class="ws-btn danger" id="deleteMeetingDetail">${icon('trash')}删除会议</button>
        <button type="button" class="ws-btn" id="exportMeetingTXT">${icon('open')}导出 TXT</button>
        <button type="button" class="ws-btn" id="exportMeetingMD">${icon('open')}导出 MD</button>
        <button type="button" class="ws-btn" data-ws-close>关闭</button>
      </div>`, () => {});
    document.getElementById('deleteMeetingDetail').addEventListener('click', () => {
      if (!window.confirm(`确定删除"${m.title}"？此操作不可恢复。`)) return;
      if (update(items => items.filter(item => item.id !== m.id))) { W.closeDialog(); renderList(); showToast('会议已删除'); }
    });
    document.getElementById('exportMeetingTXT').addEventListener('click', () => exportMeeting(m, 'txt'));
    document.getElementById('exportMeetingMD').addEventListener('click', () => exportMeeting(m, 'md'));
  }

  function createMeeting() {
    const title = document.getElementById('meetingTitleInput').value.trim();
    if (!title) { document.getElementById('wsDialogError').textContent = '会议名称不能为空'; return; }
    const now = Date.now();
    const meeting = { id: crypto.randomUUID(), title, status: 'active', participants: ['Speaker'], transcript: [], summary: [], keyPoints: [], actionItems: [], createdAt: now, updatedAt: now, duration: 0 };
    if (update(items => [...items, meeting])) {
      W.closeDialog();
      openMeeting(meeting);
      showToast('会议已开始');
    }
  }

  function init() {
    if (initialized) return;
    try { meetings = load(); } catch {
      root.innerHTML = '<div class="ws-empty ws-panel"><h1>会议数据暂时无法加载</h1><p>原始数据未被覆盖。请检查浏览器存储后重试。</p><button class="ws-btn" id="retryMeetings">重新加载</button></div>';
      root.querySelector('#retryMeetings').onclick = init;
      return;
    }
    initialized = true;
    const asrSettings = getASRSettings();
    const hasASR = asrSettings.provider === 'browser' ? !!(window.SpeechRecognition || window.webkitSpeechRecognition) : true;
    const providerName = asrSettings.provider === 'browser' ? 'Web Speech API' : (window.ASRProvider?.getProviders?.()?.find(p => p.id === asrSettings.provider)?.name || asrSettings.provider);
    root.innerHTML = `<div class="ws-page-heading"><span class="ws-heading-icon">${icon('mic')}</span><div><h1>会议实时转写</h1><p>实时转写 · 自动摘要 · 行动项</p></div><div class="ws-page-heading-actions"><button class="ws-btn" data-m-action="asr-settings">${icon('settings')}ASR 设置</button><button class="ws-btn primary" data-m-action="create">${icon('plus')}新建会议</button></div></div>
      <div id="meetingEmpty" class="ws-empty ws-panel">${icon('mic')}<h2>让每一次会议都有价值</h2><p>会议记录、关键结论和行动项，在这里有序归档。</p><span class="ws-badge">当前引擎：${esc(providerName)}</span></div>
      <div id="meetingActive" hidden>
        <div class="meeting-header">
          <div class="meeting-header-info">
            <span class="meeting-status live" id="meetingStatus">${hasASR ? '正在录音' : '手动模式'}</span>
            <h2 id="meetingTitle">会议名称</h2>
            <div class="meeting-timer">${icon('clock')}<span id="meetingTimer">0:00</span></div>
          </div>
          <div class="meeting-header-actions">
            <button class="ws-btn" data-m-action="pause">${icon('pause')}暂停</button>
            <button class="ws-btn danger" data-m-action="end">${icon('stop')}结束会议</button>
          </div>
        </div>
        <div class="meeting-columns">
          <section class="meeting-column">
            <h3>${icon('note')}实时转写</h3>
            <div class="transcript-input">
              <input type="text" id="transcriptSpeaker" placeholder="说话人" value="Speaker">
              <input type="text" id="transcriptText" placeholder="${hasASR ? '语音识别中…也可手动输入' : '输入转写内容…'}">
              <button class="ws-btn primary" data-m-action="add-transcript">${icon('plus')}添加</button>
            </div>
            <div id="transcriptList" class="transcript-list"></div>
          </section>
          <aside class="meeting-column">
            <h3>${icon('spark')}AI 会议助手</h3>
            <div class="assistant-section">
              <h4>实时摘要</h4>
              <div class="assistant-input"><input type="text" id="summaryInput" placeholder="添加摘要…"><button class="ws-btn" data-m-action="add-summary">${icon('plus')}</button></div>
              <ul id="summaryList"></ul>
            </div>
            <div class="assistant-section">
              <h4>关键结论</h4>
              <div class="assistant-input"><input type="text" id="keyPointInput" placeholder="添加关键结论…"><button class="ws-btn" data-m-action="add-keypoint">${icon('plus')}</button></div>
              <ul id="keyPointsList"></ul>
            </div>
            <div class="assistant-section">
              <h4>Action Items</h4>
              <div class="assistant-input"><input type="text" id="actionItemInput" placeholder="添加行动项…"><button class="ws-btn" data-m-action="add-action">${icon('plus')}</button></div>
              <ul id="actionItemsList"></ul>
            </div>
          </aside>
        </div>
      </div>
      <div class="meeting-history">
        <h2>会议历史</h2>
        <div id="meetingList"></div>
      </div>`;
    root.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button) return;
      const action = button.dataset.mAction;
      const btnId = button.dataset.mId;
      const meeting = meetings.find(m => m.id === button.closest('[data-m-id]')?.dataset.mId);
      if (action === 'asr-settings') {
        if (window.ASRSettings) window.ASRSettings.openDialog();
      }
      if (action === 'create') {
        W.openDialog(`<div class="ws-dialog-head"><div><h2 id="wsDialogTitle">新建会议</h2><p>${hasASR ? '将自动启动麦克风进行语音识别' : '手动记录模式'}</p></div><button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">${icon('close')}</button></div>
          <form id="meetingForm"><label>会议名称<input id="meetingTitleInput" maxlength="100" placeholder="例如：产品评审会" autofocus></label><div class="ws-dialog-actions"><button type="button" class="ws-btn" data-ws-close>取消</button><button type="submit" class="ws-btn primary">开始会议</button></div></form>`, () => {});
        document.getElementById('meetingForm').addEventListener('submit', e => { e.preventDefault(); createMeeting(); });
      }
      if (action === 'pause') {
        if (pausedAt) {
          elapsed += Date.now() - pausedAt;
          pausedAt = null;
          button.innerHTML = `${icon('pause')}暂停`;
          if (hasASR && !recognizing) startRecognition();
        } else {
          pausedAt = Date.now();
          button.innerHTML = `${icon('play')}继续`;
          stopRecognition();
        }
        renderActive();
      }
      if (action === 'end') {
        if (window.confirm(`结束会议"${active.title}"？\n时长：${formatDuration(elapsed)}\n\n结束后将保存完整记录。`)) endMeeting();
      }
      if (action === 'add-transcript') addTranscript();
      if (action === 'add-summary') addSummary();
      if (action === 'add-keypoint') addKeyPoint();
      if (action === 'add-action') addActionItem();
      if (action === 'view' && meeting) viewMeeting(meeting);
      if (action === 'export-txt' && btnId) {
        const m = meetings.find(item => item.id === btnId);
        if (m) exportMeeting(m, 'txt');
      }
      if (action === 'export-md' && btnId) {
        const m = meetings.find(item => item.id === btnId);
        if (m) exportMeeting(m, 'md');
      }
      if (action === 'delete' && meeting) {
        if (window.confirm(`确定删除"${meeting.title}"？此操作不可恢复。`)) {
          if (update(items => items.filter(m => m.id !== meeting.id))) renderList();
        }
      }
    });
    root.addEventListener('change', e => {
      if (e.target.type === 'checkbox' && e.target.dataset.aIndex !== undefined) {
        toggleActionItem(Number(e.target.dataset.aIndex));
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'transcriptText') addTranscript();
      if (e.key === 'Enter' && e.target.id === 'summaryInput') addSummary();
      if (e.key === 'Enter' && e.target.id === 'keyPointInput') addKeyPoint();
      if (e.key === 'Enter' && e.target.id === 'actionItemInput') addActionItem();
    });
    window.addEventListener('beforeunload', () => {
      if (active && !pausedAt) {
        active.duration = elapsed;
        active.updatedAt = Date.now();
        update(items => items.map(m => m.id === active.id ? { ...m, ...active } : m));
      }
      stopRecognition();
    });
    renderList();
  }
  window.addEventListener('coretab:workspace', e => { if (e.detail === 'meetings') init(); });
})();
