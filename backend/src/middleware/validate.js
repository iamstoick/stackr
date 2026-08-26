import ApiError from '../utils/ApiError.js';

/**
 * Validates and replaces `req.body` / `req.query` / `req.params` with the
 * parsed result, so handlers only ever see well-formed input.
 *
 * @param {{body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny}} schemas
 */
export function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    for (const source of ['params', 'query', 'body']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: [source, ...issue.path].join('.'),
          message: issue.message,
        }));
        return next(ApiError.validation('Request validation failed.', details));
      }

      // req.query is a getter in Express 5; define the parsed value instead.
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    }
    return next();
  };
}

export default validate;
