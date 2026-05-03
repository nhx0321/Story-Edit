'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const [form, setForm] = useState({ account: '', password: '' });
  const [error, setError] = useState('');
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const registerMutation = trpc.auth.register.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      router.push('/dashboard');
    },
    onError: async (err) => {
      if (err.message !== '账号不存在') {
        setError(err.message);
        return;
      }

      try {
        const registerInput = form.account.includes('@')
          ? { email: form.account, password: form.password }
          : { phone: form.account, password: form.password };
        const data = await registerMutation.mutateAsync(registerInput);
        setAuth(data.token, data.user);
        router.push('/dashboard');
      } catch (registerErr) {
        setError(registerErr instanceof Error ? registerErr.message : '自动注册失败');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate(form);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-center mb-2">欢迎回来</h1>
        <p className="text-sm text-gray-500 text-center mb-8">登录 Story Edit 继续创作</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="account" className="block text-sm font-medium text-gray-700 mb-1">邮箱 / 手机号</label>
            <input
              id="account"
              type="text"
              required
              value={form.account}
              onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">密码</label>
              <a href="/forgot-password" className="text-xs text-gray-500 hover:text-gray-900">忘记密码？</a>
            </div>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending || registerMutation.isPending}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loginMutation.isPending || registerMutation.isPending ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          没有账号？<a href="/register" className="text-gray-900 font-medium hover:underline">免费注册</a>
        </p>
      </div>
    </main>
  );
}
