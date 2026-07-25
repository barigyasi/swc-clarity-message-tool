const { put } = require('@vercel/blob');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const run = promisify(execFile);

// timing constants measured from the source b-roll (see repo assets/)
const INTRO_END = 4.07;   // phrase + tone
const GAP = 0.3;          // beat between tone and message
const OUTRO = 1.0;        // tail after message ends
const MAIN_LEN = 5.922;   // full b-roll length
const UNIT_LEN = 3.003;   // ping-pong loop unit length
const MAX_MSG_SECONDS = 150;

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed: ' + r.status);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function ffmpegDuration(file) {
  // ffmpeg exits 1 when no output is given; the Duration line is on stderr either way
  try { await run(ffmpegPath, ['-i', file]); } catch (e) {
    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(e.stderr || '');
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  }
  throw new Error('could not read duration');
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST only' });
  const audioUrl = String((request.body && request.body.audioUrl) || '');

  let u;
  try { u = new URL(audioUrl); } catch (e) { return response.status(400).json({ error: 'bad url' }); }
  if (u.protocol !== 'https:' ||
      !u.hostname.endsWith('.public.blob.vercel-storage.com') ||
      !u.pathname.startsWith('/submissions/') ||
      !/\.(webm|m4a|mp4|ogg)$/i.test(u.pathname)) {
    return response.status(400).json({ error: 'bad url' });
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swc-'));
  const f = (n) => path.join(tmp, n);

  try {
    // fetch the recorded message and the b-roll assets (served statically by this deployment)
    const assetBase = 'https://' + (request.headers['x-forwarded-host'] || request.headers.host) + '/assets/';
    await Promise.all([
      download(audioUrl, f('msg-in')),
      download(assetBase + 'main.mp4', f('main.mp4')),
      download(assetBase + 'unit.mp4', f('unit.mp4')),
      download(assetBase + 'intro.m4a', f('intro.m4a')),
    ]);

    // normalize to wav first — MediaRecorder webm often lacks a duration header
    await run(ffmpegPath, ['-y', '-i', f('msg-in'), '-ac', '2', '-ar', '48000', f('msg.wav')]);
    const msgDur = await ffmpegDuration(f('msg.wav'));
    if (msgDur > MAX_MSG_SECONDS) return response.status(400).json({ error: 'message too long' });

    const total = (INTRO_END + GAP + msgDur + OUTRO).toFixed(3);
    const plays = Math.max(1, Math.ceil((total - MAIN_LEN) / UNIT_LEN));

    await run(ffmpegPath, [
      '-y',
      '-i', f('main.mp4'),
      '-stream_loop', String(plays - 1), '-i', f('unit.mp4'),
      '-i', f('intro.m4a'),
      '-i', f('msg.wav'),
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
      f('out.mp4'),
    ], { maxBuffer: 32 * 1024 * 1024 });

    const stamp = Date.now();
    const blob = await put(`submissions/composite-${stamp}.mp4`, fs.readFileSync(f('out.mp4')), {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });

    const host = 'https://' + (request.headers['x-forwarded-host'] || request.headers.host);
    return response.status(200).json({
      compositeUrl: blob.url,
      downloadUrl: blob.downloadUrl || blob.url + '?download=1',
      watchUrl: host + '/api/watch?m=video&v=' + encodeURIComponent(blob.url),
      duration: Number(total),
    });
  } catch (e) {
    console.error('composite failed', e);
    return response.status(500).json({ error: 'composite failed' });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
};
