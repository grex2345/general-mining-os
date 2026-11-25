// Experimental 3D scene: a studio "rig" object on a plinth, turntable camera.
// Demonstrates the render3d.mjs software rasteriser inside the existing
// canvas -> ffmpeg pipeline (no GPU, no Chrome, no browser).
//
//   node studio/experiments/scene3d.mjs [outFile] [frames]
//
// This is an experiment, not part of the production video path.

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { FFMPEG, ensureFonts } from '../src/env.mjs';
import { drawBoxes, renderSupersampled } from '../src/render3d.mjs';

const W = 1080, H = 1920, FPS = 30;
const outFile = process.argv[2] || path.join(import.meta.dirname, '..', 'out', 'exp-3d.mp4');
const TOTAL = Number(process.argv[3] || 60);

/** Scene definition as a function of time (seconds) so the camera can orbit. */
function buildScene(t, dur) {
  const turn = (t / dur) * Math.PI * 0.55 - Math.PI * 0.28;
  const bob = Math.sin(t * 1.6) * 0.035;
  return {
    // Vertical 9:16 framing is WIDTH-bound, not height-bound: at fov 30 the
    // horizontal extent at distance d is only 2*d*tan(15)*0.5625. A 4.6-unit-wide
    // set would need d=16.6 to fit. So the set is narrow and the camera close.
    camera: {
      eye: [Math.sin(turn) * 8.6, 3.05, Math.cos(turn) * 8.6],
      target: [0, 0.55 + bob, 0],
      fovDeg: 34,
    },
    boxes: [
      // ground: a very large flat slab, so the plinth reads as sitting on something
      { center: [0, -0.62, 0], size: [30, 0.24, 30], albedo: [0.075, 0.085, 0.105], noShadow: true },
      // plinth
      { center: [0, -0.18, 0], size: [2.5, 0.36, 2.1], albedo: [0.13, 0.15, 0.18] },
      // the "device": body, screen, top ridge
      { center: [0, 0.55 + bob, 0], size: [1.52, 1.30, 0.52], albedo: [0.26, 0.29, 0.33] },
      { center: [0, 0.55 + bob, 0.268], size: [1.24, 1.00, 0.03], albedo: [0.04, 0.46, 0.44] },
      { center: [0, 1.24 + bob, 0], size: [0.92, 0.10, 0.30], albedo: [0.42, 0.46, 0.50] },
      // side "cards" — the things that read as detail at a glance
      { center: [-1.02, 0.42 + bob, 0.06], size: [0.16, 0.80, 0.40], albedo: [0.55, 0.26, 0.20] },
      { center: [1.02, 0.42 + bob, 0.06], size: [0.16, 0.80, 0.40], albedo: [0.24, 0.38, 0.55] },
    ],
  };
}

function drawBackdrop(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1016');
  g.addColorStop(0.5, '#0a0e13');
  g.addColorStop(1, '#06080b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H * 0.46, 30, W / 2, H * 0.46, W * 0.85);
  rg.addColorStop(0, 'rgba(64,190,180,0.13)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

async function main() {
  ensureFonts();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', outFile,
  ];
  const ff = spawn(FFMPEG, args);
  const err = [];
  ff.stderr.on('data', (d) => err.push(d));
  const done = new Promise((res, rej) =>
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg: ' + Buffer.concat(err).toString().slice(-500))))));

  const dur = TOTAL / FPS;
  const t0 = Date.now();
  for (let f = 0; f < TOTAL; f++) {
    const t = f / FPS;
    const scene = buildScene(t, dur);
    const canvas = renderSupersampled(createCanvas, W, H, (ctx) => {
      drawBackdrop(ctx);
      drawBoxes(ctx, scene.boxes, {
        width: W, height: H,
        camera: scene.camera,
        exposure: 1.18,
        shadowAlpha: 0.42,
      });
      // emissive bloom from the screen face: a soft accent pool under the device
      const g = ctx.createRadialGradient(W / 2, H * 0.60, 10, W / 2, H * 0.60, W * 0.55);
      g.addColorStop(0, 'rgba(64,220,200,0.10)');
      g.addColorStop(1, 'rgba(64,220,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }, { scale: 2 });
    const buf = canvas.data ? canvas.data() : Buffer.from(canvas.getContext('2d').getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 15 === 0) process.stdout.write(`\r  frame ${f + 1}/${TOTAL}`);
  }
  ff.stdin.end();
  await done;
  const ms = Date.now() - t0;
  console.log(`\r  ${TOTAL} frames (${dur.toFixed(1)}s) in ${(ms / 1000).toFixed(1)}s  =  ${(ms / TOTAL).toFixed(0)} ms/frame`);
  console.log(`  wrote ${outFile}  (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB)`);
}

main().catch((e) => { console.error('failed: ' + e.message); process.exit(1); });
