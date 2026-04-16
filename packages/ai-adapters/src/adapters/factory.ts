// 适配器工厂 — 根据 provider 和 baseUrl 自动选择 OpenAI 或 Anthropic 协议
import type { AIAdapter, AdapterConfig } from '../index';
import { OpenAICompatAdapter } from './openai-compat';
import { AnthropicCompatAdapter } from './anthropic-compat';

// 各 provider 的默认配置
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  longcat: {
    baseUrl: 'https://api.longcat.chat/anthropic',
    model: 'LongCat-Flash-Thinking-2601',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  custom: {
    baseUrl: 'https://api.example.com/v1',
    model: 'default',
  },
};

// 判断 baseUrl 是否为 Anthropic 协议
function isAnthropicProtocol(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.toLowerCase();
  return normalized.includes('/anthropic');
}

export function createAdapter(provider: string, config: AdapterConfig): AIAdapter {
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom!;
  const effectiveBaseUrl = config.baseUrl || defaults.baseUrl;

  // 根据 URL 协议类型选择适配器
  if (isAnthropicProtocol(effectiveBaseUrl)) {
    return new AnthropicCompatAdapter(provider, {
      apiKey: config.apiKey,
      baseUrl: effectiveBaseUrl,
      defaultModel: config.defaultModel || defaults.model,
    });
  }

  return new OpenAICompatAdapter(provider, config, defaults);
}

export function getSupportedProviders() {
  return Object.keys(PROVIDER_DEFAULTS);
}
