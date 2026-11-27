// voicekit.mjs — Round 13: beat-segmented narration assembly.
//
// The old pipeline generated ONE take of the whole script and time-stretched it.
// That produces a flat, uniform read and lets alignment error drift across the
// whole film. This module instead:
//   * takes ONE TTS clip PER BEAT (so each read is contextual and emotional),
//   * trims and tightens silence WITHOUT clipping words (Ricks method: -58 dBFS
//     true-silence threshold + 90 ms guard; -45 dB cut word tails and breaths),
//   * places explicit, directed pauses and optional breaths between beats,
//   * applies only MILD DSP per emotion (never time-stretch: it smears the voice),
//   * aligns words WITHIN each beat so timing error cannot propagate.
//
// Everything is measurable and deterministic.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWavMono, resample, writeWav, SR } from './sfxkit.mjs';
import { shapeBeat, fadeEdges, segments, analyzeTake } from './prosody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const FFMPEG = path.join(ROOT, 'studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
export const FFPROBE = path.join(ROOT, 'studio/node_modules/@ffprobe-installer/linux-x64/ffprobe');

/* --------------------------------------------------------------- silence -- */
/**
 * Remove leading/trailing silence from a TTS clip, keeping a small pad.
 * Uses a true-silence threshold so soft consonant tails survive.
 */
export function trimEdges(x, sr, { thrDb = -58, padSec = 0.04 } = {}) {
  const win = Math.round(0.01 * sr), frames = Math.floor(x.length / win);
  const loud = [];
  for (let i = 0; i < frames; i++) {
    let s = 0; for (let j = 0; j < win; j++) { const v = x[i * win + j]; s += v * v; }
    loud.push(20 * Math.log10(Math.sqrt(s / win) + 1e-12) > thrDb);
  }
  let a = loud.indexOf(true), b = loud.lastIndexOf(true);
  if (a < 0) return { samples: x, trimmedStart: 0, trimmedEnd: 0 };
  const pad = Math.round(padSec * sr);
  const s0 = Math.max(0, a * win - pad), s1 = Math.min(x.length, (b + 1) * win + pad);
  return { samples: x.slice(s0, s1), trimmedStart: s0 / sr, trimmedEnd: (x.length - s1) / sr };
}

/**
 * Shorten INTERNAL dead air without ever touching a word.
 * Ported method from the Ricks pipeline (MIT): a gap is only cut where audio is
 * below thrDb; every loud frame is grown by `guardSec` on both sides first, so
 * word edges, soft consonants and breaths (which live between -58 and -45 dB)
 * are never clipped. Each inner gap keeps at least `keepSec`.
 */
export function tightenGaps(x, sr, { thrDb = -58, guardSec = 0.09, keepSec = 0.12 } = {}) {
  const win = Math.round(0.01 * sr), frames = Math.floor(x.length / win);
  if (frames < 3) return { samples: x, removedSec: 0, gaps: 0 };
  const rms = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0; for (let j = 0; j < win; j++) { const v = x[i * win + j]; s += v * v; }
    rms[i] = Math.sqrt(s / win);
  }
  const loud = Array.from(rms, (v) => 20 * Math.log10(v + 1e-12) > thrDb);
  // grow loud frames by the guard (dilation) so word edges are protected
  const g = Math.round(guardSec / 0.01);
  const keepMask = new Uint8Array(frames);
  for (let i = 0; i < frames; i++) if (loud[i]) for (let j = Math.max(0, i - g); j <= Math.min(frames - 1, i + g); j++) keepMask[j] = 1;

  const out = []; let i = 0, removed = 0, gaps = 0;
  while (i < frames) {
    let j = i; while (j < frames && keepMask[j] === keepMask[i]) j++;
    let seg = x.slice(i * win, j * win);
    if (!keepMask[i] && i > 0 && j < frames) {
      const k = Math.min(seg.length, Math.round(keepSec * sr));
      if (seg.length > k) {
        const h = k >> 1;
        seg = Float32Array.from([...seg.slice(0, h), ...seg.slice(seg.length - (k - h))]);
        removed += (j - i) * win / sr - k / sr; gaps++;
      }
    }
    out.push(seg); i = j;
  }
  const tail = x.slice(frames * win);
  const total = out.reduce((a, s) => a + s.length, 0) + tail.length;
  const z = new Float32Array(total); let o = 0;
  for (const s of out) { z.set(s, o); o += s.length; }
  z.set(tail, o);
  return { samples: z, removedSec: +removed.toFixed(3), gaps };
}

/* ---------------------------------------------------------------- breath -- */
/**
 * A synthesised breath. Filtered noise with a soft attack/decay and mild
 * turbulence. Inhale is brighter and shorter; exhale softer and longer.
 * Deliberately quiet — a breath that calls attention to itself is a defect.
 */
export function breath(sr, { dur = 0.28, kind = 'in', intensity = 0.5, seed = 1 } = {}) {
  const n = Math.max(1, Math.round(dur * sr)), y = new Float32Array(n);
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  // one-pole band shaping: HP ~300 Hz then LP ~2.2 kHz (in) / 1.2 kHz (out)
  const hpA = 1 / (1 + 2 * Math.PI * 300 / sr), lpC = kind === 'in' ? 2200 : 1300;
  const lpA = (1 / sr) / (1 / (2 * Math.PI * lpC) + 1 / sr);
  let hpPrev = 0, hpInPrev = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const white = rnd() * 2 - 1;
    const hp = hpA * (hpPrev + white - hpInPrev); hpPrev = hp; hpInPrev = white;
    lp += lpA * (hp - lp);
    const u = i / n;
    // asymmetric envelope: quick swell, longer release
    const env = kind === 'in'
      ? Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.4)
      : Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 1.1);
    const turb = 1 + 0.18 * Math.sin(2 * Math.PI * 7.3 * u + seed);
    y[i] = lp * env * turb;
  }
  // normalise then set a quiet, intensity-scaled level
  let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
  const target = 0.055 * intensity * (kind === 'in' ? 1 : 0.8);
  if (pk > 0) for (let i = 0; i < n; i++) y[i] = y[i] / pk * target;
  return fadeEdges(y, sr, 0.02, 0.03);
}

/* ------------------------------------------------------------ conversion -- */
/** Decode any TTS output (mp3/wav/ogg/m4a) to mono Float32 at SR. */
export function loadVoice(file, sr = SR) {
  const tmp = `/tmp/vk-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`;
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(sr), tmp]);
  const buf = fs.readFileSync(tmp);
  // parse a PCM16 WAV produced above
  let off = 12, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), sz = buf.readUInt32LE(off + 4);
    if (id === 'data') { data = buf.slice(off + 8, off + 8 + sz); break; }
    off += 8 + sz + (sz % 2);
  }
  fs.unlinkSync(tmp);
  if (!data) throw new Error('no data chunk in decoded wav');
  const n = Math.floor(data.length / 2), y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = data.readInt16LE(i * 2) / 32768;
  return y;
}

/* ------------------------------------------------------------- alignment -- */
/**
 * Align words WITHIN one beat. Because each beat is aligned independently and
 * then offset by its known start time, an alignment error can never drift into
 * the next beat — the main sync weakness of whole-script alignment.
 */
export async function alignBeat(clipFile, beatText, beatStartSec, { lang = 'en' } = {}) {
  const ap = await import('./audiopipe.mjs');
  const words = beatText.trim().split(/\s+/).filter(Boolean);
  try {
    const got = await ap.alignWords(clipFile, beatText, { lang });
    if (got && got.length >= Math.max(2, Math.floor(words.length * 0.6))) {
      return { words: got.map((w) => ({ ...w, t: +(w.t + beatStartSec).toFixed(3) })), method: lang === 'en' ? 'pocketsphinx/whisper per-beat' : 'whisper per-beat' };
    }
  } catch { /* fall through to bounded estimate */ }
  // Bounded fallback: distribute within THIS beat only (error stays local).
  const dur = (() => { try { return +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clipFile]).toString().trim(); } catch { return words.length / 3.5; } })();
  const est = ap.estimateWordTiming(beatText, dur, { leadIn: 0.02, tail: 0.02 });
  return { words: est.map((w) => ({ ...w, t: +(w.t + beatStartSec).toFixed(3) })), method: 'estimated within beat (aligner unavailable)' };
}

/* -------------------------------------------------------------- assembly -- */
/**
 * Assemble the narration from per-beat clips.
 * clips: [{ beatId, file }] in plan order.
 * Returns { samples, sr, beats:[{id,t0,t1,emotion,...}], words, report }
 */
export async function assemble(clips, plan, opts = {}) {
  const {
    sr = SR, leadIn = plan.leadIn ?? 1.0, tighten = true, breaths = true,
    keepSec = 0.10, thrDb = -58, guardSec = 0.09, applyDsp = true, align = true,
    breathSeed = 7,
  } = opts;

  const chunks = []; const beats = []; const report = []; let cursor = 0;
  const push = (arr) => { chunks.push(arr); cursor += arr.length; };
  push(new Float32Array(Math.round(leadIn * sr)));

  for (let i = 0; i < plan.beats.length; i++) {
    const b = plan.beats[i];
    const clip = clips.find((c) => c.beatId === b.id);
    if (!clip) throw new Error(`missing clip for beat ${b.id}`);
    let x = loadVoice(clip.file, sr);
    const rawSec = x.length / sr;

    const tr = trimEdges(x, sr, { thrDb });
    x = tr.samples;
    let tg = { removedSec: 0, gaps: 0 };
    if (tighten) { tg = tightenGaps(x, sr, { thrDb, guardSec, keepSec }); x = tg.samples; }
    if (applyDsp) x = shapeBeat(x, sr, b.dsp);
    else x = fadeEdges(x, sr);

    // optional breath BEFORE the beat, inside its pause (never over speech)
    let breathSec = 0;
    if (breaths && i > 0) {
      const deterministic = ((breathSeed * 31 + i * 17) % 100) / 100;
      if (deterministic < b.prosody.breathBeforeProb) {
        const bd = 0.20 + 0.12 * b.prosody.breathBeforeProb;
        const br = breath(sr, { dur: bd, kind: 'in', intensity: 0.45 + 0.4 * b.intensity, seed: breathSeed + i });
        push(br); breathSec = bd;
      }
    }

    const t0 = cursor / sr;
    push(x);
    const t1 = cursor / sr;
    beats.push({ id: b.id, index: i, emotion: b.emotion, intensity: b.intensity, text: b.text, t0: +t0.toFixed(3), t1: +t1.toFixed(3), words: b.words, clipFile: clip.file });
    report.push({ id: b.id, emotion: b.emotion, rawSec: +rawSec.toFixed(3), trimmedStart: +tr.trimmedStart.toFixed(3), trimmedEnd: +tr.trimmedEnd.toFixed(3), gapsTightened: tg.gaps, gapSecRemoved: tg.removedSec, breathSec: +breathSec.toFixed(3), finalSec: +(t1 - t0).toFixed(3), t0: +t0.toFixed(3) });

    // directed pause AFTER the beat
    const pause = b.prosody.pauseAfterSec;
    if (pause > 0) push(new Float32Array(Math.round(pause * sr)));
  }

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const samples = new Float32Array(total); let o = 0;
  for (const c of chunks) { samples.set(c, o); o += c.length; }

  // ---- per-beat word alignment, offset into the global timeline -------------
  let words = [], methods = {};
  if (align) {
    for (const b of beats) {
      const r = await alignBeat(b.clipFile, b.text, b.t0, { lang: opts.lang || 'en' });
      // keep only words that fall inside this beat's span (+ small tolerance)
      const inside = r.words.filter((w) => w.t >= b.t0 - 0.05 && w.t <= b.t1 + 0.25);
      words.push(...inside);
      methods[b.id] = r.method;
    }
    words.sort((a, b) => a.t - b.t);
  }
  return { samples, sr, beats, words, report, alignMethods: methods, durationSec: +(samples.length / sr).toFixed(3) };
}

/**
 * HYBRID (variant C) — the approach the A/B experiment actually justified.
 *
 * Finding: generating each beat in ISOLATION lost the story context, and the
 * single full-script take varied MORE between sentences (f0 median std 41.8 Hz
 * vs 17.6 Hz isolated). The model performs the arc when it can read the arc.
 *
 * So: keep ONE contextual take as the performance, then CUT it at sentence
 * boundaries (from aligned word times), apply per-emotion DSP, and re-assemble
 * with directed pauses and breaths. Natural prosody AND exact timing control.
 *
 * takeWords: [{word,t,dur}] aligned to `take` (no lead-in).
 */
export async function restructureTake(take, sr, takeWords, plan, opts = {}) {
  const { leadIn = plan.leadIn ?? 1.0, breaths = true, applyDsp = true, padSec = 0.07, breathSeed = 11, tighten = false } = opts;
  const chunks = [], beats = [], report = [], words = [];
  let cursor = 0, wi = 0;
  const push = (a) => { chunks.push(a); cursor += a.length; };
  push(new Float32Array(Math.round(leadIn * sr)));

  for (let i = 0; i < plan.beats.length; i++) {
    const b = plan.beats[i];
    const n = b.text.split(/\s+/).filter(Boolean).length;
    const slice = takeWords.slice(wi, wi + n); wi += n;
    if (!slice.length) { report.push({ id: b.id, error: 'no aligned words for beat' }); continue; }

    const srcStart = Math.max(0, slice[0].t - padSec);
    const last = slice[slice.length - 1];
    const srcEnd = Math.min(take.length / sr, last.t + last.dur + padSec);
    let x = take.slice(Math.round(srcStart * sr), Math.round(srcEnd * sr));
    if (tighten) x = tightenGaps(x, sr, { keepSec: 0.10 }).samples;
    x = applyDsp ? shapeBeat(x, sr, b.dsp) : fadeEdges(x, sr);

    let breathSec = 0;
    if (breaths && i > 0) {
      const det = ((breathSeed * 31 + i * 17) % 100) / 100;
      if (det < b.prosody.breathBeforeProb) {
        const bd = 0.20 + 0.12 * b.prosody.breathBeforeProb;
        push(breath(sr, { dur: bd, kind: 'in', intensity: 0.4 + 0.35 * b.intensity, seed: breathSeed + i }));
        breathSec = bd;
      }
    }
    const t0 = cursor / sr;
    push(x);
    const t1 = cursor / sr;
    const shift = t0 - srcStart;
    for (const w of slice) words.push({ ...w, t: +(w.t + shift).toFixed(3) });
    beats.push({ id: b.id, index: i, emotion: b.emotion, intensity: b.intensity, text: b.text, t0: +t0.toFixed(3), t1: +t1.toFixed(3), words: n, source: 'contextual take' });
    report.push({ id: b.id, emotion: b.emotion, srcStart: +srcStart.toFixed(3), srcEnd: +srcEnd.toFixed(3), finalSec: +(t1 - t0).toFixed(3), t0: +t0.toFixed(3), breathSec: +breathSec.toFixed(3), pauseAfterSec: b.prosody.pauseAfterSec });

    if (b.prosody.pauseAfterSec > 0) push(new Float32Array(Math.round(b.prosody.pauseAfterSec * sr)));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const samples = new Float32Array(total); let o = 0;
  for (const c of chunks) { samples.set(c, o); o += c.length; }
  return { samples, sr, beats, words, report, durationSec: +(samples.length / sr).toFixed(3), alignMethods: { all: 'contextual take, cut at aligned sentence boundaries' } };
}

/** Convenience: write the assembled narration and its timing sidecars. */
export function writeAssembly(asm, outBase) {
  writeWav(`${outBase}.wav`, asm.samples, asm.sr);
  fs.writeFileSync(`${outBase}.words.json`, JSON.stringify(asm.words, null, 2));
  fs.writeFileSync(`${outBase}.beats.json`, JSON.stringify(asm.beats, null, 2));
  fs.writeFileSync(`${outBase}.report.json`, JSON.stringify({ durationSec: asm.durationSec, beats: asm.report, alignMethods: asm.alignMethods }, null, 2));
  return `${outBase}.wav`;
}

export { analyzeTake, segments, resample, writeWav, SR };
