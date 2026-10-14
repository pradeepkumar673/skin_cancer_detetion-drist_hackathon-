import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true,
    },
    language: {
      type: String,
      default: 'en',
    },
    text: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['groq', 'template'],
      required: true,
    },
  },
  { timestamps: true }
);

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export default Report;
