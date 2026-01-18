const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Create Express app
const app = express();

// Basic middleware
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
    'http://localhost:3000',     // Frontend dev
    'http://localhost:3001',     // Admin panel dev
    'https://your-frontend.vercel.app',     // Frontend production
    'https://cart-admin-panel-git-admin-nisargs-projects-47512417.vercel.app'   // Admin panel production
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Basic routes for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hocco backend is running on Vercel 🚀',
    version: '1.0.0',
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    status: 'online'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'vercel',
    services: {
      api: 'healthy'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Serverless function error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Export for Vercel
module.exports = app;