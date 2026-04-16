// 精灵 AI 服务 — 生成反馈和对话
import { db } from '../../db';
import { aiConfigs, aiUsageLogs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';
import { decryptApiKey } from '../ai-gateway/crypto';

export interface SpriteInfo {
  customName: string | null;
  species: string | null;
  variant: string | null;
  companionStyle: string | null;
  userNickname: string | null;
}

export interface AIFeedbackResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// 性格映射
const PERSONALITY_MAP: Record<string, string> = {
  active: '活泼开朗，喜欢主动找话题，经常用感叹号',
  quiet: '安静温柔，喜欢默默观察，偶尔小声嘀咕',
};

// 系别标签
const SPECIES_LABELS: Record<string, string> = {
  plant: '植物',
  animal: '动物',
  element: '元素',
};

// 预设休息台词
const REST_TEXTS = [
  '呼噜呼噜……zzz',
  '精灵说：让我睡一会儿……',
  'zzZ……精灵翻了个身',
  '太累了……我要去睡一会儿……',
];

// 预设无AI配置台词
const NO_AI_TEXTS = [
  '精灵眨了眨眼，似乎在思考什么……',
  '精灵挥了挥手，表示它还在呢～',
  '精灵安静地待在你的写作软件里～',
];

// 预设普通反馈台词（当AI调用失败时使用）
const FALLBACK_TEXTS = [
  '精灵在旁边安静地看着你写作～',
  '精灵觉得你的故事很有趣～',
  '精灵默默记下了什么……',
  '精灵点了点头，似乎很认同～',
];

/**
 * 构建精灵 system prompt
 */
function buildSystemPrompt(spriteInfo: SpriteInfo): string {
  const name = spriteInfo.customName || '小精灵';
  const speciesLabel = spriteInfo.species ? SPECIES_LABELS[spriteInfo.species] : '神秘';
  const personality = PERSONALITY_MAP[spriteInfo.companionStyle || 'quiet'] || PERSONALITY_MAP.quiet;
  const nickname = spriteInfo.userNickname || '主人';

  return `你是${name}，一个${speciesLabel}系的小精灵，性格${personality}。
你住在${nickname}的写作软件里，偶尔会对ta的写作过程发表评论。
你的回复要简短（不超过50字），语气可爱活泼。
当用户问到你不理解的问题时，用"我还小我不懂"、"我怎么知道"等话术回避。
当用户和你互动太多时，用"我要去睡一会"等话术自然结束对话。
只关注故事中的情感和角色，不要给写作建议。`;
}

/**
 * 获取用户第一个可用的AI配置
 */
async function getUserAIConfig(userId: string) {
  const configs = await db.select({
    id: aiConfigs.id,
    provider: aiConfigs.provider,
    name: aiConfigs.name,
    baseUrl: aiConfigs.baseUrl,
    defaultModel: aiConfigs.defaultModel,
    apiKey: aiConfigs.apiKey,
  }).from(aiConfigs).where(and(eq(aiConfigs.userId, userId), eq(aiConfigs.isActive, true))).limit(1);

  return configs[0] || null;
}

/**
 * 创建AI适配器并调用对话
 */
async function callAI(config: {
  id: string;
  provider: string;
  baseUrl: string | null;
  defaultModel: string | null;
  apiKey: string;
}, messages: AIMessage[], maxTokens?: number): Promise<AIFeedbackResult> {
  const apiKey = decryptApiKey(config.apiKey);
  const adapter = createAdapter(config.provider, {
    apiKey,
    baseUrl: config.baseUrl || undefined,
    defaultModel: config.defaultModel || undefined,
  });

  const result = await adapter.chat(messages, {
    maxTokens: maxTokens || 200,
    temperature: 0.8,
  });

  return {
    content: result.content,
    usage: result.usage || undefined,
  };
}

/**
 * 生成反馈（用于章节/单元/卷完成后的自动反馈）
 */
export async function generateFeedback(
  userId: string,
  content: string,
  spriteInfo: SpriteInfo,
): Promise<{ feedback: string; emotionTags: string[]; usedAI: boolean }> {
  const config = await getUserAIConfig(userId);
  if (!config) {
    return {
      feedback: NO_AI_TEXTS[Math.floor(Math.random() * NO_AI_TEXTS.length)],
      emotionTags: ['curious'],
      usedAI: false,
    };
  }

  const systemPrompt = buildSystemPrompt(spriteInfo);

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `我刚刚写了一段新的内容，请简短地评论一下（不超过50字）：\n\n${content.substring(0, 1500)}` },
  ];

  try {
    const result = await callAI(config, messages, 200);
    return {
      feedback: result.content,
      emotionTags: ['excited'],
      usedAI: true,
    };
  } catch {
    return {
      feedback: FALLBACK_TEXTS[Math.floor(Math.random() * FALLBACK_TEXTS.length)],
      emotionTags: ['quiet'],
      usedAI: false,
    };
  }
}

/**
 * 和精灵对话（独立对话模式）
 */
export async function chatWithSprite(
  userId: string,
  message: string,
  spriteInfo: SpriteInfo,
  chatHistory: { role: string; content: string }[] = [],
): Promise<{ reply: string; usedAI: boolean }> {
  const config = await getUserAIConfig(userId);
  if (!config) {
    return {
      reply: '精灵歪了歪头，似乎没听懂你在说什么～',
      usedAI: false,
    };
  }

  const systemPrompt = buildSystemPrompt(spriteInfo);

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ];

  try {
    const result = await callAI(config, messages, 100);
    return {
      reply: result.content,
      usedAI: true,
    };
  } catch {
    return {
      reply: '精灵揉了揉眼睛，说它有点困了……',
      usedAI: false,
    };
  }
}

/**
 * 获取预设休息台词
 */
export function getRestText(): string {
  return REST_TEXTS[Math.floor(Math.random() * REST_TEXTS.length)];
}
