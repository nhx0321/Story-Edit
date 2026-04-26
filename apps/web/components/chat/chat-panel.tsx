'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
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

**使用方法：**
1. 在正文页面选择一个章节，点击「AI 创作」打开对话
2. 点击「确认并开始撰写」→ 我立即生成完整正文初稿
3. 提出修改意见 → 我反复调整
4. 撰写完成后 → 点击「确认并保存到草稿」将内容保存到草稿编辑器`,

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
  /** 从设定管理页面导入的设定ID列表 */
  importedSettingIds?: string[];
  /** 项目设定词条列表（供 editor 角色读取设定信息） */
  projectSettings?: { id: string; category: string; title: string; content: string }[];
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
  importedSettingIds, projectSettings,
}: ChatPanelProps) {
  // Debug: verify projectSettings is received
  useEffect(() => {
    if (initialRoleKey === 'editor') {
      console.log('[ChatPanel] editor projectSettings prop:', projectSettings ? `共${projectSettings.length}条` : 'undefined');
      if (projectSettings) {
        console.log('[ChatPanel] 类目:', [...new Set(projectSettings.map(s => s.category))]);
      }
    }
  }, [open, initialRoleKey, projectSettings]);

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
    type: 'after_volumes' | 'after_units' | 'settings_intent' | 'all_chapters' | 'all_chapters_modify' | 'import_settings' | 'import_settings_analysis' | 'start_creation';
    message: string;
  } | null>(null);

  // 层级式创作状态追踪
  const [creationLevel, setCreationLevel] = useState<'volumes' | 'units' | 'chapters' | null>(null);
  const [creationQueue, setCreationQueue] = useState<Array<{ id: string; title: string }>>([]);
  const [creationIndex, setCreationIndex] = useState(0);

  // 设定意图检测关键词
  const SETTINGS_KEYWORDS = ['创建设定', '补充设定', '修改设定', '世界观', '角色设定', '力量体系', '阵营', '道具', '地理', '金融体系'];

  // 余额不足弹窗状态
  const [balanceError, setBalanceError] = useState<{ provider: string; rechargeUrl: string; mode: 'platform' | 'provider' } | null>(null);

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
  // 获取Token账户信息（用于用量提示）
  const { data: tokenAccount } = trpc.token.getAccount.useQuery(undefined, { enabled: open });
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

  // 文学编辑：获取已有设定列表，用于检测设定完成状态
  const { data: allSettingsForEditor } = trpc.project.listSettings.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'editor' },
  );

  // 查询导入的设定数据
  const { data: importedSettingsData } = trpc.project.listSettings.useQuery(
    { projectId },
    { enabled: open && currentRoleKey === 'editor' && (importedSettingIds ?? []).length > 0 },
  );
  const actualImportedSettings = useMemo(() => {
    if (!importedSettingsData || !importedSettingIds || importedSettingIds.length === 0) return [];
    const idSet = new Set(importedSettingIds);
    return importedSettingsData.filter(s => idSet.has(s.id));
  }, [importedSettingsData, importedSettingIds]);

  // 设定编辑：设定步骤 key 与数据库 category 值的映射
  const settingStepKeys = ['world_view', 'factions', 'protagonists', 'antagonists', 'growth_system', 'finance', 'key_items', 'key_locations', 'custom', 'consistency'];
  const settingCategoryToKey: Record<string, string> = {
    '世界观': 'world_view',
    '底层世界观': 'world_view',
    '阵营势力': 'factions',
    '主角团': 'protagonists',
    '反派势力': 'antagonists',
    '成长体系': 'growth_system',
    '成长/力量体系': 'growth_system',
    '金融体系': 'finance',
    '经济体系': 'finance',
    '重要道具': 'key_items',
    '重要地理': 'key_locations',
    '自定义': 'custom',
    '一致性复盘': 'consistency',
  };

  // 根据实际项目数据自动同步引导步骤
  useEffect(() => {
    if (!open) return;

    // 设定编辑：根据已创建设定的实际数量标记步骤完成
    // 不依赖类目名匹配（AI 输出的 category 值不可控），而是按顺序推进
    if (currentRoleKey === 'setting_editor' && allSettingsForStep) {
      const completed = new Set<string>();
      const settingCount = allSettingsForStep.length;
      // 每个设定标记对应步骤为完成，最多到 consistency
      for (let i = 0; i < Math.min(settingCount, settingStepKeys.length); i++) {
        completed.add(settingStepKeys[i]);
      }
      const prevSize = completedSteps.size;
      setCompletedSteps(completed);
      if (completed.size > prevSize) {
        window.dispatchEvent(new CustomEvent('workflow-step-completed'));
      }
    }

    // 文学编辑：根据已有卷/单元/章节/脉络标记已完成的步骤
    if (currentRoleKey === 'editor' && volumeList !== undefined) {
      const completed = new Set<string>();
      const hasVolumes = volumeList.length > 0;
      if (hasVolumes) {
        completed.add('story_needs');
        completed.add('story_skeleton');
        completed.add('story_narrative');
        completed.add('settings');
        completed.add('settings_delivery');
        completed.add('volume_plan');
        // 检查是否有单元
        (async () => {
          let hasUnits = false;
          for (const vol of volumeList) {
            const units = await utils.client.project.listUnits.query({ volumeId: vol.id });
            if (units && units.length > 0) { hasUnits = true; break; }
          }
          if (hasUnits) {
            completed.add('unit_breakdown');
            // 检查是否有章节
            let hasChapters = false;
            for (const vol of volumeList) {
              const units = await utils.client.project.listUnits.query({ volumeId: vol.id });
              for (const u of (units || [])) {
                const chs = await utils.client.project.listChapters.query({ unitId: u.id });
                if (chs && chs.length > 0) { hasChapters = true; break; }
              }
              if (hasChapters) break;
            }
            if (hasChapters) completed.add('chapter_plan');
          }
          const prevSize = completedSteps.size;
          setCompletedSteps(new Set(completed));
          if (completed.size > prevSize) {
            window.dispatchEvent(new CustomEvent('workflow-step-completed'));
          }
        })();
        return;
      }
      // 没有卷时，根据设定进度标记步骤
      if (allSettingsForEditor && allSettingsForEditor.length >= settingStepKeys.length) {
        // 设定已全部完成
        completed.add('story_needs');
        completed.add('story_skeleton');
        completed.add('story_narrative');
        completed.add('settings');
        completed.add('settings_delivery');
      }
      const prevSize = completedSteps.size;
      setCompletedSteps(completed);
      if (completed.size > prevSize) {
        window.dispatchEvent(new CustomEvent('workflow-step-completed'));
      }
    }
  }, [open, currentRoleKey, allSettingsForEditor?.length, volumeList?.length]);

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

    // setting_editor 角色：优先显示故事脉络 + 大纲结构
    if (currentRoleKey === 'setting_editor') {
      let volSection = `你好，我是你的**设定编辑**，负责搭建世界观和设定体系。

`;
      // 显示故事脉络
      if (storyNarrative && storyNarrative.content) {
        volSection += `**我已读取文学编辑创建的故事脉络：**\n\n> **${storyNarrative.title}**\n${storyNarrative.content}\n`;
      } else {
        volSection += `（暂无故事脉络，请先完成文学编辑的故事脉络阶段）\n`;
      }

      // 显示大纲结构（如果有）
      if (fullOutline && fullOutline.length > 0) {
        volSection += `\n\n---\n\n**完整大纲结构（共 ${fullOutline.length} 个卷）：**\n`;
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
      }

      volSection += '\n\n---\n\n**接下来我将根据以上故事脉络，按 10 个步骤引导你搭建设定体系：世界观 → 阵营势力 → 主角团 → 反派势力 → 成长体系 → 金融体系 → 重要道具 → 重要地理 → 自定义补充 → 一致性复盘。**\n\n全部设定完成后，我会生成设定交付清单，并跳转到大纲页面，根据设定增量优化故事脉络。\n\n**我们先从底层世界观开始——根据故事脉络的框架，你希望为这个世界设定什么样的核心规则和铁则？**';

      // 如果有已创建的设定，附加到欢迎词后面
      if (customContextPrompt) {
        volSection += `\n\n---\n\n## 上下文信息\n${customContextPrompt}`;
      }
      return volSection;
    }

    // editor 角色：根据设定和大纲进度动态显示欢迎词
    if (currentRoleKey === 'editor') {
      // 设定导入：从设定管理页面选中导入
      if (actualImportedSettings.length > 0) {
        let msg = `你好，我是你的**文学编辑**。\n\n`;
        msg += `**已从设定管理页面导入以下设定条目：**\n\n`;
        actualImportedSettings.forEach(s => {
          const summary = s.content.length > 100 ? s.content.slice(0, 100) + '...' : (s.content || '（暂无内容）');
          msg += `- **[${s.category}] ${s.title}**：${summary}\n`;
        });
        msg += `\n\n请阅读以上设定条目，AI 将根据设定检测对大纲的影响范围（卷→单元→章节），并提出修改建议。\n`;
        msg += `\n**点击「根据导入设定修改梗概」开始分析。**`;
        return msg;
      }

      // 等待设定和卷数据加载完成
      if (allSettingsForEditor === undefined || volumeList === undefined) {
        return WELCOME_MESSAGES.editor;
      }

      const settingCount = allSettingsForEditor.length;
      const allSettingsDone = settingCount >= settingStepKeys.length;
      const hasVolumes = volumeList.length > 0;

      // 设定已完成但尚未开始卷创作
      if (allSettingsDone && !hasVolumes && editorFlowPhase === 'skeleton') {
        let msg = `你好，我是你的**文学编辑**。\n\n`;
        msg += `**当前进度：**\n`;
        msg += `- 故事脉络：已完成\n`;
        msg += `- 设定体系：已完成（共 ${settingCount} 个设定条目，涵盖 ${new Set(allSettingsForEditor?.map(s => s.category) || []).size} 个类目）\n`;
        msg += `- 卷梗概：尚未开始\n\n`;
        msg += `**已接收到的设定条目：**\n`;
        if (allSettingsForEditor && allSettingsForEditor.length > 0) {
          const cats = [...new Set(allSettingsForEditor.map(s => s.category))];
          for (const cat of cats) {
            msg += `---\n**【${cat}】**\n`;
            allSettingsForEditor.filter(s => s.category === cat).forEach(s => {
              const content = s.content || '（暂无内容）';
              msg += `\n**${s.title}**\n${content}\n`;
            });
            msg += '\n';
          }
        }
        msg += `以上设定均已接收完毕。接下来，我将基于这些设定，引导你完成 **卷→单元→章节** 的分层创作。\n\n**是否开始创作卷梗概？**`;
        return msg;
      }

      // 已有卷，尚在卷创作阶段
      if (hasVolumes && editorFlowPhase === 'volumes') {
        let msg = `你好，我是你的**文学编辑**。\n\n`;
        msg += `**当前进度：**\n`;
        msg += `- 故事脉络：已完成\n`;
        msg += `- 设定体系：已完成\n`;
        msg += `- 卷梗概：创作中（已创建 ${volumeList.length} 卷）\n\n`;
        msg += `我们将继续完成所有卷梗概，然后逐步深入到单元和章节。\n\n**请继续创作下一卷，或告诉我需要调整的内容。**`;
        return msg;
      }

      // 单元阶段
      if (editorFlowPhase === 'units') {
        let msg = `你好，我是你的**文学编辑**。\n\n`;
        msg += `**当前进度：**\n`;
        msg += `- 故事脉络：已完成\n`;
        msg += `- 设定体系：已完成\n`;
        msg += `- 卷梗概：已完成（共 ${volumeList?.length ?? 0} 卷）\n`;
        msg += `- 单元梗概：创作中\n\n`;
        msg += `接下来为每卷创建详细的单元梗概。\n\n**请继续创建下一个单元。**`;
        return msg;
      }

      // 章节阶段
      if (editorFlowPhase === 'chapters') {
        let msg = `你好，我是你的**文学编辑**。\n\n`;
        msg += `**当前进度：**\n`;
        msg += `- 故事脉络：已完成\n`;
        msg += `- 设定体系：已完成\n`;
        msg += `- 卷梗概：已完成\n`;
        msg += `- 单元梗概：已完成\n`;
        msg += `- 章节梗概：创作中\n\n`;
        msg += `最后为每个单元规划具体章节。\n\n**请继续创建下一章。**`;
        return msg;
      }

      // 默认欢迎词
      if (customContextPrompt) {
        return `${base}\n\n---\n\n## 上下文信息\n${customContextPrompt}`;
      }
      return base;
    }

    if (customContextPrompt) {
      return `${base}\n\n---\n\n## 上下文信息\n${customContextPrompt}`;
    }
    // writer 角色：显示任务书内容
    if (currentRoleKey === 'writer' && taskBrief) {
      return `${base}\n\n---\n\n## 本章任务书\n${taskBrief}`;
    }
    return base;
  }, [currentRoleKey, customContextPrompt, taskBrief, fullOutline, storyNarrative, allSettingsForEditor, volumeList, editorFlowPhase, actualImportedSettings]);

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
    // setting_editor 已完成时，在顶部栏显示按钮，不在此处重复提示
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
      const config = configs?.find(c => c.id === selectedConfigId);
      createConv.mutate({
        projectId,
        type: currentConvType,
        title: title || `${currentConvType} 对话`,
        roleKey: currentRoleKey,
        targetEntityId,
        targetEntityType,
        modelId: config?.defaultModel || config?.provider || undefined,
      });
    }
  }, [open, existingConvs, selectedConfigId, currentRoleKey, activeAgent, configs]);

  // 引导流步骤推进逻辑 — 确认后自动发送"继续"消息给 AI
  const handleActionConfirmed = async (type: string, entity: unknown) => {
    // 原始回调透传
    await onActionConfirmed?.(type, entity);

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
        // 确认后直接跳转到设定管理页面，不再发送自动消息
        setTimeout(() => onNavigateToSettings?.(), 500);
        return; // 跳过下面的 sendMessage 逻辑
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
      } else if (type === 'update_volume') {
        // 卷更新后：自动检查并提示该卷下的单元是否需要同步调整
        advanceStep('story_needs');
        advanceStep('story_skeleton');
        advanceStep('story_narrative');
        advanceStep('settings');
        advanceStep('settings_delivery');
        advanceStep('volume_plan');
        setEditorFlowPhase('volumes');
        // 卷修改后，检查该卷下单元
        setTimeout(() => {
          const volEntity = entity as { id?: string; title?: string };
          if (volEntity?.id && volumeList) {
            const vol = volumeList.find(v => v.id === volEntity.id);
            if (vol) {
              sendMessage(`卷「${vol.title}」已更新。请检查该卷下的所有单元梗概是否需要同步调整，并逐一输出修改建议。`);
            }
          }
        }, 600);
      } else if (type === 'update_unit') {
        // 单元更新后：自动检查并提示该单元下的章节是否需要同步调整
        advanceStep('unit_breakdown');
        setTimeout(() => {
          const unitEntity = entity as { id?: string; title?: string };
          if (unitEntity?.id) {
            (async () => {
              const chapters = await utils.client.project.listChapters.query({ unitId: unitEntity.id! });
              if (chapters && chapters.length > 0) {
                sendMessage(`单元已更新。请检查该单元下的章节梗概是否需要同步调整，并逐一输出修改建议。`);
              }
            })();
          }
        }, 600);
      } else if (type === 'update_chapter') {
        advanceStep('chapter_plan');
      }
    } else if (currentRoleKey === 'setting_editor') {
      if (type === 'setting' || type === 'create_setting') {
        // 立即根据当前引导步骤标记完成，不等待数据库查询刷新
        // 找到第一个未完成的步骤，将其标记为完成
        const nextSteps = new Set(completedSteps);
        for (const step of settingStepKeys) {
          if (!nextSteps.has(step)) {
            nextSteps.add(step);
            break;
          }
        }
        setCompletedSteps(nextSteps);
        // 同时触发数据库查询刷新，确保下次渲染时数据一致
        utils.project.listSettings.invalidate({ projectId });
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
      const units = await utils.client.project.listUnits.query({ volumeId: vol.id });
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

  const { messages, streaming, confirmedActions, sendMessage, confirmAction, stopStreaming, recoveryState, dismissRecovery, startReconnect, modelId: convModelId } = useChat({
    conversationId, configId: selectedConfigId, projectId, roleKey: currentRoleKey, onActionConfirmed: handleActionConfirmed,
    model: configs?.find(c => c.id === selectedConfigId)?.defaultModel || configs?.find(c => c.id === selectedConfigId)?.provider || undefined,
    volumes: currentRoleKey === 'editor' ? volumeList : undefined,
    chapterContext: currentRoleKey === 'writer' ? chapterContext : undefined,
    taskBrief: currentRoleKey === 'writer' ? taskBrief : undefined,
    fullOutline: (currentRoleKey === 'editor' || currentRoleKey === 'setting_editor' || currentRoleKey === 'writer') ? fullOutline : undefined,
    storyNarrative: (currentRoleKey === 'editor' || currentRoleKey === 'setting_editor') ? storyNarrative : undefined,
    customContextPrompt: currentRoleKey === 'editor' || currentRoleKey === 'setting_editor' ? customContextPrompt : undefined,
    experiences: currentRoleKey === 'writer' ? experienceContext : undefined,
    projectSettings: currentRoleKey === 'editor' ? projectSettings : undefined,
  });

  // 检测余额不足错误，弹出充值提示
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.content?.includes('[错误]')) {
      const errText = lastMsg.content;
      const balanceKeywords = ['余额不足', 'insufficient', 'quota', 'credit', '余额', '充值', '欠费', 'account balance', 'not enough'];
      if (balanceKeywords.some(kw => errText.includes(kw))) {
        // 平台Token余额不足（优先检测）
        if (errText.includes('Token余额不足') || errText.includes('平台') || errText.includes('token')) {
          setBalanceError({
            provider: '平台Token',
            rechargeUrl: '/settings/tokens/recharge',
            mode: 'platform',
          });
        } else {
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
              mode: 'provider',
            });
          }
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

  // 检测设定导入：当有 importedSettingIds 时，弹出分析提示
  useEffect(() => {
    if (!open || currentRoleKey !== 'editor') return;
    if (!importedSettingIds || importedSettingIds.length === 0) return;
    if (actualImportedSettings.length === 0) return;
    // 只在首次打开时检测
    if (messages.length > 0) return;
    setPhaseChoice({
      type: 'import_settings_analysis',
      message: `已导入 ${actualImportedSettings.length} 个设定条目，请分析影响范围。`,
    });
  }, [open, currentRoleKey, actualImportedSettings.length, messages.length]);

  // 检测设定完成：当文学编辑对话框打开，设定已全部完成但尚未开始卷创作
  useEffect(() => {
    if (!open || currentRoleKey !== 'editor') return;
    if (allSettingsForEditor === undefined || volumeList === undefined) return;
    // 只在首次打开时检测（尚无消息）
    if (messages.length > 0) return;

    const settingCount = allSettingsForEditor.length;
    const allStepsDone = settingCount >= settingStepKeys.length;
    const hasVolumes = volumeList.length > 0;
    const alreadyShown = phaseChoice?.type === 'import_settings';

    // 设定全部完成 + 尚无卷 + 尚未弹出过导入提示
    if (allStepsDone && !hasVolumes && editorFlowPhase === 'skeleton' && !alreadyShown) {
      setPhaseChoice({
        type: 'import_settings',
        message: `检测到设定已全部完成！共创建了 ${settingCount} 个设定条目。`,
      });
    }
  }, [open, currentRoleKey, allSettingsForEditor?.length, volumeList?.length, editorFlowPhase, messages.length]);

  // Reset conversation when panel closes
  const handleClose = () => {
    if (streaming && !confirm('AI 正在生成回复，关闭将中断生成。确定关闭吗？')) return;
    onClose();
  };

  // New conversation for current agent
  const handleNewConversation = () => {
    if (streaming && !confirm('AI 正在生成回复，开启新对话将中断当前生成。确定继续吗？')) return;
    if (messages.length > 0 && !streaming && !confirm('开启新对话将清空当前对话记录，确定继续吗？')) return;
    setConversationIds(prev => ({ ...prev, [activeAgent]: null }));
    if (selectedConfigId && !creatingRef.current) {
      creatingRef.current = true;
      const config = configs?.find(c => c.id === selectedConfigId);
      createConv.mutate({
        projectId,
        type: currentConvType,
        title: title || `${currentConvType} 对话`,
        roleKey: currentRoleKey,
        targetEntityId,
        targetEntityType,
        modelId: config?.defaultModel || config?.provider || undefined,
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
              {/* 尺寸切换按钮组 */}
              <div className="flex items-center border border-gray-200 rounded-md mr-2">
                {[
                  { size: 's', width: 600, label: '小' },
                  { size: 'm', width: 1024, label: '中' },
                  { size: 'l', width: 1400, label: '大' },
                ].map(opt => (
                  <button
                    key={opt.size}
                    onClick={() => setDialogWidth(opt.width)}
                    className={`px-2 py-1 text-xs transition-colors ${
                      dialogWidth === opt.width
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    } ${opt.size === 's' ? 'rounded-l-md' : opt.size === 'l' ? 'rounded-r-md' : ''}`}
                    title={`${opt.label}尺寸 (${opt.width}px)`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
              {/* 模型选择器（对话创建后锁定模型） */}
              {convModelId ? (
                <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1" title="当前对话已绑定模型，如需切换请开启新对话">
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {configs?.find(c => c.id === selectedConfigId)?.name || convModelId}
                </span>
              ) : (configs && configs.length > 1 && (
                <select value={selectedConfigId} onChange={e => setSelectedConfigId(e.target.value)}
                  className="text-xs bg-transparent text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-300">
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>{c.isDefault ? '★ ' : ''}{c.name}</option>
                  ))}
                </select>
              ))}
            </div>
            <button onClick={handleNewConversation} className="text-xs text-gray-400 hover:text-gray-600">
              新对话
            </button>
          </div>

          {/* Token用量提示条（免费用户接近限额时显示） */}
          {tokenAccount && tokenAccount.dailyUsed != null && tokenAccount.dailyLimit != null && (() => {
            const pct = tokenAccount.dailyLimit > 0 ? Math.round((tokenAccount.dailyUsed / tokenAccount.dailyLimit) * 100) : 0;
            if (pct < 50) return null; // 低于50%不显示
            return (
              <div className={`shrink-0 px-3 py-1.5 border-b text-xs flex items-center justify-between ${
                pct >= 90 ? 'bg-red-50 border-red-200' : pct >= 75 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <span className={`font-medium ${pct >= 90 ? 'text-red-700' : pct >= 75 ? 'text-amber-700' : 'text-gray-600'}`}>
                  今日Token用量：{tokenAccount.dailyUsed.toLocaleString()} / {tokenAccount.dailyLimit.toLocaleString()}（{pct}%）
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-gray-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {pct >= 90 && (
                    <a href="/settings/tokens" className="text-red-600 hover:underline font-medium">充值 →</a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 创作引导步骤条 — 固定在顶部，不随消息滚动 */}
          {(currentRoleKey === 'editor' || currentRoleKey === 'setting_editor') && guidedFlowVisible && (
            <div className="shrink-0 border-b border-gray-100 bg-gray-50/50">
              {currentRoleKey === 'setting_editor' && isGuidedFlowComplete ? (
                /* 设定编辑全部完成后显示操作按钮 */
                <div className="px-3 py-3 flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 shrink-0">创作引导</span>
                  <span className="text-xs text-green-600 shrink-0">✓ 全部步骤已完成</span>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => {
                      // 保持对话开放，用户可以继续补充设定
                      setGuidedFlowInput('我想补充一些设定');
                    }} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-200 transition text-gray-800">
                      继续自定义设定
                    </button>
                    <button onClick={() => onNavigateToOutline?.()}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition">
                      前往大纲继续创作梗概 →
                    </button>
                  </div>
                  <button onClick={() => setGuidedFlowVisible(false)}
                    className="text-gray-400 hover:text-gray-600 transition" title="关闭创作引导">×</button>
                </div>
              ) : currentRoleKey === 'editor' && (completedSteps.has('settings_delivery') || completedSteps.has('settings')) && !completedSteps.has('volume_plan') && !streaming ? (
                /* 设定已交付/已接收，显示导入设定按钮 */
                <div className="px-3 py-3 flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 shrink-0">创作引导</span>
                  <div className="flex items-center gap-1 text-xs">
                    {EDITOR_STEPS.slice(0, completedSteps.has('settings_delivery') ? 5 : 4).map((step) => (
                      <span key={step.key} className="text-green-600">✓ {step.label}</span>
                    ))}
                  </div>
                  <button onClick={() => {
                    if (!completedSteps.has('settings_delivery')) {
                      advanceStep('settings_delivery');
                    }
                    setEditorFlowPhase('volumes');
                    setTimeout(() => {
                      sendMessage('请读取项目中的全部设定词条，开始基于这些设定进行分卷规划。先创建第一卷。');
                    }, 300);
                  }} className="ml-auto px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition">
                    导入设定并开始分卷规划 →
                  </button>
                  <button onClick={() => setGuidedFlowVisible(false)}
                    className="text-gray-400 hover:text-gray-600 transition" title="关闭创作引导">×</button>
                </div>
              ) : currentRoleKey === 'editor' && completedSteps.has('volume_plan') && editorFlowPhase === 'volumes' ? (
                /* 卷规划已开始，显示导入设定快捷入口 */
                <div className="px-3 py-3 flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 shrink-0">创作引导</span>
                  <button onClick={() => {
                    setTimeout(() => {
                      sendMessage('请重新读取项目中的全部设定词条，检查当前的卷梗概是否需要根据设定进行调整。');
                    }, 300);
                  }} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition">
                    重新导入设定
                  </button>
                  <button onClick={() => setGuidedFlowVisible(false)}
                    className="text-gray-400 hover:text-gray-600 transition" title="关闭创作引导">×</button>
                </div>
              ) : (
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
              )}
            </div>
          )}
          {recoveryState && (
            <div className="mx-3 mt-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-xs text-amber-800">
                  检测到未完成的对话（{recoveryState.messageCount > 0 ? `${recoveryState.messageCount} 条消息` : '无历史消息'}）
                  {recoveryState.jobId ? ' — 可继续接收AI回复' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={dismissRecovery}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition">忽略</button>
                <button
                  onClick={() => {
                    if (recoveryState) {
                      if (recoveryState.jobId) {
                        startReconnect();
                      } else {
                        sendMessage(recoveryState.lastUserMessage);
                        dismissRecovery();
                      }
                    }
                  }}
                  className="px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-600 transition">
                  {recoveryState.jobId ? '继续接收' : '重新发送'}
                </button>
              </div>
            </div>
          )}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thick">
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
                        const units = await utils.client.project.listUnits.query({ volumeId: vol.id });
                        if (units && units.length > 0) {
                          for (const unit of units) {
                            const chapters = await utils.client.project.listChapters.query({ unitId: unit.id });
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

            {/* 设定完成后的导入提示 */}
            {phaseChoice?.type === 'import_settings' && (
              <div className="mx-3 mb-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-indigo-800 mb-2">设定已全部完成！</h4>
                <p className="text-xs text-gray-600 mb-1">
                  共创建了 {allSettingsForEditor?.length ?? 0} 个设定条目，涵盖 {new Set(allSettingsForEditor?.map(s => s.category) || []).size} 个类目。
                </p>
                <p className="text-xs text-gray-600 mb-3">是否导入这些设定，开始创作卷梗概？</p>
                <div className="flex gap-2">
                  <button onClick={() => {
                    // 导入设定：将设定内容注入到后续 AI 上下文中
                    setPhaseChoice(null);
                    setEditorFlowPhase('volumes');
                    advanceStep('story_needs');
                    advanceStep('story_skeleton');
                    advanceStep('story_narrative');
                    advanceStep('settings');
                    advanceStep('settings_delivery');
                    advanceStep('volume_plan');
                    // 自动发送导入消息
                    setTimeout(() => {
                      sendMessage('已导入全部设定。现在开始基于设定进行卷梗概创作，请先规划第一卷。');
                    }, 300);
                  }} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                    导入设定并开始创作 →
                  </button>
                  <button onClick={() => {
                    // 跳过设定，直接开始创作
                    setPhaseChoice(null);
                    setEditorFlowPhase('volumes');
                    advanceStep('story_needs');
                    advanceStep('story_skeleton');
                    advanceStep('story_narrative');
                    advanceStep('settings');
                    advanceStep('settings_delivery');
                    advanceStep('volume_plan');
                    setTimeout(() => {
                      sendMessage('开始创作卷梗概，请先规划第一卷。');
                    }, 300);
                  }} className="flex-1 py-2 border border-indigo-300 rounded-lg text-xs font-medium hover:bg-indigo-100">
                    稍后导入，先直接创作
                  </button>
                </div>
              </div>
            )}

            {/* 设定导入分析 — 从设定管理页面选中导入后弹出 */}
            {phaseChoice?.type === 'import_settings_analysis' && (
              <div className="mx-3 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-sm text-blue-800 mb-2">设定导入分析</h4>
                <p className="text-xs text-gray-600 mb-1">已导入以下设定条目：</p>
                <div className="max-h-32 overflow-y-auto mb-3 space-y-1">
                  {actualImportedSettings.map(s => (
                    <span key={s.id} className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded block">
                      [{s.category}] {s.title}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mb-3">AI 将逐一阅读每个设定，检测对大纲的影响范围（卷→单元→章节），并提出修改建议。</p>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setPhaseChoice(null);
                    setEditorFlowPhase('volumes');
                    advanceStep('story_needs');
                    advanceStep('story_skeleton');
                    advanceStep('story_narrative');
                    advanceStep('settings');
                    advanceStep('settings_delivery');
                    advanceStep('volume_plan');
                    // 发送设定导入分析请求
                    const settingList = actualImportedSettings.map(s => `[${s.category}] ${s.title}: ${s.content}`).join('\n\n');
                    setTimeout(() => {
                      sendMessage(`我已导入以下设定，请根据这些设定分析对大纲的影响范围并提出修改建议：\n\n${settingList}`);
                    }, 300);
                  }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    根据导入设定修改梗概 →
                  </button>
                  <button onClick={() => setPhaseChoice(null)}
                    className="flex-1 py-2 border border-blue-300 rounded-lg text-xs font-medium hover:bg-blue-100">
                    稍后处理
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} role={msg.role as 'user' | 'assistant'}
                content={msg.content} thinking={msg.thinking}
                isStreaming={streaming && i === messages.length - 1}
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
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-2 bg-white/95 border border-gray-300 rounded-full shadow-lg hover:bg-white hover:shadow-xl transition z-10 animate-pulse"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v14" />
              </svg>
              <span className="text-xs font-medium text-gray-600">最新对话</span>
            </button>
          )}

          {/* Writer 专属操作按钮 */}
          {currentRoleKey === 'writer' && (
            <div className="px-3 py-2 border-t border-gray-100">
              {/* 非 chapter 页面（无 onSaveDraft）：显示创作引导 + 跳转按钮 */}
              {!onSaveDraft ? (
                <div className="space-y-2">
                  {/* 章节创作进度概览 */}
                  {fullOutline && fullOutline.length > 0 && (() => {
                    let totalChapters = 0;
                    let draftChapters = 0;
                    let finalChapters = 0;
                    for (const vol of fullOutline) {
                      for (const unit of vol.units || []) {
                        for (const ch of unit.chapters || []) {
                          totalChapters++;
                          const status = (ch as { status?: string | null }).status;
                          if (status === 'draft') draftChapters++;
                          if (status === 'final') finalChapters++;
                        }
                      }
                    }
                    const completedCount = draftChapters + finalChapters;
                    return totalChapters > 0 ? (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">章节创作进度</span>
                          <span className="text-xs text-gray-400">{completedCount}/{totalChapters}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-900 rounded-full transition-all"
                            style={{ width: `${totalChapters > 0 ? (completedCount / totalChapters) * 100 : 0}%` }} />
                        </div>
                        {completedCount === 0 && (
                          <p className="text-xs text-gray-400 mt-1.5">还没有开始创作正文，点击下方按钮选择章节开始</p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">还没有创建章节，请先在大纲中规划章节结构</p>
                      </div>
                    );
                  })()}
                  <button onClick={() => onNavigateToChapter?.()}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition flex items-center justify-center gap-1.5">
                    前往正文创作
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              ) : (
              <>
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
              {/* writing 阶段：撰写中指示（滚动随机提示） */}
              {writerPhase === 'writing' && (
                <WritingStatus />
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
                        // 保存成功后关闭对话框，引导用户在草稿编辑器操作
                        onClose();
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
              </>
              )}
            </div>
          )}

          {/* 快捷操作栏 — 当 AI 最后一条消息是引导性问题时显示 */}
          {!streaming && conversationId && (() => {
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
            const isQuestion = lastAssistant?.content?.trim().endsWith('？') || lastAssistant?.content?.trim().endsWith('?');
            if (!isQuestion) return null;

            // 根据 roleKey 动态渲染快捷操作按钮
            const renderQuickActions = () => {
              // 设定编辑 (setting_editor) 特殊按钮
              if (currentRoleKey === 'setting_editor') {
                return (
                  <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => {
                        onNavigateToOutline?.();
                      }}
                      className="flex-1 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 transition"
                    >
                      将设定导入大纲创作梗概
                    </button>
                    <button
                      onClick={() => {
                        sendMessage('继续自定义设定');
                      }}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium hover:bg-gray-200 transition"
                    >
                      继续自定义设定
                    </button>
                  </div>
                );
              }

              // 正文作者 (writer) 特殊按钮
              if (currentRoleKey === 'writer') {
                return (
                  <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => {
                        onNavigateToChapter?.();
                      }}
                      className="flex-1 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 transition"
                    >
                      前往正文创作
                    </button>
                    <button
                      onClick={() => {
                        setGuidedFlowInput('请帮我修改：');
                      }}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium hover:bg-gray-200 transition"
                    >
                      需要修改
                    </button>
                  </div>
                );
              }

              // 默认（文学编辑等）：确认并继续 / 需要修改
              return (
                <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => sendMessage('确认并继续')}
                    className="flex-1 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 transition"
                  >
                    确认并继续
                  </button>
                  <button
                    onClick={() => {
                      setGuidedFlowInput('请帮我修改：');
                    }}
                    className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium hover:bg-gray-200 transition"
                  >
                    需要修改
                  </button>
                </div>
              );
            };

            return renderQuickActions();
          })()}

          {/* 状态栏：显示当前工作流进度和导航提示 */}
          <WorkflowStatusBar
            streaming={streaming}
            currentRoleKey={currentRoleKey}
            guidedFlowVisible={guidedFlowVisible}
            completedSteps={completedSteps}
            editorFlowPhase={editorFlowPhase}
            isGuidedFlowComplete={isGuidedFlowComplete}
            onNavigateToSettings={onNavigateToSettings}
            onNavigateToOutline={onNavigateToOutline}
            onNavigateToChapter={onNavigateToChapter}
          />

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
            placeholder={(() => {
              // 根据最后一条 AI 消息动态提示用户操作
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              if (lastAssistant?.content?.trim().endsWith('？') || lastAssistant?.content?.trim().endsWith('?')) {
                return '点击上方按钮确认或输入修改要求...';
              }
              return '输入消息，按 Enter 发送...';
            })()}
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
            <h3 className="text-lg font-bold mb-3">
              {balanceError.mode === 'platform' ? 'Token余额不足' : '模型余额不足'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {balanceError.mode === 'platform' ? (
                <>您的平台Token余额已不足，请充值后继续使用AI服务。</>
              ) : (
                <>当前使用的 <span className="font-medium">{balanceError.provider}</span> 模型额度已耗尽，请前往官网充值后再继续使用。</>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setBalanceError(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                稍后处理
              </button>
              {balanceError.rechargeUrl && (
                balanceError.mode === 'platform' ? (
                  <Link href={balanceError.rechargeUrl}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition text-center">
                    前往充值
                  </Link>
                ) : (
                  <a href={balanceError.rechargeUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition text-center">
                    前往充值
                  </a>
                )
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

// ========== 工作流状态栏 ==========
function WorkflowStatusBar({
  streaming,
  currentRoleKey,
  guidedFlowVisible,
  completedSteps,
  editorFlowPhase,
  isGuidedFlowComplete,
  onNavigateToSettings,
  onNavigateToOutline,
  onNavigateToChapter,
}: {
  streaming: boolean;
  currentRoleKey: string;
  guidedFlowVisible: boolean;
  completedSteps: Set<string>;
  editorFlowPhase: string;
  isGuidedFlowComplete: boolean;
  onNavigateToSettings?: () => void;
  onNavigateToOutline?: () => void;
  onNavigateToChapter?: () => void;
}) {
  // 流式输出中 — 显示当前状态
  if (streaming) {
    return (
      <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">AI 正在生成回复...</span>
        </div>
      </div>
    );
  }

  // 引导流显示但未完成 — 显示当前阶段提示
  if (guidedFlowVisible && !isGuidedFlowComplete) {
    const stepCount = completedSteps.size;
    const roleLabel = currentRoleKey === 'editor' ? '文学编辑' : '设定编辑';
    const totalSteps = currentRoleKey === 'editor' ? 7 : 10;
    return (
      <div className="px-3 py-1.5 border-t border-gray-100 bg-amber-50/50">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-600">{roleLabel}引导中</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">步骤 {stepCount}/{totalSteps}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">跟随 AI 引导逐步完成</span>
        </div>
      </div>
    );
  }

  // 引导流完成 — 显示导航提示
  if (isGuidedFlowComplete && currentRoleKey === 'setting_editor' && onNavigateToOutline) {
    return (
      <div className="px-3 py-1.5 border-t border-gray-100 bg-green-50/50">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-600">✓ 设定已全部完成</span>
          <span className="text-gray-300">·</span>
          <button onClick={onNavigateToOutline} className="text-gray-900 font-medium hover:underline">
            前往大纲继续创作梗概 →
          </button>
        </div>
      </div>
    );
  }

  if (isGuidedFlowComplete && currentRoleKey === 'editor' && editorFlowPhase === 'done' && onNavigateToChapter) {
    return (
      <div className="px-3 py-1.5 border-t border-gray-100 bg-green-50/50">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-600">✓ 大纲创作已完成</span>
          <span className="text-gray-300">·</span>
          <button onClick={onNavigateToChapter} className="text-gray-900 font-medium hover:underline">
            前往正文创作 →
          </button>
        </div>
      </div>
    );
  }

  // 默认：无状态栏
  return null;
}

// ========== AI 撰写中滚动状态提示 ==========
const WRITING_TIPS = [
  '正在构思开头...',
  '组织人物对话...',
  '描写场景细节...',
  '推进剧情发展...',
  '调整节奏结构...',
  '润色文字表达...',
  '检查设定一致性...',
  '埋设伏笔...',
  '营造氛围...',
  '打磨人物心理...',
];

function WritingStatus() {
  const [tipIndex, setTipIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % WRITING_TIPS.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      <span className={`text-xs text-gray-400 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {WRITING_TIPS[tipIndex]}
      </span>
    </div>
  );
}
