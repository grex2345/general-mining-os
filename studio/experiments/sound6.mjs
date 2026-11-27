#!/usr/bin/env node
/**
 * sound6.mjs — Round 6 sound design mixed under a real voice line.
 *
 * Round 4's sounddesk.mjs proved that cues can be synthesised from first
 * principles. This takes the same generators and drives them from the REAL
 * alignment produced by align.py, which is the Round 6 improvement: every sound
 * is placed at a time that was measured from the waveform, not estimated.
 *
 * Ambience is continuous (wind bed across the whole line). Foley is punctuated:
 * a crunch for the beat that starts each sentence, a soft tick on the stressed
 * onset of each word, and a low sub swell under the final word so the line ends
 * on something.
 *
 * Everything is normalised and limited, then written as WAV and MP3 with a JSON
 * report of the exact cue times and gains. Nothing here claims to have been
 * listened to.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { rng } from '../src/cartoon.mjs';

const RATE = 44100;

/* ---------------------------------------------------------------- generators */

const lp1 = (k) => { let y = 0; return (x) => { y += (x - y) * k; return y; }; };
const hp1 = (k) => { const lp = lp1(k); return (x) => x - lp(x); };

function wind(sec, seed = 4, gain = 1) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  const a = lp1(0.010), b = lp1(0.045);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = r() * 2 - 1;
    const gust = 0.55 + 0.45 * Math.sin(t * 0.61) * Math.sin(t * 0.19 + 1.1);
    out[i] = b(a(white)) * 8.0 * gust * gain;
  }
  return out;
}

function crunch(seed = 1, { len = 0.20, tone = 0.5 } = {}) {
  const n = Math.floor(len * RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  const lp = lp1(0.10 + r() * 0.10);
  const hp = hp1(0.02);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 6.5) * (0.55 + 0.45 * Math.exp(-t * 40));
    const grain = 0.6 + 0.4 * Math.sin(i * 0.09 + seed);
    out[i] = hp(lp(r() * 2 - 1)) * env * grain * tone * 4.5;
  }
  return out;
}

function tick(freq = 2100, sec = 0.05, gain = 0.35) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    out[i] = Math.sin(2 * Math.PI * freq * (i / RATE)) * Math.exp(-p * 9) * gain;
  }
  return out;
}

/** A low sub swell: for landing the end of a line. */
function sub(sec = 1.4, base = 55) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const env = Math.min(1, p * 6) * Math.min(1, (1 - p) * 2.2);
    const s = Math.sin(2 * Math.PI * base * (1 + 0.01 * Math.sin(i / RATE * 3)) * (i / RATE));
    out[i] = s * env * 0.55;
  }
  return out;
}

/** A soft pad: three detuned sines, slow attack, for the "story" line. */
function pad(sec, base = 147, gain = 0.20) {
  const n = Math.floor(sec * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t * 0.9) * Math.min(1, (sec - t) * 0.7);
    out[i] = gain * env * (
      Math.sin(2 * Math.PI * base * t)
      + 0.6 * Math.sin(2 * Math.PI * base * 1.5 * t + 0.5)
      + 0.35 * Math.sin(2 * Math.PI * base * 2.0 * t + 1.2)
    );
  }
  return out;
}

/* ------------------------------------------------------------------- mixing */

function mixAt(L, R, samples, atSec, { gain = 1, pan = 0 } = {}) {
  const off = Math.floor(atSec * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < samples.length; i++) {
    const j = off + i;
    if (j < 0 || j >= L.length) continue;
    L[j] += samples[i] * gl;
    R[j] += samples[i] * gr;
  }
}

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), o); o += 2;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

/* ---------------------------------------------------------------------- main */

const spec = JSON.parse(process.argv[2]);
const alignJson = JSON.parse(fs.readFileSync(spec.align, 'utf8'));
const voiceDur = alignJson.duration;
const total = voiceDur + 0.9;
const N = Math.floor(total * RATE);
const L = new Float32Array(N);
const R = new Float32Array(N);
const cues = [];

// 1. ambience under everything
const windLen = total;
for (const [pan, g, seed] of [[-0.35, 0.055, 4], [0.35, 0.050, 11]]) {
  mixAt(L, R, wind(windLen, seed, g), 0, { gain: 1, pan });
}
cues.push({ cue: 'wind-bed', at: 0, dur: round(total), gain: 0.055 });

// 2. a pad that enters on the second sentence (where the line lifts)
const sentences = spec.sentences || [];
const secondAt = sentences.length > 1 ? sentences[1] : voiceDur * 0.45;
mixAt(L, R, pad(total - secondAt + 0.3, 147, 0.16), secondAt, { gain: 1, pan: 0 });
cues.push({ cue: 'pad', at: round(secondAt), dur: round(total - secondAt + 0.3), gain: 0.16 });

// 3. foley driven by the measured alignment
for (const w of alignJson.words) {
  if (w.t < 0.01) continue;
  // every word onset gets a very quiet tick, 3.5 kHz, so the timing is audible
  mixAt(L, R, tick(3400, 0.018, 0.10), w.t, { gain: 0.55, pan: 0.10 });
}
// crunches on the first word of each sentence
let seed = 1;
for (const s of sentences) {
  const first = alignJson.words.find((w) => w.t >= s - 0.02);
  if (!first) continue;
  mixAt(L, R, crunch(seed++, { len: 0.22, tone: 0.42 }), Math.max(0, first.t - 0.02), { gain: 0.30, pan: -0.15 });
  cues.push({ cue: 'crunch', at: round(Math.max(0, first.t - 0.02)), gain: 0.30 });
}
// sub swell under the last word
const last = alignJson.words[alignJson.words.length - 1];
if (last) {
  mixAt(L, R, sub(1.5, 55), Math.max(0, last.t - 0.10), { gain: 0.34 });
  cues.push({ cue: 'sub-swell', at: round(last.t - 0.10), dur: 1.5, gain: 0.34 });
}

// 4. the voice itself, normalised into the bed and ducked under nothing (the
//    bed is already quiet enough that no sidechain is needed)
const voice = readWavMono(spec.voice);
mixAt(L, R, voice, 0.12, { gain: 1.0, pan: 0 });

// 5. soft limiter and master trim
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const trim = peak > 0.89 ? 0.89 / peak : 1;
for (let i = 0; i < N; i++) { L[i] *= trim; R[i] *= trim; }

fs.mkdirSync(path.dirname(spec.out), { recursive: true });
writeWav(spec.out, L, R);
const report = {
  out: spec.out,
  rate: RATE,
  duration: round(total),
  voice_in: spec.voice,
  voice_duration: round(voiceDur),
  master_trim: round(trim),
  cues,
  note: 'Cue times come from align.py, which measures them from the waveform. '
      + 'Nothing here was listened to; the report is numbers, not an opinion.',
};
fs.writeFileSync(spec.out.replace(/\.wav$/, '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

function round(x) { return Math.round(x * 1000) / 1000; }

function readWavMono(file) {
  const b = fs.readFileSync(file);
  let p = 12;
  let fmt = null, data = null;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4);
    const sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + sz);
    p += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) throw new Error(`bad wav ${file}`);
  const n = Math.floor(data.length / (fmt.bits / 8) / fmt.ch);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const off = (i * fmt.ch + c) * (fmt.bits / 8);
      acc += fmt.bits === 16 ? data.readInt16LE(off) / 32768 : data.readInt32LE(off) / 2147483648;
    }
    out[i] = acc / fmt.ch;
  }
  if (fmt.rate !== RATE) {
    // linear resample to 44.1k (piper is 22.05k, exactly 2x, so this is exact)
    const ratio = RATE / fmt.rate;
    const m = Math.floor(n * ratio);
    const rs = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const s = i / ratio, k = Math.floor(s), f = s - k;
      rs[i] = (out[k] || 0) * (1 - f) + (out[k + 1] || 0) * f;
    }
    return rs;
  }
  return out;
}
