'use client';

import { useEffect, useState, useCallback } from 'react';
import { L0_GUIDE_STEPS, type GuideStepConfig } from '@/lib/guide-config';
import GuideCard from './guide-card';

interface GuideOverlayProps {
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
  onLater: () => void;
  isGuideActive: boolean;
}

export default function GuideOverlay({ currentStep, onNext, onSkip, onLater, isGuideActive }: GuideOverlayProps) {
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = useState(true);

  const stepConfig = L0_GUIDE_STEPS.find(s => s.step === currentStep);

  // Find target element and calculate highlight
  useEffect(() => {
    if (!isGuideActive || !stepConfig?.target) {
      setHighlightRect(null);
      setTargetFound(true);
      return;
    }

    const findTarget = () => {
      const el = document.querySelector(stepConfig.target!);
      if (!el) {
        setTargetFound(false);
        setHighlightRect(null);
        return;
      }
      setTargetFound(true);
      setHighlightRect(el.getBoundingClientRect());
    };

    findTarget();

    // Retry a few times in case element hasn't rendered yet
    if (stepConfig.waitForElement) {
      const timer = setTimeout(findTarget, 500);
      const timer2 = setTimeout(findTarget, 1500);
      return () => { clearTimeout(timer); clearTimeout(timer2); };
    }
  }, [stepConfig, isGuideActive]);

  // Update highlight on scroll/resize
  useEffect(() => {
    if (!highlightRect || !stepConfig?.target) return;

    const update = () => {
      const el = document.querySelector(stepConfig.target!);
      if (el) setHighlightRect(el.getBoundingClientRect());
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [highlightRect, stepConfig]);

  const handleClickTarget = useCallback(() => {
    if (stepConfig?.action === 'click' && stepConfig.navigateTo) {
      window.location.href = stepConfig.navigateTo;
    } else {
      onNext();
    }
  }, [stepConfig, onNext]);

  if (!isGuideActive) return null;

  const placement = stepConfig?.placement || 'bottom';

  return (
    <div className="fixed inset-0 z-[58] pointer-events-none" style={{ overflow: 'hidden' }}>
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Highlight cutout */}
      {highlightRect && (
        <div
          className="absolute pointer-events-auto border-2 border-white rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
          style={{
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
          onClick={(e) => {
            // Clicking highlighted element advances guide
            e.stopPropagation();
            handleClickTarget();
          }}
        />
      )}

      {/* Guide card */}
      <div className="absolute pointer-events-auto">
        <GuideCard
          title={stepConfig?.title || '引导'}
          text={stepConfig?.text || ''}
          step={currentStep}
          totalSteps={L0_GUIDE_STEPS.length}
          placement={placement}
          targetRect={highlightRect}
          showNext={true}
          showSkip={true}
          onNext={handleClickTarget}
          onSkip={onSkip}
          onLater={onLater}
          targetFound={targetFound}
        />
      </div>
    </div>
  );
}
