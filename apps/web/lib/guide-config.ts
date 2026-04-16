// L0 精灵蛋引导配置（12 步）

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
    text: '我是你的精灵！在正式见面之前，让我带你快速熟悉一下这个软件吧！整个过程只要一两分钟，完成后我就会破壳而出哦！',
  },
  {
    step: 1,
    title: '选择你的精灵',
    text: '点击我选择你的精灵系别和种类吧！',
    target: '[data-guide-target="sprite-egg"]',
    placement: 'top',
    action: 'click',
  },
  {
    step: 2,
    title: '孵化中...',
    text: '你的精灵正在破壳而出！',
    action: 'next',
  },
  {
    step: 3,
    title: 'AI 配置',
    text: '这里是你配置 AI 模型的地方。\n\n⚠️ 请注意：\n• 你需要自行填写 API Key 和请求地址\n• 平台不会读取或存储你的 API Key\n• 请自行管理大模型账号和 Token 充值',
    target: '[data-guide-target="ai-config"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/ai-config',
    waitForElement: true,
  },
  {
    step: 4,
    title: '工作台',
    text: '这里是你所有项目的家！\n\n• 新建项目 — 创建小说/网文项目\n• 项目列表 — 快速进入正在创作的项目',
    target: '[data-guide-target="project-list"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/dashboard',
    waitForElement: true,
  },
  {
    step: 5,
    title: '创建项目',
    text: '给你的作品取个名字吧！选择题材类型和创作风格，这些信息会影响后续 AI 辅助的效果哦~',
    target: '[data-guide-target="new-project-btn"]',
    placement: 'top',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 6,
    title: '项目工作台',
    text: '这里是你的创作主阵地：概览、大纲、设定、正文、AI 助手。每个区域都有强大的创作功能！',
    target: '[data-guide-target="project-sidebar"]',
    placement: 'right',
    action: 'next',
    waitForElement: true,
  },
  {
    step: 7,
    title: '模板广场',
    text: '灵感枯竭时来这里！有官方模板、用户分享的创作方法论，还可以打赏支持模板创作者~',
    target: '[data-guide-target="template-list"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/marketplace',
    waitForElement: true,
  },
  {
    step: 8,
    title: '精灵商城',
    text: '在这里可以购买精灵道具，使用精灵豆加速精灵成长。消费精灵豆还会奖励 VIP 时长哦~',
    target: '[data-guide-target="sprite-shop"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/sprite-shop',
    waitForElement: true,
  },
  {
    step: 9,
    title: '设置',
    text: '管理你的账号信息：每日签到获得精灵豆、邀请好友获得奖励、充值精灵豆、修改个人信息。',
    target: '[data-guide-target="settings"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/settings',
    waitForElement: true,
  },
  {
    step: 10,
    title: '告诉我吧！',
    text: '太棒啦！功能都了解完了~现在来告诉我吧：我该叫你什么名字呢？你可以叫我什么？',
    action: 'next',
  },
  {
    step: 11,
    title: '快给我买个道具吧！',
    text: '你有 100 精灵豆，刚好可以买一个入门道具~根据你的精灵系别选择适合我的道具吧！',
    target: '[data-guide-target="sprite-shop"]',
    placement: 'bottom',
    action: 'next',
    navigateTo: '/sprite-shop',
    waitForElement: true,
  },
];

// 获取当前步骤配置
export function getGuideStep(step: number): GuideStepConfig | undefined {
  return L0_GUIDE_STEPS.find(s => s.step === step);
}
