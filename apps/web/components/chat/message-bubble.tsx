'use client';

import { useMemo, Fragment, useState } from 'react';
import { ActionCard } from './action-card';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  onConfirmAction?: (actionType: string, payload: Record<string, unknown>) => Promise<void>;
  confirmedActions?: Set<string>;
}

interface ParsedSegment {
  type: 'text' | 'action';
  content?: string;
  actionType?: string;
  payload?: Record<string, unknown>;
}

function parseContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = /\[ACTION:(\w+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    try {
      const payload = JSON.parse(match[2]!);
      segments.push({ type: 'action', actionType: match[1], payload });
    } catch {
      segments.push({ type: 'text', content: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return segments;
}

// 渲染简单 markdown（**bold**）
function renderMarkdown(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

export function MessageBubble({ role, content, thinking, onConfirmAction, confirmedActions }: MessageBubbleProps) {
  const segments = useMemo(() => role === 'assistant' ? parseContent(content) : [], [content, role]);
  const [showThinking, setShowThinking] = useState(false);

  if (role === 'system') return null;

  const isUser = role === 'user';
  const hasThinking = !!thinking && role === 'assistant';

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
                  onClick={() => setShowThinking(!showThinking)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showThinking ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  思考过程
                </button>
                {showThinking && (
                  <div className="mt-1.5 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-200 max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-sans">{thinking}</pre>
                  </div>
                )}
              </div>
            )}
            {/* 回答内容 */}
            {segments.map((seg, i) =>
              seg.type === 'text' ? (
                <p key={i} className="whitespace-pre-wrap">{renderMarkdown(seg.content || '')}</p>
              ) : (
                <ActionCard key={i} actionType={seg.actionType!} payload={seg.payload!}
                  onConfirm={onConfirmAction!}
                  confirmed={confirmedActions?.has(`${seg.actionType}:${JSON.stringify(seg.payload)}`)} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
