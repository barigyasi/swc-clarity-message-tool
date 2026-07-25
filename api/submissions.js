const { list } = require('@vercel/blob');

module.exports = async (request, response) => {
  const token = request.headers['x-admin-token'] || request.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return response.status(401).json({ error: 'unauthorized' });
  }

  try {
    const { blobs } = await list({ prefix: 'submissions/meta-' });
    const submissions = await Promise.all(
      blobs.map(async (b) => {
        try {
          const r = await fetch(b.url);
          return await r.json();
        } catch (e) {
          return null;
        }
      })
    );
    const clean = submissions
      .filter(Boolean)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    response.status(200).json({ count: clean.length, submissions: clean });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
};
