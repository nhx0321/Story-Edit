'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const categoryMap: Record<string, string> = {
  ai_role: 'AI角色预设',
  creation_experience: '创作经验预设',
  ai_config_guide: 'AI配置完整指南',
  disclaimer: '免责声明',
};

const projectTypeMap: Record<string, string> = {
  '': '通用',
  novel: '小说',
  webnovel: '网文',
};

// 小说类型题材细分
const novelGenreMap: Record<string, string> = {
  '': '全部题材',
  realist: '纪实文学',
  historical: '历史文学',
  children: '儿童文学',
  wuxia: '武侠',
  detective: '侦探',
  social: '社会现实',
};

// 网文类型题材细分
const webnovelGenreMap: Record<string, string> = {
  '': '全部题材',
  male_oriented: '男频',
  female_oriented: '女频',
  xianxia: '修仙',
  urban: '都市',
  apocalypse: '末日',
  romance: '言情',
  historical_web: '历史',
  other: '其他',
};

export default function AdminPresetsPage() {
  const utils = trpc.useUtils();
  const [activeCategory, setActiveCategory] = useState('ai_role');
  const [projectType, setProjectType] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<any>(null);
  const [form, setForm] = useState({
    category: 'ai_role',
    projectType: '',
    title: '',
    content: '',
    description: '',
    sortOrder: 0,
  });

  // 免责声明相关状态
  const [disclaimerEditing, setDisclaimerEditing] = useState(false);
  const [disclaimerForm, setDisclaimerForm] = useState({ title: '', content: '' });
  const { data: disclaimerActive } = trpc.template.getActiveDisclaimer.useQuery();
  const { data: disclaimerHistory } = trpc.template.getDisclaimerHistory.useQuery();
  const disclaimerUpdate = trpc.template.adminUpdateDisclaimer.useMutation({
    onSuccess: () => {
      utils.template.getActiveDisclaimer.invalidate();
      utils.template.getDisclaimerHistory.invalidate();
      setDisclaimerEditing(false);
      alert('免责声明已更新，新版本已生效');
    },
    onError: (e) => alert(e.message),
  });

  const { data: presets } = trpc.admin.listPresets.useQuery({
    category: activeCategory || undefined,
    projectType: projectType || undefined,
  });

  // 根据题材过滤客户端结果
  const filteredPresets = presets?.filter(p => {
    if (!genreFilter) return true;
    return p.projectType === genreFilter;
  });

  const create = trpc.admin.createPreset.useMutation({
    onSuccess: () => { utils.admin.listPresets.invalidate(); setEditorOpen(false); resetForm(); },
    onError: (e) => alert(e.message),
  });
  const update = trpc.admin.updatePreset.useMutation({
    onSuccess: () => { utils.admin.listPresets.invalidate(); setEditorOpen(false); setEditingPreset(null); },
    onError: (e) => alert(e.message),
  });
  const publish = trpc.admin.publishPreset.useMutation({
    onSuccess: () => { utils.admin.listPresets.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const deletePreset = trpc.admin.deletePreset.useMutation({
    onSuccess: () => { utils.admin.listPresets.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const seedPresets = trpc.admin.seedSystemPresets.useMutation({
    onSuccess: (result) => {
      utils.admin.listPresets.invalidate();
      if (result.seededCount > 0) {
        alert(`已导入 ${result.seededCount} 条系统预设`);
      } else {
        alert('系统预设已存在，无需重复导入');
      }
    },
    onError: (e) => alert(e.message),
  });

  const resetForm = () => setForm({ category: activeCategory, projectType: '', title: '', content: '', description: '', sortOrder: 0 });

  const handleSeed = () => {
    if (confirm('确定要导入系统预设吗？（不会覆盖已有预设）')) {
      seedPresets.mutate();
    }
  };

  const openCreate = () => {
    setEditingPreset(null);
    setForm({ category: activeCategory, projectType: '', title: '', content: '', description: '', sortOrder: 0 });
    setEditorOpen(true);
  };

  const openEdit = (preset: any) => {
    setEditingPreset(preset);
    setForm({
      category: preset.category,
      projectType: preset.projectType || '',
      title: preset.title,
      content: preset.content,
      description: preset.description || '',
      sortOrder: preset.sortOrder || 0,
    });
    setEditorOpen(true);
  };

  const handleSave = () => {
    if (!form.title || !form.content) { alert('标题和内容不能为空'); return; }
    if (editingPreset) {
      update.mutate({ id: editingPreset.id, ...form, projectType: form.projectType || null, description: form.description || null });
    } else {
      create.mutate(form);
    }
  };

  // 免责声明相关函数
  const handleDisclaimerSave = () => {
    if (!disclaimerForm.title.trim() || !disclaimerForm.content.trim()) {
      alert('标题和内容不能为空');
      return;
    }
    disclaimerUpdate.mutate(disclaimerForm);
  };
  const handleDisclaimerEdit = () => {
    setDisclaimerEditing(true);
    setDisclaimerForm({
      title: disclaimerActive?.title || '',
      content: disclaimerActive?.content || '',
    });
  };

  const isDisclaimer = activeCategory === 'disclaimer';

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">预设管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理系统级预设（AI角色、创作经验、AI配置指南、免责声明）</p>
        </div>
        {!isDisclaimer && (
        <button onClick={openCreate}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          + 新建预设
        </button>
        )}
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-2 mb-4">
        {Object.entries(categoryMap).map(([key, label]) => (
          <button key={key} onClick={() => { setActiveCategory(key); setProjectType(''); setGenreFilter(''); }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
              activeCategory === key ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600 hover:border-gray-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 项目类型 + 题材筛选 */}
      {!isDisclaimer && activeCategory !== 'ai_config_guide' && (
        <div className="flex gap-3 mb-4 items-center flex-wrap">
          <span className="text-sm text-gray-500">项目类型：</span>
          <select value={projectType} onChange={e => { setProjectType(e.target.value); setGenreFilter(''); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
            <option value="">全部</option>
            <option value="novel">小说</option>
            <option value="webnovel">网文</option>
          </select>
          {projectType && (
            <>
              <span className="text-sm text-gray-500">题材：</span>
              <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                <option value="">全部题材</option>
                {(projectType === 'novel'
                  ? Object.entries(novelGenreMap)
                  : Object.entries(webnovelGenreMap)
                ).filter(([k]) => k !== '').map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </>
          )}
          <button onClick={() => { setProjectType(''); setGenreFilter(''); }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 transition">
            重置筛选
          </button>
        </div>
      )}

      {/* 免责声明管理 */}
      {isDisclaimer ? (
        <div className="space-y-6">
          {/* 当前生效的免责声明 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">当前生效的免责声明</h2>
              {disclaimerActive && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  版本 v{disclaimerActive.version}
                </span>
              )}
            </div>
            {disclaimerEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                  <input value={disclaimerForm.title} onChange={e => setDisclaimerForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                  <textarea value={disclaimerForm.content} onChange={e => setDisclaimerForm(f => ({ ...f, content: e.target.value }))}
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleDisclaimerSave} disabled={disclaimerUpdate.isPending}
                    className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    保存并发布新版本
                  </button>
                  <button onClick={() => setDisclaimerEditing(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-base font-medium mb-2">{disclaimerActive?.title}</h3>
                <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 rounded-lg p-4 border border-gray-100 leading-relaxed">
                  {disclaimerActive?.content}
                </pre>
                <div className="mt-4">
                  <button onClick={handleDisclaimerEdit}
                    className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                    编辑
                  </button>
                  <p className="text-xs text-gray-400 mt-2">保存后将创建新版本，旧版本自动失效</p>
                </div>
              </>
            )}
          </div>

          {/* 历史版本 */}
          {disclaimerHistory && disclaimerHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-4">历史版本</h2>
              <div className="space-y-2">
                {disclaimerHistory.map((h: any) => (
                  <details key={h.version} className="border border-gray-100 rounded-lg">
                    <summary className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                      <span>版本 v{h.version}</span>
                      <span className="text-xs text-gray-400">
                        {h.isActive ? '当前生效' : new Date(h.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    </summary>
                    <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 p-4 border-t border-gray-100 leading-relaxed">
                      {h.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* 项目类型筛选（免责声明不显示） */}
      <div className="flex gap-2 mb-6">
        {Object.entries(projectTypeMap).map(([key, label]) => (
          <button key={key} onClick={() => setProjectType(key)}
            className={`px-3 py-1 text-xs rounded-full border transition ${
              projectType === key ? 'border-gray-900 bg-gray-900 text-white' : 'hover:border-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 预设列表 */}
      {!presets?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">暂无预设</p>
          <button onClick={handleSeed} disabled={seedPresets.isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
            {seedPresets.isPending ? '导入中...' : '导入系统预设'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPresets && filteredPresets.length > 0 ? filteredPresets.map((p: any) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{p.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isPublished ? '已发布' : '未发布'}
                    </span>
                    {p.projectType && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {projectTypeMap[p.projectType] || p.projectType}
                      </span>
                    )}
                  </div>
                  {p.description && <p className="text-sm text-gray-500">{p.description}</p>}
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap border border-gray-100">
                    {p.content.slice(0, 300)}{p.content.length > 300 ? '...' : ''}
                  </pre>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => publish.mutate({ id: p.id, publish: !p.isPublished })}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      p.isPublished ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}>
                    {p.isPublished ? '下架' : '发布'}
                  </button>
                  <button onClick={() => openEdit(p)}
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                    编辑
                  </button>
                  <button onClick={() => { if (confirm('确定删除该预设吗？')) deletePreset.mutate({ id: p.id }); }}
                    className="text-xs px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
                    删除
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-500">暂无预设</p>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* 编辑器弹窗（免责声明不显示） */}
      {!isDisclaimer && editorOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setEditorOpen(false); setEditingPreset(null); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">{editingPreset ? '编辑预设' : '新建预设'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {Object.entries(categoryMap).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目类型</label>
                <select value={form.projectType} onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {Object.entries(projectTypeMap).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">排序值</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 w-24" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setEditorOpen(false); setEditingPreset(null); }}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">取消</button>
                <button onClick={handleSave} disabled={create.isPending || update.isPending}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  {editingPreset ? '保存修改' : '创建预设'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
