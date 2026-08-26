import favoriteService from '../services/market/favoriteService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/favorites — the caller's watchlist with the latest known prices. */
export const list = asyncHandler(async (req, res) => {
  const favorites = await favoriteService.list(req.user.id);
  res.json({ count: favorites.length, favorites });
});

/** POST /api/favorites/:symbol — idempotent add. */
export const add = asyncHandler(async (req, res) => {
  const { created, stock } = await favoriteService.add(req.user.id, req.params.symbol);
  res.status(created ? 201 : 200).json({
    created,
    favorite: { symbol: stock.symbol, companyName: stock.companyName },
  });
});

/** DELETE /api/favorites/:symbol — removing a non-favorite is still a success. */
export const remove = asyncHandler(async (req, res) => {
  const { removed } = await favoriteService.remove(req.user.id, req.params.symbol);
  res.json({ removed });
});

export default { list, add, remove };
