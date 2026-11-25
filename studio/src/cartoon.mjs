/**
 * cartoon.mjs — 2D-vector cartoon character engine (v2).
 *
 * Style target: the "bean head, flat vector, self-coloured outline" look of the
 * viral explainer shorts (research/uploads-2026-11-25/image-3.png). Verified
 * techniques carried over from two MIT reference projects:
 *
 *   - cartoon-short-kit rig3d.js  LOOK.flat = MeshToonMaterial with a TWO-STEP
 *     gradient: flat colour plus exactly one hard shadow tone. LOOK.bean scales
 *     the head [0.94, 1.12, 0.94]. Faces are painted onto a canvas texture with
 *     plain 2D calls, driven by a FACE table of 14 expressions using 5 eye kinds
 *     and 11 mouth kinds.
 *   - zach-d-films main.js  aspect-compensated vignette + per-frame grain, and
 *     the rule that lighting is a function of the shot, not a global setting.
 *
 * Why 2D and not the three.js rigs: neither reference can render here (no WebGL,
 * proven in the ledger as `webgl-swiftshader`). Their LOOK.flat style is
 * recoverable natively because it is a 2D drawing problem.
 *
 * Geometry convention: total figure height = 1.0, origin between the feet, Y up
 * is negative. Face features are positioned in fractions of the head half-width
 * so the face stays consistent at any size and any yaw.
 *
 * Deterministic: same seed + same pose => identical pixels.
 */

// ------------------------------------------------------------------ colour
const hex = (c) => {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
/** The single hard shadow tone — never more than one, that is what reads as 2D. */
export const shadeOf = (c, amount = 0.26) => mix(c, '#2a2340', amount);
/** Self-coloured outline: darken the fill, never ink it black. */
export const inkOf = (c, amount = 0.52) => mix(c, '#231d33', amount);

// --------------------------------------------------------------------- rng
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- paths
/**
 * Bean head: cheeks wider than the temples? No — the reference bean is wide at
 * the jaw and rounded at the crown, narrowing slightly toward a soft chin.
 * `egg` pushes width toward the top; `chin` tapers the bottom.
 */
export function beanPath(ctx, cx, cy, rx, ry, { egg = 0.0, chin = 0.62, asym = 0 } = {}) {
  const k = 0.5523;
  const topW = rx * (1 + egg * 0.16);
  const lowW = rx * chin;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + topW * k, cy - ry, cx + topW, cy - ry * k, cx + topW, cy);
  // right cheek, bulging slightly outward below the eye line
  ctx.bezierCurveTo(cx + topW * 1.02, cy + ry * 0.44, cx + lowW * 1.14 + asym * rx, cy + ry * 0.74, cx + lowW * 0.62, cy + ry * 0.95);
  ctx.bezierCurveTo(cx + lowW * 0.24, cy + ry * 1.05, cx - lowW * 0.24, cy + ry * 1.05, cx - lowW * 0.62, cy + ry * 0.95);
  ctx.bezierCurveTo(cx - lowW * 1.14 + asym * rx, cy + ry * 0.74, cx - topW * 1.02, cy + ry * 0.44, cx - topW, cy);
  ctx.bezierCurveTo(cx - topW, cy - ry * k, cx - topW * k, cy - ry, cx, cy - ry);
  ctx.closePath();
}

/** Capsule between two points — every limb segment, so joints never pinch. */
export function capsulePath(ctx, x1, y1, x2, y2, r1, r2 = r1) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

/** Fill + self-coloured outline in one call: the house rule, applied everywhere. */
export function paint(ctx, colour, { outline = true, width = 1 } = {}) {
  ctx.fillStyle = colour;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = inkOf(colour);
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// ------------------------------------------------------------------- faces
/**
 * Expression table. `brow: [inner, outer]` in head-units, positive = lower.
 * Eye kinds: lid | happy | squeeze | shock | dot.  Mouths: see MOUTHS.
 * This mirrors the reference kit's FACE table shape, independently authored.
 */
export const FACES = {
  neutral:   { eye: ['lid', 'lid'],         brow: [0, -0.6],  mouth: 'dash' },
  happy:     { eye: ['happy', 'happy'],     brow: [-2.2, -2.2], mouth: 'grin' },
  surprised: { eye: ['shock', 'shock'],     brow: [-3.2, -3.2], mouth: 'o' },
  angry:     { eye: ['lid', 'lid'],         brow: [3.4, -2.6], mouth: 'frown' },
  confused:  { eye: ['lid', 'dot'],         brow: [2.0, -2.4], mouth: 'smirk' },
  sad:       { eye: ['lid', 'lid'],         brow: [-2.4, 2.2], mouth: 'frown' },
  laughing:  { eye: ['squeeze', 'squeeze'], brow: [-2.4, -2.4], mouth: 'laugh' },
  thinking:  { eye: ['lid', 'lid'],         brow: [1.4, -1.6], mouth: 'dash' },
  wow:       { eye: ['shock', 'shock'],     brow: [-3.2, -3.2], mouth: 'teeth' },
};

/** eye radius ~ 0.155 rx ; all features derive from `E` (eye radius in px). */
function drawEye(ctx, kind, x, y, E, side, { look = 0, skin = '#e8b48c', lid = 0 } = {}) {
  const ink = inkOf(skin, 0.70);
  const lw = Math.max(1.2, E * 0.20);
  ctx.save();
  ctx.lineCap = 'round';

  if (kind === 'happy') {
    ctx.beginPath();
    ctx.arc(x, y + E * 0.34, E * 0.90, Math.PI * 1.10, Math.PI * 1.90);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.35;
    ctx.stroke();
  } else if (kind === 'squeeze') {
    ctx.beginPath();
    ctx.moveTo(x - side * E * 0.70, y - E * 0.46);
    ctx.lineTo(x + side * E * 0.55, y);
    ctx.lineTo(x - side * E * 0.70, y + E * 0.46);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.35;
    ctx.stroke();
  } else if (kind === 'dot') {
    ctx.beginPath();
    ctx.arc(x, y, E * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  } else if (kind === 'shock') {
    ctx.beginPath();
    ctx.ellipse(x, y, E * 0.98, E * 1.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf7f2';
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + look * E * 0.26, y + E * 0.04, E * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2233';
    ctx.fill();
  } else {
    // 'lid' — open eye: sclera, pupil, catchlight, and a lid that can close
    const open = 1 - lid * 0.94;
    ctx.beginPath();
    ctx.ellipse(x, y, E * 0.84, E * 1.00 * open, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf7f2';
    ctx.fill();
    if (open > 0.22) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + look * E * 0.24, y + E * 0.02, E * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2233';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look * E * 0.24 - E * 0.13, y - E * 0.12, E * 0.105, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - E * 0.82, y);
      ctx.lineTo(x + E * 0.82, y);
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBrow(ctx, x, y, E, side, inner, outer, colour) {
  const half = E * 1.30;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - side * half, y + outer * E * 0.42);
  ctx.quadraticCurveTo(x, y + ((inner + outer) / 2) * E * 0.42 - E * 0.22, x + side * half, y + inner * E * 0.42);
  ctx.strokeStyle = colour;
  ctx.lineWidth = E * 0.44;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

export const MOUTHS = ['dash', 'grin', 'frown', 'o', 'smirk', 'teeth', 'laugh'];

function drawMouth(ctx, kind, x, y, E, { ink = '#3a2d44', tooth = '#fdfbf7', open = '#5b2f3e' } = {}) {
  const w = E * 2.15, h = E * 1.40;
  ctx.save();
  ctx.lineCap = 'round';
  const lw = Math.max(1.4, E * 0.28);
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;

  if (kind === 'grin' || kind === 'laugh' || kind === 'teeth') {
    const depth = (kind === 'laugh' ? 1.75 : kind === 'teeth' ? 1.25 : 1.05) * h;
    const width = (kind === 'laugh' ? 1.18 : 1.0) * w;
    ctx.beginPath();
    ctx.moveTo(x - width, y - h * 0.10);
    ctx.quadraticCurveTo(x, y - h * 0.62, x + width, y - h * 0.10);
    ctx.quadraticCurveTo(x + width * 0.88, y + depth, x, y + depth * 1.04);
    ctx.quadraticCurveTo(x - width * 0.88, y + depth, x - width, y - h * 0.10);
    ctx.closePath();
    ctx.fillStyle = open;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tooth;
    ctx.beginPath();
    ctx.moveTo(x - width, y - h * 0.34);
    ctx.quadraticCurveTo(x, y - h * 0.82, x + width, y - h * 0.34);
    ctx.lineTo(x + width, y + h * 0.26);
    ctx.quadraticCurveTo(x, y - h * 0.16, x - width, y + h * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (kind === 'frown') {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.80, y + h * 0.34);
    ctx.quadraticCurveTo(x, y - h * 0.42, x + w * 0.80, y + h * 0.34);
    ctx.stroke();
  } else if (kind === 'o') {
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.10, w * 0.38, h * 0.60, 0, 0, Math.PI * 2);
    ctx.fillStyle = open;
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.62, y);
    ctx.quadraticCurveTo(x + w * 0.10, y + h * 0.52, x + w * 0.70, y - h * 0.30);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.50, y);
    ctx.quadraticCurveTo(x, y + h * 0.36, x + w * 0.50, y);
    ctx.stroke();
  }
  ctx.restore();
}

// -------------------------------------------------------------- kinematics
/** Two-bone IK: elbow/knee position for a chain reaching `target`. */
export function ik2(root, target, l1, l2, bend = 1) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const dist = Math.hypot(dx, dy);
  const d = Math.max(0.0001, Math.min(dist, l1 + l2 - 0.0001));
  const cos = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const a = Math.acos(cos);
  const base = Math.atan2(dy, dx);
  const ang = base + a * bend;
  return { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 };
}

/**
 * Walk cycle as pure OFFSETS (character units, +x right, +y down).
 * Deliberately offsets rather than absolutes: absolute values bake in one
 * figure size and one stance, which is how hands ended up below the feet.
 */
export function walkCycle(p, { stride = 0.075, lift = 0.045, swing = 0.055 } = {}) {
  const t = p * Math.PI * 2;
  const sL = Math.sin(t), sR = Math.sin(t + Math.PI);
  return {
    footLX: sL * stride, footLY: -Math.max(0, Math.cos(t)) * lift,
    footRX: sR * stride, footRY: -Math.max(0, Math.cos(t + Math.PI)) * lift,
    armLX: -sR * swing, armRX: -sL * swing,
    bob: -Math.abs(Math.sin(t)) * 0.014,
    lean: 0.02,
  };
}

/**
 * Turn a walk phase into absolute IK targets for a specific character, using its
 * own proportions. This is the API a caller should use — `walkCycle` alone is
 * only the underlying data.
 */
export function walkPose(character, phase, opts = {}) {
  // tolerate both walkPose(char, phase) and char.walkPose(phase)
  if (typeof character === 'number') { opts = phase || {}; phase = character; character = null; }
  const { P } = character || { P: DEFAULT_PROPORTIONS };
  const c = walkCycle(phase, opts);
  const stance = P.torsoW * 1.30 + 0.020;
  const handY = P.shoulderY + P.armLen * 0.78;
  return {
    footL: { x: -stance + c.footLX, y: -0.012 + c.footLY },
    footR: { x: stance + c.footRX, y: -0.012 + c.footRY },
    handL: { x: -P.torsoW * 0.86 - 0.045 + c.armLX, y: handY },
    handR: { x: P.torsoW * 0.86 + 0.045 + c.armRX, y: handY },
    bob: c.bob,
    lean: c.lean + (opts.extraLean || 0),
  };
}

// Shared default proportions so walkPose can work without an instance.
export const DEFAULT_PROPORTIONS = {
  headR: 0.205, headRy: 0.225, headY: -0.775, shoulderY: -0.552, hipY: -0.272,
  torsoW: 0.102, armLen: 0.245, legLen: 0.268, eyeDrop: 0.10, eyeSpread: 0.355,
  browLift: 0.30, mouthDrop: 0.50,
};

// --------------------------------------------------------------------- body
export const DEFAULT_OUTFIT = {
  skin: '#eab98f',
  shirt: '#3f7fd4',
  pants: '#2f3550',
  shoe: '#2a2438',
  hair: '#4a3226',
  hairStyle: 'swoop',
};

/**
 * Build a character. `draw()` accepts independent channels so a caller can
 * animate one thing without touching the rest.
 */
export function createCharacter(options = {}) {
  const o = { ...DEFAULT_OUTFIT, ...(options.outfit || {}) };
  const seed = options.seed ?? 7;
  const rand = rng(seed);
  const styleJitter = (rand() - 0.5) * 0.012;

  // Head is ~42% of total height: the strongest single cue of this style.
  const P = {
    headR: 0.205,        // half-width
    headRy: 0.225,       // half-height
    headY: -0.775,       // head centre
    shoulderY: -0.552,
    hipY: -0.272,
    torsoW: 0.102,
    armLen: 0.245,
    legLen: 0.268,
    eyeDrop: 0.10,       // eye line, in ry units below head centre
    eyeSpread: 0.355,    // in rx units
    browLift: 0.30,      // in ry units above the eye line
    mouthDrop: 0.50,     // in ry units below head centre
    ...options.proportions,
  };

  function draw(ctx, {
    x = 0, y = 0, height = 900,
    yaw = 0, expr = 'neutral', blink = 0, look = 0,
    lean = 0, squash = 0, headTilt = 0, headYaw = 0,
    armL = 'down', armR = 'down',
    handL = null, handR = null, footL = null, footR = null,
    shadow = true,
  } = {}) {
    const H = height;
    const F = FACES[expr] || FACES.neutral;
    const yawAbs = Math.min(1, Math.abs(yaw));
    // yaw compresses horizontal extents; front 1.0 -> side ~0.52
    // floor at 0.70: below that a front-view skull squashed horizontally reads
    // as a thin egg, not a profile. A true side view needs its own head path.
    const squish = Math.cos(yawAbs * Math.PI * 0.5) * 0.30 + 0.70;
    const ow = Math.max(1.5, H * 0.0062);

    ctx.save();
    ctx.translate(x, y);

    if (shadow) {
      const R = P.torsoW * H * 2.6;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
      g.addColorStop(0, 'rgba(26,20,36,0.32)');
      g.addColorStop(1, 'rgba(26,20,36,0)');
      ctx.save();
      ctx.scale(1, 0.19);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (squash) ctx.scale(1 + squash * 0.20, 1 - squash * 0.18);
    ctx.rotate(-lean * 0.30);

    const hipY = P.hipY * H;
    const shY = P.shoulderY * H;
    const tw = P.torsoW * H * squish;

    // ---------------------------------------------------------- legs
    const legR = 0.0245 * H * squish;
    // the far leg is a touch darker: two same-coloured tubes otherwise merge into
    // one dark column in the front view
    const legColour = (side) => (side > 0 ? mix(o.pants, '#0f1220', 0.22) : o.pants);
    for (const side of [-1, 1]) {
      const hip = { x: side * tw * 0.44, y: hipY };
      const explicit = side < 0 ? footL : footR;
      const tgt = explicit
        ? { x: explicit.x * H, y: explicit.y * H }
        : { x: side * (tw * 1.30 + 0.020 * H), y: -0.012 * H };
      const knee = ik2(hip, tgt, P.legLen * H * 0.5, P.legLen * H * 0.5, side * 0.5);
      capsulePath(ctx, hip.x, hip.y, knee.x, knee.y, legR, legR * 0.94);
      paint(ctx, legColour(side), { width: ow });
      capsulePath(ctx, knee.x, knee.y, tgt.x, tgt.y, legR * 0.92, legR * 0.84);
      paint(ctx, legColour(side), { width: ow });
      // shoe: a rounded wedge pointing in the facing direction
      const dir = Math.sin(yaw) >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(tgt.x + dir * 0.016 * H * squish, tgt.y - 0.008 * H,
        0.046 * H * squish, 0.019 * H, 0, 0, Math.PI * 2);
      paint(ctx, o.shoe, { width: ow });
    }

    // --------------------------------------------------------- torso
    const torsoPath = () => {
      ctx.beginPath();
      ctx.moveTo(-tw * 0.72, shY);
      ctx.bezierCurveTo(-tw * 1.02, shY - 0.004 * H, tw * 1.02, shY - 0.004 * H, tw * 0.72, shY);
      ctx.bezierCurveTo(tw * 1.10, shY + 0.070 * H, tw * 1.08, hipY - 0.040 * H, tw * 0.92, hipY);
      ctx.bezierCurveTo(tw * 0.42, hipY + 0.020 * H, -tw * 0.42, hipY + 0.020 * H, -tw * 0.92, hipY);
      ctx.bezierCurveTo(-tw * 1.08, hipY - 0.040 * H, -tw * 1.10, shY + 0.070 * H, -tw * 0.72, shY);
      ctx.closePath();
    };
    ctx.save();
    torsoPath();
    ctx.fillStyle = o.shirt;
    ctx.fill();
    ctx.restore();
    ctx.save();
    torsoPath();
    ctx.clip();
    ctx.fillStyle = shadeOf(o.shirt, 0.24);
    ctx.beginPath();
    ctx.ellipse(tw * 1.04, (shY + hipY) * 0.54, tw * 0.60, (hipY - shY) * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    torsoPath();
    ctx.strokeStyle = inkOf(o.shirt);
    ctx.lineWidth = ow;
    ctx.stroke();

    // ---------------------------------------------------------- arms
    // Drawn in two passes: hanging arms sit behind the head, raised arms must be
    // drawn on top of it or the hands disappear behind the skull.
    const raised = (name) => name === 'up' || name === 'wave';
    const drawArms = (pass) => {
    const armWidth = 0.0235 * H * squish;
    const poseTarget = (side) => {
      const name = side < 0 ? armL : armR;
      const sx = side * tw * 0.86, sy = shY + 0.020 * H;
      const L = P.armLen * H;
      const table = {
        down:  { x: sx + side * 0.052 * H, y: sy + L * 0.90 },
        hang:  { x: sx + side * 0.038 * H, y: sy + L * 1.02 },
        hip:   { x: sx + side * 0.058 * H, y: sy + L * 0.66 },
        up:    { x: sx + side * 0.135 * H, y: sy - L * 1.02 },
        point: { x: sx + side * 0.026 * H, y: sy + L * 0.30 },
        wave:  { x: sx + side * 0.150 * H, y: sy - L * 0.92 },
        fist:  { x: sx + side * 0.078 * H, y: sy + L * 0.50 },
      };
      return table[name] || table.hang;
    };
    for (const side of [-1, 1]) {
      const name = side < 0 ? armL : armR;
      if (raised(name) !== (pass === 'front')) return;
      const sh = { x: side * tw * 0.86, y: shY + 0.020 * H };
      const explicit = side < 0 ? handL : handR;
      const tgt = explicit ? { x: explicit.x * H, y: explicit.y * H } : poseTarget(side);
      const elbow = ik2(sh, tgt, P.armLen * H * 0.52, P.armLen * H * 0.52, -side);
      // sleeve, then forearm in a skin-tinted mix, then the mitt
      capsulePath(ctx, sh.x, sh.y, elbow.x, elbow.y, armWidth * 1.12, armWidth);
      paint(ctx, o.shirt, { width: ow });
      capsulePath(ctx, elbow.x, elbow.y, tgt.x, tgt.y, armWidth * 0.96, armWidth * 0.88);
      paint(ctx, o.skin, { width: ow });
      ctx.beginPath();
      ctx.arc(tgt.x, tgt.y, armWidth * 1.30, 0, Math.PI * 2);
      paint(ctx, o.skin, { width: ow });
    }
    };
    drawArms('back');

    // ----------------------------------------------------------- head
    const hx = (yaw + headYaw) * 0.034 * H;
    const hcy = P.headY * H;
    const rx = P.headR * H * squish;
    const ry = P.headRy * H;
    const headRot = headTilt * 0.34;

    ctx.save();
    ctx.translate(0, hcy);
    ctx.rotate(headRot);
    ctx.translate(0, -hcy);

    // ears at eye level
    if (yawAbs < 0.7) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hx + s * rx * 0.96, hcy + ry * 0.10, 0.017 * H * squish, 0.026 * H, 0, 0, Math.PI * 2);
        paint(ctx, o.skin, { width: ow });
      }
    }

    // skull: flat fill, one hard shadow tone, self-coloured outline
    const skull = () => beanPath(ctx, hx, hcy, rx, ry, { egg: 0.10, chin: 0.66, asym: (yaw + headYaw) * 0.06 });
    ctx.save();
    skull();
    ctx.fillStyle = o.skin;
    ctx.fill();
    ctx.restore();
    // (no skin shadow tone: verified against the reference, faces are flat fill)
    skull();
    ctx.strokeStyle = inkOf(o.skin);
    ctx.lineWidth = ow;
    ctx.stroke();

    // hair: clipped to the skull so it always sits on the head
    ctx.save();
    skull();
    ctx.clip();
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    const top = hcy - ry;
    if (o.hairStyle === 'swoop') {
      ctx.moveTo(hx - rx * 1.10, hcy - ry * 0.20);
      ctx.quadraticCurveTo(hx - rx * 1.04, top - ry * 0.08, hx - rx * 0.20, top + ry * 0.10);
      ctx.quadraticCurveTo(hx + rx * 0.42, top + ry * 0.22, hx + rx * 0.70, top + ry * 0.62);
      ctx.quadraticCurveTo(hx + rx * 0.36, top + ry * 0.40, hx - rx * 0.04, top + ry * 0.54);
      ctx.quadraticCurveTo(hx - rx * 0.56, top + ry * 0.72, hx - rx * 0.88, hcy - ry * 0.34);
      ctx.quadraticCurveTo(hx - rx * 1.02, hcy - ry * 0.26, hx - rx * 1.10, hcy - ry * 0.20);
    } else {
      ctx.moveTo(hx - rx * 1.10, hcy - ry * 0.10);
      ctx.quadraticCurveTo(hx - rx * 1.02, top - ry * 0.08, hx, top - ry * 0.02);
      ctx.quadraticCurveTo(hx + rx * 1.02, top - ry * 0.08, hx + rx * 1.10, hcy - ry * 0.10);
      ctx.quadraticCurveTo(hx + rx * 0.46, top + ry * 0.46, hx - rx * 0.46, top + ry * 0.46);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // fringe outline, drawn only along its lower edge
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hx - rx * 0.86, hcy - ry * 0.30);
    ctx.quadraticCurveTo(hx - rx * 0.56, top + ry * 0.70, hx - rx * 0.04, top + ry * 0.54);
    ctx.quadraticCurveTo(hx + rx * 0.36, top + ry * 0.42, hx + rx * 0.70, top + ry * 0.62);
    ctx.strokeStyle = inkOf(o.hair);
    ctx.lineWidth = ow * 0.85;
    ctx.stroke();
    ctx.restore();

    // ----------------------------------------------------------- face
    // All features derive from E (eye radius). This is why the face reads the
    // same at 200px and at 1200px.
    const E = rx * 0.155;
    const eyeY = hcy + ry * P.eyeDrop;
    const spread = rx * P.eyeSpread;
    const slid = (yaw + headYaw) * rx * 0.16;
    const eyeL = { x: hx - spread + slid, y: eyeY };
    const eyeR = { x: hx + spread + slid, y: eyeY };
    const farAlpha = yawAbs > 0.80 ? 0 : 1 - Math.max(0, yawAbs - 0.45) * 0.9;

    drawEye(ctx, F.eye[0], eyeL.x, eyeL.y, E, -1, { look: look + (yaw + headYaw) * 0.6, skin: o.skin, lid: blink });
    if (farAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = farAlpha;
      drawEye(ctx, F.eye[1], eyeR.x, eyeR.y, E, 1, { look: look + (yaw + headYaw) * 0.6, skin: o.skin, lid: blink });
      ctx.restore();
    }

    const browY = eyeY - ry * P.browLift;
    drawBrow(ctx, eyeL.x, browY, E, -1, F.brow[0], F.brow[1], o.hair);
    if (farAlpha > 0.02) drawBrow(ctx, eyeR.x, browY, E, 1, F.brow[1], F.brow[0], o.hair);

    // mouth + a subtle nose tick, which is what stops the face reading as a mask
    const mouthX = hx + (yaw + headYaw) * rx * 0.30;
    const mouthY = hcy + ry * P.mouthDrop;
    ctx.save();
    ctx.globalAlpha = 0.40;
    ctx.beginPath();
    const noseY = (eyeY + mouthY) * 0.5 + ry * 0.01;
    ctx.moveTo(mouthX - E * 0.42, noseY - ry * 0.03);
    ctx.quadraticCurveTo(mouthX - E * 0.06, noseY + ry * 0.045, mouthX + E * 0.30, noseY - ry * 0.012);
    ctx.strokeStyle = inkOf(o.skin, 0.40);
    ctx.lineWidth = Math.max(1.1, E * 0.17);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    drawMouth(ctx, F.mouth, mouthX, mouthY, E, {
      ink: inkOf(o.skin, 0.66),
      open: mix(o.skin, '#4a2130', 0.76),
    });

    ctx.restore(); // head

    drawArms('front');
    ctx.restore(); // character
    void styleJitter;
  }

  return { draw, proportions: P, outfit: o, faces: FACES, walkCycle, ik2,
    walkPose: (phase, opts) => walkPose({ P }, phase, opts) };
}

// Re-export the shared finishing pass so callers only need one import.
export { drawGrade } from './render3d.mjs';
