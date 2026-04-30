'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

interface AiEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  configId: string;
  systemPrompt: string;
  roleKey: 'editor' | 'setting_editor';
  entityType: 'volume' | 'unit' | 'chapter' | 'setting';
  entityId: string;
  entityTitle: string;
  entityContent: string; // synopsis 或 content
  fieldName: 'synopsis' | 'content' | 'title';
  contextSections: string[];
}

const ROLE_LABELS: Record<string, string> = {
  editor: '文学编辑',
  setting_editor: '设定编辑',
};

const ENTITY_LABELS: Record<string, string> = {
  volume: '卷',
  unit: '单元',
  chapter: '章节',
  setting: '设定',
};

interface DialogMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

export function AiEditDialog({
  open, onClose, onSaved, projectId, configId, systemPrompt,
  roleKey, entityType, entityId, entityTitle, entityContent, fieldName,
  contextSections,
}: AiEditDialogProps) {
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showCurrentContent, setShowCurrentContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const updateVolume = trpc.project.updateVolume.useMutation();
  const updateUnit = trpc.project.updateUnit.useMutation();
  const updateChapterSynopsis = trpc.project.updateChapterSynopsis.useMutation();
  const updateSetting = trpc.project.updateSetting.useMutation();
  const saveEditLog = trpc.project.saveEditLog.useMutation();

  const utils = trpc.useUtils();

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 构建修改模式 system prompt
  const buildSystemPrompt = useCallback(() => {
    const typeLabel = ENTITY_LABELS[entityType] || entityType;
    const contextText = contextSections.length > 0
      ? '[修改上下文]\n' + contextSections.join('\n') + '\n'
      : '';

    return `${systemPrompt}

${contextText}[修改模式指令]
你当前处于修改模式。用户要求修改上述指定的${typeLabel}实体。
修改目标：
- 类型：${typeLabel}
- ID：${entityId}
- 标题：${entityTitle}
- 当前${fieldName === 'synopsis' ? '梗概' : fieldName === 'content' ? '内容' : '标题'}：${entityContent || '（暂无）'}

请根据用户要求进行精准修改。修改完成后必须输出以下 ACTION 块：
[ACTION:update_${entityType}]
{"id": "${entityId}", "title": "新标题", "${fieldName}": "新内容"}
[/ACTION]

注意：
1. ACTION 指令中必须包含 "id": "${entityId}" 字段
2. JSON 中除了 title 和 ${fieldName} 外，不要添加其他字段
3. 闭合标签必须严格写作 [/ACTION]，不要用其他变体`;
  }, [systemPrompt, contextSections, entityType, entityId, entityTitle, entityContent, fieldName]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg: DialogMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    const userInput = input.trim();
    setInput('');

    setStreaming(true);
    abortRef.current = false;

    const fullSystemPrompt = buildSystemPrompt();
    const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: fullSystemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userInput },
    ];

    let fullResponse = '';
    let fullThinking = '';
    const assistantMsg: DialogMessage = { role: 'assistant', content: '', thinking: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      for await (const chunk of streamAiChat({ configId, messages: history, projectId })) {
        if (abortRef.current) break;
        if (chunk.error) {
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${chunk.error}` };
            return copy;
          });
          break;
        }
        if (chunk.thinking) {
          fullThinking += chunk.thinking;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
        }
        if (chunk.content) {
          fullResponse += chunk.content;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullResponse, thinking: fullThinking };
            return copy;
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '请求失败';
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `[错误] ${msg}` };
        return copy;
      });
    }

    setStreaming(false);
    scrollToBottom();
  }, [input, streaming, messages, buildSystemPrompt, configId, projectId, scrollToBottom]);

  // 解析 AI 回复中的 ACTION 块
  const parseAction = useCallback((text: string) => {
    const match = text.match(/\[?ACTION:update_(\w+)[\]}>]\s*\n(\{[\s\S]*?\})\s*\n?\[?\/?ACTION[\]}>:]/);
    if (!match) return null;
    try {
      return {
        type: match[1]!,
        data: JSON.parse(match[2]!) as Record<string, string>,
      };
    } catch {
      return null;
    }
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    setMessages([]);
    setInput('');
    setStreaming(false);
    onClose();
  }, [onClose]);

  // 确认覆盖并保存
  const handleConfirm = useCallback(async () => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    const parsed = parseAction(lastMsg.content);
    if (!parsed) {
      setMessages(prev => [...prev, { role: 'assistant', content: '[提示] AI 尚未生成可确认的修改方案，请继续对话或重新提出修改要求。' }]);
      return;
    }

    // 验证 ACTION 类型匹配
    if (parsed.type !== entityType) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: `[错误] AI 输出的修改类型 "${parsed.type}" 与当前编辑类型 "${entityType}" 不匹配，请重新提出修改要求。`,
      }]);
      return;
    }

    setSaving(true);
    try {
      const newData = parsed.data[fieldName] || '';
      const newTitle = parsed.data.title || entityTitle;
      // 使用最后一条用户消息作为修改原因
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content;

      switch (entityType) {
        case 'volume': {
          await updateVolume.mutateAsync({
            id: entityId, projectId, title: newTitle, synopsis: parsed.data.synopsis,
          });
          await saveEditLog.mutateAsync({
            projectId, entityType: 'volume', entityId,
            fieldName, oldValue: entityContent, newValue: parsed.data[fieldName],
            aiRole: roleKey, editReason: lastUserMsg,
          });
          break;
        }
        case 'unit': {
          const outlineTree = await utils.client.project.getOutlineTree.query({ projectId });
          let volumeId = '';
          for (const vol of outlineTree || []) {
            if ((vol as any).units?.some((u: any) => u.id === entityId)) {
              volumeId = vol.id;
              break;
            }
          }
          if (!volumeId) {
            setMessages(prev => [...prev, { role: 'assistant', content: '[错误] 无法找到该单元所属的卷，请检查大纲结构。' }]);
            return;
          }
          await updateUnit.mutateAsync({
            id: entityId, volumeId, title: newTitle, synopsis: parsed.data.synopsis,
          });
          await saveEditLog.mutateAsync({
            projectId, entityType: 'unit', entityId,
            fieldName, oldValue: entityContent, newValue: parsed.data[fieldName],
            aiRole: roleKey, editReason: lastUserMsg,
          });
          break;
        }
        case 'chapter': {
          const outlineTree = await utils.client.project.getOutlineTree.query({ projectId });
          let unitId = '';
          for (const vol of outlineTree || []) {
            for (const unit of (vol as any).units || []) {
              if (unit.chapters?.some((ch: any) => ch.id === entityId)) {
                unitId = unit.id;
                break;
              }
            }
            if (unitId) break;
          }
          if (!unitId) {
            setMessages(prev => [...prev, { role: 'assistant', content: '[错误] 无法找到该章节所属的单元，请检查大纲结构。' }]);
            return;
          }
          await updateChapterSynopsis.mutateAsync({
            id: entityId, unitId, synopsis: parsed.data.synopsis ?? '',
          });
          await saveEditLog.mutateAsync({
            projectId, entityType: 'chapter', entityId,
            fieldName, oldValue: entityContent, newValue: parsed.data[fieldName] ?? '',
            aiRole: roleKey, editReason: lastUserMsg,
          });
          break;
        }
        case 'setting': {
          await updateSetting.mutateAsync({
            id: entityId, projectId,
            title: newTitle, content: parsed.data.content,
          });
          await saveEditLog.mutateAsync({
            projectId, entityType: 'setting', entityId,
            fieldName, oldValue: entityContent, newValue: parsed.data.content,
            aiRole: roleKey, editReason: lastUserMsg,
          });
          break;
        }
      }

      onSaved();
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setMessages(prev => [...prev, { role: 'assistant', content: `[保存错误] ${msg}` }]);
    } finally {
      setSaving(false);
    }
  }, [messages, parseAction, entityType, entityId, entityTitle, entityContent, fieldName, roleKey, projectId,
    updateVolume, updateUnit, updateChapterSynopsis, updateSetting, saveEditLog, utils, onSaved, handleClose]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
  }, []);

  if (!open) return null;

  const typeLabel = ENTITY_LABELS[entityType] || entityType;
  const roleLabel = ROLE_LABELS[roleKey] || roleKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-xl flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h3 className="font-semibold text-sm">AI 修改 — {entityTitle}</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* 目标信息区 */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2 text-sm mb-1">
            <span className="text-gray-500">修改目标：</span>
            <span className="font-medium">{typeLabel}</span>
            <span className="text-gray-400">「{entityTitle}」</span>
            <span className="text-gray-300 mx-1">|</span>
            <span className="text-xs text-gray-400">agent: {roleLabel}</span>
          </div>
          {/* 当前内容折叠 */}
          <details className="text-sm" open={showCurrentContent} onToggle={e => setShowCurrentContent((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
              当前{fieldName === 'synopsis' ? '梗概' : fieldName === 'content' ? '内容' : '标题'}（{entityContent ? entityContent.length : 0} 字）
            </summary>
            <div className="mt-1 p-2 bg-white rounded border border-gray-200 text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {entityContent || '（暂无）'}
            </div>
          </details>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ minHeight: 200 }}>
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              请输入修改要求，AI 将帮你调整{typeLabel}内容
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {msg.thinking && (
                  <div className="text-xs text-gray-400 mb-1 italic">{msg.thinking}</div>
                )}
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部操作区 */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="输入修改要求..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={streaming}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              发送
            </button>
          </div>
          <div className="flex gap-2 justify-center">
            {streaming && (
              <button
                onClick={handleStop}
                className="px-3 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 transition"
              >
                停止生成
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={saving || messages.length === 0}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {saving ? '保存中...' : '确认覆盖并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
