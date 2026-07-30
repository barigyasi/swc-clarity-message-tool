const { put } = require('@vercel/blob');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const run = promisify(execFile);
const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,48}$/;
const MAX_INPUT_BYTES = 80 * 1024 * 1024;

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string' && request.body) return JSON.parse(request.body);
  return {};
}

function parseVideoUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('invalid video url');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
    !url.pathname.startsWith('/submissions/') ||
    !/\.(webm|mp4)$/i.test(url.pathname)
  ) {
    throw new Error('invalid video url');
  }

  url.search = '';
  url.hash = '';
  return url.href;
}

async function downloadWithRetry(url, destination) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > MAX_INPUT_BYTES) throw new Error('video is too large');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error('video download was empty');
      if (bytes.length > MAX_INPUT_BYTES) throw new Error('video is too large');
      fs.writeFileSync(destination, bytes);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  throw lastError || new Error('video download failed');
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'POST only' });
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'swc-video-'));
  const inputPath = path.join(tempDirectory, 'input');
  const outputPath = path.join(tempDirectory, 'output.mp4');

  try {
    const body = parseBody(request);
    const shareId = String(body.shareId || '');
    if (!SHARE_ID_RE.test(shareId)) {
      return response.status(400).json({ error: 'invalid share id' });
    }

    const videoUrl = parseVideoUrl(body.videoUrl);
    await downloadWithRetry(videoUrl, inputPath);

    // Generate fresh timestamps and a constant-frame-rate H.264/AAC MP4. tpad
    // clones the final video frame only if the source video track ends before
    // its audio track; -shortest then ends the output at the real audio ending.
    await run(ffmpegPath, [
      '-y',
      '-fflags', '+genpts',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', 'fps=24,tpad=stop_mode=clone:stop_duration=65,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '48000',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-shortest',
      outputPath,
    ], { maxBuffer: 32 * 1024 * 1024 });

    const output = fs.readFileSync(outputPath);
    if (!output.length) throw new Error('video optimization produced no output');

    const blob = await put(`submissions/normalized-${shareId}.mp4`, output, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });

    return response.status(200).json({
      mediaUrl: blob.url,
      downloadUrl: blob.downloadUrl || `${blob.url}?download=1`,
    });
  } catch (error) {
    console.error('video normalization failed', error);
    return response.status(500).json({ error: 'video optimization failed' });
  } finally {
    try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch {}
  }
};
