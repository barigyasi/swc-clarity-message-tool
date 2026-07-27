const crypto = require('crypto');

const COOKIE_NAME = 'swc_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function getSessionSecret() {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '');
  if (secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
  }
  return secret;
}

function getAllowedEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowedEmail(email) {
  return getAllowedEmails().has(String(email || '').trim().toLowerCase());
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function signValue(value) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(value)
    .digest('base64url');
}

function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.sub || ''),
    email: String(user.email || '').toLowerCase(),
    name: String(user.name || ''),
    picture: String(user.picture || ''),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signValue(encodedPayload)}`;
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a || ''));
  const bBuffer = Buffer.from(String(b || ''));
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra) return null;
  if (!safeEqual(signature, signValue(encodedPayload))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || !payload.email || !payload.sub || !payload.exp || payload.exp <= now) return null;
    // Re-check the allowlist on every request so removing an email revokes access immediately.
    if (!isAllowedEmail(payload.email)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const raw = String((request.headers && request.headers.cookie) || '');
  return raw.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getAdminSession(request) {
  const cookies = parseCookies(request);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function isSecureRequest(request) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https' || process.env.VERCEL === '1';
}

function sessionCookie(request, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(request) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function noStore(response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Vary', 'Cookie');
}

function requireAdmin(request, response) {
  const session = getAdminSession(request);
  if (!session) {
    noStore(response);
    response.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return session;
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionToken,
  getAdminSession,
  isAllowedEmail,
  noStore,
  requireAdmin,
  sessionCookie,
};
