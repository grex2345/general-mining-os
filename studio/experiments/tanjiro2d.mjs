#!/usr/bin/env node
/**
 * tanjiro2d.mjs — Round 7 Experiment A: the 2D stickman Water-Breathing short.
 *
 * MASTER PROMPT coding-workflow applied to the existing canvas engine:
 *   measured voice timing -> shot plan (<=90f, no repeated angle, always moving)
 *   -> stickman cast + illustrated parallax worlds + water VFX -> captions
 *   -> procedural score + frame-locked SFX -> mix (-14 LUFS) -> QA gates.
 *
 *   node experiments/tanjiro2d.mjs [--frames N] [--start F] [--no-audio] [--still F]
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, FFMPEG } from '../src/env.mjs';
import { buildShotPlan } from '../src/stories/plan7.mjs';
import { createStickman, blinkAt } from '../src/stickman.mjs';
import { drawWorld, BASE_W, BASE_H } from '../src/scenes/tanjiroWorld.mjs';
import { waterRibbon, waterDragon, waterWheel, splash, breathVapor, aura, openingThread, embers, snow } from '../src/waterfx.mjs';
import { gradeFrame, speedLines, impactFlash } from '../src/cinema.mjs';
import { ease, smoothNoise } from '../src/animation.mjs';
import { rng } from '../src/cartoon.mjs';

const W = BASE_W, H = BASE_H, FPS = 30;
const OUT = 'out/tanjiro';
fs.mkdirSync(OUT, { recursive: true });
await ensureFonts();

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const plan = buildShotPlan({ alignPath: `${OUT}/align.json` });
const TOTAL = arg('--frames', plan.totalFrames);
const START = arg('--start', 0);
const NO_AUDIO = process.argv.includes('--no-audio');
const STILL = arg('--still', -1);

const cast = {
  tanjiro: createStickman('tanjiro', 7),
  demon: createStickman('demon', 13),
  master: createStickman('master', 21),
};

const GROUND = { village: 1300, mountain: 1340, yard: 1320, falls: 1400, river: 1280, snow: 1320 };
const smoother = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); };

/* ------------------------------------------------------------ camera + stage */

function cameraFor(s, k, t) {
  const gy = GROUND[s.env];
  const headY = gy - 365;
  let fx = 540, fy = 1000, zoom = 0.98, roll = 0;
  const creep = 1 + k * 0.05;                       // every hold creeps (rule)
  const A = s.angle;
  if (A === 'mcu') { fx = 540; fy = headY + 40; zoom = 2.1; }
  else if (A === 'ecu') { fx = 540; fy = headY + 20; zoom = 3.0; }
  else if (A === 'close') { fx = 540; fy = headY + 60; zoom = 2.5; }
  else if (A === 'medium') { fx = 540; fy = gy - 220; zoom = 1.45; }
  else if (A === 'two') { fx = 560; fy = gy - 220; zoom = 1.35; }
  else if (A === 'insert') { fx = 620; fy = gy - 180; zoom = 1.8; }
  else if (A === 'low') { fx = 540; fy = gy - 160; zoom = 1.5; }
  else if (A === 'high') { fx = 620; fy = gy - 60; zoom = 1.5; }
  else if (A === 'hero') { fx = 540; fy = gy - 320; zoom = 1.25; }
  else if (A === 'orbit') { fx = 540; fy = gy - 240; zoom = 1.6; }
  else { fx = 540; fy = 1020; zoom = 0.96; }        // wide

  const m = s.move;
  if (m === 'push') zoom *= 1 + 0.12 * smoother(k);
  else if (m === 'pull') zoom *= 1.14 - 0.14 * smoother(k);
  else if (m === 'track' || m === 'follow') { fx += (k - 0.5) * 220; zoom *= 1 + 0.05 * k; }
  else if (m === 'pan') fx += (k - 0.5) * 300;
  else if (m === 'arc') { fx += Math.sin(k * Math.PI) * 90; zoom *= 1 + 0.06 * k; }
  else if (m === 'crane') { fy += (0.5 - k) * 260; zoom *= 1 + 0.08 * smoother(k); }
  else if (m === 'pushroll') { zoom *= 1 + 0.14 * smoother(k); roll = 0.05 * smoother(k); }
  else if (m === 'dash') { fx += (k - 0.5) * 420; zoom *= 1.1 + 0.1 * smoother(k); }
  else if (m === 'orbit') { fx += Math.sin(k * Math.PI * 2) * 160; zoom *= 1 + 0.05 * Math.sin(k * Math.PI); }
  else if (m === 'shake') { zoom *= 1.05; }
  zoom *= creep;

  // impact shake on shake/dash/slash shots near the hit
  let sx = 0, sy = 0;
  if (s.move === 'shake' || s.id === 'slash' || s.id === 'wheel' || s.id === 'boulder') {
    const tr = Math.max(0, 1 - Math.abs(k - 0.35) * 3) * 0.8;
    sx = smoothNoise(t * 30, 3) * 26 * tr; sy = smoothNoise(t * 30 + 9, 5) * 20 * tr;
    roll += smoothNoise(t * 24, 7) * 0.02 * tr;
  }
  return { x: fx - W / 2 + sx, y: fy - H / 2 + sy, zoom, roll };
}

/** Per-shot character staging. Returns array of pose configs in world space. */
function stageFor(s, k, t) {
  const gy = GROUND[s.env];
  const chars = [];
  const idle = { idleT: t };
  const blink = blinkAt(t, 7);
  const exprFor = {
    hook: 'determined', climb: 'determined', climb2: 'neutral', swing: 'shout', count: 'determined',
    master: 'focus', falls: 'focus', breathe: 'focus', river: 'determined', ribbon: 'focus',
    slash: 'shout', boulder: 'neutral', debris: 'neutral', night: 'neutral', demon: 'demon',
    demonface: 'demon', thread: 'focus', thread2: 'surprised', dragon: 'shout', wheel: 'shout',
    quiet: 'neutral', embers: 'sad', resolve: 'smile', endcard: 'happy',
  };
  const expr = exprFor[s.id] || 'neutral';
  const h = 430;
  const base = { y: gy, h, blink, ...idle, expr };

  if (s.chars.includes('tanjiro')) {
    const p = { ...base, name: 'tanjiro', x: 540, facing: 1 };
    if (s.id === 'climb' || s.id === 'climb2') {
      p.walk = 1; p.legPhase = t * 7; p.x = 400 + k * 260; p.facing = 1; p.sword = false;
    } else if (s.id === 'swing' || s.id === 'count') {
      // repeated slash: anticipation -> swing -> settle
      const cyc = (t * 1.6) % 1;
      const ang = cyc < 0.35 ? -2.2 + (cyc / 0.35) * 0.4 : cyc < 0.55 ? -1.8 + ((cyc - 0.35) / 0.2) * 2.6 : 0.8 - ((cyc - 0.55) / 0.45) * 1.0;
      p.swordAng = ang; p.armR = { ang: ang * 0.5 + 0.3 }; p.lean = cyc < 0.55 && cyc > 0.35 ? 0.12 : 0;
      p.expr = cyc > 0.35 && cyc < 0.6 ? 'shout' : 'determined';
    } else if (s.id === 'slash') {
      const lunge = smoother(Math.min(1, k * 2));
      p.x = 420 + lunge * 200; p.lean = 0.18 * lunge; p.swordAng = -1.6 + lunge * 2.4; p.swordGlow = 0.7;
      p.armR = { ang: -0.6 + lunge * 1.2 };
    } else if (s.id === 'breathe' || s.id === 'thread') {
      p.sword = false; p.expr = 'focus'; p.armL = { ang: -0.2 }; p.armR = { ang: 0.2 };
    } else if (s.id === 'dragon') {
      p.swordAng = -1.9; p.swordGlow = 0.9; p.armR = { ang: -1.0 }; p.expr = 'shout';
    } else if (s.id === 'wheel') {
      p.spin = k * Math.PI * 2; p.swordAng = -1.2; p.swordGlow = 1; p.expr = 'shout';
    } else if (s.id === 'ribbon' || s.id === 'river') {
      p.swordAng = -1.3; p.swordGlow = 0.5; p.armR = { ang: -0.7 };
    } else if (s.id === 'resolve' || s.id === 'endcard') {
      p.sword = false; p.expr = s.id === 'endcard' ? 'happy' : 'smile';
    } else if (s.id === 'night' || s.id === 'quiet' || s.id === 'embers') {
      p.swordAng = -0.9; p.swordGlow = 0.2;
    }
    chars.push(p);
  }
  if (s.chars.includes('master')) {
    chars.push({ ...base, name: 'master', x: 760, facing: -1, h: 450, expr: 'neutral', sword: false, armL: { ang: -0.4 }, armR: { ang: 0.5 } });
    const tj = chars.find((c) => c.name === 'tanjiro'); if (tj) tj.x = 360;
  }
  if (s.chars.includes('demon')) {
    const p = { ...base, name: 'demon', x: 540, facing: -1, h: 470, expr: 'demon', glowEyes: true, sword: false };
    p.armL = { ang: -0.9 }; p.armR = { ang: 0.9 }; p.lean = Math.sin(t * 2) * 0.05;
    chars.push(p);
    const tj = chars.find((c) => c.name === 'tanjiro'); if (tj) { tj.x = 300; tj.facing = 1; }
  }
  return chars;
}

/* ------------------------------------------------------------------- FX */

function worldFX(ctx, s, k, t, chars) {
  const gy = GROUND[s.env];
  const tj = chars.find((c) => c.name === 'tanjiro');
  const hx = tj ? tj.x : 540, hy = tj ? gy - 300 : gy - 300;
  for (const f of s.fx) {
    if (f === 'ribbon') {
      const pts = [[hx - 200, gy + 40], [hx - 80, gy - 120], [hx + 60, gy - 200], [hx + 160, gy - 320], [hx + 120, hy - 60]];
      waterRibbon(ctx, pts, { width: 26, t, seed: 3, alpha: 0.9 });
    } else if (f === 'dragon') {
      waterDragon(ctx, { x: hx + 40, y: gy - 60, scale: 1.5, t, rise: smoother(Math.min(1, k * 1.6)), seed: 5, facing: 1 });
    } else if (f === 'wheel') {
      waterWheel(ctx, hx, gy - 220, 240, t * 2, { alpha: 1 });
      splash(ctx, hx, gy - 220, (k * 2) % 1, { scale: 2 });
    } else if (f === 'arc') {
      const pts = [[hx - 160, hy + 80], [hx, hy - 40], [hx + 200, hy + 60]];
      waterRibbon(ctx, pts, { width: 34, t: t * 2, seed: 8, alpha: 1 - k * 0.4 });
    } else if (f === 'breath') {
      breathVapor(ctx, hx + 30, hy + 40, t, { scale: 1.6 });
    } else if (f === 'aura') {
      aura(ctx, hx, gy - 200, 220, t, { alpha: 0.6 + 0.4 * Math.sin(t * 3) });
    } else if (f === 'thread') {
      const dm = chars.find((c) => c.name === 'demon');
      const dx = dm ? dm.x : hx + 300;
      openingThread(ctx, hx + 40, hy, dx, gy - 320, t, { alpha: smoother(k) });
    } else if (f === 'embers') {
      embers(ctx, W, H, t, { count: 50, alpha: 0.8 });
    } else if (f === 'debris') {
      const rnd = rng(31);
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI - Math.PI; const v = 120 + rnd() * 200;
        const px = 760 + Math.cos(a) * v * k; const py = 1300 + Math.sin(a) * v * k + 300 * k * k;
        ctx.fillStyle = '#8a8a92'; ctx.strokeStyle = '#2c1a2e'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.rect(px, py, 14 + rnd() * 20, 12 + rnd() * 16); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    } else if (f === 'dust') {
      const rnd = rng(33);
      ctx.save(); ctx.fillStyle = `rgba(200,190,170,${0.4 * (1 - k)})`;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(700 + rnd() * 160, 1320 - k * 80 - rnd() * 40, 20 + k * 40, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    } else if (f === 'tally') {
      ctx.save();
      ctx.font = '800 120px InterTight, sans-serif'; ctx.textAlign = 'center';
      const n = Math.floor(1000 + k * 1000);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#2c1a2e'; ctx.lineWidth = 8;
      ctx.strokeText(String(n), 540, 760); ctx.fillText(String(n), 540, 760);
      ctx.font = '600 44px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('cuts', 540, 820);
      ctx.restore();
    } else if (f === 'sweat') {
      const rnd = rng(37);
      ctx.save(); ctx.fillStyle = 'rgba(180,220,255,0.7)';
      for (let i = 0; i < 6; i++) { const ph = (t * 2 + rnd()) % 1; ctx.beginPath(); ctx.arc(hx + (rnd() - 0.5) * 80, hy - 40 + ph * 120, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    } else if (f === 'rays') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,220,150,0.10)'); g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }
}

function screenFX(ctx, s, k, t) {
  if (s.fx.includes('snow')) snow(ctx, W, H, t, { count: 100 });
  if (s.fx.includes('speed') || s.id === 'slash') speedLines(ctx, W, H, t, { centre: [0.5, 0.45], rays: 36, innerFrac: 0.4, colour: 'rgba(255,255,255,0.5)' });
  if (s.fx.includes('flash') || s.id === 'boulder') {
    const fl = Math.max(0, 1 - Math.abs(k - 0.3) * 6);
    if (fl > 0) impactFlash(ctx, W, H, fl * 0.5);
  }
  if (s.fx.includes('eyes')) { /* demon glow handled in character */ }
}

/* -------------------------------------------------------------- captions */

function caption(ctx, t) {
  // word-grouped karaoke from measured alignment: show the current 3-5 word phrase
  const words = plan.words;
  let idx = -1;
  for (let i = 0; i < words.length; i++) { if (t >= words[i].t && t < words[i].t + words[i].dur + 0.12) { idx = i; break; } }
  if (idx < 0) return;
  const start = Math.max(0, idx - 2), end = Math.min(words.length, idx + 3);
  const phrase = words.slice(start, end).map((w) => w.word).join(' ').toLowerCase();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '800 64px InterTight, sans-serif';
  const y = H * 0.88;
  // soft triple-layer shadow (style notes), no box
  ctx.fillStyle = 'rgba(10,8,16,0.55)';
  ctx.fillText(phrase, W / 2 + 3, y + 4);
  ctx.fillStyle = 'rgba(10,8,16,0.35)';
  ctx.fillText(phrase, W / 2 + 1, y + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(phrase, W / 2, y);
  ctx.restore();
}

/* ---------------------------------------------------------------- render */

const big = createCanvas(W, H);
const gb = big.getContext('2d');
const dir = `${OUT}/.frames2d`;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

function renderFrame(i) {
  const t = i / FPS;
  let s = plan.shots[0];
  for (const sh of plan.shots) { if (i >= sh.f0 && i < sh.f1) { s = sh; break; } }
  const k = Math.min(1, Math.max(0, (i - s.f0) / Math.max(1, s.frames - 1)));
  const cam = cameraFor(s, k, t);
  const chars = stageFor(s, k, t);

  gb.save();
  gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H);
  drawWorld(gb, s.env, t, { light: s.light, cam });
  // depth-1 layer: characters + world FX move fully with the camera
  gb.save();
  gb.translate(W / 2, H / 2); gb.rotate(cam.roll); gb.scale(cam.zoom, cam.zoom);
  gb.translate(-W / 2 - cam.x, -H / 2 - cam.y);
  for (const c of chars) cast[c.name].draw(gb, c);
  worldFX(gb, s, k, t, chars);
  gb.restore();
  screenFX(gb, s, k, t);
  gradeFrame(gb, W, H, { vignette: 0.30, grainOpts: { amount: 0.04, seed: i }, bloomOpts: { threshold: 0.82, strength: 0.18, radius: 24 } });
  caption(gb, t);
  gb.restore();
}

const t0 = performance.now();
if (STILL >= 0) {
  renderFrame(STILL);
  fs.writeFileSync(`${OUT}/still-${STILL}.png`, await big.encode('png'));
  console.log('still', STILL, 'written');
} else {
  for (let i = START; i < Math.min(TOTAL, START + (arg('--count', TOTAL))); i++) {
    renderFrame(i);
    // JPEG intermediates: PNG encode at 1080x1920 cost ~800 ms/frame; JPEG ~60 ms
    // and we re-encode to H.264 anyway, so the quality loss is irrelevant.
    fs.writeFileSync(`${dir}/f${String(i).padStart(5, '0')}.jpg`, await big.encode('jpeg', 92));
    if (i % 150 === 0) console.log(`frame ${i}/${TOTAL}  ${((performance.now() - t0) / (i - START + 1)).toFixed(0)} ms/f`);
  }
  const done = Math.min(TOTAL, START + arg('--count', TOTAL)) - START;
  console.log(`rendered ${done} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s  (${((performance.now() - t0) / done).toFixed(0)} ms/f)`);
}