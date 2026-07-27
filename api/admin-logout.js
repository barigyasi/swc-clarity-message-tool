const { clearSessionCookie, noStore } = require('../lib/admin-auth');

module.exports = async (request, response) => {
  noStore(response);

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'POST only' });
  }

  response.setHeader('Set-Cookie', clearSessionCookie(request));
  return response.status(200).json({ ok: true });
};
