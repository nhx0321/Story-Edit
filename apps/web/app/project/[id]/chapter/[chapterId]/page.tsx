'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';
import { StoryEditor } from '@/components/editor/story-editor';
import { VersionPanel } from '@/components/version/version-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ExperiencePanel } from '@/components/experience/experience-panel';
import { AiModifyDialog, ModificationItem } from '@/components/modify/ai-modify-dialog';

type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error';
type WorkflowStep = 'brief' | 'write' | 'check' | 'finalize';

export default function ChapterEditorPage({ params }: { params: { id: string; chapterId: string } }) {
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');

  // Workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('brief');
  const [briefConfirmed, setBriefConfirmed] = useState(false);
  const [editableBrief, setEditableBrief] = useState('');
  const [selfCheckReport, setSelfCheckReport] = useState<string | null>(null);
  const [selfCheckGenerating, setSelfCheckGenerating] = useState(false);
  const [showChapterSummary, setShowChapterSummary] = useState(false);
  const [progressSummary, setProgressSummary] = useState('');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [summarySaving, setSummarySaving] = useState(false);

  // 任务书保存状态
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefSavingError, setBriefSavingError] = useState<string | null>(null);
  const [briefVersionCount, setBriefVersionCount] = useState<number | null>(null);

  // 设定检测跳转
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const [missingSettingsList, setMissingSettingsList] = useState<string[]>([]);

  // 草稿版本超限弹窗
  const [showDraftLimitModal, setShowDraftLimitModal] = useState(false);
  const [pendingDraftContent, setPendingDraftContent] = useState<string | null>(null);
  const [draftVersions, setDraftVersions] = useState<Array<{ id: string; versionNumber: number; label: string | null; createdAt: Date }>>([]);

  // 任务书版本超限弹窗
  const [showBriefLimitModal, setShowBriefLimitModal] = useState(false);
  const [pendingBriefContent, setPendingBriefContent] = useState<string | null>(null);
  const [briefVersionsList, setBriefVersionsList] = useState<Array<{ id: string; versionNumber: number; label: string | null; createdAt: Date }>>([]);

  // 定稿经验分析弹窗
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [analysisGenerating, setAnalysisGenerating] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [proposedExperiences, setProposedExperiences] = useState<Array<{ level: 'L0' | 'L1' | 'L2' | 'L3'; category: string; content: string; selected: boolean }>>([]);
  const [experienceSaved, setExperienceSaved] = useState(false);

  // AI 修改对话框
  const [aiModifyOpen, setAiModifyOpen] = useState(false);

  // 加载章节数据
  const { data: chapter, isLoading } = trpc.project.getChapter.useQuery({ chapterId: params.chapterId });

  // 加载任务书
  const { data: taskBrief, isLoading: briefLoading } = trpc.workflow.generateTaskBrief.useQuery(
    { chapterId: params.chapterId },
    { enabled: true },
  );

  // 加载完整大纲树（用于 AI 创作上下文）
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId: params.id },
    { enabled: chatOpen },
  );

  // 加载创作经验
  const { data: chapterExperiences } = trpc.workflow.getChapterExperiences.useQuery(
    { projectId: params.id },
    { enabled: chatOpen },
  );

  // 加载 L0-L3 经验供 AI 创作使用
  const { data: experienceForWriter } = trpc.workflow.getMemoriesForWriter.useQuery(
    { projectId: params.id },
    { enabled: chatOpen },
  );

  // AI 配置（用于自检）
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined);

  const saveVersion = trpc.project.saveChapterVersion.useMutation({
    onSuccess: () => setSaveStatus('saved'),
    onError: () => setSaveStatus('error'),
  });
  // 任务书保存 — 使用独立 mutation 避免与草稿保存冲突
  const saveBriefVersion = trpc.project.saveChapterVersion.useMutation();
  const utils = trpc.useUtils();

  // 任务书版本列表
  const { data: briefVersions } = trpc.project.listChapterVersions.useQuery(
    { chapterId: params.chapterId, versionType: 'task_brief' },
    { enabled: workflowStep === 'brief' },
  );

  // 草稿版本列表（用于超限检查和显示）
  const { data: draftVersionsData } = trpc.project.listChapterVersions.useQuery(
    { chapterId: params.chapterId, versionType: 'draft' },
    { enabled: true },
  );

  const confirmBriefLabel = trpc.project.updateVersionLabel.useMutation();
  const deleteVersion = trpc.project.deleteChapterVersion.useMutation();
  const restoreVersion = trpc.project.restoreDeletedVersion.useMutation();

  const finalizeChapter = trpc.workflow.saveChapterContent.useMutation({
    onSuccess: () => {
      utils.project.getChapter.invalidate({ chapterId: params.chapterId });
      utils.workflow.getChapterVersions.invalidate({ chapterId: params.chapterId });
    },
  });

  const saveChapterExperience = trpc.workflow.saveChapterExperience.useMutation();

  const saveAnalysisExperiences = trpc.workflow.saveAnalysisResults.useMutation();

  // ===== 定稿分析：保存经验 =====
  const handleSaveAnalysisExperiences = async () => {
    const selectedExperiences = proposedExperiences.filter(e => e.selected);
    if (selectedExperiences.length === 0) {
      setShowFinalizeModal(false);
      return;
    }
    try {
      await saveAnalysisExperiences.mutateAsync({
        projectId: params.id,
        chapterId: params.chapterId,
        entries: selectedExperiences.map(e => ({ level: e.level, category: e.category, content: e.content })),
      });
      utils.workflow.getMemoriesForWriter.invalidate({ projectId: params.id });
      setExperienceSaved(true);
    } catch (e: any) {
      alert('保存经验失败：' + (e?.message || '未知错误'));
    }
  };

  // ===== 定稿分析：关闭（不保存） =====
  const handleCloseAnalysis = () => {
    setProposedExperiences([]);
    setExperienceSaved(true);
  };

  // 初始化编辑器内容
  useEffect(() => {
    if (chapter?.latestContent && !initialContent) {
      setInitialContent(chapter.latestContent);
      setContent(chapter.latestContent);
      contentRef.current = chapter.latestContent;
    }
  }, [chapter, initialContent]);

  // 任务书加载后设置（每次数据更新都同步）
  useEffect(() => {
    if (taskBrief?.brief) {
      setEditableBrief(taskBrief.brief);
      setBriefConfirmed(false); // 新数据加载后需重新确认
    }
  }, [taskBrief?.brief]);

  // AI 生成内容加载 — 由 onSaveDraft 回调触发并自动保存
  const loadAiContent = useCallback(async (html: string) => {
    setInitialContent(html);
    setContent(html);
    contentRef.current = html;
    setSaveStatus('saving');
    try {
      // 自动保存 AI 生成的内容为草稿版本
      await saveVersion.mutateAsync({ chapterId: params.chapterId, content: html, isFinal: false, versionType: 'draft' });
      setSaveStatus('saved');
    } catch (e: any) {
      const msg = e?.message || e?.data?.message || (typeof e === 'string' ? e : '保存失败');
      console.error('[AI内容保存失败]', e);
      if (msg.includes('已达上限')) {
        // 版本超限，弹窗提示
        setPendingDraftContent(html);
        const versions = await utils.client.project.listChapterVersions.query({ chapterId: params.chapterId, versionType: 'draft' });
        if (versions) setDraftVersions(versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, label: v.label, createdAt: new Date(v.createdAt) })).reverse());
        setShowDraftLimitModal(true);
      } else {
        alert(`AI内容保存到草稿失败：${msg}`);
      }
      setSaveStatus('error');
    }
  }, [params.chapterId, saveVersion, utils]);

  // 自动保存（防抖 3 秒）
  const scheduleAutoSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const c = contentRef.current;
      if (c && c !== '<p></p>') {
        setSaveStatus('saving');
        saveVersion.mutate({ chapterId: params.chapterId, content: c, isFinal: false, versionType: 'draft' });
      }
    }, 3000);
  }, [params.chapterId, saveVersion]);

  const handleChange = (html: string) => {
    setContent(html);
    contentRef.current = html;
    setSaveStatus('editing');
    scheduleAutoSave();
  };

  const handleFinalize = async () => {
    if (!content || content === '<p></p>') return;

    // 1. 获取最新草稿版本
    const drafts = await utils.client.project.listChapterVersions.query({ chapterId: params.chapterId, versionType: 'draft' });
    const latestDraft = drafts?.[0]; // 按 versionNumber 倒序，第一个是最新

    // 2. 对比草稿与当前正文（纯文本对比）
    const draftPlain = latestDraft ? latestDraft.content.replace(/<[^>]*>/g, '').replace(/\s/g, '') : '';
    const currentPlain = content.replace(/<[^>]*>/g, '').replace(/\s/g, '');

    if (!latestDraft || draftPlain === currentPlain) {
      // 没有草稿或草稿与正文相同
      if (latestDraft) {
        if (!confirm('定稿内容与最新草稿完全一致，没有做任何修改。仍要定稿吗？')) return;
      }
      // 直接定稿
      const wc = currentPlain.length;
      await finalizeChapter.mutateAsync({
        chapterId: params.chapterId,
        content,
        isFinal: true,
        wordCount: wc,
      });
      setSaveStatus('saved');
      return;
    }

    // 3. 有修改，弹出定稿确认
    if (!confirm('确认将当前正文定稿？定稿后将自动对比草稿生成经验总结。')) return;

    // 4. 先定稿
    const wc = currentPlain.length;
    await finalizeChapter.mutateAsync({
      chapterId: params.chapterId,
      content,
      isFinal: true,
      wordCount: wc,
    });
    setSaveStatus('saved');

    // 5. 定稿成功后，AI 分析草稿 vs 定稿差异
    setFinalizing(true);
    setAnalysisGenerating(true);
    setAnalysisResult('');
    setShowFinalizeModal(true);

    try {
      const draftContent = latestDraft.content;
      const finalContent = content;

      const prompt = `以下是同一章节的草稿和定稿版本。请分析两者的差异，并提炼 1-4 条创作经验。

## 草稿内容
${draftContent.slice(0, 10000)}

## 定稿内容
${finalContent.slice(0, 10000)}

请按以下格式输出，每条经验占一段，不要输出多余文字：

[Lx]【分类】经验标题
经验内容描述

等级说明：
- L0 = 核心创作铁律（每章创作前AI必读，必做/必不做的硬性要求）
- L1 = 项目特色要求（风格特色，要求AI贯彻）
- L2 = 近三章重点/常犯问题（本次修改中需注意和规避的）
- L3 = 修改对比经验示例（草稿与定稿对比总结，供参考）

分类建议：逻辑连贯、节奏把控、人物塑造、伏笔呼应、文字精炼、场景描写、情绪渲染、情节推进等。

注意：只输出 1-4 条最有价值的经验，每条不超过35字，简洁精炼。`;

      if (!configs || configs.length === 0) {
        setAnalysisResult('请先配置 AI 模型');
        setAnalysisGenerating(false);
        return;
      }

      const systemMsg = { role: 'system' as const, content: '你是一名资深文学编辑，擅长分析稿件修改质量并提炼创作经验。请对比草稿和定稿，提炼有价值的创作经验。' };
      const userMsg = { role: 'user' as const, content: prompt };

      let fullResult = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId: params.id,
      })) {
        if (chunk.error) {
          setAnalysisResult(`分析出错：${chunk.error}`);
          setAnalysisGenerating(false);
          return;
        }
        if (chunk.content) {
          fullResult += chunk.content;
          setAnalysisResult(fullResult);
        }
      }

      if (!fullResult) {
        setAnalysisResult('AI 未返回分析结果');
        setAnalysisGenerating(false);
        return;
      }

      // 解析 AI 返回的经验条目
      const parsed = parseExperienceEntries(fullResult);
      setProposedExperiences(parsed);
    } catch {
      setAnalysisResult('分析失败，请检查网络连接');
    }
    setAnalysisGenerating(false);
  };

  // 解析 AI 返回的经验文本为结构化条目
  function parseExperienceEntries(text: string): Array<{ level: 'L0' | 'L1' | 'L2' | 'L3'; category: string; content: string; selected: boolean }> {
    const entries: Array<{ level: 'L0' | 'L1' | 'L2' | 'L3'; category: string; content: string; selected: boolean }> = [];
    // 匹配 [Lx]【分类】标题\n内容 格式
    const regex = /\[L([0-3])\]\s*【(.+?)】\s*(.+?)\n(.+?)(?=\n\[L[0-3]\]|$)/gs;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const levelNum = match[1];
      const level = `L${levelNum}` as 'L0' | 'L1' | 'L2' | 'L3';
      const category = match[2].trim();
      const title = match[3].trim();
      const desc = match[4].trim();
      entries.push({ level, category, content: `${title}\n${desc}`, selected: true });
    }
    // 如果正则没匹配到，尝试更宽松的匹配
    if (entries.length === 0) {
      const looseRegex = /\[L([0-3])\]\s*(.+?)(?=\n\[L[0-3]\]|$)/gs;
      while ((match = looseRegex.exec(text)) !== null) {
        const levelNum = match[1];
        const level = `L${levelNum}` as 'L0' | 'L1' | 'L2' | 'L3';
        const fullContent = match[2].trim();
        // 尝试从内容中提取分类（如果有【】或[]）
        const catMatch = fullContent.match(/^【(.+?)】\s*(.+)/s);
        if (catMatch) {
          entries.push({ level, category: catMatch[1].trim(), content: catMatch[2].trim(), selected: true });
        } else {
          entries.push({ level, category: '创作经验', content: fullContent, selected: true });
        }
      }
    }
    return entries.slice(0, 4); // 最多 4 条
  };

  const handleSaveSummary = async () => {
    setSummarySaving(true);
    await saveChapterExperience.mutateAsync({
      projectId: params.id,
      chapterId: params.chapterId,
      progressSummary,
      experienceSummary,
    });
    setSummarySaving(false);
    setShowChapterSummary(false);
  };

  const handleSelfCheck = async () => {
    if (!configs || configs.length === 0) {
      setSelfCheckReport('请先配置 AI 模型');
      return;
    }
    const latestContent = content || '';
    if (!latestContent || latestContent === '<p></p>') {
      setSelfCheckReport('暂无正文内容，无法自检');
      return;
    }
    setSelfCheckGenerating(true);
    setSelfCheckReport('');
    try {
      const checkPrompt = taskBrief?.checkPrompt || `请对以下正文进行自检：\n\n${latestContent.slice(0, 8000)}`;
      const systemMsg = { role: 'system' as const, content: '你是一名专业的文学编辑和质量审核员。请对小说正文进行全面的自检，找出需要修改的问题。输出格式清晰的自检报告。' };
      const userMsg = { role: 'user' as const, content: checkPrompt };
      let fullReport = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId: params.id,
      })) {
        if (chunk.error) {
          setSelfCheckReport(`自检出错：${chunk.error}`);
          break;
        }
        if (chunk.content) {
          fullReport += chunk.content;
          setSelfCheckReport(fullReport);
        }
      }
      if (!fullReport) {
        setSelfCheckReport('自检完成，未发现问题');
      }
    } catch {
      setSelfCheckReport('自检失败，请检查网络连接');
    }
    setSelfCheckGenerating(false);
  };

  // AI 修改：应用修改后的内容
  const handleApplyAiModify = (newContent: string, modifications: ModificationItem[]) => {
    // 将修改后的内容设置为当前编辑器内容
    const html = newContent.includes('<') ? newContent : `<p>${newContent}</p>`;
    setContent(html);
    setInitialContent(html);
    contentRef.current = html;
    setSaveStatus('editing');
    setAiModifyOpen(false);
    alert(`修改已应用，共 ${modifications.filter(m => m.status === 'accepted').length} 条通过，${modifications.filter(m => m.status === 'rewriting').length} 条重写。记得保存。`);
  };

  // AI 修改：打开对话框
  const handleOpenAiModify = () => {
    if (!content || content === '<p></p>') {
      alert('当前正文内容为空，请先撰写或保存内容后再进行 AI 修改。');
      return;
    }
    setAiModifyOpen(true);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // 初始化预设经验（页面首次加载时）
  const seedDefaultsRef = useRef(false);
  const seedDefaults = trpc.workflow.seedDefaultExperiences.useMutation();
  useEffect(() => {
    if (!seedDefaultsRef.current && params.id) {
      seedDefaultsRef.current = true;
      seedDefaults.mutate({ projectId: params.id });
    }
  }, [params.id, seedDefaults]);

  const wordCount = content.replace(/<[^>]*>/g, '').replace(/\s/g, '').length;

  const statusText = {
    idle: '无变更',
    editing: '编辑中...',
    saving: '保存中...',
    saved: '已保存',
    error: '保存失败',
  }[saveStatus];

  const statusColor = {
    idle: 'text-gray-400',
    editing: 'text-yellow-500',
    saving: 'text-blue-500',
    saved: 'text-green-600',
    error: 'text-red-600',
  }[saveStatus];

  const handleLoadVersion = (html: string) => {
    setInitialContent(html);
    setContent(html);
    contentRef.current = html;
    setSaveStatus('idle');
  };

  // ===== 任务书保存 =====
  const handleSaveBrief = async () => {
    if (!editableBrief) return;
    setBriefSaving(true);
    setBriefSavingError(null);
    try {
      await saveBriefVersion.mutateAsync({
        chapterId: params.chapterId,
        content: editableBrief,
        isFinal: false,
        versionType: 'task_brief',
      });
      await utils.project.listChapterVersions.invalidate({ chapterId: params.chapterId, versionType: 'task_brief' });
    } catch (e: any) {
      console.error('[任务书保存失败]', e);
      const msg = e?.message || e?.data?.message || (typeof e === 'string' ? e : '保存失败');
      // 版本超限时，弹窗提示
      if (msg.includes('已达上限')) {
        setPendingBriefContent(editableBrief);
        const versions = await utils.client.project.listChapterVersions.query({ chapterId: params.chapterId, versionType: 'task_brief' });
        if (versions) setBriefVersionsList(versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, label: v.label, createdAt: new Date(v.createdAt) })).reverse());
        setShowBriefLimitModal(true);
      } else {
        setBriefSavingError(msg);
      }
      setBriefSaving(false);
      return;
    }
    setBriefSaving(false);
  };

  // ===== 任务书确认 =====
  const handleConfirmBrief = async () => {
    // 先保存当前编辑内容
    if (editableBrief) {
      setBriefSaving(true);
      try {
        await saveBriefVersion.mutateAsync({
          chapterId: params.chapterId,
          content: editableBrief,
          isFinal: false,
          versionType: 'task_brief',
        });
        await utils.project.listChapterVersions.invalidate({ chapterId: params.chapterId, versionType: 'task_brief' });
      } catch (e: any) {
        console.error('[任务书确认失败]', e);
        const msg = e?.message || (e?.data?.message) || (typeof e === 'string' ? e : '保存失败');
        if (msg.includes('已达上限')) {
          setPendingBriefContent(editableBrief);
          const versions = await utils.client.project.listChapterVersions.query({ chapterId: params.chapterId, versionType: 'task_brief' });
          if (versions) setBriefVersionsList(versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, label: v.label, createdAt: new Date(v.createdAt) })).reverse());
          setShowBriefLimitModal(true);
          setBriefSaving(false);
          return;
        }
        setBriefSavingError(msg);
        setBriefSaving(false);
        return;
      }
      setBriefSaving(false);
    }

    // 设定检测：如有缺失设定，弹出跳转提示
    if (taskBrief?.missingSettings && taskBrief.missingSettings.length > 0) {
      setMissingSettingsList(taskBrief.missingSettings);
      setShowSettingsPrompt(true);
      return;
    }

    // 确认并进入创作
    setBriefConfirmed(true);
    setWorkflowStep('write');
    setChatOpen(true);
  };

  // ===== 设定检测跳转：跳过 =====
  const handleSkipSettings = () => {
    setShowSettingsPrompt(false);
    setBriefConfirmed(true);
    setWorkflowStep('write');
    setChatOpen(true);
  };

  // ===== 草稿保存（带版本超限检查） =====
  const handleSaveWithLimit = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const c = contentRef.current;
    if (!c || c === '<p></p>') return;

    try {
      setSaveStatus('saving');
      await saveVersion.mutateAsync({ chapterId: params.chapterId, content: c, isFinal: false, versionType: 'draft' });
      // 保存成功后自动进入自检步骤
      if (workflowStep === 'write') {
        setWorkflowStep('check');
      }
    } catch (e: any) {
      const msg = e?.message || e?.data?.message || (typeof e === 'string' ? e : '保存失败');
      console.error('[草稿保存失败]', e);
      if (msg.includes('已达上限')) {
        setPendingDraftContent(c);
        const versions = await utils.client.project.listChapterVersions.query({ chapterId: params.chapterId, versionType: 'draft' });
        if (versions) setDraftVersions(versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, label: v.label, createdAt: new Date(v.createdAt) })).reverse());
        setShowDraftLimitModal(true);
        setSaveStatus('error');
      } else {
        setSaveStatus('error');
      }
    }
  };

  const steps: { key: WorkflowStep; label: string; icon: string }[] = [
    { key: 'brief', label: '任务书', icon: '📋' },
    { key: 'write', label: '开始创作', icon: '✍️' },
    { key: 'check', label: '自检', icon: '🔍' },
    { key: 'finalize', label: '定稿', icon: '✅' },
  ];

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <main className="min-h-screen bg-gray-50" data-guide-target="chapter-editor">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href={`/project/${params.id}/chapters`} className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回正文</Link>
          <span className="text-gray-300">|</span>
          <span className="font-medium">{chapter?.title ?? '章节编辑'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{wordCount} 字</span>
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
          {draftVersionsData && draftVersionsData.length > 0 && (
            <span className={`text-xs ${draftVersionsData.length >= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
              草稿 {draftVersionsData.length}/3
            </span>
          )}
          <button onClick={() => handleSaveWithLimit()} disabled={saveVersion.isLoading || saveStatus === 'idle'}
            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
            保存
          </button>
          <button onClick={() => { setVersionPanelOpen(!versionPanelOpen); }}
            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition ${versionPanelOpen ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'}`}>
            版本
          </button>
          <button onClick={() => { setExperienceOpen(!experienceOpen); }}
            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition ${experienceOpen ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'}`}>
            经验
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto mt-6 mb-12">
        {/* ===== 工作流工具栏 ===== */}
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          {/* 步骤按钮 */}
          <div className="flex border-b border-gray-100">
            {steps.map(step => (
              <button key={step.key} onClick={() => setWorkflowStep(step.key)}
                className={`flex-1 py-3 text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                  workflowStep === step.key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}>
                <span className="text-xs">{step.icon}</span>
                {step.label}
                {step.key === 'brief' && briefConfirmed && (
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* 任务书面板 */}
          {workflowStep === 'brief' && (
            <div className="p-4">
              {briefLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">生成任务书中...</p>
              ) : taskBrief?.brief ? (
                <div>
                  <textarea
                    value={editableBrief}
                    onChange={e => { setEditableBrief(e.target.value); setBriefConfirmed(false); }}
                    className="w-full h-48 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
                  />
                  {/* 前后章信息 + 设定提醒 */}
                  <div className="mt-2 space-y-1">
                    {taskBrief.prevChapter ? (
                      <p className="text-xs text-gray-500">上一章：{taskBrief.prevChapter.title}</p>
                    ) : (
                      <p className="text-xs text-amber-500">本章为开篇第一章，无前情梗概</p>
                    )}
                    {taskBrief.nextChapter ? (
                      <p className="text-xs text-gray-500">下一章：{taskBrief.nextChapter.title}</p>
                    ) : (
                      <p className="text-xs text-amber-500">下一章梗概尚未规划，请先在大纲页面补充</p>
                    )}
                    {briefVersions && briefVersions.length > 0 && (
                      <p className={`text-xs ${briefVersions.length >= 3 ? 'text-amber-600' : 'text-gray-400'}`}>已保存 {briefVersions.length}/3 个任务书版本</p>
                    )}
                    {briefSavingError && (
                      <p className="text-xs text-red-500">{briefSavingError}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-gray-400">
                      相关设定：{taskBrief.settingCount} 条
                    </div>
                    <div className="flex gap-2">
                      {briefConfirmed ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                          任务书已确认
                        </span>
                      ) : (
                        <>
                          <button onClick={handleSaveBrief}
                            disabled={briefSaving || !editableBrief}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {briefSaving ? '保存中...' : '保存'}
                          </button>
                          <button onClick={handleConfirmBrief}
                            disabled={briefSaving}
                            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                            确认并开始创作
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">无法生成任务书</p>
              )}
            </div>
          )}

          {/* 开始创作面板 */}
          {workflowStep === 'write' && (
            <div className="p-4">
              {!briefConfirmed ? (
                <div className="text-center py-4">
                  <p className="text-sm text-amber-600 mb-3">请先确认任务书</p>
                  <button onClick={() => setWorkflowStep('brief')}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                    返回任务书
                  </button>
                </div>
              ) : !chatOpen ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-1">任务书已确认，可以开始 AI 辅助创作</p>
                  <p className="text-xs text-gray-400 mb-4">AI 将根据任务书内容引导你完成本章写作</p>
                  <button onClick={() => setChatOpen(true)}
                    className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                    打开 AI 对话
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm text-green-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    AI 对话已打开，请在右侧面板中进行对话
                  </p>
                  <p className="text-xs text-gray-400 mt-2">创作完成后，点击"保存"按钮保存为草稿版本</p>
                </div>
              )}
            </div>
          )}

          {/* 自检面板 */}
          {workflowStep === 'check' && (
            <div className="p-4">
              {!selfCheckReport && !selfCheckGenerating ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 mb-3">点击开始自检，AI 将自动分析正文内容，生成修改建议</p>
                  <button onClick={handleSelfCheck}
                    disabled={!configs || configs.length === 0}
                    className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    开始自检
                  </button>
                </div>
              ) : selfCheckGenerating ? (
                <div>
                  <p className="text-sm text-gray-400 mb-3">AI 自检中...</p>
                  {selfCheckReport && (
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-64 overflow-y-auto">
                      {selfCheckReport}
                    </pre>
                  )}
                </div>
              ) : (
                <div>
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 mb-3 border border-gray-100 max-h-64 overflow-y-auto">
                    {selfCheckReport}
                  </pre>
                  <div className="flex gap-2">
                    <button onClick={() => setSelfCheckReport(null)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                      重新自检
                    </button>
                    <button onClick={handleOpenAiModify}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                      AI 修改
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 定稿面板 */}
          {workflowStep === 'finalize' && (
            <div className="p-4">
              {chapter?.status === 'final' ? (
                <div className="text-center py-6">
                  <p className="text-green-600 text-lg font-medium mb-2">已定稿</p>
                  <p className="text-sm text-gray-500">本章已确认为最终版本 · {wordCount} 字</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    确认本章正文已修改完毕，可以定稿？
                  </p>
                  <button onClick={handleFinalize} disabled={!content || content === '<p></p>'}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认定稿
                  </button>

                  {/* 本章创作总结 */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button onClick={() => setShowChapterSummary(!showChapterSummary)}
                      className="text-sm text-gray-500 hover:text-gray-700 w-full text-left">
                      {showChapterSummary ? '收起创作总结' : '生成本章创作总结'}
                    </button>
                    {showChapterSummary && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">创作进度总结</label>
                          <textarea value={progressSummary} onChange={e => setProgressSummary(e.target.value)}
                            className="w-full h-20 p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="本章完成了哪些内容..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">创作经验总结</label>
                          <textarea value={experienceSummary} onChange={e => setExperienceSummary(e.target.value)}
                            className="w-full h-20 p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="创作过程中的经验教训..." />
                        </div>
                        <button disabled={summarySaving || !progressSummary || !experienceSummary}
                          onClick={handleSaveSummary}
                          className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                          {summarySaving ? '保存中...' : '保存总结到创作进度'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== 正文编辑器 ===== */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <StoryEditor
            content={initialContent}
            onChange={handleChange}
            placeholder="开始创作这一章的内容..."
          />
        </div>
      </div>

      {/* ===== 版本面板 ===== */}
      <VersionPanel open={versionPanelOpen} onClose={() => setVersionPanelOpen(false)}
        chapterId={params.chapterId} projectId={params.id} onLoadVersion={handleLoadVersion} />

      {/* ===== AI 创作对话 ===== */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
        projectId={params.id} conversationType="chapter" roleKey="writer" title="AI 创作"
        targetEntityId={params.chapterId} targetEntityType="chapter"
        taskBrief={editableBrief}
        fullOutline={outlineTree}
        progressSummary={chapterExperiences?.entries.map(e => `[${e.category}] ${e.content}`).join('\n')}
        experienceContext={experienceForWriter?.formattedText}
        onSaveDraft={(content) => {
          const html = content.startsWith('<') ? content : `<p>${content}</p>`;
          loadAiContent(html);
        }}
        onActionConfirmed={(type, entity) => {
          if (type === 'version') {
            // AI 输出了 save_version ACTION 块，保存为草稿
            utils.project.listChapterVersions.invalidate({ chapterId: params.chapterId });
            utils.project.getChapter.invalidate({ chapterId: params.chapterId });
            if (typeof entity === 'object' && entity !== null && 'content' in entity) {
              const content = (entity as { content: string }).content;
              const html = content.startsWith('<') ? content : `<p>${content}</p>`;
              loadAiContent(html);
            }
          }
          if (type === 'finalize') {
            handleFinalize();
          }
        }} />

      {/* ===== 创作经验面板 ===== */}
      <ExperiencePanel open={experienceOpen} onClose={() => setExperienceOpen(false)}
        projectId={params.id} />

      {/* ===== AI 修改对话框 ===== */}
      <AiModifyDialog
        open={aiModifyOpen}
        onClose={() => setAiModifyOpen(false)}
        chapterContent={content}
        selfCheckReport={selfCheckReport || ''}
        configId={configs?.[0]?.id || ''}
        projectId={params.id}
        onApply={handleApplyAiModify}
      />

      {/* ===== 设定检测跳转弹窗 ===== */}
      {showSettingsPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-base font-medium mb-2">设定补充提示</h3>
            <p className="text-sm text-gray-600 mb-3">
              检测到剧情中涉及以下设定，但尚未创建：
            </p>
            <ul className="text-sm text-gray-700 mb-4 space-y-1">
              {missingSettingsList.map(s => <li key={s} className="flex items-center gap-1"><span className="w-1 h-1 bg-amber-400 rounded-full" />{s}</li>)}
            </ul>
            <p className="text-xs text-gray-500 mb-4">是否前往设定页面补充设定？</p>
            <div className="flex gap-2">
              <button onClick={handleSkipSettings}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                跳过，继续创作
              </button>
              <Link href={`/project/${params.id}/settings`}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium text-center hover:bg-gray-800 transition">
                前往设定
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ===== 草稿版本超限弹窗 ===== */}
      {showDraftLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-base font-medium mb-2">草稿版本已达上限</h3>
            <p className="text-sm text-gray-600 mb-3">
              当前已有 {draftVersions.length} 个草稿版本，请删除旧版本后再保存。
            </p>
            <div className="max-h-48 overflow-y-auto mb-4 border border-gray-100 rounded-lg bg-gray-50">
              {draftVersions.map(v => (
                <div key={v.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="text-xs">
                    <span className="font-medium">v{v.versionNumber}</span>
                    {v.label && <span className="text-gray-500 ml-1">{v.label}</span>}
                    <span className="text-gray-400 ml-2">{v.createdAt.toLocaleString()}</span>
                  </div>
                  <button onClick={async () => {
                    await deleteVersion.mutateAsync({ versionId: v.id, chapterId: params.chapterId });
                    setDraftVersions(prev => prev.filter(x => x.id !== v.id));
                    // 删除后尝试重新保存
                    if (draftVersions.length <= 1 && pendingDraftContent) {
                      setShowDraftLimitModal(false);
                      setSaveStatus('saving');
                      saveVersion.mutate({ chapterId: params.chapterId, content: pendingDraftContent, isFinal: false, versionType: 'draft' });
                    }
                  }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium">
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDraftLimitModal(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={async () => {
                // 自动删除最旧版本
                if (draftVersions.length > 0) {
                  await deleteVersion.mutateAsync({ versionId: draftVersions[0].id, chapterId: params.chapterId });
                  setDraftVersions(prev => prev.slice(1));
                  if (pendingDraftContent && draftVersions.length <= 1) {
                    setShowDraftLimitModal(false);
                    setSaveStatus('saving');
                    saveVersion.mutate({ chapterId: params.chapterId, content: pendingDraftContent, isFinal: false, versionType: 'draft' });
                  }
                }
              }}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                删除最旧版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 任务书版本超限弹窗 ===== */}
      {showBriefLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-base font-medium mb-2">任务书版本已达上限</h3>
            <p className="text-sm text-gray-600 mb-3">
              当前已有 {briefVersionsList.length} 个任务书版本，请删除旧版本后再保存。
            </p>
            <div className="max-h-48 overflow-y-auto mb-4 border border-gray-100 rounded-lg bg-gray-50">
              {briefVersionsList.map(v => (
                <div key={v.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="text-xs">
                    <span className="font-medium">v{v.versionNumber}</span>
                    {v.label && <span className="text-gray-500 ml-1">{v.label}</span>}
                    <span className="text-gray-400 ml-2">{v.createdAt.toLocaleString()}</span>
                  </div>
                  <button onClick={async () => {
                    await deleteVersion.mutateAsync({ versionId: v.id, chapterId: params.chapterId });
                    setBriefVersionsList(prev => prev.filter(x => x.id !== v.id));
                    if (briefVersionsList.length <= 1 && pendingBriefContent) {
                      setShowBriefLimitModal(false);
                      setBriefSaving(true);
                      setBriefSavingError(null);
                      try {
                        await saveVersion.mutateAsync({ chapterId: params.chapterId, content: pendingBriefContent, isFinal: false, versionType: 'task_brief' });
                      } catch {}
                      setBriefSaving(false);
                    }
                  }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium">
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowBriefLimitModal(false); setBriefSaving(false); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={async () => {
                if (briefVersionsList.length > 0) {
                  await deleteVersion.mutateAsync({ versionId: briefVersionsList[0].id, chapterId: params.chapterId });
                  setBriefVersionsList(prev => prev.slice(1));
                  if (pendingBriefContent && briefVersionsList.length <= 1) {
                    setShowBriefLimitModal(false);
                    setBriefSaving(true);
                    try {
                      await saveVersion.mutateAsync({ chapterId: params.chapterId, content: pendingBriefContent, isFinal: false, versionType: 'task_brief' });
                    } catch {}
                    setBriefSaving(false);
                  }
                }
              }}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                删除最旧版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 定稿经验分析弹窗 ===== */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[85vh] flex flex-col">
            <h3 className="text-base font-medium mb-1">
              {experienceSaved
                ? '定稿完成'
                : analysisGenerating
                  ? 'AI 分析中...'
                  : '本章经验总结'}
            </h3>
            {/* 分级说明 */}
            {!experienceSaved && !analysisGenerating && (
              <div className="text-xs text-gray-400 mb-3 bg-gray-50 rounded-lg p-2">
                <p className="font-medium mb-1">经验级别说明：</p>
                <p>L0 核心创作铁律 · 每章创作前AI必读 · 必做/必不做</p>
                <p>L1 项目特色要求 · 要求AI贯彻风格</p>
                <p>L2 近三章重点/常犯问题 · 重视和规避</p>
                <p>L3 修改对比经验示例 · AI自动滚动替换</p>
                <p className="mt-1 text-amber-600">L0-L2在每次章节正文创作时调用，请简化词条（≤35字）避免占用过多token</p>
              </div>
            )}

            {experienceSaved ? (
              <div className="space-y-3">
                <div className="text-center py-2">
                  <p className="text-sm text-green-600 mb-2">
                    {proposedExperiences.filter(e => e.selected).length > 0
                      ? `已保存 ${proposedExperiences.filter(e => e.selected).length} 条经验到创作经验库`
                      : '未选择任何经验，已跳过本次总结'}
                  </p>
                </div>
                <button onClick={() => {
                  setShowFinalizeModal(false);
                  setExperienceSaved(false);
                  setAnalysisResult(null);
                  setProposedExperiences([]);
                }}
                  className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition mt-2">
                  关闭
                </button>
              </div>
            ) : analysisGenerating ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-500">正在对比草稿与定稿差异，提炼创作经验...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {analysisResult ? (
                  <div className="space-y-3">
                    {/* AI 原始分析结果 */}
                    <details className="bg-gray-50 rounded-lg">
                      <summary className="text-xs text-gray-500 p-3 cursor-pointer">AI 原始分析结果（点击展开）</summary>
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 p-3 pt-0">{analysisResult}</pre>
                    </details>

                    {/* 解析后的经验条目 */}
                    {proposedExperiences.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">识别到 {proposedExperiences.length} 条经验，选择需要导入的词条：</p>
                        {proposedExperiences.map((exp, i) => (
                          <ExperienceItemEditor key={i} index={i} exp={exp}
                            onChange={(idx, updates) => {
                              const newExps = [...proposedExperiences];
                              newExps[idx] = { ...newExps[idx], ...updates };
                              setProposedExperiences(newExps);
                            }} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">未生成分析结果</p>
                )}
              </div>
            )}

            {!analysisGenerating && !experienceSaved && (
              <div className="flex gap-2 mt-4">
                <button onClick={handleCloseAnalysis}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                  关闭
                </button>
                {proposedExperiences.length > 0 && (
                  <button onClick={handleSaveAnalysisExperiences}
                    disabled={saveAnalysisExperiences.isLoading || proposedExperiences.filter(e => e.selected).length === 0}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    应用 {proposedExperiences.filter(e => e.selected).length} 条经验
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// 经验条目编辑器组件（用于定稿弹窗）
function ExperienceItemEditor({ index, exp, onChange }: {
  index: number;
  exp: { level: 'L0' | 'L1' | 'L2' | 'L3'; category: string; content: string; selected: boolean };
  onChange: (idx: number, updates: Partial<typeof exp>) => void;
}) {
  const levelLabels: Record<string, { label: string; color: string }> = {
    L0: { label: 'L0 铁律', color: 'bg-red-100 text-red-700 border-red-200' },
    L1: { label: 'L1 特色', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    L2: { label: 'L2 近期', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    L3: { label: 'L3 参考', color: 'bg-green-100 text-green-700 border-green-200' },
  };
  const info = levelLabels[exp.level];
  const charCount = exp.content.length;
  const charWarn = charCount > 35;

  return (
    <div className={`border rounded-lg p-3 mb-2 transition ${exp.selected ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex items-center gap-2 mb-2">
        {/* 导入/取消 按钮 */}
        <button onClick={() => onChange(index, { selected: !exp.selected })}
          className={`px-2 py-0.5 text-xs rounded font-medium transition ${
            exp.selected
              ? 'bg-gray-900 text-white hover:bg-gray-700'
              : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
          }`}>
          {exp.selected ? '导入' : '取消'}
        </button>
        {/* 等级标签 */}
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${info.color}`} title={info.label}>
          {exp.level}
        </span>
        {/* 分类 */}
        <input
          type="text"
          value={exp.category}
          onChange={e => onChange(index, { category: e.target.value })}
          className="flex-1 text-xs bg-transparent border-b border-gray-200 px-1 py-0.5 focus:outline-none focus:border-gray-400"
          placeholder="分类"
        />
        {/* 字数 */}
        <span className={`text-xs ${charWarn ? 'text-red-500' : 'text-gray-400'}`}>{charCount}/35</span>
      </div>
      <textarea
        value={exp.content}
        onChange={e => onChange(index, { content: e.target.value.slice(0, 35) })}
        className="w-full h-12 p-2 text-xs bg-gray-50 border border-gray-100 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
        placeholder="经验内容（不超过35字）"
      />
    </div>
  );
}
