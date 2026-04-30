'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const feedbackTypes = [
  { value: 'feedback' as const, label: '意见反馈' },
  { value: 'bug' as const, label: '报告问题' },
  { value: 'suggestion' as const, label: '功能建议' },
];

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'feedback' | 'bug' | 'suggestion'>('feedback');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setTitle('');
        setContent('');
        setScreenshot(null);
        setType('feedback');
      }, 1500);
    },
  });

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('截图不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;
    submit.mutate({
      type,
      title: title.trim(),
      content: content.trim(),
      screenshot: screenshot || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        {submitted ? (
          <div className="text-center py-8">
            <p className="text-lg font-medium text-green-600 mb-2">提交成功</p>
            <p className="text-sm text-gray-500">感谢您的反馈，我们会尽快处理</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">提交反馈</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="flex gap-2 mb-4">
              {feedbackTypes.map(ft => (
                <button key={ft.value} onClick={() => setType(ft.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    type === ft.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {ft.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="简要描述问题或建议" maxLength={200} />

              <textarea value={content} onChange={e => setContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 h-32 resize-none"
                placeholder="详细描述..." maxLength={5000} />

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  {screenshot ? '已添加截图' : '+ 添加截图'}
                  <input type="file" accept="image/*" onChange={handleScreenshot} className="hidden" />
                </label>
                {screenshot && (
                  <button onClick={() => setScreenshot(null)} className="text-xs text-red-500">移除</button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={handleSubmit}
                disabled={!title.trim() || !content.trim() || submit.isLoading}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {submit.isLoading ? '提交中...' : '提交反馈'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
