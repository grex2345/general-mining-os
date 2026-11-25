/**
 * vfx.mjs — cinematic effects that are cheap enough for 2 CPU cores.
 *
 * Sources, in the ledger:
 *   - zach-d-films main.js        bloom threshold/strength, elliptical vignette + grain
 *   - low-poly template.html      PS1 vertex snapping, 15-bit ordered dither, 360x640
 *                                 internal render upscaled with nearest-neighbour
 *   - cartoon-short-kit           flat two-tone shading, self-coloured outlines
 *
 * Everything here is pure canvas2d + arithmetic: no shaders, no WebGL, no deps.
 */

import { rng } from './cartoon.mjs';

/** 15-bit ordered-dither quantisation levels, as the low-poly template uses. */
const LV = 31;

/* ------------------------------------------------------------ light shafts */

/**
 * Volumetric god rays, faked the way film does it: a bundle of soft-edged
 * wedges radiating from a light source, additively blended, occluded by a
 * caller-supplied mask.
 *
 * Cost is O(rays), not O(pixels) — that is the whole trick. A per-pixel
 * radial-blur approach costs ~40 ms at 1080x1920; this costs ~2 ms.
 *
 * @param {object} o
 *  - origin [x,y] where the light enters the frame
 *  - angle, spread  direction and fan width in radians
 *  - rays, length   count and reach in px
 *  - colour         rgb 0..1
 *  - intensity      0..1
 *  - t              time, animates a subtle drift
 *  - mask           optional fn(ctx) that is drawn as a dark layer with
 *                   'destination-out' to punch out occluders
 */
export function drawLightShafts(ctx, {
  origin = [540, -200], angle = Math.PI * 0.5, spread = 0.55,
  rays = 14, length = 2200, colour = [1, 0.94, 0.78], intensity = 0.30,
  t = 0, seed = 3, mask = null, sway = 0.5,
} = {}) {
  const [ox, oy] = origin;
  const r = rng(seed);

  // Build the shafts on an offscreen-free basis: clip to a fan, then paint wedges.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < rays; i++) {
    const f = rays === 1 ? 0.5 : i / (rays - 1);
    // uneven spacing and width: uniform rays read as a sprite, not as light
    const wob = (r() - 0.5);
    const a = angle + (f - 0.5) * spread + wob * 0.035 + Math.sin(t * 0.6 + i) * 0.004 * sway;
    const width = (0.012 + r() * 0.030) * (1 + Math.sin(t * 0.9 + i * 1.7) * 0.10);
    const reach = length * (0.72 + r() * 0.36);
    const fade = 0.35 + r() * 0.65;

    const x1 = ox + Math.cos(a - width) * reach;
    const y1 = oy + Math.sin(a - width) * reach;
    const x2 = ox + Math.cos(a + width) * reach;
    const y2 = oy + Math.sin(a + width) * reach;

    // Gradient offsets are measured along the gradient AXIS, so a narrow wedge
    // (small `width`) sees only the first few pixels of it. Offsets must be
    // projected onto the axis, not written as absolute distances.
    const ax = Math.cos(a), ay = Math.sin(a);
    const p1 = (Math.cos(a - width) * reach) * ax + (Math.sin(a - width) * reach) * ay;
    const p2 = (Math.cos(a + width) * reach) * ax + (Math.sin(a + width) * reach) * ay;
    const lo = Math.min(0, p1, p2, reach), hi = Math.max(0.001, p1, p2, reach);
    const g = ctx.createLinearGradient(ox, oy, ox + ax * reach, oy + ay * reach);
    const c = colour.map((v) => Math.round(v * 255)).join(',');
    g.addColorStop(0, `rgba(${c},${(intensity * fade).toFixed(3)})`);
    g.addColorStop(Math.max(0.02, Math.min(0.92, (0.45 * reach - lo) / (hi - lo))), `rgba(${c},${(intensity * fade * 0.40).toFixed(3)})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // occlusion: everything the mask paints is removed from the shafts
  if (mask) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    mask(ctx);
    ctx.restore();
  }
}

/**
 * Cheap atmospheric haze: a few large soft blobs of the light colour, drawn
 * additively. Gives depth without a fog volume.
 */
export function drawHaze(ctx, w, h, {
  colour = [0.55, 0.68, 0.85], intensity = 0.12, t = 0, seed = 9, blobs = 6,
} = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs; i++) {
    const x = r() * w + Math.sin(t * 0.3 + i) * w * 0.02;
    const y = r() * h * 0.8 + Math.cos(t * 0.24 + i) * h * 0.015;
    const rad = (0.18 + r() * 0.35) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = colour.map((v) => Math.round(v * 255)).join(',');
    g.addColorStop(0, `rgba(${c},${(intensity * (0.5 + r() * 0.5)).toFixed(3)})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- motion blur */

/**
 * Directional motion blur by drawing a few progressively offset, faded copies
 * of the previous frame. At 3-5 taps it reads as camera blur and costs a handful
 * of composited drawImage calls rather than a per-pixel convolution.
 */
export function motionBlur(ctx, prevCanvas, w, h, { dx = 0, dy = 0, taps = 4, alpha = 0.5 } = {}) {
  if (!prevCanvas) return;
  ctx.save();
  for (let i = 1; i <= taps; i++) {
    const k = i / taps;
    ctx.globalAlpha = (alpha * (1 - k)) / taps;
    ctx.drawImage(prevCanvas, -dx * k, -dy * k, w, h);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------- PS1 look */

/**
 * 15-bit ordered-dither quantisation (Bayer 4x4), the low-poly template's
 * signature. Deliberately applied as a post step on a small buffer, because
 * 360x640 is 1/9th the work of 1080x1920 and the upscale hides the rest.
 */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function ditherQuantise(imageData, { levels = LV } = {}) {
  const d = imageData.data;
  const w = imageData.width;
  const inv = 1 / levels;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const x = p % w;
    const y = (p / w) | 0;
    const th = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) * 0.0625 - 0.5;
    d[i] = (Math.floor((d[i] * 0.00392157) * levels + th + 0.5) * inv * 255) | 0;
    d[i + 1] = (Math.floor((d[i + 1] * 0.00392157) * levels + th + 0.5) * inv * 255) | 0;
    d[i + 2] = (Math.floor((d[i + 2] * 0.00392157) * levels + th + 0.5) * inv * 255) | 0;
  }
  return imageData;
}

/**
 * Render-small-then-upscale. The single biggest performance lever available:
 * a 1080x1920 frame at 1/9th the pixels, upscaled with nearest-neighbour.
 * `nearest` is what produces the chunky PS1 pixels; smooth upscaling would
 * throw the entire look away.
 */
export function pixelUpscale(createCanvas, smallCanvas, w, h, { nearest = true } = {}) {
  const out = createCanvas(w, h);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = !nearest;
  g.drawImage(smallCanvas, 0, 0, w, h);
  return out;
}

/* --------------------------------------------------------------- cloth */

/**
 * Verlet cloth: a grid of particles, distance constraints solved with a few
 * Gauss-Seidel sweeps, one pin row so it can hang or be carried.
 *
 * This is the cheapest credible cloth on 2 cores: a 12x9 grid is 108 particles
 * and ~380 constraints, solved 3 times per frame, which is microseconds. Wind,
 * gravity and a turbulence term are the only forces.
 *
 * Returns { points, cols, rows, step(), draw() }.
 */
export function createCloth({
  originX, originY, width, height, cols = 12, rows = 9,
  pin = 'top', gravity = 0.9, damping = 0.985, iterations = 3,
  wind = 0.0, flutter = 0.0, seed = 5,
} = {}) {
  const r = rng(seed);
  const dx = width / (cols - 1);
  const dy = height / (rows - 1);
  const pts = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      pts.push({
        x: originX + x * dx,
        y: originY + y * dy,
        ox: originX + x * dx,
        oy: originY + y * dy,
        pinned: (pin === 'top' && y === 0) || (pin === 'left' && x === 0) || (pin === 'both' && y === 0 && (x % 2 === 0)),
        phase: r() * Math.PI * 2,
      });
    }
  }
  const idx = (x, y) => y * cols + x;
  // structural constraints (horizontal + vertical) and one shear per quad
  const links = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) links.push([idx(x, y), idx(x + 1, y), dx]);
      if (y < rows - 1) links.push([idx(x, y), idx(x, y + 1), dy]);
      if (x < cols - 1 && y < rows - 1) {
        links.push([idx(x, y), idx(x + 1, y + 1), Math.hypot(dx, dy)]);
        links.push([idx(x + 1, y), idx(x, y + 1), Math.hypot(dx, dy)]);
      }
    }
  }

  function step(t, dt = 1) {
    for (const p of pts) {
      if (p.pinned) continue;
      const vx = (p.x - p.ox) * damping;
      const vy = (p.y - p.oy) * damping;
      p.ox = p.x;
      p.oy = p.y;
      const gust = Math.sin(t * 1.7 + p.phase) * flutter;
      p.x += vx + (wind + gust) * dt;
      p.y += vy + gravity * dt;
    }
    for (let it = 0; it < iterations; it++) {
      for (const [a, b, rest] of links) {
        const pa = pts[a], pb = pts[b];
        let ex = pb.x - pa.x, ey = pb.y - pa.y;
        const d = Math.hypot(ex, ey) || 1;
        const diff = (d - rest) / d * 0.5;
        ex *= diff; ey *= diff;
        if (!pa.pinned) { pa.x += ex; pa.y += ey; }
        if (!pb.pinned) { pb.x -= ex; pb.y -= ey; }
      }
    }
  }

  /** Fill the cloth as a shaded mesh: quads with a normal-ish lighting term. */
  function draw(ctx, { colour = '#3f7fd4', shade = 0.20, ink = null } = {}) {
    const rgb = colour.replace('#', '');
    const base = [parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)];
    let fill = '', prevFill = '';
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const a = pts[idx(x, y)], b = pts[idx(x + 1, y)];
        const c = pts[idx(x + 1, y + 1)], d = pts[idx(x, y + 1)];
        // face normal from the quad's cross product, projected onto 2D
        const ux = b.x - a.x, uy = b.y - a.y;
        const vx = d.x - a.x, vy = d.y - a.y;
        const nz = ux * vy - uy * vx;
        const lit = 0.74 + Math.max(-1, Math.min(1, nz / 700)) * shade * 2.4;
        const k = Math.max(0.38, Math.min(1.22, lit));
        const base0 = base[0] * k, base1 = base[1] * k, base2 = base[2] * k;
        fill = 'rgb(' + (base0 > 255 ? 255 : base0 | 0) + ',' + (base1 > 255 ? 255 : base1 | 0) + ',' + (base2 > 255 ? 255 : base2 | 0) + ')';
        if (fill !== prevFill) { ctx.fillStyle = fill; prevFill = fill; }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (ink) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let y = 0; y < rows - 1; y++) {
        for (let x = 0; x < cols - 1; x++) {
          const a = pts[idx(x, y)], b = pts[idx(x + 1, y)];
          const c = pts[idx(x + 1, y + 1)], d = pts[idx(x, y + 1)];
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
        }
      }
      ctx.stroke();
    }
  }

  return { points: pts, step, draw, cols, rows, links };
}

/* ------------------------------------------------------- environmental audio */

/**
 * Synthesise a short ambience bed as raw float samples. We cannot listen to it,
 * so the design goals are measurable instead: no DC offset, energy inside a
 * target band, no clipping, and a slow amplitude modulation that reads as wind.
 */
export function synthAmbience({ seconds = 4, rate = 22050, seed = 4, kind = 'wind', level = 0.18 } = {}) {
  const n = Math.floor(seconds * rate);
  const out = new Float32Array(n);
  const r = rng(seed);
  let lp = 0, lp2 = 0;
  const amp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const white = r() * 2 - 1;
    if (kind === 'wind') {
      // two cascaded one-pole low-passes -> brown-ish noise, then a gust envelope
      lp += (white - lp) * 0.02;
      lp2 += (lp - lp2) * 0.06;
      const gust = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.1);
      out[i] = lp2 * 6.5 * gust;
    } else if (kind === 'rain') {
      lp += (white - lp) * 0.35;
      const drop = r() < 0.0009 ? (r() * 2 - 1) * 1.6 : 0;
      out[i] = (lp * 0.35 + drop);
    } else {
      // room tone
      lp += (white - lp) * 0.004;
      out[i] = lp * 3.2;
    }
    amp[i] = out[i];
  }
  // normalise to the requested peak
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(amp[i]));
  const g = peak > 0 ? level / peak : 1;
  for (let i = 0; i < n; i++) out[i] = amp[i] * g;
  return { samples: out, rate, seconds, kind, peak: level };
}

/** Encode float samples as a 16-bit mono WAV buffer. */
export function wavFromSamples(samples, rate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * Simple image-space shader looks, applied to a finished frame. Each is a few
 * lines but changes the read of the shot completely.
 */
export function applyLook(ctx, w, h, look = 'none') {
  if (look === 'none') return;
  ctx.save();
  if (look === 'teal-orange') {
    // split-tone: cool shadows, warm highlights, the standard cinematic grade
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,238,214,1)');
    g.addColorStop(1, 'rgba(206,224,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    const s = ctx.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, 'rgba(40,26,8,0)');
    s.addColorStop(1, 'rgba(10,26,48,0.20)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, w, h);
  } else if (look === 'moonlit') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(38,54,104,0.30)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(w * 0.62, -h * 0.05, 0, w * 0.62, -h * 0.05, h * 0.85);
    g.addColorStop(0, 'rgba(120,150,215,0.30)');
    g.addColorStop(1, 'rgba(120,150,215,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
