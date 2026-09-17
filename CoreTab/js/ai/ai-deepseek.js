// DeepSeek AI Provider 实现
(function(window) {
  'use strict';

  class DeepSeekProvider extends window.AIProvider {
    constructor(config) {
      super(config);
      this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    }

    async chat(messages, options = {}) {
      const url = `${this.baseUrl}/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: options.temperature || this.temperature,
          max_tokens: options.maxTokens || this.maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0
        }
      };
    }
  }

  window.AIProvider.registerProvider('deepseek', DeepSeekProvider);
})(window);
