'use client';

import Image from 'next/image';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-700' },
  closed: { label: '已关闭', color: 'bg-gray-100 text-gray-500' },
};

const typeLabels: Record<string, string> = {
  feedback: '意见反馈',
  bug: '报告问题',
  suggestion: '功能建议',
};

export default function AdminFeedbackPage() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<string>('');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'processing' | 'resolved' | 'closed'>('resolved');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: feedbackList = [], isLoading } = trpc.feedback.adminList.useQuery({
    status: filter as any || undefined,
    limit: 50,
  });

  const reply = trpc.feedback.adminReply.useMutation({
    onSuccess: () => {
      utils.feedback.adminList.invalidate();
      setReplyingId(null);
      setReplyText('');
    },
  });

  const sendNotification = trpc.feedback.adminSendNotification.useMutation({
    onSuccess: () => alert('站内信已发送'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">用户反馈管理</h2>
        <div className="flex gap-2">
          {['', 'pending', 'processing', 'resolved', 'closed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${
                filter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s ? statusLabels[s]?.label : '全部'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-center py-8">加载中...</p>
      ) : feedbackList.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无反馈</p>
      ) : (
        <div className="space-y-3">
          {feedbackList.map(fb => {
            const st = statusLabels[fb.status] || statusLabels.pending;
            const isExpanded = expandedId === fb.id;
            return (
              <div key={fb.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : fb.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      <span className="text-xs text-gray-400">{typeLabels[fb.type] || fb.type}</span>
                      <span className="text-xs text-gray-400">by {fb.userName || '未知用户'}</span>
                    </div>
                    <p className="font-medium text-sm">{fb.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(fb.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{fb.content}</p>

                    {fb.screenshot && (
                      <div className="mb-3">
                        <Image
                          src={fb.screenshot}
                          alt="截图"
                          width={800}
                          height={600}
                          unoptimized
                          className="max-w-md rounded-lg border w-full h-auto"
                        />
                      </div>
                    )}

                    {fb.adminReply && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-blue-600 font-medium mb-1">管理员回复</p>
                        <p className="text-sm text-blue-800 whitespace-pre-wrap">{fb.adminReply}</p>
                        {fb.repliedAt && (
                          <p className="text-xs text-blue-400 mt-1">
                            {new Date(fb.repliedAt).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                    )}

                    {replyingId === fb.id ? (
                      <div className="space-y-2">
                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="输入回复内容..." />
                        <div className="flex items-center gap-2">
                          <select value={replyStatus}
                            onChange={e => setReplyStatus(e.target.value as any)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                            <option value="processing">标记为处理中</option>
                            <option value="resolved">标记为已解决</option>
                            <option value="closed">标记为已关闭</option>
                          </select>
                          <button onClick={() => setReplyingId(null)}
                            className="px-3 py-1.5 text-sm text-gray-500">取消</button>
                          <button onClick={() => reply.mutate({
                            feedbackId: fb.id,
                            reply: replyText,
                            status: replyStatus,
                          })}
                            disabled={!replyText.trim() || reply.isLoading}
                            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                            {reply.isLoading ? '发送中...' : '回复并通知用户'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReplyingId(fb.id); setReplyText(fb.adminReply || ''); }}
                        className="text-sm text-blue-500 hover:text-blue-700">
                        {fb.adminReply ? '修改回复' : '回复'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
