'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: unreadCount = 0 } = trpc.feedback.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: notifications = [] } = trpc.feedback.notifications.useQuery(
    { limit: 10 }, { enabled: open },
  );
  const markRead = trpc.feedback.markRead.useMutation({
    onSuccess: () => utils.feedback.unreadCount.invalidate(),
  });
  const markAllRead = trpc.feedback.markAllRead.useMutation({
    onSuccess: () => {
      utils.feedback.unreadCount.invalidate();
      utils.feedback.notifications.invalidate();
    },
  });

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 hover:text-gray-900 transition">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 2a5 5 0 00-5 5v3l-1.5 2.5h13L15 10V7a5 5 0 00-5-5z" />
          <path d="M8 16a2 2 0 004 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-medium text-sm">站内信</span>
              {unreadCount > 0 && (
                <button onClick={() => markAllRead.mutate()}
                  className="text-xs text-blue-500 hover:text-blue-700">
                  全部已读
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-72">
              {notifications.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">暂无消息</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id}
                    onClick={() => { if (!n.isRead) markRead.mutate({ id: n.id }); }}
                    className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition ${
                      !n.isRead ? 'bg-blue-50/50' : ''
                    }`}>
                    <div className="flex items-start gap-2">
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.content}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(n.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
