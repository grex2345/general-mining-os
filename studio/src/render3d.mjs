// Tiny deterministic software 3D renderer — the *technique* from the research,
// reimplemented against the Skia canvas this studio already renders with.
//
// Source of the ideas (inspected 2026-11-25):
//  - kunalkushwaha/vsim (MIT): pure-TypeScript rasteriser, no GPU/Chrome; per-pixel
//    PBR, PCF shadows, 2x supersampling, ACES tone mapping, deterministic seeded RNG.
//    Its *architecture* (software raster -> raw RGBA -> ffmpeg pipe) is what this
//    studio already does with Skia, which is why the technique transfers cleanly.
//  - artemnovitckii/claude-animation-skills (MIT): template.html shows the lighting
//    rig worth copying — ACESFilmicToneMapping, key + rim + hemisphere ambient, and
//    a PMREM room environment for metal. We cannot run its WebGL/Chrome path here,
//    but the lighting recipe is portable.
//
// What this is NOT: a GPU renderer, a PBR path tracer, or a character system.
// It is an orthographic/perspective box rasteriser with flat-shaded faces, a single
// directional light, ambient + hemisphere fill, contact shadows, ACES tone mapping
// and supersampling. Enough to give the studio real depth and material response
// instead of flat rectangles.

// --- math -----------------------------------------------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };

/** Look-at view matrix, right-handed, camera looking down -Z in view space. */
export function lookAt(eye, target, up = [0, 1, 0]) {
  const f = norm(sub(target, eye));
  const s = norm(cross(f, up));
  const u = cross(s, f);
  return {
    eye,
    toView: (p) => {
      const d = sub(p, eye);
      return [dot(d, s), dot(d, u), -dot(d, f)];
    },
  };
}

/** Perspective projection to normalised device coords (x,y in -1..1, z 0..1). */
export function perspective(view, p, { fovDeg = 45, aspect = 1 } = {}) {
  const v = view.toView(p);
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const z = -v[2];
  if (z <= 0.001) return null;
  return [(v[0] * f) / aspect / z, (v[1] * f) / z, z];
}

// --- colour ---------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** ACES filmic tone mapping (the curve three.js ACESFilmicToneMapping uses). */
function acesFit(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
}

export function aces(rgb, exposure = 1) {
  return rgb.map((c) => acesFit(c * exposure));
}

const toCss = (rgb, a = 1) =>
  `rgba(${Math.round(clamp01(rgb[0]) * 255)},${Math.round(clamp01(rgb[1]) * 255)},${Math.round(clamp01(rgb[2]) * 255)},${a})`;

// --- shading --------------------------------------------------------------
const LIGHT_DEFAULT = { dir: norm([-0.45, -0.82, 0.36]), key: 1.0, ambient: 0.30, hemi: 0.18, rim: 0.25 };

/**
 * Shade one face: Lambert key + hemisphere fill (sky/ground tint) + rim.
 * `albedo` is linear-ish 0..1 rgb; returns tone-mapped rgb.
 */
export function shadeFace(normal, albedo, light = LIGHT_DEFAULT, { exposure = 1.0 } = {}) {
  const n = norm(normal);
  const ndl = Math.max(0, -dot(n, light.dir));
  const up = (n[1] + 1) / 2; // 1 when facing up
  const key = ndl * light.key;
  const hemi = up * light.hemi;
  const amb = light.ambient;
  // rim: strongest where the surface turns away from the camera axis
  const rim = Math.pow(1 - Math.abs(n[2]), 3) * light.rim * 0.35;
  const lit = albedo.map((c) => c * (amb + key + hemi) + rim * 0.25);
  return aces(lit, exposure);
}

/** Where a box's shadow lands on a ground plane (simple directional projection). */
export function projectShadow(center, size, light = LIGHT_DEFAULT, groundY = 0) {
  const h = center[1] - groundY;
  if (h <= 0) return null;
  const t = h / Math.max(0.15, -light.dir[1]);
  return {
    x: center[0] + light.dir[0] * t,
    z: center[2] + light.dir[2] * t,
    rx: size[0] * (0.55 + t * 0.16),
    rz: size[2] * (0.55 + t * 0.16),
  };
}

// --- box mesh -------------------------------------------------------------
const FACE_UV = {
  // outward normal, and the 4 corners as sign triples
  top: [0, 1, 0], bottom: [0, -1, 0],
  front: [0, 0, 1], back: [0, 0, -1],
  right: [1, 0, 0], left: [-1, 0, 0],
};
function faceCorners([nx, ny, nz], half) {
  const [hx, hy, hz] = half;
  // build the quad in the plane facing the normal
  if (ny !== 0) return [[-hx, ny * hy, -hz], [hx, ny * hy, -hz], [hx, ny * hy, hz], [-hx, ny * hy, hz]];
  if (nz !== 0) return [[-hx, -hy, nz * hz], [hx, -hy, nz * hz], [hx, hy, nz * hz], [-hx, hy, nz * hz]];
  return [[nx * hx, -hy, -hz], [nx * hx, -hy, hz], [nx * hx, hy, hz], [nx * hx, hy, -hz]];
}

/**
 * Render axis-aligned boxes into a ctx.
 * boxes: [{ center:[x,y,z], size:[w,h,d], albedo:[r,g,b], opacity?, noShadow? }]
 * Faithful to the painter's algorithm: sort faces back-to-front by view depth.
 */
export function drawBoxes(ctx, boxes, {
  width, height, camera = { eye: [5, 4.2, 7.4], target: [0, 1.1, 0], fovDeg: 40 },
  light = LIGHT_DEFAULT, exposure = 1.0, groundY = 0, shadowAlpha = 0.30,
} = {}) {
  const aspect = width / height;
  const view = lookAt(camera.eye, camera.target);
  const proj = (p) => {
    const n = perspective(view, p, { fovDeg: camera.fovDeg, aspect });
    if (!n) return null;
    return [(n[0] * 0.5 + 0.5) * width, (0.5 - n[1] * 0.5) * height, n[2]];
  };

  // 1. soft contact shadows on the ground plane (drawn first, under everything)
  for (const b of boxes) {
    if (b.noShadow) continue;
    const s = projectShadow(b.center, b.size, light, groundY);
    if (!s) continue;
    const c = proj([s.x, groundY + 0.001, s.z]);
    if (!c) continue;
    const edge = proj([s.x + s.rx, groundY + 0.001, s.z]);
    const edgeZ = proj([s.x, groundY + 0.001, s.z + s.rz]);
    if (!edge || !edgeZ) continue;
    const rx = Math.abs(edge[0] - c[0]);
    const rz = Math.abs(edgeZ[1] - c[1]);
    if (rx < 1 || rz < 1) continue;
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], Math.max(rx, rz));
    g.addColorStop(0, `rgba(0,0,0,${shadowAlpha})`);
    g.addColorStop(0.55, `rgba(0,0,0,${shadowAlpha * 0.45})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.scale(1, Math.max(0.12, rz / Math.max(1e-6, rx)));
    ctx.translate(-c[0], -c[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c[0], c[1], Math.max(rx, rz), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. gather visible faces with a view-space depth for sorting
  const faces = [];
  for (const b of boxes) {
    for (const [name, n] of Object.entries(FACE_UV)) {
      const worldNormal = n;
      const corners = faceCorners(n, mul(b.size, 0.5)).map((c) => add(c, b.center));
      // backface cull: face normal must point towards the camera
      const toCam = sub(camera.eye, corners[0]);
      if (dot(worldNormal, toCam) <= 0) continue;
      const pts = corners.map(proj);
      if (pts.some((p) => p === null)) continue;
      const depth = (view.toView(corners.reduce((a, c) => add(a, c), [0, 0, 0]).map((v) => v / 4))[2]) * -1;
      faces.push({ name, pts, depth, albedo: b.albedo, normal: worldNormal, opacity: b.opacity ?? 1, box: b });
    }
  }
  faces.sort((a, b) => b.depth - a.depth); // farthest first

  for (const f of faces) {
    const col = shadeFace(f.normal, f.albedo, light, { exposure });
    ctx.save();
    ctx.globalAlpha = f.opacity;
    ctx.beginPath();
    ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = toCss(col);
    ctx.fill();
    // a hairline of the same colour kills seams between adjacent faces
    ctx.strokeStyle = toCss(col);
    ctx.lineWidth = 1;
    ctx.stroke();
    // top faces get a soft specular sheen so materials read as solid, not flat
    if (f.name === 'top') {
      const g = ctx.createLinearGradient(f.pts[0][0], f.pts[0][1], f.pts[2][0], f.pts[2][1]);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }
  return faces.length;
}

/**
 * Supersampled render: draw into a canvas `scale`x larger, then downsample.
 * 2x is the sweet spot (vsim uses 2x as well); the cost is quadratic.
 */
export function renderSupersampled(createCanvas, width, height, drawFn, { scale = 2 } = {}) {
  const big = createCanvas(Math.round(width * scale), Math.round(height * scale));
  const bctx = big.getContext('2d');
  bctx.save();
  bctx.scale(scale, scale);
  drawFn(bctx, width, height);
  bctx.restore();
  const out = createCanvas(width, height);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, width, height);
  return out;
}
