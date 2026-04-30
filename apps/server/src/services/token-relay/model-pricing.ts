// 模型定价查询服务
import { db } from '../../db';
import { modelPricing } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ModelPricingInfo {
  id: string;
  provider: string;
  modelId: string;
  modelName: string;
  groupName: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  isActive: boolean;
}

/**
 * 获取模型的定价信息
 */
export async function getModelPricing(provider: string, modelId: string): Promise<ModelPricingInfo | null> {
  const [pricing] = await db.select()
    .from(modelPricing)
    .where(
      and(
        eq(modelPricing.provider, provider),
        eq(modelPricing.modelId, modelId),
        eq(modelPricing.isActive, true),
      ),
    );

  return pricing ? {
    id: pricing.id,
    provider: pricing.provider,
    modelId: pricing.modelId,
    modelName: pricing.modelName,
    groupName: pricing.groupName ?? 'default',
    inputPricePer1m: pricing.inputPricePer1m,
    outputPricePer1m: pricing.outputPricePer1m,
    isActive: pricing.isActive ?? true,
  } : null;
}

/**
 * 获取所有活跃的模型定价
 */
export async function getAllPricing(): Promise<ModelPricingInfo[]> {
  const rows = await db.select()
    .from(modelPricing)
    .where(eq(modelPricing.isActive, true))
    .orderBy(sql`${modelPricing.sortOrder} ASC`);

  return rows.map(r => ({
    id: r.id,
    provider: r.provider,
    modelId: r.modelId,
    modelName: r.modelName,
    groupName: r.groupName ?? 'default',
    inputPricePer1m: r.inputPricePer1m,
    outputPricePer1m: r.outputPricePer1m,
    isActive: r.isActive ?? true,
  }));
}

/**
 * 获取指定分组的模型列表
 */
export async function getPricingByGroup(groupName: string): Promise<ModelPricingInfo[]> {
  const rows = await db.select()
    .from(modelPricing)
    .where(
      and(
        eq(modelPricing.groupName, groupName),
        eq(modelPricing.isActive, true),
      ),
    )
    .orderBy(sql`${modelPricing.sortOrder} ASC`);

  return rows.map(r => ({
    id: r.id,
    provider: r.provider,
    modelId: r.modelId,
    modelName: r.modelName,
    groupName: r.groupName ?? 'default',
    inputPricePer1m: r.inputPricePer1m,
    outputPricePer1m: r.outputPricePer1m,
    isActive: r.isActive ?? true,
  }));
}
