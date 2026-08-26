import paperTradingService from '../services/paper/paperTradingService.js';
import scorecardService from '../services/paper/scorecardService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/paper/portfolio */
export const getPortfolio = asyncHandler(async (req, res) => {
  res.json(await paperTradingService.getPortfolio(req.user.id));
});

/** POST /api/paper/orders/preview — what the trade will cost, before committing. */
export const previewOrder = asyncHandler(async (req, res) => {
  res.json(await paperTradingService.previewOrder(req.user.id, req.body));
});

/** POST /api/paper/orders */
export const placeOrder = asyncHandler(async (req, res) => {
  const result = await paperTradingService.placeOrder(req.user.id, req.body);
  res.status(201).json(result);
});

/** GET /api/paper/trades */
export const listTrades = asyncHandler(async (req, res) => {
  res.json(
    await paperTradingService.listTrades(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
      symbol: req.query.symbol,
    }),
  );
});

/** GET /api/paper/scorecard — your result against doing nothing. */
export const getScorecard = asyncHandler(async (req, res) => {
  res.json(await scorecardService.getScorecard(req.user.id));
});

/** POST /api/paper/reset */
export const resetPortfolio = asyncHandler(async (req, res) => {
  const portfolio = await paperTradingService.resetPortfolio(req.user.id);
  res.json({ portfolio });
});

export default { getPortfolio, previewOrder, placeOrder, listTrades, getScorecard, resetPortfolio };
