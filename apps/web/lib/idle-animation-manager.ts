export interface FrameData {
  fps: number;
  frames: string[];
}

export interface AnimationConfig {
  pools: Record<string, string[]>;
  frames?: Record<string, FrameData>;
  switchInterval: { min: number; max: number };
}

export class IdleAnimationManager {
  private imgEl: HTMLImageElement | null = null;
  private currentAnim: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isPaused = false;
  private reducedMotion = false;
  private isPlayingFrames = false;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private config: AnimationConfig) {
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  init(imgEl: HTMLImageElement) { this.imgEl = imgEl; if (!this.reducedMotion) this.scheduleNext(); }
  setLevel(level: number) { this.clearCurrent(); if (!this.reducedMotion) this.scheduleNext(); }

  /**
   * Manually play a specific animation (for admin preview).
   * This pauses the auto-switching and plays the specified animation in a loop.
   */
  playAnimation(animName: string) {
    if (!this.imgEl) return;
    this.isPaused = true; // Stop auto-switching
    this.clearCurrent();
    this.currentAnim = animName;

    const frameData = this.config.frames?.[animName];
    if (frameData && frameData.frames.length > 0) {
      this.startFrameSequence(frameData);
    } else {
      this.imgEl.classList.add('sprite-idle', `anim-${animName}`);
    }
  }

  /**
   * Play an interaction animation with optional follow-up (e.g., click-surprise → click-relief).
   * Unlike playAnimation, this automatically resumes idle after completion.
   */
  playInteraction(animName: string, followUp?: string) {
    if (!this.imgEl) return;
    this.isPaused = true;
    this.clearCurrent();
    this.currentAnim = animName;

    const frameData = this.config.frames?.[animName];
    if (frameData && frameData.frames.length > 0) {
      this.startFrameSequence(frameData, () => {
        if (followUp) {
          this.playInteraction(followUp);
        } else {
          this.resumeAuto();
        }
      });
    } else {
      this.imgEl.classList.add('sprite-idle', `anim-${animName}`);
    }
  }

  /**
   * Resume automatic animation switching.
   */
  resumeAuto() {
    this.isPaused = false;
    this.clearCurrent();
    if (!this.reducedMotion && !this.timer) this.scheduleNext();
  }

  pause() {
    this.isPaused = true;
    if (this.imgEl) this.imgEl.style.animationPlayState = 'paused';
  }
  resume() {
    this.isPaused = false;
    if (this.imgEl) this.imgEl.style.animationPlayState = 'running';
    if (!this.reducedMotion && !this.timer) this.scheduleNext();
  }
  destroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.clearCurrent();
    this.imgEl = null;
  }

  private scheduleNext() {
    if (this.isPaused || this.reducedMotion) return;
    const { min, max } = this.config.switchInterval;
    const delay = Math.random() * (max - min) + min;
    this.timer = setTimeout(() => { this.pickAndApply(); this.scheduleNext(); }, delay);
  }

  private pickAndApply() {
    if (!this.imgEl) return;
    const level = parseInt((this.imgEl?.closest('.sprite-container') as HTMLElement)?.dataset.level || '0', 10);
    const poolKey = level === 0 ? 'L0' : level <= 2 ? 'L1-L2' : level <= 5 ? 'L3-L5' : 'L6-L9';
    const pool = this.config.pools[poolKey] || [];
    if (pool.length === 0) return;
    let nextAnim: string;
    do { nextAnim = pool[Math.floor(Math.random() * pool.length)]; } while (nextAnim === this.currentAnim && pool.length > 1);
    this.applyAnimation(nextAnim);
  }

  private applyAnimation(animName: string) {
    if (!this.imgEl) return;
    this.clearCurrent();
    this.currentAnim = animName;

    // Check if frame sequence data exists for this animation
    const frameData = this.config.frames?.[animName];
    if (frameData && frameData.frames.length > 0) {
      this.startFrameSequence(frameData);
    } else {
      // Fallback: CSS class-based animation
      this.imgEl.classList.add('sprite-idle', `anim-${animName}`);
    }
  }

  private startFrameSequence(frameData: { fps: number; frames: string[] }, onComplete?: () => void) {
    if (!this.imgEl) return;
    this.isPlayingFrames = true;
    let frameIndex = 0;
    const interval = 1000 / frameData.fps;

    const playNext = () => {
      if (!this.imgEl || this.isPaused || !this.isPlayingFrames) return;
      const isLastFrame = frameIndex >= frameData.frames.length - 1;
      this.imgEl.src = frameData.frames[frameIndex % frameData.frames.length];
      frameIndex++;

      if (isLastFrame && onComplete) {
        // Last frame reached, call onComplete (which may resume idle or play followUp)
        this.isPlayingFrames = false;
        this.frameTimer = setTimeout(() => {
          onComplete();
        }, interval);
      } else {
        this.frameTimer = setTimeout(playNext, interval);
      }
    };
    playNext();
  }

  private clearCurrent() {
    if (!this.imgEl || !this.currentAnim) return;
    // Stop frame sequence if playing
    this.isPlayingFrames = false;
    if (this.frameTimer) {
      clearTimeout(this.frameTimer);
      this.frameTimer = null;
    }
    // Clear CSS animation
    this.imgEl.classList.remove('sprite-idle', `anim-${this.currentAnim}`);
    this.currentAnim = null;
  }
}
