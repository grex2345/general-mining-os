// cinema2.js — Round 14: a story-motivated camera director.
// Browser-side classic script: window.Cinema2(THREE) -> { Director, moves, plan }
//
// DESIGN RULE: a composition is an INTENT, not a random angle. Every comp carries `why`
// (the story reason) and `kind` (scale), and the planner refuses two medium shots in a row.
// Motion grammar copied from the reference study: fast eased move INTO each new framing
// (0.30-0.55s), then a slow drift; the horizon always rolls a little; the camera never parks.
// Transitions between comps are camera moves blended across the boundary, so the whole
// scene reads as one continuous flight rather than a slideshow of cuts.
(function () {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => u * u * (3 - 2 * u);
  const outCubic = (u) => 1 - Math.pow(1 - u, 3);
  const outQuint = (u) => 1 - Math.pow(1 - u, 5);

  // Spherical framing around a subject: distance d, azimuth az (radians), height h.
  function place(sub, f) {
    return [sub[0] + Math.sin(f.az) * f.d, sub[1] + f.h, sub[2] + Math.cos(f.az) * f.d];
  }
  function blendF(a, b, u) {
    return { d: lerp(a.d, b.d, u), az: lerp(a.az, b.az, u), h: lerp(a.h, b.h, u),
             fov: lerp(a.fov, b.fov, u), roll: lerp(a.roll, b.roll, u),
             lx: lerp(a.lx || 0, b.lx || 0, u), ly: lerp(a.ly || 0, b.ly || 0, u), lz: lerp(a.lz || 0, b.lz || 0, u) };
  }
  const F = (o) => Object.assign({ d: 4, az: 0, h: 1.2, fov: 55, roll: 0, lx: 0, ly: 0, lz: 0 }, o);

  /* ---- move builders: each returns a comp with from/to framings ---- */
  const moves = {
    // Push in: discover detail. Used when the narration names a thing.
    push(sub, { d0 = 5, d1 = 2.2, az = 0, h0 = 1.4, h1 = 1.2, fov0 = 58, fov1 = 50, roll = 0, dur = 1.8, why = '', kind = 'medium', look, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d: d0, az, h: h0, fov: fov0, roll: -roll, ...(look || {}) }), to: F({ d: d1, az: az + 0.06, h: h1, fov: fov1, roll, ...(look || {}) }) };
    },
    // Pull back: reveal context. The reference's most common reveal.
    pull(sub, { d0 = 1.1, d1 = 7.5, az = 0, h0 = 0.9, h1 = 2.6, fov0 = 72, fov1 = 52, roll = 0, dur = 1.9, why = '', kind = 'wide', look, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d: d0, az, h: h0, fov: fov0, roll, ...(look || {}) }), to: F({ d: d1, az: az - 0.1, h: h1, fov: fov1, roll: -roll, ...(look || {}) }) };
    },
    // Orbit: circle the subject so the world sweeps behind. Explanation beats.
    orbit(sub, { d = 3.4, az0 = -0.6, az1 = 0.7, h0 = 1.3, h1 = 1.6, fov = 56, roll = 0.02, dur = 2.0, why = '', kind = 'medium', look, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d, az: az0, h: h0, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * 0.94, az: az1, h: h1, fov, roll, ...(look || {}) }) };
    },
    // Track: follow a moving subject. sub may be a function of global time.
    track(subFn, { d = 3.6, az = 0.5, h = 1.3, fov = 58, roll = 0.02, dur = 2.0, why = '', kind = 'medium', lead = 0, look, focus,} = {}) {
      return { dur, why, kind, subFn, focus, from: F({ d, az, h, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * 0.97, az: az + 0.08, h: h + 0.1, fov, roll, ...(look || {}) }) };
    },
    // Crane: rise or descend. Scale changes, arrival, aftermath.
    crane(sub, { d = 5, az = 0, h0 = 0.5, h1 = 6.5, fov0 = 66, fov1 = 50, roll = 0.02, dur = 2.1, why = '', kind = 'wide', look, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d, az, h: h0, fov: fov0, roll: -roll, ...(look || {}) }), to: F({ d: d * 1.05, az: az + 0.12, h: h1, fov: fov1, roll, ...(look || {}) }) };
    },
    // Macro: extreme close on a named prop. Never held long.
    macro(sub, { d = 0.75, az = 0.2, h = 0.15, fov = 62, roll = 0.03, dur = 1.3, why = '', look, drift = 0.12, kind = 'macro', focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d, az, h, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * (1 + drift), az: az + 0.14, h: h + 0.05, fov, roll, ...(look || {}) }) };
    },
    // Low / worm: make a thing loom. Threat, effort, the tower.
    low(sub, { d = 3.2, az = 0, h = 0.22, fov = 72, roll = 0.03, dur = 1.7, why = '', kind = 'close', look, rise = 0.25, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d, az, h, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * 0.92, az: az + 0.05, h: h + rise, fov: fov - 4, roll, ...(look || {}) }) };
    },
    // Dutch close: tension on a face.
    dutch(sub, { d = 1.9, az = 0.15, h = 0.1, fov = 52, roll = 0.14, dur = 1.6, why = '', look, focus,} = {}) {
      return { dur, why, kind: 'close', sub, focus, from: F({ d, az, h, fov, roll: roll * 0.4, ...(look || {}) }), to: F({ d: d * 0.95, az: az + 0.05, h, fov, roll, ...(look || {}) }) };
    },
    // Bird: high wide for geography (three villages).
    bird(sub, { d = 9, az = 0.3, h = 9, fov = 56, roll = 0.02, dur = 2.2, why = '', look, h1, focus,} = {}) {
      return { dur, why, kind: 'wide', sub, focus, from: F({ d, az, h, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * 1.08, az: az + 0.16, h: h1 ?? h * 1.1, fov, roll, ...(look || {}) }) };
    },
    // Hold-with-drift: the ONLY near-static comp, and it still rolls and creeps.
    drift(sub, { d = 3, az = 0, h = 1.2, fov = 55, roll = 0.02, dur = 1.4, why = '', kind = 'medium', look, focus,} = {}) {
      return { dur, why, kind, sub, focus, from: F({ d, az, h, fov, roll: -roll, ...(look || {}) }), to: F({ d: d * 1.03, az: az + 0.05, h: h + 0.06, fov, roll, ...(look || {}) }) };
    },
  };

  // Intended subject height in metres per scale. A composition is only readable if the
  // thing it is ABOUT occupies a sane share of the frame - this is the framing standard
  // the motion gate cannot see (a film can move constantly and still frame nothing).
  const FOCUS = { macro: 0.9, close: 1.3, medium: 2.5, wide: 12 };
  const BAND = { macro: [0.35, 1.05], close: [0.30, 0.95], medium: [0.35, 1.10], wide: [0.45, 1.30] };

  /* ---- planner: validates the comp list against cinematic rules ---- */
  function plan(comps, { maxComp = 2.2 } = {}) {
    const problems = [];
    let t = 0; const marks = [];
    comps.forEach((c, i) => {
      if (!c.why) problems.push(`comp ${i} has no story reason (why)`);
      if (c.dur > maxComp + 1e-6) problems.push(`comp ${i} (${c.kind}) runs ${c.dur.toFixed(2)}s > ${maxComp}s`);
      if (i > 0 && c.kind === 'medium' && comps[i - 1].kind === 'medium') problems.push(`comp ${i}: two medium shots in a row`);
      marks.push({ i, t0: t, t1: t + c.dur, kind: c.kind, why: c.why });
      t += c.dur;
    });
    const kinds = {}; comps.forEach(c => kinds[c.kind] = (kinds[c.kind] || 0) + 1);
    return { total: t, marks, problems, kinds, count: comps.length };
  }

  /* ---- Director: turns comps into one continuous camera flight ---- */
  function Director({ comps, aspect = 720 / 1280, blend = 0.34, handheld = 0.006, impacts = [], rollDrift = 0.012, seed = 1 }) {
    const T = window.THREE;
    const cam = new T.PerspectiveCamera(comps[0].from.fov, aspect, 0.05, 300);
    const bounds = []; let acc = 0;
    for (const c of comps) { bounds.push([acc, acc + c.dur]); acc += c.dur; }
    const total = acc;
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    // deterministic per-director noise phases, so renders are reproducible frame to frame
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];

    function subOf(c, gt) { return c.subFn ? c.subFn(gt) : c.sub; }
    function frame(ci, u, gt) {
      const c = comps[ci];
      const e = outCubic(clamp(u, 0, 1));           // fast in, slow drift
      const f = blendF(c.from, c.to, e);
      const sub = subOf(c, gt);
      return { pos: place(sub, f), look: [sub[0] + (f.lx || 0), sub[1] + (f.ly || 0), sub[2] + (f.lz || 0)], fov: f.fov, roll: f.roll };
    }
    let last = null;
    function idxAt(t) {
      let i = 0; while (i < bounds.length - 1 && t >= bounds[i][1]) i++;
      return i;
    }
    function at(t, opts = {}) {
      const gt = (opts.globalT ?? t);
      const ci = idxAt(t);
      const [a, b] = bounds[ci];
      const lt = t - a, u = clamp(lt / Math.max(1e-4, b - a), 0, 1);
      let fr = frame(ci, u, gt);
      // blend across the boundary from the previous comp's END framing: a fast move in,
      // with both framings in motion, so it reads as a flight and not a cut.
      if (ci > 0 && lt < blend) {
        const prev = frame(ci - 1, 1, gt);
        const w = outQuint(clamp(lt / blend, 0, 1));
        fr = {
          pos: [lerp(prev.pos[0], fr.pos[0], w), lerp(prev.pos[1], fr.pos[1], w), lerp(prev.pos[2], fr.pos[2], w)],
          look: [lerp(prev.look[0], fr.look[0], w), lerp(prev.look[1], fr.look[1], w), lerp(prev.look[2], fr.look[2], w)],
          fov: lerp(prev.fov, fr.fov, w), roll: lerp(prev.roll, fr.roll, w),
        };
      }
      // handheld micro-jitter (two sines, never random per frame -> no flicker)
      const hh = opts.handheld ?? handheld;
      let px = fr.pos[0] + Math.sin(t * 1.9 + ph[0]) * hh + Math.sin(t * 4.3 + ph[1]) * hh * 0.4;
      let py = fr.pos[1] + Math.sin(t * 2.4 + ph[2]) * hh * 0.8;
      let pz = fr.pos[2] + Math.cos(t * 1.6 + ph[3]) * hh * 0.6;
      // impact shake: decaying, story-timed (bell strike, hammer tap, bell seating)
      let shake = 0;
      for (const im of impacts) {
        const dt = t - im.t;
        if (dt >= 0 && dt < (im.dur ?? 0.5)) shake += (im.amp ?? 0.05) * Math.exp(-dt * (im.decay ?? 9));
      }
      if (shake > 0) { px += Math.sin(t * 61) * shake; py += Math.cos(t * 53) * shake; }
      // the horizon is never locked: base dutch + slow drift
      const roll = fr.roll + Math.sin(t * 0.62 + ph[0]) * rollDrift + shake * 0.35;
      cam.position.set(px, py, pz);
      cam.fov = fr.fov; cam.updateProjectionMatrix();
      cam.up.set(Math.sin(roll), Math.cos(roll), 0);
      cam.lookAt(fr.look[0], fr.look[1], fr.look[2]);
      last = { ci, kind: comps[ci].kind, why: comps[ci].why, roll, shake };
      return last;
    }
    // Framing report for the CURRENT camera state (call after at()).
    function framing(globalT) {
      if (!last) return null;
      const c = comps[last.ci];
      const focus = c.focus ?? FOCUS[c.kind] ?? 2;
      const sub = subOf(c, globalT ?? 0);
      const d = Math.hypot(cam.position.x - sub[0], cam.position.y - sub[1], cam.position.z - sub[2]);
      const visH = 2 * d * Math.tan(cam.fov * Math.PI / 360);
      const coverage = focus / Math.max(1e-4, visH);
      const band = BAND[c.kind] || [0.2, 1.3];
      const verdict = coverage < band[0] ? 'TOO SMALL' : coverage > band[1] ? 'OVERFLOWS' : 'ok';
      // A pull or crane deliberately traverses scales, so also report the endpoints.
      const covAt = (f) => { const p = place(sub, f); const dd = Math.hypot(p[0]-sub[0], p[1]-sub[1], p[2]-sub[2]);
        return +(focus / Math.max(1e-4, 2 * dd * Math.tan(f.fov * Math.PI / 360))).toFixed(3); };
      return { ci: last.ci, kind: c.kind, why: c.why, dist: +d.toFixed(2), visH: +visH.toFixed(2),
               fov: +cam.fov.toFixed(1), focus, coverage: +coverage.toFixed(3), band, verdict,
               sweep: [covAt(c.from), covAt(c.to)], explicitFocus: c.focus != null };
    }
    return { cam, at, framing, total, comps, bounds, plan: plan(comps) };
  }

  window.Cinema2 = function () { return { Director, moves, plan, F }; };
})();
