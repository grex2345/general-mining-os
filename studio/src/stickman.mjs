/**
 * stickman.mjs — Round 7: the MASTER PROMPT stickman style, natively.
 *
 * Style bible (ANIMATION MASTER ENGINE.pdf, both workflows, verbatim rules):
 *   - Head: large, slightly imperfect hand-drawn circle, PURE WHITE fill, thick
 *     dark navy-black outline (#2c1a2e), line weight slightly uneven like a pen.
 *   - Eyes: white circles + black dot pupils, OR half-closed black curved marks.
 *   - Eyebrows: bold curved black lines; angle carries the emotion.
 *   - Mouth: small curved black line / open circle / teeth grin. Minimal.
 *   - NO nose. Ever. NO shading on the face. Black marks on white only.
 *   - Body: the OUTFIT is a simple coloured blob (tunic oval, suit rect, dress bell).
 *   - Arms/legs: thin BLACK stick lines; hands = small round BLACK dots; NO shoes.
 *   - Overall: hand-drawn with a thick marker. Imperfect, sketchy, NOT geometric.
 *
 * This is additive to cartoon.mjs (bean style). It reuses its colour/rng/IK helpers
 * but draws to a different style contract. Deterministic: seed + pose => pixels.
 *
 * Convention: figure height = 1.0, origin between feet, +y is DOWN on canvas.
 * The caller translates/scales; draw() works in unit space multiplied by h.
 */
import { rng, mix, ik2 } from './cartoon.mjs';

export const INK = '#2c1a2e';           // the master prompt's plum-navy ink
export const STICK = '#1a1a2e';         // limbs: near-black
export const HEAD_WHITE = '#ffffff';    // pure stark white, never cream

/* ------------------------------------------------------------------ paths */

/** Hand-drawn wobbly circle: radius modulated by seeded low-freq noise. */
export function headBlob(ctx, cx, cy, r, seed = 1, wob = 0.045) {
  const rnd = rng(seed);
  const n = 26;
  const offs = [];
  for (let i = 0; i < n; i++) offs.push(1 + (rnd() * 2 - 1) * wob);
  // smooth the offsets so it reads hand-drawn, not spiky
  const sm = offs.map((v, i) => (offs[(i + n - 1) % n] + v * 2 + offs[(i + 1) % n]) / 4);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r * sm[i % n];
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Uneven pen stroke: stroke the current path twice with a tiny offset. */
function penStroke(ctx, w, seed = 1) {
  const rnd = rng(seed);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.save();
  ctx.translate((rnd() - 0.5) * w * 0.35, (rnd() - 0.5) * w * 0.35);
  ctx.lineWidth = w * 0.55;
  ctx.globalAlpha *= 0.55;
  ctx.stroke();
  ctx.restore();
}

/** Outfit blob: the body shape IS the costume. kind: oval|rect|bell|haori|robe. */
export function outfitPath(ctx, cx, topY, w, hgt, kind = 'oval', seed = 2) {
  const rnd = rng(seed);
  const j = () => (rnd() * 2 - 1) * w * 0.03;   // hand-drawn jitter
  ctx.beginPath();
  if (kind === 'rect') {
    ctx.moveTo(cx - w / 2 + j(), topY + j());
    ctx.lineTo(cx + w / 2 + j(), topY + j());
    ctx.lineTo(cx + w / 2 + j(), topY + hgt + j());
    ctx.lineTo(cx - w / 2 + j(), topY + hgt + j());
  } else if (kind === 'bell') {
    ctx.moveTo(cx - w * 0.30 + j(), topY);
    ctx.quadraticCurveTo(cx + j(), topY - hgt * 0.08, cx + w * 0.30 + j(), topY);
    ctx.quadraticCurveTo(cx + w * 0.62, topY + hgt * 0.7, cx + w * 0.55 + j(), topY + hgt);
    ctx.quadraticCurveTo(cx, topY + hgt * 1.06, cx - w * 0.55 + j(), topY + hgt);
    ctx.quadraticCurveTo(cx - w * 0.62, topY + hgt * 0.7, cx - w * 0.30 + j(), topY);
  } else if (kind === 'haori') {
    // open jacket: shoulders wider than hem, slight A-line, sleeve bumps
    ctx.moveTo(cx - w * 0.46 + j(), topY + hgt * 0.06);
    ctx.quadraticCurveTo(cx, topY - hgt * 0.10, cx + w * 0.46 + j(), topY + hgt * 0.06);
    ctx.quadraticCurveTo(cx + w * 0.56, topY + hgt * 0.42, cx + w * 0.44 + j(), topY + hgt);
    ctx.quadraticCurveTo(cx, topY + hgt * 1.05, cx - w * 0.44 + j(), topY + hgt);
    ctx.quadraticCurveTo(cx - w * 0.56, topY + hgt * 0.42, cx - w * 0.46 + j(), topY + hgt * 0.06);
  } else if (kind === 'robe') {
    ctx.moveTo(cx - w * 0.34 + j(), topY);
    ctx.quadraticCurveTo(cx, topY - hgt * 0.06, cx + w * 0.34 + j(), topY);
    ctx.lineTo(cx + w * 0.50 + j(), topY + hgt);
    ctx.quadraticCurveTo(cx, topY + hgt * 1.04, cx - w * 0.50 + j(), topY + hgt);
  } else { // oval / tunic
    ctx.moveTo(cx - w * 0.36 + j(), topY + hgt * 0.10);
    ctx.quadraticCurveTo(cx, topY - hgt * 0.10, cx + w * 0.36 + j(), topY + hgt * 0.10);
    ctx.quadraticCurveTo(cx + w * 0.52, topY + hgt * 0.55, cx + w * 0.38 + j(), topY + hgt * 0.96);
    ctx.quadraticCurveTo(cx, topY + hgt * 1.06, cx - w * 0.38 + j(), topY + hgt * 0.96);
    ctx.quadraticCurveTo(cx - w * 0.52, topY + hgt * 0.55, cx - w * 0.36 + j(), topY + hgt * 0.10);
  }
  ctx.closePath();
}

/* ------------------------------------------------------------------ faces */
/**
 * Expression table. brow: [innerDrop, outerDrop] in eye-radius units (positive =
 * lower/angrier). eye: dot | half | wide | closed | happy. mouth: line|frown|o|grin|teeth|shout.
 */
export const EXPR = {
  neutral:    { eye: 'dot',    brow: [0, 0],       mouth: 'line' },
  determined: { eye: 'half',   brow: [2.2, -1.0],  mouth: 'frown' },
  angry:      { eye: 'dot',    brow: [3.0, -1.6],  mouth: 'shout' },
  focus:      { eye: 'closed', brow: [1.2, 0.4],   mouth: 'line' },
  surprised:  { eye: 'wide',   brow: [-2.6, -2.6], mouth: 'o' },
  happy:      { eye: 'happy',  brow: [-1.6, -1.6], mouth: 'grin' },
  smile:      { eye: 'half',   brow: [-0.8, -0.8], mouth: 'grin' },
  sad:        { eye: 'half',   brow: [-1.8, 1.8],  mouth: 'frown' },
  shout:      { eye: 'wide',   brow: [2.4, -1.2],  mouth: 'shout' },
  grin:       { eye: 'half',   brow: [0.6, -1.4],  mouth: 'teeth' },
  demon:      { eye: 'wide',   brow: [3.2, -2.0],  mouth: 'teeth' },
};

function drawFace(ctx, cx, cy, r, expr, blink, seed, opts = {}) {
  const E = r * 0.16;                     // eye radius unit
  const ex = r * 0.34;                    // eye x offset
  const ey = cy - r * 0.06;               // eye line
  const F = EXPR[expr] || EXPR.neutral;
  const ink = opts.ink || STICK;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;

  const eyeKind = blink > 0.6 ? 'closed' : F.eye;
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    if (eyeKind === 'dot') {
      ctx.beginPath(); ctx.arc(x, ey, E, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = E * 0.30; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + (opts.look || 0) * E * 0.3, ey, E * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.fill();
    } else if (eyeKind === 'wide') {
      ctx.beginPath(); ctx.arc(x, ey, E * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = E * 0.30; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, ey, E * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.fill();
    } else if (eyeKind === 'half') {
      ctx.lineWidth = E * 0.42;
      ctx.beginPath(); ctx.moveTo(x - E, ey); ctx.quadraticCurveTo(x, ey + E * 0.5, x + E, ey); ctx.stroke();
    } else if (eyeKind === 'happy') {
      ctx.lineWidth = E * 0.42;
      ctx.beginPath(); ctx.moveTo(x - E, ey + E * 0.3); ctx.quadraticCurveTo(x, ey - E * 0.8, x + E, ey + E * 0.3); ctx.stroke();
    } else { // closed
      ctx.lineWidth = E * 0.42;
      ctx.beginPath(); ctx.moveTo(x - E, ey); ctx.quadraticCurveTo(x, ey + E * 0.35, x + E, ey); ctx.stroke();
    }
    // eyebrow: bold curved line, angle from expression
    const [inner, outer] = F.brow;
    const by = ey - E * 2.1;
    ctx.lineWidth = E * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - s * E * 0.9, by + inner * E * 0.28);
    ctx.quadraticCurveTo(x, by - E * 0.35 + (inner + outer) * E * 0.14, x + s * E * 1.0, by + outer * E * 0.28);
    ctx.stroke();
  }

  // mouth: minimal black marks, no nose ever
  const my = cy + r * 0.40;
  ctx.lineWidth = E * 0.40;
  const m = F.mouth;
  if (m === 'line') {
    ctx.beginPath(); ctx.moveTo(cx - E * 0.8, my); ctx.quadraticCurveTo(cx, my + E * 0.25, cx + E * 0.8, my); ctx.stroke();
  } else if (m === 'frown') {
    ctx.beginPath(); ctx.moveTo(cx - E * 0.8, my + E * 0.3); ctx.quadraticCurveTo(cx, my - E * 0.3, cx + E * 0.8, my + E * 0.3); ctx.stroke();
  } else if (m === 'grin') {
    ctx.beginPath(); ctx.moveTo(cx - E * 1.1, my - E * 0.2); ctx.quadraticCurveTo(cx, my + E * 1.0, cx + E * 1.1, my - E * 0.2); ctx.stroke();
  } else if (m === 'o') {
    ctx.beginPath(); ctx.arc(cx, my + E * 0.2, E * 0.6, 0, Math.PI * 2); ctx.stroke();
  } else if (m === 'teeth') {
    ctx.beginPath(); ctx.moveTo(cx - E * 1.3, my - E * 0.3); ctx.quadraticCurveTo(cx, my + E * 1.1, cx + E * 1.3, my - E * 0.3); ctx.closePath();
    ctx.fillStyle = ink; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - E * 1.0, my - E * 0.28, E * 2.0, E * 0.42);
  } else if (m === 'shout') {
    ctx.beginPath(); ctx.ellipse(cx, my + E * 0.3, E * 0.8, E * 1.0, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink; ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- outfits */
/**
 * Outfit = body blob + optional hair/scar/earrings/props. The cast for Round 7.
 * checker: ichimatsu pattern (Tanjiro's haori). All colours flat, ink outlines.
 */
export const OUTFITS = {
  tanjiro: {
    body: 'haori', bodyW: 0.30, bodyH: 0.34, fill: '#1f6e43', checker: '#17251d',
    hair: '#7a2f23', hairStyle: 'spiky', scar: true, earrings: true,
    collar: '#20242c', sword: true,
  },
  demon: {
    body: 'oval', bodyW: 0.32, bodyH: 0.36, fill: '#4b2a6b', checker: null,
    hair: '#241a30', hairStyle: 'wild', horns: true, glowEyes: true,
  },
  master: {
    body: 'robe', bodyW: 0.32, bodyH: 0.40, fill: '#5a6b8c', checker: null,
    hair: '#d8d8d4', hairStyle: 'bun', mask: '#c0392b',
  },
  student: {
    body: 'oval', bodyW: 0.28, bodyH: 0.32, fill: '#b8322f', checker: null,
    hair: '#2c2c34', hairStyle: 'short',
  },
};

function drawHair(ctx, cx, cy, r, o, seed) {
  if (!o.hair) return;
  const rnd = rng(seed + 9);
  ctx.save();
  ctx.fillStyle = o.hair;
  ctx.strokeStyle = INK; ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (o.hairStyle === 'spiky') {
    // burgundy spikes sweeping up-right, covering the top ~45% of the head
    const a0 = Math.PI * 1.05, a1 = Math.PI * 2.02;
    ctx.moveTo(cx + Math.cos(a0) * r * 1.02, cy + Math.sin(a0) * r * 1.02);
    const spikes = 7;
    for (let i = 0; i <= spikes; i++) {
      const a = a0 + (a1 - a0) * (i / spikes);
      const rr = r * (1.06 + (i % 2 ? 0.22 : 0.05) + rnd() * 0.06);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      const a2 = a + (a1 - a0) / spikes / 2;
      ctx.lineTo(cx + Math.cos(a2) * r * 0.98, cy + Math.sin(a2) * r * 0.98);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (o.hairStyle === 'wild') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const rr = r * (1.1 + rnd() * 0.3);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.12) * r, cy + Math.sin(a - 0.12) * r);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.lineTo(cx + Math.cos(a + 0.12) * r, cy + Math.sin(a + 0.12) * r);
      ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
  } else if (o.hairStyle === 'bun') {
    ctx.arc(cx, cy - r * 0.9, r * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 1.02, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineTo(cx + r * 0.9, cy - r * 0.1); ctx.quadraticCurveTo(cx, cy - r * 0.5, cx - r * 0.9, cy - r * 0.1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else { // short cap
    ctx.arc(cx, cy - r * 0.05, r * 1.03, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(cx, cy - r * 0.35, cx - r * 0.98, cy - r * 0.0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ sword */
/** Katana drawn from a hand point along an angle. len in figure-height units. */
export function drawKatana(ctx, hx, hy, ang, len, opts = {}) {
  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(ang);
  const w = len * 0.045;
  // handle (dark red wrap)
  ctx.fillStyle = '#5a1f24'; ctx.strokeStyle = INK; ctx.lineWidth = w * 0.5;
  ctx.beginPath(); ctx.rect(-len * 0.22, -w / 2, len * 0.22, w); ctx.fill(); ctx.stroke();
  // guard (gold)
  ctx.fillStyle = '#c9a23a';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.9, w * 1.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // blade: light steel with a white edge highlight, slight curve
  const bl = len * 0.78;
  ctx.beginPath();
  ctx.moveTo(0, -w / 2);
  ctx.quadraticCurveTo(bl * 0.55, -w * 1.4, bl, -w * 0.2);
  ctx.lineTo(bl * 0.97, w * 0.4);
  ctx.quadraticCurveTo(bl * 0.5, w * 0.6, 0, w / 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, '#eef2f6'); g.addColorStop(0.5, '#b9c4cf'); g.addColorStop(1, '#8d99a8');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = w * 0.4; ctx.strokeStyle = INK; ctx.stroke();
  // edge highlight
  ctx.beginPath(); ctx.moveTo(bl * 0.06, -w * 0.35); ctx.quadraticCurveTo(bl * 0.55, -w * 1.1, bl * 0.95, -w * 0.1);
  ctx.lineWidth = w * 0.35; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  if (opts.glow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = w * 1.6; ctx.strokeStyle = `rgba(90,180,255,${opts.glow})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(bl * 0.55, -w * 1.2, bl, -w * 0.1); ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- figure */
/**
 * createStickman(outfitName, seed) -> { draw(ctx, pose) }
 * pose: { x, y, h, facing(1|-1), expr, blink, look, lean, squash,
 *         armL, armR (angles or IK targets), legPhase, walk, swordAng, swordGlow,
 *         idleT, crouch, spin }
 * All lengths in units of h. facing flips the whole figure about x.
 */
export function createStickman(outfitName = 'tanjiro', seed = 1) {
  const o = OUTFITS[outfitName] || OUTFITS.tanjiro;
  const rnd = rng(seed);
  const headR = 0.155;                    // head ~31% of height: large, marker style
  const bodyTop = 0.30, bodyH = o.bodyH, bodyW = o.bodyW;
  const hipY = bodyTop + bodyH;
  const legLen = 1.0 - hipY;              // sticks reach the ground exactly
  const shoulderY = bodyTop + bodyH * 0.16;

  function draw(ctx, p = {}) {
    const h = p.h ?? 300;
    const facing = p.facing ?? 1;
    const squash = p.squash ?? 1;
    const lean = p.lean ?? 0;
    const idleT = p.idleT ?? 0;
    // idle life: breathing bob + tiny sway (MASTER PROMPT: never frozen >4 frames)
    const bob = Math.sin(idleT * 2.1 + seed) * 0.006 + Math.sin(idleT * 0.7) * 0.003;
    const sway = Math.sin(idleT * 0.9 + seed * 2) * 0.012;

    ctx.save();
    ctx.translate(p.x ?? 0, p.y ?? 0);
    ctx.scale(facing * (h / 1) * (2 - squash), h * squash);
    // unit space: y=0 is the crown, y=1 is the feet. p.y marks the FEET, so shift
    // the whole figure up by one height (without this the body draws below ground).
    ctx.translate(0, -1);
    ctx.rotate(lean + sway * 0.3);
    ctx.translate(0, bob);
    if (p.spin) ctx.rotate(p.spin);

    const u = (v) => v;                   // unit space; line widths scale with h via ctx
    const lw = 0.016;                     // stick thickness (thin marker)
    const headCy = bodyTop - headR * 0.72;

    /* legs: black sticks, IK to foot targets, no shoes */
    const phase = p.legPhase ?? 0;
    const walking = p.walk ?? 0;          // 0..1 blend into walk cycle
    const stride = 0.10 * walking, lift = 0.05 * walking;
    ctx.strokeStyle = STICK; ctx.lineCap = 'round'; ctx.lineWidth = lw;
    const hipX = 0.045;
    for (const s of [-1, 1]) {
      const ph = phase + (s > 0 ? 0 : Math.PI);
      const fx = s * hipX + Math.sin(ph) * stride;
      const fy = 0 - Math.max(0, Math.sin(ph + Math.PI / 2)) * lift;
      const knee = ik2([s * hipX, hipY], [fx, fy], legLen * 0.52, legLen * 0.52, s * (walking ? 1 : 0.4));
      ctx.beginPath(); ctx.moveTo(s * hipX, hipY - 0.01);
      ctx.lineTo(knee[0], knee[1]); ctx.lineTo(fx, fy); ctx.stroke();
    }

    /* body: the outfit blob */
    ctx.save();
    outfitPath(ctx, 0, bodyTop, bodyW, bodyH, o.body, seed + 3);
    ctx.fillStyle = o.fill; ctx.fill();
    if (o.checker) {
      ctx.save(); ctx.clip();
      const cs = bodyW * 0.24;
      ctx.fillStyle = o.checker;
      for (let yy = bodyTop - cs; yy < bodyTop + bodyH + cs; yy += cs) {
        for (let xx = -bodyW; xx < bodyW; xx += cs) {
          const ix = Math.round(xx / cs), iy = Math.round((yy - bodyTop) / cs);
          if ((ix + iy) % 2 === 0) ctx.fillRect(xx, yy, cs * 0.98, cs * 0.98);
        }
      }
      ctx.restore();
      // re-declare path for the outline after clip
      outfitPath(ctx, 0, bodyTop, bodyW, bodyH, o.body, seed + 3);
    }
    penStroke(ctx, 0.014, seed + 5);
    // collar hint
    if (o.collar) {
      ctx.fillStyle = o.collar;
      ctx.beginPath(); ctx.moveTo(-bodyW * 0.16, bodyTop + 0.01);
      ctx.lineTo(0, bodyTop + bodyH * 0.22); ctx.lineTo(bodyW * 0.16, bodyTop + 0.01);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* arms: black sticks with dot hands; IK to targets if given */
    const armLen = bodyH * 0.62;
    const shX = bodyW * 0.40;
    const swing = Math.sin(phase) * 0.06 * walking;
    const hands = {};
    for (const s of [-1, 1]) {
      const sh = [s * shX, shoulderY];
      let target;
      const override = s > 0 ? p.armR : p.armL;
      if (override && override.target) target = override.target;
      else {
        const ang = (override?.ang ?? (s > 0 ? 0.5 : -0.5)) + (s > 0 ? swing : -swing);
        target = [sh[0] + Math.sin(ang) * armLen * 0.9, sh[1] + Math.cos(ang) * armLen * 0.9];
      }
      const elbow = ik2(sh, target, armLen * 0.5, armLen * 0.5, s);
      ctx.strokeStyle = STICK; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(target[0], target[1]); ctx.stroke();
      ctx.fillStyle = STICK;
      ctx.beginPath(); ctx.arc(target[0], target[1], 0.022, 0, Math.PI * 2); ctx.fill();
      hands[s > 0 ? 'R' : 'L'] = target;
    }

    /* head: pure white wobbly blob + thick uneven ink outline */
    headBlob(ctx, 0, headCy, headR, seed + 7, 0.05);
    ctx.fillStyle = HEAD_WHITE; ctx.fill();
    penStroke(ctx, 0.020, seed + 11);

    drawHair(ctx, 0, headCy, headR, o, seed);

    // Tanjiro marks: scar + hanafuda earrings (props, not face shading)
    if (o.scar) {
      ctx.save(); ctx.fillStyle = '#b0563f';
      ctx.beginPath(); ctx.ellipse(-headR * 0.55, headCy - headR * 0.42, headR * 0.16, headR * 0.10, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (o.earrings) {
      for (const s of [-1, 1]) {
        const ex = s * headR * 0.92, ey = headCy + headR * 0.30;
        ctx.fillStyle = '#f4f0e6'; ctx.strokeStyle = INK; ctx.lineWidth = 0.006;
        ctx.beginPath(); ctx.rect(ex - 0.012, ey, 0.024, 0.045); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(ex, ey + 0.014, 0.008, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (o.horns) {
      ctx.fillStyle = '#e8e2d4'; ctx.strokeStyle = INK; ctx.lineWidth = 0.008;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * headR * 0.5, headCy - headR * 0.8);
        ctx.lineTo(s * headR * 0.85, headCy - headR * 1.35);
        ctx.lineTo(s * headR * 0.25, headCy - headR * 0.95);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (o.mask) {
      // tengu-style mask prop over the face (the master wears a mask)
      ctx.save();
      ctx.fillStyle = o.mask; ctx.strokeStyle = INK; ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.ellipse(0, headCy + headR * 0.05, headR * 0.72, headR * 0.80, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * headR * 0.3, headCy - headR * 0.1, headR * 0.16, headR * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.moveTo(-headR * 0.2, headCy + headR * 0.45); ctx.quadraticCurveTo(0, headCy + headR * 0.6, headR * 0.2, headCy + headR * 0.45); ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    } else {
      drawFace(ctx, 0, headCy, headR, p.expr || 'neutral', p.blink ?? 0, seed, { look: p.look, ink: o.glowEyes && p.glowEyes ? '#ff5a3c' : STICK });
      if (o.glowEyes && p.glowEyes) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const s of [-1, 1]) {
          const gx = s * headR * 0.34, gy = headCy - headR * 0.06;
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, headR * 0.3);
          g.addColorStop(0, 'rgba(255,90,60,0.8)'); g.addColorStop(1, 'rgba(255,90,60,0)');
          ctx.fillStyle = g; ctx.fillRect(gx - headR * 0.3, gy - headR * 0.3, headR * 0.6, headR * 0.6);
        }
        ctx.restore();
      }
    }

    /* sword in the right hand */
    if (o.sword && p.sword !== false) {
      const hr = hands.R;
      drawKatana(ctx, hr[0], hr[1], p.swordAng ?? -0.9, 0.52, { glow: p.swordGlow ?? 0 });
    }

    ctx.restore();
    return { head: [p.x ?? 0, (p.y ?? 0) + headCy * h], hands };
  }

  return { draw, outfit: o, headR };
}

/** Blink schedule: natural, deterministic (never frozen). */
export function blinkAt(t, seed = 3) {
  const period = 3.1 + (seed % 5) * 0.37;
  const ph = ((t + seed * 0.61) % period) / period;
  if (ph > 0.94) return Math.sin(((ph - 0.94) / 0.06) * Math.PI);
  return 0;
}