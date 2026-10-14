import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.js';

describe('Environment Validation', () => {
  const completeValidEnv = {
    NODE_ENV: 'test',
    PORT: '5000',
    CLIENT_URL: 'http://localhost:3000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/skinsentry_test',
    JWT_SECRET: 'a_very_secure_random_key_of_at_least_32_characters_here',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_SECRET: 'another_secure_random_key_of_at_least_32_characters_here',
    REFRESH_EXPIRES_IN: '7d',
    AI_SERVICE_URL: 'http://localhost:8000',
    AI_SERVICE_API_KEY: 'test_ai_key_secret',
    STORAGE_DIR: '../storage',
    ADMIN_EMAIL: 'admin@skinsentry.local',
    ADMIN_PASSWORD: 'SuperSecurePassword123!',
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'test@gmail.com',
    SMTP_PASS: 'secret_app_password',
    MAIL_FROM: 'no-reply@skinsentry.local',
    STUN_URLS: 'stun:stun.l.google.com:19302',
    TURN_URL: '',
    TURN_USERNAME: '',
    TURN_CREDENTIAL: '',
    MONGODB_URI_TEST: 'mongodb://127.0.0.1:27017/skinsentry_test',
    DEFAULT_TIMEZONE: 'Asia/Kolkata',
    AI_TIMEOUT_MS: '30000',
    AI_MAX_RETRIES: '3',
    MAX_UPLOAD_MB: '10',
    ALLOWED_IMAGE_TYPES: 'image/jpeg,image/png,image/webp',
    ANALYSIS_CONCURRENCY: '2',
    PRESENCE_GRACE_SECONDS: '60',
    PAYMENT_WINDOW_MINUTES: '30',
    SESSION_GRACE_MINUTES: '15',
    MIN_FEE_INR: '100',
    MAX_FEE_INR: '5000',
    RETENTION_CASE_DAYS: '365',
    RETENTION_AUDIT_DAYS: '1825',
    DELETION_GRACE_DAYS: '30',
    FOLLOWUP_DEFAULT_DAYS: '14',
    REFUND_POLICY_TEXT: 'Standard refund policy text',
    ORG_NAME: 'SkinSentry',
    CONTACT_EMAIL: 'contact@skinsentry.local',
    GOVERNING_LAW: 'India',
  };

  it('passes when all required variables are valid', () => {
    const parsed = validateEnv(completeValidEnv, false);
    expect(parsed.PORT).toBe(5000);
    expect(parsed.CLIENT_URL).toBe('http://localhost:3000');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('fails with a clear list of missing variables when critical secrets are missing', () => {
    const invalidEnv = { ...completeValidEnv };
    delete invalidEnv.JWT_SECRET;
    delete invalidEnv.MONGODB_URI;
    delete invalidEnv.AI_SERVICE_API_KEY;

    expect(() => validateEnv(invalidEnv, false)).toThrowError(/Environment validation failed/);
    try {
      validateEnv(invalidEnv, false);
    } catch (err) {
      expect(err.message).toContain('JWT_SECRET');
      expect(err.message).toContain('MONGODB_URI');
      expect(err.message).toContain('AI_SERVICE_API_KEY');
    }
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    const invalidEnv = { ...completeValidEnv, JWT_SECRET: 'short_secret' };
    expect(() => validateEnv(invalidEnv, false)).toThrowError(/JWT_SECRET must be at least 32 characters/);
  });
});
