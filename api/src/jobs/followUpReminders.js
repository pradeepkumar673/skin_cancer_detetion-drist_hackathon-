import config from '../config/env.js';
import logger from '../utils/logger.js';
import { Case } from '../models/Case.js';
import { Patient } from '../models/Patient.js';
import { sendEmail } from '../services/mailer.js';
import { writeAudit } from '../utils/audit.js';

/**
 * Sweeps cases with due follow-up dates where no subsequent case for the same lesion has been submitted.
 * Notifies patient to capture a routine comparison photograph.
 * Never includes diagnosis or diagnostic metrics in notification.
 */
export async function runFollowUpReminders() {
  const now = new Date();

  const dueCases = await Case.find({
    status: 'completed',
    followUpAt: { $lte: now },
    followUpReminderSent: { $ne: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const c of dueCases) {
    try {
      // Check if a newer case exists for the same patient and lesion label
      if (c.lesionLabel) {
        const newerCase = await Case.findOne({
          patientId: c.patientId,
          lesionLabel: c.lesionLabel,
          createdAt: { $gt: c.createdAt },
        });

        if (newerCase) {
          // Patient already took a newer photo of this lesion
          await Case.findByIdAndUpdate(c._id, { $set: { followUpReminderSent: true } });
          skipped++;
          continue;
        }
      }

      const locked = await Case.findOneAndUpdate(
        { _id: c._id, followUpReminderSent: { $ne: true } },
        { $set: { followUpReminderSent: true } },
        { new: true }
      );

      if (!locked) continue; // Concurrently processed

      const patient = await Patient.findById(c.patientId).populate('userId');
      if (patient?.userId?.email) {
        const patientName = patient.userId.name || 'Patient';
        const firstName = patientName.split(' ')[0];
        const newCaseUrl = `${config.CLIENT_URL}/cases/new?label=${encodeURIComponent(c.lesionLabel || '')}`;

        await sendEmail({
          to: patient.userId.email,
          template: 'follow_up_reminder',
          data: {
            recipientFirstName: firstName,
            lesionLabel: c.lesionLabel,
            newCaseUrl,
          },
        });

        await writeAudit({
          action: 'FOLLOW_UP_REMINDER_SENT',
          entityType: 'Case',
          entityId: c._id,
          meta: {
            lesionLabel: c.lesionLabel,
            followUpAt: c.followUpAt,
            patientEmail: patient.userId.email,
          },
        });

        sent++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.error({ err: err.message, caseId: c._id }, 'Failed to process follow-up reminder');
    }
  }

  logger.info({ sent, skipped }, 'Follow-up reminders run complete');
  return { sent, skipped };
}
