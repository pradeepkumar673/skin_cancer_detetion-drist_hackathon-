import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Patient } from '../src/models/Patient.js';
import { Doctor } from '../src/models/Doctor.js';
import { AuditLog } from '../src/models/AuditLog.js';
import config from '../src/config/env.js';
import { seedAdmin } from '../scripts/seedAdmin.js';

const testDbUri = process.env.MONGODB_URI_TEST || config.MONGODB_URI_TEST;

const patientPassword = 'PatientPass1';
const doctorPassword = 'DoctorPass1x';

function patientBody(overrides = {}) {
  return {
    email: 'patient@example.com',
    password: patientPassword,
    name: 'Test Patient',
    role: 'patient',
    phone: '9876543210',
    languagePref: 'en',
    dateOfBirth: '1990-05-01',
    sex: 'female',
    skinType: 'IV',
    sunExposure: 'moderate',
    familyHistorySkinCancer: false,
    isDiabetic: false,
    ...overrides,
  };
}

function doctorBody(overrides = {}) {
  return {
    email: 'doctor@example.com',
    password: doctorPassword,
    name: 'Test Doctor',
    role: 'doctor',
    phone: '9876543211',
    languagePref: 'en',
    specialty: 'dermatologist',
    registrationNumber: 'TNMC12345',
    bio: 'Dermatologist registered with the state medical council.',
    ...overrides,
  };
}

async function register(body) {
  return request(app).post('/auth/register').send(body);
}

async function login(email, password) {
  return request(app).post('/auth/login').send({ email, password });
}

describe('Authentication and authorization', () => {
  beforeAll(async () => {
    await connectDB(testDbUri, 2, 500);
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    await seedAdmin();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('registers a patient', async () => {
    const res = await register(patientBody());
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('patient@example.com');
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.patient.skinType).toBe('IV');
    expect(res.body.user.passwordHash).toBeUndefined();

    const stored = await User.findOne({ email: 'patient@example.com' });
    expect(stored.passwordHash).toBeDefined();
    expect(stored.passwordHash).not.toContain(patientPassword);

    const audit = await AuditLog.findOne({ action: 'AUTH_REGISTER' });
    expect(audit).toBeTruthy();
  });

  it('registers a doctor as pending', async () => {
    const res = await register(doctorBody());
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('doctor');
    expect(res.body.verificationStatus).toBe('pending');
    expect(res.body.user.doctor.verificationStatus).toBe('pending');

    const doctor = await Doctor.findOne({}).populate('userId');
    expect(doctor.verificationStatus).toBe('pending');
    expect(doctor.userId.email).toBe('doctor@example.com');
  });

  it('rejects duplicate email with 409', async () => {
    await register(patientBody());
    const res = await register(patientBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
  });

  it('rejects a weak password with 400', async () => {
    const res = await register(patientBody({ password: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects role admin on register', async () => {
    const res = await register(patientBody({ role: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('logs in a patient and sets an httpOnly SameSite=Lax refresh cookie', async () => {
    await register(patientBody());
    const res = await login('patient@example.com', patientPassword);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('patient');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = setCookie.join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);

    const audit = await AuditLog.findOne({ action: 'AUTH_LOGIN' });
    expect(audit).toBeTruthy();
  });

  it('returns verificationStatus for a pending doctor on login', async () => {
    await register(doctorBody());
    const res = await login('doctor@example.com', doctorPassword);
    expect(res.status).toBe(200);
    expect(res.body.verificationStatus).toBe('pending');
  });

  it('fails login with a generic invalid credentials message', async () => {
    await register(patientBody());
    const res = await login('patient@example.com', 'WrongPass99');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('invalid credentials');
  });

  it('returns 401 for an expired access token', async () => {
    await register(patientBody());
    const user = await User.findOne({ email: 'patient@example.com' });
    const expired = jwt.sign(
      {
        sub: String(user._id),
        role: user.role,
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      config.JWT_SECRET
    );

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for GET /auth/me without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when a patient hits an admin route', async () => {
    await register(patientBody());
    const session = await login('patient@example.com', patientPassword);
    const res = await request(app)
      .get('/admin/doctors?status=pending')
      .set('Authorization', `Bearer ${session.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rotates refresh tokens and rejects reuse of the previous cookie', async () => {
    await register(patientBody());
    const loginRes = await login('patient@example.com', patientPassword);
    const firstCookie = loginRes.headers['set-cookie'];

    const refreshRes = await request(app).post('/auth/refresh').set('Cookie', firstCookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
    expect(refreshRes.body.accessToken).not.toBe(loginRes.body.accessToken);
    const rotatedCookie = refreshRes.headers['set-cookie'];
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie.join(';')).not.toBe(firstCookie.join(';'));

    const secondRefresh = await request(app).post('/auth/refresh').set('Cookie', rotatedCookie);
    expect(secondRefresh.status).toBe(200);
    expect(secondRefresh.body.accessToken).not.toBe(refreshRes.body.accessToken);

    const reuse = await request(app).post('/auth/refresh').set('Cookie', firstCookie);
    expect(reuse.status).toBe(401);
  });

  it('invalidates the refresh token on logout', async () => {
    await register(patientBody());
    const loginRes = await login('patient@example.com', patientPassword);
    const cookie = loginRes.headers['set-cookie'];

    const logoutRes = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app).post('/auth/refresh').set('Cookie', cookie);
    expect(refreshRes.status).toBe(401);

    const audit = await AuditLog.findOne({ action: 'AUTH_LOGOUT' });
    expect(audit).toBeTruthy();
  });

  it('lets an admin list pending doctors and verify one', async () => {
    await register(doctorBody());
    const adminLogin = await login(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
    expect(adminLogin.status).toBe(200);

    const list = await request(app)
      .get('/admin/doctors?status=pending')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.doctors).toHaveLength(1);
    expect(list.body.doctors[0].verificationStatus).toBe('pending');

    const doctorId = list.body.doctors[0].id;
    const verify = await request(app)
      .patch(`/admin/doctors/${doctorId}/verify`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ status: 'verified' });
    expect(verify.status).toBe(200);
    expect(verify.body.verificationStatus).toBe('verified');

    const stored = await Doctor.findById(doctorId);
    expect(stored.verificationStatus).toBe('verified');

    const audit = await AuditLog.findOne({ action: 'DOCTOR_VERIFY' });
    expect(audit).toBeTruthy();
    expect(audit.meta.status).toBe('verified');
  });

  it('blocks a pending doctor from a doctor-only route', async () => {
    await register(doctorBody());
    const session = await login('doctor@example.com', doctorPassword);
    const blocked = await request(app)
      .get('/doctors/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`);
    expect(blocked.status).toBe(403);

    const adminLogin = await login(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
    const list = await request(app)
      .get('/admin/doctors?status=pending')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    await request(app)
      .patch(`/admin/doctors/${list.body.doctors[0].id}/verify`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ status: 'verified' });

    const allowed = await request(app)
      .get('/doctors/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.doctor.verificationStatus).toBe('verified');
  });

  it('returns paginated audit logs to an admin', async () => {
    await register(patientBody());
    await login('patient@example.com', patientPassword);
    const adminLogin = await login(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);

    const res = await request(app)
      .get('/admin/audit?limit=2')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('seedAdmin is idempotent', async () => {
    const again = await seedAdmin();
    expect(again.created).toBe(false);
    expect(again.message).toBe('Admin already exists');
    const admins = await User.find({ role: 'admin' });
    expect(admins).toHaveLength(1);
  });
});
