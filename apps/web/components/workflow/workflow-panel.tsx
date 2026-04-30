'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

interface WorkflowPanelProps {
  chapterId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
  taskBrief?: string;
  onFinalize?: () => void;
  onTaskBriefConfirm?: (brief: string) => void;
}

export function WorkflowPanel({ chapterId, projectId, open, onClose, taskBrief, onFinalize, onTaskBriefConfirm }: WorkflowPanelProps) {
  const [activeTab, setActiveTab] = useState<'brief' | 'checklist' | 'finalize'>('brief');
  const [editableBrief, setEditableBrief] = useState('');
  const [briefConfirmed, setBriefConfirmed] = useState(false);
  const [selfCheckReport, setSelfCheckReport] = useState<string | null>(null);
  const [selfCheckGenerating, setSelfCheckGenerating] = useState(false);
  const [showChapterSummary, setShowChapterSummary] = useState(false);
  const [progressSummary, setProgressSummary] = useState('');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [summarySaving, setSummarySaving] = useState(false);
  const [showUnitSummary, setShowUnitSummary] = useState(false);

  // Get user's AI configs for self-check
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: open && activeTab === 'checklist' });

  // Fall back to API query if taskBrief prop not provided (used for both brief tab and self-check)
  const { data: taskBriefData, isLoading: briefLoading } = trpc.workflow.generateTaskBrief.useQuery(
    { chapterId },
    { enabled: open },
  );

  const { data: versions } = trpc.workflow.getChapterVersions.useQuery(
    { chapterId },
    { enabled: open },
  );

  const displayBrief = taskBrief || taskBriefData?.brief;

  // 当 displayBrief 变化时更新 editableBrief
  if (displayBrief && editableBrief !== displayBrief && !briefConfirmed) {
    setEditableBrief(displayBrief);
  }

  const currentVersion = versions?.[0];
  const isFinalized = currentVersion?.isFinal;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">创作工作流</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* 进度指示 */}
        <div className="flex gap-1 mb-4">
          {(['brief', 'checklist', 'finalize'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition ${
                activeTab === tab ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {tab === 'brief' ? '任务书' : tab === 'checklist' ? '自检' : '定稿'}
            </button>
          ))}
        </div>

        {/* 任务书 — 可编辑 + 确认 */}
        {activeTab === 'brief' && (
          <div>
            {briefLoading ? (
              <p className="text-sm text-gray-400">生成任务书中...</p>
            ) : displayBrief ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium text-sm">任务书内容（可编辑）</h4>
                  {briefConfirmed && <span className="text-xs text-green-600">已确认</span>}
                </div>
                <textarea
                  value={editableBrief}
                  onChange={e => { setEditableBrief(e.target.value); setBriefConfirmed(false); }}
                  className="w-full h-48 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                {taskBriefData && (
                  <div className="text-xs text-gray-400 mt-2">
                    <p>相关设定：{taskBriefData.settingCount} 条</p>
                    <p>前情章节：{taskBriefData.prevChapters.length} 章</p>
                  </div>
                )}
                {!briefConfirmed && (
                  <button
                    onClick={() => {
                      setBriefConfirmed(true);
                      onTaskBriefConfirm?.(editableBrief);
                    }}
                    className="w-full mt-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                  >
                    确认任务书，开始创作
                  </button>
                )}
                {briefConfirmed && (
                  <p className="text-xs text-green-600 mt-2">任务书已确认，切换到 AI 创作面板生成正文</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">无法生成任务书</p>
            )}
          </div>
        )}

        {/* 自检 — AI 自动检查 */}
        {activeTab === 'checklist' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">AI 自检报告</h4>
            </div>
            {!selfCheckReport && !selfCheckGenerating && (
              <div>
                <p className="text-sm text-gray-500 mb-3">点击开始自检，AI 将自动分析正文内容，生成修改建议</p>
                <button
                  onClick={async () => {
                    if (!configs || configs.length === 0) {
                      setSelfCheckReport('请先配置 AI 模型');
                      return;
                    }
                    // 获取任务书和正文
                    const briefResult = taskBriefData;
                    const latestContent = versions?.[0]?.content || '';
                    if (!latestContent) {
                      setSelfCheckReport('暂无正文内容，无法自检');
                      return;
                    }
                    setSelfCheckGenerating(true);
                    setSelfCheckReport('');
                    try {
                      const systemMsg = { role: 'system' as const, content: '你是一名专业的文学编辑。请对小说正文进行全面的自检，找出需要修改的问题。输出格式清晰的自检报告。注意：报告中不要包含任何签名或署名。' };
                      const userMsg = { role: 'user' as const, content: briefResult?.checkPrompt || `请对以下正文进行自检：\n\n${latestContent.slice(0, 8000)}` };
                      let fullReport = '';
                      for await (const chunk of streamAiChat({
                        configId: configs[0].id,
                        messages: [systemMsg, userMsg],
                        projectId,
                      })) {
                        if (chunk.error) {
                          setSelfCheckReport(`自检出错：${chunk.error}`);
                          break;
                        }
                        if (chunk.content) {
                          fullReport += chunk.content;
                          setSelfCheckReport(fullReport);
                        }
                      }
                      if (!fullReport) {
                        setSelfCheckReport('自检完成，未发现问题');
                      }
                    } catch {
                      setSelfCheckReport('自检失败，请检查网络连接');
                    }
                    setSelfCheckGenerating(false);
                  }}
                  disabled={!configs || configs.length === 0}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  开始自检
                </button>
              </div>
            )}
            {selfCheckGenerating && (
              <div>
                <p className="text-sm text-gray-400 mb-3">AI 自检中...</p>
                {selfCheckReport && (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-64 overflow-y-auto">
                    {selfCheckReport}
                  </pre>
                )}
              </div>
            )}
            {selfCheckReport && !selfCheckGenerating && (
              <div>
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 mb-3 border border-gray-100 max-h-64 overflow-y-auto">
                  {selfCheckReport}
                </pre>
                <button
                  onClick={() => { setSelfCheckReport(null); }}
                  className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  重新自检
                </button>
              </div>
            )}
          </div>
        )}

        {/* 定稿 + 本章创作总结 */}
        {activeTab === 'finalize' && (
          <div>
            {isFinalized ? (
              <div className="text-center py-8">
                <p className="text-green-600 text-lg font-medium mb-2">已定稿</p>
                <p className="text-sm text-gray-500">本章已确认为最终版本</p>
                <p className="text-xs text-gray-400 mt-1">
                  字数：{currentVersion?.wordCount || 0} 字
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  确认本章正文已修改完毕，可以定稿？定稿后将自动：
                </p>
                <ul className="text-xs text-gray-500 space-y-1 mb-4 ml-4 list-disc">
                  <li>标记当前版本为最终版本</li>
                  <li>生成创作进度报告</li>
                  <li>准备下一章创作流程</li>
                </ul>
                <div className="space-y-3">
                  <button onClick={onFinalize}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">
                    确认定稿
                  </button>

                  {/* 本章创作总结 */}
                  <div className="pt-3 border-t border-gray-100">
                    <button onClick={() => setShowChapterSummary(!showChapterSummary)}
                      className="text-sm text-gray-500 hover:text-gray-700 w-full text-left">
                      {showChapterSummary ? '收起创作总结' : '生成本章创作总结'}
                    </button>
                    {showChapterSummary && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">创作进度总结</label>
                          <textarea
                            value={progressSummary}
                            onChange={e => setProgressSummary(e.target.value)}
                            className="w-full h-24 p-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="本章完成了哪些内容..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">创作经验总结</label>
                          <textarea
                            value={experienceSummary}
                            onChange={e => setExperienceSummary(e.target.value)}
                            className="w-full h-24 p-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="创作过程中的经验教训..."
                          />
                        </div>
                        <button
                          disabled={summarySaving || !progressSummary || !experienceSummary}
                          onClick={async () => {
                            setSummarySaving(true);
                            // Save via tRPC (will be called from parent)
                            // For now just close the panel
                            setSummarySaving(false);
                            setShowChapterSummary(false);
                          }}
                          className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {summarySaving ? '保存中...' : '保存总结到创作进度'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 单元总结 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button onClick={() => setShowUnitSummary(!showUnitSummary)}
            className="text-sm text-gray-500 hover:text-gray-700">
            {showUnitSummary ? '收起单元总结' : '生成单元总结'}
          </button>
          {showUnitSummary && <UnitSummaryGenerator chapterId={chapterId} projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}

function UnitSummaryGenerator({ chapterId, projectId }: { chapterId: string; projectId: string }) {
  const [generating, setGenerating] = useState(false);
  const { data: summaryData } = trpc.workflow.generateUnitSummary.useQuery(
    // We need unitId, but we only have chapterId — use chapterId as fallback
    { unitId: chapterId },
    { enabled: false }, // Disabled until we have proper unitId
  );

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-400 mb-2">单元完成后可生成内容总结，更新正文梗概</p>
      <button disabled={generating}
        className="text-xs px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 transition disabled:opacity-50">
        {generating ? '生成中...' : '开始总结'}
      </button>
    </div>
  );
}
