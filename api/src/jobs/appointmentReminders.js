import config from '../config/env.js';
import logger from '../utils/logger.js';
import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { sendEmail } from '../services/mailer.js';
import { writeAudit } from '../utils/audit.js';

/**
 * Sweeps upcoming scheduled appointments within 24h and 1h windows.
 * Atomically marks reminderSent flag to prevent duplicate notification across instances.
 * Notifies both patient and attending physician.
 */
export async function runAppointmentReminders() {
  const now = Date.now();
  const windowMs = (config.REMINDER_WINDOW_MINUTES || 15) * 60 * 1000;

  // Window bounds for 24h reminder
  const target24h = now + 24 * 60 * 60 * 1000;
  const start24h = new Date(target24h - windowMs);
  const end24h = new Date(target24h + windowMs);

  // Window bounds for 1h reminder
  const target1h = now + 1 * 60 * 60 * 1000;
  const start1h = new Date(target1h - windowMs);
  const end1h = new Date(target1h + windowMs);

  let h24Sent = 0;
  let h1Sent = 0;

  // 1. Process 24-hour reminders
  const candidates24h = await Appointment.find({
    status: { $in: ['paid', 'awaiting_payment'] },
    kind: 'scheduled',
    scheduledAt: { $gte: start24h, $lte: end24h },
    'reminderSent.h24': { $ne: true },
  });

  for (const appt of candidates24h) {
    try {
      const locked = await Appointment.findOneAndUpdate(
        { _id: appt._id, 'reminderSent.h24': { $ne: true } },
        { $set: { 'reminderSent.h24': true } },
        { new: true }
      );

      if (!locked) continue; // Concurrently claimed

      await dispatchReminders(locked, '24 hours');
      h24Sent++;
    } catch (err) {
      logger.error({ err: err.message, appointmentId: appt._id }, 'Failed to dispatch 24h appointment reminder');
    }
  }

  // 2. Process 1-hour reminders
  const candidates1h = await Appointment.find({
    status: { $in: ['paid', 'awaiting_payment'] },
    kind: 'scheduled',
    scheduledAt: { $gte: start1h, $lte: end1h },
    'reminderSent.h1': { $ne: true },
  });

  for (const appt of candidates1h) {
    try {
      const locked = await Appointment.findOneAndUpdate(
        { _id: appt._id, 'reminderSent.h1': { $ne: true } },
        { $set: { 'reminderSent.h1': true } },
        { new: true }
      );

      if (!locked) continue; // Concurrently claimed

      await dispatchReminders(locked, '1 hour');
      h1Sent++;
    } catch (err) {
      logger.error({ err: err.message, appointmentId: appt._id }, 'Failed to dispatch 1h appointment reminder');
    }
  }

  logger.info({ h24Sent, h1Sent }, 'Appointment reminders run complete');
  return { h24Sent, h1Sent };
}

async function dispatchReminders(appointment, timeHorizon) {
  const patient = await Patient.findById(appointment.patientId).populate('userId');
  const doctor = await Doctor.findById(appointment.doctorId).populate('userId');

  const patientName = patient?.userId?.name || 'Patient';
  const doctorName = doctor?.userId?.name || 'Physician';
  const patientFirstName = patientName.split(' ')[0];
  const doctorFirstName = doctorName.split(' ')[0];

  const scheduledTimeStr = appointment.scheduledAt
    ? new Date(appointment.scheduledAt).toLocaleString('en-IN', { timeZone: config.DEFAULT_TIMEZONE })
    : 'Scheduled time';

  const sessionUrl = `${config.CLIENT_URL}/consult/${appointment._id}`;

  // Send to patient
  if (patient?.userId?.email) {
    await sendEmail({
      to: patient.userId.email,
      template: 'reminder',
      data: {
        recipientFirstName: patientFirstName,
        otherPartyName: doctorName,
        mode: appointment.mode,
        scheduledTime: scheduledTimeStr,
        sessionUrl,
      },
    });
  }

  // Send to doctor
  if (doctor?.userId?.email) {
    await sendEmail({
      to: doctor.userId.email,
      template: 'reminder',
      data: {
        recipientFirstName: doctorFirstName,
        otherPartyName: patientName,
        mode: appointment.mode,
        scheduledTime: scheduledTimeStr,
        sessionUrl,
      },
    });
  }

  await writeAudit({
    action: 'APPOINTMENT_REMINDER_SENT',
    entityType: 'Appointment',
    entityId: appointment._id,
    meta: {
      timeHorizon,
      scheduledAt: appointment.scheduledAt,
      patientEmail: patient?.userId?.email,
      doctorEmail: doctor?.userId?.email,
    },
  });
}
