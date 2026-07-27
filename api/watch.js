const { head } = require('@vercel/blob');

const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function getBaseUrl(request) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : (forwardedHost || request.headers.host || '');
  const host = String(rawHost).split(',')[0].trim();

  const forwardedProto = request.headers['x-forwarded-proto'];
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = String(rawProto || 'https').split(',')[0].trim() === 'http' ? 'http' : 'https';

  if (!host) throw new Error('missing host');
  return `${proto}://${host}`;
}

function validateMediaUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('Bad request');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
    !url.pathname.startsWith('/submissions/')
  ) {
    throw new Error('Bad request');
  }

  return url;
}

async function loadShareRecord(shareId) {
  const metadata = await head(`shares/${shareId}.json`);
  const response = await fetch(metadata.url);
  if (!response.ok) throw new Error('Share not found');

  const record = await response.json();
  const mode = record.mode === 'audio' ? 'audio' : 'video';
  const mediaUrl = validateMediaUrl(record.mediaUrl);

  return { mode, mediaUrl };
}

module.exports = async (request, response) => {
  const shareId = String(request.query.id || '');
  const legacyUrl = String(request.query.v || '');

  let mode;
  let mediaUrl;
  let canonical;

  try {
    if (shareId) {
      if (!SHARE_ID_RE.test(shareId)) {
        return response.status(400).send('Bad request');
      }

      const record = await loadShareRecord(shareId);
      mode = record.mode;
      mediaUrl = record.mediaUrl;
      canonical = `${getBaseUrl(request)}/watch/${shareId}`;
    } else if (legacyUrl) {
      // Backward compatibility for links that were posted before clean share URLs.
      mode = request.query.m === 'audio' ? 'audio' : 'video';
      mediaUrl = validateMediaUrl(legacyUrl);

      // Confirms that the legacy URL belongs to the Blob store connected to this project.
      const legacyBlob = await head(mediaUrl.href);
      if (!legacyBlob.pathname.startsWith('submissions/')) {
        return response.status(400).send('Bad request');
      }

      canonical = `${getBaseUrl(request)}/api/watch?m=${encodeURIComponent(mode)}&v=${encodeURIComponent(mediaUrl.href)}`;
    } else {
      return response.status(400).send('Bad request');
    }
  } catch (error) {
    response.setHeader('Cache-Control', 'public, max-age=60');
    return response.status(404).send('This message could not be found.');
  }

  const src = escapeHtml(mediaUrl.href);
  const isMp4 = /\.(mp4|m4a)$/i.test(mediaUrl.pathname);
  const mediaType = mode === 'video'
    ? (isMp4 ? 'video/mp4' : 'video/webm')
    : (isMp4 ? 'audio/mp4' : 'audio/webm');

  const title = 'A constituent message on the CLARITY Act';
  const desc = 'A Stand With Crypto advocate recorded this message urging their senators to pass the CLARITY Act.';
  const player = mode === 'video'
    ? `<video id="message-media" controls playsinline preload="metadata" src="${src}"></video>`
    : `<div class="audio-wrap"><div class="mic">🎙️</div><audio id="message-media" controls preload="metadata" src="${src}"></audio></div>`;

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Cache-Control', 'public, max-age=300');
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, max-age=86400, stale-while-revalidate=604800',
  );

  return response.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Stand With Crypto</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#6c11ff">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:video" content="${src}">
<meta property="og:video:secure_url" content="${src}">
<meta property="og:video:type" content="${mediaType}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<script>
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
</script>
<script defer src="/_vercel/insights/script.js"></script>
<style>
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap');
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#fff;color:#020817;font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .banner{background:#6c11ff;color:#fff;text-align:center;padding:12px 20px;font-weight:700;font-size:15px;}
  .wrap{max-width:720px;width:100%;box-sizing:border-box;flex:1;margin:0 auto;padding:28px 24px 60px;}
  .brand{display:flex;align-items:center;gap:12px;font-weight:900;font-size:18px;margin-bottom:28px;}
  h1{font-size:26px;letter-spacing:-.4px;margin:0 0 8px;}
  p.sub{color:#64748b;font-size:15px;margin:0 0 22px;}
  video{width:100%;max-height:75vh;object-fit:contain;border-radius:20px;background:#0b0d17;border:1px solid #e2e9f3;}
  .audio-wrap{background:#f9fafc;border:1px solid #e2e9f3;border-radius:20px;padding:36px 24px;text-align:center;}
  .audio-wrap .mic{font-size:44px;margin-bottom:16px;}
  .audio-wrap audio{width:100%;}
  a.cta{display:inline-flex;margin-top:26px;background:#6c11ff;color:#fff;text-decoration:none;border-radius:1000px;padding:15px 32px;font-weight:700;font-size:15.5px;}
  a.cta:hover{background:#923dfe;}
  .swc-footer{margin-top:auto;border-top:1px solid #e2e9f3;background:#f9fafc;}
  .swc-footer-inner{max-width:1376px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:20px 40px;align-items:center;}
  .swc-footer-brand{display:flex;align-items:center;gap:11px;color:#020817;text-decoration:none;font-size:18px;font-weight:900;width:max-content;}
  .swc-footer-brand img{width:30px;height:30px;display:block;}
  .swc-footer-copy{color:#64748b;font-size:13.5px;line-height:1.55;margin:8px 0 0;max-width:590px;}
  .swc-footer-links{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 24px;}
  .swc-footer-links a{color:#020817;text-decoration:none;font-size:13.5px;font-weight:700;}
  .swc-footer-links a:hover{text-decoration:underline;text-underline-offset:3px;}
  .swc-footer-bottom{grid-column:1/-1;border-top:1px solid #e2e9f3;padding-top:18px;color:#64748b;font-size:12.5px;}
  @media(max-width:720px){.swc-footer-inner{grid-template-columns:1fr;padding:28px 24px}.swc-footer-links{justify-content:flex-start}.swc-footer-bottom{grid-column:auto}}
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

<footer class="swc-footer" aria-label="Stand With Crypto footer">
  <div class="swc-footer-inner">
    <div>
      <a class="swc-footer-brand" href="https://www.standwithcrypto.org/" target="_blank" rel="noopener noreferrer">
        <img src="/shield.svg" alt="" aria-hidden="true">
        <span>Stand With Crypto</span>
      </a>
      <p class="swc-footer-copy">Stand With Crypto is a nonprofit advocating for clear, common-sense crypto regulations.</p>
    </div>
    <nav class="swc-footer-links" aria-label="Legal links">
      <a href="https://www.standwithcrypto.org/terms-of-service" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
      <a href="https://www.standwithcrypto.org/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
    </nav>
    <div class="swc-footer-bottom">Stand With Crypto © All rights reserved 2026</div>
  </div>
</footer>
<script>
(function () {
  var media = document.getElementById('message-media');
  var played = false;
  if (media) {
    media.addEventListener('play', function () {
      if (played) return;
      played = true;
      window.va('event', { name: 'Watch Playback Started', data: { mode: '${mode}' } });
    });
  }

  var cta = document.querySelector('.cta');
  if (cta) {
    cta.addEventListener('click', function () {
      window.va('event', { name: 'Watch CTA Clicked', data: { mode: '${mode}' } });
    });
  }
})();
</script>
</body>
</html>`);
};
