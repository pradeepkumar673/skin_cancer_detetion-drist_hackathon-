import { Router } from 'express';
import { requireAuth, requireVerifiedDoctor } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import validate from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import config from '../config/env.js';

import { Appointment } from '../models/Appointment.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Case } from '../models/Case.js';
import { Availability } from '../models/Availability.js';
import {
  createAppointmentSchema,
  scheduleAppointmentSchema,
  cancelAppointmentSchema,
  getAppointmentsQuerySchema,
} from '../validators/appointment.js';
import { sendEmail } from '../services/mailer.js';
import {
  getWeekdayInTimezone,
  formatDateInTimezone,
  formatTimeInTimezone,
} from '../utils/slots.js';

const router = Router();

/**
 * POST /appointments
 * Creates an appointment (instant or scheduled).
 */
router.post(
  '/',
  requireAuth,
  validate(createAppointmentSchema),
  asyncHandler(async (req, res) => {
    const { doctorId, mode, caseId, note, scheduledAt, kind: requestedKind } = req.body;

    // 1. Resolve patient record
    let patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      if (req.user.role === 'patient') {
        patient = await Patient.create({ userId: req.user._id });
      } else {
        throw new HttpError(403, 'Patient account required to book consultations', 'forbidden');
      }
    }

    // 2. Resolve verified doctor
    const doctor = await Doctor.findOne({ _id: doctorId, verificationStatus: 'verified' }).populate('userId');
    if (!doctor || !doctor.userId) {
      throw new HttpError(404, 'Physician not found or not verified', 'doctor_not_found');
    }

    // 3. Optional case verification
    if (caseId) {
      const caseDoc = await Case.findOne({ _id: caseId, patientId: patient._id });
      if (!caseDoc) {
        throw new HttpError(404, 'Screening case not found', 'case_not_found');
      }
    }

    const isOnline = Boolean(doctor.isOnline && doctor.presenceMode === 'auto');
    const isTalkNow = requestedKind === 'instant' || (isOnline && !scheduledAt);

    let kind = 'scheduled';
    let status = 'requested';
    let paymentDeadlineAt = undefined;

    if (isOnline && isTalkNow) {
      // Instant consultation path
      kind = 'instant';
      status = 'awaiting_payment';
      paymentDeadlineAt = new Date(Date.now() + (config.PAYMENT_WINDOW_MINUTES || 30) * 60 * 1000);
    } else {
      // Scheduled consultation path
      kind = 'scheduled';
      status = 'requested';
    }

    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      caseId: caseId || undefined,
      mode,
      kind,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      note: note ? note.trim() : undefined,
      paymentDeadlineAt,
    });

    await writeAudit({
      actorId: req.user._id,
      action: status === 'awaiting_payment' ? 'APPOINTMENT_CREATED' : 'APPOINTMENT_REQUESTED',
      entityType: 'Appointment',
      entityId: appointment._id,
      meta: { doctorId: doctor._id, mode, kind, status, scheduledAt },
      ip: clientIp(req),
    });

    // Send notification emails for scheduled requests
    if (status === 'requested') {
      const patientFirstName = req.user.name.split(' ')[0];
      const timeStr = scheduledAt ? new Date(scheduledAt).toLocaleString() : undefined;

      // Email doctor
      await sendEmail({
        to: doctor.userId.email,
        template: 'request_to_doctor',
        data: {
          doctorName: doctor.userId.name.replace(/^Dr\.?\s+/i, ''),
          patientFirstName,
          mode: mode.toUpperCase(),
          requestedTime: timeStr,
          dashboardUrl: `${config.CLIENT_URL}/doctor/dashboard`,
        },
      });

      // Email patient
      await sendEmail({
        to: req.user.email,
        template: 'request_received_to_patient',
        data: {
          patientFirstName,
          doctorName: doctor.userId.name,
          mode: mode.toUpperCase(),
          requestedTime: timeStr,
          appointmentsUrl: `${config.CLIENT_URL}/appointments`,
        },
      });
    }

    return res.status(201).json({ appointment });
  })
);

/**
 * PATCH /appointments/:id/schedule
 * Doctor confirms the schedule time, triggering awaiting_payment and patient confirmation email.
 */
router.patch(
  '/:id/schedule',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(scheduleAppointmentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scheduledAt, durationMin = 15 } = req.body;
    const doctor = req.doctor;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      throw new HttpError(404, 'Appointment not found', 'not_found');
    }

    if (!appointment.doctorId.equals(doctor._id)) {
      throw new HttpError(403, 'Unauthorized to schedule this appointment', 'forbidden');
    }

    if (appointment.status !== 'requested') {
      throw new HttpError(
        400,
        `Cannot schedule appointment in status '${appointment.status}'. Only 'requested' appointments can be scheduled.`,
        'invalid_status_transition'
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      throw new HttpError(400, 'Scheduled time must be in the future', 'invalid_schedule_time');
    }

    // Verify scheduled time falls inside physician weekly availability
    const availabilities = await Availability.find({ doctorId: doctor._id });
    const tz = availabilities[0]?.timezone || config.DEFAULT_TIMEZONE;
    const dateStr = formatDateInTimezone(scheduledDate, tz);
    const timeStr = formatTimeInTimezone(scheduledDate, tz);
    const weekday = getWeekdayInTimezone(dateStr, tz);

    // Check exceptions
    for (const a of availabilities) {
      for (const exc of a.exceptions || []) {
        const excStr = exc instanceof Date ? formatDateInTimezone(exc, tz) : String(exc).slice(0, 10);
        if (excStr === dateStr) {
          throw new HttpError(400, 'Physician has marked this date as an exception / leave', 'exception_date');
        }
      }
    }

    // Check weekday range match
    const matchingAvail = availabilities.filter(
      (a) => a.weekday === weekday && a.startTime <= timeStr && a.endTime > timeStr
    );
    if (matchingAvail.length === 0) {
      throw new HttpError(
        400,
        `Selected time ${timeStr} is outside physician availability hours for this weekday`,
        'outside_availability'
      );
    }

    // Set confirmed properties
    appointment.scheduledAt = scheduledDate;
    appointment.durationMin = durationMin;
    appointment.confirmedAt = new Date();
    appointment.status = 'awaiting_payment';
    appointment.paymentDeadlineAt = new Date(
      Date.now() + (config.PAYMENT_WINDOW_MINUTES || 30) * 60 * 1000
    );

    // Atomic double-booking protection: unique partial index on { doctorId, scheduledAt }
    try {
      await appointment.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new HttpError(
          409,
          'This time slot has already been booked for this physician.',
          'slot_conflict'
        );
      }
      throw err;
    }

    await writeAudit({
      actorId: req.user._id,
      action: 'APPOINTMENT_SCHEDULED',
      entityType: 'Appointment',
      entityId: appointment._id,
      meta: {
        scheduledAt: appointment.scheduledAt,
        durationMin: appointment.durationMin,
        paymentDeadlineAt: appointment.paymentDeadlineAt,
      },
      ip: clientIp(req),
    });

    // Populate patient and doctor user details for dual-timezone email
    const patient = await Patient.findById(appointment.patientId).populate('userId');
    const doctorUser = await Doctor.findById(doctor._id).populate('userId');

    if (patient?.userId?.email) {
      const patientTz = config.DEFAULT_TIMEZONE;
      const doctorTz = tz;

      const timeInPatientTz = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: patientTz,
      }).format(scheduledDate);

      const timeInDoctorTz = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: doctorTz,
      }).format(scheduledDate);

      await sendEmail({
        to: patient.userId.email,
        template: 'confirmed_to_patient',
        data: {
          patientFirstName: patient.userId.name.split(' ')[0],
          doctorName: doctorUser.userId.name,
          mode: appointment.mode.toUpperCase(),
          timeInPatientTimezone: `${timeInPatientTz} (${patientTz})`,
          timeInDoctorTimezone: `${timeInDoctorTz} (${doctorTz})`,
          paymentDeadlineMinutes: config.PAYMENT_WINDOW_MINUTES || 30,
          paymentUrl: `${config.CLIENT_URL}/appointments`,
        },
      });

      // Email doctor confirmation
      await sendEmail({
        to: doctorUser.userId.email,
        template: 'confirmed_to_doctor',
        data: {
          doctorName: doctorUser.userId.name.replace(/^Dr\.?\s+/i, ''),
          patientFirstName: patient.userId.name.split(' ')[0],
          mode: appointment.mode.toUpperCase(),
          scheduledTime: `${timeInDoctorTz} (${doctorTz})`,
          dashboardUrl: `${config.CLIENT_URL}/doctor/dashboard`,
        },
      });
    }

    return res.status(200).json({ appointment });
  })
);

/**
 * PATCH /appointments/:id/cancel
 * Cancels an appointment and releases reserved slots.
 */
router.patch(
  '/:id/cancel',
  requireAuth,
  validate(cancelAppointmentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      throw new HttpError(404, 'Appointment not found', 'not_found');
    }

    const patient = await Patient.findById(appointment.patientId).populate('userId');
    const doctor = await Doctor.findById(appointment.doctorId).populate('userId');

    const isPatient = patient && patient.userId._id.equals(req.user._id);
    const isDoctor = doctor && doctor.userId._id.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new HttpError(403, 'Unauthorized to cancel this appointment', 'forbidden');
    }

    const allowedCancelStatuses = ['requested', 'awaiting_payment', 'paid'];
    if (!allowedCancelStatuses.includes(appointment.status)) {
      throw new HttpError(
        400,
        `Cannot cancel appointment in status '${appointment.status}'.`,
        'invalid_status_transition'
      );
    }

    appointment.status = 'cancelled';
    appointment.cancelledReason = reason;
    appointment.cancelledBy = req.user._id;
    await appointment.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'APPOINTMENT_CANCELLED',
      entityType: 'Appointment',
      entityId: appointment._id,
      meta: { reason, cancelledByRole: req.user.role },
      ip: clientIp(req),
    });

    const scheduledTimeStr = appointment.scheduledAt
      ? new Date(appointment.scheduledAt).toLocaleString()
      : undefined;

    // Notify other party
    if (isPatient && doctor?.userId?.email) {
      await sendEmail({
        to: doctor.userId.email,
        template: 'cancelled',
        data: {
          recipientFirstName: doctor.userId.name.replace(/^Dr\.?\s+/i, ''),
          otherPartyName: patient.userId.name,
          scheduledTime: scheduledTimeStr,
          reason,
          appointmentsUrl: `${config.CLIENT_URL}/doctor/dashboard`,
        },
      });
    } else if (isDoctor && patient?.userId?.email) {
      await sendEmail({
        to: patient.userId.email,
        template: 'cancelled',
        data: {
          recipientFirstName: patient.userId.name.split(' ')[0],
          otherPartyName: doctor.userId.name,
          scheduledTime: scheduledTimeStr,
          reason,
          appointmentsUrl: `${config.CLIENT_URL}/appointments`,
        },
      });
    }

    return res.status(200).json({ appointment });
  })
);

/**
 * GET /appointments
 * Lists appointments for authenticated user.
 */
router.get(
  '/',
  requireAuth,
  validate(getAppointmentsQuerySchema),
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = {};
    if (status) {
      filter.status = status;
    }

    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user._id });
      if (!doctor) {
        return res.status(200).json({ appointments: [] });
      }
      filter.doctorId = doctor._id;
    } else if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient) {
        return res.status(200).json({ appointments: [] });
      }
      filter.patientId = patient._id;
    }

    const appointments = await Appointment.find(filter)
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email' },
      })
      .populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'name email' },
      })
      .populate('caseId', 'lesionLabel bodySite status')
      .sort({ scheduledAt: -1, requestedAt: -1 });

    const formatted = appointments.map((appt) => {
      const doc = appt.doctorId;
      const pat = appt.patientId;
      return {
        id: String(appt._id),
        mode: appt.mode,
        kind: appt.kind,
        status: appt.status,
        scheduledAt: appt.scheduledAt,
        durationMin: appt.durationMin,
        note: appt.note,
        requestedAt: appt.requestedAt,
        confirmedAt: appt.confirmedAt,
        paymentDeadlineAt: appt.paymentDeadlineAt,
        cancelledReason: appt.cancelledReason,
        doctor: doc
          ? {
              id: String(doc._id),
              name: doc.userId?.name || 'Physician',
              specialty: doc.specialty,
              feesINR: {
                chat: Math.round((doc.fees?.chat || 0) / 100),
                audio: Math.round((doc.fees?.audio || 0) / 100),
                video: Math.round((doc.fees?.video || 0) / 100),
              },
            }
          : null,
        patient: pat
          ? {
              id: String(pat._id),
              name: pat.userId?.name || 'Patient',
            }
          : null,
        case: appt.caseId
          ? {
              id: String(appt.caseId._id),
              label: appt.caseId.lesionLabel || 'Screening Case',
              bodySite: appt.caseId.bodySite,
            }
          : null,
      };
    });

    return res.status(200).json({ appointments: formatted });
  })
);

/**
 * GET /appointments/:id
 * Fetches appointment details.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id)
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email' },
      })
      .populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'name email' },
      })
      .populate('caseId');

    if (!appointment) {
      throw new HttpError(404, 'Appointment not found', 'not_found');
    }

    return res.status(200).json({ appointment });
  })
);

export default router;
