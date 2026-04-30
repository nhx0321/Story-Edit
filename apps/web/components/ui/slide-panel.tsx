'use client';

import { useEffect } from 'react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function SlidePanel({ open, onClose, title, children, width = 'w-96' }: SlidePanelProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 — 点击关闭 */}
      <div
        className="fixed inset-0 bg-black/30 z-30"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 侧边面板 */}
      <div className={`fixed top-0 right-0 h-full ${width} bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 text-lg leading-none transition-colors"
            aria-label="关闭"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
