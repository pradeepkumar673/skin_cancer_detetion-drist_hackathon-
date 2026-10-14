import mongoose from 'mongoose';

const woundMeasurementSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    lesionLabel: {
      type: String,
      trim: true,
    },
    takenAt: {
      type: Date,
      default: Date.now,
    },
    areaPx: {
      type: Number,
      required: true,
    },
    areaCm2: {
      type: Number,
      default: null,
    },
    tissue: {
      granulation: { type: Number, default: 0 },
      slough: { type: Number, default: 0 },
      necrotic: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const WoundMeasurement =
  mongoose.models.WoundMeasurement || mongoose.model('WoundMeasurement', woundMeasurementSchema);
export default WoundMeasurement;
