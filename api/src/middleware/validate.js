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
      if (err.errors) {
        return res.status(422).json({
          error: 'validation_error',
          message: 'Invalid request input',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
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
