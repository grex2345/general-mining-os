/**
 * lastTrain.mjs — Round 4 scene 1, staged in screen space.
 *
 * The lesson that cost the most iterations: with a 56-degree VERTICAL lens the
 * horizontal field is only ~33 degrees, so hand-placed world coordinates always
 * land in the wrong third of a 360x640 frame. Every object here is therefore
 * positioned by solving a *pixel* plan against the ground plane via
 * screenToPlane(). Change the camera and the whole blocking re-solves itself.
 *
 * The camera itself never yaws: it trucks laterally and pushes in, so world +x
 * stays screen-right and the plan stays predictable.
 */

import { makeCamera, createScene, box, cone, makeTerrain, screenToPlane, stageAt, pixelsPerUnit } from '../lowpoly.mjs';
import { rng } from '../cartoon.mjs';

export const RW = 360, RH = 640;

/* ------------------------------------------------------------ the staging
 *
 * Depth-first: each subject gets a DISTANCE (which sets its apparent scale),
 * a pixel column, and the ground plane. Everything else is derived. Depths are
 * chosen so a 1.42-unit dog is 29% of frame height and the station is human-
 * scale behind it — a real station is ~5 m tall, seen from 9 m at 58 px/unit.
 */
export const STAGE = {
  dog:     { depth: 7.0, sx: 214 },   // 1.42 m at 88 px/unit -> 125 px, 20% of height
  station: { depth: 16.5, sx: 62, height_m: 5.4, width_m: 7.0 },
  lamp:    { depth: 9.5, sx: 300, height_m: 3.4 },
  pines:   [{ depth: 21.0, sx: 26 }, { depth: 26.0, sx: 352 }, { depth: 17.0, sx: 322 }],
  fence:   { depth: 11.0, sx0: 150, sx1: 268 },
  moon:    [292, 96],
};

/* ----------------------------------------------------------- the camera */

/**
 * Strafe-left move: the eye TRUCKS laterally and pushes in slightly, always
 * looking dead ahead along -z. No yaw, because a yawed camera rotates the
 * screen-space plan underneath the scene and every derived position shifts.
 */
export function cameraAt(kIn) {
  // Clamp: the driver indexes by frame, and an out-of-range k once parked the
  // camera 11 units behind the scene, which silently rendered an empty frame.
  const k = Math.min(1, Math.max(0, kIn));
  const ease = k * k * (3 - 2 * k);
  const ox = 0.30 + 0.70 * ease;
  const oz = 3.60 - 0.55 * ease;
  const h = 1.62 + 0.10 * ease;
  // a 4-degree downward tilt lifts the horizon off the exact centre line,
  // which is what makes the sky read as sky rather than as a band
  return makeCamera({ eye: [ox, h, oz], target: [ox, h - 0.56, oz - 8], fovDeg: 56, width: RW, height: RH });
}

/** Reference camera: the plan is solved at k = 0.5, the middle of the move. */
export const REF_CAM = cameraAt(0.5);

const at = (spec, planeY = 0) => stageAt(REF_CAM, spec.sx, spec.depth, planeY).pos;

export const DOG_AT = at(STAGE.dog);
export const STATION_AT = at(STAGE.station);
export const LAMP_AT = at(STAGE.lamp);
export const PINES_AT = STAGE.pines.map((p) => at(p));
const FENCE_A = at({ sx: STAGE.fence.sx0, depth: STAGE.fence.depth });
const FENCE_B = at({ sx: STAGE.fence.sx1, depth: STAGE.fence.depth });

/* ------------------------------------------------------------- the world */

const terrain = makeTerrain(19, { octaves: 4, freq: 0.30, amp: 1.2 });

/** Ground height: levelled where the action is, rolling out in the treeline. */
export const groundAt = (x, z) => {
  const d = Math.hypot(x - DOG_AT[0], z - DOG_AT[2]);
  const flat = Math.min(1, Math.max(0, (d - 3.0) / 5.5));
  return terrain(x, z) * 0.32 * flat - 0.03;
};

const STATION_H = STAGE.station.height_m;
const STATION_W = STAGE.station.width_m;
export const DOG_H = 1.42;
export const DOG_PX = DOG_H * pixelsPerUnit(REF_CAM, STAGE.dog.depth);

export const LIGHTS = ({ scale = 1 } = {}) => [
  { pos: [LAMP_AT[0], groundAt(LAMP_AT[0], LAMP_AT[2]) + 3.2, LAMP_AT[2]], colour: [1.0, 0.70, 0.36], intensity: 3.2 * scale, radius: 6.0 * scale },
  { pos: [STATION_AT[0], groundAt(STATION_AT[0], STATION_AT[2]) + 2.8, STATION_AT[2] + 2.6], colour: [1.0, 0.74, 0.40], intensity: 1.6, radius: 6.0 },
];

export function buildWorld(t, { dog = true } = {}) {
  const s = createScene();

  /* --- terrain ------------------------------------------------------------- */
  const N = 20, SPAN = 44, CZ = -9;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = -SPAN / 2 + (i / N) * SPAN, x1 = -SPAN / 2 + ((i + 1) / N) * SPAN;
      const z0 = CZ - SPAN / 2 + (j / N) * SPAN, z1 = CZ - SPAN / 2 + ((j + 1) / N) * SPAN;
      const p0 = [x0, groundAt(x0, z0), z0], p1 = [x1, groundAt(x1, z0), z0];
      const p2 = [x1, groundAt(x1, z1), z1], p3 = [x0, groundAt(x0, z1), z1];
      // One albedo for all snow. Per-quad albedo variation was tried and
      // rejected: at a 2.2-unit grid the cells read as visible rectangles.
      // Snow texture belongs in the post pass, not in the geometry.
      const sh = 0.46;
      s.add([p0, p1, p2, p3], {
        normal: null, doubleSided: true, sortKey: 'far',
        albedo: [sh * 0.86, sh * 0.92, sh * 1.0],
      });
    }
  }

  /* --- station ------------------------------------------------------------- */
  const [sx, , sz] = STATION_AT;
  const gy = groundAt(sx, sz);
  const rot = 0.36;
  box(s, [sx, gy + STATION_H / 2, sz], [STATION_W, STATION_H, 5.0], '#2b2639', { yaw: rot });
  // roof: a thin slab overhanging the walls
  box(s, [sx, gy + STATION_H + 0.18, sz], [STATION_W + 0.6, 0.36, 5.6], '#403a52', { yaw: rot });
  // platform under the building
  box(s, [sx, gy + 0.24, sz + 2.9], [STATION_W + 0.4, 0.48, 1.6], '#3a3348', { yaw: rot });
  /* Architecture has to read as a SOLID with edges, not as floating lights.
   * Round 5 finding: with the wall at #2b2639 against a #3b4159 night sky the
   * facade vanished and the lit windows looked like paper squares glued to the
   * sky. Pale stone bands catch the skylight and draw the building's outline
   * for free, at 4 boxes of cost. */
  const fz = sz + 2.56;
  const facade = (wx, wy, w, h, d, colour) =>
    box(s, [sx + wx * Math.cos(rot), gy + STATION_H * wy, fz - wx * Math.sin(rot)],
        [w, h, d], colour, { yaw: rot });
  facade(0, 1.012, STATION_W + 0.5, 0.13, 0.10, '#6d6884');   // cornice
  facade(0, 0.030, STATION_W + 0.5, 0.12, 0.12, '#5a5570');   // plinth
  facade(-0.85, 0.53, 0.16, 1.00, 0.09, '#55506a');           // pilaster
  facade(1.15, 0.53, 0.16, 1.00, 0.09, '#55506a');            // pilaster

  // windows: albedo near-white warm so they read as emissive after the grade
  for (const [wx, wy] of [[-1.9, 0.70], [0.2, 0.70], [-1.9, 0.36], [0.2, 0.36]]) {
    facade(wx, wy, 1.34, 1.09, 0.10, '#3a3450');              // reveal / surround
    box(s, [sx + wx * Math.cos(rot), gy + STATION_H * wy, fz - wx * Math.sin(rot)],
        [1.3, 1.05, 0.12], '#c9a469', { yaw: rot });
    // mullions: a cross that breaks the big flat glow into four panes
    for (const [mw, mh] of [[0.07, 1.05], [1.3, 0.07]]) {
      box(s, [sx + wx * Math.cos(rot), gy + STATION_H * wy, fz + 0.055 - wx * Math.sin(rot)],
          [mw, mh, 0.05], '#6a5940', { yaw: rot });
    }
  }
  facade(2.1, 0.50, 0.99, 2.34, 0.10, '#3a3450');
  box(s, [sx + 2.1 * Math.cos(rot), gy + 1.15, fz - 2.1 * Math.sin(rot)], [0.95, 2.3, 0.12], '#7d6854', { yaw: rot });

  /* --- lamp --------------------------------------------------------------- */
  const [lx, , lz] = LAMP_AT;
  const lg = groundAt(lx, lz);
  const lampH = STAGE.lamp.height_m;
  box(s, [lx, lg + lampH / 2, lz], [0.12, lampH, 0.12], '#1c1c28');
  box(s, [lx, lg + lampH + 0.06, lz], [0.66, 0.12, 0.66], '#1c1c28');
  box(s, [lx, lg + lampH - 0.10, lz], [0.38, 0.28, 0.38], '#e8c884');

  /* --- dog (omit when a rigged character occupies that spot) -------------- */
  if (dog) drawDog(s, DOG_AT[0], groundAt(DOG_AT[0], DOG_AT[2]), DOG_AT[2], t);

  /* --- pines --------------------------------------------------------------- */
  PINES_AT.forEach(([px, , pz], i) => {
    const k = 1.0 + i * 0.15;
    const pg = groundAt(px, pz);
    box(s, [px, pg + 0.5 * k, pz], [0.18 * k, 1.0 * k, 0.18 * k], '#241f2b');
    for (let n = 0; n < 3; n++) {
      cone(s, {
        base: [px, pg + (0.8 + n * 0.95) * k, pz], r: (1.25 - n * 0.30) * k,
        h: 1.35 * k, seg: 6,
        albedo: [0.080 + n * 0.012, 0.125 + n * 0.018, 0.145 + n * 0.020],
      });
    }
  });

  /* --- fence --------------------------------------------------------------- */
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    const fx = FENCE_A[0] + (FENCE_B[0] - FENCE_A[0]) * f;
    const fz = FENCE_A[2] + (FENCE_B[2] - FENCE_A[2]) * f;
    box(s, [fx, groundAt(fx, fz) + 0.46, fz], [0.09, 1.0, 0.09], '#2b2636');
  }

  /* --- foreground detail: two dark rocks at the extreme frame edges ---------
   * Tried a full ring of 9 and rejected it: at |x|>2.6 they fall outside the
   * 33-degree horizontal field entirely. Only the ones that survive the frustum
   * are kept, and they are near-black so they read as silhouette. */
  for (const [rx, rz, rs] of [[-1.95, -0.55, 0.22], [2.15, -0.9, 0.26]]) {
    box(s, [rx, groundAt(rx, rz) + rs * 0.26, rz], [rs * 1.9, rs * 0.6, rs * 1.5], '#2b3143', { yaw: 0.7 });
  }

  return s;
}

/**
 * The dog, sitting. ~1.42 units tall.
 *
 * The silhouette is what sells an animal, not the face: a low heavy hindquarter,
 * a back that slopes UP toward the shoulders, an upright neck, prick ears and a
 * muzzle that juts forward past the chest. A stack of equal cubes reads as a
 * teddy bear — the size differences below are doing the work.
 */
function drawDog(s, x, gy, z, t) {
  const br = Math.sin(t * 1.6) * 0.010;          // breathing
  const sway = Math.sin(t * 0.9) * 0.03;         // tail
  // three distinct values, not one: hindquarter darkest, ribcage mid, head
  // palest. Without this the boxes merge into a single white blob at 120 px.
  const C = '#aeb9ca', M = '#c2ccdb', L = '#dbe1ec', D = '#98a4b8';
  // hindquarter: the widest, lowest mass
  box(s, [x - 0.02, gy + 0.24, z - 0.10], [0.62, 0.44, 0.58], D);
  // ribcage, rising forward
  box(s, [x, gy + 0.50 + br, z + 0.04], [0.46, 0.42, 0.44], C, { pitch: -0.22 });
  // shoulder/chest, taller still
  box(s, [x, gy + 0.72 + br, z + 0.20], [0.40, 0.34, 0.34], M, { pitch: -0.12 });
  // neck, upright
  box(s, [x, gy + 0.92 + br, z + 0.26], [0.24, 0.24, 0.24], L);
  // pale chest blaze, the one high-value shape in the body
  box(s, [x, gy + 0.60 + br, z + 0.30], [0.20, 0.34, 0.10], L, { pitch: -0.10 });
  // skull, tipped very slightly forward and to one side
  const hx = x + 0.015, hy = gy + 1.10 + br, hz = z + 0.30;
  box(s, [hx, hy, hz], [0.34, 0.30, 0.34], L, { pitch: 0.10, yaw: 0.08 });
  // muzzle: narrower and lower, pushed well forward
  box(s, [hx, hy - 0.075, hz + 0.24], [0.17, 0.15, 0.20], L, { pitch: 0.08 });
  box(s, [hx, hy - 0.105, hz + 0.345], [0.055, 0.045, 0.04], '#22202b');  // nose
  // eyes: set wide, small, high on the skull
  box(s, [hx - 0.10, hy + 0.035, hz + 0.175], [0.055, 0.065, 0.035], '#191926');
  box(s, [hx + 0.115, hy + 0.035, hz + 0.168], [0.055, 0.065, 0.035], '#191926');
  // prick ears, tall and tilted out
  box(s, [hx - 0.15, hy + 0.20, hz - 0.03], [0.10, 0.17, 0.11], C, { roll: 0.34, pitch: -0.12 });
  box(s, [hx + 0.165, hy + 0.20, hz - 0.04], [0.10, 0.17, 0.11], C, { roll: -0.34, pitch: -0.12 });
  // front legs: thin, straight, planted well forward of the chest
  box(s, [x - 0.13, gy + 0.22, z + 0.36], [0.105, 0.44, 0.11], C);
  box(s, [x + 0.12, gy + 0.22, z + 0.35], [0.105, 0.44, 0.11], C);
  box(s, [x - 0.13, gy + 0.035, z + 0.40], [0.125, 0.07, 0.18], L);
  box(s, [x + 0.12, gy + 0.035, z + 0.39], [0.125, 0.07, 0.18], L);
  // tail: low, then a curl up at the tip, off to one side
  box(s, [x + 0.33, gy + 0.22, z - 0.30], [0.13, 0.13, 0.42], D, { yaw: -0.95 + sway, pitch: -0.30 });
  box(s, [x + 0.53, gy + 0.40, z - 0.47], [0.12, 0.12, 0.24], D, { yaw: -0.65 + sway, pitch: 0.85 });
}

/** Report the measured layout, so the research notes can quote real pixels. */
export function layoutReport(cam = REF_CAM) {
  const rows = [];
  const add = (name, base, h) => {
    const p = cam.project(base);
    const top = cam.project([base[0], base[1] + h, base[2]]);
    if (!p || !top) { rows.push([name, 'off-camera']); return; }
    rows.push([name, `x=${p[0].toFixed(0)}  baseY=${p[1].toFixed(0)}  topY=${top[1].toFixed(0)}  depth=${p[2].toFixed(1)}  h=${(p[1] - top[1]).toFixed(0)}px`]);
  };
  add('dog', [DOG_AT[0], groundAt(DOG_AT[0], DOG_AT[2]), DOG_AT[2]], DOG_H);
  add('station', [STATION_AT[0], groundAt(STATION_AT[0], STATION_AT[2]), STATION_AT[2]], STATION_H);
  add('lamp', [LAMP_AT[0], groundAt(LAMP_AT[0], LAMP_AT[2]), LAMP_AT[2]], STAGE.lamp.height_m);
  PINES_AT.forEach(([x, , z], i) => add(`pine${i}`, [x, groundAt(x, z), z], 4.6));
  rows.push(['px/unit', `dog ${pixelsPerUnit(cam, STAGE.dog.depth).toFixed(0)}  station ${pixelsPerUnit(cam, STAGE.station.depth).toFixed(0)}`]);
  return rows;
}
