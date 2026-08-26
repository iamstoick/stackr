import ApiError from '../../utils/ApiError.js';
import { request } from './finnhubClient.js';

/** Symbol search, normalized and trimmed to the fields the UI renders. */
export async function search(term, { limit = 25 } = {}) {
  const raw = await request('/search', { q: term, exchange: 'US' });
  const results = Array.isArray(raw?.result) ? raw.result : [];

  return results
    // Common stock and ADRs only: Finnhub also returns options and warrants,
    // which have no usable quote or profile for this app.
    .filter((item) => item?.symbol && !item.symbol.includes('.') && !item.symbol.includes(':'))
    .slice(0, limit)
    .map((item) => ({
      symbol: item.symbol.toUpperCase(),
      displaySymbol: item.displaySymbol ?? item.symbol,
      companyName: item.description ?? null,
      type: item.type ?? null,
    }));
}

/** Company profile, normalized. Returns null when the provider has no profile. */
export async function getProfile(symbol) {
  const raw = await request('/stock/profile2', { symbol: symbol.toUpperCase() });
  if (!raw || Object.keys(raw).length === 0 || !raw.ticker) return null;

  return {
    symbol: (raw.ticker ?? symbol).toUpperCase(),
    companyName: raw.name ?? null,
    exchange: raw.exchange ?? null,
    currency: raw.currency ?? null,
    country: raw.country ?? null,
    logoUrl: raw.logo || null,
    industry: raw.finnhubIndustry ?? null,
    website: raw.weburl ?? null,
    ipo: raw.ipo ?? null,
    marketCapitalization: Number.isFinite(raw.marketCapitalization) ? raw.marketCapitalization : null,
    shareOutstanding: Number.isFinite(raw.shareOutstanding) ? raw.shareOutstanding : null,
  };
}

export async function requireProfile(symbol) {
  const profile = await getProfile(symbol);
  if (!profile) {
    throw ApiError.notFound('STOCK_NOT_FOUND', `No company profile is available for "${symbol}".`);
  }
  return profile;
}

export default { search, getProfile, requireProfile };
