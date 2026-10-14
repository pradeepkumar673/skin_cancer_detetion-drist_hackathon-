import { Router } from 'express';
import { requireAuth, requireVerifiedDoctor } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import validate from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import config from '../config/env.js';
import { Doctor } from '../models/Doctor.js';
import { Availability } from '../models/Availability.js';
import { Appointment } from '../models/Appointment.js';
import {
  updateProfileSchema,
  updateFeesSchema,
  updateAvailabilitySchema,
  updatePresenceSchema,
  getDoctorsQuerySchema,
  getDoctorByIdSchema,
  getDoctorSlotsSchema,
} from '../validators/doctor.js';
import { computeAvailableSlots, formatDateInTimezone } from '../utils/slots.js';
import { broadcastDoctorPresence, getConnectedSockets } from '../services/socket.js';

const router = Router();

// -------------------------------------------------------------------------
// Doctor Self-Service Endpoints (Doctor Role)
// -------------------------------------------------------------------------

/**
 * GET /doctors/me
 * Returns current doctor's full profile, availability, and fees.
 */
router.get(
  '/me',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;

    const availabilities = await Availability.find({ doctorId: doctor._id });
    const exceptionsSet = new Set();
    const tz = availabilities[0]?.timezone || config.DEFAULT_TIMEZONE;

    availabilities.forEach((a) => {
      (a.exceptions || []).forEach((exc) => {
        exceptionsSet.add(exc instanceof Date ? formatDateInTimezone(exc, tz) : String(exc).slice(0, 10));
      });
    });

    const isOnline = Boolean(doctor.isOnline && doctor.presenceMode === 'auto');

    return res.status(200).json({
      doctor: {
        id: String(doctor._id),
        name: req.user.name,
        email: req.user.email,
        specialty: doctor.specialty,
        registrationNumber: doctor.registrationNumber,
        verificationStatus: doctor.verificationStatus,
        bio: doctor.bio || null,
        presenceMode: doctor.presenceMode,
        isOnline,
        fees: doctor.fees,
        feesINR: {
          chat: Math.round((doctor.fees?.chat || 0) / 100),
          audio: Math.round((doctor.fees?.audio || 0) / 100),
          video: Math.round((doctor.fees?.video || 0) / 100),
        },
        isVerified: true,
        weekly: availabilities.map((a) => ({
          id: String(a._id),
          weekday: a.weekday,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        exceptions: Array.from(exceptionsSet).sort(),
        timezone: tz,
      },
    });
  })
);

/**
 * PUT /doctors/me/profile
 * Updates specialty and bio for verified doctor.
 */
router.put(
  '/me/profile',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;
    const { specialty, bio } = req.body;

    if (specialty) doctor.specialty = specialty;
    if (bio !== undefined) doctor.bio = bio;
    await doctor.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'DOCTOR_PROFILE_UPDATED',
      entityType: 'Doctor',
      entityId: doctor._id,
      meta: { specialty: doctor.specialty, hasBio: Boolean(doctor.bio) },
      ip: clientIp(req),
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      doctor: {
        id: String(doctor._id),
        specialty: doctor.specialty,
        bio: doctor.bio,
      },
    });
  })
);

/**
 * PUT /doctors/me/fees
 * Updates consultation fees in whole INR rupees. Stored in paise.
 */
router.put(
  '/me/fees',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(updateFeesSchema),
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;
    const { chat, audio, video } = req.body;

    // Store in paise
    doctor.fees = {
      chat: Math.round(chat * 100),
      audio: Math.round(audio * 100),
      video: Math.round(video * 100),
    };
    await doctor.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'DOCTOR_FEES_UPDATED',
      entityType: 'Doctor',
      entityId: doctor._id,
      meta: { feesINR: { chat, audio, video }, feesPaise: doctor.fees },
      ip: clientIp(req),
    });

    return res.status(200).json({
      message: 'Consultation fees updated successfully',
      fees: doctor.fees,
      feesINR: { chat, audio, video },
    });
  })
);

/**
 * PUT /doctors/me/availability
 * Sets weekly availability schedules and exception dates.
 */
router.put(
  '/me/availability',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(updateAvailabilitySchema),
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;
    const { weekly = [], exceptions = [], timezone = config.DEFAULT_TIMEZONE } = req.body;

    // Parse exception dates
    const parsedExceptions = exceptions.map((e) => new Date(`${e}T00:00:00Z`));

    // Clear previous availability records
    await Availability.deleteMany({ doctorId: doctor._id });

    // Insert new weekly availability ranges
    const docsToInsert = weekly.map((item) => ({
      doctorId: doctor._id,
      weekday: item.weekday,
      startTime: item.startTime,
      endTime: item.endTime,
      timezone,
      exceptions: parsedExceptions,
    }));

    if (docsToInsert.length > 0) {
      await Availability.insertMany(docsToInsert);
    } else if (parsedExceptions.length > 0) {
      // Store default interval record if only exceptions were provided
      await Availability.create({
        doctorId: doctor._id,
        weekday: 0,
        startTime: '00:00',
        endTime: '00:00',
        timezone,
        exceptions: parsedExceptions,
      });
    }

    await writeAudit({
      actorId: req.user._id,
      action: 'DOCTOR_AVAILABILITY_UPDATED',
      entityType: 'Availability',
      entityId: doctor._id,
      meta: { weeklyCount: weekly.length, exceptionsCount: exceptions.length, timezone },
      ip: clientIp(req),
    });

    return res.status(200).json({
      message: 'Weekly availability updated successfully',
      weekly,
      exceptions,
      timezone,
    });
  })
);

/**
 * PATCH /doctors/me/presence
 * Toggles auto vs offline presence mode.
 */
router.patch(
  '/me/presence',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(updatePresenceSchema),
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;
    const { mode } = req.body;

    doctor.presenceMode = mode;

    if (mode === 'offline') {
      doctor.isOnline = false;
      doctor.lastSeenAt = new Date();
      await doctor.save();
      broadcastDoctorPresence(doctor._id, false);
    } else {
      // Auto mode: check if doctor has connected sockets
      const activeSockets = getConnectedSockets(doctor.userId);
      doctor.isOnline = activeSockets.length > 0;
      doctor.lastSeenAt = new Date();
      await doctor.save();
      broadcastDoctorPresence(doctor._id, doctor.isOnline);
    }

    await writeAudit({
      actorId: req.user._id,
      action: 'DOCTOR_PRESENCE_UPDATED',
      entityType: 'Doctor',
      entityId: doctor._id,
      meta: { presenceMode: doctor.presenceMode, isOnline: doctor.isOnline },
      ip: clientIp(req),
    });

    return res.status(200).json({
      doctorId: String(doctor._id),
      presenceMode: doctor.presenceMode,
      isOnline: doctor.isOnline,
    });
  })
);

// -------------------------------------------------------------------------
// Public Endpoints (Accessible to all authenticated users)
// -------------------------------------------------------------------------

/**
 * GET /doctors
 * Lists verified doctors. Sorted online first, then by name.
 */
router.get(
  '/',
  requireAuth,
  validate(getDoctorsQuerySchema),
  asyncHandler(async (req, res) => {
    const { specialty, online } = req.query;

    const filter = { verificationStatus: 'verified' };
    if (specialty) {
      filter.specialty = specialty;
    }
    if (online === true) {
      filter.isOnline = true;
      filter.presenceMode = 'auto';
    } else if (online === false) {
      filter.$or = [{ isOnline: false }, { presenceMode: 'offline' }];
    }

    const doctors = await Doctor.find(filter).populate('userId', 'name email');

    const formatted = doctors
      .filter((d) => Boolean(d.userId))
      .map((d) => {
        const isOnline = Boolean(d.isOnline && d.presenceMode === 'auto');
        return {
          id: String(d._id),
          userId: String(d.userId._id),
          name: d.userId.name,
          specialty: d.specialty,
          bio: d.bio || '',
          isOnline,
          presenceMode: d.presenceMode,
          lastSeenAt: d.lastSeenAt,
          fees: {
            chat: d.fees?.chat || 0,
            audio: d.fees?.audio || 0,
            video: d.fees?.video || 0,
            chatINR: Math.round((d.fees?.chat || 0) / 100),
            audioINR: Math.round((d.fees?.audio || 0) / 100),
            videoINR: Math.round((d.fees?.video || 0) / 100),
          },
        };
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) {
          return a.isOnline ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    return res.status(200).json({ doctors: formatted });
  })
);

/**
 * GET /doctors/:id
 * Fetches verified doctor's public profile and fees.
 */
router.get(
  '/:id',
  requireAuth,
  validate(getDoctorByIdSchema),
  asyncHandler(async (req, res) => {
    const doctor = await Doctor.findOne({
      _id: req.params.id,
      verificationStatus: 'verified',
    }).populate('userId', 'name email');

    if (!doctor || !doctor.userId) {
      throw new HttpError(404, 'Doctor not found or not verified', 'doctor_not_found');
    }

    const availabilities = await Availability.find({ doctorId: doctor._id });
    const tz = availabilities[0]?.timezone || config.DEFAULT_TIMEZONE;
    const isOnline = Boolean(doctor.isOnline && doctor.presenceMode === 'auto');

    return res.status(200).json({
      doctor: {
        id: String(doctor._id),
        name: doctor.userId.name,
        specialty: doctor.specialty,
        bio: doctor.bio || '',
        isOnline,
        presenceMode: doctor.presenceMode,
        lastSeenAt: doctor.lastSeenAt,
        fees: {
          chat: doctor.fees?.chat || 0,
          audio: doctor.fees?.audio || 0,
          video: doctor.fees?.video || 0,
          chatINR: Math.round((doctor.fees?.chat || 0) / 100),
          audioINR: Math.round((doctor.fees?.audio || 0) / 100),
          videoINR: Math.round((doctor.fees?.video || 0) / 100),
        },
        weeklySummary: availabilities
          .filter((a) => a.startTime !== '00:00' || a.endTime !== '00:00')
          .map((a) => ({
            weekday: a.weekday,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        timezone: tz,
      },
    });
  })
);

/**
 * GET /doctors/:id/slots?date=YYYY-MM-DD
 * Computes available booking slots for a verified doctor on a given date.
 */
router.get(
  '/:id/slots',
  requireAuth,
  validate(getDoctorSlotsSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;

    const doctor = await Doctor.findOne({
      _id: id,
      verificationStatus: 'verified',
    });

    if (!doctor) {
      throw new HttpError(404, 'Doctor not found or not verified', 'doctor_not_found');
    }

    const availabilities = await Availability.find({ doctorId: doctor._id });
    const tz = availabilities[0]?.timezone || config.DEFAULT_TIMEZONE;

    // Fetch conflicting scheduled appointments
    const searchDate = new Date(`${date}T00:00:00.000Z`);
    const dayBefore = new Date(searchDate.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(searchDate.getTime() + 48 * 60 * 60 * 1000);

    const appointments = await Appointment.find({
      doctorId: doctor._id,
      status: { $in: ['awaiting_payment', 'paid', 'in_progress'] },
      scheduledAt: { $gte: dayBefore, $lte: dayAfter },
    });

    const slots = computeAvailableSlots({
      dateStr: date,
      availabilities,
      appointments,
      timezone: tz,
      slotDurationMin: 15,
    });

    return res.status(200).json({
      doctorId: String(doctor._id),
      date,
      timezone: tz,
      slots,
    });
  })
);

export default router;
