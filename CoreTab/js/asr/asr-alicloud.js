/**
 * 阿里云 ASR 实现 - WebSocket 实时转写
 */

class ASRAlicloud {
  constructor() {
    this.ws = null;
    this.capture = null;
    this.captureSystem = false;
    this.onResult = () => {};
    this.onError = () => {};
    this.onStatusChange = () => {};
    this.onWarning = () => {};
    this.credentials = {};
    this.model = 'customer-service-domain';
    this.lang = 'zh-CN';
    this.taskId = null;
    this.token = null;
  }

  async init(config) {
    this.credentials = config.credentials || {};
    this.model = config.model || 'customer-service-domain';
    this.lang = config.lang || 'zh-CN';
    this.captureSystem = config.captureSystem === true;

    if (!this.credentials.accessKeyId || !this.credentials.accessKeySecret || !this.credentials.appKey) {
      throw new Error('阿里云配置不完整: 需要 accessKeyId, accessKeySecret, appKey');
    }
  }

  async start() {
    this.onStatusChange('connecting');

    try {
      // 获取 Token
      this.token = await this.getToken();

      // 生成 task_id
      this.taskId = this.generateTaskId();

      // 采集音频：麦克风外录，并按需叠加电脑声音内录
      this.capture = new window.ASRCapture();
      this.capture.onframe = (inputData) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(this.floatTo16BitPCM(inputData).buffer);
      };
      this.capture.onSystemEnded = () => {
        this.onWarning('电脑声音共享已停止，继续使用麦克风识别');
      };
      await this.capture.open({ mic: true, system: this.captureSystem });
      if (this.capture.warnings.length) this.onWarning(this.capture.warnings.join('；'));

      // 构建 WebSocket URL
      const wsUrl = `wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1?token=${this.token}`;

      // 建立 WebSocket 连接
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // 发送开始转写指令
        const startMsg = {
          header: {
            message_id: this.generateMessageId(),
            task_id: this.taskId,
            namespace: 'SpeechTranscriber',
            name: 'StartTranscription',
            appkey: this.credentials.appKey
          },
          payload: {
            format: 'pcm',
            sample_rate: 16000,
            model: this.model,
            enable_intermediate_result: true,
            enable_punctuation_prediction: true,
            enable_inverse_text_normalization: true
          }
        };
        this.ws.send(JSON.stringify(startMsg));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const header = data.header || {};
          const payload = data.payload || {};

          if (header.name === 'TranscriptionStarted') {
            this.onStatusChange('listening');
          } else if (header.name === 'TranscriptionResultChanged' || header.name === 'SentenceEnd') {
            const text = payload.result || '';
            const isFinal = header.name === 'SentenceEnd';
            if (text) {
              this.onResult({
                text,
                isFinal,
                timestamp: Date.now()
              });
            }
          } else if (header.name === 'TaskFailed') {
            this.onError(new Error(`阿里云错误: ${payload.status_text || '未知错误'}`));
          }
        } catch (e) {
          this.onError(new Error('解析阿里云响应失败: ' + e.message));
        }
      };

      this.ws.onerror = (error) => {
        this.onError(new Error('阿里云 WebSocket 连接失败'));
      };

      this.ws.onclose = (event) => {
        if (this.capture) this.capture.close();
        this.onStatusChange('stopped');
      };
    } catch (e) {
      this.cleanup();
      throw new Error('启动阿里云识别失败: ' + e.message);
    }
  }

  stop() {
    if (this.ws) {
      // 发送停止转写指令
      const stopMsg = {
        header: {
          message_id: this.generateMessageId(),
          task_id: this.taskId,
          namespace: 'SpeechTranscriber',
          name: 'StopTranscription',
          appkey: this.credentials.appKey
        }
      };
      this.ws.send(JSON.stringify(stopMsg));
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
    if (this.capture) {
      this.capture.close();
      this.capture = null;
    }
  }

  async getToken() {
    // 阿里云 NLS Token 获取
    // 实际生产环境应该通过后端服务获取，这里简化处理
    // 用户需要在阿里云控制台创建项目并获取 Token
    throw new Error('阿里云 Token 获取需要通过后端服务实现，请参考阿里云文档配置');
  }

  generateTaskId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  generateMessageId() {
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

window.ASRAlicloud = ASRAlicloud;
