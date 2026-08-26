import { useState } from 'react';
import { Link } from 'react-router-dom';

import learnApi from '../services/learnApi.js';
import { LESSON_BY_ID } from '../utils/lessons.js';

/**
 * The getting-started checklist.
 *
 * Steps are marked complete by the server from what the user has actually done,
 * not by clicking through a tour — so it cannot be satisfied without doing the
 * thing, and it survives a new device. Dismissible, because a checklist that
 * will not go away is nagging rather than helping.
 */
export function GettingStarted({ onboarding, onChange }) {
  const [busy, setBusy] = useState(false);

  if (!onboarding || onboarding.dismissed || onboarding.finished) return null;

  const dismiss = async () => {
    setBusy(true);
    try {
      const next = await learnApi.dismissChecklist(true);
      onChange?.(next);
    } finally {
      setBusy(false);
    }
  };

  const { steps, completedCount, totalCount, nextStep } = onboarding;
  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <section className="panel overflow-hidden" aria-labelledby="getting-started-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-5 py-4">
        <div>
          <h2 id="getting-started-heading" className="text-sm font-semibold">
            New here? Start with these
          </h2>
          <p className="mt-0.5 text-xs text-faint">
            {completedCount} of {totalCount} done · about 10 minutes in total
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="h-1 w-24 overflow-hidden rounded-full bg-ink-800"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Getting started progress"
          >
            <span className="block h-full rounded-full bg-signal" style={{ width: `${percent}%` }} />
          </span>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="text-xs text-faint transition hover:text-muted disabled:opacity-50"
          >
            Hide
          </button>
        </div>
      </div>

      <ol className="divide-y divide-ink-850">
        {steps.map((step, index) => {
          const isNext = nextStep?.id === step.id;
          const lesson = step.lesson ? LESSON_BY_ID[step.lesson] : null;

          return (
            <li
              key={step.id}
              className={`flex gap-3.5 px-5 py-3.5 ${isNext ? 'bg-signal/[0.04]' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  step.complete
                    ? 'border-up/50 bg-up/15 text-up'
                    : isNext
                      ? 'border-signal text-signal'
                      : 'border-ink-700 text-faint'
                }`}
              >
                {step.complete ? '✓' : index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${
                    step.complete ? 'text-faint line-through decoration-ink-700' : 'text-paper'
                  }`}
                >
                  {step.title}
                </p>
                {!step.complete && <p className="mt-0.5 text-xs text-muted">{step.body}</p>}

                {!step.complete && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      to={step.action.to}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        isNext
                          ? 'bg-signal text-ink-950 hover:bg-signal/90'
                          : 'border border-ink-700 text-paper hover:border-signal hover:text-signal'
                      }`}
                    >
                      {step.action.label}
                    </Link>
                    {lesson && (
                      <Link
                        to={`/learn/${lesson.id}`}
                        className="text-xs text-muted underline decoration-ink-700 underline-offset-2 transition hover:text-signal"
                      >
                        Read: {lesson.title} ({lesson.minutes} min)
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default GettingStarted;
