'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type TabType = 'pending' | 'approved' | 'rejected';

export default function AdminReviewPage() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const { data: submissions, isLoading } = trpc.template.adminListSubmissions.useQuery();
  const reviewMutation = trpc.template.adminReviewTemplate.useMutation({
    onSuccess: () => {
      utils.template.adminListSubmissions.invalidate();
      setSelectedId(null);
      setReviewReason('');
    },
    onError: (e) => alert(e.message),
  });

  const handleApprove = (id: string) => {
    reviewMutation.mutate({ templateId: id, approved: true });
  };

  const handleReject = (id: string) => {
    reviewMutation.mutate({ templateId: id, approved: false, reason: reviewReason || undefined });
  };

  const pendingCount = submissions?.filter(t => t.auditStatus === 'pending').length || 0;

  const filteredSubmissions = submissions?.filter(t => {
    if (activeTab === 'pending') return t.auditStatus === 'pending';
    if (activeTab === 'approved') return t.auditStatus === 'approved';
    if (activeTab === 'rejected') return t.auditStatus === 'rejected';
    return true;
  });

  const categoryLabels: Record<string, string> = {
    methodology: '方法论',
    structure: '剧本结构',
    style: '正文风格',
    setting: '设定',
    ai_prompt: 'AI角色提示词',
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">模板审核</h1>
          <p className="text-sm text-gray-500 mt-1">审核用户上传的模板，确保内容质量</p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            {pendingCount} 条待审核
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          ['pending', '待审核', pendingCount > 0],
          ['approved', '已通过', false],
          ['rejected', '已拒绝', false],
        ] as const).map(([key, label, hasBadge]) => (
          <button key={key} onClick={() => { setActiveTab(key); setSelectedId(null); setReviewReason(''); }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
            }`}>
            {label}
            {hasBadge && pendingCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === key ? 'bg-gray-700 text-gray-200' : 'bg-amber-100 text-amber-700'
              }`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : filteredSubmissions?.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">暂无{activeTab === 'pending' ? '待审核' : activeTab === 'approved' ? '已通过' : '已拒绝'}的模板</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions?.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{t.title}</h3>
                    {t.category && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {categoryLabels[t.category] || t.category}
                      </span>
                    )}
                    {t.source === 'user' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">1豆预览 · 10豆导入</span>
                    )}
                    {t.source === 'official' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">免费</span>
                    )}
                  </div>
                  {/* 创作者信息 */}
                  {t.uploader && (
                    <div className="flex items-center gap-2 mt-1 mb-1">
                      <span className="text-sm">{t.uploader.avatarUrl || '👤'}</span>
                      <span className="text-sm text-gray-600">{t.uploader.nickname || '未知'}</span>
                      <span className="text-xs text-gray-400">{t.uploader.displayId}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-500">{t.description || '无简介'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    提交时间：{new Date(t.createdAt).toLocaleString('zh-CN')}
                  </p>
                  {t.reviewReason && (
                    <p className="text-xs text-red-500 mt-1">上次拒绝原因：{t.reviewReason}</p>
                  )}

                  {/* 内容预览 */}
                  <details className="mt-3">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">查看完整内容</summary>
                    <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto border border-gray-100">
                      {t.content}
                    </pre>
                  </details>
                </div>
              </div>

              {/* 审核操作 */}
              {t.auditStatus === 'pending' && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                  <button onClick={() => handleApprove(t.id)}
                    disabled={reviewMutation.isPending}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                    通过审核
                  </button>
                  <button onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                    disabled={reviewMutation.isPending}
                    className="px-5 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-50">
                    拒绝
                  </button>
                  {selectedId === t.id && (
                    <div className="flex-1 flex gap-2">
                      <input value={reviewReason} onChange={e => setReviewReason(e.target.value)}
                        className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5"
                        placeholder="请输入拒绝原因（可选）" />
                      <button onClick={() => handleReject(t.id)}
                        disabled={reviewMutation.isPending}
                        className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                        确认
                      </button>
                    </div>
                  )}
                </div>
              )}

              {t.auditStatus === 'approved' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">已通过</span>
                </div>
              )}

              {t.auditStatus === 'rejected' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">已拒绝</span>
                  {t.reviewReason && <p className="text-xs text-gray-500 mt-1">{t.reviewReason}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
