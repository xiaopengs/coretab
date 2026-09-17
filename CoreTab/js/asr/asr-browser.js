/**
 * 浏览器内置 Web Speech API 实现
 */

class ASRBrowser {
  constructor() {
    this.recognition = null;
    this.onResult = () => {};
    this.onError = () => {};
    this.onStatusChange = () => {};
    this.recognizing = false;
  }

  async init(config) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('浏览器不支持 Web Speech API');
    }
    this.lang = config.lang || 'zh-CN';
  }

  async start() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('浏览器不支持 Web Speech API');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.lang;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            this.onResult({
              text,
              isFinal: true,
              timestamp: Date.now()
            });
          }
        }
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.onError(new Error('语音识别错误: ' + e.error));
    };

    this.recognition.onend = () => {
      if (this.recognizing) {
        try {
          this.recognition.start();
        } catch (e) {
          this.recognizing = false;
          this.onStatusChange('stopped');
        }
      }
    };

    try {
      this.recognition.start();
      this.recognizing = true;
      this.onStatusChange('listening');
    } catch (e) {
      throw new Error('无法启动语音识别: ' + e.message);
    }
  }

  stop() {
    this.recognizing = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }
    this.onStatusChange('stopped');
  }

  pause() {
    this.stop();
  }

  resume() {
    this.start();
  }
}

window.ASRBrowser = ASRBrowser;
