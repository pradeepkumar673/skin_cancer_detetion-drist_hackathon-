import bcrypt from 'bcryptjs';
import config from '../config/env.js';

const rounds = config?.BCRYPT_ROUNDS ?? 12;

let dummyHashPromise;

function dummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('skinsentry-dummy-compare', rounds);
  }
  return dummyHashPromise;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain, passwordHash) {
  if (!passwordHash) {
    const fallback = await dummyHash();
    await bcrypt.compare(plain, fallback);
    return false;
  }
  return bcrypt.compare(plain, passwordHash);
}

export default { hashPassword, verifyPassword };
