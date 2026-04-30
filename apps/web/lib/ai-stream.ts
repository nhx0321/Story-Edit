// AI 流式输出客户端工具
import { useAuthStore } from '@/lib/auth-store';

interface StreamOptions {
  configId: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  projectId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamChunk {
  jobId?: string;
  content?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  error?: string;
  thinking?: string;
  reconnecting?: boolean;
  replayed?: boolean;
}

export async function* streamAiChat(options: StreamOptions): AsyncGenerator<StreamChunk> {
  const token = useAuthStore.getState().token;
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  // 前端超时控制（180s，与平台模式保持一致）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(options),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      yield { error: '请求超时（180秒），请检查网络或按↑输入对话重试' };
    } else {
      yield { error: err instanceof Error ? err.message : '网络连接失败' };
    }
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    yield { error: err.error || `HTTP ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { yield { error: '无法读取响应流' }; return; }

  // 委托给 SSE 读取器
  yield* readSSEStream(reader);
}

/** 断线重连：回放已生成的事件 + 订阅新事件 */
export async function* streamReconnect(jobId: string): AsyncGenerator<StreamChunk> {
  const token = useAuthStore.getState().token;
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/ai/stream/reconnect/${jobId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err: unknown) {
    yield { error: err instanceof Error ? err.message : '重连失败' };
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '重连失败' }));
    yield { error: err.error || `HTTP ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { yield { error: '无法读取响应流' }; return; }

  yield* readSSEStream(reader);
}

/** 平台Token模式流式调用 */
export interface PlatformStreamOptions {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  projectId?: string;
  conversationId?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export async function* streamPlatformAiChat(options: PlatformStreamOptions): AsyncGenerator<StreamChunk> {
  const token = useAuthStore.getState().token;
  // 直连后端服务器，完全绕过 Next.js（rewrite 有 30s 代理超时）
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  // 前端超时控制（180s，与后端路由超时协调）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/ai/stream/platform`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(options),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      yield { error: '请求超时（180秒），请检查网络或按↑输入对话重试' };
    } else {
      yield { error: err instanceof Error ? err.message : '网络连接失败' };
    }
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    yield { error: err.error || `HTTP ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { yield { error: '无法读取响应流' }; return; }

  yield* readSSEStream(reader);
}

/** 查询任务状态 */
export async function checkJobStatus(jobId: string): Promise<{ status: string; error?: string } | null> {
  const token = useAuthStore.getState().token;
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  try {
    const res = await fetch(`${baseUrl}/api/ai/stream/status/${jobId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ========== 通用 SSE 流读取器 ==========
async function* readSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      // 解析 SSE 注释行（thinking / retrying 进度事件）
      if (line.startsWith(': ')) {
        const commentData = line.slice(2);
        try {
          const parsed = JSON.parse(commentData);
          if (parsed.type === 'thinking' || parsed.phase === 'connecting') {
            yield { thinking: parsed.phase || 'connecting', reconnecting: false };
          } else if (parsed.type === 'retrying' || parsed.channel) {
            yield { thinking: 'retrying', reconnecting: true };
          }
        } catch { /* skip malformed comment */ }
        continue;
      }

      if (!line.startsWith('data: ')) continue;
      try {
        const chunk: StreamChunk = JSON.parse(line.slice(6));
        yield chunk;
      } catch {
        // skip malformed JSON
      }
    }
  }
}
