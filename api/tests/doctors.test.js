import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as Client } from 'socket.io-client';

import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import User from '../src/models/User.js';
import Doctor from '../src/models/Doctor.js';
import Patient from '../src/models/Patient.js';
import Availability from '../src/models/Availability.js';
import Appointment from '../src/models/Appointment.js';
import AuditLog from '../src/models/AuditLog.js';
import { initSocket, clearAllPresenceTimers } from '../src/services/socket.js';
import { computeAvailableSlots } from '../src/utils/slots.js';

const testDbUri = process.env.MONGODB_URI_TEST || config.MONGODB_URI_TEST;

let httpServer = null;
let serverPort = null;
let patientToken = null;
let patientUser = null;
let doctorToken = null;
let doctorUser = null;
let doctorDoc = null;
let unverifiedDoctorToken = null;
let unverifiedDoctorUser = null;
let unverifiedDoctorDoc = null;

describe('Doctor Profiles, Availability, Fees & Live Presence (Step 21)', () => {
  beforeAll(async () => {
    await connectDB(testDbUri, 2, 500);

    // Start ephemeral HTTP server with Socket.IO for real socket testing
    httpServer = http.createServer(app);
    initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    serverPort = httpServer.address().port;
  });

  afterAll(async () => {
    clearAllPresenceTimers();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await disconnectDB();
  });

  beforeEach(async () => {
    clearAllPresenceTimers();
    await Promise.all([
      User.deleteMany({}),
      Doctor.deleteMany({}),
      Patient.deleteMany({}),
      Availability.deleteMany({}),
      Appointment.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Register and login Patient
    const patientRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient@example.com',
        password: 'Password123!',
        name: 'Jane Patient',
        role: 'patient',
        phone: '9876543210',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    patientUser = patientRes.body.user;

    const pLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'patient@example.com', password: 'Password123!' });
    patientToken = pLogin.body.accessToken;

    // 2. Register and login Doctor 1 (to be verified)
    const doc1Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'dr.smith@hospital.com',
        password: 'Password123!',
        name: 'Dr. John Smith',
        role: 'doctor',
        phone: '9876543211',
        specialty: 'dermatologist',
        registrationNumber: 'MCI-12345',
        bio: 'Board-certified dermatologist with 15 years clinical experience in skin oncology.',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    doctorUser = doc1Res.body.user;

    const dLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'dr.smith@hospital.com', password: 'Password123!' });
    doctorToken = dLogin.body.accessToken;

    // Verify Doctor 1 directly in DB
    doctorDoc = await Doctor.findOne({ userId: doctorUser.id });
    doctorDoc.verificationStatus = 'verified';
    await doctorDoc.save();

    // 3. Register and login Doctor 2 (unverified / pending)
    const doc2Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'dr.pending@hospital.com',
        password: 'Password123!',
        name: 'Dr. Pending',
        role: 'doctor',
        phone: '9876543212',
        specialty: 'wound_care',
        registrationNumber: 'MCI-99999',
        bio: 'Clinical wound specialist currently awaiting administrative credential verification.',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    unverifiedDoctorUser = doc2Res.body.user;

    const uLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'dr.pending@hospital.com', password: 'Password123!' });
    unverifiedDoctorToken = uLogin.body.accessToken;
    unverifiedDoctorDoc = await Doctor.findOne({ userId: unverifiedDoctorUser.id });
  });

  describe('Consultation Fees & Limits', () => {
    it('rejects fees below MIN_FEE_INR with HTTP 400 and clear error message', async () => {
      const res = await request(app)
        .put('/doctors/me/fees')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          chat: config.MIN_FEE_INR - 10,
          audio: 500,
          video: 1000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(JSON.stringify(res.body)).toContain(`Chat fee must be at least ₹${config.MIN_FEE_INR}`);
    });

    it('rejects fees above MAX_FEE_INR with HTTP 400 and clear error message', async () => {
      const res = await request(app)
        .put('/doctors/me/fees')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          chat: 500,
          audio: config.MAX_FEE_INR + 500,
          video: 1000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(JSON.stringify(res.body)).toContain(`Audio fee cannot exceed ₹${config.MAX_FEE_INR}`);
    });

    it('stores fees in paise and returns INR amounts upon successful update', async () => {
      const res = await request(app)
        .put('/doctors/me/fees')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          chat: 250,
          audio: 500,
          video: 1200,
        });

      expect(res.status).toBe(200);
      expect(res.body.feesINR).toEqual({ chat: 250, audio: 500, video: 1200 });
      expect(res.body.fees).toEqual({ chat: 25000, audio: 50000, video: 120000 });

      const updatedDoc = await Doctor.findById(doctorDoc._id);
      expect(updatedDoc.fees.chat).toBe(25000);
      expect(updatedDoc.fees.audio).toBe(50000);
      expect(updatedDoc.fees.video).toBe(120000);
    });

    it('blocks unverified doctor from updating fees with HTTP 403', async () => {
      const res = await request(app)
        .put('/doctors/me/fees')
        .set('Authorization', `Bearer ${unverifiedDoctorToken}`)
        .send({ chat: 300, audio: 500, video: 800 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('doctor_not_verified');
    });
  });

  describe('Availability & Schedule Validation', () => {
    it('rejects availability when end time is before start time with HTTP 400', async () => {
      const res = await request(app)
        .put('/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          weekly: [{ weekday: 1, startTime: '15:00', endTime: '11:00' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(JSON.stringify(res.body)).toContain('End time must be after start time');
    });

    it('rejects overlapping ranges on the same weekday with HTTP 400', async () => {
      const res = await request(app)
        .put('/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          weekly: [
            { weekday: 1, startTime: '09:00', endTime: '12:00' },
            { weekday: 1, startTime: '11:30', endTime: '14:00' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(JSON.stringify(res.body)).toContain('Overlapping availability ranges detected');
    });

    it('accepts valid weekly schedule and exception dates', async () => {
      const res = await request(app)
        .put('/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          weekly: [
            { weekday: 1, startTime: '09:00', endTime: '11:00' },
            { weekday: 1, startTime: '14:00', endTime: '17:00' },
            { weekday: 3, startTime: '10:00', endTime: '13:00' },
          ],
          exceptions: ['2026-10-26', '2026-11-02'],
          timezone: 'Asia/Kolkata',
        });

      expect(res.status).toBe(200);
      expect(res.body.weekly).toHaveLength(3);
      expect(res.body.exceptions).toHaveLength(2);

      const dbAvail = await Availability.find({ doctorId: doctorDoc._id });
      expect(dbAvail).toHaveLength(3);
    });
  });

  describe('Slot Generation, Exceptions, Timezone & Past Slot Filtering', () => {
    it('computes 15-minute slot intervals from weekly ranges', () => {
      const availabilities = [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '10:00',
          timezone: 'Asia/Kolkata',
          exceptions: [],
        },
      ];

      const slots = computeAvailableSlots({
        dateStr: '2026-10-19',
        availabilities,
        timezone: 'Asia/Kolkata',
        slotDurationMin: 15,
        currentDateForTest: new Date('2026-10-18T00:00:00Z'),
      });

      expect(slots).toEqual(['09:00', '09:15', '09:30', '09:45']);
    });

    it('returns empty slots when the date is marked as an exception', () => {
      const availabilities = [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '12:00',
          timezone: 'Asia/Kolkata',
          exceptions: ['2026-10-19'],
        },
      ];

      const slots = computeAvailableSlots({
        dateStr: '2026-10-19',
        availabilities,
        timezone: 'Asia/Kolkata',
        currentDateForTest: new Date('2026-10-18T00:00:00Z'),
      });

      expect(slots).toEqual([]);
    });

    it('excludes slots overlapping with conflicting appointments', () => {
      const availabilities = [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '10:00',
          timezone: 'Asia/Kolkata',
          exceptions: [],
        },
      ];

      const appointments = [
        {
          scheduledAt: new Date('2026-10-19T03:45:00Z'),
          durationMin: 15,
          status: 'paid',
        },
      ];

      const slots = computeAvailableSlots({
        dateStr: '2026-10-19',
        availabilities,
        appointments,
        timezone: 'Asia/Kolkata',
        currentDateForTest: new Date('2026-10-18T00:00:00Z'),
      });

      expect(slots).toEqual(['09:00', '09:30', '09:45']);
    });

    it('excludes past slots when querying the current day', () => {
      const availabilities = [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '12:00',
          timezone: 'Asia/Kolkata',
          exceptions: [],
        },
      ];

      const mockNow = new Date('2026-10-19T04:50:00Z');

      const slots = computeAvailableSlots({
        dateStr: '2026-10-19',
        availabilities,
        timezone: 'Asia/Kolkata',
        currentDateForTest: mockNow,
      });

      expect(slots).toEqual(['10:30', '10:45', '11:00', '11:15', '11:30', '11:45']);
    });
  });

  describe('Public Doctor Directory & Unverified Doctor Restrictions', () => {
    it('unverified doctor does not appear in GET /doctors list', async () => {
      const res = await request(app)
        .get('/doctors')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(1);
      expect(res.body.doctors[0].id).toBe(String(doctorDoc._id));
      expect(res.body.doctors[0].name).toBe('Dr. John Smith');
      const ids = res.body.doctors.map((d) => d.id);
      expect(ids).not.toContain(String(unverifiedDoctorDoc._id));
    });

    it('returns 404 when requesting profile or slots of an unverified doctor', async () => {
      const profileRes = await request(app)
        .get(`/doctors/${unverifiedDoctorDoc._id}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(profileRes.status).toBe(404);
      expect(profileRes.body.error).toBe('doctor_not_found');

      const slotsRes = await request(app)
        .get(`/doctors/${unverifiedDoctorDoc._id}/slots?date=2026-10-19`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(slotsRes.status).toBe(404);
      expect(slotsRes.body.error).toBe('doctor_not_found');
    });

    it('sorts online doctors first then alphabetically by name', async () => {
      // Create a second verified doctor who is offline
      const docBRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'dr.alice@hospital.com',
          password: 'Password123!',
          name: 'Dr. Alice Cooper',
          role: 'doctor',
          phone: '9876543219',
          specialty: 'dermatologist',
          registrationNumber: 'MCI-55555',
          bio: 'Specialist in pediatric dermatology and chronic inflammatory conditions.',
          termsVersionAccepted: 'v1.0',
          termsAcceptedAt: new Date().toISOString(),
        });
      const docBDoc = await Doctor.findOne({ userId: docBRes.body.user.id });
      docBDoc.verificationStatus = 'verified';
      docBDoc.isOnline = false;
      await docBDoc.save();

      // Mark Dr. John Smith as online
      doctorDoc.isOnline = true;
      doctorDoc.presenceMode = 'auto';
      await doctorDoc.save();

      const res = await request(app)
        .get('/doctors')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(2);
      expect(res.body.doctors[0].name).toBe('Dr. John Smith');
      expect(res.body.doctors[0].isOnline).toBe(true);
      expect(res.body.doctors[1].name).toBe('Dr. Alice Cooper');
      expect(res.body.doctors[1].isOnline).toBe(false);
    });
  });

  describe('Real-time Socket.IO Presence, Grace Period & Multi-tab Support', () => {
    it('handles multi-tab connections and presence grace period via real socket.io-client', async () => {
      // 1. Patient connects socket and subscribes to presence
      const patientSocket = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: patientToken },
        transports: ['websocket'],
      });
      await new Promise((resolve, reject) => {
        patientSocket.on('connect', resolve);
        patientSocket.on('connect_error', reject);
      });

      const presenceEvents = [];
      patientSocket.on('doctor:presence', (evt) => {
        presenceEvents.push(evt);
      });
      patientSocket.emit('presence:subscribe');

      await new Promise((r) => setTimeout(r, 50));

      // 2. Doctor opens Tab 1
      const doctorTab1 = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: doctorToken },
        transports: ['websocket'],
      });
      await new Promise((resolve, reject) => {
        doctorTab1.on('connect', resolve);
        doctorTab1.on('connect_error', reject);
      });

      await new Promise((r) => setTimeout(r, 100));

      // Doctor is now marked online
      const docAfterConnect = await Doctor.findById(doctorDoc._id);
      expect(docAfterConnect.isOnline).toBe(true);
      expect(presenceEvents.some((e) => e.doctorId === String(doctorDoc._id) && e.isOnline === true)).toBe(true);

      // 3. Doctor opens Tab 2 (multi-tab)
      const doctorTab2 = Client(`http://127.0.0.1:${serverPort}`, {
        auth: { token: doctorToken },
        transports: ['websocket'],
      });
      await new Promise((resolve, reject) => {
        doctorTab2.on('connect', resolve);
        doctorTab2.on('connect_error', reject);
      });
      await new Promise((r) => setTimeout(r, 50));

      // 4. Doctor closes Tab 1; Tab 2 remains open
      doctorTab1.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Doctor should still be online because Tab 2 is active
      const docStillOnline = await Doctor.findById(doctorDoc._id);
      expect(docStillOnline.isOnline).toBe(true);

      // Clean up sockets
      doctorTab2.disconnect();
      patientSocket.disconnect();
    });

    it('immediately sets presence to offline when mode is toggled to offline', async () => {
      const patchRes = await request(app)
        .patch('/doctors/me/presence')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ mode: 'offline' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.presenceMode).toBe('offline');
      expect(patchRes.body.isOnline).toBe(false);

      const dbDoc = await Doctor.findById(doctorDoc._id);
      expect(dbDoc.presenceMode).toBe('offline');
      expect(dbDoc.isOnline).toBe(false);

      const listRes = await request(app)
        .get('/doctors')
        .set('Authorization', `Bearer ${patientToken}`);

      const doc = listRes.body.doctors.find((d) => d.id === String(doctorDoc._id));
      expect(doc.isOnline).toBe(false);
    });
  });
});
