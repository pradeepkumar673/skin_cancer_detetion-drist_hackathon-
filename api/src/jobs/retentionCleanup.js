import config from '../config/env.js';
import logger from '../utils/logger.js';
import { Case } from '../models/Case.js';
import { Analysis } from '../models/Analysis.js';
import { Report } from '../models/Report.js';
import { WoundMeasurement } from '../models/WoundMeasurement.js';
import { AuditLog } from '../models/AuditLog.js';
import { deleteCaseStorage } from '../services/storage.js';
import { writeAudit } from '../utils/audit.js';

/**
 * Removes medical images, analysis artifacts, and case records older than RETENTION_CASE_DAYS.
 * Truncates operational audit logs older than RETENTION_AUDIT_DAYS.
 * Writes a single consolidated audit entry summarizing the operation.
 */
export async function runRetentionCleanup() {
  const now = Date.now();
  const caseRetentionDays = config.RETENTION_CASE_DAYS || 365;
  const auditRetentionDays = config.RETENTION_AUDIT_DAYS || 1825;

  const caseCutoff = new Date(now - caseRetentionDays * 86400000);
  const auditCutoff = new Date(now - auditRetentionDays * 86400000);

  // 1. Clean expired cases and storage
  const expiredCases = await Case.find({ createdAt: { $lt: caseCutoff } });
  let casesDeleted = 0;

  for (const c of expiredCases) {
    try {
      await deleteCaseStorage(c.patientId, c._id);
      await Promise.all([
        Analysis.deleteMany({ caseId: c._id }),
        Report.deleteMany({ caseId: c._id }),
        WoundMeasurement.deleteMany({ caseId: c._id }),
        Case.findByIdAndDelete(c._id),
      ]);
      casesDeleted++;
    } catch (err) {
      logger.error({ err: err.message, caseId: c._id }, 'Error cleaning up expired case');
    }
  }

  // 2. Clean expired audit logs
  let auditLogsDeleted = 0;
  try {
    const res = await AuditLog.deleteMany({ at: { $lt: auditCutoff } });
    auditLogsDeleted = res.deletedCount || 0;
  } catch (err) {
    logger.error({ err: err.message }, 'Error purging expired audit logs');
  }

  // 3. Write summary audit log entry
  await writeAudit({
    action: 'RETENTION_CLEANUP',
    entityType: 'System',
    meta: {
      casesDeleted,
      auditLogsDeleted,
      caseRetentionDays,
      auditRetentionDays,
    },
  });

  logger.info({ casesDeleted, auditLogsDeleted }, 'Retention cleanup completed successfully');
  return { casesDeleted, auditLogsDeleted };
}
