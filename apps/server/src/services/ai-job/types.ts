// AI 流式任务类型定义

export interface AiJobMeta {
  jobId: string;
  userId: string;
  projectId?: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: number;
  error?: string;
}

export interface StreamEvent {
  content?: string;
  thinking?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  error?: string;
}
