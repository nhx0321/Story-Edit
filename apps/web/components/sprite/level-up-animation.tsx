'use client';

import { useState, useEffect } from 'react';
import spriteManifest from '@/lib/sprite-manifest.json';

interface LevelUpAnimationProps {
  oldLevel: number;
  newLevel: number;
  species: string;
  variant: string;
  onComplete: () => void;
}

export default function LevelUpAnimation({ oldLevel, newLevel, species, variant, onComplete }: LevelUpAnimationProps) {
  const [phase, setPhase] = useState<'glow' | 'transform' | 'reveal' | 'done'>('glow');

  const sprites = spriteManifest.sprites as Record<string, Record<string, any>>;
  const oldImage = sprites[species]?.[variant]?.images?.[`L${oldLevel}`] || '';
  const newImage = sprites[species]?.[variant]?.images?.[`L${newLevel}`] || '';

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('transform'), 800);
    const t2 = setTimeout(() => setPhase('reveal'), 2000);
    const t3 = setTimeout(() => setPhase('done'), 3000);
    const t4 = setTimeout(onComplete, 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50">
      <div className="relative flex flex-col items-center">
        {/* Level up text */}
        {phase === 'glow' && (
          <div className="text-center">
            <img
              src={oldImage}
              alt="Old Level"
              className="w-40 h-40 object-contain mx-auto animate-level-up-glow"
            />
            <p className="text-white text-xl font-bold mt-4 animate-pulse">
              Lv.{oldLevel} → Lv.{newLevel}
            </p>
          </div>
        )}

        {/* Transform phase */}
        {phase === 'transform' && (
          <div className="relative">
            <img
              src={oldImage}
              alt="Transforming"
              className="w-40 h-40 object-contain animate-level-up-transform"
              style={{ opacity: 0 }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-yellow-300 shadow-[0_0_40px_rgba(250,204,21,0.8)] animate-ping" />
            </div>
          </div>
        )}

        {/* Reveal new level */}
        {phase === 'reveal' && newImage && (
          <div className="text-center animate-fade-in">
            <img
              src={newImage}
              alt="New Level"
              className="w-48 h-48 object-contain mx-auto"
            />
            <p className="text-yellow-300 text-2xl font-bold mt-2">
              ✨ Lv.{newLevel} 升级！
            </p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && newImage && (
          <div className="text-center animate-fade-in">
            <img
              src={newImage}
              alt="New Level"
              className="w-48 h-48 object-contain mx-auto animate-bounce"
              style={{ animationDuration: '2s' }}
            />
            <p className="text-green-400 text-lg mt-2">
              Lv.{newLevel}
            </p>
          </div>
        )}
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes level-up-glow {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 0px rgba(250,204,21,0)); }
          50% { filter: brightness(1.3) drop-shadow(0 0 15px rgba(250,204,21,0.6)); }
        }
        .animate-level-up-glow {
          animation: level-up-glow 0.8s ease-in-out infinite;
        }
        @keyframes level-up-transform {
          0% { transform: scale(1) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 0.5; }
          100% { transform: scale(0.8) rotate(360deg); opacity: 0; }
        }
        .animate-level-up-transform {
          animation: level-up-transform 1.2s ease-in-out forwards;
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
