import axios from 'axios';

/**
 * Single axios instance for the app. `withCredentials` sends the HTTP-only auth
 * cookie; no token is ever read or stored by JavaScript.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

/** Normalized client-side error carrying the API's stable error code. */
export class RequestError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'RequestError';
    this.code = code ?? 'UNKNOWN';
    this.status = status ?? 0;
    this.details = details;
  }
}

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new RequestError('The request timed out. Try again.', { code: 'TIMEOUT' }));
    }
    if (!error.response) {
      return Promise.reject(new RequestError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' }));
    }

    const { status, data } = error.response;
    const body = data?.error ?? {};
    return Promise.reject(
      new RequestError(body.message || 'Something went wrong.', {
        code: body.code,
        status,
        details: body.details,
      }),
    );
  },
);

export default api;
