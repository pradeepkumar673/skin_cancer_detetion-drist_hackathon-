import { User } from './User.js';
import { Patient } from './Patient.js';
import { Doctor } from './Doctor.js';
import { Availability } from './Availability.js';
import { Case } from './Case.js';
import { Analysis } from './Analysis.js';
import { WoundMeasurement } from './WoundMeasurement.js';
import { Report } from './Report.js';
import { Appointment } from './Appointment.js';
import { Payment } from './Payment.js';
import { Message } from './Message.js';
import { Consent } from './Consent.js';
import { Feedback } from './Feedback.js';
import { EmailLog } from './EmailLog.js';
import { AuditLog } from './AuditLog.js';

export {
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
};

export const allModels = [
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
];

export async function initModels() {
  await Promise.all(allModels.map((model) => model.init()));
}

export default {
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
  initModels,
};
