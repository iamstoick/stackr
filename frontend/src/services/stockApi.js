import api from './api.js';

export async function searchStocks(term, { signal } = {}) {
  const { data } = await api.get('/stocks/search', { params: { q: term }, signal });
  return data.results;
}

export async function fetchStock(symbol, { signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(symbol)}`, { signal });
  return data.stock;
}

export async function fetchQuote(symbol, { signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(symbol)}/quote`, { signal });
  return data.quote;
}

export async function fetchCandles(symbol, range, { signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(symbol)}/candles`, {
    params: { range },
    signal,
  });
  // `provider` and `cache` live beside `candles` in the envelope; fold them in
  // so callers hold one object.
  return { ...data.candles, provider: data.provider, cache: data.cache };
}

export default { searchStocks, fetchStock, fetchQuote, fetchCandles };
