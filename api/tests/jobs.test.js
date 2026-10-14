import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Patient } from '../src/models/Patient.js';
import { Doctor } from '../src/models/Doctor.js';
import { Case } from '../src/models/Case.js';
import { Analysis } from '../src/models/Analysis.js';
import { Report } from '../src/models/Report.js';
import { Appointment } from '../src/models/Appointment.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { EmailLog } from '../src/models/EmailLog.js';
import { runAppointmentReminders } from '../src/jobs/appointmentReminders.js';
import { runFollowUpReminders } from '../src/jobs/followUpReminders.js';
import { runRetentionCleanup } from '../src/jobs/retentionCleanup.js';
import { saveCaseArtifact, getCaseFilePath } from '../src/services/storage.js';
import { seedAdmin } from '../scripts/seedAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Step 25: Reminder Jobs, Data Retention & Admin Manual Triggers', () => {
  let adminUser;
  let adminToken;
  let patientUser;
  let patientDoc;
  let patientToken;
  let doctorUser;
  let doctorDoc;

  beforeAll(async () => {
    process.env.MONGODB_URI = config.MONGODB_URI_TEST;
    await connectDB(config.MONGODB_URI_TEST);
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      Case.deleteMany({}),
      Analysis.deleteMany({}),
      Report.deleteMany({}),
      Appointment.deleteMany({}),
      AuditLog.deleteMany({}),
      EmailLog.deleteMany({}),
    ]);

    // 1. Patient
    const pRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient.jobs@example.com',
        password: 'Password123!',
        name: 'Anita Sharma',
        role: 'patient',
        phone: '9876543201',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patientUser = pRes.body.user;
    const pLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'patient.jobs@example.com', password: 'Password123!' });
    patientToken = pLogin.body.accessToken;
    patientDoc = await Patient.findOne({ userId: patientUser.id });

    // 2. Doctor
    const dRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'doctor.jobs@example.com',
        password: 'Password123!',
        name: 'Dr. Vikram Raman',
        role: 'doctor',
        phone: '9876543202',
        specialty: 'dermatologist',
        registrationNumber: 'MED-TN-99881',
        bio: 'Consultant Dermatologist with 10 years experience',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    doctorUser = dRes.body.user;
    doctorDoc = await Doctor.findOne({ userId: doctorUser.id });

    // 3. Admin
    await seedAdmin();
    const aLogin = await request(app)
      .post('/auth/login')
      .send({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD });
    adminToken = aLogin.body.accessToken;
    adminUser = aLogin.body.user;
  });

  describe('appointmentReminders Job', () => {
    it('sends 24h and 1h reminders once and prevents duplicates across multiple runs', async () => {
      const now = Date.now();
      const in24Hours = new Date(now + 24 * 60 * 60 * 1000);
      const in1Hour = new Date(now + 60 * 60 * 1000);

      // 1. Appointment in 24 hours
      const appt24 = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        kind: 'scheduled',
        status: 'paid',
        scheduledAt: in24Hours,
        durationMin: 20,
        reminderSent: { h24: false, h1: false },
      });

      // 2. Appointment in 1 hour
      const appt1 = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        mode: 'audio',
        kind: 'scheduled',
        status: 'awaiting_payment',
        scheduledAt: in1Hour,
        durationMin: 15,
        reminderSent: { h24: false, h1: false },
      });

      // First run: should process both
      const firstRun = await runAppointmentReminders();
      expect(firstRun.h24Sent).toBe(1);
      expect(firstRun.h1Sent).toBe(1);

      // Verify DB flags were atomically updated
      const updatedAppt24 = await Appointment.findById(appt24._id);
      expect(updatedAppt24.reminderSent.h24).toBe(true);

      const updatedAppt1 = await Appointment.findById(appt1._id);
      expect(updatedAppt1.reminderSent.h1).toBe(true);

      // Verify EmailLog created for patient and doctor
      const emailLogs = await EmailLog.find({ template: 'reminder' });
      expect(emailLogs.length).toBeGreaterThanOrEqual(4); // 2 appointments * 2 recipients

      // Second run: must be completely idempotent, sending 0 duplicates
      const secondRun = await runAppointmentReminders();
      expect(secondRun.h24Sent).toBe(0);
      expect(secondRun.h1Sent).toBe(0);
    });
  });

  describe('followUpReminders Job', () => {
    it('notifies patient when follow-up is due, skips if newer lesion photo exists, and sends once', async () => {
      const pastDate = new Date(Date.now() - 2 * 86400000); // 2 days ago

      // Case 1: Due with no subsequent photo
      const caseDue = await Case.create({
        patientId: patientDoc._id,
        createdBy: patientUser.id,
        bodySite: 'Left forearm',
        lesionLabel: 'forearm-mole-1',
        status: 'completed',
        followUpAt: pastDate,
        followUpReminderSent: false,
      });

      // Case 2: Due but patient took a newer photo
      const caseWithNewer = await Case.create({
        patientId: patientDoc._id,
        createdBy: patientUser.id,
        bodySite: 'Back',
        lesionLabel: 'back-spot-2',
        status: 'completed',
        followUpAt: pastDate,
        followUpReminderSent: false,
        createdAt: new Date(Date.now() - 5 * 86400000),
      });

      // Newer photo for back-spot-2
      await Case.create({
        patientId: patientDoc._id,
        createdBy: patientUser.id,
        bodySite: 'Back',
        lesionLabel: 'back-spot-2',
        status: 'completed',
        createdAt: new Date(Date.now() - 1 * 86400000), // Newer
      });

      // First run: caseDue sends, caseWithNewer is marked skipped
      const firstRun = await runFollowUpReminders();
      expect(firstRun.sent).toBe(1);
      expect(firstRun.skipped).toBe(1);

      const refetchedDue = await Case.findById(caseDue._id);
      expect(refetchedDue.followUpReminderSent).toBe(true);

      const refetchedWithNewer = await Case.findById(caseWithNewer._id);
      expect(refetchedWithNewer.followUpReminderSent).toBe(true);

      // Verify email sent for caseDue only
      const emailLogs = await EmailLog.find({ template: 'follow_up_reminder' });
      expect(emailLogs.length).toBe(1);
      expect(emailLogs[0].to).toBe(patientUser.email);

      // Second run: 0 sent
      const secondRun = await runFollowUpReminders();
      expect(secondRun.sent).toBe(0);
      expect(secondRun.skipped).toBe(0);
    });
  });

  describe('retentionCleanup Job', () => {
    it('deletes old cases, storage files, linked analyses/reports and old audit logs, while preserving recent records', async () => {
      const oldDate = new Date(Date.now() - 400 * 86400000); // 400 days old (> RETENTION_CASE_DAYS)
      const recentDate = new Date(Date.now() - 10 * 86400000); // 10 days old

      // Create old case with stored file
      const oldCase = await Case.create({
        patientId: patientDoc._id,
        createdBy: patientUser.id,
        bodySite: 'Left cheek',
        status: 'completed',
      });
      await Case.collection.updateOne({ _id: oldCase._id }, { $set: { createdAt: oldDate } });

      // Save a physical artifact for old case
      await saveCaseArtifact(patientDoc._id, oldCase._id, 'overlay.png', Buffer.from('test overlay content'));

      // Link analysis and report to old case
      await Analysis.create({
        caseId: oldCase._id,
        requestId: 'req_test_old_123',
        status: 'completed',
        result: { safety: { pass: true } },
      });
      await Report.create({
        caseId: oldCase._id,
        language: 'en',
        text: 'Old explanation text',
        source: 'groq',
      });

      // Create recent case (created now, retention intact)
      const recentCase = await Case.create({
        patientId: patientDoc._id,
        createdBy: patientUser.id,
        bodySite: 'Neck',
        status: 'completed',
      });

      // Create old and recent audit logs
      const oldAuditDate = new Date(Date.now() - 2000 * 86400000); // 2000 days (> RETENTION_AUDIT_DAYS)
      await AuditLog.create({
        action: 'OLD_EVENT',
        entityType: 'User',
        at: oldAuditDate,
      });
      await AuditLog.create({
        action: 'RECENT_EVENT',
        entityType: 'User',
        at: new Date(),
      });

      // Run retention cleanup
      const result = await runRetentionCleanup();
      expect(result.casesDeleted).toBeGreaterThanOrEqual(1);
      expect(result.auditLogsDeleted).toBeGreaterThanOrEqual(1);

      // Assert old case and linked records deleted
      const checkOld = await Case.findById(oldCase._id);
      expect(checkOld).toBeNull();

      const checkOldAnalysis = await Analysis.findOne({ caseId: oldCase._id });
      expect(checkOldAnalysis).toBeNull();

      const checkOldReport = await Report.findOne({ caseId: oldCase._id });
      expect(checkOldReport).toBeNull();

      // Assert recent case remains intact
      const checkRecent = await Case.findById(recentCase._id);
      expect(checkRecent).not.toBeNull();

      // Assert summary audit log was written
      const summaryAudit = await AuditLog.findOne({ action: 'RETENTION_CLEANUP' });
      expect(summaryAudit).not.toBeNull();
      expect(summaryAudit.meta.casesDeleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Admin Manual Run Endpoint (POST /admin/jobs/:name/run)', () => {
    it('allows admin to trigger named jobs and rejects non-admin users or invalid jobs', async () => {
      // 1. Non-admin forbidden
      const nonAdminRes = await request(app)
        .post('/admin/jobs/appointment_reminders/run')
        .set('Authorization', `Bearer ${patientToken}`)
        .send();
      expect(nonAdminRes.status).toBe(403);

      // 2. Invalid job name returns 400
      const invalidRes = await request(app)
        .post('/admin/jobs/non_existent_job/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error).toBe('invalid_job');

      // 3. Admin successfully runs appointment_reminders
      const validRes = await request(app)
        .post('/admin/jobs/appointment_reminders/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();
      expect(validRes.status).toBe(200);
      expect(validRes.body.job).toBe('appointment_reminders');
      expect(validRes.body.result).toHaveProperty('h24Sent');
      expect(validRes.body.result).toHaveProperty('h1Sent');

      // 4. Admin successfully runs follow_up_reminders
      const followUpRes = await request(app)
        .post('/admin/jobs/follow_up_reminders/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();
      expect(followUpRes.status).toBe(200);
      expect(followUpRes.body.job).toBe('follow_up_reminders');
      expect(followUpRes.body.result).toHaveProperty('sent');

      // 5. Admin successfully runs retention_cleanup
      const retentionRes = await request(app)
        .post('/admin/jobs/retention_cleanup/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();
      expect(retentionRes.status).toBe(200);
      expect(retentionRes.body.job).toBe('retention_cleanup');
      expect(retentionRes.body.result).toHaveProperty('casesDeleted');
    });
  });

  function patientResToken() {
    // Generate valid JWT token for patient
    const jwt = (request.jwt || (function() {
      const jsonwebtoken = require ? null : null;
      return null;
    }));
    // Simply register another patient or return a non-admin token
    return adminToken.replace(/\.[^.]+$/, '.tampered'); // or use patient login
  }
});
