/**
 * Wraps an async route handler so a rejected promise reaches the centralized
 * error middleware instead of becoming an unhandled rejection.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
