'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { useChat } from '@/lib/use-chat';
import { GuidedFlow, type StepConfig, EDITOR_STEPS, SETTING_EDITOR_STEPS } from './guided-flow';
import { SupplementDialog } from './supplement-dialog';

// 欢迎消息映射
const WELCOME_MESSAGES: Record<string, string> = {
  editor: `你好，我是你的**文学编辑**，擅长故事构思和大纲设计。

我会引导你完成从灵感到完整大纲的创作过程：

1. **需求收集与故事骨架** — 了解核心创意，搭建世界观、主角成长线、核心冲突
2. **故事脉络** — 生成全书故事脉络总纲
3. **设定补充** — 切换到设定编辑搭建世界观和设定体系
4. **设定接收与脉络优化** — 基于设定增量修改故事脉络
5. **分卷规划** — 基于脉络和设定，逐层展开卷/单元/章节
6. **单元拆解** — 将每卷拆解为详细的单元梗概
7. **章节规划** — 为每个单元规划具体章节
8. **开始撰写正文** — 全部章节完成后，进入正文创作

我们一步一步来。首先，能否用一两句话描述一下你想写一个什么样的故事？`,

  setting_editor: `你好，我是你的**设定编辑**，负责搭建世界观和设定体系。

我会引导你逐步完成 10 个设定步骤：

1. **底层世界观** — 时代背景、社会结构、核心规则和铁则
2. **阵营势力** — 各阵营的目标、关系和冲突
3. **主角团** — 外貌、性格、背景、动机、能力
4. **反派势力** — 反派组织、目标和对抗关系
5. **成长体系** — 角色成长路径和能力边界
6. **金融体系** — 货币、物价、交易方式
7. **重要道具** — 稀有物品和关键物资
8. **重要地理** — 地图、重要地点和环境特征
9. **自定义补充** — 你还有其他想法和细节
10. **一致性复盘** — 检查所有设定的逻辑自洽

全部设定完成后，我会生成设定交付清单，并跳转到大纲页面，帮你检查并根据设定优化梗概。

我们一步一步来。**先从底层世界观开始——你希望为这个世界设定什么样的核心规则和铁则？**`,

  writer: `你好，我是你的**正文作者**，负责撰写章节正文。

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
  /** 故事脉络（用于 editor 和 setting_editor 读取故事脉络） */
  storyNarrative?: { id: string; title: string; content: string } | null;
  /** 自定义上下文提示（用于 AI 创作时传入前序内容） */
  customContextPrompt?: string;
  /** L0-L3 创作经验（供 writer 角色参考） */
  experienceContext?: string;
  /** writer 角色专用：将 AI 生成的内容保存到草稿工作台 */
  onSaveDraft?: (content: string) => void;
  /** 跳转到设定管理页面 */
  onNavigateToSettings?: () => void;
  /** 跳转到大纲页面（用于修改大纲） */
  onNavigateToOutline?: () => void;
  /** 跳转到正文创作页面（第一个没有正文的章节） */
  onNavigateToChapter?: () => void;
}

// Agent 配置映射
const AGENTS = [
  { key: 'editor', label: '文学编辑', type: 'outline' as const, icon: '📝' },
  { key: 'setting_editor', label: '设定编辑', type: 'settings' as const, icon: '🌍' },
  { key: 'writer', label: '正文作者', type: 'chapter' as const, icon: '✍️' },
];

export function ChatPanel({
  open, onClose, projectId, conversationType, roleKey: initialRoleKey,
  title, targetEntityId, targetEntityType, onActionConfirmed,
  taskBrief, fullOutline, storyNarrative, customContextPrompt, experienceContext, onSaveDraft,
  onNavigateToSettings, onNavigateToOutline, onNavigateToChapter,
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

  // 为每个 agent 独立维护 conversationId — 使用 sessionStorage 跨页面持久化
  const storageKey = `chat-conversations-${projectId}`;
  const [conversationIds, setConversationIds] = useState<Record<string, string | null>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const conversationId = conversationIds[activeAgent] ?? null;

  // 持久化 conversationIds 到 sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(conversationIds));
    } catch {
      // ignore quota errors
    }
  }, [conversationIds, storageKey]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  // 监听滚动，判断是否需要显示"回到底部"按钮
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollToBottom(el.scrollTop < el.scrollHeight - el.clientHeight - 150);
  };

  // Writer 工作流状态：pre_write → writing → post_write
  const [writerPhase, setWriterPhase] = useState<'pre_write' | 'writing' | 'post_write'>('pre_write');
  const [writerInput, setWriterInput] = useState(''); // 用户修改要求
  const [showWriterInput, setShowWriterInput] = useState(false);
  const savingDraftRef = useRef(false); // 防止重复保存草稿

  // Guided Flow 引导流状态
  const [guidedFlowVisible, setGuidedFlowVisible] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [supplementStep, setSupplementStep] = useState<StepConfig | null>(null);
  const [guidedFlowInput, setGuidedFlowInput] = useState('');

  // 文学编辑：层级式引导流程状态
  const [editorFlowPhase, setEditorFlowPhase] = useState<
    'skeleton' | 'story_narrative' | 'narrative_updated' | 'volumes' | 'ask_settings' | 'units' | 'chapters' | 'done'
  >('skeleton');
  const [volumeUnitProgress, setVolumeUnitProgress] = useState<Record<string, boolean>>({});
  const [unitChapterProgress, setUnitChapterProgress] = useState<Record<string, boolean>>({});
  const [currentVolumeForUnits, setCurrentVolumeForUnits] = useState<string | null>(null);
  const [currentUnitForChapters, setCurrentUnitForChapters] = useState<string | null>(null);

  // 阶段完成后的选择对话框
  const [phaseChoice, setPhaseChoice] = useState<{
    type: 'after_volumes' | 'after_units' | 'settings_intent' | 'all_chapters' | 'all_chapters_modify';
    message: string;
  } | null>(null);

  // 设定意图检测关键词
  const SETTINGS_KEYWORDS = ['创建设定', '补充设定', '修改设定', '世界观', '角色设定', '力量体系', '阵营', '道具', '地理', '金融体系'];

  // 余额不足弹窗状态
  const [balanceError, setBalanceError] = useState<{ provider: string; rechargeUrl: string } | null>(null);

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
  const utils = trpc.useUtils();
  const [selectedConfigId, setSelectedConfigId] = useState('');

  // Update selected config when configs load — prefer default config
  useEffect(() => {
    if (configs && configs.length > 0) {
      setSelectedConfigId(prev => {
        const exists = configs.some(c => c.id === prev);
        if (exists) return prev;
        // Prefer the config marked as default
        const defaultConfig = configs.find(c => c.isDefault);
        return defaultConfig?.id || configs[0].id;
      });
    }
  }, [configs, activeAgent]);

  // 获取项目大纲上下文
  const { data: volumeList } = trpc.project.listVolumes.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'editor' },
  );

  // 设定编辑：获取已有设定列表，用于自动推导引导步骤
  const { data: allSettingsForStep } = trpc.project.listSettings.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'setting_editor' },
  );

  // 设定编辑：根据已创建设定数量自动推导当前引导步骤
  const settingStepKeys = ['world_view', 'factions', 'protagonists', 'antagonists', 'growth_system', 'finance', 'key_items', 'key_locations', 'custom', 'consistency'];
  useEffect(() => {
    if (open && currentRoleKey === 'setting_editor' && allSettingsForStep) {
      const settingCount = allSettingsForStep.length;
      const completed = new Set<string>();
      for (let i = 0; i < settingCount && i < settingStepKeys.length; i++) {
        completed.add(settingStepKeys[i]);
      }
      setCompletedSteps(completed);
    }
  }, [open, currentRoleKey, allSettingsForStep?.length]);

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
      // 同步保存到 sessionStorage，确保跨页面导航时不丢失
      try {
        const saved = sessionStorage.getItem(storageKey);
        const ids = saved ? JSON.parse(saved) : {};
        ids[currentRoleKey] = conv!.id;
        sessionStorage.setItem(storageKey, JSON.stringify(ids));
      } catch {
        // ignore
      }
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

    // setting_editor 角色：列出所有卷梗概，告知用户已读取完毕
    if (currentRoleKey === 'setting_editor' && fullOutline && fullOutline.length > 0) {
      let volSection = `你好，我是你的**设定编辑**，负责搭建世界观和设定体系。

**我已读取文学编辑创建的完整大纲结构，共 ${fullOutline.length} 个卷：**\n`;
      fullOutline.forEach((vol, i) => {
        volSection += `\n${i + 1}. **卷「${vol.title}**」`;
        if (vol.synopsis) {
          volSection += ` — ${vol.synopsis}`;
        }
        if (vol.units && vol.units.length > 0) {
          vol.units.forEach((unit) => {
            volSection += `\n   - 单元「${unit.title}」`;
            if (unit.synopsis) volSection += ` — ${unit.synopsis}`;
            if (unit.chapters && unit.chapters.length > 0) {
              volSection += `（含 ${unit.chapters.length} 章）`;
            }
          });
        }
      });
      volSection += '\n\n---\n\n**以上全部大纲已加载。**接下来我将按 10 个步骤引导你搭建设定体系：世界观 → 阵营势力 → 主角团 → 反派势力 → 成长体系 → 金融体系 → 重要道具 → 重要地理 → 自定义补充 → 一致性复盘。\n\n全部设定完成后，我会生成设定交付清单，并跳转到大纲页面，帮你加载设定并检查、修改内容。\n\n**我们先从底层世界观开始——你希望为这个世界设定什么样的核心规则和铁则？**';
      return volSection;
    }

    if (customContextPrompt) {
      return `${base}\n\n---\n\n## 上下文信息\n${customContextPrompt}`;
    }
    // writer 角色：显示任务书内容
    if (currentRoleKey === 'writer' && taskBrief) {
      return `${base}\n\n---\n\n## 本章任务书\n${taskBrief}`;
    }
    return base;
  }, [currentRoleKey, customContextPrompt, taskBrief, fullOutline]);

  // 判断引导流是否已完成（所有步骤都已勾选）
  const isGuidedFlowComplete = useMemo(() => {
    if (currentRoleKey === 'editor') {
      return EDITOR_STEPS.every(s => completedSteps.has(s.key));
    }
    if (currentRoleKey === 'setting_editor') {
      return SETTING_EDITOR_STEPS.every(s => completedSteps.has(s.key));
    }
    return false;
  }, [currentRoleKey, completedSteps]);

  // 引导流完成后的主动询问消息
  const followUpMessage = useMemo(() => {
    if (currentRoleKey === 'editor' && isGuidedFlowComplete) {
      return '你好！之前的创作引导已完成。**文学编辑**随时可以帮你继续完善构思和大纲——要不要再聊聊？';
    }
    if (currentRoleKey === 'setting_editor' && isGuidedFlowComplete) {
      return '你好！之前的设定引导已完成。**设定编辑**随时可以帮你继续补充世界观和设定——要不要再聊聊？';
    }
    return null;
  }, [currentRoleKey, isGuidedFlowComplete]);

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

  // 引导流步骤推进逻辑 — 确认后自动发送"继续"消息给 AI
  const handleActionConfirmed = async (type: string, entity: unknown) => {
    // 原始回调透传
    onActionConfirmed?.(type, entity);

    // 确认完成后自动发送"继续"消息，让 AI 开始下一步
    const autoPrompts: Record<string, string> = {
      narrative: '好的，故事脉络已确认。接下来请前往设定管理进行设定搭建。',
      create_narrative: '好的，故事脉络已确认。接下来请前往设定管理进行设定搭建。',
      update_narrative: '好的，故事脉络已更新。现在可以开始分卷规划了。',
      volume: '好的，继续创建下一卷。',
      create_volume: '好的，继续创建下一卷。',
      unit: '好的，继续创建下一个单元。',
      create_unit: '好的，继续创建下一个单元。',
      chapter: '好的，继续创建下一章。',
      create_chapter: '好的，继续创建下一章。',
      setting: '好的，继续下一个设定。',
      create_setting: '好的，继续下一个设定。',
    };
    const prompt = autoPrompts[type];
    if (prompt && !streaming) {
      // 等数据库写入完成后再发送
      setTimeout(() => sendMessage(prompt), 300);
    }

    // 引导流步骤联动
    if (currentRoleKey === 'editor') {
      if (type === 'narrative' || type === 'create_narrative') {
        advanceStep('story_needs');
        advanceStep('story_skeleton');
        advanceStep('story_narrative');
        setEditorFlowPhase('story_narrative');
      } else if (type === 'update_narrative') {
        advanceStep('settings');
        advanceStep('settings_delivery');
        advanceStep('story_narrative');
        setEditorFlowPhase('narrative_updated');
      } else if (type === 'volume' || type === 'create_volume') {
        advanceStep('story_needs');
        advanceStep('story_skeleton');
        advanceStep('story_narrative');
        advanceStep('settings');
        advanceStep('settings_delivery');
        advanceStep('volume_plan');
        setEditorFlowPhase('volumes');
      } else if (type === 'unit' || type === 'create_unit') {
        advanceStep('unit_breakdown');
      } else if (type === 'chapter' || type === 'create_chapter') {
        advanceStep('chapter_plan');
      }
    } else if (currentRoleKey === 'setting_editor') {
      if (type === 'setting' || type === 'create_setting') {
        // 步骤由 useEffect 根据实际设定数量自动处理
      } else if (type === 'deliver_settings') {
        advanceStep('settings');
        advanceStep('settings_delivery');
      }
    }
  };

  const advanceStep = (completedKey: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(completedKey);
      return next;
    });
    // 设定编辑：弹出补充对话框
    // 文学编辑：不再弹出补充对话框，由 AI system prompt 自动引导下一步
    if (currentRoleKey === 'setting_editor') {
      const completedStep = SETTING_EDITOR_STEPS.find(s => s.key === completedKey);
      if (completedStep) {
        setSupplementStep(completedStep);
      }
    }
  };

  // 检测并引导创建缺失的单元/章节
  const checkAndCreateMissingUnits = async () => {
    if (!volumeList || volumeList.length === 0) return;
    for (const vol of volumeList) {
      const units = await utils.project.listUnits.query({ volumeId: vol.id });
      if (!units || units.length === 0) {
        // 找到第一个没有单元的卷，引导创建单元
        setCurrentVolumeForUnits(vol.id);
        setEditorFlowPhase('units');
        setGuidedFlowInput(`开始为「${vol.title}」创建单元`);
        setGuidedFlowVisible(false);
        return;
      }
    }
    // 所有卷都有单元了，进入章节阶段
    setEditorFlowPhase('chapters');
  };

  const { messages, streaming, confirmedActions, sendMessage, confirmAction, stopStreaming } = useChat({
    conversationId, configId: selectedConfigId, projectId, roleKey: currentRoleKey, onActionConfirmed: handleActionConfirmed,
    volumes: currentRoleKey === 'editor' ? volumeList : undefined,
    chapterContext: currentRoleKey === 'writer' ? chapterContext : undefined,
    taskBrief: currentRoleKey === 'writer' ? taskBrief : undefined,
    fullOutline: (currentRoleKey === 'setting_editor' || currentRoleKey === 'writer') ? fullOutline : undefined,
    storyNarrative: (currentRoleKey === 'editor' || currentRoleKey === 'setting_editor') ? storyNarrative : undefined,
    customContextPrompt: currentRoleKey === 'editor' || currentRoleKey === 'setting_editor' ? customContextPrompt : undefined,
    experiences: currentRoleKey === 'writer' ? experienceContext : undefined,
  });

  // 检测余额不足错误，弹出充值提示
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.content?.includes('[错误]')) {
      const errText = lastMsg.content.toLowerCase();
      const balanceKeywords = ['余额不足', 'insufficient', 'quota', 'credit', '余额', '充值', '欠费', 'account balance', 'not enough'];
      if (balanceKeywords.some(kw => errText.includes(kw))) {
        const currentConfig = configs?.find(c => c.id === selectedConfigId);
        if (currentConfig) {
          const providerMap: Record<string, string> = {
            longcat: 'https://longcat.chat',
            deepseek: 'https://platform.deepseek.com',
            qwen: 'https://bailian.console.aliyun.com',
          };
          setBalanceError({
            provider: currentConfig.name,
            rechargeUrl: providerMap[currentConfig.provider] || '',
          });
        }
      }
    }
  }, [messages, configs, selectedConfigId]);

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

  // 检测阶段完成消息 — 弹出选择对话框
  useEffect(() => {
    if (streaming || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant') return;
    const content = lastMsg.content || '';

    // 检测"所有卷已完成"关键词（文学编辑 — 卷阶段）
    if (currentRoleKey === 'editor' && editorFlowPhase === 'volumes') {
      if (content.includes('所有卷梗概已规划完成') || content.includes('所有卷梗概已创建完成')) {
        setPhaseChoice({
          type: 'after_volumes',
          message: content,
        });
      }
    }

    // 检测"所有单元已完成"关键词（文学编辑 — 单元阶段）
    if (currentRoleKey === 'editor' && editorFlowPhase === 'units') {
      if (content.includes('所有单元梗概已规划完成') || content.includes('所有单元已创建完成')) {
        setPhaseChoice({
          type: 'after_units',
          message: content,
        });
      }
    }

    // 检测"全部章节已完成"关键词（文学编辑 — 章节阶段）
    if (currentRoleKey === 'editor' && editorFlowPhase === 'chapters') {
      if (content.includes('全部卷、单元、章节梗概已规划完成')) {
        setPhaseChoice({
          type: 'all_chapters',
          message: content,
        });
      }
    }
  }, [messages, streaming, currentRoleKey, editorFlowPhase]);

  // 检测用户消息中的"设定"意图，弹出跳转按钮
  useEffect(() => {
    if (streaming || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'user') return;

    if (currentRoleKey === 'editor') {
      const content = lastMsg.content || '';
      if (SETTINGS_KEYWORDS.some(kw => content.includes(kw))) {
        setPhaseChoice({
          type: 'settings_intent',
          message: '检测到你想要进行设定相关操作',
        });
      }
    }
  }, [messages, streaming, currentRoleKey]);

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

  // 可拖拽调整对话框宽度
  const [dialogWidth, setDialogWidth] = useState(1024);
  const resizingRef = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // 最小化状态
  const [minimized, setMinimized] = useState(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = dialogWidth;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = ev.clientX - resizeStartX.current;
      setDialogWidth(Math.min(1400, Math.max(600, resizeStartWidth.current + dx * 2)));
    };
    const handleMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 最小化后的缩略对话框
  if (minimized) {
    return (
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50">
        <div className="bg-white rounded-l-2xl shadow-xl border border-r-0 border-gray-200 w-[200px]" style={{ height: `min(700px, calc(100vh - 80px))` }}>
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">{title || 'AI 对话'}</p>
            <p className="text-xs text-gray-400 mt-0.5">最小化中</p>
          </div>
          <div className="p-3">
            <button
              onClick={() => setMinimized(false)}
              className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
            >
              展开对话
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={handleClose} />
      {/* 居中弹窗 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-2xl shadow-2xl flex flex-col mx-4" style={{ width: `min(${dialogWidth}px, calc(100vw - 32px))`, height: `min(700px, calc(100vh - 80px))` }}>
          {/* 右侧拖拽调整手柄 */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute inset-y-0 -right-3 w-6 cursor-col-resize z-10 flex items-center justify-center group"
          >
            <div className="w-1.5 h-12 rounded-full bg-gray-400/0 group-hover:bg-gray-400 transition-colors" />
          </div>
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">{title || 'AI 对话'}</h2>
            <div className="flex items-center gap-1">
              {/* 最小化按钮 */}
              <button
                onClick={() => setMinimized(true)}
                className="p-1 text-gray-400 hover:text-gray-600 transition rounded"
                title="最小化"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              {/* 关闭按钮 */}
              <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 transition rounded">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
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
            <div className="flex flex-col flex-1 overflow-hidden relative">
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
                    <option key={c.id} value={c.id}>{c.isDefault ? '★ ' : ''}{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button onClick={handleNewConversation} className="text-xs text-gray-400 hover:text-gray-600">
              新对话
            </button>
          </div>
          {/* 引导流程步骤条 — 固定在顶部，不随消息滚动 */}
          {(currentRoleKey === 'editor' || currentRoleKey === 'setting_editor') && guidedFlowVisible && !isGuidedFlowComplete && (
            <div className="shrink-0 border-b border-gray-100 bg-gray-50/50">
              <GuidedFlow
                roleKey={currentRoleKey}
                completedSteps={completedSteps}
                currentStepKey={null}
                onStepClick={(stepKey, prompt) => {
                  setGuidedFlowInput(prompt);
                  setGuidedFlowVisible(false);
                }}
                onClose={() => setGuidedFlowVisible(false)}
              />
            </div>
          )}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* 欢迎消息 — 始终展示，无消息时显示 */}
            {messages.length === 0 && !streaming && (
              <MessageBubble role="assistant" content={welcomeMessage} />
            )}

            {/* 引导完成后的主动询问 */}
            {messages.length === 0 && !streaming && followUpMessage && (
              <MessageBubble role="assistant" content={followUpMessage} />
            )}

            {/* 阶段完成后的选择对话框 */}
            {phaseChoice?.type === 'after_volumes' && (
              <div className="mx-3 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-amber-800 mb-2">所有卷梗概已完成！</h4>
                <p className="text-xs text-gray-600 mb-3">接下来你想怎么做？</p>
                <div className="flex gap-2">
                  <button onClick={() => {
                    advanceStep('volume_plan');
                    setEditorFlowPhase('ask_settings');
                    setPhaseChoice(null);
                    onNavigateToSettings?.();
                  }} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700">
                    先补充设定 → 跳转设定管理
                  </button>
                  <button onClick={async () => {
                    advanceStep('volume_plan');
                    advanceStep('settings');
                    advanceStep('settings_delivery');
                    setEditorFlowPhase('units');
                    setPhaseChoice(null);
                    await checkAndCreateMissingUnits();
                  }} className="flex-1 py-2 border border-amber-300 rounded-lg text-xs font-medium hover:bg-amber-100">
                    跳过设定，直接进入各单元
                  </button>
                </div>
              </div>
            )}

            {phaseChoice?.type === 'after_units' && (
              <div className="mx-3 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-amber-800 mb-2">所有单元梗概已完成！</h4>
                <p className="text-xs text-gray-600 mb-3">接下来进入章节梗概规划吗？</p>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    setEditorFlowPhase('chapters');
                    setPhaseChoice(null);
                    // 引导创建第一个没有章节的单元
                    if (volumeList && volumeList.length > 0) {
                      for (const vol of volumeList) {
                        const units = await utils.project.listUnits.query({ volumeId: vol.id });
                        if (units && units.length > 0) {
                          for (const unit of units) {
                            const chapters = await utils.project.listChapters.query({ unitId: unit.id });
                            if (!chapters || chapters.length === 0) {
                              setCurrentUnitForChapters(unit.id);
                              setGuidedFlowInput(`开始为「${unit.title}」规划章节`);
                              setGuidedFlowVisible(false);
                              return;
                            }
                          }
                        }
                      }
                    }
                  }} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700">
                    进入章节规划
                  </button>
                  <button onClick={() => setPhaseChoice(null)}
                    className="flex-1 py-2 border border-amber-300 rounded-lg text-xs font-medium hover:bg-amber-100">
                    稍后再说
                  </button>
                </div>
              </div>
            )}

            {phaseChoice?.type === 'settings_intent' && (
              <div className="mx-3 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-blue-800 mb-2">跳转到设定管理</h4>
                <p className="text-xs text-gray-600 mb-3">设定编辑可以引导你一步步搭建完整的世界观和设定体系</p>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setPhaseChoice(null);
                    onNavigateToSettings?.();
                  }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    前往设定管理
                  </button>
                  <button onClick={() => setPhaseChoice(null)}
                    className="flex-1 py-2 border border-blue-300 rounded-lg text-xs font-medium hover:bg-blue-100">
                    继续在对话中补充
                  </button>
                </div>
              </div>
            )}

            {phaseChoice?.type === 'all_chapters' && (
              <div className="mx-3 mb-3 bg-green-50 border border-green-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-green-800 mb-2">全部大纲已完成！</h4>
                <p className="text-xs text-gray-600 mb-3">接下来你想怎么做？</p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => {
                      // 选择继续修改 → 弹出子选项
                      setPhaseChoice({
                        type: 'all_chapters_modify',
                        message: '选择要修改的内容',
                      });
                    }} className="flex-1 py-2 border border-green-300 rounded-lg text-xs font-medium hover:bg-green-100">
                      继续修改
                    </button>
                    <button onClick={() => {
                      setPhaseChoice(null);
                      setEditorFlowPhase('done');
                      advanceStep('chapter_plan');
                      onNavigateToChapter?.();
                    }} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                      进入正文创作 →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {phaseChoice?.type === 'all_chapters_modify' && (
              <div className="mx-3 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-blue-800 mb-2">选择要修改的内容</h4>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => {
                      setPhaseChoice(null);
                      onNavigateToOutline?.();
                    }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                      修改大纲 → 跳转大纲管理
                    </button>
                    <button onClick={() => {
                      setPhaseChoice(null);
                      onNavigateToSettings?.();
                    }} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                      修改设定 → 跳转设定管理
                    </button>
                  </div>
                  <button onClick={() => {
                    // 返回上一级
                    setPhaseChoice({
                      type: 'all_chapters',
                      message: '检测到你想要进行后续操作',
                    });
                  }} className="w-full py-2 text-xs text-gray-500 hover:text-gray-700">
                    ← 返回
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} role={msg.role as 'user' | 'assistant'}
                content={msg.content} thinking={msg.thinking}
                onConfirmAction={confirmAction}
                onActionSupplement={(actionType, payload) => {
                  const prompt = (payload as { supplementPrompt?: string }).supplementPrompt || '';
                  setGuidedFlowInput(prompt);
                  setGuidedFlowVisible(false);
                }}
                confirmedActions={confirmedActions} />
            ))}
          </div>

          {/* 快速回到底部按钮 */}
          {showScrollToBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition z-10"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

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

                      // 检查是否包含 ACTION 块
                      const hasActionBlock = aiContent.includes('[ACTION:save_version]');

                      aiContent = aiContent.replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '').trim();

                      // 如果去除 ACTION 块后为空，说明 AI 只输出了 ACTION 块（这是定稿确认后的行为）
                      // 尝试从 ACTION 块中提取 content 字段
                      if (!aiContent && hasActionBlock) {
                        const rawAiContent = messages.filter(m => m.role === 'assistant').pop()?.content || '';
                        const actionMatch = rawAiContent.match(/\[ACTION:save_version\]\s*(\{[\s\S]*?\})\s*\[\/ACTION\]/);
                        if (actionMatch) {
                          try {
                            const payload = JSON.parse(actionMatch[1]);
                            aiContent = payload.content || '';
                          } catch (e) {
                            console.error('[ChatPanel] ACTION 块 JSON 解析失败:', e);
                          }
                        }
                      }

                      if (aiContent) {
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

          <ChatInput
            onSend={(text) => {
              sendMessage(text);
              // 用户手动发送消息后，从 pre_write 进入 writing
              if (currentRoleKey === 'writer' && writerPhase === 'pre_write') {
                hasUserInitiatedSend.current = true;
                setWriterPhase('writing');
              }
            }}
            disabled={streaming || !conversationId}
            placeholder="输入消息，按 Enter 发送..."
            initialValue={guidedFlowInput}
            onInitialValueConsumed={() => setGuidedFlowInput('')}
          />
        </div>
      )}

      {/* 补充对话框 */}
      {supplementStep && (
        <SupplementDialog
          step={supplementStep}
          onSupplement={() => {
            setGuidedFlowInput(supplementStep.prompt);
            setGuidedFlowVisible(false);
            setSupplementStep(null);
          }}
          onSkip={() => {
            // 不再强制推进步骤，由 useEffect 根据实际设定数量自动处理
            setSupplementStep(null);
          }}
        />
      )}

      {/* 余额不足弹窗 */}
      {balanceError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setBalanceError(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">模型余额不足</h3>
            <p className="text-sm text-gray-600 mb-4">
              当前使用的 <span className="font-medium">{balanceError.provider}</span> 模型额度已耗尽，请前往官网充值后再继续使用。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setBalanceError(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                稍后处理
              </button>
              {balanceError.rechargeUrl && (
                <a href={balanceError.rechargeUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition text-center">
                  前往充值
                </a>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </>
  );
}
