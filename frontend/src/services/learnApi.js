import api from './api.js';

export async function fetchProgress({ signal } = {}) {
  const { data } = await api.get('/learn/progress', { signal });
  return data.onboarding;
}

export async function markLessonRead(lessonId) {
  const { data } = await api.post(`/learn/lessons/${encodeURIComponent(lessonId)}/read`);
  return data.onboarding;
}

export async function dismissChecklist(dismissed = true) {
  const { data } = await api.post('/learn/checklist/dismiss', { dismissed });
  return data.onboarding;
}

export async function fetchMarketClock({ signal } = {}) {
  const { data } = await api.get('/learn/market-clock', { signal });
  return data.clock;
}

export default { fetchProgress, markLessonRead, dismissChecklist, fetchMarketClock };
