'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const DAYS_BEFORE_DELETE = 30;

export default function RecycleBinPage() {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.listDeleted.useQuery();

  const restoreMutation = trpc.project.restore.useMutation({
    onSuccess: () => utils.project.listDeleted.invalidate(),
  });

  const permanentDeleteMutation = trpc.project.permanentDelete.useMutation({
    onSuccess: () => utils.project.listDeleted.invalidate(),
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    await restoreMutation.mutateAsync({ id });
  };

  const handlePermanentDelete = async (id: string) => {
    await permanentDeleteMutation.mutateAsync({ id });
    setConfirmDeleteId(null);
  };

  const getRemainingDays = (deletedAt: Date | string) => {
    const now = new Date();
    const deleteDate = typeof deletedAt === 'string' ? new Date(deletedAt) : deletedAt;
    const elapsed = (now.getTime() - deleteDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(DAYS_BEFORE_DELETE - elapsed));
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
              &larr; 返回项目
            </Link>
            <h1 className="text-2xl font-bold">回收站</h1>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">加载中...</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="space-y-4">
            {projects.map((p) => {
              const remaining = p.deletedAt ? getRemainingDays(p.deletedAt) : 0;
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-gray-200 p-6"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{p.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {p.deletedAt
                          ? `删除于 ${new Date(p.deletedAt).toLocaleDateString('zh-CN')}，${remaining} 天后永久删除`
                          : '已删除'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestore(p.id)}
                        disabled={restoreMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition disabled:opacity-50"
                      >
                        恢复
                      </button>
                      {confirmDeleteId === p.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500">确认删除？</span>
                          <button
                            onClick={() => handlePermanentDelete(p.id)}
                            disabled={permanentDeleteMutation.isPending}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                        >
                          立即删除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-4">🗑️</p>
            <p className="text-gray-400 mb-4">回收站为空</p>
            <p className="text-sm text-gray-300">已删除的项目会出现在这里</p>
          </div>
        )}
      </div>
    </main>
  );
}
