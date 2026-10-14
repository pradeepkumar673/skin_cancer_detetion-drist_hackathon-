import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import { parseDurationToMs } from '../utils/duration.js';
import { HttpError } from '../utils/httpError.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      jti: crypto.randomUUID(),
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      type: 'refresh',
      jti: crypto.randomUUID(),
    },
    config.REFRESH_TOKEN_SECRET,
    { expiresIn: config.REFRESH_EXPIRES_IN }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new HttpError(401, 'Access token expired', 'token_expired');
    }
    throw new HttpError(401, 'Invalid access token', 'unauthorized');
  }
}

export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, config.REFRESH_TOKEN_SECRET);
    if (payload.type !== 'refresh') {
      throw new HttpError(401, 'Invalid refresh token', 'unauthorized');
    }
    return payload;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    if (err.name === 'TokenExpiredError') {
      throw new HttpError(401, 'Refresh token expired', 'token_expired');
    }
    throw new HttpError(401, 'Invalid refresh token', 'unauthorized');
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/auth',
    maxAge: parseDurationToMs(config.REFRESH_EXPIRES_IN),
  };
}

export function setRefreshCookie(res, token) {
  res.cookie(config.REFRESH_COOKIE_NAME, token, cookieOptions());
}

export function clearRefreshCookie(res) {
  res.clearCookie(config.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/auth',
  });
}

export function readRefreshCookie(req) {
  return req.cookies?.[config.REFRESH_COOKIE_NAME];
}

export default {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
};
