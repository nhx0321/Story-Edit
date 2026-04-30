'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: tokenCheck } = trpc.auth.verifyResetToken.useQuery(
    { token },
    { enabled: !!token },
  );

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('密码长度不能少于6位'); return; }
    if (form.password !== form.confirm) { setError('两次输入的密码不一致'); return; }
    resetPassword.mutate({ token, newPassword: form.password });
  };

  if (!token) {
    return (
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-red-600 font-medium mb-4">无效的重置链接</p>
        <a href="/forgot-password" className="text-sm text-gray-900 font-medium hover:underline">重新获取重置链接</a>
      </div>
    );
  }

  if (tokenCheck && !tokenCheck.valid) {
    return (
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-red-600 font-medium mb-2">重置链接无效或已过期</p>
        <p className="text-sm text-gray-500 mb-4">请重新申请密码重置</p>
        <a href="/forgot-password" className="text-sm text-gray-900 font-medium hover:underline">重新获取重置链接</a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <h1 className="text-2xl font-bold text-center mb-2">重置密码</h1>
      <p className="text-sm text-gray-500 text-center mb-8">设置您的新密码</p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {success ? (
        <div className="text-center space-y-4">
          <p className="text-green-600 font-medium">密码重置成功</p>
          <a href="/login" className="block py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition text-center">
            前往登录
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
            <input type="password" required value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="至少6位" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
            <input type="password" required value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <button type="submit" disabled={resetPassword.isPending}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
            {resetPassword.isPending ? '重置中...' : '重置密码'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<div className="text-gray-400">加载中...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
