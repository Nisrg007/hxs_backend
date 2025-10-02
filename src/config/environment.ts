import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hocco',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || 'Qo1bs7mvVGKaYQn75rvDD5IoLFnPKswc',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: '1y',
    refreshExpiresIn: '4y',
  },
  
  admin: {
    apiKey: process.env.ADMIN_API_KEY!,
  },
  
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN!,
  },
  
  streefi: {
    apiUrl: process.env.STREEFI_API_URL!,
    apiKey: process.env.STREEFI_API_KEY!,
    clientId: process.env.STREEFI_CLIENT_ID!,
    adminApiKey: process.env.STREEFI_ADMIN_API_KEY!
  },
  
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
  },
  
  proximity: {
    checkInterval: 5 * 60 * 1000, // 5 minutes
    maxDistance: 500, // meters
    alertCooldown: 30 * 60 * 1000, // 30 minutes
  },
  
  location: {
    movingInterval: 10 * 60, // 10 minutes in seconds
    idleInterval: 60 * 60, // 60 minutes in seconds
    maxAccuracy: 1000, // meters
    maxRealisticSpeed: 150, // km/h
    maxTimestampSkew: 5 * 60 * 1000, // 5 minutes in milliseconds

  },
};

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Environment variable ${envVar} is required`);
  }
}