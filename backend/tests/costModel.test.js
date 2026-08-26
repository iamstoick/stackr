import { describe, expect, it } from 'vitest';

import { affordableQuantity, estimateSpreadBps, priceOrder } from '../src/services/paper/costModel.js';

const quote = (over = {}) => ({ price: 200, high: 202, low: 198, ...over });

describe('estimateSpreadBps', () => {
  it('charges a liquid, quiet name close to the floor', () => {
    // 2% daily range -> 20bps, which is the derived value here.
    const calm = estimateSpreadBps({ price: 200, high: 200.4, low: 199.6 });
    expect(calm).toBeLessThan(10);
    expect(calm).toBeGreaterThanOrEqual(2);
  });

  it('charges a volatile name more, because that is what really happens', () => {
    const wild = estimateSpreadBps({ price: 20, high: 24, low: 18 });
    const calm = estimateSpreadBps({ price: 200, high: 200.4, low: 199.6 });
    expect(wild).toBeGreaterThan(calm);
  });

  it('caps the estimate so a chaotic day is not absurd', () => {
    expect(estimateSpreadBps({ price: 10, high: 30, low: 5 })).toBeLessThanOrEqual(60);
  });

  it('falls back to the configured floor without a usable range', () => {
    expect(estimateSpreadBps({ price: 200 })).toBeGreaterThan(0);
    expect(estimateSpreadBps(null)).toBeGreaterThan(0);
  });
});

describe('priceOrder', () => {
  it('fills a buy above the quote and a sell below it', () => {
    const buy = priceOrder('BUY', quote(), 10);
    const sell = priceOrder('SELL', quote(), 10);

    expect(buy.fillPrice).toBeGreaterThan(200);
    expect(sell.fillPrice).toBeLessThan(200);
    // Symmetric around the quote: half the spread each way.
    expect(buy.fillPrice - 200).toBeCloseTo(200 - sell.fillPrice, 6);
  });

  it('takes cash on a buy and returns it on a sell', () => {
    expect(priceOrder('BUY', quote(), 10).cashDelta).toBeLessThan(0);
    expect(priceOrder('SELL', quote(), 10).cashDelta).toBeGreaterThan(0);
  });

  it('makes a round trip lose money even with no price move', () => {
    // The lesson the simulator has to teach: trading is not free.
    const buy = priceOrder('BUY', quote(), 10);
    const sell = priceOrder('SELL', quote(), 10);
    expect(buy.cashDelta + sell.cashDelta).toBeLessThan(0);
  });

  it('reports the move needed just to break even', () => {
    const buy = priceOrder('BUY', quote(), 10);
    expect(buy.breakEvenMovePercent).toBeGreaterThan(0);
    expect(buy.breakEvenMovePercent).toBeLessThan(1);
  });

  it('scales costs with size', () => {
    const small = priceOrder('BUY', quote(), 1);
    const large = priceOrder('BUY', quote(), 100);
    expect(large.spreadCost).toBeCloseTo(small.spreadCost * 100, 4);
  });

  it('costs more per dollar traded on a volatile name', () => {
    const calm = priceOrder('BUY', { price: 200, high: 200.4, low: 199.6 }, 5);
    const wild = priceOrder('BUY', { price: 200, high: 212, low: 188 }, 5);
    expect(wild.breakEvenMovePercent).toBeGreaterThan(calm.breakEvenMovePercent);
  });
});

describe('affordableQuantity', () => {
  it('leaves enough cash for the costs, not just the shares', () => {
    const cash = 1000;
    const maximum = affordableQuantity(quote(), cash);
    const order = priceOrder('BUY', quote(), maximum);

    expect(Math.abs(order.cashDelta)).toBeLessThanOrEqual(cash);
    // One more share would not fit.
    expect(Math.abs(priceOrder('BUY', quote(), maximum + 1).cashDelta)).toBeGreaterThan(cash);
  });

  it('is zero when the cash cannot cover a single share', () => {
    expect(affordableQuantity(quote({ price: 5000, high: 5010, low: 4990 }), 100)).toBe(0);
  });
});
