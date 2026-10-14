import { Router } from 'express';
import config from '../config/env.js';
import { Doctor } from '../models/Doctor.js';
import { AuditLog } from '../models/AuditLog.js';
import { Payment } from '../models/Payment.js';
import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import validateRequest from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import { adminDoctorsQuerySchema, verifyDoctorSchema, adminAuditQuerySchema } from '../validators/auth.js';
import { refundPaymentSchema } from '../validators/payment.js';
import { refundRazorpayPayment } from '../services/razorpay.js';
import { refundToPatient } from '../templates/refund_to_patient.js';
import { sendEmail } from '../services/mailer.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get(
  '/doctors',
  validateRequest(adminDoctorsQuerySchema),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) {
      filter.verificationStatus = req.query.status;
    }
    const doctors = await Doctor.find(filter)
      .populate('userId', 'name email phone languagePref isActive')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      doctors: doctors.map((doctor) => ({
        id: String(doctor._id),
        userId: doctor.userId ? String(doctor.userId._id || doctor.userId) : null,
        name: doctor.userId?.name || null,
        email: doctor.userId?.email || null,
        phone: doctor.userId?.phone || null,
        specialty: doctor.specialty,
        registrationNumber: doctor.registrationNumber,
        bio: doctor.bio || null,
        verificationStatus: doctor.verificationStatus,
        verifiedBy: doctor.verifiedBy ? String(doctor.verifiedBy) : null,
        createdAt: doctor.createdAt,
      })),
    });
  })
);

router.patch(
  '/doctors/:id/verify',
  validateRequest(verifyDoctorSchema),
  asyncHandler(async (req, res) => {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      throw new HttpError(404, 'Doctor not found', 'not_found');
    }

    doctor.verificationStatus = req.body.status;
    doctor.verifiedBy = req.user._id;
    await doctor.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'DOCTOR_VERIFY',
      entityType: 'Doctor',
      entityId: doctor._id,
      meta: { status: req.body.status, userId: String(doctor.userId) },
      ip: clientIp(req),
    });

    return res.status(200).json({
      id: String(doctor._id),
      verificationStatus: doctor.verificationStatus,
      verifiedBy: String(doctor.verifiedBy),
    });
  })
);

router.get(
  '/audit',
  validateRequest(adminAuditQuerySchema),
  asyncHandler(async (req, res) => {
    const limit = req.query.limit || 20;
    const filter = {};
    if (req.query.cursor) {
      filter._id = { $lt: req.query.cursor };
    }

    const logs = await AuditLog.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = logs.length > limit;
    const items = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

    return res.status(200).json({
      items: items.map((log) => ({
        id: String(log._id),
        actorId: log.actorId ? String(log.actorId) : null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ? String(log.entityId) : null,
        meta: log.meta || null,
        ip: log.ip || null,
        at: log.at,
      })),
      nextCursor,
    });
  })
);

/**
 * POST /admin/payments/:id/refund
 * Issues a full or partial refund for a consultation payment via Razorpay.
 * Cancels the appointment, records the audit trail, and emails the patient.
 */
router.post(
  '/payments/:id/refund',
  validateRequest(refundPaymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      throw new HttpError(404, 'Payment not found', 'not_found');
    }

    if (payment.status !== 'paid') {
      throw new HttpError(400, 'Only paid payments can be refunded', 'invalid_status');
    }

    const refundAmount = req.body.amountPaise || payment.amountPaise;
    if (refundAmount > payment.amountPaise) {
      throw new HttpError(400, 'Refund amount cannot exceed paid amount', 'invalid_amount');
    }

    const rzpRefund = await refundRazorpayPayment({
      paymentId: payment.razorpayPaymentId,
      amount: refundAmount,
      notes: {
        reason: req.body.reason || 'Admin refund',
        paymentId: String(payment._id),
      },
    });

    payment.status = 'refunded';
    payment.refundId = rzpRefund.id;
    payment.refundAmountPaise = refundAmount;
    payment.refundReason = req.body.reason || 'Admin refund';
    payment.refundedAt = new Date();
    await payment.save();

    const appointment = await Appointment.findById(payment.appointmentId);
    if (appointment) {
      appointment.status = 'cancelled';
      appointment.cancelledReason = req.body.reason || 'Refunded by administrator';
      appointment.cancelledBy = req.user._id;
      await appointment.save();
    }

    try {
      const patient = await Patient.findById(payment.patientId);
      const patientUser = await User.findById(patient?.userId);
      if (patientUser) {
        await sendEmail({
          to: patientUser.email,
          template: 'refund_to_patient',
          data: {
            patientFirstName: (patientUser.name || 'Patient').split(' ')[0],
            amountINR: Math.round(refundAmount / 100),
            orderId: payment.razorpayOrderId,
            refundId: rzpRefund.id,
            reason: req.body.reason,
            refundPolicyText: config.REFUND_POLICY_TEXT,
          },
        });
      }
    } catch {
      // Non-blocking mail failure
    }

    await writeAudit({
      actorId: req.user._id,
      action: 'payment_refunded',
      entityType: 'Payment',
      entityId: payment._id,
      meta: {
        refundId: rzpRefund.id,
        amountPaise: refundAmount,
        reason: req.body.reason,
      },
      ip: clientIp(req),
    });

    return res.status(200).json({
      success: true,
      payment: {
        id: String(payment._id),
        status: payment.status,
        refundId: payment.refundId,
        refundAmountPaise: payment.refundAmountPaise,
        refundReason: payment.refundReason,
      },
      refundPolicy: config.REFUND_POLICY_TEXT,
    });
  })
);

export default router;
