import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import rateLimit from 'express-rate-limit';
import { config } from '../config/environment';

// Global rate limiter
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.max,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const rateLimitByCart = async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cartId = req.cartContext?.cart_id;
    
    if (!cartId) {
      next();
      return;
    }

    const redis = getRedisClient();
    const rateLimitKey = `rate_limit:cart:${cartId}`;
    const now = Date.now();
    const windowMs = 30000; // 30 seconds
    const maxRequests = 1; // 1 request per window

    // Get current count
    const result = await redis.multi()
      .zRangeByScore(rateLimitKey, now - windowMs, now)
      .zAdd(rateLimitKey, { score: now, value: now.toString() })
      .zRemRangeByScore(rateLimitKey, 0, now - windowMs)
      .expire(rateLimitKey, Math.ceil(windowMs / 1000))
      .exec();

    // Safely extract zRange result
    const zRangeResult = (result?.[0] as string[] | undefined) ?? [];
    const requestCount = zRangeResult.length;

    if (requestCount >= maxRequests) {
      const oldest = zRangeResult[0]; // oldest timestamp as string
      const retryAfter = oldest
        ? Math.ceil((now - parseInt(oldest, 10)) / 1000)
        : Math.ceil(windowMs / 1000);

      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Location updates limited to once per 30 seconds',
        retry_after: retryAfter
      });
      return;
    }next();
  } catch (error) {
    logger.error('Rate limiting error:', error);
    // Don’t block request if rate limiting fails
    next();
  }
};

export const adminRateLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const redis = getRedisClient();
    const rateLimitKey = `rate_limit:admin:${req.ip}`;
    const now = Date.now();
    const windowMs = 60_000; // 1 minute
    const maxRequests = 30;  // 30 requests per minute

    const result = await redis.multi()
      .zRangeByScore(rateLimitKey, now - windowMs, now)
      .zAdd(rateLimitKey, { score: now, value: now.toString() })
      .zRemRangeByScore(rateLimitKey, 0, now - windowMs)
      .expire(rateLimitKey, Math.ceil(windowMs / 1000))
      .exec();

    const zRangeResult = (result?.[0] as string[] | undefined) ?? [];
    const requestCount = zRangeResult.length;

    if (requestCount >= maxRequests) {
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many admin requests, slow down',
        retry_after: Math.ceil(windowMs / 1000)
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Admin rate limiting error:', error);
    next(); // fail open
  }
  
};