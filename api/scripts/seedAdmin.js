import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import connectDB, { disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/services/password.js';
import config from '../src/config/env.js';
import logger from '../src/utils/logger.js';

export async function seedAdmin() {
  if (!config?.ADMIN_EMAIL || !config?.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment');
  }

  const email = config.ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin') {
      throw new Error('A non-admin user already exists with ADMIN_EMAIL');
    }
    return { created: false, message: 'Admin already exists' };
  }

  await User.create({
    email,
    passwordHash: await hashPassword(config.ADMIN_PASSWORD),
    role: 'admin',
    name: 'Administrator',
    languagePref: 'en',
    isActive: true,
  });

  return { created: true, message: 'Admin created' };
}

const isDirectRun =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    await connectDB();
    const result = await seedAdmin();
    console.log(result.message);
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message }, 'seedAdmin failed');
    console.error(err.message);
    await disconnectDB();
    process.exit(1);
  }
}
