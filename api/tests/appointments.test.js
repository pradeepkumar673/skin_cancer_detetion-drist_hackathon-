import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import User from '../src/models/User.js';
import Doctor from '../src/models/Doctor.js';
import Patient from '../src/models/Patient.js';
import Case from '../src/models/Case.js';
import Availability from '../src/models/Availability.js';
import Appointment from '../src/models/Appointment.js';
import Consent from '../src/models/Consent.js';
import EmailLog from '../src/models/EmailLog.js';
import AuditLog from '../src/models/AuditLog.js';
import { setTransporter, getMailStatus } from '../src/services/mailer.js';
import { runExpiryCheck } from '../src/services/cron.js';

const testDbUri = process.env.MONGODB_URI_TEST || config.MONGODB_URI_TEST;

let patient1Token = null;
let patient1User = null;
let patient1Doc = null;

let patient2Token = null;
let patient2User = null;
let patient2Doc = null;

let doctorToken = null;
let doctorUser = null;
let doctorDoc = null;

// Track sent test emails
const sentTestEmails = [];

describe('Appointments, Scheduling, Concurrency & Notifications (Step 22)', () => {
  beforeAll(async () => {
    await connectDB(testDbUri, 2, 500);

    // Setup mock mail transporter that records messages in memory
    setTransporter({
      sendMail: async (options) => {
        sentTestEmails.push(options);
        return { messageId: `<mock-${Date.now()}@skinsentry.local>` };
      },
      verify: async () => true,
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    sentTestEmails.length = 0;
    await Promise.all([
      User.deleteMany({}),
      Doctor.deleteMany({}),
      Patient.deleteMany({}),
      Case.deleteMany({}),
      Availability.deleteMany({}),
      Appointment.deleteMany({}),
      Consent.deleteMany({}),
      EmailLog.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Patient 1
    const p1Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient1@example.com',
        password: 'Password123!',
        name: 'Alice Patient',
        role: 'patient',
        phone: '9876543210',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patient1User = p1Res.body.user;
    const p1Login = await request(app)
      .post('/auth/login')
      .send({ email: 'patient1@example.com', password: 'Password123!' });
    patient1Token = p1Login.body.accessToken;
    patient1Doc = await Patient.findOne({ userId: patient1User.id });

    // 2. Patient 2
    const p2Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient2@example.com',
        password: 'Password123!',
        name: 'Bob Patient',
        role: 'patient',
        phone: '9876543211',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patient2User = p2Res.body.user;
    const p2Login = await request(app)
      .post('/auth/login')
      .send({ email: 'patient2@example.com', password: 'Password123!' });
    patient2Token = p2Login.body.accessToken;
    patient2Doc = await Patient.findOne({ userId: patient2User.id });

    // 3. Verified Doctor
    const docRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'dr.smith@hospital.com',
        password: 'Password123!',
        name: 'Dr. John Smith',
        role: 'doctor',
        phone: '9876543212',
        specialty: 'dermatologist',
        registrationNumber: 'MCI-88888',
        bio: 'Dermatologist with 12 years of experience.',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    doctorUser = docRes.body.user;
    const dLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'dr.smith@hospital.com', password: 'Password123!' });
    doctorToken = dLogin.body.accessToken;

    doctorDoc = await Doctor.findOne({ userId: doctorUser.id });
    doctorDoc.verificationStatus = 'verified';
    doctorDoc.presenceMode = 'auto';
    doctorDoc.isOnline = false;
    await doctorDoc.save();

    // Doctor availability: Monday (weekday 1) 09:00 - 13:00, Thursday (weekday 4) 14:00 - 18:00
    await Availability.create([
      {
        doctorId: doctorDoc._id,
        weekday: 1, // Monday
        startTime: '09:00',
        endTime: '13:00',
        timezone: 'Asia/Kolkata',
      },
      {
        doctorId: doctorDoc._id,
        weekday: 4, // Thursday
        startTime: '14:00',
        endTime: '18:00',
        timezone: 'Asia/Kolkata',
      },
    ]);
  });

  describe('Appointment Creation: Instant vs Scheduled Flows', () => {
    it('creates instant appointment with status awaiting_payment when doctor is online and talk now chosen', async () => {
      // Mark doctor online
      doctorDoc.isOnline = true;
      await doctorDoc.save();

      const res = await request(app)
        .post('/appointments')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          doctorId: String(doctorDoc._id),
          mode: 'chat',
          kind: 'instant',
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment.kind).toBe('instant');
      expect(res.body.appointment.status).toBe('awaiting_payment');
      expect(res.body.appointment.paymentDeadlineAt).toBeDefined();

      // Check audit log
      const audit = await AuditLog.findOne({ entityId: res.body.appointment._id });
      expect(audit).toBeDefined();
      expect(audit.action).toBe('APPOINTMENT_CREATED');
    });

    it('creates scheduled appointment in status requested and emails both doctor and patient when doctor is offline', async () => {
      doctorDoc.isOnline = false;
      await doctorDoc.save();

      const res = await request(app)
        .post('/appointments')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          doctorId: String(doctorDoc._id),
          mode: 'video',
          note: 'Lesion growing on forearm.',
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment.kind).toBe('scheduled');
      expect(res.body.appointment.status).toBe('requested');

      // Verify emails sent
      expect(sentTestEmails).toHaveLength(2);
      const doctorEmail = sentTestEmails.find((e) => e.to === 'dr.smith@hospital.com');
      const patientEmail = sentTestEmails.find((e) => e.to === 'patient1@example.com');
      expect(doctorEmail.subject).toBe('New consultation request');
      expect(patientEmail.subject).toBe('Your consultation request has been received');

      // Check EmailLog collection records
      const logs = await EmailLog.find({ status: 'sent' });
      expect(logs).toHaveLength(2);
    });

    it('creates scheduled appointment when patient selects a specific slot', async () => {
      const scheduledTime = '2026-10-19T09:30:00.000Z'; // Monday 15:00 IST
      const res = await request(app)
        .post('/appointments')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          doctorId: String(doctorDoc._id),
          mode: 'audio',
          scheduledAt: scheduledTime,
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment.kind).toBe('scheduled');
      expect(res.body.appointment.status).toBe('requested');
      expect(new Date(res.body.appointment.scheduledAt).toISOString()).toBe(scheduledTime);
    });
  });

  describe('Doctor Scheduling & Atomic Double-booking Race Protection', () => {
    it('allows doctor to schedule a requested appointment, setting payment deadline and emailing patient', async () => {
      const appt = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        kind: 'scheduled',
        status: 'requested',
      });

      // Valid Monday slot: 2026-10-19 at 04:00 UTC is 09:30 AM in Asia/Kolkata
      const slotTime = '2026-10-19T04:00:00.000Z';

      const res = await request(app)
        .patch(`/appointments/${appt._id}/schedule`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduledAt: slotTime,
          durationMin: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('awaiting_payment');
      expect(res.body.appointment.confirmedAt).toBeDefined();
      expect(res.body.appointment.paymentDeadlineAt).toBeDefined();

      // Verify email dispatched
      const patientConfirmEmail = sentTestEmails.find((e) => e.to === 'patient1@example.com');
      expect(patientConfirmEmail).toBeDefined();
      expect(patientConfirmEmail.subject).toContain('Your appointment is confirmed');
      expect(patientConfirmEmail.text).toContain('Payment Deadline: Please complete payment within');
    });

    it('atomically prevents double-booking: parallel schedule requests on same slot result in exactly one 200 and one 409', async () => {
      // Create two separate requested appointments for the same doctor
      const appt1 = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'requested',
      });

      const appt2 = await Appointment.create({
        patientId: patient2Doc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        status: 'requested',
      });

      // Target slot: Monday 2026-10-19 at 04:30 UTC (10:00 AM IST)
      const targetSlot = '2026-10-19T04:30:00.000Z';

      // Fire both requests in parallel
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/appointments/${appt1._id}/schedule`)
          .set('Authorization', `Bearer ${doctorToken}`)
          .send({ scheduledAt: targetSlot, durationMin: 15 }),
        request(app)
          .patch(`/appointments/${appt2._id}/schedule`)
          .set('Authorization', `Bearer ${doctorToken}`)
          .send({ scheduledAt: targetSlot, durationMin: 15 }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one succeeds (200) and one receives HTTP 409 Conflict
      expect(statuses).toEqual([200, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.error).toBe('slot_conflict');
      expect(conflictRes.body.message).toContain('This time slot has already been booked');
    });

    it('rejects scheduling outside physician availability with HTTP 400', async () => {
      const appt = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'requested',
      });

      // Sunday 2026-10-18: doctor is off
      const offDaySlot = '2026-10-18T05:00:00.000Z';

      const res = await request(app)
        .patch(`/appointments/${appt._id}/schedule`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ scheduledAt: offDaySlot, durationMin: 15 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('outside_availability');
    });
  });

  describe('Appointment Expiry Cron Job', () => {
    it('expires unpaid appointments past their payment deadline, releases slot, and emails patient', async () => {
      // Monday 2026-10-19 slot
      const slotTime = new Date('2026-10-19T05:00:00.000Z');

      const expiredAppt = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'awaiting_payment',
        scheduledAt: slotTime,
        paymentDeadlineAt: new Date(Date.now() - 5 * 60 * 1000), // Expired 5 minutes ago
      });

      // Run expiry check
      const processedCount = await runExpiryCheck();
      expect(processedCount).toBe(1);

      // Verify DB status
      const updatedAppt = await Appointment.findById(expiredAppt._id);
      expect(updatedAppt.status).toBe('expired');

      // Verify email was sent
      const expiryEmail = sentTestEmails.find((e) => e.to === 'patient1@example.com');
      expect(expiryEmail).toBeDefined();
      expect(expiryEmail.subject).toBe('Consultation request expired');

      // Now the released slot can be scheduled for another patient without error
      const appt2 = await Appointment.create({
        patientId: patient2Doc._id,
        doctorId: doctorDoc._id,
        mode: 'audio',
        status: 'requested',
      });

      const resSchedule = await request(app)
        .patch(`/appointments/${appt2._id}/schedule`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ scheduledAt: slotTime.toISOString(), durationMin: 15 });

      expect(resSchedule.status).toBe(200);
      expect(resSchedule.body.appointment.status).toBe('awaiting_payment');
    });
  });

  describe('Cancellation & Forbidden Transitions', () => {
    it('allows patient to cancel an appointment and notifies doctor by email', async () => {
      const appt = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'awaiting_payment',
        scheduledAt: new Date('2026-10-19T05:00:00.000Z'),
      });

      const res = await request(app)
        .patch(`/appointments/${appt._id}/cancel`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Scheduling conflict on my side.' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('cancelled');
      expect(res.body.appointment.cancelledReason).toBe('Scheduling conflict on my side.');

      const cancelEmail = sentTestEmails.find((e) => e.to === 'dr.smith@hospital.com');
      expect(cancelEmail).toBeDefined();
      expect(cancelEmail.subject).toBe('Consultation cancelled');
    });

    it('rejects cancellation of completed appointment with HTTP 400', async () => {
      const appt = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'completed',
      });

      const res = await request(app)
        .patch(`/appointments/${appt._id}/cancel`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Want to cancel.' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_status_transition');
    });
  });

  describe('Consent Management (POST /consents & DELETE /consents/:id)', () => {
    it('allows patient to grant and revoke case access consent for a doctor', async () => {
      const caseDoc = await Case.create({
        patientId: patient1Doc._id,
        createdBy: patient1User.id,
        bodySite: 'forearm',
        lesionLabel: 'Spot A',
        status: 'queued',
        imagePaths: [{ path: 'storage/sample.jpg', kind: 'current', takenAt: new Date() }],
        context: {},
      });

      // Grant consent
      const grantRes = await request(app)
        .post('/consents')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          doctorId: String(doctorDoc._id),
          caseId: String(caseDoc._id),
        });

      expect(grantRes.status).toBe(201);
      const consentId = grantRes.body.consent.id;

      // Revoke consent
      const revokeRes = await request(app)
        .delete(`/consents/${consentId}`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.revokedAt).toBeDefined();

      const inDb = await Consent.findById(consentId);
      expect(inDb.revokedAt).toBeDefined();
    });
  });

  describe('Health Check Endpoint (GET /health)', () => {
    it('exposes mail status in health check response', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.mail).toBeDefined();
      expect(['ok', 'failed']).toContain(res.body.mail);
    });
  });
});
