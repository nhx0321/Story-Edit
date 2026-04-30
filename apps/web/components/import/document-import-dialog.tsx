'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

// ========== Types ==========

export type ImportTarget = 'outline' | 'settings' | 'auto';

interface ImportedItem {
  type: 'volume' | 'unit' | 'chapter' | 'setting';
  title: string;
  content: string;       // 梗概 or 设定内容
  category?: string;     // 设定类目
  parentIndex?: number;  // 父级在 items 数组中的索引
  selected: boolean;
}

type Phase = 'upload' | 'analyzing' | 'preview';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  importTarget: ImportTarget;
  configId: string;
  onImported: () => void;
}

// ========== AI Prompts ==========

function buildAiPrompt(target: ImportTarget, text: string): string {
  const baseInstruction = `你是一名专业的文学编辑助手。请分析以下文档内容，识别其结构并以 JSON 格式输出。

【文档内容】
${text}

【输出格式要求】
严格输出 JSON，不要输出其他内容。格式：
\`\`\`json
{ "items": [...] }
\`\`\`
`;

  if (target === 'outline') {
    return baseInstruction + `
【识别规则 — 大纲模式】
识别文档中的层级结构，归类为：
- volume（卷）：最高层级，如"第一卷"、"卷一"、大的篇章划分
- unit（单元）：中间层级，如"第一单元"、"第一幕"、情节段落
- chapter（章节）：最小层级，如"第一章"、"Chapter 1"

每项格式：
{ "type": "volume"|"unit"|"chapter", "title": "标题", "content": "梗概/简介", "parentIndex": null|数字 }

parentIndex 规则：
- volume 的 parentIndex 为 null
- unit 的 parentIndex 指向所属 volume 在 items 数组中的索引
- chapter 的 parentIndex 指向所属 unit 在 items 数组中的索引

如果文档没有明确的卷/单元层级，可以只输出 chapter 级别，parentIndex 为 null。`;
  }

  if (target === 'settings') {
    return baseInstruction + `
【识别规则 — 设定模式】
识别文档中的设定词条，归类为 setting 类型。
自动判断类目（category），常见类目：人物、世界观、力量体系、势力组织、道具、地理、历史、种族、其他。

每项格式：
{ "type": "setting", "title": "词条标题", "content": "词条内容", "category": "类目名" }`;
  }

  // auto mode
  return baseInstruction + `
【识别规则 — 自动模式】
同时识别大纲结构和设定词条：
- 大纲部分：volume / unit / chapter（含 parentIndex）
- 设定部分：setting（含 category）

混合输出，大纲项在前，设定项在后。`;
}

// ========== Component ==========

export function DocumentImportDialog({ open, onClose, projectId, importTarget, configId, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [target, setTarget] = useState<ImportTarget>(importTarget);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [streamText, setStreamText] = useState('');
  const [items, setItems] = useState<ImportedItem[]>([]);
  const [importing, setImporting] = useState(false);
  const abortRef = useRef(false);

  const parseDocument = trpc.project.parseDocument.useMutation();
  const createVolume = trpc.project.createVolume.useMutation();
  const createUnit = trpc.project.createUnit.useMutation();
  const createChapter = trpc.project.createChapter.useMutation();
  const createSetting = trpc.project.createSetting.useMutation();

  const reset = useCallback(() => {
    setPhase('upload');
    setFile(null);
    setError('');
    setStreamText('');
    setItems([]);
    setImporting(false);
    abortRef.current = false;
  }, []);

  const handleClose = () => {
    abortRef.current = true;
    reset();
    onClose();
  };

  // ========== Phase 1: File Upload ==========

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'docx' && ext !== 'pdf') {
      setError('仅支持 .docx 和 .pdf 格式');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('文件大小不能超过 10MB');
      return;
    }
    setError('');
    setFile(f);
  };

  // ========== Phase 2: Parse & AI Analyze ==========

  const handleStartAnalysis = async () => {
    if (!file) return;
    setPhase('analyzing');
    setStreamText('');
    setError('');
    abortRef.current = false;

    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const ext = file.name.split('.').pop()?.toLowerCase() as 'docx' | 'pdf';

      // Step 1: Parse document on server
      setStreamText('正在解析文档...');
      const { text, truncated } = await parseDocument.mutateAsync({
        projectId,
        fileBase64: base64,
        fileName: file.name,
        fileType: ext,
      });

      if (abortRef.current) return;
      if (truncated) {
        setStreamText('文档较长，已截取前 50000 字进行分析...\n');
      }

      // Step 2: AI analysis via streaming
      setStreamText(prev => prev + '正在 AI 分析文档结构...\n');
      const prompt = buildAiPrompt(target, text);

      let fullResponse = '';
      for await (const chunk of streamAiChat({
        configId,
        messages: [{ role: 'user', content: prompt }],
        projectId,
      })) {
        if (abortRef.current) return;
        if (chunk.error) {
          setError(chunk.error);
          setPhase('upload');
          return;
        }
        if (chunk.content) {
          fullResponse += chunk.content;
          setStreamText('正在 AI 分析文档结构...\n\n' + fullResponse.slice(-500));
        }
      }

      // Step 3: Parse AI response
      const parsed = parseAiResponse(fullResponse);
      if (!parsed || parsed.length === 0) {
        setError('AI 未能识别文档结构，请尝试其他导入模式或手动创建');
        setPhase('upload');
        return;
      }

      setItems(parsed);
      setPhase('preview');
    } catch (err: any) {
      if (!abortRef.current) {
        setError(err.message || '解析失败');
        setPhase('upload');
      }
    }
  };

  // ========== Parse AI JSON Response ==========

  function parseAiResponse(response: string): ImportedItem[] {
    // Try to extract JSON from response
    let jsonStr = '';
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find raw JSON
      const jsonMatch = response.match(/\{[\s\S]*"items"[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    if (!jsonStr) return [];

    try {
      const data = JSON.parse(jsonStr);
      const rawItems = data.items || data;
      if (!Array.isArray(rawItems)) return [];

      return rawItems.map((item: any) => ({
        type: item.type || 'chapter',
        title: item.title || '未命名',
        content: item.content || '',
        category: item.category,
        parentIndex: item.parentIndex ?? null,
        selected: true,
      }));
    } catch {
      return [];
    }
  }

  // ========== Phase 3: Import Execution ==========

  const handleImport = async () => {
    const selected = items.filter(i => i.selected);
    if (selected.length === 0) return;
    setImporting(true);

    try {
      // Build index map: original index → created entity id
      const idMap = new Map<number, string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.selected) continue;

        if (item.type === 'volume') {
          const vol = await createVolume.mutateAsync({
            projectId,
            title: item.title,
            synopsis: item.content || undefined,
            sortOrder: i,
          });
          idMap.set(i, vol!.id);
        } else if (item.type === 'unit') {
          const parentId = item.parentIndex != null ? idMap.get(item.parentIndex) : undefined;
          if (!parentId) continue; // skip orphan units
          const unit = await createUnit.mutateAsync({
            volumeId: parentId,
            title: item.title,
            synopsis: item.content || undefined,
            sortOrder: i,
          });
          idMap.set(i, unit!.id);
        } else if (item.type === 'chapter') {
          const parentId = item.parentIndex != null ? idMap.get(item.parentIndex) : undefined;
          if (!parentId) continue; // skip orphan chapters
          await createChapter.mutateAsync({
            unitId: parentId,
            title: item.title,
            synopsis: item.content || undefined,
            sortOrder: i,
          });
        } else if (item.type === 'setting') {
          await createSetting.mutateAsync({
            projectId,
            category: item.category || '未分类',
            title: item.title,
            content: item.content || '',
          });
        }
      }

      onImported();
      handleClose();
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  // ========== Item Editing ==========

  const updateItem = (index: number, updates: Partial<ImportedItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const toggleItem = (index: number) => {
    updateItem(index, { selected: !items[index].selected });
  };

  const toggleAll = (selected: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected })));
  };

  if (!open) return null;

  const selectedCount = items.filter(i => i.selected).length;
  const typeLabels: Record<string, string> = { volume: '卷', unit: '单元', chapter: '章节', setting: '设定' };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] shadow-lg flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {phase === 'upload' && '导入文档'}
            {phase === 'analyzing' && '分析中...'}
            {phase === 'preview' && `预览导入 (${selectedCount}/${items.length})`}
          </h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {/* Phase 1: Upload */}
          {phase === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择文件</label>
                <input
                  type="file"
                  accept=".docx,.pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                <p className="mt-1 text-xs text-gray-400">支持 .docx / .pdf，最大 10MB</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">导入目标</label>
                <div className="flex gap-2">
                  {(['outline', 'settings', 'auto'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTarget(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                        target === t
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-300 text-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {t === 'outline' ? '大纲' : t === 'settings' ? '设定' : '自动识别'}
                    </button>
                  ))}
                </div>
              </div>

              {file && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                  已选择：{file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Analyzing */}
          {phase === 'analyzing' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">AI 正在分析文档结构...</span>
              </div>
              <pre className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {streamText}
              </pre>
              <button
                onClick={() => { abortRef.current = true; setPhase('upload'); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                取消分析
              </button>
            </div>
          )}

          {/* Phase 3: Preview */}
          {phase === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>共识别 {items.length} 项</span>
                <div className="flex gap-2">
                  <button onClick={() => toggleAll(true)} className="text-blue-600 hover:underline">全选</button>
                  <button onClick={() => toggleAll(false)} className="text-blue-600 hover:underline">全不选</button>
                </div>
              </div>

              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition ${
                    item.selected ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(idx)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          item.type === 'volume' ? 'bg-purple-100 text-purple-700' :
                          item.type === 'unit' ? 'bg-blue-100 text-blue-700' :
                          item.type === 'chapter' ? 'bg-green-100 text-green-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {typeLabels[item.type]}
                        </span>
                        {item.category && (
                          <span className="text-xs text-gray-400">[{item.category}]</span>
                        )}
                        {item.parentIndex != null && (
                          <span className="text-xs text-gray-400">
                            &larr; {items[item.parentIndex]?.title || '?'}
                          </span>
                        )}
                      </div>
                      <input
                        value={item.title}
                        onChange={e => updateItem(idx, { title: e.target.value })}
                        className="w-full text-sm font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-500 focus:outline-none py-0.5"
                        disabled={!item.selected}
                      />
                      <textarea
                        value={item.content}
                        onChange={e => updateItem(idx, { content: e.target.value })}
                        rows={2}
                        className="w-full text-xs text-gray-500 bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none rounded p-1 mt-1 resize-none"
                        disabled={!item.selected}
                        placeholder="梗概/内容（可编辑）"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">
            取消
          </button>
          {phase === 'upload' && (
            <button
              onClick={handleStartAnalysis}
              disabled={!file || !configId}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始解析
            </button>
          )}
          {phase === 'preview' && (
            <>
              <button
                onClick={() => { reset(); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-500"
              >
                重新上传
              </button>
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : `确认导入 (${selectedCount})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
