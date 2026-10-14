import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    decision: {
      type: String,
      enum: ['accept', 'correct', 'reject'],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    correctedLabel: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
export default Feedback;
