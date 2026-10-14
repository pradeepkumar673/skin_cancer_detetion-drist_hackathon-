import { AuditLog } from '../models/AuditLog.js';

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || undefined;
}

export async function writeAudit({ actorId, action, entityType, entityId, meta, ip }) {
  await AuditLog.create({
    actorId: actorId || undefined,
    action,
    entityType,
    entityId: entityId || undefined,
    meta,
    ip,
    at: new Date(),
  });
}

export default writeAudit;
