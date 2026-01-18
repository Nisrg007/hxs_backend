import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { config } from './environment';
import IORedis from 'ioredis';

let redisClient: RedisClientType | null = null;
let ioRedisClient: IORedis | null = null;

// Optimized Redis connection for Vercel serverless
export const connectRedis = async (): Promise<void> => {
  try {
    if (redisClient?.isOpen) {
      return; // Already connected
    }

    redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: 5000,
        keepAlive: 30000,
        noDelay: true,
      },
      // Optimized for serverless
      database: 0,
    });

    redisClient.on('error', (err: any) => {
      logger.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully (Vercel optimized)');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis reconnecting...');
    });

    await redisClient.connect();
    
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    // Don't exit in serverless environment
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient || !redisClient.isOpen) {
    redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: 5000,
        keepAlive: 30000,
        noDelay: true,
      },
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error', err);
    });

    // Don't auto-connect, let it connect when needed
  }
  
  return redisClient;
};

// IORedis client for Socket.IO adapter (if needed in future)
export const getIORedisClient = (): IORedis => {
  if (!ioRedisClient) {
    ioRedisClient = new IORedis(config.redis.url, {
      password: config.redis.password || undefined,
      connectTimeout: 5000,
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
  }
  return ioRedisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient?.isOpen) {
      await redisClient.disconnect();
      redisClient = null;
    }
    if (ioRedisClient) {
      await ioRedisClient.quit();
      ioRedisClient = null;
    }
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

// Health check function with better error handling for serverless
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    
    if (!redisClient?.isOpen) {
      await redisClient?.connect();
    }
    
    await redisClient?.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};