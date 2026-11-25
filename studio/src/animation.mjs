/**
 * animation.mjs — Round 5: procedural locomotion and performance.
 *
 * Design rule: every pose is a PURE FUNCTION of time, not a keyframe list.
 * That means any frame can be rendered in isolation (important for a
 * frame-addressable renderer), the cost is constant, and cycles loop seamlessly
 * by construction because the phase wraps.
 *
 * Legs are driven by IK against foot targets, not by joint angles. Setting
 * thigh/shin rotations by hand produces feet that slide, sink and scuff — the
 * classic "skating" look. With IK the foot target is planted on the ground
 * during stance and lifted during swing, so contact is exact by construction.
 *
 * Corrections learned while building this:
 *   - the knee pole must point FORWARD (+Z) or the knee bends backwards
 *   - hips must bob at 2x the stride frequency, not 1x
 *   - the arms counter-swing the legs; same-phase arms look like a marionette
 *   - the head must counter-rotate the chest or the whole figure looks seasick
 */

import { v3, twoBoneIK3, aimBone, clamp, lerp, smoothstep } from './character3d.mjs';

/* -------------------------------------------------------------------- easing */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};

/** Deterministic 1D noise, for handheld camera drift and idle sway. */
export function noise1(x, seed = 0) {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
/** Band-limited smooth noise: sum of three octaves, so it drifts instead of buzzing. */
export function smoothNoise(x, seed = 0) {
  return noise1(x, seed) * 0.6 + noise1(x * 0.5 + 11, seed + 3) * 0.3 + noise1(x * 0.25 + 23, seed + 7) * 0.1;
}

/* ------------------------------------------------------------------ leg IK */

/**
 * Plant one leg so its foot sits at `foot` (world) with the sole flat or rolled
 * by `pitch`. Returns nothing; mutates the skeleton's bone rotations.
 *
 * The thigh and shin rotations are solved by aiming each bone at the IK result,
 * which keeps this independent of the hand-authored rest pose.
 */
function solveLeg(sk, side, foot, { pitch = 0, poleZ = 1 } = {}) {
  const thighName = `thigh${side}`, shinName = `shin${side}`, footName = `foot${side}`;
  const thigh = sk.bones.get(thighName);
  const l1 = thigh.len, l2 = sk.bones.get(shinName).len;
  const hip = sk.pos(thighName);
  const ankleTarget = [foot[0], foot[1] + 0.055, foot[2] - 0.02];

  const ik = twoBoneIK3(hip, ankleTarget, l1, l2, [0, 0, poleZ]);
  // aim thigh at the knee, then shin at the ankle
  aimBone(sk, thighName, v3.norm(v3.sub(ik.mid, hip)), 0, -1);
  sk.solve();
  const knee = sk.pos(shinName);
  aimBone(sk, shinName, v3.norm(v3.sub(ik.end, knee)), 0, -1);
  sk.solve();
  // foot: flat on the ground, plus a roll
  sk.set(footName, pitch, 0, 0);
  sk.solve();
}

/**
 * Place a hand at a world-space target with two-bone IK, exactly like the legs.
 *
 * Driving arms by joint angle was a dead end: shoulder, upper-arm and forearm
 * rotations compose, so a "guard" pose of three negative pitches put the fist
 * above the head. With a target the animator says where the hand IS, which is
 * the only quantity that matters for a punch, a wave or a grab.
 *
 * `pole` picks the elbow direction; for a human that is out and back.
 */
function solveArm(sk, side, target, { pole = [0.4, -0.6, -0.5] } = {}) {
  const upperName = `upperArm${side}`, foreName = `foreArm${side}`;
  const upper = sk.bones.get(upperName);
  const l1 = upper.len, l2 = sk.bones.get(foreName).len;
  const shoulder = sk.pos(upperName);
  const wristTarget = target;
  const ik = twoBoneIK3(shoulder, wristTarget, l1, l2, pole);
  aimBone(sk, upperName, v3.norm(v3.sub(ik.mid, shoulder)), 0, -1);
  sk.solve();
  const elbow = sk.pos(foreName);
  aimBone(sk, foreName, v3.norm(v3.sub(ik.end, elbow)), 0, -1);
  sk.solve();
}

/* ------------------------------------------------------------------- walks */

/**
 * Tuning for locomotion. These numbers are in metres/radians and were set by
 * looking at the rendered result, not guessed from a table.
 */
export const GAIT = {
  walk: { stride: 0.30, freq: 1.55, lift: 0.055, bob: 0.020, lean: 0.05, armSwing: 0.55, kneePole: 1 },
  run:  { stride: 0.62, freq: 2.60, lift: 0.135, bob: 0.055, lean: 0.18, armSwing: 1.10, kneePole: 1 },
};

/**
 * A repeating gait. `phase` in cycles (0..1 = one full stride, two steps).
 *
 * Foot trajectory: during stance (the first 50% of that leg's cycle) the foot
 * is PLANTED and travels backwards relative to the body at exactly stride
 * speed — that is what makes a walk look like it has ground contact. During
 * swing it arcs forward and up.
 */
export function poseGait(fig, phase, {
  mode = 'walk', speed = 1, accent = 0, turn = 0,
} = {}) {
  const sk = fig.skeleton;
  const g = GAIT[mode] || GAIT.walk;
  const stanceFrac = mode === 'run' ? 0.38 : 0.55;
  const p = ((phase % 1) + 1) % 1;

  // vertical bob: two dips per stride, lowest at each foot plant
  const bob = -Math.abs(Math.sin(p * Math.PI * 2)) * g.bob;
  // lateral weight shift toward the planted foot
  const sway = Math.sin(p * Math.PI * 2) * 0.022;

  sk.zero();
  sk.bones.get('hips').offset = [sway, 0.80 + bob, 0];
  sk.set('hips', g.lean * 0.25, Math.sin(p * Math.PI * 2) * 0.10, -sway * 0.9);
  sk.set('spine', g.lean * 0.5, -Math.sin(p * Math.PI * 2) * 0.16, 0);
  sk.set('chest', g.lean * 0.35, -Math.sin(p * Math.PI * 2) * 0.12, 0);
  sk.set('neck', -g.lean * 0.8, Math.sin(p * Math.PI * 2) * 0.05, 0);
  sk.set('head', -g.lean * 0.6 + Math.sin(p * Math.PI * 4) * 0.012,
         Math.sin(p * Math.PI * 2) * 0.04 + turn, 0);
  sk.solve([0, 0, 0]);

  // legs
  for (const side of ['L', 'R']) {
    const ph = side === 'L' ? p : (p + 0.5) % 1;
    const inStance = ph < stanceFrac;
    // fore-aft position of the foot: forward at plant, back at toe-off
    let z, y, pitch;
    if (inStance) {
      const t = ph / stanceFrac;                      // 0 plant .. 1 toe-off
      z = (0.5 - t) * g.stride;
      y = 0;
      // heel strike -> flat -> heel lift
      pitch = lerp(-0.16, 0.0, smoothstep(0, 0.25, t)) + smoothstep(0.7, 1, t) * 0.50;
    } else {
      const t = (ph - stanceFrac) / (1 - stanceFrac); // 0 toe-off .. 1 next plant
      const s = ease.inOutQuad(t);
      z = (-0.5 + s) * g.stride;
      y = Math.sin(t * Math.PI) * g.lift;
      pitch = lerp(0.45, -0.16, ease.inOutQuad(Math.min(1, t * 1.6)));
    }
    const x = side === 'L' ? 0.085 : -0.085;
    solveLeg(sk, side, [x, y, z], { pitch, poleZ: g.kneePole });
  }

  // arms counter-swing the legs. Targets, not angles: the hand follows an arc
  // that is forward when the opposite leg is forward.
  const swing = Math.sin(p * Math.PI * 2);
  const amp = g.armSwing * (1 + accent * 0.3);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const ph = s > 0 ? -swing : swing;
    const shoulder = sk.pos(`upperArm${side}`);
    // an arc in front of the body, tighter for a run
    const reach = mode === 'run' ? 0.34 : 0.26;
    const handTarget = [
      shoulder[0] + s * (0.05 + amp * 0.02),
      shoulder[1] - 0.36 + Math.abs(ph) * 0.10 + (mode === 'run' ? 0.10 : 0),
      ph * reach,
    ];
    solveArm(sk, side, handTarget, { pole: [s * 0.5, -0.5, -0.7] });
    sk.set(`shoulder${side}`, ph * amp * 0.12, 0, s * 0.05);
    sk.set(`hand${side}`, ph * 0.2, 0, 0);
  }
  // small vertical head bob so the walk has weight
  sk.add('head', Math.sin(p * Math.PI * 4) * 0.01, 0, 0);
  sk.solve([0, 0, 0]);
  return sk;
}

/** Locomotion speed in m/s that matches the gait, for foot-lock to the world. */
export function gaitSpeed(mode = 'walk') {
  const g = GAIT[mode] || GAIT.walk;
  // one cycle = two steps, each step advances `stride`
  return g.stride * 2 * g.freq;
}

/* -------------------------------------------------------------------- jumps */

/**
 * A anticipation -> launch -> apex -> land -> recover arc, 0..1 over `dur`.
 * Returns the root height offset so the scene can move the camera with the
 * character, and the pose is set on the skeleton.
 */
export function poseJump(fig, t01) {
  const sk = fig.skeleton;
  const t = clamp(t01, 0, 1);
  sk.zero();
  // phases: crouch 0..0.18, launch 0.18..0.30, air 0.30..0.72, land 0.72..0.84, recover
  const crouch = smoothstep(0, 0.18, t) * (1 - smoothstep(0.18, 0.30, t));
  const airT = smoothstep(0.18, 0.30, t) * (1 - smoothstep(0.72, 0.84, t));
  const airPhase = clamp((t - 0.30) / 0.42, 0, 1);
  const height = airT > 0 ? Math.sin(airPhase * Math.PI) * 0.62 : 0;
  const land = smoothstep(0.70, 0.84, t) * (1 - smoothstep(0.84, 1.0, t));

  const hipY = 0.80 - crouch * 0.20 - land * 0.16 + height;
  sk.bones.get('hips').offset = [0, hipY, 0];
  sk.set('hips', crouch * 0.35 + land * 0.28 - airT * 0.10, 0, 0);
  sk.set('spine', crouch * 0.22, 0, 0);
  sk.set('chest', crouch * 0.18 - airT * 0.15, 0, 0);
  sk.set('neck', -crouch * 0.25 + airT * 0.10, 0, 0);
  sk.set('head', -crouch * 0.18, 0, 0);
  sk.solve([0, 0, 0]);

  // legs: bend deep on the crouch, tuck in the air, absorb on landing
  for (const side of ['L', 'R']) {
    const x = side === 'L' ? 0.085 : -0.085;
    const tuck = airT * 0.30 * Math.sin(airPhase * Math.PI);
    const footZ = -crouch * 0.05 + tuck * 0.35 - land * 0.04;
    const footY = Math.max(0, height - 0.02 + tuck * 0.45 - crouch * 0.02);
    solveLeg(sk, side, [x, footY, footZ], { pitch: -crouch * 0.2 + tuck * 0.6 + land * 0.15 });
  }
  // arms: down on the crouch, up and forward at the apex, wide on landing
  const chestY = sk.pos('chest')[1];
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const raise = airT * 0.42 - crouch * 0.05 + land * 0.10;
    const handTarget = [
      s * (0.26 + airT * 0.10 + land * 0.12),
      chestY + 0.05 + raise,
      -0.10 + airT * 0.18 - crouch * 0.10,
    ];
    solveArm(sk, side, handTarget, { pole: [s * 0.7, -0.3, -0.6] });
  }
  sk.solve([0, 0, 0]);
  return { height, crouch, land, air: airT };
}

/* ------------------------------------------------------------------ impacts */

/**
 * An impact: anticipation, strike, recoil, settle. Drives the whole body plus a
 * head snap. Used for the action shot; `hit` is the frame the contact lands.
 */
export function poseImpact(fig, t01, { from = 'right', power = 1 } = {}) {
  const sk = fig.skeleton;
  const t = clamp(t01, 0, 1);
  const s = from === 'right' ? 1 : -1;
  sk.zero();

  const wind = smoothstep(0.0, 0.22, t) * (1 - smoothstep(0.22, 0.30, t));      // anticipation
  const strike = smoothstep(0.28, 0.34, t);
  const recoil = smoothstep(0.34, 0.50, t) * (1 - smoothstep(0.62, 1.0, t));    // absorb
  const settle = smoothstep(0.62, 1.0, t);

  // the torso twists into the punch then whips back
  const twist = -wind * 0.20 * s + strike * (1 - settle) * 0.32 * s - recoil * 0.22 * s;
  const hipY = 0.80 - wind * 0.05 - recoil * 0.06 * power;

  sk.bones.get('hips').offset = [0, hipY, 0];
  sk.set('hips', wind * 0.10, twist * 0.55, 0);
  sk.set('spine', wind * 0.06 - recoil * 0.20 * power, twist * 0.85, 0);
  sk.set('chest', -wind * 0.05 - recoil * 0.22 * power, twist * 1.10, 0);
  // Head follows THROUGH the strike, arriving a few frames after the fist. The
  // first version snapped the head backwards, which reads as being hit rather
  // than hitting. In this rig a positive X rotation pitches the face down, so
  // follow-through is positive and the recoil (negative) only appears on the
  // tail of the settle.
  const snap = smoothstep(0.30, 0.38, t) * (1 - smoothstep(0.52, 0.86, t));
  const tail = smoothstep(0.62, 1.0, t) * (1 - smoothstep(0.94, 1.0, t));
  sk.set('neck', snap * 0.22 * power - tail * 0.10, twist * 0.30, -snap * 0.10 * power * s);
  sk.set('head', snap * 0.14 * power - tail * 0.06, twist * 0.20, -snap * 0.12 * power * s);
  sk.solve([0, 0, 0]);

  // legs: wide braced stance, back leg loaded
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 0.085 : -0.085;
    const back = side === (from === 'right' ? 'L' : 'R');
    const z = back ? -0.16 : 0.10;
    solveLeg(sk, side, [sx * 1.5 + s * 0.02, 0, z], { pitch: 0 });
  }
  // the punching arm: a fist that travels from beside the ribs to arm's length
  const armSide = from === 'right' ? 'R' : 'L';
  const as = armSide === 'R' ? -1 : 1;
  const punch = smoothstep(0.24, 0.32, t) * (1 - smoothstep(0.52, 0.86, t));
  const windup = wind * (1 - strike);
  const chestY = sk.pos('chest')[1];
  const fistTarget = [
    as * (0.10 + windup * 0.10) + punch * as * 0.10,
    chestY - 0.02 + windup * 0.06 - punch * 0.02,
    -0.16 - windup * 0.10 + punch * 0.62,          // -Z is forward, away from camera
  ];
  solveArm(sk, armSide, fistTarget, { pole: [as * 0.6, -0.4, -0.7] });
  // guard arm stays tucked in front of the face
  const guard = armSide === 'R' ? 'L' : 'R';
  const gs = guard === 'L' ? 1 : -1;
  const guardTarget = [gs * 0.12, chestY + 0.24 - recoil * 0.06, 0.14 + recoil * 0.10];
  solveArm(sk, guard, guardTarget, { pole: [gs * 0.7, -0.5, 0.2] });
  sk.solve([0, 0, 0]);
  return { twist, punch, snap };
}

/* --------------------------------------------------------------------- idle */

/** Breathing, weight shift and a slow head drift. The base layer under any pose. */
export function poseIdle(fig, t, { energy = 1 } = {}) {
  const sk = fig.skeleton;
  const breath = Math.sin(t * 1.5) * 0.006 * energy;
  const shift = Math.sin(t * 0.42) * 0.012 * energy;
  sk.bones.get('hips').offset = [shift, 0.80 + breath, 0];
  sk.set('hips', 0, shift * 0.6, -shift * 0.8);
  sk.set('spine', breath * 0.8, shift * 0.5, 0);
  sk.set('chest', -breath * 1.4, shift * 0.4, 0);
  sk.set('neck', breath * 0.9, 0, 0);
  sk.set('head', Math.sin(t * 0.31) * 0.04, Math.sin(t * 0.23) * 0.09, Math.sin(t * 0.19) * 0.03);
  sk.solve([0, 0, 0]);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = sk.pos(`upperArm${side}`);
    solveArm(sk, side, [
      shoulder[0] + s * 0.03,
      shoulder[1] - 0.40 + Math.sin(t * 1.5 + (s > 0 ? 0 : 0.5)) * 0.008,
      0.06 + Math.sin(t * 0.6 + s) * 0.01,
    ], { pole: [s * 0.5, -0.4, -0.7] });
  }
  for (const side of ['L', 'R']) {
    solveLeg(sk, side, [side === 'L' ? 0.085 : -0.085, 0, 0.0], { pitch: 0 });
  }
  return sk;
}

/* ------------------------------------------------------------------- camera */

/**
 * Handheld camera shake. Layered frequencies with different seeds, so it never
 * repeats and never looks like a sine wave. `trauma` (0..1) is squared so small
 * values are gentle and large values are violent — the standard trick from
 * games, because linear trauma feels mushy near zero.
 */
export function cameraShake(t, trauma = 0.5, { freq = 9, seed = 1 } = {}) {
  const k = trauma * trauma;
  return {
    x: smoothNoise(t * freq, seed) * 0.022 * k,
    y: smoothNoise(t * freq * 0.83, seed + 5) * 0.018 * k,
    roll: smoothNoise(t * freq * 0.6, seed + 9) * 0.020 * k,
    // a tiny z push reads as a jolt through the lens
    z: smoothNoise(t * freq * 1.3, seed + 13) * 0.010 * k,
  };
}

/** Inverse of `trauma` decay, for hit reactions: spikes then decays. */
export function traumaDecay(t, decay = 2.6) {
  return Math.exp(-t * decay);
}

/**
 * A camera move interpolated between two framings with easing, plus shake.
 * `eye`, `target` and `fov` all interpolate, which is what makes a move feel
 * like a real camera rather than a slide.
 */
export function cameraMove(a, b, t, { easeFn = ease.inOutCubic, shake = null } = {}) {
  const k = easeFn(clamp(t, 0, 1));
  const eye = v3.lerp(a.eye, b.eye, k);
  const target = v3.lerp(a.target, b.target, k);
  const fov = lerp(a.fov, b.fov, k);
  if (shake) {
    eye[0] += shake.x; eye[1] += shake.y; eye[2] += shake.z;
  }
  return { eye, target, fov, roll: shake ? shake.roll : 0 };
}

/** Blink schedule: deterministic, ~2-6 s apart, 120 ms closed. */
export function blinkAt(t, seed = 3) {
  const period = 2.6 + (noise1(Math.floor(t / 2.6), seed) + 1) * 1.6;
  const local = t % period;
  const dur = 0.12;
  if (local > dur) return 0;
  const u = local / dur;
  return Math.sin(u * Math.PI);
}
