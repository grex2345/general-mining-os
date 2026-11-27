/**
 * waterfx.mjs — Round 7: Water Breathing effects, canvas2d, deterministic.
 *
 * Anime water-breathing reads as: flowing blue ribbons with a white foam core,
 * a serpentine dragon made of water, circular slash rings, spray particles.
 * Everything here is a pure function of (t, seed) so frames are reproducible.
 * Additive to vfx.mjs (which keeps the low-poly atmosphere effects).
 */
import { rng } from './cartoon.mjs';

const TAU = Math.PI * 2;

/** Sample a smooth spine through control points (Catmull-Rom). */
export function spinePoints(pts, samples = 40) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(t));
    const f = t - k;
    const p0 = P[k], p1 = P[k + 1], p2 = P[k + 2], p3 = P[k + 3];
    const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/**
 * Flowing water ribbon along a spine. Layered: outer glow, body gradient,
 * white foam core, moving highlight dashes. width tapers toward the tail.
 */
export function waterRibbon(ctx, pts, { width = 26, t = 0, seed = 1, alpha = 1, hue = 205, taper = 0.6 } = {}) {
  const sp = spinePoints(pts, 48);
  const rnd = rng(seed);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // build a tapered polygon around the spine
  const left = [], right = [];
  for (let i = 0; i < sp.length; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const f = i / (sp.length - 1);
    const w = width * (1 - taper * f) * (0.85 + 0.15 * Math.sin(f * 9 + t * 4 + seed));
    left.push([sp[i][0] + nx * w, sp[i][1] + ny * w]);
    right.push([sp[i][0] - nx * w, sp[i][1] - ny * w]);
  }
  const poly = () => {
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  };

  // glow
  ctx.globalCompositeOperation = 'lighter';
  poly();
  ctx.fillStyle = `hsla(${hue},90%,60%,${0.16 * alpha})`;
  ctx.filter = 'blur(6px)'; ctx.fill(); ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';

  // body
  poly();
  const g = ctx.createLinearGradient(sp[0][0], sp[0][1], sp[sp.length - 1][0], sp[sp.length - 1][1]);
  g.addColorStop(0, `hsla(${hue},85%,68%,${0.95 * alpha})`);
  g.addColorStop(0.5, `hsla(${hue + 12},80%,52%,${0.9 * alpha})`);
  g.addColorStop(1, `hsla(${hue + 20},85%,40%,${0.75 * alpha})`);
  ctx.fillStyle = g; ctx.fill();

  // foam core (white, thinner, offset toward one edge)
  ctx.beginPath();
  ctx.moveTo(sp[0][0], sp[0][1]);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
  ctx.strokeStyle = `hsla(${hue},60%,92%,${0.85 * alpha})`;
  ctx.lineWidth = width * 0.30;
  ctx.stroke();

  // moving highlight dashes = flow direction
  ctx.beginPath();
  ctx.moveTo(sp[0][0], sp[0][1]);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
  ctx.setLineDash([width * 0.9, width * 1.6]);
  ctx.lineDashOffset = -t * 160 - seed * 7;
  ctx.strokeStyle = `hsla(${hue},90%,85%,${0.5 * alpha})`;
  ctx.lineWidth = width * 0.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // spray droplets along the ribbon
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const f = rnd();
    const idx = Math.floor(f * (sp.length - 1));
    const p = sp[idx];
    const a = rnd() * TAU;
    const d = width * (0.8 + rnd() * 1.6);
    const px = p[0] + Math.cos(a) * d, py = p[1] + Math.sin(a) * d - (t * 30 % 20);
    ctx.fillStyle = `hsla(${hue},80%,80%,${(0.25 + rnd() * 0.4) * alpha})`;
    ctx.beginPath(); ctx.arc(px, py, 1 + rnd() * 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/**
 * The water dragon: a serpentine S-curve body with a head, foam crest, whiskers,
 * glowing eye, and spray. rise 0..1 controls how much of the body has emerged.
 */
export function waterDragon(ctx, { x = 0, y = 0, scale = 1, t = 0, rise = 1, seed = 5, alpha = 1, facing = 1 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale * facing, scale);
  // spine: rises from bottom, S-curves up to the head at top-right
  const wig = Math.sin(t * 2.2) * 12;
  const pts = [
    [0, 220],
    [-40 + wig * 0.3, 140],
    [50 + wig, 60],
    [-30 - wig * 0.5, -30],
    [40 + wig * 0.4, -120],
    [10, -190 * rise - 40 * (1 - rise)],
  ];
  const visible = pts.map((p, i) => [p[0], p[1] + (1 - rise) * 200 * (1 - i / pts.length)]);
  waterRibbon(ctx, visible, { width: 34, t, seed, alpha, hue: 202, taper: 0.35 });

  // head at the top of the spine
  const hp = visible[visible.length - 1];
  ctx.save();
  ctx.translate(hp[0], hp[1]);
  ctx.rotate(-0.3 + Math.sin(t * 2.2) * 0.08);
  // snout
  ctx.beginPath();
  ctx.moveTo(-26, 8);
  ctx.quadraticCurveTo(-30, -26, 6, -30);
  ctx.quadraticCurveTo(46, -30, 58, -6);
  ctx.quadraticCurveTo(48, 10, 20, 14);
  ctx.quadraticCurveTo(-6, 20, -26, 8);
  ctx.closePath();
  const hg = ctx.createLinearGradient(0, -30, 0, 20);
  hg.addColorStop(0, `hsla(202,85%,72%,${alpha})`);
  hg.addColorStop(1, `hsla(210,80%,48%,${alpha})`);
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = `hsla(205,70%,88%,${0.9 * alpha})`; ctx.lineWidth = 3; ctx.stroke();
  // eye
  ctx.fillStyle = `hsla(48,100%,70%,${alpha})`;
  ctx.beginPath(); ctx.ellipse(20, -14, 6, 4, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = `hsla(210,90%,20%,${alpha})`;
  ctx.beginPath(); ctx.arc(22, -14, 2, 0, TAU); ctx.fill();
  // whiskers
  ctx.strokeStyle = `hsla(200,80%,85%,${0.8 * alpha})`; ctx.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(50, -2 + s * 4);
    ctx.quadraticCurveTo(80, -10 + s * 16 + Math.sin(t * 3) * 4, 104, -22 + s * 22);
    ctx.stroke();
  }
  // foam crest along the head
  ctx.fillStyle = `hsla(200,70%,94%,${0.85 * alpha})`;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(-18 + i * 12, -26 - Math.sin(i + t * 4) * 3, 5 - i * 0.5, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // spray around the body
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const f = rnd();
    const p = visible[Math.floor(f * (visible.length - 1))];
    const a = rnd() * TAU, d = 30 + rnd() * 60;
    ctx.fillStyle = `hsla(202,85%,82%,${(0.2 + rnd() * 0.4) * alpha * rise})`;
    ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, 1 + rnd() * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Circular water-wheel slash: rotating gradient ring + droplets. */
export function waterWheel(ctx, cx, cy, r, t, { alpha = 1, seed = 3 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  const rot = t * 6;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (1 - k * 0.12), rot + k, rot + k + Math.PI * 1.5);
    ctx.strokeStyle = `hsla(${202 + k * 10},85%,${68 - k * 10}%,${(0.5 - k * 0.12) * alpha})`;
    ctx.lineWidth = r * (0.16 - k * 0.04);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // white core ring
  ctx.beginPath(); ctx.arc(0, 0, r * 0.94, rot, rot + Math.PI * 1.2);
  ctx.strokeStyle = `hsla(200,70%,94%,${0.8 * alpha})`; ctx.lineWidth = r * 0.05; ctx.stroke();
  // droplets flung outward
  for (let i = 0; i < 22; i++) {
    const a = rot + rnd() * TAU;
    const d = r * (1.0 + rnd() * 0.4);
    ctx.fillStyle = `hsla(202,85%,80%,${(0.3 + rnd() * 0.4) * alpha})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.5 + rnd() * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Radial splash crown + droplets at an impact point. p 0..1. */
export function splash(ctx, x, y, p, { scale = 1, seed = 2, alpha = 1 } = {}) {
  if (p <= 0 || p >= 1) return;
  const rnd = rng(seed);
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'lighter';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.15 + 0.7 * (i / (n - 1)));
    const v = 60 + rnd() * 80;
    const px = Math.cos(a) * v * p;
    const py = Math.sin(a) * v * p + 90 * p * p;   // gravity
    ctx.fillStyle = `hsla(202,85%,80%,${(1 - p) * alpha})`;
    ctx.beginPath(); ctx.arc(px, py, 2 + rnd() * 3, 0, TAU); ctx.fill();
  }
  // crown arc
  ctx.beginPath(); ctx.arc(0, 0, 30 * p, Math.PI, TAU);
  ctx.strokeStyle = `hsla(200,80%,88%,${(1 - p) * 0.8 * alpha})`; ctx.lineWidth = 4 * (1 - p); ctx.stroke();
  ctx.restore();
}

/** Breath vapor puffs (total concentration). */
export function breathVapor(ctx, x, y, t, { scale = 1, seed = 4, alpha = 1 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.7 + i * 0.16) % 1;
    const px = x + (rnd() - 0.5) * 20 * scale + ph * 30 * scale;
    const py = y - ph * 50 * scale;
    const r = (6 + ph * 16) * scale;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(220,235,255,${(1 - ph) * 0.35 * alpha})`);
    g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Rising energy aura particles around a point. */
export function aura(ctx, x, y, r, t, { seed = 6, alpha = 1, hue = 200 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `hsla(${hue},80%,60%,${0.18 * alpha})`);
  g.addColorStop(1, `hsla(${hue},80%,60%,0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  for (let i = 0; i < 18; i++) {
    const ph = (t * 0.5 + rnd()) % 1;
    const a = rnd() * TAU;
    const px = x + Math.cos(a) * r * (0.4 + rnd() * 0.5);
    const py = y + r * 0.5 - ph * r * 1.4;
    ctx.fillStyle = `hsla(${hue},85%,75%,${(1 - ph) * 0.6 * alpha})`;
    ctx.beginPath(); ctx.arc(px, py, 1 + rnd() * 2.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** The "opening thread": a glowing taut line with a travelling pulse. */
export function openingThread(ctx, x0, y0, x1, y1, t, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,220,120,${0.7 * alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const ph = (t * 0.9) % 1;
  const px = x0 + (x1 - x0) * ph, py = y0 + (y1 - y0) * ph;
  const g = ctx.createRadialGradient(px, py, 0, px, py, 14);
  g.addColorStop(0, `rgba(255,240,180,${0.9 * alpha})`); g.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = g; ctx.fillRect(px - 14, py - 14, 28, 28);
  ctx.restore();
}

/** Floating embers (demon dissolve / aftermath). */
export function embers(ctx, w, h, t, { seed = 8, count = 40, alpha = 1 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x0 = rnd() * w, sp = 0.3 + rnd() * 0.7, ph = rnd() * 10;
    const y = h - ((t * sp * 40 + ph * 30) % (h + 40));
    const x = x0 + Math.sin(t * 0.8 + ph) * 14;
    const a = (0.2 + rnd() * 0.5) * alpha;
    ctx.fillStyle = `rgba(255,${120 + (rnd() * 80) | 0},60,${a})`;
    ctx.beginPath(); ctx.arc(x, y, 1 + rnd() * 2.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Snowfall (screen space). */
export function snow(ctx, w, h, t, { seed = 5, count = 90, alpha = 1 } = {}) {
  const rnd = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const sp = 0.3 + rnd() * 0.8, x0 = rnd() * w, ph = rnd() * 100;
    const y = ((t * sp * 30 + ph * 7) % (h + 30)) - 15;
    const x = x0 + Math.sin(t * 0.8 + ph) * 8;
    ctx.fillStyle = `rgba(232,240,255,${(0.3 + rnd() * 0.5) * alpha})`;
    const sz = rnd() > 0.85 ? 3 : 2;
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.restore();
}