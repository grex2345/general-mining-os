// film_potter.js — Round 11 production: "The Boy Who Chose Clay" (English, ~36s, 9 shots).
// A full multi-scene short built on the ported Stick3D architecture (2D acting puppet billboards
// in a 3D toon world). Each shot has its OWN location, camera language, acting and props, timed
// to the narration word track. Browser-side: window.PotterFilm = { shots, build(i, ctx) }.
// ctx = { THREE, W (StickWorld), K (WorldKit), A (ActorKit) }. build -> { sc, cam, update(localT) }.
(function () {
  const LEAD = 1.2; // narration offset (cold-open before first word)
  // shot metadata: global start/duration + transition INTO the shot
  const shots = [
    { name: 'square',      start: 0.0,  dur: 3.7, trans: { type: 'fadein', dur: 0.8 } },
    { name: 'choice',      start: 3.7,  dur: 2.8, trans: { type: 'dissolve', dur: 0.45 } },
    { name: 'mockery',     start: 6.5,  dur: 3.6, trans: { type: 'cut' } },
    { name: 'wheel',       start: 10.1, dur: 3.0, trans: { type: 'dissolve', dur: 0.45 } },
    { name: 'montage',     start: 13.1, dur: 4.0, trans: { type: 'cut' } },
    { name: 'kiln',        start: 17.1, dur: 3.9, trans: { type: 'dip', dur: 0.7 } },
    { name: 'doors',       start: 21.0, dur: 3.5, trans: { type: 'bloom', dur: 0.5 } },
    { name: 'reveal',      start: 24.5, dur: 5.4, trans: { type: 'dissolve', dur: 0.5 } },
    { name: 'celebration', start: 29.9, dur: 6.1, trans: { type: 'dissolve', dur: 0.5 } },
  ];
  const TOTAL = 36.0;

  // ---- shared helpers ----
  function ground(sc, K, W, kind, a, b) { sc.add(W.surface({ p: [0, 0, 0], s: [90, 90], kind, a, b, unit: 3 })); }
  function crowd(sc, A, positions, look, h = 2.3) {
    return positions.map(([x, z, s], i) => {
      const ac = A.Actor({ p: [x, 0, z], h: h * (s || 1), look: Object.assign({ skin: '#e8b88a', body: ['#8e44ad', '#2980b9', '#c0392b', '#16a085', '#d35400'][i % 5], outfit: 'shirt', hair: i % 2 ? 'short' : 'bob', hairColor: '#2a1a12', shoe: '#33415c' }, look || {}) });
      sc.add(ac.group); sc.add(ac.shadow); return ac;
    });
  }
  function confetti(sc, K, n = 60, bounds = [-7, 7, 0, 8, -3, 5]) {
    const g = new THREE.Group(); const ps = [];
    const cols = ['#ffd770', '#c0392b', '#2980b9', '#16a085', '#8e44ad', '#ff8fb0'];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      g.add(m); ps.push({ m, seed: i });
    }
    sc.add(g);
    return { update(t) { ps.forEach(({ m, seed }) => { const u = (t * 0.35 + seed * 0.13) % 1; m.position.set(bounds[0] + ((seed * 0.37) % 1) * (bounds[1] - bounds[0]) + Math.sin(t * 2 + seed) * 0.4, bounds[3] - u * (bounds[3] - bounds[2]), bounds[4] + ((seed * 0.71) % 1) * (bounds[5] - bounds[4])); m.rotation.set(t * 3 + seed, t * 2 + seed, t * 4 + seed); }); } };
  }
  function sparkles(sc, K, center, n = 16, r = 1.2) {
    const g = new THREE.Group(); const ps = [];
    for (let i = 0; i < n; i++) { const sp = K.glow({ p: center, r: 0.18, color: 'rgba(255,240,180,1)', o: 0.8 }); g.add(sp); ps.push(sp); }
    sc.add(g);
    return { update(t) { ps.forEach((sp, i) => { const a = t * 0.8 + i / n * Math.PI * 2; const rr = r * (0.7 + 0.3 * Math.sin(t * 2 + i)); sp.position.set(center[0] + Math.cos(a) * rr, center[1] + Math.sin(t * 1.5 + i) * 0.5 + 0.3, center[2] + Math.sin(a) * rr * 0.6); sp.material.opacity = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4 + i)); }); } };
  }
  function goldCoins(sc, K, W, p) { const g = new THREE.Group(); g.position.set(...p); for (let i = 0; i < 6; i++) g.add(W.cyl({ p: [Math.sin(i * 2.1) * 0.05, 0.05 + i * 0.07, Math.cos(i * 1.7) * 0.05], rt: 0.22, h: 0.06, color: '#ffc928', ink: 0.02 })); g.add(K.glow({ p: [0, 0.3, 0], r: 0.7, color: 'rgba(255,220,120,1)', o: 0.4 })); sc.add(g); return g; }

  const build = (i, ctx) => {
    const { THREE: T, W, K, A } = ctx;
    const sc = new T.Scene();
    const name = shots[i].name;

    /* ============================ SHOT 0 — VILLAGE SQUARE ============================ */
    if (name === 'square') {
      sc.fog = new T.Fog(0xdfeaf5, 26, 70);
      sc.add(K.skyDome({ top: '#8ec8ee', mid: '#cfe4f5', bottom: '#f6e6c4' }));
      K.dayLight(sc);
      ground(sc, K, W, 'grass', '#c9a86a', '#b8965a');
      sc.add(W.ball({ p: [-20, 24, -34], r: 3, color: '#ffe9a8', ink: 0 }));
      sc.add(K.mountain({ p: [-16, 0, -40], s: 1.4, color: '#9ab0c8' })); sc.add(K.mountain({ p: [14, 0, -44], s: 1.8, color: '#8aa0b8' }));
      sc.add(K.hut({ p: [-5.5, 0, -5], s: 1.3, rotY: 0.3 })); sc.add(K.hut({ p: [5.5, 0, -5.5], s: 1.5, rotY: -0.25 }));
      sc.add(K.hut({ p: [-1.5, 0, -9], s: 1.7 })); sc.add(K.hut({ p: [10, 0, -9], s: 1.3, rotY: -0.4 })); sc.add(K.hut({ p: [-10, 0, -8], s: 1.4, rotY: 0.4 }));
      sc.add(K.marketStall({ p: [-4, 0, -2], rotY: 0.4, awning: '#c0392b', goods: 'fruit' }));
      sc.add(K.marketStall({ p: [4.5, 0, -2.5], rotY: -0.35, awning: '#2980b9', goods: 'cloth' }));
      sc.add(K.well({ p: [0.5, 0, -4.5] }));
      sc.add(K.tree({ p: [-8, 0, -2], s: 1.3 })); sc.add(K.tree({ p: [8.5, 0, -3], s: 1.5, kind: 'pine' })); sc.add(K.tree({ p: [2.5, 0, -8], s: 1.2 }));
      sc.add(K.fence({ p: [-7.5, 0, 1.5], w: 4, rotY: 0.2 })); sc.add(K.cart({ p: [6.5, 0, 2], rotY: -0.5 }));
      sc.add(K.streetLamp({ p: [-2.5, 0, -0.5], on: 0 })); sc.add(K.banner({ p: [2.5, 2.6, -5], rotY: 0.1, color: '#c0392b' }));
      // foreground props so the lower frame is alive
      sc.add(K.crate({ p: [-3.2, 0, 3], s: 0.8 })); sc.add(K.crate({ p: [-2.6, 0, 3.4], s: 0.6 })); sc.add(K.barrel({ p: [3.4, 0, 3.2], s: 0.9 }));
      sc.add(K.pot({ p: [2.4, 0, 3.6], s: 0.8 })); sc.add(K.pot({ p: [3.0, 0, 4.0], s: 0.6, kind: 'vase' })); sc.add(K.sack({ p: [-4.2, 0, 3.6], s: 0.9 }));
      sc.add(K.groundDetail({ area: [-8, 8, -3, 4.5], n: 46, seed: 3 }));
      sc.add(K.cloud({ p: [-10, 14, -30], s: 2 })); sc.add(K.cloud({ p: [12, 16, -34], s: 2.6 }));
      const sami = A.Actor({ p: [-6, 0, 1.5], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      const villagers = crowd(sc, A, [[-3.2, -0.8, 1], [3.4, -1.0, 1.05], [1.8, -1.8, 0.95], [-1.6, -1.4, 0.9]]);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 8.5, 15], look: [0, 1, -2], fov: 52 },
        { t: 1.6, pos: [0, 4.0, 11], look: [0, 1.3, -1], fov: 48 },
        { t: 3.7, pos: [-0.5, 2.1, 7.5], look: [-0.5, 1.4, 0], fov: 46 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        const loco = A.path(t, [{ t: 0.3, x: -6, z: 1 }, { t: 2.6, x: -0.5, z: 0.5 }, { t: 3.7, x: -0.3, z: 0.5 }]);
        sami.setPos(loco.x, loco.z);
        sami.update(cam, t * 30, loco.moving ? { mood: 'smile', arms: 'down', walk: loco.walk, speed: loco.speed, flip: loco.flip } : A.idle(t, { mood: 'smile' }));
        villagers.forEach((v, k) => v.update(cam, t * 30 + k * 13, A.G.mock(t + k * 0.3)));
      } };
    }

    /* ============================ SHOT 1 — THE CHOICE ============================ */
    if (name === 'choice') {
      sc.fog = new T.Fog(0xdfeaf5, 22, 60);
      sc.add(K.skyDome({ top: '#8ec8ee', mid: '#cfe4f5', bottom: '#f6e6c4' }));
      K.dayLight(sc);
      ground(sc, K, W, 'grass', '#c9a86a', '#b8965a');
      sc.add(K.hut({ p: [-7, 0, -6], s: 1.2 })); sc.add(K.hut({ p: [7, 0, -7], s: 1.3 }));
      sc.add(K.tree({ p: [-9, 0, -2], s: 1.3 })); sc.add(K.tree({ p: [9, 0, -3], s: 1.4 }));
      sc.add(K.marketStall({ p: [4.5, 0, -2], rotY: -0.3, awning: '#8e44ad', goods: 'pottery' }));
      // greedy villager + gold (left)
      const greedy = A.Actor({ p: [-2.0, 0, 0], h: 2.5, look: { skin: '#e8b88a', body: '#d4a017', outfit: 'blazer', hair: 'swept', hairColor: '#3a2a12', shoe: '#2a2a2a' } });
      sc.add(greedy.group); sc.add(greedy.shadow);
      goldCoins(sc, K, W, [-1.4, 1.1, 0.4]);
      const greedy2 = A.Actor({ p: [-3.6, 0, -1.5], h: 2.3, look: { skin: '#d8a878', body: '#b8860b', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12' } });
      sc.add(greedy2.group); sc.add(greedy2.shadow);
      // Sami + wheel (right) under awning
      const sami = A.Actor({ p: [2.0, 0, -0.3], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      const wh = K.wheel({ p: [2.0, 0, 0.7] }); sc.add(wh.group);
      sc.add(W.box({ p: [2.0, 2.6, -0.5], s: [3, 0.08, 2], color: '#c0392b', rot: [0.15, 0, 0] }));
      sc.add(K.pot({ p: [3.4, 0, 0.6], s: 0.7 })); sc.add(K.sack({ p: [1.0, 0, 0.8], s: 0.8 })); sc.add(K.crate({ p: [3.6, 0, 1.8], s: 0.7 }));
      sc.add(K.groundDetail({ area: [-6, 6, -2, 3], n: 30, seed: 7 }));
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 2.3, 10.0], look: [0, 1.4, 0], fov: 58 },
        { t: 1.4, pos: [0, 2.15, 9.3], look: [0, 1.4, 0], fov: 55 },
        { t: 2.8, pos: [0.2, 2.0, 8.8], look: [0.1, 1.4, 0.2], fov: 53 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        greedy.update(cam, t * 30, A.G.greedy(t));
        greedy2.update(cam, t * 30 + 7, A.G.greedy(t + 0.5));
        sami.update(cam, t * 30, A.G.workWheel(t));
        wh.setSpin(t * 5);
      } };
    }

    /* ============================ SHOT 2 — MOCKERY CLOSE-UP ============================ */
    if (name === 'mockery') {
      sc.fog = new T.Fog(0xcfd8e8, 8, 26);
      sc.add(K.skyDome({ top: '#9ab8d8', mid: '#cfd8e8', bottom: '#e8dcc4' }));
      K.dayLight(sc);
      ground(sc, K, W, 'grass', '#bfa06a', '#a88a52');
      sc.add(K.hut({ p: [-5, 0, -7], s: 1.4 })); sc.add(K.hut({ p: [5, 0, -8], s: 1.5 })); sc.add(K.tree({ p: [-7, 0, -5], s: 1.2 })); sc.add(K.marketStall({ p: [6, 0, -5], rotY: -0.4, awning: '#16a085', goods: 'pottery' }));
      sc.add(K.groundDetail({ area: [-6, 6, -3, 2], n: 26, seed: 11 }));
      const sami = A.Actor({ p: [0, 0, 0], h: 2.6, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      // mockers flanking Sami, pointing at him (medium three-shot)
      const mL = A.Actor({ p: [-1.2, 0, 0.5], h: 2.7, look: { skin: '#e8b88a', body: '#c0392b', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12' } });
      const mR = A.Actor({ p: [1.25, 0, 0.6], h: 2.75, look: { skin: '#d8a878', body: '#8e44ad', outfit: 'shirt', hair: 'bob', hairColor: '#3a2a12' } });
      sc.add(mL.group); sc.add(mL.shadow); sc.add(mR.group); sc.add(mR.shadow);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 1.95, 7.2], look: [0, 1.5, 0], fov: 47 },
        { t: 1.8, pos: [0, 1.9, 6.4], look: [0, 1.55, 0], fov: 45 },
        { t: 3.6, pos: [0, 1.9, 5.8], look: [0, 1.6, 0], fov: 43 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.005 });
        sami.update(cam, t * 30, A.G.resolve(t));
        mL.update(cam, t * 30, A.G.mock(t)); mR.update(cam, t * 30 + 9, Object.assign({ flip: true }, A.G.mock(t + 0.4)));
      } };
    }

    /* ============================ SHOT 3 — THE WHEEL (interior) ============================ */
    if (name === 'wheel') {
      sc.fog = new T.Fog(0x6a4a2a, 14, 34);
      sc.add(K.skyDome({ top: '#4a3a2a', mid: '#6a4a2a', bottom: '#8a6a4a' }));
      K.warmInterior(sc);
      sc.add(W.surface({ p: [0, 0, 0], s: [30, 30], kind: 'plank', a: '#8a5a32', b: '#7a4a28', unit: 2 }));
      sc.add(W.box({ p: [0, 2.5, -5], s: [16, 5, 0.3], color: '#a8785a' })); // back wall
      sc.add(W.box({ p: [-6, 2.5, 0], s: [0.3, 5, 12], color: '#9a6a4a' })); // side wall
      sc.add(K.shelf({ p: [-4.5, 0, -4.4], w: 3, levels: 3 }));
      for (let k = 0; k < 6; k++) sc.add(K.pot({ p: [-5.4 + (k % 3) * 0.9, 0.3 + Math.floor(k / 3) * 0.72, -4.3], s: 0.45, color: ['#b0713f', '#9a5f33', '#c08050'][k % 3] }));
      sc.add(K.canvasPlane({ p: [3.5, 2.6, -4.8], s: [2.2, 2.2], px: [120, 120], draw: (c, Wd, H) => { c.fillStyle = '#ffe9a8'; c.fillRect(0, 0, Wd, H); c.strokeStyle = '#5a3a22'; c.lineWidth = 10; c.strokeRect(4, 4, Wd - 8, H - 8); c.beginPath(); c.moveTo(Wd / 2, 0); c.lineTo(Wd / 2, H); c.moveTo(0, H / 2); c.lineTo(Wd, H / 2); c.stroke(); } })); // window
      const shaft = K.glow({ p: [3.5, 2, -2], r: 3, color: 'rgba(255,230,170,1)', o: 0.25 }); sc.add(shaft);
      const dust = K.dustMotes({ bounds: [1, 5, 0.3, 4, -3, 1], n: 30 }); sc.add(dust.group);
      sc.add(K.lantern({ p: [-2, 3.4, -1], on: 1 }));
      sc.add(K.sack({ p: [-2.5, 0, 1.5], s: 1 })); sc.add(K.crate({ p: [3.8, 0, 1.8], s: 0.8 })); sc.add(K.barrel({ p: [4.6, 0, -1], s: 0.9 }));
      const wh = K.wheel({ p: [0, 0, 0.4] }); sc.add(wh.group);
      const sami = A.Actor({ p: [0, 0, -0.7], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [2.6, 1.5, 3.0], look: [0, 1.0, 0.4], fov: 40 },
        { t: 1.4, pos: [-2.2, 1.7, 3.0], look: [0, 1.1, 0.2], fov: 40 },
        { t: 3.0, pos: [0, 2.1, 3.4], look: [0, 1.9, -0.4], fov: 36 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        wh.setSpin(t * 7);
        const rise = 0.6 + 0.5 * Math.min(1, t / 2.5);
        wh.clay.scale.y = rise; wh.clay.position.y = 0.72 + 0.21 * rise;
        sami.update(cam, t * 30, t < 1.6 ? A.G.workWheel(t) : A.G.shapeClay(t));
        dust.update(t);
      } };
    }

    /* ============================ SHOT 4 — MONTAGE: SHAPE & SHATTER ============================ */
    if (name === 'montage') {
      sc.fog = new T.Fog(0x6a4a2a, 16, 38);
      sc.add(K.skyDome({ top: '#4a3a2a', mid: '#6a4a2a', bottom: '#8a6a4a' }));
      K.warmInterior(sc);
      sc.add(W.surface({ p: [0, 0, 0], s: [30, 30], kind: 'plank', a: '#8a5a32', b: '#7a4a28', unit: 2 }));
      sc.add(W.box({ p: [0, 2.5, -5], s: [16, 5, 0.3], color: '#a8785a' }));
      const shelfG = K.shelf({ p: [3.2, 0, -4.4], w: 3.4, levels: 3 }); sc.add(shelfG);
      const shelfPots = []; for (let k = 0; k < 9; k++) { const pp = K.pot({ p: [2.1 + (k % 3) * 1.0, 0.3 + Math.floor(k / 3) * 0.72, -4.3], s: 0.5, color: ['#b0713f', '#9a5f33', '#c08050'][k % 3] }); pp.visible = false; sc.add(pp); shelfPots.push(pp); }
      const wh = K.wheel({ p: [-1.2, 0, 0.4] }); sc.add(wh.group);
      const sami = A.Actor({ p: [-1.2, 0, -0.7], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      // shard burst (triggered mid-shot)
      const shards = []; for (let k = 0; k < 12; k++) { const s = W.box({ p: [0, 0, 0], s: [0.12, 0.12, 0.04], color: '#b0713f', ink: 0.02 }); s.visible = false; sc.add(s); shards.push({ m: s, a: k / 12 * Math.PI * 2, v: 1.5 + (k % 3) * 0.5 }); }
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [-0.3, 2.2, 7.8], look: [0.8, 1.3, -1], fov: 49 },
        { t: 2.0, pos: [0.2, 2.0, 6.8], look: [1.0, 1.3, -1.5], fov: 45 },
        { t: 4.0, pos: [0.6, 1.95, 6.2], look: [1.2, 1.35, -2], fov: 43 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        wh.setSpin(t * 7);
        // pots accumulate on shelf over the shot
        shelfPots.forEach((pp, k) => { pp.visible = t > 0.4 + k * 0.38; if (pp.visible) { const age = t - (0.4 + k * 0.38); pp.scale.setScalar(0.5 * Math.min(1, age * 4)); } });
        // shatter at t≈2.2
        const st = t - 2.2;
        shards.forEach(({ m, a, v }) => { if (st > 0 && st < 1.2) { m.visible = true; m.position.set(-0.4 + Math.cos(a) * v * st, 1.0 + 1.2 * st - 4.9 * st * st, 0.8 + Math.sin(a) * v * st * 0.5); m.rotation.set(st * 8, st * 6, a); } else m.visible = false; });
        const phase = t % 2.2;
        sami.update(cam, t * 30, phase < 1.4 ? A.G.shapeClay(t) : A.G.throwPot(phase - 1.4));
      } };
    }

    /* ============================ SHOT 5 — NIGHT KILN ============================ */
    if (name === 'kiln') {
      sc.fog = new T.Fog(0x141428, 18, 55);
      sc.add(K.skyDome({ top: '#0a0624', mid: '#1a1440', bottom: '#3a2a5e' }));
      const nl = K.nightLight(sc);
      ground(sc, K, W, 'grass', '#3a3a4a', '#2e2e3e');
      const st = K.stars({ n: 110 }); sc.add(st.group);
      sc.add(W.ball({ p: [18, 22, -34], r: 2.4, color: '#f0f4ff', ink: 0 })); // moon
      sc.add(K.glow({ p: [18, 22, -34], r: 5, color: 'rgba(200,220,255,1)', o: 0.4 }));
      sc.add(K.hut({ p: [-7, 0, -7], s: 1.2, wall: '#5a4a3a', roof: '#3a2a22' })); sc.add(K.hut({ p: [7, 0, -8], s: 1.3, wall: '#5a4a3a', roof: '#3a2a22' }));
      sc.add(K.fence({ p: [-6, 0, 2], w: 4 })); sc.add(K.tree({ p: [9, 0, -3], s: 1.4, kind: 'pine' }));
      const kiln = K.kiln({ p: [0, 0, -1], s: 1.2 }); sc.add(kiln.group);
      sc.add(K.groundDetail({ area: [-7, 7, -2, 3], n: 28, seed: 15 }));
      // wood pile
      for (let k = 0; k < 5; k++) sc.add(W.cyl({ p: [2.6 + (k % 2) * 0.3, 0.15 + Math.floor(k / 2) * 0.25, 1.5], rt: 0.12, h: 1.0, color: '#6b4226', rot: [0, 0, Math.PI / 2] }));
      const sami = A.Actor({ p: [-1.6, 0, 1.2], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 2.6, 9.5], look: [0, 1.3, -1], fov: 50 },
        { t: 2.0, pos: [-1, 1.8, 6.5], look: [-0.5, 1.2, 0], fov: 44 },
        { t: 3.9, pos: [0, 1.4, 4.8], look: [0, 1.0, 0.4], fov: 40 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.005, impacts: [[2.6, 0.02]] });
        const intensity = Math.min(1, 0.3 + t * 0.25);
        kiln.setFire(t, intensity);
        nl.warm.intensity = 1.0 + intensity * 1.6;
        sami.update(cam, t * 30, A.G.fireKiln(t));
        st.update(t);
      } };
    }

    /* ============================ SHOT 6 — DOORS OPEN ============================ */
    if (name === 'doors') {
      sc.fog = new T.Fog(0x141428, 16, 50);
      sc.add(K.skyDome({ top: '#0a0624', mid: '#1a1440', bottom: '#3a2a5e' }));
      const nl = K.nightLight(sc);
      ground(sc, K, W, 'grass', '#3a3a4a', '#2e2e3e');
      const kiln = K.kiln({ p: [0, 0, -2], s: 1.4 }); sc.add(kiln.group);
      kiln.setFire(1, 1);
      // doors (two hinged panels) in front of kiln mouth
      const doorL = W.box({ p: [-0.55, 0.9, 0.2], s: [0.7, 1.4, 0.08], color: '#4a3020' });
      const doorR = W.box({ p: [0.55, 0.9, 0.2], s: [0.7, 1.4, 0.08], color: '#4a3020' });
      const hingeL = new T.Group(); hingeL.position.set(-0.9, 0, 0.2); doorL.position.set(0.35, 0.9, 0); hingeL.add(doorL); sc.add(hingeL);
      const hingeR = new T.Group(); hingeR.position.set(0.9, 0, 0.2); doorR.position.set(-0.35, 0.9, 0); hingeR.add(doorR); sc.add(hingeR);
      const lightCone = new T.Mesh(new T.ConeGeometry(2.2, 5, 24, 1, true), new T.MeshBasicMaterial({ color: '#ffd770', transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      lightCone.position.set(0, 1.2, 2.5); lightCone.rotation.x = Math.PI / 2; sc.add(lightCone);
      const burst = K.glow({ p: [0, 1.2, 0.5], r: 3, color: 'rgba(255,220,140,1)', o: 0 }); sc.add(burst);
      // crowd silhouettes (backs to camera)
      const vill = crowd(sc, A, [[-2.4, 3.2, 1], [-1.2, 3.6, 1.05], [0, 3.3, 1], [1.3, 3.6, 1.05], [2.5, 3.2, 1], [0.6, 4.2, 0.95]], { body: '#2a2a3a', hairColor: '#1a1a2a' }, 2.4);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 1.5, 7.5], look: [0, 1.4, 0], fov: 46 },
        { t: 1.6, pos: [0, 1.7, 6], look: [0, 1.4, 0], fov: 42 },
        { t: 3.5, pos: [0, 1.8, 5], look: [0, 1.3, 0], fov: 40 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        const open = Math.min(1, Math.max(0, (t - 0.5) / 1.0));
        hingeL.rotation.y = -open * 1.9; hingeR.rotation.y = open * 1.9;
        lightCone.material.opacity = open * 0.3; burst.material.opacity = open * 0.7;
        nl.warm.intensity = 1.2 + open * 2.2;
        vill.forEach((v, k) => v.update(cam, t * 30 + k * 7, t < 1.6 ? A.idle(t, { mood: 'deadpan', arms: 'down' }) : A.G.gasp(t)));
      } };
    }

    /* ============================ SHOT 7 — THE REVEAL ============================ */
    if (name === 'reveal') {
      sc.fog = new T.Fog(0x2a2440, 14, 44);
      sc.add(K.skyDome({ top: '#1a1440', mid: '#2a2450', bottom: '#4a3a6e' }));
      const nl = K.nightLight(sc); nl.warm.intensity = 1.4; nl.warm.color.setHex(0xffd770);
      ground(sc, K, W, 'grass', '#3a3a4a', '#2e2e3e');
      // pedestal + masterpiece vase
      sc.add(W.cyl({ p: [0, 0.5, 0], rt: 0.7, rb: 0.85, h: 1.0, color: '#8a6a4a' }));
      sc.add(W.cyl({ p: [0, 1.02, 0], rt: 0.75, h: 0.06, color: '#6a4a2a', ink: 0.02 }));
      const vase = K.masterpiece({ p: [0, 1.05, 0], s: 1.15 }); sc.add(vase);
      const vaseGlow = K.glow({ p: [0, 1.9, 0], r: 1.8, color: 'rgba(255,230,150,1)', o: 0.32 }); sc.add(vaseGlow);
      const rays = new T.Mesh(new T.ConeGeometry(1.6, 5, 24, 1, true), new T.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      rays.position.set(0, 3.6, 0); sc.add(rays);
      const sp = sparkles(sc, K, [0, 1.6, 0], 18, 1.3);
      const sami = A.Actor({ p: [-1.8, 0, 0.3], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      const vill = crowd(sc, A, [[2.4, 1.5, 1], [3.2, 0.5, 1.05], [2.8, -1, 0.95]], {}, 2.3);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [2.4, 1.7, 4.0], look: [0, 1.5, 0], fov: 40 },
        { t: 2.4, pos: [-1.6, 1.6, 3.4], look: [0, 1.5, 0], fov: 38 },
        { t: 5.4, pos: [0, 1.6, 2.7], look: [0, 1.6, 0], fov: 32 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.003 });
        vase.rotation.y = t * 0.4;
        vaseGlow.material.opacity = 0.22 + 0.08 * Math.sin(t * 2);
        sp.update(t);
        sami.update(cam, t * 30, A.G.reveal(t));
        vill.forEach((v, k) => v.update(cam, t * 30 + k * 11, A.G.gasp(t + k * 0.2)));
      } };
    }

    /* ============================ SHOT 8 — CELEBRATION / OUTRO ============================ */
    if (name === 'celebration') {
      sc.fog = new T.Fog(0x1a1440, 24, 65);
      sc.add(K.skyDome({ top: '#0a0624', mid: '#2a2450', bottom: '#4a3a6e' }));
      const nl = K.nightLight(sc); nl.warm.intensity = 1.6;
      ground(sc, K, W, 'grass', '#3a3a4a', '#2e2e3e');
      const st = K.stars({ n: 90 }); sc.add(st.group);
      sc.add(K.hut({ p: [-7, 0, -7], s: 1.3, wall: '#6a5a4a', roof: '#4a3a2a' })); sc.add(K.hut({ p: [7, 0, -8], s: 1.4, wall: '#6a5a4a', roof: '#4a3a2a' }));
      sc.add(K.hut({ p: [0, 0, -12], s: 1.6, wall: '#6a5a4a', roof: '#4a3a2a' }));
      sc.add(K.marketStall({ p: [-5, 0, -2], rotY: 0.4, awning: '#c0392b', goods: 'pottery' }));
      sc.add(K.marketStall({ p: [5, 0, -2.5], rotY: -0.35, awning: '#2980b9', goods: 'pottery' }));
      sc.add(K.streetLamp({ p: [-3, 0, -1], on: 1 })); sc.add(K.streetLamp({ p: [3, 0, -1.5], on: 1 }));
      sc.add(K.lantern({ p: [-1.5, 3.2, -3], on: 1 })); sc.add(K.lantern({ p: [1.5, 3.4, -3.5], on: 1 }));
      sc.add(K.banner({ p: [-2, 3, -6], rotY: 0.1, color: '#c0392b' })); sc.add(K.banner({ p: [2, 3.2, -6.5], rotY: -0.1, color: '#2980b9' }));
      const sami = A.Actor({ p: [0, 0, 0], h: 2.6, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
      sc.add(sami.group); sc.add(sami.shadow);
      // vase held aloft (glued above hands)
      const vase = K.masterpiece({ p: [0, 2.5, 0.2], s: 0.7 }); sc.add(vase);
      const vaseGlow = K.glow({ p: [0, 3.0, 0.2], r: 1.2, color: 'rgba(255,230,150,1)', o: 0.4 }); sc.add(vaseGlow);
      sc.add(K.groundDetail({ area: [-7, 7, -2, 4], n: 34, seed: 21 }));
      const vill = crowd(sc, A, [[-3, 1.5, 1], [-2, 2.2, 1.05], [2.2, 2, 1], [3.2, 1.4, 1.05], [-1.2, 3, 0.95], [1.4, 3.2, 0.95], [0, 3.8, 1]], {}, 2.3);
      const conf = confetti(sc, K, 70);
      const { cam, at } = K.catmullCam({ keys: [
        { t: 0, pos: [0, 2.1, 6.5], look: [0, 1.8, 0], fov: 44 },
        { t: 2.6, pos: [0, 3.5, 9], look: [0, 1.6, -1], fov: 48 },
        { t: 6.1, pos: [0, 7.5, 14], look: [0, 1.5, -2], fov: 52 },
      ] });
      return { sc, cam, update(t) {
        at(t, { handheld: 0.004 });
        sami.update(cam, t * 30, A.G.celebrate(t));
        vase.position.y = 2.7 + 0.1 * Math.abs(Math.sin(t * 3)); vase.rotation.y = t * 0.5;
        vaseGlow.position.y = vase.position.y + 0.3;
        vill.forEach((v, k) => v.update(cam, t * 30 + k * 9, A.G.applaud(t + k * 0.15)));
        conf.update(t); st.update(t);
      } };
    }
    throw new Error('unknown shot ' + name);
  };

  window.PotterFilm = { shots, TOTAL, LEAD, build };
})();
