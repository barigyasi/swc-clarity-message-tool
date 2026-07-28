const { put } = require('@vercel/blob');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const run = promisify(execFile);
const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;

// Timing constants measured from the source b-roll (see repo assets/).
const INTRO_END = 4.07;
const GAP = 0.3;
const OUTRO = 1.0;
const MAIN_LEN = 5.922;
const UNIT_LEN = 3.003;
const MAX_TOTAL_SECONDS = 60;
const MAX_MSG_SECONDS = MAX_TOTAL_SECONDS - INTRO_END - GAP - OUTRO;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url, dest, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 750);
    }
  }
  throw lastError || new Error('fetch failed');
}

function normalizeStoreId(value) {
  const storeId = String(value || '').trim();
  return storeId.startsWith('store_') ? storeId.slice('store_'.length) : storeId;
}

async function ffmpegDuration(file) {
  // ffmpeg exits 1 when no output is given; the Duration line is on stderr either way.
  try {
    await run(ffmpegPath, ['-i', file]);
  } catch (error) {
    const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(error.stderr || '');
    if (match) return (+match[1]) * 3600 + (+match[2]) * 60 + (+match[3]);
  }
  throw new Error('could not read duration');
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

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST only' });
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const audioUrl = String(body.audioUrl || '');
  const suppliedShareId = String(body.shareId || '');
  const shareId = SHARE_ID_RE.test(suppliedShareId)
    ? suppliedShareId
    : crypto.randomBytes(12).toString('base64url');

  let url;
  try {
    url = new URL(audioUrl);
  } catch {
    return response.status(400).json({ error: 'bad url' });
  }

  const storeId = normalizeStoreId(process.env.BLOB_STORE_ID);
  const expectedHostname = storeId
    ? `${storeId}.public.blob.vercel-storage.com`
    : '';

  if (
    !expectedHostname ||
    url.protocol !== 'https:' ||
    url.hostname !== expectedHostname ||
    !url.pathname.startsWith('/submissions/') ||
    !/\.(webm|m4a|mp4|ogg)$/i.test(url.pathname)
  ) {
    return response.status(400).json({ error: 'bad url' });
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swc-'));
  const file = (name) => path.join(tmp, name);

  try {
    const assetBase = `${getBaseUrl(request)}/assets/`;
    await Promise.all([
      download(audioUrl, file('msg-in')),
      download(assetBase + 'main.mp4', file('main.mp4')),
      download(assetBase + 'unit.mp4', file('unit.mp4')),
      download(assetBase + 'intro.m4a', file('intro.m4a')),
    ]);

    // Normalize to WAV first. MediaRecorder WebM often lacks a duration header.
    await run(ffmpegPath, [
      '-y', '-i', file('msg-in'), '-ac', '2', '-ar', '48000', file('msg.wav'),
    ]);

    const msgDur = await ffmpegDuration(file('msg.wav'));
    if (msgDur > MAX_MSG_SECONDS + 0.25) {
      return response.status(400).json({
        error: `message too long; maximum is ${Math.floor(MAX_MSG_SECONDS)} seconds`,
      });
    }

    const total = (INTRO_END + GAP + msgDur + OUTRO).toFixed(3);
    const plays = Math.max(1, Math.ceil((total - MAIN_LEN) / UNIT_LEN));

    await run(ffmpegPath, [
      '-y',
      '-i', file('main.mp4'),
      '-stream_loop', String(plays - 1), '-i', file('unit.mp4'),
      '-i', file('intro.m4a'),
      '-i', file('msg.wav'),
      '-f', 'lavfi', '-t', String(GAP), '-i', 'anullsrc=r=48000:cl=stereo',
      '-filter_complex',
      `[0:v][1:v]concat=n=2:v=1:a=0,trim=0:${total},setpts=PTS-STARTPTS[vout];` +
      `[2:a]atrim=0:${INTRO_END},asetpts=PTS-STARTPTS[aintro];` +
      `[3:a]highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,` +
      `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[amsg];` +
      `[aintro][4:a][amsg]concat=n=3:v=0:a=1,apad,atrim=0:${total}[aout]`,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      file('out.mp4'),
    ], { maxBuffer: 32 * 1024 * 1024 });

    const stamp = Date.now();
    const blob = await put(
      `submissions/composite-${stamp}.mp4`,
      fs.readFileSync(file('out.mp4')),
      {
        access: 'public',
        contentType: 'video/mp4',
        addRandomSuffix: true,
        cacheControlMaxAge: 31536000,
      },
    );

    const shareRecord = {
      shareId,
      mode: 'video',
      mediaUrl: blob.url,
      createdAt: new Date().toISOString(),
      source: 'voice-composite',
    };

    await put(`shares/${shareId}.json`, JSON.stringify(shareRecord), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });

    const host = getBaseUrl(request);
    return response.status(200).json({
      shareId,
      compositeUrl: blob.url,
      downloadUrl: blob.downloadUrl || `${blob.url}?download=1`,
      watchUrl: `${host}/watch/${shareId}`,
      duration: Number(total),
    });
  } catch (error) {
    console.error('composite failed', error);
    return response.status(500).json({ error: error instanceof Error ? error.message : 'composite failed' });
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
};
