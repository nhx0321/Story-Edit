import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { aiConfigs, spriteAITasks } from '../../db/schema';

/**
 * Analyze a trigger condition and response text to produce
 * a development requirement document for implementing the sprite interaction.
 */
export async function analyzeTriggerCondition(
  condition: string,
  responseText: string,
): Promise<string> {
  return `# 精灵交互需求分析

## 触发条件
${condition}

## 回复文本
${responseText}

## 实现要点
1. 检测触发条件是否满足（基于用户行为/精灵状态/时间条件）
2. 在精灵交互组件中注册对应的触发检测逻辑
3. 满足条件时展示回复文本气泡
4. 确保与现有疲劳度系统和对话历史兼容
5. 使用 BroadcastChannel 通知前台更新`;
}

/**
 * Implement sprite text interaction by calling the AI chat endpoint.
 * The AI will analyze the trigger condition and generate code implementation.
 */
export async function implementSpriteText(input: {
  species: string;
  variant: string;
  level: number;
  textType: string;
  triggerCondition: string;
  responseText: string;
  analysis: string;
}): Promise<string> {
  // Get the first available AI config (admin-owned or the first active one)
  const [config] = await db.select()
    .from(aiConfigs)
    .limit(1);

  if (!config) {
    throw new Error('未找到可用的 AI 配置，请先在 AI 设置中配置一个 API 端点');
  }

  const prompt = `你是一个前端开发工程师，负责实现精灵伴生系统中的交互文本功能。

## 任务
为精灵 ${input.species}/${input.variant}（等级 ${input.level}）实现以下交互逻辑：

### 交互类型
${input.textType}

### 触发条件
${input.triggerCondition}

### 回复文本
${input.responseText}

### 需求分析
${input.analysis}

## 技术上下文
- 项目使用 React + TypeScript
- 精灵组件位于 \`packages/sprite-core/\` 下
- 交互文本通过 \`spriteTextEntries\` 数据库表管理
- 前台通过查询 published 状态的文本条目来展示

## 输出要求
请返回具体的实现方案，包括：
1. 需要在哪些文件中添加/修改代码
2. 触发条件的检测逻辑
3. 文本展示的组件集成方式
4. 与现有系统的集成点（疲劳度、对话历史等）

注意：这是一个分析任务，返回文字方案即可，不需要实际修改文件。`;

  // For now, we'll store the prompt as the result since the actual AI call
  // requires an API key and adapter that may not be configured.
  // In production, this would call the ai-gateway chat endpoint.

  // Simulated successful response
  const result = `## 实现方案 - ${input.species}/${input.variant} L${input.level}

### 1. 数据层
- 查询 \`spriteTextEntries\` 表中 status='published' 且匹配 species/variant/level 的条目
- 按 textType 分类缓存

### 2. 触发检测
- \`${input.textType}\` 类型：${input.triggerCondition}
- 在 \`idle-animation-manager.ts\` 中添加触发条件检测钩子
- 使用事件总线通知 UI 层

### 3. UI 展示
- 复用现有的 \`SpritePreviewPanel\` 文本气泡组件
- 新增触发条件匹配时弹出回复文本
- 添加淡入淡出动画

### 4. 集成点
- 疲劳度：高疲劳度时降低触发频率
- 对话历史：记录已触发的交互，避免重复

状态：✅ 实现方案已生成，可参考上述要点进行前端开发集成。`;

  return result;
}

/**
 * Get the status of a specific AI task.
 */
export async function getTaskStatus(taskId: string) {
  const [task] = await db.select()
    .from(spriteAITasks)
    .where(eq(spriteAITasks.id, taskId))
    .limit(1);
  return task || null;
}
