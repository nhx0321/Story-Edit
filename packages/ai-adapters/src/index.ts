// @story-edit/ai-adapters — AI 模型统一适配层

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
  thinking?: string; // 思考过程内容
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  usage?: TokenUsage;
}

export interface AIAdapter {
  readonly provider: string;
  chat(messages: AIMessage[], options?: ChatOptions): Promise<ChatResult>;
  chatStream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

export interface AdapterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

// 适配器工厂
export { OpenAICompatAdapter } from './adapters/openai-compat';
export { AnthropicCompatAdapter } from './adapters/anthropic-compat';
export { createAdapter, getProviderDefaultModel } from './adapters/factory';
