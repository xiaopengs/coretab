// 会议分析引擎 - 核心控制器
(function(window) {
  'use strict';

  class MeetingAnalysisEngine {
    constructor(meeting, aiProvider, settings = {}) {
      this.meeting = meeting;
      this.ai = aiProvider;
      this.settings = settings;
      this.triggerCtrl = new TriggerController({
        minTranscriptCount: 3,
        maxInterval: settings.analysisInterval || 30,
        debounceDelay: 5
      });
      this.incremental = new IncrementalAnalyzer();
      this.resultHandler = new ResultHandler();

      this.isRunning = false;
      this.lastAnalysisIndex = 0;
      this.tokenUsage = { prompt: 0, completion: 0 };
      this.listeners = {};
      this.analyzing = false;
    }

    on(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    }

    emit(event, data) {
      (this.listeners[event] || []).forEach(cb => cb(data));
    }

    start() {
      this.isRunning = true;
      this.lastAnalysisIndex = this.meeting.transcript.length;
      this.triggerCtrl.onTrigger(() => this.runAnalysis());
      this.triggerCtrl.start();
      this.emit('started');
    }

    stop() {
      this.isRunning = false;
      this.triggerCtrl.stop();
      this.emit('stopped');
    }

    notifyNewTranscript() {
      if (this.isRunning) {
        this.triggerCtrl.notify();
      }
    }

    async runAnalysis() {
      if (!this.isRunning || this.analyzing) return;

      const newTranscripts = this.meeting.transcript.slice(this.lastAnalysisIndex);
      if (newTranscripts.length === 0) return;

      // 检查 token 上限
      const totalTokens = this.tokenUsage.prompt + this.tokenUsage.completion;
      if (this.settings.tokenLimit && totalTokens >= this.settings.tokenLimit) {
        this.emit('token-limit', { usage: this.tokenUsage });
        return;
      }

      this.analyzing = true;
      this.emit('analyzing');

      try {
        const context = this.incremental.buildContext({
          meeting: this.meeting,
          newTranscripts,
          previousKeyPoints: this.meeting.analysis?.keyPoints || [],
          windowSize: this.settings.windowSize || 10,
          meetingType: this.settings.meetingType || 'review'
        });

        const result = await this.ai.chat(context.messages, {
          temperature: this.settings.temperature || 0.3,
          maxTokens: this.settings.maxTokens || 2000
        });

        const analysis = this.resultHandler.parse(result.content);

        // 合并要点
        const mergedKeyPoints = this.incremental.mergeKeyPoints(
          this.meeting.analysis?.keyPoints || [],
          analysis.keyPoints
        );

        // 更新会议分析数据
        this.meeting.analysis = {
          keyPoints: mergedKeyPoints,
          viewpoints: [...(this.meeting.analysis?.viewpoints || []), ...analysis.viewpoints],
          lastAnalysisAt: Date.now(),
          analysisWindow: this.lastAnalysisIndex
        };

        // 更新 token 统计
        this.tokenUsage.prompt += result.usage.promptTokens;
        this.tokenUsage.completion += result.usage.completionTokens;

        // 更新分析窗口
        this.lastAnalysisIndex = this.meeting.transcript.length;

        this.emit('analysis-updated', {
          analysis: this.meeting.analysis,
          tokenUsage: this.tokenUsage
        });
      } catch (error) {
        console.error('Analysis failed:', error);
        this.emit('analysis-error', error);
      } finally {
        this.analyzing = false;
      }
    }

    async analyzeSingle(transcript) {
      try {
        const context = this.incremental.buildContext({
          meeting: this.meeting,
          newTranscripts: [transcript],
          previousKeyPoints: this.meeting.analysis?.keyPoints || [],
          windowSize: 10,
          meetingType: this.settings.meetingType || 'review'
        });

        const result = await this.ai.chat(context.messages, {
          temperature: this.settings.temperature || 0.3,
          maxTokens: this.settings.maxTokens || 2000
        });

        return this.resultHandler.parse(result.content);
      } catch (error) {
        console.error('Single analysis failed:', error);
        throw error;
      }
    }

    getTokenUsage() {
      return this.tokenUsage;
    }

    estimateCost() {
      const rates = {
        deepseek: { prompt: 1, completion: 2 },
        kimi: { prompt: 10, completion: 10 },
        zhipu: { prompt: 0, completion: 0 }
      };
      const rate = rates[this.settings.provider] || rates.deepseek;
      const promptCost = (this.tokenUsage.prompt / 1_000_000) * rate.prompt;
      const completionCost = (this.tokenUsage.completion / 1_000_000) * rate.completion;
      return promptCost + completionCost;
    }
  }

  window.MeetingAnalysisEngine = MeetingAnalysisEngine;
})(window);
