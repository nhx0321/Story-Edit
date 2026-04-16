// @story-edit/shared — 共享类型、常量、工具函数

// 项目类型
export type ProjectType = 'novel' | 'screenplay' | 'prompt_gen';

// 创作阶段
export type CreationPhase = 'conception' | 'writing' | 'review' | 'finalized';

// 记忆层级
export type MemoryLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

// AI 模型提供商
export type AIProvider = 'deepseek' | 'longcat' | 'qwen' | 'custom';

// 用户订阅状态
export type SubscriptionStatus = 'trial' | 'free' | 'premium' | 'expired';

// 通用 API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
