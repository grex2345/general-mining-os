/**
 * kinetic.mjs — motion-graphics primitives learned from the Round 8 reference study.
 *
 * Sources studied (see research/ROUND8_REFERENCE_STUDY.md):
 *  - V2/V3 (@Silenthys anime-explainer shorts): word-karaoke captions, animated
 *    counters with pulse rings, perpetual ray/particle backdrop, glass cards,
 *    eased element entrances at semantic beats.
 *  - Remotion interpolate()/spring() keyframe model (remotion.dev/docs/interpolate).
 *  - Manim rate functions (ease_out_back entrance -> hold -> ease_in exit -> Indicate pulse).
 *  - video-talkcraft "anti-slideshow" rules: every beat has a live picture response;
 *    one protagonist per beat; perpetual background so no frame is ever static.
 *
 * ADDITIVE module: imports only the existing ease table; changes no existing engine.
 * Pure canvas2d drawing — works with the same @napi-rs/canvas context the studio uses.
 */
import { ease } from './animation.mjs';

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Remotion-style multi-keyframe interpolation with per-segment easing + clamp. */
export function interpolate(x, inR, outR, { easing = ease.linear, clamp = 'clamp' } = {}) {
  const n = inR.length;
  if (x <= inR[0]) {
    if (clamp === 'clamp') return outR[0];
    const k = (x - inR[0]) / (inR[1] - inR[0]);
    return outR[0] + (outR[1] - outR[0]) * k;
  }
  if (x >= inR[n - 1]) {
    if (clamp === 'clamp') return outR[n - 1];
    const k = (x - inR[n - 2]) / (inR[n - 1] - inR[n - 2]);
    return outR[n - 2] + (outR[n - 1] - outR[n - 2]) * k;
  }
  let i = 0;
  while (i < n - 1 && x > inR[i + 1]) i++;
  const k = clamp01((x - inR[i]) / (inR[i + 1] - inR[i]));
  const e = Array.isArray(easing) ? easing[i] : easing;
  return outR[i] + (outR[i + 1] - outR[i]) * e(k);
}

/** Damped-spring step response (0->1) over t seconds. Real physics, not a fake ease. */
export function spring(t, { damping = 14, stiffness = 170, mass = 1 } = {}) {
  const w = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w * t) * (1 + w * t);
}

/** Manim "there_and_back": 0 -> 1 -> 0, for emphasis pulses. */
export const pulse = (t) => Math.sin(clamp01(t) * Math.PI);

/** Eased entrance transform: scale up + fade in + rise. Default springy outBack. */
export function entrance(k, { ef = ease.outBack, from = 0.62, dy = 26 } = {}) {
  const e = ef(clamp01(k));
  return { scale: from + (1 - from) * e, opacity: clamp01(k * 1.5), dy: dy * (1 - e) };
}
/** Eased exit transform: shrink + fade + drift. */
export function exit(k, { ef = ease.inCubic, dy = -22 } = {}) {
  const e = ef(clamp01(k));
  return { scale: 1 - 0.16 * e, opacity: 1 - clamp01(k), dy: dy * e };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Glassmorphic dark card (V2 equation card). k = entrance progress 0..1. */
export function glassCard(ctx, { x, y, w, h, r = 30, k = 1 }) {
  const en = entrance(k, { from: 0.86, dy: 18 });
  ctx.save();
  ctx.globalAlpha = en.opacity;
  ctx.translate(x + w / 2, y + h / 2 + en.dy);
  ctx.scale(en.scale, en.scale);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(10,14,32,0.62)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();
  // top sheen
  roundRectPath(ctx, x + 3, y + 3, w - 6, h * 0.4, r - 3);
  const g = ctx.createLinearGradient(0, y, 0, y + h * 0.4);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * Word-by-word karaoke caption (the V2/V3 signature device).
 * words: [{word, t, dur}] seconds. Shows a sliding window centered on the spoken
 * word; the current word is bold + accent (and pops), keywords stay colored.
 */
export function karaokeCaption(ctx, {
  words, t, cx, y, maxW, size = 46,
  family = 'Inter Tight', boldFamily = 'Inter Tight Bold',
  accent = '#ffd23f', keywordColor = '#ff5470', keywords = [], window = 5,
}) {
  if (!words?.length) return;
  let idx = words.findIndex((w) => t >= w.t && t < w.t + w.dur);
  if (idx < 0) idx = t < words[0].t ? 0 : words.length - 1;
  const half = Math.floor(window / 2);
  let start = Math.max(0, idx - half);
  let end = Math.min(words.length, start + window);
  start = Math.max(0, end - window);
  const slice = words.slice(start, end).map((w, j) => ({ ...w, gi: start + j }));
  const isKey = (w) => keywords.includes(w.word.toLowerCase().replace(/[^a-z0-9%]/g, ''));

  // measure at base size, shrink to fit maxW
  let s = size;
  const measure = (sz) => {
    let tot = 0;
    for (const w of slice) {
      const cur = w.gi === idx;
      ctx.font = `${cur ? sz : sz * 0.92}px "${cur ? boldFamily : family}"`;
      tot += ctx.measureText(w.word).width + sz * 0.28;
    }
    return tot - sz * 0.28;
  };
  while (measure(s) > maxW && s > 22) s -= 2;

  const gap = s * 0.28;
  const widths = slice.map((w) => {
    const cur = w.gi === idx;
    ctx.font = `${cur ? s : s * 0.92}px "${cur ? boldFamily : family}"`;
    return ctx.measureText(w.word).width;
  });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (slice.length - 1);
  let x = cx - total / 2;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  slice.forEach((w, j) => {
    const cur = w.gi === idx;
    const past = w.gi < idx;
    const key = isKey(w);
    const pop = cur ? 1 + 0.08 * pulse((t - w.t) / Math.max(0.001, w.dur)) : 1;
    ctx.save();
    ctx.translate(x + widths[j] / 2, y);
    ctx.scale(pop, pop);
    ctx.font = `${cur ? s : s * 0.92}px "${cur ? boldFamily : family}"`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = key ? keywordColor : cur ? accent : past ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)';
    ctx.fillText(w.word, -widths[j] / 2, 0);
    ctx.restore();
    x += widths[j] + gap;
  });
  ctx.restore();
}

/** Animated counter ticking from->to with a rotating highlight ring while counting (V2). */
export function animatedCounter(ctx, {
  x, y, from = 0, to = 100, t0, t1, t, size = 104,
  color = '#ffd23f', family = 'Inter Tight Bold', suffix = '', ring = true,
  format = (v) => Math.round(v).toLocaleString(),
}) {
  const k = clamp01((t - t0) / Math.max(0.001, t1 - t0));
  const v = from + (to - from) * ease.outCubic(k);
  const label = format(v) + suffix;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px "${family}"`;
  const w = ctx.measureText(label).width;
  if (ring && k > 0.001 && k < 0.999) {
    const rr = w * 0.62 + size * 0.28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 3.2);
    ctx.lineWidth = size * 0.07;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
  ctx.restore();
  return v;
}

/**
 * Perpetual ray + particle backdrop (V2). Rays rotate slowly and particles drift
 * every frame, so even a held foreground beat never reads as a static frame.
 */
export function rayBackdrop(ctx, W, H, t, {
  base = '#0a1236', glow = '#1d3f9e', ray = 'rgba(120,160,255,0.10)',
  particle = '#ffd23f', seed = 7, cx = W / 2, cy = H * 0.6, rays = 22, particles = 46,
} = {}) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.85);
  g.addColorStop(0, glow);
  g.addColorStop(0.55, base);
  g.addColorStop(1, '#05081c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // rotating rays
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.06);
  ctx.fillStyle = ray;
  const R = Math.max(W, H) * 1.2;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = 0.018 + 0.01 * Math.sin(i * 1.7 + seed);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R);
    ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // drifting particles (deterministic)
  ctx.save();
  for (let i = 0; i < particles; i++) {
    const sx = ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
    const sy = ((Math.sin(i * 78.233 + seed * 3) * 12543.123) % 1 + 1) % 1;
    const speed = 0.01 + 0.02 * sx;
    const px = (sx * W + Math.sin(t * 0.5 + i) * 12) % W;
    const py = ((sy - t * speed) % 1 + 1) % 1 * H;
    const r = 1.5 + 2.5 * sy;
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(t * 1.3 + i));
    ctx.fillStyle = particle;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
