// AI 对话状态管理 hook
import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat, streamPlatformAiChat, streamReconnect } from '@/lib/ai-stream';

// 对话恢复数据结构
interface RecoveryState {
  conversationId: string;
  configId: string;
  roleKey: string;
  projectId: string;
  lastUserMessage: string;
  messageCount: number;
  timestamp: number;
  jobId?: string;
}

function saveRecoveryState(projectId: string, state: RecoveryState) {
  try {
    localStorage.setItem(`storyedit_recovery_${projectId}`, JSON.stringify(state));
  } catch { /* localStorage full or unavailable */ }
}

function loadRecoveryState(projectId: string): RecoveryState | null {
  try {
    const raw = localStorage.getItem(`storyedit_recovery_${projectId}`);
    if (!raw) return null;
    const state = JSON.parse(raw) as RecoveryState;
    // 超过 1 小时的恢复数据视为过期
    if (Date.now() - state.timestamp > 3600000) {
      localStorage.removeItem(`storyedit_recovery_${projectId}`);
      return null;
    }
    return state;
  } catch { return null; }
}

function clearRecoveryState(projectId: string) {
  try { localStorage.removeItem(`storyedit_recovery_${projectId}`); } catch { /* noop */ }
}

export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  thinking?: string; // 思考过程
  actionType?: string;
  actionPayload?: Record<string, unknown>;
}

interface UseChatOptions {
  conversationId: string | null;
  configId: string;
  projectId: string;
  roleKey: string;
  /** 平台Token模式：模型ID（使用平台Token计费，而非用户自有API Key） */
  model?: string;
  onActionConfirmed?: (type: string, entity: unknown) => void;
  /** 已存在的卷列表，用于注入上下文 */
  volumes?: { id: string; title: string; synopsis?: string | null }[];
  /** 当前章节ID（用于 writer 角色） */
  chapterContext?: { id: string; title: string; synopsis?: string | null; unitTitle?: string; volumeTitle?: string };
  /** 任务书内容（用于 writer 角色） */
  taskBrief?: string;
  /** 完整大纲列表（用于 setting_editor 和 writer 读取文学编辑的大纲） */
  fullOutline?: { id: string; title: string; synopsis?: string | null; units?: { id: string; title: string; synopsis?: string | null; chapters?: { id: string; title: string; synopsis?: string | null }[] }[] }[];
  /** 故事脉络（用于 editor 和 setting_editor 读取全书故事脉络） */
  storyNarrative?: { id: string; title: string; content: string } | null;
  /** 自定义上下文提示（由父组件精心策划的上下文，优先级最高） */
  customContextPrompt?: string;
  /** L0-L3 创作经验（供 writer 角色参考） */
  experiences?: string;
  /** 项目设定词条列表（供 editor 角色读取设定信息） */
  projectSettings?: { id: string; category: string; title: string; content: string }[];
}

export function useChat({ conversationId, configId, projectId, roleKey, model, onActionConfirmed, volumes, chapterContext, taskBrief, fullOutline, storyNarrative, customContextPrompt, experiences, projectSettings }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [confirmedActions, setConfirmedActions] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);

  // 渠道重试状态（供前端显示「正在尝试备用API」提示）
  const [retryState, setRetryState] = useState<{ reconnecting: boolean; retryCount: number; elapsedMs: number } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utils = trpc.useUtils();
  const sendMessageMut = trpc.conversation.sendMessage.useMutation();
  const confirmActionMut = trpc.conversation.confirmAction.useMutation();

  // 对话恢复状态
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  // 检查是否有可恢复的对话
  useEffect(() => {
    if (conversationId || !projectId) return;
    const saved = loadRecoveryState(projectId);
    if (saved && saved.roleKey === roleKey) {
      setRecoveryState(saved);
      setShowRecovery(true);
    }
  }, [projectId, conversationId, roleKey]);

  // 关闭恢复提示
  const dismissRecovery = useCallback(() => {
    setShowRecovery(false);
    if (recoveryState) {
      clearRecoveryState(recoveryState.projectId);
      setRecoveryState(null);
    }
  }, [recoveryState]);

  // 从后台任务恢复（断线重连）
  const startReconnect = useCallback(async () => {
    if (!recoveryState?.jobId || !recoveryState.lastUserMessage) return;
    const state = recoveryState;
    dismissRecovery();
    setStreaming(true);

    let fullResponse = '';
    let fullThinking = '';
    let streamError: string | null = null;

    // 添加用户消息到 UI
    const userMsg: ChatMessage = { role: 'user', content: state.lastUserMessage };
    setMessages(prev => [...prev, userMsg]);

    // 持久化用户消息
    try {
      await sendMessageMut.mutateAsync({
        conversationId: state.conversationId,
        role: 'user',
        content: state.lastUserMessage,
      });
    } catch (err) {
      console.error('[useChat] Failed to persist reconnected user message:', err);
    }

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', thinking: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      for await (const chunk of streamReconnect(state.jobId!)) {
        if (chunk.error) {
          streamError = chunk.error;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${chunk.error}` };
            return copy;
          });
          break;
        }
        if (chunk.thinking) {
          fullThinking += chunk.thinking;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
        }
        if (chunk.content) {
          fullResponse += chunk.content;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
        }
        if (chunk.done) break;
      }
    } catch (err: unknown) {
      streamError = err instanceof Error ? err.message : '重连失败';
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${streamError}` };
        return copy;
      });
    }

    // 清理重试状态
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    setRetryState(null);

    setStreaming(false);

    // 持久化回复
    if (fullResponse) {
      clearRecoveryState(state.projectId);
      try {
        await sendMessageMut.mutateAsync({
          conversationId: state.conversationId,
          role: 'assistant',
          content: fullResponse,
        });
      } catch (err) {
        console.error('[useChat] Failed to persist reconnected response:', err);
      }
    }
  }, [recoveryState, dismissRecovery, sendMessageMut, setMessages, setStreaming]);

  // Load conversation history
  const { data: convData } = trpc.conversation.get.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  // 加载近期修改记录（用于 editor 和 setting_editor 角色）
  const { data: editLogs } = trpc.project.listEditLogs.useQuery(
    { projectId, limit: 10 },
    { enabled: (roleKey === 'editor' || roleKey === 'setting_editor') && !!conversationId },
  );

  // Sync loaded messages
  const prevConvId = useRef<string | null>(null);
  if (convData && convData.id !== prevConvId.current) {
    prevConvId.current = convData.id;
    const loaded = convData.messages
      .filter((m: { role: string }) => m.role !== 'system')
      .map((m: { id: string; role: string; content: string }) => ({
        id: m.id, role: m.role as ChatMessage['role'], content: m.content,
      }));
    if (JSON.stringify(loaded) !== JSON.stringify(messages)) {
      setMessages(loaded);
    }
  }

  // 构建上下文消息 — 让 AI 知道已经存在的内容
  const buildContextMessage = useCallback((): string => {
    const parts: string[] = [];

    // ===== 优先级 1：自定义上下文提示（由父组件精心策划） =====
    if (customContextPrompt) {
      parts.push('[创作上下文]');
      parts.push(customContextPrompt);
    }

    // ===== 优先级 1.5：故事脉络上下文（editor 和 setting_editor） =====
    if (storyNarrative && (roleKey === 'editor' || roleKey === 'setting_editor')) {
      parts.push('[全书简介（故事脉络）]');
      parts.push(`标题：${storyNarrative.title}`);
      parts.push(storyNarrative.content);
      parts.push('');
      if (roleKey === 'editor') {
        parts.push('你在讨论和创作时必须参考以上故事脉络，确保剧情与脉络一致。');
      } else if (roleKey === 'setting_editor') {
        parts.push('你在搭建设定时必须参考以上故事脉络，确保设定与故事框架一致。');
      }
    }

    // ===== 优先级 1.6：近期手动修改记录（editor 和 setting_editor） =====
    if (editLogs && editLogs.length > 0 && (roleKey === 'editor' || roleKey === 'setting_editor')) {
      parts.push('## 近期手动修改记录');
      parts.push('（以下是用户近期手动修改过的内容，全局修改时需了解这些局部变更）');
      editLogs.forEach(log => {
        const typeLabel = log.entityType === 'volume' ? '卷' : log.entityType === 'unit' ? '单元' : log.entityType === 'chapter' ? '章节' : '设定';
        const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleDateString('zh-CN') : '';
        const oldPreview = log.oldValue ? (log.oldValue.length > 50 ? log.oldValue.slice(0, 50) + '...' : log.oldValue) : '（无）';
        const newPreview = log.newValue ? (log.newValue.length > 50 ? log.newValue.slice(0, 50) + '...' : log.newValue) : '（无）';
        parts.push(`- [${dateStr}] ${typeLabel} ${log.fieldName} 被修改`);
        parts.push(`  旧：${oldPreview}`);
        parts.push(`  新：${newPreview}`);
        if (log.editReason) parts.push(`  原因：${log.editReason}`);
      });
      parts.push('');
    }

    // ===== 优先级 2：writer 角色 — 使用任务书作为唯一剧情指导 =====
    if (roleKey === 'writer' && chapterContext) {
      // 写手角色：注入当前章节的上下文
      parts.push('[当前章节上下文]');
      parts.push(`当前正在创作的章节：「${chapterContext.title}」`);
      if (chapterContext.volumeTitle) parts.push(`所属卷：${chapterContext.volumeTitle}`);
      if (chapterContext.unitTitle) parts.push(`所属单元：${chapterContext.unitTitle}`);

      // 注入任务书 — 这是最重要的创作依据
      // 任务书中已包含：章节梗概、前情回顾、后续章节、相关设定、创作要求
      if (taskBrief) {
        parts.push('');
        parts.push('## ⭐ 本章任务书（唯一的创作依据，必须逐字阅读并严格遵循）');
        parts.push(taskBrief);
        parts.push('');
        parts.push('【动笔前必读】正文创作必须满足以下要求：');
        parts.push('1. 任务书中的"章节梗概"是剧情骨架。你写的所有情节都必须与梗概中的每一个情节、场景、人物行动逐一匹配并体现出来');
        parts.push('2. 梗概中提到的具体场景、人物、事件、对话要点，必须全部写入正文，不能遗漏，不能偏离，不能自行添加梗概中没有的核心情节');
        parts.push('3. 如果有"前情回顾"，正文开头必须与前文保持连贯');
        parts.push('4. 如果有"相关设定"，正文必须符合设定描述');
        parts.push('5. 不要输出任何与梗概无关的核心情节（如梗概中没有修炼突破，正文中就不能写修炼突破）');
        parts.push('');
        parts.push('【写作指令】收到用户消息后，你必须立即根据以上任务书撰写章节正文。禁止打招呼、自我介绍、复述任务书、输出计划、询问方向。直接以场景描写或动作开始正文。');
      }

      // 注入创作经验（L0-L3）
      if (experiences) {
        parts.push('');
        parts.push('## ⭐ 创作经验（必须遵守）');
        parts.push('以下是从本项目历史创作中提炼的经验，包含铁则、规范、近期经验等。在创作时必须参考这些经验。');
        parts.push(experiences);
      }

      if (!taskBrief && chapterContext.synopsis) {
        // 如果没有任务书，使用章节梗概
        parts.push('');
        parts.push(`## 章节梗概`);
        parts.push(chapterContext.synopsis);
        parts.push('');
        parts.push('请根据以上梗概撰写章节正文。直接开始写正文，不需要打招呼或解释。');
      } else {
        parts.push('');
        parts.push('请根据以上信息撰写章节正文。直接开始写正文，不需要打招呼或解释。');
      }

      return parts.join('\n');
    }

    // ===== 优先级 3：editor 角色 — 注入项目设定词条 =====
    if (roleKey === 'editor' && projectSettings && projectSettings.length > 0) {
      parts.push('[项目设定词条 — 从设定管理导入]');
      parts.push('以下是项目中已经创建好的设定词条。在讨论和创作大纲时必须参考这些设定，确保剧情与设定一致。');
      const cats = [...new Set(projectSettings.map(s => s.category))];
      cats.forEach(cat => {
        parts.push(`\n## 类目：${cat}`);
        const catSettings = projectSettings.filter(s => s.category === cat);
        catSettings.forEach(s => {
          parts.push(`### ${s.title}`);
          parts.push(s.content || '（暂无内容）');
          parts.push('');
        });
      });
      parts.push('');
    }

    // ===== 优先级 3.1：editor 角色 — 注入完整的卷/单元/章节信息 =====
    if (roleKey === 'editor' && fullOutline && fullOutline.length > 0) {
      parts.push('[已存在的完整大纲结构 — 卷/单元/章节]');
      parts.push('以下是项目中已经创建好的大纲结构。用户说"确认"时，如果对应内容已经存在，不要再重复创建。请根据已有结构继续规划后续内容。');
      parts.push('注意：方括号中的序号对应 ACTION 中的 volumeIndex/unitIndex，花括号中的 ID 用于 update 指令。');
      fullOutline.forEach((vol, i) => {
        const volIdx = i + 1;
        let volStr = `${volIdx}. 卷「${vol.title}」[volumeIndex=${volIdx}]`;
        if (vol.id) volStr += ` {id: ${vol.id.slice(0, 8)}...}`;
        if (vol.synopsis) volStr += ` — ${vol.synopsis}`;
        parts.push(volStr);
        if (vol.units) {
          vol.units.forEach((unit, j) => {
            const unitIdx = j + 1;
            let unitStr = `  ${unitIdx}. 单元「${unit.title}」[volumeIndex=${volIdx}, unitIndex=${unitIdx}]`;
            if (unit.id) unitStr += ` {id: ${unit.id.slice(0, 8)}...}`;
            if (unit.synopsis) unitStr += ` — ${unit.synopsis}`;
            parts.push(unitStr);
            if (unit.chapters) {
              unit.chapters.forEach((ch, k) => {
                const chIdx = k + 1;
                let chStr = `    ${chIdx}. 章节「${ch.title}」[volumeIndex=${volIdx}, unitIndex=${unitIdx}, chapterIndex=${chIdx}]`;
                if (ch.id) chStr += ` {id: ${ch.id.slice(0, 8)}...}`;
                if (ch.synopsis) chStr += ` — ${ch.synopsis}`;
                parts.push(chStr);
              });
            }
          });
        }
      });
      parts.push('');
      parts.push('如果用户要求创建新的卷/单元/章节，请按正常流程输出 ACTION 块。');
      parts.push('如果用户要求修改已有的卷/单元/章节，请使用 update 指令并带上对应的 id 字段。');
      parts.push('如果用户只是在已有的大纲基础上继续规划，请直接基于现有内容进行创作。');
    } else if (roleKey === 'editor' && volumes && volumes.length > 0) {
      // 回退：如果没有 fullOutline 但有 volumes 列表
      parts.push('[已存在的大纲结构]');
      parts.push('以下是项目中已经创建好的卷。用户说"确认"时，如果对应内容已经存在，不要再重复创建。');
      volumes.forEach((v, i) => {
        let volStr = `${i + 1}. 卷「${v.title}」`;
        if (v.synopsis) volStr += ` — ${v.synopsis}`;
        parts.push(volStr);
      });
      parts.push('');
      parts.push('如果用户要求创建新的卷/单元/章节，请按正常流程输出 ACTION 块。');
      parts.push('如果用户只是在已有的大纲基础上继续规划，请直接基于现有内容进行创作。');
    }

    // ===== 优先级 4：setting_editor 角色 — 注入完整大纲 =====
    if (roleKey === 'setting_editor' && fullOutline && fullOutline.length > 0) {
      parts.push('[项目大纲 — 文学编辑已创作的大纲和梗概]');
      parts.push('以下是文学编辑已经规划好的完整大纲结构，包括卷/单元/章节的标题和梗概。请在搭建设定时引用和遵循这些信息，确保设定与故事框架一致。');
      fullOutline.forEach((vol, i) => {
        let volStr = `${i + 1}. 卷「${vol.title}」`;
        if (vol.synopsis) volStr += ` — ${vol.synopsis}`;
        parts.push(volStr);
        if (vol.units) {
          vol.units.forEach((unit, j) => {
            let unitStr = `  ${j + 1}. 单元「${unit.title}」`;
            if (unit.synopsis) unitStr += ` — ${unit.synopsis}`;
            parts.push(unitStr);
            if (unit.chapters) {
              unit.chapters.forEach((ch, k) => {
                let chStr = `    ${k + 1}. 章节「${ch.title}」`;
                if (ch.synopsis) chStr += ` — ${ch.synopsis}`;
                parts.push(chStr);
              });
            }
          });
        }
      });
      parts.push('');
    }

    return parts.join('\n');
  }, [roleKey, volumes, chapterContext, taskBrief, fullOutline, storyNarrative, customContextPrompt, experiences, editLogs, projectSettings]);

  const sendMessage = useCallback(async (content: string) => {
    if (!conversationId || streaming) return;

    // Writer 角色：确保 chapterContext 已加载
    if (roleKey === 'writer' && !chapterContext) {
      console.warn('[useChat] Writer role: chapterContext not loaded yet, blocking send');
      return;
    }

    // Add user message
    const userMsg: ChatMessage = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Persist user message
      await sendMessageMut.mutateAsync({
        conversationId, role: 'user', content,
      });
    } catch (err) {
      console.error('[useChat] Failed to persist user message:', err);
    }

    // Build messages for AI (include system prompt from conversation)
    const systemPrompt = convData?.messages?.find((m: { role: string }) => m.role === 'system')?.content || '';
    const contextMsg = buildContextMessage();

    const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // writer 角色：每次发送消息时都注入章节上下文（确保 AI 能获取最新梗概）
    // setting_editor 角色：每次发送消息时都注入大纲上下文（确保 AI 能读取最新的卷梗概）
    // editor 角色：每次发送消息时都注入设定和大纲上下文（确保 AI 始终有词条信息）
    if (roleKey === 'writer' && contextMsg) {
      history.push({ role: 'system', content: contextMsg });
    } else if (roleKey === 'setting_editor' && contextMsg) {
      // setting_editor 每次都要最新大纲上下文
      history.push({ role: 'system', content: contextMsg });
    } else if (roleKey === 'editor' && contextMsg) {
      // editor 每次都要最新设定和大纲上下文
      history.push({ role: 'system', content: contextMsg });
    } else if (contextMsg && messages.length === 0) {
      history.push({ role: 'system', content: contextMsg });
    }

    // 上下文截断：防止超出模型上下文窗口（保留 system prompt + 最近 20 条消息 + 当前用户消息）
    const MAX_HISTORY_MESSAGES = 20;
    const allHistory = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    if (allHistory.length > MAX_HISTORY_MESSAGES) {
      const truncated = allHistory.slice(-MAX_HISTORY_MESSAGES);
      // 在截断处插入提示
      truncated.unshift({
        role: 'user' as const,
        content: `[提示：以下截断了更早的对话历史，请基于最新消息继续]`,
      });
      history.push(...truncated);
    } else {
      history.push(...allHistory);
    }

    // writer 角色：将任务书梗概嵌入用户消息（用户消息权重最高）
    let userMessage = content;
    if (roleKey === 'writer' && taskBrief) {
      // 从任务书中提取梗概，嵌入用户消息
      const synopsisMatch = taskBrief.match(/- 梗概：([\s\S]*?)(?=\n\n|\n##|$)/);
      const prevMatch = taskBrief.match(/## 前情回顾\n([\s\S]*?)(?=\n\n##|$)/);
      const nextMatch = taskBrief.match(/## 后续章节\n([\s\S]*?)(?=\n\n##|$)/);
      const reqMatch = taskBrief.match(/## 创作要求\n([\s\S]*?)(?=\n\n|$)/);

      userMessage = `【当前任务】${content}

【你必须遵循的剧情框架 — 章节梗概】
${synopsisMatch ? synopsisMatch[1] : '（无梗概）'}

${prevMatch ? `【前情回顾】\n${prevMatch[1]}\n` : ''}${nextMatch ? `【后续章节】\n${nextMatch[1]}\n` : ''}${reqMatch ? `【创作要求】\n${reqMatch[1]}` : ''}

【严格禁止】不要输出以上梗概中没有的情节。梗概中提到的每一个场景、人物、事件，都必须在正文中体现。`;
    }

    history.push({ role: 'user' as const, content: userMessage });

    // Stream AI response
    setStreaming(true);

    // 保存恢复状态：万一用户关闭页面，可以恢复对话
    let currentJobId = '';
    if (projectId && conversationId) {
      saveRecoveryState(projectId, {
        conversationId,
        configId,
        roleKey,
        projectId,
        lastUserMessage: content,
        messageCount: messages.length,
        timestamp: Date.now(),
      });
    }

    abortRef.current = false;
    let fullResponse = '';
    let fullThinking = '';
    let streamError: string | null = null;
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', thinking: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const platformModel = convData?.modelId ?? model;
      for await (const chunk of platformModel
        ? streamPlatformAiChat({ model: platformModel, messages: history, projectId, conversationId: conversationId ?? undefined })
        : streamAiChat({ configId, messages: history, projectId })) {
        if (abortRef.current) break;
        // 捕获 jobId 以便断线重连
        if (chunk.jobId) {
          currentJobId = chunk.jobId;
          if (projectId && conversationId) {
            saveRecoveryState(projectId, {
              conversationId,
              configId,
              roleKey,
              projectId,
              lastUserMessage: content,
              messageCount: messages.length,
              timestamp: Date.now(),
              jobId: chunk.jobId,
            });
          }
          continue;
        }
        if (chunk.error) {
          streamError = chunk.error;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${chunk.error}` };
            return copy;
          });
          break;
        }
        if (chunk.thinking) {
          fullThinking += chunk.thinking;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
          // 渠道重试信号
          if (chunk.reconnecting) {
            if (!retryTimerRef.current) {
              const startTime = Date.now();
              setRetryState({ reconnecting: true, retryCount: 1, elapsedMs: 0 });
              retryTimerRef.current = setInterval(() => {
                setRetryState(prev => prev ? { ...prev, elapsedMs: Date.now() - startTime } : null);
              }, 500);
            } else {
              setRetryState(prev => prev ? { ...prev, retryCount: (prev.retryCount || 0) + 1 } : { reconnecting: true, retryCount: 1, elapsedMs: 0 });
            }
          }
        }
        if (chunk.content) {
          fullResponse += chunk.content;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
        }
      }
    } catch (err: unknown) {
      streamError = err instanceof Error ? err.message : 'AI 调用失败';
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${streamError}` };
        return copy;
      });
    }

    // 清理重试状态
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    setRetryState(null);

    setStreaming(false);

    // Persist assistant response
    if (fullResponse) {
      // 回复成功，清除恢复状态
      if (projectId) clearRecoveryState(projectId);
      try {
        await sendMessageMut.mutateAsync({
          conversationId, role: 'assistant', content: fullResponse,
        });
      } catch (err) {
        console.error('[useChat] Failed to persist assistant response:', err);
        // UI already shows the response, so this is non-fatal
      }
    } else if (!streamError) {
      console.warn('[useChat] AI returned empty response');
      const totalContextChars = history.reduce((sum, m) => sum + m.content.length, 0);
      const estimatedTokens = Math.round(totalContextChars / 2);
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: `[错误] AI 返回了空响应（上下文约 ${estimatedTokens.toLocaleString()} tokens，可能超出模型限制）。

请尝试以下操作：
1. 点击"新对话"重新开始（已创建的大纲不会丢失）
2. 在输入框中简要描述当前需求重新发送
3. 检查 AI 配置中的模型是否支持足够长的上下文`,
        };
        return copy;
      });
    }
  }, [conversationId, streaming, messages, convData, configId, projectId, sendMessageMut, buildContextMessage, chapterContext, taskBrief, model, roleKey]);

  const confirmAction = useCallback(async (actionType: string, payload: Record<string, unknown>) => {
    if (!conversationId) {
      console.error('[useChat] confirmAction 失败: conversationId 为空');
      return;
    }
    try {
      const result = await confirmActionMut.mutateAsync({
        conversationId, actionType, payload,
      });
      const key = `${actionType}:${JSON.stringify(payload)}`;
      setConfirmedActions(prev => new Set(prev).add(key));
      try {
        await onActionConfirmed?.(result.type, result.entity);
      } catch (err) {
        console.error('[useChat] onActionConfirmed error:', err);
      }
      utils.conversation.get.invalidate({ conversationId });
      utils.conversation.list.invalidate();
    } catch (err) {
      console.error('[useChat] confirmAction 调用失败:', err);
      throw err; // 重新抛出，让 ActionCard 显示错误信息
    }
  }, [conversationId, confirmActionMut, onActionConfirmed, utils]);

  const stopStreaming = useCallback(() => { abortRef.current = true; }, []);

  // 有效模型：优先使用对话锁定的模型，其次使用传入的平台模型参数
  const effectiveModel = convData?.modelId ?? model ?? null;

  return { messages, streaming, confirmedActions, sendMessage, confirmAction, stopStreaming, recoveryState: showRecovery ? recoveryState : null, dismissRecovery, startReconnect, modelId: effectiveModel, retryState };
}
