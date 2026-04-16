// 创作引擎 — 工作流定义与编排
// 插件式架构：不同项目类型加载不同工作流

export type PhaseType = 'conception' | 'creation';
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  phase: PhaseType;
  requiredRole: string; // AI 角色 role
  order: number;
  optional: boolean;
}

export interface WorkflowDef {
  id: string;
  name: string;
  projectType: string;
  steps: WorkflowStep[];
}

// 默认小说创作工作流
export const NOVEL_WORKFLOW: WorkflowDef = {
  id: 'novel_default',
  name: '小说创作标准流程',
  projectType: 'novel',
  steps: [
    // 构思阶段
    { id: 'core_idea', name: '核心创意', description: '一句话概括故事核心', phase: 'conception', requiredRole: 'editor', order: 1, optional: false },
    { id: 'overall_plot', name: '整体剧情', description: '展开完整故事线', phase: 'conception', requiredRole: 'editor', order: 2, optional: false },
    { id: 'volume_outline', name: '分卷大纲', description: '拆分为多卷，每卷核心主题和事件', phase: 'conception', requiredRole: 'editor', order: 3, optional: false },
    { id: 'unit_synopsis', name: '单元梗概', description: '每单元的核心事件链和角色变化', phase: 'conception', requiredRole: 'editor', order: 4, optional: false },
    { id: 'settings', name: '各项设定', description: '人物、世界观、力量体系等', phase: 'conception', requiredRole: 'setting_editor', order: 5, optional: false },
    { id: 'chapter_synopsis', name: '章节梗概', description: '每章的起承转合和爽点节点', phase: 'conception', requiredRole: 'editor', order: 6, optional: false },
    // 创作阶段（循环）
    { id: 'task_brief', name: '生成任务书', description: '聚合前情+剧情+设定+状态', phase: 'creation', requiredRole: 'writer', order: 7, optional: false },
    { id: 'write_draft', name: '撰写正文', description: 'AI 根据任务书撰写章节正文', phase: 'creation', requiredRole: 'writer', order: 8, optional: false },
    { id: 'self_check', name: '自检', description: '检查设定一致性、逻辑、节奏', phase: 'creation', requiredRole: 'writer', order: 9, optional: true },
    { id: 'user_review', name: '用户审阅', description: '用户编辑或提意见让AI修改', phase: 'creation', requiredRole: 'writer', order: 10, optional: false },
    { id: 'learn_experience', name: '沉淀经验', description: '对比原稿与定稿，提取修改经验', phase: 'creation', requiredRole: 'writer', order: 11, optional: true },
    { id: 'finalize', name: '定稿', description: '确认定稿，更新进度', phase: 'creation', requiredRole: 'writer', order: 12, optional: false },
  ],
};

// 工作流注册表
const workflows = new Map<string, WorkflowDef>();
workflows.set('novel_default', NOVEL_WORKFLOW);

export function getWorkflow(id: string): WorkflowDef | undefined {
  return workflows.get(id);
}

export function getDefaultWorkflow(projectType: string): WorkflowDef {
  return NOVEL_WORKFLOW; // 目前只有小说工作流
}
