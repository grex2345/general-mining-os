/**
 * scenes/tanjiroWorld.mjs — Round 7 illustrated 2D environments.
 *
 * MASTER PROMPT world rules: colourful hand-drawn 2D illustration, thick dark ink
 * outlines on every object edge, hand-painted canvas textures, soft atmospheric
 * haze on distant elements (flat painterly depth, NOT 3D DOF), warm cinematic light
 * painted in. Parallax layers give the 2.5D camera something to travel through.
 *
 * Each env draws in base 1080x1920 coordinates. `layer()` applies the camera with a
 * depth factor so far layers pan/zoom less than near ones. Deterministic per seed.
 */
import { rng } from '../cartoon.mjs';

const INK = '#2c1a2e';
export const BASE_W = 1080, BASE_H = 1920;

/** Light presets: sky gradient stops + ambient tint + sun/moon. */
export const LIGHTS = {
  dawn:    { sky: ['#2a3550', '#7a6a8a', '#e8a87a', '#f4c98a'], amb: 'rgba(255,180,120,0.10)', sun: [0.72, 0.30, '#ffd9a0'], haze: 'rgba(240,200,170,0.20)' },
  day:     { sky: ['#7ec4e8', '#a8d8f0', '#d8ecf4', '#eef6f0'], amb: 'rgba(255,255,240,0.05)', sun: [0.78, 0.16, '#fff4c0'], haze: 'rgba(220,235,245,0.22)' },
  predawn: { sky: ['#1a2340', '#2a3a5c', '#4a5a7c', '#6a7a9c'], amb: 'rgba(120,150,220,0.10)', sun: [0.2, 0.2, '#cdd8f0'], haze: 'rgba(140,160,210,0.18)' },
  night:   { sky: ['#0a0e20', '#141c38', '#202c4c', '#2a3858'], amb: 'rgba(90,120,200,0.12)', sun: [0.74, 0.16, '#e8f0ff'], haze: 'rgba(120,150,220,0.16)', moon: true },
  golden:  { sky: ['#4a3a5c', '#c87a5a', '#f0b060', '#f8d890'], amb: 'rgba(255,170,90,0.16)', sun: [0.5, 0.34, '#ffe0a0'], haze: 'rgba(250,200,140,0.26)' },
};

function layer(ctx, cam, depth, fn) {
  ctx.save();
  const z = 1 + (cam.zoom - 1) * depth;
  ctx.translate(BASE_W / 2, BASE_H / 2);
  ctx.scale(z, z);
  ctx.translate(-BASE_W / 2 - cam.x * depth, -BASE_H / 2 - (cam.y || 0) * depth);
  fn();
  ctx.restore();
}

function ink(ctx, w = 5) { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }

/** Painted texture: faint seeded strokes inside the current clip. */
function paintTexture(ctx, x, y, w, h, seed, tone = 'rgba(0,0,0,0.05)', n = 40) {
  const rnd = rng(seed);
  ctx.save(); ctx.strokeStyle = tone; ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w, py = y + rnd() * h;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + (rnd() - 0.5) * 30, py + (rnd() - 0.5) * 8); ctx.stroke();
  }
  ctx.restore();
}

function sky(ctx, light) {
  const L = LIGHTS[light] || LIGHTS.day;
  const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
  L.sky.forEach((c, i) => g.addColorStop(i / (L.sky.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, BASE_W, BASE_H);
  // sun / moon
  const [sx, sy, sc] = L.sun;
  const x = sx * BASE_W, y = sy * BASE_H, r = L.moon ? 60 : 90;
  const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  gg.addColorStop(0, sc); gg.addColorStop(0.25, sc + 'aa'); gg.addColorStop(1, sc + '00');
  ctx.fillStyle = gg; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
  if (L.moon) {
    const rnd = rng(42);
    ctx.fillStyle = 'rgba(232,240,255,0.8)';
    for (let i = 0; i < 70; i++) ctx.fillRect(rnd() * BASE_W, rnd() * BASE_H * 0.5, 2, 2);
  }
}

/** Distant mountain ridge silhouette with haze. */
function ridge(ctx, baseY, amp, color, seed, haze) {
  const rnd = rng(seed);
  ctx.beginPath(); ctx.moveTo(-100, BASE_H);
  ctx.lineTo(-100, baseY);
  let x = -100;
  while (x < BASE_W + 100) {
    const w = 140 + rnd() * 220, h = amp * (0.5 + rnd());
    ctx.lineTo(x + w / 2, baseY - h);
    ctx.lineTo(x + w, baseY - amp * 0.1 * rnd());
    x += w;
  }
  ctx.lineTo(BASE_W + 100, BASE_H); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = haze; ctx.fill();
}

function pine(ctx, x, y, h, color, trunk = '#3a2a24') {
  ctx.fillStyle = trunk; ink(ctx, 4);
  ctx.fillRect(x - h * 0.05, y - h * 0.15, h * 0.10, h * 0.15);
  ctx.strokeRect(x - h * 0.05, y - h * 0.15, h * 0.10, h * 0.15);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const ty = y - h * (0.15 + i * 0.28), tw = h * (0.5 - i * 0.12), th = h * 0.36;
    ctx.beginPath(); ctx.moveTo(x - tw / 2, ty); ctx.lineTo(x, ty - th); ctx.lineTo(x + tw / 2, ty); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

function house(ctx, x, y, w, h, wall, roof) {
  ink(ctx, 5);
  ctx.fillStyle = wall; ctx.fillRect(x, y - h, w, h); ctx.strokeRect(x, y - h, w, h);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(x - w * 0.12, y - h); ctx.lineTo(x + w / 2, y - h - w * 0.34); ctx.lineTo(x + w * 1.12, y - h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a2a24';
  ctx.fillRect(x + w * 0.4, y - h * 0.5, w * 0.2, h * 0.5); ctx.strokeRect(x + w * 0.4, y - h * 0.5, w * 0.2, h * 0.5);
  ctx.fillStyle = '#f4e8b0';
  ctx.fillRect(x + w * 0.12, y - h * 0.72, w * 0.18, h * 0.22); ctx.strokeRect(x + w * 0.12, y - h * 0.72, w * 0.18, h * 0.22);
}

function ground(ctx, y, color, seed) {
  ctx.fillStyle = color; ctx.fillRect(-200, y, BASE_W + 400, BASE_H - y + 200);
  ink(ctx, 5); ctx.beginPath(); ctx.moveTo(-200, y); ctx.lineTo(BASE_W + 200, y); ctx.stroke();
  paintTexture(ctx, -200, y, BASE_W + 400, BASE_H - y, seed, 'rgba(0,0,0,0.06)', 60);
}

function clouds(ctx, t, seed, color = 'rgba(255,255,255,0.85)') {
  const rnd = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const x = ((rnd() * BASE_W + t * 12 * (0.5 + rnd())) % (BASE_W + 300)) - 150;
    const y = 120 + rnd() * 380, s = 0.7 + rnd() * 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 50 * s, y - 12 * s, 50 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 50 * s, y - 6 * s, 44 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------ environments */

export function drawWorld(ctx, env, t, { light = 'day', cam = { x: 0, y: 0, zoom: 1 } } = {}) {
  const L = LIGHTS[light] || LIGHTS.day;
  sky(ctx, light);

  if (env === 'village') {
    layer(ctx, cam, 0.25, () => { ridge(ctx, 900, 360, '#5a6a8a', 3, L.haze); ridge(ctx, 1020, 260, '#6a7a9a', 8, L.haze); });
    layer(ctx, cam, 0.5, () => { clouds(ctx, t, 11); for (let i = 0; i < 6; i++) pine(ctx, 100 + i * 180, 1180, 150, '#3f6b4a'); });
    layer(ctx, cam, 0.8, () => {
      ground(ctx, 1300, '#7a9a5a', 21);
      house(ctx, 120, 1300, 220, 200, '#d8c8a8', '#8a5a3a');
      house(ctx, 700, 1300, 240, 230, '#c8b898', '#7a4a2a');
      // charcoal kiln
      ink(ctx, 5); ctx.fillStyle = '#6a5a4a';
      ctx.beginPath(); ctx.arc(520, 1300, 90, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(520, 1300, 34, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      // smoke
      const rnd = rng(5);
      ctx.fillStyle = 'rgba(200,200,210,0.35)';
      for (let i = 0; i < 4; i++) { const ph = (t * 0.3 + i * 0.25) % 1; ctx.beginPath(); ctx.arc(520 + Math.sin(t + i) * 12, 1200 - ph * 160, 14 + ph * 22, 0, Math.PI * 2); ctx.fill(); }
    });
  } else if (env === 'mountain') {
    layer(ctx, cam, 0.2, () => { ridge(ctx, 820, 460, '#7a8aaa', 5, L.haze); ridge(ctx, 980, 340, '#8a9aba', 9, L.haze); });
    layer(ctx, cam, 0.45, () => { clouds(ctx, t, 13); ridge(ctx, 1140, 240, '#5a7a6a', 14, L.haze); });
    layer(ctx, cam, 0.75, () => {
      ground(ctx, 1340, '#6a8a5a', 22);
      for (let i = 0; i < 8; i++) pine(ctx, 60 + i * 140, 1340, 180 + (i % 3) * 40, '#3f6b4a');
      // winding path
      ctx.fillStyle = '#c8b090'; ink(ctx, 5);
      ctx.beginPath(); ctx.moveTo(300, BASE_H); ctx.quadraticCurveTo(520, 1600, 480, 1400); ctx.quadraticCurveTo(460, 1340, 560, 1340);
      ctx.lineTo(640, 1340); ctx.quadraticCurveTo(560, 1420, 620, 1600); ctx.quadraticCurveTo(680, 1780, 560, BASE_H); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
  } else if (env === 'yard') {
    layer(ctx, cam, 0.3, () => { ridge(ctx, 980, 300, '#3a4a6a', 6, L.haze); });
    layer(ctx, cam, 0.6, () => {
      ground(ctx, 1320, '#8a7a5a', 23);
      // dojo hut
      house(ctx, 640, 1320, 320, 280, '#b8a888', '#5a4a3a');
      // training posts
      ink(ctx, 5);
      for (let i = 0; i < 3; i++) {
        const x = 180 + i * 160;
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - 16, 1120, 32, 200); ctx.strokeRect(x - 16, 1120, 32, 200);
        ctx.fillRect(x - 60, 1160, 120, 22); ctx.strokeRect(x - 60, 1160, 120, 22);
      }
      // lantern glow
      const g = ctx.createRadialGradient(560, 1180, 0, 560, 1180, 120);
      g.addColorStop(0, 'rgba(255,200,120,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(440, 1060, 240, 240);
      ctx.fillStyle = '#f4d080'; ink(ctx, 4); ctx.beginPath(); ctx.arc(560, 1180, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  } else if (env === 'falls') {
    layer(ctx, cam, 0.3, () => { ridge(ctx, 860, 420, '#4a6a7a', 7, L.haze); });
    layer(ctx, cam, 0.6, () => {
      // cliff + waterfall
      ink(ctx, 5); ctx.fillStyle = '#6a7a8a';
      ctx.fillRect(340, 500, 400, 840); ctx.strokeRect(340, 500, 400, 840);
      const g = ctx.createLinearGradient(0, 500, 0, 1340);
      g.addColorStop(0, '#d8ecf4'); g.addColorStop(1, '#a8d0e0');
      ctx.fillStyle = g; ctx.fillRect(460, 500, 160, 840);
      // animated flow lines
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        const x = 475 + i * 18, off = (t * 300 + i * 60) % 200;
        ctx.beginPath(); ctx.moveTo(x, 500 + off); ctx.lineTo(x, 620 + off); ctx.stroke();
      }
      // pool
      ctx.fillStyle = '#7ab0c8'; ctx.beginPath(); ctx.ellipse(540, 1360, 320, 70, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // mist
      const rnd = rng(9);
      ctx.fillStyle = 'rgba(230,240,250,0.3)';
      for (let i = 0; i < 6; i++) { const ph = (t * 0.4 + rnd()) % 1; ctx.beginPath(); ctx.arc(460 + rnd() * 160, 1320 - ph * 120, 20 + ph * 30, 0, Math.PI * 2); ctx.fill(); }
      for (let i = 0; i < 4; i++) pine(ctx, 80 + i * 90, 1340, 160, '#3f6b4a');
      for (let i = 0; i < 3; i++) pine(ctx, 820 + i * 90, 1340, 170, '#3f6b4a');
      ground(ctx, 1400, '#5a7a5a', 24);
    });
  } else if (env === 'river') {
    layer(ctx, cam, 0.3, () => { ridge(ctx, 900, 360, '#6a8a9a', 10, L.haze); });
    layer(ctx, cam, 0.55, () => { for (let i = 0; i < 7; i++) pine(ctx, 60 + i * 160, 1220, 160, '#3f6b4a'); });
    layer(ctx, cam, 0.8, () => {
      ground(ctx, 1280, '#7a9a5a', 25);
      // river band
      const g = ctx.createLinearGradient(0, 1400, 0, 1700);
      g.addColorStop(0, '#8ac0d8'); g.addColorStop(1, '#5a90b0');
      ctx.fillStyle = g; ctx.fillRect(-200, 1420, BASE_W + 400, 300);
      ink(ctx, 5); ctx.beginPath(); ctx.moveTo(-200, 1420); ctx.lineTo(BASE_W + 200, 1420); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const x = ((i * 130 + t * 60) % (BASE_W + 200)) - 100, y = 1460 + (i % 4) * 60;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 40, y - 6, x + 80, y); ctx.stroke();
      }
      // the boulder
      ink(ctx, 6); ctx.fillStyle = '#8a8a92';
      ctx.beginPath(); ctx.ellipse(760, 1360, 130, 110, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      paintTexture(ctx, 640, 1260, 240, 200, 26, 'rgba(0,0,0,0.08)', 24);
    });
  } else if (env === 'snow') {
    layer(ctx, cam, 0.25, () => { ridge(ctx, 900, 400, '#2a3854', 12, L.haze); ridge(ctx, 1040, 280, '#34425e', 15, L.haze); });
    layer(ctx, cam, 0.55, () => { for (let i = 0; i < 9; i++) pine(ctx, 40 + i * 125, 1260, 190 + (i % 3) * 50, '#1e3040'); });
    layer(ctx, cam, 0.8, () => {
      ground(ctx, 1320, '#d8e4f0', 27);
      // snow drifts
      ctx.fillStyle = '#e8f0f8'; ink(ctx, 4);
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(120 + i * 220, 1330, 120, 26, 0, 0, Math.PI * 2); ctx.fill(); }
      for (let i = 0; i < 4; i++) pine(ctx, 140 + i * 280, 1340, 220, '#243a4c');
    });
  }

  // ambient light wash + atmospheric haze near the horizon
  ctx.fillStyle = L.amb; ctx.fillRect(0, 0, BASE_W, BASE_H);
}