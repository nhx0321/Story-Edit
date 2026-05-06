'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { useBackgroundStore } from '@/lib/background-store';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/lib/auth-store';

export function BackgroundSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useAuthStore(s => s.user);
  const { activeBackgroundId, activeFileName, setBackground } = useBackgroundStore();
  const { data: backgrounds } = trpc.videoBackground.list.useQuery(undefined, { enabled: !!user });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!backgrounds || !activeFileName) return;
    const exists = backgrounds.some(bg => bg.fileName === activeFileName);
    if (!exists) {
      setBackground(null, null);
    }
  }, [backgrounds, activeFileName, setBackground]);

  if (!backgrounds || backgrounds.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
        title="切换背景"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="hidden sm:inline">背景</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg border border-gray-200 shadow-lg p-3 z-50">
          <p className="text-xs text-gray-500 mb-2">选择动态背景</p>
          <div className="grid grid-cols-2 gap-2">
            {/* Close background option */}
            <button
              onClick={() => { setBackground(null, null); setOpen(false); }}
              className={`relative rounded-lg border-2 overflow-hidden h-16 flex items-center justify-center text-xs transition ${
                !activeBackgroundId
                  ? 'border-gray-900 bg-gray-100'
                  : 'border-gray-200 hover:border-gray-300 bg-gray-50'
              }`}
            >
              <span className="text-gray-500">无背景</span>
            </button>
            {backgrounds.map(bg => {
              const thumbName = bg.fileName.replace(/\.mp4$/i, '.jpg');
              const isActive = activeBackgroundId === bg.id;
              return (
                <button
                  key={bg.id}
                  onClick={() => { setBackground(bg.id, bg.fileName); setOpen(false); }}
                  className={`relative rounded-lg border-2 overflow-hidden h-16 transition ${
                    isActive ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  title={bg.name}
                >
                  <Image
                    src={`/backgrounds/${thumbName}`}
                    alt={bg.name}
                    fill
                    sizes="160px"
                    className="object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                    {bg.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function MusicToggle() {
  const { activeBackgroundId, isMuted, toggleMute } = useBackgroundStore();

  if (!activeBackgroundId) return null;

  return (
    <button
      onClick={toggleMute}
      className="p-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
      title={isMuted ? '开启音乐' : '关闭音乐'}
    >
      {isMuted ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      )}
    </button>
  );
}
