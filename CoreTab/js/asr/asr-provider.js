/**
 * ASR Provider 抽象层 - 统一管理不同 ASR 服务商
 */

class ASRProvider {
  constructor(config) {
    this.provider = config.provider || 'browser';
    this.credentials = config.credentials || {};
    this.model = config.model || '';
    this.lang = config.lang || 'zh-CN';
    this.onResult = config.onResult || (() => {});
    this.onError = config.onError || (() => {});
    this.onStatusChange = config.onStatusChange || (() => {});
    this.impl = null;
  }

  /**
   * 初始化 ASR 引擎
   */
  async init() {
    if (this.provider === 'browser') {
      this.impl = new window.ASRBrowser();
    } else if (this.provider === 'volcengine') {
      this.impl = new window.ASRVolcengine();
    } else if (this.provider === 'tencent') {
      this.impl = new window.ASRTencent();
    } else if (this.provider === 'alicloud') {
      this.impl = new window.ASRAlicloud();
    } else {
      throw new Error(`Unknown ASR provider: ${this.provider}`);
    }

    // 设置回调
    this.impl.onResult(this.onResult);
    this.impl.onError(this.onError);
    this.impl.onStatusChange(this.onStatusChange);

    // 初始化引擎
    await this.impl.init({
      credentials: this.credentials[this.provider] || {},
      model: this.model,
      lang: this.lang
    });
  }

  /**
   * 开始识别
   */
  async start() {
    if (!this.impl) throw new Error('ASR provider not initialized');
    await this.impl.start();
  }

  /**
   * 停止识别
   */
  stop() {
    if (this.impl) this.impl.stop();
  }

  /**
   * 暂停识别
   */
  pause() {
    if (this.impl) this.impl.pause();
  }

  /**
   * 恢复识别
   */
  resume() {
    if (this.impl) this.impl.resume();
  }
}

/**
 * 获取所有可用的 ASR Provider 元数据
 */
ASRProvider.getProviders = function() {
  return [
    {
      id: 'browser',
      name: '浏览器内置',
      needsKey: false,
      keyFields: [],
      models: [{ id: 'default', name: 'Web Speech API', lang: 'zh-CN' }]
    },
    {
      id: 'volcengine',
      name: '火山引擎',
      needsKey: true,
      keyFields: [
        { key: 'accessKeyId', label: 'AccessKey ID', placeholder: 'AKLTMjxxxxxxxxxxxx', type: 'text' },
        { key: 'secretKey', label: 'Secret Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
        { key: 'appId', label: 'App ID', placeholder: '数字应用ID', type: 'text' }
      ],
      models: [
        { id: 'bigmodel', name: '豆包流式语音识别 2.0', lang: 'zh-CN' },
        { id: 'bigmodel_en', name: '豆包英语', lang: 'en-US' }
      ]
    },
    {
      id: 'tencent',
      name: '腾讯云',
      needsKey: true,
      keyFields: [
        { key: 'secretId', label: 'SecretId', placeholder: 'AKIDxxxxxxxxxxxxxxxx', type: 'text' },
        { key: 'secretKey', label: 'SecretKey', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' }
      ],
      models: [
        { id: '16k_zh_large', name: '大模型 2.0 版', lang: 'zh-CN' },
        { id: '16k_zh', name: '中文通用', lang: 'zh-CN' },
        { id: '16k_en', name: '英语', lang: 'en-US' }
      ]
    },
    {
      id: 'alicloud',
      name: '阿里云',
      needsKey: true,
      keyFields: [
        { key: 'accessKeyId', label: 'AccessKey ID', placeholder: 'LTAIxxxxxxxxxxxxxxxx', type: 'text' },
        { key: 'accessKeySecret', label: 'AccessKey Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
        { key: 'appKey', label: 'AppKey', placeholder: '项目 AppKey', type: 'text' }
      ],
      models: [
        { id: 'customer-service-domain', name: '客服领域（中文）', lang: 'zh-CN' },
        { id: 'domain-audio-domain', name: '音视频领域（中文）', lang: 'zh-CN' },
        { id: 'domain-meeting-domain', name: '会议领域（中文）', lang: 'zh-CN' }
      ]
    }
  ];
};

/**
 * 根据设置创建 ASR Provider 实例
 */
ASRProvider.create = function(settings) {
  return new ASRProvider(settings);
};

window.ASRProvider = ASRProvider;
