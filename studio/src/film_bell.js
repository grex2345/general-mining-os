// film_bell.js — Round 13 production: "The Bell of Vellara" (English, 66s, 12 shots).
// Built on the Round 11 architecture (2D acting puppet billboards in a 3D toon world).
// Shot boundaries come from the AUDIO DIRECTION, not from arbitrary timing: every cut
// lands on a narration beat, and the sound plan reads the same table.
// Browser-side classic script: window.BellFilm = { shots, TOTAL, LEAD, build(i, ctx) }.
// ctx = { THREE, W (StickWorld), K (WorldKit), A (ActorKit) }. build -> { sc, cam, update(localT) }.
(function () {
  const LEAD = 1.0;
  const shots = [
    { name: 'towerDawn',    start: 0.0,  dur: 6.6, trans: { type: 'fadein', dur: 0.9 },   beats: ['b01'] },
    { name: 'forge',        start: 6.6,  dur: 2.9, trans: { type: 'dissolve', dur: 0.4 }, beats: ['b02'] },
    { name: 'craftMontage', start: 9.5,  dur: 5.2, trans: { type: 'cut' },                beats: ['b03'] },
    { name: 'silentTower',  start: 14.7, dur: 5.1, trans: { type: 'dissolve', dur: 0.45 },beats: ['b04'] },
    { name: 'stairs',       start: 19.8, dur: 6.3, trans: { type: 'cut' },                beats: ['b05'] },
    { name: 'notTouching',  start: 26.1, dur: 2.9, trans: { type: 'dissolve', dur: 0.4 }, beats: ['b06'] },
    { name: 'tapping',      start: 29.0, dur: 7.2, trans: { type: 'cut' },                beats: ['b07'] },
    { name: 'heldBreath',   start: 36.2, dur: 3.8, trans: { type: 'dip', dur: 0.5 },      beats: ['b08'] },
    { name: 'bellFine',     start: 40.0, dur: 3.0, trans: { type: 'bloom', dur: 0.45 },   beats: ['b09'] },
    { name: 'stoneTruth',   start: 43.0, dur: 9.6, trans: { type: 'dissolve', dur: 0.5 }, beats: ['b10', 'b11'] },
    { name: 'movingBell',   start: 52.6, dur: 4.1, trans: { type: 'cut' },                beats: ['b12'] },
    { name: 'theRing',      start: 56.7, dur: 9.3, trans: { type: 'bloom', dur: 0.6 },    beats: ['b13', 'b14'] },
  ];
  const TOTAL = 66.0;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (u) => u * u * (3 - 2 * u);
  const NORA = { skin: '#e8b58c', body: '#3f7d8c', outfit: 'shirt', hair: 'bob', hairColor: '#241610', shoe: '#33415c' };
  const FOUNDER = { skin: '#d8a068', body: '#8a4b2a', outfit: 'leather', hair: 'short', hairColor: '#2a1a12', shoe: '#2a2a2a' };

  /* ---------------- shared props ---------------- */
  // A bronze bell: flared cone body + crown + clapper. Returns a swingable group.
  function bell(T, W, K, { p = [0, 0, 0], s = 1, color = '#b8862b' } = {}) {
    const pivot = new T.Group(); pivot.position.set(p[0], p[1], p[2]);
    const g = new T.Group(); g.scale.setScalar(s);
    g.add(W.cone({ p: [0, -0.62, 0], r: 0.78, h: 1.25, color, seg: 20, rot: [Math.PI, 0, 0] }));
    g.add(W.cyl({ p: [0, -1.2, 0], rt: 0.82, h: 0.14, color: '#8f6a1e', seg: 20 }));
    g.add(W.cyl({ p: [0, 0.06, 0], rt: 0.2, h: 0.22, color: '#8f6a1e', seg: 12 }));
    g.add(W.ball({ p: [0, 0.2, 0], r: 0.13, color: '#6f5216' }));
    const clapper = W.ball({ p: [0, -1.05, 0], r: 0.15, color: '#5a4410' });
    g.add(clapper);
    pivot.add(g);
    return {
      group: pivot, body: g, clapper,
      swing(a) { pivot.rotation.z = a; clapper.position.x = Math.sin(a * 2.2) * 0.22; },
    };
  }

  // Stone bell tower: tapered stack, arched belfry openings, a crowning roof.
  function tower(T, W, K, { p = [0, 0, 0], h = 16, w = 4.2, stone = '#cbbfa6', trim = '#9c8f76' } = {}) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const tw = w * (1 - i * 0.055), th = h / tiers;
      g.add(W.box({ p: [0, th * (i + 0.5), 0], s: [tw, th, tw], color: i % 2 ? stone : '#c3b69c' }));
      g.add(W.box({ p: [0, th * (i + 1), 0], s: [tw + 0.24, 0.2, tw + 0.24], color: trim, ink: 0.03 }));
    }
    // belfry openings on the front face
    const by = h - 1.9;
    for (const dx of [-1.0, 1.0]) {
      g.add(W.box({ p: [dx, by, w * 0.45], s: [1.1, 2.3, 0.3], color: '#2b2438', ink: 0.04 }));
      g.add(W.cyl({ p: [dx, by + 1.15, w * 0.45], rt: 0.55, h: 0.3, color: '#2b2438', seg: 12, rot: [Math.PI / 2, 0, 0] }));
    }
    g.add(W.cone({ p: [0, h + 1.5, 0], r: w * 0.78, h: 3.0, color: '#7d5a3c', seg: 4, rot: [0, Math.PI / 4, 0] }));
    g.add(W.ball({ p: [0, h + 3.2, 0], r: 0.28, color: '#d4a017', ink: 0.02 }));
    // a few lit windows so it reads as inhabited
    for (let i = 1; i < tiers; i++) {
      g.add(W.box({ p: [0, (h / tiers) * i + 0.6, w * 0.47], s: [0.5, 0.8, 0.1], color: '#ffd770', ink: 0.03 }));
    }
    return g;
  }

  // Spiral stair flight inside the tower.
  function stairs(T, W, K, { p = [0, 0, 0], n = 16, rise = 0.34, run = 0.62, w = 2.4 } = {}) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    for (let i = 0; i < n; i++) {
      const drift = Math.sin(i * 0.42) * 0.5;
      g.add(W.box({ p: [drift, rise * i, -run * i], s: [w, rise, run], color: i % 2 ? '#bdb097' : '#b3a68d' }));
      g.add(W.box({ p: [drift + w / 2 + 0.1, rise * i + 0.5, -run * i], s: [0.12, 1.0, 0.12], color: '#7a5a3a' }));
    }
    return g;
  }

  function forgeFire(T, W, K, p) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.box({ p: [0, 0.45, 0], s: [1.9, 0.9, 1.4], color: '#6b5a4a' }));
    g.add(W.box({ p: [0, 0.95, 0], s: [1.6, 0.16, 1.15], color: '#2a1a12' }));
    const coals = [];
    for (let i = 0; i < 9; i++) {
      const b = W.ball({ p: [-0.6 + (i % 3) * 0.6, 1.04, -0.3 + Math.floor(i / 3) * 0.3], r: 0.14, color: '#ff6a1e', ink: 0 });
      g.add(b); coals.push(b);
    }
    const gl = K.glow({ p: [0, 1.3, 0], r: 1.9, color: 'rgba(255,150,50,1)', o: 0.30 });
    g.add(gl);
    return { group: g, update(t) { coals.forEach((c, i) => { const k = 0.7 + 0.3 * Math.sin(t * 5 + i * 1.7); c.children[0].material.color.setRGB(1, 0.35 * k, 0.08 * k); }); gl.material.opacity = 0.24 + 0.08 * Math.sin(t * 4.2); } };
  }

  function anvil(T, W, K, p) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.box({ p: [0, 0.3, 0], s: [0.7, 0.6, 0.5], color: '#5a4636' }));
    g.add(W.box({ p: [0, 0.72, 0], s: [1.5, 0.26, 0.6], color: '#4a4a52', ink: 0.03 }));
    g.add(W.cone({ p: [0.78, 0.72, 0], r: 0.19, h: 0.45, color: '#3e3e46', seg: 10, rot: [0, 0, -Math.PI / 2] }));
    return g;
  }

  function crowd(T, W, K, A, positions, look, h = 2.3) {
    return positions.map(([x, z, s], i) => {
      const ac = A.Actor({ p: [x, 0, z], h: h * (s || 1), look: Object.assign({ skin: '#e8b88a', body: ['#8e44ad', '#2980b9', '#c0392b', '#16a085', '#d35400'][i % 5], outfit: 'shirt', hair: i % 2 ? 'short' : 'bob', hairColor: '#2a1a12', shoe: '#33415c' }, look || {}) });
      return ac;
    });
  }
  function addActors(sc, list) { list.forEach((a) => { sc.add(a.group); sc.add(a.shadow); }); }

  // Sound made visible: expanding rings from the bell (used only when it rings).
  function soundRings(T, W, K, { p = [0, 0, 0], n = 5, color = 'rgba(255,225,150,1)' } = {}) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    const rings = [];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(new T.RingGeometry(0.9, 1.05, 48), new T.MeshBasicMaterial({ color: 0xffe196, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2; g.add(m); rings.push(m);
    }
    return { group: g, update(t, active) {
      rings.forEach((m, i) => {
        if (!active) { m.material.opacity = 0; return; }
        const u = ((t * 0.55 + i / n) % 1);
        const r = 1 + u * 16;
        m.scale.setScalar(r);
        m.material.opacity = 0.30 * Math.sin(u * Math.PI);
      });
    } };
  }

  // Dust/notes drifting in the belfry light shaft.
  function motes(T, W, K, bounds, n = 26) {
    const g = new T.Group(); const ps = [];
    for (let i = 0; i < n; i++) { const sp = K.glow({ p: [0, 0, 0], r: 0.1, color: 'rgba(255,240,200,1)', o: 0.5 }); g.add(sp); ps.push({ sp, seed: i }); }
    return { group: g, update(t) { ps.forEach(({ sp, seed }) => { const u = (t * 0.07 + seed * 0.11) % 1; sp.position.set(bounds[0] + ((seed * 0.37) % 1) * (bounds[1] - bounds[0]) + Math.sin(t * 0.6 + seed) * 0.25, bounds[2] + u * (bounds[3] - bounds[2]), bounds[4] + ((seed * 0.71) % 1) * (bounds[5] - bounds[4])); sp.material.opacity = 0.22 * Math.sin(u * Math.PI); }); } };
  }

  const build = (i, ctx) => {
    const { THREE: T, W, K, A } = ctx;
    const sc = new T.Scene();
    const name = shots[i].name;
    const ground = (kind, a, b) => sc.add(W.surface({ p: [0, 0, 0], s: [110, 110], kind, a, b, unit: 3 }));

    /* ===================== 0 — TOWER AT DAWN (b01 mystery) ===================== */
    if (name === 'towerDawn') {
      sc.fog = new T.Fog(0xe4d6c0, 30, 95);
      sc.add(K.skyDome({ top: '#5b7fa8', mid: '#c9b9a4', bottom: '#f3d9a8' }));
      K.dayLight(sc);
      ground('grass', '#9aa06a', '#8a9060');
      sc.add(W.ball({ p: [-22, 12, -50], r: 3.4, color: '#ffe0a0', ink: 0 }));
      sc.add(K.mountain({ p: [-22, 0, -56], s: 2.0, color: '#8fa2ba' }));
      sc.add(K.mountain({ p: [18, 0, -60], s: 2.4, color: '#7f92ac' }));
      const tw = tower(T, W, K, { p: [0, 0, -12], h: 17, w: 4.6 }); sc.add(tw);
      const bl = bell(T, W, K, { p: [0, 15.1, -9.7], s: 0.85 }); sc.add(bl.group);
      sc.add(K.hut({ p: [-8, 0, -6], s: 1.3, rotY: 0.3 }));
      sc.add(K.hut({ p: [8.5, 0, -7], s: 1.4, rotY: -0.3 }));
      sc.add(K.hut({ p: [-13, 0, -12], s: 1.2, rotY: 0.5 }));
      sc.add(K.hut({ p: [13, 0, -13], s: 1.3, rotY: -0.45 }));
      sc.add(K.tree({ p: [-5.5, 0, -2], s: 1.4 })); sc.add(K.tree({ p: [6, 0, -3], s: 1.5, kind: 'pine' }));
      sc.add(K.well({ p: [3.2, 0, -1] })); sc.add(K.fence({ p: [-4.5, 0, 2], w: 5, rotY: 0.15 }));
      sc.add(K.cart({ p: [5.5, 0, 2.5], rotY: -0.4 }));
      sc.add(K.crate({ p: [-3, 0, 3.2], s: 0.8 })); sc.add(K.barrel({ p: [-2.2, 0, 3.6], s: 0.9 }));
      sc.add(K.groundDetail({ area: [-9, 9, -3, 5], n: 52, seed: 5 }));
      sc.add(K.cloud({ p: [-14, 17, -40], s: 2.4 })); sc.add(K.cloud({ p: [15, 20, -46], s: 3 }));
      const folk = crowd(T, W, K, A, [[-2.6, 0.4, 1], [2.4, 0.2, 1.02], [0.4, -0.8, 0.94]]);
      addActors(sc, folk);
      const rings = soundRings(T, W, K, { p: [0, 14.4, -9.7], n: 3 }); sc.add(rings.group);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 3.0, 16], look: [0, 9, -12], fov: 54 },
        { t: 3.2, pos: [-1.5, 6.5, 12], look: [0, 12, -12], fov: 50 },
        { t: 6.6, pos: [-0.6, 11.0, 6.5], look: [0, 14.6, -11], fov: 46 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        // a dead, damped twitch at the "never made a sound" attempt (~3.1s)
        const hit = t > 3.1 && t < 4.3;
        bl.swing(hit ? Math.sin((t - 3.1) * 9) * 0.035 * Math.exp(-(t - 3.1) * 3) : 0);
        rings.update(t, false);
        folk.forEach((f, k) => f.update(cam, t * 30 + k * 11, A.idle(t + k * 0.4, { mood: 'worry', lookX: 0.1 })));
      } };
    }

    /* ===================== 1 — THE FORGE (b02 warm) ===================== */
    if (name === 'forge') {
      sc.fog = new T.Fog(0x241a14, 12, 40);
      sc.add(K.skyDome({ top: '#1a120e', mid: '#30221a', bottom: '#4a3020' }));
      K.warmInterior(sc);
      ground('stone', '#6b5a4a', '#5a4a3c');
      sc.add(W.box({ p: [0, 3.2, -5], s: [16, 6.4, 0.5], color: '#5c4938' }));
      sc.add(W.box({ p: [-6, 3.2, 0], s: [0.5, 6.4, 12], color: '#54432f' }));
      sc.add(W.box({ p: [6, 3.2, 0], s: [0.5, 6.4, 12], color: '#54432f' }));
      const fire = forgeFire(T, W, K, [1.7, 0, -2.2]); sc.add(fire.group);
      sc.add(anvil(T, W, K, [-1.2, 0, -0.6]));
      sc.add(K.shelf({ p: [-5.5, 0, -4.4], s: 1.1 }));
      sc.add(K.barrel({ p: [5.2, 0, 1.4], s: 1 })); sc.add(K.crate({ p: [-4.6, 0, 1.8], s: 0.9 }));
      sc.add(K.lantern({ p: [-3.4, 2.6, -3], on: 1 })); sc.add(K.lantern({ p: [3.6, 2.8, -3], on: 1 }));
      sc.add(K.sack({ p: [4.4, 0, -0.6], s: 0.9 }));
      sc.add(K.groundDetail({ area: [-6, 6, -2, 3], n: 30, seed: 9 }));
      const f1 = A.Actor({ p: [-1.2, 0, 0.5], h: 2.5, look: FOUNDER });
      const f2 = A.Actor({ p: [1.6, 0, -0.9], h: 2.4, look: Object.assign({}, FOUNDER, { body: '#6b3f22' }) });
      addActors(sc, [f1, f2]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0.3, 2.3, 6.6], look: [0.2, 1.6, -1.4], fov: 56 },
        { t: 2.9, pos: [-0.3, 2.0, 5.6], look: [-0.2, 1.5, -1.0], fov: 52 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.007 });
        fire.update(t);
        f1.update(cam, t * 30, A.G.hammer(t));
        f2.update(cam, t * 30 + 17, A.G.fireKiln(t));
      } };
    }

    /* ===================== 2 — CRAFT MONTAGE (b03 warm) ===================== */
    if (name === 'craftMontage') {
      sc.fog = new T.Fog(0x4a3a2c, 14, 46);
      sc.add(K.skyDome({ top: '#33241c', mid: '#5a3d2c', bottom: '#7d5236' }));
      K.warmInterior(sc);
      ground('stone', '#6b5a4a', '#5a4a3c');
      sc.add(W.box({ p: [0, 3.4, -5.5], s: [18, 6.8, 0.5], color: '#7a6350' }));
      const fire = forgeFire(T, W, K, [-3.2, 0, -2.6]); sc.add(fire.group);
      sc.add(anvil(T, W, K, [1.2, 0, -1.0]));
      // the bell being worked on, on a stand
      const bl = bell(T, W, K, { p: [3.4, 2.5, -2.2], s: 0.7 }); sc.add(bl.group);
      sc.add(W.box({ p: [3.4, 1.2, -2.2], s: [0.3, 2.4, 0.3], color: '#5a4636' }));
      // hoist rope + beam
      sc.add(W.box({ p: [0, 4.6, -2.6], s: [10, 0.3, 0.3], color: '#6b4f34' }));
      const rope = W.cyl({ p: [3.4, 3.6, -2.2], rt: 0.05, h: 2.0, color: '#c9b48a', seg: 6 }); sc.add(rope);
      sc.add(K.shelf({ p: [-6, 0, -4.8], s: 1.0 }));
      sc.add(K.crate({ p: [-5.2, 0, 1.8], s: 0.85 })); sc.add(K.barrel({ p: [5.6, 0, 1.6], s: 0.95 }));
      sc.add(K.lantern({ p: [-1.2, 3.0, -3.4], on: 1 })); sc.add(K.lantern({ p: [4.6, 3.0, -3.4], on: 1 }));
      sc.add(K.groundDetail({ area: [-6, 6, -2, 3], n: 34, seed: 13 }));
      const fs = crowd(T, W, K, A, [[-3.0, -1.2, 1], [1.0, 0.2, 1.02], [3.6, -0.6, 0.98]], FOUNDER, 2.45);
      addActors(sc, fs);
      const sparks = motes(T, W, K, [-4.2, -2.2, 0.8, 3.4, -3, -1.6], 18); sc.add(sparks.group);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-3.0, 2.2, 5.2], look: [-3.0, 1.5, -2], fov: 50 },
        { t: 1.8, pos: [0.8, 2.3, 5.0], look: [1.0, 1.4, -1.4], fov: 50 },
        { t: 3.3, pos: [3.2, 2.8, 4.4], look: [3.4, 2.2, -2.2], fov: 48 },
        { t: 5.2, pos: [2.6, 3.6, 5.4], look: [3.2, 3.0, -2.4], fov: 52 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.006 });
        fire.update(t); sparks.update(t);
        // pour -> tune -> hoist, matching the three clauses of b03
        fs[0].update(cam, t * 30, A.G.fireKiln(t));
        fs[1].update(cam, t * 30 + 9, t < 3.2 ? A.G.hammer(t) : A.G.pullRope(t));
        fs[2].update(cam, t * 30 + 21, t < 1.8 ? A.G.workWheel(t) : A.G.pullRope(t + 0.4));
        const lift = clamp((t - 3.3) / 1.6, 0, 1);
        bl.group.position.y = 2.5 + smooth(lift) * 1.1;
        bl.swing(Math.sin(t * 2.4) * 0.02 * lift);
        rope.scale.y = 1 - lift * 0.45; rope.position.y = 3.6 + lift * 0.5;
      } };
    }

    /* ===================== 3 — THE SILENT TOWER (b04 mystery) ===================== */
    if (name === 'silentTower') {
      sc.fog = new T.Fog(0xb9c2cc, 24, 80);
      sc.add(K.skyDome({ top: '#7f96b4', mid: '#b9c2cc', bottom: '#d8d2c4' }));
      K.dayLight(sc);
      ground('grass', '#8f9668', '#7f8658');
      const tw = tower(T, W, K, { p: [0, 0, -10], h: 18, w: 4.8 }); sc.add(tw);
      const bl = bell(T, W, K, { p: [0, 16.0, -7.5], s: 0.9 }); sc.add(bl.group);
      sc.add(K.hut({ p: [-9, 0, -5], s: 1.2, rotY: 0.35 }));
      sc.add(K.hut({ p: [9, 0, -6], s: 1.3, rotY: -0.3 }));
      sc.add(K.tree({ p: [-6, 0, -1], s: 1.3 })); sc.add(K.tree({ p: [6.5, 0, -2], s: 1.4, kind: 'pine' }));
      sc.add(K.fence({ p: [-5, 0, 2.5], w: 5 })); sc.add(K.bench({ p: [4.5, 0, 2.2], rotY: -0.3 }));
      sc.add(K.groundDetail({ area: [-9, 9, -2, 5], n: 46, seed: 21 }));
      sc.add(K.cloud({ p: [-12, 18, -40], s: 2.6 })); sc.add(K.cloud({ p: [14, 21, -44], s: 3 }));
      const folk = crowd(T, W, K, A, [[-2.8, 0.6, 1], [-0.6, 0.2, 1.03], [1.8, 0.5, 0.97], [3.6, -0.4, 0.92]]);
      addActors(sc, folk);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 13.0, 6.0], look: [0, 15.4, -8], fov: 50 },
        { t: 2.2, pos: [-1.0, 12.4, 7.0], look: [0, 15.0, -8], fov: 50 },
        { t: 3.6, pos: [-1.2, 8.0, 8.6], look: [0, 8.4, -8], fov: 52 },
        { t: 5.1, pos: [-0.4, 3.2, 9.5], look: [0, 1.7, 0], fov: 54 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        const hit = t > 1.1 && t < 2.2;
        bl.swing(hit ? Math.sin((t - 1.1) * 8) * 0.03 * Math.exp(-(t - 1.1) * 3.4) : 0);
        // the crowd looks up, then shoulders drop: disappointment, no sound
        folk.forEach((f, k) => {
          const drop = clamp((t - 2.4) / 1.4, 0, 1);
          f.update(cam, t * 30 + k * 13, A.idle(t + k * 0.5, { mood: 'worry', hunch: 0.18 * drop, lookX: 0.05, tilt: -0.04 * (1 - drop) }));
        });
      } };
    }

    /* ===================== 4 — NORA CLIMBS (b05 warm) ===================== */
    if (name === 'stairs') {
      sc.fog = new T.Fog(0x4a4438, 10, 34);
      sc.add(K.skyDome({ top: '#3a3428', mid: '#5a5040', bottom: '#7a6c54' }));
      K.warmInterior(sc);
      ground('stone', '#8a7f68', '#7a6f58');
      // stairwell shaft walls
      sc.add(W.box({ p: [-3.0, 6, -3], s: [0.5, 14, 16], color: '#a89a80' }));
      sc.add(W.box({ p: [3.0, 6, -3], s: [0.5, 14, 16], color: '#9c8e76' }));
      sc.add(W.box({ p: [0, 6, -11], s: [6.5, 14, 0.5], color: '#a89a80' }));
      const st = stairs(T, W, K, { p: [0, 0.2, 1.5], n: 18, rise: 0.36, run: 0.66, w: 2.6 }); sc.add(st);
      // window slits throwing light down the shaft
      for (let k = 0; k < 4; k++) {
        sc.add(W.box({ p: [2.72, 2.4 + k * 2.6, -2 - k * 1.6], s: [0.12, 1.3, 0.5], color: '#ffe9a8', ink: 0.02 }));
        sc.add(K.glow({ p: [2.3, 2.4 + k * 2.6, -2 - k * 1.6], r: 1.1, color: 'rgba(255,225,160,1)', o: 0.22 }));
      }
      sc.add(K.lantern({ p: [-2.4, 3.2, -1.0], on: 1 }));
      sc.add(K.crate({ p: [-2.0, 0, 2.4], s: 0.7 })); sc.add(K.barrel({ p: [2.0, 0, 2.6], s: 0.7 }));
      const dust = motes(T, W, K, [-2.2, 2.2, 0.5, 8, -8, 1], 24); sc.add(dust.group);
      const nora = A.Actor({ p: [0, 0, 1.2], h: 2.15, look: NORA });
      addActors(sc, [nora]);
      // her small hammer
      const ham = new T.Group();
      ham.add(W.box({ p: [0, 0, 0], s: [0.07, 0.42, 0.07], color: '#8a6a4a' }));
      ham.add(W.box({ p: [0, 0.24, 0], s: [0.24, 0.12, 0.12], color: '#4a4a52', ink: 0.03 }));
      sc.add(ham);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0.6, 2.0, 6.4], look: [0, 1.4, 0], fov: 50 },
        { t: 2.4, pos: [1.4, 3.6, 4.6], look: [0, 3.0, -2], fov: 48 },
        { t: 4.6, pos: [-1.2, 5.4, 2.4], look: [0, 5.0, -4], fov: 48 },
        { t: 6.3, pos: [0.4, 7.0, 0.6], look: [0, 6.6, -6], fov: 50 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.008 });
        dust.update(t);
        const u = clamp(t / 6.0, 0, 1);
        const step = u * 17;
        const y = 0.2 + step * 0.36, z = 1.5 - step * 0.66;
        const x = Math.sin(step * 0.42) * 0.5;
        nora.setPos(x, z);
        nora.group.position.y = y + nora.h * 0.483;
        nora.shadow.position.set(x, y + 0.03, z);
        nora.update(cam, t * 30, A.G.climb(t));
        ham.position.set(x + 0.42, y + 1.0 + Math.sin(t * 3.4) * 0.05, z + 0.1);
        ham.rotation.z = 0.3 + Math.sin(t * 3.4) * 0.12;
        // FOLLOW CAMERA. The authored Catmull-Rom keys rose faster than she
        // climbed: by 95% of the shot only her hammer was still in frame. Track
        // her directly, drifting the lateral offset and tightening the lens so
        // the shot still moves rather than locking off.
        const e = smooth(u);
        const lat = 1.4 - e * 2.2, hgt = 2.6 - e * 0.8, dist = 7.0 - e * 1.6;
        cam.position.set(x + lat, y + hgt, z + dist);
        cam.fov = 52 - e * 6; cam.updateProjectionMatrix();
        cam.lookAt(x, y + 1.0, z);
      } };
    }

    /* ===================== 5 — SHE DOES NOT TOUCH IT (b06 tension) ===================== */
    if (name === 'notTouching') {
      sc.fog = new T.Fog(0x5a5244, 10, 34);
      sc.add(K.skyDome({ top: '#4a4234', mid: '#6b6050', bottom: '#8a7c64' }));
      K.warmInterior(sc);
      ground('stone', '#9c8e76', '#8a7c64');
      sc.add(W.box({ p: [0, 5, -4.5], s: [12, 10, 0.5], color: '#b3a68d' }));
      sc.add(W.box({ p: [-4.5, 5, -1], s: [0.5, 10, 8], color: '#a89a80' }));
      sc.add(W.box({ p: [4.5, 5, -1], s: [0.5, 10, 8], color: '#a89a80' }));
      sc.add(W.box({ p: [0, 3.85, -1.6], s: [9, 0.34, 0.34], color: '#6b4f34' }));
      const bl = bell(T, W, K, { p: [1.2, 3.6, -1.6], s: 1.1 }); sc.add(bl.group);
      sc.add(W.cyl({ p: [1.2, 3.75, -1.6], rt: 0.05, h: 0.4, color: '#c9b48a', seg: 6 }));
      sc.add(K.crate({ p: [-3.2, 0, 1.6], s: 0.8 })); sc.add(K.barrel({ p: [3.4, 0, 1.8], s: 0.8 }));
      sc.add(K.lantern({ p: [-3.0, 3.4, -3.6], on: 1 }));
      const dust = motes(T, W, K, [-3, 3, 0.5, 6, -4, 1], 20); sc.add(dust.group);
      const nora = A.Actor({ p: [-0.9, 0, 0.6], h: 2.2, look: NORA });
      addActors(sc, [nora]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-0.4, 2.2, 4.8], look: [0.3, 1.95, -1.6], fov: 56 },
        { t: 2.9, pos: [-0.2, 2.3, 4.4], look: [0.4, 2.05, -1.6], fov: 54 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.005 });
        dust.update(t);
        bl.swing(Math.sin(t * 0.8) * 0.006);
        // hand rises toward the bell, then lowers: the refusal is the beat
        const u = clamp(t / 1.6, 0, 1);
        const reach = u < 0.55 ? smooth(u / 0.55) : 1 - smooth((u - 0.55) / 0.45);
        nora.update(cam, t * 30, { mood: 'worry', arms: 'hold', hunch: 0.12, lookX: 0.42, tilt: 0.03, armR: [0.12 + reach * 0.22, 0.42 + reach * 0.3], armRK: 0.9 - reach * 0.25, nerv: 0.15 });
      } };
    }

    /* ===================== 6 — TAPPING THE WALL (b07 mystery) ===================== */
    if (name === 'tapping') {
      sc.fog = new T.Fog(0x5a5244, 9, 32);
      sc.add(K.skyDome({ top: '#4a4234', mid: '#6b6050', bottom: '#8a7c64' }));
      K.warmInterior(sc);
      ground('stone', '#9c8e76', '#8a7c64');
      // the wall she tests, close and detailed
      sc.add(W.box({ p: [1.9, 4.0, -1.2], s: [0.6, 8, 7], color: '#b8ab92' }));
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        sc.add(W.box({ p: [1.58, 0.6 + r * 1.05, -3.6 + c * 1.35 + (r % 2) * 0.4], s: [0.06, 0.9, 1.2], color: (r + c) % 3 ? '#c3b69c' : '#ada086', ink: 0.02 }));
      }
      sc.add(W.box({ p: [-4.2, 4.0, -1], s: [0.5, 8, 8], color: '#a89a80' }));
      sc.add(W.box({ p: [0, 3.85, -1.4], s: [8, 0.32, 0.32], color: '#6b4f34' }));
      const bl = bell(T, W, K, { p: [-1.6, 3.6, -1.4], s: 1.0 }); sc.add(bl.group);
      sc.add(K.lantern({ p: [-3.2, 3.2, -3.0], on: 1 }));
      sc.add(K.crate({ p: [-3.0, 0, 1.8], s: 0.75 }));
      const dust = motes(T, W, K, [-3, 2, 0.4, 6, -4, 1], 22); sc.add(dust.group);
      const nora = A.Actor({ p: [0.5, 0, 0.4], h: 2.2, look: NORA });
      addActors(sc, [nora]);
      const ham = new T.Group();
      ham.add(W.box({ p: [0, 0, 0], s: [0.07, 0.4, 0.07], color: '#8a6a4a' }));
      ham.add(W.box({ p: [0, 0.22, 0], s: [0.22, 0.11, 0.11], color: '#4a4a52', ink: 0.03 }));
      sc.add(ham);
      // impact rings on the stone, only at the two taps
      const tapFx = soundRings(T, W, K, { p: [1.55, 1.5, 0.1], n: 3 }); sc.add(tapFx.group);
      tapFx.group.rotation.z = Math.PI / 2;
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-1.6, 2.2, 5.2], look: [0.8, 1.9, -0.8], fov: 56 },
        { t: 2.2, pos: [-0.8, 2.1, 4.6], look: [1.0, 1.85, -0.6], fov: 52 },
        { t: 4.4, pos: [-0.2, 2.2, 4.4], look: [0.9, 1.95, -0.6], fov: 52 },
        { t: 7.2, pos: [-1.0, 2.3, 5.0], look: [0.5, 2.0, -0.8], fov: 56 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.006 });
        dust.update(t);
        bl.swing(Math.sin(t * 0.7) * 0.005);
        // Word-synced taps: local 2.972 ("once") and 4.192 ("twice"). These come
        // from picture-cues.json, which the sound plan uses too, so the hammer,
        // the impact ring and the footstep-on-stone all land on the same frame.
        const TAP1 = 2.972, TAP2 = 4.192;
        const near1 = Math.abs(t - TAP1) < 0.26, near2 = Math.abs(t - TAP2) < 0.26;
        const tapping = t < TAP2 + 0.30;
        // phase the gesture so the strike lands exactly on each tap
        const since = t < (TAP1 + TAP2) / 2 ? t - (TAP1 - 0.78) : t - (TAP2 - 0.78);
        nora.update(cam, t * 30, tapping ? A.G.tapWall(since) : A.G.listen(t));
        const sw = tapping ? Math.sin(since / 1.4 * Math.PI * 2) : 0;
        ham.position.set(1.05 + (near1 || near2 ? 0.24 : 0), 1.55 + sw * 0.12, 0.35);
        ham.rotation.z = tapping ? -0.9 + sw * 0.5 : -0.3;
        tapFx.update(t * 2.2, near1 || near2);
      } };
    }

    /* ===================== 7 — THE TOWN HOLDS ITS BREATH (b08 tension) ===================== */
    if (name === 'heldBreath') {
      sc.fog = new T.Fog(0xc4c8ce, 22, 74);
      sc.add(K.skyDome({ top: '#8496ae', mid: '#c4c8ce', bottom: '#dcd6c8' }));
      K.dayLight(sc);
      ground('grass', '#8f9668', '#7f8658');
      sc.add(tower(T, W, K, { p: [0.5, 0, -20], h: 17, w: 4.4 }));
      sc.add(K.hut({ p: [-8.5, 0, -6], s: 1.3, rotY: 0.3 }));
      sc.add(K.hut({ p: [8.5, 0, -6.5], s: 1.4, rotY: -0.3 }));
      sc.add(K.hut({ p: [-13, 0, -11], s: 1.2, rotY: 0.5 }));
      sc.add(K.marketStall({ p: [-5, 0, -3], rotY: 0.3, awning: '#c0392b', goods: 'fruit' }));
      sc.add(K.marketStall({ p: [5.2, 0, -3.4], rotY: -0.3, awning: '#2980b9', goods: 'cloth' }));
      sc.add(K.well({ p: [0.6, 0, -5] }));
      sc.add(K.tree({ p: [-6.5, 0, -1], s: 1.3 })); sc.add(K.tree({ p: [7, 0, -1.6], s: 1.4 }));
      sc.add(K.cart({ p: [6.2, 0, 2.4], rotY: -0.4 })); sc.add(K.crate({ p: [-3.4, 0, 3], s: 0.8 }));
      sc.add(K.groundDetail({ area: [-9, 9, -3, 5], n: 48, seed: 31 }));
      // a dense crowd, all facing up toward the tower off-screen
      const folk = crowd(T, W, K, A, [[-3.4, 0.8, 1], [-1.9, 0.4, 1.04], [-0.4, 0.9, 0.98], [1.1, 0.3, 1.02], [2.6, 0.8, 0.96], [3.9, 0.1, 0.93], [-2.6, -1.2, 0.9], [0.6, -1.4, 0.88], [2.2, -1.3, 0.9]]);
      addActors(sc, folk);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 3.8, 8.6], look: [0, 3.0, -4], fov: 56 },
        { t: 2.0, pos: [-0.8, 2.4, 6.4], look: [-0.4, 1.7, 0], fov: 50 },
        { t: 3.8, pos: [-0.3, 2.1, 5.2], look: [-0.2, 1.8, 0], fov: 47 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.003 });
        folk.forEach((f, k) => f.update(cam, t * 30 + k * 7, A.G.holdBreath(t + k * 0.11)));
      } };
    }

    /* ===================== 8 — THE BELL IS FINE (b09 reveal) ===================== */
    if (name === 'bellFine') {
      sc.fog = new T.Fog(0x6b6252, 8, 30);
      sc.add(K.skyDome({ top: '#5a5244', mid: '#7d7260', bottom: '#9c8e76' }));
      K.warmInterior(sc);
      ground('stone', '#9c8e76', '#8a7c64');
      sc.add(W.box({ p: [0, 5, -4], s: [12, 10, 0.5], color: '#b3a68d' }));
      sc.add(W.box({ p: [0, 4.05, -1.2], s: [9, 0.34, 0.34], color: '#6b4f34' }));
      const bl = bell(T, W, K, { p: [0.2, 3.8, -1.2], s: 1.3 }); sc.add(bl.group);
      sc.add(W.cyl({ p: [0.2, 3.95, -1.2], rt: 0.06, h: 0.4, color: '#c9b48a', seg: 6 }));
      const halo = K.glow({ p: [0.2, 2.7, -1.2], r: 2.8, color: 'rgba(255,225,150,1)', o: 0.26 }); sc.add(halo);
      const dust = motes(T, W, K, [-3, 3, 0.5, 6, -3.5, 1], 26); sc.add(dust.group);
      sc.add(K.lantern({ p: [-3.4, 3.2, -3.2], on: 1 }));
      const nora = A.Actor({ p: [-0.75, 0, -0.2], h: 2.1, look: NORA });
      addActors(sc, [nora]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 2.7, 5.8], look: [0.1, 2.5, -1.2], fov: 56 },
        { t: 1.5, pos: [0.4, 2.8, 5.2], look: [0.2, 2.6, -1.2], fov: 52 },
        { t: 3.0, pos: [-0.2, 2.9, 4.9], look: [0.1, 2.7, -1.2], fov: 52 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        dust.update(t);
        // a clean, confident ring at 0.55s — this bell is sound
        const hit = t > 0.55;
        bl.swing(hit ? Math.sin((t - 0.55) * 5.2) * 0.13 * Math.exp(-(t - 0.55) * 0.7) : 0);
        halo.material.opacity = 0.20 + 0.10 * Math.sin(t * 2.4) + (hit ? 0.08 * Math.exp(-(t - 0.55) * 1.2) : 0);
        nora.update(cam, t * 30, A.G.resolve(t));
      } };
    }

    /* ===================== 9 — THE TOWER WAS THE PROBLEM (b10 surprise, b11 reveal) ===================== */
    if (name === 'stoneTruth') {
      sc.fog = new T.Fog(0x4a4640, 9, 34);
      sc.add(K.skyDome({ top: '#3a3630', mid: '#5a544a', bottom: '#7a7060' }));
      K.warmInterior(sc);
      ground('stone', '#8a8070', '#7a7060');
      // the swallowing wall: a dense stone mass that visibly eats the notes
      sc.add(W.box({ p: [2.2, 4.2, -1.4], s: [1.4, 8.4, 7.5], color: '#8f8676' }));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) {
        sc.add(W.box({ p: [1.46, 0.5 + r * 1.0, -3.8 + c * 1.4 + (r % 2) * 0.45], s: [0.08, 0.86, 1.25], color: (r * 3 + c) % 4 ? '#9a9180' : '#847b6a', ink: 0.02 }));
      }
      sc.add(W.box({ p: [-4.6, 4.2, -1], s: [0.5, 8.4, 8], color: '#a89a80' }));
      sc.add(W.box({ p: [0, 4.15, -1.4], s: [8.5, 0.34, 0.34], color: '#6b4f34' }));
      const bl = bell(T, W, K, { p: [-1.4, 3.9, -1.4], s: 1.05 }); sc.add(bl.group);
      // notes that die at the wall
      const eaten = soundRings(T, W, K, { p: [-1.4, 2.9, -1.4], n: 4 }); sc.add(eaten.group);
      const dust = motes(T, W, K, [-3.5, 2, 0.4, 6.5, -4, 1], 24); sc.add(dust.group);
      sc.add(K.lantern({ p: [-3.4, 3.0, -3.2], on: 1 }));
      sc.add(K.crate({ p: [-3.2, 0, 2.0], s: 0.75 }));
      const nora = A.Actor({ p: [-0.2, 0, 0.8], h: 2.2, look: NORA });
      addActors(sc, [nora]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-0.4, 2.4, 5.2], look: [1.0, 2.15, -1.4], fov: 58 },
        { t: 1.4, pos: [0.1, 2.5, 4.8], look: [1.3, 2.2, -1.4], fov: 54 },
        { t: 4.2, pos: [-0.8, 2.6, 5.2], look: [0.5, 2.35, -1.4], fov: 56 },
        { t: 7.0, pos: [-1.4, 2.9, 5.8], look: [-0.2, 2.6, -1.4], fov: 58 },
        { t: 9.6, pos: [-0.5, 2.5, 5.4], look: [0.4, 2.2, -1.2], fov: 56 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.005 });
        dust.update(t);
        // b10 twist hit at local 0.05; then four notes swallowed (0.9,2.05,3.2,4.35)
        const shock = t < 1.08;   // twist hit lands at local 0.782 (word "tower")
        bl.swing(Math.sin(t * 1.6) * 0.02);
        eaten.update(t * 1.6, t > 0.8 && t < 5.2);
        // rings shrink into the wall instead of expanding: the stone eats them
        eaten.group.children.forEach((m, k) => {
          const u = ((t * 0.9 + k / 4) % 1);
          m.scale.setScalar(0.4 + (1 - u) * 3.2);
          m.position.x = u * 3.0;
          m.material.opacity = t > 0.8 && t < 5.2 ? 0.26 * (1 - u) : 0;
        });
        nora.update(cam, t * 30, shock ? A.G.awe(t) : (t < 5.4 ? A.G.listen(t) : A.G.resolve(t - 5.4)));
      } };
    }

    /* ===================== 10 — MOVING THE BELL (b12 reveal) ===================== */
    if (name === 'movingBell') {
      sc.fog = new T.Fog(0x5a5244, 9, 32);
      sc.add(K.skyDome({ top: '#4a4234', mid: '#6b6050', bottom: '#8a7c64' }));
      K.warmInterior(sc);
      ground('stone', '#9c8e76', '#8a7c64');
      sc.add(W.box({ p: [0, 5, -4.2], s: [12, 10, 0.5], color: '#b3a68d' }));
      sc.add(W.box({ p: [2.6, 4.2, -1.6], s: [1.2, 8.4, 7], color: '#8f8676' }));
      sc.add(W.box({ p: [-4.6, 4.2, -1], s: [0.5, 8.4, 8], color: '#a89a80' }));
      const beam = W.box({ p: [-0.6, 3.95, -1.4], s: [8.5, 0.34, 0.34], color: '#6b4f34' }); sc.add(beam);
      const bl = bell(T, W, K, { p: [0.9, 3.7, -1.4], s: 1.05 }); sc.add(bl.group);
      const rope = W.cyl({ p: [0.9, 3.85, -1.4], rt: 0.05, h: 0.4, color: '#c9b48a', seg: 6 }); sc.add(rope);
      const dust = motes(T, W, K, [-3.5, 2, 0.4, 6.5, -4, 1], 22); sc.add(dust.group);
      sc.add(K.lantern({ p: [-3.4, 3.0, -3.2], on: 1 }));
      const nora = A.Actor({ p: [-1.8, 0, 0.7], h: 2.2, look: NORA });
      const helper = A.Actor({ p: [-2.7, 0, -0.4], h: 2.35, look: FOUNDER });
      addActors(sc, [nora, helper]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-0.4, 2.5, 5.8], look: [-0.2, 2.2, -1.4], fov: 58 },
        { t: 2.0, pos: [-1.0, 2.6, 5.4], look: [-0.7, 2.25, -1.4], fov: 56 },
        { t: 4.1, pos: [-1.5, 2.5, 5.6], look: [-1.1, 2.2, -1.4], fov: 58 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.006 });
        dust.update(t);
        // the bell travels left, seats at 2.35s ("four feet to the left")
        const u = smooth(clamp((t - 0.9) / 1.45, 0, 1));
        const x = 0.9 - u * 2.5;
        bl.group.position.x = x; rope.position.x = x;
        const seated = t > 2.356;   // word "left"
        bl.swing(seated ? Math.sin((t - 2.356) * 7) * 0.05 * Math.exp(-(t - 2.356) * 2.6) : Math.sin(t * 3.2) * 0.035 * u);
        nora.update(cam, t * 30, t < 2.6 ? A.G.pullRope(t) : A.G.listened(t));
        helper.update(cam, t * 30 + 15, t < 2.6 ? A.G.pullRope(t + 0.3) : A.G.resolve(t));
      } };
    }

    /* ===================== 11 — IT RINGS (b13 excitement, b14 resolve) ===================== */
    if (name === 'theRing') {
      sc.fog = new T.Fog(0xf0dcb4, 30, 100);
      sc.add(K.skyDome({ top: '#6fa8d8', mid: '#cfe4f5', bottom: '#ffe6b0' }));
      K.dayLight(sc);
      ground('grass', '#a8b070', '#98a060');
      sc.add(W.ball({ p: [-24, 16, -54], r: 3.6, color: '#fff0c0', ink: 0 }));
      sc.add(K.mountain({ p: [-24, 0, -60], s: 2.2, color: '#93a8c4' }));
      sc.add(K.mountain({ p: [20, 0, -64], s: 2.6, color: '#8396b0' }));
      const tw = tower(T, W, K, { p: [0, 0, -13], h: 18, w: 4.8 }); sc.add(tw);
      const bl = bell(T, W, K, { p: [-0.5, 16.1, -10.5], s: 0.95 }); sc.add(bl.group);
      const rings = soundRings(T, W, K, { p: [-0.5, 15.2, -10.5], n: 5 }); sc.add(rings.group);
      sc.add(K.hut({ p: [-9, 0, -6], s: 1.3, rotY: 0.3 }));
      sc.add(K.hut({ p: [9, 0, -7], s: 1.4, rotY: -0.3 }));
      sc.add(K.hut({ p: [-14, 0, -12], s: 1.2, rotY: 0.5 }));
      sc.add(K.hut({ p: [14, 0, -13], s: 1.3, rotY: -0.45 }));
      sc.add(K.marketStall({ p: [-5.4, 0, -3], rotY: 0.3, awning: '#c0392b', goods: 'fruit' }));
      sc.add(K.marketStall({ p: [5.6, 0, -3.4], rotY: -0.3, awning: '#16a085', goods: 'pottery' }));
      sc.add(K.tree({ p: [-6.8, 0, -1], s: 1.4 })); sc.add(K.tree({ p: [7.2, 0, -1.6], s: 1.5, kind: 'pine' }));
      sc.add(K.well({ p: [3.0, 0, -1] })); sc.add(K.banner({ p: [-2.6, 2.8, -5], rotY: 0.1, color: '#c0392b' }));
      sc.add(K.cart({ p: [6.4, 0, 2.4], rotY: -0.4 })); sc.add(K.crate({ p: [-3.6, 0, 3], s: 0.8 }));
      sc.add(K.barrel({ p: [-2.8, 0, 3.4], s: 0.9 }));
      sc.add(K.groundDetail({ area: [-10, 10, -3, 5], n: 56, seed: 41 }));
      sc.add(K.cloud({ p: [-15, 19, -42], s: 2.6 })); sc.add(K.cloud({ p: [16, 22, -48], s: 3.2 }));
      const nora = A.Actor({ p: [-0.4, 0, 1.4], h: 2.3, look: NORA });
      addActors(sc, [nora]);
      const folk = crowd(T, W, K, A, [[-3.6, 0.4, 1], [-2.1, -0.2, 1.03], [1.8, 0.2, 0.99], [3.3, -0.4, 0.95], [4.6, 0.6, 0.92], [-4.8, -0.9, 0.9], [0.9, -1.3, 0.88], [2.6, -1.5, 0.9]]);
      addActors(sc, folk);
      // confetti of light, not paper: this is a sound, not a party
      const glowMotes = motes(T, W, K, [-8, 8, 0.5, 9, -4, 4], 34); sc.add(glowMotes.group);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-0.5, 12.0, 3.0], look: [-0.5, 15.4, -11], fov: 48 },
        { t: 1.6, pos: [-1.2, 9.0, 6.0], look: [-0.4, 11.0, -11], fov: 52 },
        { t: 3.6, pos: [-0.6, 4.0, 9.0], look: [-0.2, 2.0, 0], fov: 54 },
        { t: 5.6, pos: [0.6, 2.6, 6.6], look: [-0.2, 1.7, 0.6], fov: 50 },
        { t: 9.3, pos: [-0.2, 2.3, 5.0], look: [-0.4, 1.7, 1.2], fov: 46 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.005 });
        glowMotes.update(t);
        // Word-synced strikes: local 0.966 is the word "rang"; 3.166 the second
        // strike. Same anchors as the sound plan (picture-cues.json).
        const R1 = 0.966, R2 = 3.166;
        const s1 = t > R1 ? Math.sin((t - R1) * 4.6) * 0.17 * Math.exp(-(t - R1) * 0.45) : 0;
        const s2 = t > R2 ? Math.sin((t - R2) * 4.6) * 0.14 * Math.exp(-(t - R2) * 0.5) : 0;
        bl.swing(s1 + s2);
        rings.update(t, t > R1);
        const joy = t > R1 + 1.0;
        folk.forEach((f, k) => f.update(cam, t * 30 + k * 9, joy ? (k % 3 === 0 ? A.G.applaud(t + k * 0.2) : A.G.celebrate(t + k * 0.15)) : A.G.awe(t + k * 0.05)));
        // Nora: struck by it, then quiet pride for the last line (b14 at 4.93 local)
        nora.update(cam, t * 30, t < 4.93 ? A.G.awe(t) : A.G.listened(t - 4.93));
      } };
    }

    throw new Error('unknown shot ' + name);
  };

  window.BellFilm = { shots, TOTAL, LEAD, build };
})();
