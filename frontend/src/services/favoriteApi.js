import api from './api.js';

export async function fetchFavorites({ signal } = {}) {
  const { data } = await api.get('/favorites', { signal });
  return data.favorites;
}

export async function addFavorite(symbol) {
  const { data } = await api.post(`/favorites/${encodeURIComponent(symbol)}`);
  return data;
}

export async function removeFavorite(symbol) {
  const { data } = await api.delete(`/favorites/${encodeURIComponent(symbol)}`);
  return data;
}

export default { fetchFavorites, addFavorite, removeFavorite };
