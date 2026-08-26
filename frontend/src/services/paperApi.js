import api from './api.js';

export async function fetchPortfolio({ signal } = {}) {
  const { data } = await api.get('/paper/portfolio', { signal });
  return data;
}

export async function fetchScorecard({ signal } = {}) {
  const { data } = await api.get('/paper/scorecard', { signal });
  return data;
}

export async function fetchTrades({ limit = 50, symbol, signal } = {}) {
  const { data } = await api.get('/paper/trades', {
    params: { limit, ...(symbol ? { symbol } : {}) },
    signal,
  });
  return data;
}

/** Prices an order without placing it, so costs are visible before committing. */
export async function previewOrder(order, { signal } = {}) {
  const { data } = await api.post('/paper/orders/preview', order, { signal });
  return data;
}

export async function placeOrder(order) {
  const { data } = await api.post('/paper/orders', order);
  return data;
}

export async function resetPortfolio() {
  const { data } = await api.post('/paper/reset');
  return data.portfolio;
}

export async function fetchRisk(symbol, { range = '1d', positionValue = 1000, signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(symbol)}/risk`, {
    params: { range, positionValue },
    signal,
  });
  return data;
}

export default {
  fetchPortfolio,
  fetchScorecard,
  fetchTrades,
  previewOrder,
  placeOrder,
  resetPortfolio,
  fetchRisk,
};
