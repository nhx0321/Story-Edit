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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [eq(tokenConsumptionLogs.userId, userId)];
  if (startDate) conditions.push(gte(tokenConsumptionLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(tokenConsumptionLogs.createdAt, endDate));
  const whereClause = and(...conditions);

  const [summaryRows, rows] = await Promise.all([
    db.select({
    totalCost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
    totalInput: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
    totalOutput: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
    totalTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
    todayCost: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.cost} ELSE 0 END), 0)::bigint`,
    todayInput: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.inputTokens} ELSE 0 END), 0)::bigint`,
    todayOutput: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.outputTokens} ELSE 0 END), 0)::bigint`,
    todayTokens: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens} ELSE 0 END), 0)::bigint`,
    })
      .from(tokenConsumptionLogs)
      .where(whereClause),
    db.select({
      provider: tokenConsumptionLogs.provider,
      modelId: tokenConsumptionLogs.modelId,
      totalCost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
      totalInput: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
      totalOutput: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
      totalTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
      todayCost: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.cost} ELSE 0 END), 0)::bigint`,
      todayInput: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.inputTokens} ELSE 0 END), 0)::bigint`,
      todayOutput: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.outputTokens} ELSE 0 END), 0)::bigint`,
      todayTokens: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN ${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens} ELSE 0 END), 0)::bigint`,
      callCount: sql<number>`COUNT(*)::int`,
      todayCallCount: sql<number>`COALESCE(SUM(CASE WHEN ${tokenConsumptionLogs.createdAt} >= ${todayStart} THEN 1 ELSE 0 END), 0)::int`,
    })
      .from(tokenConsumptionLogs)
      .where(whereClause)
      .groupBy(tokenConsumptionLogs.provider, tokenConsumptionLogs.modelId)
      .orderBy(sql`COALESCE(SUM(${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens}), 0) DESC`),
  ]);

  const [summary] = summaryRows;

  const byModel = Object.fromEntries(rows.map((row) => [
    `${row.provider}/${row.modelId}`,
    {
      totalCost: row.totalCost ?? 0,
      totalInput: row.totalInput ?? 0,
      totalOutput: row.totalOutput ?? 0,
      totalTokens: row.totalTokens ?? 0,
      todayCost: row.todayCost ?? 0,
      todayInput: row.todayInput ?? 0,
      todayOutput: row.todayOutput ?? 0,
      todayTokens: row.todayTokens ?? 0,
      callCount: row.callCount ?? 0,
      todayCallCount: row.todayCallCount ?? 0,
    },
  ]));

  return {
    totalCost: summary?.totalCost ?? 0,
    totalInput: summary?.totalInput ?? 0,
    totalOutput: summary?.totalOutput ?? 0,
    totalTokens: summary?.totalTokens ?? 0,
    todayCost: summary?.todayCost ?? 0,
    todayInput: summary?.todayInput ?? 0,
    todayOutput: summary?.todayOutput ?? 0,
    todayTokens: summary?.todayTokens ?? 0,
    byModel,
  };
}
