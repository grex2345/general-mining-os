/**
 * sfxkit.mjs — Round 11: world sound-effects library + precise narration/music/SFX mixer.
 * ADDITIVE. Procedural, deterministic SFX matched to on-screen actions (pottery wheel, clay,
 * shatter, kiln fire, door creak, crowd gasp/applause, sparkle chime, birds, wind, whoosh).
 * The mixer reads the processed narration WAV, resamples to 48 kHz, and ducks music/SFX under
 * the voice so the final bed feels professional and balanced.
 */
import fs from 'node:fs';
export const SR = 48000;
const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

/* ---- WAV I/O ---- */
export function readWavMono(file) {
  const b = fs.readFileSync(file);
  const ch = b.readUInt16LE(22), sr = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let off = 12; while (off + 8 < b.length && b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
  const dataLen = b.readUInt32LE(off + 4); const start = off + 8;
  const n = Math.floor(dataLen / (bits / 8) / ch); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) { const idx = start + (i * ch + c) * (bits / 8); s += bits === 16 ? b.readInt16LE(idx) / 32768 : (b.readUInt8(idx) - 128) / 128; } out[i] = s / ch; }
  return { sr, data: out };
}
export function resample(data, from, to) {
  if (from === to) return data;
  const n = Math.floor(data.length * to / from); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * from / to, i0 = Math.floor(x), f = x - i0; out[i] = data[i0] * (1 - f) + (data[Math.min(data.length - 1, i0 + 1)] || 0) * f; }
  return out;
}
export function writeWav(file, samples, sr = SR) {
  const n = samples.length; const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

/* ---- SFX generators (each returns Float32Array @ SR) ---- */
const noise = (i) => hash(i * 1.37) * 2 - 1;
export const SFX = {
  birds(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); for (let c = 0; c < Math.floor(dur * 1.5); c++) { const t0 = Math.floor(hash(c * 3.1) * dur * SR), f = 2200 + hash(c) * 1800, len = Math.floor(0.12 * SR); for (let i = 0; i < len && t0 + i < n; i++) { const t = i / SR, e = Math.sin(Math.PI * i / len); out[t0 + i] += Math.sin(TAU * (f + 600 * Math.sin(t * 40)) * t) * 0.12 * e; } } return out; },
  wind(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (noise(i) - lp) * 0.04; out[i] = lp * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.6)); } return out; },
  wheelHum(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (Math.sin(TAU * 70 * t) * 0.18 + Math.sin(TAU * 140 * t) * 0.08 + noise(i) * 0.03) * (0.7 + 0.3 * Math.sin(t * 6)); } return out; },
  claySquish() { const n = Math.ceil(0.3 * SR), out = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (noise(i) - lp) * 0.3; out[i] = lp * 0.5 * env(t, 0.01, 0.1) * (0.6 + 0.4 * Math.sin(t * 30)); } return out; },
  shatter() { const n = Math.ceil(0.7 * SR), out = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; out[i] = noise(i) * 0.5 * Math.exp(-t * 18); for (let k = 0; k < 4; k++) out[i] += Math.sin(TAU * (1800 - k * 300 - t * 800) * t) * 0.12 * Math.exp(-t * (10 + k * 4)); } return out; },
  fireCrackle(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (noise(i) - lp) * 0.08; out[i] = lp * 0.4; if (hash(i * 0.013) > 0.997) out[i] += noise(i) * 0.4 * Math.exp(-((i % 400)) / 60); } return out; },
  doorCreak() { const n = Math.ceil(0.9 * SR), out = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR, f = 300 - t * 180 + 30 * Math.sin(t * 25); out[i] = (2 * ((f * t) % 1) - 1) * 0.12 * env(t, 0.05, 0.5) * (0.6 + 0.4 * Math.sin(t * 18)); } return out; },
  gasp() { const n = Math.ceil(0.8 * SR), out = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (noise(i) - lp) * 0.15; out[i] = lp * 0.5 * Math.sin(Math.PI * Math.min(1, t / 0.8)) + Math.sin(TAU * 180 * t) * 0.05 * env(t, 0.05, 0.4); } return out; },
  applause(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); for (let c = 0; c < Math.floor(dur * 22); c++) { const t0 = Math.floor(hash(c * 7.3) * dur * SR), len = Math.floor(0.05 * SR); for (let i = 0; i < len && t0 + i < n; i++) out[t0 + i] += noise(i + c * 99) * 0.18 * Math.exp(-i / (SR * 0.012)); } return out; },
  chime() { const n = Math.ceil(1.4 * SR), out = new Float32Array(n); const fs2 = [1046, 1318, 1568, 2093]; fs2.forEach((f, k) => { const t0 = Math.floor(k * 0.09 * SR); for (let i = 0; i < n - t0; i++) { const t = i / SR; out[t0 + i] += Math.sin(TAU * f * t) * 0.1 * env(t, 0.002, 0.5) + Math.sin(TAU * f * 2.76 * t) * 0.04 * env(t, 0.002, 0.3); } }); return out; },
  whoosh() { const n = Math.ceil(0.5 * SR), out = new Float32Array(n); let lp = 0, lp2 = 0; for (let i = 0; i < n; i++) { const t = i / SR, p = t / 0.5; lp += (noise(i) - lp) * (0.1 + 0.3 * p); lp2 += (lp - lp2) * 0.3; out[i] = lp2 * 0.6 * Math.sin(Math.PI * p); } return out; },
  crickets(dur) { const n = Math.ceil(dur * SR), out = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; const chirp = Math.max(0, Math.sin(t * 2 * TAU * 3.2)) ** 4; out[i] = Math.sin(TAU * 4200 * t) * 0.04 * chirp; } return out; },
};

/** Place SFX events [{t, kind, gain, dur}] on a bus of `duration` seconds. */
export function buildSfxTrack(events, duration) {
  const out = new Float32Array(Math.ceil(duration * SR));
  for (const ev of events) {
    const gen = SFX[ev.kind]; if (!gen) continue;
    const buf = gen(ev.dur || 0.5); const s0 = Math.floor(ev.t * SR); const g = ev.gain ?? 0.5;
    for (let i = 0; i < buf.length; i++) { const j = s0 + i; if (j >= 0 && j < out.length) out[j] += buf[i] * g; }
  }
  return out;
}

/** Mix narration + music + SFX with ducking. voiceFile is the processed narration WAV. */
export function mixNarration({ voiceFile, music, sfx, duration, musicGain = 0.3, sfxGain = 0.55, leadIn = 0 }) {
  const v = readWavMono(voiceFile); const voice = resample(v.data, v.sr, SR);
  const n = Math.ceil(duration * SR); const out = new Float32Array(n);
  const vOff = Math.floor(leadIn * SR);
  // voice activity envelope for ducking (smoothed)
  const duck = new Float32Array(n); let sm = 0;
  for (let i = 0; i < n; i++) { const vi = i - vOff; const a = vi >= 0 && vi < voice.length ? Math.abs(voice[vi]) : 0; sm += (a - sm) * 0.002; duck[i] = Math.min(1, sm * 12); }
  for (let i = 0; i < n; i++) {
    const vi = i - vOff; const vv = vi >= 0 && vi < voice.length ? voice[vi] : 0;
    const d = 1 - 0.45 * duck[i]; // duck music/SFX up to ~45% under voice
    out[i] = vv + (music[i] || 0) * musicGain * d + (sfx[i] || 0) * sfxGain * d;
  }
  // soft limiter
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1; for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
