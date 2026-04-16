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

interface StreamChunk {
  content?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  error?: string;
  thinking?: string;
}

export async function* streamAiChat(options: StreamOptions): AsyncGenerator<StreamChunk> {
  const token = useAuthStore.getState().token;
  const baseUrl = typeof window !== 'undefined' ? '' : `http://localhost:3001`;

  const res = await fetch(`${baseUrl}/api/ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    yield { error: err.error || `HTTP ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { yield { error: '无法读取响应流' }; return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
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
