import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  User,
  Patient,
  Doctor,
  Availability,
  Case,
  Analysis,
  WoundMeasurement,
  Report,
  Appointment,
  Payment,
  Message,
  Consent,
  Feedback,
  EmailLog,
  AuditLog,
} from '../src/models/index.js';

describe('Mongoose Models Schema Verification', () => {
  it('instantiates all 15 models without error', () => {
    const userId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const doctorId = new mongoose.Types.ObjectId();
    const caseId = new mongoose.Types.ObjectId();
    const appointmentId = new mongoose.Types.ObjectId();

    const user = new User({
      email: 'test@example.com',
      passwordHash: 'hash123',
      name: 'John Doe',
      role: 'patient',
    });
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('patient');

    const patient = new Patient({
      userId,
      dateOfBirth: new Date('1990-01-01'),
      sex: 'male',
      skinType: 'III',
    });
    expect(patient.skinType).toBe('III');

    const doctor = new Doctor({
      userId,
      specialty: 'dermatologist',
      registrationNumber: 'MED12345',
      fees: { chat: 50000, audio: 80000, video: 100000 },
    });
    expect(doctor.specialty).toBe('dermatologist');

    const availability = new Availability({
      doctorId,
      weekday: 1,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'Asia/Kolkata',
    });
    expect(availability.weekday).toBe(1);

    const caseDoc = new Case({
      patientId,
      createdBy: userId,
      bodySite: 'Left forearm',
      imagePaths: [{ path: '/storage/sample.jpg', kind: 'current', sha256: 'abc' }],
    });
    expect(caseDoc.status).toBe('queued');

    const analysis = new Analysis({
      caseId,
      requestId: 'req-12345',
      modelVersions: { backbone: 'dinov2-small' },
      result: { score: 0.95 },
    });
    expect(analysis.requestId).toBe('req-12345');

    const wound = new WoundMeasurement({
      caseId,
      patientId,
      areaPx: 1200,
      tissue: { granulation: 0.7, slough: 0.2, necrotic: 0.1, other: 0 },
    });
    expect(wound.areaPx).toBe(1200);

    const report = new Report({
      caseId,
      text: 'Clinical summary content',
      source: 'groq',
    });
    expect(report.source).toBe('groq');

    const appointment = new Appointment({
      patientId,
      doctorId,
      mode: 'video',
      kind: 'scheduled',
    });
    expect(appointment.mode).toBe('video');

    const payment = new Payment({
      appointmentId,
      razorpayOrderId: 'order_123456789',
      amountPaise: 100000,
    });
    expect(payment.currency).toBe('INR');

    const message = new Message({
      appointmentId,
      senderId: userId,
      text: 'Hello doctor',
    });
    expect(message.text).toBe('Hello doctor');

    const consent = new Consent({
      patientId,
      doctorId,
      caseId,
    });
    expect(consent.grantedAt).toBeDefined();

    const feedback = new Feedback({
      caseId,
      doctorId,
      decision: 'accept',
      notes: 'Accurate triage recommendation',
    });
    expect(feedback.decision).toBe('accept');

    const emailLog = new EmailLog({
      to: 'patient@example.com',
      template: 'appointment_confirmation',
      status: 'sent',
    });
    expect(emailLog.status).toBe('sent');

    const auditLog = new AuditLog({
      actorId: userId,
      action: 'CASE_VIEWED',
      entityType: 'Case',
      entityId: caseId,
    });
    expect(auditLog.action).toBe('CASE_VIEWED');
  });
});
