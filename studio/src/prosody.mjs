// prosody.mjs — Round 13: objective prosody measurement + gentle shaping.
//
// WHY: we cannot hear audio. To tell a flat reading from an expressive one we must
// MEASURE the things that carry expression: pitch range, pitch movement, dynamics,
// pause structure, speaking rate, brightness. These are proxies, not a substitute
// for listening — every report says so, and the human ear remains the final gate.
//
// Pure Node, no dependencies. Reads Float32 mono samples.

export const PSR = 48000;

/* ---------------------------------------------------------------- pitch ---- */
// Autocorrelation F0 with parabolic interpolation. Downsamples to 12 kHz first:
// speech F0 lives in 70-400 Hz, so 12 kHz is ample and ~4x cheaper.
function downsample(x, from, to) {
  if (from === to) return x;
  const r = from / to, n = Math.floor(x.length / r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r), b = Math.min(x.length, Math.floor((i + 1) * r));
    let s = 0; for (let j = a; j < b; j++) s += x[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

/**
 * F0 track. Returns { hopSec, f0: Float32Array (0 = unvoiced), clarity: Float32Array }
 * hopSec 0.02 (50 readings/s) is enough to see intonation gestures.
 */
export function pitchTrack(samples, sr, { fmin = 70, fmax = 400, hopSec = 0.02, clarityMin = 0.30 } = {}) {
  const dsr = 12000, y = downsample(samples, sr, dsr);
  const win = Math.round(0.045 * dsr);            // 45 ms window
  const hop = Math.round(hopSec * dsr);
  const lagMin = Math.floor(dsr / fmax), lagMax = Math.ceil(dsr / fmin);
  const nFrames = Math.max(0, Math.floor((y.length - win) / hop));
  const f0 = new Float32Array(nFrames), clarity = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    const off = i * hop;
    let mean = 0; for (let j = 0; j < win; j++) mean += y[off + j]; mean /= win;
    let e0 = 1e-12;
    for (let j = 0; j < win; j++) { const d = y[off + j] - mean; e0 += d * d; }
    if (e0 < 1e-7) continue;                       // digital silence
    let best = -1, bestLag = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let s = 0, eL = 1e-12;
      for (let j = 0; j < win; j++) {
        const a = y[off + j] - mean, b = y[off + j + lag] - mean;
        s += a * b; eL += b * b;
      }
      const r = s / Math.sqrt(e0 * eL);            // normalised -> comparable across frames
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best < clarityMin || bestLag === 0) continue;
    const rc = (lag) => {
      if (lag < lagMin || lag > lagMax) return -1;
      let s = 0, eL = 1e-12;
      for (let j = 0; j < win; j++) {
        const a = y[off + j] - mean, b = y[off + j + lag] - mean;
        s += a * b; eL += b * b;
      }
      return s / Math.sqrt(e0 * eL);
    };
    // OCTAVE-ERROR CORRECTION: a periodic signal correlates equally well at T,
    // 2T, 3T..., so the global max often lands on a MULTIPLE of the true period
    // and reports an F0 that is 2-3x too low. The fundamental is the SHORTEST
    // period that still correlates strongly -> prefer a smaller lag when it is
    // nearly as good. (Going the other way, preferring longer lags, invents
    // subharmonics: a 220 Hz test tone then reads 110 Hz. Verified both ways.)
    // Threshold 0.97, not 0.90: on REAL speech a strong 3rd harmonic can reach
    // 0.92 at T/3, and a looser threshold invented a whole 340-400 Hz cluster on
    // a 128 Hz narrator (seen in the F0 histogram). Only correct near-exact
    // period multiples.
    for (const div of [2, 3]) {
      const cand = Math.round(bestLag / div);
      if (cand >= lagMin && rc(cand) >= best * 0.97) { bestLag = cand; best = rc(cand); break; }
    }
    // parabolic refinement around the (corrected) peak lag
    const l = Math.max(lagMin, bestLag - 1), r2 = Math.min(lagMax, bestLag + 1);
    const rl = rc(l), rr = rc(r2);
    const denom = (rl - 2 * best + rr);
    const shift = Math.abs(denom) > 1e-9 ? 0.5 * (rl - rr) / denom : 0;
    const lag = bestLag + Math.max(-1, Math.min(1, shift));
    f0[i] = dsr / lag; clarity[i] = best;
  }
  return { hopSec, f0, clarity };
}

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
const st = (f, ref) => 12 * Math.log2(f / ref);

/* ------------------------------------------------------------- energy ----- */
export function energyTrack(samples, sr, winSec = 0.02) {
  const n = Math.round(winSec * sr), frames = Math.floor(samples.length / n);
  const rms = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0; for (let j = 0; j < n; j++) { const v = samples[i * n + j]; s += v * v; }
    rms[i] = Math.sqrt(s / n);
  }
  return { winSec, rms };
}

/** Silence/speech segmentation at a dBFS threshold (Ricks uses -58 for true silence). */
export function segments(samples, sr, { thrDb = -45, minSec = 0.06 } = {}) {
  const { winSec, rms } = energyTrack(samples, sr, 0.01);
  const loud = Array.from(rms, (v) => 20 * Math.log10(v + 1e-12) > thrDb);
  const segs = []; let i = 0;
  while (i < loud.length) {
    let j = i; while (j < loud.length && loud[j] === loud[i]) j++;
    const t0 = i * winSec, t1 = j * winSec;
    if (t1 - t0 >= minSec) segs.push({ speech: loud[i], t0: +t0.toFixed(3), t1: +t1.toFixed(3), dur: +(t1 - t0).toFixed(3) });
    i = j;
  }
  return segs;
}

/* ------------------------------------------------------------- spectrum --- */
// Radix-2 iterative FFT (in-place, dependency-free). Used for trustworthy band
// energies: an earlier Goertzel-probe bank gave inconsistent results (white noise
// did not come out flat) because off-bin leakage and per-probe normalisation
// differed by band. A real power spectrum removes that whole class of error.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** Averaged Welch power spectrum. Returns { freqs, psd, sr } */
export function powerSpectrum(samples, sr, { fftSize = 4096, hop = 2048, maxFrames = 200 } = {}) {
  const asr = 32000;
  let y = downsample(samples, sr, asr);
  const N = fftSize, half = N / 2;
  // SHORT FILES: a 0.1 s footstep is ~3200 samples at 32 kHz, shorter than one
  // FFT window. Without zero-padding the loop ran zero frames and returned an
  // EMPTY spectrum (centroid 0) — a silent measurement failure on every short
  // sound effect. Pad to at least one window.
  if (y.length < N) { const p = new Float32Array(N); p.set(y); y = p; }
  const acc = new Float64Array(half);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); // Hann
  let frames = 0;
  for (let off = 0; off + N <= y.length && frames < maxFrames; off += hop, frames++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = y[off + i] * win[i];
    fft(re, im);
    for (let k = 0; k < half; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  if (!frames) return { freqs: [], psd: [], sr: asr };
  const freqs = [], psd = [];
  for (let k = 0; k < half; k++) { freqs.push(k * asr / N); psd.push(acc[k] / frames); }
  return { freqs, psd, sr: asr };
}

export function bandEnergy(samples, sr) {
  const bands = [[20, 60, 'sub'], [60, 250, 'low'], [250, 1000, 'lowmid'], [1000, 4000, 'mid'], [4000, 10000, 'high'], [10000, 16000, 'air']];
  const { freqs, psd } = powerSpectrum(samples, sr);
  const out = {}; let total = 0, cn = 0;
  const sums = bands.map(() => 0);
  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k], p = psd[k];
    total += p; cn += p * f;
    for (let b = 0; b < bands.length; b++) if (f >= bands[b][0] && f < bands[b][1]) { sums[b] += p; break; }
  }
  bands.forEach(([, , name], b) => { out[name] = total > 0 ? +(sums[b] / total * 100).toFixed(1) : 0; });
  out.centroidHz = total > 0 ? Math.round(cn / total) : 0;
  return out;
}

/* ---------------------------------------------------------- full report --- */
/**
 * Measure a narration take. `words` = [{word,t,dur}] (optional) enables rate/pause stats.
 * Returns a flat, comparable metrics object.
 */
export function analyzeTake(samples, sr, { words = null, label = '', speakerMedianHz = null } = {}) {
  const dur = samples.length / sr;
  const { hopSec, f0: rawF0, clarity } = pitchTrack(samples, sr);
  // Harmonic/outlier rejection: a single narrator does not jump 3x in pitch.
  // Frames outside [0.45, 2.2] x the speaker's median are detector errors, not
  // expression. Counted and reported so the filtering is never silent.
  const rawVoiced = Array.from(rawF0).filter((v) => v > 0);
  // Use the WHOLE-SPEAKER median when supplied. A per-beat median lets a beat
  // that locked onto a 3rd harmonic (e.g. 407 Hz for a 130 Hz narrator) pass its
  // own outlier filter, because every frame in that beat is wrong together.
  const spkMed = speakerMedianHz || median(rawVoiced) || 1;
  const f0 = Float32Array.from(rawF0, (v) => (v > 0 && (v < spkMed * 0.45 || v > spkMed * 2.2)) ? 0 : v);
  const rejected = rawVoiced.length - Array.from(f0).filter((v) => v > 0).length;
  const voiced = Array.from(f0).filter((v) => v > 0);
  const ref = median(voiced) || 1;
  const semis = voiced.map((f) => st(f, ref));
  // frame-to-frame pitch movement in semitones (only where both frames are voiced)
  const moves = [];
  for (let i = 1; i < f0.length; i++) if (f0[i] > 0 && f0[i - 1] > 0) moves.push(Math.abs(st(f0[i], f0[i - 1])));
  // intonation "gestures": excursions of the smoothed contour away from its own median
  const sm = [];
  for (let i = 0; i < f0.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(f0.length - 1, i + 4); j++) if (f0[j] > 0) { s += f0[j]; n++; }
    sm.push(n ? s / n : 0);
  }
  const smv = sm.filter((v) => v > 0);
  const smMed = median(smv) || 1;
  const excursions = smv.map((f) => Math.abs(st(f, smMed)));
  let gestures = 0, above = false;
  for (const e of excursions) { if (!above && e > 2.0) { gestures++; above = true; } else if (above && e < 1.0) above = false; }

  const segs = segments(samples, sr, { thrDb: -45, minSec: 0.06 });
  const pauses = segs.filter((s) => !s.speech);
  const inner = pauses.slice(1, -1).length ? pauses.slice(1, -1) : pauses;
  const speechSec = segs.filter((s) => s.speech).reduce((a, s) => a + s.dur, 0);
  const { rms } = energyTrack(samples, sr, 0.02);
  const rmsDb = Array.from(rms).filter((v) => v > 0.0005).map((v) => 20 * Math.log10(v));
  const bands = bandEnergy(samples, sr);
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  const m = {
    label, durationSec: +dur.toFixed(3),
    voicedFrac: +(voiced.length / Math.max(1, f0.length)).toFixed(3),
    f0OutliersRejected: rejected,
    f0OutlierFrac: +(rejected / Math.max(1, rawVoiced.length)).toFixed(3),
    f0MedianHz: Math.round(ref),
    f0P05Hz: Math.round(pct(voiced, 0.05)), f0P95Hz: Math.round(pct(voiced, 0.95)),
    pitchRangeSt: +(pct(semis, 0.95) - pct(semis, 0.05)).toFixed(2),
    pitchStdSt: +std(semis).toFixed(2),
    pitchMoveMeanSt: +mean(moves).toFixed(3),
    pitchMoveP90St: +pct(moves, 0.90).toFixed(3),
    intonationGestures: gestures,
    gesturesPer10s: +(gestures / Math.max(0.1, dur) * 10).toFixed(2),
    dynamicRangeDb: +(pct(rmsDb, 0.95) - pct(rmsDb, 0.10)).toFixed(2),
    rmsStdDb: +std(rmsDb).toFixed(2),
    peakDbfs: +(20 * Math.log10(peak + 1e-12)).toFixed(2),
    speechSec: +speechSec.toFixed(3),
    pauseCount: inner.length,
    pauseMeanSec: +mean(inner.map((p) => p.dur)).toFixed(3),
    pauseMaxSec: +Math.max(0, ...inner.map((p) => p.dur)).toFixed(3),
    pauseTotalSec: +inner.reduce((a, p) => a + p.dur, 0).toFixed(3),
    silenceFrac: +((dur - speechSec) / Math.max(0.01, dur)).toFixed(3),
    centroidHz: bands.centroidHz,
    bands,
  };
  if (words && words.length) {
    m.wordCount = words.length;
    m.wordsPerSec = +(words.length / Math.max(0.1, speechSec)).toFixed(2);
    m.wordsPerSecWall = +(words.length / Math.max(0.1, dur)).toFixed(2);
    const gaps = [];
    for (let i = 1; i < words.length; i++) {
      const g = words[i].t - (words[i - 1].t + words[i - 1].dur);
      if (g > 0.05) gaps.push(g);
    }
    m.wordGapCount = gaps.length;
    m.wordGapMeanSec = +mean(gaps).toFixed(3);
    m.wordGapMaxSec = +Math.max(0, ...gaps).toFixed(3);
  }
  return m;
}

/** Per-beat prosody, so we can see whether emotion actually changes between beats. */
export function analyzeBeats(samples, sr, beats) {
  // Establish the speaker's median ONCE from the whole track, then judge every
  // beat against it, so harmonic locks cannot hide inside a single beat.
  const whole = pitchTrack(samples, sr);
  const wv = Array.from(whole.f0).filter((v) => v > 0);
  const speakerMedianHz = median(wv) || 1;
  return beats.map((b) => {
    const a = Math.max(0, Math.floor(b.t0 * sr)), z = Math.min(samples.length, Math.floor(b.t1 * sr));
    if (z - a < sr * 0.15) return { id: b.id, emotion: b.emotion, skipped: true };
    const m = analyzeTake(samples.slice(a, z), sr, { label: b.id, speakerMedianHz });
    return {
      id: b.id, emotion: b.emotion, text: b.text,
      dur: m.durationSec, f0MedianHz: m.f0MedianHz, pitchRangeSt: m.pitchRangeSt,
      pitchStdSt: m.pitchStdSt, gesturesPer10s: m.gesturesPer10s,
      dynamicRangeDb: m.dynamicRangeDb, centroidHz: m.centroidHz,
      wordsPerSec: b.words ? +(b.words / Math.max(0.1, m.speechSec)).toFixed(2) : null,
    };
  });
}

/** Spread across beats = did the delivery actually vary with the story? */
export function beatVariation(perBeat) {
  const ok = perBeat.filter((b) => !b.skipped);
  const col = (k) => ok.map((b) => b[k]).filter((v) => typeof v === 'number' && isFinite(v) && v > 0);
  const spread = (k) => { const a = col(k); return a.length > 1 ? { min: +Math.min(...a).toFixed(2), max: +Math.max(...a).toFixed(2), std: +std(a).toFixed(2) } : null; };
  return {
    beats: ok.length,
    f0MedianHz: spread('f0MedianHz'),
    pitchRangeSt: spread('pitchRangeSt'),
    wordsPerSec: spread('wordsPerSec'),
    dynamicRangeDb: spread('dynamicRangeDb'),
    centroidHz: spread('centroidHz'),
  };
}

/* ------------------------------------------------------------- shaping ---- */
// Gentle, phase-safe prosody shaping. We deliberately AVOID time-stretching the
// voice (the Ricks study: "even 1.1x smears the voice"). Instead we shape level,
// tilt and micro-dynamics, and leave rate to the script + explicit pauses.

/** Linear gain in dB. */
export function gainDb(x, db) { const g = Math.pow(10, db / 20); const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * g; return o; }

/** One-pole high/low pass. kind 'lp'|'hp'. Cheap, stable, no ringing. */
export function onepole(x, sr, cutoff, kind = 'lp') {
  const o = new Float32Array(x.length);
  const rc = 1 / (2 * Math.PI * cutoff), dt = 1 / sr, a = dt / (rc + dt);
  let prev = 0, prevIn = 0;
  for (let i = 0; i < x.length; i++) {
    const lp = prev + a * (x[i] - prev); prev = lp;
    o[i] = kind === 'lp' ? lp : x[i] - lp;
    prevIn = x[i];
  }
  return o;
}

/** Spectral tilt: blend a low-passed copy to darken (intimacy/sadness) or a
 *  high-passed copy to brighten (excitement). amount -1..1. */
export function tilt(x, sr, amount) {
  if (!amount) return x;
  const o = new Float32Array(x.length);
  if (amount > 0) { const hp = onepole(x, sr, 2200, 'hp'); for (let i = 0; i < x.length; i++) o[i] = x[i] + hp[i] * amount * 0.35; }
  else { const lp = onepole(x, sr, 2600, 'lp'); const k = -amount * 0.45; for (let i = 0; i < x.length; i++) o[i] = x[i] * (1 - k) + lp[i] * k; }
  return o;
}

/** Soft compressor: tame peaks so a whispered beat and an excited beat can sit
 *  in the same mix without the excited one clipping. thresholdDb, ratio. */
export function compress(x, sr, { thresholdDb = -12, ratio = 2.5, attackMs = 8, releaseMs = 120, makeupDb = 0 } = {}) {
  const o = new Float32Array(x.length);
  const at = Math.exp(-1 / (sr * attackMs / 1000)), rl = Math.exp(-1 / (sr * releaseMs / 1000));
  let env = 0, gr = 0;
  const mk = Math.pow(10, makeupDb / 20);
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? at * env + (1 - at) * a : rl * env + (1 - rl) * a;
    const db = 20 * Math.log10(env + 1e-12);
    const over = db - thresholdDb;
    const target = over > 0 ? -over * (1 - 1 / ratio) : 0;
    gr = target < gr ? at * gr + (1 - at) * target : rl * gr + (1 - rl) * target;
    o[i] = x[i] * Math.pow(10, gr / 20) * mk;
  }
  return o;
}

/** Fade edges to avoid clicks when concatenating beats. */
export function fadeEdges(x, sr, inSec = 0.008, outSec = 0.012) {
  const o = Float32Array.from(x);
  const a = Math.min(o.length, Math.round(inSec * sr)), b = Math.min(o.length, Math.round(outSec * sr));
  for (let i = 0; i < a; i++) o[i] *= i / a;
  for (let i = 0; i < b; i++) o[o.length - 1 - i] *= i / b;
  return o;
}

/**
 * Apply an emotion's DSP direction to one beat. Kept deliberately mild: the
 * performance comes from the TTS read, DSP only supports it.
 * dir = { gainDb, tilt, compress:{...}, }
 */
export function shapeBeat(x, sr, dir = {}) {
  let y = x;
  if (dir.tilt) y = tilt(y, sr, dir.tilt);
  if (dir.compress) y = compress(y, sr, dir.compress);
  if (dir.gainDb) y = gainDb(y, dir.gainDb);
  return fadeEdges(y, sr);
}
