import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { ENCRYPTION_ERRORS } from '@/constants/errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(ENCRYPTION_ERRORS.KEY_NOT_SET);
  }
  
  if (key.length === KEY_LENGTH * 2) {
    return Buffer.from(key, 'hex');
  }
  
  return createHash('sha256').update(key).digest();
}

export function encryptApiKey(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch {
    throw new Error(ENCRYPTION_ERRORS.FAILED_ENCRYPT);
  }
}

export function decryptApiKey(encrypted: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encrypted.split(':');
    
    if (parts.length !== 3) {
      throw new Error(ENCRYPTION_ERRORS.INVALID_FORMAT);
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch {
    throw new Error(ENCRYPTION_ERRORS.FAILED_DECRYPT);
  }
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '••••••••';
  }
  
  const prefix = apiKey.slice(0, 7);
  const lastFour = apiKey.slice(-4);
  
  return `${prefix}...${lastFour}`;
}
