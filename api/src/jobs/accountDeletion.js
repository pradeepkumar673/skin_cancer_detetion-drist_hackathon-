import config from '../config/env.js';
import logger from '../utils/logger.js';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Case } from '../models/Case.js';
import { Analysis } from '../models/Analysis.js';
import { Report } from '../models/Report.js';
import { WoundMeasurement } from '../models/WoundMeasurement.js';
import { Message } from '../models/Message.js';
import { Consent } from '../models/Consent.js';
import { Payment } from '../models/Payment.js';
import { AuditLog } from '../models/AuditLog.js';
import { deleteCaseStorage } from '../services/storage.js';
import { writeAudit } from '../utils/audit.js';

/**
 * Permanently removes user accounts and clinical data past DELETION_GRACE_DAYS.
 * Keeps only financial payments in anonymised form for statutory tax and accounting rules.
 */
export async function runAccountDeletion() {
  const now = Date.now();
  const graceDays = config.DELETION_GRACE_DAYS || 30;
  const cutoff = new Date(now - graceDays * 86400000);

  const pendingUsers = await User.find({
    deletionRequestedAt: { $exists: true, $ne: null, $lte: cutoff },
  });

  let accountsDeleted = 0;

  for (const user of pendingUsers) {
    try {
      const patient = await Patient.findOne({ userId: user._id });
      if (patient) {
        // Delete all patient cases and associated image files on disk
        const cases = await Case.find({ patientId: patient._id });
        for (const c of cases) {
          await deleteCaseStorage(patient._id, c._id);
          await Promise.all([
            Analysis.deleteMany({ caseId: c._id }),
            Report.deleteMany({ caseId: c._id }),
            WoundMeasurement.deleteMany({ caseId: c._id }),
          ]);
        }
        await Case.deleteMany({ patientId: patient._id });

        // Anonymise payments for statutory financial auditing
        await Payment.updateMany(
          { patientId: patient._id },
          { $set: { patientId: null, anonymized: true, notes: { anonymized: true } } }
        );

        // Delete consents
        await Consent.deleteMany({ patientId: patient._id });
        await Patient.deleteOne({ _id: patient._id });
      }

      // If doctor, remove doctor document
      await Doctor.deleteOne({ userId: user._id });

      // Remove messages sent by user
      await Message.deleteMany({ senderId: user._id });

      // Delete user account document
      await User.deleteOne({ _id: user._id });

      accountsDeleted++;
    } catch (err) {
      logger.error({ err: err.message, userId: user._id }, 'Error during permanent account deletion');
    }
  }

  if (accountsDeleted > 0) {
    await writeAudit({
      action: 'ACCOUNT_DELETION_SWEEP',
      entityType: 'System',
      meta: { accountsDeleted, graceDays },
    });
  }

  logger.info({ accountsDeleted }, 'Account deletion sweep completed');
  return { accountsDeleted };
}
