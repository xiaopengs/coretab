/**
 * 腾讯云实时语音识别 V2（WebSocket）实现
 * 参考官方文档：https://cloud.tencent.com/document/api/1093/131127
 *
 * 握手阶段：wss://asr.cloud.tencent.com/asr/v2/<appid>?{参数}&signature=...
 *   - 签名原文 = "asr.cloud.tencent.com/asr/v2/<appid>?<除 signature 外参数按字典序拼接>"
 *   - signature = URLEncode(Base64(HmacSha1(签名原文, SecretKey)))
 * 识别阶段：直接发送二进制 PCM 音频流，结束时发送 {"type":"end"}
 */

// 旧版引擎名 -> V2 大模型引擎名
const TENCENT_LEGACY_MODELS = {
  '16k_zh_large': '16k_zh_en_2.0',
  '16k_zh_large_speaker': '16k_zh_en_speaker_2.0'
};

const TENCENT_ERROR_HINTS = {
  4000: '音频发送速率过快，请保持 1:1 实时率',
  4001: '参数不合法',
  4002: '鉴权失败，请检查 AppID / SecretId / SecretKey 是否正确',
  4003: 'AppID 未开通语音识别服务，请在控制台开通',
  4004: '资源包耗尽，请开通后付费或购买资源包',
  4005: '账户欠费停止服务，请及时充值',
  4006: '当前调用并发超限',
  4007: '音频解码失败，请检查采样率与格式',
  4008: '超过 15 秒未发送音频数据',
  4009: '客户端连接断开',
  4010: '客户端上传了未知文本消息',
  5000: '服务负载过高，请重新发起识别',
  5001: '服务负载过高，请重新发起识别',
  5002: '服务负载过高，请重新发起识别',
  6001: '境外调用，请在腾讯云国际站开通服务'
};

class ASRTencent {
  constructor() {
    this.ws = null;
    this.capture = null;
    this.captureSystem = false;
    this.onResult = () => {};
    this.onError = () => {};
    this.onStatusChange = () => {};
    this.onWarning = () => {};
    this.credentials = {};
    this.model = '16k_zh_en_2.0';
    this.lang = 'zh-CN';
    this.voiceId = null;
    this.handshakeDone = false;
    this.intentionalStop = false;
  }

  async init(config) {
    this.credentials = config.credentials || {};
    this.model = TENCENT_LEGACY_MODELS[config.model] || config.model || '16k_zh_en_2.0';
    this.lang = config.lang || 'zh-CN';
    this.captureSystem = config.captureSystem === true;
    this.systemMode = config.systemMode === 'display' ? 'display' : 'native';

    if (!this.credentials.secretId || !this.credentials.secretKey) {
      throw new Error('腾讯云配置不完整：需要 SecretId、SecretKey');
    }
    if (!this.credentials.appId) {
      throw new Error('腾讯云配置不完整：需要 AppID（在控制台「API 密钥管理」页面获取）');
    }
  }

  /**
   * 生成带签名的 WebSocket 握手地址
   */
  async buildUrl() {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('当前环境不支持 Web Crypto（HMAC-SHA1 签名），请在扩展页面中使用');
    }

    const appid = String(this.credentials.appId).trim();
    const now = Math.floor(Date.now() / 1000);
    this.voiceId = this.generateVoiceId();

    const params = {
      secretid: this.credentials.secretId,
      timestamp: now,
      expired: now + 86400,
      nonce: Math.floor(Math.random() * 9000000000) + 1000000000,
      engine_model_type: this.model,
      voice_id: this.voiceId,
      voice_format: 1,
      needvad: 1,
      filter_dirty: 0,
      filter_modal: 0,
      convert_num_mode: 1
    };

    const keys = Object.keys(params).sort();
    const query = keys.map(k => `${k}=${params[k]}`).join('&');
    const source = `asr.cloud.tencent.com/asr/v2/${appid}?${query}`;
    const signature = await this.hmacSha1Base64(this.credentials.secretKey, source);

    return `wss://asr.cloud.tencent.com/asr/v2/${appid}?${query}&signature=${encodeURIComponent(signature)}`;
  }

  /**
   * HMAC-SHA1 加密后 Base64 编码
   */
  async hmacSha1Base64(keyStr, msgStr) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(keyStr),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(msgStr));
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async start() {
    this.onStatusChange('connecting');
    this.intentionalStop = false;
    this.handshakeDone = false;

    let url;
    try {
      url = await this.buildUrl();
    } catch (e) {
      this.onStatusChange('stopped');
      throw new Error('生成腾讯云签名失败：' + e.message);
    }

    // 采集音频：麦克风外录，并按需叠加电脑声音内录
    this.capture = new window.ASRCapture();
    this.capture.onframe = (inputData) => {
      if (!this.handshakeDone || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(this.floatTo16BitPCM(inputData).buffer);
    };
    this.capture.onSystemEnded = () => {
      this.onWarning('电脑声音内录已停止，继续使用麦克风识别');
    };
    try {
      await this.capture.open({ mic: true, system: this.captureSystem, systemMode: this.systemMode });
    } catch (e) {
      this.onStatusChange('stopped');
      throw new Error('无法获取音频来源：' + e.message);
    }
    if (this.capture.warnings.length) this.onWarning(this.capture.warnings.join('；'));

    // 建立 WebSocket 连接
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (typeof data.code === 'number' && data.code !== 0) {
        this.onError(new Error(this.describeError(data.code, data.message)));
        this.stop();
        return;
      }

      // 首次 code=0 即握手成功
      if (!this.handshakeDone) {
        this.handshakeDone = true;
        this.onStatusChange('listening');
      }

      // 解析识别结果（不同引擎返回结构不同，两种都要兼容）
      this.handleResult(data);
    };

    this.ws.onerror = () => {
      if (!this.intentionalStop) this.onError(new Error('腾讯云 WebSocket 连接失败，请检查网络或域名是否被拦截'));
    };

    this.ws.onclose = () => {
      if (this.capture) this.capture.close();
      if (!this.intentionalStop && !this.handshakeDone) {
        this.onError(new Error('腾讯云连接被关闭，请检查 AppID / 密钥是否正确'));
      }
      this.onStatusChange('stopped');
    };
  }

  stop() {
    this.intentionalStop = true;
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'end' })); } catch (e) {}
    }
    this.ws = null;
    this.cleanup();
    // 稍等片刻再关闭连接，让服务端有机会返回最后一段识别结果
    if (ws) setTimeout(() => { try { ws.close(); } catch (e) {} }, 800);
    this.onStatusChange('stopped');
  }

  pause() {
    this.stop();
  }

  resume() {
    this.start();
  }

  /**
   * 测试连接：完成一次握手，验证 AppID / 密钥 / 签名是否有效
   */
  async testConnection() {
    const url = await this.buildUrl();
    return new Promise((resolve, reject) => {
      let done = false;
      let ws;
      const finish = (err) => {
        if (done) return;
        done = true;
        try { ws && ws.close(); } catch (e) {}
        err ? reject(err) : resolve(true);
      };
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(new Error('无法建立连接：' + e.message));
        return;
      }
      const timer = setTimeout(() => finish(new Error('连接超时，请检查网络或参数')), 8000);
      ws.onmessage = (ev) => {
        clearTimeout(timer);
        let data;
        try { data = JSON.parse(ev.data); } catch (e) {}
        if (data && data.code === 0) finish(null);
        else if (data && typeof data.code === 'number') finish(new Error(this.describeError(data.code, data.message)));
        else finish(new Error('响应格式异常'));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        finish(new Error('无法连接腾讯云（网络或域名被拦截）'));
      };
    });
  }

  describeError(code, message) {
    const hint = TENCENT_ERROR_HINTS[code] || '未知错误';
    return `腾讯云识别错误 [${code}] ${hint}${message ? '：' + message : ''}`;
  }

  /**
   * 解析识别结果。腾讯云返回结构随引擎而不同：
   *  - 通用 / 大模型引擎（如 16k_zh_en_2.0）：{ result: { voice_text_str, slice_type, speaker_id } }
   *  - 说话人分离引擎（16k_zh_en_speaker_2.0）：{ sentences: { sentence_list: [...] } }
   * 两种结构都兼容，并把 final / interim 结果透传给上层。
   */
  handleResult(data) {
    if (!data) return;
    const streamFinal = data.final === 1;

    // 结构一：result（通用 / 大模型引擎，沿用 V1 风格字段）
    if (data.result && typeof data.result === 'object') {
      const r = data.result;
      const text = r.voice_text_str || r.text || '';
      // slice_type: 0 一句话首分片，1 中间分片，2 一句话末分片（可视为最终句）
      const sentenceFinal = r.slice_type === 2;
      if (text) this.emitResult(text, sentenceFinal || streamFinal, r.speaker_id);
      return;
    }

    // 结构二：sentences（说话人分离引擎）
    if (data.sentences && typeof data.sentences === 'object') {
      const s = data.sentences;
      const list = Array.isArray(s.sentence_list) ? s.sentence_list
        : (s.sentence ? [s] : null);
      if (!list) return;
      for (const item of list) {
        const text = item.sentence || item.voice_text_str || item.text || '';
        if (!text) continue;
        // sentence_type: 0 不确定（中间结果），1 确定（最终句）
        this.emitResult(text, item.sentence_type === 1 || streamFinal, item.speaker_id);
      }
    }
  }

  emitResult(text, isFinal, speaker) {
    const clean = String(text).trim();
    if (!clean) return;
    this.onResult({
      text: clean,
      isFinal: !!isFinal,
      // speaker_id 从 -1 开始表示尚未确定，仅在有确定说话人时透传
      speaker: (speaker !== undefined && speaker !== null && speaker >= 0) ? String(speaker) : undefined,
      timestamp: Date.now()
    });
  }

  cleanup() {
    if (this.capture) {
      this.capture.close();
      this.capture = null;
    }
  }

  generateVoiceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }
}

window.ASRTencent = ASRTencent;
