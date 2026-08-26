import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { HelpTip } from '../components/HelpTip.jsx';
import { SkeletonRows } from '../components/Loading.jsx';
import { StockSearch } from '../components/StockSearch.jsx';
import useAsync from '../hooks/useAsync.js';
import paperApi from '../services/paperApi.js';
import { directionOf, formatDateTime, formatPercent, formatPrice } from '../utils/format.js';

const TONE = { up: 'text-up', down: 'text-down', flat: 'text-muted' };
const OBSERVATION_TONE = {
  good: 'border-up/40 bg-up/5',
  warn: 'border-signal/40 bg-signal/5',
  neutral: 'border-ink-800 bg-ink-950',
};

function Stat({ label, value, tone = 'text-paper', detail, help }) {
  return (
    <div>
      <p className="label flex items-center gap-1.5">
        {label}
        {help && <HelpTip title={help.title} body={help.body} />}
      </p>
      <p className={`tabular mt-1 text-2xl font-medium ${tone}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-faint">{detail}</p>}
    </div>
  );
}

function Positions({ positions }) {
  if (positions.length === 0) {
    return (
      <EmptyState
        title="You do not hold anything yet"
        description="Open any stock and use the practice ticket to buy some. Nothing real is at stake — that is the point."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-ink-800">
            <th className="label px-4 py-2 text-left">Symbol</th>
            <th className="label px-4 py-2 text-right">Shares</th>
            <th className="label px-4 py-2 text-right">
              <span className="inline-flex items-center gap-1.5">
                Break-even
                <HelpTip
                  title="Break-even price"
                  body="The average price you paid, including the spread and any commission. Below this you are down on the position, above it you are up."
                />
              </span>
            </th>
            <th className="label px-4 py-2 text-right">Price now</th>
            <th className="label px-4 py-2 text-right">Value</th>
            <th className="label px-4 py-2 text-right">Profit / loss</th>
            <th className="label px-4 py-2 text-right">
              <span className="inline-flex items-center gap-1.5">
                Share of portfolio
                <HelpTip
                  title="Share of portfolio"
                  body="How much of everything you own sits in this one company. A high number means a single company's bad day is your whole portfolio's bad day."
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-850">
          {positions.map((position) => {
            const direction = directionOf(position.unrealizedPnl);
            return (
              <tr key={position.symbol} className="transition hover:bg-ink-850">
                <td className="px-4 py-3">
                  <Link
                    to={`/stocks/${encodeURIComponent(position.symbol)}`}
                    className="tabular font-semibold text-paper hover:text-signal"
                  >
                    {position.symbol}
                  </Link>
                </td>
                <td className="tabular px-4 py-3 text-right text-muted">{position.quantity}</td>
                <td className="tabular px-4 py-3 text-right text-muted">
                  {formatPrice(position.breakEvenPrice)}
                </td>
                <td className="tabular px-4 py-3 text-right text-paper">
                  {formatPrice(position.price)}
                  {!position.priceKnown && <span className="ml-1 text-faint">(stale)</span>}
                </td>
                <td className="tabular px-4 py-3 text-right text-paper">
                  {formatPrice(position.marketValue)}
                </td>
                <td className={`tabular px-4 py-3 text-right ${TONE[direction]}`}>
                  {formatPrice(position.unrealizedPnl)}
                  <span className="ml-2 text-xs">
                    {formatPercent(position.unrealizedPnlPercent)}
                  </span>
                </td>
                <td className="tabular px-4 py-3 text-right text-muted">
                  {position.allocationPercent}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Scorecard({ scorecard, onReload }) {
  if (!scorecard) return <SkeletonRows rows={3} />;

  const { you, benchmark, differencePercent, verdict, observations } = scorecard;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Your return"
          value={formatPercent(you.returnPercent)}
          tone={TONE[directionOf(you.returnPercent)]}
          detail={`${you.tradeCount} trade${you.tradeCount === 1 ? '' : 's'} over ${scorecard.daysActive} day${
            scorecard.daysActive === 1 ? '' : 's'
          }`}
        />
        <Stat
          label="Doing nothing"
          value={benchmark ? formatPercent(benchmark.returnPercent) : '—'}
          tone={benchmark ? TONE[directionOf(benchmark.returnPercent)] : 'text-muted'}
          detail={benchmark ? benchmark.label : 'Needs at least one trade to compare'}
          help={{
            title: 'The benchmark',
            body: 'What you would have earned by buying a broad index fund with the same money on the same day and leaving it alone. It is the honest thing to measure a strategy against.',
          }}
        />
        <Stat
          label="Costs paid"
          value={formatPrice(you.costsPaid)}
          tone={you.costDragPercent > 1 ? 'text-down' : 'text-muted'}
          detail={`${you.costDragPercent}% of your starting money`}
          help={{
            title: 'Costs',
            body: 'The spread and commission on every trade so far. It never shows up as a fee, but it comes straight out of your return.',
          }}
        />
      </div>

      {differencePercent !== null && (
        <div
          className={`rounded-md border p-4 ${
            verdict === 'ahead' ? 'border-up/40 bg-up/5' : 'border-signal/40 bg-signal/5'
          }`}
        >
          <p className="text-sm text-paper">
            {verdict === 'ahead'
              ? `You are ${Math.abs(differencePercent)}% ahead of buy-and-hold.`
              : `You are ${Math.abs(differencePercent)}% behind buy-and-hold.`}
          </p>
          {scorecard.buyAndHoldEquity !== null && (
            <p className="mt-1 text-xs text-muted">
              Your practice account is worth{' '}
              <span className="tabular">{formatPrice(you.equity)}</span>. The same money left in the
              index would be{' '}
              <span className="tabular">{formatPrice(scorecard.buyAndHoldEquity)}</span>.
            </p>
          )}
        </div>
      )}

      {observations.length > 0 && (
        <ul className="space-y-2.5">
          {observations.map((observation) => (
            <li
              key={observation.id}
              className={`rounded-md border p-3 text-xs leading-relaxed text-muted ${
                OBSERVATION_TONE[observation.tone] ?? OBSERVATION_TONE.neutral
              }`}
            >
              {observation.text}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-faint">
        A few weeks of simulated trading cannot tell you whether you are good at this — the sample is
        far too small, and luck dominates over short periods.{' '}
        <Link to="/learn/why-most-lose" className="text-muted underline decoration-ink-700">
          Why that matters
        </Link>
        .
      </p>

      <button
        type="button"
        onClick={onReload}
        className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-muted transition hover:border-signal hover:text-signal"
      >
        Refresh
      </button>
    </div>
  );
}

export function Practice() {
  const [tab, setTab] = useState('portfolio');
  const [resetting, setResetting] = useState(false);

  const portfolio = useAsync(({ signal }) => paperApi.fetchPortfolio({ signal }), [], {
    refreshMs: 60_000,
  });
  const scorecard = useAsync(({ signal }) => paperApi.fetchScorecard({ signal }), []);
  const trades = useAsync(({ signal }) => paperApi.fetchTrades({ signal }), []);

  const reset = async () => {
    if (!window.confirm('Start over with a fresh practice account? Your trade history is deleted.')) {
      return;
    }
    setResetting(true);
    try {
      await paperApi.resetPortfolio();
      portfolio.reload();
      scorecard.reload();
      trades.reload();
    } finally {
      setResetting(false);
    }
  };

  if (portfolio.error) return <ErrorState error={portfolio.error} onRetry={portfolio.reload} />;

  const account = portfolio.data?.portfolio;
  const positions = portfolio.data?.positions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Practice account</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            Trade with fake money, real prices
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Everything here is simulated, but the quotes and the costs are real. Buying something is
            the fastest way to learn what a position actually feels like.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <StockSearch placeholder="Find something to practise on" />
        </div>
      </div>

      {account && (
        <section className="panel grid gap-5 p-5 sm:grid-cols-4">
          <Stat
            label="Total value"
            value={formatPrice(account.equity)}
            detail={`started with ${formatPrice(account.startingCash)}`}
            help={{
              title: 'Total value',
              body: 'Your cash plus what your holdings are worth right now. This is the only number that tells you how you are doing overall.',
            }}
          />
          <Stat
            label="Return"
            value={formatPercent(account.totalReturnPercent)}
            tone={TONE[directionOf(account.totalReturnPercent)]}
            detail={formatPrice(account.totalReturn)}
          />
          <Stat
            label="Cash"
            value={formatPrice(account.cash)}
            detail={`${account.cashPercent}% of the account`}
            help={{
              title: 'Cash',
              body: 'Money not invested. It earns nothing in the simulator, but it also cannot fall — holding cash is a position too.',
            }}
          />
          <Stat
            label="Unrealised P/L"
            value={formatPrice(account.unrealizedPnl)}
            tone={TONE[directionOf(account.unrealizedPnl)]}
            detail="on positions you still hold"
            help={{
              title: 'Unrealised profit and loss',
              body: 'Gains or losses on things you have not sold. Nothing is locked in until you sell — this number moves every day.',
            }}
          />
        </section>
      )}

      <div role="tablist" aria-label="Practice views" className="flex gap-1 border-b border-ink-800">
        {[
          { key: 'portfolio', label: 'Holdings' },
          { key: 'scorecard', label: 'Scorecard' },
          { key: 'history', label: 'Trade history' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === item.key
                ? 'border-signal text-paper'
                : 'border-transparent text-muted hover:text-paper'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'portfolio' && (
        <section className="panel overflow-hidden">
          {portfolio.isLoading && !portfolio.data ? (
            <SkeletonRows rows={4} />
          ) : (
            <Positions positions={positions} />
          )}
        </section>
      )}

      {tab === 'scorecard' && (
        <section className="panel p-5">
          {scorecard.error ? (
            <ErrorState error={scorecard.error} onRetry={scorecard.reload} />
          ) : (
            <Scorecard scorecard={scorecard.data} onReload={scorecard.reload} />
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="panel overflow-hidden">
          {trades.data?.trades?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-800">
                    <th className="label px-4 py-2 text-left">When</th>
                    <th className="label px-4 py-2 text-left">Trade</th>
                    <th className="label px-4 py-2 text-right">Fill</th>
                    <th className="label px-4 py-2 text-right">Costs</th>
                    <th className="label px-4 py-2 text-right">Realised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-850">
                  {trades.data.trades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="px-4 py-3 text-xs text-faint">
                        {formatDateTime(trade.executedAt)}
                        {trade.filledWhileClosed && (
                          <span className="ml-1.5 text-signal">· market closed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                            trade.side === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
                          }`}
                        >
                          {trade.side}
                        </span>
                        <span className="tabular ml-2 text-muted">
                          {trade.quantity} {trade.symbol}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 text-right text-paper">
                        {formatPrice(trade.fillPrice)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-muted">
                        {formatPrice(Number(trade.spreadCost) + Number(trade.commission))}
                      </td>
                      <td
                        className={`tabular px-4 py-3 text-right ${
                          trade.realizedPnl === null ? 'text-faint' : TONE[directionOf(trade.realizedPnl)]
                        }`}
                      >
                        {trade.realizedPnl === null ? '—' : formatPrice(trade.realizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No trades yet"
              description="Your practice trades will be listed here with what each one cost you."
            />
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-muted transition hover:border-down hover:text-down disabled:opacity-50"
        >
          {resetting ? 'Resetting…' : 'Start over'}
        </button>
        <p className="text-xs text-faint">
          Resets cash to {formatPrice(account?.startingCash ?? 10000)} and clears your history.
          {account?.resetCount > 0 && ` You have done this ${account.resetCount} time(s).`}
        </p>
      </div>
    </div>
  );
}

export default Practice;
