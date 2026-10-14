import { z } from 'zod';
import mongoose from 'mongoose';
import config from '../config/env.js';

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

// Time in HH:mm 24-hour format
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in 24-hour HH:mm format');

export const updateProfileSchema = {
  body: z.object({
    specialty: z.enum(['dermatologist', 'wound_care', 'diabetologist', 'general']).optional(),
    bio: z.string().trim().min(10, 'Bio must be at least 10 characters').max(2000, 'Bio cannot exceed 2000 characters').optional(),
  }),
};

export const updateFeesSchema = {
  body: z
    .object({
      chat: z
        .number({ invalid_type_error: 'Chat fee must be a number' })
        .int('Chat fee must be a whole rupee amount')
        .min(config.MIN_FEE_INR, `Chat fee must be at least ₹${config.MIN_FEE_INR}`)
        .max(config.MAX_FEE_INR, `Chat fee cannot exceed ₹${config.MAX_FEE_INR}`),
      audio: z
        .number({ invalid_type_error: 'Audio fee must be a number' })
        .int('Audio fee must be a whole rupee amount')
        .min(config.MIN_FEE_INR, `Audio fee must be at least ₹${config.MIN_FEE_INR}`)
        .max(config.MAX_FEE_INR, `Audio fee cannot exceed ₹${config.MAX_FEE_INR}`),
      video: z
        .number({ invalid_type_error: 'Video fee must be a number' })
        .int('Video fee must be a whole rupee amount')
        .min(config.MIN_FEE_INR, `Video fee must be at least ₹${config.MIN_FEE_INR}`)
        .max(config.MAX_FEE_INR, `Video fee cannot exceed ₹${config.MAX_FEE_INR}`),
    })
    .strict(),
};

const weeklyRangeSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const updateAvailabilitySchema = {
  body: z
    .object({
      weekly: z.array(weeklyRangeSchema).optional().default([]),
      exceptions: z
        .array(
          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Exception dates must be in YYYY-MM-DD format')
        )
        .optional()
        .default([]),
      timezone: z.string().min(1).optional().default(config.DEFAULT_TIMEZONE),
    })
    .superRefine((data, ctx) => {
      // Check for overlapping ranges on the same weekday
      const byWeekday = new Map();
      for (let i = 0; i < data.weekly.length; i++) {
        const item = data.weekly[i];
        if (!byWeekday.has(item.weekday)) {
          byWeekday.set(item.weekday, []);
        }
        byWeekday.get(item.weekday).push({ ...item, originalIndex: i });
      }

      for (const [weekday, ranges] of byWeekday.entries()) {
        // Sort by start time
        ranges.sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (let j = 0; j < ranges.length - 1; j++) {
          const current = ranges[j];
          const next = ranges[j + 1];
          if (current.endTime > next.startTime) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Overlapping availability ranges detected on weekday ${weekday}: ${current.startTime}-${current.endTime} overlaps with ${next.startTime}-${next.endTime}`,
              path: ['weekly', next.originalIndex],
            });
          }
        }
      }
    }),
};

export const updatePresenceSchema = {
  body: z.object({
    mode: z.enum(['auto', 'offline'], {
      required_error: 'Presence mode must be either auto or offline',
    }),
  }),
};

export const getDoctorsQuerySchema = {
  query: z.object({
    specialty: z.enum(['dermatologist', 'wound_care', 'diabetologist', 'general']).optional(),
    online: z
      .string()
      .optional()
      .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  }),
};

export const getDoctorByIdSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
};

export const getDoctorSlotsSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  }),
};
