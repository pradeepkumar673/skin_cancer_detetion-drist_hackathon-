import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import config from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} from './tokens.js';

export function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone || null,
    languagePref: user.languagePref,
    isActive: user.isActive,
    termsVersionAccepted: user.termsVersionAccepted || null,
    termsAcceptedAt: user.termsAcceptedAt || null,
    deletionRequestedAt: user.deletionRequestedAt || null,
  };
}

export async function loadProfile(user) {
  const base = publicUser(user);
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ userId: user._id }).lean();
    if (patient) {
      base.patient = {
        id: String(patient._id),
        dateOfBirth: patient.dateOfBirth || null,
        sex: patient.sex || null,
        skinType: patient.skinType || null,
        sunExposure: patient.sunExposure || null,
        familyHistorySkinCancer: Boolean(patient.familyHistorySkinCancer),
        isDiabetic: Boolean(patient.isDiabetic),
      };
    }
  }
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ userId: user._id }).lean();
    if (doctor) {
      base.doctor = {
        id: String(doctor._id),
        specialty: doctor.specialty,
        registrationNumber: doctor.registrationNumber,
        verificationStatus: doctor.verificationStatus,
        bio: doctor.bio || null,
      };
    }
  }
  return base;
}

export async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();
  setRefreshCookie(res, refreshToken);
  return accessToken;
}

export async function revokeRefresh(user, res) {
  user.refreshTokenHash = undefined;
  await user.save();
  if (res) {
    clearRefreshCookie(res);
  }
}

export function tokenResponse(user, accessToken, extras = {}) {
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: config.JWT_EXPIRES_IN,
    user: publicUser(user),
    ...extras,
  };
}

export async function registerAccount(body) {
  const email = body.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new HttpError(409, 'Email already registered', 'conflict');
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(body.password),
    role: body.role,
    name: body.name.trim(),
    phone: body.phone,
    languagePref: body.languagePref,
    isActive: true,
    termsVersionAccepted: body.termsVersionAccepted,
    termsAcceptedAt: body.termsAcceptedAt,
    healthDataConsentAt: body.healthDataConsentAt,
  });

  try {
    if (body.role === 'patient') {
      await Patient.create({
        userId: user._id,
        dateOfBirth: body.dateOfBirth,
        sex: body.sex,
        skinType: body.skinType,
        sunExposure: body.sunExposure,
        familyHistorySkinCancer: body.familyHistorySkinCancer ?? false,
        isDiabetic: body.isDiabetic ?? false,
      });
    }
    if (body.role === 'doctor') {
      await Doctor.create({
        userId: user._id,
        specialty: body.specialty,
        registrationNumber: body.registrationNumber.trim(),
        bio: body.bio.trim(),
        verificationStatus: 'pending',
      });
    }
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  return user;
}

export function isLocked(user) {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

export async function recordFailedLogin(user) {
  if (!user) {
    return;
  }
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  if (user.failedLoginAttempts >= config.LOGIN_MAX_FAILED_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + config.LOGIN_LOCKOUT_MINUTES * 60 * 1000);
  }
  await user.save();
}

export async function clearFailedLogins(user) {
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();
}

export async function authenticate(email, password) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  const passwordOk = await verifyPassword(password, user?.passwordHash);

  if (!user || !passwordOk || !user.isActive || isLocked(user)) {
    if (user && user.isActive && !isLocked(user)) {
      await recordFailedLogin(user);
    } else if (user && !passwordOk && user.isActive) {
      await recordFailedLogin(user);
    }
    throw new HttpError(401, 'invalid credentials', 'invalid_credentials');
  }

  await clearFailedLogins(user);
  return user;
}

export default {
  publicUser,
  loadProfile,
  issueSession,
  revokeRefresh,
  tokenResponse,
  registerAccount,
  authenticate,
};
