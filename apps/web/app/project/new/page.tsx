'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

type WizardStep = 'basic' | 'style' | 'methodology' | 'roles' | 'confirm';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'style', label: '内容风格' },
  { key: 'methodology', label: '创作方法论' },
  { key: 'roles', label: 'AI角色' },
  { key: 'confirm', label: '确认创建' },
];

const projectTypes = [
  { id: 'novel', name: '小说', desc: '长篇/中篇/短篇小说' },
  { id: 'screenplay', name: '剧本', desc: '短剧/电影剧本（即将开放）', disabled: true },
];

const genres = [
  { label: '男频', code: 'male_oriented' },
  { label: '女频', code: 'female_oriented' },
  { label: '修仙', code: 'xianxia' },
  { label: '都市', code: 'urban' },
  { label: '末日', code: 'apocalypse' },
  { label: '言情', code: 'romance' },
  { label: '军事', code: 'military' },
  { label: '权谋', code: 'political' },
  { label: '科幻', code: 'scifi' },
  { label: '悬疑', code: 'suspense' },
  { label: '奇幻', code: 'fantasy' },
  { label: '历史', code: 'historical' },
  { label: '游戏', code: 'game' },
  { label: '其他', code: 'other' },
];

const styleOptions = [
  { id: 'literary', name: '严肃文学', desc: '注重文学性和深度' },
  { id: 'webnovel', name: '网文风格', desc: '节奏快、爽点密集' },
  { id: 'lightnovel', name: '轻小说', desc: '轻松有趣、对话多' },
  { id: 'custom', name: '自定义', desc: '自行描述风格要求' },
];

const methodologies = [
  { id: 'four_act', name: '四幕结构', desc: '铺垫→对抗→危机→高潮，适合网文和商业小说' },
  { id: 'three_act', name: '三幕结构', desc: '开端→发展→结局，经典叙事结构' },
  { id: 'hero_journey', name: '英雄之旅', desc: '12步英雄旅程，适合冒险/成长题材' },
  { id: 'kishoten', name: '起承转合', desc: '东方传统叙事结构' },
  { id: 'custom', name: '自定义', desc: '自行定义章节结构' },
];

const defaultRoles = [
  { name: '文学编辑', role: 'editor', desc: '负责构思、大纲创作、单元梗概', enabled: true },
  { name: '小说作者', role: 'writer', desc: '负责章节正文撰写', enabled: true },
  { name: '设定编辑', role: 'setting_editor', desc: '负责世界观搭建、设定校验', enabled: true },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('basic');
  const [form, setForm] = useState({
    name: '',
    type: 'novel',
    genre: '',
    genreTag: '',
    style: '',
    customStyle: '',
    methodology: '',
    roles: defaultRoles,
  });
  const [error, setError] = useState('');

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      router.push(`/project/${project!.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const canNext = () => {
    switch (step) {
      case 'basic': return form.name && form.type;
      case 'style': return form.genre && form.style;
      case 'methodology': return form.methodology;
      case 'roles': return form.roles.some(r => r.enabled);
      default: return true;
    }
  };

  const handleCreate = () => {
    setError('');
    createProject.mutate({
      name: form.name,
      type: form.type as 'novel' | 'screenplay' | 'prompt_gen',
      genre: form.genre,
      genreTag: (form.genreTag || undefined) as any,
      style: form.style === 'custom' ? form.customStyle : form.style,
      methodology: form.methodology,
      roles: form.roles.filter(r => r.enabled).map(r => ({
        name: r.name,
        role: r.role,
        systemPrompt: '',
        isDefault: false,
      })),
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8" data-guide-target="project-form">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回项目列表</Link>
        <h1 className="text-2xl font-bold mt-4 mb-6">新建项目</h1>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {/* 步骤指示器 */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= stepIndex ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{i + 1}</div>
              <span className={`text-xs ${i <= stepIndex ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: 基本信息 */}
        {step === 'basic' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">项目名称</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="给你的作品起个名字" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">项目类型</label>
              <div className="space-y-2">
                {projectTypes.map(t => (
                  <button key={t.id} type="button" disabled={t.disabled}
                    onClick={() => setForm(f => ({ ...f, type: t.id }))}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      t.disabled ? 'opacity-50 cursor-not-allowed border-gray-100' :
                      form.type === t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    <span className="font-medium">{t.name}</span>
                    <p className="text-sm text-gray-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 内容风格 */}
        {step === 'style' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">题材</label>
              <div className="flex flex-wrap gap-2">
                {genres.map(g => (
                  <button key={g.code} type="button"
                    onClick={() => setForm(f => ({ ...f, genre: g.label, genreTag: g.code }))}
                    className={`px-4 py-2 rounded-full text-sm border transition ${
                      form.genreTag === g.code ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                    }`}>{g.label}</button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">写作风格</label>
              <div className="space-y-2">
                {styleOptions.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => setForm(f => ({ ...f, style: s.id }))}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      form.style === s.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    <span className="font-medium">{s.name}</span>
                    <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
                  </button>
                ))}
              </div>
              {form.style === 'custom' && (
                <textarea value={form.customStyle}
                  onChange={e => setForm(f => ({ ...f, customStyle: e.target.value }))}
                  className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  rows={3} placeholder="描述你想要的写作风格..." />
              )}
            </div>
          </div>
        )}

        {/* Step 3: 创作方法论 */}
        {step === 'methodology' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">选择创作结构</label>
            <p className="text-sm text-gray-500 mb-4">决定你的故事如何组织章节和节奏</p>
            <div className="space-y-2">
              {methodologies.map(m => (
                <button key={m.id} type="button"
                  onClick={() => setForm(f => ({ ...f, methodology: m.id }))}
                  className={`w-full text-left p-4 rounded-lg border transition ${
                    form.methodology === m.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                  }`}>
                  <span className="font-medium">{m.name}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: AI角色配置 */}
        {step === 'roles' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">AI 创作角色</label>
            <p className="text-sm text-gray-500 mb-4">选择参与创作的 AI 角色，后续可在项目设置中调整</p>
            <div className="space-y-3">
              {form.roles.map((r, i) => (
                <div key={r.role} className={`p-4 rounded-lg border transition ${r.enabled ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{r.name}</span>
                      <p className="text-sm text-gray-500 mt-0.5">{r.desc}</p>
                    </div>
                    <button type="button"
                      onClick={() => {
                        const roles = [...form.roles];
                        roles[i] = { ...roles[i]!, enabled: !roles[i]!.enabled };
                        setForm(f => ({ ...f, roles }));
                      }}
                      className={`w-10 h-6 rounded-full transition ${r.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${r.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: 确认 */}
        {step === 'confirm' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold mb-4">确认项目信息</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">项目名称</dt><dd className="font-medium">{form.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">类型</dt><dd className="font-medium">{projectTypes.find(t => t.id === form.type)?.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">题材</dt><dd className="font-medium">{form.genre}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">风格</dt><dd className="font-medium">{styleOptions.find(s => s.id === form.style)?.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">方法论</dt><dd className="font-medium">{methodologies.find(m => m.id === form.methodology)?.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">AI角色</dt><dd className="font-medium">{form.roles.filter(r => r.enabled).map(r => r.name).join('、')}</dd></div>
            </dl>
          </div>
        )}

        {/* 导航按钮 */}
        <div className="flex gap-3 mt-6">
          {stepIndex > 0 && (
            <button onClick={() => setStep(STEPS[stepIndex - 1]!.key)}
              className="px-6 py-3 text-gray-600 hover:text-gray-900">返回</button>
          )}
          {step !== 'confirm' ? (
            <button onClick={() => setStep(STEPS[stepIndex + 1]!.key)}
              disabled={!canNext()}
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >下一步</button>
          ) : (
            <button onClick={handleCreate}
              disabled={createProject.isLoading}
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >{createProject.isLoading ? '创建中...' : '创建项目'}</button>
          )}
        </div>
      </div>
    </main>
  );
}
