/**
 * 腾讯云 ASR 实现 - WebSocket 实时识别
 */

class ASRTencent {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.onResult = () => {};
    this.onError = () => {};
    this.onStatusChange = () => {};
    this.credentials = {};
    this.model = '16k_zh_large';
    this.lang = 'zh-CN';
    this.voiceId = null;
  }

  async init(config) {
    this.credentials = config.credentials || {};
    this.model = config.model || '16k_zh_large';
    this.lang = config.lang || 'zh-CN';

    if (!this.credentials.secretId || !this.credentials.secretKey) {
      throw new Error('腾讯云配置不完整: 需要 secretId, secretKey');
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

      // 生成 voice_id
      this.voiceId = this.generateVoiceId();

      // 构建 WebSocket URL
      const wsUrl = `wss://asr.cloud.tencent.com/asr/v2/${this.voiceId}?secretid=${this.credentials.secretId}`;

      // 建立 WebSocket 连接
      this.ws = new WebSocket(wsUrl);

      // 创建音频上下文
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 创建脚本处理器
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.ws.onopen = () => {
        // 发送开始识别消息
        const startMsg = {
          type: 'start',
          voice_id: this.voiceId,
          engine_model_type: this.model,
          samplerate: 16000,
          res_text_format: 0,
          res_data_type: 1,
          filter_dirty: 1,
          filter_modal: 1,
          filter_punc: 1,
          convert_num_mode: 1,
          word_info: 0
        };
        this.ws.send(JSON.stringify(startMsg));
        this.onStatusChange('listening');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.code !== 0) {
            this.onError(new Error(`腾讯云错误: ${data.message || '未知错误'} (code: ${data.code})`));
            return;
          }

          if (data.result) {
            const text = data.result || '';
            const isFinal = data.slice_type === 0;
            if (text) {
              this.onResult({
                text,
                isFinal,
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {
          this.onError(new Error('解析腾讯云响应失败: ' + e.message));
        }
      };

      this.ws.onerror = (error) => {
        this.onError(new Error('腾讯云 WebSocket 连接失败'));
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
      let seq = 0;
      this.processor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);

        // 构建二进制帧
        const header = new ArrayBuffer(16);
        const headerView = new DataView(header);
        const payload = pcmData.buffer;

        // 帧头格式: magic(1) + version(1) + reserved(2) + seq(4) + timestamp(4) + data_type(2) + payload_len(2)
        headerView.setUint8(0, 0x20); // magic
        headerView.setUint8(1, 0x01); // version
        headerView.setUint16(2, 0, true); // reserved
        headerView.setUint32(4, seq++, true); // seq
        headerView.setUint32(8, Math.floor(Date.now() / 1000), true); // timestamp
        headerView.setUint16(12, 1, true); // data_type: raw PCM
        headerView.setUint16(14, payload.byteLength, true); // payload_len

        // 合并帧头和音频数据
        const frame = new Uint8Array(header.byteLength + payload.byteLength);
        frame.set(new Uint8Array(header), 0);
        frame.set(new Uint8Array(payload), header.byteLength);

        this.ws.send(frame.buffer);
      };

    } catch (e) {
      this.cleanup();
      throw new Error('启动腾讯云识别失败: ' + e.message);
    }
  }

  stop() {
    if (this.ws) {
      // 发送结束消息
      const endMsg = {
        type: 'end',
        voice_id: this.voiceId
      };
      this.ws.send(JSON.stringify(endMsg));
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
