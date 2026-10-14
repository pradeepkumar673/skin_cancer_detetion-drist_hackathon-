import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
      index: true,
    },
    modelVersions: {
      type: Object,
      default: {},
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
    },
    durationMs: {
      type: Number,
    },
    error: {
      type: String,
    },
  },
  { timestamps: true }
);

export const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);
export default Analysis;
