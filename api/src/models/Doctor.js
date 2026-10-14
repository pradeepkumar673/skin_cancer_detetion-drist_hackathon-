import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    specialty: {
      type: String,
      enum: ['dermatologist', 'wound_care', 'diabetologist', 'general'],
      required: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      trim: true,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    fees: {
      chat: { type: Number, default: 0 },
      audio: { type: Number, default: 0 },
      video: { type: Number, default: 0 },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    presenceMode: {
      type: String,
      enum: ['auto', 'offline'],
      default: 'auto',
    },
    lastSeenAt: {
      type: Date,
    },
    bio: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
export default Doctor;
