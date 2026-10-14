import mongoose from 'mongoose';

const availabilitySchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      default: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
    },
    exceptions: [
      {
        type: Date,
      },
    ],
  },
  { timestamps: true }
);

availabilitySchema.index({ doctorId: 1, weekday: 1 });

export const Availability = mongoose.models.Availability || mongoose.model('Availability', availabilitySchema);
export default Availability;
