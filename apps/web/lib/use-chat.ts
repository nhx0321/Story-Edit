// AI 对话状态管理 hook
import { useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

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
  onActionConfirmed?: (type: string, entity: unknown) => void;
  /** 已存在的卷列表，用于注入上下文 */
  volumes?: { id: string; title: string; synopsis?: string | null }[];
  /** 当前章节ID（用于 writer 角色） */
  chapterContext?: { id: string; title: string; synopsis?: string | null; unitTitle?: string; volumeTitle?: string };
  /** 任务书内容（用于 writer 角色） */
  taskBrief?: string;
  /** 完整大纲列表（用于 setting_editor 和 writer 读取文学编辑的大纲） */
  fullOutline?: { id: string; title: string; synopsis?: string | null; units?: { id: string; title: string; synopsis?: string | null; chapters?: { id: string; title: string; synopsis?: string | null }[] }[] }[];
  /** 创作进度总结（供下一章任务书调用） */
  progressSummary?: string;
  /** 自定义上下文提示（由父组件精心策划的上下文，优先级最高） */
  customContextPrompt?: string;
  /** L0-L3 创作经验（供 writer 角色参考） */
  experiences?: string;
}

export function useChat({ conversationId, configId, projectId, roleKey, onActionConfirmed, volumes, chapterContext, taskBrief, fullOutline, progressSummary, customContextPrompt, experiences }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [confirmedActions, setConfirmedActions] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);

  const utils = trpc.useUtils();
  const sendMessageMut = trpc.conversation.sendMessage.useMutation();
  const confirmActionMut = trpc.conversation.confirmAction.useMutation();

  // Load conversation history
  const { data: convData } = trpc.conversation.get.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
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

    // ===== 优先级 1：自定义上下文提示（由父组件精心策划，优先级最高） =====
    if (customContextPrompt) {
      parts.push('[创作上下文]');
      parts.push(customContextPrompt);
      return parts.join('\n');
    }

    // ===== 优先级 2：writer 角色 — 使用任务书作为唯一剧情指导 =====
    if (roleKey === 'writer' && chapterContext) {
      // 写手角色：注入当前章节的上下文
      parts.push('[当前章节上下文]');
      parts.push(`当前正在创作的章节：「${chapterContext.title}」`);
      if (chapterContext.volumeTitle) parts.push(`所属卷：${chapterContext.volumeTitle}`);
      if (chapterContext.unitTitle) parts.push(`所属单元：${chapterContext.unitTitle}`);

      // 注入创作进度（作为背景参考）
      if (progressSummary) {
        parts.push('');
        parts.push('[前情创作进度总结]');
        parts.push(progressSummary);
      }

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

    // ===== 优先级 3：editor 角色 — 注入已有的卷/单元/章节信息 =====
    if (roleKey === 'editor' && volumes && volumes.length > 0) {
      parts.push('[已存在的大纲结构]');
      parts.push('以下是项目中已经创建好的大纲结构。用户说"确认"时，如果对应内容已经存在，不要再重复创建。');
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
  }, [roleKey, volumes, chapterContext, taskBrief, fullOutline, progressSummary, customContextPrompt, experiences]);

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

    // DEBUG: 输出实际发送给 AI 的消息结构（打开浏览器控制台查看）
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('=================== [useChat DEBUG] ===================');
      console.log('[useChat] roleKey:', roleKey);
      console.log('[useChat] taskBrief 存在:', !!taskBrief);
      console.log('[useChat] taskBrief 长度:', taskBrief?.length || 0);
      if (taskBrief) {
        console.log('[useChat] taskBrief 内容:\n', taskBrief);
      }
      console.log('[useChat] contextMsg 存在:', !!contextMsg);
      console.log('[useChat] contextMsg 长度:', contextMsg?.length || 0);
      if (contextMsg && contextMsg.length > 1000) {
        console.log('[useChat] contextMsg 内容:\n', contextMsg);
      }
      console.log('[useChat] messages 数量:', messages.length);

      // 构建完整消息数组用于调试
      const debugHistory: { role: string; content: string }[] = [
        { role: 'system', content: systemPrompt },
      ];
      if (roleKey === 'writer' && contextMsg) {
        debugHistory.push({ role: 'system', content: contextMsg });
      }
      debugHistory.push(
        ...messages.map(m => ({ role: m.role as string, content: m.content })),
        { role: 'user', content },
      );
      console.log('[useChat] 发送给 AI 的完整消息数组（共', debugHistory.length, '条）:');
      debugHistory.forEach((m, i) => {
        console.log(`  [${i}] role=${m.role}, length=${m.content.length}, preview: ${m.content.slice(0, 80)}`);
      });
      console.log('=====================================================');
    }

    const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // writer 角色：每次发送消息时都注入章节上下文（确保 AI 能获取最新梗概）
    // editor 角色：仅在首次消息时注入（避免重复上下文）
    if (roleKey === 'writer' && contextMsg) {
      history.push({ role: 'system', content: contextMsg });
    } else if (contextMsg && messages.length === 0) {
      history.push({ role: 'system', content: contextMsg });
    }

    history.push(
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );

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
    abortRef.current = false;
    let fullResponse = '';
    let fullThinking = '';
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', thinking: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      for await (const chunk of streamAiChat({ configId, messages: history, projectId })) {
        if (abortRef.current) break;
        if (chunk.error) {
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
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'AI 调用失败';
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${errMsg}` };
        return copy;
      });
    }

    setStreaming(false);

    // Persist assistant response
    if (fullResponse) {
      try {
        await sendMessageMut.mutateAsync({
          conversationId, role: 'assistant', content: fullResponse,
        });
      } catch (err) {
        console.error('[useChat] Failed to persist assistant response:', err);
        // UI already shows the response, so this is non-fatal
      }
    } else {
      console.warn('[useChat] AI returned empty response');
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: '[错误] AI 返回了空响应，请检查 AI 配置和 API 连接' };
        return copy;
      });
    }
  }, [conversationId, streaming, messages, convData, configId, projectId, sendMessageMut, buildContextMessage, chapterContext, taskBrief, fullOutline, progressSummary]);

  const confirmAction = useCallback(async (actionType: string, payload: Record<string, unknown>) => {
    if (!conversationId) return;
    const result = await confirmActionMut.mutateAsync({
      conversationId, actionType, payload,
    });
    const key = `${actionType}:${JSON.stringify(payload)}`;
    setConfirmedActions(prev => new Set(prev).add(key));
    onActionConfirmed?.(result.type, result.entity);
    utils.conversation.get.invalidate({ conversationId });
    // After action confirm, also invalidate the conversation list (in case target entity changed)
    utils.conversation.list.invalidate();
  }, [conversationId, confirmActionMut, onActionConfirmed, utils]);

  const stopStreaming = useCallback(() => { abortRef.current = true; }, []);

  return { messages, streaming, confirmedActions, sendMessage, confirmAction, stopStreaming };
}
