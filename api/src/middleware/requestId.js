import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  const existingId = req.headers['x-request-id'];
  const requestId = existingId || uuidv4();
  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

export default requestIdMiddleware;
