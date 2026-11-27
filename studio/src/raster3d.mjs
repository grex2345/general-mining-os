/**
 * raster3d.mjs — a software 3D rasteriser with a G-buffer and deferred shading.
 *
 * WHY THIS EXISTS. The Round 5 renderer (lowpoly.mjs) is a painter's-algorithm
 * flat shader: no z-buffer, one colour per polygon, no smooth normals, no
 * shadows, no per-pixel anything. That is exactly why Round 5 reads as
 * "stylised low-poly": every one of those omissions is visible as a hard facet
 * and a flat colour field. No amount of extra geometry fixes it, because the
 * limitation is the shading model, not the mesh.
 *
 * The target style (reference: zach-3d-films / the supplied `image-3.png`) is
 * smooth-shaded with soft gradients, contact shadows, ambient occlusion and
 * clean anti-aliased edges. So Round 6 replaces the rasterisation core.
 *
 * MEASURED BEFORE BUILDING (2 cores, no GPU):
 *   - flat fill, 2 992 tris, 420x747 .............. 10.9 ms/frame
 *   - per-pixel N.L + shadow lookup, same ......... 18.4 ms/frame
 * So full per-pixel shading with a shadow map costs ~7 ms more than flat
 * shading. The old 853-1 059 ms/frame was never spent on shading — it was spent
 * on per-face polygon fill and painter sorting with thousands of overlapping
 * quads. A z-buffer removes that entirely.
 *
 * PIPELINE
 *   1. geometry pass  -> G-buffer (depth, view normal, albedo, material, world)
 *   2. shadow pass    -> one depth map per light, rendered from the light
 *   3. shading pass   -> per-pixel PBR-ish: key + sky/ground ambient + SSAO +
 *                        PCF shadow + GGX specular + rim + fog
 *   4. resolve        -> box-filter downsample (SSAA), ACES tonemap, to canvas
 *
 * Everything is typed-array based. No allocation inside the per-frame loops.
 */

import { createCanvas } from '@napi-rs/canvas';

/* ------------------------------------------------------------- small vectors */

export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vlerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/* ----------------------------------------------------------------- matrices */

/** 4x4 column-major, like OpenGL. */
export const mat4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
  translate(x, y, z) {
    const m = mat4.identity(); m[12] = x; m[13] = y; m[14] = z; return m;
  },
  scale(x, y, z) {
    const m = mat4.identity(); m[0] = x; m[5] = y; m[10] = z; return m;
  },
  /** Rotation from a 3x3 row-major matrix laid out as [m00,m01,m02, m10,...]. */
  fromMat3(m3, o = [0, 0, 0]) {
    return new Float32Array([
      m3[0], m3[3], m3[6], 0,
      m3[1], m3[4], m3[7], 0,
      m3[2], m3[5], m3[8], 0,
      o[0], o[1], o[2], 1,
    ]);
  },
  /** General 4x4 inverse. Used for inverse-bind matrices (once, at bind time). */
  invert(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return mat4.identity();
    det = 1 / det;
    return new Float32Array([
      (a11 * b11 - a12 * b10 + a13 * b09) * det,
      (a02 * b10 - a01 * b11 - a03 * b09) * det,
      (a31 * b05 - a32 * b04 + a33 * b03) * det,
      (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det,
      (a00 * b11 - a02 * b08 + a03 * b07) * det,
      (a32 * b02 - a30 * b05 - a33 * b01) * det,
      (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det,
      (a01 * b08 - a00 * b10 - a03 * b06) * det,
      (a30 * b04 - a31 * b02 + a33 * b00) * det,
      (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det,
      (a00 * b09 - a01 * b07 + a02 * b06) * det,
      (a31 * b01 - a30 * b03 - a32 * b00) * det,
      (a20 * b03 - a21 * b01 + a22 * b00) * det,
    ]);
  },
  /** Transform a point (w=1). */
  point(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  },
  /** Transform a direction (w=0), i.e. rotation only. */
  dir(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
    ];
  },
};

/* ------------------------------------------------------------------- camera */

/**
 * A pinhole camera in view space looking down +Z, which is the convention the
 * rest of this file uses (so `depth` is simply the interpolated view z).
 */
export function makeCamera({ eye, target, fovDeg = 50, width = 540, height = 960, roll = 0 }) {
  const fwd = vnorm(vsub(target, eye));
  let right = vnorm(vcross(fwd, [0, 1, 0]));
  let up = vcross(right, fwd);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = vadd(vmul(right, c), vmul(up, s));
    const u2 = vsub(vmul(up, c), vmul(right, s));
    right = r2; up = u2;
  }
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);

  const cam = {
    eye, target, fwd, right, up, fovDeg, width, height, f, roll,
    rebase() {
      const o = makeCamera({ eye: cam.eye, target: cam.target, fovDeg: cam.fovDeg, width: cam.width, height: cam.height, roll: cam.roll });
      cam.fwd = o.fwd; cam.right = o.right; cam.up = o.up; cam.f = o.f;
      return cam;
    },
    /** world -> view (camera space, +Z forward) */
    toView(p) {
      const d = vsub(p, cam.eye);
      return [vdot(d, right), vdot(d, up), vdot(d, fwd)];
    },
    /** world -> screen pixels + view depth */
    project(p) {
      const v = cam.toView(p);
      if (v[2] <= 0.02) return null;
      const half = height / 2;
      return [width / 2 + (v[0] / v[2]) * f * half, half - (v[1] / v[2]) * f * half, v[2]];
    },
    /** screen pixel + view depth -> world */
    unproject(x, y, z) {
      const half = height / 2;
      const vx = ((x - width / 2) / (f * half)) * z;
      const vy = ((half - y) / (f * half)) * z;
      return vadd(cam.eye, vadd(vadd(vmul(right, vx), vmul(up, vy)), vmul(fwd, z)));
    },
  };
  return cam;
}

/* ---------------------------------------------------------------------- mesh */

/**
 * A mesh is flat typed arrays so the geometry pass touches contiguous memory.
 * The material index is per-triangle: a character is one mesh with skin and
 * cloth and eye materials, not a hundred draw calls.
 */
export function createMesh({ pos, nrm, uv = null, idx, mat = null, weights = null, bones = null }) {
  return {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    uv: uv ? Float32Array.from(uv) : null,
    idx: Uint32Array.from(idx),
    mat: mat ? Uint16Array.from(mat) : null,
    count: pos.length / 3,
    tris: idx.length / 3,
    // skinning: up to 4 influences per vertex
    weights: weights ? Float32Array.from(weights) : null,
    bones: bones ? Uint16Array.from(bones) : null,
    bindInv: null,      // Float32Array of 16 * nbones, filled by bind()
    /* Material indices are remapped into the frame's shared palette on first
     * use. Whatever mesh.mat array was handed in is NOT modified: the earlier
     * version rewrote it in place, so rendering the same mesh twice (or two
     * meshes that shared a material array) remapped indices that were already
     * mapped, and every triangle fell out of palette range. That surfaced as an
     * entire ground plane rendering with material 17 of 18 — black. */
    remapFrom: null,    // original Uint16Array indices, if a remap has happened
    remapTable: null,   // palette index for each original material id
  };
}

/** Concatenate meshes, offsetting indices and material ids. */
export function mergeMeshes(list) {
  let nv = 0, nt = 0, hasUv = false, skinned = false;
  for (const m of list) { nv += m.count; nt += m.tris; if (m.uv) hasUv = true; if (m.weights) skinned = true; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
  const uv = hasUv ? new Float32Array(nv * 2) : null;
  const idx = new Uint32Array(nt * 3), mat = new Uint16Array(nt);
  const weights = skinned ? new Float32Array(nv * 4) : null;
  const bones = skinned ? new Uint16Array(nv * 4) : null;
  let vo = 0, to = 0;
  for (const m of list) {
    pos.set(m.pos, vo * 3); nrm.set(m.nrm, vo * 3);
    if (uv) {
      if (m.uv) uv.set(m.uv, vo * 2);
      // else leave zeros (a valid UV for a flat-colour material)
    }
    if (weights && m.weights) { weights.set(m.weights, vo * 4); bones.set(m.bones, vo * 4); }
    for (let i = 0; i < m.idx.length; i++) idx[to * 3 + i] = m.idx[i] + vo;
    if (m.mat) mat.set(m.mat, to);
    vo += m.count; to += m.tris;
  }
  return fixWinding(createMesh({ pos, nrm, uv, idx, mat, weights, bones }));
}

/**
 * Make every triangle's winding agree with its vertex normals.
 *
 * The rasteriser culls back faces, so one mesh built with the opposite winding
 * silently loses half its surface and shows its interior instead. That happened
 * to the Round 6 torso and read as a patchwork of holes. Rather than hunt the
 * convention in every primitive, this pass checks each triangle against the
 * average of its vertex normals and swaps two indices when they disagree. It is
 * a few milliseconds once at build time.
 */
export function fixWinding(mesh) {
  const { idx, pos, nrm } = mesh;
  let flipped = 0;
  for (let t = 0; t < mesh.tris; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const ax = pos[i1 * 3] - pos[i0 * 3], ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1], az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
    const bx = pos[i2 * 3] - pos[i0 * 3], by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1], bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const nx = nrm[i0 * 3] + nrm[i1 * 3] + nrm[i2 * 3];
    const ny = nrm[i0 * 3 + 1] + nrm[i1 * 3 + 1] + nrm[i2 * 3 + 1];
    const nz = nrm[i0 * 3 + 2] + nrm[i1 * 3 + 2] + nrm[i2 * 3 + 2];
    if (cx * nx + cy * ny + cz * nz < 0) {
      idx[t * 3 + 1] = i2;
      idx[t * 3 + 2] = i1;
      flipped++;
    }
  }
  mesh._flipped = flipped;
  return mesh;
}

/* --------------------------------------------------------------- primitives */

/**
 * A UV sphere with ANALYTIC normals. This is the single most important change
 * from Round 5: normals are per-vertex and smooth, so the shading gradient is
 * continuous instead of one flat tone per facet.
 */
export function sphere({ centre = [0, 0, 0], radii = [0.1, 0.1, 0.1], seg = 24, rings = 16, mat = 0, deform = null }) {
  const pos = [], nrm = [], uv = [], idx = [], mats = [];
  const P = (th, ph) => {
    const st = Math.sin(ph);
    let p = [Math.cos(th) * st, Math.cos(ph), Math.sin(th) * st];
    if (deform) p = deform(p, th, ph);
    return p;
  };
  for (let j = 0; j <= rings; j++) {
    const ph = (j / rings) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const n = P(th, ph);
      pos.push(centre[0] + n[0] * radii[0], centre[1] + n[1] * radii[1], centre[2] + n[2] * radii[2]);
      // analytic normal is the unit sphere direction divided by the radii
      const nx = n[0] / radii[0], ny = n[1] / radii[1], nz = n[2] / radii[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / l, ny / l, nz / l);
      uv.push(i / seg, 1 - j / rings);
    }
  }
  const row = seg + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b); mats.push(mat);
      idx.push(b, c, d); mats.push(mat);
    }
  }
  return fixWinding(createMesh({ pos, nrm, uv, idx, mat: mats }));
}

/**
 * A tapered tube along a path, with rounded caps. Used for limbs and fingers;
 * the cap rings are generated as hemispheres so a hand reads as organic rather
 * than as a cylinder with a disc on the end.
 */
export function tube({ path, radii, seg = 16, capStart = true, capEnd = true, mat = 0, nrmScale = 1 }) {
  const pos = [], nrm = [], uv = [], idx = [], mats = [];
  const N = path.length;
  // per-point frames, using a parallel-transport frame so the tube does not twist
  const tangents = [];
  for (let i = 0; i < N; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(N - 1, i + 1)];
    tangents.push(vnorm(vsub(b, a)));
  }
  let ref = Math.abs(tangents[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = tangents[i];
    let u = vnorm(vcross(t, ref));
    if (vlen(vcross(t, ref)) < 1e-4) u = vnorm(vcross(t, [1, 0, 0]));
    const v = vcross(t, u);
    frames.push([u, v]);
    ref = u;
  }

  const rings = [];
  // start cap: a hemisphere swept from the axis to the first ring
  if (capStart) {
    const CAP = 4;
    const c = path[0], r = radii[0], t = tangents[0];
    for (let k = CAP; k >= 1; k--) {
      const a = (k / CAP) * (Math.PI / 2);
      const rad = Math.sin(a) * r, off = Math.cos(a) * r;
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        const dir = vadd(vmul(frames[0][0], Math.cos(th)), vmul(frames[0][1], Math.sin(th)));
        ring.push({
          p: vadd(vadd(c, vmul(t, -off)), vmul(dir, rad)),
          n: vnorm(vadd(vmul(t, -Math.cos(a)), vmul(dir, Math.sin(a)))),
        });
      }
      rings.push(ring);
    }
  }
  for (let i = 0; i < N; i++) {
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const dir = vadd(vmul(frames[i][0], Math.cos(th)), vmul(frames[i][1], Math.sin(th)));
      ring.push({ p: vadd(path[i], vmul(dir, radii[i])), n: dir });
    }
    rings.push(ring);
  }
  if (capEnd) {
    const CAP = 4;
    const c = path[N - 1], r = radii[N - 1], t = tangents[N - 1];
    for (let k = 1; k <= CAP; k++) {
      const a = (k / CAP) * (Math.PI / 2);
      const rad = Math.sin(a) * r, off = Math.cos(a) * r;
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        const dir = vadd(vmul(frames[N - 1][0], Math.cos(th)), vmul(frames[N - 1][1], Math.sin(th)));
        ring.push({
          p: vadd(vadd(c, vmul(t, off)), vmul(dir, rad)),
          n: vnorm(vadd(vmul(t, Math.cos(a)), vmul(dir, Math.sin(a)))),
        });
      }
      rings.push(ring);
    }
  }

  for (let k = 0; k < rings.length; k++) {
    for (let j = 0; j < seg; j++) {
      const p = rings[k][j];
      pos.push(p.p[0], p.p[1], p.p[2]);
      nrm.push(p.n[0] * nrmScale, p.n[1] * nrmScale, p.n[2] * nrmScale);
      uv.push(j / seg, k / (rings.length - 1));
    }
  }
  const row = seg;
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = k * row + j, b = k * row + j2, c = (k + 1) * row + j, d = (k + 1) * row + j2;
      idx.push(a, c, b); mats.push(mat);
      idx.push(b, c, d); mats.push(mat);
    }
  }
  return fixWinding(createMesh({ pos, nrm, uv, idx, mat: mats }));
}

/**
 * Loft a shaped cross-section along a spine. Unlike `tube`, the cross-section
 * can be elliptical (rx != rz) and can be offset per station, which is what a
 * torso, a thigh or a neck actually needs. `stations` is
 *   [{ at:[x,y,z], rx, rz, rot?, squash? }]
 * and the surface is closed with hemispherical caps.
 */
export function loft({ stations, seg = 24, mat = 0, capStart = true, capEnd = true }) {
  const N = stations.length;
  const pos = [], nrm = [], uv = [], idx = [], mats = [];
  // spine tangents
  const tan = [];
  for (let i = 0; i < N; i++) {
    const a = stations[Math.max(0, i - 1)].at, b = stations[Math.min(N - 1, i + 1)].at;
    tan.push(vnorm(vsub(b, a)));
  }
  const rings = [];
  for (let i = 0; i < N; i++) {
    const st = stations[i];
    const t = tan[i];
    const rot = st.rot || 0;
    let u = vnorm([Math.cos(rot), 0, Math.sin(rot)]);
    // make u perpendicular to the tangent
    u = vnorm(vsub(u, vmul(t, u[0] * t[0] + u[1] * t[1] + u[2] * t[2])));
    const v = vcross(t, u);
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const p = vadd(st.at, vadd(vmul(u, c * st.rx), vmul(v, sn * st.rz)));
      // normal of an ellipse: (c/rx, s/rz) normalised, in the ring frame
      const n = vnorm(vadd(vmul(u, c / st.rx), vmul(v, sn / st.rz)));
      ring.push({ p, n });
    }
    rings.push(ring);
  }
  // caps: shrink the end rings toward the axis along the tangent
  const CAPR = 4;
  const mkCap = (i, dirSign) => {
    const st = stations[i], t = tan[i];
    const ring0 = rings[i];
    const out = [];
    for (let k = 1; k <= CAPR; k++) {
      const a = (k / CAPR) * (Math.PI / 2);
      const sc = Math.cos(a);
      const ring = ring0.map((q, j) => {
        const off = vsub(q.p, st.at);
        return {
          p: vadd(vadd(st.at, vmul(t, dirSign * Math.sin(a) * (st.rx + st.rz) * 0.5)), vmul(off, sc)),
          n: vnorm(vadd(vmul(t, dirSign * Math.sin(a)), vmul(q.n, sc))),
        };
      });
      out.push(ring);
    }
    return out;
  };
  const all = [];
  if (capStart) all.push(...mkCap(0, -1).reverse());
  all.push(...rings);
  if (capEnd) all.push(...mkCap(N - 1, 1));

  for (const ring of all) {
    for (const q of ring) { pos.push(q.p[0], q.p[1], q.p[2]); nrm.push(q.n[0], q.n[1], q.n[2]); uv.push(0, 0); }
  }
  for (let k = 0; k < all.length - 1; k++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = k * seg + j, b = k * seg + j2, c = (k + 1) * seg + j, d = (k + 1) * seg + j2;
      idx.push(a, c, b); mats.push(mat);
      idx.push(b, c, d); mats.push(mat);
    }
  }
  return fixWinding(createMesh({ pos, nrm, uv, idx, mat: mats }));
}

/** A rounded box: the workhorse for stylised props and cloth. */
export function rbox({ centre = [0, 0, 0], size = [1, 1, 1], radius = 0.04, seg = 8, mat = 0, quat = null }) {
  // built as a sphere with a per-axis "squarified" deform, which gives rounded
  // corners for free and keeps the normals analytic in the same way
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const r = Math.min(radius, Math.min(hx, hy, hz));
  const k = 4; // exponent: larger = squarer
  const m = sphere({
    radii: [1, 1, 1], seg: seg * 2, rings: seg,
    mat,
    deform: (p) => {
      const s = (x) => Math.sign(x) * Math.pow(Math.abs(x), 2 / k);
      return [s(p[0]), s(p[1]), s(p[2])];
    },
  });
  // scale to the box's half-extents minus the corner radius, then displace along
  // the (smooth) normal by the corner radius
  for (let i = 0; i < m.count; i++) {
    const n = [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]];
    const p = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    const ex = [hx - r, hy - r, hz - r];
    m.pos[i * 3] = p[0] * ex[0] + n[0] * r + centre[0];
    m.pos[i * 3 + 1] = p[1] * ex[1] + n[1] * r + centre[1];
    m.pos[i * 3 + 2] = p[2] * ex[2] + n[2] * r + centre[2];
  }
  // recompute normals from the deformed surface is unnecessary: the sphere
  // normal rotated into the box's stretch is close enough, and a shared normal
  // keeps the corner highlight continuous
  return m;
}

/* ------------------------------------------------------------------ material */

/**
 * Materials are plain objects. `sss` is a cheap wrap-diffuse approximation: it
 * softens the terminator on skin so the light does not die abruptly at the
 * edge of the face, which is the single biggest reason CG skin reads as plastic.
 */
export function material(o) {
  return {
    albedo: o.albedo ?? [0.6, 0.55, 0.5],
    rough: o.rough ?? 0.65,
    metal: o.metal ?? 0,
    sss: o.sss ?? 0,
    emis: o.emis ?? [0, 0, 0],
    spec: o.spec ?? 1,
    wrap: o.wrap ?? 0,
    sheen: o.sheen ?? 0,
    tex: o.tex ?? null,       // optional (u,v) -> [r,g,b] multiplier
    alpha: o.alpha ?? 1,
    doubleSided: o.doubleSided ?? false,
  };
}

/* ------------------------------------------------------------------- lights */

export const light = {
  sun: ({ dir = [0.3, 0.7, 0.5], colour = [1, 0.97, 0.92], intensity = 1 } = {}) => ({
    kind: 'dir', dir: vnorm(dir), colour, intensity, shadow: true,
  }),
  point: ({ pos, colour = [1, 1, 1], intensity = 1, radius = 2, shadow = false } = {}) => ({
    kind: 'point', pos, colour, intensity, radius, shadow,
  }),
};

/* ---------------------------------------------------------------- internals */

const _proj = { x: 0, y: 0, z: 0, ok: false };

/**
 * Transform + project every vertex of a mesh into screen space.
 * `skin` is optional: { palette: Float32Array(16*n), bones: Uint16Array, weights: Float32Array }.
 */
function transformMesh(mesh, cam, out, skin) {
  const n = mesh.count;
  const sx = out.sx, sy = out.sy, sz = out.sz;
  const wx = out.wx, wy = out.wy, wz = out.wz;
  const nx = out.nx, ny = out.ny, nz = out.nz;
  const { eye, right, up, fwd, f, width, height } = cam;
  const half = height / 2;
  const hw = width / 2;

  for (let i = 0; i < n; i++) {
    let px = mesh.pos[i * 3], py = mesh.pos[i * 3 + 1], pz = mesh.pos[i * 3 + 2];
    let vnx = mesh.nrm[i * 3], vny = mesh.nrm[i * 3 + 1], vnz = mesh.nrm[i * 3 + 2];

    if (skin) {
      const w0 = mesh.weights[i * 4], w1 = mesh.weights[i * 4 + 1];
      const w2 = mesh.weights[i * 4 + 2], w3 = mesh.weights[i * 4 + 3];
      const b0 = mesh.bones[i * 4] * 16, b1 = mesh.bones[i * 4 + 1] * 16;
      const b2 = mesh.bones[i * 4 + 2] * 16, b3 = mesh.bones[i * 4 + 3] * 16;
      const P = skin.palette;
      let x = 0, y = 0, z = 0, ax = 0, ay = 0, az = 0;
      if (w0 > 0) {
        x += w0 * (P[b0] * px + P[b0 + 4] * py + P[b0 + 8] * pz + P[b0 + 12]);
        y += w0 * (P[b0 + 1] * px + P[b0 + 5] * py + P[b0 + 9] * pz + P[b0 + 13]);
        z += w0 * (P[b0 + 2] * px + P[b0 + 6] * py + P[b0 + 10] * pz + P[b0 + 14]);
        ax += w0 * (P[b0] * vnx + P[b0 + 4] * vny + P[b0 + 8] * vnz);
        ay += w0 * (P[b0 + 1] * vnx + P[b0 + 5] * vny + P[b0 + 9] * vnz);
        az += w0 * (P[b0 + 2] * vnx + P[b0 + 6] * vny + P[b0 + 10] * vnz);
      }
      if (w1 > 0) {
        x += w1 * (P[b1] * px + P[b1 + 4] * py + P[b1 + 8] * pz + P[b1 + 12]);
        y += w1 * (P[b1 + 1] * px + P[b1 + 5] * py + P[b1 + 9] * pz + P[b1 + 13]);
        z += w1 * (P[b1 + 2] * px + P[b1 + 6] * py + P[b1 + 10] * pz + P[b1 + 14]);
        ax += w1 * (P[b1] * vnx + P[b1 + 4] * vny + P[b1 + 8] * vnz);
        ay += w1 * (P[b1 + 1] * vnx + P[b1 + 5] * vny + P[b1 + 9] * vnz);
        az += w1 * (P[b1 + 2] * vnx + P[b1 + 6] * vny + P[b1 + 10] * vnz);
      }
      if (w2 > 0) {
        x += w2 * (P[b2] * px + P[b2 + 4] * py + P[b2 + 8] * pz + P[b2 + 12]);
        y += w2 * (P[b2 + 1] * px + P[b2 + 5] * py + P[b2 + 9] * pz + P[b2 + 13]);
        z += w2 * (P[b2 + 2] * px + P[b2 + 6] * py + P[b2 + 10] * pz + P[b2 + 14]);
        ax += w2 * (P[b2] * vnx + P[b2 + 4] * vny + P[b2 + 8] * vnz);
        ay += w2 * (P[b2 + 1] * vnx + P[b2 + 5] * vny + P[b2 + 9] * vnz);
        az += w2 * (P[b2 + 2] * vnx + P[b2 + 6] * vny + P[b2 + 10] * vnz);
      }
      if (w3 > 0) {
        x += w3 * (P[b3] * px + P[b3 + 4] * py + P[b3 + 8] * pz + P[b3 + 12]);
        y += w3 * (P[b3 + 1] * px + P[b3 + 5] * py + P[b3 + 9] * pz + P[b3 + 13]);
        z += w3 * (P[b3 + 2] * px + P[b3 + 6] * py + P[b3 + 10] * pz + P[b3 + 14]);
        ax += w3 * (P[b3] * vnx + P[b3 + 4] * vny + P[b3 + 8] * vnz);
        ay += w3 * (P[b3 + 1] * vnx + P[b3 + 5] * vny + P[b3 + 9] * vnz);
        az += w3 * (P[b3 + 2] * vnx + P[b3 + 6] * vny + P[b3 + 10] * vnz);
      }
      px = x; py = y; pz = z; vnx = ax; vny = ay; vnz = az;
    } else if (mesh.model) {
      const M = mesh.model;
      px = M[0] * mesh.pos[i * 3] + M[4] * mesh.pos[i * 3 + 1] + M[8] * mesh.pos[i * 3 + 2] + M[12];
      py = M[1] * mesh.pos[i * 3] + M[5] * mesh.pos[i * 3 + 1] + M[9] * mesh.pos[i * 3 + 2] + M[13];
      pz = M[2] * mesh.pos[i * 3] + M[6] * mesh.pos[i * 3 + 1] + M[10] * mesh.pos[i * 3 + 2] + M[14];
      const ax0 = M[0] * vnx + M[4] * vny + M[8] * vnz;
      const ay0 = M[1] * vnx + M[5] * vny + M[9] * vnz;
      const az0 = M[2] * vnx + M[6] * vny + M[10] * vnz;
      vnx = ax0; vny = ay0; vnz = az0;
    }

    wx[i] = px; wy[i] = py; wz[i] = pz;

    const dx = px - eye[0], dy = py - eye[1], dz = pz - eye[2];
    const vz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
    sz[i] = vz;
    if (vz <= 0.02) { sx[i] = 1e9; sy[i] = 1e9; continue; }
    const vx = dx * right[0] + dy * right[1] + dz * right[2];
    const vy = dx * up[0] + dy * up[1] + dz * up[2];
    sx[i] = hw + (vx / vz) * f * half;
    sy[i] = half - (vy / vz) * f * half;
    // normal -> view space, kept for the shading pass
    nx[i] = vnx * right[0] + vny * right[1] + vnz * right[2];
    ny[i] = vnx * up[0] + vny * up[1] + vnz * up[2];
    nz[i] = vnx * fwd[0] + vny * fwd[1] + vnz * fwd[2];
  }
}

function makeScratch(mesh) {
  return {
    sx: new Float32Array(mesh.count), sy: new Float32Array(mesh.count), sz: new Float32Array(mesh.count),
    wx: new Float32Array(mesh.count), wy: new Float32Array(mesh.count), wz: new Float32Array(mesh.count),
    nx: new Float32Array(mesh.count), ny: new Float32Array(mesh.count), nz: new Float32Array(mesh.count),
    cache: null,
  };
}

/** 0..1 linear albedo -> 0xRRGGBB (8 bit is ample for a reflectance colour). */
export function packAlbedo(a) {
  const r = Math.min(255, Math.max(0, Math.round(a[0] * 255)));
  const g = Math.min(255, Math.max(0, Math.round(a[1] * 255)));
  const b = Math.min(255, Math.max(0, Math.round(a[2] * 255)));
  return (r << 16) | (g << 8) | b;
}

/* ------------------------------------------------------------------ G-buffer */

export function createGBuffer(W, H) {
  const n = W * H;
  return {
    W, H, n,
    depth: new Float32Array(n).fill(1e9),
    // view-space normal. z is RECONSTRUCTED from x,y at shading time (front
    // faces only, so n.z < 0), which saves an 8 MB array and renormalises.
    nx: new Float32Array(n), ny: new Float32Array(n),
    // albedo packed as 0xRRGGBB: per-pixel colour at 8-bit precision, one array
    alb: new Uint32Array(n),
    // material properties live in a small palette indexed by this id; keeping
    // six Float32 arrays per pixel (48 MB) made the shading pass
    // memory-bandwidth bound at 200 ns/px instead of 25.
    matId: new Uint16Array(n),
    // world position: required for shadow projection and point lights
    wx: new Float32Array(n), wy: new Float32Array(n), wz: new Float32Array(n),
    clear() {
      this.depth.fill(1e9);
      this.matId.fill(0xffff);
    },
  };
}

/* --------------------------------------------------------------- shadow map */

/**
 * A single directional shadow map, rendered from the light's point of view with
 * an orthographic projection that fits the scene's bounds. This is the standard
 * solution; the important detail for quality is the normal-offset bias, which
 * avoids the acne that plagues naive depth comparison on curved surfaces.
 */
export function createShadowMap(res = 1024) {
  return { res, depth: new Float32Array(res * res).fill(1e9), lightMat: null, bias: 0.0025 };
}

function buildLightMatrix(sun, bounds, cam) {
  const L = {};
  const c = bounds.centre;
  // `sun.dir` is the direction light TRAVELS, so the light sits at -dir.
  const dir = sun.dir;
  const eye = [c[0] - dir[0] * bounds.radius * 2.2, c[1] - dir[1] * bounds.radius * 2.2, c[2] - dir[2] * bounds.radius * 2.2];
  const fwd = vnorm(vsub(c, eye));
  let right = vnorm(vcross(fwd, [0, 1, 0]));
  if (!Number.isFinite(right[0]) || vlen(vcross(fwd, [0, 1, 0])) < 1e-5) right = [1, 0, 0];
  const up = vcross(right, fwd);
  const R = bounds.radius * 1.35;
  const res = 1024;
  Object.assign(L, {
    eye, fwd, right, up,
    // scalar, allocation-free: called once per rasterised triangle vertex and
    // once per shadowed pixel, so an array return here costs seconds per frame
    ox: 0, oy: 0, oz: 0,
    toLightXYZ(px, py, pz) {
      const dx = px - eye[0], dy = py - eye[1], dz = pz - eye[2];
      L.ox = ((dx * right[0] + dy * right[1] + dz * right[2]) / (R * 2) + 0.5) * res;
      L.oy = ((dx * up[0] + dy * up[1] + dz * up[2]) / (R * 2) + 0.5) * res;
      L.oz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
      return L;
    },
    toLight(p) {
      const d = vsub(p, eye);
      return [
        (vdot(d, right) / (R * 2) + 0.5) * res,
        (vdot(d, up) / (R * 2) + 0.5) * res,
        vdot(d, fwd),
      ];
    },
    res, R,
    camR: cam ? cam.right : [1, 0, 0],
    camU: cam ? cam.up : [0, 1, 0],
    camF: cam ? cam.fwd : [0, 0, 1],
    sunDir: sun.dir,
  });
  return L;
}

function renderShadowMap(scene, sun, bounds, sm, cam) {
  sm.depth.fill(1e9);
  const L = buildLightMatrix(sun, bounds, cam);
  sm.lightMat = L;
  const res = sm.res;
  const depth = sm.depth;
  /* CASTER OFFSET — one texel, not `bias * 12`.
   *
   * This used to push every shadow-casting vertex 30 mm along its normal toward
   * the light. Measured on the character, that made the stored depth ~24 mm
   * nearer than the receiving surface, which is larger than the receiver's own
   * bias, so an 80%-lit chest compared as fully occluded and the whole body
   * went dark and blotchy. One texel is enough to stop the caster self-
   * shadowing its own depth, and it cannot fight the receiver bias. */
  const off = (2 * (sm.lightMat ? sm.lightMat.R : 1) / sm.res) * 1.0;
  for (const obj of scene) {
    /* A scene object can opt OUT of casting. The ground is 7 m across: if it
     * casts, it fills the shadow map and every character shadow is destroyed. */
    if (obj.castShadow === false) continue;
    const m = obj.mesh;
    const scratch = obj._scratch || (obj._scratch = makeScratch(m));
    // reuse the world positions from the geometry pass when available
    const hasWorld = obj._worldValid;
    for (let t = 0; t < m.tris; t++) {
      const i0 = m.idx[t * 3], i1 = m.idx[t * 3 + 1], i2 = m.idx[t * 3 + 2];
      let ax, ay, az, bx, by, bz, cx, cy, cz;
      if (hasWorld) {
        ax = scratch.wx[i0] + m.nrm[i0 * 3] * off; ay = scratch.wy[i0] + m.nrm[i0 * 3 + 1] * off; az = scratch.wz[i0] + m.nrm[i0 * 3 + 2] * off;
        bx = scratch.wx[i1] + m.nrm[i1 * 3] * off; by = scratch.wy[i1] + m.nrm[i1 * 3 + 1] * off; bz = scratch.wz[i1] + m.nrm[i1 * 3 + 2] * off;
        cx = scratch.wx[i2] + m.nrm[i2 * 3] * off; cy = scratch.wy[i2] + m.nrm[i2 * 3 + 1] * off; cz = scratch.wz[i2] + m.nrm[i2 * 3 + 2] * off;
      } else {
        continue;
      }
      const pa = L.toLight([ax, ay, az]), pb = L.toLight([bx, by, bz]), pc = L.toLight([cx, cy, cz]);
      rasterDepth(depth, res, res, pa, pb, pc);
    }
  }
  return L;
}

/** Depth-only rasterisation into a square buffer. */
function rasterDepth(buf, W, H, a, b, c) {
  const [x0, y0, z0] = a, [x1, y1, z1] = b, [x2, y2, z2] = c;
  const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  if (minx > maxx || miny > maxy) return;
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(d) < 1e-9) return;
  const inv = 1 / d;
  for (let y = miny; y <= maxy; y++) {
    const py = y + 0.5;
    const row = y * W;
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5;
      const l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) * inv;
      if (l0 < 0) continue;
      const l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) * inv;
      if (l1 < 0) continue;
      const l2 = 1 - l0 - l1;
      if (l2 < 0) continue;
      const z = l0 * z0 + l1 * z1 + l2 * z2;
      const i = row + x;
      if (z < buf[i]) buf[i] = z;
    }
  }
}

/* ---------------------------------------------------------- geometry pass */

/**
 * Rasterise every object into the G-buffer. Triangles are front-face rejected
 * using the signed screen area; the winding convention is counter-clockwise
 * from the outside, which the primitives above all follow.
 */
export function geometryPass(gb, scene, cam) {
  const { W, H, depth } = gb;
  // Hoist the G-buffer arrays: reading them as object properties inside the
  // pixel loop costs more than the arithmetic does (measured: 232 -> 96 ms).
  const gNx = gb.nx, gNy = gb.ny;
  const gAlb = gb.alb, gMat = gb.matId;
  const gWx = gb.wx, gWy = gb.wy, gWz = gb.wz;
  for (const obj of scene) {
    const m = obj.mesh;
    const scratch = obj._scratch && obj._scratch.sx.length === m.count ? obj._scratch : makeScratch(m);
    obj._scratch = scratch;
    transformMesh(m, cam, scratch, obj.skin || null);
    obj._worldValid = true;

    const mats = obj.materials;
    // albedo packed for THIS object's palette, aligned with the shared indices
    const sharedAlb = obj.albedoPacked || null;
    const SX = scratch.sx, SY = scratch.sy, SZ = scratch.sz;
    const SXW = scratch.wx, SYW = scratch.wy, SZW = scratch.wz;
    const SNX = scratch.nx, SNY = scratch.ny, SNZ = scratch.nz;
    for (let t = 0; t < m.tris; t++) {
      const i0 = m.idx[t * 3], i1 = m.idx[t * 3 + 1], i2 = m.idx[t * 3 + 2];
      const z0 = scratch.sz[i0], z1 = scratch.sz[i1], z2 = scratch.sz[i2];
      if (z0 <= 0.02 || z1 <= 0.02 || z2 <= 0.02) continue;
      const x0 = scratch.sx[i0], y0 = scratch.sy[i0];
      const x1 = scratch.sx[i1], y1 = scratch.sy[i1];
      const x2 = scratch.sx[i2], y2 = scratch.sy[i2];

      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-7) continue;          // degenerate
      const matIdT = m.mat ? m.mat[t] : 0;
      const mtlT = mats[matIdT] || mats[0];
      const mtlDoubleT = mtlT.doubleSided === true;
      // FACING TEST FROM NORMALS, NOT WINDING.
      // Screen-space winding depends on the projection's handedness and on the
      // order every primitive happens to emit its indices; getting it wrong
      // silently deletes half a mesh (that is exactly what happened to the hair
      // cap and the torso). The average view-space normal is unambiguous: the
      // camera looks down +z, so a surface faces us when its normal has a
      // negative z component.
      // Visible when the surface faces the camera: with cam.fwd pointing from
      // the eye into the scene, a front-facing surface has n.fwd < 0.
      const vnz = SNZ[i0] + SNZ[i1] + SNZ[i2];
      if (!mtlDoubleT && vnz >= 0) continue;

      const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minx > maxx || miny > maxy) continue;

      const inv = 1 / area;
      // 1/z for perspective-correct interpolation of attributes
      const q0 = 1 / z0, q1 = 1 / z1, q2 = 1 / z2;
      const matId = matIdT;
      const mtl = mtlT;
      // Indices are already in the shared palette (see the remap in render), so
      // the albedo must come from that same palette. Using the object's own
      // pre-remap table returned undefined here, which wrote albedo 0 (black)
      // for the entire ground plane.
      const albPacked = sharedAlb && matId < sharedAlb.length ? sharedAlb[matId] : packAlbedo(mtl.albedo);
      // the 12 vertex attributes this triangle needs, read once
      const n0x = SNX[i0], n0y = SNY[i0], n0z = SNZ[i0];
      const n1x = SNX[i1], n1y = SNY[i1], n1z = SNZ[i1];
      const n2x = SNX[i2], n2y = SNY[i2], n2z = SNZ[i2];
      const w0x = SXW[i0], w0y = SYW[i0], w0z = SZW[i0];
      const w1x = SXW[i1], w1y = SYW[i1], w1z = SZW[i1];
      const w2x = SXW[i2], w2y = SYW[i2], w2z = SZW[i2];

      for (let y = miny; y <= maxy; y++) {
        const py = y + 0.5;
        const row = y * W;
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5;
          const l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) * inv;
          if (l0 < -1e-6) continue;
          const l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) * inv;
          if (l1 < -1e-6) continue;
          const l2 = 1 - l0 - l1;
          if (l2 < -1e-6) continue;

          const iz = l0 * q0 + l1 * q1 + l2 * q2;
          const z = 1 / iz;
          const i = row + x;
          if (z >= depth[i]) continue;
          depth[i] = z;
          // perspective-correct weights
          const w0 = l0 * q0 * z, w1 = l1 * q1 * z, w2 = l2 * q2 * z;

          const nxx = w0 * n0x + w1 * n1x + w2 * n2x;
          const nyy = w0 * n0y + w1 * n1y + w2 * n2y;
          const nzz = w0 * n0z + w1 * n1z + w2 * n2z;
          // Normalise the FULL 3D normal. Normalising only x and y (an earlier
          // version did exactly that) forces nx^2+ny^2 = 1, so the reconstructed
          // nz is always 0: every surface then shades as if it were edge-on,
          // which showed up as lengthwise bands down every limb.
          const ir = 1 / (Math.sqrt(nxx * nxx + nyy * nyy + nzz * nzz) + 1e-9);
          gNx[i] = nxx * ir; gNy[i] = nyy * ir;
          gAlb[i] = albPacked;
          gMat[i] = matId;
          gWx[i] = w0 * w0x + w1 * w1x + w2 * w2x;
          gWy[i] = w0 * w0y + w1 * w1y + w2 * w2y;
          gWz[i] = w0 * w0z + w1 * w1z + w2 * w2z;
        }
      }
    }
  }
}

/* ----------------------------------------------------------- shading pass */

/** ACES filmic curve (Narkowicz fit) — cheap and it keeps highlights from clipping to white. */
function aces(x) {
  return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
}

/**
 * Screen-space ambient occlusion from the depth buffer. This is a deliberately
 * small kernel: 8 taps on a spiral, radius scaled by depth. It is what stops a
 * character floating above the ground, and it darkens the eye sockets, the
 * nostrils and the folds under the jaw without any extra geometry.
 */
function computeAOHalf(gb, out, AW, AH, { radiusWorld = 0.20, strength = 1.25, samples = 12, f = 900, height = 1000 } = {}) {
  const gbW = gb.W, gbH = gb.H, depth = gb.depth;
  const GA = 2.399963229728653;
  const SX = new Float32Array(samples), SY = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const r2 = Math.sqrt((i + 0.5) / samples);
    SX[i] = Math.cos(i * GA) * r2;
    SY[i] = Math.sin(i * GA) * r2;
  }
  const tmp = new Float32Array(AW * AH);
  const half = height / 2;
  const stepX = gbW / AW, stepY = gbH / AH;

  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      const cx = (x * stepX) | 0, cy = (y * stepY) | 0;
      const zc = depth[cy * gbW + cx];
      if (zc > 1e8) { tmp[y * AW + x] = 1; continue; }
      const rp = Math.min(90, Math.max(4, (radiusWorld * f * half) / zc));
      let occ = 0;
      for (let t = 0; t < samples; t++) {
        const ix = (cx + SX[t] * rp) | 0, iy = (cy + SY[t] * rp) | 0;
        if (ix < 1 || iy < 1 || ix >= gbW - 1 || iy >= gbH - 1) continue;
        const dz = zc - depth[iy * gbW + ix];
        if (dz > 0.004 && dz < radiusWorld * 1.7) occ += 1 - dz / (radiusWorld * 1.7);
      }
      tmp[y * AW + x] = Math.max(0, 1 - (occ / samples) * strength);
    }
  }
  const blurH = (src, dst, r) => {
    const inv = 1 / (r * 2 + 1);
    for (let y = 0; y < AH; y++) {
      const row = y * AW;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + Math.min(AW - 1, Math.max(0, x))];
      for (let x = 0; x < AW; x++) {
        dst[row + x] = sum * inv;
        sum += src[row + Math.min(AW - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
  };
  const blurV = (src, dst, r) => {
    const inv = 1 / (r * 2 + 1);
    for (let x = 0; x < AW; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += src[Math.min(AH - 1, Math.max(0, y)) * AW + x];
      for (let y = 0; y < AH; y++) {
        dst[y * AW + x] = sum * inv;
        sum += src[Math.min(AH - 1, y + r + 1) * AW + x] - src[Math.max(0, y - r) * AW + x];
      }
    }
  };
  blurH(tmp, out, 2);
  blurV(out, tmp, 2);
  for (let i = 0; i < AW * AH; i++) out[i] = out[i] * 0.80 + Math.min(out[i], tmp[i]) * 0.20;
}

function upsampleAO(src, dst, AW, AH, W, H) {
  const sx = AW / W, sy = AH / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(AH - 1.001, y * sy - 0.5);
    const y0 = fy < 0 ? 0 : fy | 0;
    const y1 = Math.min(AH - 1, y0 + 1);
    const ty = fy - y0 < 0 ? 0 : Math.min(1, fy - y0);
    for (let x = 0; x < W; x++) {
      const fx = Math.min(AW - 1.001, x * sx - 0.5);
      const x0 = fx < 0 ? 0 : fx | 0;
      const x1 = Math.min(AW - 1, x0 + 1);
      const tx = fx - x0 < 0 ? 0 : Math.min(1, fx - x0);
      const a = src[y0 * AW + x0], b = src[y0 * AW + x1];
      const c = src[y1 * AW + x0], d = src[y1 * AW + x1];
      dst[y * W + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
}

/**
 * The deferred shading pass. One traversal of the G-buffer, one RGB triple per
 * pixel. `lights` is a list from `light.sun` / `light.point`.
 */
export function shadePass(gb, out, {
  cam,
  lights = [],
  materials = [],
  ambient = { sky: [0.34, 0.40, 0.54], ground: [0.12, 0.11, 0.14] },
  fog = { colour: [0.30, 0.36, 0.48], density: 0.020 },
  exposure = 1.0,
  ao = null,
  rim = null,
  env = null,
  background = null,
  emissive = null,          // (matId, x, y) => 0..1 luminance boost
} = {}) {
  const { W, H, n, depth } = gb;
  const nx = gb.nx, ny = gb.ny, alb = gb.alb, matId = gb.matId;
  const wx = gb.wx, wy = gb.wy, wz = gb.wz;
  const sun = lights.find((l) => l.kind === 'dir');
  const points = lights.filter((l) => l.kind === 'point');

  const R3 = cam.right, U3 = cam.up, F3 = cam.fwd;
  let Lx = 0, Ly = 0, Lz = 0, sunR = 0, sunG = 0, sunB = 0;
  if (sun) {
    // `sun.dir` is the direction the light TRAVELS (from the sun toward the
    // scene). Shading needs the surface-to-light vector, so it is negated here.
    // Using it unnegated lights exactly the wrong side of every surface: it made
    // smooth cylinders render as a light half and a dark half with a hard seam,
    // which is what a "plank" limb actually was.
    const sx = -sun.dir[0], sy = -sun.dir[1], sz = -sun.dir[2];
    Lx = sx * R3[0] + sy * R3[1] + sz * R3[2];
    Ly = sx * U3[0] + sy * U3[1] + sz * U3[2];
    Lz = sx * F3[0] + sy * F3[1] + sz * F3[2];
    sunR = sun.colour[0] * sun.intensity;
    sunG = sun.colour[1] * sun.intensity;
    sunB = sun.colour[2] * sun.intensity;
  }
  const pv = points.map((p) => ({
    p,
    invRR: 2.2 / (p.radius * p.radius),
    r: p.colour[0] * p.intensity, g: p.colour[1] * p.intensity, b: p.colour[2] * p.intensity,
  }));

  // Flatten the material palette into typed arrays: a property read per pixel
  // per channel is the difference between 25 and 60 ns.
  const nm = Math.max(1, materials.length);
  const mRough = new Float32Array(nm), mMetal = new Float32Array(nm);
  const mSss = new Float32Array(nm), mSpec = new Float32Array(nm), mWrap = new Float32Array(nm);
  const mEmR = new Float32Array(nm), mEmG = new Float32Array(nm), mEmB = new Float32Array(nm);
  for (let k = 0; k < materials.length; k++) {
    const m = materials[k];
    mRough[k] = m.rough; mMetal[k] = m.metal; mSss[k] = m.sss;
    mSpec[k] = m.spec; mWrap[k] = m.wrap;
    mEmR[k] = m.emis[0]; mEmG[k] = m.emis[1]; mEmB[k] = m.emis[2];
  }

  const skyR = ambient.sky[0], skyG = ambient.sky[1], skyB = ambient.sky[2];
  const grR = ambient.ground[0], grG = ambient.ground[1], grB = ambient.ground[2];
  const fogR = fog.colour[0], fogG = fog.colour[1], fogB = fog.colour[2];
  const fogD = fog.density;
  const rimR = rim ? rim.colour[0] * rim.intensity : 0;
  const rimG = rim ? rim.colour[1] * rim.intensity : 0;
  const rimB = rim ? rim.colour[2] * rim.intensity : 0;
  const rdx = rim ? rim.dx : 0, rdy = rim ? rim.dy : 0, rdz = rim ? rim.dz : -1;
  const rPow = rim ? (rim.power ?? 2.2) : 1;
  const shadowSample = gb.shadowSample;
  const bgOut = gb._bgOut || (gb._bgOut = new Float32Array(3));
  const envR = env ? env[0] : 0, envG = env ? env[1] : 0, envB = env ? env[2] : 0;

  let i = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const o = i * 3;
      const zc = depth[i];
      if (zc > 1e8) {
        if (background) {
          background(x, y, W, H, bgOut);
          out[o] = bgOut[0]; out[o + 1] = bgOut[1]; out[o + 2] = bgOut[2];
        }
        continue;
      }
      const nxx = nx[i], nyy = ny[i];
      const nzz = -Math.sqrt(Math.max(0, 1 - nxx * nxx - nyy * nyy));
      const pk = alb[i];
      const r = ((pk >> 16) & 255) * (1 / 255), g = ((pk >> 8) & 255) * (1 / 255), b = (pk & 255) * (1 / 255);
      // An out-of-range material index must NOT skip the pixel: it would leave
      // the depth buffer written but the colour buffer stale, which shows up as
      // a hole punched through whatever was drawn there (the iris discs did
      // exactly this to the eyeballs). Fall back to material 0 instead.
      const k = matId[i] < nm ? matId[i] : 0;
      const occ = ao === null ? 1 : ao[i];

      const upness = nyy * 0.5 + 0.5;
      let R = r * (skyR * upness + grR * (1 - upness)) * occ;
      let G = g * (skyG * upness + grG * (1 - upness)) * occ;
      let B = b * (skyB * upness + grB * (1 - upness)) * occ;

      if (sun) {
        const ndl = nxx * Lx + nyy * Ly + nzz * Lz;
        const w = mWrap[k];
        const ndlW = ndl + w;
        if (ndlW > 0) {
          const vis = shadowSample ? shadowSample(i, x, y) : 1;
          const kk = (ndlW / (1 + w)) * vis;
          R += r * sunR * kk;
          G += g * sunG * kk;
          B += b * sunB * kk;
          const specK = mSpec[k];
          if (specK > 0 && ndl > 0) {
            let hx = Lx, hy = Ly, hz = Lz + 1;
            const hl = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
            const ndh = (nxx * hx + nyy * hy + nzz * hz) * hl;
            if (ndh > 0) {
              const rough = mRough[k];
              const d1 = 1 - rough;
              const shin = 2 + 2046 * d1 * d1 * d1;
              const nd = 1 - ndl;
              const fres = 0.03 + 0.97 * nd * nd * nd * nd * nd;
              const sp = Math.pow(ndh, shin) * specK * (1 - 0.55 * mSss[k]) * (0.05 + 0.85 * mMetal[k]) * fres * vis;
              R += sunR * sp; G += sunG * sp; B += sunB * sp;
            }
          }
        }
      }

      for (let q = 0; q < pv.length; q++) {
        const pl = pv[q];
        const dwx = pl.p.pos[0] - wx[i], dwy = pl.p.pos[1] - wy[i], dwz = pl.p.pos[2] - wz[i];
        const d2 = dwx * dwx + dwy * dwy + dwz * dwz;
        const atten = 1 / (1 + d2 * pl.invRR);
        if (atten < 0.012) continue;
        const inv = 1 / Math.sqrt(d2 || 1);
        const lxv = (dwx * R3[0] + dwy * R3[1] + dwz * R3[2]) * inv;
        const lyv = (dwx * U3[0] + dwy * U3[1] + dwz * U3[2]) * inv;
        const lzv = (dwx * F3[0] + dwy * F3[1] + dwz * F3[2]) * inv;
        const ndl = nxx * lxv + nyy * lyv + nzz * lzv;
        if (ndl <= 0) continue;
        const kk = ndl * atten;
        R += r * pl.r * kk; G += g * pl.g * kk; B += b * pl.b * kk;
      }

      const rough = mRough[k], metal = mMetal[k];
      if (env && (metal > 0.02 || rough < 0.28)) {
        const upr = upness < 0 ? 0 : upness > 1 ? 1 : upness;
        const kr = (1 - rough) * (metal > 0.02 ? 1 : 0.28);
        R += envR * (0.35 + 0.65 * upr) * kr;
        G += envG * (0.35 + 0.65 * upr) * kr;
        B += envB * (0.35 + 0.65 * upr) * kr;
      }
      // emissive materials (windows, eyes' catchlight, screens)
      const eR = mEmR[k], eG = mEmG[k], eB = mEmB[k];
      if (eR > 0 || eG > 0 || eB > 0) {
        const boost = emissive ? emissive(k, x, y) : 1;
        R += eR * boost; G += eG * boost; B += eB * boost;
      }

      if (rim && rimR > 0) {
        const ndv = nzz < 0 ? -nzz : nzz;
        const back = -(nxx * rdx + nyy * rdy + nzz * rdz);
        if (back > 0) {
          const one = 1 - (ndv > 1 ? 1 : ndv);
          const kk = Math.pow(one, rPow) * back;
          R += rimR * kk; G += rimG * kk; B += rimB * kk;
        }
      }

      const fd = zc * fogD;
      const fk = 1 - Math.exp(-fd * fd);
      if (fk > 0.0004) {
        R = R * (1 - fk) + fogR * fk;
        G = G * (1 - fk) + fogG * fk;
        B = B * (1 - fk) + fogB * fk;
      }
      R *= exposure; G *= exposure; B *= exposure;
      out[o] = tmou(R); out[o + 1] = tmou(G); out[o + 2] = tmou(B);
    }
  }
}

/* ------------------------------------------------------------ shadow sample */

/** ACES-ish tonemap, tabulated: the exact curve costs 3 divisions per channel. */
const TM = (() => {
  const N = 4096, tab = new Float32Array(N + 2);
  for (let i = 0; i <= N + 1; i++) {
    const x = (i / N) * 24;
    tab[i] = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  }
  return tab;
})();
function tmou(x) {
  if (x <= 0) return 0;
  const f = x * (4096 / 24);
  const i = f | 0;
  if (i >= 4096) return TM[4097];
  const a = TM[i], b = TM[i + 1];
  return a + (b - a) * (f - i);
}

/**
 * Install a PCF shadow sampler on the G-buffer. 5 taps in a rotated
 * Poisson pattern: enough to soften the edge, cheap enough per pixel.
 * The receiver is offset along its own normal by an amount proportional to
 * the shadow texel's world size, which is what kills surface acne.
 */
export function attachShadow(gb, sm, sun) {
  const L = sm.lightMat;
  if (!L) return;
  const res = sm.res;
  const depth = sm.depth;
  // world size of one shadow texel, in metres
  const texelWorld = (2 * L.R) / res;
  /* A 9-tap Gaussian-ish disc instead of 5 taps. Five taps left a hard, visibly
   * polygonal penumbra: on the cheek beside the fringe the hair's shadow edge
   * read as a jagged diagonal band. Softening costs about 1 ms per frame. */
  const TAPS = [
    [0, 0],
    [1.1, 0.5], [-1.0, 0.9], [0.6, -1.2], [-1.2, -0.6],
    [2.1, 1.0], [-2.0, 1.7], [1.2, -2.3], [-2.3, -1.2],
  ];
  const nxA = gb.nx, nyA = gb.ny, wxA = gb.wx, wyA = gb.wy, wzA = gb.wz;

  /**
   * NORMAL-OFFSET SHADOW MAP.
   *
   * The first version compared a raw depth and drew radial starburst acne all
   * over every curved surface (see research/ROUND6.md). The cause is
   * unavoidable in principle: the shadow texel covers a patch of the caster's
   * surface, and a receiver inside that patch samples its own depth with
   * sub-texel error. The standard fix is to displace the RECEIVER along its own
   * normal by about one texel before projecting, so the comparison happens at a
   * point that is unambiguously in front of the depth stored there.
   *
   * The slope term matters: a surface at grazing incidence to the light covers
   * many texels per pixel, so the offset has to grow.
   */
  gb.shadowSample = (i, x, y) => {
    // reconstruct the world normal from the view-space pair
    const nvx = nxA[i], nvy = nyA[i];
    const nvz = -Math.sqrt(Math.max(0, 1 - nvx * nvx - nvy * nvy));
    const nwx = nvx * L.camR[0] + nvy * L.camU[0] + nvz * L.camF[0];
    const nwy = nvx * L.camR[1] + nvy * L.camU[1] + nvz * L.camF[1];
    const nwz = nvx * L.camR[2] + nvy * L.camU[2] + nvz * L.camF[2];
    const ndl = -(nwx * L.sunDir[0] + nwy * L.sunDir[1] + nwz * L.sunDir[2]);
    const slope = Math.min(4, 1 / Math.max(0.25, Math.abs(ndl)));
    const off = texelWorld * (1.1 + 2.2 * slope);

    const l = L.toLightXYZ(wxA[i] + nwx * off, wyA[i] + nwy * off, wzA[i] + nwz * off);
    const lx = l.ox, ly = l.oy, lz = l.oz;
    if (lx < 0 || ly < 0 || lx >= res || ly >= res) return 1;
    let vis = 0;
    for (let t = 0; t < TAPS.length; t++) {
      const sx = (lx + TAPS[t][0] * 1.5) | 0;
      const sy = (ly + TAPS[t][1] * 1.5) | 0;
      if (sx < 0 || sy < 0 || sx >= res || sy >= res) { vis += 1; continue; }
      const dz = lz - depth[sy * res + sx];
      vis += dz < texelWorld * (2.2 + 3.0 * slope) ? 1 : 0;
    }
    return vis * (1 / TAPS.length);
  };
}

/* ---------------------------------------------------------------- resolve */

/**
 * Box-filter downsample (the anti-aliasing) + float -> 8-bit canvas.
 * Rendering at `ss` times the target and averaging is real SSAA; it is the
 * cheapest way to remove the stair-stepped silhouette that makes an image read
 * as "old renderer".
 */
export function resolveToCanvas(linear, W, H, outCanvas, { ss = 2, gamma = 2.2, dither = 0 } = {}) {
  const ctx = outCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  // sRGB encode through a lookup table: Math.pow per channel per pixel costs
  // ~130 ms at 1080x1920, the table costs ~12 ms.
  const LUT = new Uint8ClampedArray(1025);
  for (let i = 0; i <= 1024; i++) LUT[i] = Math.pow(i / 1024, 1 / gamma) * 255;
  const inv = 1 / (ss * ss);
  const stride = W * ss;
  let seed = 1234567;
  for (let y = 0; y < H; y++) {
    const oy = (y * ss) * stride;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      const bx = oy + x * ss;
      for (let sy = 0; sy < ss; sy++) {
        let p = (bx + sy * stride) * 3;
        for (let sx = 0; sx < ss; sx++, p += 3) {
          r += linear[p]; g += linear[p + 1]; b += linear[p + 2];
        }
      }
      const o = (y * W + x) * 4;
      let rr = LUT[(r * inv * 1024 + 0.5) | 0];
      let gg = LUT[(g * inv * 1024 + 0.5) | 0];
      let bb = LUT[(b * inv * 1024 + 0.5) | 0];
      if (dither) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = ((seed >> 16) / 32768 - 1) * dither;
        rr += n; gg += n; bb += n;
      }
      d[o] = rr; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return outCanvas;
}

/* ------------------------------------------------------------------ render */

/**
 * One call per frame. Allocates nothing after the first frame for a given size.
 */
export function createRenderer({ width = 540, height = 960, ss = 2, shadowRes = 1024 } = {}) {
  /* Supersampling must be an INTEGER. The resolve step assumes an ss x ss block
   * per output pixel; at ss = 1.6 the buffer is a different size from that block
   * grid and the resolve walks off the end of each row, which produced a black
   * image with a woven moire pattern and burned 13 s doing it. Rounding here
   * makes the whole class of bug impossible. */
  ss = Math.max(1, Math.round(ss));
  const W = width * ss, H = height * ss;
  const gb = createGBuffer(W, H);
  const colour = new Float32Array(W * H * 3);
  const aoBuf = new Float32Array(W * H).fill(1);
  const sm = createShadowMap(shadowRes);
  const canvas = createCanvas(width, height);
  let frames = 0;

  const api = {
    width, height, ss, W, H, gb, canvas,
    shadowMap: sm,
    /** Bounds used to fit the shadow camera; call when the subject moves. */
    bounds: { centre: [0, 1, 0], radius: 3 },

    render(scene, cam, opts = {}) {
      const t0 = Date.now();
      // A scene may share one material palette across all objects (the normal
      // case) or give each object its own. Resolve once per frame.
      if (!opts.materials) {
        const seen = [];
        for (const obj of scene) for (const m of obj.materials) if (!seen.includes(m)) seen.push(m);
        opts.materials = seen;
        /* Packed albedo for each object, already expanded into SHARED palette
         * order. After the remap below, a triangle's material index is an index
         * into opts.materials, so an object-local table cannot be used. */
        for (const obj of scene) {
          obj.albedoPacked = seen.map((m) => packAlbedo(m.albedo));
        }
        /* Remap per-object material indices into the shared palette, ONCE per
         * mesh and without destroying the source indices. The originals live in
         * mesh.remapFrom, so a second render starts from the true values. */
        for (const obj of scene) {
          const mesh = obj.mesh;
          if (!mesh.mat) continue;
          if (!mesh.remapFrom) mesh.remapFrom = Uint16Array.from(mesh.mat);
          const map = obj.materials.map((m) => opts.materials.indexOf(m));
          const table = new Int32Array(4096).fill(-1);
          for (let k = 0; k < map.length; k++) if (map[k] >= 0) table[k] = map[k];
          mesh.remapTable = table;
          for (let t = 0; t < mesh.tris; t++) {
            const src = mesh.remapFrom[t];
            mesh.mat[t] = table[src] >= 0 ? table[src] : 0;
          }
          obj.materials = opts.materials;
        }
      }
      cam.width = W; cam.height = H;
      gb.clear();
      geometryPass(gb, scene, cam);
      const tGeo = Date.now();

      const lights = opts.lights || [];
      const sun = lights.find((l) => l.kind === 'dir');
      if (sun && opts.shadows !== false) {
        renderShadowMap(scene, sun, opts.bounds || api.bounds, sm, cam);
        attachShadow(gb, sm, sun);
      } else {
        gb.shadowSample = null;
      }
      const tShadow = Date.now();

      if (opts.ao !== false) {
        // AO is low frequency: half resolution + bilinear upsample is visually
        // identical and four times cheaper (214 ms -> ~60 ms).
        const AW = W >> 1, AH = H >> 1;
        if (!api._aoHalf || api._aoHalf.length !== AW * AH) api._aoHalf = new Float32Array(AW * AH);
        computeAOHalf(gb, api._aoHalf, AW, AH, Object.assign({ f: cam.f, height: H, radiusWorld: 0.11, strength: 1.05 }, opts.aoOpts || {}));
        upsampleAO(api._aoHalf, aoBuf, AW, AH, W, H);
      }
      const tAO = Date.now();

      const allMats = opts.materials || [];
      shadePass(gb, colour, {
        cam, lights, materials: allMats,
        ambient: opts.ambient, fog: opts.fog, exposure: opts.exposure,
        ao: opts.ao === false ? null : aoBuf,
        rim: opts.rim, env: opts.env, background: opts.background,
      });
      const tShade = Date.now();

      resolveToCanvas(colour, width, height, canvas, { ss, gamma: opts.gamma ?? 2.2, dither: opts.dither || 0 });
      frames++;
      api.timings = { geo: tGeo - t0, shadow: tShadow - tGeo, ao: tAO - tShadow, shade: tShade - tAO, resolve: Date.now() - tShade, total: Date.now() - t0 };
      return canvas;
    },

    /** Expose the linear buffer for the post stack. */
    get linear() { return colour; },
  };
  return api;
}
