const { put, list } = require('@vercel/blob');
const { noStore, requireAdmin } = require('../lib/admin-auth');

const CONFIG_PATH = 'config/settings.json';
const DEFAULTS = { voiceNotesEnabled: true };

async function readConfig() {
  const { blobs } = await list({ prefix: CONFIG_PATH });
  const blob = blobs.find((item) => item.pathname === CONFIG_PATH);
  if (!blob) return { ...DEFAULTS };
  const result = await fetch(`${blob.url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!result.ok) return { ...DEFAULTS };
  return { ...DEFAULTS, ...(await result.json()) };
}

module.exports = async (request, response) => {
  try {
    if (request.method === 'POST') {
      noStore(response);
      const session = requireAdmin(request, response);
      if (!session) return;

      const current = await readConfig();
      const body = typeof request.body === 'object' && request.body ? request.body : {};
      const next = { ...current };
      if (typeof body.voiceNotesEnabled === 'boolean') {
        next.voiceNotesEnabled = body.voiceNotesEnabled;
      }

      await put(CONFIG_PATH, JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return response.status(200).json(next);
    }

    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'GET or POST only' });
    }

    const config = await readConfig();
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json(config);
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Configuration request failed',
    });
  }
};
