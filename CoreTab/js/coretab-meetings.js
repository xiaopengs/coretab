/* Local-first Meetings workspace, isolated from browser-tab storage. */
'use strict';

(() => {
  // ── Dependencies ──
  const W = window.CoreTabWorkspace;
  const { icon, escape: esc } = W;
  const KEY = 'coretab_meetings_v1';
  const root = document.getElementById('meetingsWorkspace');

  // ── State ──
  const state = {
    initialized: false,
    meetings: [],
    active: null,
    timer: null,
    elapsed: 0,
    pausedAt: null,
    hasASR: false,
    asrProvider: null,
    recognizing: false,
    currentSpeaker: 'Speaker',
    analysisEngine: null,
    aiProvider: null
  };

  // ── Storage Layer ──
  const Storage = {
    getASRSettings() {
      return (window.ASRSettings && window.ASRSettings.load()) || { provider: 'browser' };
    },

    getAISettings() {
      return (window.AISettings && window.AISettings.load()) || { enabled: false };
    },

    valid(m) {
      return m && ['id', 'title', 'status'].every(k => typeof m[k] === 'string') &&
        Array.isArray(m.transcript) && Array.isArray(m.summary) && Array.isArray(m.keyPoints) && Array.isArray(m.actionItems) &&
        ['createdAt', 'updatedAt', 'duration'].every(k => Number.isFinite(m[k]) && m[k] >= 0);
    },

    load() { return W.read(KEY, [], this.valid); },

    update(change) {
      try {
        const next = change(this.load());
        if (!W.save(KEY, next)) return false;
        state.meetings = next;
        return true;
      } catch {
        showToast('无法读取会议数据，请保留本地数据并重试。');
        return false;
      }
    }
  };

  // ── Utilities ──
  const Utils = {
    formatDuration(ms) {
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
    },

    formatTime(ts) {
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    },

    downloadFile(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    safeFilename(title) {
      return title.replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40);
    }
  };

  // ── Templates ─
  const Templates = {
    meetingListItem(m) {
      return `
        <article class="meeting-item ws-panel" data-m-id="${esc(m.id)}">
          <div class="meeting-item-head">
            <h2>${esc(m.title)}</h2>
            <span class="meeting-duration">${icon('clock')}${Utils.formatDuration(m.duration)}</span>
          </div>
          <div class="meeting-meta">
            <span>${icon('people')}${m.participants.length} 人</span>
            <span>${icon('note')}${m.transcript.length} 条记录</span>
            <span>${Utils.formatTime(m.updatedAt)}</span>
          </div>
          <div class="meeting-item-actions">
            <button class="ws-btn" data-m-action="view">${icon('open')}查看详情</button>
            <button class="ws-btn" data-m-action="export-txt" data-m-id="${esc(m.id)}">导出 TXT</button>
            <button class="ws-btn" data-m-action="export-md" data-m-id="${esc(m.id)}">导出 MD</button>
            <button class="ws-btn danger" data-m-action="delete">${icon('trash')}删除</button>
          </div>
        </article>
      `;
    },

    transcriptItem(t) {
      return `
        <div class="transcript-item">
          <div class="transcript-speaker">${esc(t.speaker)}</div>
          <div class="transcript-time">${Utils.formatDuration(t.timestamp)}</div>
          <div class="transcript-text">${esc(t.text)}</div>
        </div>
      `;
    },

    actionItem(a, i) {
      return `
        <li class="action-item ${a.completed ? 'completed' : ''}">
          <input type="checkbox" data-a-index="${i}" ${a.completed ? 'checked' : ''}>
          <span>${esc(a.content)}</span>
        </li>
      `;
    },

    viewpointCard(vp) {
      return `
        <div class="ai-viewpoint-card">
          <div class="ai-viewpoint-header">
            <div class="ai-viewpoint-text">"${esc(vp.originalText)}"</div>
            <div class="ai-viewpoint-meta">${esc(vp.speaker)} · ${Utils.formatDuration(vp.timestamp)}</div>
          </div>
          ${this.viewpointDetail(vp)}
          <div class="ai-feedback-row">
            <button class="ws-btn ai-feedback-btn" data-vp-id="${esc(vp.id)}" data-feedback="useful">有用</button>
            <button class="ws-btn ai-feedback-btn" data-vp-id="${esc(vp.id)}" data-feedback="wrong">有误</button>
            <button class="ws-btn ai-feedback-btn" data-vp-id="${esc(vp.id)}" data-feedback="ignore">忽略</button>
          </div>
        </div>
      `;
    },

    viewpointDetail(vp) {
      let html = '';
      if (vp.surface) {
        html += `<div class="ai-analysis-section"><div class="ai-analysis-label">表面含义</div><div>${esc(vp.surface)}</div></div>`;
      }
      if (vp.hidden) {
        html += `<div class="ai-analysis-section"><div class="ai-analysis-label">隐含意思</div><div>${esc(vp.hidden)}</div></div>`;
      }
      if (vp.flaws && vp.flaws.length > 0) {
        html += `<div class="ai-analysis-section"><div class="ai-analysis-label">逻辑漏洞 (${vp.flaws.length})</div>`;
        vp.flaws.forEach(f => {
          html += `
            <div class="ai-flaw-item">
              <div class="ai-flaw-header">
                <span class="ai-flaw-type">${esc(f.type)}</span>
                <button class="ai-flaw-toggle ws-btn">展开证据</button>
              </div>
              <div class="ai-flaw-desc">${esc(f.description)}</div>
              <div class="ai-flaw-evidence" hidden>
                ${f.evidence ? `<div class="ai-evidence-text">${esc(f.evidence)}</div>` : ''}
                ${f.suggestion ? `<div class="ai-suggestion-text">建议追问: ${esc(f.suggestion)}</div>` : ''}
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }
      if (vp.responses && vp.responses.length > 0) {
        html += `<div class="ai-analysis-section"><div class="ai-analysis-label">应对话术 (${vp.responses.length})</div>`;
        vp.responses.forEach(r => {
          html += `
            <div class="ai-response-item">
              <div class="ai-response-style">${esc(r.style)}</div>
              <div class="ai-response-text">"${esc(r.text)}"</div>
              <button class="ws-btn ai-copy-btn" data-text="${esc(r.text)}">复制</button>
            </div>
          `;
        });
        html += `</div>`;
      }
      return html;
    },

    viewDialog(m) {
      return `
        <div class="ws-dialog-head">
          <div>
            <h2 id="wsDialogTitle">${esc(m.title)}</h2>
            <p>${Utils.formatDuration(m.duration)} · ${m.participants.length} 人 · ${Utils.formatTime(m.updatedAt)}</p>
          </div>
          <button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="meeting-detail">
          <section>
            <h3>${icon('note')}会议摘要</h3>
            <ul>${m.summary.map(s => `<li>${esc(s)}</li>`).join('') || '<li class="ws-muted">暂无摘要</li>'}</ul>
          </section>
          <section>
            <h3>${icon('check')}关键结论</h3>
            <ul>${m.keyPoints.map(p => `<li>${esc(p)}</li>`).join('') || '<li class="ws-muted">暂无关键结论</li>'}</ul>
          </section>
          <section>
            <h3>${icon('shield')}行动项</h3>
            <ul>${m.actionItems.map((a, i) => this.actionItem(a, i)).join('') || '<li class="ws-muted">暂无行动项</li>'}</ul>
          </section>
          <section>
            <h3>${icon('note')}完整转写</h3>
            <div class="transcript-list">
              ${m.transcript.map(t => this.transcriptItem(t)).join('') || '<p class="ws-muted">暂无转写记录</p>'}
            </div>
          </section>
        </div>
        <div class="ws-dialog-actions">
          <button type="button" class="ws-btn danger" id="deleteMeetingDetail">${icon('trash')}删除会议</button>
          <button type="button" class="ws-btn" id="exportMeetingTXT">${icon('open')}导出 TXT</button>
          <button type="button" class="ws-btn" id="exportMeetingMD">${icon('open')}导出 MD</button>
          <button type="button" class="ws-btn" data-ws-close>关闭</button>
        </div>
      `;
    },

    createDialog() {
      return `
        <div class="ws-dialog-head">
          <div>
            <h2 id="wsDialogTitle">新建会议</h2>
            <p>${state.hasASR ? '将自动启动麦克风进行语音识别' : '手动记录模式'}</p>
          </div>
          <button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">${icon('close')}</button>
        </div>
        <form id="meetingForm">
          <label>会议名称<input id="meetingTitleInput" maxlength="100" placeholder="例如：产品评审会" autofocus></label>
          <div class="ws-dialog-actions">
            <button type="button" class="ws-btn" data-ws-close>取消</button>
            <button type="submit" class="ws-btn primary">开始会议</button>
          </div>
        </form>
      `;
    },

    shell(providerName) {
      return `
        <div class="ws-page-heading">
          <span class="ws-heading-icon">${icon('mic')}</span>
          <div>
            <h1>会议实时转写</h1>
            <p>实时转写 · AI 分析 · 行动项</p>
          </div>
          <div class="ws-page-heading-actions">
            <button class="ws-btn" data-m-action="asr-settings">${icon('settings')}ASR 设置</button>
            <button class="ws-btn" data-m-action="ai-settings">${icon('settings')}AI 设置</button>
            <button class="ws-btn primary" data-m-action="create">${icon('plus')}新建会议</button>
          </div>
        </div>
        <div id="meetingEmpty" class="ws-empty ws-panel">
          ${icon('mic')}
          <h2>让每一次会议都有价值</h2>
          <p>会议记录、关键结论和行动项，在这里有序归档。</p>
          <span class="ws-badge">当前引擎：${esc(providerName)}</span>
        </div>
        <div id="meetingActive" hidden>
          ${this.meetingHeader()}
          ${this.meetingColumns()}
        </div>
        <div class="meeting-history">
          <h2>会议历史</h2>
          <div id="meetingList"></div>
        </div>
      `;
    },

    meetingHeader() {
      return `
        <div class="meeting-header">
          <div class="meeting-header-info">
            <span class="meeting-status live" id="meetingStatus">${state.hasASR ? '正在录音' : '手动模式'}</span>
            <h2 id="meetingTitle">会议名称</h2>
            <div class="meeting-timer">${icon('clock')}<span id="meetingTimer">0:00</span></div>
          </div>
          <div class="meeting-header-actions">
            <button class="ws-btn" data-m-action="pause">${icon('pause')}暂停</button>
            <button class="ws-btn danger" data-m-action="end">${icon('stop')}结束会议</button>
          </div>
        </div>
      `;
    },

    meetingColumns() {
      return `
        <div class="meeting-columns meeting-columns-3">
          <section class="meeting-column">
            <h3>${icon('note')}实时转写</h3>
            <div class="transcript-input">
              <input type="text" id="transcriptSpeaker" placeholder="说话人" value="Speaker">
              <input type="text" id="transcriptText" placeholder="${state.hasASR ? '语音识别中…也可手动输入' : '输入转写内容…'}">
              <button class="ws-btn primary" data-m-action="add-transcript">${icon('plus')}添加</button>
            </div>
            <div id="transcriptList" class="transcript-list"></div>
          </section>
          <section class="meeting-column">
            <h3>${icon('spark')}AI 要点总结</h3>
            <div id="aiAnalyzing" class="ai-analyzing-indicator" hidden>
              <span class="ai-analyzing-dot"></span>
              <span>分析中...</span>
            </div>
            <div id="aiKeyPoints" class="ai-keypoints-list">
              <div class="ws-muted">会议开始后，AI 会自动提炼关键要点</div>
            </div>
            <div class="ai-panel-footer">
              <span id="aiLastUpdate" class="ai-last-update"></span>
              <button class="ws-btn" data-m-action="ai-refresh">刷新</button>
            </div>
          </section>
          <section class="meeting-column">
            <h3>${icon('search')}观点分析</h3>
            <div id="aiTokenUsage" class="ai-token-usage"></div>
            <div id="aiViewpoints" class="ai-viewpoints-list">
              <div class="ws-muted">当检测到重要观点时，AI 会自动分析</div>
            </div>
          </section>
        </div>
      `;
    },

    errorState() {
      return '<div class="ws-empty ws-panel"><h1>会议数据暂时无法加载</h1><p>原始数据未被覆盖。请检查浏览器存储后重试。</p><button class="ws-btn" id="retryMeetings">重新加载</button></div>';
    }
  };

  // ── Renderers ──
  const Render = {
    list() {
      const list = state.meetings.filter(m => m.status === 'ended').sort((a, b) => b.updatedAt - a.updatedAt);
      const el = root.querySelector('#meetingList');
      if (!el) return;
      el.innerHTML = list.length
        ? list.map(m => Templates.meetingListItem(m)).join('')
        : `<div class="ws-empty"><h2>暂无会议记录</h2><p>开始你的第一次会议，让每次讨论都有价值。</p></div>`;
    },

    active() {
      if (!state.active) return;
      const el = (id) => root.querySelector(id);

      const titleEl = el('#meetingTitle');
      if (titleEl) titleEl.textContent = state.active.title;

      const timerEl = el('#meetingTimer');
      if (timerEl) timerEl.textContent = Utils.formatDuration(state.elapsed);

      const statusEl = el('#meetingStatus');
      if (statusEl) {
        if (state.pausedAt) {
          statusEl.textContent = '已暂停';
          statusEl.className = 'meeting-status paused';
        } else if (state.recognizing) {
          statusEl.textContent = '正在录音';
          statusEl.className = 'meeting-status live';
        } else {
          statusEl.textContent = '手动模式';
          statusEl.className = 'meeting-status paused';
        }
      }

      const transcriptList = el('#transcriptList');
      if (transcriptList) {
        transcriptList.innerHTML = state.active.transcript.map(t => Templates.transcriptItem(t)).join('');
      }

      const summaryList = el('#summaryList');
      if (summaryList) {
        summaryList.innerHTML = state.active.summary.map(s => `<li>${esc(s)}</li>`).join('')
          || '<li class="ws-muted">暂无摘要，会议进行中会自动生成。</li>';
      }

      const keyPointsList = el('#keyPointsList');
      if (keyPointsList) {
        keyPointsList.innerHTML = state.active.keyPoints.map(p => `<li>${esc(p)}</li>`).join('')
          || '<li class="ws-muted">暂无关键结论。</li>';
      }

      const actionItemsList = el('#actionItemsList');
      if (actionItemsList) {
        actionItemsList.innerHTML = state.active.actionItems.map((a, i) => Templates.actionItem(a, i)).join('')
          || '<li class="ws-muted">暂无行动项。</li>';
      }
    },

    aiPanels(analysis, tokenUsage) {
      const el = (id) => root.querySelector(id);

      const indicator = el('#aiAnalyzing');
      if (indicator) indicator.hidden = true;

      const keyPointsEl = el('#aiKeyPoints');
      if (keyPointsEl && analysis.keyPoints) {
        keyPointsEl.innerHTML = analysis.keyPoints.length
          ? analysis.keyPoints.map((kp, i) => `
              <div class="ai-keypoint-item">
                <div class="ai-keypoint-content">${i + 1}. ${esc(kp.content)}</div>
                <div class="ai-keypoint-meta">${esc(kp.speaker)} · ${Utils.formatDuration(kp.timestamp)} · ${Math.round(kp.confidence * 100)}%</div>
              </div>
            `).join('')
          : '<div class="ws-muted">暂无要点</div>';
      }

      const lastUpdateEl = el('#aiLastUpdate');
      if (lastUpdateEl && analysis.lastAnalysisAt) {
        lastUpdateEl.textContent = `上次更新: ${new Date(analysis.lastAnalysisAt).toLocaleTimeString('zh-CN')}`;
      }

      const viewpointsEl = el('#aiViewpoints');
      if (viewpointsEl && analysis.viewpoints) {
        const viewpoints = analysis.viewpoints;
        const latest = viewpoints[viewpoints.length - 1];
        const history = viewpoints.slice(0, -1);

        let html = '';
        if (latest) html += Templates.viewpointCard(latest);
        if (history.length > 0) {
          html += `<div class="ai-history-section"><h4>历史观点</h4>`;
          html += history.reverse().map(vp => `
            <details class="ai-history-item">
              <summary>${esc(vp.speaker)}: "${esc(vp.originalText.slice(0, 30))}${vp.originalText.length > 30 ? '...' : ''}"</summary>
              ${Templates.viewpointDetail(vp)}
            </details>
          `).join('');
          html += `</div>`;
        }
        viewpointsEl.innerHTML = html || '<div class="ws-muted">暂无观点分析</div>';

        this.bindViewpointButtons(viewpointsEl, analysis);
      }

      const tokenEl = el('#aiTokenUsage');
      if (tokenEl && tokenUsage) {
        const total = tokenUsage.prompt + tokenUsage.completion;
        const cost = state.analysisEngine ? state.analysisEngine.estimateCost() : 0;
        tokenEl.textContent = `已用: ${total.toLocaleString()} tokens · ¥${cost.toFixed(4)}`;
      }
    },

    bindViewpointButtons(container, analysis) {
      container.querySelectorAll('.ai-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.text).then(() => {
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = '复制'; }, 1500);
          });
        });
      });

      container.querySelectorAll('.ai-feedback-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const vp = analysis.viewpoints.find(v => v.id === btn.dataset.vpId);
          if (vp) {
            vp.feedback = btn.dataset.feedback;
            Actions.saveAnalysis(analysis);
          }
          showToast('感谢反馈');
        });
      });

      container.querySelectorAll('.ai-flaw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const detail = btn.nextElementSibling;
          if (detail) detail.hidden = !detail.hidden;
        });
      });
    }
  };

  // ── ASR ──
  const ASR = {
    async start() {
      if (state.recognizing) return;
      const settings = Storage.getASRSettings();
      try {
        state.asrProvider = window.ASRProvider.create({
          provider: settings.provider,
          credentials: settings.credentials,
          model: settings.model,
          lang: settings.lang,
          onResult: ({ text, isFinal }) => {
            if (!state.active || !isFinal || !text) return;
            state.active.transcript.push({ speaker: state.currentSpeaker, text, timestamp: state.elapsed });
            state.active.updatedAt = Date.now();
            Render.active();
            Actions.scrollTranscript();
            if (state.analysisEngine) state.analysisEngine.notifyNewTranscript();
          },
          onError: (err) => {
            showToast('语音识别出错：' + err.message);
            this.stop();
          },
          onStatusChange: (status) => {
            state.recognizing = status === 'listening';
            Render.active();
          }
        });
        await state.asrProvider.init();
        await state.asrProvider.start();
        state.recognizing = true;
      } catch (e) {
        showToast('无法启动语音识别：' + e.message);
        state.recognizing = false;
      }
    },

    stop() {
      state.recognizing = false;
      if (state.asrProvider) {
        state.asrProvider.stop();
        state.asrProvider = null;
      }
    }
  };

  // ── AI Analysis ──
  const AI = {
    start() {
      if (state.analysisEngine) return;
      const aiSettings = Storage.getAISettings();
      if (!aiSettings.enabled || !aiSettings.apiKey) return;
      try {
        state.aiProvider = window.AIProvider.create(aiSettings);
        state.analysisEngine = new window.MeetingAnalysisEngine(state.active, state.aiProvider, aiSettings);
        state.analysisEngine.on('analysis-updated', ({ analysis, tokenUsage }) => {
          Render.aiPanels(analysis, tokenUsage);
          Actions.saveAnalysis(analysis);
        });
        state.analysisEngine.on('analyzing', () => {
          const indicator = root.querySelector('#aiAnalyzing');
          if (indicator) indicator.hidden = false;
        });
        state.analysisEngine.on('analysis-error', (err) => {
          const indicator = root.querySelector('#aiAnalyzing');
          if (indicator) indicator.hidden = true;
          console.error('AI analysis error:', err);
        });
        state.analysisEngine.on('token-limit', () => {
          showToast('Token 已达上限，分析已暂停');
        });
        state.analysisEngine.start();
      } catch (e) {
        console.error('Failed to start AI analysis:', e);
        state.analysisEngine = null;
        state.aiProvider = null;
      }
    },

    stop() {
      if (state.analysisEngine) {
        state.analysisEngine.stop();
        state.analysisEngine = null;
        state.aiProvider = null;
      }
    }
  };

  // ── Timer ──
  const Timer = {
    start() {
      if (state.timer) return;
      const start = Date.now() - state.elapsed;
      state.timer = setInterval(() => {
        if (!state.pausedAt) {
          state.elapsed = Date.now() - start;
          const timerEl = root.querySelector('#meetingTimer');
          if (timerEl && state.active) timerEl.textContent = Utils.formatDuration(state.elapsed);
        }
      }, 1000);
    },

    stop() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
    }
  };

  // ── Actions ──
  const Actions = {
    scrollTranscript() {
      const list = root.querySelector('#transcriptList');
      if (list) list.scrollTop = list.scrollHeight;
    },

    addTranscript() {
      if (!state.active) return;
      const speakerInput = root.querySelector('#transcriptSpeaker');
      const textInput = root.querySelector('#transcriptText');
      if (!speakerInput || !textInput) return;
      const speaker = speakerInput.value.trim() || 'Speaker';
      const text = textInput.value.trim();
      if (!text) return;
      state.currentSpeaker = speaker;
      state.active.transcript.push({ speaker, text, timestamp: state.elapsed });
      state.active.updatedAt = Date.now();
      textInput.value = '';
      Render.active();
      this.scrollTranscript();
      if (state.analysisEngine) state.analysisEngine.notifyNewTranscript();
    },

    addSummary() {
      if (!state.active) return;
      const input = root.querySelector('#summaryInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      state.active.summary.push(text);
      state.active.updatedAt = Date.now();
      input.value = '';
      Render.active();
    },

    addKeyPoint() {
      if (!state.active) return;
      const input = root.querySelector('#keyPointInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      state.active.keyPoints.push(text);
      state.active.updatedAt = Date.now();
      input.value = '';
      Render.active();
    },

    addActionItem() {
      if (!state.active) return;
      const input = root.querySelector('#actionItemInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      state.active.actionItems.push({ content: text, completed: false });
      state.active.updatedAt = Date.now();
      input.value = '';
      Render.active();
    },

    toggleActionItem(index) {
      if (!state.active) return;
      state.active.actionItems[index].completed = !state.active.actionItems[index].completed;
      state.active.updatedAt = Date.now();
      Render.active();
    },

    saveAnalysis(analysis) {
      if (!state.active) return;
      state.active.analysis = analysis;
      state.active.updatedAt = Date.now();
      Storage.update(items => items.map(m => m.id === state.active.id ? { ...m, ...state.active } : m));
    },

    openMeeting(meeting) {
      state.active = meeting;
      state.elapsed = meeting.duration;
      state.pausedAt = null;
      const emptyEl = root.querySelector('#meetingEmpty');
      const activeEl = root.querySelector('#meetingActive');
      if (emptyEl) emptyEl.hidden = true;
      if (activeEl) activeEl.hidden = false;
      Render.active();
      Timer.start();
      ASR.start();
      AI.start();
    },

    endMeeting() {
      if (!state.active) return;
      Timer.stop();
      ASR.stop();
      AI.stop();
      state.active.status = 'ended';
      state.active.duration = state.elapsed;
      state.active.updatedAt = Date.now();
      if (Storage.update(items => items.map(m => m.id === state.active.id ? { ...m, ...state.active } : m))) {
        state.active = null;
        state.elapsed = 0;
        const emptyEl = root.querySelector('#meetingEmpty');
        const activeEl = root.querySelector('#meetingActive');
        if (emptyEl) emptyEl.hidden = false;
        if (activeEl) activeEl.hidden = true;
        Render.list();
        showToast('会议已结束并保存');
      }
    },

    createMeeting() {
      const titleInput = document.getElementById('meetingTitleInput');
      if (!titleInput) return;
      const title = titleInput.value.trim();
      if (!title) {
        const errorEl = document.getElementById('wsDialogError');
        if (errorEl) errorEl.textContent = '会议名称不能为空';
        return;
      }
      const now = Date.now();
      const meeting = {
        id: crypto.randomUUID(),
        title,
        status: 'active',
        participants: ['Speaker'],
        transcript: [],
        summary: [],
        keyPoints: [],
        actionItems: [],
        createdAt: now,
        updatedAt: now,
        duration: 0
      };
      if (Storage.update(items => [...items, meeting])) {
        W.closeDialog();
        this.openMeeting(meeting);
        showToast('会议已开始');
      }
    },

    viewMeeting(meeting) {
      const m = state.meetings.find(item => item.id === meeting.id);
      if (!m) return;
      W.openDialog(Templates.viewDialog(m), () => {});
      this.bindViewDialogButtons(m);
    },

    bindViewDialogButtons(m) {
      const deleteBtn = document.getElementById('deleteMeetingDetail');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (!window.confirm(`确定删除"${m.title}"？此操作不可恢复。`)) return;
          if (Storage.update(items => items.filter(item => item.id !== m.id))) {
            W.closeDialog();
            Render.list();
            showToast('会议已删除');
          }
        });
      }
      const exportTxtBtn = document.getElementById('exportMeetingTXT');
      if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => Export.meeting(m, 'txt'));
      const exportMdBtn = document.getElementById('exportMeetingMD');
      if (exportMdBtn) exportMdBtn.addEventListener('click', () => Export.meeting(m, 'md'));
    },

    handlePause(button) {
      if (state.pausedAt) {
        state.elapsed += Date.now() - state.pausedAt;
        state.pausedAt = null;
        button.innerHTML = `${icon('pause')}暂停`;
        if (state.hasASR && !state.recognizing) ASR.start();
      } else {
        state.pausedAt = Date.now();
        button.innerHTML = `${icon('play')}继续`;
        ASR.stop();
      }
      Render.active();
    }
  };

  // ── Export ──
  const Export = {
    txt(m) {
      const lines = [];
      lines.push(`会议：${m.title}`);
      lines.push(`时间：${new Date(m.createdAt).toLocaleString('zh-CN')}`);
      lines.push(`时长：${Utils.formatDuration(m.duration)}`);
      lines.push(`参与人：${m.participants.join(', ')}`);
      lines.push('');

      if (m.analysis && m.analysis.keyPoints && m.analysis.keyPoints.length) {
        lines.push('═══ AI 要点总结 ═══');
        m.analysis.keyPoints.forEach(kp => lines.push(`• ${kp.content} (${kp.speaker})`));
        lines.push('');
      }
      if (m.analysis && m.analysis.viewpoints && m.analysis.viewpoints.length) {
        lines.push('═══ AI 观点分析 ═══');
        m.analysis.viewpoints.forEach(vp => {
          lines.push(`观点: "${vp.originalText}" (${vp.speaker})`);
          lines.push(`  表面: ${vp.surface}`);
          lines.push(`  隐含: ${vp.hidden}`);
          if (vp.flaws && vp.flaws.length) {
            lines.push('  漏洞:');
            vp.flaws.forEach(f => lines.push(`    ⚠️ ${f.type}: ${f.description}`));
          }
          if (vp.responses && vp.responses.length) {
            lines.push('  话术:');
            vp.responses.forEach(r => lines.push(`    💬 ${r.style}: ${r.text}`));
          }
          lines.push('');
        });
      }
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
        m.transcript.forEach(t => lines.push(`[${Utils.formatDuration(t.timestamp)}] ${t.speaker}：${t.text}`));
      }
      return lines.join('\n');
    },

    markdown(m) {
      const lines = [];
      lines.push(`# ${m.title}`);
      lines.push('');
      lines.push(`- **时间**：${new Date(m.createdAt).toLocaleString('zh-CN')}`);
      lines.push(`- **时长**：${Utils.formatDuration(m.duration)}`);
      lines.push(`- **参与人**：${m.participants.join(', ')}`);
      lines.push('');

      if (m.analysis && m.analysis.keyPoints && m.analysis.keyPoints.length) {
        lines.push('## AI 要点总结');
        lines.push('');
        m.analysis.keyPoints.forEach(kp => lines.push(`- ${kp.content} (${kp.speaker})`));
        lines.push('');
      }
      if (m.analysis && m.analysis.viewpoints && m.analysis.viewpoints.length) {
        lines.push('## AI 观点分析');
        lines.push('');
        m.analysis.viewpoints.forEach(vp => {
          lines.push(`### 观点: "${vp.originalText}" (${vp.speaker})`);
          lines.push('');
          lines.push(`**表面含义**: ${vp.surface}`);
          lines.push('');
          lines.push(`**隐含意思**: ${vp.hidden}`);
          lines.push('');
          if (vp.flaws && vp.flaws.length) {
            lines.push('**逻辑漏洞**:');
            vp.flaws.forEach(f => lines.push(`- ⚠️ ${f.type}: ${f.description}`));
            lines.push('');
          }
          if (vp.responses && vp.responses.length) {
            lines.push('**应对话术**:');
            vp.responses.forEach(r => lines.push(`-  ${r.style}: ${r.text}`));
            lines.push('');
          }
        });
      }
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
        m.transcript.forEach(t => lines.push(`**${t.speaker}** (${Utils.formatDuration(t.timestamp)})：${t.text}`));
        lines.push('');
      }
      return lines.join('\n');
    },

    meeting(m, format) {
      const date = new Date(m.createdAt).toISOString().slice(0, 10);
      const filename = `${date}_${Utils.safeFilename(m.title)}`;
      if (format === 'txt') {
        Utils.downloadFile(this.txt(m), `${filename}.txt`, 'text/plain;charset=utf-8');
      } else {
        Utils.downloadFile(this.markdown(m), `${filename}.md`, 'text/markdown;charset=utf-8');
      }
    }
  };

  // ── Event Handlers ──
  const Events = {
    handleClick(e) {
      const button = e.target.closest('button');
      if (!button) return;
      const action = button.dataset.mAction;
      const btnId = button.dataset.mId;
      const meeting = state.meetings.find(m => m.id === button.closest('[data-m-id]')?.dataset.mId);

      switch (action) {
        case 'asr-settings':
          if (window.ASRSettings) window.ASRSettings.openDialog();
          break;
        case 'ai-settings':
          if (window.AISettings) window.AISettings.openDialog();
          break;
        case 'ai-refresh':
          if (state.analysisEngine) state.analysisEngine.runAnalysis();
          break;
        case 'create':
          W.openDialog(Templates.createDialog(), () => {});
          const form = document.getElementById('meetingForm');
          if (form) form.addEventListener('submit', e => { e.preventDefault(); Actions.createMeeting(); });
          break;
        case 'pause':
          Actions.handlePause(button);
          break;
        case 'end':
          if (window.confirm(`结束会议"${state.active.title}"？\n时长：${Utils.formatDuration(state.elapsed)}\n\n结束后将保存完整记录。`)) {
            Actions.endMeeting();
          }
          break;
        case 'add-transcript':
          Actions.addTranscript();
          break;
        case 'add-summary':
          Actions.addSummary();
          break;
        case 'add-keypoint':
          Actions.addKeyPoint();
          break;
        case 'add-action':
          Actions.addActionItem();
          break;
        case 'view':
          if (meeting) Actions.viewMeeting(meeting);
          break;
        case 'export-txt':
          if (btnId) {
            const m = state.meetings.find(item => item.id === btnId);
            if (m) Export.meeting(m, 'txt');
          }
          break;
        case 'export-md':
          if (btnId) {
            const m = state.meetings.find(item => item.id === btnId);
            if (m) Export.meeting(m, 'md');
          }
          break;
        case 'delete':
          if (meeting) {
            if (window.confirm(`确定删除"${meeting.title}"？此操作不可恢复。`)) {
              if (Storage.update(items => items.filter(m => m.id !== meeting.id))) Render.list();
            }
          }
          break;
      }
    },

    handleChange(e) {
      if (e.target.type === 'checkbox' && e.target.dataset.aIndex !== undefined) {
        Actions.toggleActionItem(Number(e.target.dataset.aIndex));
      }
    },

    handleKeydown(e) {
      if (e.key === 'Enter') {
        if (e.target.id === 'transcriptText') Actions.addTranscript();
        if (e.target.id === 'summaryInput') Actions.addSummary();
        if (e.target.id === 'keyPointInput') Actions.addKeyPoint();
        if (e.target.id === 'actionItemInput') Actions.addActionItem();
      }
    },

    handleBeforeUnload() {
      if (state.active && !state.pausedAt) {
        state.active.duration = state.elapsed;
        state.active.updatedAt = Date.now();
        Storage.update(items => items.map(m => m.id === state.active.id ? { ...m, ...state.active } : m));
      }
      ASR.stop();
      AI.stop();
    }
  };

  // ── Init ──
  function init() {
    if (state.initialized) return;
    try {
      state.meetings = Storage.load();
    } catch {
      root.innerHTML = Templates.errorState();
      root.querySelector('#retryMeetings').onclick = init;
      return;
    }
    state.initialized = true;

    const asrSettings = Storage.getASRSettings();
    state.hasASR = asrSettings.provider === 'browser'
      ? !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      : true;
    const providerName = asrSettings.provider === 'browser'
      ? 'Web Speech API'
      : (window.ASRProvider?.getProviders?.()?.find(p => p.id === asrSettings.provider)?.name || asrSettings.provider);

    root.innerHTML = Templates.shell(providerName);

    root.addEventListener('click', Events.handleClick);
    root.addEventListener('change', Events.handleChange);
    root.addEventListener('keydown', Events.handleKeydown);
    window.addEventListener('beforeunload', Events.handleBeforeUnload);

    Render.list();
  }

  window.addEventListener('coretab:workspace', e => {
    if (e.detail === 'meetings') init();
  });
})();
