// 精灵配置（前端共享）

export const SPECIES_CONFIG = {
  plant: {
    label: '植物系',
    variants: [{ code: 'sunflower', label: '向日葵', emoji: '🌻' }],
  },
  animal: {
    label: '动物系',
    variants: [{ code: 'fox', label: '小狐狸', emoji: '🦊' }],
  },
  element: {
    label: '元素系',
    variants: [{ code: 'wind', label: '小风灵', emoji: '🌬️' }],
  },
} as const;

export const LEVEL_DAYS: Record<number, number> = {
  1: 0, 2: 26, 3: 58, 4: 96, 5: 140, 6: 190, 7: 245, 8: 305, 9: 365,
};

// 累计经验值表（与后端 CUMULATIVE_XP 一致）
export const CUMULATIVE_XP: Record<number, number> = {
  1: 100, 2: 300, 3: 600, 4: 1000, 5: 1500, 6: 2100, 7: 2800, 8: 3600, 9: 4600,
};

export const ENCOURAGE_TEXTS = [
  '写作加油！你今天也很棒~',
  '每一段文字都是进步的阶梯',
  '坚持写作，你已经在路上了',
  '灵感来源于每一天的积累',
  '慢慢来，好作品需要时间打磨',
  '你的故事值得被讲述',
  '今天的你比昨天更接近完成',
];

export const GUIDE_TEXTS: Record<number, { title: string; text: string; showNext: boolean }> = {
  0: {
    title: '你好呀！',
    text: '我是你的写作伙伴！在开始创作之前，让我带你快速熟悉一下这个地方吧！整个过程只要一两分钟，完成后我就会破壳而出哦！',
    showNext: true,
  },
  1: {
    title: '认识导航栏',
    text: '最上面是导航栏哦：\n• 工作台 — 你的项目大本营\n• 模板广场 — 灵感和方法论\n• 设置 — 个人信息和订阅\n管理员还可以看到「管理后台」入口~',
    showNext: true,
  },
  2: {
    title: '认识工作台',
    text: '这里是你所有项目的家！\n点击「新建项目」按钮，我们就可以开始创作啦~\n你的 VIP 状态和统计信息也在这里显示',
    showNext: true,
  },
  3: {
    title: '创建第一个项目',
    text: '给你的作品取个名字吧！\n选择题材类型和创作风格，这些信息会影响后续 AI 辅助的效果哦~',
    showNext: true,
  },
  4: {
    title: '项目导航栏',
    text: '欢迎来到项目页！\n左边是你的项目导航：\n• 概览 — 项目数据和快捷操作\n• 大纲 — 故事结构规划\n• 设定 — 世界观、角色、力量体系\n• 正文 — 章节创作和编辑\n• 模板 — 引用模板素材\n• AI 助手 — 智能创作伙伴',
    showNext: true,
  },
  5: {
    title: '项目概览',
    text: '概览页展示了你的创作数据：\n• 卷/单元/章节数量\n• 总字数统计\n• 已定稿和草稿数\n• 最近编辑的章节\n点击「快捷操作」可以快速进入编辑哦~',
    showNext: true,
  },
  6: {
    title: '大纲页面',
    text: '大纲是你故事的骨架！\n在这里规划卷、单元和章节结构。\n好的大纲能让你的故事逻辑清晰、节奏紧凑~',
    showNext: true,
  },
  7: {
    title: '编辑器页面',
    text: '这里是你的主战场！\n• 左侧 — 章节列表和导航\n• 中间 — 正文编辑器\n• 右侧 — AI 辅助面板\n• 底部 — 版本管理和切换\n写正文时，我会安安静静地陪伴你~',
    showNext: true,
  },
  8: {
    title: '模板广场',
    text: '灵感枯竭时来这里！\n有官方模板、用户分享的创作方法论，\n还可以打赏支持模板创作者~',
    showNext: true,
  },
  9: {
    title: '准备好了吗？',
    text: '太棒了！你已经学会了基本操作~\n\n以后的使用说明：\n• 拖拽我 — 移动位置\n• 双击我 — 随机互动\n• 右键我 — 打开菜单（签到、聊天等）\n\n现在...我要破壳而出了！准备好了吗？',
    showNext: false,
  },
};
