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
    : `<div class="vm-stage" id="vm-stage" role="button" tabindex="0" aria-label="Play answering-machine message">
        <video id="vm-video" muted playsinline preload="auto" src="/assets/main.mp4"></video>
        <video id="vm-loop" muted playsinline preload="auto" loop src="/assets/unit.mp4" style="display:none"></video>
        <div class="vm-overlay" id="vm-overlay">
          <div class="vm-btn" id="vm-btn">▶</div>
          <span id="vm-label">Play the answering-machine message</span>
        </div>
        <div class="vm-badge">CONSTITUENT VOICEMAIL</div>
      </div>
      <audio id="message-media" class="vm-audio" preload="auto" src="${src}"></audio>
      <audio id="vm-intro" preload="auto" src="/assets/intro.m4a"></audio>
      <div class="audio-fallback" id="audio-fallback" hidden>
        <p>Play the constituent's audio message:</p>
        <audio id="fallback-media" controls preload="metadata" src="${src}"></audio>
      </div>`;

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
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
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
  html{margin:0;padding:0;width:100%;overflow-x:hidden;}
  body{margin:0;padding:0;width:100%;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;overflow-x:hidden;background:#fff;color:#020817;font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .banner{width:100vw;box-sizing:border-box;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);background:#6c11ff;color:#fff;text-align:center;padding:12px 20px;font-weight:700;font-size:15px;}
  .wrap{max-width:720px;width:100%;box-sizing:border-box;flex:1;margin:0 auto;padding:28px 24px 60px;}
  .brand{display:flex;align-items:center;gap:12px;font-weight:900;font-size:18px;margin-bottom:28px;}
  h1{font-size:26px;letter-spacing:-.4px;margin:0 0 8px;}
  p.sub{color:#64748b;font-size:15px;margin:0 0 22px;}
  video{width:100%;max-height:75vh;object-fit:contain;border-radius:20px;background:#0b0d17;border:1px solid #e2e9f3;}
  .vm-stage{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:20px;background:#0b0d17;border:1px solid #e2e9f3;cursor:pointer;outline:none;}
  .vm-stage:focus-visible{box-shadow:0 0 0 4px #e2d0ff;border-color:#6c11ff;}
  .vm-stage video{width:100%;height:100%;max-height:none;object-fit:cover;border:0;border-radius:0;background:#0b0d17;display:block;}
  .vm-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,8,23,.42);z-index:3;color:#fff;text-align:center;padding:20px;}
  .vm-overlay.loading .vm-btn{animation:vmSpin 1s linear infinite;font-size:22px;}
  .vm-btn{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:#6c11ff;color:#fff;font-size:28px;box-shadow:0 10px 30px rgba(2,8,23,.32);}
  .vm-overlay span{font-size:15px;font-weight:700;text-shadow:0 1px 7px rgba(0,0,0,.75);}
  .vm-badge{position:absolute;left:14px;top:14px;z-index:2;padding:7px 11px;border-radius:1000px;background:rgba(2,8,23,.66);color:#fff;font-size:11px;font-weight:900;letter-spacing:.7px;}
  .vm-audio,#vm-intro{display:none;}
  .audio-fallback{background:#f9fafc;border:1px solid #e2e9f3;border-radius:20px;padding:26px 22px;}
  .audio-fallback p{margin:0 0 12px;color:#64748b;font-size:14px;}
  .audio-fallback audio{width:100%;}
  @keyframes vmSpin{to{transform:rotate(360deg);}}
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

  /* Mobile watch-page polish */
  a.cta,.vm-stage,video{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  a.cta:focus-visible,.vm-stage:focus-visible,video:focus-visible{outline:3px solid #e2d0ff;outline-offset:3px;}
  @media(max-width:600px){
    .banner{
      padding:10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left));
      font-size:13px; line-height:1.35;
    }
    .wrap{
      padding:20px max(16px, env(safe-area-inset-right)) calc(42px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    }
    .brand{gap:10px; font-size:16.5px; margin-bottom:20px;}
    .brand svg{width:27px; height:27px;}
    h1{font-size:24px; line-height:1.16; letter-spacing:-.35px; margin-bottom:8px;}
    p.sub{font-size:14.5px; line-height:1.5; margin-bottom:18px;}
    video{max-height:66svh; border-radius:16px;}
    .vm-stage{border-radius:16px;}
    .vm-btn{width:64px; height:64px; font-size:25px;}
    .vm-overlay{gap:10px; padding:16px;}
    .vm-overlay span{font-size:13.5px; line-height:1.4;}
    .vm-badge{left:10px; top:10px; padding:6px 9px; font-size:9.5px;}
    .audio-fallback{padding:20px 16px; border-radius:16px;}
    a.cta{
      display:flex; width:100%; min-height:52px; box-sizing:border-box;
      align-items:center; justify-content:center; margin-top:20px; padding:13px 18px;
      border-radius:1000px; text-align:center; font-size:15px;
    }
    .swc-footer-inner{
      padding:26px max(18px, env(safe-area-inset-right)) calc(26px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
      gap:18px;
    }
    .swc-footer-links{gap:10px 20px;}
  }
  @media(max-width:360px){
    .wrap{padding-left:max(12px, env(safe-area-inset-left));padding-right:max(12px, env(safe-area-inset-right));}
    h1{font-size:22px;}
  }
  @media(max-width:900px) and (orientation:landscape){
    video{max-height:72svh;}
    .wrap{padding-top:16px;}
  }
  @media(prefers-reduced-motion:reduce){
    *{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;}
  }
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
  var mode = '${mode}';
  var media = document.getElementById('message-media');
  var played = false;

  function trackPlayback() {
    if (played) return;
    played = true;
    window.va('event', { name: 'Watch Playback Started', data: { mode: mode } });
  }

  if (mode === 'video' && media) {
    media.addEventListener('play', trackPlayback);
  }

  if (mode === 'audio') {
    var stage = document.getElementById('vm-stage');
    var video = document.getElementById('vm-video');
    var loopVideo = document.getElementById('vm-loop');
    var intro = document.getElementById('vm-intro');
    var overlay = document.getElementById('vm-overlay');
    var button = document.getElementById('vm-btn');
    var label = document.getElementById('vm-label');
    var fallback = document.getElementById('audio-fallback');
    var playing = false;
    var userAudioStarted = false;
    var keepAliveTimer = null;

    function ready(element) {
      if (element.readyState >= 3) return Promise.resolve();
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          cleanup();
          reject(new Error('media load timeout'));
        }, 15000);
        function cleanup() {
          clearTimeout(timer);
          element.removeEventListener('canplaythrough', onReady);
          element.removeEventListener('error', onError);
        }
        function onReady() { cleanup(); resolve(); }
        function onError() { cleanup(); reject(new Error('media failed to load')); }
        element.addEventListener('canplaythrough', onReady, { once: true });
        element.addEventListener('error', onError, { once: true });
      });
    }

    function stopKeepAlive() {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    }

    function startKeepAlive() {
      stopKeepAlive();
      keepAliveTimer = setInterval(function () {
        if (!playing) return;

        // Some mobile browsers pause hidden audio/video when the background clip
        // changes. Resume either element without restarting the message.
        if (userAudioStarted && media && !media.ended && media.paused) {
          media.play().catch(showFallback);
        }

        var activeVideo = loopVideo.style.display === 'none' ? video : loopVideo;
        if (activeVideo && activeVideo.paused && !activeVideo.ended) {
          activeVideo.play().catch(function (error) {
            console.warn('background video resume failed', error);
          });
        }
      }, 750);
    }

    function resetPlayer() {
      playing = false;
      userAudioStarted = false;
      stopKeepAlive();
      try { video.pause(); video.currentTime = 0; } catch (error) {}
      try { loopVideo.pause(); loopVideo.currentTime = 0; } catch (error) {}
      try { intro.pause(); intro.currentTime = 0; } catch (error) {}
      try { media.pause(); media.currentTime = 0; } catch (error) {}
      video.onended = null;
      intro.onended = null;
      media.onended = null;
      video.style.display = 'block';
      loopVideo.style.display = 'none';
      overlay.style.display = 'flex';
      overlay.classList.remove('loading');
      button.textContent = '▶';
      label.textContent = 'Play the answering-machine message';
    }

    function showFallback(error) {
      console.error('answering-machine playback failed', error);
      playing = false;
      userAudioStarted = false;
      stopKeepAlive();
      try { video.pause(); } catch (pauseError) {}
      try { loopVideo.pause(); } catch (pauseError) {}
      try { intro.pause(); } catch (pauseError) {}
      try { media.pause(); } catch (pauseError) {}
      stage.hidden = true;
      fallback.hidden = false;
    }

    async function playAnsweringMachine() {
      if (playing) {
        resetPlayer();
        return;
      }

      playing = true;
      userAudioStarted = false;
      overlay.classList.add('loading');
      button.textContent = '◌';
      label.textContent = 'Loading the answering-machine message…';

      try {
        video.currentTime = 0;
        loopVideo.currentTime = 0;
        intro.currentTime = 0;
        media.currentTime = 0;
        video.muted = true;
        loopVideo.muted = true;
        video.load();
        loopVideo.load();
        intro.load();
        media.load();

        await Promise.all([ready(video), ready(loopVideo), ready(intro), ready(media)]);
        if (!playing) return;

        // Prime the constituent audio during the original click. This preserves
        // permission to start it after the intro on Safari/iOS and Android.
        media.volume = 0;
        await media.play();
        media.pause();
        media.currentTime = 0;
        media.volume = 1;

        overlay.style.display = 'none';
        overlay.classList.remove('loading');
        trackPlayback();

        // Use a separate preloaded looping video rather than replacing the src
        // on the playing element. That prevents the user's audio from being
        // interrupted when the first background clip ends.
        video.onended = function () {
          if (!playing) return;
          video.onended = null;
          video.style.display = 'none';
          loopVideo.style.display = 'block';
          loopVideo.currentTime = 0;
          loopVideo.play().catch(showFallback);
        };

        intro.onended = function () {
          setTimeout(function () {
            if (!playing) return;
            media.play().then(function () {
              userAudioStarted = true;
              startKeepAlive();
            }).catch(showFallback);
          }, 300);
        };

        media.onended = function () {
          userAudioStarted = false;
          stopKeepAlive();
          setTimeout(function () {
            if (playing) resetPlayer();
          }, 1000);
        };

        await Promise.all([video.play(), intro.play()]);
      } catch (error) {
        showFallback(error);
      }
    }

    if (stage) {
      stage.addEventListener('click', playAnsweringMachine);
      stage.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          playAnsweringMachine();
        }
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && playing && userAudioStarted && media.paused && !media.ended) {
        media.play().catch(showFallback);
      }
    });

    var fallbackMedia = document.getElementById('fallback-media');
    if (fallbackMedia) fallbackMedia.addEventListener('play', trackPlayback);
  }

  var cta = document.querySelector('.cta');
  if (cta) {
    cta.addEventListener('click', function () {
      window.va('event', { name: 'Watch CTA Clicked', data: { mode: mode } });
    });
  }
})();
</script>
</body>
</html>`);
};
