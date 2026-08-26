import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isQuietHour } from '../src/services/notifications/notificationService.js';
import { isSafeWebhookUrl } from '../src/services/notifications/webhookUrl.js';
import { formatAlertText, renderEmail } from '../src/services/notifications/templates.js';

describe('isSafeWebhookUrl', () => {
  it('accepts a public https endpoint', () => {
    expect(isSafeWebhookUrl('https://hooks.slack.com/services/T000/B000/xyz').ok).toBe(true);
    expect(isSafeWebhookUrl('https://discord.com/api/webhooks/1/abc').ok).toBe(true);
  });

  it('rejects plain http, which would put the payload on the wire', () => {
    expect(isSafeWebhookUrl('http://example.com/hook')).toMatchObject({ ok: false });
  });

  it.each([
    'https://localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://192.168.1.10/hook',
    'https://172.16.0.4/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://[::1]/hook',
    'https://internal-service/hook',
  ])('refuses %s', (url) => {
    // A user-supplied URL that the server then requests is an SSRF vector; the
    // cloud metadata endpoint is the classic target.
    expect(isSafeWebhookUrl(url).ok).toBe(false);
  });

  it('refuses embedded credentials', () => {
    expect(isSafeWebhookUrl('https://user:pass@example.com/hook').ok).toBe(false);
  });

  it('refuses nonsense', () => {
    expect(isSafeWebhookUrl('not a url').ok).toBe(false);
    expect(isSafeWebhookUrl('').ok).toBe(false);
  });
});

describe('isQuietHour', () => {
  const at = (iso) => new Date(iso);

  it('is false when no window is set', () => {
    expect(isQuietHour({ timezone: 'UTC' }, at('2026-08-21T03:00:00Z'))).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const settings = { quietHoursStart: 22, quietHoursEnd: 7, timezone: 'UTC' };

    expect(isQuietHour(settings, at('2026-08-21T23:30:00Z'))).toBe(true);
    expect(isQuietHour(settings, at('2026-08-21T03:00:00Z'))).toBe(true);
    expect(isQuietHour(settings, at('2026-08-21T06:59:00Z'))).toBe(true);
    expect(isQuietHour(settings, at('2026-08-21T07:00:00Z'))).toBe(false);
    expect(isQuietHour(settings, at('2026-08-21T15:00:00Z'))).toBe(false);
  });

  it('handles a same-day window', () => {
    const settings = { quietHoursStart: 9, quietHoursEnd: 17, timezone: 'UTC' };
    expect(isQuietHour(settings, at('2026-08-21T12:00:00Z'))).toBe(true);
    expect(isQuietHour(settings, at('2026-08-21T18:00:00Z'))).toBe(false);
  });

  it('evaluates the window in the user’s own timezone', () => {
    // 03:00 UTC is 23:00 the previous evening in New York, which is inside a
    // 22:00-07:00 quiet window there but outside it in UTC.
    const settings = { quietHoursStart: 22, quietHoursEnd: 7, timezone: 'America/New_York' };
    expect(isQuietHour(settings, at('2026-08-21T03:00:00Z'))).toBe(true);

    const utcSettings = { ...settings, timezone: 'UTC' };
    expect(isQuietHour(utcSettings, at('2026-08-21T12:00:00Z'))).toBe(false);
  });

  it('falls back to UTC on an unusable timezone rather than throwing', () => {
    const settings = { quietHoursStart: 22, quietHoursEnd: 7, timezone: 'Not/AZone' };
    expect(() => isQuietHour(settings, at('2026-08-21T23:00:00Z'))).not.toThrow();
  });
});

describe('templates', () => {
  const alert = {
    id: 1,
    kind: 'THRESHOLD',
    symbol: 'AAPL',
    type: 'BUY',
    condition: 'BELOW',
    triggerPrice: 199.12,
    threshold: 200,
    message: 'AAPL fell to $199.12, at or below your BUY threshold of $200.00.',
    triggeredAt: '2026-08-21T14:31:00.512Z',
  };

  it('writes a one-line summary for chat webhooks', () => {
    expect(formatAlertText(alert)).toContain('AAPL');
    expect(formatAlertText(alert)).toContain('BUY');
  });

  it('labels a system notice differently', () => {
    const notice = { ...alert, kind: 'SYSTEM', message: 'Alerts paused: suspected split.' };
    expect(formatAlertText(notice)).not.toContain('BUY alert');
    expect(renderEmail(notice, {}).subject).toMatch(/paused/);
  });

  it('renders subject, text and html', () => {
    const email = renderEmail(alert, { name: 'Gerald Villorente', email: 'g@example.com' });

    expect(email.subject).toContain('AAPL');
    expect(email.text).toContain('Hi Gerald,');
    expect(email.text).toContain('199.12');
    expect(email.html).toContain('AAPL');
    expect(email.html).toContain('$200.00');
  });

  it('escapes anything that could break out of the html', () => {
    const nasty = { ...alert, symbol: 'A<script>alert(1)</script>' };
    const email = renderEmail(nasty, {});
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('enqueueForAlert', () => {
  const load = async () => {
    vi.resetModules();
    return import('../src/services/notifications/notificationService.js');
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it('queues only the channels the user switched on', async () => {
    const { enqueueForAlert } = await load();
    const repo = await import('../src/db/repositories/notificationRepository.js');
    const enqueue = vi.spyOn(repo.default, 'enqueue').mockResolvedValue({ id: 1 });

    await enqueueForAlert(
      { id: 5, userId: 42 },
      { emailEnabled: true, webhookEnabled: true, webhookUrl: 'https://hooks.example.com/x' },
    );

    const channels = enqueue.mock.calls.map(([arg]) => arg.channel);
    expect(channels).toContain('webhook');
    expect(channels).toContain('email');
  });

  it('skips a channel the user turned off', async () => {
    const { enqueueForAlert } = await load();
    const repo = await import('../src/db/repositories/notificationRepository.js');
    const enqueue = vi.spyOn(repo.default, 'enqueue').mockResolvedValue({ id: 1 });

    await enqueueForAlert({ id: 5, userId: 42 }, { emailEnabled: false, webhookEnabled: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('records an unconfigured channel as skipped rather than dropping it', async () => {
    // Email is enabled by default but SMTP is not configured in tests, so the
    // row exists with status "skipped" and the history can explain itself.
    const { enqueueForAlert } = await load();
    const repo = await import('../src/db/repositories/notificationRepository.js');
    const enqueue = vi.spyOn(repo.default, 'enqueue').mockResolvedValue({ id: 1 });

    await enqueueForAlert({ id: 5, userId: 42 }, { emailEnabled: true, webhookEnabled: false });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'skipped' }),
      undefined,
    );
  });
});
