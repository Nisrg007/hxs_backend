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
  const expiresIn = type === 'access' ? '60m' : '60d';
  
  const tokenPayload: JwtPayload = {
    ...payload,
    type
  };
  
  return jwt.sign(tokenPayload, secret, { expiresIn });
};

export const verifyToken = (token: string, type: 'access' | 'refresh'): JwtPayload => {
  const secret = type === 'access' ? process.env.JWT_SECRET! : process.env.JWT_REFRESH_SECRET!;
  
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
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