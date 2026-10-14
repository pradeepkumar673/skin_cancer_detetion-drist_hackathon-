import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    dateOfBirth: {
      type: Date,
    },
    sex: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    skinType: {
      type: String,
      enum: ['I', 'II', 'III', 'IV', 'V', 'VI'],
    },
    sunExposure: {
      type: String,
    },
    familyHistorySkinCancer: {
      type: Boolean,
      default: false,
    },
    isDiabetic: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
export default Patient;
