'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/lib/auth-store';
import { ENCOURAGE_TEXTS } from '@/lib/sprite-config';
import { L0_GUIDE_STEPS } from '@/lib/guide-config';
import HatchDialog from './hatch-dialog';
import ContextMenu from './context-menu';
import GuideDialog from './guide-dialog';
import GuideOverlay from '@/components/guide/guide-overlay';
import SecretShopEasterEgg from './secret-shop-easter-egg';
import SpriteChatDialog from './sprite-chat-dialog';
import LevelUpAnimation from './level-up-animation';
import { IdleAnimationManager } from '@/lib/idle-animation-manager';
import spriteManifest from '@/lib/sprite-manifest.json';

const SPRITE_SIZE = 240;

export default function SpriteComponent() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const isLoggedIn = !!user;

  const { data: statusRaw, isLoading, refetch } = trpc.sprite.getSpriteStatus.useQuery(undefined, {
    enabled: isLoggedIn,
    refetchOnWindowFocus: false,
  });
  const status = statusRaw as any;

  const utils = trpc.useUtils();
  const checkinMutation = trpc.sprite.checkin.useMutation();
  const createEggMutation = trpc.sprite.createEgg.useMutation();
  const setPositionMutation = trpc.sprite.setPosition.useMutation();
  const foundSecretShopMutation = trpc.sprite.foundSecretShop.useMutation();
  const advanceGuideMutation = trpc.sprite.advanceGuide.useMutation();
  const skipGuideMutation = trpc.sprite.skipGuide.useMutation();
  const claimGuideRewardMutation = trpc.sprite.claimGuideReward.useMutation();
  const convertMutation = trpc.sprite.convertBeanToDays.useMutation();
  const triggerFeedbackMutation = trpc.sprite.triggerFeedback.useMutation();
  const testLevelUpMutation = trpc.sprite.testLevelUp.useMutation();

  const [pos, setPos] = useState(() => {
    if (typeof window !== 'undefined') {
      return { x: Math.round(window.innerWidth / 2 - SPRITE_SIZE / 2), y: Math.round(window.innerHeight / 2 - SPRITE_SIZE / 2) };
    }
    return { x: 20, y: 80 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showHatchDialog, setShowHatchDialog] = useState(false);
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [doubleClickText, setDoubleClickText] = useState<string | null>(null);
  const [spriteBubble, setSpriteBubble] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [guideActive, setGuideActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState<{ oldLevel: number; newLevel: number } | null>(null);
  const [showInteractionHint, setShowInteractionHint] = useState(false);
  const [previewLevelOverride, setPreviewLevelOverride] = useState<number | null>(null);

  // Interaction animation tracking
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [isClickInteraction, setIsClickInteraction] = useState(false);
  const [isRightClickInteraction, setIsRightClickInteraction] = useState(false);

  const prevLevelRef = useRef<number>(0);
  const spriteRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animManagerRef = useRef<IdleAnimationManager | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hintShownRef = useRef<boolean>(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // L0 精灵蛋临时引导：用户 5 秒无操作后提示，仅提示一次
  useEffect(() => {
    // 使用 status 直接计算，不依赖后面的 isEgg 变量
    if (!status?.hasSprite || (status as any)?.isHatched) return;
    // 检查是否已经提示过
    const alreadyShown = localStorage.getItem('sprite-interaction-hint-shown');
    if (alreadyShown) {
      hintShownRef.current = true;
      return;
    }
    // 5 秒无操作后显示
    inactivityTimer.current = setTimeout(() => {
      setShowInteractionHint(true);
    }, 5000);
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [status?.hasSprite, status?.isHatched]);

  // 标记引导已显示（用户交互后调用）
  const markHintShown = useCallback(() => {
    if (hintShownRef.current) return;
    hintShownRef.current = true;
    setShowInteractionHint(false);
    localStorage.setItem('sprite-interaction-hint-shown', 'true');
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  }, []);

  // Determine if L0 guide is active
  const isL0Guide = status?.hasSprite && !status.isHatched && (status.guideStep ?? 0) < 10;
  const isL1Guide = status?.hasSprite && status.isHatched && (status.guideStep ?? 0) > 0 && (status.guideStep ?? 0) < 5;

  // Create egg on first login if no sprite exists
  useEffect(() => {
    if (status && !status.hasSprite && !createEggMutation.isPending) {
      createEggMutation.mutate(undefined, {
        onError: () => { /* egg creation failed, user can still hatch manually */ },
      });
    }
  }, [status]);

  // Auto-activate L0 guide
  useEffect(() => {
    if (isL0Guide) {
      setGuideActive(true);
      setShowGuideDialog(false); // Disable old guide
    }
  }, [isL0Guide]);

  // Load position from localStorage on mount
  useEffect(() => {
    if (!status || !status.hasSprite) return;
    const s = status as { hasSprite: true; positionX: number | null; positionY: number | null };
    const saved = localStorage.getItem('sprite-position');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPos({ x: p.x ?? 20, y: p.y ?? 80 });
      } catch { /* ignore */ }
    } else if (s.positionX != null) {
      setPos({ x: s.positionX, y: s.positionY ?? 80 });
    }
  }, [status]);

  // Show L1 guide (old guide, for existing users)
  useEffect(() => {
    if (status?.hasSprite) {
      const s = status as { hasSprite: true; isHatched: boolean; guideStep: number | null };
      if (s.isHatched && s.guideStep != null && s.guideStep > 0 && s.guideStep < 5) {
        setShowGuideDialog(true);
      }
    }
  }, [status]);

  // Auto checkin on page load
  useEffect(() => {
    if (status?.hasSprite) {
      const s = status as { hasSprite: true; isHatched: boolean };
      if (s.isHatched) {
        checkinMutation.mutate();
      }
    }
  }, [status]);

  // Auto trigger daily feedback on page load
  useEffect(() => {
    if (status?.hasSprite) {
      const s = status as { hasSprite: true; isHatched: boolean; dailyFeedbackTriggered: boolean };
      if (s.isHatched && !s.dailyFeedbackTriggered) {
        const timer = setTimeout(() => {
          triggerFeedbackMutation.mutate({
            triggerType: 'daily',
          }, {
            onSuccess: (data) => {
              if (data.feedback) {
                setSpriteBubble(data.feedback);
                setTimeout(() => setSpriteBubble(null), 3000);
              }
              refetch();
            },
          });
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [status]);

  // Show guide bubble for L0 egg
  useEffect(() => {
    if (isL0Guide && guideActive) {
      const step = status?.guideStep ?? 0;
      const config = L0_GUIDE_STEPS.find(s => s.step === step);
      if (config) {
        setSpriteBubble(config.text.substring(0, 50) + (config.text.length > 50 ? '...' : ''));
      }
    }
  }, [status?.guideStep, isL0Guide, guideActive]);

  // Idle animation manager
  useEffect(() => {
    if (!imgRef.current || !status?.species || !status?.variant) return;
    const poolKey = status.level === 0 ? 'L0' : status.level <= 2 ? 'L1-L2' : status.level <= 5 ? 'L3-L5' : 'L6-L9';
    const sprites = spriteManifest.sprites as Record<string, Record<string, any>>;
    const variantData = sprites[status.species]?.[status.variant];
    const manager = new IdleAnimationManager({
      pools: variantData?.animation_pools || {},
      frames: variantData?.frames,
      switchInterval: { min: 3000, max: 8000 }
    });
    manager.init(imgRef.current);
    animManagerRef.current = manager;

    // Listen for admin preview control messages
    const channel = new BroadcastChannel('sprite-admin-preview');
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'preview-level') {
        // Update the img's data-level attribute for animation pool selection
        if (imgRef.current) {
          imgRef.current.dataset.level = String(e.data.level);
          manager.setLevel(e.data.level);
        }
        // Also update the image src to show the correct level
        setPreviewLevelOverride(e.data.level);
      } else if (e.data?.type === 'preview-anim') {
        if (e.data.animName) {
          manager.playAnimation(e.data.animName);
        }
      } else if (e.data?.type === 'preview-resume') {
        setPreviewLevelOverride(null);
        manager.resumeAuto();
      }
    };
    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      manager.destroy();
    };
  }, [status?.species, status?.variant, status?.level]);

  // Detect level-up animation trigger
  useEffect(() => {
    if (!status?.hasSprite || !status.isHatched) return;
    const currentLevel = status.level;
    console.log('[LevelUp Check] prevLevel:', prevLevelRef.current, 'currentLevel:', currentLevel);
    if (prevLevelRef.current > 0 && currentLevel > prevLevelRef.current) {
      console.log('[LevelUp] Triggering animation:', prevLevelRef.current, '->', currentLevel);
      setLevelUpInfo({ oldLevel: prevLevelRef.current, newLevel: currentLevel });
      setShowLevelUp(true);
    }
    prevLevelRef.current = currentLevel;
  }, [status?.level, status?.hasSprite, status?.isHatched]);


  const savePosition = useCallback((newPos: { x: number; y: number }) => {
    localStorage.setItem('sprite-position', JSON.stringify(newPos));
    setPositionMutation.mutate(newPos);
  }, []);

  // Drag handlers - disabled during L0 guide
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isL0Guide && guideActive) return;
    markHintShown();
    if (e.button === 2) return;
    e.preventDefault();

    // Track mouse down position for click vs drag detection
    setMouseDownPos({ x: e.clientX, y: e.clientY });
    setIsClickInteraction(true);

    // Trigger click-surprise animation on mousedown (will be cancelled if drag occurs)
    animManagerRef.current?.playInteraction('click-surprise');

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isL0Guide && guideActive) return; // Disable drag during guide
    const touch = e.touches[0];
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - pos.x,
      y: touch.clientY - pos.y,
    });
    longPressTimer.current = setTimeout(() => {
      setIsDragging(false);
      setContextMenuPos({ x: touch.clientX, y: touch.clientY });
      setShowContextMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      const newX = Math.max(0, Math.min(window.innerWidth - SPRITE_SIZE, clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - SPRITE_SIZE, clientY - dragOffset.y));
      setPos({ x: newX, y: newY });

      // If there's significant movement, it's a drag not a click
      if (mouseDownPos) {
        const dx = clientX - mouseDownPos.x;
        const dy = clientY - mouseDownPos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          setIsClickInteraction(false);
        }
      }
    };

    const handleUp = () => {
      // If it was a click (no drag), trigger click-relief animation
      if (isClickInteraction && mouseDownPos) {
        animManagerRef.current?.playInteraction('click-relief');
      }
      setIsClickInteraction(false);
      setIsRightClickInteraction(false);
      setIsDragging(false);
      setMouseDownPos(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, dragOffset, mouseDownPos, isClickInteraction]);

  // Save position after drag ends
  useEffect(() => {
    if (!isDragging && status?.hasSprite) {
      savePosition(pos);
    }
  }, [isDragging, status]);

  // Double click handler
  const handleDoubleClick = () => {
    markHintShown();
    const s = status as { hasSprite?: boolean; isHatched?: boolean; guideStep?: number } | undefined;
    if (!s?.isHatched) {
      // L0 egg
      if (isL0Guide && guideActive) {
        setSpriteBubble('请先完成引导哦~');
        setTimeout(() => setSpriteBubble(null), 2000);
        return;
      }
      setShowHatchDialog(true);
      return;
    }

    // Trigger double-tickle interaction animation
    animManagerRef.current?.playInteraction('double-tickle');

    const randomText = ENCOURAGE_TEXTS[Math.floor(Math.random() * ENCOURAGE_TEXTS.length)];
    setDoubleClickText(randomText);
    setTimeout(() => setDoubleClickText(null), 2500);
  };

  // Right click handler - disabled during L0 guide
  const handleContextMenu = (e: React.MouseEvent) => {
    markHintShown();
    if (isL0Guide && guideActive) {
      setSpriteBubble('请先完成引导哦~');
      setTimeout(() => setSpriteBubble(null), 2000);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // If not hatched, show hatch dialog instead of context menu
    if (!s?.isHatched) {
      setShowHatchDialog(true);
      return;
    }

    // Trigger right-look interaction animation
    animManagerRef.current?.playInteraction('right-look', 'right-relief');

    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Hatch callback
  const handleHatchComplete = () => {
    setShowHatchDialog(false);
    setGuideActive(false);
    refetch();
  };

  // Secret shop callback — show easter egg then navigate to sprite shop
  const handleSecretShop = () => {
    const s = status as { hasSprite?: boolean; secretShopFound?: boolean } | undefined;
    if (!s?.secretShopFound) {
      foundSecretShopMutation.mutate(undefined, {
        onSuccess: (data) => {
          if (data.hasEasterEgg) {
            setShowEasterEgg(true);
          }
          setTimeout(() => router.push('/sprite-shop'), data.hasEasterEgg ? 2000 : 0);
        },
      });
    } else {
      router.push('/sprite-shop');
    }
    setShowContextMenu(false);
  };

  // My items callback — navigate to inventory
  const handleMyItems = () => {
    setShowContextMenu(false);
    router.push('/sprite-shop/inventory');
  };

  // Convert callback
  const handleConvert = () => {
    convertMutation.mutate({}, {
      onSuccess: (data) => {
        refetch();
      },
      onError: (e: any) => {
        // Error handled in context menu
      },
    });
    setShowContextMenu(false);
  };

  // Guide callbacks
  const handleGuideNext = () => {
    advanceGuideMutation.mutate();
    const s = status as { hasSprite?: boolean; guideStep?: number } | undefined;
    if ((s?.guideStep ?? 0) + 1 >= 4) {
      claimGuideRewardMutation.mutate();
    }
    if ((s?.guideStep ?? 0) + 1 >= 5) {
      setShowGuideDialog(false);
    }
  };

  const handleGuideSkip = () => {
    skipGuideMutation.mutate();
    setShowGuideDialog(false);
  };

  const handleGuideLater = () => {
    setShowGuideDialog(false);
  };

  // L0 guide overlay callbacks
  const handleL0GuideNext = () => {
    const step = status?.guideStep ?? 0;
    const nextStep = step + 1;
    const nextConfig = L0_GUIDE_STEPS.find(s => s.step === nextStep);

    // Navigate if needed
    if (nextConfig?.navigateTo) {
      window.location.href = nextConfig.navigateTo;
    }

    advanceGuideMutation.mutate();

    // If step 10 reached, claim reward
    if (nextStep >= 10) {
      claimGuideRewardMutation.mutate();
      setGuideActive(false);
      // Show hatch dialog after reward
      setTimeout(() => setShowHatchDialog(true), 500);
    }
  };

  const handleL0GuideSkip = () => {
    skipGuideMutation.mutate();
    setGuideActive(false);
  };

  const handleL0GuideLater = () => {
    setGuideActive(false);
    setSpriteBubble('引导完成后我就可以破壳而出，还能获得奖励哦~');
    setTimeout(() => setSpriteBubble(null), 3000);
  };

  // Chat dialog
  const handleOpenChat = () => {
    setShowChatDialog(true);
    setShowContextMenu(false);
  };

  // Share to sprite (manual trigger)
  const handleShareToSprite = () => {
    setShowContextMenu(false);
    setIsThinking(true);
    triggerFeedbackMutation.mutate({
      triggerType: 'manual',
    }, {
      onSuccess: (data) => {
        setIsThinking(false);
        if (data.feedback) {
          setSpriteBubble(data.feedback);
          setTimeout(() => setSpriteBubble(null), 3000);
        }
        refetch();
      },
      onError: () => {
        setIsThinking(false);
      },
    });
  };

  // Level-up animation complete
  const handleLevelUpComplete = () => {
    setShowLevelUp(false);
    setLevelUpInfo(null);
    refetch();
  };

  // Test level-up trigger
  const handleTestLevelUp = () => {
    testLevelUpMutation.mutate(undefined, {
      onSuccess: (data) => {
        console.log('[LevelUp] Success:', data);
        refetch();
      },
      onError: (e) => {
        console.error('[LevelUp] Error:', e);
        alert(e.message);
      },
    });
    setShowContextMenu(false);
  };

  if (!isLoggedIn || isLoading) return null;

  // Compute isEgg early so both render branches can use it
  const isEgg = !status?.isHatched;
  if (!status?.hasSprite) {
    const s = status as { hasSprite: false } | undefined;
    return (
      <>
        <div
          ref={spriteRef}
          className="fixed z-50 cursor-pointer select-none"
          style={{ left: pos.x, top: pos.y, width: SPRITE_SIZE, height: SPRITE_SIZE }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        >
          <div className="w-full h-full anim-egg">
            <img
              src={spriteManifest.universal_egg}
              alt="Sprite Egg"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        {doubleClickText && (
          <div className="fixed z-50 bg-white rounded-xl px-4 py-2 shadow-xl text-sm border border-gray-200"
            style={{ left: pos.x - 20, top: pos.y - 50 }}>
            {doubleClickText}
          </div>
        )}
        {/* 交互引导气泡 — 未孵化蛋临时引导 */}
        {showInteractionHint && mounted && (
          <div
            className="fixed z-50 bg-white/95 backdrop-blur rounded-2xl px-4 py-3 shadow-xl border border-gray-200 pointer-events-none min-w-[200px]"
            style={{ left: Math.max(10, pos.x + SPRITE_SIZE + 8), top: pos.y - 10 }}>
            <p className="text-xs font-medium text-gray-800 mb-2">试试这些操作：</p>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">双击</span>
                <span>破壳孵化</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">右键</span>
                <span>选择孵化方向</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">拖动</span>
                <span>移动位置</span>
              </div>
            </div>
          </div>
        )}
        <HatchDialog open={showHatchDialog} onClose={() => setShowHatchDialog(false)} onHatch={handleHatchComplete} mode="manual" />
        <GuideDialog
          open={showGuideDialog}
          step={(s as any)?.guideStep ?? 0}
          customName={(s as any)?.customName}
          onNext={handleGuideNext}
          onSkip={handleGuideSkip}
          onLater={handleGuideLater}
        />
        <ContextMenu
          open={showContextMenu}
          onClose={() => setShowContextMenu(false)}
          position={contextMenuPos}
          level={(s as any)?.level ?? 1}
          beanBalance={(s as any)?.beanBalance ?? 0}
          totalXp={(s as any)?.totalXp ?? 0}
          totalBeanSpent={(s as any)?.totalBeanSpent ?? 0}
          convertibleDays={(s as any)?.convertibleDays ?? 0}
          onSecretShop={handleSecretShop}
          onMyItems={handleMyItems}
          onConvert={handleConvert}
          onChat={handleOpenChat}
          onTestLevelUp={handleTestLevelUp}
        />
        <SecretShopEasterEgg open={showEasterEgg} onClose={() => setShowEasterEgg(false)} />
        <SpriteChatDialog
          open={showChatDialog}
          onClose={() => setShowChatDialog(false)}
          spriteInfo={null}
        />
      </>
    );
  }

  // Hatched sprite or L0 egg
  const s = status as {
    hasSprite: true;
    isHatched: boolean;
    level: number;
    species: string | null;
    variant: string | null;
    customName: string | null;
    userNickname: string | null;
    companionStyle: string | null;
    totalActiveDays: number | null;
    bonusDays: number | null;
    positionX: number | null;
    positionY: number | null;
    guideStep: number;
    secretShopFound: boolean;
    imageUrl: string | null;
    fatigueLevel: number;
    dailyFeedbackTriggered: boolean;
    chatCooldown: boolean;
  };

  // Hydration guard — render nothing until client-side hydration is complete
  if (!mounted) return null;

  const displayLevel = previewLevelOverride ?? s.level;
  const debugSrc = !status?.isHatched
    ? spriteManifest.universal_egg
    : ((spriteManifest.sprites as any)[status.species]?.[status.variant]?.images[`L${displayLevel}`] || spriteManifest.universal_egg);

  return (
    <>
      <div
        ref={spriteRef}
        className={`fixed z-50 select-none ${isEgg ? 'cursor-pointer' : 'cursor-pointer'}`}
        style={{ left: pos.x, top: pos.y, width: SPRITE_SIZE, height: SPRITE_SIZE }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* L0 Egg display */}
        {isEgg && (
          <div className="w-full h-full anim-egg">
            <img
              src={spriteManifest.universal_egg}
              alt="Sprite Egg"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Hatched sprite display */}
        {!isEgg && (
          <div className="w-full h-full anim-sprite-idle">
            <img
              ref={imgRef}
              src={debugSrc}
              alt="Desktop Sprite"
              className="sprite-container"
              data-level={displayLevel}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* 思考中动画 */}
        {isThinking && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white rounded-full px-3 py-1 shadow-lg border border-gray-200">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>

      {/* 精灵气泡 */}
      {spriteBubble && (
        <div
          className="fixed z-50 bg-white rounded-xl px-4 py-2 shadow-xl text-sm border border-gray-200 pointer-events-none max-w-[240px]"
          style={{ left: Math.max(10, pos.x - 80), top: pos.y - 60 }}>
          <p className="text-center font-medium text-gray-800">{spriteBubble}</p>
        </div>
      )}

      {/* 交互引导气泡 — 精灵蛋临时引导，5 秒无操作后显示 */}
      {isEgg && showInteractionHint && mounted && (
        <div
          className="fixed z-50 bg-white/95 backdrop-blur rounded-2xl px-4 py-3 shadow-xl border border-gray-200 pointer-events-none min-w-[200px]"
          style={{ left: Math.max(10, pos.x + SPRITE_SIZE + 8), top: pos.y - 10 }}>
          <p className="text-xs font-medium text-gray-800 mb-2">试试这些操作：</p>
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">双击</span>
              <span>破壳孵化</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">右键</span>
              <span>选择孵化方向</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">拖动</span>
              <span>移动位置</span>
            </div>
          </div>
        </div>
      )}

      {doubleClickText && !spriteBubble && (
        <div
          className="fixed z-50 bg-white rounded-xl px-4 py-2 shadow-xl text-sm border border-gray-200 pointer-events-none"
          style={{ left: pos.x - 30, top: pos.y - 50, minWidth: 160 }}>
          <p className="text-center font-medium text-gray-800">{doubleClickText}</p>
          {!isEgg && <p className="text-center text-xs text-gray-400 mt-1">等级 {displayLevel}</p>}
        </div>
      )}

      {/* L1 Guide (old guide for existing users) */}
      <GuideDialog
        open={showGuideDialog && !isL0Guide}
        step={s.guideStep}
        customName={s.customName}
        onNext={handleGuideNext}
        onSkip={handleGuideSkip}
        onLater={handleGuideLater}
      />

      {/* L0 Guide Overlay */}
      <GuideOverlay
        currentStep={s.guideStep ?? 0}
        onNext={handleL0GuideNext}
        onSkip={handleL0GuideSkip}
        onLater={handleL0GuideLater}
        isGuideActive={mounted && guideActive && isL0Guide}
      />

      <ContextMenu
        open={showContextMenu}
        onClose={() => setShowContextMenu(false)}
        position={contextMenuPos}
        level={s.level}
        beanBalance={(s as any).beanBalance ?? 0}
        totalXp={(s as any).totalXp ?? 0}
        totalBeanSpent={(s as any).totalBeanSpent ?? 0}
        convertibleDays={(s as any).convertibleDays ?? 0}
        fatigueLevel={s.fatigueLevel}
        dailyFeedbackTriggered={s.dailyFeedbackTriggered}
        onSecretShop={handleSecretShop}
        onMyItems={handleMyItems}
        onConvert={handleConvert}
        onChat={handleOpenChat}
        onShareToSprite={handleShareToSprite}
        onTestLevelUp={handleTestLevelUp}
      />

      <HatchDialog
        open={showHatchDialog}
        onClose={() => setShowHatchDialog(false)}
        onHatch={handleHatchComplete}
        mode={isEgg ? 'guided' : 'manual'}
      />

      <SecretShopEasterEgg open={showEasterEgg} onClose={() => setShowEasterEgg(false)} />

      <SpriteChatDialog
        open={showChatDialog}
        onClose={() => setShowChatDialog(false)}
        spriteInfo={{
          customName: s.customName,
          species: s.species ?? '',
          companionStyle: s.companionStyle,
          fatigueLevel: s.fatigueLevel,
        }}
      />

      {/* Level-up animation */}
      {showLevelUp && levelUpInfo && s.species && s.variant && (
        <LevelUpAnimation
          oldLevel={levelUpInfo.oldLevel}
          newLevel={levelUpInfo.newLevel}
          species={s.species}
          variant={s.variant}
          onComplete={handleLevelUpComplete}
        />
      )}

    </>
  );
}
