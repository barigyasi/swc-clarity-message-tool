const { handleUploadPresigned } = require('@vercel/blob/client');
const { issueSignedToken, put } = require('@vercel/blob');

const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;
const ALLOWED_CONTENT_TYPES = [
  'video/webm',
  'video/mp4',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
];

function parseAndValidateMeta(clientPayload) {
  let meta;

  try {
    meta = clientPayload ? JSON.parse(clientPayload) : {};
  } catch {
    throw new Error('Invalid upload metadata');
  }

  if (!meta || typeof meta !== 'object') {
    throw new Error('Invalid upload metadata');
  }

  if (!SHARE_ID_RE.test(String(meta.shareId || ''))) {
    throw new Error('Invalid share id');
  }

  if (meta.mode !== 'video' && meta.mode !== 'audio') {
    throw new Error('Invalid media mode');
  }

  return meta;
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'POST only' });
  }

  try {
    const jsonResponse = await handleUploadPresigned({
      body: request.body,
      request,

      getSignedToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith('submissions/')) {
          throw new Error('Invalid upload path');
        }

        const meta = parseAndValidateMeta(clientPayload);
        const validUntil = Date.now() + TOKEN_TTL_MS;

        // issueSignedToken uses the project's OIDC credentials automatically:
        // BLOB_STORE_ID + the short-lived Vercel OIDC token.
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          validUntil,
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
        });

        return {
          token,
          urlOptions: {
            validUntil,
            addRandomSuffix: true,
            cacheControlMaxAge: 31536000,
            tokenPayload: JSON.stringify(meta),
          },
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let meta = {};

        try {
          meta = tokenPayload ? JSON.parse(tokenPayload) : {};
        } catch {
          // Keep the callback successful even if optional metadata is malformed.
        }

        const record = {
          ...meta,
          videoUrl: blob.url,
          pathname: blob.pathname,
          uploadedAt: new Date().toISOString(),
        };

        const key = `submissions/meta-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.json`;

        await put(key, JSON.stringify(record), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          cacheControlMaxAge: 31536000,
        });
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Blob upload route failed:', error);

    return response.status(400).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
};
