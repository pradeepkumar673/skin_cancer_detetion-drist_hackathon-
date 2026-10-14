import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import validateRequest from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import logger from '../utils/logger.js';
import { Appointment } from '../models/Appointment.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { Payment } from '../models/Payment.js';
import { createOrderSchema, verifyPaymentSchema } from '../validators/payment.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../services/razorpay.js';
import { receiptToPatient } from '../templates/receipt_to_patient.js';
import { paymentReceivedForDoctor } from '../templates/payment_received_to_doctor.js';
import { sendEmail } from '../services/mailer.js';

const router = Router();

// Rate limiting for payments
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many payment requests. Please try again later.',
  },
});

router.use(paymentLimiter);

/**
 * Helper to ensure req.patient is available
 */
async function attachPatient(req) {
  if (!req.patient) {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      throw new HttpError(404, 'Patient profile not found', 'patient_not_found');
    }
    req.patient = patient;
  }
}

/**
 * Helper to format date string safely
 */
function formatScheduledTime(date) {
  if (!date) return 'Instant consultation';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: config.DEFAULT_TIMEZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

/**
 * POST /payments/order
 * Creates or reuses a Razorpay order for an awaiting_payment appointment.
 * Amount is strictly computed from the doctor's stored fee for the appointment mode.
 */
router.post(
  '/order',
  requireAuth,
  requireRole('patient'),
  validateRequest(createOrderSchema),
  asyncHandler(async (req, res) => {
    await attachPatient(req);

    const { appointmentId } = req.body;
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      throw new HttpError(404, 'Appointment not found', 'not_found');
    }

    if (!appointment.patientId.equals(req.patient._id)) {
      throw new HttpError(403, 'Forbidden: You do not own this appointment', 'forbidden');
    }

    if (appointment.status !== 'awaiting_payment') {
      throw new HttpError(400, 'Appointment is not awaiting payment', 'invalid_status');
    }

    // Check payment deadline
    if (appointment.paymentDeadlineAt && new Date() > appointment.paymentDeadlineAt) {
      throw new HttpError(400, 'Payment window for this appointment has expired', 'payment_window_expired');
    }

    // Fetch doctor to determine fee
    const doctor = await Doctor.findById(appointment.doctorId);
    if (!doctor) {
      throw new HttpError(404, 'Doctor not found', 'not_found');
    }

    // Compute amount ONLY from doctor's stored fee (integers in paise)
    const amountPaise = doctor.fees?.[appointment.mode];
    if (typeof amountPaise !== 'number' || amountPaise <= 0 || !Number.isInteger(amountPaise)) {
      throw new HttpError(400, 'Doctor fee for this consultation mode is not configured properly', 'invalid_fee');
    }

    // Reuse existing unpaid order if one already exists for this appointment
    const existingPayment = await Payment.findOne({
      appointmentId: appointment._id,
      status: 'created',
    });

    if (existingPayment) {
      return res.status(200).json({
        orderId: existingPayment.razorpayOrderId,
        amount: existingPayment.amountPaise,
        currency: existingPayment.currency,
        keyId: config.RAZORPAY_KEY_ID,
      });
    }

    // Create order in Razorpay
    const order = await createRazorpayOrder({
      amount: amountPaise,
      currency: 'INR',
      receipt: String(appointment._id),
      notes: {
        appointmentId: String(appointment._id),
      },
    });

    const payment = await Payment.create({
      appointmentId: appointment._id,
      patientId: req.patient._id,
      razorpayOrderId: order.id,
      amountPaise,
      currency: 'INR',
      status: 'created',
      webhookEvents: [],
    });

    await writeAudit({
      actorId: req.user._id,
      action: 'payment_order_created',
      entityType: 'Payment',
      entityId: payment._id,
      meta: {
        orderId: order.id,
        amountPaise,
        appointmentId: String(appointment._id),
      },
      ip: clientIp(req),
    });

    return res.status(201).json({
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: config.RAZORPAY_KEY_ID,
    });
  })
);

/**
 * POST /payments/verify
 * Verifies payment signature using HMAC SHA256 over "orderId|paymentId"
 * and timing-safe comparison.
 */
router.post(
  '/verify',
  requireAuth,
  requireRole('patient'),
  validateRequest(verifyPaymentSchema),
  asyncHandler(async (req, res) => {
    await attachPatient(req);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      throw new HttpError(404, 'Payment record not found', 'not_found');
    }

    if (!payment.patientId.equals(req.patient._id)) {
      throw new HttpError(403, 'Forbidden: Payment does not belong to this patient', 'forbidden');
    }

    // Verify signature with timing-safe comparison
    const isSignatureValid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isSignatureValid) {
      await writeAudit({
        actorId: req.user._id,
        action: 'payment_signature_verification_failed',
        entityType: 'Payment',
        entityId: payment._id,
        meta: {
          orderId: razorpay_order_id,
          reason: 'signature_mismatch',
        },
        ip: clientIp(req),
      });

      return res.status(400).json({
        error: 'invalid_signature',
        message: 'Payment signature verification failed.',
      });
    }

    // If already marked paid (e.g. race with webhook), return success idempotently
    if (payment.status === 'paid') {
      return res.status(200).json({
        success: true,
        payment: {
          id: String(payment._id),
          status: payment.status,
          orderId: payment.razorpayOrderId,
          paymentId: payment.razorpayPaymentId,
          amountPaise: payment.amountPaise,
          currency: payment.currency,
        },
      });
    }

    // Update payment record
    payment.status = 'paid';
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.signatureVerified = true;
    await payment.save();

    // Update appointment
    const appointment = await Appointment.findById(payment.appointmentId);
    if (appointment) {
      appointment.status = 'paid';
      await appointment.save();

      // Dispatch notifications
      try {
        const patientUser = await User.findById(req.patient.userId);
        const doctor = await Doctor.findById(appointment.doctorId);
        const doctorUser = await User.findById(doctor?.userId);
        const sessionUrl = `${config.CLIENT_URL}/consult/${appointment._id}`;

        if (patientUser) {
          await sendEmail({
            to: patientUser.email,
            template: 'receipt_to_patient',
            data: {
              patientFirstName: (patientUser.name || 'Patient').split(' ')[0],
              doctorName: doctorUser?.name || 'Physician',
              mode: appointment.mode,
              amountINR: Math.round(payment.amountPaise / 100),
              orderId: payment.razorpayOrderId,
              paymentId: razorpay_payment_id,
              sessionUrl,
            },
          });
        }

        if (doctorUser) {
          await sendEmail({
            to: doctorUser.email,
            template: 'payment_received_to_doctor',
            data: {
              doctorName: doctorUser.name || 'Doctor',
              patientFirstName: (patientUser?.name || 'Patient').split(' ')[0],
              mode: appointment.mode,
              scheduledTime: formatScheduledTime(appointment.scheduledAt),
              sessionUrl,
            },
          });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to dispatch post-payment notification emails');
      }
    }

    await writeAudit({
      actorId: req.user._id,
      action: 'payment_verified',
      entityType: 'Payment',
      entityId: payment._id,
      meta: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amountPaise: payment.amountPaise,
      },
      ip: clientIp(req),
    });

    return res.status(200).json({
      success: true,
      payment: {
        id: String(payment._id),
        status: payment.status,
        orderId: payment.razorpayOrderId,
        paymentId: payment.razorpayPaymentId,
        amountPaise: payment.amountPaise,
        currency: payment.currency,
      },
    });
  })
);

/**
 * POST /payments/webhook
 * Receives Razorpay webhook events using raw body and timing-safe signature check.
 * Idempotently handles payment.captured, order.paid, and payment.failed.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({
        error: 'missing_signature',
        message: 'Missing X-Razorpay-Signature header',
      });
    }

    // Body can be Buffer or string from express.raw or rawBody property
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : typeof req.body === 'string'
      ? req.body
      : req.rawBody
      ? req.rawBody.toString('utf-8')
      : JSON.stringify(req.body);

    const isWebhookValid = verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isWebhookValid) {
      return res.status(400).json({
        error: 'invalid_signature',
        message: 'Invalid webhook signature',
      });
    }

    let payload;
    try {
      payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody);
    } catch {
      return res.status(400).json({
        error: 'invalid_json',
        message: 'Webhook payload could not be parsed as JSON',
      });
    }

    const event = payload.event;
    const eventId = req.headers['x-razorpay-event-id'] || payload.id || `evt_${Date.now()}`;

    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;
    const paymentId = paymentEntity?.id;

    if (!orderId) {
      return res.status(200).json({ status: 'ignored_no_order' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) {
      return res.status(200).json({ status: 'ignored_payment_not_found' });
    }

    // Idempotency check: ignore repeat events
    if (payment.webhookEvents && payment.webhookEvents.includes(eventId)) {
      return res.status(200).json({ status: 'ignored_duplicate', eventId });
    }

    payment.webhookEvents.push(eventId);

    if (event === 'payment.captured' || event === 'order.paid') {
      if (payment.status !== 'paid') {
        payment.status = 'paid';
        if (paymentId) payment.razorpayPaymentId = paymentId;
        payment.signatureVerified = true;
        await payment.save();

        const appointment = await Appointment.findById(payment.appointmentId);
        if (appointment) {
          appointment.status = 'paid';
          await appointment.save();

          // Dispatch notifications if not already delivered
          try {
            const patient = await Patient.findById(payment.patientId);
            const patientUser = await User.findById(patient?.userId);
            const doctor = await Doctor.findById(appointment.doctorId);
            const doctorUser = await User.findById(doctor?.userId);
            const sessionUrl = `${config.CLIENT_URL}/consult/${appointment._id}`;

            if (patientUser) {
              await sendEmail({
                to: patientUser.email,
                template: 'receipt_to_patient',
                data: {
                  patientFirstName: (patientUser.name || 'Patient').split(' ')[0],
                  doctorName: doctorUser?.name || 'Physician',
                  mode: appointment.mode,
                  amountINR: Math.round(payment.amountPaise / 100),
                  orderId: payment.razorpayOrderId,
                  paymentId: payment.razorpayPaymentId || 'webhook-verified',
                  sessionUrl,
                },
              });
            }

            if (doctorUser) {
              await sendEmail({
                to: doctorUser.email,
                template: 'payment_received_to_doctor',
                data: {
                  doctorName: doctorUser.name || 'Doctor',
                  patientFirstName: (patientUser?.name || 'Patient').split(' ')[0],
                  mode: appointment.mode,
                  scheduledTime: formatScheduledTime(appointment.scheduledAt),
                  sessionUrl,
                },
              });
            }
          } catch (err) {
            logger.error({ err }, 'Failed to dispatch webhook notification emails');
          }
        }
      } else {
        await payment.save();
      }
    } else if (event === 'payment.failed') {
      if (payment.status === 'created') {
        payment.status = 'failed';
      }
      await payment.save();
    } else {
      await payment.save();
    }

    return res.status(200).json({ status: 'ok', eventId });
  })
);

export default router;
