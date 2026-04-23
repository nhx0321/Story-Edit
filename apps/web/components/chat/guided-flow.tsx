'use client';

import { useMemo } from 'react';

export interface StepConfig {
  key: string;
  label: string;
  prompt: string;
}

interface GuidedFlowProps {
  roleKey: string;
  completedSteps: Set<string>;
  currentStepKey: string | null;
  onStepClick: (stepKey: string, prompt: string) => void;
  onClose: () => void;
}

// 文学编辑步骤（含设定联动流程）
const EDITOR_STEPS: StepConfig[] = [
  { key: 'story_needs', label: '需求收集', prompt: '我们先聊聊你的核心创意和故事类型，了解你想写一个什么样的故事。' },
  { key: 'story_skeleton', label: '故事骨架', prompt: '现在来搭建故事骨架，包括世界观、主角成长线和核心冲突。' },
  { key: 'story_narrative', label: '故事脉络', prompt: '现在基于故事骨架，生成全书故事脉络总纲——包括主线剧情、核心冲突演进、各卷主题定位。' },
  { key: 'settings', label: '设定补充', prompt: '故事脉络已确认。现在切换到「设定编辑」搭建世界观和设定体系。' },
  { key: 'settings_delivery', label: '设定接收', prompt: '设定编辑已完成各项基础设定，请查看设定交付清单，确认是否需要根据设定增量修改故事脉络。' },
  { key: 'volume_plan', label: '分卷规划', prompt: '故事脉络和设定均已确认。现在逐层展开卷/单元/章节。' },
  { key: 'unit_breakdown', label: '单元拆解', prompt: '现在把每卷拆解为详细的单元梗概，融入已确认的设定内容。' },
  { key: 'chapter_plan', label: '章节规划', prompt: '最后为每个单元规划具体章节。' },
];

// 设定编辑步骤（细化分类，支持用户自定义补充）
const SETTING_EDITOR_STEPS: StepConfig[] = [
  { key: 'world_view', label: '世界观', prompt: '我们先来设计底层世界观，包括故事的时代背景、社会结构、核心规则和不可打破的铁则。' },
  { key: 'factions', label: '阵营势力', prompt: '现在设计各个阵营势力，包括他们的目标、关系和冲突。' },
  { key: 'protagonists', label: '主角团', prompt: '接下来创建主角团成员设定，包括外貌、性格、背景、动机和能力。' },
  { key: 'antagonists', label: '反派势力', prompt: '现在设计反派势力，包括反派组织、目标和对抗关系。' },
  { key: 'growth_system', label: '成长体系', prompt: '设计力量/成长体系，确定角色成长路径、能力边界和代价。' },
  { key: 'finance', label: '金融体系', prompt: '设计经济体系，包括货币、物价、交易方式等。' },
  { key: 'key_items', label: '重要道具', prompt: '补充重要道具和物资设定，包括稀有物品、神器和关键物资。' },
  { key: 'key_locations', label: '重要地理', prompt: '补充重要地理设定，包括地图、重要地点和环境特征。' },
  { key: 'custom', label: '自定义', prompt: '你还有其他想法和细节需要补充吗？可以自由添加任何设定内容。' },
  { key: 'consistency', label: '一致性复盘', prompt: '最后通读所有设定，检查逻辑自洽性，识别潜在冲突。' },
];

export function GuidedFlow({
  roleKey,
  completedSteps,
  currentStepKey,
  onStepClick,
  onClose,
}: GuidedFlowProps) {

  const steps = useMemo(() => {
    if (roleKey === 'setting_editor') return SETTING_EDITOR_STEPS;
    return EDITOR_STEPS;
  }, [roleKey]);

  // Determine step order and status
  const stepOrder = useMemo(() => {
    const order: Array<StepConfig & { status: 'done' | 'current' | 'locked' }> = [];
    let foundCurrent = false;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let status: 'done' | 'current' | 'locked';
      if (completedSteps.has(step.key)) {
        status = 'done';
      } else if (!foundCurrent) {
        status = 'current';
        foundCurrent = true;
      } else {
        status = 'locked';
      }
      order.push({ ...step, status });
    }
    return order;
  }, [steps, completedSteps]);

  const handleClick = (step: StepConfig & { status: 'done' | 'current' | 'locked' }) => {
    if (step.status === 'locked') return;
    onStepClick(step.key, step.prompt);
  };

  return (
    <div className="mx-3 mb-3">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">引导创作</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            title="关闭引导"
          >
            ×
          </button>
        </div>
        {/* Steps */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1">
            {stepOrder.map((step, i) => (
              <div key={step.key} className="flex items-center flex-1">
                {/* Connector line */}
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-1 ${
                    step.status === 'locked' ? 'bg-gray-200' : 'bg-gray-300'
                  }`} />
                )}
                <button
                  onClick={() => handleClick(step)}
                  disabled={step.status === 'locked'}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition ${
                    step.status === 'done'
                      ? 'text-green-600 cursor-pointer hover:bg-green-50'
                      : step.status === 'current'
                        ? 'bg-gray-900 text-white cursor-pointer hover:bg-gray-800'
                        : 'text-gray-300 cursor-not-allowed'
                  }`}
                  title={step.label}
                >
                  {step.status === 'done' ? (
                    <span className="text-sm">✓</span>
                  ) : step.status === 'current' ? (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                  )}
                  <span className="text-[10px] font-medium leading-tight text-center">
                    {step.label}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { EDITOR_STEPS, SETTING_EDITOR_STEPS };
