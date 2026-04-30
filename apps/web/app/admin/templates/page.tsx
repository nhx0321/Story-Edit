'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const CATEGORY_LABELS: Record<string, string> = {
  methodology: '方法论',
  structure: '剧本结构',
  style: '正文风格',
  setting: '设定',
  ai_prompt: 'AI角色提示词',
};

const AI_ROLE_LABELS: Record<string, string> = {
  editor: '文学编辑',
  setting_editor: '设定编辑',
  writer: '正文作者',
};

const AI_ROLE_COLORS: Record<string, string> = {
  editor: 'bg-blue-100 text-blue-700',
  setting_editor: 'bg-purple-100 text-purple-700',
  writer: 'bg-green-100 text-green-700',
};

type Tab = 'official' | 'user';

export default function AdminTemplatesPage() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<Tab>('official');

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">模板广场</h1>
          <p className="text-sm text-gray-500 mt-1">管理官方模板和用户模板</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          ['official', '官方模板管理'],
          ['user', '用户模板管理'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
              activeTab === key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'official' ? <OfficialTab /> : <UserTab />}
    </>
  );
}

// ========== 官方模板管理 Tab ==========
function OfficialTab() {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: '', aiTargetRole: '', content: '', price: 0 });

  const { data: templates, isLoading } = trpc.template.adminListOfficial.useQuery();

  const createMutation = trpc.template.adminCreateOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); setShowCreate(false); setForm({ title: '', description: '', category: '', aiTargetRole: '', content: '', price: 0 }); },
  });
  const updateMutation = trpc.template.adminUpdateOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.template.adminDeleteOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); },
  });
  const toggleMutation = trpc.template.adminTogglePublish.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); },
  });

  const handleCreate = () => {
    if (!form.title || !form.content) return;
    createMutation.mutate({ ...form, category: form.category || undefined });
  };

  const handleUpdate = (id: string) => {
    updateMutation.mutate({ id, ...form });
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`确定要删除官方模板「${title}」吗？`)) return;
    deleteMutation.mutate({ id });
  };

  const handleToggle = (id: string) => {
    toggleMutation.mutate({ id });
  };

  const startEdit = (t: { id: string; title: string; description?: string | null; category?: string | null; aiTargetRole?: string | null; content: string; price: number | null; isPublished: boolean | null }) => {
    setEditing(t.id);
    setForm({
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      aiTargetRole: t.aiTargetRole || '',
      content: t.content,
      price: t.price ?? 0,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ title: '', description: '', category: '', aiTargetRole: '', content: '', price: 0 });
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <>
      {/* 创建表单 */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">新建官方模板</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="模板标题" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="模板简介" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">未分类</option>
                  <option value="methodology">方法论</option>
                  <option value="structure">剧本结构</option>
                  <option value="style">正文风格</option>
                  <option value="setting">设定</option>
                  <option value="ai_prompt">AI角色提示词</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">AI 角色</label>
                <select value={form.aiTargetRole} onChange={e => setForm(f => ({ ...f, aiTargetRole: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">无</option>
                  <option value="editor">文学编辑</option>
                  <option value="setting_editor">设定编辑</option>
                  <option value="writer">正文作者</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-1">价格（分）</label>
                <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容 *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" placeholder="模板内容..." />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                创建并发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模板列表 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">共 {templates?.length || 0} 个官方模板</p>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          {showCreate ? '取消' : '+ 新建模板'}
        </button>
      </div>

      <div className="space-y-4">
        {templates?.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
            {editing === t.id ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">未分类</option>
                        <option value="methodology">方法论</option>
                        <option value="structure">剧本结构</option>
                        <option value="style">正文风格</option>
                        <option value="setting">设定</option>
                        <option value="ai_prompt">AI角色提示词</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">AI 角色</label>
                      <select value={form.aiTargetRole} onChange={e => setForm(f => ({ ...f, aiTargetRole: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">无</option>
                        <option value="editor">文学编辑</option>
                        <option value="setting_editor">设定编辑</option>
                        <option value="writer">正文作者</option>
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="block text-sm font-medium text-gray-700 mb-1">价格（分）</label>
                      <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                    <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(t.id)} disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                      保存
                    </button>
                    <button onClick={cancelEdit}
                      className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">取消</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{t.title}</h3>
                      {t.category && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                      )}
                      {t.aiTargetRole && AI_ROLE_LABELS[t.aiTargetRole] && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${AI_ROLE_COLORS[t.aiTargetRole]}`}>
                          {AI_ROLE_LABELS[t.aiTargetRole]}
                        </span>
                      )}
                      {t.isPublished ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已发布</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未发布</span>
                      )}
                      {(t.price ?? 0) === 0 ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">免费</span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">&#165;{((t.price ?? 0) / 100).toFixed(2)}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{t.description || '无简介'}</p>
                    <p className="text-xs text-gray-400 mt-1">浏览 {t.viewCount || 0} · 导入 {t.importCount || 0}</p>
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">查看内容</summary>
                      <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mt-2 max-h-40 overflow-y-auto border border-gray-100">
                        {t.content?.slice(0, 500)}{t.content && t.content.length > 500 ? '...' : ''}
                      </pre>
                    </details>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                  <button onClick={() => startEdit(t)}
                    className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                    编辑
                  </button>
                  <button onClick={() => handleToggle(t.id)}
                    className={`px-4 py-1.5 text-sm rounded-lg transition ${
                      t.isPublished
                        ? 'border border-amber-300 text-amber-600 hover:bg-amber-50'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}>
                    {t.isPublished ? '下架' : '发布'}
                  </button>
                  <button onClick={() => handleDelete(t.id, t.title)}
                    className="px-4 py-1.5 text-sm text-red-500 hover:text-red-700 transition">
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {templates?.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">暂无官方模板</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              创建第一个官方模板
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ========== 用户模板管理 Tab ==========
function UserTab() {
  const utils = trpc.useUtils();
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'deleted'>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', aiTargetRole: '', content: '' });
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const { data: submissions, isLoading } = trpc.template.adminListSubmissions.useQuery();
  const { data: deletedTemplates, isLoading: deletedLoading } = trpc.template.adminListDeletedUserTemplates.useQuery(undefined, {
    enabled: activeFilter === 'deleted',
  });
  const reviewMutation = trpc.template.adminReviewTemplate.useMutation();
  const updateMutation = trpc.template.adminUpdateUserTemplate.useMutation();
  const deleteMutation = trpc.template.adminDeleteUserTemplate.useMutation();
  const restoreMutation = trpc.template.adminRestoreUserTemplate.useMutation();

  const pendingCount = submissions?.filter(t => t.auditStatus === 'pending').length || 0;
  const deletedCount = deletedTemplates?.length || 0;

  const filteredSubmissions = submissions?.filter(t => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'pending') return t.auditStatus === 'pending';
    if (activeFilter === 'approved') return t.auditStatus === 'approved';
    if (activeFilter === 'rejected') return t.auditStatus === 'rejected';
    return true;
  });

  const handleReview = (id: string, approved: boolean) => {
    if (!approved && reviewId === id && reviewReason) {
      reviewMutation.mutate({ templateId: id, approved: false, reason: reviewReason }, {
        onSuccess: () => { setReviewId(null); setReviewReason(''); utils.template.adminListSubmissions.invalidate(); },
      });
    } else {
      reviewMutation.mutate({ templateId: id, approved, reason: reviewReason || undefined }, {
        onSuccess: () => { setReviewId(null); setReviewReason(''); utils.template.adminListSubmissions.invalidate(); },
      });
    }
  };

  const startEdit = (t: { id: string; title: string; description?: string | null; category?: string | null; aiTargetRole?: string | null; content: string }) => {
    setEditingId(t.id);
    setEditForm({
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      aiTargetRole: t.aiTargetRole || '',
      content: t.content,
    });
  };

  const handleSave = (id: string) => {
    updateMutation.mutate({ id, ...editForm, category: editForm.category || undefined, aiTargetRole: editForm.aiTargetRole || undefined }, {
      onSuccess: () => { setEditingId(null); utils.template.adminListSubmissions.invalidate(); },
    });
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`确定要删除用户模板「${title}」吗？删除后可在「已删除」中恢复。`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => utils.template.adminListSubmissions.invalidate(),
    });
  };

  const handleRestore = (id: string, title: string) => {
    if (!confirm(`确定要恢复模板「${title}」吗？`)) return;
    restoreMutation.mutate({ id }, {
      onSuccess: () => {
        utils.template.adminListSubmissions.invalidate();
        utils.template.adminListDeletedUserTemplates.invalidate();
      },
    });
  };

  const handlePermanentDelete = (id: string, title: string) => {
    if (!confirm(`确定要永久删除模板「${title}」吗？此操作不可恢复！`)) return;
    // 对于已删除的模板，使用相同的 deleteMutation（后端会再次设置 deletedAt，实际由管理员决定）
    deleteMutation.mutate({ id }, {
      onSuccess: () => utils.template.adminListDeletedUserTemplates.invalidate(),
    });
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  // 已删除视图
  if (activeFilter === 'deleted') {
    return (
      <>
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-medium">已删除模板（30天内可恢复）</p>
        </div>
        {deletedLoading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : !deletedTemplates?.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">暂无已删除模板</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deletedTemplates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 opacity-75">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-600">{t.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">已删除</span>
                      {t.category && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                      )}
                      {t.aiTargetRole && AI_ROLE_LABELS[t.aiTargetRole] && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${AI_ROLE_COLORS[t.aiTargetRole]}`}>
                          {AI_ROLE_LABELS[t.aiTargetRole]}
                        </span>
                      )}
                    </div>
                    {t.uploader && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{t.uploader.avatarUrl || '👤'}</span>
                        <span className="text-sm text-gray-600">{t.uploader.nickname || '未知'}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      删除时间：{t.deletedAt ? new Date(t.deletedAt).toLocaleString('zh-CN') : '-'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">剩余可恢复时间：{Math.ceil((Date.now() - new Date(t.deletedAt!).getTime()) / (1000 * 60 * 60 * 24))} 天前删除</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                  <button onClick={() => handleRestore(t.id, t.title)}
                    disabled={restoreMutation.isPending}
                    className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                    恢复
                  </button>
                  <button onClick={() => handlePermanentDelete(t.id, t.title)}
                    className="px-4 py-1.5 text-sm text-red-500 hover:text-red-700 transition">
                    永久删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* 待审核提示 */}
      {pendingCount > 0 && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <span className="text-sm text-amber-700 font-medium">{pendingCount} 条模板待审核</span>
          {activeFilter !== 'pending' && (
            <button onClick={() => setActiveFilter('pending')}
              className="text-xs text-amber-600 underline hover:text-amber-800">
              查看
            </button>
          )}
        </div>
      )}

      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        {([
          ['all', '全部'],
          ['pending', '待审核', pendingCount > 0],
          ['approved', '已通过'],
          ['rejected', '已拒绝'],
          ['deleted', '已删除', deletedCount > 0],
        ] as const).map(([key, label, showBadge]) => {
          const isActive = (activeFilter as string) === key;
          const isDeletedTab = key === 'deleted';
          const isPendingTab = key === 'pending';
          return (
          <button key={key} onClick={() => { setActiveFilter(key); setEditingId(null); setReviewId(null); setReviewReason(''); }}
            className={`px-3 py-1.5 text-xs rounded-lg transition flex items-center gap-1 ${
              isActive
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {label}
            {isPendingTab && showBadge && (
              <span className={`text-xs px-1 py-0.5 rounded-full ${
                isActive ? 'bg-gray-700 text-gray-200' : 'bg-amber-100 text-amber-700'
              }`}>{pendingCount}</span>
            )}
            {isDeletedTab && showBadge && (
              <span className={`text-xs px-1 py-0.5 rounded-full ${
                isActive ? 'bg-gray-700 text-gray-200' : 'bg-red-100 text-red-700'
              }`}>{deletedCount}</span>
            )}
          </button>
          );
        })}
      </div>

      {/* 模板列表 */}
      {(activeFilter as string) === 'deleted' ? null : filteredSubmissions?.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">暂无用户模板</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions?.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
              {editingId === t.id ? (
                <>
                  {/* 编辑模式 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                      <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
                      <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                      <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">未分类</option>
                        <option value="methodology">方法论</option>
                        <option value="structure">剧本结构</option>
                        <option value="style">正文风格</option>
                        <option value="setting">设定</option>
                        <option value="ai_prompt">AI角色提示词</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">AI 角色</label>
                      <select value={editForm.aiTargetRole} onChange={e => setEditForm(f => ({ ...f, aiTargetRole: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">无</option>
                        <option value="editor">文学编辑</option>
                        <option value="setting_editor">设定编辑</option>
                        <option value="writer">正文作者</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                      <textarea value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleSave(t.id)} disabled={updateMutation.isPending}
                        className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">取消</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 查看模式 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{t.title}</h3>
                        {t.category && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {CATEGORY_LABELS[t.category] || t.category}
                          </span>
                        )}
                        {t.aiTargetRole && AI_ROLE_LABELS[t.aiTargetRole] && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${AI_ROLE_COLORS[t.aiTargetRole]}`}>
                            {AI_ROLE_LABELS[t.aiTargetRole]}
                          </span>
                        )}
                        {t.source === 'user' && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">1豆预览 · 10豆导入</span>
                        )}
                        {t.source === 'official' && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">免费</span>
                        )}
                        {/* 审核状态 */}
                        {t.auditStatus === 'pending' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">待审核</span>
                        )}
                        {t.auditStatus === 'approved' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已通过</span>
                        )}
                        {t.auditStatus === 'rejected' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">已拒绝</span>
                        )}
                      </div>
                      {/* 上传者信息 */}
                      {t.uploader && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">{t.uploader.avatarUrl || '👤'}</span>
                          <span className="text-sm text-gray-600">{t.uploader.nickname || '未知'}</span>
                          <span className="text-xs text-gray-400">{t.uploader.displayId}</span>
                        </div>
                      )}
                      <p className="text-sm text-gray-500">{t.description || '无简介'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        提交时间：{new Date(t.createdAt).toLocaleString('zh-CN')}
                      </p>
                      {t.reviewReason && (
                        <p className="text-xs text-red-500 mt-1">上次拒绝原因：{t.reviewReason}</p>
                      )}
                      <details className="mt-3">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">查看完整内容</summary>
                        <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto border border-gray-100">
                          {t.content}
                        </pre>
                      </details>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button onClick={() => startEdit(t)}
                      className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                      编辑
                    </button>
                    {/* 审核操作 */}
                    {t.auditStatus === 'pending' && (
                      <>
                        <button onClick={() => handleReview(t.id, true)}
                          disabled={reviewMutation.isPending}
                          className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                          通过
                        </button>
                        <button onClick={() => setReviewId(reviewId === t.id ? null : t.id)}
                          disabled={reviewMutation.isPending}
                          className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50">
                          拒绝
                        </button>
                        {reviewId === t.id && (
                          <div className="flex-1 flex gap-2">
                            <input value={reviewReason} onChange={e => setReviewReason(e.target.value)}
                              className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5"
                              placeholder="请输入拒绝原因（可选）" />
                            <button onClick={() => handleReview(t.id, false)}
                              disabled={reviewMutation.isPending}
                              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                              确认
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    <button onClick={() => handleDelete(t.id, t.title)}
                      className="px-4 py-1.5 text-sm text-red-500 hover:text-red-700 transition">
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
