// foley.mjs — Round 13: professional sound design.
//
// Method adopted from the MIT procedural-sfx skill (vendored at
// research/references/procedural-sfx/): every sound is ATTACK + BODY + TAIL,
// the MATERIAL decides the recipe (not the action's name), repeats are varied,
// and each sound is checked by numbers because we cannot hear it.
//
// Adds what Round 11 lacked: true stereo placement, distance cues, a real
// reverb bus, per-trigger variation, and modal/granular physical synthesis.
//
// All recipes return { L, R } Float32 at SR, normalised; level lives in the
// event list, never inside a recipe.

export const SR = 48000;

/* ------------------------------------------------------------ primitives -- */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const TAU = Math.PI * 2;

export function noise(n, r, kind = 'white') {
  const y = new Float32Array(n);
  if (kind === 'white') { for (let i = 0; i < n; i++) y[i] = r() * 2 - 1; return y; }
  if (kind === 'brown') { let b = 0; for (let i = 0; i < n; i++) { b = (b + 0.02 * (r() * 2 - 1)) / 1.02; y[i] = b * 3.5; } return y; }
  // pink (Voss-ish 3-pole approximation)
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    y[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return y;
}

/** Biquad (RBJ cookbook). kind: lp hp bp notch peak lowshelf highshelf */
export function biquad(x, sr, { kind = 'lp', f = 1000, q = 0.707, gainDb = 0 }) {
  const A = Math.pow(10, gainDb / 40), w0 = TAU * f / sr, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  switch (kind) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'highshelf': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s); a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
    default: { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s); a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; }
  }
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  for (let i = 0; i < x.length; i++) {
    const v = B0 * x[i] + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export const envExp = (n, sr, tau) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = Math.exp(-i / (sr * tau)); return y; };
export const envAD = (n, a, d) => { const y = new Float32Array(n), an = Math.max(1, a * n); for (let i = 0; i < n; i++) y[i] = i < an ? i / an : Math.pow(1 - (i - an) / Math.max(1, n - an), d); return y; };
export const envSin2 = (n) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) { const s = Math.sin(Math.PI * i / n); y[i] = s * s; } return y; };

export function sat(x, drive = 2) { const y = new Float32Array(x.length); const k = Math.tanh(drive); for (let i = 0; i < x.length; i++) y[i] = Math.tanh(x[i] * drive) / k; return y; }
export function norm(x, peak = 0.98) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m < 1e-9) return x; const g = peak / m; const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * g; return y; }
const mul = (a, b) => { const y = new Float32Array(a.length); for (let i = 0; i < a.length; i++) y[i] = a[i] * (b[i] ?? 1); return y; };
const addInto = (dst, src, g = 1, off = 0) => { for (let i = 0; i < src.length; i++) { const j = i + off; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; } };

/** Modal bank: inharmonic partials with individual decay — the sound of a
 *  struck solid. ratios/damps let one function cover wood, ceramic, metal. */
function modal(n, sr, r, { base = 400, ratios = [1, 2.4, 3.9, 5.2], tau = 0.12, spread = 0.04, highDamp = 1.6 }) {
  const y = new Float32Array(n);
  ratios.forEach((ratio, k) => {
    const f = base * ratio * (1 + (r() - 0.5) * spread);
    const t = tau / Math.pow(highDamp, k);            // highs decay first
    const ph = r() * TAU, amp = 1 / (k + 1.4);
    for (let i = 0; i < n; i++) y[i] += Math.sin(TAU * f * i / sr + ph) * Math.exp(-i / (sr * t)) * amp;
  });
  return y;
}

/** PhISEM-lite: stochastic micro-impacts through a resonant filter — gravel,
 *  shards, applause, rain. Much less synthetic than a single noise burst. */
function granular(n, sr, r, { density = 220, f = 2200, q = 3, decay = 0.012, ampJit = 0.6 }) {
  const exc = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const step = Math.max(1, Math.round(sr / density * (0.5 + r())));
    if (i < n) exc[i] += (r() * 2 - 1) * (1 - ampJit + ampJit * r());
    i += step;
  }
  const res = biquad(exc, sr, { kind: 'bp', f, q });
  const e = envExp(n, sr, decay);
  return mul(res, e);
}

/* ------------------------------------------------------------- reverb ----- */
/** Freeverb-style stereo reverb: 8 combs + 4 allpasses per channel. Cheap,
 *  decorrelated between L/R so it widens instead of smearing the centre. */
export function reverb(x, sr, { room = 0.62, damp = 0.42, wet = 0.25, width = 0.6 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const stereoTune = 23;
  const chan = (input, tune) => {
    const out = new Float32Array(input.length);
    const buf = combs.map((c) => new Float32Array(Math.round((c + tune) * sr / 44100)));
    const idx = combs.map(() => 0), lp = combs.map(() => 0);
    const fb = room * 0.28 + 0.7;
    for (let i = 0; i < input.length; i++) {
      let acc = 0;
      for (let k = 0; k < combs.length; k++) {
        const b = buf[k], p = idx[k];
        const v = b[p];
        lp[k] = v * (1 - damp) + lp[k] * damp;
        b[p] = input[i] + lp[k] * fb;
        idx[k] = (p + 1) % b.length;
        acc += v;
      }
      // Normalise the comb sum by its own DC gain so `wet` means what it says.
      // Eight combs at fb<=0.94 sum to ~8/(1-fb) = ~128x; the old code left that
      // un-scaled and the SFX bus measured +53 dBFS.
      out[i] = acc * 0.1;
    }
    // Series allpasses (Freeverb). Feedback g=0.5 on the DELAY LINE:
    //   v = in + g*bufOut ; buffer = v ; out = bufOut - g*v
    // The previous version wrote `b[p] = 0.5*in + bufOut`, i.e. unity feedback,
    // so the line integrated forever and blew up to ~1e5. This decays properly.
    const g = 0.5;
    for (let k = 0; k < aps.length; k++) {
      const len = Math.max(1, Math.round((aps[k] + tune) * sr / 44100));
      const b = new Float32Array(len); let p = 0;
      for (let i = 0; i < out.length; i++) {
        const bufOut = b[p];
        const v = out[i] + g * bufOut;
        b[p] = v; p = (p + 1) % len;
        out[i] = bufOut - g * v;
      }
    }
    return out;
  };
  const L = chan(x, 0), R = chan(x, stereoTune);
  const yL = new Float32Array(x.length), yR = new Float32Array(x.length);
  const w1 = wet * (1 + width) / 2, w2 = wet * (1 - width) / 2;
  for (let i = 0; i < x.length; i++) { yL[i] = L[i] * w1 + R[i] * w2; yR[i] = R[i] * w1 + L[i] * w2; }
  return { L: yL, R: yR };
}

/* --------------------------------------------------------- stereo helpers - */
/** Equal-power pan. pan -1 (left) .. +1 (right). */
export function pan(mono, p = 0) {
  const t = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4;
  const gl = Math.cos(t), gr = Math.sin(t);
  const L = new Float32Array(mono.length), R = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) { L[i] = mono[i] * gl; R[i] = mono[i] * gr; }
  return { L, R };
}

/** Distance cue: air absorption (LP), level falloff, and more reverb. */
export function distance(mono, sr, metres = 2) {
  const d = Math.max(0.4, metres);
  const cut = Math.max(700, 16000 / (1 + d * 0.35));
  const y = biquad(mono, sr, { kind: 'lp', f: cut, q: 0.6 });
  const g = 1 / (1 + (d - 1) * 0.28);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

/* ------------------------------------------------------------- recipes ---- */
// Each: (sr, r, args) -> mono Float32, normalised. Gain/pan/distance live in events.
export const RECIPES = {
  // ---- footsteps: material decides, granular for loose ground --------------
  step(sr, r, { surface = 'dirt', force = 1 } = {}) {
    const d = surface === 'wood' ? 0.16 : surface === 'stone' ? 0.11 : 0.2;
    const n = Math.round(d * sr);
    const jit = 1 + (r() - 0.5) * 0.14;                     // ±7% pitch variation
    if (surface === 'wood') {
      const atk = mul(noise(n, r, 'white'), envExp(n, sr, 0.004));
      const body = modal(n, sr, r, { base: 300 * jit, ratios: [1, 2.1, 3.4], tau: 0.075 });
      const y = new Float32Array(n);
      addInto(y, biquad(atk, sr, { kind: 'bp', f: 1200, q: 0.7 }), 1.0);
      addInto(y, biquad(atk, sr, { kind: 'bp', f: 700, q: 1.0 }), 0.55);
      addInto(y, body, 0.10);
      return norm(y);
    }
    if (surface === 'stone') {
      const atk = mul(noise(n, r, 'white'), envExp(n, sr, 0.002));
      const y = new Float32Array(n);
      addInto(y, biquad(atk, sr, { kind: 'hp', f: 6000 }), 1.0);
      addInto(y, granular(n, sr, r, { density: 500, f: 9000 * jit, q: 1.5, decay: 0.012 }), 0.55);
      return norm(y);
    }
    // dirt/gravel: stochastic micro-impacts, dull
    const g = granular(n, sr, r, { density: 320 * force, f: 1900 * jit, q: 1.1, decay: 0.03 });
    const thud = mul(modal(n, sr, r, { base: 85 * jit, ratios: [1, 1.7], tau: 0.035 }), envExp(n, sr, 0.05));
    const y = new Float32Array(n);
    addInto(y, biquad(g, sr, { kind: 'bp', f: 2000, q: 0.6 }), 1.0);
    addInto(y, biquad(g, sr, { kind: 'lp', f: 3000 }), 0.45);
    addInto(y, thud, 0.08);
    return norm(y);
  },

  // ---- clay: soft, wet, no HF attack --------------------------------------
  claySquish(sr, r, { size = 1 } = {}) {
    const n = Math.round(0.34 * size * sr);
    const base = noise(n, r, 'pink');
    const lp = biquad(base, sr, { kind: 'lp', f: 750 * (1 + (r() - 0.5) * 0.2), q: 0.9 });
    const e = envAD(n, 0.08, 1.7);
    const y = mul(lp, e);
    // wet "suck": a slow downward formant glide
    const gl = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const f = 320 * (1 - 0.55 * i / n); ph += TAU * f / sr; gl[i] = Math.sin(ph) * Math.exp(-i / (sr * 0.09)) * 0.35; }
    addInto(y, gl, 0.5);
    return norm(y);
  },
  claySlap(sr, r) {
    const n = Math.round(0.2 * sr);
    const atk = mul(noise(n, r, 'white'), envExp(n, sr, 0.006));
    const y = new Float32Array(n);
    addInto(y, biquad(atk, sr, { kind: 'lp', f: 1500 }), 0.7);
    addInto(y, modal(n, sr, r, { base: 150 * (1 + (r() - 0.5) * 0.15), ratios: [1, 1.9], tau: 0.045 }), 0.7);
    return norm(y);
  },

  // ---- ceramic shatter: modal + shard scatter -----------------------------
  shatter(sr, r, { big = 1 } = {}) {
    const n = Math.round(1.1 * big * sr);
    const y = new Float32Array(n);
    const crack = mul(noise(Math.round(0.02 * sr), r, 'white'), envExp(Math.round(0.02 * sr), sr, 0.003));
    addInto(y, biquad(crack, sr, { kind: 'hp', f: 3000 }), 0.9);
    addInto(y, modal(n, sr, r, { base: 1250, ratios: [1, 2.7, 4.3, 6.1, 8.4], tau: 0.16, highDamp: 1.5 }), 0.55);
    // shards land over ~0.7 s
    const shards = granular(Math.round(0.75 * sr), sr, r, { density: 90, f: 4200, q: 4, decay: 0.05 });
    addInto(y, biquad(shards, sr, { kind: 'hp', f: 2000 }), 0.5, Math.round(0.05 * sr));
    return norm(y);
  },

  // ---- wood / doors -------------------------------------------------------
  doorCreak(sr, r, { dur = 0.9 } = {}) {
    const n = Math.round(dur * sr);
    const y = new Float32Array(n);
    let ph = 0;
    const f0 = 180 * (1 + (r() - 0.5) * 0.25);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      // stick-slip: frequency wobble + amplitude stutter
      const f = f0 * (1 + 0.22 * Math.sin(TAU * 5.5 * u) + 0.1 * Math.sin(TAU * 13 * u));
      ph += TAU * f / sr;
      const saw = 2 * ((ph / TAU) % 1) - 1;
      const stutter = 0.55 + 0.45 * Math.abs(Math.sin(TAU * 8.5 * u + r() * 0.02));
      y[i] = saw * stutter * Math.sin(Math.PI * Math.pow(u, 0.7));
    }
    return norm(biquad(y, sr, { kind: 'bp', f: 900, q: 1.6 }));
  },
  doorSwing(sr, r) {
    const n = Math.round(0.55 * sr);
    const air = mul(noise(n, r, 'pink'), envSin2(n));
    const y = new Float32Array(n);
    addInto(y, biquad(air, sr, { kind: 'bp', f: 700, q: 0.8 }), 0.7);
    const thud = modal(Math.round(0.2 * sr), sr, r, { base: 95, ratios: [1, 1.8, 2.9], tau: 0.07 });
    addInto(y, thud, 0.8, Math.round(0.33 * sr));
    return norm(y);
  },
  thump(sr, r, { size = 1 } = {}) {
    const n = Math.round(0.45 * size * sr);
    const y = new Float32Array(n);
    let ph = 0;
    const an = Math.round(0.004 * sr);
    for (let i = 0; i < n; i++) { const f = 78 * (1 - 0.45 * i / n); ph += TAU * f / sr; y[i] = Math.sin(ph) * Math.exp(-i / (sr * 0.11)) * Math.min(1, i / an); }
    const atk = mul(noise(Math.round(0.012 * sr), r, 'white'), envExp(Math.round(0.012 * sr), sr, 0.003));
    addInto(y, biquad(atk, sr, { kind: 'lp', f: 900 }), 0.35);
    return norm(y);
  },
  cloth(sr, r, { dur = 0.3 } = {}) {
    const n = Math.round(dur * sr);
    const y = mul(noise(n, r, 'pink'), envAD(n, 0.25, 2.2));
    return norm(biquad(y, sr, { kind: 'bp', f: 1800 * (1 + (r() - 0.5) * 0.3), q: 0.7 }));
  },

  // ---- air / motion -------------------------------------------------------
  whoosh(sr, r, { dur = 0.6, up = true } = {}) {
    const n = Math.round(dur * sr);
    const src = noise(n, r, 'pink');
    const y = new Float32Array(n);
    // moving band-pass centre, implemented as a short time-varying biquad sweep
    const blocks = 24, bl = Math.ceil(n / blocks);
    for (let b = 0; b < blocks; b++) {
      const u = b / (blocks - 1);
      const f = up ? 400 + 3200 * u * u : 3600 - 3200 * u * u;
      const seg = src.slice(b * bl, Math.min(n, (b + 1) * bl));
      const filt = biquad(seg, sr, { kind: 'bp', f, q: 1.1 });
      addInto(y, filt, 1, b * bl);
    }
    return norm(mul(y, envSin2(n)));
  },
  riser(sr, r, { dur = 1.6 } = {}) {
    const n = Math.round(dur * sr);
    const y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n, f = 120 * Math.pow(6, u);
      ph += TAU * f / sr;
      y[i] = (Math.sin(ph) * 0.4 + (r() * 2 - 1) * 0.25) * Math.pow(u, 1.8);
    }
    return norm(biquad(y, sr, { kind: 'lp', f: 6000 }));
  },

  // ---- metal / magic ------------------------------------------------------
  chime(sr, r, { base = 880, dur = 1.8 } = {}) {
    const n = Math.round(dur * sr);
    const y = modal(n, sr, r, { base: base * (1 + (r() - 0.5) * 0.03), ratios: [1, 2.01, 3.02, 4.7, 6.3], tau: 0.95, highDamp: 1.3, spread: 0.01 });
    const atk = mul(noise(Math.round(0.006 * sr), r, 'white'), envExp(Math.round(0.006 * sr), sr, 0.0015));
    addInto(y, biquad(atk, sr, { kind: 'hp', f: 4000 }), 0.25);
    return norm(y);
  },
  bell(sr, r, { base = 520, dur = 2.6 } = {}) {
    const n = Math.round(dur * sr);
    return norm(modal(n, sr, r, { base, ratios: [1, 1.5, 2.0, 2.98, 4.2], tau: 0.9, highDamp: 1.3 }));
  },

  // ---- fire / ambience ----------------------------------------------------
  fire(sr, r, { dur = 4 } = {}) {
    const n = Math.round(dur * sr);
    const bed = biquad(noise(n, r, 'brown'), sr, { kind: 'lp', f: 520 });
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = bed[i] * (0.6 + 0.4 * Math.sin(TAU * 0.7 * i / sr + r() * 0.001));
    const crack = granular(n, sr, r, { density: 22, f: 3200, q: 2.5, decay: 0.02 });
    addInto(y, biquad(crack, sr, { kind: 'hp', f: 1400 }), 0.5);
    return norm(y);
  },
  wind(sr, r, { dur = 6, strength = 0.5 } = {}) {
    const n = Math.round(dur * sr);
    const src = biquad(noise(n, r, 'pink'), sr, { kind: 'bp', f: 500, q: 0.6 });
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / sr;
      const gust = 0.5 + 0.5 * Math.sin(TAU * 0.13 * u) * Math.sin(TAU * 0.071 * u + 1.1);
      y[i] = src[i] * gust * strength;
    }
    return norm(y, 0.8);
  },
  birds(sr, r, { dur = 4 } = {}) {
    const n = Math.round(dur * sr); const y = new Float32Array(n);
    let t = 0.2;
    while (t < dur - 0.3) {
      const chirps = 2 + Math.floor(r() * 3);
      for (let c = 0; c < chirps; c++) {
        const cd = 0.06 + r() * 0.05, cn = Math.round(cd * sr);
        const off = Math.round((t + c * (cd + 0.03)) * sr);
        let ph = 0;
        for (let i = 0; i < cn; i++) {
          const u = i / cn, f = 2600 + 1400 * Math.sin(Math.PI * u) + (r() - 0.5) * 120;
          ph += TAU * f / sr;
          const j = off + i; if (j < n) y[j] += Math.sin(ph) * Math.sin(Math.PI * u) * 0.5;
        }
      }
      t += 0.7 + r() * 1.3;
    }
    return norm(y, 0.7);
  },
  crickets(sr, r, { dur = 5 } = {}) {
    const n = Math.round(dur * sr); const y = new Float32Array(n);
    const period = 0.42;
    for (let t = 0.1; t < dur - 0.2; t += period * (0.9 + r() * 0.2)) {
      for (let k = 0; k < 3; k++) {
        const cn = Math.round(0.022 * sr), off = Math.round((t + k * 0.035) * sr);
        let ph = 0;
        for (let i = 0; i < cn; i++) { const j = off + i; if (j < n) { ph += TAU * 4600 / sr; y[j] += Math.sin(ph) * Math.sin(Math.PI * i / cn) * 0.4; } }
      }
    }
    return norm(y, 0.55);
  },
  walla(sr, r, { dur = 5, voices = 6 } = {}) {
    const n = Math.round(dur * sr); const y = new Float32Array(n);
    for (let v = 0; v < voices; v++) {
      const f0 = 95 + r() * 130, form = 500 + r() * 900, ph0 = r() * TAU;
      let ph = 0;
      const gate = 0.3 + r() * 0.5;
      for (let i = 0; i < n; i++) {
        const u = i / sr;
        const wob = 1 + 0.06 * Math.sin(TAU * (2 + r() * 0.001) * u + ph0);
        ph += TAU * f0 * wob / sr;
        const syl = Math.max(0, Math.sin(TAU * gate * u + ph0)) ** 2;
        y[i] += (Math.sin(ph) * 0.5 + Math.sin(ph * 2) * 0.2) * syl * 0.16;
      }
      void form;
    }
    return norm(biquad(y, sr, { kind: 'bp', f: 900, q: 0.5 }), 0.6);
  },

  // ---- crowd reactions ----------------------------------------------------
  applause(sr, r, { dur = 4, size = 1 } = {}) {
    const n = Math.round(dur * sr);
    const g = granular(n, sr, r, { density: 180 * size, f: 2100, q: 1.2, decay: 0.03 });
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / n; e[i] = Math.min(1, u / 0.12) * (u > 0.75 ? Math.pow(1 - (u - 0.75) / 0.25, 1.3) : 1); }
    return norm(mul(biquad(g, sr, { kind: 'hp', f: 700 }), e), 0.85);
  },
  gasp(sr, r, { voices = 5 } = {}) {
    const n = Math.round(0.75 * sr); const y = new Float32Array(n);
    for (let v = 0; v < voices; v++) {
      const off = Math.round(r() * 0.09 * sr), cn = Math.round((0.3 + r() * 0.2) * sr);
      const src = noise(cn, r, 'pink');
      const f = biquad(src, sr, { kind: 'bp', f: 700 + r() * 900, q: 1.3 });
      const e = envAD(cn, 0.18, 1.6);
      addInto(y, mul(f, e), 0.5, off);
    }
    return norm(y, 0.8);
  },
  gaspQuiet(sr, r) { return RECIPES.gasp(sr, r, { voices: 3 }); },

  // ---- mechanical ---------------------------------------------------------
  wheelHum(sr, r, { dur = 5, rpm = 55 } = {}) {
    const n = Math.round(dur * sr); const y = new Float32Array(n);
    const rot = rpm / 60;
    const bed = biquad(noise(n, r, 'brown'), sr, { kind: 'lp', f: 380 });
    for (let i = 0; i < n; i++) {
      const u = i / sr;
      const bearing = Math.sin(TAU * rot * u) * 0.35 + Math.sin(TAU * rot * 2.03 * u + 1) * 0.15;
      y[i] = bed[i] * 0.5 + bearing * 0.2 * (0.8 + 0.2 * Math.sin(TAU * 0.4 * u));
    }
    return norm(y, 0.7);
  },
  waterDrip(sr, r) {
    const n = Math.round(0.25 * sr); const y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const f = 1400 * (1 - 0.6 * i / n) * (1 + (r() - 0.5) * 0.1); ph += TAU * f / sr; y[i] = Math.sin(ph) * Math.exp(-i / (sr * 0.03)); }
    return norm(y);
  },
};

/* --------------------------------------------------------- event mixing --- */
/**
 * Render an event list to a stereo track.
 * event = { t, kind, gain, pan, metres, room, args, name, seed }
 * Deterministic: each event's RNG is seeded from kind+t+args, so adding an
 * event never changes how another one sounds.
 */
export function renderEvents(events, duration, sr = SR, { defaultRoom = 0.18 } = {}) {
  const n = Math.ceil(duration * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const log = [];
  for (const ev of events) {
    const fn = RECIPES[ev.kind];
    if (!fn) { log.push({ error: `unknown recipe ${ev.kind}`, t: ev.t }); continue; }
    const seed = ev.seed ?? Math.abs(Math.round(ev.t * 1000) * 31 + ev.kind.length * 7919 + JSON.stringify(ev.args || {}).length * 104729);
    const r = rng(seed);
    let mono = fn(sr, r, ev.args || {});
    if (ev.metres) mono = distance(mono, sr, ev.metres);
    const p = pan(mono, ev.pan ?? 0);
    const room = ev.room ?? defaultRoom;
    if (room > 0.01) {
      const rv = reverb(mono, sr, { room: 0.45 + room * 0.4, wet: room, width: 0.7 });
      for (let i = 0; i < mono.length; i++) { p.L[i] += rv.L[i]; p.R[i] += rv.R[i]; }
    }
    const off = Math.round(ev.t * sr), g = ev.gain ?? 0.5;
    for (let i = 0; i < mono.length; i++) {
      const j = off + i; if (j < 0 || j >= n) continue;
      L[j] += p.L[i] * g; R[j] += p.R[i] * g;
    }
    log.push({ t: ev.t, kind: ev.kind, name: ev.name || ev.kind, gain: g, pan: ev.pan ?? 0, metres: ev.metres ?? null, room, durSec: +(mono.length / sr).toFixed(3), seed });
  }
  return { L, R, sr, log };
}

/* ------------------------------------------------------------- analysis --- */
/** Numeric QA per the procedural-sfx targets: attack, ring time, centroid. */
export function analyzeSound(x, sr) {
  let pk = 0, pki = 0, sum = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) { pk = a; pki = i; } sum += x[i] * x[i]; }
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  // attack: time from 10% to 90% of peak, before the peak
  let i10 = 0, i90 = 0;
  for (let i = 0; i <= pki; i++) { if (Math.abs(x[i]) >= pk * 0.1) { i10 = i; break; } }
  for (let i = i10; i <= pki; i++) { if (Math.abs(x[i]) >= pk * 0.9) { i90 = i; break; } }
  // t-20: time for the envelope to fall 20 dB below peak (ring/decay)
  const win = Math.round(0.01 * sr);
  let t20 = x.length / sr;
  for (let i = pki; i + win < x.length; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += x[i + j] * x[i + j];
    if (20 * Math.log10(Math.sqrt(s / win) + 1e-12) < 20 * Math.log10(pk + 1e-12) - 20) { t20 = (i - pki) / sr; break; }
  }
  return { peak: +pk.toFixed(4), rms: +rms.toFixed(4), attackMs: +((i90 - i10) / sr * 1000).toFixed(2), t20Ms: +(t20 * 1000).toFixed(1), durMs: +(x.length / sr * 1000).toFixed(1) };
}

/** Variation verdict for a repeated recipe (identical / barely / varies). */
export function variationCheck(kind, args = {}, takes = 4, sr = SR) {
  const ms = [];
  for (let k = 0; k < takes; k++) {
    const x = RECIPES[kind](sr, rng(1000 + k * 77), args);
    ms.push({ ...analyzeSound(x, sr), n: x.length });
  }
  const rmsRange = Math.max(...ms.map((m) => m.rms)) - Math.min(...ms.map((m) => m.rms));
  const rmsDb = 20 * Math.log10((Math.max(...ms.map((m) => m.rms)) + 1e-9) / (Math.min(...ms.map((m) => m.rms)) + 1e-9));
  const atkSpread = Math.max(...ms.map((m) => m.attackMs)) - Math.min(...ms.map((m) => m.attackMs));
  const durSpread = Math.max(...ms.map((m) => m.durMs)) - Math.min(...ms.map((m) => m.durMs));
  const verdict = (rmsDb < 0.2 && atkSpread < 0.1 && durSpread < 0.1) ? 'CHECK: takes barely differ' : 'takes vary';
  return { kind, takes: ms, rmsRangeDb: +rmsDb.toFixed(3), attackSpreadMs: +atkSpread.toFixed(2), verdict, rmsRange: +rmsRange.toFixed(5) };
}
