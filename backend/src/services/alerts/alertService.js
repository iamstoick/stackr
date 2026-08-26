import alertRepository from '../../db/repositories/alertRepository.js';
import alertRuleRepository from '../../db/repositories/alertRuleRepository.js';
import notificationRepository from '../../db/repositories/notificationRepository.js';
import { withTransaction } from '../../db/pool.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import marketDataService from '../market/marketDataService.js';
import notificationService from '../notifications/notificationService.js';
import { evaluateRule, nextReferencePrice } from './alertEvaluator.js';

const MAX_RULES_PER_USER = 200;

export async function listRules(userId, { symbol } = {}) {
  if (symbol) return alertRuleRepository.listByUserAndSymbol(userId, symbol);
  return alertRuleRepository.listByUser(userId);
}

export async function createRule(
  userId,
  {
    symbol,
    type,
    condition,
    threshold,
    enabled = true,
    cooldownMinutes = 0,
    expiresAt = null,
    marketHoursOnly = false,
    trailPercent = null,
  },
) {
  const existing = await alertRuleRepository.listByUser(userId);
  if (existing.length >= MAX_RULES_PER_USER) {
    throw ApiError.conflict(
      'ALERT_LIMIT_REACHED',
      `You can have at most ${MAX_RULES_PER_USER} alert rules.`,
    );
  }

  const stock = await marketDataService.ensureStock(symbol);

  const duplicate = await alertRuleRepository.findDuplicate({
    userId,
    stockId: stock.id,
    type,
    condition,
    threshold,
  });
  if (duplicate) {
    throw ApiError.conflict(
      'ALERT_RULE_EXISTS',
      'An identical alert rule already exists for this stock.',
    );
  }

  // A trailing rule starts measuring from wherever the market is now, so the
  // first poll does not treat an old extreme as its high-water mark.
  let referencePrice = null;
  if (trailPercent) {
    const quote = await marketDataService.getQuote(stock.symbol).catch(() => null);
    referencePrice = quote?.price ?? null;
  }

  const rule = await alertRuleRepository.create({
    userId,
    stockId: stock.id,
    type,
    condition,
    threshold,
    enabled,
    cooldownMinutes,
    expiresAt,
    marketHoursOnly,
    trailPercent,
    referencePrice,
  });
  logger.info({ userId, ruleId: rule.id, symbol: rule.symbol, trailPercent }, 'Alert rule created');
  return rule;
}

export async function updateRule(userId, id, patch) {
  const existing = await alertRuleRepository.findByIdForUser(id, userId);
  if (!existing) throw ApiError.notFound('ALERT_RULE_NOT_FOUND', 'That alert rule does not exist.');

  const updated = await alertRuleRepository.update(id, userId, patch);
  logger.info({ userId, ruleId: id }, 'Alert rule updated');
  return updated;
}

export async function deleteRule(userId, id) {
  const { removed } = await alertRuleRepository.remove(id, userId);
  if (!removed) throw ApiError.notFound('ALERT_RULE_NOT_FOUND', 'That alert rule does not exist.');
  logger.info({ userId, ruleId: id }, 'Alert rule deleted');
  return { deleted: true };
}

export async function listHistory(userId, { limit = 50, offset = 0, unacknowledgedOnly = false } = {}) {
  const [items, total] = await Promise.all([
    alertRepository.listByUser(userId, { limit, offset, unacknowledgedOnly }),
    alertRepository.countByUser(userId, { unacknowledgedOnly }),
  ]);
  return { items, total, limit, offset };
}

export async function acknowledgeAlert(userId, id) {
  const alert = await alertRepository.acknowledge(id, userId);
  if (!alert) throw ApiError.notFound('ALERT_NOT_FOUND', 'That alert does not exist.');
  return alert;
}

/**
 * Evaluates every active rule for one instrument against a single observation,
 * in a transaction so a triggered alert and its latch update commit together.
 *
 * `sample` may be a bare price or an observation carrying the extremes seen
 * since the previous poll — see alertEvaluator for why the extremes matter.
 *
 * @returns {Promise<Array>} the alerts created by this evaluation
 */
export async function evaluateForStock({ stockId, symbol, price, sample, context = {} }) {
  const observation = sample ?? price;
  const lastPrice = typeof observation === 'object' ? observation?.price : observation;
  if (typeof lastPrice !== 'number' || !Number.isFinite(lastPrice) || lastPrice <= 0) return [];

  return withTransaction(async (client) => {
    const rules = await alertRuleRepository.findEnabledByStockId(stockId, client);
    const created = [];

    for (const rule of rules) {
      // A trailing rule's level moves with the market before it is judged, so
      // the reference is advanced first.
      const reference = nextReferencePrice(rule, observation);
      if (reference !== null) {
        await alertRuleRepository.setReferencePrice(rule.id, reference, client);
        rule.referencePrice = reference;
      }

      const result = evaluateRule(rule, observation, context);

      if (result.action === 'trigger') {
        const now = new Date();
        const alert = await alertRepository.create(
          {
            alertRuleId: rule.id,
            userId: rule.userId,
            stockId: rule.stockId,
            symbol: symbol ?? rule.symbol,
            kind: 'THRESHOLD',
            type: rule.type,
            condition: rule.condition,
            triggerPrice: result.triggerPrice,
            triggerKind: result.triggerKind,
            threshold: rule.threshold,
            message: result.message,
          },
          client,
        );
        await alertRuleRepository.setLatchState(
          rule.id,
          { triggered: result.latch, lastTriggeredAt: now, incrementFired: true },
          client,
        );

        // Queued in the same transaction as the alert: an alert that exists
        // always has its delivery intent recorded with it.
        const settings = await notificationRepository.getSettings(rule.userId);
        await notificationService.enqueueForAlert(alert, settings, client);

        created.push(alert);
        logger.info(
          {
            ruleId: rule.id,
            userId: rule.userId,
            symbol: alert.symbol,
            triggerPrice: result.triggerPrice,
            triggerKind: result.triggerKind,
            lastPrice,
            rearmed: !result.latch,
          },
          'Alert triggered',
        );
      } else if (result.action === 'reset') {
        await alertRuleRepository.setLatchState(rule.id, { triggered: false }, client);
        logger.debug({ ruleId: rule.id, price: lastPrice }, 'Alert rule latch reset');
      }
    }

    return created;
  });
}

/**
 * Pauses every rule on an instrument and notifies each owner once. Called when
 * a corporate action has invalidated the thresholds, so nothing fires on a
 * price change that is not a real move.
 *
 * @returns {Promise<{suspended: number, notices: Array}>}
 */
export async function suspendRulesForStock({ stockId, symbol, reason, notice }) {
  return withTransaction(async (client) => {
    const suspended = await alertRuleRepository.suspendByStockId(stockId, reason, client);
    if (suspended.length === 0) return { suspended: 0, notices: [] };

    const owners = [...new Set(suspended.map((rule) => rule.userId))];
    const notices = [];
    for (const userId of owners) {
      const alert = await alertRepository.create(
        {
          userId,
          stockId,
          symbol,
          kind: 'SYSTEM',
          type: 'CORPORATE_ACTION',
          message: notice,
        },
        client,
      );
      const settings = await notificationRepository.getSettings(userId);
      await notificationService.enqueueForAlert(alert, settings, client);
      notices.push(alert);
    }

    logger.warn(
      { symbol, stockId, rules: suspended.length, users: owners.length, reason },
      'Suspended alert rules after a suspected corporate action',
    );
    return { suspended: suspended.length, notices };
  });
}

export default {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  listHistory,
  acknowledgeAlert,
  evaluateForStock,
  suspendRulesForStock,
};
