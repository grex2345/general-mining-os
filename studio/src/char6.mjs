/**
 * char6.mjs — the Round 6 character: a smooth-skinned, skinned-mesh figure.
 *
 * WHAT CHANGED FROM ROUND 5 AND WHY
 *   Round 5 built a character out of ~2 550 individually shaded quads. Every
 *   quad was one flat colour, so no matter how many were added the surface read
 *   as facets: a low-poly STYLE, not a low-poly BUDGET. The face had a mouth
 *   ribbon, brow capsules and no eyelids; the hands had no fingers.
 *
 *   This file builds ONE continuous skinned mesh with per-vertex normals and
 *   real skin weights. Together with raster3d.mjs that gives:
 *     - smooth shading across joints (a bent elbow has no facet seam)
 *     - eyelids that close over a spherical eyeball
 *     - 30 finger bones with three joints each
 *     - a face built from inverting a measured skull, so the nose, lips and
 *       eye sockets are part of the surface rather than decals on it
 *
 * STYLE TARGET. The reference is the supplied `image-3.png` (the "Zach 3D
 * Films / cartoon-sketch" idiom): a large rounded head, simple but expressive
 * features, a small nose, big eyes with a highlight, soft cel-ish gradients and
 * thick hair. The proportions below are chosen to hit that silhouette: head
 * height ~1/3.4 of total height (7-head fashion proportions for an adult are
 * 1/7.5), shoulders about 1.25 head widths, and hands oversized relative to
 * anatomy because oversized hands and feet read as "cartoon" instantly.
 */

import {
  createSkeleton, twoBoneIK3, aimBone,
} from './character3d.mjs';
import { capsule, ellipsoid, makeField, surfaceNets, segDist } from './implicit.mjs';
import {
  sphere, tube, rbox, loft, mergeMeshes, createMesh, mat4, material, fixWinding,
  vadd, vsub, vmul, vnorm, vcross, vlen, vlerp,
} from './raster3d.mjs';

/* ------------------------------------------------------------------ skeleton */

/**
 * Proportions, in metres, for a 1.62 m cartoon adult. Every number here is a
 * deliberate stylisation, not an anatomical measurement.
 */
export const SKEL = {
  root:      { offset: [0, 0, 0] },
  hips:      { parent: 'root', offset: [0, 0.640, 0], len: 0.10 },
  spine:     { parent: 'hips', offset: [0, 0.075, 0], len: 0.14 },
  chest:     { parent: 'spine', offset: [0, 0.120, 0], len: 0.16 },
  neck:      { parent: 'chest', offset: [0, 0.140, 0], len: 0.055 },
  head:      { parent: 'neck', offset: [0, 0.030, 0], len: 0.30 },

  /* The head is authored about HEAD_CENTRE (see HEAD_OFFSET), not the bone, so
   * these offsets are relative to the skull centre and stay stable if the neck
   * length changes. */
  jaw:       { parent: 'head', offset: [0, 0.068, 0.030] },
  eyeL:      { parent: 'head', offset: [0.077, 0.134, 0.145] },
  eyeR:      { parent: 'head', offset: [-0.077, 0.134, 0.145] },
  lidUpperL: { parent: 'head', offset: [0.060, 0.132, 0.116] },
  lidUpperR: { parent: 'head', offset: [-0.060, 0.132, 0.116] },
  lidLowerL: { parent: 'head', offset: [0.060, 0.092, 0.116] },
  lidLowerR: { parent: 'head', offset: [-0.060, 0.092, 0.116] },
  browL:     { parent: 'head', offset: [0.064, 0.166, 0.110] },
  browR:     { parent: 'head', offset: [-0.064, 0.166, 0.110] },
  mouthL:    { parent: 'head', offset: [0.030, 0.030, 0.092] },
  mouthR:    { parent: 'head', offset: [-0.030, 0.030, 0.092] },

  /* Arms. The shoulder joint sits just below the top of the ribcage, and the
   * whole chain hangs vertically so the rest pose is a relaxed A-pose. */
  shoulderL: { parent: 'chest', offset: [0.062, 0.034, 0], len: 0.086 },
  upperArmL: { parent: 'shoulderL', offset: [0.086, 0, 0], len: 0.215 },
  foreArmL:  { parent: 'upperArmL', offset: [0, -0.215, 0], len: 0.195 },
  handL:     { parent: 'foreArmL', offset: [0, -0.195, 0], len: 0.074 },

  shoulderR: { parent: 'chest', offset: [-0.062, 0.034, 0], len: 0.086 },
  upperArmR: { parent: 'shoulderR', offset: [-0.086, 0, 0], len: 0.215 },
  foreArmR:  { parent: 'upperArmR', offset: [0, -0.215, 0], len: 0.195 },
  handR:     { parent: 'foreArmR', offset: [0, -0.195, 0], len: 0.074 },

  thighL:    { parent: 'hips', offset: [0.074, -0.030, 0], len: 0.255 },
  shinL:     { parent: 'thighL', offset: [0, -0.255, 0], len: 0.240 },
  footL:     { parent: 'shinL', offset: [0, -0.240, 0], len: 0.110 },
  toeL:      { parent: 'footL', offset: [0, -0.030, 0.105] },

  thighR:    { parent: 'hips', offset: [-0.074, -0.030, 0], len: 0.255 },
  shinR:     { parent: 'thighR', offset: [0, -0.255, 0], len: 0.240 },
  footR:     { parent: 'shinR', offset: [0, -0.240, 0], len: 0.110 },
  toeR:      { parent: 'footR', offset: [0, -0.030, 0.105] },
};

/** Offset from the head BONE to the centre of the skull. */
export const HEAD_OFFSET = [0, 0.158, 0.020];

/* fingers, generated so left and right stay symmetric */
const FINGERS = [
  { name: 'index',  x: -0.0190, y: 0, z: 0.004, lens: [0.027, 0.019, 0.0135], r: 0.0108, spread: -0.10 },
  { name: 'middle', x: -0.0063, y: 0, z: 0.005, lens: [0.030, 0.021, 0.0145], r: 0.0112, spread: -0.03 },
  { name: 'ring',   x: 0.0062,  y: 0, z: 0.004, lens: [0.027, 0.019, 0.0135], r: 0.0104, spread: 0.05 },
  { name: 'pinky',  x: 0.0185,  y: 0, z: 0.002, lens: [0.021, 0.015, 0.0115], r: 0.0092, spread: 0.13 },
];

for (const side of ['L', 'R']) {
  const sgn = side === 'L' ? 1 : -1;
  const hand = `hand${side}`;
  for (const f of FINGERS) {
    let parent = hand;
    let offset = [f.x * sgn, f.y, f.z];
    for (let j = 0; j < 3; j++) {
      const name = `${f.name}${j}${side}`;
      SKEL[name] = { parent, offset, len: f.lens[j] };
      parent = name;
      offset = [0, -f.lens[j], 0];
    }
  }
  // thumb: rooted at the side of the palm, angled across it
  SKEL[`thumb1${side}`] = { parent: hand, offset: [-0.020 * sgn, -0.030, 0.012], len: 0.028 };
  SKEL[`thumb2${side}`] = { parent: `thumb1${side}`, offset: [0.006 * sgn, -0.024, 0.010], len: 0.024 };
  SKEL[`thumb3${side}`] = { parent: `thumb2${side}`, offset: [0.005 * sgn, -0.019, 0.008], len: 0.019 };
}
export const FINGER_NAMES = FINGERS.map((f) => f.name);

/* ------------------------------------------------------------------- palette */

export const PAL = {
  skin: [0.93, 0.72, 0.60],
  skinBlush: [0.90, 0.60, 0.53],
  lip: [0.74, 0.44, 0.42],
  hair: [0.20, 0.13, 0.11],
  hairHi: [0.31, 0.21, 0.17],
  shirt: [0.19, 0.31, 0.58],
  shirtDark: [0.13, 0.22, 0.44],
  trouser: [0.24, 0.26, 0.38],
  shoe: [0.10, 0.10, 0.13],
  eyeWhite: [0.97, 0.97, 0.98],
  iris: [0.26, 0.45, 0.42],
  irisDark: [0.10, 0.20, 0.21],
  pupil: [0.03, 0.03, 0.04],
  brow: [0.22, 0.15, 0.13],
  mouthInner: [0.22, 0.08, 0.11],
  teeth: [0.95, 0.94, 0.90],
  tongue: [0.62, 0.28, 0.31],
};

/* --------------------------------------------------------------- head surface */

const HX = 0.143, HY = 0.176, HZ = 0.148;

/**
 * The skull as a radial function. `dir` is a unit direction; the result is the
 * point on the surface in that direction, in head-local space.
 *
 * Everything expressive lives here: the chin is a forward-deformed taper, the
 * jaw narrows below y=-0.02, the cheeks are pushed out around the mouth, the
 * brow ridge protrudes, and the eye sockets are dished in so the eyeballs sit
 * inside them instead of being pasted on top.
 */
export function skullPoint(dir) {
  const [x, y, z] = dir;
  let p = [x * HX, y * HY, z * HZ];

  // --- cranium: full and round above the temples
  const above = Math.max(0, y);
  p[0] *= 1 + 0.022 * above;
  p[2] *= 1 + 0.03 * above;

  // --- jaw taper: the head narrows toward the chin, and that narrowing is
  // asymmetric front/back because a jaw is not a cone
  const below = Math.max(0, -y);
  const taper = 1 - 0.11 * Math.pow(below, 2.4);
  p[0] *= taper;
  p[2] *= 1 - 0.11 * Math.pow(below, 2.0);

  /* --- chin: a ROUND chin, not the point of a cone.
   *
   * The jaw taper narrows the skull toward the bottom; without compensation the
   * two taper terms meet at a point and the head reads as an ice-cream cone.
   * This widens the very bottom back out into a soft chin. */
  const low = Math.max(0, (-y - 0.55) / 0.45);       // 0 above the mouth, 1 at the base
  const chinRound = Math.min(1, low) * Math.min(1, low);
  p[0] *= 1 + 0.52 * chinRound;
  p[2] *= 1 + 0.22 * chinRound;
  const chin = Math.exp(-Math.pow((y + 0.80) / 0.30, 2)) * Math.max(0, z);
  p[2] += chin * 0.010;

  // --- brow ridge: a horizontal shelf above the eyes
  const browY = Math.exp(-Math.pow((y - 0.30) / 0.16, 2));
  const front = Math.max(0, z);
  p[2] += browY * front * 0.011;

  /* NO eye-socket dish.
   *
   * The dish was there to seat a spherical eyeball. The eyes are composited in
   * 2D now, so all the dish did was carve two creases across the face that
   * caught the light as hard-edged dents. A cartoon face at this scale is
   * smooth, so the surface stays smooth and the eyes sit on top of it.
   */

  // --- nose: a small button, not an anatomical nose. Direction space makes
  // this easy: the gaussian is centred on the nose's direction from the skull
  // centre, so it moves with the head automatically.
  {
    const nx = x / 0.17, ny = (y + 0.30) / 0.15;
    const g = Math.exp(-(nx * nx + ny * ny) * 1.3) * front;
    p[2] += g * 0.008;
    p[1] -= g * 0.006;
    // nose bridge: a narrow ridge running up between the eyes, so the nose
    // reads as part of the face rather than a ball stuck on it
    const bx = x / 0.075;
    const bridge = Math.exp(-bx * bx) * Math.exp(-Math.pow((y + 0.02) / 0.30, 2)) * front;
    p[2] += bridge * 0.003;
    // nostril wings and the crease under the tip
    for (const sx of [-1, 1]) {
      const ax = (x - sx * 0.115) / 0.075, ay = (y + 0.355) / 0.070;
      p[2] += Math.exp(-(ax * ax + ay * ay)) * front * 0.005;
      const cx2 = (x - sx * 0.075) / 0.045, cy2 = (y + 0.395) / 0.045;
      p[2] -= Math.exp(-(cx2 * cx2 + cy2 * cy2)) * front * 0.005;   // nostril
    }
  }

  // --- cheekbones and the soft cheek mass beside the mouth
  const cheekY = Math.exp(-Math.pow((y + 0.18) / 0.26, 2));
  const cheekX = Math.exp(-Math.pow((Math.abs(x) - 0.52) / 0.30, 2));
  p[2] += cheekY * cheekX * front * 0.007;
  p[0] += Math.sign(x) * cheekY * cheekX * front * 0.005;

  // --- mouth mass: a slight muzzle so the lips have something to sit on
  const muzzle = Math.exp(-Math.pow((x) / 0.26, 2)) * Math.exp(-Math.pow((y + 0.42) / 0.20, 2));
  p[2] += muzzle * front * 0.014;

  // --- back of the skull: slightly flattened, as skulls are
  if (z < 0) p[2] *= 0.94;

  return p;
}

/**
 * The z of the face surface directly in front of a head-local (x, y). Feature
 * placement MUST be derived from this: hard-coded z values put the lips inside
 * the skull and the eyes outside it as soon as the head radius changed.
 */
/**
 * The skull's exact front surface z at head-local (x, y), found by walking out
 * from the head centre along +z and returning the LAST crossing of the radial
 * surface. Using an algebraic ellipse here is not good enough: the dish, the
 * brow ridge and the cheek mass all move the surface by more than the eyeball's
 * radius, so a patch placed from the ellipse lands inside the head.
 */
export function skullFrontZ(x, y) {
  const rho = Math.hypot(x, y);
  if (rho > 0.20) return 0;
  let best = null;
  const N = 200;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * 1.6;                 // search out to 1.6 * HZ
    const d = [x / t, y / t, 1];
    const L = Math.hypot(d[0], d[1], d[2]);
    const dir = [d[0] / L, d[1] / L, d[2] / L];
    const p = skullPoint(dir);
    // the surface point on this ray has parameter p[2] / dir[2]
    const zAt = p[2] / dir[2];
    if (zAt > 0 && Math.abs(zAt - t) < 0.004) best = zAt;   // crossing
  }
  return best == null ? 0 : best;
}

/** The skull's base ellipsoid surface z, ignoring the socket dish and brow. */
export function faceBaseZ(x, y, HC) {
  const lx = x / HX, ly = y / HY;
  const r2 = lx * lx + ly * ly;
  if (r2 >= 1) return HC[2];
  return HC[2] + HZ * Math.sqrt(1 - r2);
}

/**
 * The z of the face surface directly in front of a head-local (x, y), i.e. the
 * DISHED surface. Use this to place things that must sit on the skin; use
 * faceBaseZ for things that must clear the socket (the eyeball, the brow).
 */
export function faceSurfaceZ(x, y, HC) {
  const lx = x / HX, ly = y / HY;
  const r2 = lx * lx + ly * ly;
  if (r2 >= 1) return 0;
  const lz = Math.sqrt(1 - r2);
  const p = skullPoint([lx, ly, lz]);
  return HC[2] + p[2];
}

/* ---------------------------------------------------------------- mesh helpers */

/**
 * A skinned sphere whose vertices are assigned to a bone (optionally blended
 * with a second bone by a smooth function of position). This is the primitive
 * the whole figure is built from.
 */
function skinnedBall({ centre, radii, seg = 20, rings = 14, mat = 0, bone, bone2 = null, blend = null, deform = null }) {
  const m = sphere({ radii, seg, rings, mat, deform: (p, th, ph) => p });
  const n = m.count;
  const weights = new Float32Array(n * 4);
  const bones = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = [m.pos[i * 3] + centre[0], m.pos[i * 3 + 1] + centre[1], m.pos[i * 3 + 2] + centre[2]];
    m.pos[i * 3] = p[0]; m.pos[i * 3 + 1] = p[1]; m.pos[i * 3 + 2] = p[2];
    if (deform) {
      const q = deform([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]);
      m.pos[i * 3] = q[0]; m.pos[i * 3 + 1] = q[1]; m.pos[i * 3 + 2] = q[2];
    }
    const t = bone2 && blend ? blend(p) : 0;
    bones[i * 4] = bone;
    bones[i * 4 + 1] = bone2 || bone;
    weights[i * 4] = 1 - t;
    weights[i * 4 + 1] = t;
  }
  m.weights = weights;
  m.bones = bones;
  return m;
}

/**
 * A loft whose vertices are assigned to bones per STATION. The caps inherit the
 * end station's bone, which is correct for a limb; for a shape that should blend
 * across a joint, `tSplit` names the fractional positions where bone k gives way
 * to bone k+1, with a half-width for the blend.
 */
function skinnedLoft({ stations, seg = 24, mat = 0, bones: boneList, tSplit = [], capStart = true, capEnd = true }) {
  // `tSplit` entries refer to bone PAIRS, so there can be at most
  // boneList.length - 1 of them. Clamp rather than throw: a limb with more
  // bones than splits is a normal case (the extra stations just follow the
  // nearest bone).
  tSplit = (tSplit || []).slice(0, Math.max(0, boneList.length - 1));
  const m = loft({ stations, seg, mat, capStart, capEnd });
  const n = m.count;
  const weights = new Float32Array(n * 4);
  const bones = new Uint16Array(n * 4);
  const ST = stations.length;
  const CAPR = 4;
  const totalRings = (capStart ? CAPR : 0) + ST + (capEnd ? CAPR : 0);
  for (let v = 0; v < n; v++) {
    const ring = Math.floor(v / seg);
    // map the ring index back to a station position 0..1
    let f;
    if (capStart && ring < CAPR) f = (ring + 1) / (CAPR + 1) / (ST - 1) * 0.35;
    else if (capEnd && ring >= totalRings - CAPR) f = 1 - ((totalRings - ring) / (CAPR + 1)) * 0.35 / (ST - 1);
    else f = (ring - (capStart ? CAPR : 0)) / Math.max(1, ST - 1);
    let b0 = boneList[0], b1 = boneList[0], t = 0;
    let found = false;
    for (let k = 0; k < tSplit.length; k++) {
      const [at, width] = tSplit[k];
      if (Math.abs(f - at) < width) {
        b0 = boneList[k]; b1 = boneList[k + 1];
        t = 0.5 + (f - at) / (2 * width);
        found = true; break;
      }
      if (f > at) { b0 = boneList[k + 1]; b1 = boneList[k + 1]; }
    }
    if (!found) { b1 = b0; t = 0; }
    bones[v * 4] = b0; bones[v * 4 + 1] = b1;
    weights[v * 4] = 1 - t; weights[v * 4 + 1] = t;
  }
  m.weights = weights; m.bones = bones;
  return m;
}

/** A skinned tube along a path, with per-vertex weights interpolated along it. */
function skinnedTube({ path, radii, seg = 14, mat = 0, bones: boneList, tSplit = null, capStart = true, capEnd = true }) {
  const m = tube({ path, radii, seg, mat, capStart, capEnd });
  const n = m.count;
  const weights = new Float32Array(n * 4);
  const bones = new Uint16Array(n * 4);
  // the tube's vertex order is: capStart rings, then path rings, then capEnd rings.
  const ringsTotal = (capStart ? 4 : 0) + path.length + (capEnd ? 4 : 0);
  for (let i = 0; i < n; i++) {
    const ring = Math.floor(i / seg);
    const f = ringsTotal > 1 ? ring / (ringsTotal - 1) : 0;
    // boneList is a partition of [0,1]; blend across whichever split we are near
    let b0 = boneList[0], b1 = boneList[0], t = 0;
    for (let k = 0; k < tSplit.length; k++) {
      const [at, width] = tSplit[k];
      if (Math.abs(f - at) < width) {
        b0 = boneList[k]; b1 = boneList[k + 1];
        t = 0.5 + (f - at) / (2 * width);
        break;
      }
      if (f > at) { b0 = boneList[k + 1]; b1 = boneList[k + 1]; }
    }
    bones[i * 4] = b0; bones[i * 4 + 1] = b1;
    weights[i * 4] = 1 - t; weights[i * 4 + 1] = t;
  }
  m.weights = weights;
  m.bones = bones;
  return m;
}

/* ------------------------------------------------------------------ the figure */

export function createFigure6() {
  const sk = createSkeleton(SKEL);
  // Build in the solved rest pose: hands, fingers and the mouth are authored in
  // figure space, which keeps the geometry code readable, and the bone
  // transforms below then convert them into bone-local space for skinning.
  sk.solve([0, 0, 0]);
  const boneIndex = new Map();
  let bi = 0;
  for (const name of sk.order || []) boneIndex.set(name, bi++);
  // createSkeleton does not expose its order, so rebuild it deterministically
  boneIndex.clear();
  bi = 0;
  for (const name of Object.keys(SKEL)) boneIndex.set(name, bi++);
  const NB = boneIndex.size;
  const bindInv = new Float32Array(NB * 16);

  const state = {
    expr: {
      smile: 0, browRaise: 0, browAngle: 0, squint: 0, blink: 0,
      mouthOpen: 0, mouthWide: 0, mouthPout: 0, jawDrop: 0,
      lookX: 0, lookY: 0, widen: 0,
    },
    fingers: { curl: 0.12, spread: 0, thumb: 0.2 },
    handL: { curl: 0.12, spread: 0, thumb: 0.2 },
    handR: { curl: 0.12, spread: 0, thumb: 0.2 },
    blink: 0,
    look: [0, 0],
  };

  const parts = [];
  const B = (name) => boneIndex.get(name);
  const tags = [];
  /**
   * Build a lofted limb along a chain of bones, sampling positions from the
   * solved skeleton. Authoring limb geometry at hand-written coordinates while
   * the bones sit somewhere else is how a rig ends up with skin that detaches
   * from the skeleton the moment it is posed; deriving both from `sk.pos()`
   * makes that impossible.
   */
  const limb = ({ chain, radii, extra = [], seg = 18, mat, tSplit = [], capStart = true, capEnd = true }) => {
    const path = [];
    const rad = [];
    for (let i = 0; i < chain.length; i++) {
      path.push(sk.pos(chain[i]));
      rad.push(radii[i]);
    }
    // insert the `extra` stations ([afterBoneIndex, fraction, radius]) so the
    // silhouette can bulge at a muscle and taper at a joint
    for (const [afterIdx, frac, r] of extra) {
      const a = sk.pos(chain[afterIdx]), b = sk.pos(chain[afterIdx + 1]);
      const at = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
      path.splice(afterIdx + 1, 0, at);
      rad.splice(afterIdx + 1, 0, r);
    }
    return skinnedTube({ path, radii: rad, seg, mat, bones: chain, tSplit, capStart, capEnd });
  };
  const push = (part, tag) => { tags.push(tag || 'part'); parts.push(part); return part; };

  /* ---- body: one implicit surface ---------------------------------------
   * The torso, neck and both limbs are capsules and ellipsoids along the
   * skeleton, smooth-unioned into a single scalar field and polygonised with
   * surface nets. This is what removes the "assembled from tubes" look: there
   * are no junctions, because there are no separate parts.
   *
   * It also means the body is watertight and continuous through the shoulder,
   * the elbow and the hip, which the earlier loft-and-ball construction could
   * never be.
   */
  const skel = (name) => sk.pos(name);
  const mid = (a, b, f) => {
    const A = sk.pos(a), B = sk.pos(b);
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
  };

  /* ---- torso, legs and feet: field #1 ----------------------------------
   * Two fields rather than one, for a concrete reason. The arms hang beside
   * the thighs and the two surfaces actually occupy overlapping space, so no
   * point test ("closer to the arm axis than to the body axis") can separate
   * them: the outer thigh is genuinely nearer the forearm than its own centre.
   * Splitting the field makes each material rule unambiguous — inside the arm
   * field, "below the elbow" can only mean forearm — and the two meshes
   * interpenetrate inside the shoulder, where neither is visible.
   */
  const TORSO = [
    ellipsoid({ c: [0, sk.pos('hips')[1] + 0.010, 0], r: [0.118, 0.100, 0.092], bone: B('hips'), blend: 1, mat: MAT.trouser }),
    ellipsoid({ c: mid('hips', 'chest', 0.42), r: [0.124, 0.108, 0.092], bone: B('spine'), blend: 1, mat: MAT.shirt }),
    ellipsoid({ c: [0, sk.pos('chest')[1] - 0.010, 0], r: [0.138, 0.096, 0.094], bone: B('chest'), blend: 1, mat: MAT.shirt }),
    capsule({ a: [0, sk.pos('spine')[1] - 0.020, 0], b: [0, sk.pos('chest')[1] + 0.026, 0], r0: 0.106, r1: 0.112, bone: B('chest'), blend: 1, mat: MAT.shirt }),
    // neck: short and thick, tilted forward
    capsule({ a: [0, sk.pos('head')[1] - 0.170, 0.006], b: [0, sk.pos('head')[1] - 0.062, 0.018], r0: 0.064, r1: 0.058, bone: B('neck'), blend: 1, mat: MAT.skin }),
  ];
  for (const side of ['L', 'R']) {
    TORSO.push(capsule({
      a: skel(`thigh${side}`), b: mid(`thigh${side}`, `shin${side}`, 0.42), r0: 0.070, r1: 0.046,
      bone: B(`thigh${side}`), blend: 1, mat: MAT.trouser,
    }));
    TORSO.push(capsule({
      a: mid(`thigh${side}`, `shin${side}`, 0.42), b: [sk.pos(`foot${side}`)[0], 0.030, sk.pos(`foot${side}`)[2]], r0: 0.046, r1: 0.034,
      bone: B(`shin${side}`), blend: 1, mat: MAT.trouser,
    }));
  }
  const hipY = sk.pos('hips')[1];
  const ankleY = sk.pos('footL')[1];
  /* Only two boundaries live in the field: the shirt hem and the waistband.
   * The shoe is separate geometry (see the boots below). Putting the ankle in
   * the field as a horizontal plane cut the near-vertical shin at a shallow
   * angle, which made a ragged, torn-looking material edge there. */
  const torsoZone = (x, y) => (y > hipY + 0.012 ? MAT.shirt : MAT.trouser);
  const torsoField = makeField(TORSO, { blend: 0.030 });
  const torsoRaw = surfaceNets(torsoField, {
    min: [-0.30, -0.02, -0.26], max: [0.30, sk.pos('head')[1] + 0.06, 0.26],
    res: [84, 146, 84], shapes: TORSO, blend: 0.030, mat: MAT.shirt, zone: torsoZone,
  });
  push(createMesh({
    pos: torsoRaw.pos, nrm: torsoRaw.nrm, idx: torsoRaw.idx, mat: torsoRaw.mat,
    weights: torsoRaw.weights, bones: torsoRaw.bones,
  }), 'body');

  /* ---- arms: field #2 --------------------------------------------------- */
  const ARMS = [];
  for (const side of ['L', 'R']) {
    // The deltoid has to OVERLAP the ribcage, not touch it. Placed tangent it
    // reads as a ball stuck on the side of the shirt with a notch beneath it;
    // pushed 25 mm inside the shirt ellipsoid the two blend into one shoulder.
    ARMS.push(ellipsoid({
      c: [sk.pos(`shoulder${side}`)[0] * 0.66, sk.pos(`shoulder${side}`)[1] + 0.006, 0],
      r: [0.068, 0.070, 0.058], bone: B(`upperArm${side}`), bone2: B('chest'), blend: 0.55, mat: MAT.shirt,
    }));
    ARMS.push(capsule({
      a: skel(`upperArm${side}`), b: skel(`foreArm${side}`), r0: 0.052, r1: 0.036,
      bone: B(`upperArm${side}`), blend: 1, mat: MAT.shirt,
    }));
    ARMS.push(capsule({
      a: skel(`foreArm${side}`), b: mid(`foreArm${side}`, `hand${side}`, 1.02), r0: 0.036, r1: 0.021,
      bone: B(`foreArm${side}`), blend: 1, mat: MAT.skin,
    }));
  }
  const elbowY = sk.pos('foreArmL')[1];
  const armZone = (x, y) => (y > elbowY + 0.030 ? MAT.shirt : MAT.skin);
  const armField = makeField(ARMS, { blend: 0.028 });
  const armRaw = surfaceNets(armField, {
    min: [-0.28, 0.36, -0.16], max: [0.28, 0.94, 0.16],
    res: [64, 104, 52], shapes: ARMS, blend: 0.028, mat: MAT.shirt, zone: armZone,
  });
  push(createMesh({
    pos: armRaw.pos, nrm: armRaw.nrm, idx: armRaw.idx, mat: armRaw.mat,
    weights: armRaw.weights, bones: armRaw.bones,
  }), 'arms');


  /* ---- hands ----------------------------------------------------------- */
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    push(buildHand(side, sgn, B, sk), `hand${side}`);
  }

  /* ---- boots ------------------------------------------------------------
   * Separate geometry, deliberately. A boot is a different object from a leg:
   * it has a hard sole, a rounded toe and a cuff, and it must overlap the
   * trouser rather than blend into it. Building it in the body field would
   * require a material boundary around the ankle, which is exactly what tore.
   */
  for (const side of ['L', 'R']) {
    const fp = sk.pos(`foot${side}`);
    const parts = [
      /* A boot is ONE egg elongated along the walking direction, flattened
       * underneath. Built as a heel ball plus a toe ball it read as two
       * separate spheres; a single stretched ellipsoid reads as a shoe. */
      skinnedBall({
        centre: [fp[0], 0.048, fp[2] + 0.050], radii: [0.050, 0.046, 0.098],
        seg: 28, rings: 20, mat: MAT.shoe, bone: B(`foot${side}`),
        deform: (q) => {
          // flat sole: pull the underside up, and shorten it a touch at the heel
          const sole = Math.max(0, (-q[1] + 0.004) / 0.30);
          return [q[0], q[1] * (1 - sole * 0.55), q[2] * (1 + sole * 0.10)];
        },
      }),
    ];
    push(mergeMeshes(parts), `shoe${side}`);
  }


  /* ---- head ----------------------------------------------------------- */
  const headBonePos = sk.pos('head');
  const HC = [headBonePos[0] + HEAD_OFFSET[0], headBonePos[1] + HEAD_OFFSET[1], headBonePos[2] + HEAD_OFFSET[2]];
  push(buildHead(B, HC), 'head');
  // (a painted mouth is used instead of the mouth mesh; see faceMaterialLocal)
  push(buildHair(B, HC), 'hair');
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    // eyes are composited in 2D at a projected anchor; see drawEyes()
  }

  // Record a part id per triangle so a debug view can paint each body part in
  // its own colour. Without this, authoring a figure with 20 hard-coded parts
  // is guesswork: you cannot tell which surface is in the wrong place.
  const mesh = mergeMeshes(parts);
  const partId = new Uint16Array(mesh.tris);
  {
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i].tris;
      const id = i;
      for (let k = 0; k < t; k++) partId[off + k] = id;
      off += t;
    }
  }
  const materials = MATERIALS;
  const partNames = tags;

  /* ---- bind pose ------------------------------------------------------- */
  sk.solve([0, 0, 0]);
  for (const [name, idx] of boneIndex) {
    // bind matrix = the bone's world matrix in the rest pose
    bindInv.set(mat4.invert(mat4.fromMat3(sk.mat(name), sk.pos(name))), idx * 16);
  }

  const figure = {
    sk, state, mesh, materials, boneIndex, bindInv, NB, partId, partNames,
    /** Palette of 16-matrix skinning palettes, refreshed by `solve()`. */
    palette: new Float32Array(NB * 16),

    solve(rootPos = [0, 0, 0]) {
      sk.solve(rootPos);
      const P = figure.palette;
      for (const [name, idx] of boneIndex) {
        const world = mat4.fromMat3(sk.mat(name), sk.pos(name));
        const m = mat4.mul(world, bindInv.subarray(idx * 16, idx * 16 + 16));
        P.set(m, idx * 16);
      }
      return figure;
    },

    setExpression(name) {
      Object.assign(state.expr, EXPRESSIONS[name] || EXPRESSIONS.neutral);
      return figure;
    },

    drawScene(scene) {
      scene.push({ mesh, materials });
      return scene;
    },
  };

  // One driver: set the state, then `solve()` turns it into bone transforms and
  // a skinning palette. Everything expressive funnels through here so a scene
  // cannot forget to apply half of it.
  const baseSolve = figure.solve;
  figure.solve = (rootPos = [0, 0, 0]) => {
    const e = state.expr;
    // ---- jaw: opens downward around a hinge behind the chin
    sk.set('jaw', 0.02 + Math.max(0, e.mouthOpen) * 0.30 + Math.max(0, e.mouthWide) * 0.02, 0, 0);
    // ---- eyes: look direction is a rotation of the eyeball bone
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? 1 : -1;
      sk.set(`eye${side}`, -(e.lookY + (state.look ? state.look[1] : 0)) * 0.5, (e.lookX + (state.look ? state.look[0] : 0)) * 0.55, 0);
      // ---- lids: the upper lid rotates down to close, plus the squint term
      const blink = Math.max(0, Math.min(1, Math.max(state.blink || 0, e.blink || 0)));
      const squint = e.squint * 0.10;
      const upper = -0.62 * (1 - blink) - 0.05 - squint - Math.max(0, e.smile) * 0.10;
      // no lid bones are used (see buildEye)
      // ---- brows: raise, and the inner end lifts or drops for the angle
      sk.set(`brow${side}`, -e.browRaise * 0.35 + e.squint * 0.06, 0, -e.browAngle * 0.55 * sgn);
      // ---- fingers: curl distributes across the three phalanges
      const h = side === 'L' ? state.handL : state.handR;
      const curl = h ? h.curl : state.fingers.curl;
      const spread = h ? h.spread : state.fingers.spread;
      const thumb = h ? h.thumb : state.fingers.thumb;
      for (const f of FINGERS) {
        for (let j = 0; j < 3; j++) {
          sk.set(`${f.name}${j}${side}`, 0, 0, curl * (0.75 + j * 0.25) * 1.25);
          if (j === 0) sk.add(`${f.name}${j}${side}`, 0, spread * f.spread * 6, 0);
        }
      }
      for (let j = 0; j < 3; j++) {
        sk.set(`thumb${j + 1}${side}`, thumb * 0.55, 0, thumb * 0.45 * sgn);
      }
      // ---- mouth corners: the smile pulls the corner bones, which is why the
      // lips are geometry and not a texture
      if (sk.bones.has(`mouth${side}`)) {
        sk.set(`mouth${side}`, 0, 0, -e.smile * 0.75 * sgn);
        if (e.mouthWide) sk.add(`mouth${side}`, 0, e.mouthWide * 0.5 * sgn, 0);
      }
    }
    baseSolve(rootPos);
    return figure;
  };

  figure.solve();
  return figure;
}

/* ---------------------------------------------------------------------- hands */

/**
 * The hand. Built in the HAND BONE's local space, where +Y points up the arm
 * (toward the wrist) and -Y toward the fingers, so the whole hand rotates with
 * the bone and the fingers are simple tapered tubes down the -Y axis.
 *
 * Sized deliberately large: a cartoon hand is about 1.15x the anatomical size,
 * and the phalanges are separated enough to read at 1080p.
 */
function buildHand(side, sgn, B, sk) {
  const parts = [];
  const handBone = B(`hand${side}`);
  const at = vadd(sk.pos(`hand${side}`), applyBone(sk.mat(`hand${side}`), [0, -0.030, 0.004]));
  const X = vnorm(applyBone(sk.mat(`hand${side}`), [1, 0, 0]));
  const Y = vnorm(applyBone(sk.mat(`hand${side}`), [0, 1, 0]));
  const Z = vnorm(applyBone(sk.mat(`hand${side}`), [0, 0, 1]));
  const P = (x, y, z) => vadd(at, vadd(vmul(X, x * sgn), vadd(vmul(Y, y), vmul(Z, z))));

  // palm: a slab, wider across the knuckles, thinner at the wrist
  /* The palm must actually REACH the knuckles. The first version put a 38 mm
   * palm at y = -12 mm and then started the fingers at y = -72 mm, so every
   * finger floated 20 mm below the hand as a separate stick. The finger roots
   * are now derived from the palm's own lower edge. */
  const PALM_Y = -0.014;
  const PALM_TOP = 0.032;      // half-height upward, toward the wrist
  const PALM_BOT = 0.040;      // half-height downward, toward the knuckles
  parts.push(skinnedBall({
    centre: P(0, PALM_Y, 0),
    radii: [0.0295, (PALM_TOP + PALM_BOT) * 0.5, 0.0150], seg: 20, rings: 16, mat: MAT.skin,
    bone: handBone,
    deform: (q) => q,
  }));
  // (no separate knuckle pad: it drew a hard shelf across the palm; the palm
  // ellipsoid is simply made a little wider at the knuckle end instead)
  const KNUCKLE_Y = PALM_Y - PALM_BOT + 0.004;

  /* Fingers, CURLED into a relaxed hand.
   *
   * Straight fingers on a hand this small read as a fork: three thin prongs on
   * a ball. A relaxed hand has every joint bent, so the fingers sweep from the
   * knuckles down and back toward the palm and the silhouette becomes one
   * rounded mass with shallow separations — which is also what the reference
   * style's hands look like.
   */
  const CURL = 0.62;                       // radians per joint, at rest
  for (const f of FINGERS) {
    const base = P(f.x * 1.02, KNUCKLE_Y, f.z);
    let point = base;
    let ang = 0.10;                        // slight forward lean at the knuckle
    for (let j = 0; j < 3; j++) {
      ang += CURL * (j === 0 ? 0.85 : 1.0);
      const len = f.lens[j];
      // the finger leaves the knuckle along -Y and bends toward +Z (the palm)
      const dir = [0, -Math.cos(ang), Math.sin(ang)];
      const next = [point[0], point[1] + dir[1] * len, point[2] + dir[2] * len];
      const boneName = `${f.name}${j}${side}`;
      const boneNext = j < 2 ? B(`${f.name}${j + 1}${side}`) : B(boneName);
      const r0 = f.r * (1 - j * 0.13), r1 = f.r * (1 - (j + 1) * 0.17);
      parts.push(skinnedTube({
        path: [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2, (point[2] + next[2]) / 2], next],
        radii: [r0, (r0 + r1) * 0.5, r1], seg: 9, mat: MAT.skin,
        bones: [B(boneName), B(boneName), boneNext], tSplit: [[0.80, 0.20]],
        capStart: false, capEnd: j === 2,
      }));
      point = next;
    }
  }
  // thumb: three phalanges angled across the palm
  {
    const dir = vnorm(vadd(vmul(X, -0.30 * sgn), vadd(vmul(Y, -0.86), vmul(Z, 0.40))));
    const lens = [0.022, 0.017, 0.013];
    const radii = [0.0118, 0.0102, 0.0086];
    let p = P(-0.022, PALM_Y - 0.006, 0.009);
    for (let j = 0; j < 3; j++) {
      const name = `thumb${j + 1}${side}`;
      const next = j < 2 ? B(`thumb${j + 2}${side}`) : B(name);
      const q1 = vadd(p, vmul(dir, lens[j] * 0.55));
      const q2 = vadd(p, vmul(dir, lens[j]));
      parts.push(skinnedTube({
        path: [p, q1, q2],
        radii: [radii[j], (radii[j] + radii[j + 1]) * 0.5, radii[j + 1]],
        seg: 10, mat: MAT.skin,
        bones: [B(name), B(name), next], tSplit: [[0.80, 0.20]],
        capStart: j === 0, capEnd: j === 2,
      }));
      p = q2;
    }
  }
  return mergeMeshes(parts);
}

/** Apply a 3x3 row-major rotation matrix. */
function applyBone(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/* ----------------------------------------------------------------------- head *//* ----------------------------------------------------------------------- head *//* ----------------------------------------------------------------------- head */

function buildHead(B, HC) {
  // A UV sphere projected onto the skull function: the vertex directions sample
  // the radial field, which is what makes the nose/chin/sockets part of one
  // continuous surface rather than separate blobs.
  // Painted features (lips, blush) are cut out on triangle boundaries, so the
  // head grid is the resolution of the face. 48x36 gave 5 mm steps, which is
  // visible as a ragged lip edge at portrait distance; 88x66 is 2.7 mm.
  const SEG = 88, RING = 66;
  const pos = [], nrm = [], idx = [], mats = [];
  const headBone = B('head');
  const H = HC;                      // head centre in figure space

  const P = (th, ph) => {
    const d = [Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)];
    const p = skullPoint(d);
    return [H[0] + p[0], H[1] + p[1], H[2] + p[2]];
  };

  const HEAD_LOCAL = [];
  for (let j = 0; j <= RING; j++) {
    const ph = (j / RING) * Math.PI;
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const p = P(th, ph);
      HEAD_LOCAL.push([p[0] - H[0], p[1] - H[1], p[2] - H[2]]);
      pos.push(p[0], p[1], p[2]);
      // the normal of a radial surface is not the direction: compute it from
      // neighbouring samples so the forms shade correctly
      const e = 0.004;
      const pa = P(th + e, ph), pb = P(th, ph + e);
      const du = vsub(pa, p), dv = vsub(pb, p);
      let n = vnorm(vcross(du, dv));
      if (n[0] * (p[0] - H[0]) + n[1] * (p[1] - H[1]) + n[2] * (p[2] - H[2]) < 0) n = vmul(n, -1);
      nrm.push(n[0], n[1], n[2]);
    }
  }
  const row = SEG + 1;
  for (let j = 0; j < RING; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      // material per triangle: lips, blush and skin regions
      idx.push(a, c, b); mats.push(faceMaterialLocal(HEAD_LOCAL, a, c, b));
      idx.push(b, c, d); mats.push(faceMaterialLocal(HEAD_LOCAL, b, c, d));
    }
  }
  const mesh = createMesh({ pos, nrm, idx, mat: mats });
  const n = mesh.count;
  const weights = new Float32Array(n * 4);
  const bones = new Uint16Array(n * 4);
  const jawBone = B('jaw');
  for (let i = 0; i < n; i++) {
    const y = mesh.pos[i * 3 + 1];
    // the jaw bone drives everything below the lip line, blended so the chin
    // moves with the jaw and the cheeks do not
    const t = Math.min(1, Math.max(0, (H[1] - 0.042 - y) / 0.060));
    bones[i * 4] = headBone; bones[i * 4 + 1] = jawBone;
    weights[i * 4] = 1 - t; weights[i * 4 + 1] = t;
  }
  mesh.weights = weights;
  mesh.bones = bones;
  return mesh;
}

/**
 * Choose the material for a face triangle. Working in HEAD-LOCAL coordinates
 * matters: a blush ellipse written against absolute figure space drifts as soon
 * as the neck length changes.
 */
/**
 * The head carries a single material.
 *
 * Painted regions were cut out on triangle boundaries, so a soft feature like
 * blush became a speckle of alternating skin and blush triangles — visible as
 * fine vertical corduroy across the cheeks and chin. Facial colouring is
 * composited in 2D instead (drawBlush), where it can be a real gradient.
 */
function faceMaterialLocal() {
  return MAT.skin;
}

/* ----------------------------------------------------------------------- eyes */

/**
 * An eyeball is a sphere with three concentric material bands (white, iris,
 * pupil) chosen by the direction of each triangle. That gives a real iris disc
 * that stays round under rotation, and a pupil that dilates by scaling the
 * material bands — no textures needed.
 */
function buildEye(side, sgn, B, HC, sk) {
  const parts = [];
  const eb = sk.pos(`eye${side}`);
  const R = 0.0300;
  const cx = eb[0], cy = eb[1];
  /* PLACEMENT, and why it took several attempts.
   *
   * A spherical eyeball is the "correct" construction and it is what an
   * anatomical rig uses. In THIS geometry it is the wrong tool: the head is one
   * radial surface with a dished socket, so a 30 mm ball centred behind the
   * socket floor either sinks completely into the skull or protrudes as a
   * hemisphere, and there is no radius that reads well at every yaw.
   *
   * The reference style solves it the way 2D cartoons do: the eye is a flat
   * oval outline with an iris and a highlight. So this builds a slightly domed
   * eye patch anchored to the measured face surface, which is unambiguous,
   * always visible, and matches the target idiom.
   */
  const surf = HC[2] + skullFrontZ(cx - HC[0], cy - HC[1]);
  const cz = surf;
  const eyeBone = B(`eye${side}`);
  const gaze = vnorm([sgn * 0.08, 0.0, 1]);

  /** A domed disc on the eye patch: `depth` is the dome's bulge. */
  const patch = (mat, rx, ry, lift, depth, phase = 0, shift = null) => {
    const N = 34;
    const ref = Math.abs(gaze[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = vnorm(vcross(gaze, ref));
    const v = vcross(gaze, u);
    const ox = shift ? u[0] * shift[0] + v[0] * shift[1] : 0;
    const oy = shift ? u[1] * shift[0] + v[1] * shift[1] : 0;
    const oz = shift ? u[2] * shift[0] + v[2] * shift[1] : 0;
    const pos = [], nrm = [], idx = [], mats = [];
    const base = [
      cx + ox + gaze[0] * lift,
      cy + oy + gaze[1] * lift,
      cz + oz + gaze[2] * lift,
    ];
    // ring of points in the plane perpendicular to gaze, offset along gaze
    for (let ring = 0; ring <= 1; ring++) {
      const k = ring === 0 ? 0 : 1;
      const scale = ring === 0 ? 0.0 : 1.0;
      const d = depth * (1 - scale * scale);
      const pts = ring === 0 ? 1 : N;
      for (let i = 0; i < pts; i++) {
        const a = (i / N) * Math.PI * 2 + phase;
        const lx = Math.cos(a) * rx * scale;
        const ly = Math.sin(a) * ry * scale;
        pos.push(base[0] + u[0] * lx + v[0] * ly + gaze[0] * d,
                 base[1] + u[1] * lx + v[1] * ly + gaze[1] * d,
                 base[2] + u[2] * lx + v[2] * ly + gaze[2] * d);
        // normal: mostly along gaze, tilting outward at the rim
        const nx2 = gaze[0] + u[0] * lx * 6 + v[0] * ly * 6;
        const ny2 = gaze[1] + u[1] * lx * 6 + v[1] * ly * 6;
        const nz2 = gaze[2] + u[2] * lx * 6 + v[2] * ly * 6;
        const L2 = Math.hypot(nx2, ny2, nz2) || 1;
        nrm.push(nx2 / L2, ny2 / L2, nz2 / L2);
      }
    }
    for (let i = 0; i < N; i++) {
      const b = 1 + i, c = 1 + ((i + 1) % N);
      idx.push(0, b, c); mats.push(mat);
    }
    return createMesh({ pos, nrm, idx, mat: mats });
  };

  // sclera: an almond, wider than tall, so the eye reads as an eye
  parts.push(patch(MAT.eyeWhite, 0.0300, 0.0235, 0.0000, 0.0060));
  parts.push(patch(MAT.iris, 0.0156, 0.0156, 0.0052, 0.0016));
  parts.push(patch(MAT.irisDark, 0.0128, 0.0128, 0.0058, 0.0012));
  parts.push(patch(MAT.pupil, 0.0062, 0.0062, 0.0063, 0.0008));
  // catchlight: hard, round, up and toward the nose. This one dot is what makes
  // the eye read as alive.
  parts.push(patch(MAT.catchlight, 0.0040, 0.0040, 0.0068, 0.0004, 0, [-sgn * 0.0055, 0.0060]));
  parts.push(patch(MAT.catchlight, 0.0020, 0.0020, 0.0068, 0.0004, 0, [sgn * 0.0045, -0.0055]));

  /* NO eyebrow geometry. A 9 mm tube laid on the brow ridge read as a grey slug
   * and it could not be shaped. Brows are composited in 2D (drawBrows) where
   * they can taper, arch and move with an expression. */
  return parts.length ? mergeMeshes(parts) : createMesh({ pos: [], nrm: [], idx: [], mat: [] });
}

/** A partial spherical shell (an eyelid) with a lid-margin thickness. */
function lidShell({ centre, R, bone, phi0, phi1, mat, th0, th1, tilt = 0, flip = false }) {
  const SEG = 26, RING = 8;
  const pos = [], nrm = [], idx = [], mats = [];
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let j = 0; j <= RING; j++) {
    const ph = phi0 + (phi1 - phi0) * (j / RING);
    for (let i = 0; i <= SEG; i++) {
      const th = th0 + (th1 - th0) * (i / SEG);
      const d = [Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)];
      // rotate the shell about the eye's forward axis so the lid closes at an angle
      const dx = d[0] * ct - d[1] * st, dy = d[0] * st + d[1] * ct;
      let p = [centre[0] + dx * R, centre[1] + dy * R, centre[2] + d[2] * R];
      // squash along z so the lid hugs the eyeball rather than bulging
      p[2] = centre[2] + (p[2] - centre[2]) * 0.92;
      pos.push(p[0], p[1], p[2]);
      const n = vnorm([dx, dy, d[2]]);
      nrm.push(n[0], n[1], n[2]);
    }
  }
  const row = SEG + 1;
  for (let j = 0; j < RING; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (flip) { idx.push(a, b, c); mats.push(mat); idx.push(b, d, c); mats.push(mat); }
      else { idx.push(a, c, b); mats.push(mat); idx.push(b, c, d); mats.push(mat); }
    }
  }
  const m = createMesh({ pos, nrm, idx, mat: mats });
  const n = m.count;
  const w = new Float32Array(n * 4), bns = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) { bns[i * 4] = bone; w[i * 4] = 1; }
  m.weights = w; m.bones = bns;
  return m;
}

/* ---------------------------------------------------------------------- mouth */

/**
 * The mouth is a ring of lips over a dark interior, weighted to the jaw, with
 * the two corner vertices driven by their own bones. That combination gives
 * smile, pout and open in one piece of geometry, which a painted mouth on the
 * face surface cannot do.
 */
function buildMouth(B, HC) {
  const jawBone = B('jaw');
  const headBone = B('head');
  // The lip line sits about a third of the way up from the chin, and the lips
  // must be proud of the face SURFACE — the first version buried them inside
  // the skull because it used the head centre rather than the surface.
  const y0 = HC[1] - 0.100;          // lip line, a third of the way up from the chin
  const z0 = faceSurfaceZ(0, y0 - HC[1], HC) + 0.004;  // 4 mm proud of the surface
  const halfW = 0.038;
  const upH = 0.0090, loH = 0.0105;

  const pos = [], nrm = [], idx = [], mats = [];
  const NV = 22;
  // upper lip band
  const rings = [];
  for (let i = 0; i <= NV; i++) {
    const t = i / NV;
    const a = (t - 0.5) * 2;                          // -1..1 across the mouth
    const w = Math.sqrt(Math.max(0, 1 - a * a));      // elliptical end taper
    const x = a * halfW;
    // the upper lip has a cupid's bow: a dip at the centre
    const bow = 0.0022 * Math.exp(-Math.pow(a / 0.30, 2));
    const yIn = y0 + 0.0006 * (1 - w);
    const yOut = y0 + upH * w + bow;
    const zOut = z0 + 0.0055 * w;
    rings.push({ x, yIn, yOut, z0, zOut, w });
  }
  for (const r of rings) {
    pos.push(r.x, r.yIn, r.z0 - 0.002);  nrm.push(r.x / halfW, 0.15, 0.99);
    pos.push(r.x, r.yOut, r.zOut);       nrm.push(r.x / halfW * 0.8, 0.45, 0.89);
  }
  for (let i = 0; i < NV; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b); mats.push(MAT.lip);
    idx.push(b, c, d); mats.push(MAT.lip);
  }
  const upperCount = pos.length / 3;

  // lower lip band
  const rings2 = [];
  for (let i = 0; i <= NV; i++) {
    const t = i / NV;
    const a = (t - 0.5) * 2;
    const w = Math.sqrt(Math.max(0, 1 - a * a));
    rings2.push({ x: a * halfW, w });
  }
  for (const r of rings2) {
    pos.push(r.x, y0 - 0.0006 * (1 - r.w), z0 - 0.002); nrm.push(r.x / halfW, -0.15, 0.99);
    pos.push(r.x, y0 - loH * r.w, z0 + 0.0060 * r.w);   nrm.push(r.x / halfW * 0.8, -0.45, 0.89);
  }
  for (let i = 0; i < NV; i++) {
    const a = upperCount + i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c); mats.push(MAT.lip);
    idx.push(b, d, c); mats.push(MAT.lip);
  }

  // interior: a small concave patch behind the lips so an open mouth shows
  // darkness and teeth rather than the inside of the head
  const inner0 = pos.length / 3;
  const IW = 10, IH = 4;
  for (let j = 0; j <= IH; j++) {
    for (let i = 0; i <= IW; i++) {
      const a = (i / IW - 0.5) * 2, b = (j / IH - 0.5) * 2;
      const w = Math.sqrt(Math.max(0, 1 - a * a)) * Math.sqrt(Math.max(0, 1 - b * b));
      pos.push(a * halfW * 0.94, y0 + b * 0.0085, z0 - 0.006 - (1 - w) * 0.004);
      nrm.push(0, 0, 1);
    }
  }
  for (let j = 0; j < IH; j++) {
    for (let i = 0; i < IW; i++) {
      const a = inner0 + j * (IW + 1) + i, b = a + 1, c = a + IW + 1, d = c + 1;
      idx.push(a, c, b); mats.push(MAT.mouthInner);
      idx.push(b, c, d); mats.push(MAT.mouthInner);
    }
  }
  // teeth: a thin band across the top of the interior
  const teeth0 = pos.length / 3;
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= IW; i++) {
      const a = (i / IW - 0.5) * 2;
      const w = Math.sqrt(Math.max(0, 1 - a * a));
      pos.push(a * halfW * 0.86, y0 + 0.0062 - j * 0.0042 * (0.4 + 0.6 * w), z0 - 0.0045 - j * 0.0006);
      nrm.push(0, 0, 1);
    }
  }
  for (let i = 0; i < IW; i++) {
    const a = teeth0 + i, b = a + 1, c = a + IW + 1, d = c + 1;
    idx.push(a, b, c); mats.push(MAT.teeth);
    idx.push(b, d, c); mats.push(MAT.teeth);
  }

  const mesh = createMesh({ pos, nrm, idx, mat: mats });
  const n = mesh.count;
  const weights = new Float32Array(n * 4), bones = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = mesh.pos[i * 3];
    // the corners ride their own bones, the body of the lip rides the jaw
    const corner = Math.min(1, Math.max(0, (Math.abs(x) - halfW * 0.45) / (halfW * 0.55)));
    bones[i * 4] = jawBone;
    bones[i * 4 + 1] = B(x > 0 ? 'mouthL' : 'mouthR');
    bones[i * 4 + 2] = headBone;
    weights[i * 4] = 1 - corner;
    weights[i * 4 + 1] = corner * 0.85;
    weights[i * 4 + 2] = corner * 0.15;
  }
  mesh.weights = weights; mesh.bones = bones;
  return mesh;
}

/* ----------------------------------------------------------------------- hair */

/**
 * Thick stylised hair: a cap shell over the skull, a swept fringe, and a set of
 * lock tubes around the silhouette. Round 5 used a "skip predicate" over a grid
 * which banded badly; here the cap is a continuous shell offset from the skull
 * function, so it follows the cranium exactly.
 */
function buildHair(B, HC) {
  const headBone = B('head');
  const H = HC;
  const SEG = 96, RING = 34;
  const pos = [], nrm = [], idx = [], mats = [];
  // the shell only exists above the hairline, which is a function of the polar
  // angle: front hairline higher than the sides, which sit above the ears
  // Polar angle where the hair begins. The face occupies the front of the
  // skull, so the cap has to start above the brow there (ph ~ 0.95 rad) and can
  // come down to the nape at the back (ph ~ 0.30). Getting this wrong once
  // covered the whole face, which reads as a mask rather than hair.
  // The cap sweeps from the TOP pole (ph=0) DOWN to this angle, so a larger
  // value means the hair reaches further down. The first version swept from the
  // hairline to the BOTTOM pole, which draped hair over the face.
  const hairline = (th) => {
    const z = Math.sin(th);                  // +1 at the front of the head
    const f = (z + 1) * 0.5;                 // 0 back, 1 front
    // Front: just above the brow (ph ~ 1.28 rad). Sides: over the ears
    // (ph ~ 1.75). Back: down to the nape (ph ~ 2.05). A value near 1.6 makes a
    // skullcap that reads as a crown, not hair.
    const tousle = 0.020 * Math.sin(th * 5.0 + 0.8) + 0.008 * Math.sin(th * 11.0 - 0.4);
    return 2.36 - 1.22 * Math.pow(f, 0.80) + tousle;
  };
  for (let j = 0; j <= RING; j++) {
    const t = j / RING;
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const ph = hairline(th) * t;
      const d = [Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)];
      const p = skullPoint(d);
      // offset outward along the (approximate) normal, with extra volume at the
      // crown so the silhouette is not a shaved head
      // VOLUME. Crown volume plus lock ridges: a sinusoidal modulation in
      // azimuth, faded out at the rim, gives the silhouette individual locks
      // without separate geometry (separate lock tubes read as shells and show
      // their end caps). The rim is pulled back toward the skull so the hair
      // tucks into the head instead of ending in a visible cut edge.
      // At t=0 the shell must sit ON the skull. Leaving it 6 mm proud showed the
      // lit forehead through the gap under the overhang, as a jagged light band.
      const rimFade = Math.min(1, 0.42 + t * 2.2);
      // the ridges must fade to nothing at the pole, or the cap grows a spike
      /* NO azimuthal ridges. They were meant to read as locks, but at 96
       * segments the two sine terms alias against the tessellation and the cap
       * looks like corduroy. The silhouette does the work instead. */
      const ridges = 0;
      const vol = (0.020 + 0.030 * Math.max(0, -Math.cos(ph))) * rimFade + 0.0012;
      let q = [H[0] + p[0] + d[0] * vol, H[1] + p[1] + d[1] * vol, H[2] + p[2] + d[2] * vol];
      // fringe: a forward sweep over the brow, thicker on one side
      // A narrow fringe window made the rim spiky, and the spikes shadowed the
      // forehead as a dark sawtooth. Wide and shallow instead.
      // A forward fringe sweep put a shaded band across the brow; the hairline
      // itself is enough once the rim is a solid band.
      pos.push(q[0], q[1], q[2]);
      nrm.push(d[0], d[1], d[2]);
    }
  }
  const row = SEG + 1;
  for (let j = 0; j < RING; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b); mats.push(MAT.hair);
      idx.push(b, c, d); mats.push(MAT.hair);
    }
  }
  const cap = createMesh({ pos, nrm, idx, mat: mats });
  const n = cap.count;
  const w = new Float32Array(n * 4), bns = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) { bns[i * 4] = headBone; w[i * 4] = 1; }
  cap.weights = w; cap.bones = bns;
  const parts = [cap];

  return mergeMeshes(parts);
}

/* ----------------------------------------------------------------------- eyes */

/**
 * THE EYES ARE COMPOSITED IN 2D, ON PURPOSE.
 *
 * Four attempts at a depth-correct eyeball failed in this geometry: a 30 mm
 * sphere inside a dished radial skull is either swallowed by the socket or
 * protrudes as a hemisphere, and there is no radius that reads at every yaw.
 * Every commercial stylised pipeline hits the same trade-off and the usual
 * answer is the one the reference art itself uses: the eye is a flat graphic
 * anchored to a point on the face.
 *
 * So `figure.eyeAnchors()` returns the world position and facing of each eye,
 * and `drawEyes()` paints sclera, iris, pupil and catchlight into the finished
 * frame at those projected positions. This is exact (the anchor is a real 3D
 * point under the rig), cheap (two ellipses per eye), and it can blink, look
 * around and squint by pure 2D parameters.
 */
export function eyeAnchors(fig) {
  const out = [];
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    const b = fig.sk.pos(`eye${side}`);
    const m = fig.sk.mat('head');
    // the outward normal of the face at the eye, in world space
    const n = [
      m[0] * sgn * 0.32 + m[3] * 0.0 + m[6] * 0.95,
      m[1] * sgn * 0.32 + m[4] * 0.0 + m[7] * 0.95,
      m[2] * sgn * 0.32 + m[5] * 0.0 + m[8] * 0.95,
    ];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    out.push({
      side, sgn,
      pos: [b[0], b[1], b[2] + 0.014],
      normal: [n[0] / L, n[1] / L, n[2] / L],
      radius: 0.0300,
    });
  }
  return out;
}

/**
 * Paint the eyes into a finished 2D frame. `project` maps a world point to
 * [x, y, depth] and `pixelScale(depth)` gives pixels per world metre at that
 * depth, so the graphic stays glued to the head at any camera distance.
 */
export function drawEyes(ctx, fig, project, pixelScale, {
  openL = 1, openR = 1, look = [0, 0], narrow = 0, irisScale = 1, tint = null,
} = {}) {
  const anchors = eyeAnchors(fig);
  for (const a of anchors) {
    const p = project(a.pos);
    if (!p) continue;
    const cx = p[0], cy = p[1];
    const s = pixelScale(p[2]);
    const open = a.side === 'L' ? openL : openR;
    if (open <= 0.02) continue;
    const rx = a.radius * s * 1.00;
    const ry = a.radius * s * 0.94 * open;
    const lx = look[0] * rx * 0.22;
    const ly = -look[1] * ry * 0.16;
    ctx.save();
    // sclera
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = tint || 'rgb(247,246,244)';
    ctx.fill();
    // clip everything to the eye opening
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    // iris
    const ir = rx * 0.66 * irisScale;
    const ix = cx + lx, iy = cy + ly;
    const g = ctx.createRadialGradient(ix, iy - ir * 0.30, ir * 0.12, ix, iy, ir);
    g.addColorStop(0, 'rgb(74,120,112)');
    g.addColorStop(0.55, 'rgb(46,84,82)');
    g.addColorStop(1, 'rgb(24,44,44)');
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // pupil
    ctx.beginPath(); ctx.arc(ix, iy, ir * 0.42, 0, Math.PI * 2); ctx.fillStyle = 'rgb(16,18,22)'; ctx.fill();
    // upper lid shadow inside the eye
    const sh = ctx.createLinearGradient(0, cy - ry, 0, cy + ry * 0.2);
    sh.addColorStop(0, 'rgba(30,18,14,0.42)');
    sh.addColorStop(1, 'rgba(30,18,14,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 1.4);
    ctx.restore();
    // catchlights: two, one hard and one soft, always up and toward the nose
    const h1x = cx + lx - a.sgn * ir * 0.34, h1y = cy + ly - ir * 0.40;
    ctx.beginPath(); ctx.arc(h1x, h1y, ir * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + lx + a.sgn * ir * 0.30, cy + ly + ir * 0.34, ir * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    // lid line: a dark upper rim, thicker at the outer corner
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.02, ry * 1.10, 0, Math.PI * 1.03, Math.PI * 1.97);
    ctx.lineWidth = Math.max(1.2, s * 0.0022);
    ctx.strokeStyle = 'rgba(48,28,24,0.85)';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The mouth, for the same reason as the eyes: a 4 mm lip line cannot be
 * resolved by a 2.7 mm triangle grid, so painting it produced a ragged gash.
 * Drawn in 2D it is smooth, and smile/opening become two parameters.
 */
export function drawMouth(ctx, fig, project, pixelScale, {
  smile = 0.35, open = 0.0, width = 1.0, tint = null,
} = {}) {
  const head = fig.sk.pos('head');
  const m = fig.sk.mat('head');
  // the middle of the face, 75 mm below the skull centre and on its front
  const L = [0, -0.078, 0.150];
  const w = [
    head[0] + m[0] * L[0] + m[1] * L[1] + m[2] * L[2] + HEAD_OFFSET[0],
    head[1] + m[3] * L[0] + m[4] * L[1] + m[5] * L[2] + HEAD_OFFSET[1],
    head[2] + m[6] * L[0] + m[7] * L[1] + m[8] * L[2] + HEAD_OFFSET[2],
  ];
  const p = project(w);
  if (!p) return;
  const cx = p[0], cy = p[1];
  const s = pixelScale(p[2]);
  const hw = 0.040 * s * width;             // half width in pixels
  const lift = smile * hw * 0.30;           // how far the corners rise
  const gap = Math.min(1.25, open) * s * 0.0165;

  /* The lip shape is built from the SAME curve as the opening.
   *
   * The first version drew a fixed lip shape and then drew the opening as a
   * second, thinner curve inside it — so `open` made the mouth look closed, not
   * open. Both outlines now come from one curve that sags by `gap`, so a wide
   * `open` genuinely parts the lips. */
  const lipH = s * 0.0075;                  // upper lip thickness
  const lipL = s * 0.0105;                  // lower lip thickness
  const sag = gap;                          // how far the lower outline drops

  // upper outline: corners on the smile curve, middle arched up
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - lift);
  ctx.quadraticCurveTo(cx - hw * 0.45, cy - lift * 0.2 - lipH * 1.7, cx, cy - lift * 0.15 - lipH * 2.0);
  ctx.quadraticCurveTo(cx + hw * 0.45, cy - lift * 0.2 - lipH * 1.7, cx + hw, cy - lift);
  // lower outline: corners on the same curve, middle dropped by the opening
  ctx.quadraticCurveTo(cx + hw * 0.50, cy - lift * 0.1 + lipL * 1.9 + sag, cx, cy - lift * 0.1 + lipL * 2.2 + sag);
  ctx.quadraticCurveTo(cx - hw * 0.50, cy - lift * 0.1 + lipL * 1.9 + sag, cx - hw, cy - lift);
  ctx.closePath();
  ctx.fillStyle = tint || 'rgb(198,118,110)';
  ctx.fill();

  // the parting line: dark, and it opens with the lips
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.90, cy - lift * 0.90);
  ctx.quadraticCurveTo(cx, cy - lift * 0.20, cx + hw * 0.90, cy - lift * 0.90);
  ctx.quadraticCurveTo(cx, cy - lift * 0.20 + s * 0.0026 + sag * 1.05, cx - hw * 0.90, cy - lift * 0.90);
  ctx.closePath();
  ctx.fillStyle = 'rgb(88,42,48)';
  ctx.fill();
  ctx.restore();
}

/**
 * Cheek blush, composited. Two soft radial gradients on the face, placed from
 * the rig so they follow the head.
 */
export function drawBlush(ctx, fig, project, pixelScale, { strength = 1 } = {}) {
  const head = fig.sk.pos('head');
  const m = fig.sk.mat('head');
  for (const sx of [-1, 1]) {
    const L = [sx * 0.088, -0.030, 0.122];
    const w = [
      head[0] + m[0] * L[0] + m[1] * L[1] + m[2] * L[2] + HEAD_OFFSET[0],
      head[1] + m[3] * L[0] + m[4] * L[1] + m[5] * L[2] + HEAD_OFFSET[1],
      head[2] + m[6] * L[0] + m[7] * L[1] + m[8] * L[2] + HEAD_OFFSET[2],
    ];
    const p = project(w);
    if (!p) continue;
    const r = 0.070 * pixelScale(p[2]);
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    g.addColorStop(0, `rgba(236,150,138,${0.16 * strength})`);
    g.addColorStop(0.55, `rgba(236,150,138,${0.075 * strength})`);
    g.addColorStop(1, 'rgba(232,132,124,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
}

/**
 * Eyebrows, composited: two tapered strokes above the eyes, arched, thicker at
 * the inner end. `raise` lifts them for surprise, `angle` tilts them.
 */
export function drawBrows(ctx, fig, project, pixelScale, {
  raise = 0, angle = 0, colour = 'rgb(86,58,48)', thickness = 0.62,
} = {}) {
  const head = fig.sk.pos('head');
  const m = fig.sk.mat('head');
  for (const sx of [-1, 1]) {
    const L = [sx * 0.075, 0.056 + raise * 0.016, 0.140];
    const w = [
      head[0] + m[0] * L[0] + m[1] * L[1] + m[2] * L[2] + HEAD_OFFSET[0],
      head[1] + m[3] * L[0] + m[4] * L[1] + m[5] * L[2] + HEAD_OFFSET[1],
      head[2] + m[6] * L[0] + m[7] * L[1] + m[8] * L[2] + HEAD_OFFSET[2],
    ];
    const p = project(w);
    if (!p) continue;
    const s = pixelScale(p[2]);
    const half = 0.028 * s;                 // half width of the brow
    const lift = 0.0045 * s;                // arch height
    const th = 0.0052 * s * thickness;      // stroke thickness
    const tilt = angle * s * 0.020 * sx;
    ctx.save();
    ctx.beginPath();
    // both ends level, the arch in the middle: a sloped brow reads as worried
    ctx.moveTo(p[0] - sx * half, p[1] + tilt);
    ctx.quadraticCurveTo(p[0], p[1] - lift * 1.6 + tilt * 0.5, p[0] + sx * half, p[1] + tilt);
    ctx.lineCap = 'round';
    ctx.lineWidth = th;
    ctx.strokeStyle = colour;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Expression presets for the composited face. Each is a full set of 2D
 * parameters, so an expression is a handful of numbers rather than a mesh.
 */
export const FACE = {
  neutral:  { openL: 1.00, openR: 1.00, look: [0.00, 0.00], iris: 1.00, smile: 0.30, open: 0.00, raise: 0.00, angle: 0.00, width: 1.00 },
  smile:    { openL: 0.94, openR: 0.94, look: [0.05, 0.02],  iris: 1.00, smile: 0.85, open: 0.06, raise: 0.35, angle: 0.20, width: 1.05 },
  laugh:    { openL: 0.60, openR: 0.60, look: [0.00, 0.04],  iris: 1.00, smile: 1.10, open: 1.00, raise: 0.70, angle: 0.30, width: 1.10 },
  sad:      { openL: 0.86, openR: 0.86, look: [0.00, -0.35], iris: 1.00, smile: -0.70, open: 0.00, raise: -0.30, angle: -0.55, width: 0.95 },
  angry:    { openL: 0.80, openR: 0.80, look: [0.00, 0.00], iris: 0.92, smile: -0.45, open: 0.10, raise: -0.55, angle: 0.85, width: 0.96 },
  surprise: { openL: 1.20, openR: 1.20, look: [0.00, 0.10], iris: 0.78, smile: 0.00, open: 0.95, raise: 0.95, angle: 0.10, width: 0.85 },
  sleepy:   { openL: 0.34, openR: 0.34, look: [0.00, -0.15], iris: 1.00, smile: 0.10, open: 0.02, raise: -0.25, angle: -0.10, width: 1.00 },
  blink:    { openL: 0.00, openR: 0.00, look: [0.00, 0.00], iris: 1.00, smile: 0.25, open: 0.00, raise: -0.05, angle: 0.00, width: 1.00 },
  wink:     { openL: 1.05, openR: 0.00, look: [0.10, 0.00], iris: 1.00, smile: 0.75, open: 0.10, raise: 0.30, angle: 0.15, width: 1.02 },
};

/** Apply a preset to a finished frame. */
export function drawFace(ctx, fig, project, pixelScale, name = 'neutral', override = {}) {
  const e = Object.assign({}, FACE[name] || FACE.neutral, override);
  drawBlush(ctx, fig, project, pixelScale, { strength: 1 });
  drawBrows(ctx, fig, project, pixelScale, { raise: e.raise, angle: e.angle });
  drawEyes(ctx, fig, project, pixelScale, {
    openL: e.openL, openR: e.openR, look: e.look, irisScale: e.iris,
  });
  drawMouth(ctx, fig, project, pixelScale, { smile: e.smile, open: e.open, width: e.width });
}

/* ------------------------------------------------------------------ materials */

const MAT = {
  skin: 0, blush: 1, lip: 2, hair: 3, shirt: 4, shirtDark: 5, trouser: 6,
  shoe: 7, eyeWhite: 8, iris: 9, irisDark: 10, pupil: 11, brow: 12,
  mouthInner: 13, teeth: 14, tongue: 15, catchlight: 16,
};

export const MATERIALS = [
  material({ albedo: PAL.skin, rough: 0.72, sss: 0.55, spec: 0.16, wrap: 0.45 }),
  material({ albedo: PAL.skinBlush, rough: 0.74, sss: 0.6, spec: 0.14, wrap: 0.48 }),
  material({ albedo: PAL.lip, rough: 0.52, sss: 0.5, spec: 0.30, wrap: 0.32 }),
  material({ albedo: PAL.hair, rough: 0.46, spec: 0.35, metal: 0.0 }),
  material({ albedo: PAL.shirt, rough: 0.84, spec: 0.10 }),
  material({ albedo: PAL.shirtDark, rough: 0.72, spec: 0.28 }),
  material({ albedo: PAL.trouser, rough: 0.80, spec: 0.20 }),
  material({ albedo: PAL.shoe, rough: 0.42, spec: 0.6 }),
  material({ albedo: PAL.eyeWhite, rough: 0.30, spec: 0.55 }),
  material({ albedo: PAL.iris, rough: 0.22, spec: 0.6 }),
  material({ albedo: PAL.irisDark, rough: 0.10, spec: 1.0 }),
  material({ albedo: PAL.pupil, rough: 0.06, spec: 0.8 }),
  material({ albedo: PAL.brow, rough: 0.45, spec: 0.35 }),
  material({ albedo: PAL.mouthInner, rough: 0.6, spec: 0.2 }),
  material({ albedo: PAL.teeth, rough: 0.25, spec: 0.7 }),
  material({ albedo: PAL.tongue, rough: 0.45, spec: 0.4 }),
  material({ albedo: [1, 1, 1], rough: 0.05, spec: 0.0, emis: [0.95, 0.96, 1.0] }),
];

/* ----------------------------------------------------------------- expressions */

export const EXPRESSIONS = {
  neutral:   { smile: 0.10, browRaise: 0.00, browAngle: 0.00, squint: 0.00, mouthOpen: 0.02, mouthWide: 0.00, mouthPout: 0.00 },
  happy:     { smile: 0.85, browRaise: 0.25, browAngle: 0.05, squint: 0.45, mouthOpen: 0.10, mouthWide: 0.10, mouthPout: 0.00 },
  laughing:  { smile: 1.00, browRaise: 0.35, browAngle: 0.10, squint: 0.80, mouthOpen: 0.65, mouthWide: 0.15, mouthPout: 0.00 },
  surprised: { smile: 0.00, browRaise: 1.00, browAngle: 0.30, squint: -0.30, mouthOpen: 0.55, mouthWide: 0.00, mouthPout: 0.35 },
  angry:     { smile: -0.55, browRaise: -0.25, browAngle: -0.85, squint: 0.35, mouthOpen: 0.18, mouthWide: 0.05, mouthPout: 0.20 },
  sad:       { smile: -0.60, browRaise: 0.10, browAngle: 0.55, squint: 0.20, mouthOpen: 0.05, mouthWide: -0.10, mouthPout: 0.15 },
  confused:  { smile: -0.15, browRaise: 0.35, browAngle: -0.30, squint: 0.10, mouthOpen: 0.10, mouthWide: -0.15, mouthPout: 0.25 },
  thinking:  { smile: 0.05, browRaise: 0.20, browAngle: 0.35, squint: 0.15, mouthOpen: 0.02, mouthWide: -0.20, mouthPout: 0.40 },
  scared:    { smile: -0.30, browRaise: 0.70, browAngle: 0.65, squint: -0.55, mouthOpen: 0.45, mouthWide: 0.20, mouthPout: 0.00 },
};

export const VISEME6 = {
  // IPA -> mouth shape for the new face (open, wide, pout, jaw)
  a: { open: 0.62, wide: 0.05, pout: 0 }, ɑ: { open: 0.65, wide: 0.02, pout: 0 },
  e: { open: 0.34, wide: 0.28, pout: 0 }, ɛ: { open: 0.42, wide: 0.22, pout: 0 },
  i: { open: 0.14, wide: 0.42, pout: 0 }, ɪ: { open: 0.22, wide: 0.34, pout: 0 },
  o: { open: 0.42, wide: -0.15, pout: 0.45 }, ɔ: { open: 0.50, wide: -0.10, pout: 0.35 },
  u: { open: 0.18, wide: -0.30, pout: 0.70 }, ʊ: { open: 0.26, wide: -0.20, pout: 0.55 },
  m: { open: 0.0, wide: -0.05, pout: 0.15 }, b: { open: 0.02, wide: -0.05, pout: 0.10 },
  p: { open: 0.0, wide: -0.05, pout: 0.12 }, f: { open: 0.10, wide: 0.05, pout: 0 },
  v: { open: 0.10, wide: 0.05, pout: 0 }, th: { open: 0.14, wide: 0.10, pout: 0 },
  dh: { open: 0.14, wide: 0.10, pout: 0 }, s: { open: 0.10, wide: 0.25, pout: 0 },
  z: { open: 0.10, wide: 0.25, pout: 0 }, ʃ: { open: 0.14, wide: -0.05, pout: 0.30 },
  ʒ: { open: 0.14, wide: -0.05, pout: 0.30 }, t: { open: 0.10, wide: 0.10, pout: 0 },
  d: { open: 0.12, wide: 0.10, pout: 0 }, n: { open: 0.10, wide: 0.05, pout: 0 },
  l: { open: 0.24, wide: 0.10, pout: 0 }, r: { open: 0.22, wide: -0.10, pout: 0.25 },
  w: { open: 0.12, wide: -0.35, pout: 0.60 }, j: { open: 0.18, wide: 0.35, pout: 0 },
  k: { open: 0.20, wide: 0.05, pout: 0 }, g: { open: 0.22, wide: 0.05, pout: 0 },
  h: { open: 0.28, wide: 0.05, pout: 0 }, tʃ: { open: 0.16, wide: -0.05, pout: 0.25 },
  dʒ: { open: 0.16, wide: -0.05, pout: 0.25 },
};
