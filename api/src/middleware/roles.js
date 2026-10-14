import { HttpError } from '../utils/httpError.js';

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new HttpError(401, 'Authentication required', 'unauthorized'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to access this resource', 'forbidden'));
    }
    return next();
  };
}

export default requireRole;
