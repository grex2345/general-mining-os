/**
 * score_world.mjs — Round 11: warm cinematic/acoustic score for story-driven films.
 * ADDITIVE to score.mjs (which keeps the Japanese battle palette). Deterministic.
 * Palette: warm plucked strings (oud/guitar-ish), soft frame drum, warm pad, wonder bells,
 * low drone. Major-pentatonic colour for an uplifting underdog fable. Sections follow the
 * narration beats so the music tells the story (dawn -> tense -> build -> night -> swell ->
 * wonder -> joy). Music is composed to sit UNDER narration (caller mixes ~-10 dB).
 */
export const SR = 48000;
const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const NOTE = (semi, base = 220) => base * Math.pow(2, semi / 12); // A3 root
const MAJ = [0, 2, 4, 7, 9]; // major pentatonic
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

function pluckWarm(out, s0, f, gain, dur = 1.6) {
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR, e = env(t, 0.006, 0.4);
    const v = Math.sin(TAU * f * t) * 0.55 + Math.sin(TAU * f * 2 * t) * 0.2 + Math.sin(TAU * f * 3.02 * t) * 0.08 + Math.sin(TAU * f * 0.5 * t) * 0.12;
    out[s0 + i] += v * e * gain;
  }
}
function bell(out, s0, f, gain, dur = 1.8) {
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR, e = env(t, 0.002, 0.5);
    const v = Math.sin(TAU * f * t) * 0.5 + Math.sin(TAU * f * 2.76 * t) * 0.22 + Math.sin(TAU * f * 5.4 * t) * 0.1;
    out[s0 + i] += v * e * gain;
  }
}
function frameDrum(out, s0, gain = 0.4, tone = 90) {
  const n = Math.floor(0.4 * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR, f = tone * Math.exp(-t * 8) + 48, e = env(t, 0.002, 0.13);
    out[s0 + i] += (Math.sin(TAU * f * t) * 0.8 + (hash(i) * 2 - 1) * 0.18 * Math.exp(-t * 45)) * e * gain;
  }
}
function padWarm(out, s0, f, dur, gain = 0.09) {
  const n = Math.floor(dur * SR); let lp = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR, vib = 1 + 0.005 * Math.sin(TAU * 4.8 * t), ph = TAU * f * vib * t;
    const saw = 2 * ((f * t) % 1) - 1; lp += (saw - lp) * 0.1;
    const e = env(t, 0.4, dur * 0.6) * (0.75 + 0.25 * Math.sin(TAU * 0.35 * t));
    out[s0 + i] += (lp * 0.45 + Math.sin(ph) * 0.3 + (hash(i * 0.7) * 2 - 1) * 0.03) * e * gain;
  }
}
function drone(out, s0, dur, gain = 0.1, f = 55) {
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR, e = env(t, 0.7, dur * 0.7);
    out[s0 + i] += (Math.sin(TAU * f * t) * 0.6 + Math.sin(TAU * f * 1.5 * t) * 0.22 + Math.sin(TAU * f * 0.5 * t) * 0.3) * e * gain;
  }
}

/** sections: [{t0,t1,mood}] mood in dawn|tense|build|night|swell|wonder|joy */
export function synthesizeWorldScore({ duration, sections, seed = 7 }) {
  const out = new Float32Array(Math.ceil(duration * SR));
  for (const sec of sections) {
    const { t0, t1, mood } = sec; const s0 = Math.floor(t0 * SR); const len = t1 - t0;
    if (mood === 'night') {
      drone(out, s0, len, 0.11, 55);
      for (let k = 0; k < Math.floor(len / 1.3); k++) { if (hash(seed + k * 3) > 0.6) continue; const deg = MAJ[Math.floor(hash(seed + k) * MAJ.length)]; pluckWarm(out, s0 + Math.floor((k * 1.3 + hash(k) * 0.3) * SR), NOTE(deg, 440), 0.09, 1.2); }
      continue;
    }
    if (mood === 'swell') {
      padWarm(out, s0, NOTE(0, 110), len, 0.12); drone(out, s0, len, 0.08, 55);
      const step = 0.5; for (let k = 0; k < Math.floor(len / step); k++) { const deg = MAJ[(k + seed) % MAJ.length]; pluckWarm(out, s0 + Math.floor(k * step * SR), NOTE(deg, 220), 0.1 + 0.06 * (k / (len / step)), 1.4); }
      continue;
    }
    if (mood === 'wonder') {
      padWarm(out, s0, NOTE(0, 110), len, 0.13); padWarm(out, s0, NOTE(7, 110), len, 0.08);
      for (let k = 0; k < Math.floor(len / 0.6); k++) { const deg = MAJ[(k * 2 + seed) % MAJ.length]; bell(out, s0 + Math.floor(k * 0.6 * SR), NOTE(deg, 880), 0.09, 1.6); }
      for (let k = 0; k < Math.floor(len / 1.0); k++) { const deg = MAJ[(k + seed) % MAJ.length]; pluckWarm(out, s0 + Math.floor(k * 1.0 * SR), NOTE(deg, 220), 0.12, 1.8); }
      continue;
    }
    if (mood === 'joy') {
      padWarm(out, s0, NOTE(0, 110), len, 0.12);
      const beat = 60 / 108; for (let k = 0; k < Math.floor(len / (beat * 0.5)); k++) { const ts = k * beat * 0.5, deg = MAJ[(k * 2 + seed) % MAJ.length]; pluckWarm(out, s0 + Math.floor(ts * SR), NOTE(deg, 220), 0.14, 1.2); if (k % 2 === 0) frameDrum(out, s0 + Math.floor(ts * SR), 0.3); if (k % 4 === 2) bell(out, s0 + Math.floor(ts * SR), NOTE(deg + 12, 440), 0.06, 1.0); }
      continue;
    }
    if (mood === 'tense') {
      padWarm(out, s0, NOTE(0, 110), len, 0.07); drone(out, s0, len, 0.06, 49);
      for (let k = 0; k < Math.floor(len / 1.6); k++) { const deg = [0, 2, 3, 7][Math.floor(hash(seed + k) * 4)]; pluckWarm(out, s0 + Math.floor(k * 1.6 * SR), NOTE(deg, 220), 0.08, 1.4); }
      continue;
    }
    if (mood === 'build') {
      const beat = 60 / 96; for (let k = 0; k < Math.floor(len / (beat * 0.5)); k++) { const ts = k * beat * 0.5, deg = MAJ[(k * 2 + seed) % MAJ.length]; pluckWarm(out, s0 + Math.floor(ts * SR), NOTE(deg, 220), 0.12, 1.0); if (k % 2 === 0) frameDrum(out, s0 + Math.floor(ts * SR), 0.24); }
      padWarm(out, s0, NOTE(0, 110), len, 0.06);
      continue;
    }
    // dawn (default): gentle warm establishing
    padWarm(out, s0, NOTE(0, 110), len, 0.09);
    for (let k = 0; k < Math.floor(len / 1.1); k++) { const deg = MAJ[(k + seed) % MAJ.length]; pluckWarm(out, s0 + Math.floor(k * 1.1 * SR), NOTE(deg, 220), 0.12, 1.8); if (k % 4 === 2) pluckWarm(out, s0 + Math.floor((k * 1.1 + 0.4) * SR), NOTE(deg + 7, 220), 0.07, 1.4); }
  }
  let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.9 ? 0.9 / peak : 1; const fi = SR * 0.6, fo = SR * 1.6;
  for (let i = 0; i < out.length; i++) { let v = out[i] * g; if (i < fi) v *= i / fi; if (i > out.length - fo) v *= Math.max(0, (out.length - i) / fo); out[i] = v; }
  return out;
}
