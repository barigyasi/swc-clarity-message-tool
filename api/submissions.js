const { list } = require('@vercel/blob');
const { noStore, requireAdmin } = require('../lib/admin-auth');

module.exports = async (request, response) => {
  noStore(response);

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'GET only' });
  }

  const session = requireAdmin(request, response);
  if (!session) return;

  try {
    const { blobs } = await list({ prefix: 'submissions/meta-' });
    const submissions = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const result = await fetch(blob.url, { cache: 'no-store' });
          if (!result.ok) return null;
          return await result.json();
        } catch {
          return null;
        }
      })
    );

    const clean = submissions
      .filter((submission) => submission && submission.consent === true)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    return response.status(200).json({ count: clean.length, submissions: clean });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load submissions',
    });
  }
};
