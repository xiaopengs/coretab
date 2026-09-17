// AI Provider 抽象层 - 支持多 LLM 服务商
(function(window) {
  'use strict';

  class AIProvider {
    constructor(config) {
      this.provider = config.provider;
      this.apiKey = config.apiKey;
      this.model = config.model;
      this.baseUrl = config.baseUrl;
      this.temperature = config.temperature || 0.3;
      this.maxTokens = config.maxTokens || 2000;
    }

    async init() {
      // 子类可覆盖
    }

    async chat(messages, options = {}) {
      throw new Error('chat() must be implemented by subclass');
    }

    static getProviders() {
      return [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          description: '性价比最高，中文能力强',
          price: '¥1/百万 token',
          keyFields: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' }
          ],
          models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000 },
            { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 64000 }
          ],
          defaultModel: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com/v1',
          helpUrl: 'https://platform.deepseek.com/api_keys'
        },
        {
          id: 'kimi',
          name: 'Kimi (月之暗面)',
          description: '长上下文支持好',
          price: '¥10/百万 token',
          keyFields: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' }
          ],
          models: [
            { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', contextLength: 8000 },
            { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', contextLength: 32000 },
            { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', contextLength: 128000 }
          ],
          defaultModel: 'moonshot-v1-32k',
          baseUrl: 'https://api.moonshot.cn/v1',
          helpUrl: 'https://platform.moonshot.cn/console/api-keys'
        },
        {
          id: 'zhipu',
          name: '智谱 AI',
          description: '国产大模型，生态成熟',
          price: '免费额度',
          keyFields: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: '...' }
          ],
          models: [
            { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', contextLength: 128000 },
            { id: 'glm-4', name: 'GLM-4', contextLength: 128000 }
          ],
          defaultModel: 'glm-4-flash',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
        }
      ];
    }

    static create(settings) {
      const provider = settings.provider;
      const ProviderClass = AIProvider._providers[provider];
      
      if (!ProviderClass) {
        throw new Error(`Unknown AI provider: ${provider}`);
      }

      return new ProviderClass(settings);
    }

    static registerProvider(id, providerClass) {
      AIProvider._providers[id] = providerClass;
    }
  }

  AIProvider._providers = {};

  window.AIProvider = AIProvider;
})(window);
