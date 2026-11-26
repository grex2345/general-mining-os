#!/usr/bin/env node
/**
 * tanjiro3d.mjs — Round 7 Experiment B: 3D low-poly cinematic Water Breathing.
 *
 * Built on the Round 4 software rasteriser (lowpoly.mjs) + Round 5 rigged figure
 * (character3d.mjs), re-skinned to Tanjiro (burgundy hair, green haori, black
 * trousers) with a katana. Multi-shot camera coverage with cuts (not one dolly),
 * a snow-forest world, and screen-space water-breathing overlays (the anime water
 * is a 2D composite over the 3D render, exactly how scene5 composites snow/shafts).
 *
 *   node experiments/tanjiro3d.mjs [--frames N] [--still F] [--no-voice]
 */
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderScene, makeCamera, lowPolyPost, box, cone, createScene } from '../src/lowpoly.mjs';
import { createFigure, addTube, phonemeToViseme } from '../src/character3d.mjs';
import { poseIdle, poseGait, cameraShake, cameraMove, ease, blinkAt, smoothNoise } from '../src/animation.mjs';
import { gradeFrame } from '../src/cinema.mjs';
import { drawLightShafts, drawHaze } from '../src/vfx.mjs';
import { waterDragon, waterWheel, snow, embers, splash } from '../src/waterfx.mjs';
import { synthesizeScore, battleSfx, mixInto, writeWav, SR } from '../src/score.mjs';
import { readWav, resample, conditionVoice, synthesizeSfx } from '../src/audio.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';
import { rng } from '../src/cartoon.mjs';

const OUT = 'out/tanjiro3d';
fs.mkdirSync(OUT, { recursive: true });
await ensureFonts();
const FPS = 30;
const IW = 420, IH = 746, W = 1080, H = 1920;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const STILL = arg('--still', -1);
const NO_VOICE = process.argv.includes('--no-voice');

/* ------------------------------------------------------- condensed voice */
const LINES = [
  'Before dawn, he swings until his palms bleed.',
  'Water has no shape, so it cannot be broken.',
  'First form. Water Surface Slash!',
  'The boulder splits before the sound arrives.',
  'But the real test comes at night, in the snow.',
  'Then the dragon rises. Water Wheel!',
  'Kindness was never his weakness.',
];
const TEXT = LINES.join(' ');
let voice = null;
if (!NO_VOICE) {
  if (!fs.existsSync(`${OUT}/voice.wav`)) {
    const py = spawnSync('python3', ['voice.py', JSON.stringify({ text: TEXT, out: `${OUT}/voice.wav` })], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (py.status !== 0) { console.error(py.stderr.slice(-800)); process.exit(1); }
    fs.writeFileSync(`${OUT}/voice.json`, py.stdout);
    spawnSync('python3', ['align.py', JSON.stringify({ wav: `${OUT}/voice.wav`, text: TEXT, out: `${OUT}/align.json` })], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
  voice = JSON.parse(fs.readFileSync(`${OUT}/align.json`, 'utf8'));
}
const DUR = voice ? voice.duration + 0.5 : 24;
const TOTAL = arg('--frames', Math.round(DUR * FPS));

// line time boundaries from measured alignment
function lineBounds() {
  if (!voice) return LINES.map((_, i) => [i * 3.4, (i + 1) * 3.4]);
  let off = 0; const b = [];
  for (const s of LINES) { const n = s.split(/\s+/).length; const ws = voice.words.slice(off, off + n); off += n; b.push([ws[0].t, ws[ws.length - 1].t + ws[ws.length - 1].dur]); }
  return b;
}
const LB = lineBounds();

/* ------------------------------------------------------------- the figure */
const TANJIRO = { hair: '#7a2f23', shirt: '#1f6e43', shirtDark: '#175233', trousers: '#20242c', shoe: '#1a1a22', iris: '#8a3b2e', brow: '#3a2018' };
const DEMON = { hair: '#241a30', shirt: '#4b2a6b', shirtDark: '#3a2052', trousers: '#2a2038', shoe: '#1a1420', iris: '#ff5a3c', skin: '#d8c8c0' };

function makeHero(pal = TANJIRO) {
  const fig = createFigure({ palette: pal });
  return fig;
}
function addSword(fig, scene, glow = 0) {
  const sk = fig.skeleton;
  // handle + blade extending from the right hand along its local -Y then out
  addTube(scene, sk, 'handR', { a: [0, 0.02, 0], b: [0, -0.16, 0], r0: 0.022, r1: 0.02, seg: 6, albedo: '#5a1f24' });
  addTube(scene, sk, 'handR', { a: [0, -0.16, 0], b: [0, -0.78, 0.02], r0: 0.018, r1: 0.006, seg: 6, albedo: glow > 0 ? '#9fd0ff' : '#c8d0d8' });
}

/* --------------------------------------------------------------- the world */
function snowWorld(t, { boulder = false, river = false, split = 0 } = {}) {
  const scene = createScene();
  // ground plane (snow) — sortKey:'far' so the terrain pre-pass paints it first
  box(scene, [0, -0.1, 0], [40, 0.2, 40], '#d8e4f0', { sortKey: 'far' });
  const rnd = rng(11);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.3;
    const d = 6 + rnd() * 9;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 3;
    const h = 2.2 + rnd() * 1.6;
    box(scene, [x, h * 0.18, z], [0.22, h * 0.36, 0.22], '#3a2a24', {});
    cone(scene, { base: [x, h * 0.3, z], r: h * 0.42, h: h * 0.8, seg: 6, albedo: '#243a4c' });
    cone(scene, { base: [x, h * 0.62, z], r: h * 0.30, h: h * 0.6, seg: 6, albedo: '#2c4658' });
  }
  if (boulder) {
    // two halves that separate as `split` grows, so the cut reads as a split
    const gap = split * 0.7, tilt = split * 0.25;
    box(scene, [2.4 - 0.42 - gap, 0.7 - split * 0.1, -1], [0.82, 1.4, 1.4], '#8a8a92', { yaw: 0.3 - tilt, roll: -tilt });
    box(scene, [2.4 + 0.42 + gap, 0.7 - split * 0.1, -1], [0.82, 1.4, 1.4], '#9a9aa2', { yaw: 0.3 + tilt, roll: tilt });
    box(scene, [2.4, 1.5 - split * 0.3, -1], [1.2, 0.5, 1.1], '#a2a2aa', { yaw: 0.5, roll: split * 0.4 });
  }
  if (river) box(scene, [0, 0.02, 2.5], [40, 0.06, 3], '#5a90b0', { sortKey: 'far' });
  return scene;
}

const SHADE_NIGHT = {
  key: { dir: (() => { const d = [0.3, 0.6, 0.72]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [0.6, 0.72, 1.0], intensity: 1.0 },
  sky: [0.20, 0.24, 0.40], ground: [0.10, 0.10, 0.15],
  fog: { colour: [0.10, 0.12, 0.19], density: 0.018 }, exposure: 1.08,
  rim: { eye: [0, 1.5, 5], dir: (() => { const d = [-0.6, 0.16, -0.76]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [0.70, 0.82, 1.0], intensity: 2.1, power: 1.7 },
};
const SHADE_DAY = {
  key: { dir: (() => { const d = [0.4, 0.7, 0.5]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [1.0, 0.95, 0.85], intensity: 1.1 },
  sky: [0.4, 0.5, 0.6], ground: [0.2, 0.2, 0.18],
  fog: { colour: [0.6, 0.7, 0.8], density: 0.012 }, exposure: 1.0,
};

/* ------------------------------------------------------------------- shots */
// each shot: time span, world mode, light, camera A->B, figure action, overlay
const SHOTS = [
  { id: 'swing',  t: LB[0], mode: 'forest', light: 'day',   act: 'swing',  cam: { a: { eye: [2.6, 1.5, 4.2], target: [0, 1.0, 0], fov: 42 }, b: { eye: [1.4, 1.3, 3.2], target: [0, 1.1, 0], fov: 38 } } },
  { id: 'river',  t: LB[1], mode: 'river',  light: 'day',   act: 'breathe',cam: { a: { eye: [0.3, 1.9, 5.0], target: [0, 1.05, 0], fov: 42 }, b: { eye: [0.1, 1.5, 3.7], target: [0, 1.15, 0], fov: 37 } }, overlay: 'ribbon' },
  { id: 'slash',  t: LB[2], mode: 'river',  light: 'day',   act: 'slash',  cam: { a: { eye: [-2.2, 0.9, 3.6], target: [0, 1.0, 0], fov: 40 }, b: { eye: [1.6, 1.1, 3.0], target: [0, 1.1, 0], fov: 36 } }, overlay: 'arc', shake: 0.5 },
  { id: 'boulder',t: LB[3], mode: 'boulder',light: 'day',   act: 'stand',  cam: { a: { eye: [2.4, 1.7, 5.2], target: [2.4, 0.9, -1], fov: 40 }, b: { eye: [2.4, 1.4, 3.8], target: [2.4, 0.9, -1], fov: 36 } }, overlay: 'debris', shake: 0.8, noHero: true },
  { id: 'night',  t: LB[4], mode: 'forest', light: 'night', act: 'stand',  cam: { a: { eye: [0.4, 1.5, 5.0], target: [0, 1.05, 0], fov: 42 }, b: { eye: [0.2, 1.4, 3.9], target: [0, 1.1, 0], fov: 38 } } },
  { id: 'dragon', t: LB[5], mode: 'forest', light: 'night', act: 'dragon', cam: { a: { eye: [0, 1.0, 5.5], target: [0, 1.6, 0], fov: 44 }, b: { eye: [0, 2.2, 4.2], target: [0, 1.8, 0], fov: 40 } }, overlay: 'dragon', twist: true },
  { id: 'wheel',  t: [LB[5][1] - 1.0, LB[5][1]], mode: 'forest', light: 'night', act: 'spin', cam: { a: { eye: [3.0, 1.4, 3.0], target: [0, 1.2, 0], fov: 40 }, b: { eye: [-3.0, 1.4, 3.0], target: [0, 1.2, 0], fov: 40 } }, overlay: 'wheel', shake: 0.6 },
  { id: 'resolve',t: LB[6], mode: 'forest', light: 'day',   act: 'idle',   cam: { a: { eye: [0.8, 1.5, 3.4], target: [0, 1.3, 0], fov: 36 }, b: { eye: [0.4, 1.45, 2.6], target: [0, 1.35, 0], fov: 32 } } },
];

function shotAt(t) { for (const s of SHOTS) if (t >= s.t[0] && t < s.t[1]) return s; return SHOTS[SHOTS.length - 1]; }

/* ------------------------------------------------------------------ render */
const big = createCanvas(W, H); const gb = big.getContext('2d');
const dir = `${OUT}/.frames3d`;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

function backdrop(g, light) {
  const grad = g.createLinearGradient(0, 0, 0, IH);
  if (light === 'night') { grad.addColorStop(0, '#0a0e20'); grad.addColorStop(0.5, '#1c2848'); grad.addColorStop(1, '#2a3858'); }
  else { grad.addColorStop(0, '#7ec4e8'); grad.addColorStop(0.6, '#c8e0f0'); grad.addColorStop(1, '#e8f0f4'); }
  g.fillStyle = grad; g.fillRect(0, 0, IW, IH);
  if (light === 'night') {
    const rnd = rng(42); g.fillStyle = 'rgba(232,240,255,0.8)';
    for (let i = 0; i < 60; i++) g.fillRect(rnd() * IW, rnd() * IH * 0.4, 1.5, 1.5);
    const mx = IW * 0.74, my = IH * 0.14;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 60);
    mg.addColorStop(0, 'rgba(232,240,255,0.95)'); mg.addColorStop(0.2, 'rgba(205,220,250,0.5)'); mg.addColorStop(1, 'rgba(160,185,235,0)');
    g.fillStyle = mg; g.fillRect(mx - 60, my - 60, 120, 120);
    g.fillStyle = '#f2f6ff'; g.beginPath(); g.arc(mx, my, 9, 0, Math.PI * 2); g.fill();
  }
}

function renderFrame(i) {
  const t = i / FPS;
  const s = shotAt(t);
  const k = Math.min(1, Math.max(0, (t - s.t[0]) / Math.max(0.1, s.t[1] - s.t[0])));
  const fig = makeHero();
  // action
  if (s.act === 'swing') {
    poseIdle(fig, t, { energy: 0.6 });
    const cyc = (t * 1.5) % 1;
    const sk = fig.skeleton;
    const ang = cyc < 0.4 ? -1.8 : cyc < 0.6 ? 0.9 : -0.4;
    sk.set('upperArmR', ang, 0, 0.3); sk.set('foreArmR', ang * 0.4, 0, 0);
    sk.set('chest', 0, cyc > 0.4 && cyc < 0.6 ? 0.3 : 0, 0);
    fig.state.expr.mouthOpen = cyc > 0.4 && cyc < 0.6 ? 0.5 : 0.05;
  } else if (s.act === 'slash') {
    poseIdle(fig, t, { energy: 0.4 });
    const sk = fig.skeleton; const lunge = ease.inOutCubic(Math.min(1, k * 2));
    sk.set('upperArmR', -1.6 + lunge * 2.4, 0, 0.4); sk.set('chest', 0, lunge * 0.4, 0);
    fig.state.expr.mouthOpen = 0.6;
  } else if (s.act === 'breathe') {
    poseIdle(fig, t, { energy: 1.2 }); fig.state.expr.mouthOpen = 0.1 + 0.1 * Math.sin(t * 2);
  } else if (s.act === 'dragon') {
    poseIdle(fig, t, { energy: 0.5 }); const sk = fig.skeleton;
    sk.set('upperArmR', -1.9, 0, 0.3); fig.state.expr.mouthOpen = 0.7;
  } else if (s.act === 'spin') {
    poseIdle(fig, t, { energy: 0.5 });
    fig.skeleton.bones.get('root').offset = [0, 0, 0];
    fig.skeleton.set('hips', 0, k * Math.PI * 2, 0);
    fig.state.expr.mouthOpen = 0.6;
  } else {
    poseIdle(fig, t, { energy: 0.9 });
  }
  fig.state.blink = blinkAt(t + 0.5, 9);
  fig.skeleton.solve([0, 0, 0]);

  const split = s.mode === 'boulder' ? ease.inOutCubic(Math.max(0, (k - 0.02) / 0.98)) : 0;
  const scene = snowWorld(t, { boulder: s.mode === 'boulder', river: s.mode === 'river', split });
  if (!s.noHero) { fig.draw(scene); addSword(fig, scene, s.overlay === 'dragon' || s.overlay === 'arc' ? 0.6 : 0); }

  // camera. Blend a linear creep into the eased move so velocity is non-zero from
  // frame 0 (a pure ease-in-out starts static and tripped the >=0.4s freeze gate).
  const sh = s.shake ? cameraShake(t, s.shake * Math.max(0, 1 - Math.abs(k - 0.35) * 3), { freq: 6, seed: 4 }) : { x: 0, y: 0, z: 0, roll: 0 };
  const kp = 0.28 * k + 0.72 * ease.inOutCubic(k);
  const m = cameraMove(s.cam.a, s.cam.b, kp, { easeFn: ease.linear });
  // always-on micro handheld drift + a linear zoom creep active from frame 0, so
  // even a wide shot with a distant subject changes every frame (freeze gate).
  const drift = { x: smoothNoise(t * 1.3, 21) * 0.05, y: smoothNoise(t * 1.1 + 5, 22) * 0.04, roll: smoothNoise(t * 0.9, 23) * 0.006 };
  const fovCreep = m.fov * (1 - 0.06 * k);
  const cam = makeCamera({ eye: [m.eye[0] + sh.x + drift.x, m.eye[1] + sh.y + drift.y, m.eye[2] + sh.z], target: m.target, fovDeg: fovCreep, width: IW, height: IH, roll: sh.roll + drift.roll });

  const c = createCanvas(IW, IH); const g = c.getContext('2d');
  backdrop(g, s.light);
  if (s.light === 'night') drawHaze(g, IW, IH, { colour: [0.26, 0.36, 0.6], intensity: 0.07, t, blobs: 3 });
  renderScene(g, scene, cam, {
    width: IW, height: IH, snap: 1, overdraw: 1.1,
    groundPass: (ctx) => {
      if (s.noHero) return;
      const root = fig.skeleton.bones.get('root').offset;
      const p = cam.project([root[0], 0.004, root[2]]);
      if (!p) return;
      const r = Math.max(6, 0.6 * ((cam.f * (IH / 2)) / p[2]));
      const shg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      shg.addColorStop(0, 'rgba(3,5,12,0.5)'); shg.addColorStop(1, 'rgba(3,5,12,0)');
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, 0.36); ctx.translate(-p[0], -p[1]);
      ctx.fillStyle = shg; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.restore();
    },
    shade: s.light === 'night' ? SHADE_NIGHT : SHADE_DAY,
  });
  if (s.light === 'night') drawLightShafts(g, { origin: [IW * 0.74, IH * 0.12], angle: Math.PI * 0.6, spread: 0.9, rays: 10, length: IH, colour: [0.74, 0.84, 1.0], intensity: 0.08, t, seed: 4, sway: 1 });

  // hero's projected position, used to place the screen-space water overlays
  const hp = cam.project([0, 1.2, 0]);
  const hx = hp ? hp[0] * (W / IW) : W / 2, hy = hp ? hp[1] * (H / IH) : H * 0.5;

  lowPolyPost(g, IW, IH, { levels: 22, vignette: 0.32, grain: 0, seed: 11 });
  gb.imageSmoothingEnabled = true;
  gb.drawImage(c, 0, 0, W, H);
  // overlays drawn on the big canvas after upscale
  if (s.overlay === 'dragon') waterDragon(gb, { x: hx, y: hy + 160, scale: 1.5, t, rise: ease.inOutCubic(Math.min(1, k * 1.5)), seed: 5 });
  if (s.overlay === 'wheel') { waterWheel(gb, hx, hy, 240, t * 2, {}); }
  if (s.overlay === 'arc') { splash(gb, hx, hy, (k * 2) % 1, { scale: 2.4 }); }
  if (s.overlay === 'ribbon') waterDragon(gb, { x: hx + 60, y: hy + 200, scale: 0.9, t, rise: 0.6, seed: 3, alpha: 0.7 });
  if (s.overlay === 'debris') { const rnd = rng(31); gb.save(); for (let j = 0; j < 14; j++) { const a = rnd() * Math.PI - Math.PI, v = 120 + rnd() * 200; gb.fillStyle = '#8a8a92'; gb.fillRect(hx + Math.cos(a) * v * k, hy + Math.sin(a) * v * k + 300 * k * k, 16, 14); } gb.restore(); }
  if (s.light === 'night') snow(gb, W, H, t, { count: 90 });
  if (s.id === 'resolve') embers(gb, W, H, t, { count: 24, alpha: 0.5 });
  // grain 0.07 (vs 2D's 0.04): the 3D has large flat sky/snow areas that CRF
  // compresses to identical blocks; a touch more grain keeps every frame distinct.
  gradeFrame(gb, W, H, { vignette: 0.34, grainOpts: { amount: 0.07, seed: i }, bloomOpts: { threshold: 0.8, strength: 0.24, radius: 26 } });
  // caption
  if (voice) captionAt(gb, t);
}
function captionAt(g, t) {
  const words = voice.words; let idx = -1;
  for (let i = 0; i < words.length; i++) if (t >= words[i].t && t < words[i].t + words[i].dur + 0.12) { idx = i; break; }
  if (idx < 0) return;
  const phrase = words.slice(Math.max(0, idx - 2), Math.min(words.length, idx + 3)).map((w) => w.word).join(' ').toLowerCase();
  g.save(); g.textAlign = 'center'; g.font = '800 60px InterTight, sans-serif';
  const y = H * 0.9;
  g.fillStyle = 'rgba(10,8,16,0.55)'; g.fillText(phrase, W / 2 + 3, y + 4);
  g.fillStyle = '#fff'; g.fillText(phrase, W / 2, y); g.restore();
}

const t0 = performance.now();
if (STILL >= 0) {
  renderFrame(STILL);
  fs.writeFileSync(`${OUT}/still-${STILL}.png`, await big.encode('png'));
  console.log('still', STILL, 'written', ((performance.now() - t0)).toFixed(0), 'ms');
} else {
  for (let i = 0; i < TOTAL; i++) {
    renderFrame(i);
    fs.writeFileSync(`${dir}/f${String(i).padStart(5, '0')}.jpg`, await big.encode('jpeg', 92));
    if (i % 100 === 0) console.log(`frame ${i}/${TOTAL} ${((performance.now() - t0) / (i + 1)).toFixed(0)} ms/f`);
  }
  console.log(`rendered ${TOTAL} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  await finishAudio();
}

async function finishAudio() {
  console.log('audio + encode...');
  const run = (args) => new Promise((res, rej) => { const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => e += d); p.on('exit', (c) => c === 0 ? res(e) : rej(new Error(e.slice(-500)))); });
  const N = Math.ceil(DUR * SR); const master = new Float32Array(N);
  let vPeak = 0.8;
  if (voice) {
    await conditionVoice(`${OUT}/voice.wav`, `${OUT}/voice-cond.wav`, { sr: SR });
    const vv = readWav(`${OUT}/voice-cond.wav`); const v = resample(vv.samples, vv.sampleRate, SR);
    mixInto(master, v, 0, 1.0); vPeak = 0; for (let i = 0; i < v.length; i++) vPeak = Math.max(vPeak, Math.abs(v[i]));
  }
  const sections = [
    { t0: 0, t1: LB[2][0], mood: 'pulse' },
    { t0: LB[2][0], t1: LB[4][0], mood: 'action' },
    { t0: LB[4][0], t1: LB[5][0], mood: 'mystery' },
    { t0: LB[5][0], t1: LB[5][1], mood: 'twist' },
    { t0: LB[5][1], t1: DUR, mood: 'resolve' },
  ];
  const score = synthesizeScore({ duration: DUR, sections, seed: 9 });
  for (let i = 0; i < N; i++) master[i] += (score[i] || 0) * 0.4;
  const sfx = new Float32Array(N);
  for (const s of SHOTS) {
    const base = Math.floor(s.t[0] * SR);
    if (s.overlay === 'arc' || s.act === 'slash') mixInto(sfx, battleSfx('slash', { gain: 0.6 }), base + Math.floor(0.3 * (s.t[1] - s.t[0]) * SR), 1);
    if (s.overlay === 'debris') { mixInto(sfx, battleSfx('crack', { gain: 0.7 }), base, 1); mixInto(sfx, battleSfx('rumble', { gain: 0.5 }), base, 1); }
    if (s.twist) mixInto(sfx, battleSfx('sting', { gain: 0.8 }), base, 1);
    if (s.overlay === 'dragon') mixInto(sfx, battleSfx('roar', { gain: 0.6 }), base, 1);
    if (s.overlay === 'wheel') mixInto(sfx, battleSfx('slash', { gain: 0.6 }), base, 1);
    if (s.light === 'night') mixInto(sfx, battleSfx('wind', { gain: 0.3 }), base, 1);
  }
  let sPeak = 0; for (let i = 0; i < N; i++) sPeak = Math.max(sPeak, Math.abs(sfx[i]));
  const sg = sPeak > 0 ? Math.min(1, (0.7 * vPeak) / sPeak) : 1;
  for (let i = 0; i < N; i++) master[i] += sfx[i] * sg;
  writeWav(`${OUT}/mix.wav`, master, SR);
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/mix.wav`, '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', String(SR), '-ac', '2', `${OUT}/mix-norm.wav`]);
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', `${OUT}/exp7b-silent.mp4`]);
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', `${OUT}/exp7b-silent.mp4`, '-i', `${OUT}/mix-norm.wav`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', `${OUT}/exp7b-tanjiro-3d.mp4`]);
  console.log('wrote', `${OUT}/exp7b-tanjiro-3d.mp4`);
}