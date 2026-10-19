/**
 * 统一音频采集：麦克风外录 + 电脑声音内录
 *
 * 内录有两种来源（systemMode）：
 *   - 'native'（默认，推荐）：通过「音频伴生程序」（Native Messaging）直接采集
 *     全系统声音（Windows 上用 WASAPI 回环），无需弹窗，可录到桌面客户端的声音。
 *     需要先运行 native/install_windows.bat 安装伴生程序并重启浏览器。
 *   - 'display'：回退方案，基于 getDisplayMedia，会弹出共享选择器，由用户选择
 *     「整个屏幕 / 窗口 / 标签页」并勾选「分享音频」。
 *
 * 麦克风始终是外录来源。系统声音（无论来自伴生程序还是共享）会与麦克风做样本级
 * 混音后，统一以 16kHz 单声道 Float32 帧通过 onframe 输出。
 */

// 伴生程序在 native messaging 中注册的名字（需与 manifest / 注册表一致）
const NATIVE_HOST = 'com.coretab.audio_capture';
// 每帧样本数（16kHz 下 4096 ≈ 256ms）
const CAPTURE_FRAME = 4096;
// 内录音量增益，避免与麦克风叠加后削波失真
const SYSTEM_GAIN = 0.8;
// 伴生程序音频的环形缓冲容量（4 秒），用于吸收两路时钟抖动
const RING_SIZE = 16000 * 4;

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
    // 伴生程序（Native Messaging）相关
    this.nativePort = null;
    this.nativeActive = false;
    this.pullTimer = null;
    this.ring = new Float32Array(RING_SIZE);
    this.ringWrite = 0;
    this.ringRead = 0;
    this.ringCount = 0;
    // 每帧 PCM 回调（Float32Array，单声道，16000Hz）
    this.onframe = () => {};
    // 运行中系统声音来源被用户主动停止时触发
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
   * @param {{ mic?: boolean, system?: boolean, systemMode?: 'native'|'display' }} options
   */
  async open(options = {}) {
    const wantMic = options.mic !== false;
    const wantSystem = options.system === true;
    const systemMode = options.systemMode === 'display' ? 'display' : 'native';
    this.warnings = [];
    this.nativeActive = false;
    this.systemActive = false;

    const needsMediaDevices = wantMic || (wantSystem && systemMode !== 'native');
    if (needsMediaDevices && !navigator.mediaDevices) {
      throw new Error('当前环境不支持音频采集，请在扩展页面中使用');
    }

    // 系统声音内录
    if (wantSystem) {
      if (systemMode === 'native') {
        await this.openNative();
      } else {
        await this.openDisplay();
      }
    }

    // 麦克风外录
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

    const hasWebDriver = !!(this.micStream || this.displayStream);

    // 任何来源都拿不到才算失败
    if (!hasWebDriver && !this.nativeActive) {
      const message = this.warnings.join('；') || '未能获取任何音频来源';
      this.close();
      throw new Error(message);
    }

    if (hasWebDriver) {
      // 麦克风 / 共享内录经 Web Audio 混音后驱动帧输出
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.mixGain = this.audioContext.createGain();
      this.mixGain.gain.value = 1;
      if (this.micStream) this.connectSource(this.micStream, 1);
      if (this.displayStream) this.connectSource(this.displayStream, SYSTEM_GAIN);

      this.processor = this.audioContext.createScriptProcessor(CAPTURE_FRAME, 1, 1);
      // 零增益节点闭环，保证 onaudioprocess 触发且不会把声音回放出来
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.mixGain.connect(this.processor);
      this.processor.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (event) => {
        this.emitFrame(event.inputBuffer.getChannelData(0));
      };
    } else if (this.nativeActive) {
      // 仅有伴生程序内录：无 Web Audio 驱动，用定时器按帧率从环形缓冲取数据
      this.pullTimer = setInterval(() => {
        this.emitFrame(new Float32Array(CAPTURE_FRAME));
      }, CAPTURE_FRAME / 16000 * 1000);
    }
  }

  /**
   * 通过 Native Messaging 连接音频伴生程序，采集全系统声音（免弹窗）
   */
  openNative() {
    return new Promise((resolve) => {
      const INSTALL_HINT = '请先运行扩展目录下 native/install_windows.bat 安装「音频伴生程序」，然后完全重启浏览器';
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.connectNative !== 'function') {
        this.warnings.push('当前环境不支持原生消息，无法启用电脑声音内录。' + INSTALL_HINT);
        resolve();
        return;
      }

      let port;
      try {
        port = chrome.runtime.connectNative(NATIVE_HOST);
      } catch (e) {
        this.warnings.push('启动音频伴生程序失败：' + ((e && e.message) || e) + '。' + INSTALL_HINT);
        resolve();
        return;
      }
      this.nativePort = port;

      let settled = false;
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        this.teardownNativePort();
        this.warnings.push(msg);
        resolve();
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        this.nativeActive = true;
        this.systemActive = true;
        resolve();
      };

      port.onMessage.addListener((msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ready') {
          ok();
        } else if (msg.type === 'audio' && typeof msg.data === 'string') {
          this.pushNativeAudio(msg.data);
        } else if (msg.type === 'error') {
          fail('音频伴生程序：' + (msg.message || '未知错误'));
        }
      });

      port.onDisconnect.addListener(() => {
        const err = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime.lastError : null;
        const wasActive = this.nativeActive;
        this.nativeActive = false;
        this.systemActive = false;
        if (!settled) {
          fail('音频伴生程序未安装或无法启动' + (err && err.message ? '：' + err.message : '') + '。' + INSTALL_HINT);
        } else if (wasActive) {
          // 运行中伴生程序断开
          this.onSystemEnded();
        }
      });

      try {
        port.postMessage({ type: 'start', sampleRate: 16000 });
      } catch (e) { /* 忽略 */ }

      // 安全兜底：伴生程序长时间无 ready 响应
      setTimeout(() => {
        if (!settled) fail('音频伴生程序无响应，请确认已安装并重启浏览器');
      }, 3000);
    });
  }

  teardownNativePort() {
    if (this.nativePort) {
      try { this.nativePort.disconnect(); } catch (e) {}
      this.nativePort = null;
    }
  }

  /**
   * 回退方案：基于 getDisplayMedia 的共享内录（会弹出共享选择器）
   */
  async openDisplay() {
    try {
      // getDisplayMedia 依赖用户手势，尽早调用避免手势过期
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

  connectSource(stream, gainValue) {
    const source = this.audioContext.createMediaStreamSource(stream);
    const trim = this.audioContext.createGain();
    trim.gain.value = gainValue;
    source.connect(trim);
    trim.connect(this.mixGain);
  }

  /**
   * 伴生程序推来一段 Base64 编码的 16bit PCM，写入环形缓冲
   */
  pushNativeAudio(base64) {
    let bin;
    try {
      bin = atob(base64);
    } catch (e) {
      return;
    }
    const n = bin.length >> 1;
    for (let i = 0; i < n; i++) {
      let s = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
      if (s >= 32768) s -= 65536;
      this.writeRing((s / 32768) * SYSTEM_GAIN);
    }
  }

  writeRing(sample) {
    this.ring[this.ringWrite] = sample;
    this.ringWrite = (this.ringWrite + 1) % this.ring.length;
    if (this.ringCount < this.ring.length) {
      this.ringCount++;
    } else {
      // 缓冲已满，覆盖最旧样本
      this.ringRead = (this.ringRead + 1) % this.ring.length;
    }
  }

  /**
   * 从环形缓冲读取 out.length 个样本并叠加到 out（不足处保持原值）
   */
  readRingInto(out) {
    for (let i = 0; i < out.length; i++) {
      if (this.ringCount > 0) {
        out[i] += this.ring[this.ringRead];
        this.ringRead = (this.ringRead + 1) % this.ring.length;
        this.ringCount--;
      }
    }
  }

  /**
   * 输出一帧：若伴生程序内录激活，则把环形缓冲中的系统声音叠加进来
   */
  emitFrame(inputData) {
    if (!this.nativeActive) {
      this.onframe(inputData);
      return;
    }
    const out = new Float32Array(inputData.length);
    out.set(inputData);
    this.readRingInto(out);
    this.onframe(out);
  }

  close() {
    // 定时器
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
    // 伴生程序
    if (this.nativePort) {
      try { this.nativePort.postMessage({ type: 'stop' }); } catch (e) {}
      try { this.nativePort.disconnect(); } catch (e) {}
      this.nativePort = null;
    }
    this.nativeActive = false;
    this.ringWrite = 0;
    this.ringRead = 0;
    this.ringCount = 0;

    // Web Audio
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
