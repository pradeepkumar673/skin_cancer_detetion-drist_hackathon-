import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'password',
      'passwordHash',
      'refreshToken',
      'refreshTokenHash',
      'token',
      'secret',
      'image',
      'rawImage',
      'imagePaths[*].path',
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
