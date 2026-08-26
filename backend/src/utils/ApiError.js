/**
 * Application error carrying the HTTP status and the stable machine-readable
 * code that the API contract exposes to clients.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Invalid request.', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(message = 'Request validation failed.', details) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication is required.') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(code = 'NOT_FOUND', message = 'The requested resource could not be found.') {
    return new ApiError(404, code, message);
  }

  static conflict(code, message) {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests. Please retry later.') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'An unexpected error occurred.') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }

  static unavailable(code = 'SERVICE_UNAVAILABLE', message = 'The service is temporarily unavailable.') {
    return new ApiError(503, code, message);
  }
}

export default ApiError;
