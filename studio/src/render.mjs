// Renderer A: "native" engine — Skia canvas frames streamed into ffmpeg.
//
// Parallelised by segment (one ffmpeg process per worker, each encoding a
// contiguous range of frames), then losslessly concatenated. Segments are
// frame-exact because every frame is a pure function of (scene, t).

import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FFMPEG, FFPROBE, OUT_DIR, CACHE_DIR, ensureFonts, assertToolchain } from './env.mjs';
import { palette, drawProgressBar, drawGrain } from './design.mjs';
import { timeline, totalDuration } from './ir.mjs';
import { renderScene, drawCaptions } from './engines.mjs';
import { buildAudio, frameToSample, writeWav, synthesizeSfx } from './audio.mjs';

export function ffmpegAvailable() {
  try { assertToolchain(); return true; } catch { return false; }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let out = '', err = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr?.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(Object.assign(
      new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-800)}`), { code, stderr: err },
    ))));
  });
}

export const probe = async (file) => {
  const { out } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  return JSON.parse(out);
};

/** Draw one full frame (scene + global furniture) at absolute frame index. */
export function drawFrame(ctx, ir, tl, frameIndex, { brand } = {}) {
  const fps = tl.fps;
  const tAbs = frameIndex / fps;
  let scene = tl.scenes[tl.scenes.length - 1];
  let sceneIdx = tl.scenes.length - 1;
  for (let i = 0; i < tl.scenes.length; i++) {
    const s = tl.scenes[i];
    if (frameIndex >= s.startFrame && frameIndex <= s.endFrame) { scene = s; sceneIdx = i; break; }
  }
  const t = tAbs - scene.start;
  const W = ir.format.width, H = ir.format.height, pal = palette(ir);
  const info = {
    W, H, pal,
    brand: brand || ir.meta?.brand || 'GENERAL MINING OS',
    index: scene.index ?? (sceneIdx + 1),
    total: tl.scenes.length,
    filmProgress: (frameIndex + 1) / tl.totalFrames,
    frame: frameIndex,
  };

  const paint = (sc, localT, idx) => {
    info.index = sc.index ?? (idx + 1);
    renderScene(ctx, sc, localT, info);
  };

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Cross-dissolve at scene seams.
  //
  // Order matters: the outgoing scene is painted first at full opacity, then the
  // incoming scene is painted ON TOP with alpha ramping 0 -> 1. Painting the
  // outgoing scene on top (the obvious-looking way) means the first frames of
  // every scene still show the previous scene, i.e. every cut lands ~0.2s late --
  // which is exactly what put list content under the outro's caption.
  //
  // A fade from black was the earlier approach; it put a black frame on screen at
  // t=0 and would have made the YouTube feed thumbnail a black rectangle.
  const FADE_FRAMES = 6;
  const intoScene = frameIndex - scene.startFrame;
  const inFade = sceneIdx > 0 && intoScene >= 0 && intoScene < FADE_FRAMES;
  if (inFade) {
    const prev = tl.scenes[sceneIdx - 1];
    paint(prev, Math.max(0, prev.duration - 1 / fps), sceneIdx - 1);
    ctx.save();
    ctx.globalAlpha = intoScene / FADE_FRAMES;
    paint(scene, t, sceneIdx);
    ctx.restore();
  } else {
    paint(scene, t, sceneIdx);
  }

  // burned-in captions (toggle with ir.captions?.burn === false)
  if (ir.captions?.burn !== false && tl.captionCues) {
    const cue = tl.captionCues.find((c) => tAbs >= c.start && tAbs < c.end);
    if (cue) drawCaptions(ctx, cue, tAbs, info);
  }

  // grain + progress furniture on top of everything
  drawGrain(ctx, W, H, pal, frameIndex, { count: 420, alpha: 0.075 });
  drawProgressBar(ctx, W, H, pal, info.filmProgress);
  ctx.restore();
  return { scene };
}

/**
 * Render a range of frames into one mp4 segment.
 * Frames are piped as raw RGBA into ffmpeg.
 */
export async function renderSegment(ir, tl, fromFrame, toFrame, outFile, { brand, log } = {}) {
  const { width: W, height: H } = ir.format;
  const fps = tl.fps;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ensureFonts();

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', String(fps * 2),
    '-movflags', '+faststart',
    outFile,
  ];
  const p = spawn(FFMPEG, args);
  const errBuf = [];
  p.stderr.on('data', (d) => errBuf.push(d));

  const done = new Promise((resolve, reject) => {
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg segment failed (${code}): ${Buffer.concat(errBuf).toString().slice(-600)}`))));
    p.on('error', reject);
  });

  for (let f = fromFrame; f <= toFrame; f++) {
    let buf;
    try {
      drawFrame(ctx, ir, tl, f, { brand });
      buf = canvas.data ? canvas.data() : Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    } catch (e) {
      // A frame that throws must fail the render immediately. Previously the
      // exception escaped this loop with ffmpeg still attached to the pipe, the
      // process hung, and the pipeline sat for 20 minutes instead of reporting
      // "Cannot access 'blockTop' before initialization".
      try { p.stdin.destroy(); p.kill('SIGKILL'); } catch {}
      throw new Error(`frame ${f} failed to draw: ${e.message}`);
    }
    const ok = p.stdin.write(buf);
    if (!ok) await new Promise((r) => p.stdin.once('drain', r));
    if (log && (f - fromFrame) % 60 === 0) log(`  frames ${f - fromFrame + 1}/${toFrame - fromFrame + 1}`);
  }
  p.stdin.end();
  await done;
  return outFile;
}

export async function renderNative(ir, tl, { outFile, workers = 0, brand, log = () => {} } = {}) {
  assertToolchain();
  // captions are derived from the IR narration, word-timed across each scene
  tl.captionCues = exportSRT(ir, tl).map((c) => {
    const mid = (c.start + c.end) / 2;
    const scene = tl.scenes.find((s) => mid >= s.start && mid < s.end);
    // display-type scenes already show this exact sentence
    const skip = !!scene && ['hook', 'quote'].includes(scene.kind);
    return { ...c, skip };
  });
  ensureFonts();
  const W = ir.format.width, H = ir.format.height;
  if (W % 2 || H % 2) throw new Error(`dimensions must be even for yuv420p (got ${W}x${H})`);
  const out = outFile || path.join(OUT_DIR, `${ir.id}.silent.mp4`);
  const workDir = path.join(CACHE_DIR, ir.id);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const nWorkers = workers > 0 ? workers : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 1.5)));
  const total = tl.totalFrames;
  const per = Math.ceil(total / nWorkers);
  const segs = [];
  for (let i = 0; i < nWorkers; i++) {
    const from = i * per;
    const to = Math.min(total - 1, (i + 1) * per - 1);
    if (from > to) break;
    segs.push({ from, to, file: path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`) });
  }
  log(`rendering ${total} frames @${tl.fps}fps ${W}x${H} in ${segs.length} segment(s)`);
  const t0 = Date.now();
  // a couple of workers is fastest on 2 vCPU; do them concurrently but bounded
  const running = [];
  const concurrency = Math.max(1, Math.min(segs.length, Math.max(2, Math.floor(os.cpus().length))));
  let idx = 0;
  await new Promise((resolve, reject) => {
    let active = 0;
    const next = () => {
      if (idx >= segs.length) { if (active === 0) resolve(); return; }
      const s = segs[idx++]; active++;
      renderSegment(ir, tl, s.from, s.to, s.file, { brand, log })
        .then(() => { active--; next(); })
        .catch(reject);
    };
    for (let i = 0; i < concurrency; i++) next();
  });
  const renderMs = Date.now() - t0;

  // concat losslessly
  const list = path.join(workDir, 'segments.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s.file}'`).join('\n'));
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  const info = await probe(out);
  return { file: out, frames: total, renderMs, workers: concurrency, width: W, height: H, fps: tl.fps, durationSec: Number(info.format.duration) };
}

/**
 * Full pipeline: silent video + generated audio bed + SFX -> final mp4,
 * plus an SRT sidecar and a poster frame.
 */
export async function finishVideo(ir, tl, silentFile, { outFile, audio, log = () => {} } = {}) {
  const out = outFile || path.join(OUT_DIR, `${ir.id}.mp4`);
  const audioPack = audio || buildAudio(ir, tl);
  const wavPath = path.join(CACHE_DIR, ir.id, 'mix.wav');
  writeWav(wavPath, audioPack.samples, audioPack.sampleRate);

  // Loudness: measure the mix, apply a PLAIN LINEAR GAIN, then verify and iterate.
  //
  // Why not loudnorm? ffmpeg's loudnorm is built for dynamic/film content and its
  // "linear" mode silently falls back to dynamic re-shaping when the required gain
  // would clip; measured here it moved a -20.9 LUFS mix to -19.1 instead of -14.
  // For narration + a quiet bed the correct tool is a straight gain plus a limiter,
  // with the result re-measured from the FILE and corrected until it is on target.
  const target = { I: -14, TP: -1.5 };
  let ceiling = 0.79; // -2.0 dBFS pre-encode; AAC adds inter-sample overshoot
  const mux = async (gainDb) => {
    await run(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', silentFile, '-i', wavPath,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${ceiling.toFixed(4)}:level=false`,
      '-shortest', '-movflags', '+faststart',
      out,
    ]);
  };

  const base = await measureLufs(wavPath);
  if (base && Number.isFinite(base.lufs) && base.lufs > -70) {
    let gain = target.I - base.lufs;
    await mux(gain);
    // Verify loudness AND true peak from the FINISHED file, because the AAC
    // encoder adds inter-sample overshoot that a pre-encode limiter cannot see.
    // Loudness is corrected with gain; peaks are corrected with the limiter
    // ceiling, so fixing one does not undo the other.
    for (let i = 0; i < 4; i++) {
      const got = await measureLufs(out);
      if (!got || !Number.isFinite(got.lufs)) break;
      const loudErr = target.I - got.lufs;
      const peakErr = got.tp - target.TP; // >0 means we are over the ceiling
      if (Math.abs(loudErr) <= 0.5 && peakErr <= 0.1) break;
      if (Math.abs(loudErr) > 0.5) gain += loudErr;
      if (peakErr > 0.1) ceiling *= Math.pow(10, -(peakErr + 0.15) / 20);
      await mux(gain);
      log(`  loudness pass ${i + 1}: ${got.lufs} LUFS / ${got.tp} dBTP -> gain ${gain.toFixed(2)}dB ceiling ${ceiling.toFixed(3)}`);
    }
  } else {
    await mux(0);
  }
  const finalLoud = await measureLufs(out);
  if (finalLoud) log(`  loudness: ${finalLoud.lufs} LUFS, ${finalLoud.tp} dBTP (target ${target.I} / ${target.TP})`);
  log(`final: ${out}`);
  return { file: out, wav: wavPath, audio: audioPack };
}

/** Integrated loudness of a finished file, or null. */
export async function measureLufs(file) {
  const r = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file,
    '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = r.err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { lufs: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra) };
  } catch { return null; }
}

/** Export captions as SRT (one cue per scene, split if long). */
export function exportSRT(ir, tl) {
  const cues = [];
  let n = 1;
  const per = ir.meta?.captionChunk || 7;
  for (const s of tl.scenes) {
    const text = s.narration || s.caption || s.title || '';
    if (!text.trim()) continue;
    // Chunk on pauses first (sentence, then clause), then by word budget.
    // Splitting a clause in the middle ("...to 1065." / "per petahash per day.")
    // is what makes captions feel machine-generated.
    // Split into clauses, then greedily pack clauses into chunks of <= `per` words.
    // A clause is never split unless it alone exceeds the budget.
    const clauses = (text.trim().match(/[^,;:]+[,;:]?/g) || [text.trim()]).map((c) => c.trim()).filter(Boolean);
    const chunks = [];
    let cur = [];
    const flush = () => { if (cur.length) { chunks.push(cur.join(' ')); cur = []; } };
    for (const clause of clauses) {
      const words = clause.split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      if (words.length > per) {
        flush();
        for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));
        continue;
      }
      if (cur.length + words.length > per) flush();
      cur.push(...words);
    }
    flush();
    const totalWords = chunks.reduce((a, c) => a + c.split(/\s+/).length, 0) || 1;
    let cursor = 0;
    for (const c of chunks) {
      const share = (c.split(/\s+/).length / totalWords) * s.duration;
      const start = s.start + cursor;
      const end = Math.min(s.end, start + share);
      cues.push({ n: n++, start, end, text: c });
      cursor += share;
    }
  }
  // Merge unreadably short cues (and orphaned 1-2 word tails) into a neighbour.
  // A cue on screen for 0.3s is worse than no cue: it reads as a glitch.
  const merged = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    const words = c.text.split(/\s+/).length;
    const tooShort = c.end - c.start < 0.8 || words <= 2;
    if (prev && tooShort && prev.text.split(/\s+/).length + words <= (ir.meta?.captionChunk || 7) + 3
        && Math.abs(prev.end - c.start) < 0.01) {
      prev.end = c.end;
      prev.text = `${prev.text} ${c.text}`;
    } else {
      merged.push({ ...c });
    }
  }
  merged.forEach((c, i) => { c.n = i + 1; });
  return merged;
}

export function srtString(cues) {
  const ts = (t) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return cues.map((c) => `${c.n}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

/** Render a single still frame to PNG (for QA / thumbnails). */
export async function still(ir, tl, frameIndex, outPng) {
  const { width: W, height: H } = ir.format;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ensureFonts();
  drawFrame(ctx, ir, tl, frameIndex, {});
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  fs.writeFileSync(outPng, canvas.toBuffer('image/png'));
  return outPng;
}

/** Contact sheet from the finished video (ffmpeg tile) — the QA artifact. */
export async function contactSheet(video, outJpg, { cols = 6, tileW = 270 } = {}) {
  const info = await probe(video);
  const H = Number(info.streams.find((s) => s.codec_type === 'video').height);
  const W = Number(info.streams.find((s) => s.codec_type === 'video').width);
  const dur = Number(info.format.duration);
  const rate = cols / dur;
  const th = Math.round((tileW * H) / W);
  await run(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `fps=${rate.toFixed(5)},scale=${tileW}:${th},tile=${cols}x1`,
    '-frames:v', '1', outJpg,
  ]);
  return outJpg;
}

export { run, frameToSample, synthesizeSfx };
