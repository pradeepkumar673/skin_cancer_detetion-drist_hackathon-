import { z } from 'zod';

export const createOrderSchema = z.object({
  appointmentId: z
    .string({ required_error: 'appointmentId is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid appointment ID format'),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string({ required_error: 'razorpay_order_id is required' }).min(1),
  razorpay_payment_id: z.string({ required_error: 'razorpay_payment_id is required' }).min(1),
  razorpay_signature: z.string({ required_error: 'razorpay_signature is required' }).min(1),
});

export const refundPaymentSchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
});
