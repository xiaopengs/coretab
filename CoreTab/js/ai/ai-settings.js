// AI 设置管理
(function(window) {
  'use strict';

  const STORAGE_KEY = 'coretab_ai_settings_v1';

  const AISettings = {
    load() {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return this.getDefault();
        const settings = JSON.parse(data);
        return { ...this.getDefault(), ...settings };
      } catch (e) {
        console.error('Failed to load AI settings:', e);
        return this.getDefault();
      }
    },

    save(settings) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        return true;
      } catch (e) {
        console.error('Failed to save AI settings:', e);
        return false;
      }
    },

    getDefault() {
      return {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: '',
        baseUrl: '',
        temperature: 0.3,
        maxTokens: 2000,
        analysisInterval: 30,
        windowSize: 10,
        enabled: true,
        meetingType: 'review',
        tokenLimit: 50000
      };
    },

    openDialog() {
      const settings = this.load();
      const providers = window.AIProvider.getProviders();
      
      const html = `
        <div class="ai-settings">
          <div class="ws-dialog-head">
            <div>
              <h2>AI 分析设置</h2>
              <p>配置 AI 服务商和分析参数</p>
            </div>
            <button type="button" class="ws-icon-btn" data-ws-close aria-label="关闭">
              <svg class="ws-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="ai-section">
            <h3 class="ai-section-title">服务商配置</h3>
            <div class="ai-provider-list">
              ${providers.map(p => `
                <label class="ai-provider-option ${settings.provider === p.id ? 'selected' : ''}">
                  <input type="radio" name="ai-provider" value="${p.id}" ${settings.provider === p.id ? 'checked' : ''}>
                  <div class="ai-provider-info">
                    <div class="ai-provider-name">${p.name}</div>
                    <div class="ai-provider-desc">${p.description}</div>
                    <div class="ai-provider-price">${p.price}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="ai-section">
            <h3 class="ai-section-title">API 配置</h3>
            <div class="ai-fields">
              <div class="ai-field">
                <label class="ai-field-label">API Key</label>
                <input type="password" id="aiApiKey" class="ai-field-input" placeholder="输入 API Key" value="${settings.apiKey || ''}">
                <a href="${providers.find(p => p.id === settings.provider)?.helpUrl || '#'}" target="_blank" class="ai-help-link">获取 API Key</a>
              </div>
              <div class="ai-field">
                <label class="ai-field-label">模型</label>
                <select id="aiModel" class="ai-field-input">
                  ${this.renderModelOptions(settings.provider, settings.model)}
                </select>
              </div>
            </div>
          </div>

          <div class="ai-section">
            <h3 class="ai-section-title">分析参数</h3>
            <div class="ai-params">
              <div class="ai-param">
                <label>分析间隔</label>
                <input type="number" id="aiInterval" value="${settings.analysisInterval}" min="10" max="120">
                <span>秒</span>
              </div>
              <div class="ai-param">
                <label>滑动窗口</label>
                <input type="number" id="aiWindowSize" value="${settings.windowSize}" min="5" max="20">
                <span>条</span>
              </div>
              <div class="ai-param">
                <label>温度</label>
                <input type="number" id="aiTemperature" value="${settings.temperature}" min="0" max="1" step="0.1">
              </div>
              <div class="ai-param">
                <label>最大 Token</label>
                <input type="number" id="aiMaxTokens" value="${settings.maxTokens}" min="500" max="8000">
              </div>
            </div>
          </div>

          <div class="ai-section">
            <h3 class="ai-section-title">会议类型</h3>
            <div class="ai-meeting-types">
              <label class="ai-meeting-type">
                <input type="radio" name="ai-meeting-type" value="review" ${settings.meetingType === 'review' ? 'checked' : ''}>
                <span>评审会</span>
              </label>
              <label class="ai-meeting-type">
                <input type="radio" name="ai-meeting-type" value="negotiation" ${settings.meetingType === 'negotiation' ? 'checked' : ''}>
                <span>谈判</span>
              </label>
              <label class="ai-meeting-type">
                <input type="radio" name="ai-meeting-type" value="brainstorm" ${settings.meetingType === 'brainstorm' ? 'checked' : ''}>
                <span>脑暴</span>
              </label>
              <label class="ai-meeting-type">
                <input type="radio" name="ai-meeting-type" value="weekly" ${settings.meetingType === 'weekly' ? 'checked' : ''}>
                <span>周会</span>
              </label>
            </div>
          </div>

          <div class="ai-section">
            <h3 class="ai-section-title">成本控制</h3>
            <div class="ai-field">
              <label class="ai-field-label">Token 上限</label>
              <input type="number" id="aiTokenLimit" class="ai-field-input" value="${settings.tokenLimit}" min="10000" max="200000">
              <span class="ai-field-hint">单次会议最大 Token 消耗</span>
            </div>
          </div>

          <div class="ws-dialog-actions">
            <button type="button" class="ws-btn" id="aiTestConnection">测试连接</button>
            <button type="button" class="ws-btn" data-ws-close>取消</button>
            <button type="button" class="ws-btn primary" id="aiSaveSettings">保存</button>
          </div>
        </div>
      `;

      window.CoreTabWorkspace.openDialog(html, () => {
        this.bindEvents();
      });
    },

    renderModelOptions(providerId, selectedModel) {
      const providers = window.AIProvider.getProviders();
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return '';
      
      return provider.models.map(m => 
        `<option value="${m.id}" ${selectedModel === m.id ? 'selected' : ''}>${m.name}</option>`
      ).join('');
    },

    bindEvents() {
      // 切换服务商时更新模型列表和帮助链接
      document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          const providerId = e.target.value;
          const providers = window.AIProvider.getProviders();
          const provider = providers.find(p => p.id === providerId);
          
          // 更新模型列表
          const modelSelect = document.getElementById('aiModel');
          modelSelect.innerHTML = this.renderModelOptions(providerId, provider.defaultModel);
          
          // 更新帮助链接
          const helpLink = document.querySelector('.ai-help-link');
          if (helpLink && provider.helpUrl) {
            helpLink.href = provider.helpUrl;
          }
          
          // 更新选中状态
          document.querySelectorAll('.ai-provider-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          e.target.closest('.ai-provider-option').classList.add('selected');
        });
      });

      // 测试连接
      document.getElementById('aiTestConnection').addEventListener('click', async () => {
        const btn = document.getElementById('aiTestConnection');
        const originalText = btn.textContent;
        btn.textContent = '测试中...';
        btn.disabled = true;

        try {
          const settings = this.gatherSettings();
          const provider = window.AIProvider.create(settings);
          await provider.chat([
            { role: 'user', content: '你好' }
          ], { maxTokens: 10 });
          
          btn.textContent = '✓ 连接成功';
          btn.style.background = '#d4edda';
          btn.style.color = '#155724';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.background = '';
            btn.style.color = '';
          }, 2000);
        } catch (error) {
          btn.textContent = '✗ 连接失败';
          btn.style.background = '#f8d7da';
          btn.style.color = '#721c24';
          console.error('Test connection failed:', error);
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.background = '';
            btn.style.color = '';
          }, 2000);
        }
      });

      // 保存设置
      document.getElementById('aiSaveSettings').addEventListener('click', () => {
        const settings = this.gatherSettings();
        if (this.save(settings)) {
          window.CoreTabWorkspace.closeDialog();
          window.CoreTabWorkspace.showToast('AI 设置已保存');
        } else {
          window.CoreTabWorkspace.showToast('保存失败，请重试');
        }
      });
    },

    gatherSettings() {
      const provider = document.querySelector('input[name="ai-provider"]:checked').value;
      const providers = window.AIProvider.getProviders();
      const providerConfig = providers.find(p => p.id === provider);
      
      return {
        provider: provider,
        model: document.getElementById('aiModel').value,
        apiKey: document.getElementById('aiApiKey').value.trim(),
        baseUrl: providerConfig.baseUrl,
        temperature: parseFloat(document.getElementById('aiTemperature').value),
        maxTokens: parseInt(document.getElementById('aiMaxTokens').value),
        analysisInterval: parseInt(document.getElementById('aiInterval').value),
        windowSize: parseInt(document.getElementById('aiWindowSize').value),
        enabled: true,
        meetingType: document.querySelector('input[name="ai-meeting-type"]:checked').value,
        tokenLimit: parseInt(document.getElementById('aiTokenLimit').value)
      };
    }
  };

  window.AISettings = AISettings;
})(window);
