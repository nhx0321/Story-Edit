'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/lib/auth-store';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      router.push('/dashboard');
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    registerMutation.mutate({
      email: form.email,
      password: form.password,
      nickname: form.nickname || undefined,
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-center mb-2">创建账号</h1>
        <p className="text-sm text-gray-500 text-center mb-8">注册即享3天全功能免费体验</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="输入邮箱地址"
            />
          </div>
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
            <input
              id="nickname"
              type="text"
              value={form.nickname}
              onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="你的创作笔名"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="至少8位"
            />
          </div>
          <button
            type="submit"
            disabled={registerMutation.isLoading}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {registerMutation.isLoading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          已有账号？<a href="/login" className="text-gray-900 font-medium hover:underline">登录</a>
        </p>
        <p className="text-xs text-gray-400 text-center mt-3">
          注册即表示同意 <a href="/terms" className="text-gray-500 hover:text-gray-900 underline">用户协议与免责声明</a>
        </p>
      </div>
    </main>
  );
}
