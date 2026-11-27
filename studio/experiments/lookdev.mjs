#!/usr/bin/env node
/**
 * lookdev.mjs — does the look borrowed from the zach-d-films engine actually
 * work in OUR renderer, with no WebGL and no browser?
 *
 * Renders three stills and one contact strip, each showing one idea in isolation,
 * then a short clip that animates the winner:
 *
 *   exp-lookdev-a.png   baseline: the shipped Lambert path
 *   exp-lookdev-b.png   the physical rig: broad directional specular on metal
 *   exp-lookdev-c.png   a lathed volume of revolution (torso profile)
 *   exp-lookdev.png     the three side by side, graded
 *   exp-lookdev.mp4     the film treatment animated (bloom, rings, grain)
 *
 *   node experiments/lookdev.mjs [outdir] [frames]
 *
 * API traps encoded here (each one cost a hard crash while writing this):
 *   - perspective() returns a plain ARRAY [x, y, z] in NDC, not an object.
 *   - perspective() divides x by `aspect`, so a narrow sub-panel squashes the
 *     subject horizontally. Frame full width instead of slicing.
 *   - drawBoxes() takes {width, height, camera} and builds its own projection.
 *   - @napi-rs/canvas does not throw on NaN geometry; it ABORTS the process with
 *     a sk.rs unwrap panic. Undefined coordinates are fatal, not caught.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import {
  lookAt, perspective, drawBoxes, renderSupersampled,
  shadeFacePhysical, specular, bloomPass, drawGlow, drawImpactRings,
  drawGrade, profileFn, lathe, drawLatheSolid,
} from '../src/render3d.mjs';
import { FFMPEG, ensureFonts } from '../src/env.mjs';

const OUTDIR = process.argv[2] || 'out';
const FRAMES = Number(process.argv[3] || 45);
const W = 1080, H = 1920, FPS = 30;

const EYE = [0, 1.05, 3.1];
const TARGET = [0, 0.98, 0];
const FOV = 34;
const SPACE = lookAt(EYE, TARGET);

// Torso profile from the reference's human.js, rebuilt as our own smoothstep
// radius function (y -> radius). This is a published technique, not copied code.
const TORSO = profileFn([
  [-0.16, 0.150], [-0.08, 0.165], [0.0, 0.160], [0.10, 0.148], [0.20, 0.160],
  [0.30, 0.178], [0.40, 0.188], [0.46, 0.180], [0.51, 0.150], [0.55, 0.100], [0.58, 0.055],
]);

const proj = (p) => {
  const n = perspective(SPACE, p, { fovDeg: FOV, aspect: W / H });
  if (!n) return null;
  return { x: (n[0] * 0.5 + 0.5) * W, y: (0.5 - n[1] * 0.5) * H, depth: n[2] };
};

const backdrop = (ctx) => {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#14273e');
  bg.addColorStop(0.5, '#0a1322');
  bg.addColorStop(1, '#03070c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // a warm floor bounce so the subject is not floating in a void
  const fl = ctx.createRadialGradient(W * 0.5, H * 0.78, 40, W * 0.5, H * 0.78, W * 0.75);
  fl.addColorStop(0, 'rgba(120,90,60,.16)');
  fl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fl;
  ctx.fillRect(0, 0, W, H);
};

/* --------------------------------------------------------------- variants */

function drawBaseline(ctx) {
  drawBoxes(ctx, [{
    center: [0, 1.0, 0], size: [1.15, 1.15, 1.15], albedo: [0.79, 0.80, 0.84],
  }], { width: W, height: H, exposure: 1.0, camera: { eye: EYE, target: TARGET, fovDeg: FOV } });
}

function drawPhysical(ctx, t) {
  const centre = [0, 1.0, 0], half = 0.62, view = [0, 0, 1];
  const yaw = t * 0.9;
  const normals = [[0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]];
  for (const n0 of normals) {
    // rotate the face normal about Y so the highlight sweeps across the surface
    const n = [n0[0] * Math.cos(yaw) + n0[2] * Math.sin(yaw), n0[1],
               -n0[0] * Math.sin(yaw) + n0[2] * Math.cos(yaw)];
    const facing = proj([centre[0] + n[0], centre[1] + n[1], centre[2] + n[2]]);
    if (!facing) continue;
    const t1 = Math.abs(n[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
    const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      .map(([a, b]) => proj([
        centre[0] + n[0] * half + (t1[0] * a + t2[0] * b) * half,
        centre[1] + n[1] * half + (t1[1] * a + t2[1] * b) * half,
        centre[2] + n[2] * half + (t1[2] * a + t2[2] * b) * half,
      ]));
    if (pts.some((p) => !p)) continue;
    // backface cull in view space
    const c0 = proj(centre);
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
    if (Math.hypot(cx - c0.x, cy - c0.y) < 4) continue;

    const lit = shadeFacePhysical(n, [0.80, 0.81, 0.85], {
      view, roughness: 0.20, metalness: 0.95, exposure: 1.10,
    });
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = `rgb(${lit.map((c) => Math.round(Math.min(1, c) * 255)).join(',')})`;
    ctx.fill();

    const s = specular(n, view, 0.20).dominant;
    if (s > 0.05) {
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      g.addColorStop(0, 'rgba(255,250,240,0)');
      g.addColorStop(0.42, `rgba(255,250,240,${Math.min(0.42, s * 0.18)})`);
      g.addColorStop(1, 'rgba(255,250,240,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
}

function drawLatheBody(ctx, t) {
  // A 0.19-unit-radius torso needs the camera close: at d=3.1 the form is ~700px
  // wide, at d=7.2 it is a 90px stick. Framing is the whole job here.
  const rings = lathe(TORSO, {
    y0: -0.16, y1: 0.58, rows: 46, scaleXZ: [1.20, 0.70],
    center: [0, 0.72, 0], project: proj,
    albedo: [0.80, 0.82, 0.88], roughness: 0.22, metalness: 1.0, exposure: 1.15,
  });
  drawLatheSolid(ctx, rings);

  // rim separation
  drawGlow(ctx, W * 0.72, H * 0.30, W * 0.55, [0.42, 0.70, 1.0], 0.28, 0.35);

  const hit = proj([0, 0.92, 0.34]);
  if (hit) {
    drawImpactRings(ctx, hit.x, hit.y, (t * 1.1) % 1.8, {
      count: 3, maxRadius: W * 0.30, colour: [1, 0.30, 0.22], speed: 1.0, thickness: 4,
    });
    drawGlow(ctx, hit.x, hit.y, W * 0.11, [1, 0.58, 0.36], 0.75, 0.3);
  }
}

/* ---------------------------------------------------------------- renders */

function still(kind, t = 0.6) {
  return renderSupersampled(createCanvas, W, H, (ctx) => {
    backdrop(ctx);
    if (kind === 'a') drawBaseline(ctx);
    if (kind === 'b') drawPhysical(ctx, t);
    if (kind === 'c') drawLatheBody(ctx, t);
    drawGrade(ctx, W, H, { vignette: 0.34, grain: 0.02, t, seed: 7, grainStep: 4 });
  }, { scale: 2 });
}

function label(ctx, text) {
  ctx.save();
  ctx.font = '600 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.fillText(text, 60, 110);
  ctx.restore();
}

async function main() {
  ensureFonts();
  fs.mkdirSync(OUTDIR, { recursive: true });

  const a = still('a'), b = still('b'), c = still('c');
  const names = { a: 'baseline Lambert', b: 'physical rig', c: 'lathe + impact' };
  for (const [k, canvas] of Object.entries({ a, b, c })) {
    const labelled = createCanvas(W, H);
    const g = labelled.getContext('2d');
    g.drawImage(canvas, 0, 0);
    label(g, names[k]);
    fs.writeFileSync(path.join(OUTDIR, `exp-lookdev-${k}.png`), labelled.toBuffer('image/png'));
  }

  // contact strip: three framed panels at 1/3 scale, full-frame renders inside
  const strip = createCanvas(W, Math.round(H / 3));
  const sg = strip.getContext('2d');
  sg.fillStyle = '#05080d';
  sg.fillRect(0, 0, W, H / 3);
  [a, b, c].forEach((canvas, i) => {
    sg.drawImage(canvas, 0, 0, W, H, i * (W / 3), 0, W / 3, H / 3);
    sg.fillStyle = 'rgba(255,255,255,.75)';
    sg.font = '600 26px sans-serif';
    sg.fillText(['A', 'B', 'C'][i], i * (W / 3) + 18, 40);
  });
  fs.writeFileSync(path.join(OUTDIR, 'exp-lookdev.png'), strip.toBuffer('image/png'));

  // clip: the film treatment, animated
  const ff = spawn(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUTDIR, 'exp-lookdev.mp4'),
  ]);
  const errs = [];
  ff.stderr.on('data', (d) => errs.push(d));
  const done = new Promise((res, rej) =>
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg: ' + Buffer.concat(errs).toString().slice(-600))))));

  const t0 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    const canvas = renderSupersampled(createCanvas, W, H, (ctx) => {
      backdrop(ctx);
      drawLatheBody(ctx, t);
      drawGrade(ctx, W, H, { vignette: 0.34, grain: 0.02, t, seed: 7, grainStep: 4 });
    }, { scale: 2 });
    const bloomed = bloomPass(createCanvas, canvas, { threshold: 2.6, strength: 0.30, radius: 0.4, sigma: 10 });
    const { data } = bloomed.getContext('2d').getImageData(0, 0, W, H);
    if (!ff.stdin.write(Buffer.from(data))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;

  const ms = (Date.now() - t0) / FRAMES;
  console.log(`stills: exp-lookdev-{a,b,c}.png, exp-lookdev.png`);
  console.log(`clip:   ${FRAMES} frames, ${ms.toFixed(0)} ms/frame -> exp-lookdev.mp4`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
