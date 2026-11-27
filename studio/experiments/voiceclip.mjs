#!/usr/bin/env node
/**
 * voiceclip.mjs — Round 5: spoken line, lip-synced, with sound design.
 *
 * Pipeline:
 *   1. voice.py         piper neural TTS + espeak word/phoneme timing -> WAV + JSON
 *   2. this file        drives the character's mouth from the phoneme timeline
 *   3. ffmpeg           muxes the video with the voice + ambience bed
 *
 * The mouth is driven by VISEMES keyed on IPA, not by amplitude. Amplitude
 * lip-flap looks like a fish; the phoneme stream is what makes an "m" close the
 * lips and an "o" round them.
 *
 * Timing honesty: word onsets come from espeak, scaled per sentence to the
 * piper audio length. Phonemes within a word are distributed evenly across the
 * word. This is a proportional estimate, not forced alignment — the JSON this
 * script writes says so, and the report repeats it.
 *
 *   node experiments/voiceclip.mjs "line to speak" [outname]
 */
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderScene, makeCamera, lowPolyPost } from '../src/lowpoly.mjs';
import { createFigure, figureScene, phonemeToViseme, EXPRESSION_PRESETS } from '../src/character3d.mjs';
import { poseIdle, cameraShake, blinkAt, cameraMove, ease } from '../src/animation.mjs';
import { gradeFrame, fitFov } from '../src/cinema.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';

const OUT = 'out';
const FPS = 30;
const IW = 480, IH = 853;
const W = 1080, H = 1920;

const TEXT = process.argv[2] || 'Every night the last train leaves without me. I stopped counting the ones I missed.';
const NAME = process.argv[3] || 'exp5-voice';

/* ------------------------------------------------------------------- voice */

await ensureFonts();
fs.mkdirSync(OUT, { recursive: true });

console.log('synthesising speech...');
const py = spawnSync('python3', ['voice.py', JSON.stringify({ text: TEXT, out: `${OUT}/${NAME}.wav` })], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (py.status !== 0) {
  console.error(py.stderr?.slice(-2000) || 'voice.py failed');
  process.exit(1);
}
const voice = JSON.parse(py.stdout);
console.log(`  ${voice.duration}s, ${voice.words.length} words, ${voice.rate} Hz`);

/* --------------------------------------------------------------- the scene */

const LIGHT = {
  key: { dir: (() => { const d = [0.42, 0.58, 0.70]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [1.0, 0.95, 0.88], intensity: 1.05 },
  sky: [0.28, 0.32, 0.46],
  ground: [0.10, 0.10, 0.14],
  fog: { colour: [0.07, 0.085, 0.135], density: 0.018 },
  exposure: 0.94,
};
const RIM = [{ pos: [-1.4, 1.9, -1.9], colour: [0.55, 0.72, 1.0], intensity: 1.6, radius: 3.0 }];

/**
 * Build a phoneme timeline from the word list: each phoneme gets an equal slice
 * of its word's duration. Returns [{t0, t1, viseme}].
 */
function phonemeTimeline(words) {
  const out = [];
  for (const w of words) {
    const ph = w.phonemes && w.phonemes.length ? w.phonemes : ['ə'];
    const slice = w.dur / ph.length;
    ph.forEach((p, i) => {
      out.push({ t0: w.t + i * slice, t1: w.t + (i + 1) * slice, ipa: p, viseme: phonemeToViseme(p) });
    });
  }
  return out;
}

const timeline = phonemeTimeline(voice.words);
const visemeAt = (t) => {
  // linear search is fine: a line has tens of phonemes
  for (const e of timeline) if (t >= e.t0 && t < e.t1) return e.viseme;
  return { mouthOpen: 0 };
};

/** Co-articulation: blend the current viseme toward the next, so the mouth is
 *  already moving before the sound arrives. Without this the jaw snaps between
 *  shapes and reads as a puppet. */
function blendedViseme(t, lead = 0.045) {
  const cur = visemeAt(t);
  const nxt = visemeAt(t + lead);
  const k = 0.30;
  const mix = {};
  for (const key of ['mouthOpen', 'mouthWide', 'mouthCurve']) {
    const a = cur[key] ?? 0, b = nxt[key] ?? 0;
    mix[key] = a + (b - a) * k;
  }
  return mix;
}

const backdrop = (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e1626');
  g.addColorStop(0.45, '#22304a');
  g.addColorStop(0.78, '#2b3852');
  g.addColorStop(1, '#0b101a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = ctx.createRadialGradient(w * 0.70, h * 0.26, 0, w * 0.70, h * 0.26, w);
  r.addColorStop(0, 'rgba(140,170,225,0.18)');
  r.addColorStop(1, 'rgba(140,170,225,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
};

const DUR = Math.max(voice.duration + 0.9, 2.0);
const FRAMES = Math.ceil(DUR * FPS);

const camA = { eye: [0.62, 1.56, 1.28], target: [0, 1.40, 0], fov: 34 };
const camB = { eye: [0.30, 1.58, 1.05], target: [0, 1.42, 0], fov: 32 };

const dir = `${OUT}/.${NAME}-frames`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const big = createCanvas(W, H);
const gb = big.getContext('2d');

const t0 = performance.now();
for (let i = 0; i < FRAMES; i++) {
  const t = i / FPS;
  const fig = createFigure();
  poseIdle(fig, t, { energy: 0.8 });

  // speech: the mouth follows the phonemes during the line, then rests
  const speaking = t < voice.duration;
  if (speaking) {
    const vism = blendedViseme(t);
    fig.state.expr.mouthOpen = 0.05 + vism.mouthOpen * 0.85;
    fig.state.expr.mouthWide = vism.mouthWide;
    fig.state.expr.mouthCurve = 0.10;
  } else {
    fig.state.expr.mouthOpen = 0.02;
  }
  // a faint brow life so the face is not a mask
  const browLife = Math.sin(t * 1.9) * 0.10 + (speaking ? 0.12 : 0);
  fig.state.expr.browRaise = browLife;
  fig.state.blink = blinkAt(t + 0.4, 5);
  fig.state.look = [Math.sin(t * 0.5) * 0.18, 0.04];

  // head moves slightly with the voice, and small handheld drift
  const sh = cameraShake(t, 0.28, { freq: 5, seed: 2 });
  const m = cameraMove(camA, camB, (Math.sin((t / DUR) * Math.PI) + 1) / 2, { easeFn: ease.inOutQuad });

  fig.skeleton.solve([0, 0, 0]);
  const pts = [[0, 1.30, 0.22], [0, 1.60, 0.20], [0, 1.04, 0], [0, 1.72, -0.05]];
  const fov = fitFov(makeCamera, {
    eye: m.eye, target: m.target, points: pts, width: IW, height: IH, margin: 0.12,
  });
  const cam = makeCamera({
    eye: [m.eye[0] + sh.x, m.eye[1] + sh.y, m.eye[2] + sh.z],
    target: m.target, fovDeg: fov, width: IW, height: IH, roll: sh.roll,
  });

  const scene = figureScene(fig);
  const c = createCanvas(IW, IH);
  const g = c.getContext('2d');
  backdrop(g, IW, IH);
  renderScene(g, scene, cam, {
    width: IW, height: IH, snap: 1, overdraw: 1.06,
    shade: { ...LIGHT, points: RIM },
  });
  lowPolyPost(g, IW, IH, { levels: 40, vignette: 0.24, grain: 0, seed: 3 });

  gb.imageSmoothingEnabled = true;
  gb.drawImage(c, 0, 0, W, H);
  gradeFrame(gb, W, H, {
    dof: { focusY: 0.34, range: 0.26, strength: 0.45, maxBlur: 8 },
    bloomOpts: { threshold: 0.80, strength: 0.18, radius: 24 },
    grainOpts: { amount: 0.045, seed: i },
    ca: 0.9, vignette: 0.32,
  });

  // subtitle, from the same word timings the mouth uses
  const word = voice.words.find((w, k) => t >= w.t && (k + 1 >= voice.words.length || t < voice.words[k + 1].t));
  const line = voice.words.map((w) => w.word).join(' ');
  if (speaking) {
    gb.save();
    gb.textAlign = 'center';
    const k = W / 360;
    gb.font = `500 ${Math.round(19 * k)}px "DejaVu Sans", sans-serif`;
    // wrap to two lines if needed
    const words = line.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (gb.measureText(test).width > W * 0.82) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    const y0 = H * 0.80;
    lines.forEach((l, idx) => {
      const y = y0 + idx * 34 * k;
      const tw = gb.measureText(l).width;
      gb.fillStyle = 'rgba(6,8,14,0.55)';
      gb.fillRect(W / 2 - tw / 2 - 12 * k, y - 22 * k, tw + 24 * k, 30 * k);
      gb.fillStyle = word ? 'rgba(226,236,255,0.92)' : 'rgba(226,236,255,0.6)';
      gb.fillText(l, W / 2, y);
    });
    gb.restore();
  }
  fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, await big.encode('png'));
}
const msPerFrame = (performance.now() - t0) / FRAMES;

/* ------------------------------------------------------- ambience + mixdown */

// A quiet room-tone bed under the voice, synthesised, so the line is not dry.
const bed = `${OUT}/.${NAME}-bed.wav`;
{
  const rate = 22050;
  const n = Math.floor(DUR * rate);
  const buf = Buffer.alloc(44 + n * 2);
  const samples = new Int16Array(n);
  let lp = 0, lp2 = 0, s = 0x1234567;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const white = ((s >>> 0) / 4294967296) * 2 - 1;
    lp += (white - lp) * 0.02; lp2 += (lp - lp2) * 0.05;
    const t = i / rate;
    const env = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.1);
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(lp2 * 6.0 * env * 0.16 * 32767)));
  }
  buf.fill(0);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(bed, buf);
}

const audioOut = `${OUT}/${NAME}-mix.mp3`;
await new Promise((res, rej) => {
  const p = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-i', `${OUT}/${NAME}.wav`, '-i', bed,
    '-filter_complex', '[1:a]volume=1.0[bed];[0:a]volume=1.0[voc];[bed][voc]amix=inputs=2:duration=longest:weights=0.35 1.0,alimiter=limit=0.95',
    '-c:a', 'libmp3lame', '-b:a', '192k', audioOut,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-800)))));
});

const videoOut = `${OUT}/${NAME}.mp4`;
await new Promise((res, rej) => {
  const p = spawn(FFMPEG, [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`,
    '-i', audioOut,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', videoOut,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-800)))));
});

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(bed, { force: true });

const report = {
  text: TEXT,
  audio: `${OUT}/${NAME}.wav`,
  mix: audioOut,
  video: videoOut,
  duration: voice.duration,
  frames: FRAMES,
  fps: FPS,
  msPerFrame: Math.round(msPerFrame),
  words: voice.words.length,
  phonemes: timeline.length,
  alignment: voice.alignment,
  timingPerSentence: voice.timing_per_sentence,
};
fs.writeFileSync(`${OUT}/${NAME}.json`, JSON.stringify({ ...report, timeline }, null, 1));

console.log(`\nvoice       ${voice.duration.toFixed(2)} s, ${voice.words.length} words, ${timeline.length} phonemes`);
console.log(`render      ${FRAMES} frames, ${Math.round(msPerFrame)} ms/frame`);
console.log(`alignment   ${voice.alignment} (${voice.timing_per_sentence.join(', ')})`);
console.log(`wrote       ${videoOut}`);
console.log(`            ${audioOut}`);
