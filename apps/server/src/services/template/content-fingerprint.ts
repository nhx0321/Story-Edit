// 内容指纹 — SimHash 64位算法
// 用于检测用户内容是否包含付费模板片段
import crypto from 'crypto';
import { db } from '../../db';
import { contentFingerprints } from '../../db/schema';

// ========== SimHash 算法 ==========

/**
 * 计算文本的 SimHash 64位指纹
 * 使用字符级 tri-gram 分词
 */
export function computeSimHash(text: string): bigint {
  const tokens = tokenize(text);
  const vector = new Array(64).fill(0);

  for (const token of tokens) {
    const hash = hashToken(token);
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & 1n;
      vector[i] += bit === 1n ? 1 : -1;
    }
  }

  // 二值化
  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (vector[i] > 0) {
      fingerprint |= (1n << BigInt(i));
    }
  }

  return fingerprint;
}

/**
 * 计算两个 SimHash 之间的汉明距离
 */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let dist = 0;
  while (diff > 0n) {
    dist++;
    diff &= (diff - 1n); // 清除最低位的1
  }
  return dist;
}

/**
 * 检查文本是否匹配已知指纹库
 * @returns 匹配到的指纹ID，若无匹配返回 null
 */
export function findMatch(text: string, fingerprints: Array<{ id: string; fingerprint: bigint; threshold?: number }>): string | null {
  if (fingerprints.length === 0) return null;
  const fp = computeSimHash(text);
  const threshold = 3; // 默认汉明距离 ≤ 3

  for (const entry of fingerprints) {
    const dist = hammingDistance(fp, entry.fingerprint);
    if (dist <= (entry.threshold ?? threshold)) {
      return entry.id;
    }
  }
  return null;
}

// ========== 数据库操作 ==========

// 简单内存缓存（运行时）
let fingerprintCache: Array<{ id: string; fingerprint: bigint }> | null = null;

/**
 * 加载所有付费模板指纹
 */
export async function loadFingerprints(): Promise<Array<{ id: string; fingerprint: bigint }>> {
  if (fingerprintCache) return fingerprintCache;

  try {
    const rows = await db.select({
      id: contentFingerprints.templateId,
      fingerprint: contentFingerprints.fingerprintDec,
    }).from(contentFingerprints);

    fingerprintCache = rows.map((row) => ({
      id: row.id,
      fingerprint: row.fingerprint,
    }));
  } catch {
    fingerprintCache = [];
  }

  return fingerprintCache ?? [];
}

/**
 * 保存模板指纹
 */
export async function saveTemplateFingerprint(templateId: string, text: string): Promise<bigint> {
  const fp = computeSimHash(text);
  const fpHex = fp.toString(16).padStart(16, '0');

  await db.insert(contentFingerprints)
    .values({
      templateId,
      fingerprintHash: fpHex,
      fingerprintDec: fp,
    })
    .onConflictDoUpdate({
      target: contentFingerprints.templateId,
      set: {
        fingerprintHash: fpHex,
        fingerprintDec: fp,
      },
    });

  fingerprintCache = null;
  return fp;
}

/**
 * 检查内容是否匹配任何付费模板指纹
 * @returns { matched: boolean, templateId: string | null }
 */
export async function checkContentFingerprint(text: string): Promise<{ matched: boolean; templateId: string | null }> {
  const fps = await loadFingerprints();
  if (fps.length === 0) return { matched: false, templateId: null };

  const fp = computeSimHash(text);

  for (const entry of fps) {
    const dist = hammingDistance(fp, entry.fingerprint);
    if (dist <= 3) {
      return { matched: true, templateId: entry.id };
    }
  }

  return { matched: false, templateId: null };
}

/**
 * 提取文本的有效内容（跳过标题、简短内容）
 */
export function extractFingerprintText(text: string, minLength = 200): string | null {
  const cleaned = text.trim();
  if (cleaned.length < minLength) return null;
  return cleaned;
}

// ========== 内部辅助 ==========

function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 字符级 tri-gram
  for (let i = 0; i < text.length - 2; i++) {
    tokens.push(text.slice(i, i + 3));
  }

  // 分词级（按标点/空白分割，取超过2词的片段）
  const words = text.split(/[\s，。！？；：、""''「」『』【】（）\(\)\n\r]+/).filter(w => w.length > 0);
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words.slice(i, i + 2).join(' '));
  }

  return tokens;
}

function hashToken(token: string): bigint {
  const hash = crypto.createHash('md5').update(token, 'utf8').digest();
  // 取前8字节作为64位hash
  let val = 0n;
  for (let i = 0; i < 8; i++) {
    val = (val << 8n) | BigInt(hash[i]);
  }
  return val;
}
