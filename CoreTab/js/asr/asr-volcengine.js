/**
 * 火山引擎 ASR 实现 - WebSocket 流式识别
 */

class ASRVolcengine {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.onResult = () => {};
    this.onError = () => {};
    this.onStatusChange = () => {};
    this.credentials = {};
    this.model = 'bigmodel';
    this.lang = 'zh-CN';
    this.sessionId = null;
  }

  async init(config) {
    this.credentials = config.credentials || {};
    this.model = config.model || 'bigmodel';
    this.lang = config.lang || 'zh-CN';

    if (!this.credentials.accessKeyId || !this.credentials.secretKey || !this.credentials.appId) {
      throw new Error('火山引擎配置不完整: 需要 accessKeyId, secretKey, appId');
    }
  }

  async start() {
    this.onStatusChange('connecting');

    try {
      // 获取麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // 创建音频上下文
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 创建脚本处理器
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // 生成签名
      const timestamp = Math.floor(Date.now() / 1000);
      this.sessionId = this.generateSessionId();
      const signature = await this.generateSignature(timestamp);

      // 构建 WebSocket URL
      const wsUrl = `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel?access_key_id=${this.credentials.accessKeyId}&app_id=${this.credentials.appId}&timestamp=${timestamp}&signature=${signature}`;

      // 建立 WebSocket 连接
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // 发送初始化消息
        const initMsg = {
          app: {
            appid: this.credentials.appId,
            clusterid: 'volcengine_streaming_common',
            token: 'access_token'
          },
          user: {
            uid: 'coretab_user'
          },
          audio: {
            format: 'pcm',
            rate: 16000,
            bits: 16,
            channel: 1,
            codec: 'raw'
          },
          request: {
            model: this.model,
            result_type: 'single',
            show_utterances: true,
            silence_wait: 3000
          }
        };
        this.ws.send(JSON.stringify(initMsg));
        this.onStatusChange('listening');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.code !== 1000) {
            this.onError(new Error(`火山引擎错误: ${data.message || '未知错误'}`));
            return;
          }

          if (data.result) {
            const text = data.result.text || '';
            const isFinal = data.result.is_final || false;
            if (text) {
              this.onResult({
                text,
                isFinal,
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {
          this.onError(new Error('解析火山引擎响应失败: ' + e.message));
        }
      };

      this.ws.onerror = (error) => {
        this.onError(new Error('火山引擎 WebSocket 连接失败'));
      };

      this.ws.onclose = (event) => {
        if (this.processor) {
          this.processor.disconnect();
          this.processor = null;
        }
        this.onStatusChange('stopped');
      };

      // 连接音频处理
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // 处理音频数据
      this.processor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        this.ws.send(pcmData.buffer);
      };

    } catch (e) {
      this.cleanup();
      throw new Error('启动火山引擎识别失败: ' + e.message);
    }
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
    this.onStatusChange('stopped');
  }

  pause() {
    this.stop();
  }

  resume() {
    this.start();
  }

  cleanup() {
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (e) {}
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
  }

  generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async generateSignature(timestamp) {
    const message = `${this.credentials.accessKeyId}\n${timestamp}\n${this.sessionId}\n`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.credentials.secretKey);
    const messageData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return signatureHex;
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

window.ASRVolcengine = ASRVolcengine;
