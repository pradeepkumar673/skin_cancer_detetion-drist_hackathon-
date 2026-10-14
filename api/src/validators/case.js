import { z } from 'zod';

export const createCaseSchema = z.object({
  bodySite: z.string().min(1, 'bodySite is required'),
  lesionLabel: z.string().optional().default(''),
  takenAt: z.string().datetime().or(z.date()).optional(),
  language: z.enum(['en', 'ta', 'hi']).optional().default('en'),
  context: z
    .object({
      skinType: z.string().optional(),
      sunExposure: z.string().optional(),
      familyHistorySkinCancer: z.boolean().optional(),
      isDiabetic: z.boolean().optional(),
      pxPerCm: z.number().positive().optional(),
    })
    .optional()
    .default({}),
});

export const followupSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
});

export const explanationSchema = z.object({
  language: z.enum(['en', 'ta', 'hi']).optional().default('en'),
});

export const feedbackSchema = z.object({
  decision: z.enum(['accept', 'correct', 'reject']),
  correctedLabel: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

