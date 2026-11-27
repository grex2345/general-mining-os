// film_gojo.js — Round 16: "Infinity Is A Coffin" (Gojo / Jujutsu Kaisen).
// The user's script is used VERBATIM; scene boundaries come from read-only whisper
// alignment of the single continuous narration take (research/artifacts/round16/scene-cues.json).
//
// Every scene has its own environment, its own light rig, its own animated diagram and
// its own directed acting. Compositions are <= 2.2s with a story reason, no two mediums
// in a row, and every scene changes place on a moving transition rather than a hard cut.
//
// Browser-side classic script: window.GojoFilm = { TOTAL, scenes, build(i, ctx), spec() }
// ctx = { THREE, W, K, G (GojoWorld), C (Cinema2), lip, words, cues }
(function () {
  const TOTAL = 83.20;   // narration ends 81.310s; 0.79s hold then a 1.1s fade to black
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;
  const mat = (o) => {
    if (!o) return null;
    if (o.material && o.material.color) return o.material;
    if (o.children) { for (const c of o.children) { if (c.material && c.material.color) return c.material; } }
    return null;
  };
  const ramp = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);

  // Continuous camera life. Each comp eases out (outCubic), so its move is nearly
  // finished by 80% of its duration; without a floor the last third of a comp sat
  // almost still. The horizon sway and handheld drift run through the whole film.
  const directed = (C, o = {}) => C.Director(Object.assign({}, o, {
    handheld: Math.max(o.handheld || 0, 0.014),
    rollDrift: Math.max(o.rollDrift || 0, 0.032),
  }));

  const GOJO = { skin: '#f2d3bd', skinSh: '#d9ab93', hair: '#f6f8fd', hairSh: '#c6cede', coat: '#1b1f33', coatHi: '#2f3552', pants: '#15182a', boot: '#0d0f1a' };
  const H = 2.75;                 // Gojo billboard height in world metres
  const faceY = H * 0.855;        // head centre above the feet (head sits high on this puppet)

  // Fit a comp list exactly to a scene duration, keeping every comp <= 2.2s.
  // `wide` is the real height of what a wide shot must contain in THIS scene.
  // cinema2's default (12m) was calibrated on the village film; using it here would
  // report every character wide as OVERFLOWS and tempt us to push the camera back
  // until Gojo is a speck. Each scene declares its own subject scale instead.
  const FOCUS_KIND = { macro: 0.9, close: 1.3, medium: 2.5 };
  function fit(comps, dur, wide = 4.6) {
    comps.forEach((c) => { if (c.focus == null) c.focus = (c.kind === 'wide' ? wide : (FOCUS_KIND[c.kind] || 2.5)); });
    const sum = comps.reduce((s, c) => s + c.dur, 0);
    const k = dur / sum;
    comps.forEach((c) => { c.dur = +(c.dur * k).toFixed(4); });
    const drift = dur - comps.reduce((s, c) => s + c.dur, 0);
    comps[comps.length - 1].dur = +(comps[comps.length - 1].dur + drift).toFixed(4);
    return comps;
  }

  // Shared: lip-sync + idle so a standing Gojo is never frozen.
  function act(ctx, gt, base) {
    const m = ctx.lip ? ctx.lip.mouthAt(gt) : { mouthShape: 'rest', talk: 0 };
    const blink = (Math.sin(gt * 0.83) > 0.988 || Math.sin(gt * 1.31 + 2) > 0.993) ? 0.08 : 1;
    return Object.assign({
      t: gt, talk: m.talk, mouthShape: m.mouthShape, blink,
      squash: Math.sin(gt * 1.1) * 0.006,
      tilt: Math.sin(gt * 0.7) * 0.012,
    }, base);
  }

  const scenes = [
    /* 0 */ { id: 'hook', name: 'Infinity is a coffin', start: 0.000, dur: 7.570, trans: { type: 'fadein', dur: 0.9 } },
    /* 1 */ { id: 'twoway', name: 'Nothing in, nothing out', start: 7.570, dur: 5.620, trans: { type: 'dissolve', dur: 0.5 } },
    /* 2 */ { id: 'thermos', name: 'Not a wall — a thermos', start: 13.190, dur: 2.820, trans: { type: 'bloom', dur: 0.45 } },
    /* 3 */ { id: 'nasa', name: 'NASA solved this', start: 16.010, dur: 2.860, trans: { type: 'wipe', dur: 0.5 } },
    /* 4 */ { id: 'suit', name: 'The suit needs a radiator', start: 18.870, dur: 4.500, trans: { type: 'dissolve', dur: 0.55 } },
    /* 5 */ { id: 'watts100', name: '100 watts doing nothing', start: 23.370, dur: 3.540, trans: { type: 'dissolve', dur: 0.45 } },
    /* 6 */ { id: 'watts1000', name: 'A thousand in a fight', start: 26.910, dur: 3.100, trans: { type: 'bloom', dur: 0.35 } },
    /* 7 */ { id: 'sweat', name: 'Sweating cannot save him', start: 30.010, dur: 1.840, trans: { type: 'dissolve', dur: 0.3 } },
    /* 8 */ { id: 'evaporate', name: 'The sweat cannot evaporate', start: 31.850, dur: 1.720, trans: { type: 'dissolve', dur: 0.3 } },
    /* 9 */ { id: 'cook', name: 'Four minutes per degree', start: 33.570, dur: 5.180, trans: { type: 'wipe', dur: 0.45 } },
    /* 10 */ { id: 'bakes', name: 'He bakes in his own defence', start: 38.750, dur: 2.160, trans: { type: 'dissolve', dur: 0.35 } },
    /* 11 */ { id: 'sixeyes', name: 'The Six Eyes are mandatory', start: 40.910, dur: 2.640, trans: { type: 'bloom', dur: 0.5 } },
    /* 12 */ { id: 'filter', name: 'Filtering every atom', start: 43.550, dur: 7.360, trans: { type: 'dissolve', dur: 0.5 } },
    /* 13 */ { id: 'focus', name: 'One second of focus lost', start: 50.910, dur: 3.460, trans: { type: 'dissolve', dur: 0.35 } },
    /* 14 */ { id: 'rct', name: 'Reverse cursed technique 24/7', start: 54.370, dur: 6.860, trans: { type: 'bloom', dur: 0.5 } },
    /* 15 */ { id: 'compare', name: 'A radiator vs a brain', start: 61.230, dur: 4.260, trans: { type: 'wipe', dur: 0.5 } },
    /* 16 */ { id: 'difference', name: "That's the difference", start: 65.490, dur: 1.280, trans: { type: 'dissolve', dur: 0.25 } },
    /* 17 */ { id: 'switch', name: 'One can be switched off', start: 66.770, dur: 2.980, trans: { type: 'dissolve', dur: 0.35 } },
    /* 18 */ { id: 'yourinfinity', name: 'Your own infinity', start: 69.750, dur: 4.680, trans: { type: 'wipe', dur: 0.55 } },
    /* 19 */ { id: 'call', name: 'The call you never make', start: 74.430, dur: 3.400, trans: { type: 'dissolve', dur: 0.4 } },
    /* 20 */ { id: 'nothing', name: 'Nothing in, nothing out', start: 77.830, dur: 2.600, trans: { type: 'dissolve', dur: 0.4 } },
    /* 21 */ { id: 'question', name: "So what's yours?", start: 80.430, dur: 2.770, trans: { type: 'dissolve', dur: 0.6 } },
  ];

  function build(i, ctx) {
    const { THREE: T, W, K, G, C } = ctx;
    const sc = new T.Scene();
    const anim = [];
    const add = (o) => { sc.add(o.group || o); return o; };
    const shot = scenes[i];
    const S = shot.start;
    let comps = [], subject = [0, faceY, 0], fog = null;

    /* ---------------- 0. HOOK ---------------- */
    if (shot.id === 'hook') {
      sc.fog = new T.FogExp2(0x070912, 0.030);
      add(G.voidDome({ top: '#04050c', mid: '#0a1030', bottom: '#170f28' }));
      const L = G.rig(sc, 'void');
      // Tokyo far below/behind: establishes the world before the metaphor
      const tk = add(G.tokyo({ seed: 3, n: 15, spread: 44, z: -26 })); anim.push(tk);
      add(W.surface({ p: [0, 0, 0], s: [40, 30], kind: 'plain', a: '#0d1120' }));
      const rays = add(G.godRays({ p: [0, 0, -5], n: 4, color: 'rgba(120,190,255,1)', h: 11, w: 1.5 })); anim.push(rays);
      const fogB = add(G.fogBank({ p: [0, 0, -3], n: 5, color: 'rgba(90,130,200,1)', spread: 16, y: 0.7, r: 5 })); anim.push(fogB);
      const emb = add(G.embers({ bounds: [-6, 6, 0, 7, -6, 2], n: 20, color: 'rgba(140,210,255,1)' })); anim.push(emb);
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 2.0 })); anim.push(shell);
      // the coffin fades in around him as the line lands
      const cf = add(G.coffin({ p: [0, 0, 0], h: 3.0 })); anim.push(cf);
      cf.group.visible = false;
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.low([0, 1.2, 0], { d: 5.40, az: -0.35, h: 0.30, fov: 74, dur: 1.7, why: 'loom: introduce Gojo from below so Infinity feels vast', rise: 0.5, kind: 'wide' }),
        C.moves.push(subject, { d0: 4.20, d1: 2.30, az: 0.22, h0: 0.30, h1: 0.10, fov0: 60, fov1: 50, dur: 1.9, why: "name the shield: push to his face on 'isn't a shield'", kind: 'close' }),
        C.moves.orbit([0, 1.5, 0], { d: 4.60, az0: -0.7, az1: 0.55, h0: 1.0, h1: 1.5, fov: 58, dur: 2.0, why: 'circle the shell so the audience sees it is closed', kind: 'wide' }),
        C.moves.pull([0, 1.4, 0], { d0: 2.30, d1: 6.60, az: 0.15, h0: 0.5, h1: 2.2, fov0: 66, fov1: 52, dur: 2.0, why: "reveal the coffin on 'he's sealed inside it'", kind: 'wide' }),
      ], shot.dur, 4.8);
      const dir = directed(C, { comps, handheld: 0.006, impacts: [[3.4, 0.05]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t;
          dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          const seal = ramp(t, 3.2, 5.4);
          shell.update(gt, { pulse: 0.25 + 0.35 * Math.sin(gt * 1.4), seal });
          // coffin materialises as the shell tightens
          cf.group.visible = seal > 0.02;
          cf.group.scale.setScalar(lerp(1.25, 1.0, seal));
          cf.group.traverse((o) => { if (o.material && o.material.transparent !== undefined) { o.material.transparent = true; o.material.opacity = seal * 0.92; } });
          cf.update(gt, 0.12 * (1 - seal));
          gj.update(dir.cam, act(ctx, gt, {
            mood: seal > 0.5 ? 'serious' : 'smirk', arms: seal > 0.6 ? 'chest' : 'hips',
            blindfold: 1, lean: 0.02, headTilt: Math.sin(gt * 0.5) * 0.03,
            lookX: Math.sin(gt * 0.33) * 0.25, aura: 0.30 + seal * 0.25,
            curl: 0.5, nerv: seal * 0.12,
          }));
          L.rim.intensity = 1.6 + seal * 1.2;
        },
      };
    }

    /* ---------------- 1. TWO-WAY ---------------- */
    if (shot.id === 'twoway') {
      sc.fog = new T.FogExp2(0x0a0a16, 0.026);
      add(G.voidDome({ top: '#05060e', mid: '#101a3c', bottom: '#1d1030' }));
      G.rig(sc, 'void');
      add(W.surface({ p: [0, 0, 0], s: [36, 26], kind: 'plain', a: '#0e1222' }));
      const rays = add(G.godRays({ p: [0, 0, -4], n: 3, color: 'rgba(150,200,255,1)', h: 10, w: 1.4 })); anim.push(rays);
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 2.0 })); anim.push(shell);
      const knives = add(G.atomStream({ n: 10, kind: 'knife', from: [-5.2, 2.2, 0.4], to: [0, 1.5, 0], barrierR: 2.0 })); anim.push(knives);
      const heat = add(G.atomStream({ n: 12, kind: 'heat', from: [-4.4, 1.2, -0.6], to: [0, 1.5, 0], barrierR: 2.0 })); anim.push(heat);
      const hc = add(G.heatColumn({ p: [0, 0, 0], r: 1.5, h: 3.4, n: 18 })); anim.push(hc);
      const emb = add(G.embers({ bounds: [-5, 5, 0, 6, -5, 2], n: 16, color: 'rgba(255,170,90,1)' })); anim.push(emb);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.orbit([0, 1.5, 0], { d: 5.00, az0: -0.9, az1: -0.1, h0: 1.1, h1: 1.5, fov: 60, dur: 1.9, why: 'knives arrive and stop dead at the shell', kind: 'wide' }),
        C.moves.macro([-1.95, 1.6, 0.4], { d: 1.55, az: -0.5, h: 0.1, fov: 60, dur: 1.3, why: 'macro on the impact point: nothing touches him' }),
        C.moves.push(subject, { d0: 3.60, d1: 2.20, az: 0.5, h0: 0.25, h1: 0.05, fov0: 58, fov1: 50, dur: 1.5, why: 'his face while heat fails to leave', kind: 'close' }),
        C.moves.pull([0, 1.5, 0], { d0: 2.40, d1: 6.20, az: 0.3, h0: 0.6, h1: 2.0, fov0: 64, fov1: 54, dur: 1.7, why: "show heat bouncing back on 'nothing gets out'", kind: 'wide' }),
      ], shot.dur, 4.8);
      const dir = directed(C, { comps, impacts: [[0.9, 0.06], [1.5, 0.05]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t;
          dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          const outPhase = ramp(t, 2.6, 4.2);
          shell.update(gt, { pulse: 0.3 + 0.3 * Math.sin(gt * 2.2), heat: outPhase * 0.7 });
          knives.update(gt, { active: 1 - outPhase * 0.6 });
          // heat tries to escape but is reflected: reverse the stream in the second half
          heat.update(gt, { active: 0.35 + outPhase * 0.65 });
          hc.update(gt, { intensity: 0.4 + outPhase * 0.8 });
          gj.update(dir.cam, act(ctx, gt, {
            mood: outPhase > 0.5 ? 'strain' : 'calm', arms: outPhase > 0.5 ? 'chest' : 'down',
            blindfold: 1, heat: outPhase * 0.45, sweat: outPhase * 0.3,
            lean: -0.02, headTilt: -0.02, aura: 0.35, curl: 0.45,
          }));
        },
      };
    }

    /* ---------------- 2. THERMOS ---------------- */
    if (shot.id === 'thermos') {
      sc.fog = new T.FogExp2(0x0c1020, 0.020);
      add(G.voidDome({ top: '#070a16', mid: '#141d3e', bottom: '#241634' }));
      G.rig(sc, 'lab');
      add(W.surface({ p: [0, 0, 0], s: [24, 20], kind: 'plain', a: '#141a2a' }));
      const th = add(G.thermos({ p: [0, 0.2, 0], h: 3.4 })); anim.push(th);
      const hc = add(G.heatColumn({ p: [0, 0.3, 0], r: 0.7, h: 3.6, n: 14 })); anim.push(hc);
      const label = add(G.hud({
        p: [1.9, 2.5, 0.2], s: [2.0, 1.0], px: [512, 256],
        draw: (c, Wd, Hh, t, st) => {
          c.fillStyle = 'rgba(8,14,26,.78)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#66e4ff'; c.lineWidth = 4; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#66e4ff'; c.font = 'bold 40px monospace'; c.fillText('VACUUM GAP', 26, 62);
          c.fillStyle = '#ffd166'; c.font = 'bold 30px monospace'; c.fillText('conduction  BLOCKED', 26, 116);
          c.fillStyle = '#ff8f5a'; c.fillText('convection  BLOCKED', 26, 158);
          c.fillStyle = '#fff'; c.font = 'bold 28px monospace'; c.fillText('heat has nowhere to go', 26, 214);
        },
      })); anim.push(label);
      subject = [0, 1.8, 0];
      comps = fit([
        C.moves.push(subject, { d0: 8.00, d1: 5.60, az: -0.4, h0: 0.4, h1: 0.1, fov0: 60, fov1: 52, dur: 1.4, why: "cut from the man to the object on 'it's a thermos'", kind: 'medium' }),
        C.moves.macro([0.0, 1.6, 0.9], { d: 1.25, az: 0.3, h: 0.05, fov: 58, dur: 1.0, why: 'macro into the vacuum gap where heat is trapped' }),
        C.moves.orbit(subject, { d: 6.40, az0: 0.2, az1: 0.9, h0: 0.5, h1: 0.9, fov: 56, dur: 1.2, why: 'read the label beside the flask', kind: 'wide' }),
      ], shot.dur, 3.6);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          th.update(gt, { trap: 1 }); hc.update(gt, { intensity: 0.8 });
          label.update(gt, {});
          label.group.rotation.y = Math.atan2(dir.cam.position.x - 1.9, dir.cam.position.z - 0.2);
        },
      };
    }

    /* ---------------- 3. NASA ---------------- */
    if (shot.id === 'nasa') {
      sc.fog = new T.FogExp2(0x0b1018, 0.018);
      sc.background = new T.Color(0x0a0e16);
      const L = G.rig(sc, 'lab');
      const mc = add(G.missionControl({ seed: 5 })); anim.push(mc);
      const dust = add(G.fogBank({ p: [0, 0, -4], n: 4, color: 'rgba(120,170,230,1)', spread: 18, y: 2.4, r: 4 })); anim.push(dust);
      const badge = add(G.hud({
        p: [-4.6, 4.4, -10.4], s: [3.0, 1.0], px: [600, 200],
        draw: (c, Wd, Hh) => {
          c.fillStyle = 'rgba(6,12,22,.85)'; c.fillRect(0, 0, Wd, Hh);
          c.fillStyle = '#ff5a5a'; c.font = 'bold 62px sans-serif'; c.fillText('NASA', 24, 78);
          c.fillStyle = '#8fd8ff'; c.font = 'bold 30px monospace'; c.fillText('THERMAL CONTROL DIVISION', 24, 132);
          c.fillStyle = '#ffd166'; c.font = 'bold 26px monospace'; c.fillText('budget: $ millions', 24, 174);
        },
      })); anim.push(badge);
      subject = [0, 2.6, -6];
      comps = fit([
        C.moves.crane([0, 1.6, -5], { d: 11.00, az: 0.15, h0: 0.6, h1: 3.0, fov0: 66, fov1: 56, dur: 1.5, why: 'crane up over the console floor: scale of the effort', kind: 'wide' }),
        C.moves.push([0, 3.2, -10.6], { d0: 13.00, d1: 9.60, az: -0.1, h0: 0.2, h1: 0.0, fov0: 56, fov1: 50, dur: 1.4, why: 'push to the main display naming the problem', kind: 'medium', focus: 3.6 }),
      ], shot.dur, 14.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          mc.update(gt, dir.cam); dust.update(gt); badge.update(gt, {});
          L.screen.intensity = 1.1 + 0.2 * Math.sin(gt * 2);
        },
      };
    }

    /* ---------------- 4. SUIT + RADIATOR ---------------- */
    if (shot.id === 'suit') {
      add(G.voidDome({ top: '#02030a', mid: '#050a1c', bottom: '#0a1226', nebula: true }));
      const L = G.rig(sc, 'space');
      const rig = add(G.spaceRig({ earth: true })); anim.push(rig);
      const eva = add(G.evaSuit({ p: [-1.2, 0.6, 1.6], h: 3.0 })); anim.push(eva);
      const st = K.stars({ n: 60, r: 70 }); sc.add(st.group); anim.push(st);
      const callout = add(G.hud({
        p: [2.6, 2.4, 0.8], s: [2.4, 1.3], px: [560, 300],
        draw: (c, Wd, Hh, t, st2) => {
          c.fillStyle = 'rgba(6,12,22,.80)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#ff8f5a'; c.lineWidth = 4; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#fff'; c.font = 'bold 38px sans-serif'; c.fillText('PERFECT SHIELD', 24, 58);
          c.fillStyle = '#8fd8ff'; c.font = 'bold 28px monospace'; c.fillText('micrometeoroid  OK', 24, 110);
          c.fillText('vacuum         OK', 24, 150);
          c.fillStyle = '#ff6a3a'; c.font = 'bold 32px monospace'; c.fillText('body heat      NOT OK', 24, 204);
          c.fillStyle = '#ffd166'; c.font = 'bold 30px monospace'; c.fillText('\u2192 needs a RADIATOR', 24, 258);
        },
      })); anim.push(callout);
      subject = [-1.2, 2.0, 1.6];
      comps = fit([
        C.moves.pull(subject, { d0: 4.20, d1: 9.00, az: -0.5, h0: 0.4, h1: 1.4, fov0: 66, fov1: 54, dur: 1.6, why: 'reveal the suit against the Earth limb', kind: 'wide' }),
        C.moves.macro([-1.2, 2.4, 0.88], { d: 2.00, az: 3.50, h: 0.05, fov: 58, dur: 1.2, why: 'macro on the backpack radiator throwing heat away', focus: 0.9 }),
        C.moves.orbit([1.0, 1.8, -2.0], { d: 9.00, az0: 0.3, az1: 1.0, h0: 0.8, h1: 1.4, fov: 58, dur: 1.7, why: 'orbit to the station radiator panel: the engineered answer', kind: 'wide' }),
      ], shot.dur, 8.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const rad = ramp(t, 1.0, 2.4);
          rig.update(gt, { radiate: rad }); eva.update(gt, { radiate: 0.4 + rad * 0.6 });
          st.update(gt); callout.update(gt, {});
          callout.group.rotation.y = Math.atan2(dir.cam.position.x - 2.6, dir.cam.position.z - 0.8);
        },
      };
    }

    /* ---------------- 5. 100 WATTS ---------------- */
    if (shot.id === 'watts100') {
      sc.fog = new T.FogExp2(0x0a0c16, 0.024);
      add(G.voidDome({ top: '#06070f', mid: '#101832', bottom: '#1a1226' }));
      G.rig(sc, 'void');
      add(W.surface({ p: [0, 0, 0], s: [28, 22], kind: 'plain', a: '#0f1424' }));
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const hc = add(G.heatColumn({ p: [0, 0, 0], r: 1.0, h: 3.2, n: 20 })); anim.push(hc);
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95 })); anim.push(shell);
      const gauge = add(G.hud({
        p: [2.3, 2.3, 0.4], s: [2.2, 1.5], px: [512, 350],
        draw: (c, Wd, Hh, t, st2) => {
          c.fillStyle = 'rgba(6,12,22,.82)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#66e4ff'; c.lineWidth = 4; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#8fd8ff'; c.font = 'bold 30px monospace'; c.fillText('RESTING OUTPUT', 24, 52);
          c.fillStyle = '#ffd166'; c.font = 'bold 110px monospace'; c.fillText('100', 24, 172);
          c.fillStyle = '#fff'; c.font = 'bold 46px monospace'; c.fillText('WATTS', 250, 172);
          c.fillStyle = '#8affc0'; c.font = 'bold 26px monospace'; c.fillText('doing nothing at all', 24, 224);
          // bar
          const w = (Wd - 48) * 0.10;
          c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(24, 262, Wd - 48, 30);
          c.fillStyle = '#ffd166'; c.fillRect(24, 262, w, 30);
          c.fillStyle = '#6a7a92'; c.font = '20px monospace'; c.fillText('0', 24, 320); c.fillText('1000 W', Wd - 110, 320);
        },
      })); anim.push(gauge);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.dutch(subject, { d: 2.40, az: -0.2, h: 0.05, fov: 52, roll: 0.08, dur: 1.4, why: 'quiet close: you are a heater even at rest' }),
        C.moves.orbit([0, 1.4, 0], { d: 4.40, az0: 0.2, az1: 0.95, h0: 0.9, h1: 1.3, fov: 58, dur: 1.5, why: 'orbit to read the wattage beside him', kind: 'wide' }),
        C.moves.macro([0.3, 2.0, 0.9], { d: 1.55, az: 0.5, h: 0.1, fov: 60, dur: 1.1, why: 'macro on heat leaving the skin' }),
      ], shot.dur, 4.4);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.15, heat: 0.15 });
          hc.update(gt, { intensity: 0.55 });
          gauge.update(gt, {});
          gauge.group.rotation.y = Math.atan2(dir.cam.position.x - 2.3, dir.cam.position.z - 0.4);
          gj.update(dir.cam, act(ctx, gt, { mood: 'calm', arms: 'down', blindfold: 1, heat: 0.12, lean: 0.01, lookX: Math.sin(gt * 0.4) * 0.2 }));
        },
      };
    }

    /* ---------------- 6. 1000 WATTS / FIGHT ---------------- */
    if (shot.id === 'watts1000') {
      sc.fog = new T.FogExp2(0x140a10, 0.026);
      add(G.voidDome({ top: '#0d0610', mid: '#2a1030', bottom: '#3a1220' }));
      const L = G.rig(sc, 'heat');
      const tk = add(G.tokyo({ seed: 8, n: 13, spread: 40, z: -24 })); anim.push(tk);
      add(W.surface({ p: [0, 0, 0], s: [34, 26], kind: 'plain', a: '#1a1020' }));
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95, color: '#ffb070' })); anim.push(shell);
      const hc = add(G.heatColumn({ p: [0, 0, 0], r: 1.7, h: 5.0, n: 30, color: 'rgba(255,110,50,1)' })); anim.push(hc);
      const emb = add(G.embers({ bounds: [-6, 6, 0, 7, -5, 2], n: 26, color: 'rgba(255,140,60,1)' })); anim.push(emb);
      // speed streaks: the fight is implied by motion, not a still pose
      const streaks = [];
      for (let k = 0; k < 10; k++) {
        const m = W.box({ p: [0, 1.2 + k * 0.2, -1.5], s: [2.6, 0.03, 0.03], color: '#ffd0a0', ink: 0 });
        sc.add(m); streaks.push({ m, off: k / 10, y: 0.6 + (k % 5) * 0.55 });
      }
      const gauge = add(G.hud({
        p: [2.4, 2.4, 0.4], s: [2.2, 1.5], px: [512, 350],
        draw: (c, Wd, Hh, t) => {
          c.fillStyle = 'rgba(26,6,6,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#ff6a3a'; c.lineWidth = 5; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#ffb08a'; c.font = 'bold 30px monospace'; c.fillText('HIGH-SPEED FIGHT', 24, 52);
          c.fillStyle = '#ff5a28'; c.font = 'bold 104px monospace'; c.fillText('1000', 24, 172);
          c.fillStyle = '#fff'; c.font = 'bold 44px monospace'; c.fillText('WATTS', 300, 172);
          c.fillStyle = '#ffd166'; c.font = 'bold 26px monospace'; c.fillText('10x resting output', 24, 224);
          const w = (Wd - 48) * (0.85 + 0.1 * Math.sin(t * 8));
          c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(24, 262, Wd - 48, 30);
          c.fillStyle = '#ff5a28'; c.fillRect(24, 262, w, 30);
        },
      })); anim.push(gauge);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.low([0, 1.3, 0], { d: 3.60, az: -0.6, h: 0.25, fov: 74, dur: 1.0, why: 'slam to a low wide as the fight spikes the heat', rise: 0.4, kind: 'wide' }),
        C.moves.dutch(subject, { d: 2.10, az: 0.4, h: 0.05, fov: 54, roll: 0.16, dur: 1.1, why: 'dutch close on strain: effort has a thermal cost' }),
        C.moves.pull([0, 1.5, 0], { d0: 2.60, d1: 6.00, az: 0.2, h0: 0.6, h1: 1.9, fov0: 66, fov1: 54, dur: 1.2, why: 'pull to the gauge and the heat flooding the shell', kind: 'wide' }),
      ], shot.dur, 4.6);
      const dir = directed(C, { comps, handheld: 0.012, impacts: [[0.0, 0.10], [1.0, 0.07]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          tk.update(gt);
          shell.update(gt, { pulse: 0.5 + 0.3 * Math.sin(gt * 6), heat: 0.8 });
          hc.update(gt, { intensity: 1.0 });
          emb.update(gt, { intensity: 1.0 });
          gauge.update(gt, {});
          gauge.group.rotation.y = Math.atan2(dir.cam.position.x - 2.4, dir.cam.position.z - 0.4);
          streaks.forEach(({ m, off, y }) => {
            const u = ((gt * 1.6 + off) % 1);
            m.position.set(lerp(5.5, -5.5, u), y, -1.2 - off * 2);
            m.scale.x = 0.5 + 1.6 * Math.sin(u * Math.PI);
            m.visible = Math.sin(u * Math.PI) > 0.15;
          });
          // combat acting: a fast strike-and-recover cycle
          const ph = (gt * 1.9) % 1;
          const strike = ph < 0.35;
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'stern', arms: strike ? 'point' : 'chest', blindfold: 1,
            heat: 0.55, sweat: 0.45, nerv: 0.25, aura: 0.7,
            lean: strike ? 0.16 : -0.05, twist: strike ? 0.5 : -0.2,
            headTurn: strike ? 0.4 : -0.1, curl: strike ? 0.8 : 0.5,
            squash: strike ? -0.02 : 0.01, stance: strike ? 1.5 : 1.1,
          }));
          L.fire.intensity = 2.2 + Math.sin(gt * 7) * 0.8;
        },
      };
    }

    /* ---------------- 7. SWEAT ---------------- */
    if (shot.id === 'sweat') {
      sc.fog = new T.FogExp2(0x140c10, 0.022);
      add(G.voidDome({ top: '#0c0810', mid: '#241428', bottom: '#301820' }));
      G.rig(sc, 'heat');
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.9, color: '#ffa060' })); anim.push(shell);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.macro([0.22, faceY + 0.05, 0.55], { d: 1.55, az: 0.25, h: 0.02, fov: 58, dur: 1.0, why: 'macro on sweat forming on the skin' }),
        C.moves.dutch(subject, { d: 1.70, az: -0.25, h: 0.02, fov: 50, roll: 0.12, dur: 0.9, why: 'pull to the face: sweat is not relief here' }),
      ], shot.dur, 2.0);
      const dir = directed(C, { comps, handheld: 0.008 });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          shell.update(gt, { pulse: 0.3, heat: 0.7 });
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'strain', arms: 'chest', blindfold: 1, heat: 0.6, sweat: 1.0,
            nerv: 0.3, headTilt: 0.05, lean: 0.04, curl: 0.6,
            armR: [0.10, 0.52], armL: [-0.10, 0.52],
          }));
        },
      };
    }

    /* ---------------- 8. CANNOT EVAPORATE ---------------- */
    if (shot.id === 'evaporate') {
      sc.fog = new T.FogExp2(0x140c10, 0.020);
      add(G.voidDome({ top: '#0c0810', mid: '#241428', bottom: '#301820' }));
      G.rig(sc, 'heat');
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.9, color: '#ff9050' })); anim.push(shell);
      // vapour that rises, hits the shell, and falls back as droplets
      const drops = [];
      for (let k = 0; k < 16; k++) {
        const sp = K.glow({ p: [0, 0, 0], r: 0.09, color: 'rgba(180,230,255,1)', o: 0.34 });
        sc.add(sp); drops.push({ sp, off: k / 16, a: (k / 16) * Math.PI * 2 });
      }
      const note = add(G.hud({
        p: [-2.4, 2.6, 0.3], s: [2.1, 0.9], px: [500, 214],
        draw: (c, Wd, Hh) => {
          c.fillStyle = 'rgba(26,8,8,.82)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#ff6a3a'; c.lineWidth = 4; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#fff'; c.font = 'bold 34px sans-serif'; c.fillText('EVAPORATION', 22, 54);
          c.fillStyle = '#ff5a28'; c.font = 'bold 44px monospace'; c.fillText('BLOCKED', 22, 114);
          c.fillStyle = '#ffb08a'; c.font = '24px monospace'; c.fillText('vapour cannot leave', 22, 166);
        },
      })); anim.push(note);
      subject = [0, 1.6, 0];
      comps = fit([
        C.moves.orbit([0, 1.5, 0], { d: 3.40, az0: -0.5, az1: 0.4, h0: 1.0, h1: 1.5, fov: 58, dur: 1.0, why: 'watch vapour hit the boundary and fall back', kind: 'medium' }),
        C.moves.macro([1.55, 1.9, 0.6], { d: 1.50, az: 0.55, h: 0.05, fov: 58, dur: 0.8, why: 'macro at the shell where droplets re-form' }),
      ], shot.dur, 3.6);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          shell.update(gt, { pulse: 0.35, heat: 0.8 });
          note.update(gt, {});
          note.group.rotation.y = Math.atan2(dir.cam.position.x + 2.4, dir.cam.position.z - 0.3);
          drops.forEach(({ sp, off, a }) => {
            const u = ((gt * 0.6 + off) % 1);
            const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
            const rr = lerp(0.5, 1.82, tri);
            sp.position.set(Math.cos(a) * rr, 1.0 + tri * 1.7 + Math.sin(a * 3) * 0.2, Math.sin(a) * rr);
            sp.material.opacity = 0.36 * (1 - tri * 0.4);
            sp.scale.setScalar(u < 0.5 ? 1 : 1.5);
          });
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'strain', arms: 'chest', blindfold: 1, heat: 0.7, sweat: 1.0, nerv: 0.35,
            headTilt: -0.04, curl: 0.65, armR: [0.09, 0.54], armL: [-0.09, 0.54],
          }));
        },
      };
    }

    /* ---------------- 9. COOKING COUNTDOWN ---------------- */
    if (shot.id === 'cook') {
      sc.fog = new T.FogExp2(0x1a0806, 0.030);
      add(G.voidDome({ top: '#140404', mid: '#3a0c08', bottom: '#4a1008' }));
      const L = G.rig(sc, 'heat');
      add(W.surface({ p: [0, 0, 0], s: [28, 22], kind: 'plain', a: '#1e0c0a' }));
      const gj = add(G.gojo({ p: [-1.0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [-1.0, 1.35, 0], r: 1.9, color: '#ff6a3a' })); anim.push(shell);
      const hc = add(G.heatColumn({ p: [-1.0, 0, 0], r: 1.6, h: 4.6, n: 26, color: 'rgba(255,90,40,1)' })); anim.push(hc);
      const brain = add(G.brainHolo({ p: [2.3, 2.2, 0.2], r: 0.78 })); anim.push(brain);
      const emb = add(G.embers({ bounds: [-5, 5, 0, 7, -4, 2], n: 24, color: 'rgba(255,120,50,1)' })); anim.push(emb);
      const timer = add(G.hud({
        p: [2.3, 4.0, 0.2], s: [2.6, 1.5], px: [600, 350],
        draw: (c, Wd, Hh, t, st2) => {
          const u = st2.u || 0;
          c.fillStyle = 'rgba(30,4,4,.86)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#ff3a20'; c.lineWidth = 6; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#ffb08a'; c.font = 'bold 28px monospace'; c.fillText('CORE TEMPERATURE RISE', 22, 48);
          const mins = Math.round(u * 20);
          c.fillStyle = u > 0.8 ? '#ff3a20' : '#ffd166'; c.font = 'bold 96px monospace';
          c.fillText(String(mins).padStart(2, '0'), 22, 156);
          c.fillStyle = '#fff'; c.font = 'bold 40px monospace'; c.fillText('MIN', 190, 156);
          c.fillStyle = '#ff8f5a'; c.font = 'bold 30px monospace';
          c.fillText('+1\u00b0C every 4 min', 22, 208);
          // thermometer
          const bh = 26, by = 250;
          c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(22, by, Wd - 44, bh);
          const g2 = c.createLinearGradient(22, 0, Wd - 22, 0);
          g2.addColorStop(0, '#ffd166'); g2.addColorStop(1, '#ff2a10');
          c.fillStyle = g2; c.fillRect(22, by, (Wd - 44) * u, bh);
          c.fillStyle = u > 0.85 ? '#ff3a20' : '#ffb08a'; c.font = 'bold 30px monospace';
          c.fillText(u > 0.85 ? 'BRAIN COOKING' : 'heating...', 22, 320);
        },
      })); anim.push(timer);
      subject = [-1.0, faceY, 0];
      comps = fit([
        C.moves.push([2.3, 3.4, 0.2], { d0: 7.00, d1: 5.00, az: 0.3, h0: 0.3, h1: 0.1, fov0: 58, fov1: 52, dur: 1.5, why: 'the numbers first: four minutes per degree', kind: 'medium' }),
        C.moves.dutch(subject, { d: 2.20, az: -0.35, h: 0.05, fov: 52, roll: 0.18, dur: 1.4, why: 'cut to his face as the countdown runs' }),
        C.moves.macro([2.3, 2.2, 0.2], { d: 1.30, az: 0.5, h: 0.05, fov: 58, dur: 1.2, why: 'macro on the brain beginning to cook' }),
        C.moves.pull([0.6, 2.0, 0], { d0: 3.00, d1: 7.00, az: 0.1, h0: 0.6, h1: 2.2, fov0: 66, fov1: 52, dur: 1.6, why: 'pull back: man and brain inside one sealed heat trap', kind: 'wide' }),
      ], shot.dur, 5.0);
      const dir = directed(C, { comps, handheld: 0.010, impacts: [[3.6, 0.06]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const u = ramp(t, 0.3, shot.dur - 0.4);
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.4 + u * 0.5, heat: 1 });
          hc.update(gt, { intensity: 0.7 + u * 0.6 });
          brain.update(gt, { heat: u, heal: 0, camera: dir.cam });
          timer.update(gt, { u });
          timer.group.rotation.y = Math.atan2(dir.cam.position.x - 2.3, dir.cam.position.z - 0.2);
          brain.group.rotation.y += 0;
          gj.update(dir.cam, act(ctx, gt, {
            mood: u > 0.7 ? 'agony' : 'strain', arms: u > 0.7 ? 'head' : 'chest', blindfold: 1,
            heat: 0.5 + u * 0.5, sweat: 1.0, nerv: 0.3 + u * 0.5,
            headTilt: Math.sin(gt * 3) * 0.05 * u, lean: 0.06 * u, curl: 0.7,
            squash: Math.sin(gt * 8) * 0.008 * u,
          }));
          L.fire.intensity = 2.2 + u * 2.4;
        },
      };
    }

    /* ---------------- 10. BAKES ---------------- */
    if (shot.id === 'bakes') {
      sc.fog = new T.FogExp2(0x1c0806, 0.034);
      add(G.voidDome({ top: '#180404', mid: '#40100a', bottom: '#501408' }));
      const L = G.rig(sc, 'heat');
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.85, color: '#ff5a28' })); anim.push(shell);
      const cf = add(G.coffin({ p: [0, 0, 0], h: 3.0 })); anim.push(cf);
      const hc = add(G.heatColumn({ p: [0, 0, 0], r: 1.5, h: 4.2, n: 22, color: 'rgba(255,80,30,1)' })); anim.push(hc);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.low([0, 1.4, 0], { d: 3.20, az: 0.3, h: 0.2, fov: 72, dur: 1.1, why: 'the defence is now an oven: loom from below', rise: 0.35 }),
        C.moves.dutch(subject, { d: 1.90, az: -0.3, h: 0.03, fov: 50, roll: 0.20, dur: 1.1, why: "hold on the face for 'his own defence'" }),
      ], shot.dur, 4.0);
      const dir = directed(C, { comps, handheld: 0.012 });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          shell.update(gt, { pulse: 0.7, seal: 1, heat: 1 });
          cf.update(gt, 0); hc.update(gt, { intensity: 1.1 });
          cf.group.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.55; } });
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'agony', arms: 'head', blindfold: 1, heat: 1.0, sweat: 1.0, nerv: 0.7,
            headTilt: Math.sin(gt * 4) * 0.06, curl: 0.8, squash: Math.sin(gt * 9) * 0.01,
          }));
          L.fire.intensity = 4.0 + Math.sin(gt * 8) * 1.0;
        },
      };
    }

    /* ---------------- 11. SIX EYES REVEAL ---------------- */
    if (shot.id === 'sixeyes') {
      sc.fog = new T.FogExp2(0x061020, 0.020);
      add(G.voidDome({ top: '#040a16', mid: '#0a2244', bottom: '#0e2a4a' }));
      const L = G.rig(sc, 'six');
      add(W.surface({ p: [0, 0, 0], s: [26, 20], kind: 'plain', a: '#0a1626' }));
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95 })); anim.push(shell);
      const rays = add(G.godRays({ p: [0, 0, -3], n: 5, color: 'rgba(120,230,255,1)', h: 10, w: 1.2 })); anim.push(rays);
      const burst = K.glow({ p: [0, faceY, 0.4], r: 2.2, color: 'rgba(160,245,255,1)', o: 0 }); sc.add(burst);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.push(subject, { d0: 3.00, d1: 1.55, az: 0.12, h0: 0.12, h1: 0.02, fov0: 56, fov1: 44, dur: 1.5, why: 'hard push to the eyes as the blindfold comes off', kind: 'close' }),
        C.moves.macro([0.0, faceY + 0.02, 0.5], { d: 1.55, az: -0.1, h: 0.0, fov: 46, dur: 1.1, why: 'macro: the Six Eyes themselves, the reason he survives' }),
      ], shot.dur, 1.6);
      const dir = directed(C, { comps, impacts: [[0.55, 0.09]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const six = ramp(t, 0.35, 1.05);
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.3 + six * 0.5, heat: (1 - six) * 0.8 });
          burst.material.opacity = Math.sin(clamp((t - 0.35) / 0.7, 0, 1) * Math.PI) * 0.34;
          burst.scale.setScalar(1 + six * 1.4);
          gj.update(dir.cam, act(ctx, gt, {
            mood: six > 0.5 ? 'reveal' : 'serious', arms: six > 0.6 ? 'palm' : 'temple',
            blindfold: 1, sixEyes: six, heat: (1 - six) * 0.7, sweat: (1 - six) * 0.8,
            aura: 0.4 + six * 0.6, focusRings: six, headTilt: -0.02, lookX: 0, lookY: 0,
            curl: 0.15, lean: -0.02,
          }));
          L.eye.intensity = 0.6 + six * 4.0;
        },
      };
    }

    /* ---------------- 12. ATOM FILTER ---------------- */
    if (shot.id === 'filter') {
      sc.fog = new T.FogExp2(0x06101c, 0.018);
      add(G.voidDome({ top: '#04080f', mid: '#0a1c34', bottom: '#10243c' }));
      const L = G.rig(sc, 'six');
      add(W.surface({ p: [0, 0, 0], s: [30, 24], kind: 'plain', a: '#0a1420' }));
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 2.05 })); anim.push(shell);
      const ox = add(G.atomStream({ n: 14, kind: 'oxygen', from: [-5.4, 2.4, 0.5], to: [0, 1.5, 0], barrierR: 2.05 })); anim.push(ox);
      const heat = add(G.atomStream({ n: 14, kind: 'heat', from: [-4.8, 1.0, -0.7], to: [0, 1.5, 0], barrierR: 2.05 })); anim.push(heat);
      const kn = add(G.atomStream({ n: 8, kind: 'knife', from: [5.4, 2.6, -0.4], to: [0, 1.5, 0], barrierR: 2.05 })); anim.push(kn);
      const dust = add(G.embers({ bounds: [-6, 6, 0, 6, -5, 3], n: 18, color: 'rgba(140,220,255,1)' })); anim.push(dust);
      const legend = add(G.hud({
        p: [3.0, 3.0, 0.4], s: [2.5, 1.7], px: [560, 380],
        draw: (c, Wd, Hh, t, st2) => {
          c.fillStyle = 'rgba(6,14,24,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#66e4ff'; c.lineWidth = 4; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#fff'; c.font = 'bold 32px sans-serif'; c.fillText('MANUAL FILTER', 22, 50);
          const rows = [['#8affc0', 'oxygen', 'IN'], ['#ff9a4a', 'heat', 'OUT'], ['#ff5a5a', 'knives', 'OUT']];
          rows.forEach((r, i) => {
            const y = 112 + i * 74;
            const on = (st2.phase || 0) === i;
            c.fillStyle = on ? r[0] : 'rgba(255,255,255,.35)';
            c.beginPath(); c.arc(40, y - 10, on ? 16 : 11, 0, Math.PI * 2); c.fill();
            c.font = `bold ${on ? 36 : 30}px monospace`;
            c.fillText(r[1], 74, y);
            c.fillStyle = on ? '#fff' : 'rgba(255,255,255,.4)';
            c.fillText(r[2], 340, y);
          });
          c.fillStyle = '#8fd8ff'; c.font = '22px monospace'; c.fillText('every single atom, by hand', 22, 350);
        },
      })); anim.push(legend);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.orbit([0, 1.5, 0], { d: 5.40, az0: -1.0, az1: -0.2, h0: 1.0, h1: 1.5, fov: 60, dur: 1.9, why: 'oxygen threads inward through the shell', kind: 'wide' }),
        C.moves.macro([-2.05, 1.7, 0.5], { d: 1.55, az: -0.5, h: 0.05, fov: 58, dur: 1.3, why: 'macro at the boundary: one atom admitted' }),
        C.moves.push(subject, { d0: 3.40, d1: 2.00, az: 0.35, h0: 0.2, h1: 0.03, fov0: 58, fov1: 48, dur: 1.6, why: 'his concentration while sorting heat outward', kind: 'close' }),
        C.moves.orbit([0, 1.5, 0], { d: 5.00, az0: 0.6, az1: 1.3, h0: 1.2, h1: 1.6, fov: 60, dur: 1.6, why: 'knives arrive from the far side and are refused', kind: 'wide' }),
        C.moves.pull([0, 1.6, 0], { d0: 2.60, d1: 6.60, az: 0.2, h0: 0.6, h1: 2.1, fov0: 66, fov1: 52, dur: 1.6, why: 'pull to see all three streams sorted at once', kind: 'wide' }),
      ], shot.dur, 5.2);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const phase = t < 2.4 ? 0 : t < 4.6 ? 1 : 2;
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.25 + 0.2 * Math.sin(gt * 2) });
          ox.update(gt, { active: phase === 0 ? 1 : 0.45 });
          heat.update(gt, { active: phase === 1 ? 1 : 0.45 });
          kn.update(gt, { active: phase === 2 ? 1 : 0.4 });
          legend.update(gt, { phase });
          legend.group.rotation.y = Math.atan2(dir.cam.position.x - 3.0, dir.cam.position.z - 0.4);
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'focus', arms: phase === 1 ? 'palm' : 'chest', blindfold: 1, sixEyes: 1,
            aura: 0.55, focusRings: 0.7, heat: 0.1, curl: phase === 1 ? 0.1 : 0.5,
            headTurn: phase === 2 ? 0.4 : phase === 0 ? -0.3 : 0, lookX: phase === 2 ? 0.4 : -0.2,
            lean: 0.02, armR: phase === 1 ? [0.24, 0.56] : [0.10, 0.52], armL: [-0.10, 0.52],
          }));
          L.eye.intensity = 2.6 + Math.sin(gt * 2) * 0.5;
        },
      };
    }

    /* ---------------- 13. FOCUS ---------------- */
    if (shot.id === 'focus') {
      sc.fog = new T.FogExp2(0x160a10, 0.026);
      add(G.voidDome({ top: '#0a0610', mid: '#26122c', bottom: '#3a1420' }));
      const L = G.rig(sc, 'six');
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95 })); anim.push(shell);
      const hc = add(G.heatColumn({ p: [0, 0, 0], r: 1.4, h: 4.0, n: 22, color: 'rgba(255,90,40,1)' })); anim.push(hc);
      const meter = add(G.hud({
        p: [2.5, 2.6, 0.3], s: [2.3, 1.2], px: [540, 280],
        draw: (c, Wd, Hh, t, st2) => {
          const f = st2.focus ?? 1;
          c.fillStyle = 'rgba(24,6,10,.86)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = f < 0.5 ? '#ff3a20' : '#66e4ff'; c.lineWidth = 5; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#fff'; c.font = 'bold 32px monospace'; c.fillText('CONCENTRATION', 22, 52);
          c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(22, 84, Wd - 44, 44);
          c.fillStyle = f < 0.5 ? '#ff3a20' : '#66e4ff'; c.fillRect(22, 84, (Wd - 44) * f, 44);
          c.fillStyle = f < 0.5 ? '#ff3a20' : '#8affc0'; c.font = 'bold 40px monospace';
          c.fillText(f < 0.5 ? 'LAPSE' : 'HOLDING', 22, 186);
          c.fillStyle = '#ffb08a'; c.font = 'bold 26px monospace';
          c.fillText(f < 0.5 ? '1 second = he cooks' : 'filtering every atom', 22, 238);
        },
      })); anim.push(meter);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.dutch(subject, { d: 1.80, az: 0.2, h: 0.03, fov: 50, roll: 0.14, dur: 1.3, why: 'tight on the eyes holding the filter' }),
        C.moves.pull([0, 1.5, 0], { d0: 2.30, d1: 5.40, az: -0.3, h0: 0.5, h1: 1.7, fov0: 64, fov1: 54, dur: 1.4, why: 'the lapse: heat floods the shell in one second', kind: 'wide' }),
        C.moves.macro([2.5, 2.6, 0.3], { d: 4.00, az: 0.3, h: 0.05, fov: 56, dur: 1.0, why: 'the concentration meter dropping', kind: 'medium', focus: 2.3 }),
      ], shot.dur, 4.8);
      const dir = directed(C, { comps, handheld: 0.010, impacts: [[1.35, 0.10]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          // focus holds, drops for ~1s, then recovers
          const dip = t > 1.15 && t < 2.25;
          const f = dip ? 0.18 : 1.0;
          const lapse = dip ? 1 : 0;
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.3 + lapse * 0.7, heat: lapse });
          hc.update(gt, { intensity: 0.3 + lapse * 1.0 });
          meter.update(gt, { focus: f });
          meter.group.rotation.y = Math.atan2(dir.cam.position.x - 2.5, dir.cam.position.z - 0.3);
          gj.update(dir.cam, act(ctx, gt, {
            mood: dip ? 'agony' : 'focus', arms: dip ? 'head' : 'chest', blindfold: 1, sixEyes: 1,
            heat: lapse, sweat: 0.3 + lapse * 0.7, nerv: lapse * 0.8, aura: 0.5,
            focusRings: dip ? 0.2 : 0.9, headTilt: dip ? 0.08 : 0, curl: dip ? 0.8 : 0.5,
          }));
          L.eye.intensity = dip ? 0.5 : 2.6;
        },
      };
    }

    /* ---------------- 14. REVERSE CURSED TECHNIQUE ---------------- */
    if (shot.id === 'rct') {
      sc.fog = new T.FogExp2(0x061410, 0.020);
      add(G.voidDome({ top: '#04100c', mid: '#0a2a22', bottom: '#0e3228' }));
      const L = G.rig(sc, 'six');
      add(W.surface({ p: [0, 0, 0], s: [28, 22], kind: 'plain', a: '#0a1a16' }));
      const gj = add(G.gojo({ p: [-1.1, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [-1.1, 1.35, 0], r: 1.95, color: '#8affc0' })); anim.push(shell);
      const brain = add(G.brainHolo({ p: [2.2, 2.3, 0.2], r: 0.85 })); anim.push(brain);
      const rays = add(G.godRays({ p: [2.2, 0, -2], n: 3, color: 'rgba(140,255,190,1)', h: 8, w: 1.1 })); anim.push(rays);
      // healing motes spiralling into the brain
      const motes = [];
      for (let k = 0; k < 22; k++) {
        const sp = K.glow({ p: [0, 0, 0], r: 0.09, color: 'rgba(150,255,200,1)', o: 0.34 });
        sc.add(sp); motes.push({ sp, off: k / 22, a: (k / 22) * Math.PI * 2 });
      }
      const panel = add(G.hud({
        p: [2.2, 4.2, 0.2], s: [2.8, 1.3], px: [620, 290],
        draw: (c, Wd, Hh, t) => {
          c.fillStyle = 'rgba(6,20,16,.86)'; c.fillRect(0, 0, Wd, Hh);
          c.strokeStyle = '#8affc0'; c.lineWidth = 5; c.strokeRect(6, 6, Wd - 12, Hh - 12);
          c.fillStyle = '#fff'; c.font = 'bold 32px sans-serif'; c.fillText('REVERSE CURSED TECHNIQUE', 22, 52);
          c.fillStyle = '#8affc0'; c.font = 'bold 72px monospace'; c.fillText('24 / 7', 22, 142);
          c.fillStyle = '#ffd166'; c.font = 'bold 26px monospace'; c.fillText('repairs the brain damage', 22, 196);
          c.fillStyle = '#8fd8ff'; c.font = '24px monospace'; c.fillText('of doing thermal calculus', 22, 240);
          // never-ending pulse bar
          const u = (t * 0.5) % 1;
          c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(22, 258, Wd - 44, 16);
          c.fillStyle = '#8affc0'; c.fillRect(22 + (Wd - 44) * u * 0.8, 258, (Wd - 44) * 0.2, 16);
        },
      })); anim.push(panel);
      subject = [-1.1, faceY, 0];
      comps = fit([
        C.moves.orbit([2.2, 3.0, 0.2], { d: 4.80, az0: -0.6, az1: 0.4, h0: 0.2, h1: 0.5, fov: 56, dur: 1.8, why: 'the brain being repaired, continuously', kind: 'medium', focus: 2.6 }),
        C.moves.macro([2.2, 2.3, 0.6], { d: 1.25, az: 0.4, h: 0.05, fov: 56, dur: 1.3, why: 'macro: healing energy knitting the damage' }),
        C.moves.push(subject, { d0: 3.60, d1: 2.10, az: -0.3, h0: 0.2, h1: 0.03, fov0: 58, fov1: 48, dur: 1.6, why: 'the man who can never stop doing this', kind: 'close' }),
        C.moves.pull([0.5, 2.2, 0], { d0: 3.00, d1: 7.20, az: 0.15, h0: 0.6, h1: 2.3, fov0: 66, fov1: 52, dur: 1.9, why: 'pull: man and brain, one permanent loop', kind: 'wide' }),
      ], shot.dur, 5.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          shell.update(gt, { pulse: 0.25 });
          brain.update(gt, { heat: 0.15, heal: 0.9, camera: dir.cam });
          panel.update(gt, {});
          panel.group.rotation.y = Math.atan2(dir.cam.position.x - 2.2, dir.cam.position.z - 0.2);
          motes.forEach(({ sp, off, a }) => {
            const u = ((gt * 0.4 + off) % 1);
            const rr = lerp(2.6, 0.2, u);
            sp.position.set(2.2 + Math.cos(a + u * 5) * rr, 2.3 + Math.sin(a * 2 + u * 4) * rr * 0.5, 0.2 + Math.sin(a + u * 5) * rr);
            sp.material.opacity = Math.sin(u * Math.PI) * 0.38;
          });
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'focus', arms: 'chest', blindfold: 1, sixEyes: 1, rct: 0.9,
            aura: 0.4, focusRings: 0.8, heat: 0.15, curl: 0.5, lean: 0.01,
            armR: [0.10, 0.53], armL: [-0.10, 0.53],
          }));
          L.eye.intensity = 2.0 + Math.sin(gt * 1.6) * 0.6;
        },
      };
    }

    /* ---------------- 15. RADIATOR VS BRAIN ---------------- */
    if (shot.id === 'compare') {
      sc.fog = new T.FogExp2(0x08101c, 0.018);
      add(G.voidDome({ top: '#04080f', mid: '#0c1a30', bottom: '#141e34' }));
      G.rig(sc, 'lab');
      add(W.surface({ p: [0, 0, 0], s: [30, 24], kind: 'plain', a: '#0e1622' }));
      // left: engineered radiator on a plinth
      const plinthL = W.box({ p: [-2.4, 0.4, 0], s: [2.2, 0.8, 1.6], color: '#232c40', ink: 0.03 }); sc.add(plinthL);
      const radGrp = new T.Group(); radGrp.position.set(-2.4, 1.9, 0);
      radGrp.add(W.box({ p: [0, 0, 0], s: [1.9, 2.2, 0.12], color: '#aebdd2', ink: 0.03 }));
      const rlines = [];
      for (let k = 0; k < 6; k++) { const ln = W.box({ p: [0, -0.85 + k * 0.34, 0.08], s: [1.6, 0.08, 0.03], color: '#9fb4cc', ink: 0 }); radGrp.add(ln); rlines.push(ln); }
      const rglow = K.glow({ p: [0, 0, 0.3], r: 1.8, color: 'rgba(255,140,80,1)', o: 0.13 }); radGrp.add(rglow);
      sc.add(radGrp);
      // right: the brain that never stops
      const brain = add(G.brainHolo({ p: [2.4, 2.0, 0], r: 0.95 })); anim.push(brain);
      const plinthR = W.box({ p: [2.4, 0.4, 0], s: [2.2, 0.8, 1.6], color: '#232c40', ink: 0.03 }); sc.add(plinthR);
      const hc = add(G.heatColumn({ p: [-2.4, 0.8, 0], r: 0.8, h: 3.0, n: 14 })); anim.push(hc);
      const labL = add(G.hud({
        p: [-2.4, 3.6, 0], s: [2.2, 0.8], px: [500, 180],
        draw: (c, Wd, Hh) => {
          c.fillStyle = 'rgba(6,14,24,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.fillStyle = '#8fd8ff'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center';
          c.fillText('NASA', Wd / 2, 62);
          c.fillStyle = '#fff'; c.font = 'bold 34px monospace'; c.fillText('built a radiator', Wd / 2, 124);
        },
      })); anim.push(labL);
      const labR = add(G.hud({
        p: [2.4, 3.6, 0], s: [2.2, 0.8], px: [500, 180],
        draw: (c, Wd, Hh) => {
          c.fillStyle = 'rgba(6,14,24,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.fillStyle = '#ff9ab0'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center';
          c.fillText('GOJO', Wd / 2, 62);
          c.fillStyle = '#fff'; c.font = 'bold 30px monospace'; c.fillText('built a brain', Wd / 2, 124);
        },
      })); anim.push(labR);
      subject = [0, 2.0, 0];
      comps = fit([
        C.moves.push([-2.4, 2.0, 0], { d0: 6.00, d1: 4.20, az: -0.35, h0: 0.3, h1: 0.1, fov0: 58, fov1: 52, dur: 1.4, why: 'NASA side of the comparison', kind: 'medium' }),
        C.moves.orbit([2.4, 2.0, 0], { d: 2.40, az0: 0.2, az1: 0.9, h0: 0.3, h1: 0.5, fov: 56, dur: 1.4, why: 'Gojo side: a brain instead of hardware', kind: 'close' }),
        C.moves.pull([0, 2.0, 0], { d0: 6.00, d1: 10.50, az: 0.0, h0: 0.5, h1: 1.8, fov0: 64, fov1: 54, dur: 1.5, why: 'both in one frame: the whole argument', kind: 'wide' }),
      ], shot.dur, 7.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          brain.update(gt, { heat: 0.2, heal: 0.5, camera: dir.cam });
          hc.update(gt, { intensity: 0.7 });
          rglow.material.opacity = 0.12 + 0.06 * Math.sin(gt * 2.5);
          rlines.forEach((ln, k) => mat(ln) && mat(ln).color.setStyle(`rgb(${Math.round(159 + 60 * (0.5 + 0.5 * Math.sin(gt * 2 + k)))},${Math.round(180 - 40 * (0.5 + 0.5 * Math.sin(gt * 2 + k)))},204)`));
          [labL, labR].forEach((h, i) => { const x = i ? 2.4 : -2.4; h.group.rotation.y = Math.atan2(dir.cam.position.x - x, dir.cam.position.z); });
        },
      };
    }

    /* ---------------- 16. THAT'S THE DIFFERENCE ---------------- */
    if (shot.id === 'difference') {
      sc.fog = new T.FogExp2(0x08101c, 0.016);
      add(G.voidDome({ top: '#04080f', mid: '#0c1a30', bottom: '#141e34' }));
      G.rig(sc, 'six');
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95 })); anim.push(shell);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.dutch(subject, { d: 1.70, az: 0.1, h: 0.02, fov: 48, roll: 0.10, dur: 1.28, why: "punch in on 'that's the difference'" }),
      ], shot.dur, 1.4);
      const dir = directed(C, { comps, impacts: [[0.0, 0.06]] });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          shell.update(gt, { pulse: 0.3 });
          gj.update(dir.cam, act(ctx, gt, { mood: 'serious', arms: 'cross', blindfold: 1, sixEyes: 1, aura: 0.45, focusRings: 0.5, curl: 0.6 }));
        },
      };
    }

    /* ---------------- 17. THE SWITCH ---------------- */
    if (shot.id === 'switch') {
      sc.fog = new T.FogExp2(0x08101c, 0.018);
      add(G.voidDome({ top: '#04080f', mid: '#0c1a30', bottom: '#141e34' }));
      const L = G.rig(sc, 'lab');
      add(W.surface({ p: [0, 0, 0], s: [26, 20], kind: 'plain', a: '#0e1622' }));
      // left: a radiator with a real maintenance switch
      const radGrp = new T.Group(); radGrp.position.set(-2.2, 1.9, 0);
      radGrp.add(W.box({ p: [0, 0, 0], s: [1.8, 2.1, 0.12], color: '#aebdd2', ink: 0.03 }));
      for (let k = 0; k < 6; k++) radGrp.add(W.box({ p: [0, -0.85 + k * 0.34, 0.08], s: [1.5, 0.08, 0.03], color: '#7d90aa', ink: 0 }));
      const rglow = K.glow({ p: [0, 0, 0.3], r: 1.7, color: 'rgba(255,140,80,1)', o: 0.15 }); radGrp.add(rglow);
      sc.add(radGrp);
      const swBox = W.box({ p: [-2.2, 0.9, 0.5], s: [0.7, 0.5, 0.3], color: '#2b3348', ink: 0.03 }); sc.add(swBox);
      const lever = W.box({ p: [-2.2, 0.95, 0.68], s: [0.12, 0.34, 0.1], color: '#ff5a5a', ink: 0.02 }); sc.add(lever);
      // right: Gojo, no switch anywhere
      const gj = add(G.gojo({ p: [2.0, 0, 0], h: H, look: GOJO }));
      const brain = add(G.brainHolo({ p: [2.0, 3.4, 0], r: 0.55 })); anim.push(brain);
      const lab = add(G.hud({
        p: [-2.2, 3.5, 0], s: [2.2, 0.9], px: [500, 200],
        draw: (c, Wd, Hh, t, st2) => {
          c.fillStyle = 'rgba(6,14,24,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.fillStyle = st2.off ? '#6a7a92' : '#8affc0'; c.font = 'bold 40px monospace'; c.textAlign = 'center';
          c.fillText(st2.off ? 'OFFLINE' : 'ONLINE', Wd / 2, 66);
          c.fillStyle = '#fff'; c.font = '26px monospace';
          c.fillText(st2.off ? 'maintenance mode' : 'rejecting heat', Wd / 2, 124);
        },
      })); anim.push(lab);
      const noSw = add(G.hud({
        p: [2.0, 4.4, 0], s: [2.2, 0.7], px: [500, 160],
        draw: (c, Wd, Hh) => {
          c.fillStyle = 'rgba(24,6,10,.84)'; c.fillRect(0, 0, Wd, Hh);
          c.fillStyle = '#ff5a5a'; c.font = 'bold 40px monospace'; c.textAlign = 'center';
          c.fillText('NO SWITCH', Wd / 2, 62);
          c.fillStyle = '#ffb08a'; c.font = '24px monospace'; c.fillText('cannot be paused', Wd / 2, 116);
        },
      })); anim.push(noSw);
      subject = [-2.2, 1.4, 0.5];
      comps = fit([
        C.moves.macro([-2.2, 0.95, 0.7], { d: 1.05, az: 0.2, h: -0.02, fov: 56, dur: 1.2, why: 'macro: a switch a human can actually throw', focus: 0.6 }),
        C.moves.orbit([2.0, 2.2, 0], { d: 5.60, az0: 0.3, az1: 0.9, h0: 0.6, h1: 1.0, fov: 58, dur: 1.7, why: 'pan to Gojo: nothing to switch off', kind: 'wide' }),
      ], shot.dur, 6.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const off = ramp(t, 0.5, 1.0);
          lever.rotation.x = off * 1.1;
          mat(lever) && mat(lever).color.setStyle(off > 0.5 ? '#6a7a92' : '#ff5a5a');
          rglow.material.opacity = 0.15 * (1 - off);
          brain.update(gt, { heat: 0.25, heal: 0.6, camera: dir.cam });
          lab.update(gt, { off: off > 0.5 }); noSw.update(gt, {});
          lab.group.rotation.y = Math.atan2(dir.cam.position.x + 2.2, dir.cam.position.z);
          noSw.group.rotation.y = Math.atan2(dir.cam.position.x - 2.0, dir.cam.position.z);
          gj.update(dir.cam, act(ctx, gt, { mood: 'stern', arms: 'cross', blindfold: 1, sixEyes: 1, aura: 0.5, focusRings: 0.7, curl: 0.6 }));
        },
      };
    }

    /* ---------------- 18. YOUR OWN INFINITY ---------------- */
    if (shot.id === 'yourinfinity') {
      sc.fog = new T.FogExp2(0x0a0e18, 0.026);
      add(G.voidDome({ top: '#05070f', mid: '#0e1628', bottom: '#1a1c2c' }));
      const L = G.rig(sc, 'street');
      const st = add(G.street({ seed: 9 })); anim.push(st);
      const fogB = add(G.fogBank({ p: [0, 0, 0], n: 5, color: 'rgba(120,150,210,1)', spread: 20, y: 0.8, r: 5 })); anim.push(fogB);
      // an ordinary person, same puppet language, different clothes -- the viewer
      const you = add(G.gojo({ p: [2.3, 0, 2.6], h: 2.55, look: { skin: '#e8c4a4', skinSh: '#c99b7c', hair: '#2b2118', hairSh: '#17110c', coat: '#3a4256', coatHi: '#4c5670', pants: '#232838', boot: '#161a24' } }));
      const shell = add(G.infinityShell({ p: [2.3, 1.28, 2.6], r: 1.75, color: '#9fb8d8' })); anim.push(shell);
      const emb = add(G.embers({ bounds: [-7, 7, 0, 5, -4, 4], n: 14, color: 'rgba(180,210,255,1)' })); anim.push(emb);
      subject = [2.3, 2.55 * 0.855, 2.6];
      comps = fit([
        C.moves.crane([2.3, 1.4, 2.6], { d: 9.50, az: 0.2, h0: 3.6, h1: 0.6, fov0: 62, fov1: 56, dur: 1.7, why: 'descend from the city to one ordinary person', kind: 'wide' }),
        C.moves.push(subject, { d0: 4.00, d1: 2.30, az: -0.25, h0: 0.2, h1: 0.05, fov0: 58, fov1: 50, dur: 1.6, why: "close on them: 'a rule you never break'", kind: 'close' }),
        C.moves.orbit([2.3, 1.3, 2.6], { d: 4.60, az0: -0.5, az1: 0.5, h0: 0.8, h1: 1.2, fov: 58, dur: 1.5, why: 'their own shell, same geometry as his', kind: 'medium' }),
      ], shot.dur, 13.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          const seal = ramp(t, 1.4, 3.4);
          shell.update(gt, { pulse: 0.15, seal });
          you.update(dir.cam, act(ctx, gt, {
            mood: seal > 0.6 ? 'sad' : 'calm', arms: seal > 0.6 ? 'cross' : 'down',
            blindfold: 0, sixEyes: 0, heat: 0, sweat: 0, aura: 0,
            lean: 0.03 * seal, headTilt: -0.04 * seal, lookX: Math.sin(gt * 0.3) * 0.2,
            curl: 0.55, hunch: 0,
          }));
          L.lamp.intensity = 1.5 - seal * 0.5;
        },
      };
    }

    /* ---------------- 19. THE CALL ---------------- */
    if (shot.id === 'call') {
      sc.fog = new T.FogExp2(0x0a0e18, 0.024);
      add(G.voidDome({ top: '#05070f', mid: '#0e1628', bottom: '#1a1c2c' }));
      const L = G.rig(sc, 'street');
      const st = add(G.street({ seed: 9 })); anim.push(st);
      const ph = add(G.phone({ p: [0.9, 1.5, 3.0], s: 1.5 })); anim.push(ph);
      const you = add(G.gojo({ p: [2.4, 0, 2.6], h: 2.55, look: { skin: '#e8c4a4', skinSh: '#c99b7c', hair: '#2b2118', hairSh: '#17110c', coat: '#3a4256', coatHi: '#4c5670', pants: '#232838', boot: '#161a24' } }));
      const shell = add(G.infinityShell({ p: [2.4, 1.28, 2.6], r: 1.75, color: '#9fb8d8' })); anim.push(shell);
      subject = [0.9, 1.5, 3.0];
      comps = fit([
        C.moves.macro(subject, { d: 1.55, az: -0.2, h: 0.05, fov: 56, dur: 1.3, why: 'macro: the call ringing, never answered' }),
        C.moves.dutch([2.4, 2.55 * 0.855, 2.6], { d: 2.40, az: 0.3, h: 0.05, fov: 52, roll: 0.10, dur: 1.2, why: 'their face choosing not to reach' }),
        C.moves.pull([4.0, 1.6, 3.0], { d0: 3.40, d1: 7.00, az: 0.4, h0: 0.5, h1: 1.6, fov0: 64, fov1: 54, dur: 1.2, why: 'the unopened door beside them', kind: 'wide', focus: 5.0 }),
      ], shot.dur, 12.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          st.update(gt); shell.update(gt, { pulse: 0.2, seal: 0.6 });
          ph.update(gt, { name: 'the call', dim: ramp(t, 1.6, 3.0) * 0.75 });
          ph.group.rotation.y = Math.atan2(dir.cam.position.x - 0.9, dir.cam.position.z - 3.0);
          you.update(dir.cam, act(ctx, gt, {
            mood: 'sad', arms: 'down', blindfold: 0, sixEyes: 0,
            lean: 0.04, headTilt: -0.06, lookX: -0.4, lookY: -0.2, curl: 0.6,
            armR: [0.10, 0.40], armRK: 0.5,
          }));
        },
      };
    }

    /* ---------------- 20. NOTHING IN, NOTHING OUT ---------------- */
    if (shot.id === 'nothing') {
      sc.fog = new T.FogExp2(0x080c14, 0.030);
      add(G.voidDome({ top: '#04060c', mid: '#0a1222', bottom: '#141828' }));
      G.rig(sc, 'street');
      add(W.surface({ p: [0, 0, 0], s: [28, 22], kind: 'plain', a: '#0c1018' }));
      const you = add(G.gojo({ p: [0, 0, 0], h: 2.55, look: { skin: '#e8c4a4', skinSh: '#c99b7c', hair: '#2b2118', hairSh: '#17110c', coat: '#3a4256', coatHi: '#4c5670', pants: '#232838', boot: '#161a24' } }));
      const shell = add(G.infinityShell({ p: [0, 1.28, 0], r: 1.7, color: '#8fa8c8' })); anim.push(shell);
      // the world's warmth draining away outside the shell
      const outside = [];
      for (let k = 0; k < 12; k++) {
        const sp = K.glow({ p: [0, 0, 0], r: 0.16, color: 'rgba(255,200,140,1)', o: 0.30 });
        sc.add(sp); outside.push({ sp, a: (k / 12) * Math.PI * 2, off: k / 12 });
      }
      subject = [0, 2.55 * 0.855, 0];
      comps = fit([
        C.moves.orbit([0, 1.3, 0], { d: 3.80, az0: -0.7, az1: 0.3, h0: 0.9, h1: 1.3, fov: 58, dur: 1.4, why: 'the shell closes; warmth stays outside', kind: 'medium' }),
        C.moves.pull([0, 1.3, 0], { d0: 2.60, d1: 6.40, az: 0.2, h0: 0.6, h1: 2.0, fov0: 64, fov1: 52, dur: 1.2, why: 'pull away and leave them alone in it', kind: 'wide' }),
      ], shot.dur, 5.0);
      const dir = directed(C, { comps });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          const seal = ramp(t, 0.2, 1.6);
          shell.update(gt, { pulse: 0.2, seal });
          outside.forEach(({ sp, a, off }) => {
            const u = ((gt * 0.25 + off) % 1);
            const rr = lerp(3.4, 1.78, u);
            sp.position.set(Math.cos(a) * rr, 1.0 + Math.sin(a * 2) * 0.8, Math.sin(a) * rr);
            sp.material.opacity = 0.30 * (1 - u) * (1 - seal * 0.4);
          });
          you.update(dir.cam, act(ctx, gt, {
            mood: 'sad', arms: 'cross', blindfold: 0, sixEyes: 0,
            lean: 0.05, headTilt: -0.08, lookY: -0.3, curl: 0.65, squash: -0.01,
          }));
        },
      };
    }

    /* ---------------- 21. SO WHAT'S YOURS? ---------------- */
    if (shot.id === 'question') {
      sc.fog = new T.FogExp2(0x060a14, 0.022);
      add(G.voidDome({ top: '#04060e', mid: '#0a1428', bottom: '#141a30' }));
      const L = G.rig(sc, 'six');
      add(W.surface({ p: [0, 0, 0], s: [26, 20], kind: 'plain', a: '#0a1018' }));
      const gj = add(G.gojo({ p: [0, 0, 0], h: H, look: GOJO }));
      const shell = add(G.infinityShell({ p: [0, 1.35, 0], r: 1.95 })); anim.push(shell);
      const rays = add(G.godRays({ p: [0, 0, -3], n: 4, color: 'rgba(130,220,255,1)', h: 10, w: 1.3 })); anim.push(rays);
      const emb = add(G.embers({ bounds: [-5, 5, 0, 6, -4, 2], n: 16, color: 'rgba(150,220,255,1)' })); anim.push(emb);
      subject = [0, faceY, 0];
      comps = fit([
        C.moves.push(subject, { d0: 3.20, d1: 1.55, az: 0.06, h0: 0.10, h1: 0.02, fov0: 56, fov1: 46, dur: 2.0, why: "he looks straight out of the frame on 'so what's yours?'", kind: 'close' }),
        C.moves.drift(subject, { d: 1.68, az: 0.0, h: 0.02, fov: 46, roll: 0.01, dur: 2.0, why: 'hold on the question and let it land', kind: 'close' }),
      ], shot.dur, 1.5);
      const dir = directed(C, { comps, handheld: 0.004 });
      return {
        sc, cam: dir.cam, dir,
        update(t) {
          const gt = S + t; dir.at(t, { globalT: gt });
          anim.forEach((a) => a.update && a.update(gt, {}));
          const open = ramp(t, 0.6, 2.4);
          shell.update(gt, { pulse: 0.2 + open * 0.2, seal: 1 - open * 0.8 });
          gj.update(dir.cam, act(ctx, gt, {
            mood: 'question', arms: open > 0.5 ? 'offer' : 'down', blindfold: 1, sixEyes: 1,
            aura: 0.35 + open * 0.3, focusRings: 0.4, heat: 0, sweat: 0,
            headTilt: 0.05 * open, lookX: 0, lookY: 0, curl: 0.15, lean: -0.01,
          }));
          L.eye.intensity = 2.2 + open * 1.4;
        },
      };
    }

    throw new Error('unknown scene ' + shot.id);
  }

  window.GojoFilm = {
    TOTAL, scenes, build,
    spec() { return scenes.map((s) => ({ name: s.name, id: s.id, start: s.start, dur: s.dur, trans: s.trans })); },
  };
})();
