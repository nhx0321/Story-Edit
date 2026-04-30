'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type Step = 'confirm' | 'info' | 'disclaimer' | 'submitting';

export default function PublishDialog({
  userTemplateId,
  initialTitle,
  initialCategory,
  initialAiTargetRole,
  onClose,
  onSuccess,
}: {
  userTemplateId: string;
  initialTitle: string;
  initialCategory?: string | null;
  initialAiTargetRole?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>('confirm');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(initialCategory || 'methodology');
  const [aiTargetRole, setAiTargetRole] = useState(initialAiTargetRole || '');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const utils = trpc.useUtils();

  const { data: disclaimer, isLoading: disclaimerLoading } = trpc.template.getActiveDisclaimer.useQuery();

  const publishMutation = trpc.template.publishToMarketplace.useMutation({
    onSuccess: () => {
      utils.template.myTemplates.invalidate({ projectId: undefined });
      onSuccess();
    },
    onError: (e) => {
      alert(e.message);
      setStep('info');
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) { alert('标题不能为空'); return; }
    if (!disclaimerAccepted) { alert('请阅读并确认免责声明'); return; }
    if (!disclaimer) { alert('免责声明加载失败，请稍后重试'); return; }
    setStep('submitting');
    publishMutation.mutate({
      userTemplateId,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      aiTargetRole: aiTargetRole || undefined,
      disclaimerVersion: disclaimer.version,
    });
  };

  const categoryLabels: Record<string, string> = {
    methodology: '方法论',
    structure: '剧本结构',
    style: '正文风格',
    setting: '设定',
    ai_prompt: 'AI角色提示词',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        {step === 'confirm' && (
          <>
            <h3 className="text-base font-medium mb-3">确认发布</h3>
            <p className="text-sm text-gray-600 mb-6">
              发布后模板将进入审核状态，审核期间不可修改。<br />
              审核通过后，模板将上架到模板广场。
            </p>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">取消</button>
              <button onClick={() => setStep('info')}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">下一步</button>
            </div>
          </>
        )}

        {step === 'info' && (
          <>
            <h3 className="text-base font-medium mb-4">填写模板信息</h3>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">标题</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2" placeholder="模板标题" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">简介</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-none" placeholder="简要描述模板用途..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">分区</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2">
                  {Object.entries(categoryLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">对应 AI 角色</label>
                <select value={aiTargetRole} onChange={e => setAiTargetRole(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2">
                  <option value="">无</option>
                  <option value="editor">文学编辑</option>
                  <option value="setting_editor">设定编辑</option>
                  <option value="writer">正文作者</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">选择该模板导入后会应用到哪个 AI 角色</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-medium mb-1">统一价格模式</p>
                <p>• 点赞/阅读：1 精灵豆</p>
                <p>• 导入到我的模板库：10 精灵豆</p>
                <p>• 模板免费，用户通过精灵豆付费</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">上一步</button>
              <button onClick={() => setStep('disclaimer')}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">下一步</button>
            </div>
          </>
        )}

        {step === 'disclaimer' && (
          <>
            <h3 className="text-base font-medium mb-4">{disclaimer?.title || '免责声明'}</h3>
            {disclaimerLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-40 overflow-y-auto text-xs text-gray-600 leading-relaxed">
                <pre className="whitespace-pre-wrap font-sans">{disclaimer?.content}</pre>
              </div>
            )}
            <label className="flex items-center gap-2 mb-6 cursor-pointer">
              <input type="checkbox" checked={disclaimerAccepted}
                onChange={e => setDisclaimerAccepted(e.target.checked)}
                className="rounded border-gray-300" />
              <span className="text-sm text-gray-700">我已阅读并确认以上内容</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setStep('info')}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">上一步</button>
              <button onClick={handleSubmit} disabled={!disclaimerAccepted || !disclaimer}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                提交审核
              </button>
            </div>
            {disclaimer && (
              <p className="text-xs text-gray-400 text-center mt-3">免责声明版本 v{disclaimer.version}</p>
            )}
          </>
        )}

        {step === 'submitting' && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
            <p className="text-sm text-gray-600">正在提交审核...</p>
            <p className="text-xs text-gray-400 mt-2">请耐心等待</p>
          </div>
        )}
      </div>
    </div>
  );
}
