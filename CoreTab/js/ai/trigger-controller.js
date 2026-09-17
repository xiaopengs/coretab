// 触发控制器 - 控制分析触发频率
(function(window) {
  'use strict';

  class TriggerController {
    constructor(options = {}) {
      this.callbacks = [];
      this.timer = null;
      this.debounceTimer = null;
      this.minTranscriptCount = options.minTranscriptCount || 3;
      this.maxInterval = (options.maxInterval || 30) * 1000;
      this.debounceDelay = (options.debounceDelay || 5) * 1000;
      this.lastTriggerTime = 0;
      this.pendingCount = 0;
    }

    onTrigger(callback) {
      this.callbacks.push(callback);
    }

    start() {
      this.lastTriggerTime = Date.now();
      this.timer = setInterval(() => this.check(), 5000);
    }

    stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    }

    notify() {
      this.pendingCount++;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.check(), this.debounceDelay * 1000);
    }

    check() {
      const now = Date.now();
      const elapsed = now - this.lastTriggerTime;
      if (this.pendingCount >= this.minTranscriptCount || elapsed >= this.maxInterval) {
        if (this.pendingCount > 0 || elapsed >= this.maxInterval) {
          this.lastTriggerTime = now;
          this.pendingCount = 0;
          this.callbacks.forEach(cb => cb());
        }
      }
    }
  }

  window.TriggerController = TriggerController;
})(window);
