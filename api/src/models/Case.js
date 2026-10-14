import mongoose from 'mongoose';

const imagePathSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    takenAt: { type: Date, default: Date.now },
    kind: {
      type: String,
      enum: ['current', 'prior', 'other_lesion'],
      default: 'current',
    },
    sha256: { type: String },
  },
  { _id: false }
);

const caseSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bodySite: {
      type: String,
      required: true,
    },
    imagePaths: [imagePathSchema],
    context: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'abstained'],
      default: 'queued',
      index: true,
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analysis',
    },
    lesionLabel: {
      type: String,
      trim: true,
    },
    followUpAt: {
      type: Date,
    },
    feedback: [
      {
        doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
        decision: { type: String, enum: ['accept', 'correct', 'reject'], required: true },
        correctedLabel: { type: String, trim: true },
        notes: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
export default Case;
