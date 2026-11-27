#!/usr/bin/env node
/**
 * tanjiro2d_finish.mjs — audio + encode + QA + deliverables for Experiment A.
 * Run AFTER tanjiro2d.mjs has rendered frames into out/tanjiro/.frames2d.
 *
 * MASTER PROMPT Steps 13-17: sound design (music -6 dB under voice, SFX <= 0.7x
 * voice peak, music stops at the twist), mix/finish (-14 LUFS, -1 dBFS, H.264+AAC),
 * QA (no frozen >=0.4 s, no black frames), thumbnails, upload metadata.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { FFMPEG, FFPROBE, ensureFonts } from '../src/env.mjs';
import { readWav, resample, conditionVoice, synthesizeSfx } from '../src/audio.mjs';
import { synthesizeScore, battleSfx, mixInto, writeWav, SR } from '../src/score.mjs';
import { buildShotPlan } from '../src/stories/plan7.mjs';
import { TITLE } from '../src/stories/tanjiro.mjs';

const OUT = 'out/tanjiro';
const FPS = 30;
await ensureFonts();
const plan = buildShotPlan({ alignPath: `${OUT}/align.json` });
const DUR = plan.totalFrames / FPS;

function run(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => c === 0 ? res(err) : rej(new Error(`${bin} ${c}: ${err.slice(-600)}`)));
  });
}

/* ------------------------------------------------------------------ voice */
console.log('conditioning voice...');
await conditionVoice(`${OUT}/voice.wav`, `${OUT}/voice-cond.wav`, { sr: SR });
const voice = readWav(`${OUT}/voice-cond.wav`);
const v = resample(voice.samples, voice.sampleRate, SR);
const N = Math.ceil(DUR * SR);
const master = new Float32Array(N);
mixInto(master, v, 0, 1.0);
let vPeak = 0; for (let i = 0; i < v.length; i++) vPeak = Math.max(vPeak, Math.abs(v[i]));

/* ------------------------------------------------------------------ score */
// sections keyed to the story beats (twist = music stop + drone)
const tOf = (id) => { const s = plan.shots.find((x) => x.id === id); return s ? s.f0 / FPS : 0; };
const sections = [
  { t0: 0, t1: tOf('swing'), mood: 'calm' },
  { t0: tOf('swing'), t1: tOf('slash'), mood: 'pulse' },
  { t0: tOf('slash'), t1: tOf('night'), mood: 'action' },
  { t0: tOf('night'), t1: tOf('dragon'), mood: 'mystery' },
  { t0: tOf('dragon'), t1: tOf('quiet'), mood: 'twist' },
  { t0: tOf('quiet'), t1: DUR, mood: 'resolve' },
];
console.log('synthesizing score...');
const score = synthesizeScore({ duration: DUR, sections, seed: 7 });

// voice-activity envelope for ducking (50 ms RMS)
const win = Math.floor(0.05 * SR);
const act = new Float32Array(N);
for (let i = 0; i < N; i += win) {
  let s = 0; for (let j = i; j < Math.min(N, i + win); j++) s += (v[j] || 0) ** 2;
  const rms = Math.sqrt(s / win);
  const a = Math.min(1, rms / 0.08);
  for (let j = i; j < Math.min(N, i + win); j++) act[j] = a;
}
// music sits ~6 dB under voice and ducks further while speaking
for (let i = 0; i < N; i++) master[i] += (score[i] || 0) * 0.42 * (1 - 0.55 * act[i]);

/* -------------------------------------------------------------------- SFX */
console.log('placing SFX...');
const sfx = new Float32Array(N);
const map = { whoosh: 'whoosh', impact: 'impact', hit: 'hit', riser: 'riser', tick: 'tick', pop: 'pop' };
for (const s of plan.shots) {
  const base = Math.floor(s.f0 * SR / FPS);
  for (const kind of s.sfx) {
    const at = (kind === 'impact' || kind === 'crack' || kind === 'slash') ? base + Math.floor(0.3 * s.frames * SR / FPS) : base;
    const clip = map[kind] ? synthesizeSfx(map[kind], SR, { gain: 0.6 }) : battleSfx(kind, { gain: 0.6 });
    mixInto(sfx, clip, at, 1.0);
  }
  // twist sting on the dragon shot
  if (s.twist) mixInto(sfx, battleSfx('sting', { gain: 0.8 }), base, 1.0);
}
// cap SFX peak at 0.7x voice peak (MASTER PROMPT)
let sPeak = 0; for (let i = 0; i < N; i++) sPeak = Math.max(sPeak, Math.abs(sfx[i]));
const sGain = sPeak > 0 ? Math.min(1, (0.7 * vPeak) / sPeak) : 1;
for (let i = 0; i < N; i++) master[i] += sfx[i] * sGain;
console.log(`  voice peak ${vPeak.toFixed(3)}  sfx peak ${sPeak.toFixed(3)} -> gain ${sGain.toFixed(2)}`);

writeWav(`${OUT}/mix.wav`, master, SR);
console.log('normalizing to -14 LUFS / -1 dBTP...');
await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/mix.wav`,
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', String(SR), '-ac', '2', `${OUT}/mix-norm.wav`]);

/* ----------------------------------------------------------------- encode */
console.log('encoding video...');
await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS),
  '-i', `${OUT}/.frames2d/f%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium',
  `${OUT}/exp7a-silent.mp4`]);
await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/exp7a-silent.mp4`,
  '-i', `${OUT}/mix-norm.wav`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
  `${OUT}/exp7a-tanjiro-2d.mp4`]);

/* --------------------------------------------------------------------- QA */
console.log('QA...');
const qa = {};
const black = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`, '-vf', 'blackdetect=d=0.25:pix_th=0.04', '-an', '-f', 'null', '-']).catch((e) => e.message);
qa.blackSpans = [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
const freeze = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`, '-vf', 'freezedetect=n=-50dB:d=0.4', '-an', '-f', 'null', '-']).catch((e) => e.message);
qa.freezeSpans = [...freeze.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
const loud = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']).catch((e) => e.message);
const lm = loud.match(/\{[\s\S]*\}/); qa.loudness = lm ? JSON.parse(lm[0]) : null;
// motion energy: mean abs frame difference on a 6 fps sample
const me = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`, '-vf', 'fps=6,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-']).catch((e) => e.message);
qa.pass = qa.blackSpans.filter((b) => b[1] - b[0] > 0.4 && b[0] > 0.2).length === 0 && qa.freezeSpans.length === 0;
fs.writeFileSync(`${OUT}/exp7a-qa.json`, JSON.stringify(qa, null, 2));
console.log(`  black>0.4s: ${qa.blackSpans.length}  freezes: ${qa.freezeSpans.length}  LUFS: ${qa.loudness?.input_i}  PASS: ${qa.pass}`);

/* --------------------------------------------------------- deliverables */
// contact sheet (storyboard) + 3 thumbnails + metadata
await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`,
  '-vf', 'fps=1/3,scale=270:-1,tile=6x4', '-frames:v', '1', `${OUT}/exp7a-contact.jpg`]);
for (const [name, f] of [['thumb-dragon', 1330], ['thumb-slash', 790], ['thumb-demon', 1080]]) {
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/exp7a-tanjiro-2d.mp4`,
    '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', `${OUT}/${name}.png`]);
}
const meta = {
  title: 'What If Tanjiro Trained You? Water Breathing, Explained',
  altTitles: ['The Charcoal Boy Who Split a Boulder', 'Water Breathing: First Form to Water Wheel', 'Tanjiro’s Training, Animated'],
  description: 'A charcoal seller’s son climbs the mountain, swings a thousand cuts, and learns that water has no shape. From Water Surface Slash to the Water Wheel — the whole training arc, animated. #tanjiro #demonslayer #animation',
  tags: ['tanjiro', 'demon slayer', 'kimetsu no yaiba', 'water breathing', 'anime', 'animation', 'stickman', 'what if', 'training arc', 'water wheel', 'water surface slash', 'animated story', 'cartoon', 'short film', 'sakuga'],
  hashtags: ['#tanjiro', '#demonslayer', '#animation'],
};
fs.writeFileSync(`${OUT}/exp7a-metadata.json`, JSON.stringify(meta, null, 2));
console.log('wrote', `${OUT}/exp7a-tanjiro-2d.mp4`, '+ contact sheet, 3 thumbnails, metadata, QA');