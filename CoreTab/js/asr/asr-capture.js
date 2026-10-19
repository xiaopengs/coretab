/**
 * 统一音频采集：麦克风外录 + 电脑声音内录
 *
 * 内录基于 getDisplayMedia 实现：调用后会弹出共享选择器，由用户选择
 * 「整个屏幕 / 窗口 / 标签页」。要录到电脑里的声音，必须在选择器里勾选
 * 「分享音频 / 分享系统音频」：
 *   - Windows / ChromeOS：选「整个屏幕」可勾选「分享系统音频」，录到全部电脑声音
 *   - macOS：无法直接录系统声音，选「标签页」并勾选「分享标签页音频」可录浏览器内声音
 *
 * 注意：共享返回的视频轨必须保留，一旦停止会连同音频一起中断。
 */

class ASRCapture {
  constructor() {
    this.audioContext = null;
    this.processor = null;
    this.silentGain = null;
    this.mixGain = null;
    this.micStream = null;
    this.displayStream = null;
    this.systemActive = false;
    this.warnings = [];
    // 每帧 PCM 回调（Float32Array，单声道，16000Hz）
    this.onframe = () => {};
    // 用户主动停止「分享电脑声音」时触发
    this.onSystemEnded = () => {};
  }

  hasMic() {
    return !!this.micStream;
  }

  hasSystem() {
    return this.systemActive;
  }

  /**
   * 打开音频来源并开始混音
   * @param {{ mic?: boolean, system?: boolean }} options
   */
  async open(options = {}) {
    const wantMic = options.mic !== false;
    const wantSystem = options.system === true;
    this.warnings = [];

    if (!navigator.mediaDevices) {
      throw new Error('当前环境不支持音频采集，请在扩展页面中使用');
    }

    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // 内录先申请：getDisplayMedia 依赖用户手势，先调用可避免手势过期
    if (wantSystem) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        this.displayStream = display;
        this.systemActive = display.getAudioTracks().length > 0;
        if (!this.systemActive) {
          this.warnings.push('共享时未勾选「分享音频」，本次仅使用麦克风');
        }
        const videoTrack = display.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            this.systemActive = false;
            this.onSystemEnded();
          });
        }
      } catch (e) {
        const reason = e && e.name === 'NotAllowedError' ? '已取消共享' : (e && e.message) || '未知原因';
        this.warnings.push('电脑声音内录未开启：' + reason);
      }
    }

    if (wantMic) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (e) {
        this.warnings.push('麦克风未开启：' + ((e && e.message) || '未知原因'));
      }
    }

    // 两路都拿不到才算失败
    if (!this.micStream && !this.systemActive) {
      const message = this.warnings.join('；') || '未能获取任何音频来源';
      this.close();
      throw new Error(message);
    }

    // 混音：各来源经独立增益后汇入同一路，再交给处理器
    this.mixGain = this.audioContext.createGain();
    this.mixGain.gain.value = 1;

    if (this.micStream) this.connectSource(this.micStream, 1);
    // 内录略压低音量，避免与麦克风叠加后削波失真
    if (this.systemActive) this.connectSource(this.displayStream, 0.8);

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    // 零增益节点闭环，保证 onaudioprocess 触发且不会把声音回放出来
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.mixGain.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (event) => {
      this.onframe(event.inputBuffer.getChannelData(0));
    };
  }

  connectSource(stream, gainValue) {
    const source = this.audioContext.createMediaStreamSource(stream);
    const trim = this.audioContext.createGain();
    trim.gain.value = gainValue;
    source.connect(trim);
    trim.connect(this.mixGain);
  }

  close() {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try { this.processor.disconnect(); } catch (e) {}
      this.processor = null;
    }
    [this.silentGain, this.mixGain].forEach(node => {
      if (node) {
        try { node.disconnect(); } catch (e) {}
      }
    });
    this.silentGain = null;
    this.mixGain = null;

    [this.micStream, this.displayStream].forEach(stream => {
      if (stream) stream.getTracks().forEach(track => { try { track.stop(); } catch (e) {} });
    });
    this.micStream = null;
    this.displayStream = null;
    this.systemActive = false;

    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
  }
}

window.ASRCapture = ASRCapture;
