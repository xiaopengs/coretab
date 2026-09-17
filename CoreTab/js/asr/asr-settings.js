/**
 * ASR 设置 UI - 服务商选择、凭证配置
 */

const ASRSettings = {
  SETTINGS_KEY: 'coretab_asr_settings_v1',

  /**
   * 加载设置
   */
  load() {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      if (!raw) return this.getDefault();
      return { ...this.getDefault(), ...JSON.parse(raw) };
    } catch (e) {
      return this.getDefault();
    }
  },

  /**
   * 保存设置
   */
  save(settings) {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 默认设置
   */
  getDefault() {
    return {
      provider: 'browser',
      model: '',
      lang: 'zh-CN',
      credentials: {
        volcengine: { accessKeyId: '', secretKey: '', appId: '' },
        tencent: { secretId: '', secretKey: '' },
        alicloud: { accessKeyId: '', accessKeySecret: '', appKey: '' }
      }
    };
  },

  /**
   * 打开设置对话框
   */
  openDialog() {
    const settings = this.load();
    const providers = window.ASRProvider.getProviders();
    const W = window.CoreTabWorkspace;
    const { icon, escape: esc } = W;

    const providerOptions = providers.map(p => `
      <label class="asr-provider-option">
        <input type="radio" name="asr-provider" value="${esc(p.id)}" ${settings.provider === p.id ? 'checked' : ''}>
        <span class="asr-provider-name">${esc(p.name)}</span>
        ${p.needsKey ? '<span class="asr-provider-badge">需配置</span>' : '<span class="asr-provider-badge free">免费</span>'}
      </label>
    `).join('');

    const currentProvider = providers.find(p => p.id === settings.provider);
    const fieldsHtml = this.renderProviderFields(currentProvider, settings);

    W.openDialog(`
      <div class="ws-dialog-head">
        <div>
          <h2 id="wsDialogTitle">ASR 语音识别设置</h2>
          <p>选择语音识别服务商并配置 API Key</p>
        </div>
        <button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="asr-settings">
        <div class="asr-providers">
          <h4 class="asr-section-title">服务商</h4>
          <div class="asr-provider-list">
            ${providerOptions}
          </div>
        </div>
        <div id="asrProviderFields">
          ${fieldsHtml}
        </div>
      </div>
      <div class="ws-dialog-actions">
        <button type="button" class="ws-btn" id="asrTestConnection">测试连接</button>
        <button type="button" class="ws-btn primary" id="asrSaveSettings">保存</button>
      </div>
      <p id="wsDialogError" class="ws-error" role="alert"></p>
    `, () => {});

    // 绑定事件
    this.bindEvents();
  },

  /**
   * 渲染服务商配置字段
   */
  renderProviderFields(provider, settings) {
    if (!provider || !provider.needsKey) {
      return `<div class="asr-info">
        <p>使用浏览器内置的语音识别能力，无需配置。</p>
        <p class="asr-hint">基于 Web Speech API，支持 Chrome 浏览器。</p>
      </div>`;
    }

    const creds = settings.credentials?.[provider.id] || {};
    const fields = provider.keyFields.map(f => `
      <label class="asr-field">
        <span class="asr-field-label">${esc(f.label)}</span>
        <input type="${f.type || 'text'}" class="asr-field-input" data-cred-key="${esc(f.key)}"
          placeholder="${esc(f.placeholder || '')}" value="${esc(creds[f.key] || '')}" autocomplete="off">
      </label>
    `).join('');

    const models = (provider.models || []).map(m =>
      `<option value="${esc(m.id)}" ${settings.model === m.id ? 'selected' : ''}>${esc(m.name)}</option>`
    ).join('');

    const helpLinks = {
      volcengine: 'https://console.volcengine.com/speech/app',
      tencent: 'https://console.cloud.tencent.com/asr',
      alicloud: 'https://nls-portal.console.aliyun.com/'
    };

    return `
      <div class="asr-fields">
        <h4 class="asr-section-title">${esc(provider.name)} 配置</h4>
        ${fields}
        <label class="asr-field">
          <span class="asr-field-label">识别模型</span>
          <select class="asr-field-input" data-setting="model">
            ${models}
          </select>
        </label>
        <label class="asr-field">
          <span class="asr-field-label">识别语言</span>
          <select class="asr-field-input" data-setting="lang">
            <option value="zh-CN" ${settings.lang === 'zh-CN' ? 'selected' : ''}>中文</option>
            <option value="en-US" ${settings.lang === 'en-US' ? 'selected' : ''}>English</option>
            <option value="ja-JP" ${settings.lang === 'ja-JP' ? 'selected' : ''}>日本語</option>
          </select>
        </label>
      </div>
      <div class="asr-help">
        <p>💡 如何获取 API Key？</p>
        <p>→ <a href="${helpLinks[provider.id] || '#'}" target="_blank" rel="noopener">${esc(provider.name)}控制台</a> 开通语音识别服务并创建应用</p>
      </div>
    `;
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    const settings = this.load();
    const providers = window.ASRProvider.getProviders();
    const fieldsContainer = document.getElementById('asrProviderFields');

    // 服务商切换
    document.querySelectorAll('[name="asr-provider"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const providerId = e.target.value;
        const provider = providers.find(p => p.id === providerId);
        settings.provider = providerId;
        if (provider?.models?.length) {
          settings.model = provider.models[0].id;
        }
        fieldsContainer.innerHTML = this.renderProviderFields(provider, settings);
      });
    });

    // 测试连接
    document.getElementById('asrTestConnection').addEventListener('click', async () => {
      const errorEl = document.getElementById('wsDialogError');
      errorEl.textContent = '';
      const currentSettings = this.gatherSettings();
      const providerId = currentSettings.provider;

      if (providerId === 'browser') {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        errorEl.textContent = SpeechRec ? '✓ 浏览器支持语音识别' : '✗ 浏览器不支持 Web Speech API';
        errorEl.style.color = SpeechRec ? '#078a52' : '#d32f2f';
        return;
      }

      try {
        const provider = window.ASRProvider.create(currentSettings);
        await provider.init();
        errorEl.textContent = '✓ 凭证格式正确';
        errorEl.style.color = '#078a52';
      } catch (e) {
        errorEl.textContent = '✗ ' + e.message;
        errorEl.style.color = '#d32f2f';
      }
    });

    // 保存设置
    document.getElementById('asrSaveSettings').addEventListener('click', () => {
      const errorEl = document.getElementById('wsDialogError');
      errorEl.textContent = '';
      const newSettings = this.gatherSettings();

      if (this.save(newSettings)) {
        window.CoreTabWorkspace.closeDialog();
        if (typeof showToast === 'function') {
          showToast('ASR 设置已保存');
        }
      } else {
        errorEl.textContent = '保存失败，请重试';
      }
    });
  },

  /**
   * 收集当前表单设置
   */
  gatherSettings() {
    const settings = this.load();
    const providerId = document.querySelector('[name="asr-provider"]:checked')?.value || 'browser';
    settings.provider = providerId;

    // 收集凭证
    const credInputs = document.querySelectorAll('.asr-field-input[data-cred-key]');
    if (!settings.credentials[providerId]) {
      settings.credentials[providerId] = {};
    }
    credInputs.forEach(input => {
      settings.credentials[providerId][input.dataset.credKey] = input.value;
    });

    // 收集模型和语言
    const modelSelect = document.querySelector('[data-setting="model"]');
    const langSelect = document.querySelector('[data-setting="lang"]');
    if (modelSelect) settings.model = modelSelect.value;
    if (langSelect) settings.lang = langSelect.value;

    return settings;
  }
};

window.ASRSettings = ASRSettings;
