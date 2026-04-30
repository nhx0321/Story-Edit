'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function ForgotPasswordPage() {
  const [account, setAccount] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState('');

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => {
      setSent(true);
      if ((data as any)._devToken) setDevToken((data as any)._devToken);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!account.trim()) { setError('请输入邮箱或手机号'); return; }
    requestReset.mutate({ account: account.trim() });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-center mb-2">找回密码</h1>
        <p className="text-sm text-gray-500 text-center mb-8">输入注册时使用的邮箱或手机号</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-green-600 font-medium">重置链接已发送</p>
            <p className="text-sm text-gray-500">如果该账号存在，您将收到密码重置链接。</p>
            {devToken && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-left">
                <p className="text-xs text-yellow-700 font-medium mb-1">开发模式 — 重置链接：</p>
                <a href={`/reset-password?token=${devToken}`}
                  className="text-xs text-blue-600 break-all hover:underline">
                  /reset-password?token={devToken}
                </a>
              </div>
            )}
            <a href="/login" className="block text-sm text-gray-900 font-medium hover:underline">返回登录</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="account" className="block text-sm font-medium text-gray-700 mb-1">邮箱 / 手机号</label>
              <input id="account" type="text" required value={account}
                onChange={e => setAccount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <button type="submit" disabled={requestReset.isLoading}
              className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
              {requestReset.isLoading ? '发送中...' : '发送重置链接'}
            </button>
          </form>
        )}

        <p className="text-sm text-gray-500 text-center mt-6">
          <a href="/login" className="text-gray-900 font-medium hover:underline">返回登录</a>
        </p>
      </div>
    </main>
  );
}
