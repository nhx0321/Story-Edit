'use client';

import { useEffect, useRef } from 'react';
import { useBackgroundStore } from '@/lib/background-store';

export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeFileName = useBackgroundStore(s => s.activeFileName);
  const isMuted = useBackgroundStore(s => s.isMuted);

  // Toggle body class for glassmorphism CSS
  useEffect(() => {
    if (activeFileName) {
      document.body.classList.add('video-bg-active');
    } else {
      document.body.classList.remove('video-bg-active');
    }
    return () => {
      document.body.classList.remove('video-bg-active');
    };
  }, [activeFileName]);

  // Sync muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  if (!activeFileName) return null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none hidden md:block">
      <video
        ref={videoRef}
        key={activeFileName}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        className="w-full h-full object-cover"
        src={`/backgrounds/${activeFileName}`}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}
