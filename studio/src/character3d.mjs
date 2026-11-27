/**
 * character3d.mjs — Round 5: a rigged, shaded 3D cartoon character.
 *
 * The Round 4 renderer draws boxes. Boxes cannot be a character: no rounded
 * limbs, no face, no deformation. This module adds the three things that turn a
 * box into a person:
 *
 *   1. MESH PRIMITIVES — tubes (tapered ring stacks) for limbs, superellipsoids
 *      for skull and torso, all emitted as flat-shaded quads with real normals
 *      so they can be backface-culled and lit properly.
 *   2. A SKELETON — a joint hierarchy with forward kinematics, arbitrary local
 *      rotation per joint, and two-bone IK with a pole vector.
 *   3. A FACE — eye spheres with iris/pupil, brow bars, and a mouth that opens
 *      into a cavity, driven by continuous expression parameters plus visemes.
 *
 * Everything is emitted into the Round 4 scene format, so the same software
 * rasteriser, the same lighting rig and the same post pass render it. No new
 * renderer, no GPU.
 *
 * Rotation convention: every bone's local rotation is R = Ry(yaw) * Rx(pitch) *
 * Rz(roll), applied in its parent's frame. Documented because the order matters
 * and getting it wrong makes elbows bend sideways.
 */

import { createScene, toRGB } from './lowpoly.mjs';

/**
 * albedo bookkeeping. The rasteriser's shadeFace() expects a 0..1 RGB array;
 * passing a hex string silently shades against character codes and produces
 * psychedelic colours (found the hard way). Every mesh function routes its
 * colour through here, and the cache keeps string->array conversion off the
 * per-frame hot path.
 */
const RGB_CACHE = new Map();
export function col(c) {
  if (Array.isArray(c)) return c;
  let v = RGB_CACHE.get(c);
  if (!v) { v = toRGB(c); RGB_CACHE.set(c, v); }
  return v;
}

/* -------------------------------------------------------------------- math */

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  rotY: (a, t) => [a[0] * Math.cos(t) + a[2] * Math.sin(t), a[1], -a[0] * Math.sin(t) + a[2] * Math.cos(t)],
};

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

/** 3x3 rotation matrix as a row-major array, composed R = Ry * Rx * Rz. */
function rotMat(pitch, yaw, roll = 0) {
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // Rx
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mm = (A, B) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      }
    }
    return o;
  };
  return mm(mm(Ry, Rx), Rz);
}
const applyMat = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const mulMat = (A, B) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  }
  return o;
};

/* ----------------------------------------------------------------- skeleton */

/**
 * A bone: a local offset from its parent, a local rotation, and a world
 * transform computed in FK order. Bones can also carry a scalar `len` used when
 * a mesh should span from this joint to its first child.
 */
export function createSkeleton(spec) {
  const bones = new Map();
  const order = [];
  for (const [name, def] of Object.entries(spec)) {
    bones.set(name, {
      name,
      parent: def.parent || null,
      offset: def.offset || [0, 0, 0],
      rot: [0, 0, 0],
      len: def.len || 0,
      world: [0, 0, 0],
      mat: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
    order.push(name);
  }
  // children before... no: parents first. Sort by depth.
  const depth = (n) => { let d = 0, b = bones.get(n); while (b && b.parent) { d++; b = bones.get(b.parent); } return d; };
  order.sort((a, b) => depth(a) - depth(b));

  const sk = {
    bones,
    set(name, pitch = 0, yaw = 0, roll = 0) {
      const b = bones.get(name);
      if (!b) throw new Error(`no bone "${name}"`);
      b.rot = [pitch, yaw, roll];
    },
    /** Add to a bone's rotation (used by additive/procedural animation). */
    add(name, pitch = 0, yaw = 0, roll = 0) {
      const b = bones.get(name);
      b.rot[0] += pitch; b.rot[1] += yaw; b.rot[2] += roll;
    },
    zero() { for (const b of bones.values()) b.rot = [0, 0, 0]; },
    solve(rootPos = [0, 0, 0]) {
      for (const name of order) {
        const b = bones.get(name);
        const R = rotMat(b.rot[0], b.rot[1], b.rot[2]);
        if (!b.parent) {
          b.mat = R;
          b.world = v3.add(rootPos, applyMat(R, b.offset));
        } else {
          const p = bones.get(b.parent);
          b.mat = mulMat(p.mat, R);
          b.world = v3.add(p.world, applyMat(p.mat, b.offset));
        }
      }
      return sk;
    },
    pos(name) { return bones.get(name).world; },
    mat(name) { return bones.get(name).mat; },
    /** World-space direction of a bone's local +Y (limbs are built along +Y). */
    axis(name) { return applyMat(bones.get(name).mat, [0, 1, 0]); },
  };
  return sk;
}

/**
 * Two-bone IK in 3D. Returns the mid joint position. `pole` picks the bend
 * plane — without it the solution is ambiguous and elbows flip randomly.
 *
 * This is the analytic solution: the distance d from root to target fixes the
 * interior angle at the root by the law of cosines, which fixes where the mid
 * joint sits on a circle; the pole vector picks the point on that circle.
 */
export function twoBoneIK3(root, target, l1, l2, pole = [0, 0, 1]) {
  const toTarget = v3.sub(target, root);
  let d = v3.len(toTarget);
  const dir = d > 1e-6 ? v3.mul(toTarget, 1 / d) : [0, -1, 0];
  // clamp into the reachable annulus or the acos explodes
  const maxReach = l1 + l2 - 1e-4;
  const minReach = Math.abs(l1 - l2) + 1e-4;
  d = clamp(d, minReach, maxReach);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.acos(cosA);
  // build an orthonormal basis with `pole` projected off the root->target axis
  let p = v3.sub(pole, v3.mul(dir, v3.dot(pole, dir)));
  if (v3.len(p) < 1e-5) p = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  p = v3.norm(p);
  const bend = v3.add(v3.mul(dir, Math.cos(a)), v3.mul(p, Math.sin(a)));
  return {
    mid: v3.add(root, v3.mul(bend, l1)),
    end: v3.add(root, v3.mul(dir, d)),
    reachable: v3.len(toTarget) <= maxReach,
  };
}

/**
 * Orient a bone so its limb axis points along a world direction.
 *
 * `axisSign` says which local axis the limb extends along: +1 for +Y, -1 for
 * -Y. This module's rest skeleton puts arms and legs along -Y (they hang down),
 * and assuming +Y silently pointed every limb backwards — knees above the hips,
 * feet above the head. The sign is explicit so it cannot happen again.
 */
export function aimBone(sk, name, worldDir, roll = 0, axisSign = 1) {
  const b = sk.bones.get(name);
  const parent = b.parent ? sk.bones.get(b.parent) : null;
  const pMat = parent ? parent.mat : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // local direction = parent^-1 * worldDir  (parent basis is orthonormal, so
  // the inverse is the transpose)
  const m = pMat;
  const local = [
    m[0] * worldDir[0] + m[3] * worldDir[1] + m[6] * worldDir[2],
    m[1] * worldDir[0] + m[4] * worldDir[1] + m[7] * worldDir[2],
    m[2] * worldDir[0] + m[5] * worldDir[1] + m[8] * worldDir[2],
  ];
  const l = v3.len(local) || 1;
  const n = [local[0] / l, local[1] / l, local[2] / l];
  let pitch, yaw;
  if (axisSign > 0) {
    // R = Ry(yaw) * Rx(pitch) maps +Y to (sin p sin y, cos p, sin p cos y)
    pitch = Math.acos(clamp(n[1], -1, 1));
    yaw = Math.atan2(n[0], n[2]);
  } else {
    // the same R maps -Y to (-sin p sin y, -cos p, -sin p cos y)
    pitch = Math.acos(clamp(-n[1], -1, 1));
    yaw = Math.atan2(-n[0], -n[2]);
  }
  b.rot = [pitch, yaw, roll];
  return sk;
}

/* ------------------------------------------------------------------- meshes */

/**
 * Tapered tube along +Y from `a` to `b`, in the bone's local frame.
 * Rings are quads with per-face normals, so the tube is smooth-shaded-looking
 * but still flat-polygon rendered (which is the whole style).
 */
export function addTube(scene, sk, boneName, {
  a = [0, 0, 0], b = [0, 1, 0], r0 = 0.1, r1 = 0.08, seg = 8,
  albedo = '#c9a', caps = true, bulge = 0, twist = 0, extra = {},
} = {}) {
  const bm = sk.mat(boneName);
  const bo = sk.pos(boneName);
  const W = (p) => v3.add(bo, applyMat(bm, p));
  const A = W(a), B = W(b);
  const axis = v3.norm(v3.sub(B, A));
  // a stable frame around the axis
  let u = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  u = v3.norm(v3.cross(axis, u));
  const v = v3.cross(axis, u);

  const rings = [];
  const RINGS = 3;
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const r = (r0 + (r1 - r0) * t) * (1 + Math.sin(t * Math.PI) * bulge);
    const centre = v3.lerp(A, B, t);
    const ring = [];
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * Math.PI * 2 + twist * t;
      const off = v3.add(v3.mul(u, Math.cos(ang) * r), v3.mul(v, Math.sin(ang) * r));
      ring.push(v3.add(centre, off));
    }
    rings.push(ring);
  }
  for (let k = 0; k < RINGS; k++) {
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const p0 = rings[k][i], p1 = rings[k][j], p2 = rings[k + 1][j], p3 = rings[k + 1][i];
      const n = v3.norm(v3.cross(v3.sub(p1, p0), v3.sub(p3, p0)));
      scene.add([p0, p1, p2, p3], { normal: n, albedo: col(albedo), ...extra });
    }
  }
  if (caps) {
    scene.add(rings[0].slice().reverse(), { normal: v3.mul(axis, -1), albedo: col(albedo), ...extra });
    scene.add(rings[RINGS], { normal: axis, albedo: col(albedo), ...extra });
  }
}

/**
 * Ellipsoid, optionally squashed at the bottom into a jaw, with a per-vertex
 * deform hook. This is the skull, the torso and the hands.
 */
export function addEllipsoid(scene, sk, boneName, {
  centre = [0, 0, 0], radii = [0.2, 0.24, 0.2], seg = 12, rings = 9,
  albedo = '#c9a', deform = null, extra = {}, skip = null,
} = {}) {
  const bm = sk.mat(boneName);
  const bo = sk.pos(boneName);
  const W = (p) => v3.add(bo, applyMat(bm, p));

  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI;
    const row = [];
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      let p = [
        centre[0] + Math.sin(phi) * Math.cos(th) * radii[0],
        centre[1] + Math.cos(phi) * radii[1],
        centre[2] + Math.sin(phi) * Math.sin(th) * radii[2],
      ];
      if (deform) p = deform(p, phi, th);
      row.push(W(p));
    }
    grid.push(row);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const p0 = grid[j][i], p1 = grid[j][i2], p2 = grid[j + 1][i2], p3 = grid[j + 1][i];
      // degenerate triangles at the poles are skipped rather than drawn as slivers
      const A = col(albedo);
      if (skip) {
        const cx = (grid[j][i][0] + grid[j][i2][0] + grid[j + 1][i2][0] + grid[j + 1][i][0]) / 4;
        const cy = (grid[j][i][1] + grid[j][i2][1] + grid[j + 1][i2][1] + grid[j + 1][i][1]) / 4;
        const cz = (grid[j][i][2] + grid[j][i2][2] + grid[j + 1][i2][2] + grid[j + 1][i][2]) / 4;
        if (skip([cx, cy, cz])) continue;
      }
      if (j === 0) {
        const n = v3.norm(v3.cross(v3.sub(p1, p0), v3.sub(p2, p0)));
        scene.add([p0, p1, p2], { normal: n, albedo: A, ...extra });
        continue;
      }
      if (j === rings - 1) {
        const n = v3.norm(v3.cross(v3.sub(p1, p0), v3.sub(p3, p0)));
        scene.add([p0, p1, p3], { normal: n, albedo: A, ...extra });
        continue;
      }
      const n = v3.norm(v3.cross(v3.sub(p1, p0), v3.sub(p3, p0)));
      scene.add([p0, p1, p2, p3], { normal: n, albedo: A, ...extra });
    }
  }
}

/**
 * Hair as a shell whose polar extent varies with azimuth: high across the
 * forehead, sweeping down at the nape. Built explicitly rather than by skipping
 * faces out of a full sphere, because a skip predicate on a 15-degree ring grid
 * produces visible horizontal bands instead of a hairline.
 *
 * phiMaxAt(theta) returns the polar angle (radians from +Y) at which the hair
 * stops for that azimuth. theta = 0 is +Z (front), PI is -Z (back).
 */
export function addHairCap(scene, sk, boneName, {
  centre = [0, 0, 0], radii = [0.19, 0.21, 0.19], seg = 18, rings = 8,
  albedo = '#3b2b2b', frontPhi = 0.78, backPhi = 2.30, bulge = 0, extra = {},
} = {}) {
  const bm = sk.mat(boneName), bo = sk.pos(boneName);
  const W = (p) => v3.add(bo, applyMat(bm, p));
  // theta is measured from +Z (the face) so the short side of the cap is the
  // forehead. Using +X as the origin rotated the whole cap 90 degrees, which
  // looked like a side-part across the eye.
  const phiMaxAt = (th) => {
    const fromFront = th - Math.PI / 2;                 // 0 at +Z
    const f = 0.5 + 0.5 * Math.cos(fromFront);
    return backPhi + (frontPhi - backPhi) * f;
  };
  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const phi = (j / rings) * phiMaxAt(th);
      const k = 1 + bulge * Math.sin(phi);
      const p = [
        centre[0] + Math.sin(phi) * Math.cos(th) * radii[0] * k,
        centre[1] + Math.cos(phi) * radii[1] * k,
        centre[2] + Math.sin(phi) * Math.sin(th) * radii[2] * k,
      ];
      row.push(W(p));
    }
    grid.push(row);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const p0 = grid[j][i], p1 = grid[j][i + 1], p2 = grid[j + 1][i + 1], p3 = grid[j + 1][i];
      // at the crown (j = 0) the ring degenerates to a point: emit a triangle
      const pts = j === 0 ? [p0, p2, p3] : [p0, p1, p2, p3];
      if (pts.length < 3) continue;
      const n = v3.norm(v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[pts.length - 1], pts[0])));
      scene.add(pts, { normal: n, albedo: col(albedo), ...extra });
    }
  }
}

/** A flat quad billboard in bone space — eyes, brows, mouth interior. */
export function addQuad(scene, sk, boneName, corners, { albedo = '#000', doubleSided = true, extra = {} } = {}) {
  const bm = sk.mat(boneName);
  const bo = sk.pos(boneName);
  const pts = corners.map((p) => v3.add(bo, applyMat(bm, p)));
  const n = v3.norm(v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[3], pts[0])));
  scene.add(pts, { normal: n, albedo: col(albedo), doubleSided, ...extra });
}

/** A soft capsule (two hemispheres + a tube) — fingers, brows, tails. */
export function addCapsule(scene, sk, boneName, { a, b, r = 0.02, seg = 6, albedo, extra = {} }) {
  addTube(scene, sk, boneName, { a, b, r0: r, r1: r, seg, albedo, caps: false, extra });
  addEllipsoid(scene, sk, boneName, { centre: a, radii: [r, r, r], seg, rings: 4, albedo, extra });
  addEllipsoid(scene, sk, boneName, { centre: b, radii: [r, r, r], seg, rings: 4, albedo, extra });
}

/* -------------------------------------------------------------- expressions */

/**
 * Continuous expression parameters. Discrete named faces (happy, angry, ...)
 * are just points in this space, which means expressions can be blended and
 * animated — a hard-coded face cannot.
 *
 *   browRaise  -1..1   brows down (angry) .. up (surprised)
 *   browAngle  -1..1   inner brows down (angry) .. inner brows up (sad)
 *   lidOpen    -1..1   squint .. wide
 *   mouthOpen   0..1   jaw drop
 *   mouthWide  -1..1   narrow O .. wide grin
 *   mouthCurve -1..1   frown .. smile
 *   jawSlide   -1..1   side to side (sneer / chewing)
 */
export const EXPRESSION_PRESETS = {
  neutral:  { browRaise: 0.05, browAngle: 0, lidOpen: 0.05, mouthOpen: 0.02, mouthWide: 0, mouthCurve: 0.05, jawSlide: 0 },
  happy:    { browRaise: 0.35, browAngle: 0.35, lidOpen: -0.15, mouthOpen: 0.15, mouthWide: 0.60, mouthCurve: 1.0, jawSlide: 0 },
  laughing: { browRaise: 0.55, browAngle: 0.45, lidOpen: -0.85, mouthOpen: 0.75, mouthWide: 0.55, mouthCurve: 0.9, jawSlide: 0 },
  surprised:{ browRaise: 1.0, browAngle: 0.2, lidOpen: 1.0, mouthOpen: 0.55, mouthWide: -0.25, mouthCurve: 0, jawSlide: 0 },
  angry:    { browRaise: -0.75, browAngle: -1.0, lidOpen: -0.25, mouthOpen: 0.20, mouthWide: -0.15, mouthCurve: -0.85, jawSlide: 0 },
  sad:      { browRaise: 0.25, browAngle: 0.85, lidOpen: -0.35, mouthOpen: 0.10, mouthWide: -0.10, mouthCurve: -0.75, jawSlide: 0 },
  confused: { browRaise: 0.45, browAngle: 0.1, lidOpen: 0.2, mouthOpen: 0.12, mouthWide: -0.20, mouthCurve: -0.15, jawSlide: 0.7 },
  thinking: { browRaise: 0.15, browAngle: -0.35, lidOpen: -0.2, mouthOpen: 0.05, mouthWide: -0.30, mouthCurve: 0.1, jawSlide: 0.9 },
  determined:{ browRaise: -0.5, browAngle: -0.8, lidOpen: -0.35, mouthOpen: 0.08, mouthWide: 0.15, mouthCurve: -0.1, jawSlide: 0 },
  scared:   { browRaise: 0.9, browAngle: 0.9, lidOpen: 1.0, mouthOpen: 0.45, mouthWide: -0.35, mouthCurve: -0.5, jawSlide: 0 },
};

/** Linear blend of any number of expression parameter sets. */
export function blendExpr(...pairs) {
  const out = { browRaise: 0, browAngle: 0, lidOpen: 0, mouthOpen: 0, mouthWide: 0, mouthCurve: 0, jawSlide: 0 };
  let total = 0;
  for (const [expr, w] of pairs) {
    for (const k of Object.keys(out)) out[k] += (expr[k] ?? 0) * w;
    total += w;
  }
  if (total) for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

/**
 * Visemes: mouth shapes keyed by the IPA phonemes espeak-ng emits. Only the
 * parameters that differ from neutral are stored, so a viseme is a delta.
 * Keys are single IPA symbols; the lookup strips diacritics.
 */
export const VISEMES = {
  // open vowels
  a: { mouthOpen: 0.62, mouthWide: 0.30, mouthCurve: 0.05 },
  ɑ: { mouthOpen: 0.66, mouthWide: 0.25, mouthCurve: 0.05 },
  æ: { mouthOpen: 0.55, mouthWide: 0.45, mouthCurve: 0.10 },
  e: { mouthOpen: 0.34, mouthWide: 0.40, mouthCurve: 0.15 },
  ɛ: { mouthOpen: 0.38, mouthWide: 0.42, mouthCurve: 0.10 },
  i: { mouthOpen: 0.16, mouthWide: 0.55, mouthCurve: 0.20 },
  ɪ: { mouthOpen: 0.22, mouthWide: 0.50, mouthCurve: 0.15 },
  o: { mouthOpen: 0.50, mouthWide: -0.10, mouthCurve: 0.05 },
  ɔ: { mouthOpen: 0.55, mouthWide: -0.05, mouthCurve: 0.05 },
  u: { mouthOpen: 0.28, mouthWide: -0.45, mouthCurve: 0.05 },
  ʊ: { mouthOpen: 0.32, mouthWide: -0.35, mouthCurve: 0.05 },
  ʌ: { mouthOpen: 0.42, mouthWide: 0.15, mouthCurve: 0.0 },
  ə: { mouthOpen: 0.25, mouthWide: 0.10, mouthCurve: 0.05 },
  // closed / semi
  m: { mouthOpen: 0.0, mouthWide: -0.05, mouthCurve: 0.0 },
  b: { mouthOpen: 0.0, mouthWide: 0.0, mouthCurve: 0.0 },
  p: { mouthOpen: 0.0, mouthWide: 0.0, mouthCurve: 0.0 },
  f: { mouthOpen: 0.10, mouthWide: 0.10, mouthCurve: 0.0 },
  v: { mouthOpen: 0.10, mouthWide: 0.10, mouthCurve: 0.0 },
  w: { mouthOpen: 0.18, mouthWide: -0.55, mouthCurve: 0.0 },
  // tongue-tip consonants
  l: { mouthOpen: 0.28, mouthWide: 0.15, mouthCurve: 0.0 },
  n: { mouthOpen: 0.16, mouthWide: 0.10, mouthCurve: 0.0 },
  t: { mouthOpen: 0.18, mouthWide: 0.15, mouthCurve: 0.0 },
  d: { mouthOpen: 0.20, mouthWide: 0.15, mouthCurve: 0.0 },
  s: { mouthOpen: 0.12, mouthWide: 0.35, mouthCurve: 0.05 },
  z: { mouthOpen: 0.12, mouthWide: 0.32, mouthCurve: 0.05 },
  ɹ: { mouthOpen: 0.22, mouthWide: -0.15, mouthCurve: 0.0 },
  r: { mouthOpen: 0.22, mouthWide: -0.15, mouthCurve: 0.0 },
  j: { mouthOpen: 0.18, mouthWide: 0.40, mouthCurve: 0.10 },
  k: { mouthOpen: 0.22, mouthWide: 0.10, mouthCurve: 0.0 },
  g: { mouthOpen: 0.24, mouthWide: 0.10, mouthCurve: 0.0 },
  ŋ: { mouthOpen: 0.20, mouthWide: 0.05, mouthCurve: 0.0 },
  ð: { mouthOpen: 0.14, mouthWide: 0.15, mouthCurve: 0.0 },
  θ: { mouthOpen: 0.14, mouthWide: 0.20, mouthCurve: 0.0 },
  ʃ: { mouthOpen: 0.16, mouthWide: -0.20, mouthCurve: 0.0 },
  ʒ: { mouthOpen: 0.16, mouthWide: -0.20, mouthCurve: 0.0 },
  tʃ: { mouthOpen: 0.18, mouthWide: -0.10, mouthCurve: 0.0 },
  dʒ: { mouthOpen: 0.18, mouthWide: -0.10, mouthCurve: 0.0 },
  h: { mouthOpen: 0.24, mouthWide: 0.10, mouthCurve: 0.0 },
};

const DIACRITICS = /[\u0300-\u036f\u02b0-\u02ff\u1d00-\u1dbfˌˈː]/g;
const VISEME_REST = { mouthOpen: 0 };

/** Map an IPA phoneme string to a viseme, falling back to the nearest vowel. */
export function phonemeToViseme(ph) {
  if (!ph) return VISEME_REST;
  const clean = ph.normalize('NFD').replace(DIACRITICS, '').normalize('NFC');
  if (VISEMES[clean]) return VISEMES[clean];
  for (const ch of clean) if (VISEMES[ch]) return VISEMES[ch];
  return VISEME_REST;
}

/* ------------------------------------------------------------------- figure */

export const SKELETON_SPEC = {
  root:      { offset: [0, 0, 0] },
  hips:      { parent: 'root', offset: [0, 0.80, 0], len: 0.12 },
  spine:     { parent: 'hips', offset: [0, 0.10, 0], len: 0.18 },
  chest:     { parent: 'spine', offset: [0, 0.18, 0], len: 0.18 },
  neck:      { parent: 'chest', offset: [0, 0.17, 0], len: 0.08 },
  head:      { parent: 'neck', offset: [0, 0.06, 0], len: 0.36 },
  jaw:       { parent: 'head', offset: [0, -0.055, 0.035] },

  shoulderL: { parent: 'chest', offset: [0.115, 0.145, 0], len: 0.09 },
  upperArmL: { parent: 'shoulderL', offset: [0.085, 0, 0], len: 0.25 },
  foreArmL:  { parent: 'upperArmL', offset: [0, -0.25, 0], len: 0.23 },
  handL:     { parent: 'foreArmL', offset: [0, -0.23, 0], len: 0.10 },

  shoulderR: { parent: 'chest', offset: [-0.115, 0.145, 0], len: 0.09 },
  upperArmR: { parent: 'shoulderR', offset: [-0.085, 0, 0], len: 0.25 },
  foreArmR:  { parent: 'upperArmR', offset: [0, -0.25, 0], len: 0.23 },
  handR:     { parent: 'foreArmR', offset: [0, -0.23, 0], len: 0.10 },

  thighL:    { parent: 'hips', offset: [0.082, -0.06, 0], len: 0.36 },
  shinL:     { parent: 'thighL', offset: [0, -0.36, 0], len: 0.34 },
  footL:     { parent: 'shinL', offset: [0, -0.34, 0], len: 0.15 },
  toeL:      { parent: 'footL', offset: [0, -0.02, 0.14] },

  thighR:    { parent: 'hips', offset: [-0.082, -0.06, 0], len: 0.36 },
  shinR:     { parent: 'thighR', offset: [0, -0.36, 0], len: 0.34 },
  footR:     { parent: 'shinR', offset: [0, -0.34, 0], len: 0.15 },
  toeR:      { parent: 'footR', offset: [0, -0.02, 0.14] },
};

export const PALETTE = {
  skin: '#e8b48f',
  skinShade: '#c98f6e',
  hair: '#3b2b2b',
  shirt: '#4a6ea8',
  shirtDark: '#3a5788',
  trousers: '#3b4166',
  shoe: '#25242e',
  eyeWhite: '#f6f7fb',
  iris: '#4a7a6a',
  pupil: '#141420',
  brow: '#3a2a26',
  mouth: '#4a2430',
  teeth: '#f2f0ea',
};

/**
 * Build the figure. Returns an object with the skeleton, the draw function and
 * animatable state, so a scene can pose it, animate it and render it.
 */
export function createFigure(opts = {}) {
  const C = { ...PALETTE, ...(opts.palette || {}) };
  const sk = createSkeleton(SKELETON_SPEC);
  const state = {
    expr: { ...EXPRESSION_PRESETS.neutral },
    blink: 0,             // 0 open, 1 closed
    look: [0, 0],         // eye look direction (x, y)
    headTilt: 0,
  };

  /**
   * Head + face. Built in the head bone's frame, so it inherits head rotation
   * for free. The jaw bone drives a deform of the skull's lower vertices, which
   * is what makes an open mouth read as a jaw and not as a decal.
   */
  function drawHead(scene) {
    const jawOpen = state.expr.mouthOpen * 0.055;
    sk.set('jaw', jawOpen * 2.2, 0, 0);

    const HEAD_Y = 0.170, RX = 0.175, RY = 0.205, RZ = 0.178;

    /**
     * The z of the skull surface at a given (x, y). Every face feature is
     * placed relative to THIS rather than at a fixed depth: the first version
     * used fixed depths, and because the skull bulges in the middle the eyes
     * and mouth ended up buried inside the head. Features now sit a small
     * epsilon proud of whatever the surface actually is.
     */
    const skullZ = (x, y) => {
      const k = 1 - (x / RX) ** 2 - ((y - HEAD_Y) / RY) ** 2;
      return k <= 0 ? 0 : RZ * Math.sqrt(k);
    };

    /* --- skull --------------------------------------------------------- */
    addEllipsoid(scene, sk, 'head', {
      centre: [0, HEAD_Y, 0], radii: [RX, RY, RZ], seg: 16, rings: 12,
      albedo: C.skin,
      deform: (p) => {
        const t = clamp((HEAD_Y - p[1]) / 0.21, 0, 1);         // 0 top .. 1 chin
        const front = clamp(p[2] / RZ, 0, 1);
        const y = p[1] - jawOpen * t * (0.30 + 0.70 * front);
        const taper = 1 - 0.17 * Math.pow(t, 2.6);             // chin narrows
        const back = p[2] < 0 ? 1 - 0.14 * clamp(-p[2] / RZ, 0, 1) : 1;
        return [p[0] * taper * back, y, p[2] * back];
      },
    });

    /* --- ears ---------------------------------------------------------- */
    for (const s of [1, -1]) {
      addEllipsoid(scene, sk, 'head', {
        centre: [s * (RX - 0.004), 0.158, -0.012], radii: [0.022, 0.046, 0.032],
        seg: 7, rings: 5, albedo: C.skin,
      });
    }

    // hair: an explicit cap with a hairline that sweeps from forehead to nape,
    // plus a fringe that hangs slightly over the brow
    addHairCap(scene, sk, 'head', {
      centre: [0, HEAD_Y + 0.004, -0.006],
      radii: [RX * 1.10, RY * 1.07, RZ * 1.10],
      seg: 20, rings: 8, albedo: C.hair,
      frontPhi: 1.00, backPhi: 2.42, bulge: 0.03,
    });
    // a short fringe, only over the brow, 2 degrees proud of the cap
    addHairCap(scene, sk, 'head', {
      centre: [0, HEAD_Y + 0.020, 0.004],
      radii: [RX * 1.11, RY * 1.02, RZ * 1.11],
      seg: 18, rings: 3, albedo: C.hair,
      frontPhi: 1.06, backPhi: 1.26, bulge: 0.02,
    });

    /* --- eyes ---------------------------------------------------------- */
    const lid = clamp(state.expr.lidOpen, -1, 1);
    const openY = 1 - Math.max(0, state.blink) * 0.9;
    const eyeR = 0.034, EY = 0.196;
    const EZ = skullZ(0.070, EY) - eyeR * 0.42;      // front pole proud of the skull
    for (const s of [1, -1]) {
      const ex = s * 0.070;
      addEllipsoid(scene, sk, 'head', {
        centre: [ex, EY, EZ], radii: [eyeR * 1.05, eyeR * 0.92, eyeR * 0.94],
        seg: 10, rings: 8, albedo: C.eyeWhite,
      });
      const look = state.look;
      const ix = ex + look[0] * 0.010, iy = EY + look[1] * 0.008;
      const front = EZ + eyeR * 0.92;
      addEllipsoid(scene, sk, 'head', {
        centre: [ix, iy, front - 0.004], radii: [0.0195, 0.0195, 0.008],
        seg: 9, rings: 6, albedo: C.iris,
      });
      addEllipsoid(scene, sk, 'head', {
        centre: [ix, iy, front + 0.001], radii: [0.0092, 0.0092, 0.006],
        seg: 7, rings: 5, albedo: C.pupil,
      });
      // upper lid: a skin cap sliding down over the eyeball
      const cover = clamp(0.30 - lid * 0.22 + state.blink * 1.05, 0, 1);
      addEllipsoid(scene, sk, 'head', {
        centre: [ex, EY + eyeR * (0.34 + cover * 0.42), EZ + 0.002],
        radii: [eyeR * 1.04, eyeR * (0.30 + cover * 0.62), eyeR * 0.98],
        seg: 10, rings: 5, albedo: C.skin,
        skip: (p) => (p[1] - EY) < eyeR * (0.10 - cover * 0.35),
      });
      addEllipsoid(scene, sk, 'head', {
        centre: [ex, EY - eyeR * 0.66, EZ + 0.004],
        radii: [eyeR * 1.00, eyeR * 0.22, eyeR * 0.94],
        seg: 9, rings: 4, albedo: C.skin,
        skip: (p) => (p[1] - EY) > -eyeR * 0.56,
      });
    }

    /* --- brows: a ridge of three capsules each side -------------------- */
    const lift = state.expr.browRaise * 0.019;
    const ang = state.expr.browAngle * 0.020;
    for (const s of [1, -1]) {
      const cx = s * 0.072;
      const y0 = 0.232 + lift;
      for (let i = 0; i < 3; i++) {
        const t0 = i / 3, t1 = (i + 1) / 3;
        const px = (t) => cx + s * (-0.036 + t * 0.072);
        // angry (ang<0) pulls the INNER end down; sad (ang>0) lifts it
        const py = (t) => y0 - (1 - t) * ang * -1 - Math.sin(t * Math.PI) * 0.004;
        const bz0 = skullZ(px(t0), py(t0)) + 0.006;
        const bz1 = skullZ(px(t1), py(t1)) + 0.006;
        addCapsule(scene, sk, 'head', {
          a: [px(t0), py(t0), bz0], b: [px(t1), py(t1), bz1],
          r: 0.0072, seg: 5, albedo: C.brow,
        });
      }
    }

    /* --- nose --------------------------------------------------------- */
    addEllipsoid(scene, sk, 'head', {
      centre: [0.001, 0.150, skullZ(0, 0.150) + 0.002], radii: [0.018, 0.025, 0.021],
      seg: 8, rings: 6, albedo: C.skin,
    });

    /* --- mouth ---------------------------------------------------------
     * An opening whose SHAPE is a lens: the upper edge bulges up, the lower
     * edge bows down by the curve parameter, so a smile and a frown are the
     * same patch of skin with the lower lip flipped. Interior only when open.
     */
    const mo = clamp(state.expr.mouthOpen, 0, 1);
    const mw = state.expr.mouthWide;
    const mc = state.expr.mouthCurve;
    const jx = state.expr.jawSlide * 0.010;
    const mcy = 0.104 - mo * 0.016;
    const halfW = 0.032 + mw * 0.026;
    const openH = 0.004 + mo * 0.042;
    const Z = skullZ(0, mcy) + 0.003;

    if (openH > 0.008) {
      addQuad(scene, sk, 'head', [
        [-halfW + jx, mcy + openH * 0.50, Z],
        [halfW + jx, mcy + openH * 0.50, Z],
        [halfW * 0.86 + jx, mcy - openH * 0.50, Z],
        [-halfW * 0.86 + jx, mcy - openH * 0.50, Z],
      ], { albedo: C.mouth });
      if (mo > 0.28) {
        addQuad(scene, sk, 'head', [
          [-halfW * 0.74 + jx, mcy + openH * 0.47, Z + 0.002],
          [halfW * 0.74 + jx, mcy + openH * 0.47, Z + 0.002],
          [halfW * 0.74 + jx, mcy + openH * 0.22, Z + 0.002],
          [-halfW * 0.74 + jx, mcy + openH * 0.22, Z + 0.002],
        ], { albedo: C.teeth });
      }
    }
    /* --- lips as a ribbon ------------------------------------------------
     * A row of separate ellipsoids read as a zip fastener. A lip is a
     * CONTINUOUS band with thickness, so it is emitted as a quad strip: for
     * each u along the mouth, an upper and a lower edge point, sharing their
     * side edges with the neighbouring segment. Same triangle count as the
     * beads, but it reads as a line instead of a dotted line.
     */
    const lipRibbon = (yFn, thickness, inset) => {
      if (thickness <= 0.0002) return;
      const N = 14;
      const top = [], bot = [];
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1;
        const x = u * halfW;
        const y = yFn(u);
        const z = skullZ(x, y) + inset;
        top.push([x, y + thickness * (1 - Math.abs(u) * 0.55), z]);
        bot.push([x, y - thickness * (1 - Math.abs(u) * 0.55), z]);
      }
      for (let i = 0; i < N; i++) {
        const quad = [top[i], top[i + 1], bot[i + 1], bot[i]];
        const pts = quad.map((p) => v3.add(sk.pos('head'), applyMat(sk.mat('head'), p)));
        const n = v3.norm(v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[3], pts[0])));
        scene.add(pts, { normal: n, albedo: col(C.mouth), doubleSided: true });
      }
    };
    // corner lift is what carries the expression
    const cornerUp = (u) => mc * 0.026 * u * u;
    if (openH <= 0.010) {
      // a shut mouth is a LINE, not a band
      lipRibbon((u) => mcy + cornerUp(u), 0.0032, 0.004);
    } else {
      lipRibbon((u) => mcy + openH * 0.55 + cornerUp(u), 0.0055 + mo * 0.002, 0.004);
      lipRibbon((u) => mcy - openH * 0.55 + cornerUp(u), 0.0060 + mo * 0.003, 0.004);
    }
  }

  /** Torso, pelvis, neck — the silhouette that makes a body read. */
  function drawTorso(scene) {
    // pelvis
    addEllipsoid(scene, sk, 'hips', {
      centre: [0, 0.02, 0], radii: [0.152, 0.132, 0.118], seg: 12, rings: 8, albedo: C.trousers,
    });
    // abdomen
    addTube(scene, sk, 'spine', {
      a: [0, -0.02, 0], b: [0, 0.20, 0], r0: 0.135, r1: 0.158, seg: 12,
      albedo: C.shirt, caps: true,
    });
    // chest: a wider tube with a slight barrel
    addTube(scene, sk, 'chest', {
      a: [0, -0.01, 0], b: [0, 0.18, 0], r0: 0.160, r1: 0.152, seg: 12,
      albedo: C.shirt, caps: true, bulge: 0.06,
    });
    // shoulders
    for (const s of [1, -1]) {
      addEllipsoid(scene, sk, s > 0 ? 'shoulderL' : 'shoulderR', {
        centre: [s * 0.004, 0.010, 0], radii: [0.080, 0.084, 0.080], seg: 10, rings: 7, albedo: C.shirt,
      });
    }
    // neck
    addTube(scene, sk, 'neck', {
      a: [0, -0.02, 0], b: [0, 0.08, 0], r0: 0.048, r1: 0.044, seg: 9, albedo: C.skinShade, caps: false,
    });
    // collar
    addTube(scene, sk, 'neck', {
      a: [0, -0.02, 0], b: [0, 0.012, 0], r0: 0.062, r1: 0.056, seg: 10, albedo: C.shirtDark, caps: false,
    });
  }

  function drawArm(scene, side) {
    const s = side === 'L' ? 1 : -1;
    const upper = `upperArm${side}`, fore = `foreArm${side}`, hand = `hand${side}`;
    // sleeve
    addTube(scene, sk, upper, {
      a: [0, 0.075, 0], b: [0, -0.17, 0], r0: 0.058, r1: 0.050, seg: 10,
      albedo: C.shirt, caps: false,
    });
    // forearm: skin
    addTube(scene, sk, fore, {
      a: [0, 0.01, 0], b: [0, -0.21, 0], r0: 0.045, r1: 0.036, seg: 9,
      albedo: C.skin, caps: false,
    });
    // elbow
    addEllipsoid(scene, sk, fore, { centre: [0, 0.005, 0], radii: [0.047, 0.045, 0.047], seg: 8, rings: 5, albedo: C.skin });
    // hand: palm + a thumb + four fingers as one slab with grooves
    addEllipsoid(scene, sk, hand, {
      centre: [0, -0.026, 0.004], radii: [0.042, 0.054, 0.024], seg: 9, rings: 6, albedo: C.skin,
    });
    // wrist: closes the gap between the forearm tube and the palm
    addTube(scene, sk, hand, { a: [0, 0.010, 0], b: [0, -0.014, 0.002], r0: 0.030, r1: 0.034, seg: 8, albedo: C.skin, caps: false });
    for (let f = 0; f < 4; f++) {
      const fx = (-0.026 + f * 0.017);
      addCapsule(scene, sk, hand, {
        a: [fx, -0.066, 0.004], b: [fx * 1.02, -0.100 + Math.abs(f - 1.5) * 0.006, 0.020],
        r: 0.0095, seg: 5, albedo: C.skin,
      });
    }
    // thumb
    addCapsule(scene, sk, hand, {
      a: [s * -0.028, -0.030, 0.014], b: [s * -0.050, -0.062, 0.024],
      r: 0.0115, seg: 5, albedo: C.skin,
    });
  }

  function drawLeg(scene, side) {
    const thigh = `thigh${side}`, shin = `shin${side}`, foot = `foot${side}`;
    addTube(scene, sk, thigh, {
      a: [0, 0.02, 0], b: [0, -0.39, 0], r0: 0.082, r1: 0.060, seg: 10,
      albedo: C.trousers, caps: false,
    });
    addTube(scene, sk, shin, {
      a: [0, 0.0, 0], b: [0, -0.37, 0], r0: 0.058, r1: 0.040, seg: 10,
      albedo: C.trousers, caps: false,
    });
    addEllipsoid(scene, sk, shin, { centre: [0, 0, 0], radii: [0.060, 0.056, 0.060], seg: 8, rings: 5, albedo: C.trousers });
    // shoe: a box-ish wedge pointing +Z, with a sole
    const bm = sk.mat(foot), bo = sk.pos(foot);
    const W = (p) => v3.add(bo, applyMat(bm, p));
    const shoe = [
      W([-0.050, -0.035, -0.045]), W([0.050, -0.035, -0.045]),
      W([0.052, -0.035, 0.115]), W([-0.052, -0.035, 0.115]),
    ];
    const shoeTop = [
      W([-0.046, 0.020, -0.040]), W([0.046, 0.020, -0.040]),
      W([0.044, -0.012, 0.100]), W([-0.044, -0.012, 0.100]),
    ];
    const quad = (a, b, c, d, colour) => {
      const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(d, a)));
      scene.add([a, b, c, d], { normal: n, albedo: col(colour) });
    };
    quad(shoe[0], shoe[1], shoe[2], shoe[3], C.shoe);            // sole bottom
    quad(shoeTop[0], shoeTop[1], shoeTop[2], shoeTop[3], C.shoe); // top
    quad(shoe[0], shoe[1], shoeTop[1], shoeTop[0], C.shoe);       // back
    quad(shoe[3], shoe[2], shoeTop[2], shoeTop[3], C.shoe);       // front
    quad(shoe[0], shoe[3], shoeTop[3], shoeTop[0], C.shoe);       // left
    quad(shoe[1], shoe[2], shoeTop[2], shoeTop[1], C.shoe);       // right
  }

  return {
    skeleton: sk,
    state,
    palette: C,
    setExpression(preset, blend = 1) {
      const e = typeof preset === 'string' ? EXPRESSION_PRESETS[preset] : preset;
      if (!e) throw new Error(`no expression "${preset}"`);
      for (const k of Object.keys(state.expr)) {
        state.expr[k] = lerp(state.expr[k], e[k] ?? 0, blend);
      }
      return this;
    },
    /** Apply a viseme: only mouth parameters move, and only partially. */
    setViseme(v, strength = 1) {
      for (const k of ['mouthOpen', 'mouthWide', 'mouthCurve']) {
        const target = v[k] ?? (k === 'mouthCurve' ? 0.05 : 0);
        state.expr[k] = lerp(state.expr[k], target, strength);
      }
      return this;
    },
    /**
     * Draw everything into a scene. Call solve() first so the skeleton has
     * world transforms — that is the one ordering rule in this whole module.
     */
    draw(scene) {
      drawTorso(scene);
      drawHead(scene);
      drawArm(scene, 'L');
      drawArm(scene, 'R');
      drawLeg(scene, 'L');
      drawLeg(scene, 'R');
      return scene;
    },
  };
}

/** Convenience: an empty scene with a figure already drawn. */
export function figureScene(fig, t = 0) {
  fig.skeleton.solve([0, 0, 0]);
  const s = createScene();
  fig.draw(s, t);
  return s;
}
