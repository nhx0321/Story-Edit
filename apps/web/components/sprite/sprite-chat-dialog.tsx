'use client';

import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

interface SpriteChatDialogProps {
  open: boolean;
  onClose: () => void;
  spriteInfo: {
    customName: string | null;
    species: string;
    companionStyle: string | null;
    fatigueLevel: number;
  } | null;
}

export default function SpriteChatDialog({ open, onClose, spriteInfo }: SpriteChatDialogProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // 聊天历史
  const { data: chatHistory, isLoading: historyLoading } = trpc.sprite.getSpriteChatHistory.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });

  // 对话 mutation
  const chatMutation = trpc.sprite.chatWithSprite.useMutation({
    onSuccess: (data) => {
      setIsSending(false);
      utils.sprite.getSpriteChatHistory.invalidate();
      utils.sprite.getSpriteStatus.invalidate();
    },
    onError: () => {
      setIsSending(false);
    },
  });

  // 重置疲劳度
  const resetFatigueMutation = trpc.sprite.resetFatigue.useMutation({
    onSuccess: () => {
      utils.sprite.getSpriteStatus.invalidate();
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    if (open && messagesEndRef.current && !historyLoading) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, open, historyLoading]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    if (input.length > 200) return;

    setIsSending(true);
    chatMutation.mutate({ message: input.trim() });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResetFatigue = () => {
    resetFatigueMutation.mutate();
  };

  if (!open) return null;

  const fatigueLevel = spriteInfo?.fatigueLevel ?? 0;
  const isSleeping = fatigueLevel >= 100;
  const isTired = fatigueLevel >= 60 && fatigueLevel < 100;
  const spriteName = spriteInfo?.customName || '小精灵';

  // 疲劳状态文本
  const fatigueText = isSleeping
    ? '精灵在睡觉'
    : isTired
      ? '精灵有点累了'
      : fatigueLevel >= 30
        ? '精灵精力一般'
        : '精灵精力充沛';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[480px] h-[600px] flex flex-col mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">和 {spriteName} 聊天</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isSleeping
                ? '精灵累了，让它休息一下吧'
                : `疲劳度 ${fatigueLevel}/100 — ${fatigueText}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSleeping && (
              <button
                onClick={handleResetFatigue}
                disabled={resetFatigueMutation.isPending}
                className="text-xs px-3 py-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition disabled:opacity-50">
                让精灵休息
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              加载聊天历史...
            </div>
          ) : !chatHistory || chatHistory.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              还没有聊天记录，开始和 {spriteName} 聊天吧～
            </div>
          ) : (
            <div className="space-y-3">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-gray-900 text-white'
                      : msg.role === 'system'
                        ? 'bg-yellow-50 text-yellow-700 text-xs'
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    {msg.role === 'system' && (
                      <p className="text-xs text-yellow-500 mb-1">系统</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className="text-[10px] mt-1 opacity-50">
                      {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* 发送中状态 */}
          {isSending && (
            <div className="flex justify-start mt-3">
              <div className="bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1">思考中...</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-gray-100">
          {isSleeping ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400 text-center">
              精灵正在睡觉，点击上方的"让精灵休息"按钮叫醒它
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`对 ${spriteName} 说点什么...（最多200字）`}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                maxLength={200}
                disabled={chatMutation.isPending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="px-5 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                {chatMutation.isPending ? '发送中' : '发送'}
              </button>
            </div>
          )}
          <p className="text-xs text-gray-300 mt-2 text-center">
            {input.length}/200
          </p>
        </div>
      </div>
    </div>
  );
}
