// 结果处理器 - 解析 AI 返回的分析结果
(function(window) {
  'use strict';

  class ResultHandler {
    parse(content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        const data = JSON.parse(jsonMatch[0]);

        const keyPoints = (data.keyPoints || []).map(kp => ({
          id: kp.id || `kp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          content: String(kp.content || '').trim(),
          speaker: String(kp.speaker || 'Unknown').trim(),
          timestamp: Number(kp.timestamp) || Date.now(),
          confidence: Math.min(1, Math.max(0, Number(kp.confidence) || 0.5)),
          createdAt: Date.now()
        })).filter(kp => kp.content.length > 0);

        const viewpoints = (data.viewpoints || []).map(vp => ({
          id: vp.id || `vp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          originalText: String(vp.originalText || '').trim(),
          speaker: String(vp.speaker || 'Unknown').trim(),
          timestamp: Number(vp.timestamp) || Date.now(),
          surface: String(vp.surface || '').trim(),
          hidden: String(vp.hidden || '').trim(),
          flaws: (vp.flaws || []).map(f => ({
            type: this.validateFlawType(f.type),
            description: String(f.description || '').trim(),
            evidence: String(f.evidence || '').trim(),
            suggestion: String(f.suggestion || '').trim()
          })).filter(f => f.description.length > 0),
          responses: (vp.responses || []).map(r => ({
            style: this.validateResponseStyle(r.style),
            text: String(r.text || '').trim()
          })).filter(r => r.text.length > 0),
          feedback: null,
          createdAt: Date.now()
        })).filter(vp => vp.originalText.length > 0);

        return { keyPoints, viewpoints };
      } catch (error) {
        console.error('Failed to parse analysis result:', error);
        return { keyPoints: [], viewpoints: [] };
      }
    }

    validateFlawType(type) {
      const valid = ['数据矛盾', '逻辑跳跃', '隐含假设', '偷换概念', '以偏概全', '时间错位'];
      return valid.includes(type) ? type : '逻辑跳跃';
    }

    validateResponseStyle(style) {
      const valid = ['温和追问', '数据反驳', '转移焦点', '共识确认', '风险提示'];
      return valid.includes(style) ? style : '温和追问';
    }
  }

  window.ResultHandler = ResultHandler;
})(window);
