import api from './api.js';

export async function fetchNotificationSettings({ signal } = {}) {
  const { data } = await api.get('/user/notifications', { signal });
  return data;
}

export async function saveNotificationSettings(patch) {
  const { data } = await api.put('/user/notifications', patch);
  return data.settings;
}

export default { fetchNotificationSettings, saveNotificationSettings };
