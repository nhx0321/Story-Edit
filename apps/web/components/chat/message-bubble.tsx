'use client';

import { useMemo, Fragment, useState, useEffect, useRef } from 'react';
import { ActionCard } from './action-card';

const LOADING_PHRASES = [
  'AI 正在分析...',
  'AI 正在创建文本...',
  'AI 正在组织内容...',
  'AI 正在优化表达...',
];

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  onConfirmAction?: (actionType: string, payload: Record<string, unknown>) => Promise<void>;
  onActionSupplement?: (actionType: string, payload: Record<string, unknown>) => void;
  confirmedActions?: Set<string>;
}

export interface ParsedSegment {
  type: 'text' | 'action';
  content?: string;
  actionType?: string;
  payload?: Record<string, unknown>;
}

// 尝试修复 AI 输出中常见的 JSON 格式错误
function tryFixJson(raw: string): string | null {
  let fixed = raw.trim();
  // 1. 替换中文引号为英文引号
  fixed = fixed.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
  fixed = fixed.replace(/\u2018/g, "'").replace(/\u2019/g, "'");
  // 2. 移除尾部逗号（对象或数组最后一项后的多余逗号）
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  // 3. 尝试解析
  try { JSON.parse(fixed); return fixed; } catch { /* continue */ }
  // 4. 转义实际换行符/制表符（AI 常在 content 字段中输出未转义的换行）
  fixed = fixed.replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  try { JSON.parse(fixed); return fixed; } catch { /* continue */ }
  return null;
}

export function parseContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  // 容错匹配：开头标签 [ACTION:xxx] 或 [ACTION:xxx} 或 [ACTION:xxx> 或 ACTION:xxx]
  // 闭合标签 [/ACTION] 或 [/ACTION} 或 [/ACTION> 或 ACTION:] 或 /ACTION] 等各种 AI 变体
  // 支持跨行匹配（[\s\S]*?），并处理 JSON 中可能嵌套的花括号
  const regex = /\[?ACTION:(\w+)[\]}>]\s*([\s\S]*?)\s*\[?\/?ACTION[\]}>:]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // 提取 payload 时去除最外层的多余括号（AI 可能输出多个花括号）
    let rawPayload = match[2]!;
    // 如果 payload 以 { 开头，尝试找到匹配的 } 结束
    if (rawPayload.startsWith('{') && !rawPayload.endsWith('}')) {
      // 尝试从内容末尾找到最后一个 }（可能被换行或其他字符打断）
      const lastBrace = rawPayload.lastIndexOf('}');
      if (lastBrace > 0) {
        rawPayload = rawPayload.substring(0, lastBrace + 1);
      }
    }

    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    try {
      const payload = JSON.parse(rawPayload);
      segments.push({ type: 'action', actionType: match[1], payload });
    } catch {
      // 尝试转义换行符后再解析
      const escapedPayload = rawPayload.replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
      let parsed = false;
      try {
        const payload = JSON.parse(escapedPayload);
        segments.push({ type: 'action', actionType: match[1], payload });
        parsed = true;
      } catch { /* continue to tryFixJson */ }
      if (!parsed) {
        // 尝试修复常见 AI 输出错误
        const fixed = tryFixJson(rawPayload);
        if (fixed) {
          try {
            const payload = JSON.parse(fixed);
            segments.push({ type: 'action', actionType: match[1], payload });
          } catch {
            segments.push({ type: 'text', content: `\n⚠️ 操作按钮格式异常（${match[1]}），请点击下方"需要修改"并重新发送指令\n` });
          }
        } else {
          segments.push({ type: 'text', content: `\n⚠️ 操作按钮格式异常（${match[1]}），请点击下方"需要修改"并重新发送指令\n` });
        }
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return segments;
}

// 渲染简单 markdown（**bold**），不再自动加粗确认关键词
function renderMarkdown(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return text;
  }
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

export function MessageBubble({ role, content, thinking, isStreaming, onConfirmAction, onActionSupplement, confirmedActions }: MessageBubbleProps) {
  const segments = useMemo(() => role === 'assistant' ? parseContent(content) : [], [content, role]);
  const hasThinking = !!(thinking) && role === 'assistant';
  // 思考过程：初始折叠，流式输出时自动展开，完成后自动折叠
  const [showThinking, setShowThinking] = useState(false);
  const prevStreaming = useRef(isStreaming);

  // 流式输出开始时展开思考面板，输出完成后自动折叠
  useEffect(() => {
    if (isStreaming && hasThinking) {
      setShowThinking(true);
    } else if (!isStreaming && prevStreaming.current && hasThinking && content) {
      // 流式结束 → 延迟折叠，让用户看到完整思考过程
      const timer = setTimeout(() => setShowThinking(false), 1500);
      return () => clearTimeout(timer);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, hasThinking, content]);

  // 正在流式输出时，思考面板始终展开
  const effectiveShowThinking = isStreaming && hasThinking ? true : showThinking;

  if (role === 'system') return null;

  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            {/* 思考过程折叠区 */}
            {hasThinking && (
              <div className="mb-2">
                <button
                  onClick={() => setShowThinking(!effectiveShowThinking)}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors"
                >
                  {/* 思考气泡图标 */}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span>{isStreaming && thinking && !content ? 'AI 正在推理...' : isStreaming && thinking ? '推理完成，正在生成回复...' : '推理过程'}</span>
                  {isStreaming && thinking && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  <svg className={`w-3 h-3 transition-transform ${effectiveShowThinking ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {effectiveShowThinking && (
                  <div className="mt-1.5 p-2.5 bg-amber-50/60 rounded-lg text-xs text-gray-600 border border-amber-100 max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-sans">{thinking}</pre>
                  </div>
                )}
              </div>
            )}
            {/* 流式输出中但没有思考过程时的占位提示 */}
            {isStreaming && !hasThinking && !content && <StreamingPlaceholder />}
            {/* 回答内容 */}
            {segments.map((seg, i) =>
              seg.type === 'text' ? (
                <div key={i}>
                  <p className="whitespace-pre-wrap">{renderMarkdown(seg.content || '')}</p>
                  {/* 每段输出结尾增加对用户输入操作的提示 */}
                  {!isStreaming && (seg.content || '').trim().length > 0 && (
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      💡 您可以在下方回复：**确认**、**可以**、**修改**或**重新输出**等操作要求
                    </p>
                  )}
                </div>
              ) : (
                <ActionCard key={i} actionType={seg.actionType!} payload={seg.payload!}
                  onConfirm={onConfirmAction!}
                  onSupplement={onActionSupplement}
                  confirmed={confirmedActions?.has(`${seg.actionType}:${JSON.stringify(seg.payload)}`)} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 流式加载时旋转文本提示
function StreamingPlaceholder() {
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIdx(prev => (prev + 1) % LOADING_PHRASES.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 mb-2 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      <span className="text-xs text-gray-400">{LOADING_PHRASES[phraseIdx]}</span>
    </div>
  );
}
