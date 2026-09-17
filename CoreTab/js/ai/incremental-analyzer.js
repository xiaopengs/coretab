// 增量分析器 - 构建分析上下文
(function(window) {
  'use strict';

  const MEETING_TYPE_PROMPTS = {
    review: '评审会',
    negotiation: '商务谈判',
    brainstorm: '头脑风暴',
    weekly: '团队周会'
  };

  class IncrementalAnalyzer {
    constructor() {
      this.summaryCache = new Map();
    }

    buildContext({ meeting, newTranscripts, previousKeyPoints, windowSize, meetingType }) {
      const messages = [];
      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(meeting, meetingType)
      });
      messages.push({
        role: 'user',
        content: this.buildUserPrompt({ meeting, newTranscripts, previousKeyPoints, windowSize })
      });
      return { messages };
    }

    buildSystemPrompt(meeting, meetingType) {
      const typeName = MEETING_TYPE_PROMPTS[meetingType] || '评审会';
      return `你是一位资深的会议分析顾问，专注于${typeName}场景。

你的任务是：
1. 提炼当前会议的关键要点（最多 10 条）
2. 识别重要观点并分析其表面含义、隐含意思
3. 检测观点中的逻辑漏洞
4. 生成应对话术建议

输出格式要求（严格 JSON）：
{
  "keyPoints": [
    {
      "id": "kp_1",
      "content": "要点内容",
      "speaker": "说话人",
      "timestamp": 0,
      "confidence": 0.9
    }
  ],
  "viewpoints": [
    {
      "id": "vp_1",
      "originalText": "原始发言",
      "speaker": "说话人",
      "timestamp": 0,
      "surface": "表面含义",
      "hidden": "隐含意思",
      "flaws": [
        {
          "type": "数据矛盾|逻辑跳跃|隐含假设|偷换概念|以偏概全|时间错位",
          "description": "漏洞描述",
          "evidence": "关联证据",
          "suggestion": "建议追问"
        }
      ],
      "responses": [
        {
          "style": "温和追问|数据反驳|转移焦点|共识确认|风险提示",
          "text": "话术内容"
        }
      ]
    }
  ]
}

注意：
- 只输出 JSON，不要输出其他内容
- 要点要精炼，抓住核心议题
- 隐含意思要基于合理推断
- 逻辑漏洞要具体，指出与哪些已有信息矛盾
- 话术要自然，适合会议口语场景`;
    }

    buildUserPrompt({ meeting, newTranscripts, previousKeyPoints, windowSize }) {
      const recent = meeting.transcript.slice(-windowSize);
      const transcriptText = recent.map(t =>
        `[${this.formatTime(t.timestamp)}] ${t.speaker}: ${t.text}`
      ).join('\n');

      const newText = newTranscripts.map(t =>
        `[${this.formatTime(t.timestamp)}] ${t.speaker}: ${t.text}`
      ).join('\n');

      const keyPointsText = previousKeyPoints.length > 0
        ? previousKeyPoints.map(kp => `- ${kp.content}`).join('\n')
        : '暂无';

      return `## 会议信息
- 主题: ${meeting.title}
- 时长: ${this.formatDuration(meeting.duration)}
- 参会人: ${meeting.participants.join(', ')}

## 已有要点
${keyPointsText}

## 最近转写
${transcriptText}

## 新增转写（需要重点分析）
${newText}

请基于以上信息，更新要点列表并分析新增转写中的重要观点。只输出 JSON。`;
    }

    formatTime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
      return `${minutes}分钟`;
    }

    mergeKeyPoints(existing, newPoints) {
      const merged = [...existing];
      for (const newPoint of newPoints) {
        const similar = merged.find(ep =>
          this.calculateSimilarity(ep.content, newPoint.content) > 0.7
        );
        if (similar) {
          similar.confidence = (similar.confidence + newPoint.confidence) / 2;
          similar.updatedAt = Date.now();
        } else {
          merged.push(newPoint);
        }
      }
      return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
    }

    calculateSimilarity(text1, text2) {
      const words1 = new Set(text1.split(/\s+/));
      const words2 = new Set(text2.split(/\s+/));
      const intersection = [...words1].filter(w => words2.has(w));
      const union = new Set([...words1, ...words2]);
      return union.size === 0 ? 0 : intersection.length / union.size;
    }
  }

  window.IncrementalAnalyzer = IncrementalAnalyzer;
})(window);
