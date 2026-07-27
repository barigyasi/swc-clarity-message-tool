const { OAuth2Client } = require('google-auth-library');
const {
  createSessionToken,
  isAllowedEmail,
  noStore,
  sessionCookie,
} = require('../lib/admin-auth');

module.exports = async (request, response) => {
  noStore(response);

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'POST only' });
  }

  const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
  if (!clientId) {
    console.error('Google admin login unavailable: GOOGLE_CLIENT_ID is missing');
    return response.status(500).json({ error: 'Admin login is not configured' });
  }

  const credential = String((request.body && request.body.credential) || '');
  if (!credential || credential.length > 10000) {
    return response.status(400).json({ error: 'Missing Google credential' });
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = String((payload && payload.email) || '').trim().toLowerCase();

    if (!payload || payload.email_verified !== true || !payload.sub || !email) {
      return response.status(401).json({ error: 'Google account could not be verified' });
    }

    if (!isAllowedEmail(email)) {
      console.warn(`Rejected admin login for non-allowlisted email: ${email}`);
      return response.status(403).json({ error: 'This Google account is not authorized' });
    }

    const user = {
      sub: payload.sub,
      email,
      name: payload.name || email,
      picture: payload.picture || '',
    };

    response.setHeader('Set-Cookie', sessionCookie(request, createSessionToken(user)));
    return response.status(200).json({
      authenticated: true,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  } catch (error) {
    console.error('Google admin login failed:', error && error.message ? error.message : error);
    return response.status(401).json({ error: 'Google sign-in could not be verified' });
  }
};
