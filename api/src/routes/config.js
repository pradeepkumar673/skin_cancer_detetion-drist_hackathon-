import express from 'express';
import config from '../config/env.js';

const router = express.Router();

/**
 * GET /config/public
 * Public system configuration without authentication.
 * Single source of truth for the client application.
 */
router.get('/public', (_req, res) => {
  const allowedImageTypes = config.ALLOWED_IMAGE_TYPES
    ? config.ALLOWED_IMAGE_TYPES.split(',').map((t) => t.trim())
    : ['image/jpeg', 'image/png', 'image/webp'];

  res.status(200).json({
    allowedImageTypes,
    maxUploadMb: config.MAX_UPLOAD_MB || 10,
    supportedLanguages: ['en', 'ta', 'hi'],
    minConsultationFee: config.MIN_FEE_INR || 100,
    maxConsultationFee: config.MAX_FEE_INR || 5000,
    retentionPeriods: {
      caseDays: config.RETENTION_CASE_DAYS || 365,
      auditDays: config.RETENTION_AUDIT_DAYS || 1825,
      deletionGraceDays: config.DELETION_GRACE_DAYS || 30,
    },
    refundPolicy: config.REFUND_POLICY_TEXT || 'Consultation fee refundable if doctor cancels or appointment fails.',
    organisationName: config.ORG_NAME || 'SkinSentry Health Support',
    contactEmail: config.CONTACT_EMAIL || 'support@skinsentry.local',
    governingLaw: config.GOVERNING_LAW || 'India',
    minAge: config.MIN_AGE || 18,
    defaultTimezone: config.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  });
});

export default router;
