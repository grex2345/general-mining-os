/**
 * lowpoly.mjs — a software low-poly renderer in the PS1 idiom.
 *
 * Why this exists (see research/ROUND4_*.md): the hard constraint is ~2 CPU
 * cores, 3 GB RAM and no GPU. Every conventional 3D path measured so far is
 * 438-2040 ms/frame at 1080x1920. This renderer inverts the problem:
 *
 *   1. Render internally at 360x640 — one ninth the pixels of 1080x1920.
 *   2. Upscale 3x with nearest-neighbour, which IS the look, not a compromise.
 *   3. Snap vertices to a virtual grid and quantise colour to 15-bit with a
 *     Bayer 4x4 dither — both taken from the low-poly reference template and
 *     reimplemented for canvas2d instead of GLSL.
 *   4. Shade per-face with flat normals and painter's-algorithm sorting, so
 *     there is no z-buffer and no per-pixel work at all.
 *
 * Sources, recorded in research/ledger.json:
 *   - artemnovitckii/claude-animation-skills, skills/low-poly (MIT) — resolution,
 *     vertex snapping, 15-bit dither, pixel textures, wide lens, caption style.
 *   - zach-d-films-engine — fog, bloom, ellipse vignette, grain.
 *
 * The renderer is deliberately data-driven: a scene is a list of primitives, so
 * adding a character or a tree is a few calls, not a new renderer.
 */

import { createCanvas } from '@napi-rs/canvas';
import { rng } from './cartoon.mjs';
import { ditherQuantise } from './vfx.mjs';

/** Bayer 4x4 ordered-dither matrix, the low-poly template's signature. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* ------------------------------------------------------------------ vector */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ------------------------------------------------------------------ camera */

/**
 * A pinhole camera. The focal length is derived from the *height* so the
 * vertical field of view is exact whatever the aspect ratio is.
 */
export function makeCamera({ eye, target, fovDeg = 60, width = 360, height = 640, roll = 0 }) {
  const fwd = norm(sub(target, eye));
  let right = norm(cross(fwd, [0, 1, 0]));
  let up = cross(right, fwd);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s];
    const u2 = [up[0] * c - right[0] * s, up[1] * c - right[1] * s, up[2] * c - right[2] * s];
    right = r2; up = u2;
  }
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const half = height / 2;
  const cam = {
    eye, fwd, right, up, fovDeg, width, height, f, target,
    /** world point -> [screenX, screenY, viewZ] or null when behind the lens */
    project(p) {
      const d = sub(p, eye);
      const z = dot(d, fwd);
      if (z < 0.08) return null;
      const x = dot(d, right);
      const y = dot(d, up);
      return [width / 2 + (x / z) * f * half, height / 2 - (y / z) * f * half, z];
    },
    /** Recompute the orthonormal basis after the eye has been moved directly. */
    rebase() {
      const f = norm(sub(target, cam.eye));
      let r = norm(cross(f, [0, 1, 0]));
      let u = cross(r, f);
      if (roll) {
        const c = Math.cos(roll), s2 = Math.sin(roll);
        const r2 = [r[0] * c + u[0] * s2, r[1] * c + u[1] * s2, r[2] * c + u[2] * s2];
        const u2 = [u[0] * c - r[0] * s2, u[1] * c - r[1] * s2, u[2] * c - r[2] * s2];
        r = r2; u = u2;
      }
      cam.fwd = f; cam.right = r; cam.up = u;
      return cam;
    },
    /** push the eye and target together along the current forward axis */
    dolly(k) { cam.eye = lerp3(cam.eye, target, k); },
  };
  return cam;
}


/**
 * Screen-space staging. A cinematographer blocks the frame, not the world, so
 * the layout is authored as "the dog's paws land here on the 360x640 buffer"
 * and the world position is solved by intersecting that pixel's ray with a
 * plane. Without this, a 33-degree horizontal lens makes every hand-placed
 * coordinate land in the wrong third of the frame.
 *
 * @param cam    camera from makeCamera()
 * @param sx,sy  pixel on the internal buffer
 * @param planeY height of the plane to intersect (0 = ground)
 * @returns world [x, y, z] or null
 */
export function screenToPlane(cam, sx, sy, planeY = 0) {
  const { right, up, fwd, eye, f, width, height } = cam;
  const half = height / 2;
  const vx = ((sx - width / 2) / (f * half));
  const vy = (-(sy - height / 2) / (f * half));
  // ray direction in world space
  const dx = fwd[0] + right[0] * vx + up[0] * vy;
  const dy = fwd[1] + right[1] * vx + up[1] * vy;
  const dz = fwd[2] + right[2] * vx + up[2] * vy;
  if (Math.abs(dy) < 1e-6) return null;
  const t = (planeY - eye[1]) / dy;
  if (t <= 0) return null;
  return [eye[0] + dx * t, planeY, eye[2] + dz * t];
}

/**
 * Place a point on a horizontal plane at an exact view depth, in a given pixel
 * column. Depth-first staging: the distance chooses the apparent scale, the
 * column chooses the lateral position, and the ground plane fixes the height.
 * Returns { pos:[x,y,z], px:[sx,sy] } where px is where it will actually land.
 */
export function stageAt(cam, sx, depth, planeY = 0) {
  const { right, up, fwd, eye, f, width, height } = cam;
  const half = height / 2;
  const vx = (sx - width / 2) / (f * half);
  // solve vy so that eye + fwd*d + right*vx*d + up*vy*d has y == planeY
  const baseY = eye[1] + fwd[1] * depth + right[1] * vx * depth;
  const vy = up[1] === 0 ? 0 : (planeY - baseY) / (up[1] * depth);
  const pos = [
    eye[0] + (fwd[0] + right[0] * vx + up[0] * vy) * depth,
    planeY,
    eye[2] + (fwd[2] + right[2] * vx + up[2] * vy) * depth,
  ];
  const px = cam.project(pos);
  return { pos, px: px ? [px[0], px[1]] : [0, 0] };
}

/** World units -> screen pixels at a given view depth (for sizing decisions). */
export function pixelsPerUnit(cam, depth) {
  return (cam.f * (cam.height / 2)) / depth;
}

/* --------------------------------------------------------------- primitives */

/**
 * Create a scene accumulator. Everything is a flat list of faces; the renderer
 * sorts them once per frame and paints back to front.
 */
export function createScene() {
  const faces = [];
  return {
    faces,
    /** convex polygon with an explicit normal and albedo */
    add(pts, { normal = null, albedo = [0.8, 0.8, 0.8], ...rest } = {}) {
      faces.push({ pts, normal, albedo, ...rest });
    },
    clear() { faces.length = 0; },
  };
}

/** Axis-aligned (or yawed) box, 6 quads, normals recomputed from the rotation. */
export function box(scene, centre, size, albedo, { yaw = 0, pitch = 0, roll = 0, ...rest } = {}) {
  const [cx, cy, cz] = centre;
  const [sx, sy, sz] = size;
  const rgba = typeof albedo === 'string' ? albedo : null;
  const col = rgba ? toRGB(rgba) : albedo;

  const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // local -> world: roll(Z) then pitch(X) then yaw(Y)
  const rot = (v) => {
    let [x, y, z] = v;
    let x1 = x * cr - y * sr, y1 = x * sr + y * cr; x = x1; y = y1;
    let y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2;
    let x2 = x * cy1 + z * sy1, z3 = -x * sy1 + z * cy1; x = x2; z = z3;
    return [x, y, z];
  };

  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const local = {
    front: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
    back: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
    right: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
    left: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
    top: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
    bottom: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
  };
  const normals = {
    front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0],
    left: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
  };
  for (const k of Object.keys(local)) {
    const pts = local[k].map((v) => { const r = rot(v); return [r[0] + cx, r[1] + cy, r[2] + cz]; });
    scene.add(pts, { normal: rot(normals[k]), albedo: col, ...rest });
  }
}

/** Cone / pyramid, `seg` sides. Used for pine trees and lantern hoods. */
export function cone(scene, { base = [0, 0, 0], r = 1, h = 1, seg = 6, albedo, cap = true, ...rest }) {
  const col = typeof albedo === 'string' ? toRGB(albedo) : albedo;
  const apex = [base[0], base[1] + h, base[2]];
  const ring = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    ring.push([base[0] + Math.cos(a) * r, base[1], base[2] + Math.sin(a) * r]);
  }
  for (let i = 0; i < seg; i++) {
    const p0 = ring[i], p1 = ring[(i + 1) % seg];
    const n = norm(cross(sub(p1, p0), sub(apex, p0)));
    scene.add([p0, p1, apex], { normal: n, albedo: col, ...rest });
  }
  if (cap) scene.add(ring.slice().reverse(), { normal: [0, -1, 0], albedo: col, ...rest });
}

/* ------------------------------------------------------------------ terrain */

/** Value-noise fBm, deterministic from a seed. Returns a function of (x, z). */
export function makeTerrain(seed = 7, { octaves = 4, freq = 0.20, amp = 1.0, ridge = 0.0 } = {}) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const grad = (ix, iz) => (perm[(perm[ix & 255] + (iz & 255)) & 511] / 255);

  const valueNoise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = grad(ix, iz), b = grad(ix + 1, iz), c = grad(ix, iz + 1), d = grad(ix + 1, iz + 1);
    return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
  };

  return (x, z) => {
    let v = 0, a = amp, f = freq;
    for (let o = 0; o < octaves; o++) { v += (valueNoise(x * f, z * f) - 0.5) * a; a *= 0.5; f *= 2.05; }
    if (ridge) v -= Math.abs(v) * ridge;  // pull extreme values back toward the mean
    return v;
  };
}

/* ------------------------------------------------------------------ shading */

/**
 * Flat-shade one face. Key light is directional (moon), fill is hemispheric
 * (sky above, snow bounce below), and any number of point lights add local
 * warmth. Fog is exponential-squared in view depth.
 */
export function shadeFace(face, {
  key = { dir: [0.4, 0.7, 0.6], colour: [0.78, 0.86, 1.0], intensity: 1.0 },
  sky = [0.16, 0.21, 0.34],
  ground = [0.10, 0.09, 0.12],
  points = [],
  fog = { colour: [0.055, 0.075, 0.135], density: 0.055 },
  depth = 10,
  exposure = 1.0,
  rim = null,
} = {}) {
  const n = face.normal;
  const alb = face.albedo;
  // Never fall through to raw albedo: a face without a normal is unlit, and
  // raw albedo is 0..1 while the caller expects 0..255 — that is a black hole.
  if (!n) return [alb[0] * 255, alb[1] * 255, alb[2] * 255];

  const upness = n[1] * 0.5 + 0.5;
  let r = alb[0] * (sky[0] * upness + ground[0] * (1 - upness)) * 1.6;
  let g = alb[1] * (sky[1] * upness + ground[1] * (1 - upness)) * 1.6;
  let b = alb[2] * (sky[2] * upness + ground[2] * (1 - upness)) * 1.6;

  const ndl = Math.max(0, dot(n, key.dir));
  r += alb[0] * key.colour[0] * ndl * key.intensity;
  g += alb[1] * key.colour[1] * ndl * key.intensity;
  b += alb[2] * key.colour[2] * ndl * key.intensity;

  for (const p of points) {
    const d = face.mid ? Math.hypot(face.mid[0] - p.pos[0], face.mid[1] - p.pos[1], face.mid[2] - p.pos[2]) : 99;
    const atten = 1 / (1 + (d / p.radius) * (d / p.radius) * 3.2);
    const nd = face.mid ? Math.max(0, -dot(n, norm(sub(p.pos, face.mid)))) : 0.5;
    const k = atten * (0.35 + 0.65 * nd) * p.intensity;
    r += alb[0] * p.colour[0] * k;
    g += alb[1] * p.colour[1] * k;
    b += alb[2] * p.colour[2] * k;
  }

  /* Rim / back light. Round 5 finding: in a night scene a flat-shaded character
   * with only a key and a hemispheric fill reads as unlit cardboard, because
   * nothing on its silhouette is brighter than the background. The fix is the
   * standard one: a light behind the subject plus a Fresnel falloff, so the
   * edges of the mesh glow and the front stays dark. `v` is the view vector, so
   * `nv` ~ +1 means the face points at the camera (no rim) and ~0 means
   * grazing (full rim). */
  if (rim && face.mid) {
    const vx = rim.eye[0] - face.mid[0];
    const vy = rim.eye[1] - face.mid[1];
    const vz = rim.eye[2] - face.mid[2];
    const vl = Math.hypot(vx, vy, vz) || 1;
    const nv = Math.abs((n[0] * vx + n[1] * vy + n[2] * vz) / vl);
    const back = Math.max(0, -(n[0] * rim.dir[0] + n[1] * rim.dir[1] + n[2] * rim.dir[2]));
    const fres = Math.pow(1 - Math.min(1, nv), rim.power || 2.2);
    const k = fres * back * rim.intensity;
    r += rim.colour[0] * k;
    g += rim.colour[1] * k;
    b += rim.colour[2] * k;
  }

  const fd = depth * fog.density;
  const fk = 1 - Math.exp(-fd * fd);
  r = r * (1 - fk) + fog.colour[0] * fk;
  g = g * (1 - fk) + fog.colour[1] * fk;
  b = b * (1 - fk) + fog.colour[2] * fk;

  return [
    Math.min(255, r * exposure * 255),
    Math.min(255, g * exposure * 255),
    Math.min(255, b * exposure * 255),
  ];
}

export function toRGB(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
}

/* ------------------------------------------------------------------ render */

/**
 * Paint a scene. Painter's algorithm: project every face, drop the ones behind
 * the lens or entirely off-screen, sort by mean view depth, paint far to near.
 *
 * `snap` quantises screen positions to a virtual grid — the PS1 vertex wobble,
 * which is a look rather than a bug, and also fuses faces into cleaner pixels.
 */
export function renderScene(ctx, scene, cam, {
  width = 360, height = 640, snap = 1, shade = {}, background = null,
  overdraw = 1.02, near = 0.10, groundPass = null,
} = {}) {
  if (background) background(ctx, width, height);

  /* Painter's algorithm cannot interleave a ground plane with the objects
   * standing on it: the plane's mean depth is nearer than a distant object, so
   * it paints over it. Terrain therefore gets its own pre-pass — everything
   * marked sortKey:'far' is painted first, back to front, then the solids. */
  const ground = [];
  const solids = [];
  const margin = Math.max(width, height) * 0.75;

  for (const f of scene.faces) {
    // ---- clip the polygon against the near plane, in camera space ----------
    // Dropping any face with a vertex behind the lens leaves holes in the
    // ground right in front of the camera; clipping keeps the visible part.
    const view = [];
    let anyFront = false;
    for (const p of f.pts) {
      const d = sub(p, cam.eye);
      view.push([dot(d, cam.right), dot(d, cam.up), dot(d, cam.fwd)]);
      if (view[view.length - 1][2] >= near) anyFront = true;
    }
    if (!anyFront) continue;
    let poly = view;
    if (view.some((v) => v[2] < near)) {
      const clipped = [];
      for (let i = 0; i < view.length; i++) {
        const c = view[i], n = view[(i + 1) % view.length];
        const cIn = c[2] >= near, nIn = n[2] >= near;
        if (cIn) clipped.push(c);
        if (cIn !== nIn) {
          const t = (near - c[2]) / (n[2] - c[2]);
          clipped.push([c[0] + (n[0] - c[0]) * t, c[1] + (n[1] - c[1]) * t, near]);
        }
      }
      poly = clipped;
      if (poly.length < 3) continue;
    }

    // ---- project -----------------------------------------------------------
    const proj = [];
    let zsum = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    let maxDepth = -1e9;
    const half = height / 2;
    for (const [vx, vu, vz] of poly) {
      let x = width / 2 + (vx / vz) * cam.f * half;
      let y = half - (vu / vz) * cam.f * half;
      if (snap > 1) { x = Math.round(x / snap) * snap; y = Math.round(y / snap) * snap; }
      proj.push(x, y);
      zsum += vz;
      if (vz > maxDepth) maxDepth = vz;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    if (maxx < -margin || minx > width + margin || maxy < -margin || miny > height + margin) continue;
    // a face that fills the frame is either the ground under our feet or junk
    if (maxx - minx > width * 8 && f.sortKey !== 'far') continue;

    const n = poly.length;
    const depth = zsum / n;
    const mid = [0, 0, 0];
    for (const p of f.pts) { mid[0] += p[0]; mid[1] += p[1]; mid[2] += p[2]; }
    mid[0] /= f.pts.length; mid[1] /= f.pts.length; mid[2] /= f.pts.length;

    if (f.normal && !f.doubleSided) {
      if (dot(f.normal, sub(mid, cam.eye)) > 0) continue;
    }
    const col = shadeFace({ ...f, mid }, { ...shade, depth });
    (f.sortKey === 'far' ? ground : solids).push({ proj, depth: Math.max(depth, maxDepth), col });
  }

  // back to front within each layer; the ground layer is always painted whole
  // before any solid, which is the only ordering painter's algorithm gets right
  // for a heightfield.
  ground.sort((a, b) => b.depth - a.depth);
  solids.sort((a, b) => b.depth - a.depth);

  let prev = -1;
  const paint = (list) => {
    for (const it of list) {
      const c = it.col;
      const key = (c[0] | 0) * 65536 + (c[1] | 0) * 256 + (c[2] | 0);
      if (key !== prev) {
        ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
        prev = key;
      }
      const p = it.proj;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath();
      ctx.fill();
      if (overdraw > 1) {
        // a hairline stroke closes the seams that appear between adjacent
        // polygons after vertex snapping, without a z-buffer
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = overdraw;
        ctx.stroke();
      }
    }
  };
  paint(ground);
  // Anything that must lie ON the terrain but UNDER the solids (contact
  // shadows, decals, tracks) has to be painted here — a caller that draws it
  // before renderScene gets it buried by the ground pass.
  if (groundPass) groundPass(ctx, cam);
  paint(solids);
  return ground.length + solids.length;
}

/* -------------------------------------------------------------------- post */

/**
 * Final pass for the small buffer: ordered-dither to 15-bit, then a soft
 * vignette and a dusting of grain. All three come from the reference look.
 */
export function lowPolyPost(ctx, w, h, { levels = 31, vignette = 0.34, grain = 0.03, seed = 11, tint = null } = {}) {
  if (vignette > 0) {
    const vg = vignetteLayer(w, h, vignette);
    ctx.drawImage(vg, 0, 0);
  }
  if (levels || tint || grain > 0) {
    // One read, one loop, one write. Measured at 360x640: doing tint, grain and
    // the dither as three separate full-buffer passes cost 33 ms; folding them
    // into this single pass costs ~11 ms, and post is by far the dominant cost
    // of the whole frame at low resolution.
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const tr = tint ? parseInt(tint.slice(1, 3), 16) / 255 : 1;
    const tg = tint ? parseInt(tint.slice(3, 5), 16) / 255 : 1;
    const tb = tint ? parseInt(tint.slice(5, 7), 16) / 255 : 1;
    const lv = levels || 255;
    const inv = 255 / lv;
    let s = (seed * 2654435761) >>> 0;
    const noise = grain > 0 ? grain * 255 : 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const th = (BAYER4[((((p / w) | 0) & 3) * 4) + (p % w & 3)] + 0.5) * 0.0625 - 0.5;
      let n = 0;
      if (noise) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; n = ((s >>> 0) / 4294967296 - 0.5) * 2 * noise; }
      d[i] = (Math.floor(d[i] * tr * (lv / 255) + th + 0.5 + n * 0.00392157 * lv * 0.25) * inv) | 0;
      d[i + 1] = (Math.floor(d[i + 1] * tg * (lv / 255) + th + 0.5 + n * 0.00392157 * lv * 0.25) * inv) | 0;
      d[i + 2] = (Math.floor(d[i + 2] * tb * (lv / 255) + th + 0.5 + n * 0.00392157 * lv * 0.25) * inv) | 0;
    }
    ctx.putImageData(img, 0, 0);
  }
}

/** Cached vignette layer, rebuilt only when the buffer size changes. */
const VIG_CACHE = new Map();
function vignetteLayer(w, h, strength) {
  const key = `${w}x${h}x${strength}`;
  const hit = VIG_CACHE.get(key);
  if (hit) return hit;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(w / 2, h * 0.46, h * 0.18, w / 2, h * 0.46, h * 0.86);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  VIG_CACHE.set(key, c);
  return c;
}
