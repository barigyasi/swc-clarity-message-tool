module.exports = async (request, response) => {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'GET only' });
  }

  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return response.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
};
