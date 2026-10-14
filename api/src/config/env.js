import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to api root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().min(1, 'CLIENT_URL is required'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  AI_SERVICE_URL: z.string().min(1, 'AI_SERVICE_URL is required'),
  AI_SERVICE_API_KEY: z.string().min(1, 'AI_SERVICE_API_KEY is required'),
  STORAGE_DIR: z.string().min(1).default('../storage'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  RAZORPAY_KEY_ID: z.string().min(1, 'RAZORPAY_KEY_ID is required'),
  RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, 'RAZORPAY_WEBHOOK_SECRET is required'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1, 'SMTP_USER is required'),
  SMTP_PASS: z.string().min(1, 'SMTP_PASS is required'),
  MAIL_FROM: z.string().min(1, 'MAIL_FROM is required'),
  STUN_URLS: z.string().min(1).default('stun:stun.l.google.com:19302'),
  TURN_URL: z.string().optional().default(''),
  TURN_USERNAME: z.string().optional().default(''),
  TURN_CREDENTIAL: z.string().optional().default(''),
  MONGODB_URI_TEST: z.string().min(1).default('mongodb://127.0.0.1:27017/skinsentry_test'),
  DEFAULT_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  ALLOWED_IMAGE_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
  ANALYSIS_CONCURRENCY: z.coerce.number().default(2),
  PRESENCE_GRACE_SECONDS: z.coerce.number().default(60),
  PAYMENT_WINDOW_MINUTES: z.coerce.number().default(30),
  SESSION_GRACE_MINUTES: z.coerce.number().default(15),
  MIN_FEE_INR: z.coerce.number().default(100),
  MAX_FEE_INR: z.coerce.number().default(5000),
  RETENTION_CASE_DAYS: z.coerce.number().default(365),
  RETENTION_AUDIT_DAYS: z.coerce.number().default(1825),
  DELETION_GRACE_DAYS: z.coerce.number().default(30),
  FOLLOWUP_DEFAULT_DAYS: z.coerce.number().default(14),
  REFUND_POLICY_TEXT: z.string().min(1, 'REFUND_POLICY_TEXT is required'),
  ORG_NAME: z.string().min(1, 'ORG_NAME is required'),
  CONTACT_EMAIL: z.string().email('CONTACT_EMAIL must be a valid email'),
  GOVERNING_LAW: z.string().min(1, 'GOVERNING_LAW is required'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  REFRESH_COOKIE_NAME: z.string().min(1).default('refreshToken'),
});

export function validateEnv(source = process.env, exitOnError = true) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const missingOrInvalid = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    const errorMessage = `FATAL: Environment validation failed:\n  - ${missingOrInvalid.join('\n  - ')}`;
    if (exitOnError && process.env.NODE_ENV !== 'test') {
      console.error(errorMessage);
      process.exit(1);
    }
    throw new Error(errorMessage);
  }
  return Object.freeze(result.data);
}

let config;
try {
  config = validateEnv(process.env, process.env.NODE_ENV !== 'test');
} catch (err) {
  if (process.env.NODE_ENV === 'test') {
    // In test environment without full env, provide minimal fallback for isolated imports
    try {
      config = validateEnv({
        ...process.env,
        CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skinsentry',
        JWT_SECRET: process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long',
        REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'test_refresh_token_secret_must_be_at_least_32_characters',
        AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
        AI_SERVICE_API_KEY: process.env.AI_SERVICE_API_KEY || 'test_ai_key',
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@skinsentry.local',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'password123',
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_key',
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret',
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook',
        SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        SMTP_USER: process.env.SMTP_USER || 'test@gmail.com',
        SMTP_PASS: process.env.SMTP_PASS || 'secret',
        MAIL_FROM: process.env.MAIL_FROM || 'no-reply@skinsentry.local',
        REFUND_POLICY_TEXT: process.env.REFUND_POLICY_TEXT || 'Refund within policy',
        ORG_NAME: process.env.ORG_NAME || 'SkinSentry',
        CONTACT_EMAIL: process.env.CONTACT_EMAIL || 'contact@skinsentry.local',
        GOVERNING_LAW: process.env.GOVERNING_LAW || 'India',
      }, false);
    } catch {
      config = null;
    }
  } else {
    throw err;
  }
}

export { config };
export default config;
