'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { L0_GUIDE_STEPS } from '@/lib/guide-config';

interface SpriteStatus {
  hasSprite: boolean;
  isHatched: boolean;
  guideStep: number | null | undefined;
}

interface UseGuideOptions {
  spriteStatus: SpriteStatus | undefined;
  advanceGuideMutation: { mutate: () => void };
  skipGuideMutation: { mutate: () => void };
  claimGuideRewardMutation: { mutate: () => void };
}

interface UseGuideReturn {
  isGuideActive: boolean;
  currentStep: number;
  next: () => void;
  skip: () => void;
  later: () => void;
  isActive: boolean;
}

export function useGuide({
  spriteStatus,
  advanceGuideMutation,
  skipGuideMutation,
  claimGuideRewardMutation,
}: UseGuideOptions): UseGuideReturn {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  const step = spriteStatus?.guideStep ?? 0;
  const isActive = !!spriteStatus?.hasSprite && !spriteStatus.isHatched && step >= 0 && step < 10;

  // Auto-activate guide when sprite status loads
  useEffect(() => {
    if (isActive && step < 10) {
      setActive(true);
    }
  }, [isActive, step]);

  const next = useCallback(() => {
    const nextStep = step + 1;

    // Check if next step requires navigation
    const nextConfig = L0_GUIDE_STEPS.find(s => s.step === nextStep);

    if (nextConfig?.navigateTo) {
      // Navigate before showing next step
      router.push(nextConfig.navigateTo);
    }

    // Advance on backend
    advanceGuideMutation.mutate();

    // If step 10 reached, claim reward
    if (nextStep >= 10) {
      claimGuideRewardMutation.mutate();
      setActive(false);
    }
  }, [step, advanceGuideMutation, claimGuideRewardMutation, router]);

  const skip = useCallback(() => {
    skipGuideMutation.mutate();
    setActive(false);
  }, [skipGuideMutation]);

  const later = useCallback(() => {
    setActive(false);
  }, []);

  return {
    isGuideActive: active && isActive,
    currentStep: step,
    next,
    skip,
    later,
    isActive,
  };
}
