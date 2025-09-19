import crypto from 'crypto';
import { logger } from './logger';

export const generateDeviceFingerprint = (deviceInfo: any): string => {
  const data = JSON.stringify({
    userAgent: deviceInfo.userAgent,
    platform: deviceInfo.platform,
    language: deviceInfo.language,
    timezone: deviceInfo.timezone,
    screen: deviceInfo.screen,
    plugins: deviceInfo.plugins
  });

  return crypto.createHash('sha256').update(data).digest('hex');
};

export const generateSecureRandom = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const hashData = (data: string, saltRounds: number = 12): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(data, salt, saltRounds, 64, 'sha512', (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      }
    });
  });
};

export const verifyHash = (data: string, hash: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.pbkdf2(data, salt, 12, 64, 'sha512', (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey.toString('hex') === key);
      }
    });
  });
};

export const encryptData = (data: string, key: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

export const decryptData = (encryptedData: string, key: string): string => {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// Key management
let encryptionKey: string | null = null;

export const getEncryptionKey = (): string => {
  if (!encryptionKey) {
    encryptionKey = process.env.ENCRYPTION_KEY || generateSecureRandom(32);
  }
  return encryptionKey;
};

export const rotateEncryptionKey = (): string => {
  encryptionKey = generateSecureRandom(32);
  logger.info('Encryption key rotated');
  return encryptionKey;
};