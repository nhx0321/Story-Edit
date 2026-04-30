'use client';

import { useState, useRef } from 'react';
import { streamAiChat } from '@/lib/ai-stream';

export interface ModificationItem {
  id: string;
  beforeText: string;
  afterText: string;
  status: 'pending' | 'accepted' | 'skipped' | 'rewriting';
  reason?: string;
  rewriteContent?: string;
}

interface AiModifyDialogProps {
  open: boolean;
  onClose: () => void;
  chapterContent: string;       // 当前章节正文（纯文本或 HTML）
  selfCheckReport: string;      // 自检报告
  configId: string;             // AI 配置 ID
  projectId: string;
  onApply: (newContent: string, modifications: ModificationItem[]) => void;
}

export function AiModifyDialog({ open, onClose, chapterContent, selfCheckReport, configId, projectId, onApply }: AiModifyDialogProps) {
  const [phase, setPhase] = useState<'prepare' | 'generating' | 'review'>('prepare');
  const [suggestions, setSuggestions] = useState('');
  const [generatingText, setGeneratingText] = useState('');
  const [fullModifiedContent, setFullModifiedContent] = useState('');
  const [modifications, setModifications] = useState<ModificationItem[]>([]);

  const abortRef = useRef(false);

  const handleImportSuggestions = () => {
    // 从自检报告中提取综合修改建议部分
    const report = selfCheckReport;
    // 匹配常见的综合建议标题
    const patterns = [
      /(?:综合[修改]*建议|总结[性]*建议|总体建议|修改建议|综合评价)[：:\s]*\n?([\s\S]*)$/im,
      /(?:以下[是为]*综合[性]*[修改]*建议|以下[是为]*总体[修改]*建议)[：:\s]*\n?([\s\S]*)$/im,
    ];
    let extracted = '';
    for (const pattern of patterns) {
      const match = report.match(pattern);
      if (match && match[1] && match[1].trim().length > 10) {
        extracted = match[1].trim();
        break;
      }
    }
    // 如果没匹配到，尝试从最后一部分提取（假设综合建议在末尾）
    if (!extracted) {
      const sections = report.split(/\n\n+/);
      if (sections.length > 1) {
        const lastSection = sections[sections.length - 1].trim();
        if (lastSection.length > 10 && lastSection.length < report.length * 0.8) {
          extracted = lastSection;
        }
      }
    }
    setSuggestions(extracted || report);
  };

  const handleConfirmModify = async () => {
    if (!suggestions.trim() || !configId) return;

    const plainContent = chapterContent.replace(/<[^>]*>/g, '').slice(0, 15000);

    const prompt = `你是一名专业文学编辑。请根据以下修改建议，对小说正文进行精准修改。

【修改约束】
1. 只根据修改意见修改，不要重写或大幅改动无关段落
2. 保持原文的文风、人物性格和叙事节奏
3. 修改要精准，不要过度发挥

【当前章节正文】
${plainContent}

【修改建议】
${suggestions}

请按以下格式输出修改结果：

## 修改后全文
[完整的修改后正文，纯文本格式]

## 修改明细
1. 【位置/原因】
修改前：[原文片段]
修改后：[修改后片段]

2. 【位置/原因】
修改前：[原文片段]
修改后：[修改后片段]`;

    setPhase('generating');
    setGeneratingText('');
    setFullModifiedContent('');
    setModifications([]);
    abortRef.current = false;

    const systemMsg = { role: 'system' as const, content: '你是一名资深文学编辑，擅长根据修改建议对小说正文进行精准修改。请严格按格式输出。' };
    const userMsg = { role: 'user' as const, content: prompt };

    let fullResult = '';

    try {
      for await (const chunk of streamAiChat({
        configId,
        messages: [systemMsg, userMsg],
        projectId,
      })) {
        if (abortRef.current) break;
        if (chunk.error) {
          setGeneratingText(`修改出错：${chunk.error}`);
          return;
        }
        if (chunk.content) {
          fullResult += chunk.content;
          setGeneratingText(fullResult);
        }
      }
    } catch {
      setGeneratingText('修改失败，请检查网络连接');
      return;
    }

    if (!fullResult) {
      setGeneratingText('AI 未返回修改结果');
      return;
    }

    // 解析 AI 返回结果
    const parsed = parseModificationResult(fullResult, plainContent);
    setFullModifiedContent(parsed.fullContent);
    setModifications(parsed.modifications);
    setPhase('review');
  };

  const handleStopGenerating = () => {
    abortRef.current = true;
  };

  const handleItemStatus = (id: string, status: ModificationItem['status'], rewriteContent?: string) => {
    setModifications(prev => prev.map(m =>
      m.id === id ? { ...m, status, rewriteContent } : m
    ));
  };

  const handleApplyModifications = () => {
    const acceptedItems = modifications.filter(m => m.status === 'accepted');
    const skippedItems = modifications.filter(m => m.status === 'skipped');
    const rewritingItems = modifications.filter(m => m.status === 'rewriting');

    // 将未处理的条目视为通过（接受全部修改）
    const pendingItems = modifications.filter(m => m.status === 'pending');
    if (pendingItems.length > 0) {
      pendingItems.forEach(m => handleItemStatus(m.id, 'accepted'));
    }

    // 应用修改后的全文
    // 优先使用 AI 返回的全文，如果有重写的条目需要替换
    let finalContent = fullModifiedContent;

    // 对于重写的条目，尝试在全文中找到并替换
    for (const item of rewritingItems) {
      if (item.rewriteContent && item.afterText) {
        finalContent = finalContent.replace(item.afterText, item.rewriteContent);
      }
    }

    // 对于跳过的条目，恢复原文
    for (const item of skippedItems) {
      if (item.afterText && item.beforeText) {
        finalContent = finalContent.replace(item.afterText, item.beforeText);
      }
    }

    const finalModifications = modifications.map(m => ({
      ...m,
      status: m.status === 'pending' ? 'skipped' as const : m.status,
    }));

    onApply(finalContent, finalModifications);
  };

  const handleClose = () => {
    abortRef.current = true;
    setPhase('prepare');
    setSuggestions('');
    setGeneratingText('');
    setFullModifiedContent('');
    setModifications([]);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full mx-4 shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-sm">AI 修改</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* 阶段 1：准备 */}
          {phase === 'prepare' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={handleImportSuggestions}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  导入自检建议
                </button>
              </div>
              <textarea
                value={suggestions}
                onChange={e => setSuggestions(e.target.value)}
                placeholder="请输入修改要求，或点击「导入自检建议」..."
                className="w-full h-48 p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <p className="text-xs text-gray-400">AI 将根据修改建议对正文进行精准修改，不会重写整个章节。</p>
            </div>
          )}

          {/* 阶段 2：生成中 */}
          {phase === 'generating' && (
            <div className="space-y-3">
              {!generatingText ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">AI 正在分析并修改正文...</p>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {generatingText}
                </pre>
              )}
              <button
                onClick={handleStopGenerating}
                className="px-4 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
              >
                停止生成
              </button>
            </div>
          )}

          {/* 阶段 3：审核 */}
          {phase === 'review' && (
            <div className="space-y-4">
              {/* 修改后全文预览 */}
              {fullModifiedContent && (
                <div>
                  <h4 className="text-sm font-medium mb-2">修改后全文</h4>
                  <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto border border-gray-100">
                    {fullModifiedContent}
                  </pre>
                </div>
              )}

              {/* 逐条修改对比 */}
              {modifications.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">修改明细（{modifications.length} 条）</h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {modifications.map((item, i) => (
                      <ModificationCard
                        key={item.id}
                        index={i + 1}
                        item={item}
                        onStatusChange={(status, rewrite) => handleItemStatus(item.id, status, rewrite)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {modifications.length === 0 && fullModifiedContent && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">AI 已返回修改后的全文，但未解析到具体的修改明细。</p>
                  <p className="text-xs text-gray-400 mt-1">你可以直接审核全文后应用。</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          {phase === 'prepare' && (
            <>
              <button onClick={handleClose}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={handleConfirmModify}
                disabled={!suggestions.trim() || !configId}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                确认修改
              </button>
            </>
          )}
          {phase === 'generating' && (
            <div className="flex-1 text-center text-sm text-gray-400">生成中...</div>
          )}
          {phase === 'review' && (
            <>
              <button onClick={handleClose}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={handleApplyModifications}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                应用全部修改
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 修改对比卡片组件
function ModificationCard({ index, item, onStatusChange }: {
  index: number;
  item: ModificationItem;
  onStatusChange: (status: ModificationItem['status'], rewriteContent?: string) => void;
}) {
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteText, setRewriteText] = useState(item.rewriteContent || '');

  const handleRewriteSubmit = () => {
    onStatusChange('rewriting', rewriteText);
    setShowRewrite(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">修改 #{index}{item.reason ? `：${item.reason}` : ''}</span>
        <span className={`px-1.5 py-0.5 text-xs rounded ${
          item.status === 'accepted' ? 'bg-green-100 text-green-700' :
          item.status === 'skipped' ? 'bg-gray-100 text-gray-500' :
          item.status === 'rewriting' ? 'bg-blue-100 text-blue-700' :
          'bg-yellow-100 text-yellow-600'
        }`}>
          {item.status === 'accepted' ? '已通过' :
           item.status === 'skipped' ? '已跳过' :
           item.status === 'rewriting' ? '已重写' : '待审核'}
        </span>
      </div>

      {item.status === 'rewriting' ? (
        <div className="p-3 bg-blue-50">
          <p className="text-xs text-blue-600 mb-1">已手动重写：</p>
          <pre className="whitespace-pre-wrap text-xs text-gray-700">{item.rewriteContent || item.afterText}</pre>
        </div>
      ) : showRewrite ? (
        <div className="p-3 space-y-2">
          <textarea
            value={rewriteText}
            onChange={e => setRewriteText(e.target.value)}
            placeholder="请输入重写内容..."
            className="w-full h-20 p-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <div className="flex gap-2">
            <button onClick={handleRewriteSubmit}
              disabled={!rewriteText.trim()}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
              确认重写
            </button>
            <button onClick={() => { setShowRewrite(false); setRewriteText(''); }}
              className="px-3 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50">
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {/* 修改前 */}
          <div className="bg-red-50 border border-red-100 rounded p-2">
            <p className="text-xs text-red-500 mb-1">修改前</p>
            <pre className="whitespace-pre-wrap text-xs text-gray-700">{item.beforeText}</pre>
          </div>
          {/* 修改后 */}
          <div className="bg-green-50 border border-green-100 rounded p-2">
            <p className="text-xs text-green-600 mb-1">修改后</p>
            <pre className="whitespace-pre-wrap text-xs text-gray-700">{item.afterText}</pre>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {item.status === 'pending' && !showRewrite && (
        <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
          <button onClick={() => onStatusChange('skipped')}
            className="flex-1 py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 transition">
            不做修改
          </button>
          <button onClick={() => setShowRewrite(true)}
            className="flex-1 py-1.5 border border-blue-300 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 transition">
            重写本条
          </button>
          <button onClick={() => onStatusChange('accepted')}
            className="flex-1 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition">
            通过修改
          </button>
        </div>
      )}
    </div>
  );
}

// 解析 AI 返回的修改结果
function parseModificationResult(
  fullText: string,
  originalContent: string
): { fullContent: string; modifications: ModificationItem[] } {
  // 提取"修改后全文"部分
  const fullContentMatch = fullText.match(/## 修改后全文\s*\n([\s\S]*?)(?=## 修改明细|$)/);
  let fullContent = fullContentMatch ? fullContentMatch[1].trim() : '';

  // 如果没找到标记格式，尝试获取第一个"##"之前的全部内容
  if (!fullContent) {
    const sections = fullText.split(/##\s*/).filter(s => s.trim());
    if (sections.length > 0) {
      fullContent = sections[0].trim();
    }
  }

  // 提取"修改明细"部分
  const detailMatch = fullText.match(/## 修改明细\s*\n([\s\S]*)/);
  const detailText = detailMatch ? detailMatch[1].trim() : '';

  const modifications: ModificationItem[] = [];

  if (detailText) {
    // 尝试解析每条修改：数字. 【原因】\n修改前：xxx\n修改后：xxx
    const itemRegex = /\d+\.\s*【(.+?)】\s*\n修改前[：:]\s*([\s\S]*?)\n修改后[：:]\s*([\s\S]*?)(?=\n\d+\.|$)/g;
    let match;
    while ((match = itemRegex.exec(detailText)) !== null) {
      modifications.push({
        id: `mod-${modifications.length + 1}-${Date.now()}`,
        reason: match[1].trim(),
        beforeText: match[2].trim(),
        afterText: match[3].trim(),
        status: 'pending',
      });
    }

    // 如果上面的格式没匹配到，尝试更宽松的格式
    if (modifications.length === 0) {
      const looseRegex = /\d+\.\s*【(.+?)】\s*\n([\s\S]*?)(?=\n\d+\.|$)/g;
      while ((match = looseRegex.exec(detailText)) !== null) {
        const reason = match[1].trim();
        const body = match[2].trim();
        // 尝试从 body 中提取修改前后
        const beforeMatch = body.match(/修改前[：:]([\s\S]*?)(?=修改后[：:]|$)/);
        const afterMatch = body.match(/修改后[：:]([\s\S]*)/);
        const beforeText = beforeMatch ? beforeMatch[1].trim() : body;
        const afterText = afterMatch ? afterMatch[1].trim() : '';

        if (beforeText || afterText) {
          modifications.push({
            id: `mod-${modifications.length + 1}-${Date.now()}`,
            reason,
            beforeText,
            afterText,
            status: 'pending',
          });
        }
      }
    }
  }

  // 如果 AI 没有返回修改后全文，但有修改明细，尝试构建
  if (!fullContent && modifications.length > 0) {
    fullContent = originalContent;
    // 按顺序应用修改明细中的 afterText
    for (const mod of modifications) {
      if (mod.beforeText && mod.afterText) {
        fullContent = fullContent.replace(mod.beforeText, mod.afterText);
      }
    }
  }

  return { fullContent, modifications };
}
