// Fit pass: measure the REAL TTS duration and stretch scenes so voice never overruns.
// This is the fix for "narration does not fit the scene" — validated against audio,
// not against a words-per-second guess.
import { synthesizeSpeech } from './audio.mjs';

export function measureVoices(ir, { cache = new Map(), speed = 165 } = {}) {
  const out = new Map();
  for (const s of ir.scenes) {
    if (!s.narration?.trim()) continue;
    const key = `${speed}|${s.narration}`;
    let d = cache.get(key);
    if (!d) {
      const { samples, sampleRate } = synthesizeSpeech(s.narration, { speed: s.voiceSpeed || speed });
      d = samples.length / sampleRate;
      cache.set(key, d);
    }
    out.set(s.id, d);
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
    if (total > maxTotal) throw new Error(`fitted duration ${total.toFixed(1)}s exceeds cap ${maxTotal}s — cut lines, do not speed up`);
  }
  return { ir, changes, voices: durs };
}
