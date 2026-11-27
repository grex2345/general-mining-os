#!/usr/bin/env node
/**
 * lowpoly.mjs — Round 4, experiment 1 driver.
 *
 * Renders the screen-space staged night scene at 360x640, upscales 3x with
 * nearest-neighbour, and writes stills + a clip. Prints the measured layout and
 * frame timings so the claims in the research report are checkable.
 *
 *   node experiments/lowpoly.mjs [frames]
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderScene, lowPolyPost } from '../src/lowpoly.mjs';
import { buildWorld, cameraAt, layoutReport, LIGHTS, RW, RH, STAGE, REF_CAM } from '../src/scenes/lastTrain.mjs';
import { drawLightShafts, drawHaze } from '../src/vfx.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';
import { rng } from '../src/cartoon.mjs';

const FRAMES = Number(process.argv[2] || 48);
const HERO = Math.round(FRAMES * 0.5);   // the mid-shot frame, always in range
const OUT = 'out';
// RES=360 renders internally at 360x640 and upscales 3x (the PS1 path).
// RES=1080 renders straight to 1080x1920. Both are measured; see the report.
const RES = Number(process.env.RES || 360);
const SCALE = 1080 / RES, W = 1080, H = 1920;
// The art direction is authored in 360x640 pixels; every screen-space constant
// is multiplied by this so the 1080 path frames identically.
const u = W / 360;   // for the output canvas
const IW = RES, IH = Math.round(RES * 16 / 9);
const v = IW / 360;  // scale for the internal buffer (drawn before upscale)
const FPS = 30;
const TAG = RES === 360 ? '' : `-${RES}`;

const KEY = (() => {
  const v = [0.28, 0.60, 0.74]; const l = Math.hypot(...v);
  return { dir: v.map((x) => x / l), colour: [0.58, 0.70, 1.0], intensity: 1.05 };
})();
const FOG = { colour: [0.105, 0.130, 0.200], density: 0.030 };
const SHADE = {
  key: KEY, points: [], fog: FOG,
  sky: [0.14, 0.18, 0.30], ground: [0.07, 0.07, 0.11], exposure: 0.95,
};

function backdrop(ctx, w, h, t) {
  const k = w / 360;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#141d38');
  g.addColorStop(0.28, '#233252');
  g.addColorStop(0.46, '#3b4d72');
  g.addColorStop(0.56, '#4a5a7c');
  g.addColorStop(0.62, '#28314c');
  g.addColorStop(1, '#12172a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars, denser near the top of frame
  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    const x = r() * w, y = r() * h * 0.46;
    ctx.fillStyle = `rgba(226,236,255,${(0.18 + r() * 0.7).toFixed(2)})`;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  // blocky clouds, softened: a few hard rectangles then one blur pass over them
  ctx.save();
  ctx.filter = 'blur(3px)';
  const rc = rng(23);
  for (let i = 0; i < 14; i++) {
    const cx = rc() * w, cy = h * (0.14 + rc() * 0.30);
    const cw = (20 + rc() * 58) * k, ch = (6 + rc() * 11) * k;
    ctx.fillStyle = `rgba(${(56 + rc() * 24) | 0},${(68 + rc() * 24) | 0},${(100 + rc() * 26) | 0},0.8)`;
    ctx.fillRect(cx, cy, cw, ch);
    ctx.fillRect(cx + cw * 0.22, cy - ch * 0.6, cw * 0.5, ch);
  }
  ctx.restore();

  // the moon, and its halo
  const mx = STAGE.moon[0] * k, my = STAGE.moon[1] * k, mr = 52 * k;
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
  mg.addColorStop(0, 'rgba(232,240,255,0.95)');
  mg.addColorStop(0.18, 'rgba(205,220,250,0.55)');
  mg.addColorStop(1, 'rgba(160,185,235,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  ctx.fillStyle = '#f2f6ff';
  ctx.beginPath();
  ctx.arc(mx, my, 8 * k, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowfall(ctx, w, h, t, seed = 5) {
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const speed = 0.3 + r() * 0.8;
    const x0 = r() * w;
    const ph = r() * 100;
    const y = ((t * speed * 26 + ph * 7) % (h + 30)) - 15;
    const drift = Math.sin(t * 0.8 + ph) * 6 * (w / 360);
    ctx.fillStyle = `rgba(232,240,255,${(0.30 + r() * 0.5).toFixed(2)})`;
    const sz = (r() > 0.85 ? 2 : 1) * v;
    ctx.fillRect((x0 + drift) | 0, y | 0, sz, sz);
  }
}

function renderFrame(ctx, frame, { post = true } = {}) {
  const t = frame / FPS;
  const cam = cameraAt(FRAMES > 1 ? frame / (FRAMES - 1) : 0.5);
  const scene = buildWorld(t);
  const shadeOpts = { ...SHADE, points: LIGHTS() };

  backdrop(ctx, IW, IH, t);
  drawHaze(ctx, IW, IH, { colour: [0.26, 0.36, 0.60], intensity: 0.09, t, blobs: 4 });

  const faces = renderScene(ctx, scene, cam, {
    width: IW, height: IH, snap: 1, shade: shadeOpts, overdraw: 1.1,
  });

  // moon shafts, angled down-left so they read against the sky, not the ground
  drawLightShafts(ctx, {
    origin: [(STAGE.moon[0] + 28) * v, (STAGE.moon[1] - 6) * v], angle: Math.PI * 0.60, spread: 1.0,
    rays: 12, length: IH * 1.05, colour: [0.74, 0.84, 1.0],
    intensity: 0.115, t, seed: 4, sway: 1,
  });

  // lamp: a cone of light plus a hot core. The cone is a trapezoid drawn with a
  // radial-falloff gradient — the cheapest volumetric light that still reads.
  const lamp = LIGHTS()[0].pos;
  const lp = cam.project(lamp);
  if (lp) {
    const footing = cam.project([lamp[0], 0.05, lamp[2]]);
    if (footing) {
      const cg = ctx.createLinearGradient(lp[0], lp[1], footing[0], footing[1]);
      cg.addColorStop(0, 'rgba(255,206,140,0.30)');
      cg.addColorStop(0.55, 'rgba(255,190,120,0.10)');
      cg.addColorStop(1, 'rgba(255,180,110,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(lp[0] - 5 * v, lp[1]);
      ctx.lineTo(lp[0] + 5 * v, lp[1]);
      ctx.lineTo(footing[0] + 52 * v, footing[1]);
      ctx.lineTo(footing[0] - 44 * v, footing[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const rad = 46 * v;
    const g = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], rad);
    g.addColorStop(0, 'rgba(255,214,150,0.50)');
    g.addColorStop(0.35, 'rgba(255,178,108,0.18)');
    g.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(lp[0] - rad, lp[1] - rad, rad * 2, rad * 2);
    ctx.restore();
  }

  // snow ground texture — a few soft light dabs in the near field, drawn before
  // the falling snow so the flakes stay crisp on top
  {
    const r = rng(97);
    ctx.save();
    ctx.filter = `blur(${(4 * v).toFixed(1)}px)`;
    for (let i = 0; i < 14; i++) {
      const x = r() * IW, y = IH * (0.62 + r() * 0.36);
      const w = (26 + r() * 70) * v, h = (6 + r() * 16) * v;
      ctx.fillStyle = `rgba(198,212,238,${(0.05 + r() * 0.07).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, r() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSnowfall(ctx, IW, IH, t);

  if (post) lowPolyPost(ctx, IW, IH, { levels: 31, vignette: 0.38, grain: 0.030, seed: 11, tint: '#c2cff0' });
  return faces;
}

function upscale(small, into) {
  if (SCALE === 1) {
    const big = into || createCanvas(W, H);
    big.getContext('2d').drawImage(small, 0, 0);
    return big;
  }
  const big = into || createCanvas(W, H);
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;      // nearest-neighbour IS the look
  g.drawImage(small, 0, 0, W, H);
  return big;
}

function caption(ctx, text, sub) {
  ctx.save();
  // 34 px on the 640-tall internal buffer is the reference size; the native
  // 1080 path uses a slightly tighter ratio so the caption does not dominate.
  const s0 = RES === 360 ? W / 360 : 2.0;
  ctx.font = `600 ${Math.round(30 * s0)}px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center';
  const y = H * 0.725;
  const wch = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(8,10,18,0.5)';
  ctx.fillRect(W / 2 - wch / 2 - 18 * s0, y - 29 * s0, wch + 36 * s0, 46 * s0);
  ctx.fillStyle = '#ffd84d';
  ctx.fillText(text, W / 2, y + 3 * s0);
  if (sub) {
    ctx.font = `400 ${Math.round(19 * s0)}px "DejaVu Sans", sans-serif`;
    ctx.fillStyle = 'rgba(220,230,250,0.80)';
    ctx.fillText(sub, W / 2, y + 40 * s0);
  }
  ctx.restore();
}

/* -------------------------------------------------------------------- main */

await ensureFonts();
fs.mkdirSync(OUT, { recursive: true });

console.log('--- layout (measured on the 360x640 buffer, mid-shot camera)');
for (const [k, v] of layoutReport(REF_CAM)) console.log('  ', k.padEnd(8), v);

const small = createCanvas(IW, IH);
const ctxS = small.getContext('2d');
renderFrame(ctxS, 0);      // warm-up: keep JIT off the clock
renderFrame(ctxS, 1);

const t0 = performance.now();
let faces = 0;
for (let i = 0; i < 20; i++) faces = renderFrame(ctxS, i * 2);
const msRender = (performance.now() - t0) / 20;

const t1 = performance.now();
for (let i = 0; i < 12; i++) upscale(small);
const msUp = (performance.now() - t1) / 12;

// hero still
renderFrame(ctxS, HERO);
const hero = upscale(small);
caption(hero.getContext('2d'), 'the last train home', RES === 360 ? 'low-poly · 360×640 → 3× · software only' : 'low-poly · 1080×1920 native · software only');
fs.writeFileSync(`${OUT}/exp-lowpoly${TAG}.png`, await hero.encode('png'));

// the raw internal buffer, so the resolution trade-off is visible
renderFrame(ctxS, HERO);
fs.writeFileSync(`${OUT}/exp-lowpoly-raw${TAG}.png`, await small.encode('png'));

/* build-up strip: four stages of the same frame, internal resolution */
{
  const mk = () => { const c = createCanvas(IW, IH); return { c, g: c.getContext('2d') }; };
  const panels = [mk(), mk(), mk(), mk()];
  const cam = cameraAt(0.5);
  const scene = buildWorld(HERO / FPS);

  // 1 — geometry with flat grey shading, no lighting rig at all
  renderScene(panels[0].g, scene, cam, {
    width: RW, height: RH, snap: 1, overdraw: 1.1,
    background: (c) => { c.fillStyle = '#1a2033'; c.fillRect(0, 0, IW, IH); },
    shade: { key: { dir: [0, 1, 0], colour: [1, 1, 1], intensity: 0 }, sky: [0.55, 0.55, 0.55], ground: [0.45, 0.45, 0.45], points: [], fog: { colour: [0.3, 0.3, 0.3], density: 0 }, exposure: 1 },
  });
  // 2 — the night lighting rig + fog
  renderScene(panels[1].g, scene, cam, {
    width: RW, height: RH, snap: 1, overdraw: 1.1,
    background: (c) => { c.fillStyle = '#1a2033'; c.fillRect(0, 0, IW, IH); },
    shade: { ...SHADE, points: LIGHTS() },
  });
  // 3 — full frame with atmosphere, before post
  renderFrame(panels[2].g, HERO, { post: false });
  // 4 — graded, dithered, upscale to show the finished pixel scale
  renderFrame(panels[3].g, HERO, { post: true });

  const strip = createCanvas(IW * 2, IH * 2);
  const sg = strip.getContext('2d');
  sg.imageSmoothingEnabled = false;
  const labels = ['1 geometry', '2 lighting', '3 atmosphere', '4 grade + dither'];
  panels.forEach((p, i) => {
    sg.drawImage(p.c, (i % 2) * IW, Math.floor(i / 2) * IH);
    sg.font = '600 13px "DejaVu Sans", sans-serif';
    sg.fillStyle = 'rgba(0,0,0,0.62)';
    sg.fillRect((i % 2) * IW + 5, Math.floor(i / 2) * IH + 5, 118, 19);
    sg.fillStyle = '#ffd84d';
    sg.fillText(labels[i], (i % 2) * IW + 10, Math.floor(i / 2) * IH + 19);
  });
  fs.writeFileSync(`${OUT}/exp-lowpoly-steps${TAG}.png`, await strip.encode('png'));
}

/* the clip */
{
  const dir = `${OUT}/.lowpoly-frames`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const big = createCanvas(W, H);
  const gb = big.getContext('2d');
  const tStart = performance.now();
  for (let i = 0; i < FRAMES; i++) {
    renderFrame(ctxS, i);
    upscale(small, big);
    if (i > FRAMES * 0.62) caption(gb, 'the last train home', RES === 360 ? 'low-poly · 360×640 → 3× · software only' : 'low-poly · 1080×1920 native · software only');
    fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, await big.encode('png'));
  }
  const msFull = (performance.now() - tStart) / FRAMES;
  await new Promise((res) => {
    const ff = spawn(FFMPEG, [
      '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
      `${OUT}/exp-lowpoly${TAG}.mp4`,
    ], { stdio: 'inherit' });
    ff.on('exit', res);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nfull frame (render + upscale + png encode): ${msFull.toFixed(1)} ms`);
}

console.log(`faces/frame      ${faces}`);
console.log(`render 360x640   ${msRender.toFixed(1)} ms`);
console.log(`upscale to 3x    ${msUp.toFixed(1)} ms`);
console.log(`internal total   ${(msRender + msUp).toFixed(1)} ms   (previous best at 1080x1920: 438 ms)`);
console.log(`verified end-to-end  ${(msRender + msUp).toFixed(1)} ms/frame at ${IW}x${IH} -> ${W}x${H}`);
