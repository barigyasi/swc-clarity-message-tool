const { handleUpload } = require('@vercel/blob/client');
const { put } = require('@vercel/blob');

const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;

function parseAndValidateMeta(clientPayload) {
  let meta;
  try {
    meta = clientPayload ? JSON.parse(clientPayload) : {};
  } catch {
    throw new Error('Invalid upload metadata');
  }

  if (!meta || typeof meta !== 'object') throw new Error('Invalid upload metadata');
  if (!SHARE_ID_RE.test(String(meta.shareId || ''))) throw new Error('Invalid share id');
  if (meta.mode !== 'video' && meta.mode !== 'audio') throw new Error('Invalid media mode');

  return meta;
}

module.exports = async (request, response) => {
  const body = request.body;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith('submissions/')) {
          throw new Error('Invalid upload path');
        }

        const meta = parseAndValidateMeta(clientPayload);

        return {
          allowedContentTypes: [
            'video/webm', 'video/mp4',
            'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/ogg',
          ],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: true,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify(meta),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let meta = {};
        try {
          meta = tokenPayload ? JSON.parse(tokenPayload) : {};
        } catch {}

        const record = {
          ...meta,
          videoUrl: blob.url,
          pathname: blob.pathname,
          uploadedAt: new Date().toISOString(),
        };

        const key = `submissions/meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
        await put(key, JSON.stringify(record), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          cacheControlMaxAge: 31536000,
        });
      },
    });

    response.status(200).json(jsonResponse);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
};
