/**
 * score.mjs — Round 7: a Japanese-flavored procedural score + battle SFX.
 * Additive to audio.mjs (which keeps the generic explainer bed). Deterministic.
 *
 * MASTER PROMPT sound rules honoured by the caller (finish script):
 *   music sits ~6 dB under the voice; SFX peaks <= 0.7x voice peak;
 *   music STOPS at the twist line and a low drone continues; a sting on the twist.
 *
 * Palette: hirajoshi pentatonic koto plucks, taiko drums, breathy shakuhachi-ish
 * pad, low drone. Sections are keyed to the shot-plan time so the music follows
 * the story (calm dawn -> training pulse -> night mystery -> twist stop -> resolve).
 */
export const SR = 48000;
const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const NOTE = (semi, base = 293.66) => base * Math.pow(2, semi / 12);   // D4 root
const HIRA = [0, 2, 3, 7, 8];                                          // hirajoshi
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

/** Plucked koto string: sharp attack, decaying partials. */
function pluck(out, s0, f, gain, dur = 1.4) {
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const e = env(t, 0.004, 0.32);
    const v = Math.sin(TAU * f * t) * 0.6 + Math.sin(TAU * f * 2 * t) * 0.22 + Math.sin(TAU * f * 3.01 * t) * 0.1;
    out[s0 + i] += v * e * gain;
  }
}

/** Taiko drum: low pitch sweep + noise attack. */
function taiko(out, s0, gain = 0.5) {
  const n = Math.floor(0.5 * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const f = 110 * Math.exp(-t * 9) + 52;
    const e = env(t, 0.002, 0.16);
    out[s0 + i] += (Math.sin(TAU * f * t) * 0.8 + (hash(i) * 2 - 1) * 0.25 * Math.exp(-t * 40)) * e * gain;
  }
}

/** Breathy pad (shakuhachi-ish): filtered saw + vibrato + breath noise. */
function pad(out, s0, f, dur, gain = 0.10) {
  const n = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t);
    const ph = TAU * f * vib * t;
    const saw = 2 * ((f * t) % 1) - 1;
    lp += (saw - lp) * 0.12;
    const e = env(t, 0.25, dur * 0.5) * (0.7 + 0.3 * Math.sin(TAU * 0.4 * t));
    out[s0 + i] += (lp * 0.5 + Math.sin(ph) * 0.3 + (hash(i * 0.7) * 2 - 1) * 0.05) * e * gain;
  }
}

/** Low drone for the night / twist. */
function drone(out, s0, dur, gain = 0.12, f = 55) {
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const e = env(t, 0.6, dur * 0.7);
    out[s0 + i] += (Math.sin(TAU * f * t) * 0.6 + Math.sin(TAU * f * 1.5 * t) * 0.25 + Math.sin(TAU * f * 0.5 * t) * 0.3) * e * gain;
  }
}

/**
 * sections: [{t0, t1, mood}] with mood in calm|pulse|action|mystery|twist|resolve.
 * The twist section drops the melodic music (only drone + a sting), per the prompt.
 */
export function synthesizeScore({ duration, sections, seed = 7 }) {
  const out = new Float32Array(Math.ceil(duration * SR));
  for (const sec of sections) {
    const { t0, t1, mood } = sec;
    const s0 = Math.floor(t0 * SR);
    const len = t1 - t0;
    if (mood === 'twist') {
      drone(out, s0, len, 0.16, 49);
      continue;                                   // music stops; drone continues
    }
    if (mood === 'mystery') {
      drone(out, s0, len, 0.10, 55);
      // sparse high plucks, minor colour
      for (let k = 0; k < Math.floor(len / 1.4); k++) {
        if (hash(seed + k * 3) > 0.55) continue;
        const deg = HIRA[Math.floor(hash(seed + k) * HIRA.length)];
        pluck(out, s0 + Math.floor((k * 1.4 + hash(k) * 0.3) * SR), NOTE(deg, 587.33), 0.10, 1.0);
      }
      continue;
    }
    if (mood === 'resolve' || mood === 'calm') {
      pad(out, s0, NOTE(0, 146.83), len, mood === 'resolve' ? 0.12 : 0.08);
      const step = mood === 'resolve' ? 0.7 : 1.0;
      for (let k = 0; k < Math.floor(len / step); k++) {
        const deg = HIRA[(k + seed) % HIRA.length];
        pluck(out, s0 + Math.floor(k * step * SR), NOTE(deg, 293.66), 0.14, 1.6);
        if (k % 4 === 2) pluck(out, s0 + Math.floor((k * step + 0.35) * SR), NOTE(deg + 7, 293.66), 0.08, 1.2);
      }
      if (mood === 'resolve') for (let k = 0; k < Math.floor(len / 1.6); k++) taiko(out, s0 + Math.floor(k * 1.6 * SR), 0.18);
      continue;
    }
    // pulse / action: koto ostinato + taiko pulse
    const bpm = mood === 'action' ? 132 : 96;
    const beat = 60 / bpm;
    for (let k = 0; k < Math.floor(len / (beat * 0.5)); k++) {
      const ts = k * beat * 0.5;
      const deg = HIRA[(k * 2 + seed) % HIRA.length];
      pluck(out, s0 + Math.floor(ts * SR), NOTE(deg, 293.66), mood === 'action' ? 0.16 : 0.12, 0.9);
      if (k % 2 === 0) taiko(out, s0 + Math.floor(ts * SR), mood === 'action' ? 0.4 : 0.22);
    }
    pad(out, s0, NOTE(0, 146.83), len, 0.06);
  }
  // gentle limiter + fades
  let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.9 ? 0.9 / peak : 1;
  const fi = SR * 0.5, fo = SR * 1.2;
  for (let i = 0; i < out.length; i++) {
    let v = out[i] * g;
    if (i < fi) v *= i / fi;
    if (i > out.length - fo) v *= Math.max(0, (out.length - i) / fo);
    out[i] = v;
  }
  return out;
}

/* ---------------------------------------------------------------- battle SFX */
export function battleSfx(kind, { gain = 1 } = {}) {
  const dur = { slash: 0.5, water: 1.2, growl: 1.0, roar: 1.6, sting: 1.2, crack: 0.7, rumble: 1.8, inhale: 0.9, steps: 0.4, ting: 0.8, wind: 2.0 }[kind] ?? 0.5;
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / dur;
    const white = hash(i * 1.37) * 2 - 1;
    lp += (white - lp) * 0.2; lp2 += (lp - lp2) * 0.2;
    switch (kind) {
      case 'slash': { // metallic swish: rising bandpass noise + ring
        const f = 1800 + 3000 * p;
        out[i] = (Math.sin(TAU * f * t) * 0.2 + lp * 0.5) * Math.sin(Math.PI * p) ** 1.5;
        break;
      }
      case 'water': out[i] = lp2 * 1.6 * Math.sin(Math.PI * p) * (0.6 + 0.4 * Math.sin(t * 8)); break;
      case 'growl': out[i] = (Math.sin(TAU * (70 + 20 * Math.sin(t * 9)) * t) * 0.5 + lp * 0.3) * env(t, 0.05, 0.4); break;
      case 'roar': out[i] = (Math.sin(TAU * (120 * (1 - p) + 60) * t) * 0.4 + lp2 * 1.2) * env(t, 0.03, 0.6) * (0.5 + p); break;
      case 'sting': out[i] = (Math.sin(TAU * 220 * t) * 0.4 + Math.sin(TAU * 233 * t) * 0.4 + lp * 0.3) * env(t, 0.005, 0.5); break;
      case 'crack': out[i] = (white * 0.6 * Math.exp(-t * 30) + Math.sin(TAU * 90 * t) * 0.5 * Math.exp(-t * 12)); break;
      case 'rumble': out[i] = lp2 * 2.0 * env(t, 0.1, 0.8); break;
      case 'inhale': out[i] = lp * 0.8 * Math.sin(Math.PI * p); break;
      case 'steps': out[i] = (white * 0.3 * Math.exp(-t * 50) + Math.sin(TAU * 120 * t) * 0.3 * Math.exp(-t * 30)); break;
      case 'ting': out[i] = (Math.sin(TAU * 1760 * t) * 0.4 + Math.sin(TAU * 2637 * t) * 0.2) * env(t, 0.002, 0.25); break;
      case 'wind': out[i] = lp2 * 1.4 * (0.5 + 0.5 * Math.sin(t * 0.9)); break;
    }
  }
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

export function mixInto(dest, src, atSample, gain = 1) {
  for (let i = 0; i < src.length; i++) {
    const j = atSample + i;
    if (j >= 0 && j < dest.length) dest[j] += src[i] * gain;
  }
}

export function writeWav(file, samples, sr = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  require_fs().writeFileSync(file, buf);
}
import fs from 'node:fs';
function require_fs() { return fs; }