'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { ChatPanel } from '@/components/chat/chat-panel';

type DialogMode = null | 'category' | 'entry' | { type: 'edit'; id: string };

export default function ProjectSettingsPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [inputTitle, setInputTitle] = useState('');
  const [inputContent, setInputContent] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: allSettings, isLoading } = trpc.project.listSettings.useQuery({ projectId });
  const { data: deletedSettings } = trpc.project.listDeletedSettings.useQuery({ projectId }, { enabled: showDeleted });
  // 加载完整大纲树（用于 AI 创作上下文）
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: chatOpen },
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

  const dialogTitle = dialog === 'category' ? '新建类目' : dialog === 'entry' ? '新建词条' : dialog ? '编辑词条' : '';

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>;
  }
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href={`/project/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回项目</Link>
        <div className="flex items-center justify-between mt-4 mb-6">
          <h1 className="text-2xl font-bold">设定管理</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowDeleted(!showDeleted)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition ${showDeleted ? 'border-orange-300 text-orange-600 bg-orange-50' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
              回收站{deletedSettings && deletedSettings.length > 0 ? ` (${deletedSettings.length})` : ''}
            </button>
            <button onClick={() => setChatOpen(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              AI 设定
            </button>
            <button onClick={() => openDialog('category')}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              + 新建类目
            </button>
            <button onClick={() => openDialog('entry')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              + 新建词条
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

        <div className="flex gap-6">
          {/* 左侧类目列表 */}
          <div className="w-48 shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setActiveCategory(null)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 transition ${!activeCategory ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                全部 ({allSettings?.length ?? 0})
              </button>
              {categories.map(cat => {
                const count = allSettings?.filter(s => s.category === cat).length ?? 0;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition ${activeCategory === cat ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>
          {/* 右侧词条列表 */}
          <div className="flex-1 space-y-3">
            {entries.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="mb-2">暂无设定词条</p>
                <button onClick={() => openDialog('entry')} className="text-gray-900 font-medium hover:underline">点击新建第一个词条</button>
              </div>
            ) : entries.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{s.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{s.category}</span>
                    <button onClick={() => openDialog({ type: 'edit', id: s.id })} className="text-xs text-gray-400 hover:text-gray-600">编辑</button>
                    <button onClick={() => handleDelete(s.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 whitespace-pre-wrap">{s.content || '（无内容）'}</p>
              </div>
            ))}
          </div>
        </div>
        )}
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

      {/* 构建 AI 上下文：已有设定 + 大纲结构 */}
      {(() => {
        let ctx = '';
        if (allSettings && allSettings.length > 0) {
          const cats = [...new Set(allSettings.map(s => s.category))];
          ctx += `## 已创建的设定类目\n${cats.join('、')}\n\n`;
          ctx += `## 已有设定条目（共 ${allSettings.length} 条）\n`;
          allSettings.slice(0, 30).forEach(s => {
            ctx += `[${s.category}] ${s.title}: ${s.content.slice(0, 200)}\n`;
          });
          ctx += '\n';
        }
        if (outlineTree && outlineTree.length > 0) {
          ctx += `## 大纲结构\n`;
          outlineTree.forEach(vol => {
            ctx += `卷：${vol.title}`;
            if (vol.synopsis) ctx += ` — ${vol.synopsis}`;
            ctx += '\n';
            (vol as any).units?.forEach((unit: any) => {
              ctx += `  单元：${unit.title}`;
              if (unit.synopsis) ctx += ` — ${unit.synopsis}`;
              ctx += '\n';
              unit.chapters?.forEach((ch: any) => {
                ctx += `    章节：${ch.title}`;
                if (ch.synopsis) ctx += ` — ${ch.synopsis}`;
                ctx += '\n';
              });
            });
          });
          ctx += '\n请确保新创建的设定与以上大纲结构保持一致。\n';
        }
        if (!ctx) {
          ctx = '（项目尚无大纲和设定，请根据用户的要求逐步搭建世界观和设定体系）\n\n';
        }
        return (
          <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
            projectId={projectId} conversationType="settings" roleKey="setting_editor" title="AI 设定"
            fullOutline={outlineTree}
            customContextPrompt={ctx}
            onActionConfirmed={() => utils.project.listSettings.invalidate({ projectId })} />
        );
      })()}
    </div>
  );
}
