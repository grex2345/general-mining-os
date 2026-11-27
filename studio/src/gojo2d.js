// gojo2d.js — Round 16 character: a fully articulated anime puppet for Gojo Satoru.
//
// WHY THIS EXISTS
// ---------------
// R15's characters (puppet2d.js) were circle heads with dot eyes, single-line arms
// and no hands. Viewed on a contact sheet the weakness is obvious: no body language,
// no gesture, no facial range beyond a brow angle. This module replaces that with:
//   * an anime head SHAPE (cranium + tapered jaw + chin), not a circle
//   * layered white spiky hair with individual locks and specular streaks
//   * the blindfold AND a Six Eyes mode (iris rings, limbal glow, catchlights)
//   * 2-bone IK arms with real HANDS (thumb + four fingers, per-finger curl)
//   * 2-bone IK legs with knees, ankles and boots
//   * a torso that twists/leans, with the Jujutsu High high-collar jacket
//   * 14 moods driving brow / lid / pupil / mouth independently
//   * viseme mouth shapes for lip-sync
//   * heat flush, sweat, cursed-energy aura, RCT heal glow, focus rings
//
// Drawn on a 900x1400 canvas, used as an upright billboard in the 3D world.
// Browser-side classic script: window.drawGojo(ctx, W, H, look, pose).
(function () {
  const INK = '#0a0b14';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, u) => a + (b - a) * u;

  // ---- mood table: brow angle/height, lid openness, pupil size, mouth curve ----
  // browA: inner-end rotation (rad, + = angry/down-in). lid: 0 closed .. 1 wide.
  const MOOD = {
    calm:     { browA: -0.04, browY: 0.00, lid: 0.86, pupil: 1.00, mouth: 0.10, mOpen: 0.10, cheek: 0.0 },
    smirk:    { browA: -0.14, browY: -0.06, lid: 0.74, pupil: 0.96, mouth: 0.42, mOpen: 0.12, cheek: 0.0 },
    grin:     { browA: -0.10, browY: -0.10, lid: 0.80, pupil: 1.02, mouth: 0.62, mOpen: 0.30, cheek: 0.1 },
    serious:  { browA: 0.10, browY: 0.06, lid: 0.78, pupil: 0.90, mouth: -0.06, mOpen: 0.08, cheek: 0.0 },
    stern:    { browA: 0.20, browY: 0.10, lid: 0.70, pupil: 0.84, mouth: -0.14, mOpen: 0.08, cheek: 0.0 },
    focus:    { browA: 0.06, browY: 0.02, lid: 0.94, pupil: 0.80, mouth: 0.00, mOpen: 0.06, cheek: 0.0 },
    strain:   { browA: 0.26, browY: 0.12, lid: 0.66, pupil: 0.74, mouth: -0.24, mOpen: 0.34, cheek: 0.3 },
    agony:    { browA: 0.34, browY: 0.16, lid: 0.40, pupil: 0.62, mouth: -0.40, mOpen: 0.52, cheek: 0.6 },
    shock:    { browA: -0.20, browY: -0.20, lid: 1.00, pupil: 0.70, mouth: -0.05, mOpen: 0.55, cheek: 0.1 },
    reveal:   { browA: -0.06, browY: -0.04, lid: 1.00, pupil: 1.10, mouth: 0.16, mOpen: 0.14, cheek: 0.0 },
    warm:     { browA: -0.12, browY: -0.04, lid: 0.80, pupil: 1.06, mouth: 0.34, mOpen: 0.10, cheek: 0.2 },
    sad:      { browA: -0.24, browY: 0.04, lid: 0.66, pupil: 1.04, mouth: -0.30, mOpen: 0.06, cheek: 0.0 },
    question: { browA: -0.16, browY: -0.12, lid: 0.90, pupil: 1.04, mouth: 0.12, mOpen: 0.18, cheek: 0.0 },
    deadpan:  { browA: 0.00, browY: 0.02, lid: 0.62, pupil: 0.92, mouth: 0.00, mOpen: 0.05, cheek: 0.0 },
  };

  // 2-bone IK: shoulder->elbow->wrist. bend = +1 elbow out/back, -1 in/front.
  function ik(ax, ay, tx, ty, L1, L2, bend) {
    let dx = tx - ax, dy = ty - ay;
    let d = Math.hypot(dx, dy);
    const maxd = (L1 + L2) * 0.999, mind = Math.abs(L1 - L2) * 1.001;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
    if (d < mind) { const k = mind / Math.max(1e-6, d); dx *= k; dy *= k; d = mind; }
    const a = Math.atan2(dy, dx);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const ang = a + bend * Math.acos(cosA);
    return { ex: ax + Math.cos(ang) * L1, ey: ay + Math.sin(ang) * L1, wx: ax + dx, wy: ay + dy };
  }

  function drawGojo(c, W, H, look, p) {
    c.clearRect(0, 0, W, H);
    const S = H / 1400;
    const cx = W / 2;
    const t = p.t || 0;
    const mood = MOOD[p.mood || 'calm'] || MOOD.calm;
    const skin = look.skin || '#f2d3bd';
    const skinSh = look.skinSh || '#d9ab93';
    const hairC = look.hair || '#f4f6fb';
    const hairSh = look.hairSh || '#c8cede';
    const coat = look.coat || '#1b1f33';
    const coatHi = look.coatHi || '#2e3450';
    const pants = look.pants || '#15182a';
    const boot = look.boot || '#0d0f1a';
    const accent = look.accent || '#5ad8ff';
    const six = p.sixEyes ?? 0;          // 0 blindfold .. 1 Six Eyes revealed
    const blind = (p.blindfold ?? 1) * (1 - six);
    const heat = p.heat ?? 0;            // thermal flush 0..1
    const aura = p.aura ?? 0;            // cursed energy
    const rct = p.rct ?? 0;              // reverse cursed technique heal
    const nerv = p.nerv ?? 0;
    const sweat = p.sweat ?? 0;
    const lean = p.lean ?? 0;            // torso lean, rad
    const twist = p.twist ?? 0;          // -1 .. 1 shoulder twist
    const hTilt = p.headTilt ?? 0;
    const hTurn = p.headTurn ?? 0;       // -1 .. 1
    const air = p.air ?? 0;
    const sq = p.squash ?? 0;
    const breath = Math.sin(t * 1.15) * 0.006 + Math.sin(t * 0.47) * 0.003;
    const walk = p.walk, spd = p.speed ?? 0, moving = walk !== undefined && spd > 0.04;

    c.save();
    if (p.flip) { c.translate(W, 0); c.scale(-1, 1); }
    // whole-body squash / airborne lift / nervous jitter
    const jitter = nerv > 0.02 ? Math.sin(t * 27) * 2.4 * S * nerv : 0;
    c.translate(cx + jitter, H * 0.985);
    c.scale(1 - sq * 0.5, 1 + sq);
    c.translate(-cx, -H * 0.985);
    c.translate(0, -air * 70 * S);
    c.lineCap = 'round'; c.lineJoin = 'round';

    // ---------- skeleton ----------
    const feetY = 1370 * S;
    const hipY = 640 * S + (moving ? Math.abs(Math.sin(walk)) * 14 * S * spd : 0);
    const shoulderY = 292 * S - breath * 260 * S;
    const headCY = 152 * S - breath * 200 * S;
    const headR = 88 * S;
    const shHalf = 208 * S;
    const hipHalf = 132 * S;
    // lean pivots the upper body about the hip
    const leanX = Math.sin(lean) * (hipY - shoulderY);
    const shCX = cx + leanX;
    const headCX = cx + leanX * 1.32 + hTurn * 16 * S;

    // ---------- aura behind everything ----------
    if (aura > 0.01) {
      c.save();
      const g = c.createRadialGradient(cx, 700 * S, 40 * S, cx, 700 * S, 520 * S);
      g.addColorStop(0, `rgba(90,216,255,${0.20 * aura})`);
      g.addColorStop(0.55, `rgba(60,150,255,${0.11 * aura})`);
      g.addColorStop(1, 'rgba(40,90,220,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // rising energy ribbons
      c.strokeStyle = `rgba(150,235,255,${0.30 * aura})`;
      for (let k = 0; k < 5; k++) {
        const ph = (t * 0.5 + k / 5) % 1;
        const x = cx + Math.sin(k * 2.1 + t * 0.8) * 150 * S;
        const y = lerp(1330 * S, 180 * S, ph);
        c.lineWidth = (1 - ph) * 16 * S + 2;
        c.globalAlpha = (1 - ph) * aura;
        c.beginPath(); c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.sin(t * 2 + k) * 30 * S, y - 60 * S, x + Math.sin(t * 1.4 + k) * 18 * S, y - 130 * S);
        c.stroke();
      }
      c.globalAlpha = 1; c.restore();
    }
    if (rct > 0.01) {
      c.save();
      const g = c.createRadialGradient(headCX, headCY, 20 * S, headCX, headCY, 300 * S);
      g.addColorStop(0, `rgba(140,255,190,${0.30 * rct})`);
      g.addColorStop(1, 'rgba(60,220,140,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.restore();
    }

    // ---------- pelvis (connects the legs to the torso) ----------
    c.fillStyle = pants; c.strokeStyle = INK; c.lineWidth = 5 * S;
    c.beginPath();
    c.moveTo(cx - hipHalf * 1.14, hipY - 30 * S);
    c.lineTo(cx + hipHalf * 1.14, hipY - 30 * S);
    c.quadraticCurveTo(cx + hipHalf * 1.06, hipY + 96 * S, cx + hipHalf * 0.30, hipY + 112 * S);
    c.quadraticCurveTo(cx, hipY + 74 * S, cx - hipHalf * 0.30, hipY + 112 * S);
    c.quadraticCurveTo(cx - hipHalf * 1.06, hipY + 96 * S, cx - hipHalf * 1.14, hipY - 30 * S);
    c.closePath(); c.fill(); c.stroke();

    // ---------- legs ----------
    const legTop = hipY;
    for (const s of [-1, 1]) {
      const phase = moving ? Math.sin(walk + (s > 0 ? Math.PI : 0)) : 0;
      const lift = moving ? Math.max(0, Math.cos(walk + (s > 0 ? Math.PI : 0))) : 0;
      const stance = p.stance ?? 1;
      const hx = cx + s * hipHalf * 0.62;
      let fx = cx + s * hipHalf * (0.72 * stance) + (moving ? phase * 120 * S * spd : 0);
      let fy = feetY - (moving ? lift * 60 * S * spd : 0) - air * 30 * S;
      if (p.footR && s > 0) { fx = cx + p.footR[0] * W; fy = feetY - p.footR[1] * H; }
      if (p.footL && s < 0) { fx = cx + p.footL[0] * W; fy = feetY - p.footL[1] * H; }
      const knee = ik(hx, legTop, fx, fy - 26 * S, 340 * S, 330 * S, s > 0 ? -1 : -1);
      // thigh + shin as tapered strokes
      c.strokeStyle = pants; c.lineWidth = 92 * S;
      c.beginPath(); c.moveTo(hx, legTop); c.lineTo(knee.ex, knee.ey); c.stroke();
      c.lineWidth = 70 * S;
      c.beginPath(); c.moveTo(knee.ex, knee.ey); c.lineTo(knee.wx, knee.wy); c.stroke();
      // ink outline
      c.strokeStyle = INK; c.lineWidth = 5 * S;
      c.beginPath(); c.moveTo(hx - 45 * S, legTop); c.lineTo(knee.ex - 34 * S, knee.ey); c.lineTo(knee.wx - 31 * S, knee.wy); c.stroke();
      c.beginPath(); c.moveTo(hx + 45 * S, legTop); c.lineTo(knee.ex + 34 * S, knee.ey); c.lineTo(knee.wx + 31 * S, knee.wy); c.stroke();
      // thigh + shin lit edge
      c.strokeStyle = 'rgba(140,180,235,.13)'; c.lineWidth = 16 * S;
      c.beginPath(); c.moveTo(hx - 26 * S, legTop + 20 * S); c.lineTo(knee.ex - 20 * S, knee.ey - 10 * S); c.stroke();
      c.lineWidth = 11 * S;
      c.beginPath(); c.moveTo(knee.ex - 16 * S, knee.ey + 20 * S); c.lineTo(knee.wx - 14 * S, knee.wy - 20 * S); c.stroke();
      // knee highlight
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 12 * S;
      c.beginPath(); c.moveTo(hx - 12 * S, legTop + 30 * S); c.lineTo(knee.ex - 10 * S, knee.ey - 20 * S); c.stroke();
      // boot
      c.fillStyle = boot; c.strokeStyle = INK; c.lineWidth = 5 * S;
      c.beginPath();
      c.moveTo(knee.wx - 26 * S, knee.wy - 16 * S);
      c.lineTo(knee.wx + 26 * S, knee.wy - 16 * S);
      c.lineTo(knee.wx + 34 * S, fy + 4 * S);
      c.lineTo(knee.wx + 52 * S, fy + 16 * S);
      c.quadraticCurveTo(knee.wx + 54 * S, fy + 26 * S, knee.wx + 40 * S, fy + 26 * S);
      c.lineTo(knee.wx - 30 * S, fy + 26 * S);
      c.quadraticCurveTo(knee.wx - 38 * S, fy + 20 * S, knee.wx - 32 * S, fy + 2 * S);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.10)';
      c.fillRect(knee.wx - 24 * S, knee.wy - 12 * S, 48 * S, 7 * S);
    }

    // ---------- torso (jacket) ----------
    const tw = twist;
    const shL = shCX - shHalf * (1 - tw * 0.22), shR = shCX + shHalf * (1 + tw * 0.22);
    const waistY = 556 * S, wHalf = 138 * S;
    const hemY = hipY + 34 * S, hemHalf = hipHalf * 1.16;
    const torsoPath = () => {
      c.beginPath();
      c.moveTo(shL, shoulderY + 26 * S);
      // taper INWARD (control points inside the shoulder line, not outside)
      c.bezierCurveTo(shL + 26 * S, shoulderY + 150 * S, cx - wHalf - 12 * S, waistY - 110 * S, cx - wHalf, waistY);
      c.quadraticCurveTo(cx - hemHalf - 6 * S, hipY - 20 * S, cx - hemHalf, hemY);
      c.quadraticCurveTo(cx, hemY + 26 * S, cx + hemHalf, hemY);
      c.quadraticCurveTo(cx + hemHalf + 6 * S, hipY - 20 * S, cx + wHalf, waistY);
      c.bezierCurveTo(cx + wHalf + 12 * S, waistY - 110 * S, shR - 26 * S, shoulderY + 150 * S, shR, shoulderY + 26 * S);
      c.quadraticCurveTo(shCX, shoulderY - 22 * S, shL, shoulderY + 26 * S);
      c.closePath();
    };
    const tg = c.createLinearGradient(shL, 0, shR, 0);
    tg.addColorStop(0, coatHi); tg.addColorStop(0.42, coat); tg.addColorStop(1, '#0f1220');
    c.fillStyle = tg; torsoPath(); c.fill();
    c.save(); torsoPath(); c.clip();
    // centre seam + zip
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 5 * S;
    c.beginPath(); c.moveTo(shCX + tw * 20 * S, shoulderY + 10 * S); c.lineTo(cx + tw * 8 * S, hipY + 30 * S); c.stroke();
    c.strokeStyle = 'rgba(180,200,230,.16)'; c.lineWidth = 2.5 * S;
    c.beginPath(); c.moveTo(shCX + tw * 20 * S + 5 * S, shoulderY + 14 * S); c.lineTo(cx + tw * 8 * S + 5 * S, hipY + 26 * S); c.stroke();
    // shoulder / chest folds
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 9 * S;
    for (let k = 0; k < 3; k++) {
      const y = shoulderY + 90 * S + k * 92 * S;
      c.beginPath(); c.moveTo(shL + 22 * S, y); c.quadraticCurveTo(shCX, y + 22 * S, shR - 22 * S, y - 8 * S); c.stroke();
    }
    // rim light on the lit side
    const rl = c.createLinearGradient(shR - 70 * S, 0, shR, 0);
    rl.addColorStop(0, 'rgba(120,190,255,0)'); rl.addColorStop(1, `rgba(150,215,255,${0.20 + aura * 0.3})`);
    c.fillStyle = rl; c.fillRect(shR - 70 * S, shoulderY - 40 * S, 70 * S, hipY - shoulderY + 90 * S);
    if (heat > 0.01) { c.fillStyle = `rgba(255,70,40,${0.16 * heat})`; c.fillRect(0, 0, W, H); }
    if (rct > 0.01) { c.fillStyle = `rgba(120,255,180,${0.12 * rct})`; c.fillRect(0, 0, W, H); }
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 6 * S; torsoPath(); c.stroke();
    // high collar
    c.fillStyle = coatHi; c.strokeStyle = INK; c.lineWidth = 5.5 * S;
    c.beginPath();
    c.moveTo(shCX - 58 * S, shoulderY + 8 * S);
    c.quadraticCurveTo(shCX - 50 * S, shoulderY - 66 * S, shCX - 24 * S, shoulderY - 76 * S);
    c.lineTo(shCX + 24 * S, shoulderY - 76 * S);
    c.quadraticCurveTo(shCX + 50 * S, shoulderY - 66 * S, shCX + 58 * S, shoulderY + 8 * S);
    c.quadraticCurveTo(shCX, shoulderY + 32 * S, shCX - 58 * S, shoulderY + 8 * S);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(160,200,240,.22)'; c.lineWidth = 3 * S;
    c.beginPath(); c.moveTo(shCX - 44 * S, shoulderY - 42 * S); c.quadraticCurveTo(shCX, shoulderY - 24 * S, shCX + 44 * S, shoulderY - 42 * S); c.stroke();

    // ---------- arms + hands ----------
    const armL1 = 232 * S, armL2 = 210 * S;
    function hand(hx, hy, ang, curl, scale) {
      const hs = 42 * S * (scale || 1);
      c.save(); c.translate(hx, hy); c.rotate(ang);
      c.fillStyle = skin; c.strokeStyle = INK; c.lineWidth = 4.5 * S;
      // palm
      c.beginPath(); c.ellipse(0, hs * 0.34, hs * 0.62, hs * 0.78, 0, 0, TAU); c.fill(); c.stroke();
      // four fingers
      for (let f = 0; f < 4; f++) {
        const spread = (f - 1.5) * 0.30;
        const len = hs * (1.02 - Math.abs(f - 1.5) * 0.11) * (1 - curl * 0.55);
        const a = -Math.PI / 2 + spread + curl * 0.85;
        const bx = Math.cos(a) * hs * 0.5, by = hs * 0.30 + Math.sin(a) * hs * 0.5;
        const tx2 = bx + Math.cos(a) * len, ty2 = by + Math.sin(a) * len;
        c.strokeStyle = INK; c.lineWidth = 12 * S; c.beginPath(); c.moveTo(bx, by); c.lineTo(tx2, ty2); c.stroke();
        c.strokeStyle = skin; c.lineWidth = 8.5 * S; c.beginPath(); c.moveTo(bx, by); c.lineTo(tx2, ty2); c.stroke();
      }
      // thumb
      const ta = Math.PI * 0.16 + curl * 0.5;
      c.strokeStyle = INK; c.lineWidth = 13 * S;
      c.beginPath(); c.moveTo(-hs * 0.5, hs * 0.36); c.lineTo(-hs * 0.5 - Math.cos(ta) * hs * 0.8, hs * 0.36 + Math.sin(ta) * hs * 0.8); c.stroke();
      c.strokeStyle = skin; c.lineWidth = 9.5 * S;
      c.beginPath(); c.moveTo(-hs * 0.5, hs * 0.36); c.lineTo(-hs * 0.5 - Math.cos(ta) * hs * 0.8, hs * 0.36 + Math.sin(ta) * hs * 0.8); c.stroke();
      c.restore();
    }
    // draw order: far arm first (behind torso already drawn), then near arm on top
    for (const s of [-1, 1]) {
      const sx = s > 0 ? shR - 12 * S : shL + 12 * S;
      const sy = shoulderY + 34 * S;
      const swing = moving ? Math.sin(walk + (s > 0 ? 0 : Math.PI)) * 90 * S * spd : 0;
      // default resting target: hanging with a slight outward drift + idle sway
      let tx = sx + s * (34 * S + Math.sin(t * 0.8 + s) * 6 * S) + swing;
      let ty = sy + 418 * S + Math.sin(t * 1.05 + s) * 5 * S;
      const pose = p.arms || 'down';
      if (pose === 'up') { tx = sx + s * 40 * S; ty = sy - 250 * S; }
      if (pose === 'wide') { tx = sx + s * 190 * S; ty = sy + 70 * S; }
      if (pose === 'chest') { tx = cx + s * 58 * S; ty = shoulderY + 210 * S; }
      if (pose === 'hips') { tx = cx + s * 168 * S; ty = waistY + 46 * S; }
      if (pose === 'head') { tx = headCX + s * headR * 1.02; ty = headCY + 20 * S; }
      if (pose === 'point' && s > 0) { tx = sx + 262 * S; ty = sy + 26 * S; }
      if (pose === 'palm' && s > 0) { tx = sx + 178 * S; ty = sy + 150 * S; }
      if (pose === 'reach') { tx = sx + s * 120 * S; ty = sy - 190 * S; }
      if (pose === 'cross') { tx = cx - s * 128 * S; ty = shoulderY + 176 * S; }
      if (pose === 'offer') { tx = sx + s * 150 * S; ty = sy + 190 * S; }
      if (pose === 'temple' && s > 0) { tx = headCX + headR * 0.92; ty = headCY - headR * 0.1; }
      // never let a hand leave the canvas
      tx = clamp(tx, 46 * S, W - 46 * S); ty = clamp(ty, 40 * S, H - 60 * S);
      const ikT = s > 0 ? p.armR : p.armL;
      if (ikT) { tx = cx + ikT[0] * W; ty = (1 - ikT[1]) * H; }
      tx += nerv ? Math.sin(t * 23 + s * 2) * 7 * S * nerv : 0;
      ty += nerv ? Math.cos(t * 19 + s) * 5 * S * nerv : 0;
      const bend = (pose === 'hips' || pose === 'wide' || pose === 'offer') ? (s > 0 ? -1 : 1) : (s > 0 ? 1 : -1);
      const a = ik(sx, sy, tx, ty, armL1, armL2, bend);
      // sleeve
      const sleeveW = (pose === 'cross' ? 58 : 74) * S, foreW = (pose === 'cross' ? 48 : 60) * S;
      c.strokeStyle = coat; c.lineWidth = sleeveW;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(a.ex, a.ey); c.stroke();
      c.lineWidth = foreW;
      c.beginPath(); c.moveTo(a.ex, a.ey); c.lineTo(a.wx, a.wy); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 5 * S;
      const nx = -(a.ey - sy), ny = (a.ex - sx); const nl = Math.hypot(nx, ny) || 1;
      for (const q of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx + q * nx / nl * 37 * S, sy + q * ny / nl * 37 * S);
        c.lineTo(a.ex + q * nx / nl * 30 * S, a.ey + q * ny / nl * 30 * S);
        c.stroke();
      }
      // lit top edge so a sleeve separates from the torso behind it
      c.strokeStyle = `rgba(150,195,245,${0.20 + aura * 0.25})`; c.lineWidth = 7 * S;
      c.beginPath();
      c.moveTo(sx - nx / nl * 30 * S, sy - ny / nl * 30 * S);
      c.lineTo(a.ex - nx / nl * 25 * S, a.ey - ny / nl * 25 * S);
      c.lineTo(a.wx - nx / nl * 20 * S, a.wy - ny / nl * 20 * S);
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 9 * S;
      c.beginPath();
      c.moveTo(sx + nx / nl * 30 * S, sy + ny / nl * 30 * S);
      c.lineTo(a.ex + nx / nl * 25 * S, a.ey + ny / nl * 25 * S);
      c.stroke();
      // cuff
      const fa = Math.atan2(a.wy - a.ey, a.wx - a.ex);
      c.save(); c.translate(a.wx, a.wy); c.rotate(fa);
      c.fillStyle = coatHi; c.strokeStyle = INK; c.lineWidth = 4.5 * S;
      c.beginPath(); c.roundRect(-26 * S, -25 * S, 30 * S, 50 * S, 8 * S); c.fill(); c.stroke();
      c.restore();
      const curl = p.curl ?? (pose === 'point' ? 0.75 : pose === 'palm' ? 0.05 : 0.35);
      hand(a.wx + Math.cos(fa) * 20 * S, a.wy + Math.sin(fa) * 20 * S, fa + Math.PI / 2, s > 0 ? (p.curlR ?? curl) : (p.curlL ?? curl), 1);
    }

    // ---------- neck ----------
    c.fillStyle = skinSh; c.strokeStyle = INK; c.lineWidth = 5 * S;
    c.beginPath();
    c.moveTo(headCX - 34 * S, headCY + headR * 0.72);
    c.lineTo(headCX - 30 * S, shoulderY - 40 * S);
    c.lineTo(headCX + 30 * S, shoulderY - 40 * S);
    c.lineTo(headCX + 34 * S, headCY + headR * 0.72);
    c.closePath(); c.fill(); c.stroke();

    // ---------- head ----------
    c.save();
    c.translate(headCX, headCY);
    c.rotate(hTilt);
    const fx = hTurn * 0.30;   // face feature shift for 3/4 turn
    // anime face: wide cranium, tapered jaw, defined chin
    const facePath = () => {
      c.beginPath();
      c.moveTo(-headR * 0.98, -headR * 0.10);
      c.bezierCurveTo(-headR * 1.02, -headR * 0.92, -headR * 0.52, -headR * 1.20, 0, -headR * 1.20);
      c.bezierCurveTo(headR * 0.52, -headR * 1.20, headR * 1.02, -headR * 0.92, headR * 0.98, -headR * 0.10);
      c.bezierCurveTo(headR * 0.95, headR * 0.52, headR * 0.52, headR * 1.06, headR * 0.16 + fx * headR * 0.3, headR * 1.22);
      c.bezierCurveTo(headR * 0.04 + fx * headR * 0.3, headR * 1.28, -headR * 0.04 + fx * headR * 0.3, headR * 1.28, -headR * 0.16 + fx * headR * 0.3, headR * 1.22);
      c.bezierCurveTo(-headR * 0.52, headR * 1.06, -headR * 0.95, headR * 0.52, -headR * 0.98, -headR * 0.10);
      c.closePath();
    };
    const fg = c.createRadialGradient(-headR * 0.34, -headR * 0.42, headR * 0.12, 0, 0, headR * 1.35);
    fg.addColorStop(0, '#ffe6d2'); fg.addColorStop(0.55, skin); fg.addColorStop(1, skinSh);
    c.fillStyle = fg; facePath(); c.fill();
    c.save(); facePath(); c.clip();
    if (heat > 0.01) {
      const hg = c.createRadialGradient(0, headR * 0.3, headR * 0.1, 0, headR * 0.2, headR * 1.2);
      hg.addColorStop(0, `rgba(255,60,40,${0.34 * heat})`); hg.addColorStop(1, `rgba(200,30,20,${0.10 * heat})`);
      c.fillStyle = hg; c.fillRect(-headR * 1.2, -headR * 1.4, headR * 2.4, headR * 2.8);
    }
    if (mood.cheek > 0) {
      c.fillStyle = `rgba(255,120,110,${0.20 * mood.cheek})`;
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * headR * 0.56 + fx * headR * 0.3, headR * 0.34, headR * 0.22, headR * 0.13, 0, 0, TAU); c.fill(); }
    }
    // jaw shadow
    c.fillStyle = 'rgba(150,90,70,.16)';
    c.beginPath(); c.ellipse(fx * headR * 0.3, headR * 1.02, headR * 0.5, headR * 0.24, 0, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 6 * S; facePath(); c.stroke();

    // ----- eyes -----
    const eyeY = headR * 0.10;
    const eyeDX = headR * 0.44;
    const lid = mood.lid * (p.blink ?? 1);
    const lookX = (p.lookX ?? 0) * headR * 0.10;
    const lookY = (p.lookY ?? 0) * headR * 0.07;
    for (const s of [-1, 1]) {
      const ex = s * eyeDX + fx * headR * 0.42;
      const ew = headR * 0.30, eh = headR * 0.24 * lid;
      if (blind < 0.5) {
        // sclera
        c.save();
        c.beginPath(); c.ellipse(ex, eyeY, ew, Math.max(1.2 * S, eh), 0, 0, TAU); c.closePath();
        c.fillStyle = '#fdfdff'; c.fill();
        c.clip();
        // iris: Six Eyes = luminous cyan with concentric rings
        const ir = headR * 0.175 * mood.pupil;
        const ix = ex + lookX, iy = eyeY + lookY;
        if (six > 0.02) {
          const gg = c.createRadialGradient(ix, iy, ir * 0.1, ix, iy, ir * 1.9);
          gg.addColorStop(0, `rgba(220,255,255,${0.95 * six})`);
          gg.addColorStop(0.35, `rgba(90,225,255,${0.85 * six})`);
          gg.addColorStop(1, 'rgba(30,140,230,0)');
          c.fillStyle = gg; c.beginPath(); c.arc(ix, iy, ir * 1.9, 0, TAU); c.fill();
        }
        const ig = c.createRadialGradient(ix - ir * 0.25, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
        if (six > 0.02) { ig.addColorStop(0, '#d8fbff'); ig.addColorStop(0.45, '#4fd4f5'); ig.addColorStop(1, '#0d6fa8'); }
        else { ig.addColorStop(0, '#7fb8d8'); ig.addColorStop(0.5, '#3d7fa8'); ig.addColorStop(1, '#17415e'); }
        c.fillStyle = ig; c.beginPath(); c.arc(ix, iy, ir, 0, TAU); c.fill();
        // concentric Six Eyes rings
        if (six > 0.02) {
          c.strokeStyle = `rgba(235,255,255,${0.75 * six})`;
          for (let k = 1; k <= 3; k++) { c.lineWidth = 1.6 * S; c.beginPath(); c.arc(ix, iy, ir * (0.32 + k * 0.2), 0, TAU); c.stroke(); }
          c.strokeStyle = `rgba(255,255,255,${0.5 * six})`; c.lineWidth = 1.2 * S;
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + t * 0.3; c.beginPath(); c.moveTo(ix + Math.cos(a) * ir * 0.35, iy + Math.sin(a) * ir * 0.35); c.lineTo(ix + Math.cos(a) * ir * 0.95, iy + Math.sin(a) * ir * 0.95); c.stroke(); }
        }
        // pupil + catchlights
        c.fillStyle = '#0a1420'; c.beginPath(); c.arc(ix, iy, ir * 0.40, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(ix - ir * 0.34, iy - ir * 0.38, ir * 0.22, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(ix + ir * 0.30, iy + ir * 0.30, ir * 0.11, 0, TAU); c.fill();
        // upper lid shadow
        c.fillStyle = 'rgba(40,20,30,.22)';
        c.beginPath(); c.ellipse(ex, eyeY - eh * 0.9, ew, eh * 0.5, 0, 0, TAU); c.fill();
        c.restore();
        // lash line
        c.strokeStyle = INK; c.lineWidth = 5.5 * S;
        c.beginPath(); c.ellipse(ex, eyeY, ew, Math.max(1.2 * S, eh), 0, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
        c.lineWidth = 3 * S;
        c.beginPath(); c.ellipse(ex, eyeY, ew, Math.max(1.2 * S, eh), 0, Math.PI * 0.06, Math.PI * 0.94); c.stroke();
      }
      // brow (independent of lid)
      const by = eyeY - headR * 0.36 + mood.browY * headR * 0.3;
      c.strokeStyle = six > 0.5 ? '#dfe6f2' : '#e8ecf6';
      c.lineWidth = 9 * S; c.lineCap = 'round';
      c.save(); c.translate(ex, by); c.rotate(s * mood.browA);
      c.beginPath(); c.moveTo(-headR * 0.24, 0); c.quadraticCurveTo(0, -headR * 0.07, headR * 0.24, headR * 0.02); c.stroke();
      c.restore();
    }

    // ----- nose -----
    c.strokeStyle = 'rgba(140,85,70,.55)'; c.lineWidth = 3.5 * S;
    c.beginPath();
    c.moveTo(fx * headR * 0.5 + headR * 0.02, headR * 0.34);
    c.lineTo(fx * headR * 0.5 + headR * 0.09, headR * 0.50);
    c.lineTo(fx * headR * 0.5 - headR * 0.02, headR * 0.53);
    c.stroke();

    // ----- mouth (viseme aware) -----
    const talk = p.talk ?? 0;
    const sh = p.mouthShape || 'rest';
    const my = headR * 0.78;
    const mx = fx * headR * 0.42;
    const curve = mood.mouth;
    const openAmt = clamp(mood.mOpen * (1 - talk) + talk * (sh === 'open' ? 0.95 : sh === 'wide' ? 0.6 : sh === 'round' ? 0.7 : sh === 'narrow' ? 0.32 : 0.22), 0, 1);
    const mw = headR * (sh === 'wide' ? 0.40 : sh === 'round' ? 0.22 : sh === 'narrow' ? 0.28 : 0.32);
    const oh = headR * 0.30 * openAmt;
    if (openAmt > 0.07) {
      c.fillStyle = '#40121f'; c.strokeStyle = INK; c.lineWidth = 4.5 * S;
      c.beginPath(); c.ellipse(mx, my + oh * 0.2, mw, Math.max(2 * S, oh), 0, 0, TAU); c.fill(); c.stroke();
      if (talk > 0.4 && (sh === 'wide' || sh === 'open')) {
        c.fillStyle = '#fff';
        c.beginPath(); c.roundRect(mx - mw * 0.74, my + oh * 0.2 - oh * 0.92, mw * 1.48, Math.min(7 * S, oh * 0.5), 2 * S); c.fill();
      }
      if (openAmt > 0.55) { c.fillStyle = '#c4566e'; c.beginPath(); c.ellipse(mx, my + oh * 0.62, mw * 0.5, oh * 0.3, 0, 0, TAU); c.fill(); }
    } else {
      c.strokeStyle = INK; c.lineWidth = 5 * S;
      c.beginPath();
      c.moveTo(mx - mw, my - curve * headR * 0.06);
      c.quadraticCurveTo(mx, my + curve * headR * 0.22, mx + mw, my - curve * headR * 0.06);
      c.stroke();
    }

    // ----- blindfold -----
    if (blind > 0.02) {
      c.save(); c.globalAlpha = blind;
      const bg = c.createLinearGradient(0, eyeY - headR * 0.42, 0, eyeY + headR * 0.34);
      bg.addColorStop(0, '#2a2f42'); bg.addColorStop(0.5, '#14182a'); bg.addColorStop(1, '#0b0e1a');
      c.fillStyle = bg; c.strokeStyle = INK; c.lineWidth = 5 * S;
      c.beginPath();
      c.moveTo(-headR * 1.04, eyeY - headR * 0.40);
      c.quadraticCurveTo(0, eyeY - headR * 0.56, headR * 1.04, eyeY - headR * 0.40);
      c.lineTo(headR * 1.00, eyeY + headR * 0.30);
      c.quadraticCurveTo(0, eyeY + headR * 0.46, -headR * 1.00, eyeY + headR * 0.30);
      c.closePath(); c.fill(); c.stroke();
      // fabric folds + sheen
      c.strokeStyle = 'rgba(150,180,220,.16)'; c.lineWidth = 3 * S;
      for (let k = -1; k <= 1; k++) {
        c.beginPath(); c.moveTo(-headR * 0.9, eyeY + k * headR * 0.16);
        c.quadraticCurveTo(0, eyeY + k * headR * 0.16 + headR * 0.07, headR * 0.9, eyeY + k * headR * 0.16); c.stroke();
      }
      c.restore();
    }

    // ----- hair: layered white spikes -----
    // swept, irregular locks (the first pass looked like a regular crown)
    const locks = [
      [-1.04, -0.10, -1.42, -0.74, -0.70, -0.94],
      [-0.86, -0.80, -1.16, -1.50, -0.40, -1.10],
      [-0.50, -1.06, -0.58, -1.78, -0.02, -1.16],
      [-0.10, -1.16, 0.10, -1.92, 0.40, -1.14],
      [0.30, -1.12, 0.66, -1.70, 0.76, -0.96],
      [0.68, -0.94, 1.22, -1.32, 1.02, -0.46],
      [1.00, -0.44, 1.44, -0.52, 1.06, 0.04],
      [-0.24, -1.10, -0.02, -1.54, 0.18, -1.02],
      [0.52, -1.04, 0.90, -1.44, 0.92, -0.78],
    ];
    c.fillStyle = hairC; c.strokeStyle = INK; c.lineWidth = 5.5 * S;
    // base cap
    c.beginPath();
    c.moveTo(-headR * 1.06, -headR * 0.12);
    c.bezierCurveTo(-headR * 1.12, -headR * 1.00, -headR * 0.54, -headR * 1.34, 0, -headR * 1.32);
    c.bezierCurveTo(headR * 0.54, -headR * 1.34, headR * 1.12, -headR * 1.00, headR * 1.06, -headR * 0.12);
    c.quadraticCurveTo(headR * 0.6, -headR * 0.50, 0, -headR * 0.42);
    c.quadraticCurveTo(-headR * 0.6, -headR * 0.50, -headR * 1.06, -headR * 0.12);
    c.closePath(); c.fill(); c.stroke();
    for (let li = 0; li < locks.length; li++) {
      const [x0, y0, x1, y1, x2, y2] = locks[li];
      const wob = Math.sin(t * 1.25 + li * 1.7) * 0.028;
      c.beginPath();
      c.moveTo(headR * x0, headR * y0);
      c.quadraticCurveTo(headR * (x1 + wob * 0.5), headR * (y1 + wob * 0.6), headR * (x1 + wob * 1.7), headR * (y1 + wob));
      c.quadraticCurveTo(headR * ((x1 + x2) / 2 + 0.04), headR * ((y1 + y2) / 2 + 0.16), headR * x2, headR * y2);
      c.closePath();
      const lg = c.createLinearGradient(headR * x0, headR * y1, headR * x2, headR * y2);
      lg.addColorStop(0, hairC); lg.addColorStop(0.62, '#e6eaf4'); lg.addColorStop(1, hairSh);
      c.fillStyle = lg; c.fill(); c.stroke();
    }
    // forehead fringe: a few locks falling forward over the brow line
    c.fillStyle = hairC; c.strokeStyle = INK; c.lineWidth = 4.5 * S;
    const fringe = [[-0.80, -0.54, -0.56, -0.30, -0.32, -0.52], [-0.36, -0.56, -0.12, -0.28, 0.10, -0.54], [0.20, -0.54, 0.44, -0.32, 0.62, -0.50]];
    for (let fi = 0; fi < fringe.length; fi++) {
      const [x0, y0, x1, y1, x2, y2] = fringe[fi];
      const wob = Math.sin(t * 1.1 + fi * 2.3) * 0.02;
      c.beginPath();
      c.moveTo(headR * x0, headR * y0);
      c.quadraticCurveTo(headR * (x1 + wob), headR * (y1 + wob), headR * x1, headR * y1);
      c.quadraticCurveTo(headR * ((x1 + x2) / 2), headR * ((y1 + y2) / 2 + 0.1), headR * x2, headR * y2);
      c.closePath();
      const lg2 = c.createLinearGradient(0, headR * y0, 0, headR * y1);
      lg2.addColorStop(0, hairC); lg2.addColorStop(1, '#d4dae8');
      c.fillStyle = lg2; c.fill(); c.stroke();
    }
    // specular streaks
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 4 * S;
    c.beginPath(); c.moveTo(-headR * 0.62, -headR * 0.86); c.quadraticCurveTo(-headR * 0.1, -headR * 1.06, headR * 0.44, -headR * 0.82); c.stroke();
    if (six > 0.02) {
      c.strokeStyle = `rgba(140,235,255,${0.5 * six})`; c.lineWidth = 6 * S;
      c.beginPath(); c.moveTo(-headR * 0.8, -headR * 0.6); c.quadraticCurveTo(0, -headR * 0.9, headR * 0.8, -headR * 0.6); c.stroke();
    }
    // sideburns
    c.fillStyle = hairC; c.strokeStyle = INK; c.lineWidth = 4.5 * S;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * headR * 0.98, -headR * 0.2);
      c.quadraticCurveTo(s * headR * 1.10, headR * 0.22, s * headR * 0.86, headR * 0.42);
      c.quadraticCurveTo(s * headR * 0.80, headR * 0.06, s * headR * 0.82, -headR * 0.2);
      c.closePath(); c.fill(); c.stroke();
    }
    c.restore(); // head transform

    // ---------- sweat ----------
    if (sweat > 0.01) {
      c.fillStyle = 'rgba(175,225,255,.92)'; c.strokeStyle = 'rgba(70,140,190,.9)'; c.lineWidth = 2.5 * S;
      for (let k = 0; k < 5; k++) {
        const u = ((t * 0.30 + k / 5) % 1);
        const x = headCX + (k % 2 ? -1 : 1) * headR * (0.72 + 0.12 * k);
        const y = headCY - headR * 0.5 + u * headR * 2.4;
        const r = (1 - u * 0.35) * 11 * S * sweat;
        c.globalAlpha = (1 - u * 0.7) * sweat;
        c.beginPath(); c.moveTo(x, y - r * 1.7);
        c.quadraticCurveTo(x + r, y, x, y + r * 0.7);
        c.quadraticCurveTo(x - r, y, x, y - r * 1.7);
        c.fill(); c.stroke();
      }
      c.globalAlpha = 1;
    }
    // ---------- focus rings around the head ----------
    if (p.focusRings) {
      c.save(); c.strokeStyle = `rgba(120,230,255,${0.55 * p.focusRings})`;
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 0.45 + k / 3) % 1);
        c.lineWidth = (1 - ph) * 5 * S + 0.6;
        c.globalAlpha = (1 - ph) * p.focusRings;
        c.beginPath(); c.ellipse(headCX, headCY, headR * (1.3 + ph * 1.5), headR * (1.3 + ph * 1.5) * 0.98, 0, 0, TAU); c.stroke();
      }
      c.restore();
    }
    c.restore();
  }

  window.drawGojo = drawGojo;
  window.GOJO_MOODS = Object.keys(MOOD);
  window.GOJO_IK = ik;
})();
