// 精灵系统 tRPC 路由
import { z } from 'zod';
import { eq, and, desc, sql, inArray, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { userSprites, spriteImages, spriteItems, userSpriteItems, users, spriteConversations, spriteInteractionLog, aiConfigs, artAssets } from '../../db/schema';
import { generateSpriteImage, type SpriteImageParams } from './image-generator';
import { GUIDE_TEXTS } from './guide-texts';
import { generateFeedback, chatWithSprite, getRestText } from './sprite-ai';
import { getLevelProgress as getBeanLevelProgress, getLevelByXp, getConvertibleDays } from './bean-service';

// 升级所需天数
const LEVEL_DAYS: Record<number, number> = {
  1: 0, 2: 26, 3: 58, 4: 96, 5: 140, 6: 190, 7: 245, 8: 305, 9: 365,
};

// 系别配置
const SPECIES_CONFIG: Record<string, { label: string; variants: { code: string; label: string; emoji: string }[] }> = {
  plant: {
    label: '植物系',
    variants: [{ code: 'sunflower', label: '向日葵', emoji: '🌻' }],
  },
  animal: {
    label: '动物系',
    variants: [{ code: 'fox', label: '小狐狸', emoji: '🦊' }],
  },
  element: {
    label: '元素系',
    variants: [{ code: 'wind', label: '小风灵', emoji: '🌬️' }],
  },
};

export const spriteRouter = router({
  // 获取精灵状态
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite) return { hasSprite: false };

    const totalDays = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0);
    const totalXp = sprite.totalXp ?? 0;

    // 双条件升级：经验值和天数必须同时满足
    let xpLevel = getLevelByXp(totalXp);
    let daysLevel = 1;
    for (let lvl = 9; lvl >= 1; lvl--) {
      if (totalDays >= LEVEL_DAYS[lvl]) { daysLevel = lvl; break; }
    }
    // 取较小值（两个条件都要满足）
    const currentLevel = Math.min(xpLevel, daysLevel);

    // 获取当前等级的图片 — 优先 art_assets，回退 sprite_images
    let imageUrl: string | null = null;

    // 1. 优先查已发布的美术资产
    const [asset] = await db.select({
      storagePath: artAssets.storagePath,
      cdnUrl: artAssets.cdnUrl,
    }).from(artAssets)
      .where(and(
        eq(artAssets.category, 'character'),
        eq(artAssets.assetKey, `character/${sprite.variant}/L${currentLevel}`),
        eq(artAssets.isPublished, true),
        eq(artAssets.isActive, true),
      ))
      .orderBy(desc(artAssets.version))
      .limit(1);

    if (asset) {
      imageUrl = asset.cdnUrl || `/assets/sprites/${asset.storagePath}`;
    } else {
      // 2. 回退到旧 sprite_images 表
      const [img] = await db.select()
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, sprite.species || 'unknown'),
          eq(spriteImages.variant, sprite.variant || 'unknown'),
          eq(spriteImages.level, currentLevel),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);
      if (img) imageUrl = img.imageUrl;
    }

    // 计算精灵豆升级进度
    const beanProgress = getBeanLevelProgress(
      currentLevel,
      totalXp,
      sprite.totalActiveDays ?? 0,
      sprite.bonusDays ?? 0,
      sprite.convertedDays ?? 0,
    );

    const convertibleDays = getConvertibleDays(sprite.totalBeanSpent ?? 0, sprite.convertedDays ?? 0);

    return {
      hasSprite: true,
      isHatched: sprite.isHatched,
      species: sprite.species,
      variant: sprite.variant,
      level: currentLevel,
      customName: sprite.customName,
      userNickname: sprite.userNickname,
      companionStyle: sprite.companionStyle,
      totalActiveDays: sprite.totalActiveDays,
      bonusDays: sprite.bonusDays,
      positionX: sprite.positionX,
      positionY: sprite.positionY,
      guideStep: sprite.guideStep,
      secretShopFound: sprite.secretShopFound,
      imageUrl: null,  // 前端通过 sprite-manifest.json 管理图片路径
      beanBalance: sprite.beanBalance ?? 0,
      totalBeanSpent: sprite.totalBeanSpent ?? 0,
      totalXp,
      convertedDays: sprite.convertedDays ?? 0,
      convertibleDays,
      beanProgress,
    };
  }),

  // 创建精灵蛋（新用户首次登录）
  createEgg: protectedProcedure.mutation(async ({ ctx }) => {
    const [existing] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (existing) {
      // 如果已有记录但已孵化，不重复创建
      if (existing.isHatched) throw new Error('精灵已孵化');
      return { ok: true };
    }
    await db.insert(userSprites).values({
      userId: ctx.userId,
      species: null,
      variant: null,
      customName: null,
      userNickname: null,
      companionStyle: 'quiet',
      isHatched: false,
      guideStep: 0,
    });
    return { ok: true };
  }),

  // 破壳（引导完成后，设置系别/命名并孵化）
  hatch: protectedProcedure
    .input(z.object({
      species: z.enum(['plant', 'animal', 'element']),
      variant: z.string(),
      customName: z.string().min(1).max(50),
      userNickname: z.string().max(50),
      companionStyle: z.enum(['active', 'quiet']).default('quiet'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (existing?.isHatched) throw new Error('精灵已孵化');

      // 检查该系别种类是否存在
      const speciesConfig = SPECIES_CONFIG[input.species];
      if (!speciesConfig || !speciesConfig.variants.find(v => v.code === input.variant)) {
        throw new Error('无效的系别或种类');
      }

      if (existing) {
        await db.update(userSprites).set({
          species: input.species,
          variant: input.variant,
          customName: input.customName,
          userNickname: input.userNickname,
          companionStyle: input.companionStyle,
          isHatched: true,
          level: 1,
          guideStep: 10,
          updatedAt: new Date(),
        }).where(eq(userSprites.userId, ctx.userId));
      } else {
        await db.insert(userSprites).values({
          userId: ctx.userId,
          species: input.species,
          variant: input.variant,
          customName: input.customName,
          userNickname: input.userNickname,
          companionStyle: input.companionStyle,
          isHatched: true,
          level: 1,
          guideStep: 10,
        });
      }

      return { ok: true };
    }),

  // 每日签到
  checkin: protectedProcedure.mutation(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const CHECKIN_BEANS = 10;

    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

    // 检查今天是否已签到
    if (sprite.lastActiveDate) {
      const lastDate = new Date(sprite.lastActiveDate);
      lastDate.setHours(0, 0, 0, 0);
      if (lastDate.getTime() === today.getTime()) {
        return { ok: true, alreadyCheckedIn: true };
      }
    }

    const newBalance = (sprite.beanBalance ?? 0) + CHECKIN_BEANS;

    await db.update(userSprites).set({
      totalActiveDays: (sprite.totalActiveDays ?? 0) + 1,
      beanBalance: newBalance,
      lastActiveDate: today,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));

    return { ok: true, newTotalDays: (sprite.totalActiveDays ?? 0) + 1, rewardBeans: CHECKIN_BEANS };
  }),

  // 测试升级：增加 bonusDays 触发等级变化（开发用）
  testLevelUp: protectedProcedure.mutation(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

    const totalDays = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0);
    let currentLevel = 1;
    for (let lvl = 9; lvl >= 1; lvl--) {
      if (totalDays >= LEVEL_DAYS[lvl]) { currentLevel = lvl; break; }
    }

    // 直接设置到下一等级所需天数
    const nextLevel = Math.min(currentLevel + 1, 9);
    const targetDays = LEVEL_DAYS[nextLevel] ?? 365;

    await db.update(userSprites).set({
      totalActiveDays: targetDays - (sprite.bonusDays ?? 0),
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));

    return { ok: true, oldLevel: currentLevel, newLevel: nextLevel };
  }),

  // 保存位置
  setPosition: protectedProcedure
    .input(z.object({ x: z.number(), y: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(userSprites).set({
        positionX: input.x,
        positionY: input.y,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, ctx.userId));
      return { ok: true };
    }),

  // 获取形象图片
  getImages: publicProcedure
    .input(z.object({ species: z.string(), variant: z.string(), level: z.number().default(1) }))
    .query(async ({ input }) => {
      // 优先查 art_assets
      const [asset] = await db.select({
        storagePath: artAssets.storagePath,
        cdnUrl: artAssets.cdnUrl,
      }).from(artAssets)
        .where(and(
          eq(artAssets.category, 'character'),
          eq(artAssets.assetKey, `character/${input.variant}/L${input.level}`),
          eq(artAssets.isPublished, true),
          eq(artAssets.isActive, true),
        ))
        .orderBy(desc(artAssets.version))
        .limit(1);

      if (asset) {
        return { imageUrl: asset.cdnUrl || `/assets/sprites/${asset.storagePath}` };
      }

      // 回退到 sprite_images
      const [img] = await db.select()
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, input.species),
          eq(spriteImages.variant, input.variant),
          eq(spriteImages.level, input.level),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);
      return { imageUrl: img?.imageUrl || null };
    }),

  // 推进引导
  advanceGuide: protectedProcedure.mutation(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite) throw new Error('精灵不存在');

    const nextStep = Math.min((sprite.guideStep ?? 0) + 1, 10);
    await db.update(userSprites).set({
      guideStep: nextStep,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));

    return { step: nextStep };
  }),

  // 跳过引导
  skipGuide: protectedProcedure.mutation(async ({ ctx }) => {
    await db.update(userSprites).set({
      guideStep: 10,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));
    return { ok: true };
  }),

  // 领取引导奖励（奖励 100 精灵豆）
  claimGuideReward: protectedProcedure.mutation(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite || (sprite.guideStep ?? 0) < 10) throw new Error('引导未完成');

    // 检查是否已领取（用 beanBalance 记录过奖励来判断）
    if ((sprite.beanBalance ?? 0) >= 100 && (sprite.totalBeanSpent ?? 0) === 0 && sprite.bonusDays === 0) {
      // 可能是已领取过的新用户，检查是否是初始状态
    }

    const GUIDE_REWARD_BEANS = 100;
    const newBalance = (sprite.beanBalance ?? 0) + GUIDE_REWARD_BEANS;

    await db.update(userSprites).set({
      beanBalance: newBalance,
      isHatched: true,
      level: 1,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));

    return { beanBalance: newBalance, rewardBeans: GUIDE_REWARD_BEANS };
  }),

  // 根据当前引导步骤返回推荐导航路径
  navigateGuideStep: protectedProcedure.query(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite) return { step: 0, navigateTo: null };

    const step = sprite.guideStep ?? 0;
    const stepPaths: Record<number, string | null> = {
      0: '/dashboard',
      1: '/dashboard',
      2: '/dashboard',
      3: '/project/new',
      4: null, // needs project ID
      5: null,
      6: null,
      7: null,
      8: '/marketplace',
      9: '/dashboard',
    };
    return { step, navigateTo: stepPaths[step] ?? null };
  }),

  // 首次发现秘密商城
  foundSecretShop: protectedProcedure.mutation(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite) return { hasEasterEgg: false };
    if (sprite.secretShopFound) return { hasEasterEgg: false };

    await db.update(userSprites).set({
      secretShopFound: true,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, ctx.userId));

    return { hasEasterEgg: true };
  }),

  // 管理员回退精灵等级（测试用）
  adminResetLevel: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      level: z.number().min(1).max(9),
    }))
    .mutation(async ({ input }) => {
      const targetDays = LEVEL_DAYS[input.level] || 0;
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite) throw new Error('该用户尚未孵化精灵');

      await db.update(userSprites).set({
        totalActiveDays: targetDays,
        bonusDays: 0,
        totalXp: 0,
        totalBeanSpent: 0,
        convertedDays: 0,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, input.userId));

      return { ok: true, newTotalDays: targetDays };
    }),

  // 管理员生成精灵形象
  adminGenerateImage: adminProcedure
    .input(z.object({
      species: z.string(),
      variant: z.string(),
      level: z.number().min(1).max(9),
      prompt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const params: SpriteImageParams = {
        species: input.species,
        variant: input.variant,
        level: input.level,
        customPrompt: input.prompt,
      };

      const imageUrl = await generateSpriteImage(params);

      // 检查是否已存在
      const [existing] = await db.select()
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, input.species),
          eq(spriteImages.variant, input.variant),
          eq(spriteImages.level, input.level),
        ));

      if (existing) {
        await db.update(spriteImages).set({
          imageUrl,
          promptUsed: params.fullPrompt,
        }).where(eq(spriteImages.id, existing.id));
      } else {
        await db.insert(spriteImages).values({
          species: input.species,
          variant: input.variant,
          level: input.level,
          imageUrl,
          promptUsed: params.fullPrompt,
        });
      }

      return { ok: true, imageUrl };
    }),

  // 获取系别配置
  getSpeciesConfig: publicProcedure.query(() => {
    return SPECIES_CONFIG;
  }),

  // 管理员查看所有用户精灵
  adminListSprites: adminProcedure.query(async () => {
    const sprites = await db.select()
      .from(userSprites)
      .orderBy(desc(userSprites.createdAt));

    // 批量查询用户信息
    const userIds = sprites.map(s => s.userId);
    const userList = userIds.length > 0
      ? await db.select({ id: users.id, nickname: users.nickname, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(${userIds})`)
      : [];

    const userMap = new Map(userList.map(u => [u.id, u]));

    // 获取所有形象
    const images = await db.select().from(spriteImages).where(eq(spriteImages.isActive, true));
    const imageMap = new Map<string, string>();
    for (const img of images) {
      imageMap.set(`${img.species}-${img.variant}-${img.level}`, img.imageUrl);
    }

    return sprites.map(s => {
      const totalDays = (s.totalActiveDays ?? 0) + (s.bonusDays ?? 0);
      const totalXp = s.totalXp ?? 0;
      let xpLevel = getLevelByXp(totalXp);
      let daysLevel = 1;
      for (let lvl = 9; lvl >= 1; lvl--) {
        if (totalDays >= LEVEL_DAYS[lvl]) { daysLevel = lvl; break; }
      }
      const currentLevel = Math.min(xpLevel, daysLevel);
      const imageKey = `${s.species}-${s.variant}-${currentLevel}`;
      return {
        ...s,
        user: userMap.get(s.userId) || null,
        currentLevel,
        totalDays,
        imageUrl: imageMap.get(imageKey) || null,
      };
    });
  }),

  // 管理员修改精灵（等级/形象/系别等）
  adminUpdateSprite: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      level: z.number().min(1).max(9).optional(),
      species: z.string().optional(),
      variant: z.string().optional(),
      bonusDays: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite) throw new Error('该用户尚未孵化精灵');

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.level != null) {
        updates.totalActiveDays = LEVEL_DAYS[input.level] || 0;
        updates.bonusDays = 0;
      }
      if (input.species != null) updates.species = input.species;
      if (input.variant != null) updates.variant = input.variant;
      if (input.bonusDays != null) updates.bonusDays = input.bonusDays;

      await db.update(userSprites).set(updates as any)
        .where(eq(userSprites.userId, input.userId));

      return { ok: true };
    }),

  // 获取可购买道具列表
  getItems: publicProcedure.query(async () => {
    const items = await db.select()
      .from(spriteItems)
      .where(eq(spriteItems.isActive, true));
    return items;
  }),

  // 购买道具（购买即消费精灵豆）
  buyItem: protectedProcedure
    .input(z.object({ itemCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

      // 获取道具信息
      const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.itemCode));
      if (!item) throw new Error('道具不存在');
      if (!item.isActive) throw new Error('道具已下架');

      // 检查余额
      if ((sprite.beanBalance ?? 0) < item.price) {
        throw new Error('精灵豆余额不足');
      }

      // 扣除余额，增加消费记录，增加道具数量
      await db.transaction(async (tx) => {
        await tx.update(userSprites).set({
          beanBalance: (sprite.beanBalance ?? 0) - item.price,
          totalBeanSpent: (sprite.totalBeanSpent ?? 0) + item.price,
          updatedAt: new Date(),
        }).where(eq(userSprites.userId, ctx.userId));

        const [userItem] = await tx.select().from(userSpriteItems)
          .where(and(eq(userSpriteItems.userId, ctx.userId), eq(userSpriteItems.itemCode, input.itemCode)));

        if (userItem) {
          await tx.update(userSpriteItems).set({
            quantity: (userItem.quantity ?? 0) + 1,
            updatedAt: new Date(),
          }).where(eq(userSpriteItems.id, userItem.id));
        } else {
          await tx.insert(userSpriteItems).values({
            userId: ctx.userId,
            itemCode: input.itemCode,
            quantity: 1,
          });
        }
      });

      return { ok: true, itemName: item.name, itemIcon: item.icon };
    }),

  // 兑换精灵豆为 VIP 时长
  convertBeanToDays: protectedProcedure
    .input(z.object({ days: z.number().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

      const totalBeanSpent = sprite.totalBeanSpent ?? 0;
      const convertedDays = sprite.convertedDays ?? 0;
      const availableDays = getConvertibleDays(totalBeanSpent, convertedDays);

      if (availableDays <= 0) throw new Error('暂无可兑换天数');

      const newDays = input.days ? Math.min(input.days, availableDays) : availableDays;

      await db.update(userSprites).set({
        convertedDays: convertedDays + newDays,
        bonusDays: (sprite.bonusDays ?? 0) + newDays,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, ctx.userId));

      return { ok: true, newDays, remainingDays: availableDays - newDays };
    }),

  // 管理员赠送精灵豆（测试用，赠送不计入消费）
  adminGrantBeans: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      beans: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite) throw new Error('该用户尚未孵化精灵');

      await db.update(userSprites).set({
        beanBalance: (sprite.beanBalance ?? 0) + input.beans,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, input.userId));

      return { ok: true, newBalance: (sprite.beanBalance ?? 0) + input.beans };
    }),

  // 获取用户道具仓库
  getMyItems: protectedProcedure.query(async ({ ctx }) => {
    const items = await db.select()
      .from(userSpriteItems)
      .where(eq(userSpriteItems.userId, ctx.userId));

    // 获取道具详情
    const itemCodes = items.map(i => i.itemCode);
    const itemDetails = itemCodes.length > 0
      ? await db.select().from(spriteItems).where(sql`${spriteItems.code} = ANY(${itemCodes})`)
      : [];

    const detailMap = new Map(itemDetails.map(d => [d.code, d]));

    return items.map(i => ({
      ...i,
      detail: detailMap.get(i.itemCode) || null,
    }));
  }),

  // ===== 管理员：精灵测试 =====

  // 管理员设置精灵等级（升级/降级）
  adminSetSpriteLevel: adminProcedure
    .input(z.object({ userId: z.string().uuid(), level: z.number().min(0).max(9) }))
    .mutation(async ({ input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite?.isHatched) throw new Error('该用户尚未孵化精灵');

      const targetDays = LEVEL_DAYS[input.level] || 0;
      // 根据新等级计算需要的累计经验值
      const LEVEL_XP: Record<number, number> = { 1: 100, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600, 7: 700, 8: 800, 9: 1000 };
      let targetXp = 0;
      for (let lvl = 1; lvl < input.level; lvl++) {
        targetXp += LEVEL_XP[lvl] || 0;
      }

      await db.update(userSprites).set({
        totalActiveDays: targetDays,
        bonusDays: 0,
        totalXp: targetXp,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, input.userId));

      return { ok: true, newLevel: input.level, totalDays: targetDays, totalXp: targetXp };
    }),

  // 管理员给自己发放测试道具（购买并放入仓库）
  adminGrantTestItems: adminProcedure
    .input(z.object({ itemCodes: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

      const items = await db.select().from(spriteItems).where(inArray(spriteItems.code, input.itemCodes));
      const totalCost = items.reduce((sum, i) => sum + (i.price ?? 0), 0);

      if ((sprite.beanBalance ?? 0) < totalCost) throw new Error('精灵豆余额不足（管理员可先用 adminGrantBeans 充值）');

      await db.transaction(async (tx) => {
        const newBalance = (sprite.beanBalance ?? 0) - totalCost;
        await tx.update(userSprites).set({
          beanBalance: newBalance,
          totalBeanSpent: (sprite.totalBeanSpent ?? 0) + totalCost,
          totalXp: (sprite.totalXp ?? 0) + totalCost,
          updatedAt: new Date(),
        }).where(eq(userSprites.userId, ctx.userId));

        for (const item of items) {
          const [userItem] = await tx.select().from(userSpriteItems)
            .where(and(eq(userSpriteItems.userId, ctx.userId), eq(userSpriteItems.itemCode, item.code)));
          if (userItem) {
            await tx.update(userSpriteItems).set({ quantity: (userItem.quantity ?? 0) + 1 }).where(eq(userSpriteItems.id, userItem.id));
          } else {
            await tx.insert(userSpriteItems).values({ userId: ctx.userId, itemCode: item.code, quantity: 1 });
          }
        }
      });

      return { ok: true, granted: items.map(i => i.name) };
    }),

  // 使用道具
  useItem: protectedProcedure
    .input(z.object({ itemCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

      const [userItem] = await db.select().from(userSpriteItems)
        .where(and(eq(userSpriteItems.userId, ctx.userId), eq(userSpriteItems.itemCode, input.itemCode)));

      if (!userItem || (userItem.quantity ?? 0) <= 0) throw new Error('道具数量不足');

      const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.itemCode));
      if (!item) throw new Error('道具不存在');

      // 扣除道具数量，增加 bonusDays
      await db.transaction(async (tx) => {
        await tx.update(userSpriteItems).set({
          quantity: (userItem.quantity ?? 0) - 1,
          updatedAt: new Date(),
        }).where(eq(userSpriteItems.id, userItem.id));

        // 将道具效果（分钟）转换为天数（1天 = 1440分钟），不足1天按1天算
        const daysToAdd = Math.max(1, Math.ceil(item.effectMinutes / 1440));
        await tx.update(userSprites).set({
          bonusDays: (sprite.bonusDays ?? 0) + daysToAdd,
          updatedAt: new Date(),
        }).where(eq(userSprites.userId, ctx.userId));
      });

      return { ok: true, itemName: item.name, daysAdded: Math.max(1, Math.ceil(item.effectMinutes / 1440)), xpGained: item.price };
    }),

  // ===== AI 交互路由 =====

  // 获取精灵交互状态（增强版 getStatus）
  getSpriteStatus: protectedProcedure.query(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite) return { hasSprite: false };

    const totalDays = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0);
    const totalXp = sprite.totalXp ?? 0;

    // 双条件升级
    let xpLevel = getLevelByXp(totalXp);
    let daysLevel = 1;
    for (let lvl = 9; lvl >= 1; lvl--) {
      if (totalDays >= LEVEL_DAYS[lvl]) { daysLevel = lvl; break; }
    }
    const currentLevel = Math.min(xpLevel, daysLevel);

    const [img] = await db.select()
      .from(spriteImages)
      .where(and(
        eq(spriteImages.species, sprite.species || 'unknown'),
        eq(spriteImages.variant, sprite.variant || 'unknown'),
        eq(spriteImages.level, currentLevel),
        eq(spriteImages.isActive, true),
      ))
      .limit(1);

    // 获取疲劳度（最新记录）
    const [latestLog] = await db.select({
      fatigueLevel: spriteInteractionLog.fatigueLevel,
      createdAt: spriteInteractionLog.createdAt,
    }).from(spriteInteractionLog)
      .where(eq(spriteInteractionLog.userId, ctx.userId))
      .orderBy(desc(spriteInteractionLog.createdAt))
      .limit(1);

    // 自然衰减：计算距离上次交互过了多少小时，每小时衰减1点
    let currentFatigue = latestLog?.fatigueLevel ?? 0;
    if (latestLog?.createdAt) {
      const hoursSinceLast = (Date.now() - new Date(latestLog.createdAt).getTime()) / (1000 * 60 * 60);
      currentFatigue = Math.max(0, currentFatigue - Math.floor(hoursSinceLast));
    }

    // 今日是否已触发每日反馈
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [dailyLog] = await db.select({ id: spriteInteractionLog.id })
      .from(spriteInteractionLog)
      .where(and(
        eq(spriteInteractionLog.userId, ctx.userId),
        eq(spriteInteractionLog.actionType, 'daily_feedback'),
        gte(spriteInteractionLog.createdAt, todayStart),
      ))
      .limit(1);

    // 最近一条精灵反馈
    const [recentFeedback] = await db.select({
      content: spriteConversations.content,
      createdAt: spriteConversations.createdAt,
    }).from(spriteConversations)
      .where(and(
        eq(spriteConversations.userId, ctx.userId),
        eq(spriteConversations.role, 'assistant'),
      ))
      .orderBy(desc(spriteConversations.createdAt))
      .limit(1);

    // 冷却时间检查（用户聊天冷却30秒）
    const [recentChat] = await db.select({ createdAt: spriteInteractionLog.createdAt })
      .from(spriteInteractionLog)
      .where(and(
        eq(spriteInteractionLog.userId, ctx.userId),
        eq(spriteInteractionLog.actionType, 'user_chat'),
      ))
      .orderBy(desc(spriteInteractionLog.createdAt))
      .limit(1);
    const chatCooldown = recentChat
      ? (Date.now() - new Date(recentChat.createdAt).getTime()) < 30000
      : false;

    return {
      hasSprite: true,
      isHatched: sprite.isHatched,
      species: sprite.species,
      variant: sprite.variant,
      level: currentLevel,
      customName: sprite.customName,
      userNickname: sprite.userNickname,
      companionStyle: sprite.companionStyle,
      totalActiveDays: sprite.totalActiveDays,
      bonusDays: sprite.bonusDays,
      positionX: sprite.positionX,
      positionY: sprite.positionY,
      guideStep: sprite.guideStep,
      secretShopFound: sprite.secretShopFound,
      imageUrl: null,  // 前端通过 sprite-manifest.json 管理图片路径
      beanBalance: sprite.beanBalance ?? 0,
      totalBeanSpent: sprite.totalBeanSpent ?? 0,
      totalXp,
      convertedDays: sprite.convertedDays ?? 0,
      convertibleDays: getConvertibleDays(sprite.totalBeanSpent ?? 0, sprite.convertedDays ?? 0),
      // AI 交互状态
      fatigueLevel: currentFatigue,
      dailyFeedbackTriggered: !!dailyLog,
      lastFeedback: recentFeedback ? { content: recentFeedback.content, createdAt: recentFeedback.createdAt } : null,
      chatCooldown,
    };
  }),

  // 触发精灵反馈（自动+手动统一入口）
  triggerFeedback: protectedProcedure
    .input(z.object({
      triggerType: z.enum(['daily', 'unit', 'volume', 'manual']),
      content: z.string().optional(),
      entityId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) return { feedback: '', emotionTags: [], usedAI: false };

      // 获取当前疲劳度
      const [latestLog] = await db.select({ fatigueLevel: spriteInteractionLog.fatigueLevel, createdAt: spriteInteractionLog.createdAt })
        .from(spriteInteractionLog)
        .where(eq(spriteInteractionLog.userId, ctx.userId))
        .orderBy(desc(spriteInteractionLog.createdAt))
        .limit(1);

      let currentFatigue = latestLog?.fatigueLevel ?? 0;
      if (latestLog?.createdAt) {
        const hoursSinceLast = (Date.now() - new Date(latestLog.createdAt).getTime()) / (1000 * 60 * 60);
        currentFatigue = Math.max(0, currentFatigue - Math.floor(hoursSinceLast));
      }

      // 疲劳度满，返回休息台词
      if (currentFatigue >= 100) {
        return { feedback: getRestText(), emotionTags: ['sleepy'], usedAI: false };
      }

      // 限流检查
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      if (input.triggerType === 'daily') {
        const [existing] = await db.select({ id: spriteInteractionLog.id })
          .from(spriteInteractionLog)
          .where(and(
            eq(spriteInteractionLog.userId, ctx.userId),
            eq(spriteInteractionLog.actionType, 'daily_feedback'),
            gte(spriteInteractionLog.createdAt, todayStart),
          ))
          .limit(1);
        if (existing) return { feedback: '', emotionTags: [], usedAI: false }; // 今天已触发
      }

      if (input.triggerType === 'unit' || input.triggerType === 'volume') {
        if (input.entityId) {
          const [existing] = await db.select({ id: spriteInteractionLog.id })
            .from(spriteInteractionLog)
            .where(and(
              eq(spriteInteractionLog.userId, ctx.userId),
              eq(spriteInteractionLog.actionType, input.triggerType === 'unit' ? 'unit_feedback' : 'volume_feedback'),
            ))
            .orderBy(desc(spriteInteractionLog.createdAt))
            .limit(1);
          // 简单检查：如果最近一次同类型反馈是针对同一entity，跳过
          // （实际实现需要存储entityId，这里用时间窗口简化）
        }
      }

      if (input.triggerType === 'manual') {
        const [recent] = await db.select({ createdAt: spriteInteractionLog.createdAt })
          .from(spriteInteractionLog)
          .where(and(
            eq(spriteInteractionLog.userId, ctx.userId),
            eq(spriteInteractionLog.actionType, 'manual_feedback'),
          ))
          .orderBy(desc(spriteInteractionLog.createdAt))
          .limit(1);
        if (recent && (Date.now() - new Date(recent.createdAt).getTime()) < 300000) { // 5分钟冷却
          return { feedback: '精灵还在想刚才的事呢～', emotionTags: ['thinking'], usedAI: false };
        }
      }

      // 确定反馈内容
      const feedbackContent = input.content || '用户正在写作中……';

      // 调用AI生成反馈
      const spriteInfo = {
        customName: sprite.customName,
        species: sprite.species,
        variant: sprite.variant,
        companionStyle: sprite.companionStyle,
        userNickname: sprite.userNickname,
      };

      const result = await generateFeedback(ctx.userId, feedbackContent, spriteInfo);

      // 计算新疲劳度
      const newFatigue = Math.min(100, currentFatigue + 15);

      // 记录到 sprite_conversations
      const sortOrder = await db.select({ count: sql<number>`count(*)::int` })
        .from(spriteConversations)
        .where(eq(spriteConversations.userId, ctx.userId));

      await db.insert(spriteConversations).values({
        userId: ctx.userId,
        role: 'system',
        content: `用户完成了${input.triggerType}触发`,
        sortOrder: sortOrder[0]?.count ?? 0,
      });

      await db.insert(spriteConversations).values({
        userId: ctx.userId,
        role: 'assistant',
        content: result.feedback,
        sortOrder: (sortOrder[0]?.count ?? 0) + 1,
      });

      // 记录到交互日志
      await db.insert(spriteInteractionLog).values({
        userId: ctx.userId,
        actionType: input.triggerType === 'daily' ? 'daily_feedback'
          : input.triggerType === 'unit' ? 'unit_feedback'
            : input.triggerType === 'volume' ? 'volume_feedback' : 'manual_feedback',
        aiUsed: result.usedAI,
        tokenCount: result.usedAI ? 200 : 0,
        fatigueLevel: newFatigue,
      });

      return {
        feedback: result.feedback,
        emotionTags: result.emotionTags,
        usedAI: result.usedAI,
      };
    }),

  // 和精灵对话
  chatWithSprite: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

      // 获取疲劳度
      const [latestLog] = await db.select({ fatigueLevel: spriteInteractionLog.fatigueLevel, createdAt: spriteInteractionLog.createdAt })
        .from(spriteInteractionLog)
        .where(eq(spriteInteractionLog.userId, ctx.userId))
        .orderBy(desc(spriteInteractionLog.createdAt))
        .limit(1);

      let currentFatigue = latestLog?.fatigueLevel ?? 0;
      if (latestLog?.createdAt) {
        const hoursSinceLast = (Date.now() - new Date(latestLog.createdAt).getTime()) / (1000 * 60 * 60);
        currentFatigue = Math.max(0, currentFatigue - Math.floor(hoursSinceLast));
      }

      // 疲劳度满
      if (currentFatigue >= 100) {
        return { reply: getRestText(), usedAI: false };
      }

      // 冷却检查（30秒）
      const [recentChat] = await db.select({ createdAt: spriteInteractionLog.createdAt })
        .from(spriteInteractionLog)
        .where(and(
          eq(spriteInteractionLog.userId, ctx.userId),
          eq(spriteInteractionLog.actionType, 'user_chat'),
        ))
        .orderBy(desc(spriteInteractionLog.createdAt))
        .limit(1);

      if (recentChat && (Date.now() - new Date(recentChat.createdAt).getTime()) < 30000) {
        return { reply: '精灵还在想刚才的事呢～', usedAI: false };
      }

      // 获取最近聊天历史（最近10条，用于上下文）
      const history = await db.select({
        role: spriteConversations.role,
        content: spriteConversations.content,
      }).from(spriteConversations)
        .where(and(
          eq(spriteConversations.userId, ctx.userId),
          inArray(spriteConversations.role, ['user', 'assistant']),
        ))
        .orderBy(desc(spriteConversations.createdAt))
        .limit(10);

      const spriteInfo = {
        customName: sprite.customName,
        species: sprite.species,
        variant: sprite.variant,
        companionStyle: sprite.companionStyle,
        userNickname: sprite.userNickname,
      };

      const result = await chatWithSprite(
        ctx.userId,
        input.message,
        spriteInfo,
        history.reverse().map(h => ({ role: h.role, content: h.content })),
      );

      // 新疲劳度
      const newFatigue = Math.min(100, currentFatigue + 20);

      // 记录对话
      const sortOrder = await db.select({ count: sql<number>`count(*)::int` })
        .from(spriteConversations)
        .where(eq(spriteConversations.userId, ctx.userId));

      await db.insert(spriteConversations).values({
        userId: ctx.userId,
        role: 'user',
        content: input.message,
        sortOrder: sortOrder[0]?.count ?? 0,
      });

      await db.insert(spriteConversations).values({
        userId: ctx.userId,
        role: 'assistant',
        content: result.reply,
        sortOrder: (sortOrder[0]?.count ?? 0) + 1,
      });

      // 记录交互日志
      await db.insert(spriteInteractionLog).values({
        userId: ctx.userId,
        actionType: 'user_chat',
        aiUsed: result.usedAI,
        tokenCount: result.usedAI ? 100 : 0,
        fatigueLevel: newFatigue,
      });

      return { reply: result.reply, usedAI: result.usedAI };
    }),

  // 重置疲劳度
  resetFatigue: protectedProcedure.mutation(async ({ ctx }) => {
    await db.insert(spriteInteractionLog).values({
      userId: ctx.userId,
      actionType: 'user_chat',
      aiUsed: false,
      tokenCount: 0,
      fatigueLevel: 0,
    });

    return { ok: true, fatigueLevel: 0 };
  }),

  // 获取聊天历史（最近20条）
  getSpriteChatHistory: protectedProcedure.query(async ({ ctx }) => {
    const messages = await db.select({
      id: spriteConversations.id,
      role: spriteConversations.role,
      content: spriteConversations.content,
      createdAt: spriteConversations.createdAt,
    }).from(spriteConversations)
      .where(eq(spriteConversations.userId, ctx.userId))
      .orderBy(desc(spriteConversations.createdAt))
      .limit(20);

    return messages.reverse(); // 按时间正序返回
  }),

  // ===== 管理员测试路由 =====

  // 管理员测试购买道具（给用户精灵添加道具库存）
  adminTestBuyItem: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      itemCode: z.string(),
      quantity: z.number().min(1).default(1),
    }))
    .mutation(async ({ input }) => {
      const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.itemCode));
      if (!item) throw new Error('道具不存在');

      const [userItem] = await db.select().from(userSpriteItems)
        .where(and(eq(userSpriteItems.userId, input.userId), eq(userSpriteItems.itemCode, input.itemCode)));

      if (userItem) {
        await db.update(userSpriteItems).set({
          quantity: (userItem.quantity ?? 0) + input.quantity,
          updatedAt: new Date(),
        }).where(eq(userSpriteItems.id, userItem.id));
      } else {
        await db.insert(userSpriteItems).values({
          userId: input.userId,
          itemCode: input.itemCode,
          quantity: input.quantity,
        });
      }

      return {
        ok: true,
        itemName: item.name,
        itemIcon: item.icon,
        newQuantity: (userItem?.quantity ?? 0) + input.quantity,
      };
    }),

  // 管理员测试使用道具（触发效果，返回动画信息）
  adminTestUseItem: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      itemCode: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite?.isHatched) throw new Error('该用户精灵尚未孵化');

      const [userItem] = await db.select().from(userSpriteItems)
        .where(and(eq(userSpriteItems.userId, input.userId), eq(userSpriteItems.itemCode, input.itemCode)));
      if (!userItem || (userItem.quantity ?? 0) <= 0) throw new Error('道具数量不足');

      const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.itemCode));
      if (!item) throw new Error('道具不存在');

      // 扣除道具
      await db.update(userSpriteItems).set({
        quantity: (userItem.quantity ?? 0) - 1,
        updatedAt: new Date(),
      }).where(eq(userSpriteItems.id, userItem.id));

      // 应用效果
      const effects: string[] = [];
      if (item.effectMinutes > 0) {
        const daysToAdd = Math.max(1, Math.ceil(item.effectMinutes / 1440));
        await db.update(userSprites).set({
          bonusDays: (sprite.bonusDays ?? 0) + daysToAdd,
          updatedAt: new Date(),
        }).where(eq(userSprites.userId, input.userId));
        effects.push(`成长值 +${daysToAdd} 天`);
      }

      // 计算新旧等级
      const oldTotal = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0) - (item.effectMinutes > 0 ? Math.max(1, Math.ceil(item.effectMinutes / 1440)) : 0);
      const newTotal = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0) + (item.effectMinutes > 0 ? Math.max(1, Math.ceil(item.effectMinutes / 1440)) : 0);

      let oldLevel = 1;
      for (let lvl = 9; lvl >= 1; lvl--) { if (oldTotal >= LEVEL_DAYS[lvl]) { oldLevel = lvl; break; } }
      let newLevel = 1;
      for (let lvl = 9; lvl >= 1; lvl--) { if (newTotal >= LEVEL_DAYS[lvl]) { newLevel = lvl; break; } }

      // 获取新旧形象图片
      const [oldImg] = await db.select({ imageUrl: spriteImages.imageUrl })
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, sprite.species || 'unknown'),
          eq(spriteImages.variant, sprite.variant || 'unknown'),
          eq(spriteImages.level, oldLevel),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);

      const [newImg] = await db.select({ imageUrl: spriteImages.imageUrl })
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, sprite.species || 'unknown'),
          eq(spriteImages.variant, sprite.variant || 'unknown'),
          eq(spriteImages.level, newLevel),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);

      return {
        ok: true,
        itemName: item.name,
        itemIcon: item.icon,
        effects,
        oldLevel,
        newLevel,
        upgraded: newLevel > oldLevel,
        oldImageUrl: oldImg?.imageUrl || null,
        newImageUrl: newImg?.imageUrl || null,
        remainingQuantity: (userItem.quantity ?? 0) - 1,
      };
    }),

  // 管理员测试升级（直接设置等级，触发升级动画）
  adminTestUpgrade: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      targetLevel: z.number().min(0).max(9),
    }))
    .mutation(async ({ input }) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite) throw new Error('该用户尚无精灵');

      const oldTotal = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0);
      let oldLevel = input.targetLevel === 0 ? 0 : 1;
      for (let lvl = 9; lvl >= 1; lvl--) { if (oldTotal >= LEVEL_DAYS[lvl]) { oldLevel = lvl; break; } }

      const targetDays = input.targetLevel === 0 ? 0 : (LEVEL_DAYS[input.targetLevel] || 0);

      await db.update(userSprites).set({
        totalActiveDays: targetDays,
        bonusDays: 0,
        updatedAt: new Date(),
      }).where(eq(userSprites.userId, input.userId));

      // 获取新旧形象
      const [oldImg] = await db.select({ imageUrl: spriteImages.imageUrl })
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, sprite.species || 'unknown'),
          eq(spriteImages.variant, sprite.variant || 'unknown'),
          eq(spriteImages.level, input.targetLevel === 0 ? 0 : oldLevel),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);

      const [newImg] = await db.select({ imageUrl: spriteImages.imageUrl })
        .from(spriteImages)
        .where(and(
          eq(spriteImages.species, sprite.species || 'unknown'),
          eq(spriteImages.variant, sprite.variant || 'unknown'),
          eq(spriteImages.level, input.targetLevel),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);

      return {
        ok: true,
        oldLevel,
        newLevel: input.targetLevel,
        oldImageUrl: oldImg?.imageUrl || null,
        newImageUrl: newImg?.imageUrl || null,
        isHatching: !sprite.isHatched || oldLevel === 0,
      };
    }),

  // 管理员获取测试用户列表（预设的测试精灵用户）
  adminGetTestUsers: adminProcedure.query(async () => {
    const testEmails = ['test_sunflower@test.com', 'test_fox@test.com', 'test_wind@test.com'];
    const userList = await db.select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
    }).from(users)
      .where(sql`${users.email} = ANY(${testEmails})`);

    // 获取每个用户的精灵和道具
    return Promise.all(userList.map(async (u) => {
      const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, u.id));
      const items = await db.select().from(userSpriteItems).where(eq(userSpriteItems.userId, u.id));

      const totalDays = sprite ? ((sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0)) : 0;
      let level = sprite ? 1 : 0;
      if (sprite) {
        for (let lvl = 9; lvl >= 1; lvl--) {
          if (totalDays >= LEVEL_DAYS[lvl]) { level = lvl; break; }
        }
      }

      return {
        userId: u.id,
        email: u.email,
        nickname: u.nickname,
        sprite: sprite ? {
          species: sprite.species,
          variant: sprite.variant,
          customName: sprite.customName,
          level,
          totalDays,
          isHatched: sprite.isHatched,
        } : null,
        items: items.map(i => ({ code: i.itemCode, quantity: i.quantity })),
      };
    }));
  }),

  // ========== 管理员：商城道具管理 ==========

  // 获取所有道具（含已下架）+ 销售数据
  adminListItems: adminProcedure.query(async () => {
    const items = await db.select().from(spriteItems).orderBy(spriteItems.species, spriteItems.price);

    // 计算每个道具的销售数据
    const itemsWithSales = await Promise.all(items.map(async (item) => {
      // 总销售量
      const [totalResult] = await db.select({
        totalQty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0) * ${item.price}`,
      }).from(userSpriteItems).where(eq(userSpriteItems.itemCode, item.code));

      // 今日销售
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [todayResult] = await db.select({
        qty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0) * ${item.price}`,
      }).from(userSpriteItems).where(and(eq(userSpriteItems.itemCode, item.code), gte(userSpriteItems.updatedAt, today)));

      // 本月销售
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [monthResult] = await db.select({
        qty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0) * ${item.price}`,
      }).from(userSpriteItems).where(and(eq(userSpriteItems.itemCode, item.code), gte(userSpriteItems.updatedAt, monthStart)));

      return {
        ...item,
        totalSales: totalResult?.totalQty || 0,
        totalRevenue: totalResult?.totalRevenue || 0,
        todaySales: todayResult?.qty || 0,
        todayRevenue: todayResult?.revenue || 0,
        monthSales: monthResult?.qty || 0,
        monthRevenue: monthResult?.revenue || 0,
      };
    }));

    return itemsWithSales;
  }),

  // 商城销售总统计
  adminSalesStats: adminProcedure.query(async () => {
    const [totalResult] = await db.select({
      totalQty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
    }).from(userSpriteItems);

    // 获取所有道具价格
    const items = await db.select({ code: spriteItems.code, price: spriteItems.price }).from(spriteItems);
    const priceMap = new Map(items.map(i => [i.code, i.price]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayResult] = await db.select({
      qty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
    }).from(userSpriteItems).where(gte(userSpriteItems.updatedAt, today));

    const [monthResult] = await db.select({
      qty: sql<number>`COALESCE(SUM(${userSpriteItems.quantity}), 0)`,
    }).from(userSpriteItems).where(gte(userSpriteItems.updatedAt, monthStart));

    // 计算总收入（需要从 user_sprite_items 按 itemCode 分组，关联 sprite_items 价格）
    const allSales = await db.select({
      itemCode: userSpriteItems.itemCode,
      qty: sql<number>`SUM(${userSpriteItems.quantity})`,
    }).from(userSpriteItems).groupBy(userSpriteItems.itemCode);

    let totalRevenue = 0;
    let todayRevenue = 0;
    let monthRevenue = 0;

    for (const sale of allSales) {
      const price = priceMap.get(sale.itemCode) || 0;
      totalRevenue += (sale.qty || 0) * price;
    }

    const todaySales = await db.select({
      itemCode: userSpriteItems.itemCode,
      qty: sql<number>`SUM(${userSpriteItems.quantity})`,
    }).from(userSpriteItems).where(gte(userSpriteItems.updatedAt, today)).groupBy(userSpriteItems.itemCode);

    for (const sale of todaySales) {
      const price = priceMap.get(sale.itemCode) || 0;
      todayRevenue += (sale.qty || 0) * price;
    }

    const monthSales = await db.select({
      itemCode: userSpriteItems.itemCode,
      qty: sql<number>`SUM(${userSpriteItems.quantity})`,
    }).from(userSpriteItems).where(gte(userSpriteItems.updatedAt, monthStart)).groupBy(userSpriteItems.itemCode);

    for (const sale of monthSales) {
      const price = priceMap.get(sale.itemCode) || 0;
      monthRevenue += (sale.qty || 0) * price;
    }

    return {
      totalSales: totalResult?.totalQty || 0,
      totalRevenue,
      todaySales: todayResult?.qty || 0,
      todayRevenue,
      monthSales: monthResult?.qty || 0,
      monthRevenue,
    };
  }),

  // 创建道具
  adminCreateItem: adminProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      icon: z.string().max(10),
      species: z.enum(['plant', 'animal', 'element']),
      price: z.number().min(0),
      effectMinutes: z.number().min(0),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select({ id: spriteItems.id }).from(spriteItems).where(eq(spriteItems.code, input.code));
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: '道具代码已存在' });

      const [item] = await db.insert(spriteItems).values({
        code: input.code,
        name: input.name,
        icon: input.icon,
        species: input.species,
        price: input.price,
        effectMinutes: input.effectMinutes,
        description: input.description || '',
        isActive: true,
      }).returning();

      return item;
    }),

  // 修改道具
  adminUpdateItem: adminProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(100).optional(),
      icon: z.string().max(10).optional(),
      species: z.enum(['plant', 'animal', 'element']).optional(),
      price: z.number().min(0).optional(),
      effectMinutes: z.number().min(0).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { code, ...updates } = input;
      const [existing] = await db.select().from(spriteItems).where(eq(spriteItems.code, code));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '道具不存在' });

      const [item] = await db.update(spriteItems).set(updates).where(eq(spriteItems.code, code)).returning();
      return item;
    }),

  // 上架/下架道具
  adminToggleItemActive: adminProcedure
    .input(z.object({ code: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.code));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '道具不存在' });

      const [item] = await db.update(spriteItems).set({ isActive: input.isActive }).where(eq(spriteItems.code, input.code)).returning();
      return item;
    }),

  // 删除道具
  adminDeleteItem: adminProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(spriteItems).where(eq(spriteItems.code, input.code));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '道具不存在' });

      await db.delete(spriteItems).where(eq(spriteItems.code, input.code));
      return { ok: true };
    }),

  // ========== 美术资产公开读取 ==========

  getAsset: publicProcedure
    .input(z.object({
      category: z.string(),
      assetKey: z.string(),
    }))
    .query(async ({ input }) => {
      const [asset] = await db.select({
        storagePath: artAssets.storagePath,
        cdnUrl: artAssets.cdnUrl,
        fileFormat: artAssets.fileFormat,
        width: artAssets.width,
        height: artAssets.height,
      }).from(artAssets)
        .where(and(
          eq(artAssets.category, input.category),
          eq(artAssets.assetKey, input.assetKey),
          eq(artAssets.isPublished, true),
          eq(artAssets.isActive, true),
        ))
        .orderBy(desc(artAssets.version))
        .limit(1);

      if (!asset) return null;

      // 返回可用的 URL（CDN 优先，否则拼接路径）
      const url = asset.cdnUrl || `/assets/sprites/${asset.storagePath}`;
      return { ...asset, url };
    }),

  getAssets: publicProcedure
    .input(z.object({
      assets: z.array(z.object({
        category: z.string(),
        assetKey: z.string(),
      })),
    }))
    .query(async ({ input }) => {
      // 批量获取多个已发布资产
      const results: Record<string, { url: string; fileFormat: string | null; width: number | null; height: number | null } | null> = {};

      for (const a of input.assets) {
        const key = `${a.category}/${a.assetKey}`;
        const [asset] = await db.select({
          storagePath: artAssets.storagePath,
          cdnUrl: artAssets.cdnUrl,
          fileFormat: artAssets.fileFormat,
          width: artAssets.width,
          height: artAssets.height,
        }).from(artAssets)
          .where(and(
            eq(artAssets.category, a.category),
            eq(artAssets.assetKey, a.assetKey),
            eq(artAssets.isPublished, true),
            eq(artAssets.isActive, true),
          ))
          .orderBy(desc(artAssets.version))
          .limit(1);

        if (asset) {
          results[key] = {
            url: asset.cdnUrl || `/assets/sprites/${asset.storagePath}`,
            fileFormat: asset.fileFormat,
            width: asset.width,
            height: asset.height,
          };
        } else {
          results[key] = null;
        }
      }

      return results;
    }),

  getSpriteImage: publicProcedure
    .input(z.object({
      species: z.string(),
      variant: z.string(),
      level: z.number(),
    }))
    .query(async ({ input }) => {
      // 优先从 art_assets 表取已发布资产
      const [asset] = await db.select({
        storagePath: artAssets.storagePath,
        cdnUrl: artAssets.cdnUrl,
      }).from(artAssets)
        .where(and(
          eq(artAssets.category, 'character'),
          eq(artAssets.assetKey, `character/${input.variant}/L${input.level}`),
          eq(artAssets.isPublished, true),
          eq(artAssets.isActive, true),
        ))
        .orderBy(desc(artAssets.version))
        .limit(1);

      if (asset) {
        return { url: asset.cdnUrl || `/assets/sprites/${asset.storagePath}`, source: 'art_assets' as const };
      }

      // 回退到旧 sprite_images 表
      const [img] = await db.select({
        imageUrl: spriteImages.imageUrl,
      }).from(spriteImages)
        .where(and(
          eq(spriteImages.species, input.species),
          eq(spriteImages.variant, input.variant),
          eq(spriteImages.level, input.level),
          eq(spriteImages.isActive, true),
        ))
        .limit(1);

      if (img) {
        return { url: img.imageUrl, source: 'sprite_images' as const };
      }

      // 最终回退到占位 SVG
      const placeholderPath = `characters/${input.species}/${input.variant}/L${input.level}.svg`;
      return { url: `/assets/sprites/${placeholderPath}`, source: 'placeholder' as const };
    }),
});
