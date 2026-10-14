import { Router } from 'express';
import { requireAuth, requireVerifiedDoctor } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/me',
  requireAuth,
  requireRole('doctor'),
  requireVerifiedDoctor,
  asyncHandler(async (req, res) => {
    const doctor = req.doctor;
    return res.status(200).json({
      doctor: {
        id: String(doctor._id),
        specialty: doctor.specialty,
        registrationNumber: doctor.registrationNumber,
        verificationStatus: doctor.verificationStatus,
        bio: doctor.bio || null,
      },
    });
  })
);

export default router;
