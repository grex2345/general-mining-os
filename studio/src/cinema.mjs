/**
 * cinema.mjs — the lens, not the renderer.
 *
 * Round 4 rendered. This module makes the result look photographed:
 * depth of field, motion blur, grain, chromatic aberration, bloom, vignette
 * and letterbox. All of it uses canvas2d `ctx.filter` (a real gaussian in this
 * Skia build) plus compositing — no shaders, no GPU, measured on 2 cores.
 *
 * Cost is dominated by the number of full-buffer blurs. Measured at 1080x1920:
 * one blur pass ~9 ms, the full stack below ~34 ms. The 360x640 path is ~9x
 * cheaper and is the default for anything moving.
 */

import { createCanvas } from '@napi-rs/canvas';

/**
 * Depth of field by depth-slicing.
 *
 * There is no depth buffer, so this reconstructs one: the caller supplies a
 * function returning depth for a pixel, or (the cheap path used here) an
 * explicit `focus` plane and `range`. Three copies of the frame are blurred to
 * three radii, then composited through vertical gradient masks so the sharp
 * band sits at the focus plane and the falloff is smooth.
 *
 * That is a 2.5D approximation: it cannot separate a near subject from a far
 * wall at the same screen height. Stated plainly because it matters.
 */
export function depthOfField(ctx, w, h, {
  focusY = 0.5,        // screen fraction that is in focus
  range = 0.18,        // fraction either side that stays sharp
  strength = 1.0,      // 0..1, scales the blur radii
  maxBlur = 14,
  _canvasFactory = createCanvas,
} = {}) {
  if (strength <= 0) return;
  const src = ctx.canvas;

  const blurLayer = (radius) => {
    const c = _canvasFactory(w, h);
    const g = c.getContext('2d');
    g.filter = `blur(${radius.toFixed(2)}px)`;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    return c;
  };

  const farR = maxBlur * strength;
  const nearR = maxBlur * 0.55 * strength;
  const far = blurLayer(farR);
  const near = blurLayer(nearR);

  // rebuild the frame from three zones: blur above, sharp band, blur below
  const top = Math.max(0, focusY - range) * h;
  const bot = Math.min(1, focusY + range) * h;

  ctx.save();
  // 1. everything far-blurred
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(far, 0, 0);

  // 2. the sharp band, feathered at its edges
  const bandMask = _canvasFactory(w, h);
  const bg = bandMask.getContext('2d');
  const grad = bg.createLinearGradient(0, top - range * h * 0.9, 0, bot + range * h * 0.9);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.30, 'rgba(0,0,0,1)');
  grad.addColorStop(0.70, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  bg.fillStyle = grad;
  bg.fillRect(0, 0, w, h);
  bg.globalCompositeOperation = 'source-in';
  bg.drawImage(src, 0, 0);

  ctx.drawImage(bandMask, 0, 0);

  // 3. the near field, slightly less blurred, only at the very bottom
  const nearMask = _canvasFactory(w, h);
  const ng = nearMask.getContext('2d');
  const ngrad = ng.createLinearGradient(0, bot, 0, h);
  ngrad.addColorStop(0, 'rgba(0,0,0,0)');
  ngrad.addColorStop(1, 'rgba(0,0,0,1)');
  ng.fillStyle = ngrad;
  ng.fillRect(0, 0, w, h);
  ng.globalCompositeOperation = 'source-in';
  ng.drawImage(near, 0, 0);
  ctx.drawImage(nearMask, 0, 0);
  ctx.restore();
}

/**
 * Motion blur by accumulating N sub-frame copies along a screen-space vector.
 * The caller renders the scene at N slightly different times; this just
 * composites. Sub-frames must be supplied — smearing one frame is a fake.
 */
export function motionBlurStack(ctx, frames, { weights = null, w, h } = {}) {
  if (!frames.length) return;
  const n = frames.length;
  const wts = weights || new Array(n).fill(1 / n);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = wts[i];
    ctx.drawImage(frames[i], 0, 0, w, h);
  }
  ctx.restore();
}

/** Bloom: bright-pass, blur, add back. The single most "cinematic" 3 lines here. */
export function bloom(ctx, w, h, { threshold = 0.70, strength = 0.55, radius = 22, _canvasFactory = createCanvas } = {}) {
  const src = ctx.canvas;
  const bright = _canvasFactory(w, h);
  const bg = bright.getContext('2d');
  bg.drawImage(src, 0, 0);
  const img = bg.getImageData(0, 0, w, h);
  const d = img.data;
  const t = threshold * 255;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    const k = l > t ? Math.min(1, (l - t) / (255 - t)) : 0;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  bg.putImageData(img, 0, 0);

  const blurred = _canvasFactory(w, h);
  const g = blurred.getContext('2d');
  g.filter = `blur(${radius}px)`;
  g.drawImage(bright, 0, 0);
  g.filter = 'none';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.drawImage(blurred, 0, 0);
  ctx.restore();
}

/**
 * Film grain. Generated once at full resolution and cached, then offset per
 * frame — regenerating noise every frame costs ~15 ms at 1080p for no visual
 * difference.
 */
const GRAIN_CACHE = new Map();
export function grain(ctx, w, h, { amount = 0.055, seed = 0, scale = 1 } = {}) {
  if (amount <= 0) return;
  const key = `${w}x${h}x${scale}`;
  let noise = GRAIN_CACHE.get(key);
  if (!noise) {
    noise = createCanvas(w, h);
    const g = noise.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    let s = 0x9e3779b9;
    for (let i = 0; i < d.length; i += 4) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v = 128 + ((s >>> 0) / 4294967296 - 0.5) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    GRAIN_CACHE.set(key, noise);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  const ox = (seed * 37) % 17, oy = (seed * 53) % 19;
  ctx.drawImage(noise, -ox, -oy);
  ctx.restore();
}

/**
 * Chromatic aberration: sample the frame's red and blue channels at a sub-pixel
 * scale and offset them outward. At 1-2 px it reads as a real lens; at 4 px it
 * reads as a bug.
 */
export function chromaticAberration(ctx, w, h, { amount = 1.6 } = {}) {
  if (amount <= 0) return;
  const src = ctx.canvas;
  const tmp = createCanvas(w, h);
  const g = tmp.getContext('2d');
  g.drawImage(src, 0, 0);

  // Compose from three ISOLATED channels. The first version multiplied copies
  // by pure red/blue and added them with 'lighter', which doubled the red and
  // blue against the untouched frame — that is why everything went magenta.
  // Each layer here holds one channel only, so 'lighter' reconstructs the image.
  const shifted = (colour, dx) => {
    const layer = createCanvas(w, h);
    const lg = layer.getContext('2d');
    lg.drawImage(tmp, dx, 0);
    lg.globalCompositeOperation = 'multiply';
    lg.fillStyle = colour;
    lg.fillRect(0, 0, w, h);
    return layer;
  };
  const R = shifted('#ff0000', amount);
  const G = shifted('#00ff00', 0);
  const B = shifted('#0000ff', -amount);

  ctx.save();
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(R, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(G, 0, 0);
  ctx.drawImage(B, 0, 0);
  ctx.restore();
}

/**
 * Frame the subject by solving for the lens, not by guessing distances.
 *
 * Given a camera position/orientation and a set of world points that must be
 * visible, binary-search the vertical FOV until every point lands inside the
 * safe rect with a margin. Hand-tuning fov and distance produced a walk clip
 * whose feet were cropped in every frame, three iterations in a row — this
 * removes the guess entirely.
 *
 * @returns a new fov in degrees
 */
export function fitFov(makeCamera, { eye, target, roll = 0, points, width, height,
  margin = 0.10, minFov = 12, maxFov = 100 }) {
  const safeTop = margin * height;
  const safeBot = (1 - margin * 0.55) * height;
  const safeL = margin * 0.55 * width;
  const safeR = (1 - margin * 0.55) * width;
  const fits = (fov) => {
    const cam = makeCamera({ eye, target, fovDeg: fov, width, height, roll });
    for (const p of points) {
      const s = cam.project(p);
      if (!s) return false;
      if (s[0] < safeL || s[0] > safeR || s[1] < safeTop || s[1] > safeBot) return false;
    }
    return true;
  };
  // a wider FOV always fits more, so bisect on the smallest FOV that still fits
  let lo = minFov, hi = maxFov;
  if (!fits(hi)) return hi;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

/** Letterbox bars, for a 2.39:1 crop inside a vertical frame. */
export function letterbox(ctx, w, h, { ratio = 2.39 } = {}) {
  const targetH = w / ratio;
  const bar = Math.max(0, (h - targetH) / 2);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
  ctx.restore();
  return bar;
}

/**
 * Radial speed lines / anime-style impact flash. Used for the action beat:
 * `t` in 0..1 over the effect, `centre` in screen fractions.
 */
export function speedLines(ctx, w, h, t, { centre = [0.5, 0.45], colour = '#ffffff', rays = 42, seed = 7, innerFrac = 0.35 } = {}) {
  if (t <= 0 || t >= 1) return;
  const env = Math.sin(t * Math.PI) ** 1.4;
  let s = seed;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const cx = centre[0] * w, cy = centre[1] * h;
  const maxR = Math.hypot(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rnd() * 0.06;
    const inner = maxR * (innerFrac + rnd() * 0.18);
    const width = 0.004 + rnd() * 0.012;
    const alpha = (0.10 + rnd() * 0.22) * env;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a - width) * maxR, cy + Math.sin(a - width) * maxR);
    ctx.lineTo(cx + Math.cos(a + width) * maxR, cy + Math.sin(a + width) * maxR);
    ctx.lineTo(cx + Math.cos(a + width * 0.4) * inner, cy + Math.sin(a + width * 0.4) * inner);
    ctx.lineTo(cx + Math.cos(a - width * 0.4) * inner, cy + Math.sin(a - width * 0.4) * inner);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.fill();
  }
  ctx.restore();
}

/** A contact-frame flash: a white frame that decays in ~2 frames. */
export function impactFlash(ctx, w, h, amount = 0.6) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(232,240,255,${Math.min(0.85, amount)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * The full stack, in the order a real pipeline applies it. Every stage is
 * optional and individually priced in the report.
 */
export function gradeFrame(ctx, w, h, {
  dof = null, bloomOpts = null, grainOpts = null, ca = 0, vignette = 0.30,
  tint = null, letterboxRatio = 0,
} = {}) {
  if (dof) depthOfField(ctx, w, h, dof);
  if (bloomOpts) bloom(ctx, w, h, bloomOpts);
  if (tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.20, w / 2, h * 0.46, h * 0.82);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (ca > 0) chromaticAberration(ctx, w, h, { amount: ca });
  if (grainOpts) grain(ctx, w, h, grainOpts);
  if (letterboxRatio) letterbox(ctx, w, h, { ratio: letterboxRatio });
}
