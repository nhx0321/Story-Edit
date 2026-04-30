'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Section {
  id: string;
  title: string;
  summary: string;
  steps: { label: string; desc: string; highlight?: boolean }[];
  tips?: string[];
}

const SECTIONS: Section[] = [
  {
    id: 'create',
    title: '1. 创建项目',
    summary: '在仪表盘创建新项目，填写基本信息，进入项目概览页开始创作。',
    steps: [
      { label: '新建项目', desc: '在仪表盘点击「+ 新建项目」，填写项目名称、类型（小说/网文/剧本）、题材（玄幻/都市/科幻等）、风格（可选）。' },
      { label: '进入项目', desc: '创建后进入项目概览页，看到统计数据（卷数、字数、进度、设定数）和导航卡片。' },
    ],
    tips: ['侧边栏的脉冲箭头（→）会标记推荐的下一步，首次创建后箭头指向「大纲编辑」。'],
  },
  {
    id: 'skeleton',
    title: '2. AI 构思故事骨架',
    summary: '在大纲编辑页打开 AI 对话，文学编辑引导你完成故事骨架和全书脉络。',
    steps: [
      { label: '进入大纲编辑', desc: '点击侧边栏「大纲编辑」或项目概览卡片进入。点击页面上的「AI 构思」按钮打开 AI 对话面板。' },
      { label: '描述核心创意', desc: '用 1-2 句话告诉 AI 你想写什么样的故事。AI 文学编辑会先引导你完成需求收集。' },
      { label: '生成故事骨架', desc: 'AI 基于你的创意生成世界观、主角成长线、核心冲突等故事骨架。你可以确认或提出修改。' },
      { label: '生成故事脉络', desc: 'AI 基于骨架生成全书的故事脉络总纲。确认后 AI 会提示你先去搭建世界观设定。', highlight: true },
    ],
    tips: ['这个阶段只完成骨架和脉络，不要急于分卷。先建设定，再基于设定展开详细梗概。'],
  },
  {
    id: 'settings',
    title: '3. 搭建世界观设定',
    summary: '在设定管理页与设定编辑对话，逐步搭建 10 类世界观设定。',
    steps: [
      { label: '进入设定管理', desc: '点击侧边栏「设定管理」或 AI 对话中的跳转提示进入。点击「AI 设定」打开对话。' },
      { label: '逐类搭建', desc: 'AI 设定编辑会引导你完成 10 类设定：底层世界观 → 阵营势力 → 主角团 → 反派势力 → 成长体系 → 金融体系 → 重要道具 → 重要地理 → 自定义补充 → 一致性复盘。' },
      { label: '灵活跳过', desc: '不需要全部完成 10 类才能继续。可以先完成最关键的几类（如世界观、主角团），其余类目后续补充。', highlight: true },
      { label: 'AI 主动建议', desc: '点击「开始分析」后，AI 不仅分析现有设定覆盖度，还会主动询问你需要补充哪些设定，并根据故事类型（玄幻/都市/科幻等）建议可能需要的额外维度。' },
    ],
    tips: ['虽不强制完成全部设定，但设定越完整，AI 生成的梗概和正文细节越丰富。', '设定词条可以手动创建或编辑，也可以使用「AI 修改」功能让 AI 协助修改。'],
  },
  {
    id: 'outline',
    title: '4. 展开大纲梗概',
    summary: '设定完成后返回大纲页，基于设定逐层展开卷 → 单元 → 章节梗概。',
    steps: [
      { label: '接收设定', desc: '回到大纲页，点击「接收设定」按钮。弹窗展示所有已创建的设定词条，确认后 AI 文学编辑会读取全部设定融入梗概创作。' },
      { label: '分卷规划', desc: 'AI 基于故事脉络 + 设定，规划全书分卷，为每卷生成梗概（概括本卷主线剧情）。' },
      { label: '单元拆解', desc: '每卷拆解为多个单元（叙事段落），为每个单元生成梗概。' },
      { label: '章节规划', desc: '每单元拆解为具体章节，为每章生成梗概。这是正文创作的直接依据。', highlight: true },
      { label: '继续创作自动开聊', desc: '当检测到有未完成梗概的卷/单元/章节时，点击「继续创作」会自动打开 AI 对话，AI 会主动询问你是否需要从该位置继续创作。', highlight: true },
    ],
    tips: ['强烈建议在全部章节梗概完成后，再进入正文创作。任务书会自动注入单元梗概和前后章上下文，梗概齐全 = AI 行文更连贯。', '最低要求：至少 1 个章节梗概即可生成任务书开始正文创作。', '你也可以跳过 AI 引导，直接手动创建卷、单元、章节。'],
  },
  {
    id: 'write',
    title: '5. 正文创作',
    summary: '进入正文创作页，按 任务书 → 开始创作 → 自检 → 修改 → 定稿 的流程撰写每章正文。',
    steps: [
      { label: '生成任务书', desc: '选择章节后，页面自动生成任务书（含章节梗概、前后章关联、相关设定引用）。你可以编辑修改任务书内容。' },
      { label: '设置写作风格', desc: '点击「写作风格」按钮打开风格设置面板，可从预设模板选择或自定义风格描述。试写测试支持三版独立确认，每版可以单独「确认此版本」，全部确认后 AI 自动提取风格描述，可「保存为项目风格」或「保存到我的模板」。' },
      { label: '开始创作', desc: '点击「确认并打开 AI 创作」，AI 正文作者根据任务书和写作风格生成完整正文初稿。每章拥有独立的 AI 对话，对话标题显示所属卷/单元/章路径。你可以提出修改意见让 AI 反复调整。' },
      { label: '确认并保存草稿', desc: 'AI 生成内容满意后，点击「确认并保存到草稿」自动持久化到数据库，刷新页面或切换章节后内容仍在。' },
      { label: '自检', desc: '草稿满意后点击「自检」，AI 自动检查是否符合任务书要求、逻辑是否连贯、与前章是否衔接。' },
      { label: 'AI 修改', desc: '自检发现的问题会列在「AI 修改」标签页中，可逐条确认应用修改。修改结果自动持久化，切换章节后重新进入可恢复修改状态。' },
      { label: '定稿', desc: '确认无误后点击「定稿」。AI 自动对比草稿和定稿差异，提炼 L0-L4 创作经验存入经验库。', highlight: true },
    ],
    tips: ['每章按 任务书 → 风格设置 → 撰写 → 自检 → 定稿 循环。可以跳过自检直接定稿，也可以跳过 AI 直接在编辑器中手动编写。', '每个章节的 AI 对话是独立的，切换章节不会丢失另一章的对话上下文。'],
  },
  {
    id: 'templates',
    title: '6. 我的模板',
    summary: '在「我的模板」中管理你创建或导入的模板，包括风格模板、方法论等。',
    steps: [
      { label: '访问我的模板', desc: '点击侧边栏「我的模板」进入。这里展示你创建或导入的所有自定义模板。' },
      { label: '风格模板', desc: '在写作风格面板的「文件导入」标签页中，点击「导入模板」可从我的模板中筛选 category=style 的风格模板直接应用到项目。' },
      { label: '模板广场', desc: '点击导航栏「模板广场」浏览和购买其他用户发布的公开模板。' },
    ],
    tips: ['风格模板可以在写作风格面板的「试写测试」标签页中选择「从模板导入」作为试写风格来源。'],
  },
  {
    id: 'export',
    title: '7. 导出成品',
    summary: '全部章节定稿后，导出为 Word / TXT / 纯文本格式。',
    steps: [
      { label: '章节导出', desc: '在正文创作页面点击「导出」按钮，导出当前章节。' },
      { label: '批量导出', desc: '在大纲页面导出全部或选中章节，选择输出格式（Word / TXT / 纯文本）。' },
      { label: '导出内容', desc: '导出文档包含：项目标题和简介、卷/单元/章节完整结构、各章节正文内容、故事脉络总结。' },
    ],
    tips: ['导出前请确保所有章节都已定稿。草稿状态的章节也会被导出，但建议先定稿以保证质量。'],
  },
];

export default function HelpPage() {
  const [expanded, setExpanded] = useState<string | null>('create');

  const toggle = (id: string) => {
    setExpanded(prev => prev === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回项目列表</Link>
        </div>

        <h1 className="text-2xl font-bold mb-2">使用帮助</h1>
        <p className="text-gray-500 mb-8">以下是 Story Edit 的完整创作流程引导，帮助你从零开始创作一部作品。</p>

        {/* 流程概览 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">创作流程总览</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">① 创建项目</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">② AI 构思骨架</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">③ 建设定</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">④ 展开梗概</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">⑤ 写正文</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">⑥ 我的模板</span>
            <span className="text-gray-300">→</span>
            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">⑦ 导出</span>
          </div>
        </div>

        {/* 手风琴章节 */}
        <div className="space-y-3">
          {SECTIONS.map(section => {
            const open = expanded === section.id;
            return (
              <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggle(section.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <span className="font-semibold text-gray-900">{section.title}</span>
                  <span className="text-gray-400 text-sm transition-transform" style={{ transform: open ? 'rotate(90deg)' : '' }}>
                    ▶
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mt-4 mb-4">{section.summary}</p>

                    <div className="space-y-3">
                      {section.steps.map((step, i) => (
                        <div key={i} className={`rounded-lg border p-3 ${step.highlight ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium bg-gray-900 text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-800">{step.label}</span>
                            {step.highlight && <span className="text-[10px] text-amber-600 font-medium">★ 关键步骤</span>}
                          </div>
                          <p className="text-xs text-gray-500 ml-7">{step.desc}</p>
                        </div>
                      ))}
                    </div>

                    {section.tips && section.tips.length > 0 && (
                      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-700 mb-1">提示</p>
                        <ul className="text-xs text-blue-600 space-y-1">
                          {section.tips.map((tip, i) => (
                            <li key={i} className="flex gap-1">
                              <span className="shrink-0">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部常见问题链接 */}
        <div className="mt-8 text-center text-sm text-gray-400">
          <p>如需更多帮助，请在导航栏的账号菜单中选择「意见反馈」联系我们。</p>
        </div>
      </div>
    </div>
  );
}
