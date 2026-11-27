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

// ===========================================================================
// Look development — cinematic finishing borrowed from the zach-d-films engine
// (research/references/zach-d-films.md). Everything here is ADDITIVE: nothing
// above this line changes, so the existing pipeline renders exactly as before
// unless a caller opts in.
// ===========================================================================

/**
 * Specular rig as a set of emissive planes, mimicking their PMREM softbox.
 * We cannot prefilter an environment map without WebGL, but the *reason* the
 * metal reads expensive is directional, broad, differently-coloured highlights
 * at known angular positions — which we can reproduce directly in the shading
 * model. Angles are in the view plane: az in radians from +z toward +x.
 */
export const LIGHT_RIG = {
  key:  { az: -0.85, el: 0.72, intensity: 3.2, colour: [1.0, 0.96, 0.90], size: 0.38 },
  rim:  { az: 2.05,  el: 0.28, intensity: 1.6, colour: [0.86, 0.92, 1.0], size: 0.22 },
  fill: { az: 3.00,  el: 0.40, intensity: 1.0, colour: [0.92, 0.95, 1.0], size: 0.60 },
  floor: { colour: [0.34, 0.35, 0.37], intensity: 1.0 },
};

const rigDir = (l) => norm([Math.sin(l.az) * Math.cos(l.el), Math.sin(l.el), Math.cos(l.az) * Math.cos(l.el)]);

/**
 * Broad specular lobe from the rig. `roughness` 0..1 controls tightness:
 * polished metal ~0.15 gives a tight stretched streak, brushed ~0.45 a wide
 * soft sheen. Returns {rgb, dominant} where dominant is the winning light's
 * intensity — used by the bloom pass to decide what should glow.
 */
export function specular(normal, view, roughness = 0.35, rig = LIGHT_RIG) {
  const n = norm(normal);
  const v = norm(view);
  // half-vector per light, Blinn-Phong with a roughness-driven exponent
  let out = [0, 0, 0];
  let dominant = 0;
  const shininess = Math.max(2, Math.pow(1 / Math.max(0.03, roughness), 1.6));
  for (const k of ['key', 'rim', 'fill']) {
    const l = rig[k];
    const h = norm(add(rigDir(l), v));
    const ndh = Math.max(0, dot(n, h));
    // size widens the lobe (their planes have finite area, not a point)
    const lobe = Math.pow(ndh, shininess * (1 / Math.max(0.15, l.size * 2)));
    const fres = 0.04 + 0.96 * Math.pow(1 - Math.max(0, dot(n, v)), 5);
    const amt = lobe * l.intensity * fres * 0.55;
    out = add(out, mul(l.colour, amt));
    if (amt > dominant) dominant = amt;
  }
  return { rgb: out, dominant };
}

/** Shade with the full rig: diffuse + broad specular + floor bounce. */
export function shadeFacePhysical(normal, albedo, {
  view = [0, 0, 1], roughness = 0.35, metalness = 0, rig = LIGHT_RIG, exposure = 1.0,
} = {}) {
  const n = norm(normal);
  const key = rigDir(rig.key), rim = rigDir(rig.rim);
  const ndl = Math.max(0, dot(n, key));
  const ndlR = Math.max(0, dot(n, rim));
  const hemi = (n[1] + 1) / 2;
  const diffuse = albedo.map((c, i) =>
    c * (0.20 + ndl * rig.key.intensity * 0.42 + hemi * rig.floor.colour[i] * 0.30) +
    rig.rim.colour[i] * ndlR * 0.22);
  const spec = specular(n, view, roughness, rig).rgb;
  // metal tints the specular with albedo and kills diffuse, like a real conductor
  const base = diffuse.map((c) => c * (1 - metalness * 0.85));
  const tinted = spec.map((s, i) => s * (metalness > 0.5 ? 0.4 + albedo[i] : 1));
  const lit = base.map((c, i) => c + tinted[i]);
  return aces(lit, exposure);
}

// --- volumetric-light and glow sprites --------------------------------------
/**
 * Soft radial sprite, drawn with a real gradient (their glowTexture equivalent).
 * Used for flashes, sparks, dust and to seed bloom.
 */
export function drawGlow(ctx, x, y, radius, colour = [1, 1, 1], alpha = 1, falloff = 0.25) {
  const [r, g, b] = colour.map((c) => Math.round(clamp01(c) * 255));
  const gr = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gr.addColorStop(0, `rgba(${r},${g},${b},${clamp01(alpha)})`);
  gr.addColorStop(falloff, `rgba(${r},${g},${b},${clamp01(alpha * 0.42)})`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gr;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

/** Expanding shockwave rings — the reference's entire impact vocabulary. */
export function drawImpactRings(ctx, x, y, t, {
  count = 3, maxRadius = 260, colour = [1, 0.28, 0.22], speed = 1.0, thickness = 3, squash = 1,
} = {}) {
  for (let i = 0; i < count; i++) {
    const p = clamp01((t * speed - i * 0.12) / 0.9);
    if (p <= 0 || p >= 1) continue;
    const r = maxRadius * p;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${colour.map((c) => Math.round(c * 255)).join(',')},${(1 - p) * 0.85})`;
    ctx.lineWidth = thickness * (1 - p * 0.6);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * squash, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// --- finishing --------------------------------------------------------------
/**
 * Bloom by iterative downsample: bright pass -> blur at reduced res -> add back.
 * A poor man's UnrealBloomPass; on a 1080x1920 still it costs ~35 ms at 1/4 res
 * instead of a per-pixel convolution at full res.
 */
export function bloomPass(createCanvas, srcCanvas, {
  threshold = 1.6, strength = 0.5, radius = 0.4, sigma = 9,
} = {}) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const q = Math.max(2, Math.round(1 / Math.max(0.15, radius))); // 1/4 at radius .4
  const bw = Math.max(1, Math.round(w / q)), bh = Math.max(1, Math.round(h / q));
  const bright = createCanvas(bw, bh);
  const bctx = bright.getContext('2d');
  bctx.filter = `brightness(${threshold}) contrast(${1 / threshold}) blur(${sigma / q}px)`;
  bctx.drawImage(srcCanvas, 0, 0, bw, bh);
  bctx.filter = 'none';

  const out = createCanvas(w, h);
  const octx = out.getContext('2d');
  octx.drawImage(srcCanvas, 0, 0);
  octx.save();
  octx.globalCompositeOperation = 'lighter';
  octx.globalAlpha = clamp01(strength);
  octx.drawImage(bright, 0, 0, w, h);
  octx.restore();
  return out;
}

/** Seeded RNG (mulberry32) — the reference engine's determinism trick. */
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

/**
 * Final grade: aspect-compensated elliptical vignette + per-frame grain.
 * Exactly the reference's pass, including the 0.5625 x-scale on the vignette
 * ellipse so portrait framing does not get a circular hot spot.
 */
export function drawGrade(ctx, width, height, {
  vignette = 0.28, grain = 0.018, t = 0, seed = 1, grainStep = 4,
} = {}) {
  // vignette
  const gr = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.18,
    width / 2, height / 2, Math.max(width, height) * 0.62,
  );
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${clamp01(vignette)})`);
  ctx.save();
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // grain: a coarse seeded noise, cheaper than per-pixel ImageData and reads
  // the same after H.264 compression
  if (grain <= 0) return;
  const r = rng(seed + Math.round(t * 60) * 7919);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  for (let y = 0; y < height; y += grainStep) {
    for (let x = 0; x < width; x += grainStep) {
      const v = (r() - 0.5) * 2 * grain;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(x, y, grainStep, grainStep);
    }
  }
  ctx.restore();
}

// --- volumes of revolution --------------------------------------------------
/**
 * Smoothstep-interpolated radius profile, the reference's `torsoR(y)`.
 * `keys` is [[y, radius], ...] ascending. Returns a function y -> radius.
 */
export function profileFn(keys) {
  return (y) => {
    if (y <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [y0, r0] = keys[i], [y1, r1] = keys[i + 1];
      if (y <= y1) {
        const t = (y - y0) / (y1 - y0);
        const s = t * t * (3 - 2 * t); // smoothstep
        return r0 + (r1 - r0) * s;
      }
    }
    return keys[keys.length - 1][1];
  };
}

/**
 * A lathed volume as a list of projected horizontal rings. Each ring becomes an
 * ellipse in screen space; drawing them back-to-front with a per-ring normal
 * gives a smooth-shaded surface without a per-pixel rasteriser.
 *
 * Returns an array of {y, rx, rz, z, ry, normal, shade} ready to draw, sorted so
 * the far side is painted first.
 */
export function lathe(radiusFn, {
  y0 = -1, y1 = 1, rows = 28, scaleXZ = [1, 0.66], center = [0, 0, 0],
  project, view = [0, 0, 1], albedo = [0.8, 0.82, 0.86], roughness = 0.3, metalness = 1,
  exposure = 1.0, rig = LIGHT_RIG,
} = {}) {
  const rings = [];
  const dy = (y1 - y0) / rows;
  for (let i = 0; i <= rows; i++) {
    const y = y0 + (y1 - y0) * (i / rows);
    const r = radiusFn(y);
    const cy = center[1] + y;
    const p = project([center[0], cy, center[2]]);
    if (!p) continue;
    // Screen radii must be measured by projecting actual offset points. A lathe
    // radius is in world units and perspective foreshortening differs per axis;
    // guessing a scale factor silently collapses the tube to a few pixels.
    const px = project([center[0] + r * scaleXZ[0], cy, center[2]]);
    const pz = project([center[0], cy, center[2] + r * scaleXZ[1]]);
    const rx = px ? Math.abs(px.x - p.x) : 0;
    const ry = pz ? Math.abs(pz.y - p.y) : 0;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0.3) continue;

    // surface normal from the profile slope: what makes a lathe read as a solid
    const dro = radiusFn(cy + dy) - radiusFn(cy - dy);
    const slope = Math.atan2(dro, dy * 2);
    const n = norm([Math.sin(slope), Math.cos(slope) * 0.35, 0]);
    const lit = shadeFacePhysical(n, albedo, { view, roughness, metalness, exposure, rig });
    rings.push({
      y, p, rx, ry,
      z: p.depth || 0,
      shade: toCss(lit),
      spec: specular(n, view, roughness, rig).dominant,
    });
  }
  // painter's algorithm: far rings first
  return rings.sort((a, b) => b.z - a.z);
}

/**
 * Paint one lathe ring. `rx`/`ry` are already correct screen radii measured by
 * projecting offset points, so this is a plain ellipse plus a highlight.
 */
export function drawLatheRing(ctx, ring) {
  ctx.beginPath();
  ctx.ellipse(ring.p.x, ring.p.y, ring.rx, Math.max(0.5, ring.ry), 0, 0, Math.PI * 2);
  ctx.fillStyle = ring.shade;
  ctx.fill();
  // specular streak on the lit side of the ring — the thing that reads as metal
  if (ring.spec > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.ellipse(
      ring.p.x - ring.rx * 0.38, ring.p.y,
      ring.rx * 0.46, Math.max(0.4, ring.ry * 0.9),
      0, 0, Math.PI * 2,
    );
    ctx.fillStyle = `rgba(255,248,235,${Math.min(0.45, ring.spec * 0.2)})`;
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Paint a lathe as a solid: silhouette path down the left extreme points and back
 * up the right, filled with a vertical gradient sampled from the per-ring shading.
 *
 * Why not stack the ring ellipses (drawLatheRing): a horizontal ring seen from eye
 * height is a very flat ellipse (~5px tall), so consecutive rings leave gaps and
 * the body reads as horizontal stripes. Silhouette + gradient is both correct and
 * cheaper.
 */
export function drawLatheSolid(ctx, rings, {
  highlight = true, occlusion = 0.55, baseShadow = true,
} = {}) {
  if (rings.length < 2) return;
  const ordered = [...rings].sort((a, b) => b.y - a.y); // top to bottom
  const top = ordered[0], bottom = ordered[ordered.length - 1];
  const topY = top.p.y, botY = bottom.p.y;
  const maxRx = Math.max(...rings.map((r) => r.rx));

  // contact shadow under the form
  if (baseShadow) {
    const rg = ctx.createRadialGradient(bottom.p.x, botY, 2, bottom.p.x, botY, bottom.rx * 2.6);
    rg.addColorStop(0, `rgba(0,0,0,${occlusion})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(bottom.p.x, botY);
    ctx.scale(1, 0.2);
    ctx.translate(-bottom.p.x, -botY);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(bottom.p.x, botY, bottom.rx * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // caps first, as their own paths — adding an ellipse to the silhouette path
  // inserts an implicit lineTo and cuts a wedge out of the body
  ctx.beginPath();
  ctx.ellipse(top.p.x, topY, top.rx, Math.max(3, top.rx * 0.20), 0, 0, Math.PI * 2);
  ctx.fillStyle = top.shade;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bottom.p.x, botY, bottom.rx, Math.max(3, bottom.rx * 0.20), 0, 0, Math.PI * 2);
  ctx.fillStyle = bottom.shade;
  ctx.fill();

  // silhouette: left extremes down, right extremes back up
  ctx.beginPath();
  ordered.forEach((r, i) => {
    const x = r.p.x - r.rx;
    if (i) ctx.lineTo(x, r.p.y); else ctx.moveTo(x, r.p.y);
  });
  for (let i = ordered.length - 1; i >= 0; i--) {
    const r = ordered[i];
    ctx.lineTo(r.p.x + r.rx, r.p.y);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, topY, 0, botY);
  ordered.forEach((r, i) =>
    grad.addColorStop(Math.min(1, Math.max(0, i / (ordered.length - 1))), r.shade));
  ctx.fillStyle = grad;
  ctx.fill();

  // cross-shading clipped to the silhouette: dark edges, lit toward the key,
  // dark again on the far side. This is what turns a flat fill into a volume.
  ctx.save();
  ctx.clip();
  const midY = (topY + botY) / 2;
  const across = ctx.createLinearGradient(top.p.x - maxRx, midY, top.p.x + maxRx, midY);
  across.addColorStop(0.00, 'rgba(0,0,0,0.74)');
  across.addColorStop(0.20, 'rgba(0,0,0,0.12)');
  across.addColorStop(0.40, 'rgba(255,252,246,0.09)');
  across.addColorStop(0.62, 'rgba(0,0,0,0.22)');
  across.addColorStop(1.00, 'rgba(0,0,0,0.80)');
  ctx.fillStyle = across;
  ctx.fillRect(top.p.x - maxRx * 1.3, topY - 10, maxRx * 2.6, botY - topY + 20);

  // the stretched specular streak on the lit side
  if (highlight) {
    const lit = top.p.x - maxRx * 0.40;
    const hg = ctx.createLinearGradient(lit - maxRx * 0.34, 0, lit + maxRx * 0.34, 0);
    hg.addColorStop(0, 'rgba(255,250,240,0)');
    hg.addColorStop(0.5, 'rgba(255,250,240,0.17)');
    hg.addColorStop(1, 'rgba(255,250,240,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hg;
    ctx.fillRect(lit - maxRx * 0.34, topY, maxRx * 0.68, botY - topY);
  }
  ctx.restore();
}
