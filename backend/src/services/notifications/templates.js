import config from '../../config/env.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const money = (value) =>
  value === null || value === undefined ? '—' : `$${Number(value).toFixed(2)}`;

/** One line, suitable for a chat webhook or a notification tray. */
export function formatAlertText(alert) {
  if (alert.kind === 'SYSTEM') return `Stackr · ${alert.symbol}: ${alert.message}`;
  return `Stackr · ${alert.symbol} ${alert.type} alert — ${alert.message}`;
}

export function renderEmail(alert, recipient) {
  const isSystem = alert.kind === 'SYSTEM';
  const subject = isSystem
    ? `Stackr: alerts paused on ${alert.symbol}`
    : `Stackr: ${alert.symbol} hit your ${alert.type} threshold`;

  const link = `${config.frontendUrl}/stocks/${encodeURIComponent(alert.symbol)}`;
  const greeting = recipient?.name ? `Hi ${recipient.name.split(' ')[0]},` : 'Hi,';

  const text = [
    greeting,
    '',
    alert.message,
    '',
    ...(isSystem
      ? []
      : [`Threshold: ${money(alert.threshold)}`, `Triggered at: ${money(alert.triggerPrice)}`, '']),
    `Open ${alert.symbol}: ${link}`,
    '',
    'You are receiving this because you set an alert in Stackr.',
    `Manage notifications: ${config.frontendUrl}/account`,
  ].join('\n');

  // Deliberately plain: inline styles only, no external assets, and it degrades
  // to readable text in any client.
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px">
      <tr>
        <td style="padding:24px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">
            ${isSystem ? 'Alerts paused' : `${escapeHtml(alert.type)} alert`}
          </p>
          <h1 style="margin:0 0 16px;font-size:22px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
            ${escapeHtml(alert.symbol)}
          </h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55">${escapeHtml(alert.message)}</p>
          ${
            isSystem
              ? ''
              : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
                   <tr>
                     <td style="padding:4px 16px 4px 0;color:#6b7280">Threshold</td>
                     <td style="padding:4px 0;font-family:ui-monospace,monospace">${money(alert.threshold)}</td>
                   </tr>
                   <tr>
                     <td style="padding:4px 16px 4px 0;color:#6b7280">Triggered at</td>
                     <td style="padding:4px 0;font-family:ui-monospace,monospace">${money(alert.triggerPrice)}</td>
                   </tr>
                 </table>`
          }
          <a href="${escapeHtml(link)}"
             style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
            Open ${escapeHtml(alert.symbol)}
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
            You set this alert in Stackr. Prices may be delayed; this is not investment advice.<br />
            <a href="${escapeHtml(config.frontendUrl)}/account" style="color:#6b7280">Manage notifications</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export default { formatAlertText, renderEmail };
