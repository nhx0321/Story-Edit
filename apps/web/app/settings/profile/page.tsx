'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { trpc } from '@/lib/trpc';

// 预设头像选项
const AVATAR_OPTIONS = [
  '🖊️', '📝', '✍️', '📚', '🎭', '🌟', '🔮', '🎨', '🦉', '🐉', '🦋', '🌸',
];

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [form, setForm] = useState({ nickname: '', email: '', avatarUrl: '' });
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  const { data: profile } = trpc.userAccount.getProfile.useQuery(undefined, { enabled: !!token });
  const updateProfile = trpc.userAccount.updateProfile.useMutation({
    onSuccess: () => {
      if (token && user) {
        setAuth(token, { id: user.id, email: form.email, nickname: form.nickname });
      }
    },
  });
  const changePassword = trpc.userAccount.changePassword.useMutation();

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      alert('两次输入的密码不一致');
      return;
    }
    if (passwordForm.new.length < 6) {
      alert('密码长度不能少于6位');
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new,
      });
      alert('密码修改成功');
      setPasswordForm({ current: '', new: '', confirm: '' });
      setShowPasswordChange(false);
    } catch (e: any) {
      alert(e.message || '密码修改失败');
    }
  };

  useEffect(() => {
    if (user) {
      setForm({ nickname: user.nickname || '', email: user.email || '', avatarUrl: '' });
    }
  }, [user]);

  // Sync avatar from profile data
  useEffect(() => {
    if (profile?.avatarUrl) {
      setForm(f => ({ ...f, avatarUrl: f.avatarUrl || profile.avatarUrl! }));
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      nickname: form.nickname || undefined,
      avatarUrl: form.avatarUrl || undefined,
    });
  };

  const handleAvatarSelect = (emoji: string) => {
    setForm(f => ({ ...f, avatarUrl: emoji }));
    setShowAvatarPicker(false);
  };

  const displayAvatar = form.avatarUrl || profile?.avatarUrl || '🖊️';

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回设置</Link>
        <h1 className="text-2xl font-bold mt-4 mb-8">个人信息</h1>

        {/* VIP 信息 */}
        {profile && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-4">
              {/* 头像 */}
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl border-2 border-gray-200 cursor-pointer"
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
                  {displayAvatar}
                </div>
                {/* VIP 等级角标 */}
                <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-xs font-medium text-white ${
                  profile.vipLevel === '年费VIP' ? 'bg-yellow-500'
                  : profile.vipLevel === 'VIP' ? 'bg-blue-500'
                  : profile.vipLevel === '体验VIP' ? 'bg-green-500'
                  : 'bg-gray-400'
                }`}>
                  {profile.vipLevel === '免费版' ? '免费' : 'VIP'}
                </div>
              </div>

              {/* 头像选择弹窗 */}
              {showAvatarPicker && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAvatarPicker(false)}>
                  <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
                    <h3 className="font-bold mb-3">选择头像</h3>
                    <div className="grid grid-cols-6 gap-2">
                      {AVATAR_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={() => handleAvatarSelect(emoji)}
                          className={`w-10 h-10 rounded-full text-xl flex items-center justify-center border transition hover:border-gray-400 ${
                            form.avatarUrl === emoji ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                          }`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1">
                <h2 className="font-semibold text-lg">{profile.nickname || '未设置昵称'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    profile.vipLevel === '年费VIP' ? 'bg-yellow-100 text-yellow-700'
                    : profile.vipLevel === 'VIP' ? 'bg-blue-100 text-blue-700'
                    : profile.vipLevel === '体验VIP' ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>{profile.vipLevel}</span>
                  {profile.vipExpiresAt && (
                    <span className="text-xs text-gray-400">
                      有效期至 {new Date(profile.vipExpiresAt).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
                {profile.displayId && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400 font-mono">{profile.displayId}</span>
                    <button onClick={() => { navigator.clipboard.writeText(profile.displayId!); alert('已复制'); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition" title="复制 ID">
                      [复制]
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 表单 */}
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
            <input type="text" value={form.nickname}
              onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <button type="submit" disabled={updateProfile.isPending}
            className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
            {updateProfile.isPending ? '保存中...' : '保存'}
          </button>
          {updateProfile.isSuccess && <span className="text-sm text-green-600 ml-3">已保存</span>}
          {updateProfile.isError && <span className="text-sm text-red-600 ml-3">保存失败</span>}
        </form>

        {/* 修改密码 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <button type="button" onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="flex items-center justify-between w-full text-left">
            <h2 className="font-semibold">修改密码</h2>
            <span className="text-gray-400">{showPasswordChange ? '收起' : '展开'}</span>
          </button>
          {showPasswordChange && (
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
                <input type="password" value={passwordForm.current}
                  onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input type="password" value={passwordForm.new}
                  onChange={e => setPasswordForm(f => ({ ...f, new: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input type="password" value={passwordForm.confirm}
                  onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <button type="submit" disabled={changePassword.isPending}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {changePassword.isPending ? '修改中...' : '修改密码'}
              </button>
              {changePassword.isSuccess && <span className="text-sm text-green-600 ml-3">修改成功</span>}
              {changePassword.isError && <span className="text-sm text-red-600 ml-3">修改失败</span>}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
