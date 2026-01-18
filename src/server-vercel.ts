import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/environment';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth } from './config/redis-vercel';
import { authRoutes } from './routes/auth';
import { cartRoutes } from './routes/carts';
import { ingestRoutes } from './routes/ingest';
import { alertRoutes } from './routes/alerts';
import { internalRoutes } from './routes/internal';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { globalRateLimiter } from './middleware/rateLimiting';
import { logger } from './utils/logger';

const app = express();

// Global connection tracking for serverless
let dbConnected = false;
let redisConnected = false;
let connectionPromise: Promise<void> | null = null;

// Initialize database connections with proper error handling
async function initializeConnections(): Promise<void> {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const promises = [];
    
    if (!dbConnected) {
      promises.push(
        connectDatabase()
          .then(() => {
            dbConnected = true;
            logger.info('✅ MongoDB connected for Vercel');
          })
          .catch((error) => {
            logger.error('❌ Failed to connect to MongoDB:', error);
            // Don't throw here, let the API handle individual failures
          })
      );
    }
    
    if (!redisConnected) {
      promises.push(
        connectRedis()
          .then(() => {
            redisConnected = true;
            logger.info('✅ Redis connected for Vercel');
          })
          .catch((error) => {
            logger.error('❌ Failed to connect to Redis:', error);
            // Don't throw here, let the API handle individual failures
          })
      );
    }

    await Promise.allSettled(promises);
  })();

  return connectionPromise;
}

// Middleware to ensure connections are initialized
app.use(async (req, res, next) => {
  try {
    await initializeConnections();
  } catch (error) {
    logger.error('Connection initialization error:', error);
  }
  next();
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
  res.json({ 
    message: 'Hocco backend is running on Vercel 🚀',
    version: '1.0.0',
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    features: {
      websockets: false,
      backgroundWorkers: false,
      apiRoutes: true
    }
  });
});

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https:", "wss:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://your-frontend-domain.vercel.app'
  ],
  credentials: true
}));

// Rate limiting - adjusted for serverless
app.use(globalRateLimiter);

// Body parsing and compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging middleware
app.use(requestLogger);

// Health checks with improved error handling
app.get('/health', async (req, res) => {
  try {
    const [dbHealthy, redisHealthy] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);

    const dbStatus = dbHealthy.status === 'fulfilled' && dbHealthy.value;
    const redisStatus = redisHealthy.status === 'fulfilled' && redisHealthy.value;
    
    const status = dbStatus && redisStatus ? 'healthy' : 'degraded';
    
    res.json({
      status,
      timestamp: new Date().toISOString(),
      platform: 'vercel',
      services: {
        database: dbStatus ? 'healthy' : 'unhealthy',
        redis: redisStatus ? 'healthy' : 'unhealthy'
      },
      connectionStatus: {
        dbConnected,
        redisConnected
      }
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      platform: 'vercel',
      error: 'Health check failed'
    });
  }
});

app.get('/ready', async (req, res) => {
  try {
    const [dbHealthy, redisHealthy] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);

    const dbStatus = dbHealthy.status === 'fulfilled' && dbHealthy.value;
    const redisStatus = redisHealthy.status === 'fulfilled' && redisHealthy.value;

    if (dbStatus && redisStatus) {
      res.json({ 
        status: 'ready', 
        platform: 'vercel',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        platform: 'vercel',
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus ? 'ready' : 'not ready',
          redis: redisStatus ? 'ready' : 'not ready'
        }
      });
    }
  } catch (error) {
    logger.error('Readiness check error:', error);
    res.status(503).json({
      status: 'error',
      platform: 'vercel',
      error: 'Readiness check failed'
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/carts', cartRoutes);
app.use('/api/v1/ingest', ingestRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/internal', internalRoutes);

// Additional info endpoint for debugging
app.get('/api/info', (req, res) => {
  res.json({
    nodeEnv: config.nodeEnv,
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    connections: {
      dbConnected,
      redisConnected
    },
    config: {
      port: config.port,
      hasMongoUri: !!config.mongodb.uri,
      hasRedisUrl: !!config.redis.url
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handling (must be last)
app.use(errorHandler);

// For local development only
if (require.main === module && process.env.NODE_ENV !== 'production') {
  const port = config.port || 3000;
  initializeConnections().then(() => {
    app.listen(port, () => {
      logger.info(`✅ Hocco Backend (Vercel version) listening on port ${port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 Health check available at http://localhost:${port}/health`);
    });
  });
}

// Export the Express app for Vercel
export default app;