import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { verifyAccessToken } from '../services/tokens.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function bearerToken(req) {
  const header = req.headers.authorization;
  if (header && typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) {
      return token;
    }
  }
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) {
    throw new HttpError(401, 'Authentication required', 'unauthorized');
  }

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new HttpError(401, 'Authentication required', 'unauthorized');
  }

  req.user = user;
  req.auth = { sub: String(user._id), role: user.role };
  next();
});

export const requireVerifiedDoctor = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required', 'unauthorized');
  }
  if (req.user.role !== 'doctor') {
    throw new HttpError(403, 'A verified doctor account is required', 'forbidden');
  }

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor || doctor.verificationStatus !== 'verified') {
    throw new HttpError(
      403,
      'A verified doctor account is required',
      'doctor_not_verified',
      { verificationStatus: doctor?.verificationStatus || 'pending' }
    );
  }

  req.doctor = doctor;
  next();
});

export default { requireAuth, requireVerifiedDoctor };
