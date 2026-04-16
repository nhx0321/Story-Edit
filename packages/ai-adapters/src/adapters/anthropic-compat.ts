// Anthropic Messages API 适配器 — 支持 LongCat Anthropic 端点、Qwen Anthropic 端点
import type { AIAdapter, AIMessage, AIStreamChunk, ChatOptions, ChatResult, TokenUsage } from '../index';

interface AnthropicResponse {
  content: { type: string; text?: string; thinking?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { text?: string; type?: string; thinking?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  content_block?: { type: string; text?: string; thinking?: string };
  message?: { usage?: { input_tokens: number; output_tokens: number } };
  index?: number;
}

export class AnthropicCompatAdapter implements AIAdapter {
  readonly provider: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(provider: string, config: { apiKey: string; baseUrl: string; defaultModel: string }) {
    this.provider = provider;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.defaultModel = config.defaultModel;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /** 将 AIMessage[] 转换为 Anthropic messages 格式 */
  private buildMessages(messages: AIMessage[]): { system?: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
    // 提取 system 消息
    const systemMsg = messages.find(m => m.role === 'system');
    const rest = messages.filter(m => m.role !== 'system');
    return {
      system: systemMsg?.content,
      messages: rest.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    };
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<ChatResult> {
    const url = `${this.baseUrl}/v1/messages`;
    const { system, messages: msgs } = this.buildMessages(messages);
    const body: Record<string, unknown> = {
      model: options?.model || this.defaultModel,
      messages: msgs,
      max_tokens: options?.maxTokens ?? 64000,
    };
    if (system) body.system = system;
    if (options?.temperature != null) body.temperature = options.temperature;

    // 120s timeout — Qwen 等模型可能需要较长时间
    const timeoutMs = 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    // 合并外部 signal 和超时 signal
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
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
        // 500 错误附加诊断信息
        if (res.status === 500) {
          errorMsg += ` [诊断] 请检查: 1) API Key 是否有效 2) 模型名称 "${body.model}" 是否正确 3) 服务端是否正常运行`;
        }
        throw new Error(`[${this.provider}] API error ${res.status}: ${errorMsg || '未知错误'}`);
      }

      const data = (await res.json()) as AnthropicResponse;
      const content = data.content?.filter(b => b.text).map(b => b.text!).join('') || '';
      const usage: TokenUsage | undefined = data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined;

      return { content, usage };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`[${this.provider}] 请求超时（${timeoutMs / 1000}s），请检查网络或模型配置`);
      }
      throw err;
    }
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
    const url = `${this.baseUrl}/v1/messages`;
    const { system, messages: msgs } = this.buildMessages(messages);
    const body: Record<string, unknown> = {
      model: options?.model || this.defaultModel,
      messages: msgs,
      max_tokens: options?.maxTokens ?? 64000,
      stream: true,
    };
    if (system) body.system = system;
    if (options?.temperature != null) body.temperature = options.temperature;

    const timeoutMs = 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'Accept': 'text/event-stream' },
        body: JSON.stringify(body),
        signal,
      });
      clearTimeout(timeoutId);

      // 如果 API 不支持流式（返回 400），回退到非流式模式
      // 如果 API 返回 500（服务异常），也回退到非流式重试一次
      if (!res.ok) {
        if (res.status === 400 || res.status === 500) {
          // 尝试读取错误响应以提供诊断
          let errorDetail = '';
          try {
            const errBody = await res.json();
            errorDetail = errBody?.error?.message || errBody?.message || '';
          } catch {
            errorDetail = (await res.text().catch(() => '')).slice(0, 200);
          }
          // 500 + 空错误体 = 服务端内部错误，尝试非流式回退
          if (res.status === 500 && !errorDetail) {
            try {
              yield* this.chatStreamNonStream(messages, options);
              return;
            } catch (fallbackErr) {
              throw new Error(`[${this.provider}] API error 500（服务端内部错误），请检查: 1) API Key 是否有效 2) 模型名称 "${body.model}" 是否正确 3) 服务是否正常运行`);
            }
          }
          throw new Error(`[${this.provider}] API error ${res.status}: ${errorDetail || '未知错误'}`);
        }
        const text = await res.text().catch(() => '');
        throw new Error(`[${this.provider}] API error ${res.status}: ${text.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();

            // 忽略 event: 行和 SSE comments
            if (trimmed.startsWith('event:') || trimmed.startsWith(':')) continue;

            // 处理 data: 行
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') {
              yield { content: '', done: true };
              return;
            }
            try {
              const data = JSON.parse(payload) as AnthropicStreamEvent;

              if (data.type === 'message_stop') {
                yield { content: '', done: true };
                return;
              }

              // content_block_delta — 增量内容
              if (data.type === 'content_block_delta' && data.delta) {
                // text_delta — 显示回答内容
                if (data.delta.type === 'text_delta' && data.delta.text) {
                  yield { content: data.delta.text, done: false };
                  continue;
                }
                // thinking_delta — 显示思考过程
                if (data.delta.type === 'thinking_delta' && data.delta.thinking) {
                  yield { thinking: data.delta.thinking, content: '', done: false };
                  continue;
                }
              }

              // content_block_start — 初始内容块（LongCat/Qwen 等 Anthropic 兼容 API 会发送）
              if (data.type === 'content_block_start' && data.content_block) {
                const block = data.content_block;
                if (block.type === 'text' && block.text) {
                  yield { content: block.text, done: false };
                  continue;
                }
                if (block.type === 'thinking' && block.thinking) {
                  yield { thinking: block.thinking, content: '', done: false };
                  continue;
                }
              }

              // message_delta — 结束时的 usage 信息
              if (data.type === 'message_delta' && data.usage) {
                yield {
                  content: '',
                  done: true,
                  usage: {
                    promptTokens: data.usage.input_tokens || 0,
                    completionTokens: data.usage.output_tokens || 0,
                    totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
                  },
                };
                return;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield { content: '', done: true };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`[${this.provider}] 请求超时（${timeoutMs / 1000}s），请检查网络或模型配置`);
      }
      throw err;
    }
  }

  /** 非流式流式模拟（用于不支持 stream: true 的 API） */
  async *chatStreamNonStream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
    const result = await this.chat(messages, options);
    if (!result.content) {
      yield { content: '', done: true, usage: result.usage };
      return;
    }
    for (const char of result.content) {
      yield { content: char, done: false };
    }
    yield { content: '', done: true, usage: result.usage };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.chat(
        [{ role: 'user', content: '请回复"连接成功"四个字' }],
        { maxTokens: 100 },
      );
      return { ok: result.content.length > 0 };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
