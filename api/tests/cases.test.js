import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import Case from '../src/models/Case.js';
import Analysis from '../src/models/Analysis.js';
import AuditLog from '../src/models/AuditLog.js';
import { findCaseHistory } from '../src/services/history.js';
import { getCaseFilePath } from '../src/services/storage.js';

const testDbUri = process.env.MONGODB_URI_TEST || config.MONGODB_URI_TEST;

let patient1Token = null;
let patient1User = null;
let patient2Token = null;
let patient2User = null;

async function createValidJpegBuffer(width = 128, height = 128) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 190, g: 130, b: 110 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('Cases Module & Secure Uploads', () => {
  beforeAll(async () => {
    await connectDB(testDbUri, 2, 500);
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Case.deleteMany({}),
      Analysis.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Register Patient 1
    const p1Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient1@example.com',
        password: 'Password123!',
        name: 'Patient One',
        role: 'patient',
        phone: '9876543210',
        termsVersionAccepted: '1.0.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patient1User = p1Res.body.user;

    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'patient1@example.com', password: 'Password123!' });
    patient1Token = login1.body.accessToken;

    // Register Patient 2
    const p2Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient2@example.com',
        password: 'Password123!',
        name: 'Patient Two',
        role: 'patient',
        phone: '9876543212',
        termsVersionAccepted: '1.0.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patient2User = p2Res.body.user;

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'patient2@example.com', password: 'Password123!' });
    patient2Token = login2.body.accessToken;
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('GET /config/public returns public system configuration without authentication', async () => {
    const res = await request(app).get('/config/public');
    expect(res.status).toBe(200);
    expect(res.body.maxUploadMb).toBe(10);
    expect(Array.isArray(res.body.allowedImageTypes)).toBe(true);
    expect(res.body.supportedLanguages).toContain('en');
    expect(res.body.supportedLanguages).toContain('ta');
    expect(res.body.supportedLanguages).toContain('hi');
    expect(res.body.organisationName).toBeDefined();
  });

  it('POST /cases rejects spoofed text file with HTTP 415 based on magic bytes', async () => {
    const fakeBuffer = Buffer.from('This is a text file pretending to be a jpeg photo');

    const res = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'left_forearm')
      .field('lesionLabel', 'Spot A')
      .attach('image', fakeBuffer, 'malicious.jpg');

    expect(res.status).toBe(415);
    expect(res.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('POST /cases rejects oversize payload with HTTP 413', async () => {
    // 10MB + 64KB exceeds 10MB limit
    const oversizeBuffer = Buffer.alloc(10 * 1024 * 1024 + 65536, 0);

    const res = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'left_forearm')
      .attach('image', oversizeBuffer, 'oversize.jpg');

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });

  it('POST /cases creates case, cleans EXIF, writes audit log, and returns HTTP 201', async () => {
    const validJpeg = await createValidJpegBuffer(150, 150);

    const res = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'back_upper')
      .field('lesionLabel', 'Spot B1')
      .field('language', 'en')
      .field('context', JSON.stringify({ skinType: 'III', sunExposure: 'moderate' }))
      .attach('image', validJpeg, 'lesion.jpg');

    expect(res.status).toBe(201);
    expect(res.body.case).toBeDefined();
    expect(res.body.case.status).toBe('queued');
    expect(res.body.case.bodySite).toBe('back_upper');
    expect(res.body.case.imagePaths.length).toBe(1);

    const caseId = res.body.case._id;
    const patientDoc = await Patient.findOne({ userId: patient1User._id || patient1User.id });
    const imageFileName = path.basename(res.body.case.imagePaths[0].path);
    const diskPath = await getCaseFilePath(patientDoc._id, caseId, imageFileName);

    expect(diskPath).not.toBeNull();
    expect(fs.existsSync(diskPath)).toBe(true);

    // Verify EXIF is completely stripped
    const meta = await sharp(diskPath).metadata();
    expect(meta.exif).toBeUndefined();

    // Verify AuditLog written
    const audit = await AuditLog.findOne({ action: 'CASE_CREATED', entityId: caseId });
    expect(audit).not.toBeNull();
  });

  it('GET /cases/:id returns 404 when requested by another patient', async () => {
    const validJpeg = await createValidJpegBuffer(100, 100);

    // Patient 1 creates case
    const createRes = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'neck')
      .field('lesionLabel', 'Spot C')
      .attach('image', validJpeg, 'spot.jpg');

    const caseId = createRes.body.case._id;

    // Patient 1 can read it
    const ownRes = await request(app)
      .get(`/cases/${caseId}`)
      .set('Authorization', `Bearer ${patient1Token}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.case._id).toBe(caseId);

    // Patient 2 is blocked with 404 (not found / not accessible)
    const otherRes = await request(app)
      .get(`/cases/${caseId}`)
      .set('Authorization', `Bearer ${patient2Token}`);
    expect(otherRes.status).toBe(404);
  });

  it('findCaseHistory correctly links the prior completed photo of the same lesion', async () => {
    const validJpeg = await createValidJpegBuffer(120, 120);

    // First case for Spot D
    const res1 = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'shoulder')
      .field('lesionLabel', 'Spot D')
      .attach('image', validJpeg, 'photo1.jpg');

    const case1Id = res1.body.case._id;

    // Mark case 1 completed
    await Case.findByIdAndUpdate(case1Id, { status: 'completed' });

    // Second case for Spot D
    const res2 = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'shoulder')
      .field('lesionLabel', 'Spot D')
      .attach('image', validJpeg, 'photo2.jpg');

    const case2Id = res2.body.case._id;

    const patientDoc = await Patient.findOne({ userId: patient1User._id || patient1User.id });
    const history = await findCaseHistory(patientDoc._id, 'Spot D', 'shoulder', case2Id);

    expect(history.priorImage).not.toBeNull();
    expect(String(history.priorImage.caseId)).toBe(String(case1Id));
  });

  it('PATCH /cases/:id/followup updates followUpAt timestamp', async () => {
    const validJpeg = await createValidJpegBuffer(100, 100);

    const createRes = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'scalp')
      .attach('image', validJpeg, 'scalp.jpg');

    const caseId = createRes.body.case._id;

    const patchRes = await request(app)
      .patch(`/cases/${caseId}/followup`)
      .set('Authorization', `Bearer ${patient1Token}`)
      .send({ days: 28 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.case.followUpAt).toBeDefined();

    const stored = await Case.findById(caseId);
    expect(stored.followUpAt).toBeDefined();
  });

  it('DELETE /cases/:id cleanly deletes database documents and disk storage', async () => {
    const validJpeg = await createValidJpegBuffer(100, 100);

    const createRes = await request(app)
      .post('/cases')
      .set('Authorization', `Bearer ${patient1Token}`)
      .field('bodySite', 'chest')
      .attach('image', validJpeg, 'chest.jpg');

    const caseId = createRes.body.case._id;
    const patientDoc = await Patient.findOne({ userId: patient1User._id || patient1User.id });
    const fileName = path.basename(createRes.body.case.imagePaths[0].path);

    const filePath = await getCaseFilePath(patientDoc._id, caseId, fileName);
    expect(fs.existsSync(filePath)).toBe(true);

    const delRes = await request(app)
      .delete(`/cases/${caseId}`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify DB deleted
    const checkDb = await Case.findById(caseId);
    expect(checkDb).toBeNull();

    // Verify disk cleaned
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
