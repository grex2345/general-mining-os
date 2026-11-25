#!/usr/bin/env node
/**
 * scene5.mjs — Round 5, the combined scene.
 *
 * Everything from this round in one shot: the rigged character inside the Round 4
 * low-poly environment, lit by the moon and a platform lamp, with volumetric
 * shafts, falling snow, autumn-grade colour, depth of field, a moving camera,
 * a spoken line with lip-sync, and a mixed soundtrack.
 *
 * This is the piece that answers "does it hold together", not "does each part
 * work". Every subsystem here is independently measured elsewhere.
 *
 *   node experiments/scene5.mjs [--frames N] [--no-voice]
 */
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderScene, makeCamera, lowPolyPost, screenToPlane } from '../src/lowpoly.mjs';
import { createFigure, figureScene, phonemeToViseme } from '../src/character3d.mjs';
import { poseIdle, poseGait, cameraShake, blinkAt, cameraMove, ease } from '../src/animation.mjs';
import { gradeFrame, fitFov } from '../src/cinema.mjs';
import { drawLightShafts, drawHaze } from '../src/vfx.mjs';
import { buildWorld, LIGHTS, STAGE, cameraAt, DOG_AT, groundAt } from '../src/scenes/lastTrain.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';
import { rng } from '../src/cartoon.mjs';

const OUT = 'out';
const FPS = 30;
const IW = 480, IH = 853;
const W = 1080, H = 1920;
const v = IW / 360;

const LINE = 'The last train left an hour ago. I am still here.';
const USE_VOICE = !process.argv.includes('--no-voice');
const FRAMES_ARG = process.argv.indexOf('--frames');
const FRAMES = FRAMES_ARG > -1 ? Number(process.argv[FRAMES_ARG + 1]) : 150;

await ensureFonts();
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------- voice */

let voice = null;
if (USE_VOICE) {
  console.log('synthesising speech...');
  const py = spawnSync('python3', ['voice.py', JSON.stringify({ text: LINE, out: `${OUT}/exp5-scene.wav` })], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (py.status === 0) {
    voice = JSON.parse(py.stdout);
    console.log(`  ${voice.duration.toFixed(2)}s, ${voice.words.length} words`);
  } else {
    console.warn('  voice failed, continuing silently');
  }
}

const timeline = [];
if (voice) {
  for (const w of voice.words) {
    const ph = w.phonemes?.length ? w.phonemes : ['ə'];
    const slice = w.dur / ph.length;
    ph.forEach((p, i) => timeline.push({
      t0: w.t + i * slice, t1: w.t + (i + 1) * slice, v: phonemeToViseme(p),
    }));
  }
}
const visemeAt = (t) => {
  for (const e of timeline) if (t >= e.t0 && t < e.t1) return e.v;
  return { mouthOpen: 0 };
};

/* -------------------------------------------------------------- the scene */

const SHADE = {
  key: { dir: (() => { const d = [0.28, 0.60, 0.74]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [0.62, 0.74, 1.0], intensity: 1.05 },
  sky: [0.16, 0.20, 0.32],
  ground: [0.07, 0.07, 0.11],
  fog: { colour: [0.095, 0.115, 0.175], density: 0.028 },
  exposure: 0.95,
};

/** The character takes the dog's staged spot in the Round 4 environment. */
const HERO = DOG_AT;

const backdrop = (ctx, w, h) => {
  const k = w / 360;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#141d38');
  g.addColorStop(0.28, '#233252');
  g.addColorStop(0.46, '#3b4d72');
  g.addColorStop(0.58, '#3f4d6d');
  g.addColorStop(1, '#12172a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(226,236,255,${(0.18 + r() * 0.7).toFixed(2)})`;
    ctx.fillRect((r() * w) | 0, (r() * h * 0.46) | 0, Math.max(1, k | 0), Math.max(1, k | 0));
  }
  // moon
  const mx = STAGE.moon[0] * k, my = STAGE.moon[1] * k, mr = 52 * k;
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
  mg.addColorStop(0, 'rgba(232,240,255,0.95)');
  mg.addColorStop(0.18, 'rgba(205,220,250,0.5)');
  mg.addColorStop(1, 'rgba(160,185,235,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  ctx.fillStyle = '#f2f6ff';
  ctx.beginPath();
  ctx.arc(mx, my, 8 * k, 0, Math.PI * 2);
  ctx.fill();
};

function snowfall(ctx, w, h, t, seed = 5) {
  const r = rng(seed);
  const k = w / 360;
  for (let i = 0; i < 80; i++) {
    const speed = 0.3 + r() * 0.8;
    const x0 = r() * w;
    const ph = r() * 100;
    const y = ((t * speed * 26 + ph * 7) % (h + 30)) - 15;
    const drift = Math.sin(t * 0.8 + ph) * 6 * k;
    ctx.fillStyle = `rgba(232,240,255,${(0.30 + r() * 0.5).toFixed(2)})`;
    const sz = (r() > 0.85 ? 2 : 1) * k;
    ctx.fillRect((x0 + drift) | 0, y | 0, sz, sz);
  }
}

/* -------------------------------------------------------------- the camera */

// Framed on the character's real staged position, computed after HERO exists:
// a wide establishing angle that pushes in to a medium as the line plays.
const camA = { eye: [HERO[0] + 1.30, 1.95, HERO[2] + 3.30], target: [HERO[0], 1.05, HERO[2]], fov: 44 };
const camB = { eye: [HERO[0] + 0.55, 1.45, HERO[2] + 2.05], target: [HERO[0], 1.02, HERO[2]], fov: 38 };

const dir = `${OUT}/.scene5-frames`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const big = createCanvas(W, H);
const gb = big.getContext('2d');
const t0 = performance.now();

for (let i = 0; i < FRAMES; i++) {
  const t = i / FPS;
  const k = i / Math.max(1, FRAMES - 1);

  /* --- the figure ------------------------------------------------------- */
  const fig = createFigure();
  // stands still, breathing, then turns slightly toward camera at the end
  poseIdle(fig, t, { energy: 0.9 });
  fig.skeleton.solve([0, 0, 0]);
  // translate the whole rig to the staged position by moving `root`
  fig.skeleton.bones.get('root').offset = [HERO[0], 0, HERO[2]];
  fig.skeleton.solve([0, 0, 0]);

  if (t < (voice?.duration ?? 0) + 0.2) {
    const vm = visemeAt(t);
    fig.state.expr.mouthOpen = 0.05 + (vm.mouthOpen ?? 0) * 0.8;
    fig.state.expr.mouthWide = vm.mouthWide ?? 0;
    fig.state.expr.mouthCurve = 0.10;
  } else {
    fig.state.expr.mouthOpen = 0.02;
  }
  fig.state.expr.browRaise = Math.sin(t * 1.7) * 0.08 + 0.05;
  fig.state.blink = blinkAt(t + 0.8, 9);
  fig.state.look = [Math.sin(t * 0.4) * 0.2, 0.02];

  /* --- world ------------------------------------------------------------ */
  const scene = buildWorld(t, { dog: false });
  // rebuild the figure into the same scene by drawing it there
  fig.draw(scene);

  /* --- camera ----------------------------------------------------------- */
  const sh = cameraShake(t, 0.22, { freq: 4.2, seed: 6 });
  const m = cameraMove(camA, camB, ease.inOutCubic(k * 0.96), { easeFn: ease.linear });
  // Framing rule: the CHARACTER must occupy between 22% and 46% of the frame
  // height. Auto-fitting the FOV alone collapsed the shot to a close-up,
  // because the solver happily narrowed the lens until the figure filled it.
  // Scale is a distance decision; the lens only guarantees it fits.
  const head = fig.skeleton.pos('head');
  const figureH = head[1] + 0.36;                       // top of the skull
  const cam = makeCamera({
    eye: [m.eye[0] + sh.x, m.eye[1] + sh.y, m.eye[2] + sh.z],
    target: m.target, fovDeg: m.fov, width: IW, height: IH, roll: sh.roll,
  });
  const top = cam.project([HERO[0], figureH, HERO[2]]);
  const bot = cam.project([HERO[0], 0, HERO[2]]);
  const frac = top && bot ? (bot[1] - top[1]) / IH : 0.4;
  const want = 0.34;
  if (frac > 0.46 || frac < 0.22) {
    // pull the eye back along the view axis until the figure is the right size
    const dirv = [cam.eye[0] - cam.target[0], cam.eye[1] - cam.target[1], cam.eye[2] - cam.target[2]];
    const len = Math.hypot(...dirv);
    const scaleF = Math.min(2.2, Math.max(0.6, frac / want));
    cam.eye = [
      cam.target[0] + dirv[0] * scaleF,
      cam.target[1] + dirv[1] * scaleF,
      cam.target[2] + dirv[2] * scaleF,
    ];
    cam.rebase();
  }

  /* --- render ----------------------------------------------------------- */
  const c = createCanvas(IW, IH);
  const g = c.getContext('2d');
  backdrop(g, IW, IH);
  drawHaze(g, IW, IH, { colour: [0.26, 0.36, 0.60], intensity: 0.075, t, blobs: 4 });

  renderScene(g, scene, cam, {
    width: IW, height: IH, snap: 1, overdraw: 1.1,
    groundPass: (ctx) => {
      // skeleton.pos() is rig-LOCAL; the root bone carries the world offset.
      // Projecting the local position put the shadow at the world origin, a
      // metre to the left of the character.
      const hip = fig.skeleton.pos('hips');
      const root = fig.skeleton.bones.get('root').offset;
      const p = cam.project([hip[0] + root[0], 0.004, hip[2] + root[2]]);
      if (!p) return;
      const r = Math.max(8, 0.62 * ((cam.f * (IH / 2)) / p[2]));
      const sh = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      sh.addColorStop(0, 'rgba(3,5,12,0.55)');
      sh.addColorStop(0.5, 'rgba(3,5,12,0.22)');
      sh.addColorStop(1, 'rgba(3,5,12,0)');
      ctx.save();
      ctx.translate(p[0], p[1]); ctx.scale(1, 0.36); ctx.translate(-p[0], -p[1]);
      ctx.fillStyle = sh;
      ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      ctx.restore();
    },
    shade: {
      ...SHADE,
      points: LIGHTS({ scale: 0.55 }),
      // Cool moon-side rim traces the silhouette against the night; without it
      // the flat-shaded hero has no edge contrast and reads as cardboard.
      rim: {
        eye: cam.eye,
        dir: (() => { const d = [-0.62, 0.16, -0.76]; const l = Math.hypot(...d); return d.map((x) => x / l); })(),
        colour: [0.62, 0.76, 1.0], intensity: 1.75, power: 1.9,
      },
    },
  });

  drawLightShafts(g, {
    origin: [(STAGE.moon[0] + 28) * v, (STAGE.moon[1] - 6) * v],
    angle: Math.PI * 0.60, spread: 1.0, rays: 12, length: IH * 1.05,
    colour: [0.74, 0.84, 1.0], intensity: 0.10, t, seed: 4, sway: 1,
  });

  // lamp glow + volumetric cone
  const lamp = LIGHTS()[0].pos;
  const lp = cam.project(lamp);
  if (lp) {
    const foot = cam.project([lamp[0], 0.05, lamp[2]]);
    if (foot) {
      const cg = g.createLinearGradient(lp[0], lp[1], foot[0], foot[1]);
      cg.addColorStop(0, 'rgba(255,206,140,0.24)');
      cg.addColorStop(1, 'rgba(255,180,110,0)');
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(lp[0] - 5 * v, lp[1]);
      g.lineTo(lp[0] + 5 * v, lp[1]);
      g.lineTo(foot[0] + 52 * v, foot[1]);
      g.lineTo(foot[0] - 44 * v, foot[1]);
      g.closePath();
      g.fill();
      g.restore();
    }
    const rad = 46 * v;
    const gg = g.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], rad);
    gg.addColorStop(0, 'rgba(255,214,150,0.45)');
    gg.addColorStop(1, 'rgba(255,160,90,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gg;
    g.fillRect(lp[0] - rad, lp[1] - rad, rad * 2, rad * 2);
    g.restore();
  }

  snowfall(g, IW, IH, t);
  lowPolyPost(g, IW, IH, { levels: 20, vignette: 0.34, grain: 0, seed: 11 });

  /* --- grade at output size -------------------------------------------- */
  gb.imageSmoothingEnabled = false;     // keep the low-poly edges crisp
  gb.drawImage(c, 0, 0, W, H);
  gradeFrame(gb, W, H, {
    dof: { focusY: 0.50, range: 0.30, strength: 0.28, maxBlur: 8 },
    bloomOpts: { threshold: 0.80, strength: 0.26, radius: 30 },
    grainOpts: { amount: 0.055, seed: i },
    ca: 1.0, vignette: 0.36,
  });

  // subtitle
  if (voice && t < voice.duration) {
    gb.save();
    gb.textAlign = 'center';
    const kk = W / 360;
    gb.font = `500 ${Math.round(17 * kk)}px "DejaVu Sans", sans-serif`;
    const words = LINE.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (gb.measureText(test).width > W * 0.80) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    lines.forEach((l, idx) => {
      // Broadcast subs sit in the lower safe area, not at 80%: at 0.795 the
      // band covered the character's feet in this framing.
      const y = H * 0.905 + idx * 30 * kk;
      const tw = gb.measureText(l).width;
      gb.fillStyle = 'rgba(6,8,14,0.5)';
      gb.fillRect(W / 2 - tw / 2 - 10 * kk, y - 20 * kk, tw + 20 * kk, 27 * kk);
      gb.fillStyle = 'rgba(228,238,255,0.92)';
      gb.fillText(l, W / 2, y);
    });
    gb.restore();
  }

  fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, await big.encode('png'));
  if (i === FRAMES - 1) fs.writeFileSync(`${OUT}/exp5-scene.png`, await big.encode('png'));
}

const msPerFrame = (performance.now() - t0) / FRAMES;

/* ---------------------------------------------------------------- audio */

const bed = `${OUT}/.scene5-bed.wav`;
{
  const rate = 22050;
  const n = Math.floor((FRAMES / FPS) * rate);
  const samples = new Int16Array(n);
  let lp = 0, lp2 = 0, s = 0x2468ace;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const white = ((s >>> 0) / 4294967296) * 2 - 1;
    lp += (white - lp) * 0.02; lp2 += (lp - lp2) * 0.05;
    const tt = i / rate;
    const env = 0.55 + 0.45 * Math.sin(tt * 0.7) * Math.sin(tt * 0.23 + 1.1);
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(lp2 * 6.0 * env * 0.18 * 32767)));
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(bed, buf);
}

const mixOut = `${OUT}/exp5-scene-mix.mp3`;
{
  const inputs = voice ? ['-i', `${OUT}/exp5-scene.wav`, '-i', bed] : ['-i', bed];
  const filter = voice
    ? '[1:a]volume=1.0[a];[0:a]volume=1.0[b];[a][b]amix=inputs=2:duration=longest:weights=0.4 1.0,alimiter=limit=0.95'
    : '[0:a]alimiter=limit=0.95';
  await new Promise((res, rej) => {
    const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...inputs,
      '-filter_complex', filter, '-c:a', 'libmp3lame', '-b:a', '192k', mixOut],
    { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-800)))));
  });
}

const videoOut = `${OUT}/exp5-scene.mp4`;
await new Promise((res, rej) => {
  const p = spawn(FFMPEG, [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`,
    '-i', mixOut, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', videoOut,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-800)))));
});

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(bed, { force: true });

console.log(`scene       ${FRAMES} frames, ${Math.round(msPerFrame)} ms/frame`);
console.log(`voice       ${voice ? voice.duration.toFixed(2) + ' s' : 'none'}`);
console.log(`wrote       ${videoOut}`);
console.log(`            ${mixOut}`);
