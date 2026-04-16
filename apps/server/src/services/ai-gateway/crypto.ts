// AI Key 加密工具 — AES-256-CBC
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production';
  // 用 SHA-256 确保 key 长度为 32 bytes
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(secret).digest();
}

export function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptApiKey(encryptedKey: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedKey.split(':');
  if (!ivHex || !encrypted) throw new Error('Invalid encrypted key format');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
