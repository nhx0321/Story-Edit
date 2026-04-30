'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export default function Home() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  // 已登录用户自动跳转到项目列表
  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // 已登录时不渲染 Landing Page（避免闪烁）
  if (user) return null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Story Edit
        </h1>
        <p className="text-xl text-gray-600 mb-2">AI辅助小说创作平台</p>
        <p className="text-base text-gray-500 max-w-lg text-center mb-10">
          经过实战验证的AI创作工作流引擎 — 多角色调度、分级记忆、质量把控、经验积累
        </p>
        <div className="flex gap-4">
          <a
            href="/register"
            className="px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition"
          >
            注册
          </a>
          <a
            href="/login"
            className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            登录
          </a>
        </div>
        <p className="text-sm text-gray-400 mt-4">注册即享免费模板 + Token 中转站</p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-2">引导式创作</h3>
          <p className="text-gray-500 text-sm">
            从核心创意到完整正文，每一步都有AI辅助引导，新手也能写出好故事
          </p>
        </div>
        <div className="p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-2">多角色协作</h3>
          <p className="text-gray-500 text-sm">
            文学编辑构思大纲、正文作者撰写正文、设定编辑把控一致性，各司其职
          </p>
        </div>
        <div className="p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-2">经验积累</h3>
          <p className="text-gray-500 text-sm">
            AI从每次修改中学习你的偏好，越写越懂你，避免重复犯错
          </p>
        </div>
      </section>
    </main>
  );
}
