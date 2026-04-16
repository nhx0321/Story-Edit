// 美术资产管理服务
import { eq, and, desc, ilike, or, sql, count as countFn, inArray, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import { artAssets, users } from '../../db/schema';

export interface ListArtAssetsInput {
  category?: string;
  subcategory?: string;
  status?: 'published' | 'unpublished' | 'inactive';
  search?: string;
  page: number;
  limit: number;
}

export async function listArtAssets(input: ListArtAssetsInput) {
  const offset = (input.page - 1) * input.limit;

  const conditions = [];
  if (input.category) conditions.push(eq(artAssets.category, input.category));
  if (input.subcategory) conditions.push(eq(artAssets.subcategory, input.subcategory));
  if (input.status === 'published') conditions.push(eq(artAssets.isPublished, true));
  if (input.status === 'unpublished') conditions.push(eq(artAssets.isPublished, false));
  if (input.status === 'inactive') conditions.push(eq(artAssets.isActive, false));
  if (input.search) {
    const searchClause = or(
      ilike(artAssets.assetKey, `%${input.search}%`),
      ilike(artAssets.name, `%${input.search}%`),
    );
    if (searchClause) conditions.push(searchClause);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ count: countFn() })
    .from(artAssets).where(whereClause);

  const assets = await db.select({
    id: artAssets.id,
    category: artAssets.category,
    subcategory: artAssets.subcategory,
    assetKey: artAssets.assetKey,
    name: artAssets.name,
    description: artAssets.description,
    fileFormat: artAssets.fileFormat,
    width: artAssets.width,
    height: artAssets.height,
    fileSize: artAssets.fileSize,
    storagePath: artAssets.storagePath,
    cdnUrl: artAssets.cdnUrl,
    isPublished: artAssets.isPublished,
    isActive: artAssets.isActive,
    version: artAssets.version,
    createdBy: artAssets.createdBy,
    publishedAt: artAssets.publishedAt,
    createdAt: artAssets.createdAt,
    updatedAt: artAssets.updatedAt,
  }).from(artAssets)
    .where(whereClause)
    .orderBy(desc(artAssets.createdAt))
    .limit(input.limit)
    .offset(offset);

  // 获取创建者昵称
  const creatorIds = [...new Set(assets.map(a => a.createdBy).filter(Boolean))] as string[];
  let creatorUsers: { id: string; nickname: string | null }[] = [];
  if (creatorIds.length > 0) {
    creatorUsers = await db.select({
      id: users.id,
      nickname: users.nickname,
    }).from(users).where(inArray(users.id, creatorIds));
  }
  const creatorMap = new Map(creatorUsers.map(u => [u.id, u.nickname || '未知']));

  return {
    assets: assets.map(a => ({
      ...a,
      creatorName: a.createdBy ? (creatorMap.get(a.createdBy) || '未知') : '系统',
    })),
    total: totalResult?.count || 0,
    page: input.page,
    limit: input.limit,
  };
}

export async function getAssetStats() {
  const [totalResult] = await db.select({ count: countFn() }).from(artAssets);
  const [publishedResult] = await db.select({ count: countFn() }).from(artAssets)
    .where(eq(artAssets.isPublished, true));
  const [unpublishedResult] = await db.select({ count: countFn() }).from(artAssets)
    .where(and(eq(artAssets.isPublished, false), eq(artAssets.isActive, true)));
  const [inactiveResult] = await db.select({ count: countFn() }).from(artAssets)
    .where(eq(artAssets.isActive, false));

  // 各分类数量
  const categoryCounts = await db.select({
    category: artAssets.category,
    count: countFn(),
  }).from(artAssets)
    .where(eq(artAssets.isActive, true))
    .groupBy(artAssets.category);

  return {
    total: totalResult?.count || 0,
    published: publishedResult?.count || 0,
    unpublished: unpublishedResult?.count || 0,
    inactive: inactiveResult?.count || 0,
    byCategory: categoryCounts,
  };
}

export interface CreateArtAssetInput {
  category: string;
  subcategory?: string;
  assetKey: string;
  name: string;
  description?: string;
  fileFormat?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  storagePath: string;
  cdnUrl?: string;
}

export async function createArtAsset(input: CreateArtAssetInput, userId: string, adminLevel: number | null) {
  // 检查是否已存在相同 assetKey 的未发布版本
  const existing = await db.select({ id: artAssets.id, version: artAssets.version })
    .from(artAssets)
    .where(and(
      eq(artAssets.category, input.category),
      eq(artAssets.assetKey, input.assetKey),
      eq(artAssets.isActive, true),
    ))
    .orderBy(desc(artAssets.version));

  const nextVersion = existing.length > 0 ? (existing[0].version || 1) + 1 : 1;

  const [asset] = await db.insert(artAssets).values({
    category: input.category,
    subcategory: input.subcategory || null,
    assetKey: input.assetKey,
    name: input.name,
    description: input.description || null,
    fileFormat: input.fileFormat || null,
    width: input.width || null,
    height: input.height || null,
    fileSize: input.fileSize || null,
    storagePath: input.storagePath,
    cdnUrl: input.cdnUrl || null,
    version: nextVersion,
    createdBy: userId,
    updatedBy: userId,
  }).returning();

  return asset;
}

export async function updateArtAsset(assetId: string, updates: {
  name?: string;
  description?: string;
  storagePath?: string;
  cdnUrl?: string;
  fileFormat?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}, userId: string) {
  const [existing] = await db.select().from(artAssets).where(eq(artAssets.id, assetId));
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '资产不存在' });

  const [asset] = await db.update(artAssets)
    .set({ ...updates, updatedBy: userId, updatedAt: new Date() })
    .where(eq(artAssets.id, assetId))
    .returning();

  return asset;
}

export async function publishAsset(assetId: string, userId: string) {
  const [existing] = await db.select().from(artAssets).where(eq(artAssets.id, assetId));
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '资产不存在' });

  const [asset] = await db.update(artAssets)
    .set({ isPublished: true, publishedAt: new Date(), updatedBy: userId, updatedAt: new Date() })
    .where(eq(artAssets.id, assetId))
    .returning();

  return asset;
}

export async function unpublishAsset(assetId: string, userId: string) {
  const [existing] = await db.select().from(artAssets).where(eq(artAssets.id, assetId));
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '资产不存在' });

  const [asset] = await db.update(artAssets)
    .set({ isPublished: false, updatedBy: userId, updatedAt: new Date() })
    .where(eq(artAssets.id, assetId))
    .returning();

  return asset;
}

export async function deleteAsset(assetId: string, userId: string) {
  const [existing] = await db.select().from(artAssets).where(eq(artAssets.id, assetId));
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '资产不存在' });

  await db.update(artAssets)
    .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
    .where(eq(artAssets.id, assetId));

  return { ok: true };
}

export async function batchPublishAssets(assetIds: string[], userId: string) {
  if (assetIds.length === 0) return { count: 0 };

  await db.update(artAssets)
    .set({ isPublished: true, publishedAt: new Date(), updatedBy: userId, updatedAt: new Date() })
    .where(inArray(artAssets.id, assetIds));

  return { count: assetIds.length };
}

export async function getAssetById(assetId: string) {
  const [asset] = await db.select().from(artAssets).where(eq(artAssets.id, assetId));
  if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: '资产不存在' });
  return asset;
}
