import bcrypt from 'bcryptjs';
import config from '../config/env.js';

const rounds = config?.BCRYPT_ROUNDS ?? 12;

let constantTimeHashPromise;

function constantTimeHash() {
  if (!constantTimeHashPromise) {
    constantTimeHashPromise = bcrypt.hash('skinsentry-timing-compare', rounds);
  }
  return constantTimeHashPromise;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain, passwordHash) {
  if (!passwordHash) {
    const fallback = await constantTimeHash();
    await bcrypt.compare(plain, fallback);
    return false;
  }
  return bcrypt.compare(plain, passwordHash);
}

export default { hashPassword, verifyPassword };
