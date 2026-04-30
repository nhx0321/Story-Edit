// OpenAI 兼容协议适配器 — Claude/OpenAI/DeepSeek/LongCat/Custom 统一走此协议
import type { AIAdapter, AIMessage, AIStreamChunk, ChatOptions, ChatResult, AdapterConfig, TokenUsage } from '../index';

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIStreamChunk {
  choices?: { delta: { content?: string; reasoning_content?: string; role?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIErrorResponse {
  error?: { message?: string };
  message?: string;
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

    // 300s 超时（平台路由层有更短的外部超时如 180s，此层作为最后防线）
    const timeoutMs = 300_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body,
        signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        // 区分是外部调用方中断（渠道重试超时）还是内部超时
        const isExternalAbort = options?.signal?.aborted && !controller.signal.aborted;
        if (isExternalAbort) {
          throw new Error(`[${this.provider}] 请求被调用方中断`);
        }
        throw new Error(`[${this.provider}] 请求超时（${Math.round(timeoutMs / 1000)}s 无响应），请检查网络连接或尝试更换更快的模型`);
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorMsg = '';
      try {
        const json = await res.json() as OpenAIErrorResponse;
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

    // 记录 API 返回空响应的情况
    if (!content) {
      console.error(`[${this.provider}] API returned empty content. Response:`, JSON.stringify(data).slice(0, 500));
    }

    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined;

    return { content, usage };
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    // 300s 超时作为最后防线（流式请求一旦开始收到数据就不会超时）
    const timeoutMs = 300_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body,
        signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        const isExternalAbort = options?.signal?.aborted && !controller.signal.aborted;
        if (isExternalAbort) {
          throw new Error(`[${this.provider}] 请求被调用方中断`);
        }
        throw new Error(`[${this.provider}] 流式请求超时（${Math.round(timeoutMs / 1000)}s 无响应）`);
      }
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timeoutId);
      let errorMsg = '';
      try {
        const json = await res.json() as OpenAIErrorResponse;
        errorMsg = json?.error?.message || json?.message || JSON.stringify(json);
      } catch {
        errorMsg = await res.text().catch(() => '');
      }
      throw new Error(`[${this.provider}] API error ${res.status}: ${errorMsg || '未知错误'}`);
    }

    // 连接成功，清除超时（流式数据已开始）
    clearTimeout(timeoutId);

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error(`[${this.provider}] 无法读取流式响应`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let usage: TokenUsage | undefined;
    let hasContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true, usage };
            return;
          }
          try {
            const parsed = JSON.parse(data) as OpenAIStreamChunk;
            const delta = parsed.choices?.[0]?.delta;

            // 支持 reasoning_content（思考型模型如 LongCat-Flash-Thinking）
            if (delta?.reasoning_content) {
              hasContent = true;
              yield { content: '', thinking: delta.reasoning_content, done: false };
            }

            if (delta?.content) {
              hasContent = true;
              yield { content: delta.content, done: false };
            }

            // 部分提供商在最后一个 chunk 返回 usage
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!hasContent) {
      throw new Error(`[${this.provider}] API 流式响应无内容，请检查模型配置`);
    }
    yield { content: '', done: true, usage };
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
