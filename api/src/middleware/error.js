import logger from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const requestId = req.id || req.requestId || 'unknown';

  const errorResponse = {
    error: err.code || err.name || 'internal_server_error',
    message: err.message || 'An unexpected error occurred',
    requestId,
  };

  if (err.details) {
    errorResponse.details = err.details;
  }

  logger.error(
    {
      requestId,
      status,
      error: errorResponse.error,
      message: errorResponse.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
    'Request error'
  );

  res.status(status).json(errorResponse);
}

export default errorHandler;
