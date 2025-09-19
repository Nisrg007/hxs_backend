import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisClient } from '../config/redis';
import { verifyToken } from '../utils/jwt';
import { CartAssignment } from '../models/CartAssignment';
import { logger } from '../utils/logger';

interface AuthenticatedSocket {
  userId?: string;
  userType?: 'admin' | 'cart';
  cartId?: string;
}

export const initializeWebSocket = (server: HttpServer): void => {
  const io = new SocketServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // Use Redis for scaling
  const pubClient = getRedisClient();
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  // Authentication middleware
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      // Check if it's an admin token (simple API key for now)
      if (token === process.env.ADMIN_API_KEY) {
        (socket as AuthenticatedSocket).userType = 'admin';
        (socket as AuthenticatedSocket).userId = 'admin';
        return next();
      }

      // Verify cart JWT token
      const decoded = verifyToken(token, 'access');
      
      // Verify token is still valid in database
      const assignment = await CartAssignment.findOne({
        cart_id: decoded.cart_id,
        device_fingerprint: decoded.device_fingerprint,
        status: 'active'
      });

      if (!assignment) {
        return next(new Error('Authentication error: Invalid session'));
      }

      const isValidToken = await assignment.compareToken(token, 'access');
      if (!isValidToken) {
        return next(new Error('Authentication error: Invalid token'));
      }

      (socket as AuthenticatedSocket).userType = 'cart';
      (socket as AuthenticatedSocket).cartId = decoded.cart_id;
      (socket as AuthenticatedSocket).userId = decoded.cart_id;

      next();
    } catch (error) {
      next(new Error('Authentication error: ' + (error as Error).message));
    }
  });

  io.on('connection', (socket: any) => {
    const authSocket = socket as AuthenticatedSocket;
    
    logger.info('Client connected', {
      userId: authSocket.userId,
      userType: authSocket.userType
    });

    // Join appropriate rooms
    if (authSocket.userType === 'admin') {
      socket.join('admin_dashboard');
      socket.join('alerts');
    } else if (authSocket.userType === 'cart' && authSocket.cartId) {
      socket.join(`cart:${authSocket.cartId}`);
    }

    // Handle room subscriptions
    socket.on('join_room', (room: string) => {
      socket.join(room);
      logger.debug('Client joined room', { userId: authSocket.userId, room });
    });

    socket.on('leave_room', (room: string) => {
      socket.leave(room);
      logger.debug('Client left room', { userId: authSocket.userId, room });
    });

    // Handle disconnection
    socket.on('disconnect', (reason: string) => {
      logger.info('Client disconnected', {
        userId: authSocket.userId,
        userType: authSocket.userType,
        reason
      });
    });

    // Error handling
    socket.on('error', (error: Error) => {
      logger.error('Socket error:', {
        userId: authSocket.userId,
        error: error.message
      });
    });
  });

  // Subscribe to Redis channels for real-time events
  const redisClient = getRedisClient();
  
  redisClient.subscribe('cart.location.updated', (message: string) => {
    const event = JSON.parse(message);
    io.to('admin_dashboard').emit('cart.location.updated', event);
    
    // Also emit to specific cart room for dedicated connections
    if (event.cart_id) {
      io.to(`cart:${event.cart_id}`).emit('location.update', event);
    }
  });

  redisClient.subscribe('alert.created', (message: string) => {
    const event = JSON.parse(message);
    io.to('admin_dashboard').emit('alert.created', event);
    io.to('alerts').emit('alert.created', event);
  });

  redisClient.subscribe('alert.resolved', (message: string) => {
    const event = JSON.parse(message);
    io.to('admin_dashboard').emit('alert.resolved', event);
    io.to('alerts').emit('alert.resolved', event);
  });

  redisClient.subscribe('cart.assignment.changed', (message: string) => {
    const event = JSON.parse(message);
    io.to('admin_dashboard').emit('cart.assignment.changed', event);
    
    if (event.cart_id) {
      io.to(`cart:${event.cart_id}`).emit('assignment.update', event);
    }
  });

  redisClient.subscribe('batch.location.updates', (message: string) => {
    const events = JSON.parse(message);
    io.to('admin_dashboard').emit('batch.location.updates', events);
  });

  logger.info('WebSocket server initialized');
};