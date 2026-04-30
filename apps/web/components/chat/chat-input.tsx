'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 预填初始值（仅在值变化时生效） */
  initialValue?: string;
  /** 初始值被消费后的回调 */
  onInitialValueConsumed?: () => void;
  /** 用户历史输入（用于上下键导航） */
  userMessages?: string[];
}

export function ChatInput({ onSend, disabled, placeholder = '输入消息...', initialValue, onInitialValueConsumed, userMessages }: ChatInputProps) {
  const [text, setText] = useState(initialValue || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 上下键历史导航状态
  const [historyIdx, setHistoryIdx] = useState(-1);
  const draftRef = useRef('');

  // 当 initialValue 变化时更新本地状态
  useEffect(() => {
    if (initialValue) {
      setText(initialValue);
      onInitialValueConsumed?.();
    }
  }, [initialValue, onInitialValueConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setHistoryIdx(-1);
    draftRef.current = '';
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const history = userMessages ?? [];

    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      if (historyIdx === -1) {
        // 保存当前草稿
        draftRef.current = text;
      }
      const nextIdx = historyIdx + 1;
      if (nextIdx < history.length) {
        setHistoryIdx(nextIdx);
        setText(history[history.length - 1 - nextIdx]);
      }
    } else if (e.key === 'ArrowDown' && history.length > 0) {
      e.preventDefault();
      const nextIdx = historyIdx - 1;
      if (nextIdx >= 0) {
        setHistoryIdx(nextIdx);
        setText(history[history.length - 1 - nextIdx]);
      } else if (nextIdx === -1) {
        // 回到草稿
        setHistoryIdx(-1);
        setText(draftRef.current);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-3 flex gap-2 items-end">
      <textarea ref={textareaRef} value={text} onChange={e => { setText(e.target.value); setHistoryIdx(-1); }}
        onKeyDown={handleKeyDown} disabled={disabled} placeholder={placeholder} rows={1}
        className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50" />
      <button onClick={handleSend} disabled={disabled || !text.trim()}
        className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 shrink-0">
        发送
      </button>
    </div>
  );
}
