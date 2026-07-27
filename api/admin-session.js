const { getAdminSession, noStore } = require('../lib/admin-auth');

module.exports = async (request, response) => {
  noStore(response);

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'GET only' });
  }

  const session = getAdminSession(request);
  if (!session) {
    return response.status(401).json({ authenticated: false });
  }

  return response.status(200).json({
    authenticated: true,
    user: {
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
};
