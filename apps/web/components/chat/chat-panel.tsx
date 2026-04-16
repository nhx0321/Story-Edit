'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { SlidePanel } from '@/components/ui/slide-panel';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { useChat } from '@/lib/use-chat';

// 欢迎消息映射
const WELCOME_MESSAGES: Record<string, string> = {
  editor: `你好，我是你的**文学编辑**，擅长故事构思和大纲设计。

我会引导你完成从灵感到完整大纲的创作过程，分五步进行：

1. **需求收集** — 了解你的核心创意和故事类型
2. **故事骨架** — 搭建世界观、主角成长线、核心冲突
3. **分卷规划** — 设计分卷结构和节奏
4. **单元拆解** — 将每卷拆解为详细的单元梗概
5. **章节规划** — 为每个单元规划具体章节

我们一步一步来。首先，能否用一两句话描述一下你想写一个什么样的故事？`,

  setting_editor: `你好，我是你的**设定编辑**，擅长世界观搭建和设定体系设计。

我会引导你搭建完整的世界观和设定体系，分五步进行：

1. **底层世界观** — 设计故事的核心规则和铁则
2. **力量/成长体系** — 角色成长路径和能力边界
3. **角色设定** — 主要角色的外貌、性格、动机、能力
4. **世界细节** — 场景、道具、组织、势力等补充
5. **一致性复盘** — 通读所有设定，检查逻辑自洽

我们一步一步来。首先，能告诉我你的故事是什么类型、大致背景是什么吗？`,

  writer: `你好，我是你的**小说作者**，负责撰写章节正文。

本章梗概已加载，随时可以开始写作。

**使用方法：**
- 点击「确认并开始撰写」 → 我立即生成完整正文初稿
- 提出修改意见 → 我反复调整
- 撰写完成后 → 点击「确认并保存到草稿」将内容保存到草稿编辑器`,

  outline_writer: `你好！我是你的创作助手。让我们从大纲开始规划你的故事。

请告诉我：
- 故事的核心主题是什么？
- 你希望写多长的故事？（短篇/中篇/长篇）
- 目标读者群体是？

我会根据你的回答逐步搭建完整的故事框架。`,
};

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  conversationType: 'outline' | 'settings' | 'chapter';
  roleKey: string;
  title?: string;
  targetEntityId?: string;
  targetEntityType?: string;
  onActionConfirmed?: (type: string, entity: unknown) => void;
  /** 任务书内容 */
  taskBrief?: string;
  /** 完整大纲列表 */
  fullOutline?: { id: string; title: string; synopsis?: string | null; units?: { id: string; title: string; synopsis?: string | null; chapters?: { id: string; title: string; synopsis?: string | null }[] }[] }[];
  /** 创作进度总结 */
  progressSummary?: string;
  /** 自定义上下文提示（用于 AI 创作时传入前序内容） */
  customContextPrompt?: string;
  /** L0-L3 创作经验（供 writer 角色参考） */
  experienceContext?: string;
  /** writer 角色专用：将 AI 生成的内容保存到草稿工作台 */
  onSaveDraft?: (content: string) => void;
}

// Agent 配置映射
const AGENTS = [
  { key: 'editor', label: '文学编辑', type: 'outline' as const, icon: '📝' },
  { key: 'setting_editor', label: '设定编辑', type: 'settings' as const, icon: '🌍' },
  { key: 'writer', label: '小说作者', type: 'chapter' as const, icon: '✍️' },
];

export function ChatPanel({
  open, onClose, projectId, conversationType, roleKey: initialRoleKey,
  title, targetEntityId, targetEntityType, onActionConfirmed,
  taskBrief, fullOutline, progressSummary, customContextPrompt, experienceContext, onSaveDraft,
}: ChatPanelProps) {
  // 当前激活的 agent — 当 open 状态变化时，使用传入的 roleKey 初始化
  const [activeAgent, setActiveAgent] = useState(initialRoleKey);

  // 当 panel 重新打开且传入的 roleKey 变化时，更新 activeAgent
  useEffect(() => {
    if (open) {
      setActiveAgent(initialRoleKey);
    }
  }, [open, initialRoleKey]);
  const currentAgent = AGENTS.find(a => a.key === activeAgent) || AGENTS[0];
  const currentRoleKey = currentAgent.key;
  const currentConvType = currentAgent.type;

  // 为每个 agent 独立维护 conversationId
  const [conversationIds, setConversationIds] = useState<Record<string, string | null>>({});
  const conversationId = conversationIds[activeAgent] ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);

  // Writer 工作流状态：pre_write → writing → post_write
  const [writerPhase, setWriterPhase] = useState<'pre_write' | 'writing' | 'post_write'>('pre_write');
  const [writerInput, setWriterInput] = useState(''); // 用户修改要求
  const [showWriterInput, setShowWriterInput] = useState(false);
  const savingDraftRef = useRef(false); // 防止重复保存草稿

  // 当 agent 变化时重置 writer 状态
  useEffect(() => {
    if (activeAgent === 'writer') {
      setWriterPhase('pre_write');
      setShowWriterInput(false);
      setWriterInput('');
    }
  }, [activeAgent]);

  // 当面板重新打开时重置 writer 状态（确保每次打开都是从 pre_write 开始）
  useEffect(() => {
    if (open && activeAgent === 'writer') {
      setWriterPhase('pre_write');
      setShowWriterInput(false);
      setWriterInput('');
    }
  }, [open, activeAgent]);

  // Get user's AI configs
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: open });
  const [selectedConfigId, setSelectedConfigId] = useState('');

  // Update selected config when configs load
  useEffect(() => {
    if (configs && configs.length > 0) {
      setSelectedConfigId(prev => {
        const exists = configs.some(c => c.id === prev);
        return exists ? prev : configs[0].id;
      });
    }
  }, [configs, activeAgent]);

  // 获取项目大纲上下文
  const { data: volumeList } = trpc.project.listVolumes.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'editor' },
  );

  // 获取当前章节上下文（用于 writer 角色）— 包含卷/单元层级
  const { data: chapterData } = trpc.project.getChapter.useQuery(
    { chapterId: targetEntityId! },
    { enabled: open && currentRoleKey === 'writer' && !!targetEntityId },
  );
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'writer' && !!targetEntityId },
  );
  const chapterContext = useMemo(() => {
    if (!chapterData || !outlineTree || currentRoleKey !== 'writer') return undefined;
    // 查找当前章节所属的单元和卷
    let unitTitle: string | undefined;
    let volumeTitle: string | undefined;
    for (const vol of outlineTree) {
      const volData = vol as { id: string; title: string; units?: { id: string; title: string; chapters?: { id: string }[] }[] };
      if (volData.units) {
        for (const unit of volData.units) {
          if (unit.chapters?.some(ch => ch.id === chapterData.id)) {
            volumeTitle = vol.title;
            unitTitle = unit.title;
            break;
          }
        }
      }
      if (volumeTitle) break;
    }
    return {
      id: chapterData.id,
      title: chapterData.title,
      synopsis: chapterData.synopsis ?? null,
      unitTitle,
      volumeTitle,
    };
  }, [chapterData, outlineTree, currentRoleKey]);
  const createConv = trpc.conversation.create.useMutation({
    onSuccess: (conv) => {
      setConversationIds(prev => ({ ...prev, [currentRoleKey]: conv!.id }));
      creatingRef.current = false;
    },
    onError: () => {
      creatingRef.current = false;
    },
  });
  const { data: existingConvs } = trpc.conversation.list.useQuery(
    { projectId, type: currentConvType },
    { enabled: open, refetchOnWindowFocus: false },
  );

  const welcomeMessage = useMemo(() => {
    const base = WELCOME_MESSAGES[currentRoleKey] || '';
    if (customContextPrompt) {
      return `${base}\n\n---\n\n## 上下文信息\n${customContextPrompt}`;
    }
    // writer 角色：显示任务书内容
    if (currentRoleKey === 'writer' && taskBrief) {
      return `${base}\n\n---\n\n## 本章任务书\n${taskBrief}`;
    }
    return base;
  }, [currentRoleKey, customContextPrompt, taskBrief]);

  const updateConvTarget = trpc.conversation.updateTarget.useMutation();

  // Initialize: resume existing or create new (per agent)
  useEffect(() => {
    if (!open || conversationId || creatingRef.current) return;

    // 查找匹配当前 roleKey 的对话
    const active = existingConvs?.find(c => c.status === 'active' && c.roleKey === currentRoleKey);
    if (active) {
      setConversationIds(prev => ({ ...prev, [currentRoleKey]: active.id }));
      // 如果当前对话的 targetEntity 不匹配，更新它
      if (targetEntityId && active.targetEntityId !== targetEntityId) {
        updateConvTarget.mutate({
          conversationId: active.id,
          targetEntityId,
          targetEntityType,
        });
      }
    } else if (selectedConfigId) {
      creatingRef.current = true;
      createConv.mutate({
        projectId,
        type: currentConvType,
        title: title || `${currentConvType} 对话`,
        roleKey: currentRoleKey,
        targetEntityId,
        targetEntityType,
      });
    }
  }, [open, existingConvs, selectedConfigId, currentRoleKey, activeAgent]);

  const { messages, streaming, confirmedActions, sendMessage, confirmAction, stopStreaming } = useChat({
    conversationId, configId: selectedConfigId, projectId, roleKey: currentRoleKey, onActionConfirmed,
    volumes: currentRoleKey === 'editor' ? volumeList : undefined,
    chapterContext: currentRoleKey === 'writer' ? chapterContext : undefined,
    taskBrief: currentRoleKey === 'writer' ? taskBrief : undefined,
    fullOutline: (currentRoleKey === 'setting_editor' || currentRoleKey === 'writer') ? fullOutline : undefined,
    progressSummary: currentRoleKey === 'writer' ? progressSummary : undefined,
    customContextPrompt: currentRoleKey === 'editor' || currentRoleKey === 'setting_editor' ? customContextPrompt : undefined,
    experiences: currentRoleKey === 'writer' ? experienceContext : undefined,
  });

  // 当 streaming 结束且为 post_write 阶段时，自动从 writing 切换到 post_write
  // 只有当 AI 返回了实质性的章节正文（>800 字符，实际正文通常 3000+ 字）才切换
  const isWritingRef = useRef(false);
  const hasUserInitiatedSend = useRef(false);
  useEffect(() => {
    if (writerPhase === 'writing') {
      isWritingRef.current = true;
    }
    if (isWritingRef.current && hasUserInitiatedSend.current && writerPhase === 'writing' && !streaming && messages.length > 0) {
      const hasUserMsg = messages.some(m => m.role === 'user');
      if (hasUserMsg) {
        const lastMsg = messages[messages.length - 1];
        // 去除 ACTION 块后检查纯文本长度
        const cleanContent = (lastMsg?.content || '').replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '').trim();
        if (cleanContent.length > 800) {
          isWritingRef.current = false;
          hasUserInitiatedSend.current = false;
          setWriterPhase('post_write');
        }
      }
    }
  }, [streaming, writerPhase, messages.length]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Reset conversation when panel closes
  const handleClose = () => {
    onClose();
  };

  // New conversation for current agent
  const handleNewConversation = () => {
    setConversationIds(prev => ({ ...prev, [activeAgent]: null }));
    if (selectedConfigId && !creatingRef.current) {
      creatingRef.current = true;
      createConv.mutate({
        projectId,
        type: currentConvType,
        title: title || `${currentConvType} 对话`,
        roleKey: currentRoleKey,
        targetEntityId,
        targetEntityType,
      });
    }
  };

  const noConfig = open && configs && configs.length === 0;
  const isLoading = !conversationId && !noConfig;

  return (
    <SlidePanel open={open} onClose={handleClose} title={title || 'AI 对话'} width="w-[420px]">
      {noConfig ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-2">请先配置 AI 模型</p>
            <a href="/settings/ai" className="text-sm text-blue-600 hover:underline">前往设置</a>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-gray-400">初始化中...</p>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Agent 切换栏 */}
          <div className="flex border-b border-gray-100">
            {AGENTS.map(agent => (
              <button
                key={agent.key}
                onClick={() => setActiveAgent(agent.key)}
                className={`flex-1 py-2 text-xs font-medium transition ${
                  activeAgent === agent.key
                    ? 'border-b-2 border-gray-900 text-gray-900 bg-gray-50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {agent.label}
              </button>
            ))}
          </div>
          {/* 顶部工具栏 */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {streaming ? '思考中...' : `${messages.length} 条消息`}
              </span>
              {configs && configs.length > 1 && (
                <select value={selectedConfigId} onChange={e => setSelectedConfigId(e.target.value)}
                  className="text-xs bg-transparent text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-300">
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button onClick={handleNewConversation} className="text-xs text-gray-400 hover:text-gray-600">
              新对话
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* 欢迎消息 — 始终展示，无消息时显示 */}
            {messages.length === 0 && !streaming && (
              <MessageBubble role="assistant" content={welcomeMessage} />
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} role={msg.role as 'user' | 'assistant'}
                content={msg.content} thinking={msg.thinking}
                onConfirmAction={confirmAction}
                confirmedActions={confirmedActions} />
            ))}
          </div>

          {/* Writer 专属操作按钮 */}
          {currentRoleKey === 'writer' && (
            <div className="px-3 py-2 border-t border-gray-100">
              {/* pre_write: 初始按钮 */}
              {writerPhase === 'pre_write' && !showWriterInput && (
                <div className="flex gap-2">
                  <button onClick={() => setShowWriterInput(true)}
                    className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                    修改要求
                  </button>
                  <button onClick={() => {
                    // 确认并开始撰写：自动发送开始指令
                    hasUserInitiatedSend.current = true;
                    sendMessage('开始撰写正文');
                    setWriterPhase('writing');
                  }}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                    确认并开始撰写
                  </button>
                </div>
              )}
              {/* pre_write 阶段的输入框 */}
              {writerPhase === 'pre_write' && showWriterInput && (
                <div>
                  <input
                    type="text"
                    value={writerInput}
                    onChange={e => setWriterInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && writerInput.trim()) {
                        hasUserInitiatedSend.current = true;
                        sendMessage(writerInput);
                        setWriterInput('');
                        setShowWriterInput(false);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="请输入修改要求..."
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setShowWriterInput(false); setWriterInput(''); }}
                      className="flex-1 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition">
                      取消
                    </button>
                    <button onClick={() => {
                      if (writerInput.trim()) {
                        hasUserInitiatedSend.current = true;
                        sendMessage(writerInput);
                        setWriterInput('');
                        setShowWriterInput(false);
                      }
                    }} disabled={!writerInput.trim()}
                      className="flex-1 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50">
                      发送修改要求
                    </button>
                  </div>
                </div>
              )}
              {/* writing 阶段：撰写中指示 */}
              {writerPhase === 'writing' && (
                <div className="flex items-center gap-2 py-1">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-xs text-gray-400">AI 撰写中...</span>
                </div>
              )}
              {/* post_write: 撰写完毕按钮 */}
              {writerPhase === 'post_write' && !showWriterInput && (
                <div className="flex gap-2">
                  <button onClick={() => setShowWriterInput(true)}
                    className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                    修改内容
                  </button>
                  <button onClick={async () => {
                    // 防止重复点击
                    if (savingDraftRef.current) return;
                    savingDraftRef.current = true;

                    try {
                      // 提取最后一条 AI 消息的纯文本内容（去除 ACTION 块等标记）
                      let aiContent = messages.filter(m => m.role === 'assistant').pop()?.content || '';
                      console.log('[ChatPanel DEBUG] 提取 AI 内容, 原始长度:', aiContent.length, '前200字符:', aiContent.slice(0, 200));

                      // 检查是否包含 ACTION 块
                      const hasActionBlock = aiContent.includes('[ACTION:save_version]');
                      console.log('[ChatPanel DEBUG] 包含 ACTION 块:', hasActionBlock);

                      aiContent = aiContent.replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '').trim();
                      console.log('[ChatPanel DEBUG] 去除 ACTION 块后长度:', aiContent.length);

                      // 如果去除 ACTION 块后为空，说明 AI 只输出了 ACTION 块（这是定稿确认后的行为）
                      // 尝试从 ACTION 块中提取 content 字段
                      if (!aiContent && hasActionBlock) {
                        const rawAiContent = messages.filter(m => m.role === 'assistant').pop()?.content || '';
                        const actionMatch = rawAiContent.match(/\[ACTION:save_version\]\s*(\{[\s\S]*?\})\s*\[\/ACTION\]/);
                        if (actionMatch) {
                          try {
                            const payload = JSON.parse(actionMatch[1]);
                            aiContent = payload.content || '';
                            console.log('[ChatPanel DEBUG] 从 ACTION 块提取 content, 长度:', aiContent.length);
                          } catch (e) {
                            console.error('[ChatPanel] ACTION 块 JSON 解析失败:', e);
                          }
                        }
                      }

                      if (aiContent) {
                        console.log('[ChatPanel] 调用 onSaveDraft, 长度:', aiContent.length);
                        // 仅通过 onSaveDraft 保存，避免重复调用
                        onSaveDraft?.(aiContent);
                      } else {
                        // 如果提取失败，提示用户
                        alert('未获取到AI生成的内容，请确认AI已完成撰写。\n\nAI 回复内容：' + (messages.filter(m => m.role === 'assistant').pop()?.content || '（空）').slice(0, 200));
                      }
                    } finally {
                      // 延迟解锁，避免 React 重渲染导致的重复调用
                      setTimeout(() => { savingDraftRef.current = false; }, 500);
                    }
                  }}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                    确认并保存到草稿
                  </button>
                </div>
              )}
              {showWriterInput && writerPhase === 'post_write' && (
                <div>
                  <input
                    type="text"
                    value={writerInput}
                    onChange={e => setWriterInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && writerInput.trim()) {
                        hasUserInitiatedSend.current = true;
                        sendMessage(writerInput);
                        setWriterInput('');
                        setShowWriterInput(false);
                        setWriterPhase('writing');
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="请输入修改内容..."
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setShowWriterInput(false); setWriterInput(''); }}
                      className="flex-1 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition">
                      取消
                    </button>
                    <button onClick={() => {
                      if (writerInput.trim()) {
                        hasUserInitiatedSend.current = true;
                        sendMessage(writerInput);
                        setWriterInput('');
                        setShowWriterInput(false);
                        setWriterPhase('writing');
                      }
                    }} disabled={!writerInput.trim()}
                      className="flex-1 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50">
                      发送修改要求
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <ChatInput onSend={(text) => {
            sendMessage(text);
            // 用户手动发送消息后，从 pre_write 进入 writing
            if (currentRoleKey === 'writer' && writerPhase === 'pre_write') {
              hasUserInitiatedSend.current = true;
              setWriterPhase('writing');
            }
          }} disabled={streaming || !conversationId}
            placeholder="输入消息，按 Enter 发送..." />
        </div>
      )}
    </SlidePanel>
  );
}
