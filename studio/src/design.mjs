// Design tokens + drawing primitives shared by every scene engine.
// The research was blunt about the failure mode: "elements that fly to positions
// that were never designed". So every scene here lays out its FULL static frame
// first (layout()), and animation only controls when an already-placed element
// appears (reveal()). Layout is a pure function of the spec; motion is a pure
// function of frame. Nothing reads the clock or Math.random().

import { ensureFonts, FONTS } from './env.mjs';

export const PALETTES = {
  // Default: matches the General Mining OS app shell (dark, teal accent).
  midnight: {
    bg: '#080b10',
    bgAlt: '#0d1219',
    panel: '#121821',
    grid: 'rgba(255,255,255,0.045)',
    ink: '#f2f6f8',
    inkDim: '#9aa7b4',
    accent: '#5eead4',
    accent2: '#f5b544',
    danger: '#f2607a',
    series: ['#5eead4', '#f5b544', '#7aa2f7', '#f2607a', '#c4a7f7'],
  },
  paper: {
    bg: '#f7f5f0',
    bgAlt: '#efece5',
    panel: '#ffffff',
    grid: 'rgba(0,0,0,0.05)',
    ink: '#111418',
    inkDim: '#5c646e',
    accent: '#0f766e',
    accent2: '#b45309',
    danger: '#b91c1c',
    series: ['#0f766e', '#b45309', '#1d4ed8', '#b91c1c', '#6d28d9'],
  },
  ember: {
    bg: '#120a08',
    bgAlt: '#1b0f0c',
    panel: '#241410',
    grid: 'rgba(255,255,255,0.05)',
    ink: '#fff5ef',
    inkDim: '#c2a59a',
    accent: '#ff8a3d',
    accent2: '#ffd166',
    danger: '#ff4d6d',
    series: ['#ff8a3d', '#ffd166', '#ff4d6d', '#8ecae6', '#c77dff'],
  },
};

export function palette(ir) {
  const name = ir.palette || 'midnight';
  const p = PALETTES[name];
  if (!p) throw new Error(`unknown palette ${name}`);
  return p;
}

// --- timing helpers -------------------------------------------------------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Normalised 0..1 progress for a sub-window of the scene. */
export function prog(t, start, dur) {
  if (dur <= 0) return t >= start ? 1 : 0;
  return clamp((t - start) / dur);
}

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  // a spring-ish overshoot used for "pop" entrances (iart: damping 10..14)
  outBack: (t, s = 1.42) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};

/** Seeded hash RNG: deterministic across workers (never Math.random). */
export function hash(n) {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// --- drawing primitives ---------------------------------------------------
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Word-wrap into lines that fit maxWidth, using the ctx's current font. */
export function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Fit a font size so `text` occupies at most maxWidth on one line. */
export function fitFont(ctx, text, { family, weight = 700, maxWidth, start, min = 24 }) {
  let size = start;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(String(text)).width <= maxWidth) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

/** Draw text with tabular-nums-friendly spacing and optional letter-spacing. */
export function drawText(ctx, text, x, y, { size, weight = 500, family, color, align = 'left', spacing = 0, baseline = 'alphabetic' }) {
  ensureFonts();
  const fam = family || FONTS.text;
  ctx.save();
  ctx.fillStyle = color || '#fff';
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${weight} ${size}px ${fam}`;
  if (!spacing) ctx.fillText(String(text), x, y);
  else {
    // manual letter-spacing (canvas has no native support)
    const chars = [...String(text)];
    const widths = chars.map((c) => ctx.measureText(c).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i]; });
  }
  ctx.restore();
}

// Scene-local time, set by renderScene before an engine paints. The backdrop
// uses it so every scene has slow, large-scale motion: GIF-smooth glow drift and
// a slowly panning grid. This is not decoration -- grain alone gets quantised
// away by the encoder at low bitrates and the video measures as frozen frames.
let __sceneTime = 0;
export function setSceneTime(t) { __sceneTime = t; }

/** Draws a subtle grid, used by data scenes to feel "designed". */
export function drawGrid(ctx, W, H, pal, { step = 60, alpha = 1, drift = true } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  // grid pans diagonally at ~5px/s and wraps: motion survives h264 quantisation
  const ox = drift ? ((__sceneTime * 5) % step) : 0;
  const oy = drift ? ((__sceneTime * 3) % step) : 0;
  for (let x = -step + ox; x <= W + step; x += step) { ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke(); }
  for (let y = -step + oy; y <= H + step; y += step) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke(); }
  ctx.restore();
}

/** Vertical gradient background with a soft accent glow in one corner. */
export function drawBackground(ctx, W, H, pal, { glow = true, glowColor } = {}) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, pal.bgAlt);
  g.addColorStop(1, pal.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (glow) {
    const r = Math.max(W, H) * 0.62;
    // slow orbit: two counter-phased glows so the backdrop is never static
    const cx = W * 0.82 + Math.sin(__sceneTime * 0.45) * W * 0.10;
    const cy = H * 0.12 + Math.cos(__sceneTime * 0.33) * H * 0.05;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, hexA(glowColor || pal.accent, 0.20));
    rg.addColorStop(1, hexA(glowColor || pal.accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    const cx2 = W * 0.15 + Math.cos(__sceneTime * 0.27) * W * 0.08;
    const cy2 = H * 0.88 + Math.sin(__sceneTime * 0.39) * H * 0.04;
    const rg2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r * 0.7);
    rg2.addColorStop(0, hexA(pal.ink, 0.05));
    rg2.addColorStop(1, hexA(pal.ink, 0));
    ctx.fillStyle = rg2;
    ctx.fillRect(0, 0, W, H);
  }
}

export function hexA(hex, a) {
  if (hex.startsWith('rgba')) return hex;
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Pill / chip label. */
export function chip(ctx, text, x, y, { pal, size = 26, padX = 22, padY = 12, color }) {
  ensureFonts();
  ctx.font = `600 ${size}px ${FONTS.text}`;
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padY * 2;
  fillRoundRect(ctx, x, y, w, h, h / 2, hexA(color || pal.accent, 0.14));
  drawText(ctx, text, x + padX, y + h / 2 + size * 0.35, { size, weight: 600, color: color || pal.accent });
  return { w, h };
}

/**
 * Brand furniture drawn on every frame: a thin top rule + a wordmark + the
 * sequence index. Keeps a multi-scene film reading as one piece (HyperFrames
 * "carrier element" idea) and gives YouTube a consistent identity.
 */
export function drawBrand(ctx, W, H, pal, { brand, index, total, progress }) {
  const m = Math.round(W * 0.055);
  ctx.save();
  // top rule with progress fill
  ctx.fillStyle = hexA(pal.ink, 0.12);
  ctx.fillRect(m, m, W - m * 2, 3);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(m, m, (W - m * 2) * clamp(progress), 3);
  // wordmark
  drawText(ctx, brand || 'GENERAL MINING OS', m, m + 40, {
    size: 22, weight: 700, family: FONTS.mono, color: hexA(pal.ink, 0.55), spacing: 2.4,
  });
  if (index && total) {
    drawText(ctx, `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W - m, m + 40, {
      size: 22, weight: 700, family: FONTS.mono, color: hexA(pal.ink, 0.35), align: 'right', spacing: 1.6,
    });
  }
  ctx.restore();
}

/** Progress bar along the very bottom (retention cue). */
export function drawProgressBar(ctx, W, H, pal, p) {
  const h = 6;
  ctx.save();
  ctx.fillStyle = hexA(pal.ink, 0.08);
  ctx.fillRect(0, H - h, W, h);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, H - h, W * clamp(p), h);
  ctx.restore();
}

/**
 * Deterministic film grain. Two jobs: it stops authored typography holds from
 * measuring as "frozen frames", and it adds the slight texture that separates a
 * rendered graphic from a flat vector export. Seeded by frame index, never random.
 */
export function drawGrain(ctx, W, H, pal, frame, { count = 220, alpha = 0.05 } = {}) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const h1 = hash(frame * 1.13 + i * 7.77);
    const h2 = hash(frame * 2.71 + i * 3.31);
    const h3 = hash(frame * 0.37 + i * 11.1);
    const x = h1 * W;
    const y = h2 * H;
    const r = 0.6 + h3 * 1.7;
    ctx.globalAlpha = alpha * (0.35 + h3 * 0.65);
    ctx.fillStyle = h3 > 0.5 ? pal.ink : pal.accent;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
