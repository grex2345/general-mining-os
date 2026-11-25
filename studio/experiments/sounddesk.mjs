#!/usr/bin/env node
/**
 * sounddesk.mjs — Round 4, experiment 2: sound design from first principles.
 *
 * There is no sample library here and no network access to one, so every sound
 * is synthesised: noise shaping for wind and footsteps, additive sines for a
 * distant train horn, a filtered sweep for a whoosh. The point is not to rival
 * a library — it is to establish that the pipeline can produce a timed,
 * mixed, measured soundtrack with zero external assets.
 *
 * Outputs:
 *   out/exp-sound.wav        16-bit 44.1k stereo master
 *   out/exp-sound.mp3        320k mp3
 *   out/exp-sound-wave.png   waveform + spectrogram, as visual evidence
 *   out/exp-sound.json       measurements (peak, RMS, per-cue onsets)
 *
 *   node experiments/sounddesk.mjs
 *
 * Honesty note: nothing here listens to the result. Every claim in the report is
 * a number in exp-sound.json, not an opinion about how it sounds.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { rng } from '../src/cartoon.mjs';
import { FFMPEG } from '../src/env.mjs';

const RATE = 44100;
const DUR = 6.0;
const N = Math.floor(RATE * DUR);
const OUT = 'out';

/* ------------------------------------------------------------ a tiny mixer */

const L = new Float32Array(N);
const R = new Float32Array(N);

function place(samples, atSec, { gain = 1, pan = 0 } = {}) {
  const off = Math.floor(atSec * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < samples.length; i++) {
    const j = off + i;
    if (j < 0 || j >= N) continue;
    L[j] += samples[i] * gl;
    R[j] += samples[i] * gr;
  }
}

/** One-pole low-pass, returns a filter closure. */
const lp1 = (k) => { let y = 0; return (x) => { y += (x - y) * k; return y; }; };
/** One-pole high-pass built from a low-pass. */
const hp1 = (k) => { const lp = lp1(k); return (x) => x - lp(x); };

/* ----------------------------------------------------------------- sources */

/** Wind bed: two cascaded low-passes on white noise, with slow gusting. */
function wind(sec, seed = 4) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  const a = lp1(0.012), b = lp1(0.05);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = r() * 2 - 1;
    const gust = 0.55 + 0.45 * Math.sin(t * 0.73) * Math.sin(t * 0.21 + 1.1);
    out[i] = b(a(white)) * 9.0 * gust;
  }
  return out;
}

/** Footstep in snow: a short noise burst, fast decay, low-passed body. */
function crunch(seed = 1, { len = 0.16, tone = 0.5 } = {}) {
  const n = Math.floor(len * RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  const lp = lp1(0.11 + r() * 0.10);
  const hp = hp1(0.02);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // two-stage envelope: an instant transient, then a short grainy decay
    const env = Math.exp(-t * 7.5) * (0.6 + 0.4 * Math.exp(-t * 42));
    const grain = 0.6 + 0.4 * Math.sin(i * 0.09 + seed);
    out[i] = hp(lp(r() * 2 - 1)) * env * grain * tone * 4.0;
  }
  return out;
}

/** Distant train horn: two detuned sines a fifth apart, slow swell, vibrato. */
function horn(sec = 1.7, base = 196) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const p = i / n;
    // swell in, hold, tail off
    const env = Math.min(1, p * 9) * Math.min(1, (1 - p) * 2.6);
    const vib = 1 + Math.sin(t * 5.1) * 0.004 + Math.sin(t * 1.7) * 0.002;
    const s = Math.sin(2 * Math.PI * base * vib * t) * 0.6
            + Math.sin(2 * Math.PI * base * 1.26 * vib * t) * 0.32
            + Math.sin(2 * Math.PI * base * 1.5 * vib * t) * 0.22
            + Math.sin(2 * Math.PI * base * 2.0 * vib * t) * 0.08;
    out[i] = s * env;
  }
  return out;
}

/** Whoosh: white noise through a low-pass whose corner sweeps up then down. */
function whoosh(sec = 0.75, seed = 9) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const k = 0.006 + 0.30 * Math.sin(Math.PI * p) ** 2;
    y += ((r() * 2 - 1) - y) * k;
    out[i] = y * Math.sin(Math.PI * p) ** 1.6 * 2.2;
  }
  return out;
}

/** A soft snow-settle tick: two short high sine pips, panned. */
function tick(freq = 2100, sec = 0.05) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    out[i] = Math.sin(2 * Math.PI * freq * (i / RATE)) * Math.exp(-p * 9) * 0.35;
  }
  return out;
}

/* ------------------------------------------------------------------- score */

// The cue sheet is the deliverable: picture events, to the frame it sets.
const CUES = [
  { name: 'wind bed',        at: 0.00, src: () => wind(DUR),             gain: 0.16, pan: 0.00 },
  { name: 'whoosh in',       at: 0.00, src: () => whoosh(0.85, 9),       gain: 0.34, pan: -0.25 },
  { name: 'step 1',          at: 0.55, src: () => crunch(1, { tone: 0.8 }), gain: 0.55, pan: -0.30 },
  { name: 'step 2',          at: 0.98, src: () => crunch(2, { tone: 0.7 }), gain: 0.48, pan: -0.15 },
  { name: 'horn swell',      at: 1.60, src: () => horn(2.3, 174),        gain: 0.46, pan: 0.35 },
  { name: 'step 3',          at: 2.05, src: () => crunch(3, { tone: 0.6 }), gain: 0.42, pan: 0.10 },
  { name: 'step 4',          at: 2.55, src: () => crunch(4, { tone: 0.55 }), gain: 0.40, pan: 0.25 },
  { name: 'snow settle',     at: 3.30, src: () => tick(2300),            gain: 0.30, pan: 0.55 },
  { name: 'snow settle 2',   at: 3.62, src: () => tick(1750),            gain: 0.24, pan: -0.45 },
  { name: 'final whoosh',    at: 5.10, src: () => whoosh(0.9, 21),       gain: 0.30, pan: 0.30 },
];

const onsets = [];
let position = 0;
for (const cue of CUES) {
  const samples = cue.src();
  place(samples, cue.at, { gain: cue.gain, pan: cue.pan });
  onsets.push({ name: cue.name, at: cue.at, gain: cue.gain, pan: cue.pan, seconds: +(samples.length / RATE).toFixed(3) });
  position = Math.max(position, cue.at + samples.length / RATE);
}

/* ------------------------------------------------------------------- master */

// normalise to -1.5 dBFS, then measure honestly
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const target = 10 ** (-1.5 / 20);
const g = peak > 0 ? target / peak : 1;

let sumSq = 0, clipped = 0;
for (let i = 0; i < N; i++) {
  L[i] *= g; R[i] *= g;
  if (Math.abs(L[i]) > 0.999 || Math.abs(R[i]) > 0.999) clipped++;
  sumSq += L[i] * L[i] + R[i] * R[i];
}
const rms = Math.sqrt(sumSq / (N * 2));
const peakDb = 20 * Math.log10(Math.max(1e-9, peak * g));
const rmsDb = 20 * Math.log10(Math.max(1e-9, rms));

// DC offset: a mixer bug that shows up as a dull thud in the sub
let dcL = 0;
for (let i = 0; i < N; i++) dcL += L[i];
dcL /= N;

/* -------------------------------------------------------------------- write */

function wav(left, right, rate) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/exp-sound.wav`, wav(L, R, RATE));

const run = (args) => new Promise((res, rej) => {
  const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-600)))));
});

await run(['-y', '-loglevel', 'error', '-i', `${OUT}/exp-sound.wav`, '-b:a', '320k', `${OUT}/exp-sound.mp3`]);
await run(['-y', '-loglevel', 'error', '-i', `${OUT}/exp-sound.wav`,
  '-filter_complex', '[0:a]showwavespic=s=1080x260:colors=#8fd8ff[w];[0:a]showspectrumpic=s=1080x360:legend=0:color=intensity[s];[w]scale=1080:260[w2];[s]scale=1080:360[s2];[w2][s2]vstack=inputs=2',
  '-frames:v', '1', `${OUT}/exp-sound-wave.png`]);

/* Band energy, so the report can state what is in the mix instead of guessing.
 * One-pole filters are crude but they separate "low rumble", "body" and "air". */
function bandEnergy(sig, lo, hi) {
  const lpHi = lo > 0 ? lp1(1 - Math.exp(-2 * Math.PI * hi / RATE)) : null;
  const lpLo = lp1(1 - Math.exp(-2 * Math.PI * lo / RATE));
  let e = 0;
  for (let i = 0; i < sig.length; i++) {
    const v = lpHi ? lpHi(sig[i]) : sig[i];
    const band = v - lpLo(sig[i]);
    e += band * band;
  }
  return Math.sqrt(e / sig.length);
}
const bands = {
  low_lt200: +bandEnergy(L, 0, 200).toFixed(5),
  mid_200_2000: +bandEnergy(L, 200, 2000).toFixed(5),
  high_gt2000: +bandEnergy(L, 2000, 16000).toFixed(5),
};
// per-second RMS, the pacing of the mix
const perSecond = [];
for (let s2 = 0; s2 < Math.floor(DUR); s2++) {
  let e = 0;
  for (let i = s2 * RATE; i < Math.min(N, (s2 + 1) * RATE); i++) e += L[i] * L[i];
  perSecond.push(+(20 * Math.log10(Math.sqrt(e / RATE) || 1e-9)).toFixed(1));
}

const report = {
  rate: RATE, seconds: DUR, channels: 2, cues: CUES.length,
  peakDb: +peakDb.toFixed(2), rmsDb: +rmsDb.toFixed(2),
  crestDb: +(peakDb - rmsDb).toFixed(2),
  dcOffset: +dcL.toExponential(2), clippedSamples: clipped,
  contentEndsAt: +position.toFixed(2),
  bands, perSecondDb: perSecond,
  onsets,
};
fs.writeFileSync(`${OUT}/exp-sound.json`, JSON.stringify(report, null, 2));

console.log(`cues             ${report.cues}`);
console.log(`peak             ${report.peakDb} dBFS`);
console.log(`rms              ${report.rmsDb} dBFS   crest ${report.crestDb} dB`);
console.log(`dc offset        ${report.dcOffset}      clipped ${clipped}`);
console.log(`content ends     ${report.contentEndsAt}s of ${DUR}s`);
console.log(`bands            low ${bands.low_lt200}  mid ${bands.mid_200_2000}  high ${bands.high_gt2000}`);
console.log(`rms per second   ${perSecond.join('  ')}`);
console.log('wrote out/exp-sound.{wav,mp3,json} + exp-sound-wave.png');
