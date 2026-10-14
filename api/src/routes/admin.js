import { Router } from 'express';
import { Doctor } from '../models/Doctor.js';
import { AuditLog } from '../models/AuditLog.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import validateRequest from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import { adminDoctorsQuerySchema, verifyDoctorSchema, adminAuditQuerySchema } from '../validators/auth.js';

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

export default router;
