// r15_direction.mjs — Round 15: push the voice direction FURTHER.
//
// The Round 13/14 film already uses the directed ("ON") take. What it never did was
// actually RENDER the emphasis the direction asks for: voicedir emits an `emphasis`
// word list per beat, and restructureTake ignores it — it only shapes whole beats.
// So the direction was half-applied.
//
// This pass adds, without touching the timing grid:
//   1. Per-word emphasis, finally rendered (the words the direction already names).
//   2. Wider emotional contrast between beats (gain + spectral tilt spread).
//   3. Pauses filled with matched room tone instead of digital silence, so a held
//      pause reads as a breath rather than dead air.
//   4. Deeper, more varied breaths at the same durations.
//
// TIMING IS LOCKED. Every beat keeps its exact original t0, so the Round 14 pictures,
// the burned captions and the lip-sync all stay valid and no re-render is needed.
// Slices, breath lengths and pause lengths are taken from the shipped report, not
// recomputed, which is what guarantees the grid.
import fs from 'node:fs';
import * as D from '../src/voicedir.mjs';
import * as VK from '../src/voicekit.mjs';
import * as P from '../src/prosody.mjs';
import { SR } from '../src/sfxkit.mjs';

const R13 = 'research/artifacts/round13', F = `${R13}/film`;
const OUT = 'research/artifacts/round15';
fs.mkdirSync(OUT, { recursive: true });

const script = fs.readFileSync(`${R13}/script.txt`, 'utf8');
const plan = D.direct(script, { keywords: ['Vellara', 'Nora', 'bell', 'tower', 'sixty', 'bronze', 'silent', 'stone', 'four', 'three', 'rang'], leadIn: 1.0 });
const shipped = JSON.parse(fs.readFileSync(`${F}/narration.report.json`, 'utf8'));
const oldBeats = JSON.parse(fs.readFileSync(`${F}/narration.beats.json`, 'utf8'));
const oldWords = JSON.parse(fs.readFileSync(`${F}/narration.words.json`, 'utf8'));

if (plan.beats.length !== shipped.beats.length) throw new Error('plan beat count drifted');
console.log(`plan: ${plan.beats.length} beats, reveal at ${plan.revealBeat}`);

// ---- load the same raw take, trimmed the same way -------------------------------
const take = VK.loadVoice(`${F}/narration-take.wav`, SR);
const tr = VK.trimEdges(take, SR, { thrDb: -58 });
console.log(`raw take trimmed to ${(tr.samples.length / SR).toFixed(3)}s`);

// ---- partition the shipped words back into their beats --------------------------
let wi = 0;
const beatWords = shipped.beats.map((b, i) => {
  const n = oldBeats[i].words;
  const slice = oldWords.slice(wi, wi + n); wi += n;
  return slice;
});
if (wi !== oldWords.length) throw new Error(`word partition mismatch ${wi} vs ${oldWords.length}`);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');

// ---- deterministic room tone: felt, not heard -----------------------------------
function roomTone(sec, seed) {
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  let s = seed * 9301 + 49297, lp = 0;
  const amp = Math.pow(10, -66 / 20);            // ~ -66 dBFS
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const white = (s / 233280) * 2 - 1;
    lp += (white - lp) * 0.20;                    // gentle lowpass, room-ish
    out[i] = lp * amp * 6;
  }
  const f = Math.min(Math.round(0.03 * SR), Math.floor(n / 2));
  for (let i = 0; i < f; i++) { const u = i / f; out[i] *= u; out[n - 1 - i] *= u; }
  return out;
}

// ---- per-word emphasis: a gentle lift with raised-cosine ramps ------------------
function emphasise(x, sr, words, t0, list, intensity) {
  if (!list?.length) return { out: x, hits: [] };
  const out = Float32Array.from(x);
  const want = new Set(list.map(norm));
  const hits = [];
  const liftDb = 1.15 + 1.05 * intensity;         // ~1.2 .. 2.2 dB — audible, but keeps crest in check
  const g = Math.pow(10, liftDb / 20);
  const ramp = Math.round(0.022 * sr);
  for (const w of words) {
    if (!want.has(norm(w.word))) continue;
    const a = Math.max(0, Math.round((w.t - t0) * sr));
    const b = Math.min(out.length, Math.round((w.t + w.dur - t0) * sr));
    if (b - a < ramp * 2) continue;
    for (let i = a; i < b; i++) {
      const up = Math.min(1, (i - a) / ramp);
      const dn = Math.min(1, (b - 1 - i) / ramp);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(up, dn));
      out[i] *= 1 + (g - 1) * e;
    }
    hits.push(w.word);
  }
  return { out, hits };
}

// ---- assemble -------------------------------------------------------------------
const chunks = [], beats = [], words = [], report = [];
let cursor = 0;
const push = (a) => { chunks.push(a); cursor += a.length; };
push(new Float32Array(Math.round(1.0 * SR)));      // same leadIn

const emphasisLog = [];
// Widen contrast around the mean so the read does not get globally darker or quieter.
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const gMean = meanOf(plan.beats.map(b => b.dsp.gainDb));
const tMean = meanOf(plan.beats.map(b => b.dsp.tilt));
console.log(`contrast centre: gain ${gMean.toFixed(3)} dB, tilt ${tMean.toFixed(3)} — spread widened about these`);
for (let i = 0; i < shipped.beats.length; i++) {
  const sb = shipped.beats[i], pb = plan.beats[i];
  const srcStart = sb.srcStart, srcEnd = sb.srcEnd;
  let x = tr.samples.slice(Math.round(srcStart * SR), Math.round(srcEnd * SR));

  // 1. emphasis, finally rendered
  const em = emphasise(x, SR, beatWords[i], oldBeats[i].t0, pb.emphasis, pb.intensity);
  x = em.out;
  if (em.hits.length) emphasisLog.push({ id: sb.id, words: em.hits });

  // 2. wider emotional contrast
  const dsp = {
    gainDb: +(gMean + (pb.dsp.gainDb - gMean) * 1.9).toFixed(3),
    tilt: +(tMean + (pb.dsp.tilt - tMean) * 1.65).toFixed(3),
    compress: { ...pb.dsp.compress },
  };
  x = P.shapeBeat(x, SR, dsp);
  // shapeBeat tilts BEFORE compressing, so the compressor eats the brightening exactly on
  // the beats that should open up. Add the presence lift AFTER shaping, only where the
  // story turns upward (reveal / surprise / excitement) — the payoff should feel lifted.
  if (dsp.tilt > 0) {
    const hp = P.onepole(x, SR, 2400, 'hp');
    const k = dsp.tilt * 0.20;
    const y = new Float32Array(x.length);
    for (let j = 0; j < x.length; j++) y[j] = x[j] + hp[j] * k;
    x = P.fadeEdges(y, SR);
  }

  // 4. breath at the SAME duration, deeper
  if (sb.breathSec > 0) {
    push(VK.breath(SR, { dur: sb.breathSec, kind: 'in', intensity: Math.min(1, 0.55 + 0.45 * pb.intensity), seed: 11 + i }));
  }
  const t0 = cursor / SR;
  push(x);
  const t1 = cursor / SR;

  const shift = t0 - srcStart;
  for (const w of beatWords[i]) words.push({ ...w });   // grid locked: times unchanged
  beats.push({ id: sb.id, index: i, emotion: pb.emotion, intensity: pb.intensity, text: pb.text, t0: +t0.toFixed(3), t1: +t1.toFixed(3), words: beatWords[i].length, source: 'contextual take, stronger direction' });
  report.push({ id: sb.id, emotion: pb.emotion, srcStart, srcEnd, t0: +t0.toFixed(3), breathSec: sb.breathSec, pauseAfterSec: sb.pauseAfterSec, dsp, emphasis: pb.emphasis });

  // 3. pause at the SAME length, but room tone instead of dead silence
  if (sb.pauseAfterSec > 0) push(roomTone(sb.pauseAfterSec, 101 + i));
}

const total = chunks.reduce((a, c) => a + c.length, 0);
const samples = new Float32Array(total); let o = 0;
for (const c of chunks) { samples.set(c, o); o += c.length; }

// ---- VERIFY THE GRID IS UNCHANGED ------------------------------------------------
let maxDrift = 0;
beats.forEach((b, i) => { maxDrift = Math.max(maxDrift, Math.abs(b.t0 - oldBeats[i].t0)); });
const durOld = shipped.durationSec, durNew = +(samples.length / SR).toFixed(3);
console.log(`\nGRID CHECK  max beat t0 drift: ${maxDrift.toFixed(6)}s   duration ${durOld} -> ${durNew}`);
if (maxDrift > 0.001) throw new Error(`timing grid drifted ${maxDrift}s — pictures would desync`);
if (Math.abs(durNew - durOld) > 0.002) throw new Error(`duration changed ${durOld} -> ${durNew}`);

VK.writeWav(`${OUT}/narration.wav`, samples, SR);
fs.writeFileSync(`${OUT}/narration.words.json`, JSON.stringify(words, null, 2));
fs.writeFileSync(`${OUT}/narration.beats.json`, JSON.stringify(beats, null, 2));
fs.writeFileSync(`${OUT}/direction-report.json`, JSON.stringify({ durationSec: durNew, gridMaxDriftSec: maxDrift, beats: report, emphasisRendered: emphasisLog }, null, 2));

// ---- measure whether it is actually more expressive ------------------------------
const oldSamples = VK.loadVoice(`${F}/narration.wav`, SR);
const mOld = P.analyzeTake(oldSamples.samples ?? oldSamples, SR, { label: 'R13 shipped' });
const mNew = P.analyzeTake(samples, SR, { label: 'R15 stronger' });
const perOld = P.analyzeBeats(oldSamples.samples ?? oldSamples, SR, oldBeats);
const perNew = P.analyzeBeats(samples, SR, beats);
const vOld = P.beatVariation(perOld), vNew = P.beatVariation(perNew);
fs.writeFileSync(`${OUT}/prosody-compare.json`, JSON.stringify({ shipped: { global: mOld, variation: vOld }, stronger: { global: mNew, variation: vNew } }, null, 2));

console.log('\nEMPHASIS RENDERED (never applied before):');
for (const e of emphasisLog) console.log(`  ${e.id}: ${e.words.join(', ')}`);
console.log('\nBETWEEN-BEAT VARIATION  shipped -> stronger');
for (const k of Object.keys(vNew)) console.log(`  ${k.padEnd(22)} ${JSON.stringify(vOld[k])} -> ${JSON.stringify(vNew[k])}`);
console.log('\nGLOBAL');
for (const k of ['durationSec', 'f0MedianHz', 'pitchRangeSt', 'dynamicRangeDb', 'pauseMaxSec', 'centroidHz']) console.log(`  ${k.padEnd(18)} ${mOld[k]} -> ${mNew[k]}`);
console.log(`\nwrote ${OUT}/narration.wav`);
