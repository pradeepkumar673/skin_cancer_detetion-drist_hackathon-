import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      index: true,
    },
    template: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      required: true,
      index: true,
    },
    messageId: {
      type: String,
    },
    error: {
      type: String,
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const EmailLog = mongoose.models.EmailLog || mongoose.model('EmailLog', emailLogSchema);
export default EmailLog;
