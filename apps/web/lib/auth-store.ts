// 用户认证状态管理
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email?: string | null;
  nickname?: string | null;
  isAdmin?: boolean;
  displayId?: string | null;
  adminLevel?: number | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  getAdminLevel: () => number | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isAdmin: () => get().user?.isAdmin === true,
      getAdminLevel: () => get().user?.adminLevel ?? null,
    }),
    { name: 'story-edit-auth' },
  ),
);
