// 付费功能门控兼容层（订阅体系已下线，默认全部放行）
import { middleware } from '../../trpc';

export type SubscriptionTier = 'free' | 'premium';

interface PremiumContext {
  userId: string;
  tier: SubscriptionTier;
  isPremium: boolean;
}

export async function checkSubscription(userId: string): Promise<PremiumContext> {
  return { userId, tier: 'premium', isPremium: true };
}

export const withSubscription = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new Error('未登录');
  return next({ ctx: await checkSubscription(ctx.userId) });
});
