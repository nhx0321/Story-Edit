// OpenAI 兼容协议适配器 — Claude/OpenAI/DeepSeek/LongCat/Custom 统一走此协议
import type { AIAdapter, AIMessage, AIStreamChunk, ChatOptions, ChatResult, AdapterConfig, TokenUsage } from '../index';

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAICompatAdapter implements AIAdapter {
  readonly provider: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(provider: string, config: AdapterConfig, defaults: { baseUrl: string; model: string }) {
    this.provider = provider;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || defaults.baseUrl).replace(/\/+$/, '');
    this.defaultModel = config.defaultModel || defaults.model;
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<ChatResult> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    // 120s timeout
    const timeoutMs = 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body,
      signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorMsg = '';
      try {
        const json = await res.json();
        errorMsg = json?.error?.message || json?.message || JSON.stringify(json);
      } catch {
        const text = await res.text().catch(() => '');
        if (text.startsWith('<')) {
          errorMsg = `请求返回 ${res.status} 错误，请检查 API 地址和模型名称`;
        } else {
          errorMsg = text.slice(0, 200);
        }
      }
      throw new Error(`[${this.provider}] API error ${res.status}: ${errorMsg || '未知错误'}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content || '';
    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined;

    return { content, usage };
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
    // 统一使用非流式 chat + 逐字模拟流式输出，避免各厂商流式格式差异
    const result = await this.chat(messages, options);
    if (!result.content) {
      yield { content: '', done: true, usage: result.usage };
      return;
    }
    // 模拟流式输出：逐字 yield
    for (const char of result.content) {
      yield { content: char, done: false };
    }
    yield { content: '', done: true, usage: result.usage };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.chat(
        [{ role: 'user', content: '请回复"连接成功"四个字' }],
        { maxTokens: 20 },
      );
      return { ok: result.content.length > 0 };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
