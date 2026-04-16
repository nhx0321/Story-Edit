// 付费功能门控中间件
import { middleware } from '../../trpc';
import { db } from '../../db';
import { subscriptions } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type SubscriptionTier = 'trial' | 'free' | 'premium' | 'expired';

interface PremiumContext {
  userId: string;
  tier: SubscriptionTier;
  isPremium: boolean;
  trialDaysLeft: number;
}

// 检查用户订阅状态
export async function checkSubscription(userId: string): Promise<PremiumContext> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));

  if (!sub) {
    return { userId, tier: 'free', isPremium: false, trialDaysLeft: 0 };
  }

  const now = new Date();

  // 试用期检查
  if (sub.status === 'trial' && sub.trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    if (daysLeft > 0) {
      return { userId, tier: 'trial', isPremium: true, trialDaysLeft: daysLeft };
    }
    // 试用过期，降级
    return { userId, tier: 'free', isPremium: false, trialDaysLeft: 0 };
  }

  // 付费会员检查
  if (sub.status === 'premium' && sub.currentPeriodEnd) {
    if (sub.currentPeriodEnd > now) {
      return { userId, tier: 'premium', isPremium: true, trialDaysLeft: 0 };
    }
    return { userId, tier: 'expired', isPremium: false, trialDaysLeft: 0 };
  }

  return { userId, tier: 'free', isPremium: false, trialDaysLeft: 0 };
}

// 中间件：注入订阅状态
export const withSubscription = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new Error('未登录');
  const subCtx = await checkSubscription(ctx.userId);
  return next({ ctx: subCtx });
});

// 中间件：要求付费会员
export const requirePremium = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new Error('未登录');
  const subCtx = await checkSubscription(ctx.userId);
  if (!subCtx.isPremium) {
    throw new Error('此功能需要付费会员，请升级订阅');
  }
  return next({ ctx: subCtx });
});

// 功能限制检查
export const FEATURE_LIMITS = {
  free: {
    maxProjects: 1,
    maxSettings: 3,
    maxAiRoles: 3,
    canCustomizeRoles: false,
    canCustomizePrompts: false,
    canSelfCheck: false,
    canLearnExperience: false,
    canTrackProgress: false,
    canExportDocx: false,
    canMultiSync: false,
    maxVersionsPerType: 3,
  },
  premium: {
    maxProjects: Infinity,
    maxSettings: Infinity,
    maxAiRoles: Infinity,
    canCustomizeRoles: true,
    canCustomizePrompts: true,
    canSelfCheck: true,
    canLearnExperience: true,
    canTrackProgress: true,
    canExportDocx: true,
    canMultiSync: true,
    maxVersionsPerType: 10,
  },
} as const;

export function getFeatureLimits(tier: SubscriptionTier) {
  if (tier === 'premium' || tier === 'trial') return FEATURE_LIMITS.premium;
  return FEATURE_LIMITS.free;
}
