const { put, list } = require('@vercel/blob');

const CONFIG_PATH = 'config/settings.json';
const DEFAULTS = { voiceNotesEnabled: true };

async function readConfig() {
  const { blobs } = await list({ prefix: CONFIG_PATH });
  const b = blobs.find((x) => x.pathname === CONFIG_PATH);
  if (!b) return { ...DEFAULTS };
  // cache-busting query param sidesteps the blob CDN cache so toggles apply immediately
  const r = await fetch(b.url + '?t=' + Date.now());
  return { ...DEFAULTS, ...(await r.json()) };
}

module.exports = async (request, response) => {
  try {
    if (request.method === 'POST') {
      const token = request.headers['x-admin-token'];
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return response.status(401).json({ error: 'unauthorized' });
      }
      const current = await readConfig();
      const body = typeof request.body === 'object' && request.body ? request.body : {};
      const next = { ...current };
      if (typeof body.voiceNotesEnabled === 'boolean') next.voiceNotesEnabled = body.voiceNotesEnabled;
      await put(CONFIG_PATH, JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return response.status(200).json(next);
    }
    const cfg = await readConfig();
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json(cfg);
  } catch (e) {
    return response.status(500).json({ error: e.message });
  }
};
