import { z } from 'zod';
import mongoose from 'mongoose';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const phoneSchema = z.string().trim().min(8).max(20);
const objectIdSchema = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id',
});

export const registerSchema = {
  body: z
    .object({
      email: z.string().trim().email().max(254),
      password: passwordSchema,
      name: z.string().trim().min(2).max(120),
      role: z.enum(['patient', 'doctor']),
      phone: phoneSchema,
      languagePref: z.enum(['en', 'ta', 'hi']).default('en'),
      dateOfBirth: z.coerce.date().optional(),
      sex: z.enum(['male', 'female', 'other']).optional(),
      skinType: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI']).optional(),
      sunExposure: z.string().trim().max(200).optional(),
      familyHistorySkinCancer: z.boolean().optional(),
      isDiabetic: z.boolean().optional(),
      specialty: z.enum(['dermatologist', 'wound_care', 'diabetologist', 'general']).optional(),
      registrationNumber: z.string().trim().min(3).max(80).optional(),
      bio: z.string().trim().min(10).max(2000).optional(),
      termsVersionAccepted: z.string().min(1, 'termsVersionAccepted is required'),
      termsAcceptedAt: z.coerce.date({ required_error: 'termsAcceptedAt is required' }),
      healthDataConsentAt: z.coerce.date().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.role === 'patient' && !data.healthDataConsentAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['healthDataConsentAt'],
          message: 'healthDataConsentAt is required for patients',
        });
      }
      if (data.role === 'doctor') {
        if (!data.specialty) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['specialty'], message: 'specialty is required for doctors' });
        }
        if (!data.registrationNumber) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['registrationNumber'],
            message: 'registrationNumber is required for doctors',
          });
        }
        if (!data.bio) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bio'], message: 'bio is required for doctors' });
        }
      }
    }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  }),
};

export const adminDoctorsQuerySchema = {
  query: z.object({
    status: z.enum(['pending', 'verified', 'rejected']).optional(),
  }),
};

export const verifyDoctorSchema = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    status: z.enum(['verified', 'rejected']),
  }),
};

export const adminAuditQuerySchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: objectIdSchema.optional(),
  }),
};

export default {
  registerSchema,
  loginSchema,
  adminDoctorsQuerySchema,
  verifyDoctorSchema,
  adminAuditQuerySchema,
};
