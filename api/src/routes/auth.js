import { Router } from 'express';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import validateRequest from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit, clientIp } from '../utils/audit.js';
import { registerSchema, loginSchema } from '../validators/auth.js';
import {
  registerAccount,
  authenticate,
  issueSession,
  revokeRefresh,
  tokenResponse,
  loadProfile,
} from '../services/authService.js';
import {
  hashToken,
  readRefreshCookie,
  verifyRefreshToken,
  clearRefreshCookie,
} from '../services/tokens.js';

const router = Router();

async function doctorStatus(user) {
  if (user.role !== 'doctor') {
    return undefined;
  }
  const doctor = await Doctor.findOne({ userId: user._id }).lean();
  return doctor?.verificationStatus;
}

router.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await registerAccount(req.body);
    const profile = await loadProfile(user);
    await writeAudit({
      actorId: user._id,
      action: 'AUTH_REGISTER',
      entityType: 'User',
      entityId: user._id,
      meta: { role: user.role },
      ip: clientIp(req),
    });

    const payload = { user: profile };
    if (user.role === 'doctor') {
      payload.verificationStatus = 'pending';
    }
    return res.status(201).json(payload);
  })
);

router.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await authenticate(req.body.email, req.body.password);
    const accessToken = await issueSession(res, user);
    const verificationStatus = await doctorStatus(user);
    await writeAudit({
      actorId: user._id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user._id,
      meta: { role: user.role },
      ip: clientIp(req),
    });

    const body = tokenResponse(user, accessToken);
    if (verificationStatus) {
      body.verificationStatus = verificationStatus;
    }
    return res.status(200).json(body);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const cookieToken = readRefreshCookie(req);
    if (!cookieToken) {
      throw new HttpError(401, 'Refresh token required', 'unauthorized');
    }

    const payload = verifyRefreshToken(cookieToken);
    const user = await User.findById(payload.sub);
    const incomingHash = hashToken(cookieToken);

    if (!user || !user.isActive || !user.refreshTokenHash || user.refreshTokenHash !== incomingHash) {
      if (user) {
        user.refreshTokenHash = undefined;
        await user.save();
      }
      clearRefreshCookie(res);
      throw new HttpError(401, 'Invalid refresh token', 'unauthorized');
    }

    const accessToken = await issueSession(res, user);
    const verificationStatus = await doctorStatus(user);
    const body = tokenResponse(user, accessToken);
    if (verificationStatus) {
      body.verificationStatus = verificationStatus;
    }
    return res.status(200).json(body);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const cookieToken = readRefreshCookie(req);
    let user = null;
    if (cookieToken) {
      try {
        const payload = verifyRefreshToken(cookieToken);
        user = await User.findById(payload.sub);
        if (user && user.refreshTokenHash === hashToken(cookieToken)) {
          await revokeRefresh(user, res);
        } else {
          clearRefreshCookie(res);
        }
      } catch {
        clearRefreshCookie(res);
      }
    } else {
      clearRefreshCookie(res);
    }

    if (user) {
      await writeAudit({
        actorId: user._id,
        action: 'AUTH_LOGOUT',
        entityType: 'User',
        entityId: user._id,
        ip: clientIp(req),
      });
    }

    return res.status(200).json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.user);
    const body = { user: profile };
    if (profile.doctor) {
      body.verificationStatus = profile.doctor.verificationStatus;
    }
    return res.status(200).json(body);
  })
);

export default router;
