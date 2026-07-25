module.exports = (request, response) => {
  const v = String(request.query.v || '');
  const mode = request.query.m === 'audio' ? 'audio' : 'video';

  let u;
  try { u = new URL(v); } catch (e) { return response.status(400).send('Bad request'); }
  // only serve media from our own blob store
  if (u.protocol !== 'https:' ||
      !u.hostname.endsWith('.public.blob.vercel-storage.com') ||
      !u.pathname.startsWith('/submissions/')) {
    return response.status(400).send('Bad request');
  }
  const src = u.href.replace(/"/g, '');
  const isMp4 = /\.(mp4|m4a)$/i.test(u.pathname);
  const mediaType = mode === 'video' ? (isMp4 ? 'video/mp4' : 'video/webm')
                                     : (isMp4 ? 'audio/mp4' : 'audio/webm');
  const title = 'A constituent message on the CLARITY Act';
  const desc = 'A Stand With Crypto advocate recorded this message urging their senators to pass the CLARITY Act.';

  const player = mode === 'video'
    ? `<video controls playsinline src="${src}"></video>`
    : `<div class="audio-wrap"><div class="mic">🎙️</div><audio controls src="${src}"></audio></div>`;

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Stand With Crypto</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="video.other">
<meta property="og:video" content="${src}">
<meta property="og:video:secure_url" content="${src}">
<meta property="og:video:type" content="${mediaType}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<style>
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap');
  body{margin:0;background:#fff;color:#020817;font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .banner{background:#6c11ff;color:#fff;text-align:center;padding:12px 20px;font-weight:700;font-size:15px;}
  .wrap{max-width:720px;margin:0 auto;padding:28px 24px 60px;}
  .brand{display:flex;align-items:center;gap:12px;font-weight:900;font-size:18px;margin-bottom:28px;}
  h1{font-size:26px;letter-spacing:-.4px;margin:0 0 8px;}
  p.sub{color:#64748b;font-size:15px;margin:0 0 22px;}
  video{width:100%;max-height:75vh;object-fit:contain;border-radius:20px;background:#0b0d17;border:1px solid #e2e9f3;}
  .audio-wrap{background:#f9fafc;border:1px solid #e2e9f3;border-radius:20px;padding:36px 24px;text-align:center;}
  .audio-wrap .mic{font-size:44px;margin-bottom:16px;}
  .audio-wrap audio{width:100%;}
  a.cta{display:inline-flex;margin-top:26px;background:#6c11ff;color:#fff;text-decoration:none;border-radius:1000px;padding:15px 32px;font-weight:700;font-size:15.5px;}
  a.cta:hover{background:#923dfe;}
</style>
</head>
<body>
<div class="banner">It's time for the CLARITY Act — tell the Senate to move forward now!</div>
<div class="wrap">
  <div class="brand">
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.99953 0H0V14.3441C0.529429 21.8907 5.48357 28.3825 12.5714 30.8204L16 32V0H7.99953Z" fill="url(#g0)"/>
      <path d="M24.0005 0H16V32L19.4286 30.8185C26.5183 28.3806 31.4706 21.8878 32 14.3413V0H23.9995H24.0005Z" fill="url(#g1)"/>
      <defs>
        <linearGradient id="g0" x1="7.99953" y1="0" x2="7.99953" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#6100FF"/><stop offset="1" stop-color="#C09AFF"/></linearGradient>
        <linearGradient id="g1" x1="24.0005" y1="0" x2="24.0005" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#C09AFF"/><stop offset="1" stop-color="#6100FF"/></linearGradient>
      </defs>
    </svg>
    Stand With Crypto
  </div>
  <h1>${title}</h1>
  <p class="sub">${desc}</p>
  ${player}
  <a class="cta" href="/">Record your own message →</a>
</div>
</body>
</html>`);
};
