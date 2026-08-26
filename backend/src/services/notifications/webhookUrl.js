import ApiError from '../../utils/ApiError.js';

/**
 * A user-supplied URL that the server then requests is a server-side request
 * forgery risk: left unchecked it can be pointed at cloud metadata endpoints or
 * at services reachable only from inside the network. Only public HTTPS hosts
 * are accepted.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

// Literal private and link-local ranges. Hostnames that only resolve to private
// addresses at request time are out of scope here; egress rules are the right
// control for that.
const BLOCKED_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
];

export function isSafeWebhookUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Webhook URLs must use https.' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Webhook URLs must not contain credentials.' };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'That host is not reachable from the server.' };
  }
  if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    return { ok: false, reason: 'Private addresses are not allowed.' };
  }
  if (BLOCKED_IPV4.some((pattern) => pattern.test(hostname))) {
    return { ok: false, reason: 'Private addresses are not allowed.' };
  }
  // A bare hostname with no dot is almost always an internal service name.
  if (!hostname.includes('.')) {
    return { ok: false, reason: 'Use a fully qualified public hostname.' };
  }

  return { ok: true, url: url.toString() };
}

export function assertSafeWebhookUrl(value) {
  const result = isSafeWebhookUrl(value);
  if (!result.ok) throw ApiError.badRequest(result.reason);
  return result.url;
}

export default { isSafeWebhookUrl, assertSafeWebhookUrl };
