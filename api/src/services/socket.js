import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Message } from '../models/Message.js';
import { Consent } from '../models/Consent.js';

let ioInstance = null;

// Map of userId string -> Set of connected socket ids
const userSockets = new Map();

// Map of userId string -> setTimeout handle for presence grace period
const disconnectTimers = new Map();

// Map of appointmentId -> Set of socket IDs currently in room
const sessionRooms = new Map();

export function getConnectedSockets(userId) {
  const set = userSockets.get(String(userId));
  return set ? Array.from(set) : [];
}

export function clearAllPresenceTimers() {
  for (const [, timer] of disconnectTimers.entries()) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
  userSockets.clear();
  sessionRooms.clear();
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

/**
 * Validates whether a user can access the consultation session
 */
export async function canAccessSession(userId, appointmentId) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    return { allowed: false, error: 'not_found', message: 'Appointment not found' };
  }

  // Check valid status
  if (!['paid', 'in_progress'].includes(appointment.status)) {
    return {
      allowed: false,
      error: 'invalid_status',
      message: `Session is not accessible while appointment status is ${appointment.status}`,
    };
  }

  // Verify role ownership
  const patient = await Patient.findOne({ userId });
  const doctor = await Doctor.findOne({ userId });

  const isPatient = Boolean(patient && appointment.patientId.equals(patient._id));
  const isDoctor = Boolean(doctor && appointment.doctorId.equals(doctor._id));

  if (!isPatient && !isDoctor) {
    return {
      allowed: false,
      error: 'unauthorized',
      message: 'You are not a participant in this consultation session',
    };
  }

  const now = Date.now();
  const graceMs = (config.SESSION_GRACE_MINUTES || 15) * 60 * 1000;
  const durationMs = (appointment.durationMin || 15) * 60 * 1000;

  if (appointment.kind === 'scheduled') {
    if (!appointment.scheduledAt) {
      return { allowed: false, error: 'not_scheduled', message: 'Appointment is not scheduled yet' };
    }
    const scheduledTime = new Date(appointment.scheduledAt).getTime();
    const windowStart = scheduledTime - graceMs;
    const windowEnd = scheduledTime + durationMs + graceMs;

    if (now < windowStart || now > windowEnd) {
      return {
        allowed: false,
        error: 'outside_window',
        message: 'Session is only open within the scheduled consultation time window',
      };
    }
  } else if (appointment.kind === 'instant') {
    // Instant appointments open from first join/sessionStartedAt
    if (appointment.sessionStartedAt) {
      const startTime = new Date(appointment.sessionStartedAt).getTime();
      const windowEnd = startTime + durationMs + graceMs;
      if (now > windowEnd) {
        return {
          allowed: false,
          error: 'outside_window',
          message: 'Instant consultation session time window has ended',
        };
      }
    }
  }

  return { allowed: true, appointment, isPatient, isDoctor };
}

/**
 * Broadcasts consent revocation live to the session room
 */
export function emitConsentRevoked({ doctorId, caseId }) {
  if (!ioInstance) return;
  ioInstance.emit('case:consent_revoked', {
    doctorId: String(doctorId),
    caseId: String(caseId),
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
          }
        }
      }
    } catch (err) {
      logger.error({ err: err.message, userId }, 'Error updating doctor online status on connect');
    }

    // Presence watcher subscriptions
    socket.on('presence:subscribe', () => {
      socket.join('presence-watchers');
    });

    socket.on('presence:unsubscribe', () => {
      socket.leave('presence-watchers');
    });

    // -----------------------------------------------------------------------
    // CONSULTATION SESSION & CHAT EVENTS
    // -----------------------------------------------------------------------

    /**
     * Join consultation session room (appointment:<id>)
     */
    socket.on('chat:join', async (payload, callback) => {
      const appointmentId = payload?.appointmentId;
      if (!appointmentId) {
        socket.emit('session:error', { error: 'invalid_request', message: 'appointmentId is required' });
        if (typeof callback === 'function') callback({ error: 'appointmentId is required' });
        return;
      }

      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) {
        socket.emit('session:error', { error: access.error, message: access.message });
        if (typeof callback === 'function') callback({ error: access.message, code: access.error });
        return;
      }

      const room = `appointment:${appointmentId}`;
      socket.join(room);

      if (!sessionRooms.has(appointmentId)) {
        sessionRooms.set(appointmentId, new Set());
      }
      sessionRooms.get(appointmentId).add(socket.id);

      // Fetch message history
      const history = await Message.find({ appointmentId })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();

      socket.emit('chat:history', {
        appointmentId,
        messages: history.map((m) => ({
          id: String(m._id),
          senderId: String(m.senderId),
          text: m.text,
          sentAt: m.createdAt,
        })),
      });

      // Notify other participant that user joined
      socket.to(room).emit('session:participant_joined', {
        userId,
        role: access.isDoctor ? 'doctor' : 'patient',
        timestamp: new Date().toISOString(),
      });

      // If room has both participants and status is paid, set in_progress
      const appointment = access.appointment;
      if (appointment.status === 'paid') {
        const roomSockets = Array.from(sessionRooms.get(appointmentId) || []);
        if (roomSockets.length >= 2) {
          appointment.status = 'in_progress';
          if (!appointment.sessionStartedAt) {
            appointment.sessionStartedAt = new Date();
          }
          await appointment.save();

          ioInstance.to(room).emit('session:status', {
            status: 'in_progress',
            sessionStartedAt: appointment.sessionStartedAt,
          });
        }
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          status: appointment.status,
          role: access.isDoctor ? 'doctor' : 'patient',
          sessionStartedAt: appointment.sessionStartedAt,
        });
      }
    });

    /**
     * Send chat message
     */
    socket.on('chat:message', async (payload, callback) => {
      const { appointmentId, text } = payload || {};
      if (!appointmentId || !text || typeof text !== 'string' || !text.trim()) {
        if (typeof callback === 'function') callback({ error: 'Valid text is required' });
        return;
      }

      if (text.length > 2000) {
        if (typeof callback === 'function') callback({ error: 'Message exceeds maximum length' });
        return;
      }

      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) {
        socket.emit('session:error', { error: access.error, message: access.message });
        if (typeof callback === 'function') callback({ error: access.message });
        return;
      }

      const message = await Message.create({
        appointmentId,
        senderId: userId,
        text: text.trim(),
      });

      const messagePayload = {
        id: String(message._id),
        appointmentId,
        senderId: userId,
        text: message.text,
        sentAt: message.createdAt,
      };

      const room = `appointment:${appointmentId}`;
      ioInstance.to(room).emit('chat:message', messagePayload);

      if (typeof callback === 'function') {
        callback({ success: true, message: messagePayload });
      }
    });

    /**
     * Typing indicator
     */
    socket.on('chat:typing', (payload) => {
      const { appointmentId, isTyping } = payload || {};
      if (!appointmentId) return;
      const room = `appointment:${appointmentId}`;
      socket.to(room).emit('chat:typing', {
        userId,
        isTyping: Boolean(isTyping),
      });
    });

    // -----------------------------------------------------------------------
    // WebRTC SIGNALLING EVENTS (Relayed only between participants)
    // -----------------------------------------------------------------------

    socket.on('rtc:ready', async (payload) => {
      const appointmentId = payload?.appointmentId;
      if (!appointmentId) return;
      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) return;

      const room = `appointment:${appointmentId}`;
      socket.to(room).emit('rtc:ready', { from: userId });
    });

    socket.on('rtc:offer', async (payload) => {
      const { appointmentId, sdp } = payload || {};
      if (!appointmentId || !sdp) return;
      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) return;

      const room = `appointment:${appointmentId}`;
      socket.to(room).emit('rtc:offer', { from: userId, sdp });
    });

    socket.on('rtc:answer', async (payload) => {
      const { appointmentId, sdp } = payload || {};
      if (!appointmentId || !sdp) return;
      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) return;

      const room = `appointment:${appointmentId}`;
      socket.to(room).emit('rtc:answer', { from: userId, sdp });
    });

    socket.on('rtc:ice', async (payload) => {
      const { appointmentId, candidate } = payload || {};
      if (!appointmentId || !candidate) return;
      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) return;

      const room = `appointment:${appointmentId}`;
      socket.to(room).emit('rtc:ice', { from: userId, candidate });
    });

    /**
     * End consultation session (doctor or client)
     */
    socket.on('session:end', async (payload, callback) => {
      const appointmentId = payload?.appointmentId;
      if (!appointmentId) return;
      const access = await canAccessSession(userId, appointmentId);
      if (!access.allowed) return;

      const appointment = access.appointment;
      appointment.status = 'completed';
      appointment.sessionEndedAt = new Date();
      await appointment.save();

      const room = `appointment:${appointmentId}`;
      ioInstance.to(room).emit('session:ended', {
        status: 'completed',
        endedBy: userId,
        sessionEndedAt: appointment.sessionEndedAt,
      });

      if (typeof callback === 'function') callback({ success: true });
    });

    // -----------------------------------------------------------------------
    // DISCONNECT
    // -----------------------------------------------------------------------
    socket.on('disconnect', async () => {
      // Clean up session room memberships
      for (const [apptId, sockets] of sessionRooms.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          ioInstance.to(`appointment:${apptId}`).emit('session:participant_left', {
            userId,
            socketId: socket.id,
          });
          if (sockets.size === 0) {
            sessionRooms.delete(apptId);
          }
        }
      }

      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);

          try {
            const doctor = await Doctor.findOne({ userId });
            if (doctor && doctor.verificationStatus === 'verified' && doctor.presenceMode === 'auto') {
              const graceMs = (config.PRESENCE_GRACE_SECONDS || 60) * 1000;
              const timer = setTimeout(async () => {
                disconnectTimers.delete(userId);
                if (!userSockets.has(userId) || userSockets.get(userId).size === 0) {
                  try {
                    const doc = await Doctor.findOne({ userId });
                    if (doc && doc.presenceMode === 'auto') {
                      doc.isOnline = false;
                      doc.lastSeenAt = new Date();
                      await doc.save();
                      broadcastDoctorPresence(doc._id, false);
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
}
