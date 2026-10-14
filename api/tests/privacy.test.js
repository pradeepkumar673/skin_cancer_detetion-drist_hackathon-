import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Patient } from '../src/models/Patient.js';
import { Doctor } from '../src/models/Doctor.js';
import { Payment } from '../src/models/Payment.js';
import { Case } from '../src/models/Case.js';
import { Appointment } from '../src/models/Appointment.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { runAccountDeletion } from '../src/jobs/accountDeletion.js';
import { seedAdmin } from '../scripts/seedAdmin.js';

describe('Step 26: Privacy Export, Deletion Grace, Admin Users & Public Metrics', () => {
  let adminToken;
  let patientUser;
  let patientToken;

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
      Payment.deleteMany({}),
      Case.deleteMany({}),
      Appointment.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Create Patient
    const pRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient.privacy@skinsentry.local',
        password: 'Password123!',
        name: 'Privacy Patient',
        role: 'patient',
        phone: '9876543210',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: new Date().toISOString(),
      });
    expect(pRes.status).toBe(201);
    patientUser = pRes.body.user;

    const pLogin = await request(app)
      .post('/auth/login')
      .send({
        email: 'patient.privacy@skinsentry.local',
        password: 'Password123!',
      });
    patientToken = pLogin.body.accessToken;

    // Seed & Login Admin
    await seedAdmin();
    const aRes = await request(app)
      .post('/auth/login')
      .send({
        email: config.ADMIN_EMAIL || 'admin@skinsentry.local',
        password: config.ADMIN_PASSWORD || 'Password123!',
      });
    adminToken = aRes.body.accessToken;
  });

  it('GET /metrics/models returns aggregated summary and cache headers', async () => {
    const res = await request(app).get('/metrics/models');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.body.datasets).toBeInstanceOf(Array);
    expect(res.body.models).toBeDefined();
    expect(res.body.limitations).toBeInstanceOf(Array);
  });

  it('POST /me/export rejects invalid password and accepts correct password', async () => {
    // 1. Wrong password
    const failRes = await request(app)
      .post('/me/export')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ password: 'WrongPassword99!' });
    expect(failRes.status).toBe(401);

    // 2. Correct password
    const okRes = await request(app)
      .post('/me/export')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ password: 'Password123!' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.user).toBeDefined();
    expect(okRes.body.user.email).toBe('patient.privacy@skinsentry.local');
    expect(okRes.body.patientProfile).toBeDefined();
    expect(okRes.body.cases).toBeInstanceOf(Array);
    expect(okRes.body.auditTrail).toBeInstanceOf(Array);
  });

  it('DELETE /me schedules deletion and POST /me/cancel-deletion restores it', async () => {
    // 1. Request deletion
    const delRes = await request(app)
      .delete('/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ password: 'Password123!' });
    expect(delRes.status).toBe(200);
    expect(delRes.body.status).toBe('deletion_scheduled');

    // Verify DB state
    const userInDb = await User.findById(patientUser.id);
    expect(userInDb.deletionRequestedAt).not.toBeNull();

    // 2. Cancel deletion
    const cancelRes = await request(app)
      .post('/me/cancel-deletion')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('active');

    const restoredDb = await User.findById(patientUser.id);
    expect(restoredDb.deletionRequestedAt).toBeFalsy();
  });

  it('Admin can view users list and toggle active status', async () => {
    // 1. GET /admin/users
    const listRes = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.users.length).toBeGreaterThanOrEqual(1);

    // 2. PATCH /admin/users/:id/status
    const toggleRes = await request(app)
      .patch(`/admin/users/${patientUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isActive).toBe(false);

    const userDb = await User.findById(patientUser.id);
    expect(userDb.isActive).toBe(false);
  });

  it('accountDeletion job permanently removes accounts past grace period while anonymizing payments', async () => {
    // Set deletionRequestedAt in the past (beyond DELETION_GRACE_DAYS)
    const mongoose = (await import('mongoose')).default;
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(patientUser.id) },
      { $set: { deletionRequestedAt: pastDate } }
    );

    // Create a Payment record associated with patient and appointment
    const patientDoc = await Patient.findOne({ userId: patientUser.id });
    const payment = await Payment.create({
      patientId: patientDoc._id,
      appointmentId: new mongoose.Types.ObjectId(),
      amountPaise: 50000,
      currency: 'INR',
      status: 'paid',
      razorpayOrderId: 'order_test_privacy_123',
    });

    // Run account deletion job
    const result = await runAccountDeletion();
    expect(result.accountsDeleted).toBe(1);

    // User and Patient must be permanently deleted
    const deletedUser = await User.findById(patientUser.id);
    expect(deletedUser).toBeNull();

    // Payment record must be preserved but anonymized
    const keptPayment = await Payment.findById(payment._id);
    expect(keptPayment).not.toBeNull();
    expect(keptPayment.patientId).toBeNull();
    expect(keptPayment.notes?.anonymized).toBe(true);
  });
});
