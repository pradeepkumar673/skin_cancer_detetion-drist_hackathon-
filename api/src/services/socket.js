import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';

let ioInstance = null;

export function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_URL,
      credentials: true,
    },
  });

  // JWT Authentication middleware for WebSocket connections
  ioInstance.use((socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!authHeader) {
        return next(new Error('Authentication token required'));
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      logger.warn({ error: err.message }, 'Socket authentication failed');
      next(new Error('Invalid or expired authentication token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userId = socket.user?.id || socket.user?.userId;
    if (userId) {
      const room = `user:${userId}`;
      socket.join(room);
      logger.info({ userId, socketId: socket.id }, 'Socket connected and joined personal user room');
    }

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return ioInstance;
}

export function getIO() {
  return ioInstance;
}

export function emitCaseUpdate(userId, caseId, status, extra = {}) {
  if (!ioInstance) return;
  const payload = {
    caseId: String(caseId),
    status,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  ioInstance.to(`user:${userId}`).emit('case:update', payload);
  logger.info({ userId, caseId, status }, 'Emitted case:update WebSocket event');
}
