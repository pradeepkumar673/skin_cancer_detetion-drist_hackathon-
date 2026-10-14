import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
    },
    mode: {
      type: String,
      enum: ['chat', 'audio', 'video'],
      required: true,
    },
    kind: {
      type: String,
      enum: ['instant', 'scheduled'],
      default: 'scheduled',
    },
    status: {
      type: String,
      enum: [
        'requested',
        'awaiting_payment',
        'paid',
        'in_progress',
        'completed',
        'cancelled',
        'expired',
        'no_show',
      ],
      default: 'requested',
      index: true,
    },
    scheduledAt: {
      type: Date,
      index: true,
    },
    durationMin: {
      type: Number,
      default: 15,
    },
    note: {
      type: String,
      trim: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    confirmedAt: {
      type: Date,
    },
    paymentDeadlineAt: {
      type: Date,
      index: true,
    },
    cancelledReason: {
      type: String,
      trim: true,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reminderSent: {
      h24: { type: Boolean, default: false },
      h1: { type: Boolean, default: false },
    },
    sessionStartedAt: {
      type: Date,
    },
    sessionEndedAt: {
      type: Date,
    },
    sessionSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

// Atomic double-booking protection: unique index for active slots
appointmentSchema.index(
  { doctorId: 1, scheduledAt: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['awaiting_payment', 'paid', 'in_progress'] },
      scheduledAt: { $exists: true },
    },
  }
);

export const Appointment =
  mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
export default Appointment;
