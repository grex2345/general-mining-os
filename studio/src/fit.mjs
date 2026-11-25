// Fit pass: measure the REAL TTS duration and stretch scenes so voice never overruns.
//
// This is the fix for "narration does not fit the scene". It is validated against
// generated audio, never against a words-per-second guess -- an earlier version
// used a WPS constant and 4 of 7 scenes overran by 6-20%.
//
// The measurement MUST match how the track is actually built (chunked phrases with
// inserted pauses), otherwise the estimate drifts low and the voice still overruns.
// Both paths share `voiceDuration`.

import { synthesizeSpeech, speakable } from './audio.mjs';

export const VOICE_GAP = 0.22; // silence inserted between phrases in buildVoiceTrack

/** Phrases the voice track will actually synthesise for a line. */
export function voicePhrases(text) {
  return speakable(text)
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Measured duration of a narration line, including the pauses between phrases.
 * Results are memoised by (speed, voice, text) because synthesis is the slow part.
 */
export function voiceDuration(text, { speed = 160, voice = 'en/en-us', cache = new Map() } = {}) {
  if (!text || !String(text).trim()) return 0;
  const key = `${speed}|${voice}|${text}`;
  if (cache.has(key)) return cache.get(key);
  let total = 0;
  const phrases = voicePhrases(text);
  for (const [i, phrase] of phrases.entries()) {
    if (i > 0) total += VOICE_GAP;
    const { samples, sampleRate } = synthesizeSpeech(phrase, { speed, voice });
    total += samples.length / sampleRate;
  }
  // trailing silence is trimmed by buildVoiceTrack; keep a small allowance for it
  cache.set(key, total);
  return total;
}

export function measureVoices(ir, { cache = new Map(), speed = 160 } = {}) {
  const out = new Map();
  for (const s of ir.scenes) {
    if (!s.narration?.trim()) continue;
    out.set(s.id, voiceDuration(s.narration, { speed: s.voiceSpeed || speed, cache }));
  }
  return out;
}

/**
 * Stretch scene durations so every narration fits with `pad` seconds of tail.
 * Only ever grows a scene (never truncates a line), and reports what it changed.
 */
export function fitScenes(ir, { pad = 0.55, maxTotal = null, cache = new Map() } = {}) {
  const durs = measureVoices(ir, { cache });
  const changes = [];
  for (const s of ir.scenes) {
    const vo = durs.get(s.id) || 0;
    const need = vo + pad;
    if (need > s.duration + 0.02) {
      changes.push({ scene: s.id, kind: s.kind, from: s.duration, to: Number(need.toFixed(2)), vo: Number(vo.toFixed(2)) });
      s.duration = Number(need.toFixed(2));
    }
  }
  if (maxTotal) {
    const total = ir.scenes.reduce((a, s) => a + s.duration, 0);
    if (total > maxTotal) {
      throw new Error(
        `fitted duration ${total.toFixed(1)}s exceeds cap ${maxTotal}s — cut lines, do not speed up`,
      );
    }
  }
  return { ir, changes, voices: durs };
}
