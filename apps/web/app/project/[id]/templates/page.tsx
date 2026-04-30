'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';
import PublishDialog from '@/components/template/publish-dialog';

type Tab = 'my' | 'create';
type CategoryFilter = 'all' | 'methodology' | 'structure' | 'style' | 'setting' | 'ai_prompt';

const categoryLabels: Record<string, string> = {
  all: '全部',
  methodology: '方法论',
  structure: '剧本结构',
  style: '正文风格',
  setting: '设定',
  ai_prompt: 'AI角色提示词',
};

const aiRoleLabels: Record<string, string> = {
  editor: '文学编辑',
  setting_editor: '设定编辑',
  writer: '正文作者',
};

const aiRoleColors: Record<string, string> = {
  editor: 'bg-blue-100 text-blue-700',
  setting_editor: 'bg-purple-100 text-purple-700',
  writer: 'bg-green-100 text-green-700',
};

const categoryImportTarget: Record<string, string> = {
  methodology: '→ 文学编辑',
  structure: '→ 文学编辑',
  style: '→ 正文作者',
  setting: '→ 项目设定',
  ai_prompt: '→ 同名AI角色',
};

export default function TemplatesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const progress = useWorkflowProgress(projectId);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const [tab, setTab] = useState<Tab>('my');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const utils = trpc.useUtils();

  const { data: myTemplates = [], isLoading } = trpc.template.myTemplates.useQuery({ projectId });
  const deleteTemplate = trpc.template.deleteMyTemplate.useMutation({
    onSuccess: () => utils.template.myTemplates.invalidate({ projectId }),
  });

  const filtered = categoryFilter === 'all'
    ? myTemplates
    : myTemplates.filter(t => t.category === categoryFilter);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ProjectSidebar
        projectId={projectId}
        projectName={projectData?.name || '项目'}
        projectGenre={projectData?.genre}
        projectStyle={projectData?.style}
        currentPath="/templates"
        progress={progress}
      />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">模板</h1>
              <p className="text-sm text-gray-500 mt-1">创作模板管理 · 从项目导入或手动创建</p>
            </div>
            <Link href="/marketplace"
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              模板广场
            </Link>
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-4">
            {([['my', '我的模板'], ['create', '模板创作']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm rounded-lg transition ${
                  tab === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'my' ? (
            <>
              {/* 分类筛选 */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {(Object.keys(categoryLabels) as CategoryFilter[]).map(f => (
                  <button key={f} onClick={() => setCategoryFilter(f)}
                    className={`px-3 py-1.5 text-xs rounded-full transition ${
                      categoryFilter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}>
                    {categoryLabels[f]}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="text-center py-16 text-gray-400">加载中...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                  <p className="mb-2">还没有模板</p>
                  <button onClick={() => setTab('create')}
                    className="text-gray-900 font-medium hover:underline">去模板创作导入第一个模板</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(t => (
                    <TemplateCard key={t.id} template={t} projectId={projectId}
                      onDelete={() => deleteTemplate.mutate({ id: t.id })} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <CreateTab projectId={projectId} />
          )}
        </div>
      </main>
    </div>
  );
}

// ========== 我的模板卡片 ==========

function TemplateCard({ template, projectId, onDelete }: {
  template: {
    id: string; title: string; content: string; category?: string | null;
    description?: string | null; source: string | null; canRepublish?: boolean | null;
    auditStatus?: string | null; templateId?: string | null;
    aiTargetRole?: string | null;
    createdAt: string; updatedAt: string;
  };
  projectId: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(template.content);
  const [editTitle, setEditTitle] = useState(template.title);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const utils = trpc.useUtils();

  const saveMutation = trpc.template.saveMyTemplate.useMutation({
    onSuccess: () => { utils.template.myTemplates.invalidate({ projectId }); setEditing(false); },
  });

  const handleSave = () => {
    saveMutation.mutate({ id: template.id, content: editContent, title: editTitle });
  };

  const statusBadge = () => {
    if (template.auditStatus === 'pending' || template.auditStatus === 'locked') {
      return <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">审核中</span>;
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {editing ? (
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className="text-base font-medium border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400" />
            ) : (
              <h3 className="font-medium">{template.title}</h3>
            )}
            {statusBadge()}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {template.category && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {categoryLabels[template.category] || template.category}
              </span>
            )}
            {template.aiTargetRole && aiRoleLabels[template.aiTargetRole] && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${aiRoleColors[template.aiTargetRole]}`}>
                {aiRoleLabels[template.aiTargetRole]}
              </span>
            )}
            <span className="text-xs text-gray-400">{categoryImportTarget[template.category || ''] || ''}</span>
          </div>
          {template.description && (
            <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-gray-500 hover:text-gray-700">
            {showPreview ? '收起' : '预览'}
          </button>
          {!editing && template.auditStatus !== 'pending' && (
            <button onClick={() => { setEditing(true); setEditContent(template.content); setEditTitle(template.title); }}
              className="text-sm text-gray-500 hover:text-gray-700">编辑</button>
          )}
          {!editing && template.canRepublish && !template.templateId && (
            <button onClick={() => setShowPublish(true)} className="text-sm text-blue-500 hover:text-blue-700">发布</button>
          )}
          {!editing && template.auditStatus === 'rejected' && (
            <button onClick={() => setShowPublish(true)} className="text-sm text-amber-500 hover:text-amber-700">重新提交</button>
          )}
          <button onClick={onDelete} className="text-sm text-red-400 hover:text-red-600">删除</button>
        </div>
      </div>

      {showPreview && !editing && (
        <div className="bg-gray-50 rounded-lg p-4 mt-3 border border-gray-100">
          <pre className="whitespace-pre-wrap text-sm text-gray-600 max-h-48 overflow-y-auto">{template.content}</pre>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
            className="w-full h-48 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              保存（生成新版本）
            </button>
            <button onClick={() => { setEditing(false); setEditContent(template.content); setEditTitle(template.title); }}
              className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              取消
            </button>
          </div>
        </div>
      )}

      {showPublish && (
        <PublishDialog
          userTemplateId={template.id}
          initialTitle={template.title}
          initialCategory={template.category}
          initialAiTargetRole={template.aiTargetRole}
          onClose={() => setShowPublish(false)}
          onSuccess={() => { setShowPublish(false); setEditing(false); }}
        />
      )}
    </div>
  );
}

// ========== 模板创作 Tab ==========

function CreateTab({ projectId }: { projectId: string }) {
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">从项目文件导入或手动创建模板，创建后可发布到模板广场</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {/* 从项目导入卡片 */}
        <button onClick={() => setImportOpen(true)}
          className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 hover:border-gray-500 transition text-center">
          <div className="text-2xl mb-2">📂</div>
          <h3 className="font-medium text-sm">从项目导入</h3>
          <p className="text-xs text-gray-400 mt-1">设定 · 章节正文 · AI角色 · 经验</p>
        </button>

        {/* 新建模板卡片 */}
        <button onClick={() => setNewOpen(true)}
          className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 hover:border-gray-500 transition text-center">
          <div className="text-2xl mb-2">✏️</div>
          <h3 className="font-medium text-sm">新建模板</h3>
          <p className="text-xs text-gray-400 mt-1">手动创建空白模板</p>
        </button>
      </div>

      {/* 分区说明 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium mb-3">模板分区与导入目标</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">方法论</span>
            <span className="text-gray-500 text-xs">创作经验/写作技巧 → 优化文学编辑提示词</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">剧本结构</span>
            <span className="text-gray-500 text-xs">卷/单元梗概/剧情结构 → 优化文学编辑提示词</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">正文风格</span>
            <span className="text-gray-500 text-xs">章节正文参考 → 正文作者风格要求</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">设定</span>
            <span className="text-gray-500 text-xs">世界观/等级/货币/地图 → 设定页面 · 任务书调用</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0">AI角色提示词</span>
            <span className="text-gray-500 text-xs">角色系统提示词 → 修改优化 AI Agent 提示词</span>
          </div>
        </div>
      </div>

      {importOpen && <ImportDialog projectId={projectId} onClose={() => setImportOpen(false)} />}
      {newOpen && <NewTemplateDialog projectId={projectId} onClose={() => setNewOpen(false)} />}
    </div>
  );
}

// ========== 从项目导入 Dialog ==========

function ImportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [sourceType, setSourceType] = useState<'setting' | 'chapter' | 'ai_role' | 'memory' | 'outline'>('setting');
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const utils = trpc.useUtils();

  // 根据 sourceType 加载可选列表
  const { data: settings } = trpc.project.listSettings.useQuery({ projectId }, { enabled: sourceType === 'setting' });
  const { data: volumes } = trpc.project.listVolumes.useQuery({ projectId }, { enabled: sourceType === 'outline' });
  const { data: chapters } = trpc.project.listProjectChapters.useQuery({ projectId }, { enabled: sourceType === 'chapter' });
  const { data: aiRoles } = trpc.project.listProjectAiRoles.useQuery({ projectId }, { enabled: sourceType === 'ai_role' });
  const { data: memories } = trpc.memory.list.useQuery({ projectId }, { enabled: sourceType === 'memory' });

  const createMutation = trpc.template.createFromProject.useMutation({
    onSuccess: () => {
      utils.template.myTemplates.invalidate({ projectId });
      alert('导入成功');
      onClose();
    },
    onError: (e) => alert(e.message),
  });

  const handleImport = () => {
    if (!sourceId) { alert('请选择导入源'); return; }
    createMutation.mutate({ projectId, sourceType, sourceId, title: title || undefined, description: description || undefined });
  };

  const sourceItems: Array<{ id: string; title: string }> = sourceType === 'setting'
    ? (settings?.map(s => ({ id: s.id, title: `[${s.category}] ${s.title}` })) || [])
    : sourceType === 'chapter'
    ? (chapters?.map(c => ({ id: c.id, title: c.title })) || [])
    : sourceType === 'ai_role'
    ? (aiRoles?.map(r => ({ id: r.id, title: `[${r.role}] ${r.name}` })) || [])
    : sourceType === 'memory'
    ? (memories?.map(m => ({ id: m.id, title: `[${m.level}] ${m.category || '无分类'}`.slice(0, 30) })) || [])
    : sourceType === 'outline'
    ? (volumes?.map(v => ({ id: v.id, title: v.title })) || [])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium mb-4">从项目导入模板</h3>

        {/* 选择导入类型 */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">导入类型</label>
          <div className="flex gap-2 flex-wrap">
            {([
              ['setting', '设定'],
              ['chapter', '章节正文'],
              ['ai_role', 'AI角色'],
              ['memory', '创作经验'],
              ['outline', '梗概'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setSourceType(key); setSourceId(''); }}
                className={`px-3 py-1.5 text-xs rounded-full border transition ${
                  sourceType === key ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:border-gray-500'
                }`}>{label}</button>
            ))}
          </div>
        </div>

        {/* 选择源文件 */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">选择{sourceType === 'setting' ? '设定' : sourceType === 'chapter' ? '章节' : sourceType === 'ai_role' ? 'AI角色' : sourceType === 'memory' ? '经验' : '梗概'}</label>
          {sourceItems && (sourceItems as any[]).length > 0 ? (
            <select value={sourceId} onChange={e => setSourceId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2">
              <option value="">请选择...</option>
              {(sourceItems as any[]).map(item => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-gray-400">暂无可选项目（此类型暂不支持列表选择，请在章节编辑器中操作）</p>
          )}
        </div>

        {/* 标题和描述 */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">模板标题（可选，默认使用源文件标题）</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2" placeholder="留空则使用源文件标题" />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">模板描述（可选）</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none" placeholder="简要描述模板用途..." />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">取消</button>
          <button onClick={handleImport} disabled={createMutation.isPending || !sourceId}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 新建模板 Dialog ==========

function NewTemplateDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('methodology');
  const [aiTargetRole, setAiTargetRole] = useState('');
  const [description, setDescription] = useState('');
  const utils = trpc.useUtils();

  const createMutation = trpc.template.createEmpty.useMutation({
    onSuccess: () => {
      utils.template.myTemplates.invalidate({ projectId });
      alert('创建成功');
      onClose();
    },
    onError: (e) => alert(e.message),
  });

  const handleCreate = () => {
    if (!title.trim() || !content.trim()) { alert('标题和内容不能为空'); return; }
    createMutation.mutate({ projectId, title, content, category, aiTargetRole: aiTargetRole || undefined, description: description || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium mb-4">新建模板</h3>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">分区</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2">
            {Object.entries(categoryLabels).filter(([k]) => k !== 'all').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">对应 AI 角色</label>
          <select value={aiTargetRole} onChange={e => setAiTargetRole(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2">
            <option value="">无</option>
            <option value="editor">文学编辑</option>
            <option value="setting_editor">设定编辑</option>
            <option value="writer">正文作者</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">选择该模板导入后会应用到哪个 AI 角色</p>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">标题</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2" placeholder="模板标题..." />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">内容</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none font-mono"
            placeholder="模板内容..." />
        </div>
        <p className="text-xs text-gray-400 mb-4">💡 建议：从项目文件导入后再编辑，可自动关联源文件内容</p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">取消</button>
          <button onClick={handleCreate}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
