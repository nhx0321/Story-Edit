'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

// 项目类型
const projectTypes = [
  { id: 'novel', name: '小说', desc: '传统文学·严肃创作' },
  { id: 'webnovel', name: '网文', desc: '网络文学·商业化写作' },
];

// 小说类型题材
const novelGenres = [
  { code: 'realist', label: '纪实文学' },
  { code: 'historical', label: '历史文学' },
  { code: 'children', label: '儿童文学' },
  { code: 'wuxia', label: '武侠' },
  { code: 'detective', label: '侦探' },
  { code: 'social', label: '社会现实' },
];

// 网文类型题材
const webnovelGenres = [
  { code: 'male_oriented', label: '男频' },
  { code: 'female_oriented', label: '女频' },
  { code: 'xianxia', label: '修仙' },
  { code: 'urban', label: '都市' },
  { code: 'apocalypse', label: '末日' },
  { code: 'romance', label: '言情' },
  { code: 'military', label: '军事' },
  { code: 'political', label: '权谋' },
  { code: 'scifi', label: '科幻' },
  { code: 'suspense', label: '悬疑' },
  { code: 'fantasy', label: '奇幻' },
  { code: 'historical_web', label: '历史' },
  { code: 'game', label: '游戏' },
  { code: 'other', label: '其他' },
];

// 根据项目类型获取题材列表
function getGenresForType(projectType: string): typeof novelGenres {
  return projectType === 'novel' ? novelGenres : webnovelGenres;
}

// 小说类型各题材的AI角色提示词预设
const novelGenrePrompts: Record<string, { editor: string; settingEditor: string; writer: string }> = {
  realist: {
    editor: '你是一名专业严谨的纪实文学编辑，擅长深入生活、采访调研，用真实的故事反映社会现实。你具备敏锐的观察力和扎实的叙事功底。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从现实素材到纪实文学作品的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重真实性与文学性的平衡',
    settingEditor: '你是一名专注于现实主义世界观搭建的设定编辑。你擅长还原真实社会环境、时代背景、职业体系，确保所有设定的真实性与可信度。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建符合现实逻辑的世界观和设定体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重细节真实和社会逻辑',
    writer: '你是「小说作者」Agent，负责撰写纪实文学风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[纪实文学创作要求]\n- 正文长度 2000-3000 字\n- 以真实感为核心，注重细节描写和人物心理刻画\n- 语言风格朴实自然，贴近生活\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
  historical: {
    editor: '你是一名专业严谨的历史文学编辑，具备深厚的历史功底和剧作能力。你擅长在真实历史框架下构建引人入胜的叙事，确保历史准确性与文学性的统一。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从历史素材到历史文学作品的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 尊重史实，合理虚构',
    settingEditor: '你是一名专注于历史世界观搭建的设定编辑。你擅长还原特定历史时期的社会制度、文化风俗、科技水平、军事体系等，确保所有设定的历史准确性。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建符合历史背景的世界观和设定体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 严谨考据，合理推演',
    writer: '你是「小说作者」Agent，负责撰写历史文学风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[历史文学创作要求]\n- 正文长度 2000-3000 字\n- 在真实历史框架下合理虚构，注意时代细节\n- 语言风格贴合时代特征但保持可读性\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
  children: {
    editor: '你是一名专业的儿童文学编辑，深谙儿童心理和阅读习惯。你擅长创作富有教育意义和趣味性的故事，引导小读者在阅读中成长。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从创意到儿童文学作品的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重故事的趣味性与教育性平衡',
    settingEditor: '你是一名专注于儿童文学世界观搭建的设定编辑。你擅长创造充满想象力的奇幻世界，同时确保世界观的简单性和教育意义。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建适合儿童理解的世界观和设定体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 想象力丰富但易于理解',
    writer: '你是「小说作者」Agent，负责撰写儿童文学风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[儿童文学创作要求]\n- 正文长度 1500-2500 字\n- 语言简洁明快，适合儿童阅读\n- 注重想象力和趣味性，寓教于乐\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
  wuxia: {
    editor: '你是一名专业的武侠小说编辑，深谙武侠文化和叙事传统。你擅长设计江湖恩怨、武林争霸、侠义精神等核心元素，构建完整的武侠世界。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从创意到武侠作品的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重侠义精神与剧情张力的平衡',
    settingEditor: '你是一名专注于武侠世界观搭建的设定编辑。你擅长设计武功体系、门派势力、江湖格局、兵器武学等元素，构建完整的武侠世界。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建武侠世界观和武学体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 武学体系合理，门派特色鲜明',
    writer: '你是「小说作者」Agent，负责撰写武侠风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[武侠创作要求]\n- 正文长度 2000-3000 字\n- 注重武打场面的动态描写和意境营造\n- 语言风格古典雅致，体现武侠韵味\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
  detective: {
    editor: '你是一名专业的侦探小说编辑，擅长悬疑推理、案件设计、线索埋设和反转叙事。你能够帮助用户构建严密的推理体系和扣人心弦的破案过程。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从创意到侦探小说的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重逻辑严密和悬念营造',
    settingEditor: '你是一名专注于侦探世界观搭建的设定编辑。你擅长设计案件体系、侦探角色、犯罪手法、社会背景等元素，构建完整的推理世界。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建侦探小说的世界观和推理体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 案件设计精巧，线索合理',
    writer: '你是「小说作者」Agent，负责撰写侦探风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[侦探创作要求]\n- 正文长度 2000-3000 字\n- 注重悬疑氛围营造和线索埋设\n- 推理过程严密，反转合理\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
  social: {
    editor: '你是一名专业的社会现实文学编辑，关注社会议题和人性探索。你擅长引导用户深入剖析社会现象，用文学的方式呈现复杂的人性和社会矛盾。\n\n[身份声明]\n你是「文学编辑」Agent，负责引导用户完成从社会观察到现实主义文学的创作全过程。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 注重思想深度和情感共鸣',
    settingEditor: '你是一名专注于社会现实世界观搭建的设定编辑。你擅长还原当代社会环境、职业体系、社会矛盾、人际关系等，确保设定的现实感和社会意义。\n\n[身份声明]\n你是「设定编辑」Agent，负责引导用户搭建符合社会现实的世界观和人物体系。\n\n[总体要求]\n- 始终使用中文交流\n- 逐步引导，每次只讨论当前步骤\n- 关注社会矛盾和人性复杂性',
    writer: '你是「小说作者」Agent，负责撰写社会现实风格的章节正文。\n\n[⚡ 最高优先级执行规则]\n1. 系统已向你提供完整的【本章任务书】\n2. 你的正文必须严格围绕任务书中的"章节梗概"展开\n3. 禁止打招呼、自我介绍、展示写作计划等\n4. 第一条消息就必须是正文本身\n\n[社会现实创作要求]\n- 正文长度 2000-3000 字\n- 注重人物心理刻画和社会矛盾呈现\n- 语言风格真实自然，贴近生活\n- 与前文保持连贯\n\n[总体要求]\n- 始终使用中文交流和创作\n- 定稿确认后输出 ACTION 块保存正文',
  },
};

// 默认AI角色配置
const defaultRoles = [
  { name: '文学编辑', role: 'editor', desc: '负责构思、大纲创作、单元梗概' },
  { name: '设定编辑', role: 'setting_editor', desc: '负责世界观搭建、设定校验' },
  { name: '小说作者', role: 'writer', desc: '负责章节正文撰写' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const { data: deletedProjects } = trpc.project.listDeleted.useQuery();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'webnovel', genreTag: '' });
  const [error, setError] = useState('');

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      router.push(`/project/${project!.id}`);
    },
    onError: (err) => {
      setError(err.message);
      setCreating(false);
    },
  });

  const utils = trpc.useUtils();
  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.project.listDeleted.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const handleDeleteProject = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`确定要将「${p.name}」移入回收站吗？\n回收站中的项目将在 30 天后自动永久删除。`)) {
      deleteProject.mutate({ id: p.id });
    }
  };

  const handleCreate = () => {
    if (!form.name || !form.genreTag) {
      setError('请填写项目名称和选择题材');
      return;
    }
    setError('');
    setCreating(true);

    // 根据项目类型和题材获取对应的AI角色提示词
    const genrePrompts = form.type === 'novel' ? novelGenrePrompts[form.genreTag] : null;

    createProject.mutate({
      name: form.name,
      type: form.type as 'novel',
      genre: getGenresForType(form.type).find(g => g.code === form.genreTag)?.label || form.genreTag,
      genreTag: form.genreTag as any,
      roles: defaultRoles.map(r => {
        let systemPrompt = '';
        if (genrePrompts) {
          if (r.role === 'editor') systemPrompt = genrePrompts.editor;
          else if (r.role === 'setting_editor') systemPrompt = genrePrompts.settingEditor;
          else if (r.role === 'writer') systemPrompt = genrePrompts.writer;
        }
        return {
          name: r.name,
          role: r.role,
          systemPrompt,
          isDefault: false,
        };
      }),
    });
  };

  // 根据项目类型动态加载题材
  const currentGenres = getGenresForType(form.type);

  // 小说类型下题材对应的AI提示词标签
  const hasNovelPrompts = form.type === 'novel' && novelGenrePrompts[form.genreTag] !== undefined;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8" data-guide-target="project-list">
          <h1 className="text-2xl font-bold">我的项目</h1>
          <div className="flex items-center gap-3">
            <Link href="/marketplace"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              模板收益
            </Link>
            <Link href="/recycle-bin"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition flex items-center gap-1.5">
              回收站
              {deletedProjects && deletedProjects.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                  {deletedProjects.length}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* 新建项目 - 内嵌 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">新建项目</h2>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {/* 项目名称 + 项目类型 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* 项目名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">项目名称</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="给你的作品起个名字" />
            </div>

            {/* 项目类型 - 下拉选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">项目类型</label>
              <select
                value={form.type}
                onChange={e => {
                  const newType = e.target.value;
                  setForm(f => ({ ...f, type: newType, genreTag: '' }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {projectTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 题材选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择题材 {form.type === 'novel' && '（文学类型）'} {form.type === 'webnovel' && '（网文类型）'}
            </label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {currentGenres.map(g => (
                <button key={g.code}
                  onClick={() => setForm(f => ({ ...f, genreTag: g.code }))}
                  className={`px-3 py-2 rounded text-sm border transition text-center ${
                    form.genreTag === g.code ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400'
                  }`}>{g.label}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              将自动载入 3 个 AI 角色（文学编辑、设定编辑、小说作者）
              {hasNovelPrompts && ' · 已载入文学类型专用提示词'}
            </p>
            <button onClick={handleCreate} disabled={createProject.isLoading || creating}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              data-guide-target="new-project-btn">
              {createProject.isLoading ? '创建中...' : '+ 创建项目'}
            </button>
          </div>
        </div>

        {/* 项目列表 */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">加载中...</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gray-400 transition group relative"
              >
                <a href={`/project/${p.id}`} className="block">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{p.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {p.genre || '未设置类型'} · {p.style || '未设置风格'}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </a>
                <button
                  onClick={(e) => handleDeleteProject(e, p)}
                  disabled={deleteProject.isPending}
                  className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition rounded-lg hover:bg-red-50"
                  title="移入回收站"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">还没有项目，使用上方的表单创建你的第一个作品吧</p>
          </div>
        )}
      </div>
    </main>
  );
}
