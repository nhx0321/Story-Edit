'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { ChatPanel } from '@/components/chat/chat-panel';
import { SettingRelationGraph } from '@/components/settings/setting-relation-graph';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';

type DialogMode = null | 'category' | 'entry' | { type: 'edit'; id: string };

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const progress = useWorkflowProgress(projectId);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });

  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.refetch]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [inputTitle, setInputTitle] = useState('');
  const [inputContent, setInputContent] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const openChatAndScroll = (open = true) => {
    setChatOpen(open);
    if (open) setTimeout(() => document.getElementById('chat-panel-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const [showDeleted, setShowDeleted] = useState(false);
  // AI 修改覆盖
  const [aiEditSetting, setAiEditSetting] = useState<{ id: string; title: string; content: string; category: string } | null>(null);
  const [aiEditChatOpen, setAiEditChatOpen] = useState(false);
  const [aiEditContextPrompt, setAiEditContextPrompt] = useState('');
  // 设定补充建议
  const [supplementDialogOpen, setSupplementDialogOpen] = useState(false);
  const [supplementDialogShown, setSupplementDialogShown] = useState(false);
  const [supplementContext, setSupplementContext] = useState<string | null>(null);
  // 关系图谱
  const [showRelationGraph, setShowRelationGraph] = useState(false);
  // 将词条导入大纲
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());

  const handleImportSettingsToOutline = () => {
    setSelectedImportIds(new Set());
    setImportDialogOpen(true);
  };

  const confirmImportSettings = () => {
    const ids = Array.from(selectedImportIds);
    if (ids.length === 0) return;
    setImportDialogOpen(false);
    // 携带参数跳转大纲页
    window.location.href = `/project/${projectId}/outline?importSettings=true&settingIds=${ids.join(',')}`;
  };

  const { data: allSettings, isLoading } = trpc.project.listSettings.useQuery({ projectId });
  const { data: deletedSettings } = trpc.project.listDeletedSettings.useQuery({ projectId }, { enabled: showDeleted });
  const { data: allRelations } = trpc.project.listRelationships.useQuery({ projectId });
  // 加载完整大纲树（用于 AI 创作上下文 + 设定补充分析）
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: true },
  );

  // 自动检测：是否向用户建议补充设定
  useEffect(() => {
    if (!outlineTree || !allSettings || supplementDialogShown) return;
    if (outlineTree.length === 0 || allSettings.length === 0) return;

    const hasSynopsis = (outlineTree as any[]).some((vol: any) => {
      if (vol.synopsis?.trim()) return true;
      return (vol.units || []).some((unit: any) => {
        if (unit.synopsis?.trim()) return true;
        return (unit.chapters || []).some((ch: any) => ch.synopsis?.trim());
      });
    });

    if (hasSynopsis) {
      setSupplementDialogOpen(true);
      setSupplementDialogShown(true);
    }
  }, [outlineTree, allSettings, supplementDialogShown]);

  // 加载故事脉络（用于 setting_editor 角色）
  const { data: storyNarrative } = trpc.project.getNarrative.useQuery(
    { projectId },
  );
  const utils = trpc.useUtils();

  const createSetting = trpc.project.createSetting.useMutation({
    onSuccess: () => { utils.project.listSettings.invalidate({ projectId }); },
  });
  const updateSetting = trpc.project.updateSetting.useMutation({
    onSuccess: () => { utils.project.listSettings.invalidate({ projectId }); },
  });
  const deleteSetting = trpc.project.deleteSetting.useMutation({
    onSuccess: () => { utils.project.listSettings.invalidate({ projectId }); },
  });
  const restoreSetting = trpc.project.restoreSetting.useMutation({
    onSuccess: () => {
      utils.project.listSettings.invalidate({ projectId });
      utils.project.listDeletedSettings.invalidate({ projectId });
    },
  });
  const createRelation = trpc.project.createRelationship.useMutation({
    onSuccess: () => {
      utils.project.listRelationships.invalidate({ projectId });
    },
  });
  const deleteRelation = trpc.project.deleteRelationship.useMutation({
    onSuccess: () => {
      utils.project.listRelationships.invalidate({ projectId });
    },
  });

  // 缓存 customContextPrompt，避免每次渲染创建新字符串触发 ChatPanel 重渲染
  const settingsContextPrompt = useMemo(() => {
    let ctx = '';
    if (supplementContext) ctx += supplementContext + '\n\n';
    if (allSettings && allSettings.length > 0) {
      const cats = [...new Set(allSettings.map(s => s.category))];
      ctx += `## 已创建的设定类目\n${cats.join('、')}\n\n`;
      ctx += `## 已有设定条目（共 ${allSettings.length} 条）\n`;
      allSettings.slice(0, 30).forEach(s => {
        ctx += `[${s.category}] ${s.title}: ${s.content.slice(0, 200)}\n`;
      });
      ctx += '\n';
    }
    if (!ctx) {
      ctx = '（项目尚无设定，请根据用户的要求逐步搭建世界观和设定体系）\n\n';
    }
    return ctx;
  }, [supplementContext, allSettings]);

  // 从数据中提取类目列表
  const categories = useMemo(() => {
    if (!allSettings) return [];
    const cats = [...new Set(allSettings.map(s => s.category))];
    return cats.sort();
  }, [allSettings]);

  // 当前类目下的词条
  const entries = useMemo(() => {
    if (!allSettings) return [];
    if (!activeCategory) return allSettings;
    return allSettings.filter(s => s.category === activeCategory);
  }, [allSettings, activeCategory]);
  // 自动选中第一个类目
  const effectiveCategory = activeCategory ?? categories[0] ?? null;

  const openDialog = (mode: DialogMode) => {
    setInputTitle('');
    setInputContent('');
    setInputCategory('');
    if (mode && typeof mode === 'object' && mode.type === 'edit') {
      const item = allSettings?.find(s => s.id === mode.id);
      if (item) {
        setInputTitle(item.title);
        setInputContent(item.content);
        setInputCategory(item.category);
      }
    }
    setDialog(mode);
  };

  const handleSupplementConfirm = () => {
    setSupplementDialogOpen(false);

    // 构建 AI 分析上下文：梗概 + 现有设定
    let ctx = '## 设定补充分析任务\n\n';
    ctx += '请分析以下故事梗概和现有设定条目，主动提出设定补充建议。注意：\n\n';
    ctx += '1. **分析现有设定覆盖度**：列出已有的设定维度，并有针对性地指出哪些方面已经完善、哪些方面仍有缺失\n';
    ctx += '2. **主动询问用户需求**：AI不仅提供分析结果，还要主动询问用户"是否需要补充某个方面的设定"\n';
    ctx += '3. **建议补充维度**：根据故事类型（如玄幻、都市、科幻等），主动建议可能需要的额外设定维度，例如：\n';
    ctx += '   - 玄幻/仙侠：修炼等级、功法体系、丹药灵草、秘境副本\n';
    ctx += '   - 都市：社会阶层、经济体系、人物关系网\n';
    ctx += '   - 科幻：科技树、外星文明、时间线\n';
    ctx += '4. **优先级排序**：按对故事创作的重要性排序，标注高/中/低优先级\n';
    ctx += '5. **对梗概的影响**：说明缺少这些设定对已有章节可能造成的影响\n';
    ctx += '6. **具体补充建议**：对每个建议补充的设定，给出「类目、标题、内容建议」\n\n';

    ctx += '## 现有故事梗概\n';
    for (const vol of (outlineTree || []) as any[]) {
      ctx += `### ${vol.title}\n`;
      if (vol.synopsis) ctx += `${vol.synopsis}\n\n`;
      for (const unit of (vol.units || [])) {
        ctx += `- ${unit.title}${unit.synopsis ? `：${unit.synopsis.slice(0, 200)}` : ''}\n`;
        for (const ch of (unit.chapters || [])) {
          ctx += `  - ${ch.title}${ch.synopsis ? `：${ch.synopsis.slice(0, 200)}` : ''}\n`;
        }
      }
      ctx += '\n';
    }

    setSupplementContext(ctx);
    openChatAndScroll();
  };

  const handleConfirm = async () => {
    if (dialog === 'category') {
      if (!inputTitle.trim()) return;
      await createSetting.mutateAsync({ projectId, category: inputTitle.trim(), title: '默认词条', content: '' });
      setActiveCategory(inputTitle.trim());
    } else if (dialog === 'entry') {
      if (!inputTitle.trim()) return;
      const cat = effectiveCategory || '未分类';
      await createSetting.mutateAsync({ projectId, category: cat, title: inputTitle.trim(), content: inputContent });
    } else if (dialog && typeof dialog === 'object' && dialog.type === 'edit') {
      await updateSetting.mutateAsync({ id: dialog.id, projectId, title: inputTitle.trim() || undefined, content: inputContent || undefined, category: inputCategory || undefined });
    }
    setDialog(null);
  };

  const handleDelete = async (id: string) => {
    await deleteSetting.mutateAsync({ id, projectId });
  };

  const handleRestore = async (id: string) => {
    await restoreSetting.mutateAsync({ id, projectId });
  };

  // AI 修改：打开 ChatPanel，带入已有设定内容
  const handleAiEditSetting = async (id: string, title: string, content: string, category: string) => {
    let ctx = `## 当前设定内容\n类目：${category}\n标题：${title}\n内容：${content || '（暂无）'}\n\n`;

    // 附加其他设定作为参考
    const otherSettings = allSettings?.filter(s => s.id !== id) || [];
    if (otherSettings.length > 0) {
      ctx += `## 其他相关设定（仅供参考，不要修改）\n`;
      otherSettings.slice(0, 15).forEach(s => {
        ctx += `[${s.category}] ${s.title}: ${s.content.slice(0, 200)}\n`;
      });
      ctx += '\n';
    }

    ctx += `请帮助用户修改上述设定内容。用户会提出修改要求，AI 进行修改后，输出 [ACTION:update_setting] 指令以覆盖原内容。\n指令参数需包含 id: "${id}", title, content, category。`;

    setAiEditSetting({ id, title, content, category });
    setAiEditContextPrompt(ctx);
    setAiEditChatOpen(true);
  };

  const dialogTitle = dialog === 'category' ? '新建类目' : dialog === 'entry' ? '新建词条' : dialog ? '编辑词条' : '';

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
        currentPath="/settings"
        progress={progress}
      />
      <main className="flex-1 overflow-y-auto p-8">
          <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 px-8 pt-8">
            <Link href="/dashboard" className="hover:text-gray-900 transition">项目列表</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/project/${projectId}`} className="hover:text-gray-900 transition">概览</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">设定管理</span>
            {progress.settingComplete && <span className="text-green-500 text-xs font-bold ml-0.5" title="设定管理完成">✓</span>}
            {progress.hasChapters && !progress.settingComplete && <span className="text-amber-500 text-[10px] animate-pulse ml-0.5" title="可开始设定">→</span>}
          </div>

        {/* R8: 如果未创建全书简介（故事脉络），提示用户回到大纲编辑 */}
        {(!storyNarrative || !storyNarrative.content) && (
          <div className="mx-8 mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-sm text-amber-800">
              还未创建全书简介（故事脉络），请回到
              <Link href={`/project/${projectId}/outline`} className="text-amber-900 font-bold hover:underline mx-1">大纲编辑</Link>
              与AI对话，完成全书简介（故事脉络）后我会自动为您创建各项基础设定。
            </p>
          </div>
        )}
        <div className="px-8 flex items-center justify-between mt-4 mb-6">
          <h1 className="text-2xl font-bold">设定管理</h1>
          <div className="flex gap-2">
            {/* AI 设定 — 黑底白字，最左侧 */}
            <button onClick={() => openChatAndScroll()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              AI 创建设定
            </button>
            <button onClick={() => openDialog('category')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-500 transition">
              + 新建类目
            </button>
            <button onClick={() => openDialog('entry')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              + 新建词条
            </button>
            <button onClick={() => setShowRelationGraph(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition"
              title="设定关系图谱">
              关系图谱
            </button>
            {/* 将词条导入大纲 — 新增按钮 */}
            <button onClick={handleImportSettingsToOutline}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              将词条导入大纲
            </button>
            <button onClick={() => setShowDeleted(!showDeleted)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition ${showDeleted ? 'border-orange-300 text-orange-600 bg-orange-50' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
              回收站{deletedSettings && deletedSettings.length > 0 ? ` (${deletedSettings.length})` : ''}
            </button>
          </div>
        </div>

        {showDeleted ? (
          /* 回收站视图 */
          <div>
            {(!deletedSettings || deletedSettings.length === 0) ? (
              <div className="text-center py-16 text-gray-400"><p>回收站为空</p><p className="text-sm mt-2">删除的设定会在此处保留 30 天</p></div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-orange-600 mb-2">已删除的设定 — 30 天后自动清除</p>
                {deletedSettings.map(s => (
                  <div key={s.id} className="bg-white rounded-xl border border-orange-200 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-orange-800">{s.title}</h3>
                        <span className="text-xs text-gray-400">{s.category}</span>
                      </div>
                      <button onClick={() => handleRestore(s.id)}
                        disabled={restoreSetting.isPending}
                        className="px-3 py-1 text-xs text-green-600 hover:text-green-800 border border-green-200 rounded transition disabled:opacity-50">
                        恢复
                      </button>
                    </div>
                    <p className="text-sm text-gray-500 whitespace-pre-wrap">{s.content || '（无内容）'}</p>
                    {s.deletedAt && (
                      <p className="text-xs text-gray-400 mt-2">删除于 {new Date(s.deletedAt).toLocaleDateString('zh-CN')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (

        <div className="flex gap-0 flex-1">
          {/* 左侧类目列表 — 竖排紧贴ProjectSidebar */}
          <div className="w-48 shrink-0 border-r border-gray-200 bg-white">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">设定类目</h3>
            </div>
            <div className="p-2 space-y-0.5">
              <button onClick={() => setActiveCategory(null)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition ${!activeCategory ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                <span className="font-medium">全部</span>
                <span className="text-xs ml-2 opacity-60">({allSettings?.length ?? 0})</span>
              </button>
              {categories.map(cat => {
                const count = allSettings?.filter(s => s.category === cat).length ?? 0;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition ${activeCategory === cat ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                    <span className="truncate">{cat}</span>
                    <span className="text-xs ml-2 opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* 右侧词条列表 */}
          <div className="flex-1 p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.length === 0 ? (
              <div className="text-center py-4 text-gray-400 col-span-full">
                <p className="text-sm">尚未创建设定词条，请在大纲编辑页面与文学编辑对话完成全书简介，我将根据全书简介自动创建基础设定</p>
              </div>
            ) : entries.map(s => (
              <CollapsibleEntry key={s.id} s={s}
                onAiEdit={() => handleAiEditSetting(s.id, s.title, s.content, s.category)}
                onEdit={() => openDialog({ type: 'edit', id: s.id })}
                onDelete={() => handleDelete(s.id)} />
            ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ChatPanel below button bar */}
      <div id="chat-panel-anchor" className="mt-6 border-t pt-6">
        <ChatPanel open={chatOpen} onClose={() => { setChatOpen(false); setSupplementContext(null); }}
          projectId={projectId} conversationType="settings" roleKey="setting_editor"
          title={supplementContext ? '设定补充分析' : '请与AI对话，我将协助您自动创建内容。分步骤完成全书简介——基础设定——卷、单元、章节梗概——章节正文创作'}
          minimizedTitle="AI 创建设定"
          mode="inline"
          fullOutline={outlineTree}
          storyNarrative={storyNarrative}
          customContextPrompt={settingsContextPrompt}
          onActionConfirmed={() => utils.project.listSettings.invalidate({ projectId })}
          onNavigateToOutline={() => { window.location.href = `/project/${projectId}/outline`; }} />
      </div>

      {/* 弹窗 */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDialog(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{dialogTitle}</h3>
            <div className="space-y-3">
              {dialog === 'category' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类目名称</label>
                  <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="如：人物设定、世界观、道具" autoFocus />
                </div>
              ) : (
                <>
                  {dialog && typeof dialog === 'object' && dialog.type === 'edit' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">类目</label>
                      <input type="text" value={inputCategory} onChange={e => setInputCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="词条标题" autoFocus />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                    <textarea value={inputContent} onChange={e => setInputContent(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 h-32 resize-none"
                      placeholder="设定详细内容" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDialog(null)} className="px-4 py-2 text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={handleConfirm}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 将词条导入大纲 对话框 */}
      {importDialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setImportDialogOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">选择要导入大纲的设定词条</h3>
            <p className="text-sm text-gray-500 mb-4">勾选需要导入到故事大纲中的设定词条，确认后将跳转到大纲页。</p>
            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
              {(allSettings || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无设定词条</p>
              ) : (
                allSettings!.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedImportIds.has(s.id)}
                      onChange={() => {
                        const next = new Set(selectedImportIds);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        setSelectedImportIds(next);
                      }}
                      className="rounded border-gray-300" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400">{s.category}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedImportIds(new Set(allSettings!.map(s => s.id)))}
                className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 transition">
                一键全部导入
              </button>
              <button onClick={() => setImportDialogOpen(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={confirmImportSettings}
                disabled={selectedImportIds.size === 0}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                确认导入 ({selectedImportIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 设定补充建议对话框 */}
      {supplementDialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSupplementDialogOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">补充设定建议</h3>
            <p className="text-sm text-gray-600 mb-2">
              检测到已有故事梗概和设定词条，是否需要AI检查当前设定体系是否完善，并根据梗概内容提出补充建议？
            </p>
            <p className="text-xs text-gray-400 mb-4">
              AI将分析梗概中可能缺失的设定维度，按重要性排序给出补充建议。
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setSupplementDialogOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900">暂不需要</button>
              <button onClick={handleSupplementConfirm}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">开始分析</button>
            </div>
          </div>
        </div>
      )}

      {/* 关系图谱 */}
      {showRelationGraph && (
        <SettingRelationGraph
          settings={allSettings?.map(s => ({ id: s.id, category: s.category, title: s.title, content: s.content })) || []}
          relations={allRelations?.map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId, relationType: r.relationType, description: r.description })) || []}
          onCreateRelation={(sourceId, targetId, relationType) => {
            createRelation.mutate({ projectId, sourceId, targetId, relationType });
          }}
          onDeleteRelation={(id) => {
            deleteRelation.mutate({ id, projectId });
          }}
          onClose={() => setShowRelationGraph(false)}
        />
      )}

      {/* AI 修改设定 ChatPanel */}
      {aiEditChatOpen && (
        <ChatPanel open={aiEditChatOpen} onClose={() => { setAiEditChatOpen(false); setAiEditSetting(null); }}
          projectId={projectId} conversationType="settings" roleKey="setting_editor"
          title={`AI 修改 — ${aiEditSetting?.title || ''}`}
          minimizedTitle="AI 创建设定"
          mode="inline"
          fullOutline={outlineTree}
          storyNarrative={storyNarrative}
          customContextPrompt={aiEditContextPrompt}
          onActionConfirmed={() => {
            utils.project.listSettings.invalidate({ projectId });
          }} />
      )}

      </main>
    </div>
  );
}

// ========== 可折叠词条卡片组件 ==========
function CollapsibleEntry({ s, onAiEdit, onEdit, onDelete }: {
  s: { id: string; title: string; content: string; category: string };
  onAiEdit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-400 transition">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 shrink-0">{expanded ? '▼' : '▶'}</span>
          <h3 className="font-medium text-sm truncate">{s.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{s.category}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-500 whitespace-pre-wrap mb-3">{s.content || '（无内容）'}</p>
        </div>
      )}
      {/* 按钮在头部右侧 — 折叠/展开时均显示 */}
      <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-t border-gray-100" onClick={e => e.stopPropagation()}>
        <button onClick={onAiEdit} className="text-xs text-indigo-500 hover:text-indigo-700 transition font-medium" title="AI 修改">AI 修改</button>
        <span className="text-gray-200">|</span>
        <button onClick={onEdit} className="text-xs text-gray-400 hover:text-gray-600 transition">编辑</button>
        <span className="text-gray-200">|</span>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition">删除</button>
      </div>
    </div>
  );
}
