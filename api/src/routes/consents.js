import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';

import { Consent } from '../models/Consent.js';
import { Patient } from '../models/Patient.js';
import { Case } from '../models/Case.js';
import { createConsentSchema, revokeConsentSchema } from '../validators/appointment.js';
import { emitConsentRevoked } from '../services/socket.js';

const router = Router();

/**
 * POST /consents
 * Grants physician access to a patient's screening case.
 */
router.post(
  '/',
  requireAuth,
  validate(createConsentSchema),
  asyncHandler(async (req, res) => {
    const { doctorId, caseId } = req.body;

    let patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      if (req.user.role === 'patient') {
        patient = await Patient.create({ userId: req.user._id });
      } else {
        throw new HttpError(403, 'Patient account required to grant case access', 'forbidden');
      }
    }

    const caseDoc = await Case.findOne({ _id: caseId, patientId: patient._id });
    if (!caseDoc) {
      throw new HttpError(404, 'Case record not found or does not belong to user', 'case_not_found');
    }

    // Upsert active consent
    const consent = await Consent.findOneAndUpdate(
      { patientId: patient._id, doctorId, caseId },
      { grantedAt: new Date(), revokedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await writeAudit({
      actorId: req.user._id,
      action: 'CONSENT_GRANTED',
      entityType: 'Consent',
      entityId: consent._id,
      meta: { doctorId, caseId },
      ip: clientIp(req),
    });

    return res.status(201).json({
      message: 'Access consent granted successfully',
      consent: {
        id: String(consent._id),
        doctorId: String(consent.doctorId),
        caseId: String(consent.caseId),
        grantedAt: consent.grantedAt,
      },
    });
  })
);

/**
 * DELETE /consents/:id
 * Revokes physician access to a case immediately.
 */
router.delete(
  '/:id',
  requireAuth,
  validate(revokeConsentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      throw new HttpError(403, 'Patient account required', 'forbidden');
    }

    const consent = await Consent.findOne({ _id: id, patientId: patient._id });
    if (!consent) {
      throw new HttpError(404, 'Consent record not found', 'not_found');
    }

    consent.revokedAt = new Date();
    await consent.save();

    emitConsentRevoked({ doctorId: consent.doctorId, caseId: consent.caseId });

    await writeAudit({
      actorId: req.user._id,
      action: 'CONSENT_REVOKED',
      entityType: 'Consent',
      entityId: consent._id,
      meta: { doctorId: consent.doctorId, caseId: consent.caseId },
      ip: clientIp(req),
    });

    return res.status(200).json({
      message: 'Case access consent revoked immediately',
      consentId: String(consent._id),
      revokedAt: consent.revokedAt,
    });
  })
);

/**
 * GET /consents
 * Lists active consents granted by this patient.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      return res.status(200).json({ consents: [] });
    }

    const consents = await Consent.find({ patientId: patient._id, revokedAt: null })
      .populate('doctorId', 'specialty')
      .populate('caseId', 'lesionLabel bodySite');

    return res.status(200).json({ consents });
  })
);

export default router;
