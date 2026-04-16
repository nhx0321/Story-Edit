'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { SPECIES_CONFIG } from '@/lib/sprite-config';
import HatchAnimation from './hatch-animation';

interface HatchDialogProps {
  open: boolean;
  onClose: () => void;
  onHatch: () => void;
  mode?: 'guided' | 'manual'; // 'guided' = after guide complete, 'manual' = right-click menu
}

export default function HatchDialog({ open, onClose, onHatch, mode = 'guided' }: HatchDialogProps) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0); // 0=species, 1=variant, 2=name, 3=nickname, 4=style
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [customName, setCustomName] = useState('');
  const [userNickname, setUserNickname] = useState('');
  const [companionStyle, setCompanionStyle] = useState<'active' | 'quiet'>('quiet');
  const [showAnimation, setShowAnimation] = useState(false);

  const hatchMutation = trpc.sprite.hatch.useMutation({
    onSuccess: () => {
      utils.sprite.getStatus.invalidate();
      onHatch();
      resetForm();
    },
    onError: (e) => alert(e.message),
  });

  const resetForm = () => {
    setStep(0);
    setSelectedSpecies('');
    setSelectedVariant('');
    setCustomName('');
    setUserNickname('');
    setCompanionStyle('quiet');
    setShowAnimation(false);
  };

  const handleStartHatch = () => {
    if (!customName.trim()) { alert('请给精灵取个名字'); return; }
    if (mode === 'guided') {
      // Show animation first, then call hatch
      setShowAnimation(true);
    } else {
      // Direct hatch (right-click menu)
      hatchMutation.mutate({
        species: selectedSpecies as any,
        variant: selectedVariant,
        customName: customName.trim(),
        userNickname: userNickname.trim() || customName.trim(),
        companionStyle,
      });
    }
  };

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    hatchMutation.mutate({
      species: selectedSpecies as any,
      variant: selectedVariant,
      customName: customName.trim(),
      userNickname: userNickname.trim() || customName.trim(),
      companionStyle,
    });
  };

  if (!open) return null;

  if (showAnimation) {
    return (
      <HatchAnimation
        onComplete={handleAnimationComplete}
        species={selectedSpecies}
        variant={selectedVariant}
      />
    );
  }

  const speciesEntries = Object.entries(SPECIES_CONFIG);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition ${i <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h3 className="text-lg font-bold mb-4">选择你的精灵系别</h3>
            <div className="grid grid-cols-3 gap-3">
              {speciesEntries.map(([key, config]) => (
                <button key={key}
                  onClick={() => { setSelectedSpecies(key); setStep(1); }}
                  className="p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 transition text-center">
                  <p className="text-2xl mb-1">{config.variants[0].emoji}</p>
                  <p className="text-sm font-medium">{config.label}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && selectedSpecies && (
          <>
            <h3 className="text-lg font-bold mb-4">选择具体种类</h3>
            <div className="grid grid-cols-1 gap-2">
              {SPECIES_CONFIG[selectedSpecies as keyof typeof SPECIES_CONFIG].variants.map(v => (
                <button key={v.code}
                  onClick={() => { setSelectedVariant(v.code); setStep(2); }}
                  className="p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 transition flex items-center gap-3">
                  <span className="text-2xl">{v.emoji}</span>
                  <span className="font-medium">{v.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(0)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">&larr; 返回</button>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-lg font-bold mb-4">给你的精灵取个名字</h3>
            <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
              placeholder="例如：小阳、阿狐、微风..."
              className="w-full text-sm border border-gray-200 rounded-lg px-4 py-3 mb-4"
              maxLength={50} />
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">上一步</button>
              <button onClick={() => setStep(3)} disabled={!customName.trim()}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">下一步</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 className="text-lg font-bold mb-2">精灵该怎么称呼你？</h3>
            <p className="text-xs text-gray-400 mb-4">留空则默认使用精灵名字</p>
            <input type="text" value={userNickname} onChange={e => setUserNickname(e.target.value)}
              placeholder="你希望精灵叫你什么..."
              className="w-full text-sm border border-gray-200 rounded-lg px-4 py-3 mb-4"
              maxLength={50} />
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">上一步</button>
              <button onClick={() => setStep(4)}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm">下一步</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 className="text-lg font-bold mb-4">选择陪伴风格</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button onClick={() => setCompanionStyle('quiet')}
                className={`p-4 rounded-xl border-2 transition text-center ${companionStyle === 'quiet' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                <p className="text-xl mb-1">🤫</p>
                <p className="text-sm font-medium">安静陪伴</p>
                <p className="text-xs text-gray-400 mt-1">默默陪伴，偶尔互动</p>
              </button>
              <button onClick={() => setCompanionStyle('active')}
                className={`p-4 rounded-xl border-2 transition text-center ${companionStyle === 'active' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                <p className="text-xl mb-1">😊</p>
                <p className="text-sm font-medium">主动问候</p>
                <p className="text-xs text-gray-400 mt-1">偶尔主动打招呼</p>
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">上一步</button>
              <button onClick={handleStartHatch} disabled={hatchMutation.isPending}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
                {hatchMutation.isPending ? '孵化中...' : mode === 'guided' ? '开始孵化' : '确认孵化'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
