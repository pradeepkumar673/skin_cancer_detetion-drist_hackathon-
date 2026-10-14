import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Patient } from '../src/models/Patient.js';
import { Doctor } from '../src/models/Doctor.js';
import { Appointment } from '../src/models/Appointment.js';
import { Payment } from '../src/models/Payment.js';
import { EmailLog } from '../src/models/EmailLog.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { setTransporter } from '../src/services/mailer.js';
import * as razorpayService from '../src/services/razorpay.js';
import { seedAdmin } from '../scripts/seedAdmin.js';

describe('Razorpay Payments, Verification, Webhooks & Refunds (Step 23)', () => {
  let patient1User;
  let patient1Doc;
  let patient1Token;

  let patient2User;
  let patient2Doc;
  let patient2Token;

  let doctorUser;
  let doctorDoc;
  let doctorToken;

  let adminUser;
  let adminToken;

  const sentEmails = [];

  beforeAll(async () => {
    process.env.MONGODB_URI = config.MONGODB_URI_TEST;
    await connectDB(config.MONGODB_URI_TEST);

    setTransporter({
      sendMail: async (options) => {
        sentEmails.push(options);
        return { messageId: `<mock-${Date.now()}@skinsentry.local>` };
      },
      verify: async () => true,
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    sentEmails.length = 0;
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      Appointment.deleteMany({}),
      Payment.deleteMany({}),
      EmailLog.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Patient 1
    const p1Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient1@example.com',
        password: 'Password123!',
        name: 'Aarav Sharma',
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

    // 2. Patient 2 (unauthorized checks)
    const p2Res = await request(app)
      .post('/auth/register')
      .send({
        email: 'patient2@example.com',
        password: 'Password123!',
        name: 'Rohan Verma',
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
        email: 'dr.priya@hospital.com',
        password: 'Password123!',
        name: 'Dr. Priya Nair',
        role: 'doctor',
        phone: '9876543212',
        specialty: 'dermatologist',
        registrationNumber: 'MCI-998877',
        bio: 'Dermatologist with 10 years experience',
        termsVersionAccepted: 'v1.0',
        termsAcceptedAt: new Date().toISOString(),
      });
    doctorUser = docRes.body.user;
    doctorDoc = await Doctor.findOne({ userId: doctorUser.id });
    doctorDoc.verificationStatus = 'verified';
    doctorDoc.fees = {
      chat: 30000, // 300 INR
      audio: 50000, // 500 INR
      video: 80000, // 800 INR
    };
    await doctorDoc.save();

    const dLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'dr.priya@hospital.com', password: 'Password123!' });
    doctorToken = dLogin.body.accessToken;

    // 4. Admin
    await seedAdmin();
    const aLogin = await request(app)
      .post('/auth/login')
      .send({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD });
    adminToken = aLogin.body.accessToken;
    adminUser = aLogin.body.user;

    // Mock Razorpay orders.create to return deterministic mock order immediately
    const client = razorpayService.getRazorpayClient();
    vi.spyOn(client.orders, 'create').mockImplementation(async (opts) => {
      return {
        id: `order_${Date.now()}_mock`,
        entity: 'order',
        amount: opts.amount,
        amount_paid: 0,
        amount_due: opts.amount,
        currency: opts.currency || 'INR',
        receipt: opts.receipt,
        status: 'created',
        notes: opts.notes,
        created_at: Math.floor(Date.now() / 1000),
      };
    });
  });

  describe('Order Creation: POST /payments/order', () => {
    it('computes amount strictly from doctor stored fee and rejects client amount override', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'awaiting_payment',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const res = await request(app)
        .post('/payments/order')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          appointmentId: String(appointment._id),
          amount: 50, // Client attempt to override fee
        });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBeDefined();
      expect(res.body.amount).toBe(30000); // Strictly 30000 paise (300 INR)
      expect(res.body.currency).toBe('INR');
      expect(res.body.keyId).toBe(config.RAZORPAY_KEY_ID);

      const payment = await Payment.findOne({ appointmentId: appointment._id });
      expect(payment).toBeTruthy();
      expect(payment.amountPaise).toBe(30000);
      expect(payment.status).toBe('created');
    });

    it('reuses existing unpaid order for the appointment if already created', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        kind: 'scheduled',
        status: 'awaiting_payment',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const res1 = await request(app)
        .post('/payments/order')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ appointmentId: String(appointment._id) });
      expect(res1.status).toBe(201);
      const orderId1 = res1.body.orderId;

      const res2 = await request(app)
        .post('/payments/order')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ appointmentId: String(appointment._id) });
      expect(res2.status).toBe(200);
      expect(res2.body.orderId).toBe(orderId1);
      expect(res2.body.amount).toBe(80000);

      const count = await Payment.countDocuments({ appointmentId: appointment._id });
      expect(count).toBe(1);
    });

    it('rejects order creation if appointment payment window has expired', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'awaiting_payment',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        paymentDeadlineAt: new Date(Date.now() - 5 * 60 * 1000), // Expired
      });

      const res = await request(app)
        .post('/payments/order')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ appointmentId: String(appointment._id) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('payment_window_expired');
    });

    it('rejects order creation if requested by another patient', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'awaiting_payment',
        paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const res = await request(app)
        .post('/payments/order')
        .set('Authorization', `Bearer ${patient2Token}`)
        .send({ appointmentId: String(appointment._id) });

      expect(res.status).toBe(403);
    });
  });

  describe('Signature Verification: POST /payments/verify', () => {
    it('verifies valid HMAC SHA256 signature, transitions status to paid, and logs emails', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'audio',
        kind: 'scheduled',
        status: 'awaiting_payment',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const orderId = `order_${Date.now()}_test`;
      const paymentId = `pay_${Date.now()}_test`;

      await Payment.create({
        appointmentId: appointment._id,
        patientId: patient1Doc._id,
        razorpayOrderId: orderId,
        amountPaise: 50000,
        currency: 'INR',
        status: 'created',
      });

      // Generate valid signature using crypto HMAC
      const signature = crypto
        .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/payments/verify')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.status).toBe('paid');

      const updatedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(updatedPayment.status).toBe('paid');
      expect(updatedPayment.signatureVerified).toBe(true);
      expect(updatedPayment.razorpayPaymentId).toBe(paymentId);

      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('paid');

      const emailLogs = await EmailLog.find({
        to: { $in: ['patient1@example.com', 'dr.priya@hospital.com'] },
      });
      expect(emailLogs.length).toBeGreaterThanOrEqual(2);
      expect(emailLogs.some((l) => l.template === 'receipt_to_patient')).toBe(true);
      expect(emailLogs.some((l) => l.template === 'payment_received_to_doctor')).toBe(true);

      const audit = await AuditLog.findOne({
        action: 'payment_verified',
        entityId: updatedPayment._id,
      });
      expect(audit).toBeTruthy();
    });

    it('rejects tampered signature with HTTP 400 and keeps appointment awaiting_payment', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'awaiting_payment',
        paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const orderId = `order_${Date.now()}_test`;
      const paymentId = `pay_${Date.now()}_test`;

      await Payment.create({
        appointmentId: appointment._id,
        patientId: patient1Doc._id,
        razorpayOrderId: orderId,
        amountPaise: 30000,
        currency: 'INR',
        status: 'created',
      });

      const realSignature = crypto
        .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const tamperedSignature =
        realSignature.slice(0, -1) + (realSignature.slice(-1) === 'a' ? 'b' : 'a');

      const res = await request(app)
        .post('/payments/verify')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: tamperedSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_signature');

      const unchangedAppt = await Appointment.findById(appointment._id);
      expect(unchangedAppt.status).toBe('awaiting_payment');

      const unchangedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(unchangedPayment.status).toBe('created');
    });

    it('rejects verify attempt by a different patient with HTTP 403', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'awaiting_payment',
      });

      const orderId = `order_${Date.now()}_test`;
      const paymentId = `pay_${Date.now()}_test`;

      await Payment.create({
        appointmentId: appointment._id,
        patientId: patient1Doc._id,
        razorpayOrderId: orderId,
        amountPaise: 30000,
        currency: 'INR',
        status: 'created',
      });

      const signature = crypto
        .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/payments/verify')
        .set('Authorization', `Bearer ${patient2Token}`)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Webhook Endpoint: POST /payments/webhook', () => {
    it('rejects webhook with invalid signature with HTTP 400', async () => {
      const rawBody = JSON.stringify({ event: 'payment.captured' });
      const res = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'invalid_signature_hex')
        .send(rawBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_signature');
    });

    it('idempotently processes payment.captured and ignores duplicate event IDs', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'video',
        kind: 'scheduled',
        status: 'awaiting_payment',
      });

      const orderId = `order_${Date.now()}_hook`;
      const paymentId = `pay_${Date.now()}_hook`;

      await Payment.create({
        appointmentId: appointment._id,
        patientId: patient1Doc._id,
        razorpayOrderId: orderId,
        amountPaise: 80000,
        currency: 'INR',
        status: 'created',
        webhookEvents: [],
      });

      const webhookPayload = {
        event: 'payment.captured',
        id: 'evt_unique_12345',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 80000,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      // First delivery
      const res1 = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', 'evt_unique_12345')
        .send(rawBody);

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('ok');

      const updatedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(updatedPayment.status).toBe('paid');
      expect(updatedPayment.webhookEvents).toContain('evt_unique_12345');

      const updatedAppt = await Appointment.findById(appointment._id);
      expect(updatedAppt.status).toBe('paid');

      // Duplicate delivery
      const res2 = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', 'evt_unique_12345')
        .send(rawBody);

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('ignored_duplicate');
    });
  });

  describe('Admin Refund: POST /admin/payments/:id/refund', () => {
    it('issues refund via Razorpay, updates status to refunded, cancels appointment and emails patient', async () => {
      const appointment = await Appointment.create({
        patientId: patient1Doc._id,
        doctorId: doctorDoc._id,
        mode: 'chat',
        kind: 'scheduled',
        status: 'paid',
      });

      const payment = await Payment.create({
        appointmentId: appointment._id,
        patientId: patient1Doc._id,
        razorpayOrderId: `order_${Date.now()}_refund`,
        razorpayPaymentId: `pay_${Date.now()}_refund`,
        amountPaise: 30000,
        currency: 'INR',
        status: 'paid',
        signatureVerified: true,
      });

      const client = razorpayService.getRazorpayClient();
      const refundSpy = vi.spyOn(client.payments, 'refund').mockResolvedValueOnce({
        id: `rfnd_${Date.now()}`,
        payment_id: payment.razorpayPaymentId,
        amount: 30000,
        status: 'processed',
      });

      const res = await request(app)
        .post(`/admin/payments/${payment._id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Patient requested cancellation prior to session window',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.status).toBe('refunded');
      expect(res.body.refundPolicy).toBe(config.REFUND_POLICY_TEXT);

      expect(refundSpy).toHaveBeenCalled();

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('refunded');
      expect(updatedPayment.refundReason).toBe('Patient requested cancellation prior to session window');

      const updatedAppt = await Appointment.findById(appointment._id);
      expect(updatedAppt.status).toBe('cancelled');

      const refundEmailLog = await EmailLog.findOne({
        to: 'patient1@example.com',
        template: 'refund_to_patient',
      });
      expect(refundEmailLog).toBeTruthy();

      refundSpy.mockRestore();
    });

    it('rejects refund request by non-admin with HTTP 403', async () => {
      const payment = await Payment.create({
        appointmentId: new mongoose.Types.ObjectId(),
        patientId: patient1Doc._id,
        razorpayOrderId: `order_forbidden`,
        amountPaise: 30000,
        status: 'paid',
      });

      const res = await request(app)
        .post(`/admin/payments/${payment._id}/refund`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Self refund attempt' });

      expect(res.status).toBe(403);
    });
  });
});
