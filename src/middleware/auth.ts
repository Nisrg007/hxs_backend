import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { CartAssignment } from '../models/CartAssignment';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

export interface AuthRequest extends Request {
  cartContext?: {
    cart_id: string;
    vendor_id: string;
    device_fingerprint: string;
  };
}

export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const adminToken = req.headers['x-admin-token'];

  if (adminToken && adminToken === config.streefi.adminApiKey) {
    next(); // ✅ allow access
  } else {
    res.status(401).json({
      error: 'admin_authentication_required',
      message: 'Valid admin token required'
    });
  }
};

// Service-to-service authentication
export const authenticateService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const serviceToken = req.headers['x-service-token'];
  
  if (serviceToken === config.streefi.apiKey) {
    next();
  } else {
    res.status(401).json({
      error: 'service_authentication_required',
      message: 'Valid service token required'
    });
  }
};

// Strict cart authentication (required for ingest routes)
export const authenticateCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'cart_authentication_required',
      message: 'Valid Bearer token required'
    });
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token, 'access');

    const assignment = await CartAssignment.findOne({
      cart_id: decoded.cart_id,
      device_fingerprint: decoded.device_fingerprint,
      status: 'active'
    });

    if (!assignment) {
      res.status(401).json({
        error: 'invalid_session',
        message: 'Cart assignment not found or inactive'
      });
      return;
    }

    const isValidToken = await assignment.compareToken(token, 'access');
    if (!isValidToken) {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired access token'
      });
      return;
    }

    req.cartContext = {
      cart_id: decoded.cart_id,
      vendor_id: decoded.vendor_id,
      device_fingerprint: decoded.device_fingerprint
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: 'auth_failed',
      message: (error as Error).message
    });
  }
};

// Optional cart authentication for some endpoints
export const optionalCartAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token, 'access');
    
    const assignment = await CartAssignment.findOne({
      cart_id: decoded.cart_id,
      device_fingerprint: decoded.device_fingerprint,
      status: 'active'
    });
    
    if (assignment) {
      const isValidToken = await assignment.compareToken(token, 'access');
      if (isValidToken) {
        req.cartContext = {
          cart_id: decoded.cart_id,
          vendor_id: decoded.vendor_id,
          device_fingerprint: decoded.device_fingerprint
        };
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    logger.debug('Optional auth failed:', (error as Error).message);
  }

  

  next();
};