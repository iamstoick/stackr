import api from './api.js';

export async function fetchAlertRules({ symbol, signal } = {}) {
  const { data } = await api.get('/alerts', { params: symbol ? { symbol } : undefined, signal });
  return data.rules;
}

export async function createAlertRule(payload) {
  const { data } = await api.post('/alerts', payload);
  return data.rule;
}

export async function updateAlertRule(id, patch) {
  const { data } = await api.patch(`/alerts/${id}`, patch);
  return data.rule;
}

export async function deleteAlertRule(id) {
  await api.delete(`/alerts/${id}`);
}

/** Confirms a threshold after a corporate action paused it. */
export async function resumeAlertRule(id) {
  const { data } = await api.post(`/alerts/${id}/resume`);
  return data.rule;
}

export async function fetchAlertHistory({ limit = 25, offset = 0, unacknowledged = false, signal } = {}) {
  const { data } = await api.get('/alerts/history', {
    params: { limit, offset, unacknowledged: String(unacknowledged) },
    signal,
  });
  return data;
}

export async function acknowledgeAlert(id) {
  const { data } = await api.post(`/alerts/${id}/acknowledge`);
  return data.alert;
}

export default {
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  resumeAlertRule,
  fetchAlertHistory,
  acknowledgeAlert,
};
