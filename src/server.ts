import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/environment';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth } from './config/redis';
import { initializeWorkers, closeWorkers } from './workers';
import { initializeWebSocket } from './ws/socketServer';
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

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/', (req, res) => {
  res.json({ message: 'Hocco backend is running 🚀' });
});


// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token']
}));

// Rate limiting
app.use(globalRateLimiter);

// Body parsing and compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging
app.use(requestLogger);

// Health checks
app.get('/health', async (req, res) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth()
  ]);

  const status = dbHealthy && redisHealthy ? 'healthy' : 'degraded';
  
  res.json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'healthy' : 'unhealthy',
      redis: redisHealthy ? 'healthy' : 'unhealthy'
    }
  });
});

app.get('/ready', async (req, res) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth()
  ]);

  if (dbHealthy && redisHealthy) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ 
      status: 'not ready',
      services: {
        database: dbHealthy ? 'ready' : 'not ready',
        redis: redisHealthy ? 'ready' : 'not ready'
      }
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/carts', cartRoutes);
app.use('/api/v1/ingest', ingestRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/internal', internalRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handling (must be last)
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    logger.info('🚀 Starting Hocco Backend Server...');
    
    // Connect to databases
    await connectDatabase();
    await connectRedis();
    
    // Initialize background workers
    await initializeWorkers();
    
    const port = config.port;
    const server = app.listen(port,"0.0.0.0", () => {
      logger.info(`✅ Hocco Backend listening on port ${port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 Health check available at http://localhost:${port}/health`);
    });
    
    // Initialize WebSocket server
    initializeWebSocket(server);
    
    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        await Promise.all([
          closeWorkers(),
          // Add other cleanup tasks here
        ]);
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection:', { 
    promise: promise.toString(), 
    reason: reason instanceof Error ? reason.message : reason 
  });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer();
}

export { app };