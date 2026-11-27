// mixdesk.mjs — Round 13: professional stereo mixing + mastering.
//
// Targets MEASURED from 19 real @RicksClips3000 videos (vendored study):
//   master −14 LUFS, true peak −2 dBTP
//   voice alone ≈ −17 LUFS
//   music sits ≈ 20 dB under the voice, and is NEVER silent (silent ~5% of time)
//   SFX peak ≈ 12 dB under the voice, ~7.7 hits per 10 s
//   only ~1 in 3 scene changes carries a transition hit
//
// Buses: voice / music / sfx / ambience. Voice-keyed sidechain ducking,
// a masking report (events buried under louder ones), stems, and mastering by
// ONE linear gain (never compression on the master) per the procedural-sfx skill.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR } from './foley.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const FFMPEG = path.join(ROOT, 'studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg');

/* ------------------------------------------------------------ wav i/o ----- */
export function writeWavStereo(file, L, R, sr = SR) {
  const n = Math.min(L.length, R.length);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
  return file;
}

export function readWavStereo(file) {
  const b = fs.readFileSync(file);
  let off = 12, data = null, ch = 2, sr = SR, bits = 16;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); sr = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    if (id === 'data') { data = b.slice(off + 8, off + 8 + sz); break; }
    off += 8 + sz + (sz % 2);
  }
  if (!data) throw new Error('no data chunk');
  if (bits !== 16) throw new Error(`expected 16-bit PCM, got ${bits}`);
  const frames = Math.floor(data.length / (2 * ch));
  const L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    L[i] = data.readInt16LE(i * 2 * ch) / 32768;
    R[i] = ch > 1 ? data.readInt16LE(i * 2 * ch + 2) / 32768 : L[i];
  }
  return { L, R, sr };
}

/* --------------------------------------------------------- measurement ---- */
/** RMS loudness in dBFS over active frames (a cheap LUFS proxy; the authoritative
 *  number always comes from ffmpeg loudnorm, which we call in measure()). */
export function rmsDb(x, { gateDb = -60 } = {}) {
  const win = Math.round(0.05 * SR);
  let sum = 0, n = 0;
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += x[i + j] * x[i + j];
    const db = 10 * Math.log10(s / win + 1e-12);
    if (db > gateDb) { sum += s / win; n++; }
  }
  return n ? +(10 * Math.log10(sum / n + 1e-12)).toFixed(2) : -120;
}

export function truePeakDb(L, R) {
  let pk = 0;
  for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
  return +(20 * Math.log10(pk + 1e-12)).toFixed(2);
}

/** Authoritative EBU R128 measurement via ffmpeg loudnorm. The filter prints its
 *  JSON report to stderr even on success, so spawnSync captures both streams. */
export function measureLoudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af',
    'loudnorm=I=-14:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const stderr = r.stderr || '';
  const m = stderr.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { integratedLufs: +j.input_i, truePeakDb: +j.input_tp, lra: +j.input_lra, threshold: +j.input_thresh };
  } catch { return null; }
}

/* ------------------------------------------------- voice-bus conditioning - */
/**
 * Lookahead peak limiter. Narration from TTS has a ~18 dB crest factor, which
 * makes the master peak-limit long before it reaches -14 LUFS. This tames only
 * the few loudest transients on the VOICE bus (never the master), which is what
 * real dialogue mixers do. Transparent below the threshold.
 */
export function peakLimit(x, { thresholdDb = -8, lookaheadMs = 5, releaseMs = 60, sr = SR } = {}) {
  const thr = Math.pow(10, thresholdDb / 20);
  const la = Math.max(1, Math.round(sr * lookaheadMs / 1000));
  const rel = Math.exp(-1 / (sr * releaseMs / 1000));
  const n = x.length;
  // running peak over the lookahead window
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pk = 0;
    for (let j = i; j < Math.min(n, i + la); j++) { const a = Math.abs(x[j]); if (a > pk) pk = a; }
    need[i] = pk > thr ? thr / pk : 1;
  }
  const y = new Float32Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    const target = need[i];
    g = target < g ? target : rel * g + (1 - rel) * target;   // instant attack, smooth release
    y[i] = x[Math.min(n - 1, i + la)] * g;
  }
  return y;
}

/** Normalise a bus to a target gated RMS so bus gains mean what they say. */
export function normalizeRms(x, targetDb, { maxGainDb = 24 } = {}) {
  const cur = rmsDb(x);
  if (cur <= -110) return x;
  let g = targetDb - cur;
  g = Math.max(-maxGainDb, Math.min(maxGainDb, g));
  const k = Math.pow(10, g / 20);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * k;
  return y;
}

/** Peak level of a bus AT the event times — the right metric for sparse SFX.
 *  Whole-file RMS under-reports a bus that is silent most of the time. */
export function eventPeakDb(bus, events, sr = SR) {
  const vals = [];
  for (const ev of events) {
    const a = Math.max(0, Math.round(ev.t * sr));
    const z = Math.min(bus.L.length, a + Math.round((ev.durSec || 0.6) * sr));
    let pk = 0; for (let i = a; i < z; i++) pk = Math.max(pk, Math.abs(bus.L[i]), Math.abs(bus.R[i]));
    if (pk > 0) vals.push(20 * Math.log10(pk));
  }
  vals.sort((a, b) => a - b);
  if (!vals.length) return { peakDb: -120, medianDb: -120, p90Db: -120 };
  return {
    peakDb: +vals[vals.length - 1].toFixed(2),
    medianDb: +vals[Math.floor(vals.length / 2)].toFixed(2),
    p90Db: +vals[Math.floor(vals.length * 0.9)].toFixed(2),
  };
}

/* ------------------------------------------------------------- ducking ---- */
/**
 * Voice-keyed sidechain ducking. Envelope follower on the voice, applied to
 * music and SFX. Unlike ffmpeg 4.1's amix (which averages inputs), this keeps
 * the voice at unity and only pulls the beds down.
 * depth: how far to duck (0.45 = −45% amplitude ≈ −3.9 dB) — the Ricks study
 * wants music ~20 dB under voice, which we achieve with bus GAIN, and ducking
 * adds a further dynamic dip so consonants stay clear.
 */
export function duckEnvelope(voiceMono, n, { depth = 0.5, attackMs = 12, releaseMs = 260, sr = SR } = {}) {
  const at = Math.exp(-1 / (sr * attackMs / 1000)), rl = Math.exp(-1 / (sr * releaseMs / 1000));
  const env = new Float32Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) {
    const a = i < voiceMono.length ? Math.abs(voiceMono[i]) : 0;
    e = a > e ? at * e + (1 - at) * a : rl * e + (1 - rl) * a;
    env[i] = 1 - depth * Math.min(1, e * 9);
  }
  return env;
}

/* --------------------------------------------------------------- mixing --- */
/**
 * Mix buses to stereo.
 * buses: { voice:{L,R} | mono, music:{L,R}, sfx:{L,R}, ambience:{L,R} }
 * gains in dB relative to the voice bus.
 */
export function mix(buses, duration, opts = {}) {
  const {
    sr = SR,
    musicGainDb = -20,       // Ricks: music ~20 dB under voice
    sfxGainDb = -12,         // Ricks: SFX peak ~12 dB under voice
    ambienceGainDb = -26,
    duckDepth = 0.45,
    voiceGainDb = 0,
    leadIn = 0,
  } = opts;
  const n = Math.ceil(duration * sr);
  const asStereo = (b) => !b ? null : (b.L ? b : { L: b.mono || b, R: b.mono || b });
  let V = asStereo(buses.voice), M = asStereo(buses.music), S = asStereo(buses.sfx), A = asStereo(buses.ambience);
  // Condition the voice bus first: tame TTS transients so the master can reach
  // -14 LUFS without hitting the true-peak ceiling.
  if (V && opts.limitVoice !== false) {
    V = { L: peakLimit(V.L, { thresholdDb: opts.voiceLimitDb ?? -9, sr }), R: peakLimit(V.R, { thresholdDb: opts.voiceLimitDb ?? -9, sr }) };
  }
  // Normalise the continuous beds RELATIVE TO THE MEASURED VOICE, so
  // "music 20 dB under voice" is literally true after the bus gain. Normalising
  // to a fixed absolute RMS drifted, because the -60 dB gate re-classifies
  // frames once the gain changes.
  const vRef = V ? rmsDb(V.L) : -20;
  if (M) { const tgt = vRef + musicGainDb; M = { L: normalizeRms(M.L, tgt), R: normalizeRms(M.R, tgt) }; }
  if (A) { const tgt = vRef + ambienceGainDb; A = { L: normalizeRms(A.L, tgt), R: normalizeRms(A.R, tgt) }; }
  const vOff = Math.round(leadIn * sr);
  const voiceMono = new Float32Array(n);
  if (V) for (let i = 0; i < n; i++) { const j = i - vOff; if (j >= 0 && j < V.L.length) voiceMono[i] = (V.L[j] + V.R[j]) * 0.5; }
  const env = duckEnvelope(voiceMono, n, { depth: duckDepth, sr });
  const gV = Math.pow(10, voiceGainDb / 20), gM = M ? 1 : Math.pow(10, musicGainDb / 20), gS = Math.pow(10, sfxGainDb / 20), gA = A ? 1 : Math.pow(10, ambienceGainDb / 20);
  const L = new Float32Array(n), R = new Float32Array(n);
  const stems = { voice: { L: new Float32Array(n), R: new Float32Array(n) }, music: { L: new Float32Array(n), R: new Float32Array(n) }, sfx: { L: new Float32Array(n), R: new Float32Array(n) }, ambience: { L: new Float32Array(n), R: new Float32Array(n) } };
  for (let i = 0; i < n; i++) {
    const j = i - vOff;
    if (V && j >= 0 && j < V.L.length) { stems.voice.L[i] = V.L[j] * gV; stems.voice.R[i] = V.R[j] * gV; }
    const d = env[i];
    if (M && i < M.L.length) { stems.music.L[i] = M.L[i] * gM * d; stems.music.R[i] = M.R[i] * gM * d; }
    if (S && i < S.L.length) { stems.sfx.L[i] = S.L[i] * gS * d; stems.sfx.R[i] = S.R[i] * gS * d; }
    if (A && i < A.L.length) { stems.ambience.L[i] = A.L[i] * gA * d; stems.ambience.R[i] = A.R[i] * gA * d; }
    L[i] = stems.voice.L[i] + stems.music.L[i] + stems.sfx.L[i] + stems.ambience.L[i];
    R[i] = stems.voice.R[i] + stems.music.R[i] + stems.sfx.R[i] + stems.ambience.R[i];
  }
  const levels = {
    voiceRmsDb: rmsDb(stems.voice.L), musicRmsDb: rmsDb(stems.music.L),
    sfxRmsDb: rmsDb(stems.sfx.L), ambienceRmsDb: rmsDb(stems.ambience.L),
    mixTruePeakDb: truePeakDb(L, R),
  };
  levels.musicUnderVoiceDb = +(levels.voiceRmsDb - levels.musicRmsDb).toFixed(2);
  // SFX are sparse: judge them by PEAK at the event times against the voice peak,
  // which is how the reference numbers were measured.
  const vPk = truePeakDb(stems.voice.L, stems.voice.R);
  const sPk = eventPeakDb(stems.sfx, opts.events || [], sr);
  levels.voicePeakDb = vPk;
  levels.sfxEventPeak = sPk;
  levels.sfxUnderVoicePeakDb = +(vPk - sPk.p90Db).toFixed(2);
  levels.sfxUnderVoiceDb = levels.sfxUnderVoicePeakDb;
  return { L, R, sr, stems, levels, duckEnv: env };
}

/* -------------------------------------------------------- masking report -- */
/**
 * Flag SFX events buried under the voice or music at their moment.
 *
 * Measures PEAK over each event's OWN duration, not a fixed 80 ms RMS at its
 * start. The fixed window badly over-flagged two legitimate cases: a footstep
 * whose whole energy is in the first 15 ms, and a 2 s riser that is intentionally
 * near-silent at its start and builds. `log` (from renderEvents) supplies the
 * real durations.
 */
export function maskingReport(events, mixResult, { marginDb = 6, log = null } = {}) {
  const { stems, sr } = mixResult;
  const durOf = (ev, i) => (log && log[i] && log[i].durSec) || ev.durSec || 0.6;
  const peakOver = (bus, t, dur) => {
    const a = Math.max(0, Math.round(t * sr));
    const z = Math.min(bus.L.length, a + Math.max(1, Math.round(dur * sr)));
    let pk = 0;
    for (let i = a; i < z; i++) pk = Math.max(pk, Math.abs(bus.L[i]), Math.abs(bus.R[i]));
    return +(20 * Math.log10(pk + 1e-12)).toFixed(1);
  };
  // Voice/music are judged over a 150 ms window centred on the event, which is
  // roughly one syllable — the unit a listener actually compares against.
  const win = Math.round(0.15 * sr);
  const rmsAt = (bus, t) => {
    const a = Math.max(0, Math.round(t * sr) - Math.floor(win / 2)), b = Math.min(bus.L.length, a + win);
    let s = 0; for (let i = a; i < b; i++) { s += bus.L[i] * bus.L[i] + bus.R[i] * bus.R[i]; }
    return +(10 * Math.log10(s / Math.max(1, (b - a) * 2) + 1e-12)).toFixed(1);
  };
  const rows = [];
  events.forEach((ev, i) => {
    const dur = durOf(ev, i);
    const s = peakOver(stems.sfx, ev.t, dur), v = rmsAt(stems.voice, ev.t), m = rmsAt(stems.music, ev.t);
    const maskedBy = Math.max(v, m);
    const deficit = +(maskedBy - s).toFixed(1);
    rows.push({ t: +ev.t.toFixed(2), name: ev.name || ev.kind, durSec: dur, sfxPeakDb: s, voiceDb: v, musicDb: m, deficitDb: deficit, check: deficit > marginDb + 12 ? 'CHECK: likely inaudible' : deficit > marginDb ? 'note: under the bed' : 'ok' });
  });
  return rows;
}

/* ------------------------------------------------------------ mastering --- */
/**
 * Master by ONE linear gain to a loudness target. Never compresses the master.
 * If the target would push true peak over the ceiling, it reports the loudest
 * reachable target instead of silently clipping (procedural-sfx discipline).
 */
export function master(mixResult, file, { targetLufs = -14, ceilingDb = -2 } = {}) {
  const raw = file.replace(/\.wav$/, '-raw.wav');
  writeWavStereo(raw, mixResult.L, mixResult.R, mixResult.sr);
  const before = measureLoudness(raw);
  if (!before) throw new Error('could not measure loudness');
  let gain = targetLufs - before.integratedLufs;
  const peakAfter = before.truePeakDb + gain;
  let capped = false;
  if (peakAfter > ceilingDb) { gain = ceilingDb - before.truePeakDb; capped = true; }
  const g = Math.pow(10, gain / 20);
  const L = new Float32Array(mixResult.L.length), R = new Float32Array(mixResult.R.length);
  for (let i = 0; i < L.length; i++) { L[i] = mixResult.L[i] * g; R[i] = mixResult.R[i] * g; }
  writeWavStereo(file, L, R, mixResult.sr);
  const after = measureLoudness(file);
  return {
    file, rawFile: raw, appliedGainDb: +gain.toFixed(2), capped,
    requestedLufs: targetLufs, ceilingDb,
    before, after,
    reachableLufs: capped ? +(before.integratedLufs + gain).toFixed(2) : targetLufs,
    note: capped ? `target ${targetLufs} LUFS would exceed ${ceilingDb} dBTP; mastered to the loudest reachable level instead` : 'target reached with one linear gain, no compression',
  };
}

/** Density check against the measured reference: ~7.7 SFX hits per 10 s. */
export function densityCheck(events, duration, { targetPer10s = 7.7, tol = 3.0 } = {}) {
  const per10 = events.length / Math.max(0.1, duration) * 10;
  return { events: events.length, durationSec: +duration.toFixed(2), per10s: +per10.toFixed(2), targetPer10s, verdict: Math.abs(per10 - targetPer10s) <= tol ? 'in reference range' : per10 < targetPer10s ? 'sparser than reference' : 'denser than reference' };
}
