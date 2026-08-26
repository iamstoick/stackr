import api from './api.js';

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me');
  return data.user;
}

export async function fetchAuthConfig() {
  const { data } = await api.get('/auth/config');
  return data;
}

export async function logout() {
  await api.post('/auth/logout');
}

/** Full-page redirect: the OAuth handshake cannot happen over XHR. */
export function startGoogleLogin() {
  window.location.assign('/api/auth/google');
}

export default { fetchCurrentUser, fetchAuthConfig, logout, startGoogleLogin };
