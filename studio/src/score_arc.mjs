// score_arc.mjs — Round 13: music that follows the emotional arc.
//
// The measured reference behaviour (19 Ricks Clips videos): ONE continuous,
// light bed that is never silent (silent only ~5% of the time), shifting mood at
// the story's turns, sitting ~20 dB under the voice. Round 11's score changed
// mood per section but had no continuous bed and no intensity curve.
//
// This module: emotion->mood mapping, a continuous pad underneath everything,
// an intensity envelope from the direction plan, stingers on reveals, and the
// director's silence plan honoured as a real dip.

import { synthesizeWorldScore, SR } from './score_world.mjs';
import { RECIPES, rng, pan, reverb } from './foley.mjs';

const EMO_TO_MOOD = {
  neutral: 'dawn', warm: 'dawn', mystery: 'night', tension: 'tense',
  sadness: 'night', surprise: 'swell', excitement: 'joy', comedy: 'build',
  reveal: 'wonder', resolve: 'joy',
};

/** Build music sections from the assembled beats (global times). */
export function sectionsFromBeats(beats, duration) {
  const secs = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const t0 = i === 0 ? 0 : b.t0;
    const t1 = i === beats.length - 1 ? duration : beats[i + 1].t0;
    if (t1 - t0 < 0.2) continue;
    secs.push({ t0: +t0.toFixed(3), t1: +t1.toFixed(3), mood: EMO_TO_MOOD[b.emotion] || 'dawn', emotion: b.emotion, intensity: b.intensity, beatId: b.id });
  }
  // merge adjacent identical moods so the score doesn't re-trigger every beat
  const merged = [];
  for (const s of secs) {
    const last = merged[merged.length - 1];
    if (last && last.mood === s.mood) { last.t1 = s.t1; last.intensity = Math.max(last.intensity, s.intensity); last.beatIds.push(s.beatId); }
    else merged.push({ ...s, beatIds: [s.beatId] });
  }
  return merged;
}

/** A continuous low pad so the bed is NEVER silent. */
function continuousBed(n, sr, seed = 3) {
  const y = new Float32Array(n);
  const r = rng(seed);
  const f0 = 55, fifth = 82.5;
  let p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
  for (let i = 0; i < n; i++) {
    const u = i / sr;
    p1 += 2 * Math.PI * f0 / sr; p2 += 2 * Math.PI * fifth / sr; p3 += 2 * Math.PI * (f0 * 2.005) / sr;
    const breathe = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.055 * u);
    y[i] = (Math.sin(p1) * 0.5 + Math.sin(p2) * 0.24 + Math.sin(p3) * 0.12) * breathe * 0.09;
  }
  return y;
}

/** Smooth intensity envelope from the arc (linear ramps between beat centres). */
function intensityEnvelope(n, sr, beats, duration) {
  const env = new Float32Array(n).fill(0.6);
  const pts = beats.map((b) => ({ t: (b.t0 + b.t1) / 2, v: 0.42 + 0.58 * b.intensity }));
  if (!pts.length) return env;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (t <= pts[0].t) { env[i] = pts[0].v; continue; }
    if (t >= pts[pts.length - 1].t) { env[i] = pts[pts.length - 1].v; continue; }
    let k = 0; while (k < pts.length - 2 && t > pts[k + 1].t) k++;
    const a = pts[k], b = pts[k + 1];
    const u = (t - a.t) / Math.max(0.01, b.t - a.t);
    const s = u * u * (3 - 2 * u);
    env[i] = a.v + (b.v - a.v) * s;
  }
  return env;
}

/**
 * Build the arc score. Returns { L, R, sr, sections, stingers, report }.
 */
export function buildArcScore(beats, duration, opts = {}) {
  const { seed = 17, silenceBeforeReveal = 0.35, revealDipDb = -9, widen = 0.22 } = opts;
  const sr = SR, n = Math.ceil(duration * sr);
  const sections = sectionsFromBeats(beats, duration);
  const body = synthesizeWorldScore({ duration, sections: sections.map((s) => ({ t0: s.t0, t1: s.t1, mood: s.mood })), seed });
  const bed = continuousBed(n, sr, seed + 5);
  const env = intensityEnvelope(n, sr, beats, duration);

  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (body[i] ?? 0) * env[i] + (bed[i] ?? 0);

  // ---- stingers on reveals / surprises (the reference uses chimes on "aha") --
  const stingers = [];
  for (const b of beats) {
    if (!['reveal', 'surprise', 'excitement'].includes(b.emotion)) continue;
    if (b.intensity < 0.7) continue;
    stingers.push({ t: +(b.t0 + 0.04).toFixed(3), beatId: b.id, emotion: b.emotion, kind: b.emotion === 'excitement' ? 'bell' : 'chime' });
  }
  const r = rng(seed + 99);
  for (const st of stingers) {
    const base = st.kind === 'bell' ? 523 : 880;
    const x = RECIPES[st.kind](sr, r, { base, dur: st.kind === 'bell' ? 2.4 : 1.6 });
    const off = Math.round(st.t * sr);
    for (let i = 0; i < x.length; i++) { const j = off + i; if (j < n) mono[j] += x[i] * 0.16; }
  }

  // ---- honour the director's silence plan: dip right before the payoff ------
  let dip = null;
  const revIdx = beats.findIndex((b) => b.emotion === 'reveal' && b.intensity >= 0.7);
  if (revIdx > 0) {
    const rev = beats[revIdx];
    const a = Math.max(0, rev.t0 - silenceBeforeReveal), z = rev.t0;
    dip = { t0: +a.toFixed(3), t1: +z.toFixed(3), gainDb: revealDipDb };
    const g = Math.pow(10, revealDipDb / 20);
    for (let i = Math.round(a * sr); i < Math.min(n, Math.round(z * sr)); i++) {
      const u = (i / sr - a) / Math.max(0.01, z - a);
      mono[i] *= 1 + (g - 1) * Math.sin(Math.PI * u) ** 0.6;   // dip in and back out
    }
  }

  // gentle fade in/out; the bed itself never stops mid-film
  const fi = Math.round(0.8 * sr), fo = Math.round(1.6 * sr);
  for (let i = 0; i < n; i++) {
    if (i < fi) mono[i] *= i / fi;
    if (i > n - fo) mono[i] *= Math.max(0, (n - i) / fo);
  }

  // stereo: a touch of reverb + decorrelated widening (music sits wide, voice centre)
  const rv = reverb(mono, sr, { room: 0.6, wet: 0.18, width: 0.8 });
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = mono[i] * (1 - widen * 0.5) + rv.L[i] + mono[i] * widen * 0.12;
    R[i] = mono[i] * (1 - widen * 0.5) + rv.R[i] - mono[i] * widen * 0.12;
  }
  // normalise to a sane peak; bus gain is applied at mix time
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  if (pk > 0.85) { const g = 0.85 / pk; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }

  // bed-continuity check: fraction of the film where music is effectively silent
  const win = Math.round(0.1 * sr); let silent = 0, frames = 0;
  for (let i = 0; i + win <= n; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += L[i + j] * L[i + j];
    frames++; if (10 * Math.log10(s / win + 1e-12) < -55) silent++;
  }
  return {
    L, R, sr, sections, stingers, dip,
    report: {
      sections: sections.length, stingers: stingers.length,
      bedSilentFrac: +(silent / Math.max(1, frames)).toFixed(3),
      referenceBedSilentFrac: 0.05,
      note: 'continuous pad guarantees the bed never stops; dips are intentional',
    },
  };
}
