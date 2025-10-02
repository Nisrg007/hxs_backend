import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface JwtPayload {
  cart_id: string;
  vendor_id: string;
  device_fingerprint: string;
  type: 'access' | 'refresh';
}

export const generateToken = (payload: Omit<JwtPayload, 'type'>, type: 'access' | 'refresh'): string => {
  const secret = type === 'access' ? process.env.JWT_SECRET! : process.env.JWT_REFRESH_SECRET!;
  const expiresIn = type === 'access' ? '1m' : '4m';
  
  const tokenPayload: JwtPayload = {
    ...payload,
    type
  };
 const token = jwt.sign(tokenPayload, secret, { expiresIn });

  // decode expiry for logging
  const decoded: any = jwt.decode(token);
  if (decoded && decoded.exp) {
    const remaining = decoded.exp * 1000 - Date.now();
    logger.info(`${type} token created`, {
      expires_in_seconds: Math.floor(remaining / 1000),
      expires_at: new Date(decoded.exp * 1000).toISOString()
    });
  }

  return token;
};

export const verifyToken = (token: string, type: 'access' | 'refresh'): JwtPayload => {
  const secret = type === 'access' ? process.env.JWT_SECRET! : process.env.JWT_REFRESH_SECRET!;
  
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload& { exp?: number; iat?: number };

    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const remaining = decoded.exp - now;
      logger.info(`${type} token remaining time: ${remaining}s`);
    }
    return decoded;
  } catch (error) {
    logger.error('JWT verification failed:', error);
    throw new Error('Invalid or expired token');
  }
};

  export function generateCartToken(
  payload: Omit<JwtPayload, 'type'>,
  type: 'access' | 'refresh' | 'both' = 'both'
) {
  if (type === 'access') {
    return { access_token: generateToken(payload, 'access') };
  }
  if (type === 'refresh') {
    return { refresh_token: generateToken(payload, 'refresh') };
  }
  return {
    access_token: generateToken(payload, 'access'),
    refresh_token: generateToken(payload, 'refresh')
  };

};