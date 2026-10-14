import nodemailer from 'nodemailer';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { EmailLog } from '../models/EmailLog.js';

// Import all templates
import { requestForDoctor } from '../templates/request_to_doctor.js';
import { requestReceivedToPatient } from '../templates/request_received_to_patient.js';
import { confirmedToPatient } from '../templates/confirmed_to_patient.js';
import { confirmedForDoctor } from '../templates/confirmed_to_doctor.js';
import { paymentReceivedForDoctor } from '../templates/payment_received_to_doctor.js';
import { receiptToPatient } from '../templates/receipt_to_patient.js';
import { cancelled } from '../templates/cancelled.js';
import { expired } from '../templates/expired.js';
import { reminder } from '../templates/reminder.js';
import { refundToPatient } from '../templates/refund_to_patient.js';
import { followUpReminder } from '../templates/follow_up_reminder.js';

const TEMPLATE_MAP = {
  request_to_doctor: requestForDoctor,
  request_received_to_patient: requestReceivedToPatient,
  confirmed_to_patient: confirmedToPatient,
  confirmed_to_doctor: confirmedForDoctor,
  payment_received_to_doctor: paymentReceivedForDoctor,
  receipt_to_patient: receiptToPatient,
  cancelled: cancelled,
  expired: expired,
  reminder: reminder,
  refund_to_patient: refundToPatient,
  follow_up_reminder: followUpReminder,
};

let mailStatus = 'failed';
let transporterInstance = null;

export function getTransporter() {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT || 587,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: config.NODE_ENV === 'production',
      },
    });
  }
  return transporterInstance;
}

export function setTransporter(customTransporter) {
  transporterInstance = customTransporter;
  mailStatus = 'ok';
}

export function getMailStatus() {
  return mailStatus;
}

export async function verifyMailer() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    mailStatus = 'ok';
    logger.info({ host: config.SMTP_HOST, port: config.SMTP_PORT }, 'SMTP email transporter verified successfully');
    return true;
  } catch (err) {
    mailStatus = 'failed';
    logger.warn(
      { err: err.message, host: config.SMTP_HOST, port: config.SMTP_PORT },
      'SMTP email transporter verification failed. Mail state marked failed in /health'
    );
    return false;
  }
}

/**
 * Sends an email using a registered template.
 * Automatically retries once on failure and records the result in EmailLog.
 * Never throws an error that interrupts the API caller.
 */
export async function sendEmail({ to, template, data }) {
  const templateFn = TEMPLATE_MAP[template];
  if (!templateFn) {
    const errorMsg = `Email template not found: ${template}`;
    logger.error({ template, to }, errorMsg);
    await EmailLog.create({
      to,
      template,
      status: 'failed',
      error: errorMsg,
      at: new Date(),
    });
    return { success: false, error: errorMsg };
  }

  const { subject, text, html } = templateFn(data);
  const transporter = getTransporter();

  const mailOptions = {
    from: config.MAIL_FROM,
    to,
    subject,
    text,
    html,
  };

  // Attempt send with 1 retry on failure
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      logger.info(
        { to, template, messageId: info.messageId, attempt },
        'Email successfully dispatched'
      );

      await EmailLog.create({
        to,
        template,
        status: 'sent',
        messageId: info.messageId,
        at: new Date(),
      });

      return { success: true, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      logger.warn(
        { err: err.message, to, template, attempt },
        `Email dispatch attempt ${attempt} failed`
      );
      if (attempt === 1) {
        // Small backoff before single retry
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // If both attempts failed, log failure and return cleanly
  const failureMessage = lastError ? lastError.message : 'Unknown mail error';
  await EmailLog.create({
    to,
    template,
    status: 'failed',
    error: failureMessage,
    at: new Date(),
  });

  return { success: false, error: failureMessage };
}
