// L0 精灵蛋引导配置（10 步）

export interface GuideStepConfig {
  step: number;
  title: string;
  text: string;
  target?: string;            // CSS 选择器
  placement?: 'top' | 'bottom' | 'left' | 'right';
  action?: 'next' | 'click' | 'navigate';
  navigateTo?: string;
  waitForElement?: boolean;
}

export const L0_GUIDE_STEPS: GuideStepConfig[] = [
  {
    step: 0,
    title: '你好呀！',
    text: '我是你的写作伙伴！在开始创作之前，让我带你快速熟悉一下这个地方吧！整个过程只要一两分钟，完成后我就会破壳而出哦！',
  },
  {
    step: 1,
    title: '认识导航栏',
    text: '最上面是导航栏哦：工作台、模板广场、设置。管理员还可以看到「管理后台」入口~',
    target: '[data-guide-target="navbar"]',
    placement: 'bottom',
    action: 'next',
  },
  {
    step: 2,
    title: '认识工作台',
    text: '这里是你所有项目的家！点击「新建项目」按钮，我们就可以开始创作啦~',
    target: '[data-guide-target="new-project-btn"]',
    placement: 'top',
    action: 'click',
    navigateTo: '/project/new',
  },
  {
    step: 3,
    title: '创建第一个项目',
    text: '给你的作品取个名字吧！选择题材类型和创作风格，这些信息会影响后续 AI 辅助的效果哦~',
    target: '[data-guide-target="project-form"]',
    placement: 'bottom',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 4,
    title: '项目导航栏',
    text: '欢迎来到项目页！左边是你的项目导航：概览、大纲、设定、正文、模板、AI 助手。',
    target: '[data-guide-target="project-sidebar"]',
    placement: 'right',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 5,
    title: '项目概览',
    text: '概览页展示了你的创作数据：卷/单元/章节数量、总字数统计、已定稿和草稿数。',
    target: '[data-guide-target="overview-stats"]',
    placement: 'top',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 6,
    title: '大纲页面',
    text: '大纲是你故事的骨架！在这里规划卷、单元和章节结构。好的大纲能让你的故事逻辑清晰、节奏紧凑~',
    target: '[data-guide-target="outline-tree"]',
    placement: 'bottom',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 7,
    title: '编辑器页面',
    text: '这里是你的主战场！左侧章节列表、中间正文编辑器、右侧 AI 辅助面板、底部版本管理。',
    target: '[data-guide-target="chapter-editor"]',
    placement: 'right',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 8,
    title: '模板广场',
    text: '灵感枯竭时来这里！有官方模板、用户分享的创作方法论，还可以打赏支持模板创作者~',
    target: '[data-guide-target="template-list"]',
    placement: 'bottom',
    action: 'next',
  },
  {
    step: 9,
    title: '准备好了吗？',
    text: '太棒了！你已经学会了基本操作~现在...我要破壳而出了！准备好了吗？',
    action: 'next',
  },
];

// 获取当前步骤配置
export function getGuideStep(step: number): GuideStepConfig | undefined {
  return L0_GUIDE_STEPS.find(s => s.step === step);
}
