// Audio: procedural music bed, frame-locked SFX, offline TTS.
//
// Research basis:
//  - kalem: sound events are stored frame-indexed so audio can never drift
//  - HyperFrames sound.md: effects only with a cause on screen, each hit 3-6 dB
//    over the bed, no synthesised chimes on every cut, music ~0.14 under voice
//  - iart: one loud thing at a time
//
// Everything is synthesised here (no copyrighted samples). Music is generated
// from a seeded pattern, so the same IR always yields the same track.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { hash } from './design.mjs';

const require = createRequire(import.meta.url);
export const SAMPLE_RATE = 48000;

export const frameToSample = (frame, fps, sr = SAMPLE_RATE) => Math.round((frame / fps) * sr);

// --- WAV writer -----------------------------------------------------------
export function writeWav(file, samples, sr = SAMPLE_RATE) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}

export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav: ' + file);
  const sr = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  const dataLen = b.readUInt32LE(40);
  const n = Math.floor(dataLen / (bits / 8));
  const out = new Float32Array(n);
  if (bits === 16) for (let i = 0; i < n; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  else if (bits === 8) for (let i = 0; i < n; i++) out[i] = (b.readUInt8(44 + i) - 128) / 128;
  else throw new Error('unsupported wav bit depth ' + bits);
  return { samples: out, sampleRate: sr };
}

// --- TTS (offline, no API key) -------------------------------------------
let _mspeakReady = false;
function mspeakInit(voice) {
  const mspeak = require('mespeak');
  if (!_mspeakReady) {
    mspeak.loadConfig(require('mespeak/src/mespeak_config.json'));
    _mspeakReady = true;
  }
  return { mspeak, voiceData: require(`mespeak/voices/${voice}.json`) };
}

export function synthesizeSpeech(text, { voice = 'en/en-us', speed = 165, pitch = 50 } = {}) {
  const { mspeak, voiceData } = mspeakInit(voice);
  // meSpeak keeps one active voice per process; reload only when it changes
  if (synthesizeSpeech._voice !== voice) {
    // loadVoice(data, callback) — the callback is required by this build
    try { mspeak.loadVoice(voiceData, () => {}); } catch (e) {
      if (!/overwrite|callback/i.test(String(e))) throw e;
    }
    synthesizeSpeech._voice = voice;
  }
  const raw = mspeak.speak(text, { rawdata: 'array', speed, pitch, wordgap: 0 });
  const tmp = path.join('/tmp', `tts-${process.pid}-${Math.round(hash(text.length) * 1e6)}-${Date.now() % 100000}.wav`);
  fs.writeFileSync(tmp, Buffer.from(raw));
  const wav = readWav(tmp);
  fs.unlinkSync(tmp);
  return wav;
}

/** Resample (linear) to the mixer rate. */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = to / from;
  const n = Math.round(samples.length * ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / ratio;
    const i0 = Math.floor(x), i1 = Math.min(samples.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = samples[i0] * (1 - f) + samples[i1] * f;
  }
  return out;
}

/**
 * Build the voice track from the IR narration, one clip per scene, placed at the
 * scene's exact start frame. Returns samples + per-scene timings for captions.
 */
export function buildVoiceTrack(ir, tl, { sr = SAMPLE_RATE } = {}) {
  const total = Math.ceil((tl.duration + 0.5) * sr);
  const bus = new Float32Array(total);
  const cues = [];
  for (const s of tl.scenes) {
    if (!s.narration || !s.narration.trim()) continue;
    const { samples, sampleRate } = synthesizeSpeech(s.narration, { speed: s.voiceSpeed || 165 });
    const r = resample(samples, sampleRate, sr);
    const start = frameToSample(s.startFrame, tl.fps, sr);
    // if the voice is longer than the scene, tighten placement to the scene start anyway
    for (let i = 0; i < r.length && start + i < total; i++) bus[start + i] += r[i] * 0.9;
    cues.push({ sceneId: s.id, start: s.start, end: s.start + r.length / sr, text: s.narration, voiceSeconds: r.length / sr });
  }
  return { bus, cues };
}

// --- procedural music -----------------------------------------------------
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
};
const NOTE = (semi, base = 110) => base * Math.pow(2, semi / 12);

function env(t, attack, decay) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

/**
 * Deterministic bed: kick + bass pulse + arpeggio pad, seeded from the IR id.
 * `energy` 0..1 scales the density; `mood` picks the scale.
 */
export function synthesizeMusic({ duration, sr = SAMPLE_RATE, seed = 7, bpm = 92, energy = 0.55, mood = 'minor', root = 110 }) {
  const n = Math.ceil(duration * sr);
  const out = new Float32Array(n);
  const beat = 60 / bpm;
  const scale = SCALES[mood] || SCALES.minor;
  const bar = beat * 4;
  const bars = Math.ceil(duration / bar);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    // chord root walks through the scale every 2 bars
    const deg = [0, 3, 4, 5][b % 4];
    const chordRoot = NOTE(scale[deg % scale.length], root);
    // 4-on-the-floor kick with a soft click
    for (let k = 0; k < 4; k++) {
      const ts = t0 + k * beat;
      if (ts > duration) break;
      const s0 = Math.floor(ts * sr);
      const gain = k === 0 ? 0.55 : 0.4;
      for (let i = 0; i < sr * 0.18 && s0 + i < n; i++) {
        const t = i / sr;
        const f = 92 * Math.exp(-t * 26) + 42;
        const e = env(t, 0.002, 0.085);
        out[s0 + i] += Math.sin(2 * Math.PI * f * t) * e * gain;
        if (i < 90) out[s0 + i] += (hash(i + b * 977) * 2 - 1) * 0.05 * (1 - i / 90);
      }
    }
    // bass pulse (eighth notes, off-beat)
    for (let k = 0; k < 8; k++) {
      if (hash(b * 31 + k) > 0.35 + energy * 0.4) continue;
      const ts = t0 + k * beat * 0.5;
      if (ts > duration) break;
      const f = chordRoot / 2;
      const s0 = Math.floor(ts * sr);
      for (let i = 0; i < sr * 0.35 && s0 + i < n; i++) {
        const t = i / sr;
        out[s0 + i] += Math.sin(2 * Math.PI * f * t + Math.sin(t * 3) * 0.6) * env(t, 0.01, 0.16) * 0.16;
      }
    }
    // arpeggio pad (triangles with a gentle lowpass feel)
    const arp = [0, 2, 4, 6].map((x) => NOTE(scale[(deg + x) % scale.length], chordRoot * 2));
    for (let k = 0; k < 8; k++) {
      const ts = t0 + k * beat * 0.5;
      if (ts > duration) break;
      const f = arp[k % arp.length] * (k >= 4 ? 1.5 : 1);
      const s0 = Math.floor(ts * sr);
      for (let i = 0; i < sr * 0.5 && s0 + i < n; i++) {
        const t = i / sr;
        const e = env(t, 0.008, 0.2);
        out[s0 + i] += (Math.sin(2 * Math.PI * f * t) * 0.7 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12) * e * 0.052;
      }
    }
  }
  // gentle limiter + fade in/out
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.9 ? 0.9 / peak : 1;
  const fadeIn = sr * 0.8, fadeOut = sr * 1.6;
  for (let i = 0; i < n; i++) {
    let v = out[i] * g;
    if (i < fadeIn) v *= i / fadeIn;
    if (i > n - fadeOut) v *= Math.max(0, (n - i) / fadeOut);
    out[i] = v;
  }
  return out;
}

// --- SFX ------------------------------------------------------------------
export function synthesizeSfx(kind, sr = SAMPLE_RATE, { gain = 1 } = {}) {
  const dur = { whoosh: 0.55, tick: 0.09, pop: 0.28, riser: 1.1, impact: 0.9, hit: 0.5 }[kind] ?? 0.3;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = t / dur;
    switch (kind) {
      case 'whoosh': {
        const f = 240 + 1500 * Math.pow(p, 0.6);
        out[i] = (Math.sin(2 * Math.PI * f * t) * 0.35 + (hash(i) * 2 - 1) * 0.22) * Math.sin(Math.PI * p) ** 2;
        break;
      }
      case 'tick':
        out[i] = (hash(i * 3.7) * 2 - 1) * Math.exp(-t * 160) * 0.5;
        break;
      case 'pop':
        out[i] = Math.sin(2 * Math.PI * (420 + 520 * p) * t) * Math.exp(-t * 22) * 0.5;
        break;
      case 'riser':
        out[i] = (Math.sin(2 * Math.PI * (220 + 1400 * p * p) * t) * 0.28 + (hash(i) * 2 - 1) * 0.14) * p * p;
        break;
      case 'impact':
        out[i] = (Math.sin(2 * Math.PI * (70 * Math.exp(-t * 6) + 38) * t) * Math.exp(-t * 7.5) * 0.75
          + (hash(i) * 2 - 1) * Math.exp(-t * 30) * 0.25);
        break;
      case 'hit':
        out[i] = Math.sin(2 * Math.PI * 180 * Math.exp(-t * 18) * t) * Math.exp(-t * 14) * 0.5;
        break;
    }
  }
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

/**
 * Assemble the whole audio bed:
 *  - music under everything (ducked while voice plays)
 *  - one SFX per authored event, placed at its exact frame
 */
export function buildAudio(ir, tl, { sr = SAMPLE_RATE, music = true } = {}) {
  const duration = tl.duration;
  const total = Math.ceil((duration + 0.3) * sr);
  const mix = new Float32Array(total);

  const voice = buildVoiceTrack(ir, tl, { sr });
  const hasVoice = voice.cues.length > 0;

  // music: budget it under the voice
  const bedLevel = hasVoice ? 0.16 : 0.5;
  if (music) {
    const m = synthesizeMusic({
      duration,
      sr,
      seed: hash(ir.id.length + 3),
      bpm: ir.audio?.bpm || 92,
      energy: ir.audio?.energy ?? 0.55,
      mood: ir.audio?.mood || 'minor',
      root: ir.audio?.root || 110,
    });
    for (let i = 0; i < m.length && i < total; i++) mix[i] += m[i] * bedLevel;
    // duck under voice with a smoothed envelope
    if (hasVoice) {
      const duck = new Float32Array(total).fill(1);
      for (const c of voice.cues) {
        const s = Math.max(0, Math.floor(c.start * sr));
        const e = Math.min(total, Math.ceil(c.end * sr));
        for (let i = s; i < e; i++) duck[i] = 0.42;
      }
      // smooth: 80 ms attack/release
      const k = Math.round(sr * 0.06);
      const sm = new Float32Array(total);
      for (let i = 0; i < total; i++) {
        let acc = 0, cnt = 0;
        for (let j = Math.max(0, i - k); j <= Math.min(total - 1, i + k); j++) { acc += duck[j]; cnt++; }
        sm[i] = acc / cnt;
      }
      for (let i = 0; i < total; i++) mix[i] *= sm[i];
    }
  }

  // voice
  for (let i = 0; i < voice.bus.length && i < total; i++) mix[i] += voice.bus[i] * 0.95;

  // SFX from frame-indexed events (authored per scene by the director)
  const sfxLog = [];
  for (const s of tl.scenes) {
    for (const ev of s.sfx || []) {
      const frame = s.startFrame + Math.round((ev.at ?? 0) * tl.fps);
      const at = frameToSample(frame, tl.fps, sr);
      const kind = ev.kind || 'pop';
      const w = synthesizeSfx(kind, sr, { gain: ev.gain ?? 1 });
      for (let i = 0; i < w.length && at + i < total; i++) mix[at + i] += w[i] * (ev.level ?? 0.55);
      sfxLog.push({ scene: s.id, kind, frame, time: frame / tl.fps });
    }
  }

  // master: soft clip + peak normalise to -1.5 dBFS
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const target = 0.84;
  const g = peak > 0 ? Math.min(3, target / peak) : 1;
  for (let i = 0; i < total; i++) mix[i] = Math.tanh(mix[i] * g * 1.05) * 0.98;

  return { samples: mix, sampleRate: sr, voiceCues: voice.cues, sfx: sfxLog, bedLevel, hasVoice };
}
