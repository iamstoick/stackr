import alertService from '../services/alerts/alertService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/alerts?symbol= — the caller's alert rules. */
export const listRules = asyncHandler(async (req, res) => {
  const rules = await alertService.listRules(req.user.id, { symbol: req.query.symbol });
  res.json({ count: rules.length, rules });
});

/** POST /api/alerts */
export const createRule = asyncHandler(async (req, res) => {
  const rule = await alertService.createRule(req.user.id, req.body);
  res.status(201).json({ rule });
});

/** PATCH /api/alerts/:id */
export const updateRule = asyncHandler(async (req, res) => {
  const rule = await alertService.updateRule(req.user.id, req.params.id, req.body);
  res.json({ rule });
});

/** DELETE /api/alerts/:id */
export const deleteRule = asyncHandler(async (req, res) => {
  await alertService.deleteRule(req.user.id, req.params.id);
  res.status(204).send();
});

/** POST /api/alerts/:id/resume — re-arm a rule paused by a corporate action. */
export const resumeRule = asyncHandler(async (req, res) => {
  const rule = await alertService.updateRule(req.user.id, req.params.id, { enabled: true });
  res.json({ rule });
});

/** GET /api/alerts/history — triggered alerts, newest first. */
export const listHistory = asyncHandler(async (req, res) => {
  const history = await alertService.listHistory(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
    unacknowledgedOnly: req.query.unacknowledged,
  });
  res.json(history);
});

/** POST /api/alerts/:id/acknowledge */
export const acknowledge = asyncHandler(async (req, res) => {
  const alert = await alertService.acknowledgeAlert(req.user.id, req.params.id);
  res.json({ alert });
});

export default {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  resumeRule,
  listHistory,
  acknowledge,
};
