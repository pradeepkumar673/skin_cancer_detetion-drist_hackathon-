import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Patient } from '../src/models/Patient.js';
import { Doctor } from '../src/models/Doctor.js';
import { Case } from '../src/models/Case.js';
import { Appointment } from '../src/models/Appointment.js';
import { Consent } from '../src/models/Consent.js';
import { Message } from '../src/models/Message.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { initSocket, clearAllPresenceTimers } from '../src/services/socket.js';

describe('Real-time Consultations, WebRTC & Consent-Based Case Sharing (Step 24)', () => {
  let httpServer;
  let serverPort;

  let patientUser;
  let patientDoc;
  let patientToken;

  let doctorUser;
  let doctorDoc;
  let doctorToken;

  let outsiderUser;
  let outsiderToken;

  let testCase;

  beforeAll(async () => {
    process.env.MONGODB_URI = config.MONGODB_URI_TEST;
    await connectDB(config.MONGODB_URI_TEST);

    httpServer = http.createServer(app);
    initSocket(httpServer);
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    clearAllPresenceTimers();
    await new Promise((resolve) => httpServer.close(resolve));
    await disconnectDB();
  });

  beforeEach(async () => {
    clearAllPresenceTimers();
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      Case.deleteMany({}),
      Appointment.deleteMany({}),
      Consent.deleteMany({}),
      Message.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Patient
    const pRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient.session@example.com',
        password: 'Password123!',
        name: 'Aarav Patient',
        role: 'patient',
        phone: '9876543201',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patientUser = pRes.body.user;
    const pLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'patient.session@example.com', password: 'Password123!' });
    patientToken = pLogin.body.accessToken;
    patientDoc = await Patient.findOne({ userId: patientUser.id });

    // 2. Doctor
    const dRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'dr.nair@example.com',
        password: 'Password123!',
        name: 'Dr. Priya Nair',
        role: 'doctor',
        phone: '9876543202',
        specialty: 'dermatologist',
        registrationNumber: 'MCI-112233',
        bio: 'Consultant Dermatologist',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    doctorUser = dRes.body.user;
    doctorDoc = await Doctor.findOne({ userId: doctorUser.id });
    doctorDoc.verificationStatus = 'verified';
    await doctorDoc.save();

    const dLoginReal = await request(app)
      .post('/auth/login')
      .send({ email: 'dr.nair@example.com', password: 'Password123!' });
    doctorToken = dLoginReal.body.accessToken;

    // 3. Outsider User (neither patient nor doctor of appointment)
    const outRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'outsider@example.com',
        password: 'Password123!',
        name: 'Outsider User',
        role: 'patient',
        phone: '9876543203',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    outsiderUser = outRes.body.user;
    const outLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'outsider@example.com', password: 'Password123!' });
    outsiderToken = outLogin.body.accessToken;

    // 4. Create patient screening case
    testCase = await Case.create({
      patientId: patientDoc._id,
      createdBy: patientDoc.userId,
      lesionLabel: 'Suspicious Spot Right Forearm',
      bodySite: 'forearm_right',
      imagePaths: [
        {
          kind: 'current',
          path: 'cases/dummy_path.jpg',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
      status: 'completed',
    });
  });

  describe('REST Endpoints: RTC Configuration, Session Summary & Case Sharing', () => {
    it('GET /rtc/config returns dynamic iceServers and requires authentication', async () => {
      const unauth = await request(app).get('/rtc/config');
      expect(unauth.status).toBe(401);

      const res = await request(app)
        .get('/rtc/config')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.iceServers)).toBe(true);
      expect(res.body.iceServers.length).toBeGreaterThan(0);
      expect(res.body.iceServers[0].urls).toBeDefined();
    });

    it('PATCH /appointments/:id/summary allows attending doctor to record summary and writes audit log', async () => {
      const appointment = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        status: 'paid',
        durationMin: 15,
      });

      // Outsider attempt rejected
      const rejectRes = await request(app)
        .patch(`/appointments/${appointment._id}/summary`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ summary: 'Attempt to tamper' });
      expect(rejectRes.status).toBe(403);

      // Attending doctor succeeds
      const summaryText = 'Lesion evaluated; benign seborrheic keratosis features. Advised routine annual skin inspection.';
      const res = await request(app)
        .patch(`/appointments/${appointment._id}/summary`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ summary: summaryText });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionSummary).toBe(summaryText);

      const updated = await Appointment.findById(appointment._id);
      expect(updated.sessionSummary).toBe(summaryText);

      const audit = await AuditLog.findOne({
        action: 'APPOINTMENT_SUMMARY_UPDATED',
        entityId: appointment._id,
      });
      expect(audit).toBeTruthy();
    });

    it('GET /appointments/:id/case controls clinical case visibility strictly via patient consent', async () => {
      const appointment = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        caseId: testCase._id,
        mode: 'chat',
        status: 'paid',
      });

      // 1. Without consent: doctor views message stating consent is absent
      const noConsentRes = await request(app)
        .get(`/appointments/${appointment._id}/case`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(noConsentRes.status).toBe(200);
      expect(noConsentRes.body.consentActive).toBe(false);
      expect(noConsentRes.body.case).toBeNull();

      // 2. Patient grants consent
      const consentRes = await request(app)
        .post('/consents')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: String(doctorDoc._id),
          caseId: String(testCase._id),
        });
      expect(consentRes.status).toBe(201);
      const consentId = consentRes.body.consent.id;

      // 3. With active consent: doctor sees case details and writes audit log
      const withConsentRes = await request(app)
        .get(`/appointments/${appointment._id}/case`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(withConsentRes.status).toBe(200);
      expect(withConsentRes.body.consentActive).toBe(true);
      expect(withConsentRes.body.case).toBeTruthy();
      expect(withConsentRes.body.case.lesionLabel).toBe('Suspicious Spot Right Forearm');

      const audit = await AuditLog.findOne({
        action: 'DOCTOR_VIEW_CASE_SESSION',
        entityId: testCase._id,
      });
      expect(audit).toBeTruthy();

      // 4. Patient revokes consent: access ends immediately
      const revokeRes = await request(app)
        .delete(`/consents/${consentId}`)
        .set('Authorization', `Bearer ${patientToken}`);
      expect(revokeRes.status).toBe(200);

      const revokedViewRes = await request(app)
        .get(`/appointments/${appointment._id}/case`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(revokedViewRes.status).toBe(200);
      expect(revokedViewRes.body.consentActive).toBe(false);
      expect(revokedViewRes.body.case).toBeNull();
    });
  });

  describe('Real-time Socket.IO Sessions, Persistent Chat & WebRTC Signalling', () => {
    it('rejects unauthorised user from joining session room with session:error', async () => {
      const appointment = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        status: 'paid',
        scheduledAt: new Date(Date.now() + 5 * 60 * 1000), // Within 15m grace window
        durationMin: 15,
      });

      const clientSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: outsiderToken },
        transports: ['websocket'],
        forceNew: true,
        multiplex: false,
      });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        clientSocket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const ackRes = await new Promise((resolve) => {
        clientSocket.emit('chat:join', { appointmentId: String(appointment._id) }, resolve);
      });

      expect(ackRes.code).toBe('unauthorized');

      clientSocket.disconnect();
      clientSocket.close();
    });

    it('rejects participant joining outside scheduled time window', async () => {
      const appointment = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        kind: 'scheduled',
        mode: 'video',
        status: 'paid',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow (outside grace window)
        durationMin: 15,
      });

      const clientSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: patientToken },
        transports: ['websocket'],
        forceNew: true,
        multiplex: false,
      });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
        clientSocket.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        clientSocket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const ackRes = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('chat:join callback timed out')), 5000);
        clientSocket.emit('chat:join', { appointmentId: String(appointment._id) }, (res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });

      expect(ackRes.code).toBe('outside_window');

      clientSocket.disconnect();
      clientSocket.close();
    });

    it('transitions status to in_progress when both join, persists chat, and relays WebRTC signalling', async () => {
      const appointment = await Appointment.create({
        patientId: patientDoc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        status: 'paid',
        scheduledAt: new Date(Date.now() + 5 * 60 * 1000), // Within window
        durationMin: 15,
      });

      // Connect Patient socket
      const patientSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: patientToken },
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise((resolve, reject) => {
        patientSocket.on('connect', resolve);
        patientSocket.on('connect_error', reject);
      });

      // Connect Doctor socket
      const doctorSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: doctorToken },
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise((resolve, reject) => {
        doctorSocket.on('connect', resolve);
        doctorSocket.on('connect_error', reject);
      });

      // 1. Patient joins
      await new Promise((resolve) => {
        patientSocket.emit('chat:join', { appointmentId: String(appointment._id) }, resolve);
      });

      // Track in_progress transition
      const statusPromise = new Promise((resolve) => {
        doctorSocket.on('session:status', resolve);
      });

      // 2. Doctor joins
      await new Promise((resolve) => {
        doctorSocket.emit('chat:join', { appointmentId: String(appointment._id) }, resolve);
      });

      const statusData = await statusPromise;
      expect(statusData.status).toBe('in_progress');

      const dbAppt = await Appointment.findById(appointment._id);
      expect(dbAppt.status).toBe('in_progress');

      // 3. Persistent Chat: Patient sends message
      const msgPromise = new Promise((resolve) => {
        doctorSocket.on('chat:message', resolve);
      });

      patientSocket.emit('chat:message', {
        appointmentId: String(appointment._id),
        text: 'Hello doctor, I noticed this spot has changed color slightly over the last month.',
      });

      const receivedMsg = await msgPromise;
      expect(receivedMsg.text).toContain('changed color slightly');
      expect(receivedMsg.senderId).toBe(String(patientUser.id));

      // Verify persisted in DB
      const dbMsg = await Message.findOne({ appointmentId: appointment._id });
      expect(dbMsg).toBeTruthy();
      expect(dbMsg.text).toContain('changed color slightly');

      // 4. WebRTC Signalling: Doctor sends offer, patient receives offer
      const offerPromise = new Promise((resolve) => {
        patientSocket.on('rtc:offer', resolve);
      });

      doctorSocket.emit('rtc:offer', {
        appointmentId: String(appointment._id),
        sdp: { type: 'offer', sdp: 'dummy-sdp-data' },
      });

      const receivedOffer = await offerPromise;
      expect(receivedOffer.sdp.sdp).toBe('dummy-sdp-data');
      expect(receivedOffer.from).toBe(String(doctorUser.id));

      // Clean up
      patientSocket.disconnect();
      doctorSocket.disconnect();
    });

    it('emits case:consent_revoked live when patient revokes case consent', async () => {
      const doctorSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: doctorToken },
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise((resolve, reject) => {
        doctorSocket.on('connect', resolve);
        doctorSocket.on('connect_error', reject);
      });

      const consentRevokedPromise = new Promise((resolve) => {
        doctorSocket.on('case:consent_revoked', resolve);
      });

      // Grant consent
      const cRes = await request(app)
        .post('/consents')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: String(doctorDoc._id), caseId: String(testCase._id) });
      const consentId = cRes.body.consent.id;

      // Revoke consent
      await request(app)
        .delete(`/consents/${consentId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      const eventData = await consentRevokedPromise;
      expect(eventData.caseId).toBe(String(testCase._id));
      expect(eventData.doctorId).toBe(String(doctorDoc._id));

      doctorSocket.disconnect();
    });
  });
});
