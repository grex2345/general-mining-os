#!/usr/bin/env node
/**
 * character.mjs — Round 5 driver for the character system.
 *
 * Deliverables (studio/out, copied to research/artifacts/round5):
 *   exp5-character.png      full figure, 3/4 view, cinematic light + grade
 *   exp5-expressions.png    9 expressions on one face, rendered from the same rig
 *   exp5-poses.png          several poses: idle, walk contact, run, jump, impact, guard
 *   exp5-walk.mp4           a walk cycle, looping, side view
 *   exp5-impact.mp4         an action beat with shake, flash, speed lines, motion blur
 *   exp5-turntable.mp4      the character rotating, for judging the model
 *
 *   node experiments/character.mjs [--frames N]
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderScene, makeCamera, lowPolyPost } from '../src/lowpoly.mjs';
import { createFigure, EXPRESSION_PRESETS, figureScene } from '../src/character3d.mjs';
import {
  poseGait, poseJump, poseImpact, poseIdle, cameraShake, cameraMove, blinkAt, ease, traumaDecay,
} from '../src/animation.mjs';
import { gradeFrame, speedLines, impactFlash, motionBlurStack, fitFov } from '../src/cinema.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';

const OUT = 'out';
const FPS = 30;
const RES = Number(process.env.RES || 480);       // internal render width
const W = 1080, H = 1920;
const IW = RES, IH = Math.round(RES * 16 / 9);
const v = IW / 360;

const LIGHT = {
  key: { dir: (() => { const d = [0.46, 0.60, 0.66]; const l = Math.hypot(...d); return d.map((x) => x / l); })(), colour: [1.0, 0.95, 0.88], intensity: 1.02 },
  sky: [0.30, 0.34, 0.48],
  ground: [0.10, 0.10, 0.14],
  fog: { colour: [0.075, 0.090, 0.140], density: 0.020 },
  exposure: 0.92,
};
const RIM = [{ pos: [-1.6, 1.9, -2.2], colour: [0.55, 0.72, 1.0], intensity: 1.5, radius: 3.0 }];

function groundPlane(scene, tint = [0.30, 0.34, 0.44]) {
  scene.add([[-6, 0, -6], [6, 0, -6], [6, 0, 6], [-6, 0, 6]],
    { normal: null, doubleSided: true, sortKey: 'far', albedo: tint });
}

/** A backdrop wall with a soft falloff, so the figure is not floating in void. */
function backdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#101828');
  g.addColorStop(0.42, '#243049');
  g.addColorStop(0.72, '#2d3a55');
  g.addColorStop(1, '#0e1420');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = ctx.createRadialGradient(w * 0.62, h * 0.30, 0, w * 0.62, h * 0.30, w * 0.9);
  r.addColorStop(0, 'rgba(120,150,205,0.16)');
  r.addColorStop(1, 'rgba(120,150,205,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}

/** Render one figure frame into a fresh canvas at internal resolution. */
function renderFigure(fig, cam, { width = IW, height = IH, shade = LIGHT, ground = true, post = true } = {}) {
  fig.skeleton.solve([0, 0, 0]);
  const scene = figureScene(fig);
  if (ground) groundPlane(scene);
  const c = createCanvas(width, height);
  const g = c.getContext('2d');
  backdrop(g, width, height);
  // contact shadow: without it, dark trousers disappear into a dark floor. The
  // shadow is what tells the eye the feet are ON something.
  {
    const hip = fig.skeleton.pos('hips');
    const p = cam.project([hip[0], 0.004, hip[2]]);
    if (p) {
      // 0.42 m radius in world units -> pixels at that depth. The first
      // version used an ad-hoc pixel formula and produced a 270 px smear.
      const r = Math.max(8, 0.42 * ((cam.f * (height / 2)) / p[2]));
      const sh = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      sh.addColorStop(0, 'rgba(4,6,12,0.62)');
      sh.addColorStop(0.55, 'rgba(4,6,12,0.28)');
      sh.addColorStop(1, 'rgba(4,6,12,0)');
      g.save();
      g.translate(p[0], p[1]);
      g.scale(1, 0.34);
      g.translate(-p[0], -p[1]);
      g.fillStyle = sh;
      g.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      g.restore();
    }
  }
  renderScene(g, scene, cam, {
    width, height, snap: 1, overdraw: 1.06,
    shade: { ...shade, points: RIM },
  });
  if (post) lowPolyPost(g, width, height, { levels: 40, vignette: 0.22, grain: 0, seed: 3 });
  return c;
}

function upscale(small, w = W, h = H) {
  const big = createCanvas(w, h);
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = true;          // the character shots are not PS1-styled
  g.drawImage(small, 0, 0, w, h);
  return big;
}

const CAP = (ctx, text, sub) => {
  const k = W / 360;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(26 * k)}px "DejaVu Sans", sans-serif`;
  const y = H * 0.795;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(6,8,14,0.55)';
  ctx.fillRect(W / 2 - tw / 2 - 16 * k, y - 26 * k, tw + 32 * k, 42 * k);
  ctx.fillStyle = '#ffd84d';
  ctx.fillText(text, W / 2, y);
  if (sub) {
    ctx.font = `400 ${Math.round(17 * k)}px "DejaVu Sans", sans-serif`;
    ctx.fillStyle = 'rgba(214,226,248,0.85)';
    ctx.fillText(sub, W / 2, y + 34 * k);
  }
  ctx.restore();
};

/* ------------------------------------------------------------------- stills */

async function stills() {
  // 1. the hero character
  {
    const fig = createFigure();
    poseIdle(fig, 0.8);
    fig.setExpression('neutral');
    fig.state.look = [0.15, 0.05];
    const cam = makeCamera({ eye: [1.05, 1.28, 2.30], target: [0, 0.94, 0], fovDeg: 40, width: IW, height: IH });
    const small = renderFigure(fig, cam);
    const big = upscale(small);
    gradeFrame(big.getContext('2d'), W, H, {
      dof: { focusY: 0.42, range: 0.30, strength: 0.5, maxBlur: 9 },
      bloomOpts: { threshold: 0.78, strength: 0.22, radius: 26 },
      grainOpts: { amount: 0.045, seed: 5 },
      ca: 1.1, vignette: 0.30,
    });
    CAP(big.getContext('2d'), 'round 5 · character', 'procedural mesh · 26-joint rig · IK · 480→1080');
    fs.writeFileSync(`${OUT}/exp5-character.png`, await big.encode('png'));
  }

  // 2. expressions
  {
    const names = ['neutral', 'happy', 'laughing', 'surprised', 'angry', 'sad', 'confused', 'thinking', 'scared'];
    const cw = 360, ch = 460;
    const sheet = createCanvas(cw * 3, ch * 3);
    const sg = sheet.getContext('2d');
    names.forEach((name, i) => {
      const fig = createFigure();
      poseIdle(fig, 1.1 + i * 0.3);
      fig.setExpression(name);
      fig.state.look = [0.10, 0.0];
      // close-up: the same rig, just a tighter camera
      const cam = makeCamera({ eye: [0.30, 1.60, 0.86], target: [0, 1.53, 0], fovDeg: 34, width: cw, height: ch });
      const small = renderFigure(fig, cam, { width: cw, height: ch, ground: false });
      const x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
      sg.drawImage(upscale(small, cw, ch), x, y);
      sg.font = '600 15px "DejaVu Sans"';
      sg.fillStyle = 'rgba(0,0,0,0.62)';
      sg.fillRect(x + 5, y + 5, 92, 20);
      sg.fillStyle = '#ffd84d';
      sg.fillText(name, x + 10, y + 20);
    });
    fs.writeFileSync(`${OUT}/exp5-expressions.png`, await sheet.encode('png'));
  }

  // 3. poses
  {
    const poses = [
      ['idle', (f) => poseIdle(f, 2.0)],
      ['walk contact', (f) => poseGait(f, 0.15, { mode: 'walk' })],
      ['run airborne', (f) => poseGait(f, 0.62, { mode: 'run' })],
      ['jump apex', (f) => poseJump(f, 0.50)],
      ['impact', (f) => poseImpact(f, 0.42, { power: 1 })],
      ['guard', (f) => poseImpact(f, 0.12, { power: 1 })],
    ];
    const cw = 340, ch = 560;
    const sheet = createCanvas(cw * 3, ch * 2);
    const sg = sheet.getContext('2d');
    poses.forEach(([label, fn], i) => {
      const fig = createFigure();
      fn(fig);
      fig.setExpression(i >= 4 ? 'determined' : i === 3 ? 'surprised' : 'neutral');
      const cam = makeCamera({ eye: [1.85, 1.10, 2.25], target: [0, 0.86, 0], fovDeg: 40, width: cw, height: ch });
      const small = renderFigure(fig, cam, { width: cw, height: ch });
      const x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
      sg.drawImage(upscale(small, cw, ch), x, y);
      sg.font = '600 15px "DejaVu Sans"';
      sg.fillStyle = 'rgba(0,0,0,0.62)';
      sg.fillRect(x + 5, y + 5, 118, 20);
      sg.fillStyle = '#ffd84d';
      sg.fillText(label, x + 10, y + 20);
    });
    fs.writeFileSync(`${OUT}/exp5-poses.png`, await sheet.encode('png'));
  }
}

/* -------------------------------------------------------------------- clips */

function ffmpegFrom(dir, out, fps = FPS) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, [
      '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%04d.png`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(err.slice(-800)))));
  });
}

async function clip(name, frames, drawFrame, { fps = FPS } = {}) {
  const dir = `${OUT}/.${name}-frames`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const big = createCanvas(W, H);
  for (let i = 0; i < frames; i++) {
    drawFrame(i, big);
    fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, await big.encode('png'));
  }
  await ffmpegFrom(dir, `${OUT}/${name}.mp4`, fps);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** A looping walk: the figure stays put, the camera trucks, the world scrolls. */
async function walkClip(n = 60) {
  const camA = { eye: [2.45, 1.05, 0.30], target: [0, 0.86, 0], fov: 36 };
  const camB = { eye: [1.95, 1.10, 1.05], target: [0, 0.88, 0], fov: 38 };
  // NOTE: the callback must draw into the canvas clip() passes in. An earlier
  // version declared its own `big` here, shadowed the parameter, and produced a
  // 54-frame clip of pure black at 6 KB — the render was fine, the frames just
  // went to a canvas that was never encoded.
  await clip('exp5-walk', n, (i, frame) => {
    const t = i / FPS;
    const fig = createFigure();
    const phase = (i / n) * 2;              // two full strides
    poseGait(fig, phase, { mode: 'walk' });
    fig.setExpression('neutral');
    fig.state.blink = blinkAt(t);
    const m = cameraMove(camA, camB, (Math.sin((i / n) * Math.PI * 2) + 1) / 2, { easeFn: ease.inOutQuad });
    // solve the lens every frame so the figure can never leave the safe area,
    // whatever the gait does to the silhouette
    const bones = fig.skeleton;
    const pts = [
      [0, 2.10, 0], [0, 0.0, 0.30], [0, 0.0, -0.30],
      bones.pos('handL'), bones.pos('handR'), bones.pos('toeL'), bones.pos('toeR'),
    ];
    const fov = fitFov(makeCamera, { eye: m.eye, target: m.target, points: pts, width: IW, height: IH, margin: 0.09 });
    const cam = makeCamera({ eye: m.eye, target: m.target, fovDeg: fov, width: IW, height: IH });
    const small = renderFigure(fig, cam);
    const b = upscale(small, W, H);
    const g = b.getContext('2d');
    gradeFrame(g, W, H, {
      dof: { focusY: 0.56, range: 0.34, strength: 0.45, maxBlur: 8 },
      grainOpts: { amount: 0.04, seed: i }, ca: 0.8, vignette: 0.28,
    });
    CAP(g, 'walk cycle', 'IK foot planting · 2 strides');
    frame.getContext('2d').drawImage(b, 0, 0);
  });
}

/** The action beat: anticipation, strike, flash, shake, motion blur, speed lines. */
async function impactClip(n = 48) {
  const HIT = Math.round(n * 0.34);
  const camBase = { eye: [-1.30, 1.20, 2.85], target: [0, 0.90, 0], fov: 40 };
  await clip('exp5-impact', n, (i, big) => {
    const t = i / n;
    const fig = createFigure();
    poseImpact(fig, t, { power: 1, from: 'right' });
    fig.setExpression(t < 0.36 ? 'determined' : 'angry');
    fig.state.look = [0.25, 0];

    // shake spikes at the hit and decays; the camera also pushes in on the beat
    const sinceHit = Math.max(0, (i - HIT) / FPS);
    const trauma = t > 0.24 ? traumaDecay(sinceHit, 3.4) * 0.9 : 0;
    const sh = cameraShake(t * 3.2, trauma, { freq: 13, seed: 4 });
    const push = ease.outCubic(Math.min(1, t / 0.36)) * 0.22;
    const eye = [
      camBase.eye[0] + sh.x + push * 0.30,
      camBase.eye[1] + sh.y,
      camBase.eye[2] - push + sh.z,
    ];
    const cam = makeCamera({ eye, target: camBase.target, fovDeg: camBase.fov - push * 8, width: IW, height: IH });

    // motion blur: three sub-frames at slightly different times, averaged
    const sub = [];
    for (let k = -1; k <= 1; k++) {
      const figK = createFigure();
      poseImpact(figK, Math.max(0, Math.min(1, t + k * 0.012)), { power: 1, from: 'right' });
      figK.setExpression(t < 0.36 ? 'determined' : 'angry');
      sub.push(renderFigure(figK, cam));
    }
    const b = upscale(sub[0], W, H);
    const gb = b.getContext('2d');
    const up = sub.map((s) => upscale(s, W, H));
    motionBlurStack(gb, up, { weights: [0.25, 0.5, 0.25], w: W, h: H });

    gradeFrame(gb, W, H, {
      dof: { focusY: 0.50, range: 0.40, strength: 0.55, maxBlur: 10 },
      bloomOpts: { threshold: 0.76, strength: 0.30, radius: 30 },
      grainOpts: { amount: 0.05, seed: i }, ca: 1.4 + trauma * 2, vignette: 0.34,
    });

    // the impact itself: flash + speed lines, both decaying from the contact frame
    if (i >= HIT - 1 && sinceHit < 0.32) {
      const k = traumaDecay(sinceHit, 5.0);
      speedLines(gb, W, H, Math.min(1, 0.15 + sinceHit * 3.0), {
        centre: [0.52, 0.40], colour: '#dce8ff', rays: 46, seed: 11,
      });
      impactFlash(gb, W, H, k * 0.30);
    }
    CAP(gb, 'impact', 'blur · shake · flash · speed lines');
    big.getContext('2d').drawImage(b, 0, 0);
  });
}

/** Turntable: the same character from 12 angles, for judging the model. */
async function turntable(n = 48) {
  await clip('exp5-turntable', n, (i, big) => {
    const a = (i / n) * Math.PI * 2;
    const fig = createFigure();
    poseIdle(fig, i / FPS);
    fig.setExpression('neutral');
    fig.state.blink = blinkAt(i / FPS);
    const r = 2.30;
    const cam = makeCamera({
      eye: [Math.sin(a) * r, 1.16, Math.cos(a) * r],
      target: [0, 0.94, 0], fovDeg: 40, width: IW, height: IH,
    });
    const small = renderFigure(fig, cam);
    const b = upscale(small, W, H);
    const g = b.getContext('2d');
    gradeFrame(g, W, H, { grainOpts: { amount: 0.04, seed: i }, ca: 0.9, vignette: 0.28 });
    CAP(g, 'turntable', '12 angles · silhouette + face');
    big.getContext('2d').drawImage(b, 0, 0);
  });
}

/* --------------------------------------------------------------------- main */

await ensureFonts();
fs.mkdirSync(OUT, { recursive: true });

const t0 = performance.now();
await stills();
console.log(`stills            ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const FRAMES = Number((process.argv[process.argv.indexOf('--frames') + 1]) || 48);
const t1 = performance.now();
await walkClip(FRAMES);
const t2 = performance.now();
await impactClip(FRAMES);
const t3 = performance.now();
await turntable(FRAMES);
const t4 = performance.now();

console.log(`walk  ${FRAMES}f       ${((t2 - t1) / FRAMES).toFixed(0)} ms/frame`);
console.log(`impact ${FRAMES}f     ${((t3 - t2) / FRAMES).toFixed(0)} ms/frame  (3 sub-frames + full grade)`);
console.log(`turntable ${FRAMES}f  ${((t4 - t3) / FRAMES).toFixed(0)} ms/frame`);
console.log(`output            1080x1920 @ ${FPS}fps, internal ${IW}x${IH}`);
