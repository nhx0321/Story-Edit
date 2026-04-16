'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

const AGENT_ICONS: Record<string, string> = {
  editor: '📝',
  setting_editor: '🌍',
  writer: '✍️',
};

const AGENT_COLORS: Record<string, string> = {
  editor: 'from-blue-500 to-indigo-600',
  setting_editor: 'from-emerald-500 to-teal-600',
  writer: 'from-orange-500 to-red-600',
};

type AgentRoleKey = 'editor' | 'setting_editor' | 'writer';

export default function AgentSkillsPage({ params }: { params: { id: string } }) {
  const { data: agentPrompts, isLoading } = trpc.conversation.getAgentPrompts.useQuery(
    { projectId: params.id },
  );
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined);
  const { data: profile } = trpc.userAccount.getProfile.useQuery();
  const utils = trpc.useUtils();

  const isPremium = profile && (profile.vipLevel === 'VIP' || profile.vipLevel === '年费VIP' || profile.vipLevel === '体验VIP');

  const savePrompt = trpc.conversation.saveAgentPrompt.useMutation({
    onSuccess: () => {
      utils.conversation.getAgentPrompts.invalidate({ projectId: params.id });
    },
  });

  const resetPrompt = trpc.conversation.resetAgentPrompt.useMutation({
    onSuccess: () => {
      utils.conversation.getAgentPrompts.invalidate({ projectId: params.id });
    },
  });

  const refinePrompt = trpc.conversation.refineAgentPrompt.useMutation();

  const [expandedAgents, setExpandedAgents] = useState<Set<AgentRoleKey>>(new Set());
  const [editingAgent, setEditingAgent] = useState<AgentRoleKey | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [showAiRefine, setShowAiRefine] = useState(false);
  const [aiRefineInput, setAiRefineInput] = useState('');
  const [aiRefineOutput, setAiRefineOutput] = useState('');
  const [aiRefining, setAiRefining] = useState(false);

  const toggleAgent = (roleKey: AgentRoleKey) => {
    const next = new Set(expandedAgents);
    next.has(roleKey) ? next.delete(roleKey) : next.add(roleKey);
    setExpandedAgents(next);
  };

  const openEdit = (roleKey: AgentRoleKey, currentPrompt: string) => {
    setEditingAgent(roleKey);
    setEditPrompt(currentPrompt);
    setShowAiRefine(false);
    setAiRefineInput('');
    setAiRefineOutput('');
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    await savePrompt.mutateAsync({ projectId: params.id, roleKey: editingAgent, prompt: editPrompt });
    setEditingAgent(null);
  };

  const handleReset = async (roleKey: AgentRoleKey) => {
    await resetPrompt.mutateAsync({ projectId: params.id, roleKey });
    setEditingAgent(null);
  };

  const handleAiRefine = async () => {
    if (!editingAgent || !aiRefineInput || !agentPrompts) return;
    if (!configs || configs.length === 0) {
      setAiRefineOutput('请先配置 AI 模型');
      return;
    }
    const agent = agentPrompts.find(a => a.roleKey === editingAgent);
    if (!agent) return;

    setAiRefining(true);
    setAiRefineOutput('');

    try {
      const refineResult = await refinePrompt.mutateAsync({
        projectId: params.id,
        roleKey: editingAgent,
        userPreferences: aiRefineInput,
        currentPrompt: agent.currentPrompt,
      });

      let fullOutput = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [
          { role: 'system', content: refineResult.systemMessage },
          { role: 'user', content: refineResult.userMessage },
        ],
        projectId: params.id,
      })) {
        if (chunk.error) {
          setAiRefineOutput(`优化出错：${chunk.error}`);
          break;
        }
        if (chunk.content) {
          fullOutput += chunk.content;
          setAiRefineOutput(fullOutput);
        }
      }
    } catch {
      setAiRefineOutput('优化失败，请检查网络连接');
    }
    setAiRefining(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-8">
        <Link href={`/project/${params.id}`} className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回项目</Link>
        <div className="mt-4 mb-8">
          <h1 className="text-2xl font-bold">AI 助手技能</h1>
          <p className="text-sm text-gray-500 mt-1">查看和自定义三个 Agent 的系统提示词</p>
        </div>

        {!isPremium && (
          <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-amber-800">🔒 自定义提示词为付费功能</p>
                <p className="text-sm text-amber-600 mt-1">升级会员后可自定义修改 Agent 系统提示词</p>
              </div>
              <Link href="/billing"
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition shrink-0">
                升级会员
              </Link>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : (
          <div className="space-y-4">
            {agentPrompts?.map(agent => {
              const roleKey = agent.roleKey as AgentRoleKey;
              return (
              <AgentCard
                key={agent.roleKey}
                agent={agent}
                expanded={expandedAgents.has(roleKey)}
                onToggle={() => toggleAgent(roleKey)}
                canEdit={!!isPremium}
                onEdit={() => openEdit(roleKey, agent.currentPrompt)}
                onReset={() => handleReset(roleKey)}
                saving={savePrompt.isPending}
                resetting={resetPrompt.isPending}
              />
              );
            })}
          </div>
        )}

        {/* 编辑弹窗 */}
        {editingAgent && agentPrompts && (
          <EditModal
            agent={agentPrompts.find(a => a.roleKey === editingAgent)!}
            editPrompt={editPrompt}
            setEditPrompt={setEditPrompt}
            onSave={handleSave}
            onCancel={() => setEditingAgent(null)}
            onReset={() => handleReset(editingAgent)}
            saving={savePrompt.isPending}
            showAiRefine={showAiRefine}
            setShowAiRefine={setShowAiRefine}
            aiRefineInput={aiRefineInput}
            setAiRefineInput={setAiRefineInput}
            aiRefineOutput={aiRefineOutput}
            aiRefining={aiRefining}
            onAiRefine={handleAiRefine}
            onApplyAiRefine={() => {
              if (aiRefineOutput) {
                setEditPrompt(aiRefineOutput);
                setShowAiRefine(false);
                setAiRefineInput('');
                setAiRefineOutput('');
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, expanded, onToggle, canEdit, onEdit, onReset, saving, resetting }: {
  agent: { roleKey: string; name: string; description: string; currentPrompt: string; defaultPrompt: string; isCustomized: boolean };
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onReset: () => void;
  saving: boolean;
  resetting: boolean;
}) {
  const icon = AGENT_ICONS[agent.roleKey] || '✦';
  const gradient = AGENT_COLORS[agent.roleKey] || 'from-gray-500 to-gray-600';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center px-6 py-5">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-lg mr-4`}>
          {icon}
        </div>
        <button onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{agent.name}</span>
            {agent.isCustomized && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">已自定义</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{agent.description}</p>
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button onClick={onEdit} disabled={saving}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
                编辑
              </button>
              {agent.isCustomized && (
                <button onClick={onReset} disabled={resetting}
                  className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
                  恢复预设
                </button>
              )}
            </>
          )}
          <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-6 pb-5">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            <p className="text-xs text-gray-400 mb-2">系统提示词</p>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed max-h-80 overflow-y-auto">
              {agent.currentPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function EditModal({ agent, editPrompt, setEditPrompt, onSave, onCancel, onReset, saving, showAiRefine, setShowAiRefine, aiRefineInput, setAiRefineInput, aiRefineOutput, aiRefining, onAiRefine, onApplyAiRefine }: {
  agent: { roleKey: string; name: string; defaultPrompt: string };
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  saving: boolean;
  showAiRefine: boolean;
  setShowAiRefine: (v: boolean) => void;
  aiRefineInput: string;
  setAiRefineInput: (v: string) => void;
  aiRefineOutput: string;
  aiRefining: boolean;
  onAiRefine: () => void;
  onApplyAiRefine: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">编辑 {agent.name} 提示词</h3>
        <p className="text-xs text-gray-400 mb-4">修改后，AI 对话将使用新的系统提示词</p>

        {/* 切换按钮 */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setShowAiRefine(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${!showAiRefine ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            手动编辑
          </button>
          <button onClick={() => setShowAiRefine(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${showAiRefine ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            AI 优化
          </button>
        </div>

        {showAiRefine ? (
          /* AI 优化模式 */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">描述你的偏好</label>
              <textarea
                value={aiRefineInput}
                onChange={e => setAiRefineInput(e.target.value)}
                className="w-full h-20 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="例如：我希望更侧重战斗场景描写，减少心理独白，增加环境渲染..."
              />
            </div>
            <button onClick={onAiRefine} disabled={aiRefining || !aiRefineInput}
              className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {aiRefining ? '优化中...' : '开始优化'}
            </button>
            {aiRefineOutput && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">优化结果</label>
                  <button onClick={onApplyAiRefine}
                    className="text-xs text-blue-600 hover:text-blue-800">
                    应用到编辑框
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-48 overflow-y-auto">
                  {aiRefineOutput}
                </pre>
              </div>
            )}
          </div>
        ) : (
          /* 手动编辑模式 */
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">系统提示词</label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              className="w-full h-64 p-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
        )}

        {/* 底部按钮 */}
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            取消
          </button>
          <button onClick={() => onReset()} disabled={saving}
            className="py-2 px-4 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
            恢复预设
          </button>
          <button onClick={onSave} disabled={saving || editPrompt.length < 10}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
