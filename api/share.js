const { put } = require('@vercel/blob');

const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;

function getBaseUrl(request) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : (forwardedHost || request.headers.host || '');
  const host = String(rawHost).split(',')[0].trim();

  const forwardedProto = request.headers['x-forwarded-proto'];
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = String(rawProto || 'https').split(',')[0].trim() === 'http' ? 'http' : 'https';

  if (!host) throw new Error('missing host');
  return `${proto}://${host}`;
}

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string' && request.body) return JSON.parse(request.body);
  return {};
}

function parseMediaUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('invalid media url');
  }

  // BLOB_STORE_ID is an internal store identifier and is not guaranteed to
  // equal the public Blob hostname prefix. Validate the public Blob domain and
  // the submissions path instead of comparing them directly.
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
    !url.pathname.startsWith('/submissions/')
  ) {
    throw new Error('invalid media url');
  }

  // Public Blob playback does not require query parameters.
  url.search = '';
  url.hash = '';
  return url.href;
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST only' });
  }

  try {
    const body = parseBody(request);
    const shareId = String(body.shareId || '');
    const mode = body.mode === 'audio' ? 'audio' : body.mode === 'video' ? 'video' : '';
    const mediaUrl = parseMediaUrl(body.mediaUrl);

    if (!SHARE_ID_RE.test(shareId)) {
      return response.status(400).json({ error: 'invalid share id' });
    }
    if (!mode) {
      return response.status(400).json({ error: 'invalid media mode' });
    }

    // The upload result is already a signed response from the project's exact
    // Blob store. Do not immediately call head() here: a just-written public
    // object can briefly race its metadata lookup and make valid uploads fail.
    const record = {
      shareId,
      mode,
      mediaUrl,
      createdAt: new Date().toISOString(),
    };

    await put(`shares/${shareId}.json`, JSON.stringify(record), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });

    return response.status(201).json({
      shareId,
      watchUrl: `${getBaseUrl(request)}/watch/${shareId}`,
    });
  } catch (error) {
    console.error('share registration failed', error);
    return response.status(500).json({ error: 'share registration failed' });
  }
};
