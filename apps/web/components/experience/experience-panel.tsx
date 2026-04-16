'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { SlidePanel } from '@/components/ui/slide-panel';
import { ExperienceTemplateImport } from './experience-template-import';

type LevelFilter = 'all' | 'L0' | 'L1' | 'L2' | 'L3';

const LEVEL_COLORS: Record<string, string> = {
  L0: 'bg-red-100 text-red-700 border-red-200',
  L1: 'bg-orange-100 text-orange-700 border-orange-200',
  L2: 'bg-blue-100 text-blue-700 border-blue-200',
  L3: 'bg-green-100 text-green-700 border-green-200',
};

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  L0: '核心创作铁律 · 每章创作前AI必读',
  L1: '项目特色要求 · 要求AI贯彻风格',
  L2: '近三章重点/常犯问题 · 重视和规避',
  L3: '修改对比经验示例 · 自动滚动替换',
};

const TABS: { key: LevelFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'L0', label: 'L0' },
  { key: 'L1', label: 'L1' },
  { key: 'L2', label: 'L2' },
  { key: 'L3', label: 'L3' },
];

interface ExperiencePanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSeedDefaults?: () => void;
}

export function ExperiencePanel({ open, onClose, projectId, onSeedDefaults }: ExperiencePanelProps) {
  const [activeTab, setActiveTab] = useState<LevelFilter>('all');
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editLevel, setEditLevel] = useState<string>('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newLevel, setNewLevel] = useState<'L0' | 'L1' | 'L2' | 'L3'>('L2');
  const [newCategory, setNewCategory] = useState('');

  const levelFilter = activeTab === 'all' ? undefined : activeTab;

  const { data: memories, refetch } = trpc.workflow.getMemories.useQuery(
    { projectId, level: levelFilter },
    { enabled: open },
  );

  const createMemory = trpc.workflow.createMemory.useMutation({
    onSuccess: () => { refetch(); setShowNewForm(false); setNewContent(''); setNewCategory(''); },
  });

  const updateMemory = trpc.workflow.updateMemory.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); },
  });

  const deleteMemory = trpc.workflow.deleteMemory.useMutation({
    onSuccess: () => refetch(),
  });

  const exportMemory = trpc.workflow.exportMemoryAsTemplate.useMutation({
    onSuccess: () => alert('已导出为用户模板'),
  });

  const exportAllToLibrary = trpc.workflow.exportAllMemoriesToTemplate.useMutation({
    onSuccess: (data) => {
      refetch();
      alert(`已导出 ${('count' in data ? data.count : 0)} 条经验到模板库`);
    },
    onError: (e) => alert(e.message),
  });

  const seedDefaultExperiences = trpc.workflow.seedDefaultExperiences.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data.seeded) {
        alert(`已初始化 ${('count' in data ? data.count : 0)} 条预设经验`);
      } else {
        alert('已有经验条目，跳过初始化');
      }
      onSeedDefaults?.();
    },
  });

  const handleStartEdit = (memory: { id: string; level: string; category: string | null; content: string }) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditLevel(memory.level);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateMemory.mutate({
      memoryId: editingId,
      content: editContent,
      level: editLevel as 'L0' | 'L1' | 'L2' | 'L3',
    });
  };

  const handleCreate = () => {
    if (!newContent.trim()) return;
    createMemory.mutate({
      projectId,
      level: newLevel,
      category: newCategory || undefined,
      content: newContent,
    });
  };

  return (
    <>
      <SlidePanel open={open} onClose={onClose} title="创作经验管理" width="w-[520px]">
        <div className="flex flex-col h-full">
          {/* 等级 Tab */}
          <div className="flex border-b border-gray-100 px-3">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? 'border-b-2 border-gray-900 text-gray-900 bg-gray-50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 经验列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {memories && memories.length > 0 ? (
              memories.map(m => (
                <div key={m.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  {/* 头部：等级 + 分类 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[m.level]}`}>
                        {m.level}
                      </span>
                      {m.category && (
                        <span className="text-xs text-gray-500">{m.category}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportMemory.mutate({ memoryId: m.id })}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1"
                        title="导出为模板"
                      >
                        导出
                      </button>
                      <button
                        onClick={() => handleStartEdit(m)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('确定删除此经验？')) deleteMemory.mutate({ memoryId: m.id });
                        }}
                        className="text-xs text-red-400 hover:text-red-600 px-1"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {/* 内容 */}
                  {editingId === m.id ? (
                    <div className="space-y-2">
                      <select
                        value={editLevel}
                        onChange={e => setEditLevel(e.target.value)}
                        className="text-xs bg-white border border-gray-200 rounded px-2 py-1"
                      >
                        {['L0', 'L1', 'L2', 'L3'].map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="w-full h-24 p-2 text-xs bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateMemory.isLoading}
                          className="px-3 py-1 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{m.content}</p>
                  )}

                  {/* 来源章节 + 时间 */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    {m.sourceChapterId && (
                      <span>来源: {m.sourceChapterId.slice(0, 8)}</span>
                    )}
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-3">暂无经验条目</p>
                <button
                  onClick={() => seedDefaultExperiences.mutate({ projectId })}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                >
                  初始化预设经验模板
                </button>
              </div>
            )}

            {/* 新建经验表单 */}
            {showNewForm && (
              <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                <h4 className="text-sm font-medium">新建经验</h4>
                <div className="flex gap-2">
                  <select
                    value={newLevel}
                    onChange={e => setNewLevel(e.target.value as 'L0' | 'L1' | 'L2' | 'L3')}
                    className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                  >
                    {['L0', 'L1', 'L2', 'L3'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="分类（如：创作铁则、写作规范）"
                    className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                  />
                </div>
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="经验内容..."
                  className="w-full h-20 p-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={createMemory.isLoading || !newContent.trim()}
                    className="px-3 py-1 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => { setShowNewForm(false); setNewContent(''); }}
                    className="px-3 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="py-2 px-3 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
            >
              从模板导入
            </button>
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="py-2 px-3 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
            >
              新建
            </button>
            <button
              onClick={() => {
                if (!memories?.length) return;
                exportAllToLibrary.mutate({ projectId });
              }}
              disabled={exportAllToLibrary.isPending}
              className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              {exportAllToLibrary.isPending ? '导出中...' : '导出到模板库(L0-L3)'}
            </button>
          </div>
        </div>
      </SlidePanel>

      {/* 模板导入弹窗 */}
      <ExperienceTemplateImport
        open={showImport}
        onClose={() => setShowImport(false)}
        projectId={projectId}
        onImported={() => refetch()}
      />
    </>
  );
}
