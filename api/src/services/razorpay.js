import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../config/env.js';
import logger from '../utils/logger.js';

let razorpayClient = null;

/**
 * Returns the singleton Razorpay client instance.
 */
export function getRazorpayClient() {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayClient;
}

/**
 * Creates an order in Razorpay.
 * Amount must be an integer in paise.
 */
export async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount,
    currency,
    receipt,
    notes,
  });
  return order;
}

/**
 * Verifies Razorpay payment signature using timing-safe comparison.
 * HMAC SHA256 over "orderId|paymentId" signed with key secret.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  const payload = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');

  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(signature, 'utf-8')
  );
}

/**
 * Verifies Razorpay webhook signature from raw request body.
 * HMAC SHA256 over rawBody signed with webhook secret.
 */
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!rawBody || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(signature, 'utf-8')
  );
}

/**
 * Issues a refund for a payment via Razorpay.
 */
export async function refundRazorpayPayment({ paymentId, amount, notes = {} }) {
  const client = getRazorpayClient();
  const options = { notes };
  if (amount) {
    options.amount = amount;
  }
  const refund = await client.payments.refund(paymentId, options);
  return refund;
}
