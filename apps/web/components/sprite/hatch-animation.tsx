'use client';

import { useState, useEffect } from 'react';
import spriteManifest from '@/lib/sprite-manifest.json';

interface HatchAnimationProps {
  onComplete: () => void;
  species?: string;
  variant?: string;
}

export default function HatchAnimation({ onComplete, species, variant }: HatchAnimationProps) {
  const [phase, setPhase] = useState<'egg' | 'crack' | 'shake' | 'burst' | 'light' | 'reveal' | 'done'>(
    'egg',
  );

  // Resolve sprite images from manifest
  const eggImage = spriteManifest.universal_egg;
  const sprites = spriteManifest.sprites as Record<string, Record<string, any>>;
  const hatchedImage = sprites[species ?? '']?.[variant ?? '']?.images?.L0 || '';
  const finalImage = sprites[species ?? '']?.[variant ?? '']?.images?.L1 || '';

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Phase 1: Egg appears (0.5s)
    timers.push(setTimeout(() => setPhase('crack'), 500));
    // Phase 2: Cracks appear (1s)
    timers.push(setTimeout(() => setPhase('shake'), 1500));
    // Phase 3: Egg shakes (1.5s)
    timers.push(setTimeout(() => setPhase('burst'), 3000));
    // Phase 4: Burst open (1s)
    timers.push(setTimeout(() => setPhase('light'), 4000));
    // Phase 5: Light glow (1s)
    timers.push(setTimeout(() => setPhase('reveal'), 5000));
    // Phase 6: Sprite reveal (2s)
    timers.push(setTimeout(() => setPhase('done'), 7000));

    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase === 'done') {
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  const eggColor = species === 'plant' ? '#4ade80' : species === 'animal' ? '#fb923c' : '#67e8f9';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Egg phase - show egg image */}
        {(phase === 'egg' || phase === 'crack' || phase === 'shake') && (
          <div
            className={`relative transition-all duration-500 ${
              phase === 'shake' ? 'animate-hatch-shake' : ''
            }`}
            style={{
              width: phase === 'shake' ? '100px' : '80px',
              height: phase === 'shake' ? '120px' : '100px',
            }}
          >
            <img
              src={eggImage}
              alt="Sprite Egg"
              className="w-full h-full object-contain"
              style={{ filter: phase === 'shake' ? 'brightness(1.2)' : 'none' }}
            />
          </div>
        )}

        {/* Light burst */}
        {phase === 'light' && (
          <div className="absolute inset-0 flex items-center justify-center animate-pulse">
            <div className="w-32 h-32 rounded-full bg-white shadow-[0_0_60px_rgba(255,255,255,0.8)]" />
          </div>
        )}

        {/* Sprite reveal - show hatched sprite (L0) */}
        {phase === 'reveal' && hatchedImage && (
          <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
            <img
              src={hatchedImage}
              alt="Hatched Sprite"
              className="w-40 h-40 object-contain animate-bounce"
              style={{ animationDuration: '2s' }}
            />
          </div>
        )}

        {/* Done - show final sprite (L1) */}
        {phase === 'done' && finalImage && (
          <div className="animate-fade-in">
            <img
              src={finalImage}
              alt="Final Sprite"
              className="w-40 h-40 object-contain animate-bounce"
              style={{ animationDuration: '2s' }}
            />
          </div>
        )}

        {/* Burst particles */}
        {phase === 'burst' && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-particle"
                style={{
                  background: eggColor,
                  left: '50%',
                  top: '50%',
                  ['--particle-x' as string]: `${(Math.random() - 0.5) * 200}px`,
                  ['--particle-y' as string]: `${(Math.random() - 0.5) * 200}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes hatch-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-4px) rotate(-5deg); }
          50% { transform: translateX(4px) rotate(5deg); }
          75% { transform: translateX(-2px) rotate(-3deg); }
        }
        .animate-hatch-shake {
          animation: hatch-shake 0.15s ease-in-out infinite;
        }
        @keyframes particle {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(var(--particle-x), var(--particle-y)); opacity: 0; }
        }
        .animate-particle {
          animation: particle 0.8s ease-out forwards;
        }
        @keyframes fade-in {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
