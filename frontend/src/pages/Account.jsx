import { useEffect, useState } from 'react';

import { ErrorState } from '../components/ErrorState.jsx';
import { Loading } from '../components/Loading.jsx';
import useAsync from '../hooks/useAsync.js';
import useAuth from '../hooks/useAuth.js';
import notificationApi from '../services/notificationApi.js';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

// Enough of the common zones to be useful without shipping a picker library.
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function DeliveryStats({ deliveries }) {
  if (!deliveries || deliveries.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      {deliveries.map((row) => (
        <div key={`${row.channel}-${row.status}`}>
          <dt className="label">
            {row.channel} {row.status}
          </dt>
          <dd className="tabular mt-0.5 text-sm text-paper">{row.count}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Account() {
  const { user } = useAuth();
  const { data, error, isLoading, reload } = useAsync(
    ({ signal }) => notificationApi.fetchNotificationSettings({ signal }),
    [],
  );

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setForm({
      emailEnabled: s.emailEnabled,
      webhookEnabled: s.webhookEnabled,
      webhookUrl: s.webhookUrl ?? '',
      quietEnabled: s.quietHoursStart !== null && s.quietHoursStart !== undefined,
      quietHoursStart: s.quietHoursStart ?? 22,
      quietHoursEnd: s.quietHoursEnd ?? 7,
      timezone: s.timezone ?? 'UTC',
    });
  }, [data]);

  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      await notificationApi.saveNotificationSettings({
        emailEnabled: form.emailEnabled,
        webhookEnabled: form.webhookEnabled,
        webhookUrl: form.webhookUrl.trim() || null,
        quietHoursStart: form.quietEnabled ? form.quietHoursStart : null,
        quietHoursEnd: form.quietEnabled ? form.quietHoursEnd : null,
        timezone: form.timezone,
      });
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loading label="Loading your settings" />
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const emailAvailable = data?.settings?.channels?.email?.available;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="label">Account</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Where alerts go</h1>
        <p className="mt-2 text-sm text-muted">
          An alert you never see is only a log entry. Pick at least one channel so a crossing
          reaches you when you are not looking at Stackr.
        </p>
      </div>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Signed in as</h2>
        <p className="mt-2 flex items-center gap-3">
          {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />}
          <span>
            <span className="block text-sm text-paper">{user?.name}</span>
            <span className="block text-xs text-faint">{user?.email}</span>
          </span>
        </p>
      </section>

      {form && (
        <form onSubmit={save} className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Channels</h2>

            <div className="mt-4 space-y-4">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.emailEnabled}
                  disabled={!emailAvailable}
                  onChange={(event) => update({ emailEnabled: event.target.checked })}
                  className="mt-0.5 size-3.5 accent-[var(--color-signal)]"
                />
                <span>
                  <span className="block text-sm text-paper">Email to {user?.email}</span>
                  <span className="block text-xs text-faint">
                    {emailAvailable
                      ? 'Sent as soon as an alert triggers.'
                      : 'Unavailable: the server has no SMTP_URL configured.'}
                  </span>
                </span>
              </label>

              <div>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.webhookEnabled}
                    onChange={(event) => update({ webhookEnabled: event.target.checked })}
                    className="mt-0.5 size-3.5 accent-[var(--color-signal)]"
                  />
                  <span>
                    <span className="block text-sm text-paper">Webhook</span>
                    <span className="block text-xs text-faint">
                      Posts JSON to a URL you control. Works with Slack and Discord incoming
                      webhooks as-is.
                    </span>
                  </span>
                </label>

                <input
                  type="url"
                  value={form.webhookUrl}
                  onChange={(event) => update({ webhookUrl: event.target.value })}
                  placeholder="https://hooks.slack.com/services/…"
                  aria-label="Webhook URL"
                  className="mt-2.5 w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper placeholder:text-faint focus:border-signal/60 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-faint">
                  Must be a public https URL. Private and link-local addresses are refused.
                </p>
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Quiet hours</h2>
            <p className="mt-1.5 text-sm text-muted">
              Price alerts are held until the window ends rather than dropped. Notices about paused
              rules still come through.
            </p>

            <label className="mt-4 flex items-center gap-2.5 text-sm text-paper">
              <input
                type="checkbox"
                checked={form.quietEnabled}
                onChange={(event) => update({ quietEnabled: event.target.checked })}
                className="size-3.5 accent-[var(--color-signal)]"
              />
              Hold alerts overnight
            </label>

            {form.quietEnabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="quiet-start" className="label mb-2 block">
                    From
                  </label>
                  <select
                    id="quiet-start"
                    value={form.quietHoursStart}
                    onChange={(event) => update({ quietHoursStart: Number(event.target.value) })}
                    className="tabular w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hourLabel(hour)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quiet-end" className="label mb-2 block">
                    Until
                  </label>
                  <select
                    id="quiet-end"
                    value={form.quietHoursEnd}
                    onChange={(event) => update({ quietHoursEnd: Number(event.target.value) })}
                    className="tabular w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hourLabel(hour)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quiet-tz" className="label mb-2 block">
                    Your timezone
                  </label>
                  <select
                    id="quiet-tz"
                    value={form.timezone}
                    onChange={(event) => update({ timezone: event.target.value })}
                    className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-signal/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saved && <p className="text-sm text-up">Saved.</p>}
            {saveError && (
              <p className="text-sm text-down" role="alert">
                {saveError.message}
              </p>
            )}
          </div>
        </form>
      )}

      {data?.deliveries?.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">Delivery history</h2>
          <DeliveryStats deliveries={data.deliveries} />
        </section>
      )}
    </div>
  );
}

export default Account;
