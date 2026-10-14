export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (err) {
      const issues = err.issues || err.errors;
      if (issues) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Invalid request input',
          details: issues.map((e) => ({
            field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
            message: e.message,
          })),
          requestId: req.id || req.requestId,
        });
      }
      next(err);
    }
  };
}

export default validateRequest;
