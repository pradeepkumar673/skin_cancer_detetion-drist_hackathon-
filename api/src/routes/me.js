import { Router } from 'express';
import config from '../config/env.js';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Case } from '../models/Case.js';
import { WoundMeasurement } from '../models/WoundMeasurement.js';
import { Appointment } from '../models/Appointment.js';
import { Payment } from '../models/Payment.js';
import { Message } from '../models/Message.js';
import { Consent } from '../models/Consent.js';
import { AuditLog } from '../models/AuditLog.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { verifyPassword } from '../services/password.js';
import { clearRefreshCookie } from '../services/tokens.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import { publicUser } from '../services/authService.js';

const router = Router();

router.use(requireAuth);

/**
 * Handles exporting all user personal and clinical data in structured JSON format.
 * Requires fresh re-authentication with password.
 */
async function handleDataExport(req, res) {
  const password = req.body?.password || req.headers['x-password'] || req.query?.password;
  if (!password) {
    throw new HttpError(400, 'Password is required to export personal data', 'password_required');
  }

  const user = await User.findById(req.user._id);
  const passwordValid = await verifyPassword(password, user?.passwordHash);
  if (!passwordValid) {
    throw new HttpError(401, 'Invalid password verification', 'invalid_credentials');
  }

  const patient = await Patient.findOne({ userId: user._id }).lean();
  const doctor = await Doctor.findOne({ userId: user._id }).lean();

  // 1. Gather all clinical cases & analyses
  const cases = await Case.find({
    $or: [{ createdBy: user._id }, ...(patient ? [{ patientId: patient._id }] : [])],
  })
    .populate('analysisId')
    .lean();

  // 2. Wound measurements
  const woundMeasurements = patient
    ? await WoundMeasurement.find({ patientId: patient._id }).lean()
    : [];

  // 3. Appointments
  const appointmentFilter = [];
  if (patient) appointmentFilter.push({ patientId: patient._id });
  if (doctor) appointmentFilter.push({ doctorId: doctor._id });

  const appointments = appointmentFilter.length > 0
    ? await Appointment.find({ $or: appointmentFilter }).lean()
    : [];

  // 4. Payments (sanitized, financial amounts and IDs only, never raw card data)
  const payments = patient
    ? await Payment.find({ patientId: patient._id })
        .select('_id razorpayOrderId amountPaise currency status createdAt')
        .lean()
    : [];

  // 5. Messages
  const messages = await Message.find({ senderId: user._id })
    .select('_id appointmentId text createdAt')
    .lean();

  // 6. Consents
  const consents = patient
    ? await Consent.find({ patientId: patient._id }).lean()
    : [];

  // 7. Clinical feedback given (if doctor)
  const feedbackGiven = doctor
    ? await Case.find({ 'feedback.doctorId': doctor._id })
        .select('_id lesionLabel bodySite feedback')
        .lean()
    : [];

  // 8. Audit trail entries regarding this user
  const auditEntries = await AuditLog.find({ actorId: user._id })
    .select('action entityType entityId meta at ip')
    .lean();

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    organization: config.ORG_NAME,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone || null,
      languagePref: user.languagePref,
      termsVersionAccepted: user.termsVersionAccepted || null,
      termsAcceptedAt: user.termsAcceptedAt || null,
      createdAt: user.createdAt,
    },
    patientProfile: patient || null,
    doctorProfile: doctor || null,
    cases,
    woundMeasurements,
    appointments,
    payments,
    messages,
    consents,
    feedbackGiven,
    auditTrail: auditEntries,
    disclaimer: 'Decision support only. A doctor makes the diagnosis.',
  };

  await writeAudit({
    actorId: user._id,
    action: 'USER_DATA_EXPORTED',
    entityType: 'User',
    entityId: user._id,
    meta: {
      casesCount: cases.length,
      appointmentsCount: appointments.length,
    },
    ip: clientIp(req),
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="skinsentry_export_${user._id}_${Date.now()}.json"`
  );
  return res.status(200).send(JSON.stringify(exportPayload, null, 2));
}

router.get('/export', asyncHandler(handleDataExport));
router.post('/export', asyncHandler(handleDataExport));

/**
 * DELETE /me
 * Requests scheduled account deletion. Begins DELETION_GRACE_DAYS countdown.
 */
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const password = req.body?.password;
    if (!password) {
      throw new HttpError(400, 'Password is required to request account deletion', 'password_required');
    }

    const user = await User.findById(req.user._id);
    const passwordValid = await verifyPassword(password, user?.passwordHash);
    if (!passwordValid) {
      throw new HttpError(401, 'Invalid password verification', 'invalid_credentials');
    }

    user.deletionRequestedAt = new Date();
    user.refreshTokenHash = undefined;
    await user.save();

    clearRefreshCookie(res);

    await writeAudit({
      actorId: user._id,
      action: 'USER_DELETION_REQUESTED',
      entityType: 'User',
      entityId: user._id,
      meta: { deletionRequestedAt: user.deletionRequestedAt },
      ip: clientIp(req),
    });

    return res.status(200).json({
      status: 'deletion_scheduled',
      message: 'Account deletion scheduled. You may cancel this request by signing in during the grace period.',
      graceDays: config.DELETION_GRACE_DAYS || 30,
      deletionRequestedAt: user.deletionRequestedAt,
    });
  })
);

/**
 * POST /me/cancel-deletion
 * Cancels pending account deletion request during grace period.
 */
router.post(
  '/cancel-deletion',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    user.deletionRequestedAt = undefined;
    await user.save();

    await writeAudit({
      actorId: user._id,
      action: 'USER_DELETION_CANCELLED',
      entityType: 'User',
      entityId: user._id,
      ip: clientIp(req),
    });

    return res.status(200).json({
      status: 'active',
      message: 'Account deletion request has been cancelled.',
      user: publicUser(user),
    });
  })
);

export default router;
