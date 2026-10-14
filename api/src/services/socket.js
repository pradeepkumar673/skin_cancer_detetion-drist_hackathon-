import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { Doctor } from '../models/Doctor.js';

let ioInstance = null;

// Map of userId string -> Set of connected socket ids
const userSockets = new Map();

// Map of userId string -> setTimeout handle for presence grace period
const disconnectTimers = new Map();

export function getConnectedSockets(userId) {
  const set = userSockets.get(String(userId));
  return set ? Array.from(set) : [];
}

export function clearAllPresenceTimers() {
  for (const [userId, timer] of disconnectTimers.entries()) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
  userSockets.clear();
}

export async function resetDoctorPresence() {
  try {
    await Doctor.updateMany({}, { isOnline: false });
    logger.info('Reset all doctor online presence flags to false');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to reset doctor presence flags on startup');
  }
}

export function broadcastDoctorPresence(doctorId, isOnline) {
  if (!ioInstance) return;
  ioInstance.to('presence-watchers').emit('doctor:presence', {
    doctorId: String(doctorId),
    isOnline: Boolean(isOnline),
    timestamp: new Date().toISOString(),
  });
}

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

  ioInstance.on('connection', async (socket) => {
    const userId = String(socket.user?.id || socket.user?.sub || socket.user?.userId || '');
    if (!userId) {
      return;
    }

    // Join personal user room
    socket.join(`user:${userId}`);

    // Track active socket IDs for multi-tab support
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Cancel pending disconnect timer if user reconnected or opened a new tab
    if (disconnectTimers.has(userId)) {
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
      logger.info({ userId }, 'Cancelled doctor presence disconnect timer due to reconnect/new tab');
    }

    // If connected user is a verified doctor, update status
    try {
      const doctor = await Doctor.findOne({ userId });
      if (doctor && doctor.verificationStatus === 'verified') {
        if (doctor.presenceMode === 'auto') {
          if (!doctor.isOnline) {
            doctor.isOnline = true;
            doctor.lastSeenAt = new Date();
            await doctor.save();
            broadcastDoctorPresence(doctor._id, true);
            logger.info({ doctorId: doctor._id, userId }, 'Doctor marked online in presence-watchers');
          }
        }
      }
    } catch (err) {
      logger.error({ err: err.message, userId }, 'Error updating doctor online status on connect');
    }

    // Client subscribes to live doctor presence events
    socket.on('presence:subscribe', () => {
      socket.join('presence-watchers');
      logger.debug({ socketId: socket.id, userId }, 'Subscribed to presence-watchers');
    });

    socket.on('presence:unsubscribe', () => {
      socket.leave('presence-watchers');
      logger.debug({ socketId: socket.id, userId }, 'Unsubscribed from presence-watchers');
    });

    socket.on('disconnect', async () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);

          // All tabs for this user are now closed
          try {
            const doctor = await Doctor.findOne({ userId });
            if (doctor && doctor.verificationStatus === 'verified' && doctor.presenceMode === 'auto') {
              const graceMs = (config.PRESENCE_GRACE_SECONDS || 60) * 1000;
              logger.info(
                { doctorId: doctor._id, graceSeconds: config.PRESENCE_GRACE_SECONDS },
                'Doctor last socket disconnected; starting presence grace timer'
              );

              const timer = setTimeout(async () => {
                disconnectTimers.delete(userId);
                // Ensure no new socket connected during the grace period
                if (!userSockets.has(userId) || userSockets.get(userId).size === 0) {
                  try {
                    const doc = await Doctor.findOne({ userId });
                    if (doc && doc.presenceMode === 'auto') {
                      doc.isOnline = false;
                      doc.lastSeenAt = new Date();
                      await doc.save();
                      broadcastDoctorPresence(doc._id, false);
                      logger.info({ doctorId: doc._id }, 'Doctor presence set to offline after grace period');
                    }
                  } catch (err) {
                    logger.error({ err: err.message }, 'Failed to set doctor offline after grace timer');
                  }
                }
              }, graceMs);

              disconnectTimers.set(userId, timer);
            }
          } catch (err) {
            logger.error({ err: err.message, userId }, 'Error handling doctor disconnect grace');
          }
        }
      }
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
