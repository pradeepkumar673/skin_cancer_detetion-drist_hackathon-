export class HttpError extends Error {
  constructor(statusCode, message, code, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code || 'error';
    if (details) {
      this.details = details;
    }
  }
}

export default HttpError;
