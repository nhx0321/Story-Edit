import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BackgroundState {
  activeBackgroundId: string | null;
  activeFileName: string | null;
  isMuted: boolean;
  setBackground: (id: string | null, fileName?: string | null) => void;
  toggleMute: () => void;
}

export const useBackgroundStore = create<BackgroundState>()(
  persist(
    (set, get) => ({
      activeBackgroundId: null,
      activeFileName: null,
      isMuted: true,
      setBackground: (id, fileName = null) => set({ activeBackgroundId: id, activeFileName: fileName }),
      toggleMute: () => set({ isMuted: !get().isMuted }),
    }),
    { name: 'story-edit-background' },
  ),
);
