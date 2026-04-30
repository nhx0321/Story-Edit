// 任务书生成器 — 为每章创作自动聚合上下文
import type { AIMessage } from '@story-edit/ai-adapters';

export interface TaskBrief {
  chapterId: string;
  chapterTitle: string;
  // 上下文组装
  previousSummary: string;    // 前情摘要
  chapterSynopsis: string;    // 本章梗概
  relevantSettings: string[]; // 相关设定
  characterStates: string[];  // 角色当前状态
  redLines: string[];         // 创作红线（付费）
  styleGuide: string;         // 风格要求
  lastParagraph: string;      // 上一章尾段（衔接用）
}

export interface TaskBriefOptions {
  isPremium: boolean;
  includeRedLines: boolean;
  includeStateSnapshot: boolean;
  /** L0-L3 创作经验文本（供 AI 创作时参考） */
  experienceText?: string;
}

// 将任务书转为 AI 消息
export function taskBriefToMessages(brief: TaskBrief, rolePrompt: string, options: TaskBriefOptions): AIMessage[] {
  const messages: AIMessage[] = [];

  // 系统提示词（角色 + 风格）
  let systemContent = rolePrompt;
  if (brief.styleGuide) {
    systemContent += `\n\n## 风格要求\n${brief.styleGuide}`;
  }
  if (options.isPremium && options.includeRedLines && brief.redLines.length > 0) {
    systemContent += `\n\n## 创作红线（绝对不可违反）\n${brief.redLines.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  }
  if (options.experienceText) {
    systemContent += `\n\n## 创作经验（从历史创作中提炼）\n${options.experienceText}`;
  }
  messages.push({ role: 'system', content: systemContent });

  // 用户消息：任务书
  let taskContent = `# 创作任务：${brief.chapterTitle}\n\n`;

  if (brief.previousSummary) {
    taskContent += `## 前情摘要\n${brief.previousSummary}\n\n`;
  }

  if (brief.lastParagraph) {
    taskContent += `## 上一章结尾（请自然衔接）\n${brief.lastParagraph}\n\n`;
  }

  taskContent += `## 本章剧情\n${brief.chapterSynopsis}\n\n`;

  if (brief.relevantSettings.length > 0) {
    taskContent += `## 相关设定\n${brief.relevantSettings.join('\n\n')}\n\n`;
  }

  if (options.isPremium && options.includeStateSnapshot && brief.characterStates.length > 0) {
    taskContent += `## 角色当前状态\n${brief.characterStates.join('\n')}\n\n`;
  }

  taskContent += `请根据以上信息撰写本章正文。`;

  messages.push({ role: 'user', content: taskContent });

  return messages;
}

// 估算 token 数（粗略：中文约 1.5 token/字）
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
}
