// Token消费记录追踪器
import { db } from '../../db';
import { tokenConsumptionLogs } from '../../db/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

export interface ConsumptionRecord {
  userId: string;
  source: 'in_app' | 'external_api';
  apiKeyId?: string;
  channelId?: string;
  provider: string;
  modelId: string;
  requestType?: string;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cost: number;
  requestId?: string;
  projectId?: string;
  conversationId?: string;
}

/**
 * 写入消费记录
 */
export async function recordConsumption(record: ConsumptionRecord) {
  const [log] = await db.insert(tokenConsumptionLogs).values({
    userId: record.userId,
    source: record.source,
    apiKeyId: record.apiKeyId || null,
    channelId: record.channelId || null,
    provider: record.provider,
    modelId: record.modelId,
    requestType: record.requestType,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheHitTokens: record.cacheHitTokens || 0,
    cost: record.cost,
    requestId: record.requestId,
    projectId: record.projectId || null,
    conversationId: record.conversationId || null,
  }).returning();

  return log;
}

/**
 * 查询用户的消费记录
 */
export async function getUserConsumption(
  userId: string,
  options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {},
) {
  const { limit = 50, offset = 0, startDate, endDate } = options;

  const conditions = [eq(tokenConsumptionLogs.userId, userId)];
  if (startDate) conditions.push(gte(tokenConsumptionLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(tokenConsumptionLogs.createdAt, endDate));

  return db.select()
    .from(tokenConsumptionLogs)
    .where(and(...conditions))
    .orderBy(desc(tokenConsumptionLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * 查询用户的消费统计（按模型汇总）
 */
export async function getUserConsumptionStats(userId: string, startDate?: Date, endDate?: Date) {
  const logs = await getUserConsumption(userId, { limit: 1000, startDate, endDate });

  const byModel: Record<string, { totalCost: number; totalInput: number; totalOutput: number }> = {};
  let totalCost = 0;

  for (const log of logs) {
    const key = `${log.provider}/${log.modelId}`;
    if (!byModel[key]) {
      byModel[key] = { totalCost: 0, totalInput: 0, totalOutput: 0 };
    }
    byModel[key].totalCost += (log.cost ?? 0);
    byModel[key].totalInput += (log.inputTokens ?? 0);
    byModel[key].totalOutput += (log.outputTokens ?? 0);
    totalCost += (log.cost ?? 0);
  }

  return { totalCost, byModel };
}
