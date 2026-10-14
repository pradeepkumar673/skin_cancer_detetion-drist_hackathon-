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
    reminderSent: {
      h24: { type: Boolean, default: false },
      h1: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const Appointment =
  mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
export default Appointment;
