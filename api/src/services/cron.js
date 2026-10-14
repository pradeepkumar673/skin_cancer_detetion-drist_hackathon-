import cron from 'node-cron';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { writeAudit } from '../utils/audit.js';
import { sendEmail } from './mailer.js';

let cronJob = null;

/**
 * Sweeps all appointments in status awaiting_payment whose paymentDeadlineAt has passed.
 * Sets status to expired, records audit log, and notifies patient by email.
 * Exported for deterministic unit testing.
 */
export async function runExpiryCheck() {
  const now = new Date();
  const expiredList = await Appointment.find({
    status: 'awaiting_payment',
    paymentDeadlineAt: { $lt: now },
  });

  if (expiredList.length === 0) {
    return 0;
  }

  logger.info({ count: expiredList.length }, 'Found expired awaiting_payment appointments to process');

  for (const appt of expiredList) {
    try {
      appt.status = 'expired';
      await appt.save();

      await writeAudit({
        action: 'APPOINTMENT_EXPIRED',
        entityType: 'Appointment',
        entityId: appt._id,
        meta: {
          scheduledAt: appt.scheduledAt,
          paymentDeadlineAt: appt.paymentDeadlineAt,
        },
      });

      // Load patient & doctor details to send email
      const patient = await Patient.findById(appt.patientId).populate('userId');
      const doctor = await Doctor.findById(appt.doctorId).populate('userId');

      if (patient?.userId?.email) {
        const scheduledTimeStr = appt.scheduledAt
          ? new Date(appt.scheduledAt).toLocaleString()
          : undefined;

        await sendEmail({
          to: patient.userId.email,
          template: 'expired',
          data: {
            patientFirstName: patient.userId.name.split(' ')[0],
            doctorName: doctor?.userId?.name || 'Physician',
            scheduledTime: scheduledTimeStr,
            bookingUrl: `${config.CLIENT_URL}/doctors/${doctor?._id || ''}`,
          },
        });
      }
    } catch (err) {
      logger.error({ err: err.message, appointmentId: appt._id }, 'Error processing expired appointment');
    }
  }

  return expiredList.length;
}

export function startCronJobs() {
  if (config.NODE_ENV === 'test') {
    return null; // Do not run automatic interval timers in test suite
  }

  // Sweep expired appointments every minute
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      await runExpiryCheck();
    } catch (err) {
      logger.error({ err: err.message }, 'Unhandled error in appointment expiry cron job');
    }
  });

  logger.info('Started background node-cron scheduler (appointment expiry every minute)');
  return cronJob;
}

export function stopCronJobs() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
