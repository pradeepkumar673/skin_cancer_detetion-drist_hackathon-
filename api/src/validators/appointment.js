import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

export const createAppointmentSchema = {
  body: z.object({
    doctorId: objectIdSchema,
    mode: z.enum(['chat', 'audio', 'video'], {
      required_error: 'Consultation mode is required (chat, audio, video)',
    }),
    caseId: objectIdSchema.optional(),
    note: z.string().trim().max(1000).optional(),
    scheduledAt: z.coerce.date().optional(),
    kind: z.enum(['instant', 'scheduled']).optional(),
  }),
};

export const scheduleAppointmentSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    scheduledAt: z.coerce.date({
      required_error: 'scheduledAt date and time is required',
    }),
    durationMin: z.number().int().min(5).max(120).optional().default(15),
  }),
};

export const cancelAppointmentSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    reason: z
      .string({ required_error: 'Cancellation reason is required' })
      .trim()
      .min(3, 'Cancellation reason must be at least 3 characters')
      .max(500, 'Cancellation reason cannot exceed 500 characters'),
  }),
};

export const getAppointmentsQuerySchema = {
  query: z.object({
    status: z
      .enum([
        'requested',
        'awaiting_payment',
        'paid',
        'in_progress',
        'completed',
        'cancelled',
        'expired',
        'no_show',
      ])
      .optional(),
  }),
};

export const createConsentSchema = {
  body: z.object({
    doctorId: objectIdSchema,
    caseId: objectIdSchema,
  }),
};

export const revokeConsentSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
};
