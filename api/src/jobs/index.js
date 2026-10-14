import cron from 'node-cron';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { runExpiryCheck } from '../services/cron.js';
import { runAppointmentReminders } from './appointmentReminders.js';
import { runFollowUpReminders } from './followUpReminders.js';
import { runRetentionCleanup } from './retentionCleanup.js';
import { runAccountDeletion } from './accountDeletion.js';

const scheduledTasks = [];

/**
 * Registry of background worker jobs.
 */
export const JOBS_REGISTRY = {
  appointment_expiry: runExpiryCheck,
  appointmentExpiry: runExpiryCheck,
  appointment_reminders: runAppointmentReminders,
  appointmentReminders: runAppointmentReminders,
  follow_up_reminders: runFollowUpReminders,
  followUpReminders: runFollowUpReminders,
  retention_cleanup: runRetentionCleanup,
  retentionCleanup: runRetentionCleanup,
  account_deletion: runAccountDeletion,
  accountDeletion: runAccountDeletion,
};

/**
 * Executes a named job on demand. Used by tests and admin endpoint.
 */
export async function runNamedJob(jobName) {
  const handler = JOBS_REGISTRY[jobName];
  if (!handler) {
    throw new Error(`Unknown job: ${jobName}`);
  }
  return await handler();
}

/**
 * Initializes all node-cron scheduled tasks.
 */
export function startAllJobs() {
  if (config.NODE_ENV === 'test') {
    return; // Don't run automated timers in test mode
  }

  // 1. Appointment Expiry (every minute)
  const taskExpiry = cron.schedule('* * * * *', async () => {
    try {
      await runExpiryCheck();
    } catch (err) {
      logger.error({ err: err.message }, 'Unhandled error in appointment expiry job');
    }
  });
  scheduledTasks.push(taskExpiry);

  // 2. Appointment Reminders (every minute)
  const taskReminders = cron.schedule('* * * * *', async () => {
    try {
      await runAppointmentReminders();
    } catch (err) {
      logger.error({ err: err.message }, 'Unhandled error in appointment reminders job');
    }
  });
  scheduledTasks.push(taskReminders);

  // 3. Follow-up Reminders (Daily at 08:00)
  const taskFollowUp = cron.schedule('0 8 * * *', async () => {
    try {
      await runFollowUpReminders();
    } catch (err) {
      logger.error({ err: err.message }, 'Unhandled error in follow-up reminders job');
    }
  });
  scheduledTasks.push(taskFollowUp);

  // 4. Data Retention Cleanup (Daily at 02:00)
  const taskRetention = cron.schedule('0 2 * * *', async () => {
    try {
      await runRetentionCleanup();
    } catch (err) {
      logger.error({ err: err.message }, 'Unhandled error in retention cleanup job');
    }
  });
  scheduledTasks.push(taskRetention);

  logger.info('Scheduled all background jobs (expiry, reminders, follow-up, retention)');
}

/**
 * Stops all running cron tasks during graceful shutdown.
 */
export function stopAllJobs() {
  for (const task of scheduledTasks) {
    try {
      task.stop();
    } catch {
      // ignore
    }
  }
  scheduledTasks.length = 0;
}
