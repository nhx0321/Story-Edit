'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { ChatPanel } from '@/components/chat/chat-panel';
import { DocumentImportDialog } from '@/components/import/document-import-dialog';
import { exportOutline } from '@/lib/outline-export';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';

// 简易弹窗组件
function Dialog({ title, onClose, onConfirm, children }: {
  title: string; onClose: () => void; onConfirm: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        {children}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">取消</button>
          <button onClick={onConfirm}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">确认</button>
        </div>
      </div>
    </div>
  );
}

type DialogType = null | 'volume' | { type: 'unit'; volumeId: string } | { type: 'chapter'; unitId: string };
type CreationMode = 'manual' | 'ai';

export default function OutlinePage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const searchParams = useSearchParams();
  const progress = useWorkflowProgress(projectId);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const isPaidTemplateImport = (projectData?.config as any)?.isPaidTemplate === true;

  // 处理从设定页面"将词条导入大纲"跳转过来的请求
  useEffect(() => {
    const importSettings = searchParams.get('importSettings');
    const settingIds = searchParams.get('settingIds');
    if (importSettings === 'true' && settingIds) {
      // 清除 URL 参数
      window.history.replaceState({}, '', `/project/${projectId}/outline`);
      // 打开文学编辑 ChatPanel，并通知已接收设定
      setChatContext({
        roleKey: 'editor',
        contextPrompt: `以下设定词条已从设定管理页面导入到大纲，请确认接收并分析对故事脉络的影响。\n选中的设定ID：${settingIds}`,
      });
      setChatOpen(true);
    }
  }, [searchParams, projectId]);

  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  }, [progress]);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogType>(null);
  const [inputTitle, setInputTitle] = useState('');
  const [inputSynopsis, setInputSynopsis] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [creationMode, setCreationMode] = useState<CreationMode>('manual');
  const [chatContext, setChatContext] = useState<{ roleKey: string; contextPrompt: string } | null>(null);
  // AI 修改覆盖：当前编辑的实体
  const [aiEditEntity, setAiEditEntity] = useState<{ entityType: 'volume' | 'unit' | 'chapter' | 'setting'; id: string; title: string; content: string } | null>(null);
  const [aiEditChatOpen, setAiEditChatOpen] = useState(false);

  // 导入文档相关
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // 补充设定词条对话框
  const [supplementDialogOpen, setSupplementDialogOpen] = useState(false);
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<Set<string>>(new Set());

  // 导出相关状态
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState<'selected' | 'all'>('all');
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf'>('docx');
  const [exporting, setExporting] = useState(false);

  // 加载完整大纲树（用于 AI 创作上下文）
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: chatOpen || aiEditChatOpen },
  );

  // 加载故事脉络（用于 editor 角色和导出）
  const { data: storyNarrative } = trpc.project.getNarrative.useQuery(
    { projectId },
    { enabled: true },
  );

  // 数据查询
  const { data: volumeList, isLoading } = trpc.project.listVolumes.useQuery({ projectId });
  const { data: deletedVolumes } = trpc.project.listDeletedVolumes.useQuery({ projectId }, { enabled: showDeleted });
  const { data: projectSettings } = trpc.project.listSettings.useQuery({ projectId }, {
    enabled: supplementDialogOpen,
  });
  const { data: aiConfigs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: importDialogOpen });
  const configId = aiConfigs?.[0]?.id || '';
  const utils = trpc.useUtils();

  // mutations
  const createVolume = trpc.project.createVolume.useMutation({
    onSuccess: () => { utils.project.listVolumes.invalidate({ projectId }); },
  });
  const createUnit = trpc.project.createUnit.useMutation({
    onSuccess: () => { utils.project.listUnits.invalidate(); },
  });
  const createChapter = trpc.project.createChapter.useMutation({
    onSuccess: () => { utils.project.listChapters.invalidate(); },
  });

  const toggleVolume = (id: string) => {
    const next = new Set(expandedVolumes);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedVolumes(next);
  };

  const toggleUnit = (id: string) => {
    const next = new Set(expandedUnits);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedUnits(next);
  };

  const openDialog = (type: DialogType) => {
    setInputTitle('');
    setInputSynopsis('');
    setCreationMode('manual');
    setDialog(type);
  };

  // AI 修改：打开 ChatPanel，带入已有内容作为上下文
  const handleAiEditOutline = async (entityType: 'volume' | 'unit' | 'chapter', id: string, title: string, synopsis: string | null | undefined) => {
    let content = synopsis || '';
    let contextPrompt = '';

    // 加载项目设定作为参考
    const settings = await utils.client.project.listSettings.query({ projectId });

    if (entityType === 'volume') {
      const vol = volumeList?.find(v => v.id === id);
      content = vol?.synopsis || '';
      const units = await utils.client.project.listUnits.query({ volumeId: id });
      if (units && units.length > 0) {
        contextPrompt += `## 已有单元\n`;
        for (const unit of units) {
          contextPrompt += `- ${unit.title}${unit.synopsis ? '：' + unit.synopsis : ''}\n`;
        }
        contextPrompt += '\n';
      }
    } else if (entityType === 'unit') {
      // 从 outlineTree 查找所属卷 + 章节
      let volTitle = '';
      if (outlineTree) {
        for (const vol of outlineTree) {
          const unit = (vol as any).units?.find((u: any) => u.id === id);
          if (unit) {
            volTitle = vol.title;
            content = unit.synopsis || content;
            if (unit.chapters && unit.chapters.length > 0) {
              contextPrompt += `## 已有章节\n`;
              unit.chapters.forEach((ch: any) => {
                contextPrompt += `- ${ch.title}${ch.synopsis ? '：' + ch.synopsis : ''}\n`;
              });
              contextPrompt += '\n';
            }
            break;
          }
        }
      }
      if (volTitle) contextPrompt += `## 所属卷\n${volTitle}\n\n`;
    } else if (entityType === 'chapter') {
      let unitTitle = '';
      let volTitle = '';
      if (outlineTree) {
        for (const vol of outlineTree) {
          for (const unit of (vol as any).units || []) {
            if (unit.chapters?.some((ch: any) => ch.id === id)) {
              volTitle = vol.title;
              unitTitle = unit.title;
              const chapters = unit.chapters || [];
              const idx = chapters.findIndex((ch: any) => ch.id === id);
              if (idx > 0 && chapters[idx - 1]?.synopsis) {
                contextPrompt += `## 前一章节梗概\n${chapters[idx - 1].title}：${chapters[idx - 1].synopsis}\n\n`;
              }
              const ch = chapters.find((c: any) => c.id === id);
              if (ch) content = ch.synopsis || content;
              break;
            }
          }
          if (volTitle) break;
        }
      }
      if (volTitle) contextPrompt += `## 所属卷\n${volTitle}\n\n`;
      if (unitTitle) contextPrompt += `## 所属单元\n${unitTitle}\n\n`;
    }

    // 附加设定
    if (settings && settings.length > 0) {
      contextPrompt += `## 相关设定\n${settings.slice(0, 10).map(s => `[${s.category}] ${s.title}: ${s.content.slice(0, 150)}`).join('\n')}\n\n`;
    }

    const typeLabel = entityType === 'volume' ? '卷' : entityType === 'unit' ? '单元' : '章节';
    contextPrompt += `## 当前修改目标\n你要修改的是**${typeLabel}**层级，实体 ID：${id}\n标题：${title}\n梗概：${content || '（暂无）'}\n\n`;
    contextPrompt += `请帮助用户修改以上${typeLabel}内容。用户会提出修改要求，AI 进行修改后，必须输出 [ACTION:update_${entityType}] 指令以覆盖原内容。`;
    contextPrompt += `\n注意：ACTION 指令中必须包含 "id": "${id}" 字段。`;

    setAiEditEntity({ entityType, id, title, content });
    setChatContext({ roleKey: 'editor', contextPrompt });
    setAiEditChatOpen(true);
  };

  // AI 创作：关闭弹窗，打开 ChatPanel
  const handleAiCreation = async () => {
    try {
      if (dialog === 'volume') {
        // 新建卷 AI：以定稿正文为准，生成前一卷剧情梗概、关键剧情、设定、物资清单、前后衔接
        const outline = await utils.client.workflow.getOutline.query({ projectId });
        const settings = await utils.client.project.listSettings.query({ projectId });
        let contextPrompt = '';
        if (outline && outline.length > 0) {
          const lastVol = outline[outline.length - 1];
          // 收集前一卷所有已定稿章节
          const finalizedChapters: Array<{ title: string; synopsis: string; unitTitle: string }> = [];
          for (const unit of (lastVol as any).units || []) {
            for (const ch of unit.chapters || []) {
              if (ch.status === 'final') {
                finalizedChapters.push({ title: ch.title, synopsis: ch.synopsis || '', unitTitle: unit.title });
              }
            }
          }
          if (finalizedChapters.length > 0) {
            contextPrompt += `## 前一卷信息\n`;
            contextPrompt += `卷名：${lastVol.title}\n`;
            if (lastVol.synopsis) contextPrompt += `卷梗概：${lastVol.synopsis}\n\n`;
            contextPrompt += `## 已定稿章节列表（以定稿正文为准）\n`;
            finalizedChapters.forEach(ch => {
              contextPrompt += `- [${ch.unitTitle}] ${ch.title}${ch.synopsis ? '：' + ch.synopsis : ''}\n`;
            });
            contextPrompt += `\n请根据以上已定稿章节内容，先生成以下单元总结供用户参考（用户可后续修改覆盖）：\n`;
            contextPrompt += `1. **剧情梗概**：前一卷的核心剧情线总结\n`;
            contextPrompt += `2. **关键剧情**：重要转折点和里程碑事件\n`;
            contextPrompt += `3. **设定引用**：涉及的设定（力量体系、世界观、角色等）\n`;
            contextPrompt += `4. **物资清单**：角色获得或消耗的重要物品\n`;
            contextPrompt += `5. **前后衔接**：与新卷的衔接建议和待解决的伏笔\n`;
            contextPrompt += `\n然后基于以上总结，协助用户规划新的一卷大纲。\n\n`;
          }
          if (lastVol.synopsis && finalizedChapters.length === 0) {
            contextPrompt += `## 前一卷梗概\n${lastVol.title}：${lastVol.synopsis}\n\n`;
            contextPrompt += `（前一卷尚无定稿章节，请根据卷梗概进行创作）\n\n`;
          }
        }
        if (!contextPrompt) {
          contextPrompt = '（本项目尚无前序内容，请根据项目整体构思进行创作）\n\n';
        }
        // 附加相关设定
        if (settings && settings.length > 0) {
          contextPrompt += `## 项目设定\n${settings.slice(0, 15).map(s => `[${s.category}] ${s.title}: ${s.content.slice(0, 150)}`).join('\n')}\n\n`;
        }
        contextPrompt += `请帮助用户构思新的一卷大纲。请询问用户关于新卷的主题、核心冲突、角色发展等，协助完成规划。`;
        setChatContext({ roleKey: 'editor', contextPrompt });
        setChatOpen(true);
      } else if (dialog && typeof dialog === 'object' && dialog.type === 'unit') {
        // 新建单元 AI：提示用户是否生成前一单元总结
        const outline = await utils.client.workflow.getOutline.query({ projectId });
        const settings = await utils.client.project.listSettings.query({ projectId });
        let contextPrompt = '';
        if (outline) {
          const vol = dialog as { type: 'unit'; volumeId: string };
          const targetVol = outline.find(v => v.id === vol.volumeId);
          if (targetVol) {
            const units = (targetVol as any).units || [];
            if (units.length > 0) {
              const lastUnit = units[units.length - 1];
              // 收集前一单元已定稿章节
              const finalizedChapters: Array<{ title: string; synopsis: string }> = [];
              for (const ch of lastUnit.chapters || []) {
                if (ch.status === 'final') {
                  finalizedChapters.push({ title: ch.title, synopsis: ch.synopsis || '' });
                }
              }
              if (finalizedChapters.length > 0) {
                contextPrompt += `## 前一单元总结（以定稿正文为准）\n`;
                contextPrompt += `单元名：${lastUnit.title}\n`;
                if (lastUnit.synopsis) contextPrompt += `单元梗概：${lastUnit.synopsis}\n\n`;
                contextPrompt += `### 已定稿章节\n`;
                finalizedChapters.forEach(ch => {
                  contextPrompt += `- ${ch.title}${ch.synopsis ? '：' + ch.synopsis : ''}\n`;
                });
                contextPrompt += `\n请根据以上内容生成单元总结，包括：剧情梗概、关键剧情、设定引用、角色变化、前后衔接。\n然后协助用户规划新的单元。\n\n`;
              }
              if (!contextPrompt && lastUnit.synopsis) {
                contextPrompt += `## 前一单元梗概\n${lastUnit.title}：${lastUnit.synopsis}\n\n`;
              }
            }
            // 附加卷梗概
            if ((targetVol as any).synopsis) {
              contextPrompt += `## 所属卷梗概\n${targetVol.title}：${(targetVol as any).synopsis}\n\n`;
            }
          }
        }
        if (!contextPrompt) contextPrompt = '（该卷尚无前序内容，请根据卷的主题进行创作）\n\n';
        if (settings && settings.length > 0) {
          contextPrompt += `## 相关设定\n${settings.slice(0, 10).map(s => `[${s.category}] ${s.title}: ${s.content.slice(0, 150)}`).join('\n')}\n\n`;
        }
        contextPrompt += `请帮助用户构思新的单元大纲。`;
        setChatContext({ roleKey: 'editor', contextPrompt });
        setChatOpen(true);
      } else if (dialog && typeof dialog === 'object' && dialog.type === 'chapter') {
        // 新建章节 AI：读取前一章节梗概及相关设定
        const outline = await utils.client.workflow.getOutline.query({ projectId });
        let contextPrompt = '';
        if (outline) {
          const chDialog = dialog as { type: 'chapter'; unitId: string };
          for (const vol of outline) {
            for (const unit of (vol as any).units || []) {
              if (unit.id === chDialog.unitId) {
                const chapters = unit.chapters || [];
                if (chapters.length > 0) {
                  const lastCh = chapters[chapters.length - 1];
                  if (lastCh.synopsis) contextPrompt += `## 前一章节梗概\n${lastCh.title}：${lastCh.synopsis}\n\n`;
                }
                // 获取相关设定
                const settings = await utils.client.project.listSettings.query({ projectId: projectId });
                if (settings && settings.length > 0) {
                  contextPrompt += `## 相关设定\n${settings.slice(0, 10).map(s => `[${s.category}] ${s.title}: ${s.content.slice(0, 150)}`).join('\n')}\n\n`;
                }
                break;
              }
            }
          }
        }
        if (!contextPrompt) contextPrompt = '（本项目尚无前序章节，请根据项目整体构思进行创作）\n\n';
        contextPrompt += `请帮助用户创作新的章节梗概。`;
        setChatContext({ roleKey: 'writer', contextPrompt });
        setChatOpen(true);
      }
      setDialog(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`AI 创作初始化失败：${msg}`);
    }
  };

  // 补充设定词条：打开勾选对话框，选择后自动注入文学编辑ChatPanel
  const handleSupplementSettings = () => {
    setSelectedSupplementIds(new Set());
    setSupplementDialogOpen(true);
  };

  const confirmSupplementSettings = () => {
    const ids = Array.from(selectedSupplementIds);
    if (ids.length === 0) return;
    setSupplementDialogOpen(false);
    // 打开文学编辑ChatPanel，传入选择的设定ID
    setChatContext({
      roleKey: 'editor',
      contextPrompt: `以下设定词条已导入，请确认接收并分析对故事脉络的影响。\n选中的设定ID：${ids.join(',')}`,
    });
    setChatOpen(true);
  };

  const handleConfirm = async () => {
    if (!inputTitle.trim()) return;
    try {
      if (dialog === 'volume') {
        await createVolume.mutateAsync({ projectId, title: inputTitle, synopsis: inputSynopsis || undefined, sortOrder: volumeList?.length ?? 0 });
      } else if (dialog && typeof dialog === 'object' && dialog.type === 'unit') {
        await createUnit.mutateAsync({ volumeId: dialog.volumeId, title: inputTitle, synopsis: inputSynopsis || undefined });
      } else if (dialog && typeof dialog === 'object' && dialog.type === 'chapter') {
        await createChapter.mutateAsync({ unitId: dialog.unitId, title: inputTitle, synopsis: inputSynopsis || undefined });
      }
      setDialog(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`创建失败：${msg}`);
    }
  };

  const statusLabel = (s: string | null) => {
    switch (s) {
      case 'final': return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已定稿</span>;
      case 'draft': return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">草稿</span>;
      default: return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">待创作</span>;
    }
  };

  // 导出功能
  const handleExport = async () => {
    setExporting(true);
    try {
      // 构建导出数据结构
      const exportData: Awaited<ReturnType<typeof buildExportData>> = await buildExportData();
      const success = await exportOutline(exportData, exportFormat, { includeContent: true });
      if (success) {
        setShowExportModal(false);
        setSelectedChapters(new Set());
      }
    } catch (e: any) {
      alert(`导出失败：${e?.message || '未知错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const buildExportData = async () => {
    if (!volumeList) throw new Error('数据未加载');

    // 构建章节ID到定稿内容的映射
    const finalContentMap = new Map<string, string>();

    const volumes: any[] = [];
    for (const vol of volumeList) {
      const units = await utils.client.project.listUnits.query({ volumeId: vol.id });
      const volUnits: any[] = [];
      for (const unit of (units || [])) {
        const chapters = await utils.client.project.listChapters.query({ unitId: unit.id });
        const unitChapters: any[] = [];
        for (const ch of (chapters || [])) {
          // 获取定稿正文
          let finalContent: string | null = null;
          if (ch.status === 'final') {
            const versions = await utils.client.project.listChapterVersions.query({ chapterId: ch.id, versionType: 'final' });
            if (versions && versions.length > 0) {
              finalContent = versions[0].content;
            }
          }
          unitChapters.push({
            id: ch.id,
            title: ch.title,
            synopsis: ch.synopsis,
            status: ch.status,
            finalContent,
          });
        }
        volUnits.push({
          id: unit.id,
          title: unit.title,
          synopsis: unit.synopsis,
          chapters: unitChapters,
        });
      }
      volumes.push({
        id: vol.id,
        title: vol.title,
        synopsis: vol.synopsis,
        units: volUnits,
      });
    }

    return {
      projectTitle: '小说大纲',
      projectSynopsis: null,
      volumes,
      selectedChapters: exportMode === 'selected' ? selectedChapters : undefined,
      storyNarrative,
    };
  };

  const dialogTitle = dialog === 'volume' ? '新建卷'
    : dialog && typeof dialog === 'object' && dialog.type === 'unit' ? '添加单元'
    : dialog && typeof dialog === 'object' && dialog.type === 'chapter' ? '添加章节' : '';

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ProjectSidebar
        projectId={projectId}
        projectName={projectData?.name || '项目'}
        projectGenre={projectData?.genre}
        projectStyle={projectData?.style}
        currentPath="/outline"
        progress={progress}
      />
      <main className="flex-1 p-8" data-guide-target="outline-tree">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-900 transition">项目列表</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/project/${projectId}`} className="hover:text-gray-900 transition">概览</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">大纲编辑</span>
            {progress.hasChapters && <span className="text-green-500 text-xs font-bold ml-0.5" title="大纲编辑完成">✓</span>}
            {progress.hasVolumes && !progress.hasChapters && <span className="text-amber-500 text-[10px] animate-pulse ml-0.5" title="可编辑大纲">→</span>}
          </div>
        <div className="flex items-center justify-between mt-4 mb-6">
          <h1 className="text-2xl font-bold">大纲</h1>
          <div className="flex gap-2">
            {/* AI 构思 — 黑底白字，最左侧 */}
            <button onClick={() => setChatOpen(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              AI 构思
            </button>
            <button onClick={() => openDialog('volume')}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              + 新建卷
            </button>
            <button
              onClick={() => !isPaidTemplateImport && setShowExportModal(true)}
              disabled={isPaidTemplateImport}
              title={isPaidTemplateImport ? '付费模板导入的项目不支持导出' : '导出大纲'}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition ${
                isPaidTemplateImport
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 hover:border-gray-500'
              }`}>
              导出大纲
            </button>
            {/* 导入文档 — 新按钮 */}
            <button onClick={() => setImportDialogOpen(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              导入文档
            </button>
            {/* 补充设定词条 — 新按钮 */}
            <button onClick={handleSupplementSettings}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              补充设定词条
            </button>
            <button onClick={() => setShowDeleted(!showDeleted)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition ${showDeleted ? 'border-orange-300 text-orange-600 bg-orange-50' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
              回收站{deletedVolumes && deletedVolumes.length > 0 ? ` (${deletedVolumes.length})` : ''}
            </button>
          </div>
        </div>

        {/* ===== 全书梗概编辑区（补充要求#3） ===== */}
        <NarrativeSection
          projectId={projectId}
          storyNarrative={storyNarrative}
        />

        {showDeleted ? (
          /* ===== 回收站视图 ===== */
          <RecycleBinView projectId={projectId} deletedVolumes={deletedVolumes || []}
            expandedVolumes={expandedVolumes} onToggleVolume={toggleVolume} />
        ) : (
          /* ===== 正常大纲视图 ===== */
          (!volumeList || volumeList.length === 0) ? (
            <div className="text-center py-16 text-gray-400">
              <p className="mb-2">还没有创建卷</p>
              <button onClick={() => openDialog('volume')} className="text-gray-900 font-medium hover:underline">点击新建第一卷</button>
            </div>
          ) : (
            <div className="space-y-3">
              {volumeList.map(vol => (
                <VolumeItem key={vol.id} vol={vol} projectId={projectId}
                  expanded={expandedVolumes.has(vol.id)} onToggle={() => toggleVolume(vol.id)}
                  expandedUnits={expandedUnits} toggleUnit={toggleUnit}
                  statusLabel={statusLabel} openDialog={openDialog}
                  onAiEdit={handleAiEditOutline} onAiEditChild={handleAiEditOutline} />
              ))}
            </div>
          )
        )}
      </div>

      {/* 创作关联导航 */}
      <div className="grid grid-cols-2 gap-4 mt-6 max-w-3xl mx-auto">
        <Link href={`/project/${projectId}/settings`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
          <p className="text-sm font-medium text-gray-900">前往设定管理</p>
          <p className="text-xs text-gray-400 mt-1">搭建世界观 · 补充设定体系</p>
        </Link>
        {progress.hasChapters && (
          <Link href={`/project/${projectId}/chapters`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
            <p className="text-sm font-medium text-gray-900">前往正文创作</p>
            <p className="text-xs text-gray-400 mt-1">进入章节编辑器撰写正文</p>
          </Link>
        )}
      </div>

      {dialog && (
        <Dialog title={dialogTitle} onClose={() => setDialog(null)} onConfirm={handleConfirm}>
          <div className="space-y-3">
            {/* 创作方式选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">创作方式</label>
              <div className="flex gap-2">
                <button onClick={() => setCreationMode('manual')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    creationMode === 'manual'
                      ? 'bg-gray-900 text-white border-2 border-gray-900'
                      : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}>
                  手动创作
                </button>
                <button onClick={handleAiCreation}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    creationMode === 'ai'
                      ? 'bg-gray-900 text-white border-2 border-gray-900'
                      : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}>
                  AI 辅助创作
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="请输入标题" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">简介（可选）</label>
              <textarea value={inputSynopsis} onChange={e => setInputSynopsis(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 h-20 resize-none"
                placeholder="简要描述" />
            </div>
          </div>
        </Dialog>
      )}

      {/* 导出大纲对话框 */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowExportModal(false); setSelectedChapters(new Set()); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">导出大纲</h3>
            <div className="space-y-4">
              {/* 导出范围 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">导出范围</label>
                <div className="flex gap-2">
                  <button onClick={() => setExportMode('all')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      exportMode === 'all'
                        ? 'bg-gray-900 text-white border-2 border-gray-900'
                        : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>
                    全部导出
                  </button>
                  <button onClick={() => setExportMode('selected')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      exportMode === 'selected'
                        ? 'bg-gray-900 text-white border-2 border-gray-900'
                        : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>
                    选择导出
                  </button>
                </div>
              </div>

              {/* 选择章节（仅在选择模式下显示） */}
              {exportMode === 'selected' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">选择定稿章节</label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                    {volumeList?.map(vol => (
                      <div key={vol.id} className="text-xs font-medium text-gray-500 mt-1">{vol.title}</div>
                    ))}
                    <ChapterSelector projectId={projectId} selected={selectedChapters} onChange={setSelectedChapters} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">已选择 {selectedChapters.size} 个章节</p>
                </div>
              )}

              {/* 导出格式 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">导出格式</label>
                <div className="flex gap-2">
                  <button onClick={() => setExportFormat('docx')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      exportFormat === 'docx'
                        ? 'bg-gray-900 text-white border-2 border-gray-900'
                        : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>
                    DOCX
                  </button>
                  <button onClick={() => setExportFormat('pdf')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                      exportFormat === 'pdf'
                        ? 'bg-gray-900 text-white border-2 border-gray-900'
                        : 'border-2 border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>
                    PDF（VIP）
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowExportModal(false); setSelectedChapters(new Set()); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={handleExport} disabled={exporting}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {exporting ? '导出中...' : '导出'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatPanel open={chatOpen} onClose={() => { setChatOpen(false); setChatContext(null); }}
        projectId={projectId} conversationType="outline"
        roleKey={chatContext?.roleKey as 'editor' | 'writer' ?? 'editor'}
        title={chatContext?.roleKey === 'writer' ? 'AI 章节创作' : 'AI 构思'}
        fullOutline={outlineTree}
        storyNarrative={storyNarrative}
        customContextPrompt={chatContext?.contextPrompt}
        onNavigateToSettings={() => {
          window.location.href = `/project/${projectId}/settings`;
        }}
        onNavigateToOutline={() => {
          // 已在大纲页面，关闭对话框即可
          setChatOpen(false);
          setChatContext(null);
        }}
        onNavigateToChapter={() => {
          // 跳转到第一个章节的正文创作页面
          window.location.href = `/project/${projectId}/chapters`;
        }}
        onActionConfirmed={(type, entity: unknown) => {
          utils.project.listVolumes.invalidate({ projectId });
          utils.project.listUnits.invalidate();
          utils.project.listChapters.invalidate();

          // 自动展开新创建的项目，确保用户能立即看到内容
          const e = entity as { id?: string } | undefined;
          if (!e?.id) return;
          if (type === 'volume') {
            setExpandedVolumes(prev => {
              const next = new Set(prev);
              next.add(e.id!);
              return next;
            });
          } else if (type === 'unit') {
            setExpandedUnits(prev => {
              const next = new Set(prev);
              next.add(e.id!);
              return next;
            });
          }
        }} />

      {/* AI 修改 ChatPanel */}
      <ChatPanel open={aiEditChatOpen} onClose={() => { setAiEditChatOpen(false); setAiEditEntity(null); setChatContext(null); }}
        projectId={projectId} conversationType="outline"
        roleKey={chatContext?.roleKey as 'editor' ?? 'editor'}
        title={`AI 修改 — ${aiEditEntity?.title || ''}`}
        fullOutline={outlineTree}
        storyNarrative={storyNarrative}
        customContextPrompt={chatContext?.contextPrompt}
        onNavigateToSettings={() => {
          window.location.href = `/project/${projectId}/settings`;
        }}
        onNavigateToOutline={() => {
          setAiEditChatOpen(false);
          setChatContext(null);
        }}
        onNavigateToChapter={() => {
          window.location.href = `/project/${projectId}/chapters`;
        }}
        onActionConfirmed={(type, entity: unknown) => {
          utils.project.listVolumes.invalidate({ projectId });
          utils.project.listUnits.invalidate();
          utils.project.listChapters.invalidate();

          // 覆盖确认：自动展开对应的卷/单元
          const e = entity as { id?: string } | undefined;
          if (type === 'volume' && e?.id) {
            setExpandedVolumes(prev => { const n = new Set(prev); n.add(e.id!); return n; });
          } else if (type === 'unit' && e?.id) {
            setExpandedUnits(prev => { const n = new Set(prev); n.add(e.id!); return n; });
          }
        }} />

      {/* 文档导入对话框 */}
      <DocumentImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        projectId={projectId}
        importTarget="outline"
        configId={configId}
        onImported={() => {
          setImportDialogOpen(false);
          utils.project.listVolumes.invalidate({ projectId });
          utils.project.getOutlineTree.invalidate({ projectId });
        }}
      />

      {/* 补充设定词条对话框 */}
      {supplementDialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSupplementDialogOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">选择要补充到大纲的设定词条</h3>
            <p className="text-sm text-gray-500 mb-4">勾选需要引入到故事大纲中的设定词条，确认后文学编辑将接收并分析影响。</p>
            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
              {!projectSettings || projectSettings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无设定词条</p>
              ) : (
                projectSettings.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedSupplementIds.has(s.id)}
                      onChange={() => {
                        const next = new Set(selectedSupplementIds);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        setSelectedSupplementIds(next);
                      }}
                      className="rounded border-gray-300" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400">{s.category}</p>
                      <p className="text-xs text-gray-400 truncate">{s.content?.slice(0, 60) || '（无内容）'}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSupplementDialogOpen(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={confirmSupplementSettings}
                disabled={selectedSupplementIds.size === 0}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                确认 ({selectedSupplementIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}

// ========== 回收站视图 ==========
function RecycleBinView({ projectId, deletedVolumes, expandedVolumes, onToggleVolume }: {
  projectId: string;
  deletedVolumes: { id: string; title: string; deletedAt: string | null }[];
  expandedVolumes: Set<string>;
  onToggleVolume: (id: string) => void;
}) {
  const utils = trpc.useUtils();
  const permanentDeleteVolume = trpc.project.deleteVolume.useMutation(); // still named deleteVolume but we'll add permanent

  if (deletedVolumes.length === 0) {
    return <div className="text-center py-16 text-gray-400"><p>回收站为空</p><p className="text-sm mt-2">删除的卷、单元、章节会在此处保留 30 天</p></div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-orange-600 mb-2">回收站 — 已删除的大纲元素将在 30 天后自动清除</p>
      {deletedVolumes.map(vol => (
        <DeletedVolumeCard key={vol.id} vol={vol} projectId={projectId}
          expanded={expandedVolumes.has(vol.id)} onToggle={() => onToggleVolume(vol.id)} />
      ))}
    </div>
  );
}

function DeletedVolumeCard({ vol, projectId, expanded, onToggle }: {
  vol: { id: string; title: string; deletedAt: string | null };
  projectId: string; expanded: boolean; onToggle: () => void;
}) {
  const utils = trpc.useUtils();
  const restoreVolume = trpc.project.restoreVolume.useMutation({
    onSuccess: () => {
      utils.project.listVolumes.invalidate({ projectId });
      utils.project.listDeletedVolumes.invalidate({ projectId });
    },
  });
  const { data: deletedUnits } = trpc.project.listDeletedUnits.useQuery(
    { volumeId: vol.id }, { enabled: expanded },
  );

  const daysLeft = vol.deletedAt ? Math.max(0, 30 - Math.floor((Date.now() - new Date(vol.deletedAt).getTime()) / 86400000)) : 30;

  return (
    <div className="bg-white rounded-xl border border-orange-200">
      <div className="flex items-center px-5 py-4">
        <button onClick={onToggle} className="flex-1 text-left flex items-center justify-between">
          <span className="font-semibold text-orange-800">{vol.title}</span>
          <span className="text-orange-400 text-sm">{expanded ? '▼' : '▶'}</span>
        </button>
        <button onClick={() => restoreVolume.mutateAsync({ id: vol.id, projectId })}
          disabled={restoreVolume.isPending}
          className="ml-3 px-3 py-1 text-xs text-green-600 hover:text-green-800 border border-green-200 rounded transition disabled:opacity-50">
          恢复
        </button>
      </div>
      <span className="px-5 text-xs text-gray-400 block mb-2">剩余 {daysLeft} 天自动清除</span>
      {expanded && deletedUnits && deletedUnits.length > 0 && (
        <div className="px-5 pb-4 space-y-1">
          <p className="text-xs text-gray-500 mb-1">已删除的单元：</p>
          {deletedUnits.map(unit => (
            <span key={unit.id} className="text-sm text-gray-500 px-3 py-1 block">{unit.title}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== 卷组件 — 内部查询单元列表 ==========
function VolumeItem({ vol, projectId, expanded, onToggle, expandedUnits, toggleUnit, statusLabel, openDialog, onAiEdit, onAiEditChild }: {
  vol: { id: string; title: string; synopsis?: string | null };
  projectId: string; expanded: boolean;
  onToggle: () => void;
  expandedUnits: Set<string>; toggleUnit: (id: string) => void;
  statusLabel: (s: string | null) => React.ReactNode;
  openDialog: (d: DialogType) => void;
  onAiEdit: (entityType: 'volume', id: string, title: string, synopsis: string | null | undefined) => void;
  onAiEditChild: (entityType: 'unit' | 'chapter', id: string, title: string, synopsis: string | null | undefined) => void;
}) {
  const { data: unitList } = trpc.project.listUnits.useQuery(
    { volumeId: vol.id }, { enabled: expanded },
  );
  const utils = trpc.useUtils();
  const deleteVolume = trpc.project.deleteVolume.useMutation({
    onSuccess: () => { utils.project.listVolumes.invalidate({ projectId }); },
  });
  const updateVolume = trpc.project.updateVolume.useMutation({
    onSuccess: () => { utils.project.listVolumes.invalidate({ projectId }); },
  });

  // 梗概编辑状态
  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [synopsisText, setSynopsisText] = useState(vol.synopsis || '');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [synopsisError, setSynopsisError] = useState<string | null>(null);

  const { data: synopsisVersions } = trpc.project.listOutlineVersions.useQuery(
    { entityType: 'volume', entityId: vol.id },
    { enabled: showVersionModal },
  );
  const deleteVersion = trpc.project.deleteOutlineVersion.useMutation();
  const restoreVersion = trpc.project.restoreOutlineVersion.useMutation({
    onSuccess: () => {
      utils.project.listVolumes.invalidate({ projectId });
      setShowVersionModal(false);
    },
  });

  const handleSaveSynopsis = async () => {
    setSynopsisError(null);
    try {
      await updateVolume.mutateAsync({ id: vol.id, projectId, synopsis: synopsisText || undefined });
      setEditingSynopsis(false);
    } catch (e: any) {
      const msg = e?.message || '保存失败';
      if (msg.includes('已达上限')) {
        setShowVersionModal(true);
      } else {
        setSynopsisError(msg);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除卷「${vol.title}」？\n卷下的所有单元和章节也将被移入回收站，30 天后自动清除。`)) return;
    await deleteVolume.mutateAsync({ id: vol.id, projectId });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center">
        <button onClick={onToggle} className="flex-1 text-left px-5 py-4 flex items-center justify-between">
          <span className="font-semibold">{vol.title}</span>
          <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
        </button>
        <button onClick={() => onAiEdit('volume', vol.id, vol.title, vol.synopsis)}
          className="px-3 text-xs text-indigo-500 hover:text-indigo-700 transition"
          title="AI 修改">
          AI 修改
        </button>
        <button onClick={handleDelete} disabled={deleteVolume.isPending}
          className="px-3 text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
          title="删除卷">
          删除
        </button>
      </div>

      {/* 梗概编辑区 */}
      <div className="px-5 -mt-1 mb-2">
        {editingSynopsis ? (
          <div>
            <textarea
              value={synopsisText}
              onChange={e => setSynopsisText(e.target.value)}
              className="w-full p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed"
              rows={3}
              placeholder="卷梗概..."
            />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={handleSaveSynopsis}
                disabled={updateVolume.isPending}
                className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50">
                保存
              </button>
              <button onClick={() => { setEditingSynopsis(false); setSynopsisText(vol.synopsis || ''); }}
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
                取消
              </button>
              {synopsisVersions && synopsisVersions.length > 0 && (
                <button onClick={() => setShowVersionModal(true)}
                  className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600">
                  历史版本 ({synopsisVersions.length})
                </button>
              )}
            </div>
            {synopsisError && <p className="text-xs text-red-500 mt-1">{synopsisError}</p>}
          </div>
        ) : (
          <div className="flex items-start justify-between">
            {vol.synopsis ? (
              <div className="text-xs text-gray-600 leading-relaxed line-clamp-4 flex-1 cursor-pointer"
                onClick={() => { setEditingSynopsis(true); setSynopsisText(vol.synopsis || ''); }}>
                {vol.synopsis}
              </div>
            ) : (
              <div className="text-xs text-gray-400 cursor-pointer hover:text-gray-600"
                onClick={() => { setEditingSynopsis(true); setSynopsisText(''); }}>
                + 添加梗概
              </div>
            )}
            {vol.synopsis && synopsisVersions && synopsisVersions.length > 0 && (
              <button onClick={() => setShowVersionModal(true)}
                className="ml-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">
                历史 ({synopsisVersions.length})
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {unitList?.map(unit => (
            <UnitItem key={unit.id} unit={unit} projectId={projectId} volumeId={vol.id}
              expanded={expandedUnits.has(unit.id)} onToggle={() => toggleUnit(unit.id)}
              statusLabel={statusLabel} openDialog={openDialog}
              onAiEdit={onAiEditChild} onAiEditChapter={onAiEditChild} />
          ))}
          {unitList?.length === 0 && <p className="text-sm text-gray-400 px-4">暂无单元</p>}
          <button onClick={() => openDialog({ type: 'unit', volumeId: vol.id })}
            className="text-xs text-gray-400 hover:text-gray-600 px-4 py-1">+ 添加单元</button>
        </div>
      )}

      {/* 版本弹窗 */}
      {showVersionModal && (
        <SynopsisVersionModal
          entityType="volume" entityId={vol.id} projectId={projectId}
          parentEntityId={vol.id}
          versions={synopsisVersions || []}
          onClose={() => setShowVersionModal(false)}
          onDeleteVersion={deleteVersion.mutateAsync}
          onRestoreVersion={restoreVersion.mutateAsync}
        />
      )}
    </div>
  );
}

// ========== 单元组件 — 内部查询章节列表 ==========
function UnitItem({ unit, projectId, volumeId, expanded, onToggle, statusLabel, openDialog, onAiEdit, onAiEditChapter }: {
  unit: { id: string; title: string; synopsis?: string | null };
  projectId: string; volumeId: string;
  expanded: boolean; onToggle: () => void;
  statusLabel: (s: string | null) => React.ReactNode;
  openDialog: (d: DialogType) => void;
  onAiEdit: (entityType: 'unit', id: string, title: string, synopsis: string | null | undefined) => void;
  onAiEditChapter: (entityType: 'chapter', id: string, title: string, synopsis: string | null | undefined) => void;
}) {
  const { data: chapterList } = trpc.project.listChapters.useQuery(
    { unitId: unit.id }, { enabled: expanded },
  );
  const utils = trpc.useUtils();
  const deleteUnit = trpc.project.deleteUnit.useMutation({
    onSuccess: () => { utils.project.listUnits.invalidate({ volumeId }); },
  });
  const updateUnit = trpc.project.updateUnit.useMutation({
    onSuccess: () => { utils.project.listUnits.invalidate({ volumeId }); },
  });

  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [synopsisText, setSynopsisText] = useState(unit.synopsis || '');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [synopsisError, setSynopsisError] = useState<string | null>(null);

  const { data: synopsisVersions } = trpc.project.listOutlineVersions.useQuery(
    { entityType: 'unit', entityId: unit.id },
    { enabled: showVersionModal },
  );
  const deleteVersion = trpc.project.deleteOutlineVersion.useMutation();
  const restoreVersion = trpc.project.restoreOutlineVersion.useMutation({
    onSuccess: () => { utils.project.listUnits.invalidate({ volumeId }); setShowVersionModal(false); },
  });

  const handleSaveSynopsis = async () => {
    setSynopsisError(null);
    try {
      await updateUnit.mutateAsync({ id: unit.id, volumeId, synopsis: synopsisText || undefined });
      setEditingSynopsis(false);
    } catch (e: any) {
      const msg = e?.message || '保存失败';
      if (msg.includes('已达上限')) {
        setShowVersionModal(true);
      } else {
        setSynopsisError(msg);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除单元「${unit.title}」？\n单元下的所有章节也将被移入回收站，30 天后自动清除。`)) return;
    await deleteUnit.mutateAsync({ id: unit.id, volumeId });
  };

  return (
    <div className="border border-gray-100 rounded-lg">
      <div className="flex items-start">
        <button onClick={onToggle} className="flex-1 text-left px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{unit.title}</span>
            {!editingSynopsis && !unit.synopsis && (
              <div className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600"
                onClick={() => { setEditingSynopsis(true); setSynopsisText(''); }}>+ 添加梗概</div>
            )}
          </div>
          <span className="text-gray-400 text-xs ml-2 shrink-0 mt-0.5">{expanded ? '▼' : '▶'}</span>
        </button>
        <button onClick={() => onAiEdit('unit', unit.id, unit.title, unit.synopsis)}
          className="px-2 text-xs text-indigo-500 hover:text-indigo-700 transition"
          title="AI 修改">
          AI 修改
        </button>
        <button onClick={handleDelete} disabled={deleteUnit.isPending}
          className="px-2 text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
          title="删除单元">
          删除
        </button>
      </div>

      {/* 梗概编辑区 */}
      {(editingSynopsis || unit.synopsis) && (
        <div className="px-4 pb-1">
          {editingSynopsis ? (
            <div>
              <textarea
                value={synopsisText}
                onChange={e => setSynopsisText(e.target.value)}
                className="w-full p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed"
                rows={2}
                placeholder="单元梗概..."
              />
              <div className="flex items-center gap-2 mt-1">
                <button onClick={handleSaveSynopsis}
                  disabled={updateUnit.isPending}
                  className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  保存
                </button>
                <button onClick={() => { setEditingSynopsis(false); setSynopsisText(unit.synopsis || ''); }}
                  className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
                  取消
                </button>
                {synopsisVersions && synopsisVersions.length > 0 && (
                  <button onClick={() => setShowVersionModal(true)}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600">
                    历史版本 ({synopsisVersions.length})
                  </button>
                )}
              </div>
              {synopsisError && <p className="text-xs text-red-500 mt-1">{synopsisError}</p>}
            </div>
          ) : unit.synopsis && !editingSynopsis ? (
            <div className="flex items-start justify-between">
              <div className="text-xs text-gray-600 leading-relaxed line-clamp-3 flex-1 cursor-pointer"
                onClick={() => { setEditingSynopsis(true); setSynopsisText(unit.synopsis || ''); }}>
                {unit.synopsis}
              </div>
              {synopsisVersions && synopsisVersions.length > 0 && (
                <button onClick={() => setShowVersionModal(true)}
                  className="ml-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">
                  历史 ({synopsisVersions.length})
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3 space-y-1">
          {chapterList?.map(ch => (
            <ChapterRow key={ch.id} ch={ch} projectId={projectId} unitId={unit.id}
              onAiEdit={onAiEditChapter} />
          ))}
          {chapterList?.length === 0 && <p className="text-xs text-gray-400 px-3">暂无章节</p>}
          <button onClick={() => openDialog({ type: 'chapter', unitId: unit.id })}
            className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1">+ 添加章节</button>
        </div>
      )}

      {showVersionModal && (
        <SynopsisVersionModal
          entityType="unit" entityId={unit.id} projectId={projectId}
          parentEntityId={volumeId}
          versions={synopsisVersions || []}
          onClose={() => setShowVersionModal(false)}
          onDeleteVersion={deleteVersion.mutateAsync}
          onRestoreVersion={restoreVersion.mutateAsync}
        />
      )}
    </div>
  );
}

// ========== 章节行 ==========
function ChapterRow({ ch, projectId, unitId, onAiEdit }: {
  ch: { id: string; title: string; synopsis?: string | null; status: string | null };
  projectId: string; unitId: string;
  onAiEdit: (entityType: 'chapter', id: string, title: string, synopsis: string | null | undefined) => void;
}) {
  const utils = trpc.useUtils();
  const deleteChapter = trpc.project.deleteChapter.useMutation({
    onSuccess: () => { utils.project.listChapters.invalidate({ unitId }); },
  });
  const updateChapterSynopsis = trpc.project.updateChapterSynopsis.useMutation({
    onSuccess: () => { utils.project.listChapters.invalidate({ unitId }); },
  });

  const statusLabel = (s: string | null) => {
    switch (s) {
      case 'final': return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已定稿</span>;
      case 'draft': return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">草稿</span>;
      default: return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">待创作</span>;
    }
  };

  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [synopsisText, setSynopsisText] = useState(ch.synopsis || '');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [synopsisError, setSynopsisError] = useState<string | null>(null);

  const { data: synopsisVersions } = trpc.project.listOutlineVersions.useQuery(
    { entityType: 'chapter', entityId: ch.id },
    { enabled: showVersionModal },
  );
  const deleteVersion = trpc.project.deleteOutlineVersion.useMutation();
  const restoreVersion = trpc.project.restoreOutlineVersion.useMutation({
    onSuccess: () => { utils.project.listChapters.invalidate({ unitId }); setShowVersionModal(false); },
  });

  const handleSaveSynopsis = async () => {
    setSynopsisError(null);
    try {
      await updateChapterSynopsis.mutateAsync({ id: ch.id, unitId, synopsis: synopsisText });
      setEditingSynopsis(false);
    } catch (e: any) {
      const msg = e?.message || '保存失败';
      if (msg.includes('已达上限')) {
        setShowVersionModal(true);
      } else {
        setSynopsisError(msg);
      }
    }
  };

  return (
    <div className="px-3 py-2 rounded hover:bg-gray-50 transition group">
      <div className="flex items-center justify-between">
        <Link href={`/project/${projectId}/chapter/${ch.id}`} className="flex-1">
          <span className="text-sm">{ch.title}</span>
          {!editingSynopsis && !ch.synopsis && (
            <div className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingSynopsis(true); setSynopsisText(''); }}>+ 添加梗概</div>
          )}
        </Link>
        {statusLabel(ch.status)}
        <button onClick={() => onAiEdit('chapter', ch.id, ch.title, ch.synopsis)}
          className="ml-2 px-1.5 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600 transition"
          title="AI 修改">
          AI 修改
        </button>
        <button onClick={async () => {
          if (!confirm(`确认删除章节「${ch.title}」？\n章节将被移入回收站，30 天后自动清除。`)) return;
          await deleteChapter.mutateAsync({ id: ch.id, unitId });
        }} disabled={deleteChapter.isPending}
          className="ml-2 px-1.5 text-xs text-red-300 opacity-0 group-hover:opacity-100 hover:text-red-600 transition disabled:opacity-50"
          title="删除章节">
          删除
        </button>
      </div>

      {/* 梗概编辑区 */}
      {(editingSynopsis || ch.synopsis) && (
        <div className="mt-1">
          {editingSynopsis ? (
            <div>
              <textarea
                value={synopsisText}
                onChange={e => setSynopsisText(e.target.value)}
                className="w-full p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed"
                rows={2}
                placeholder="章节梗概..."
              />
              <div className="flex items-center gap-2 mt-1">
                <button onClick={handleSaveSynopsis}
                  disabled={updateChapterSynopsis.isPending}
                  className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  保存
                </button>
                <button onClick={() => { setEditingSynopsis(false); setSynopsisText(ch.synopsis || ''); }}
                  className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
                  取消
                </button>
                {synopsisVersions && synopsisVersions.length > 0 && (
                  <button onClick={() => setShowVersionModal(true)}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600">
                    历史版本 ({synopsisVersions.length})
                  </button>
                )}
              </div>
              {synopsisError && <p className="text-xs text-red-500 mt-1">{synopsisError}</p>}
            </div>
          ) : ch.synopsis && !editingSynopsis ? (
            <div className="flex items-start justify-between">
              <div className="text-xs text-gray-600 leading-relaxed line-clamp-3 flex-1 cursor-pointer"
                onClick={() => { setEditingSynopsis(true); setSynopsisText(ch.synopsis || ''); }}>
                {ch.synopsis}
              </div>
              {synopsisVersions && synopsisVersions.length > 0 && (
                <button onClick={() => setShowVersionModal(true)}
                  className="ml-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">
                  历史 ({synopsisVersions.length})
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {showVersionModal && (
        <SynopsisVersionModal
          entityType="chapter" entityId={ch.id} projectId={projectId}
          parentEntityId={unitId}
          versions={synopsisVersions || []}
          onClose={() => setShowVersionModal(false)}
          onDeleteVersion={deleteVersion.mutateAsync}
          onRestoreVersion={restoreVersion.mutateAsync}
        />
      )}
    </div>
  );
}

// ========== 大纲版本弹窗 ==========
function SynopsisVersionModal({ entityType, entityId, projectId, parentEntityId, versions, onClose, onDeleteVersion, onRestoreVersion }: {
  entityType: 'volume' | 'unit' | 'chapter';
  entityId: string;
  projectId: string;
  parentEntityId: string;
  versions: { id: string; versionNumber: number; synopsis: string; createdAt: string | null }[];
  onClose: () => void;
  onDeleteVersion: (input: { versionId: string; projectId: string }) => Promise<unknown>;
  onRestoreVersion: (input: { versionId: string; projectId: string; entityType: 'volume' | 'unit' | 'chapter'; entityId: string; parentEntityId?: string }) => Promise<{ synopsis: string }>;
}) {
  const [viewingVersion, setViewingVersion] = useState<typeof versions[0] | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] mx-4 shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium mb-3">
          {entityType === 'volume' ? '卷' : entityType === 'unit' ? '单元' : '章节'}梗概版本
        </h3>

        {/* 版本列表 */}
        <div className="max-h-64 overflow-y-auto mb-4 border border-gray-100 rounded-lg bg-gray-50">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">暂无历史版本</p>
          ) : (
            versions.map(v => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
                <div className="text-xs flex-1 cursor-pointer" onClick={() => setViewingVersion(v)}>
                  <span className="font-medium">v{v.versionNumber}</span>
                  <span className="text-gray-400 ml-2">
                    {v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}
                  </span>
                  <span className="text-gray-500 ml-2 line-clamp-1">
                    {v.synopsis.slice(0, 40)}...
                  </span>
                </div>
                <div className="flex gap-2 ml-2 shrink-0">
                  <button onClick={() => setViewingVersion(v)}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                    查看
                  </button>
                  {restoreConfirm === v.id ? (
                    <div className="flex gap-1">
                      <button onClick={async () => {
                        await onRestoreVersion({ versionId: v.id, projectId, entityType, entityId, parentEntityId });
                        setRestoreConfirm(null);
                        setViewingVersion(null);
                      }}
                        className="text-xs text-green-600 hover:text-green-800 font-medium">
                        确认
                      </button>
                      <button onClick={() => setRestoreConfirm(null)}
                        className="text-xs text-gray-400 hover:text-gray-600">
                        取消
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setRestoreConfirm(v.id)}
                      className="text-xs text-amber-500 hover:text-amber-700 font-medium">
                      恢复
                    </button>
                  )}
                  <button onClick={async () => { await onDeleteVersion({ versionId: v.id, projectId }); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium">
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            关闭
          </button>
        </div>

        {/* 恢复确认提示 */}
        {restoreConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setRestoreConfirm(null)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-medium mb-2">确认恢复</h4>
              <p className="text-xs text-gray-600 mb-4">
                恢复此版本将<strong>覆盖当前梗概</strong>，当前梗概内容将被替换为该历史版本。是否继续？
              </p>
              <div className="flex gap-2">
                <button onClick={() => setRestoreConfirm(null)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                  取消
                </button>
                <button onClick={async () => {
                  const v = versions.find(x => x.id === restoreConfirm);
                  if (v) {
                    await onRestoreVersion({ versionId: v.id, projectId, entityType, entityId, parentEntityId });
                    setRestoreConfirm(null);
                    setViewingVersion(null);
                  }
                }}
                  className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                  确认恢复
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 版本全文查看 */}
        {viewingVersion && !restoreConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setViewingVersion(null)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-medium mb-2">
                v{viewingVersion.versionNumber} 梗概全文
              </h4>
              <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto border border-gray-100">
                {viewingVersion.synopsis}
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={() => setViewingVersion(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 章节选择器（用于导出） ==========
function ChapterSelector({ projectId, selected, onChange }: {
  projectId: string;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const { data: volumeList } = trpc.project.listVolumes.useQuery({ projectId });

  const toggleChapter = (chId: string) => {
    const next = new Set(selected);
    if (next.has(chId)) next.delete(chId);
    else next.add(chId);
    onChange(next);
  };

  return (
    <>
      {volumeList?.map(vol => (
        <VolumeChapterSelector key={vol.id} volumeId={vol.id} selected={selected} onToggle={toggleChapter} />
      ))}
    </>
  );
}

function VolumeChapterSelector({ volumeId, selected, onToggle }: {
  volumeId: string;
  selected: Set<string>;
  onToggle: (chId: string) => void;
}) {
  const { data: unitList } = trpc.project.listUnits.useQuery({ volumeId });

  return (
    <>
      {unitList?.map(unit => (
        <UnitChapterSelector key={unit.id} unitId={unit.id} selected={selected} onToggle={onToggle} />
      ))}
    </>
  );
}

function UnitChapterSelector({ unitId, selected, onToggle }: {
  unitId: string;
  selected: Set<string>;
  onToggle: (chId: string) => void;
}) {
  const { data: chapters } = trpc.project.listChapters.useQuery({ unitId });

  return (
    <>
      {chapters?.filter(ch => ch.status === 'final').map(ch => (
        <label key={ch.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(ch.id)}
            onChange={() => onToggle(ch.id)}
            className="w-4 h-4 rounded border-gray-300 text-gray-900"
          />
          <span className="text-sm text-gray-700">{ch.title}</span>
        </label>
      ))}
    </>
  );
}

// ========== 全书梗概编辑区 ==========
function NarrativeSection({ projectId, storyNarrative }: {
  projectId: string;
  storyNarrative: { id: string; title: string; content: string } | null | undefined;
}) {
  const utils = trpc.useUtils();
  const [narrativeContent, setNarrativeContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateNarrative = trpc.project.updateNarrative.useMutation({
    onSuccess: () => {
      utils.project.getNarrative.invalidate({ projectId });
    },
  });

  useEffect(() => {
    if (storyNarrative?.content && !editing) {
      setNarrativeContent(storyNarrative.content);
    }
  }, [storyNarrative?.content, editing]);

  const handleSave = async () => {
    if (!storyNarrative?.id) return;
    setSaving(true);
    try {
      await updateNarrative.mutateAsync({
        id: storyNarrative.id,
        projectId,
        content: narrativeContent,
      });
      setEditing(false);
    } catch {
      alert('保存失败');
    }
    setSaving(false);
  };

  if (!storyNarrative) return null;

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">全书梗概</h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="px-3 py-1 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => { setEditing(false); setNarrativeContent(storyNarrative.content); }}
                className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 transition">
                取消
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:border-gray-500 transition">
              编辑
            </button>
          )}
        </div>
      </div>
      <div className="p-5">
        {editing ? (
          <textarea
            value={narrativeContent}
            onChange={e => setNarrativeContent(e.target.value)}
            className="w-full h-40 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono leading-relaxed"
            placeholder="编辑全书故事脉络..."
          />
        ) : (
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {storyNarrative.content || '（暂无全书梗概，可通过 AI 构思生成）'}
          </div>
        )}
      </div>
    </div>
  );
}
