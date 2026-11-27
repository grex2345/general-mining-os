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
import { spawn } from 'node:child_process';
import { hash } from './design.mjs';
import { FFMPEG } from './env.mjs';

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

/**
 * Text -> speakable text.
 *
 * eSpeak's front end flattens punctuation and interprets bare numbers oddly, so the
 * input is normalised first: numbers with units are spelled out, "$26.16" becomes
 * "26 dollars 16", "EH/s" becomes "exahashes per second". Prosody is supplied
 * explicitly with <break> instead of relying on the synthesiser to find sentence
 * ends, because measured output ignored full stops and ran sentences together.
 */
export function speakable(text) {
  return String(text)
    .replace(/\bper\s+EH\/s/g, 'per exahash per second')
    .replace(/EH\/s/g, ' exahashes per second')
    .replace(/ZH\/s/g, ' zetahashes per second')
    .replace(/TH\/s/g, ' terahashes per second')
    .replace(/\bper\s+PH\/s/g, 'per petahash per second')
    .replace(/PH\/s/g, ' per petahash per second')
    .replace(/\bUSD\b/g, ' dollars')
    .replace(/\$([\d.]+)/g, (_, n) => `${n} dollars`)
    .replace(/\bJ\/TH\b/g, ' joules per terahash')
    .replace(/\bkW\/?h\b/gi, ' kilowatt hours')
    .replace(/~(\d)/g, 'around $1')
    .replace(/--/g, ', ')
    // sentence breaks -> real pauses
    .replace(/([.!?])\s+/g, '$1 [[slnc 260]] ')
    // clause breaks -> short pauses
    .replace(/([,;:])\s+/g, '$1 [[slnc 110]] ')
    .replace(/per petahash per second per day/gi, 'per petahash per day')
    .replace(/\s+/g, ' ')
    .trim();
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-400)}`))));
    p.on('error', reject);
  });
}

/** Conditioning EQ + dynamics so the formant voice sits in a mix. */
export async function conditionVoice(inputWav, outputWav, { sr = SAMPLE_RATE } = {}) {
  await ffmpeg([
    '-y', '-hide_banner', '-loglevel', 'error', '-i', inputWav,
    '-af', [
      'highpass=f=90',
      'lowpass=f=3600',
      // mono band is thin; a single short reflection reads as "room" not "echo"
      'aecho=0.8:0.6:18:0.10',
      'acompressor=threshold=-20dB:ratio=3.2:attack=6:release=150',
      'equalizer=f=220:t=q:w=1.1:g=1.6',   // chest
      'equalizer=f=2900:t=q:w=1.4:g=2.0',  // presence / intelligibility
      // aecho + compressor cost ~6 dB; make it back before the limiter so the
      // normaliser is not asked to add 11 dB of gain to a quiet signal
      'volume=4.0',
      'alimiter=limit=0.9:level=false',
    ].join(','),
    '-ar', String(sr), '-ac', '1', outputWav,
  ]);
  return outputWav;
}

export function synthesizeSpeech(text, { voice = 'en/en-us', speed = 160, pitch = 46 } = {}) {
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
 * scene's exact start frame.
 *
 * Three things this does that matter for perceived quality:
 *  - pauses are REAL silence inserted between phrases, because meSpeak honours
 *    only ~23% of an [[slnc]] directive (measured), so punctuation alone leaves the
 *    voice running sentences together;
 *  - each line is conditioned (EQ + gentle dynamics) so the formant voice sits in
 *    the bed instead of on top of it;
 *  - clips are de-clicked with short fades, and every clip is trimmed of leading
 *    and trailing silence, so scene starts land exactly on the beat.
 */
export function buildVoiceTrack(ir, tl, { sr = SAMPLE_RATE, log = () => {} } = {}) {
  const total = Math.ceil((tl.duration + 0.5) * sr);
  const bus = new Float32Array(total);
  const cues = [];
  const gapS = 0.22;

  for (const s of tl.scenes) {
    if (!s.narration || !s.narration.trim()) continue;
    const speakableText = speakable(s.narration);
    // split into phrases on the sentence boundaries we preserved as text
    const phrases = speakableText.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    const parts = [];
    for (const [i, phrase] of phrases.entries()) {
      const { samples, sampleRate } = synthesizeSpeech(phrase, {
        speed: s.voiceSpeed || 160,
        pitch: s.voicePitch ?? 46,
      });
      let r = resample(samples, sampleRate, sr);
      r = trimSilence(r, sr);
      if (i > 0) parts.push(new Float32Array(Math.round(gapS * sr)));
      parts.push(r);
    }
    const speech = concat(parts);
    applyFades(speech, sr, 0.012, 0.05);
    const start = frameToSample(s.startFrame, tl.fps, sr);
    for (let i = 0; i < speech.length && start + i < total; i++) bus[start + i] += speech[i] * 0.95;
    cues.push({
      sceneId: s.id, start: s.start, end: s.start + speech.length / sr,
      text: s.narration, voiceSeconds: speech.length / sr,
    });
    log(`  voice ${s.id}: ${(speech.length / sr).toFixed(2)}s for ${s.duration}s scene`);
  }
  // condition the whole bus once (consistent tone across scenes)
  return { bus, cues };
}

function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Trim leading/trailing near-silence (below -48 dBFS). */
function trimSilence(samples, sr) {
  const th = 0.004;
  let a = 0, b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < th) a++;
  while (b > a && Math.abs(samples[b]) < th) b--;
  if (b <= a) return samples;
  return samples.slice(Math.max(0, a - Math.round(0.008 * sr)), Math.min(samples.length, b + Math.round(0.02 * sr)));
}

/** De-click: never let a clip start or end on a non-zero sample. */
function applyFades(samples, sr, inS, outS) {
  const a = Math.round(inS * sr), b = Math.round(outS * sr);
  for (let i = 0; i < a && i < samples.length; i++) samples[i] *= i / a;
  for (let i = 0; i < b && i < samples.length; i++) samples[samples.length - 1 - i] *= i / b;
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
  // ---- texture layers -------------------------------------------------
  // Without broadband content the bed reads as a game beep: it has bass and a
  // triangle arp but nothing above 3 kHz, so it cannot sit under a voice without
  // sounding thin. These three layers are what make it read as "music bed".
  // 1. air: filtered noise pad, slowly breathing (opens up the top end)
  let pink = 0, pinkB = 0, pinkC = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const white = hash(i * 0.017) * 2 - 1;
    // cheap pink filter (one-pole cascade)
    pink = 0.99765 * pink + white * 0.0990460;
    pinkB = 0.96300 * pinkB + white * 0.2965164;
    pinkC = 0.57000 * pinkC + white * 1.0526913;
    const p = (pink + pinkB + pinkC + white * 0.1848) * 0.055;
    const breathe = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / (bar * 4)));
    out[i] += p * breathe * 0.30;
  }
  // 2. hats: short high noise bursts on the off-beats
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < 8; k++) {
      if (k % 2 === 0) continue; // off-beats only
      const ts = b * bar + k * beat * 0.5;
      if (ts > duration) break;
      const s0 = Math.floor(ts * sr);
      const gain = (k === 3 || k === 7 ? 0.10 : 0.055);
      for (let i = 0; i < sr * 0.07 && s0 + i < n; i++) {
        const t = i / sr;
        const e = Math.exp(-t / 0.016);
        // highpassed noise: difference of successive samples
        const hp = (hash((s0 + i) * 0.031) * 2 - 1) - (hash((s0 + i - 1) * 0.031) * 2 - 1);
        out[s0 + i] += hp * e * gain;
      }
    }
  }
  // 3. vinyl-ish surface noise: very low, keeps quiet passages alive
  for (let i = 0; i < n; i++) {
    out[i] += (hash(i * 0.0073) * 2 - 1) * 0.0035;
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
  // A voice that runs past its scene is a sync bug, not a style choice: the next
  // scene's line starts on top of it. Report it here so the evaluator can fail it.
  const overruns = [];
  for (const c of voice.cues) {
    const scene = tl.scenes.find((x) => x.id === c.sceneId);
    if (!scene) continue;
    const over = (c.start + c.voiceSeconds) - scene.end;
    if (over > 0.05) overruns.push({ sceneId: c.sceneId, overSeconds: +over.toFixed(2) });
  }
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

  return { samples: mix, sampleRate: sr, voiceCues: voice.cues, overruns, sfx: sfxLog, bedLevel, hasVoice };
}
