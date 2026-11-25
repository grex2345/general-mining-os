#!/usr/bin/env node
/**
 * charsheet.mjs — the visual verification suite for the cartoon character engine.
 *
 * Produces, at 1080x1920 (delivery format) and 1080x1350:
 *   char-expressions.png   neutral, happy, surprised, angry, confused, sad, laughing, thinking
 *   char-poses.png         standing, three-quarter, side, walking, running, impact, cheer
 *   char-sheet.png         the headline contact sheet
 *   char-preview.mp4       animation: blinks, expressions, walk -> run -> impact
 *
 *   node experiments/charsheet.mjs [frames]
 *
 * Every frame is drawn with studio/src/cartoon.mjs; there are no image assets,
 * so the whole look is reproducible from source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { createCharacter, drawGrade, rng } from '../src/cartoon.mjs';
import { drawGrade as grade, rng as rng3 } from '../src/render3d.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';
import { ik2 } from '../src/cartoon.mjs';

const OUT = 'out';
const W = 1080, H = 1920;
const FPS = 30;

/* --------------------------------------------------------------- scenery */

/**
 * A flat-illustrated backyard, matched to the reference frame: pale siding with
 * horizontal lines, an off-centre door, two windows with sky-blue glass, a green
 * lawn and rounded bushes. Deliberately simple — the character carries the frame.
 */
function drawYard(ctx, w, h, t = 0, { tone = 'day' } = {}) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
  sky.addColorStop(0, tone === 'dusk' ? '#8a6fa8' : '#b9d9ea');
  sky.addColorStop(1, tone === 'dusk' ? '#d8a48a' : '#dceef3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.42);

  const houseTop = h * 0.06;
  const houseBot = h * 0.66;
  // siding
  ctx.fillStyle = tone === 'dusk' ? '#8fb0ab' : '#a8c8c2';
  ctx.fillRect(0, houseTop, w, houseBot - houseTop);
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = Math.max(2, h * 0.0022);
  for (let y = houseTop + h * 0.035; y < houseBot; y += h * 0.035) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // roof edge
  ctx.fillStyle = '#c9b79a';
  ctx.fillRect(0, houseTop, w, h * 0.028);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, houseTop + h * 0.028, w, h * 0.008);

  // door
  const dw = w * 0.20, dx = w * 0.40, dy = h * 0.30, dh = houseBot - dy;
  ctx.fillStyle = '#c8452e';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(dx + dw * 0.78, dy, dw * 0.22, dh);
  ctx.fillStyle = '#a8351f';
  ctx.fillRect(dx + dw * 0.08, dy + dh * 0.06, dw * 0.84, dh * 0.34);
  ctx.fillRect(dx + dw * 0.08, dy + dh * 0.46, dw * 0.84, dh * 0.44);
  ctx.fillStyle = '#e8c76a';
  ctx.beginPath();
  ctx.arc(dx + dw * 0.86, dy + dh * 0.52, Math.max(4, h * 0.008), 0, Math.PI * 2);
  ctx.fill();

  // windows
  for (const wx of [w * 0.09, w * 0.68]) {
    const ww = w * 0.22, wy = h * 0.24, wh = h * 0.20;
    ctx.fillStyle = '#f3ece0';
    ctx.fillRect(wx - ww * 0.06, wy - wh * 0.06, ww * 1.12, wh * 1.12);
    const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    glass.addColorStop(0, '#eaf6fb');
    glass.addColorStop(1, '#cfe6f2');
    ctx.fillStyle = glass;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = '#f3ece0';
    ctx.lineWidth = Math.max(3, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.stroke();
  }

  // lawn
  const lawn = ctx.createLinearGradient(0, houseBot, 0, h);
  lawn.addColorStop(0, tone === 'dusk' ? '#6c9a63' : '#8cc46a');
  lawn.addColorStop(1, tone === 'dusk' ? '#4e7450' : '#69a552');
  ctx.fillStyle = lawn;
  ctx.fillRect(0, houseBot, w, h - houseBot);

  // bushes
  for (const [bx, br] of [[w * 0.20, w * 0.115], [w * 0.79, w * 0.125], [w * 0.60, w * 0.075]]) {
    ctx.beginPath();
    ctx.ellipse(bx, houseBot + br * 0.30, br, br * 0.66, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4f9a4a';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx - br * 0.30, houseBot + br * 0.16, br * 0.62, br * 0.44, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#63b356';
    ctx.fill();
  }
  void t;
}

/** Soft vignette + grain, the two finishing ops the reference always applies. */
function finish(ctx, w, h, t, seed = 5) {
  grade(ctx, w, h, { vignette: 0.22, grain: 0.012, t, seed, grainStep: 5 });
}

/* ---------------------------------------------------------------- sheets */

function panelOf(w, h, label, drawChar, opts = {}) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#eef3f0';
  g.fillRect(0, 0, w, h);
  if (opts.yard) drawYard(g, w, h, 0);
  else {
    // plain studio panel with a soft floor
    const fl = g.createLinearGradient(0, h * 0.72, 0, h);
    fl.addColorStop(0, 'rgba(0,0,0,0.05)');
    fl.addColorStop(1, 'rgba(0,0,0,0.0)');
    g.fillStyle = fl;
    g.fillRect(0, h * 0.72, w, h * 0.28);
  }
  drawChar(g, w, h);
  g.font = `600 ${Math.round(h * 0.045)}px sans-serif`;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(28,34,44,0.72)';
  g.fillText(label, w * 0.06, h * 0.955);
  return c;
}

function expressionsSheet() {
  const cols = 4, rows = 2;
  const pw = 540, ph = 700;
  const c = createCanvas(cols * pw, rows * ph + 120);
  const g = c.getContext('2d');
  g.fillStyle = '#f6f8f6';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1b2230';
  g.font = '700 56px sans-serif';
  g.fillText('Expressions — same rig, data-driven face table', 48, 82);
  const list = ['neutral', 'happy', 'surprised', 'angry', 'confused', 'sad', 'laughing', 'thinking'];
  const ch = createCharacter();
  list.forEach((expr, i) => {
    const x = (i % cols) * pw;
    const y = 120 + Math.floor(i / cols) * ph;
    const panel = panelOf(pw, ph, expr, (gg) => {
      ch.draw(gg, { x: pw / 2, y: ph * 0.90, height: ph * 0.80, expr });
    });
    g.drawImage(panel, x, y);
    g.strokeStyle = 'rgba(20,26,36,0.10)';
    g.lineWidth = 2;
    g.strokeRect(x, y, pw, ph);
  });
  return c;
}

function posesSheet() {
  const cols = 4, rows = 2;
  const pw = 460, ph = 760;
  const c = createCanvas(cols * pw, rows * ph + 120);
  const g = c.getContext('2d');
  g.fillStyle = '#f6f8f6';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1b2230';
  g.font = '700 52px sans-serif';
  g.fillText('Poses — views and motion', 40, 78);
  const ch = createCharacter();
  const w = (phase, extra) => ch.walkPose(phase, extra);
  const poses = [
    { label: 'front · neutral', o: {} },
    { label: 'three-quarter', o: { yaw: 0.55, expr: 'happy' } },
    { label: 'side', o: { yaw: 1.0, expr: 'neutral' } },
    { label: 'walking', o: { yaw: 0.35, expr: 'neutral', ...w(0.12) } },
    { label: 'running', o: { yaw: 0.4, expr: 'surprised', ...w(0.30, { stride: 0.165, lift: 0.075, swing: 0.115, extraLean: 0.16 }) } },
    { label: 'impact', o: { yaw: 0.2, expr: 'surprised', squash: 0.55, lean: -0.22, armL: 'up', armR: 'up' } },
    { label: 'cheer', o: { expr: 'happy', armL: 'wave', armR: 'wave' } },
    { label: 'thinking', o: { expr: 'thinking', armL: 'hip', armR: 'point', yaw: 0.3, headTilt: 0.4 } },
  ];
  poses.forEach((p, i) => {
    const x = (i % cols) * pw;
    const y = 120 + Math.floor(i / cols) * ph;
    const panel = panelOf(pw, ph, p.label, (gg) => {
      ch.draw(gg, { x: pw / 2, y: ph * 0.90, height: ph * 0.80, ...p.o });
    });
    g.drawImage(panel, x, y);
    g.strokeStyle = 'rgba(20,26,36,0.10)';
    g.lineWidth = 2;
    g.strokeRect(x, y, pw, ph);
  });
  return c;
}

/** The headline sheet: a hero render plus a row of expression crops. */
function heroSheet() {
  const c = createCanvas(1080, 1350);
  const g = c.getContext('2d');
  drawYard(g, 1080, 1350, 0);
  const ch = createCharacter();
  // two characters, as the reference frame does
  ch.draw(g, { x: 318, y: 1215, height: 880, expr: 'happy', armL: 'hip', armR: 'hip' });
  const ch2 = createCharacter({ outfit: { skin: '#a8703f', shirt: '#8b5fc9', hair: '#241a14', hairStyle: 'round' }, seed: 21 });
  ch2.draw(g, { x: 748, y: 1215, height: 830, expr: 'laughing', armL: 'hip', armR: 'hip', yaw: -0.14 });
  finish(g, 1080, 1350, 0.4, 11);
  return c;
}

/* ------------------------------------------------------------------ clip */

async function renderClip(frames = 150) {
  const ff = spawn(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path.join(OUT, 'char-preview.mp4'),
  ]);
  const errs = [];
  ff.stderr.on('data', (d) => errs.push(d));
  const done = new Promise((res, rej) =>
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg: ' + Buffer.concat(errs).toString().slice(-500))))));

  const ch = createCharacter();
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    drawYard(g, W, H, t);

    // ---- direction: a small state machine so the motion reads as a story
    // 0.0-1.2 idle + blink, 1.2-2.4 walk, 2.4-3.6 run, 3.6-4.2 impact, 4.2-5.0 recover
    let pose = { expr: 'neutral', yaw: 0.12 };
    let x = W * 0.42;
    const groundY = H * 0.86;
    const height = H * 0.62;

    if (t < 1.2) {
      const blink = (t % 1.2) > 0.95 ? 1 : 0;
      pose = { ...pose, blink, expr: 'neutral', headTilt: Math.sin(t * 2.2) * 0.06 };
    } else if (t < 2.4) {
      const p = ((t - 1.2) / 1.2);
      const w = ch.walkCycle(p * 1.6);
      pose = { ...pose, expr: 'happy', yaw: 0.3, ...w };
      x = W * 0.30 + W * 0.28 * p;
    } else if (t < 3.5) {
      const p = (t - 2.4) / 1.1;
      const w = ch.walkCycle(p * 2.6, { stride: 0.15, lift: 0.06, swing: 0.13 });
      pose = { ...pose, expr: 'surprised', yaw: 0.35, lean: 0.17, ...w };
      x = W * 0.58 + W * 0.20 * p;
      // speed lines
    } else if (t < 4.1) {
      const k = (t - 3.5) / 0.6;
      const e = 1 - Math.pow(1 - k, 2);
      pose = {
        ...pose, expr: k < 0.25 ? 'surprised' : 'angry',
        yaw: 0.25, squash: 0.6 * (1 - e), lean: -0.22 * (1 - e),
        armL: 'up', armR: 'up', headTilt: -0.3 * (1 - e),
      };
      x = W * 0.78 + e * 40;
    } else {
      const k = (t - 4.1) / 0.9;
      pose = { ...pose, expr: k > 0.5 ? 'happy' : 'neutral', yaw: 0.3, headTilt: Math.sin(k * 6) * 0.08 };
      x = W * 0.78;
    }

    ch.draw(g, { x, y: groundY, height, ...pose });

    // impact rings at the moment of contact
    if (t >= 3.5 && t < 4.4) {
      const k = (t - 3.5) / 0.9;
      const cx = x + (pose.yaw > 0 ? 40 : -40), cy = groundY - height * 0.55;
      for (let i = 0; i < 3; i++) {
        const p = Math.max(0, Math.min(1, (k - i * 0.14) / 0.75));
        if (p <= 0 || p >= 1) continue;
        g.beginPath();
        g.ellipse(cx, cy, 60 + p * 340, 40 + p * 240, 0, 0, Math.PI * 2);
        g.strokeStyle = `rgba(255,96,72,${(1 - p) * 0.7})`;
        g.lineWidth = 8 * (1 - p * 0.6);
        g.stroke();
      }
    }

    // speed lines while running
    if (t >= 2.4 && t < 3.5) {
      const r = rng3(3);
      for (let i = 0; i < 9; i++) {
        const yy = H * 0.30 + i * H * 0.045;
        const len = 90 + r() * 160;
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(W * 0.06, yy, len, 5);
      }
    }

    finish(g, W, H, t, 5);
    const { data } = g.getImageData(0, 0, W, H);
    if (!ff.stdin.write(Buffer.from(data))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  return (Date.now() - t0) / frames;
}

async function main() {
  ensureFonts();
  fs.mkdirSync(OUT, { recursive: true });
  const frames = Number(process.argv[2] || 150);

  const exprs = expressionsSheet();
  fs.writeFileSync(path.join(OUT, 'char-expressions.png'), exprs.toBuffer('image/png'));
  const poses = posesSheet();
  fs.writeFileSync(path.join(OUT, 'char-poses.png'), poses.toBuffer('image/png'));
  const hero = heroSheet();
  fs.writeFileSync(path.join(OUT, 'char-sheet.png'), hero.toBuffer('image/png'));

  // a single-character hero portrait for quick review
  const c = createCanvas(1080, 1920);
  const g = c.getContext('2d');
  drawYard(g, 1080, 1920, 0);
  createCharacter().draw(g, { x: 540, y: 1660, height: 1280, expr: 'happy', armL: 'hip', armR: 'hip' });
  finish(g, 1080, 1920, 0.6, 9);
  fs.writeFileSync(path.join(OUT, 'char-hero.png'), c.toBuffer('image/png'));

  const ms = await renderClip(frames);
  console.log(`sheets: char-expressions.png, char-poses.png, char-sheet.png, char-hero.png`);
  console.log(`clip:   ${frames} frames, ${ms.toFixed(0)} ms/frame -> char-preview.mp4`);
}

main().catch((e) => { console.error(e); process.exit(1); });
