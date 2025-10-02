import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { config } from './environment';
import IORedis from 'ioredis';

let redisClient: RedisClientType | null = null;

export const connectRedis = async (): Promise<void> => {
  try {
    redisClient = createClient({
      url: config.redis.url,
      socket: {
        connectTimeout: 5000,
        timeout: 45000,
      },
    });

    redisClient.on('error', (err: any) => {
      logger.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis reconnecting...');
    });

    await redisClient.connect();
    
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    process.exit(1);
  }
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redis.url, // e.g., 'redis://localhost:6379'
      password: config.redis.password || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    redisClient.connect().catch(console.error);
  }
  return redisClient;
};


export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Health check function
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};