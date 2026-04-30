// 用户API Key管理 — 生成/验证/撤销
import { db } from '../../db';
import { userApiKeys } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * 生成 API Key
 * 格式: sk-{12位随机前缀}-{UUID去掉横线}
 */
export function generateApiKey(): { fullKey: string; keyHash: string; keyPrefix: string } {
  const prefix = crypto.randomBytes(6).toString('base64url').slice(0, 12);
  const uuid = crypto.randomUUID().replace(/-/g, '');
  const fullKey = `sk-${prefix}-${uuid}`;
  const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = `sk-${prefix}`;

  return { fullKey, keyHash, keyPrefix };
}

/**
 * 为用户创建新的 API Key
 */
export async function createKey(userId: string, name: string, rateLimitPerMin = 60) {
  const { fullKey, keyHash, keyPrefix } = generateApiKey();

  await db.insert(userApiKeys).values({
    userId,
    name,
    keyHash,
    keyPrefix,
    rateLimitPerMin,
  });

  return { fullKey, keyHash, keyPrefix };
}

/**
 * 验证 API Key（通过完整Key查找）
 */
export async function verifyKey(fullKey: string) {
  const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');

  const [key] = await db.select()
    .from(userApiKeys)
    .where(eq(userApiKeys.keyHash, keyHash));

  if (!key || key.status !== 'active') return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // 更新最后使用时间
  await db.update(userApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(userApiKeys.id, key.id));

  return key;
}

/**
 * 撤销 API Key
 */
export async function revokeKey(userId: string, keyId: string) {
  const updated = await db.update(userApiKeys)
    .set({ status: 'revoked' })
    .where(and(
      eq(userApiKeys.id, keyId),
      eq(userApiKeys.userId, userId),
    ))
    .returning({ id: userApiKeys.id });

  return { ok: updated.length > 0 };
}

/**
 * 获取用户的 API Keys 列表
 */
export async function listKeys(userId: string) {
  return db.select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
}
