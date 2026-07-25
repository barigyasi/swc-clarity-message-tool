const { handleUpload } = require('@vercel/blob/client');
const { put } = require('@vercel/blob');

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
        return {
          allowedContentTypes: [
            'video/webm', 'video/mp4',
            'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/ogg'
          ],
          addRandomSuffix: true,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let meta = {};
        try { meta = tokenPayload ? JSON.parse(tokenPayload) : {}; } catch (e) {}
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
        });
      },
    });
    response.status(200).json(jsonResponse);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
};
