import path from 'path';
import express from 'express';
import multer from 'multer';
import axios from 'axios';

import config from '../config/env.js';
import Case from '../models/Case.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import Consent from '../models/Consent.js';
import Analysis from '../models/Analysis.js';
import Report from '../models/Report.js';
import WoundMeasurement from '../models/WoundMeasurement.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import { createCaseSchema, followupSchema, explanationSchema, feedbackSchema } from '../validators/case.js';
import {
  processAndCleanImage,
  saveCaseImage,
  getCaseFilePath,
  deleteCaseStorage,
} from '../services/storage.js';
import analysisQueue from '../services/queue.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (config.MAX_UPLOAD_MB || 10) * 1024 * 1024,
  },
});

function handleImageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'payload_too_large',
          message: `Image exceeds maximum allowed size of ${config.MAX_UPLOAD_MB || 10}MB`,
        });
      }
      return res.status(400).json({
        error: 'upload_error',
        message: err.message,
      });
    }
    next();
  });
}

/**
 * Helper to check whether an authenticated user has read access to a case.
 * Access granted to:
 * - Case owner (patient who created it)
 * - System admin
 * - Doctor with an active (unrevoked) consent for this patient or case
 */
async function canAccessCase(user, caseDoc) {
  if (user.role === 'admin') {
    return true;
  }
  if (String(caseDoc.createdBy) === String(user._id)) {
    return true;
  }
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ userId: user._id });
    if (!doctor) return false;

    const consent = await Consent.findOne({
      doctorId: doctor._id,
      patientId: caseDoc.patientId,
      $or: [{ caseId: caseDoc._id }, { caseId: { $exists: false } }],
      revokedAt: { $exists: false },
    });
    return Boolean(consent);
  }
  return false;
}

/**
 * POST /cases (patient only, multipart/form-data)
 */
router.post(
  '/',
  requireAuth,
  handleImageUpload,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only registered patients may submit skin cases for screening',
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: 'missing_file',
        message: 'A lesion image file is required in the image field',
      });
    }

    // Parse context if provided as JSON string
    if (typeof req.body.context === 'string') {
      try {
        req.body.context = JSON.parse(req.body.context);
      } catch (err) {
        return res.status(422).json({
          error: 'validation_error',
          message: 'Invalid JSON payload in context field',
        });
      }
    }

    const validation = createCaseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({
        error: 'validation_error',
        message: validation.error.issues.map((i) => i.message).join(', '),
      });
    }

    const { bodySite, lesionLabel, takenAt, language, context } = validation.data;

    // Validate magic bytes and strip EXIF
    let cleanedImage;
    try {
      cleanedImage = await processAndCleanImage(req.file.buffer);
    } catch (procErr) {
      const statusCode = procErr.statusCode || 400;
      return res.status(statusCode).json({
        error: procErr.code || 'image_processing_error',
        message: procErr.message,
      });
    }

    // Ensure patient profile exists
    let patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      patient = await Patient.create({ userId: req.user._id });
    }

    // Create case in queued status
    const caseDoc = new Case({
      patientId: patient._id,
      createdBy: req.user._id,
      bodySite,
      lesionLabel: lesionLabel || '',
      context: { ...context, language },
      status: 'queued',
      imagePaths: [],
    });
    await caseDoc.save();

    // Store cleaned image
    const saved = await saveCaseImage(patient._id, caseDoc._id, cleanedImage.sha256, cleanedImage.buffer);
    caseDoc.imagePaths.push({
      path: saved.relativeUri,
      takenAt: takenAt ? new Date(takenAt) : new Date(),
      kind: 'current',
      sha256: cleanedImage.sha256,
    });
    await caseDoc.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'CASE_CREATED',
      entityType: 'Case',
      entityId: caseDoc._id,
      meta: { bodySite, lesionLabel, sha256: cleanedImage.sha256 },
      ip: clientIp(req),
    });

    // Enqueue for background AI pipeline execution
    analysisQueue.enqueue(caseDoc._id);

    return res.status(201).json({
      case: caseDoc,
    });
  })
);

/**
 * GET /cases (own cases, paginated, optional filter by lesionLabel)
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    let patientId = null;
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient) {
        return res.status(200).json({ cases: [], total: 0 });
      }
      patientId = patient._id;
    }

    const query = {};
    if (patientId) {
      query.patientId = patientId;
    }
    if (req.query.lesionLabel) {
      query.lesionLabel = String(req.query.lesionLabel).trim();
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [cases, total] = await Promise.all([
      Case.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('analysisId')
        .lean(),
      Case.countDocuments(query),
    ]);

    return res.status(200).json({
      cases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /cases/:id/status (polling fallback)
 */
router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    return res.status(200).json({
      caseId: caseDoc._id,
      status: caseDoc.status,
    });
  })
);

/**
 * GET /cases/:id (owner, doctor with active consent, admin)
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caseDoc = await Case.findById(req.params.id)
      .populate('analysisId')
      .populate({
        path: 'patientId',
        select: 'dateOfBirth sex skinType',
        populate: { path: 'userId', select: 'name' },
      });
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const reports = await Report.find({ caseId: caseDoc._id }).sort({ createdAt: -1 }).lean();

    const patientObj = caseDoc.patientId;
    let ageBand = 'Adult';
    if (patientObj?.dateOfBirth) {
      const ageDiff = Date.now() - new Date(patientObj.dateOfBirth).getTime();
      const age = Math.abs(new Date(ageDiff).getUTCFullYear() - 1970);
      if (age < 20) ageBand = '<20';
      else if (age < 30) ageBand = '20-29';
      else if (age < 40) ageBand = '30-39';
      else if (age < 50) ageBand = '40-49';
      else if (age < 60) ageBand = '50-59';
      else if (age < 70) ageBand = '60-69';
      else ageBand = '70+';
    }

    const patientFirstName = patientObj?.userId?.name
      ? patientObj.userId.name.split(' ')[0]
      : 'Patient';

    return res.status(200).json({
      case: caseDoc,
      analysis: caseDoc.analysisId ? caseDoc.analysisId.result : null,
      patient: {
        firstName: patientFirstName,
        ageBand,
        sex: patientObj?.sex || null,
        skinType: patientObj?.skinType || null,
      },
      reports,
    });
  })
);

/**
 * GET /cases/:id/image/:imageId (secure streaming from disk)
 */
router.get(
  '/:id/image/:imageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    let targetImage = req.params.imageId;
    if (targetImage === '0' || targetImage === 'current') {
      const first = caseDoc.imagePaths?.[0];
      if (first) {
        targetImage = path.basename(first.path);
      }
    } else if (!targetImage.includes('.')) {
      targetImage = `${targetImage}.jpg`;
    }

    const filePath = await getCaseFilePath(caseDoc.patientId, caseDoc._id, targetImage);
    if (!filePath) {
      return res.status(404).json({ error: 'not_found', message: 'Image file not found on disk' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  })
);

/**
 * GET /cases/:id/artifact/:name (secure streaming of heatmap/overlay PNGs)
 */
router.get(
  '/:id/artifact/:name',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const filePath = await getCaseFilePath(caseDoc.patientId, caseDoc._id, req.params.name);
    if (!filePath) {
      return res.status(404).json({ error: 'not_found', message: 'Artifact file not found' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  })
);

/**
 * POST /cases/:id/explanation (calls AI service /v1/explain, caches Report)
 */
router.post(
  '/:id/explanation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const validation = explanationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({ error: 'validation_error', message: 'Invalid language code' });
    }
    const language = validation.data.language || 'en';

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    // 1. Check if cached report already exists for this case and language
    const cached = await Report.findOne({ caseId: caseDoc._id, language });
    if (cached) {
      return res.status(200).json({ report: cached });
    }

    // 2. Fetch analysis result
    const analysis = await Analysis.findOne({ caseId: caseDoc._id });
    if (!analysis || !analysis.result) {
      return res.status(400).json({
        error: 'analysis_incomplete',
        message: 'Case analysis has not completed yet',
      });
    }

    // 3. Call AI service /v1/explain
    const explainUrl = `${config.AI_SERVICE_URL.replace(/\/+$/, '')}/v1/explain`;
    const resp = await axios.post(
      explainUrl,
      {
        result: analysis.result,
        language,
      },
      {
        headers: { 'X-API-Key': config.AI_SERVICE_API_KEY },
        timeout: config.AI_TIMEOUT_MS || 30000,
      }
    );

    const explanationData = resp.data;
    const report = await Report.create({
      caseId: caseDoc._id,
      language,
      text: explanationData.text || '',
      source: explanationData.source || 'groq',
    });

    await writeAudit({
      actorId: req.user._id,
      action: 'CASE_EXPLANATION_GENERATED',
      entityType: 'Report',
      entityId: report._id,
      meta: { caseId: caseDoc._id, language, source: report.source },
      ip: clientIp(req),
    });

    return res.status(200).json({ report });
  })
);

/**
 * PATCH /cases/:id/followup { days }
 */
router.patch(
  '/:id/followup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const validation = followupSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({ error: 'validation_error', message: 'Days must be an integer between 1 and 365' });
    }

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const days = validation.data.days;
    caseDoc.followUpAt = new Date(Date.now() + days * 86400000);
    await caseDoc.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'CASE_FOLLOWUP_SET',
      entityType: 'Case',
      entityId: caseDoc._id,
      meta: { days, followUpAt: caseDoc.followUpAt },
      ip: clientIp(req),
    });

    return res.status(200).json({ case: caseDoc });
  })
);

/**
 * POST /cases/:id/feedback
 * Verified doctor review and clinical validation.
 */
router.post(
  '/:id/feedback',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only doctors with authorized clinical access can submit review feedback',
      });
    }

    const validation = feedbackSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({
        error: 'validation_error',
        message: 'Invalid feedback submission',
        issues: validation.error.issues,
      });
    }

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    const allowed = await canAccessCase(req.user, caseDoc);
    if (!allowed) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    let doctorId = undefined;
    if (req.user.role === 'doctor') {
      const doc = await Doctor.findOne({ userId: req.user._id });
      doctorId = doc?._id;
    }

    const feedbackEntry = {
      doctorId,
      decision: validation.data.decision,
      correctedLabel: validation.data.correctedLabel,
      notes: validation.data.notes,
      createdAt: new Date(),
    };

    caseDoc.feedback.push(feedbackEntry);
    await caseDoc.save();

    await writeAudit({
      actorId: req.user._id,
      action: 'CASE_FEEDBACK_SUBMITTED',
      entityType: 'Case',
      entityId: caseDoc._id,
      meta: { decision: validation.data.decision, correctedLabel: validation.data.correctedLabel },
      ip: clientIp(req),
    });

    return res.status(200).json({
      success: true,
      feedback: caseDoc.feedback,
    });
  })
);

/**
 * DELETE /cases/:id (owner only)
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    if (String(caseDoc.createdBy) !== String(req.user._id)) {
      return res.status(404).json({ error: 'not_found', message: 'Case not found' });
    }

    // Clean up physical disk files
    await deleteCaseStorage(caseDoc.patientId, caseDoc._id);

    // Delete database records
    await Promise.all([
      Analysis.deleteMany({ caseId: caseDoc._id }),
      WoundMeasurement.deleteMany({ caseId: caseDoc._id }),
      Report.deleteMany({ caseId: caseDoc._id }),
      Case.findByIdAndDelete(caseDoc._id),
    ]);

    await writeAudit({
      actorId: req.user._id,
      action: 'CASE_DELETED',
      entityType: 'Case',
      entityId: caseDoc._id,
      ip: clientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Case and all associated screening artifacts deleted cleanly',
    });
  })
);

export default router;
