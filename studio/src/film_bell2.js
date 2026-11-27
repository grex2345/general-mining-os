// film_bell2.js — Round 14 visual re-make of "The Bell of Vellara".
// SAME 66.000s, SAME narration, SAME mix and word timings as Round 13. Only the picture changes.
// Browser-side classic script: window.BellFilm2 = { scenes, TOTAL, LEAD, build(i, ctx), plan() }
// ctx = { THREE, W, K, A, S (SetKit), C (Cinema2), words, cues }
//
// WHAT CHANGED AND WHY (measured Round 13 failures -> fix):
//   composition change 5.07s -> 39 compositions, every one <= 2.2s, each with a story reason
//   4 hard cuts           -> 0; place changes are moving dissolves or foreground wipes
//   moving area 24.07%    -> always-on life (flock, bunting, smoke, embers, dust) + foreground parallax
//   roll 17.5% / pulls 9% -> every comp rolls; 8 pull-backs / reveals
//   no lip-sync           -> visemes on the valley cheer + directed reaction mouths
//   bare huts, 1 sign     -> facades with mullions/shutters, 6 in-world signs, animals, light arc
(function () {
  const LEAD = 1.0, TOTAL = 66.0;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;

  const faceY = (h) => h * 0.62;   // puppet head centre as a fraction of billboard height
  const NORA = { skin: '#e8b58c', body: '#3f7d8c', outfit: 'shirt', hair: 'bob', hairColor: '#241610', shoe: '#33415c' };
  const FOUNDER = { skin: '#d8a068', body: '#8a4b2a', outfit: 'leather', hair: 'short', hairColor: '#2a1a12', shoe: '#2a2a2a' };
  const ELDER = { skin: '#d9b48f', body: '#5b5f7a', outfit: 'blazer', hair: 'grey', hairColor: '#a9aab4', shoe: '#2a2a34', glasses: 1 };

  /* ============================ PROPS ============================ */
  // Bell with the detail the story needs: cast seam, maker's mark, wear at the lip, rope.
  function bell2(T, W, K, S, { p = [0, 0, 0], s = 1, color = '#b8862b' } = {}) {
    const pivot = new T.Group(); pivot.position.set(p[0], p[1], p[2]);
    const g = new T.Group(); g.scale.setScalar(s);
    g.add(W.cone({ p: [0, -0.62, 0], r: 0.78, h: 1.25, color, seg: 24 }));   // apex up = narrow crown, wide lip below
    g.add(W.cyl({ p: [0, -1.2, 0], rt: 0.82, h: 0.14, color: '#8f6a1e', seg: 24 }));      // lip
    g.add(W.cyl({ p: [0, -0.30, 0], rt: 0.21, h: 0.05, color: '#a8791f', seg: 24, ink: 0.01 })); // cast band
    g.add(W.cyl({ p: [0, -0.95, 0], rt: 0.61, h: 0.04, color: '#a8791f', seg: 24, ink: 0.01 }));
    g.add(W.box({ p: [0, -1.00, 0.63], s: [0.035, 0.40, 0.03], color: '#8f6a1e', ink: 0 }));    // cast seam
    g.add(W.cyl({ p: [0, 0.06, 0], rt: 0.2, h: 0.22, color: '#8f6a1e', seg: 12 }));
    g.add(W.ball({ p: [0, 0.2, 0], r: 0.13, color: '#6f5216' }));
    // maker's mark: a small engraved plate, readable in macro
    g.add(K.canvasPlane({ p: [0, -0.72, 0.47], s: [0.34, 0.16], px: [168, 80], transparent: true, draw: (c, CW, CH) => {
      c.clearRect(0, 0, CW, CH); c.fillStyle = 'rgba(90,66,16,.85)'; c.fillRect(0, 0, CW, CH);
      c.strokeStyle = '#e8c877'; c.lineWidth = 3; c.strokeRect(4, 4, CW - 8, CH - 8);
      c.fillStyle = '#e8c877'; c.textAlign = 'center'; c.font = '700 26px Georgia, serif';
      c.fillText('VELLARA', CW / 2, 32); c.font = '400 17px Georgia, serif'; c.fillText('ANNO  LX', CW / 2, 58);
    } }));
    const clapper = W.ball({ p: [0, -1.05, 0], r: 0.15, color: '#5a4410' });
    g.add(clapper);
    pivot.add(g);
    return { group: pivot, body: g, clapper,
      swing(a) { pivot.rotation.z = a; clapper.position.x = Math.sin(a * 2.2) * 0.22; } };
  }

  // Tower with string courses, corbels, belfry columns, clock and weather vane.
  function tower2(T, W, K, S, { p = [0, 0, 0], h = 16, w = 4.2, stone = '#cbbfa6', trim = '#9c8f76' } = {}) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    const tiers = 5, anim = [];
    for (let i = 0; i < tiers; i++) {
      const tw = w * (1 - i * 0.055), th = h / tiers;
      g.add(W.box({ p: [0, th * (i + 0.5), 0], s: [tw, th, tw], color: i % 2 ? stone : '#c3b69c' }));
      g.add(W.box({ p: [0, th * (i + 1), 0], s: [tw + 0.24, 0.2, tw + 0.24], color: trim, ink: 0.03 }));
      // corbels under each course
      for (let k = -1; k <= 1; k++) g.add(W.box({ p: [k * tw * 0.32, th * (i + 1) - 0.18, tw / 2 + 0.06], s: [0.22, 0.18, 0.16], color: trim, ink: 0.02 }));
      // ashlar joints on the front face
      g.add(K.canvasPlane({ p: [0, th * (i + 0.5), tw / 2 + 0.02], s: [tw, th], px: [Math.round(tw * 34), Math.round(th * 34)], transparent: true, draw: (c, CW, CH) => {
        c.clearRect(0, 0, CW, CH); c.strokeStyle = 'rgba(90,80,64,.30)'; c.lineWidth = 1.6;
        for (let y = 10; y < CH; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(CW, y); c.stroke();
          const ox = (y / 18 % 2) * 20; for (let x = ox; x < CW; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 18); c.stroke(); } }
        for (let i2 = 0; i2 < 12; i2++) { c.fillStyle = 'rgba(80,70,55,.10)'; c.beginPath(); c.arc((i2 * 37) % CW, (i2 * 53) % CH, 4 + (i2 % 4) * 3, 0, 7); c.fill(); }
      } }));
    }
    const by = h - 1.9;
    for (const dx of [-1.0, 1.0]) {
      g.add(W.box({ p: [dx, by, w * 0.45], s: [1.1, 2.3, 0.3], color: '#2b2438', ink: 0.04 }));
      g.add(W.cyl({ p: [dx, by + 1.15, w * 0.45], rt: 0.55, h: 0.3, color: '#2b2438', seg: 14, rot: [Math.PI / 2, 0, 0] }));
      g.add(W.cyl({ p: [dx, by - 0.1, w * 0.47], rt: 0.09, h: 2.1, color: trim, seg: 8, ink: 0.02 })); // belfry column
    }
    g.add(W.cone({ p: [0, h + 1.5, 0], r: w * 0.78, h: 3.0, color: '#7d5a3c', seg: 4, rot: [0, Math.PI / 4, 0] }));
    const vane = S.weatherVane({ p: [0, h + 3.1, 0], s: 1.1 }); g.add(vane.group); anim.push(vane);
    const clk = S.clockFace({ p: [0, h * 0.62, w * 0.47 + 0.06], r: 0.62 }); g.add(clk.group); anim.push(clk);
    for (let i = 1; i < tiers; i++) g.add(W.box({ p: [0, (h / tiers) * i + 0.6, w * 0.47], s: [0.5, 0.8, 0.1], color: '#ffd770', ink: 0.03 }));
    return { group: g, update(t) { anim.forEach(a => a.update(t)); } };
  }

  // Belfry interior: floor, the WALL she taps, arches onto the valley, beam, rope, cutaway.
  function belfry(T, W, K, S, { seed = 1, cutaway = false } = {}) {
    const g = new T.Group(); const anim = [];
    g.add(S.cobble({ p: [0, 0, 0], s: [12, 12], seed, base: '#a89e8c' }));
    g.add(W.box({ p: [0, -0.14, 0], s: [12, 0.28, 12], color: '#b3a68d' }));
    // the wall under investigation (x = +2.4) — ashlar with a visible seam
    const wallG = new T.Group();
    wallG.add(W.box({ p: [2.7, 2.4, 0], s: [0.6, 4.8, 6], color: '#c6b99f' }));
    wallG.add(K.canvasPlane({ p: [2.39, 2.4, 0], rot: [0, -Math.PI / 2, 0], s: [6, 4.8], px: [400, 320], transparent: true, draw: (c, CW, CH) => {
      c.clearRect(0, 0, CW, CH); c.strokeStyle = 'rgba(85,75,60,.34)'; c.lineWidth = 2;
      for (let y = 14; y < CH; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(CW, y); c.stroke();
        const ox = (y / 26 % 2) * 26; for (let x = ox; x < CW; x += 52) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 26); c.stroke(); } }
      // the hairline seam that swallows the note
      c.strokeStyle = 'rgba(40,32,26,.75)'; c.lineWidth = 3.4; c.beginPath();
      c.moveTo(CW * 0.42, 0); c.bezierCurveTo(CW * 0.46, CH * 0.3, CW * 0.38, CH * 0.6, CW * 0.44, CH); c.stroke();
      for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(70,60,48,.12)'; c.beginPath(); c.arc((i * 61) % CW, (i * 89) % CH, 5 + (i % 5) * 4, 0, 7); c.fill(); }
    } }));
    g.add(wallG);
    // back wall + arch openings onto the valley
    g.add(W.box({ p: [0, 2.4, -3.2], s: [6, 4.8, 0.5], color: '#bfb298' }));
    for (const dx of [-1.7, 1.7]) {
      g.add(W.box({ p: [dx, 2.4, -3.0], s: [1.5, 2.6, 0.2], color: '#2f3a52', ink: 0.04 }));
      g.add(W.cyl({ p: [dx, 3.7, -3.0], rt: 0.75, h: 0.2, color: '#2f3a52', seg: 14, rot: [Math.PI / 2, 0, 0] }));
    }
    // head beam + bell rope
    g.add(W.box({ p: [0, 4.5, 0], s: [5.4, 0.34, 0.34], color: '#6b4a30', ink: 0.03 }));
    for (const dx of [-2.4, 2.4]) g.add(W.box({ p: [dx, 2.3, 0], s: [0.26, 4.6, 0.26], color: '#7a5a3a', ink: 0.03 }));
    const rope = W.cyl({ p: [0.0, 2.6, 0.0], rt: 0.035, h: 3.6, color: '#c2a068', ink: 0.01 });
    g.add(rope); g.add(S.ropeCoil({ p: [1.4, 0, 1.4], r: 0.3 }));
    // dressing that says "sixty years of attempts"
    const twl = S.toolWall({ p: [-2.2, 3.2, -2.9], w: 2.4 }); g.add(twl.group); anim.push(twl);
    g.add(K.crate({ p: [-2.0, 0, 1.6], s: 0.62 })); g.add(K.crate({ p: [-2.0, 0.62, 1.6], s: 0.5 }));
    g.add(S.bucket({ p: [-1.4, 0, 2.1], s: 1 }));
    g.add(K.lantern({ p: [-2.3, 3.0, 1.4], on: 1 }));
    const posterG = S.poster({ p: [2.38, 3.3, 1.6], rot: [0, -Math.PI / 2, 0], title: 'SILENT', body: 'SIXTY YEARS', seed: 4 });
    g.add(posterG);
    g.add(S.poster({ p: [2.38, 2.5, 1.9], rot: [0, -Math.PI / 2, 0], w: 0.5, h: 0.7, title: 'TRIED', body: 'EVERY FOUNDER', seed: 9 }));
    // dust in the light shaft through the arch
    const shaft = S.lightShaft({ p: [-1.2, 2.6, -1.0], rot: [0, 0.3, 0.22], w: 1.8, h: 5.2, o: 0.20 });
    g.add(shaft.group); anim.push(shaft);
    const motes = K.dustMotes({ bounds: [-2.4, 2.2, 0.3, 4.2, -2, 2], n: 34 }); g.add(motes.group); anim.push(motes);
    // cutaway: the inside of the stone, revealed for the "you see" explanation
    let cut = null;
    if (cutaway) {
      const cg = new T.Group(); cg.position.set(2.4, 2.0, 0);
      const stoneIn = '#4a4238';
      cg.add(W.box({ p: [1.02, 0, 0], s: [0.12, 2.6, 2.6], color: stoneIn, ink: 0.03 }));   // back
      cg.add(W.box({ p: [0.5, 1.32, 0], s: [1.06, 0.12, 2.6], color: stoneIn, ink: 0.03 })); // top
      cg.add(W.box({ p: [0.5, -1.32, 0], s: [1.06, 0.12, 2.6], color: stoneIn, ink: 0.03 }));// floor
      cg.add(W.box({ p: [0.5, 0, -1.32], s: [1.06, 2.6, 0.12], color: stoneIn, ink: 0.03 }));
      cg.add(W.box({ p: [0.5, 0, 1.32], s: [1.06, 2.6, 0.12], color: stoneIn, ink: 0.03 }));
      // the sawn rim, so the opening reads as a section cut through masonry
      for (const [ry, rz, sh, sw] of [[1.34, 0, 0.1, 2.7], [-1.34, 0, 0.1, 2.7], [0, -1.34, 2.7, 0.1], [0, 1.34, 2.7, 0.1]])
        cg.add(W.box({ p: [0.02, ry, rz], s: [0.1, sh, sw], color: '#d8cbb0', ink: 0.04 }));
      const voids = [];
      for (let i = 0; i < 7; i++) { const b = W.ball({ p: [0.45 + (i % 3) * 0.22, -0.9 + i * 0.3, -0.7 + (i % 4) * 0.45], r: 0.16 + (i % 3) * 0.06, color: '#17150f', ink: 0.02 }); cg.add(b); voids.push(b); }
      const rings = [];
      for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.RingGeometry(0.2, 0.26, 28), new T.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); m.rotation.y = Math.PI / 2; cg.add(m); rings.push(m); }
      cg.visible = false; g.add(cg);
      cut = { group: cg, show(v) { cg.visible = v; },
        update(t) { rings.forEach((m, i) => { const u = ((t * 0.55 + i / 4) % 1); m.position.set(0.1 + u * 0.9, 0, 0); m.scale.setScalar(0.5 + u * 1.5); m.material.opacity = (1 - u) * 0.55; }); } };
      anim.push(cut);
    }
    // Backdrop: we are 12m up, so the arches must show sky and a valley far below,
    // and looking up must find a roof. Without this the frame had black voids.
    g.add(K.skyDome({ top: '#79b4e4', mid: '#cfe4f2', bottom: '#ffe9c0' }));
    g.add(W.box({ p: [0, -14, -10], s: [220, 0.4, 220], color: '#8f9a72', ink: 0 }));
    for (const [mx, mz] of [[-34, -52], [30, -58], [0, -70]]) g.add(K.mountain({ p: [mx, -14, mz], s: 3.0 }));
    g.add(W.box({ p: [0, 5.4, 0], s: [7.2, 0.4, 7.2], color: '#8a7a62', ink: 0.03 }));
    g.add(W.box({ p: [0, 2.4, 8.5], s: [13, 6.4, 0.4], color: '#bfb298' }));
    return { group: g, wall: wallG, cut, update(t) { anim.forEach(a => a.update && a.update(t)); } };
  }

  // Stair flight with a rail, wall, and a window shaft every few steps.
  function stairwell(T, W, K, S, { n = 18, rise = 0.34, run = 0.62, w = 2.4 } = {}) {
    const g = new T.Group(); const anim = [];
    for (let i = 0; i < n; i++) {
      const drift = Math.sin(i * 0.42) * 0.5, y = rise * i, z = -run * i;
      g.add(W.box({ p: [drift, y, z], s: [w, rise, run], color: i % 2 ? '#bdb097' : '#b3a68d' }));
      g.add(W.box({ p: [drift + w / 2 + 0.1, y + 0.5, z], s: [0.12, 1.0, 0.12], color: '#7a5a3a', ink: 0.02 }));
      g.add(W.box({ p: [drift - w / 2 - 0.35, y + 1.4, z], s: [0.5, 3.0, run], color: '#c0b39a' }));
      if (i % 5 === 3) {
        g.add(W.box({ p: [drift - w / 2 - 0.12, y + 1.7, z], s: [0.12, 0.9, 0.5], color: '#ffe9a8', ink: 0.03 }));
        const sh = S.lightShaft({ p: [drift - w / 2 + 0.7, y + 1.3, z], rot: [0, 0, -0.5], w: 1.0, h: 3.0, o: 0.16 });
        g.add(sh.group); anim.push(sh);
      }
    }
    // continuous handrail following the flight
    for (let i = 0; i < n - 1; i++) {
      const d0 = Math.sin(i * 0.42) * 0.5, d1 = Math.sin((i + 1) * 0.42) * 0.5;
      const a = [d0 + w / 2 + 0.1, rise * i + 1.0, -run * i], b = [d1 + w / 2 + 0.1, rise * (i + 1) + 1.0, -run * (i + 1)];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const rail = W.box({ p: mid, s: [0.09, 0.09, len], color: '#8a6a44', ink: 0.02 });
      rail.rotation.x = Math.atan2(b[1] - a[1], -(b[2] - a[2])) - Math.PI / 2;
      g.add(rail);
    }
    const motes = K.dustMotes({ bounds: [-1.6, 1.6, 0.3, 5.5, -8, 1], n: 26 }); g.add(motes.group); anim.push(motes);
    g.add(W.box({ p: [0, 6, -13.2], s: [9, 15, 0.5], color: '#b0a48c' }));
    g.add(W.box({ p: [3.4, 6, -5], s: [0.5, 15, 18], color: '#a89c86' }));
    g.add(W.box({ p: [0, 11.4, -5], s: [9, 0.5, 18], color: '#9a8e78' }));
    g.add(W.box({ p: [0, -0.6, -5], s: [9, 0.5, 18], color: '#8f846e' }));
    return { group: g, update(t) { anim.forEach(a => a.update(t)); }, at(i) { return [Math.sin(i * 0.42) * 0.5, rise * i, -run * i]; } };
  }

  /* ============================ SETS ============================ */
  // Light evolves with the story instead of one rig for everything.
  function lightArc(T, sc, mood) {
    const M = {
      dawn:    { sky: 0x9fc4e8, gnd: 0x8a7b5f, hi: 0.85, key: 0xffe6c0, ki: 1.15, pos: [8, 7, 6], fog: 0xbcd2e6, near: 18, far: 78 },
      forge:   { sky: 0xffcf9a, gnd: 0x5a3418, hi: 0.55, key: 0xffb066, ki: 1.25, pos: [3, 5, 4], fog: 0x4a2c1a, near: 8, far: 40 },
      cold:    { sky: 0xa8bcd8, gnd: 0x6a6a72, hi: 0.70, key: 0xdce8f4, ki: 0.95, pos: [6, 9, 4], fog: 0xaebfd4, near: 14, far: 70 },
      stair:   { sky: 0xc8c0a8, gnd: 0x4a4034, hi: 0.50, key: 0xffe9b8, ki: 1.05, pos: [-4, 6, 3], fog: 0x8f8672, near: 6, far: 34 },
      belfry:  { sky: 0xd8e4f0, gnd: 0x8a7f68, hi: 0.80, key: 0xfff0d0, ki: 1.15, pos: [-5, 7, 5], fog: 0xc4d2e0, near: 10, far: 52 },
      held:    { sky: 0x9aa8c0, gnd: 0x5a5a64, hi: 0.62, key: 0xcfdcec, ki: 0.85, pos: [5, 8, 5], fog: 0x9fb0c6, near: 12, far: 60 },
      reveal:  { sky: 0xffe4b0, gnd: 0x8a7048, hi: 0.92, key: 0xffd98a, ki: 1.30, pos: [-6, 6, 6], fog: 0xe8d4b0, near: 12, far: 62 },
      ring:    { sky: 0xffe9c0, gnd: 0x9a7b4f, hi: 1.00, key: 0xfff2c8, ki: 1.40, pos: [-7, 8, 7], fog: 0xf0dcb4, near: 16, far: 90 },
    }[mood] || {};
    sc.add(new T.HemisphereLight(M.sky, M.gnd, M.hi));
    const key = new T.DirectionalLight(M.key, M.ki); key.position.set(...M.pos); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const R = 16; key.shadow.camera.left = -R; key.shadow.camera.right = R; key.shadow.camera.top = R; key.shadow.camera.bottom = -R;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 60; key.shadow.bias = -0.0006; sc.add(key);
    sc.fog = new T.Fog(M.fog, M.near, M.far);
    return key;
  }

  function valleyFloor(T, W, K, S, { seed = 2, signs = true } = {}) {
    const g = new T.Group(); const anim = [];
    g.add(S.cobble({ p: [0, 0, 2], s: [30, 26], seed, base: '#a09884' }));
    g.add(W.box({ p: [0, -0.2, 0], s: [60, 0.4, 60], color: '#8f9a72' }));
    const rows = [[-8.5, 1.5, 0.5], [-11, -3, 0.2], [8.5, 2.0, -0.5], [11, -2.5, -0.2], [-7.5, 6.5, 0.9], [9.5, 7, -0.9]];
    rows.forEach(([x, z, ry], i) => g.add(S.facade({ p: [x, 0, z], w: 4 + (i % 2), h: 4.6 + (i % 3) * 0.8, d: 3.4, rotY: ry, seed: seed + i * 3, lit: 0.55, shop: i % 2 === 0, wall: ['#d9c3a0', '#cdb491', '#e0cbb0'][i % 3] })));
    for (const [x, z] of [[-14, -12], [14, -13], [-18, 4], [17, 6]]) g.add(K.tree({ p: [x, 0, z], s: 1.5, kind: 'round' }));
    for (const [x, z] of [[-30, -34], [26, -38], [0, -46]]) g.add(K.mountain({ p: [x, 0, z], s: 2.4 }));
    g.add(K.well({ p: [-4.6, 0, 4.2] })); g.add(K.cart({ p: [5.2, 0, 5.0], rotY: 0.4 }));
    g.add(K.marketStall({ p: [-6.0, 0, 7.4], rotY: 0.2, awning: '#c0392b' }));
    g.add(K.streetLamp({ p: [3.4, 0, 3.0], on: 0.6 })); g.add(K.streetLamp({ p: [-3.4, 0, 6.4], on: 0.6 }));
    g.add(S.cobble({ p: [0, 0.005, 9], s: [16, 8], seed: seed + 5, base: '#9a9280' }));
    const bunt = S.bunting({ from: [-6.5, 4.2, 5.5], to: [6.5, 4.0, 5.5], n: 12 }); g.add(bunt.group); anim.push(bunt);
    const fl = S.flock({ from: [-18, 12, -14], to: [18, 14, -10], n: 6, period: 17 }); g.add(fl.group); anim.push(fl);
    const fl2 = S.flock({ from: [16, 9, -6], to: [-16, 11, -4], n: 4, period: 23, phase: 0.4, s: 0.8 }); g.add(fl2.group); anim.push(fl2);
    for (const [x, z, sd] of [[-2.2, 6.2, 1], [-1.4, 6.8, 2], [4.0, 6.0, 3]]) { const ch = S.chicken({ p: [x, 0, z], s: 1, seed: sd }); g.add(ch.group); anim.push(ch); }
    if (signs) {
      const s1 = S.sign({ p: [-8.2, 3.5, 3.4], text: 'FOUNDRY', sub: 'EST. 1461', w: 1.9, h: 0.8, rotY: 0.5, seed: 3 }); g.add(s1.group); anim.push(s1);
      const s2 = S.sign({ p: [8.4, 3.3, 3.9], text: 'VELLARA', sub: 'PARISH OF THE BELL', w: 2.1, h: 0.8, rotY: -0.5, bg: '#2f3a4a', seed: 7 }); g.add(s2.group); anim.push(s2);
      const s3 = S.sign({ p: [-5.9, 2.9, 7.0], text: 'BRONZE', sub: 'POURED HERE', w: 1.5, h: 0.65, rotY: 0.2, bg: '#5a3a22', seed: 11 }); g.add(s3.group); anim.push(s3);
    }
    const haze = S.fogBank({ p: [0, 2.2, -22], w: 44, h: 6, n: 4, o: 0.20 }); g.add(haze.group); anim.push(haze);
    const lv = S.leaves({ p: [0, 0, 4], n: 9, area: [14, 7, 8] }); g.add(lv.group); anim.push(lv);
    return { group: g, update(t) { anim.forEach(a => a.update(t)); } };
  }

  function forgeSet(T, W, K, S) {
    const g = new T.Group(); const anim = [];
    g.add(S.cobble({ p: [0, 0, 0], s: [16, 14], seed: 21, base: '#6b5a4a' }));
    g.add(W.box({ p: [0, 2.6, -4.2], s: [14, 5.2, 0.5], color: '#7a6450' }));
    g.add(W.box({ p: [-6.4, 2.6, 0], s: [0.5, 5.2, 9], color: '#6f5a48' }));
    const fire = forgeFire(T, W, K, [0, 0, -1.6]); g.add(fire.group); anim.push(fire);
    const em = S.embers({ p: [0, 1.2, -1.6], n: 16, spread: 0.6, rise: 3.0, speed: 0.55 }); g.add(em.group); anim.push(em);
    const sm = S.smoke({ p: [0, 2.2, -1.6], n: 6, rise: 2.6, o: 0.22 }); g.add(sm.group); anim.push(sm);
    g.add(anvil(T, W, K, [2.4, 0, 0.4]));
    const twl = S.toolWall({ p: [-2.6, 3.0, -3.9], w: 3.0 }); g.add(twl.group); anim.push(twl);
    g.add(S.clutter({ p: [3.6, 0, -3.6], w: 2.6, seed: 13 }));
    g.add(K.barrel({ p: [-4.2, 0, 1.6] })); g.add(K.crate({ p: [-4.6, 0, 2.6], s: 0.7 }));
    g.add(S.bucket({ p: [1.5, 0, 1.8], s: 1.1 })); g.add(S.ropeCoil({ p: [-1.8, 0, 2.2], r: 0.28 }));
    const sg = S.sign({ p: [-3.0, 3.9, -3.8], text: 'GUILD OF FOUNDERS', w: 2.6, h: 0.6, bg: '#2a1c12', fg: '#f0c88a', swing: 0.02, seed: 5 });
    g.add(sg.group); anim.push(sg);
    g.add(S.poster({ p: [2.0, 3.2, -3.94], title: 'CROWN', body: 'TUNING NOTES', w: 0.62, h: 0.86, seed: 17 }));
    const shaft = S.lightShaft({ p: [-3.4, 2.8, 1.2], rot: [0, 0.4, 0.3], w: 1.6, h: 5.0, o: 0.18, color: 'rgba(255,210,150,1)' });
    g.add(shaft.group); anim.push(shaft);
    const motes = K.dustMotes({ bounds: [-5, 5, 0.3, 4.4, -3, 3], n: 30, color: 'rgba(255,220,170,1)' }); g.add(motes.group); anim.push(motes);
    // Enclose the forge: sky, a right wall with a doorway to the yard, and roof rafters
    // with a smoke vent over the fire, so rising shots find architecture instead of void.
    g.add(K.skyDome({ top: '#6f9ec8', mid: '#e0d2b4', bottom: '#ffd9a0' }));
    g.add(W.box({ p: [6.4, 2.6, -2.6], s: [0.5, 5.2, 3.2], color: '#6f5a48' }));
    g.add(W.box({ p: [6.4, 2.6, 3.0], s: [0.5, 5.2, 2.4], color: '#6f5a48' }));
    g.add(W.box({ p: [6.4, 4.7, 0.6], s: [0.5, 1.0, 2.4], color: '#6f5a48' }));   // door lintel
    g.add(W.box({ p: [12, 0.02, 1.0], s: [12, 0.3, 12], color: '#8a7c60', ink: 0 }));  // yard beyond
    for (let i = 0; i < 6; i++) g.add(W.box({ p: [-5.4 + i * 2.2, 5.3, -0.6], s: [0.28, 0.34, 8.6], color: '#5a4636' }));
    g.add(W.box({ p: [0, 5.5, -3.0], s: [13.4, 0.24, 3.4], color: '#4e3c2e' }));  // roof, vent left open over fire
    g.add(W.box({ p: [0, 5.5, 3.0], s: [13.4, 0.24, 2.6], color: '#4e3c2e' }));
    return { group: g, fire, update(t) { anim.forEach(a => a.update(t)); } };
  }

  function forgeFire(T, W, K, p) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.box({ p: [0, 0.45, 0], s: [1.9, 0.9, 1.4], color: '#6b5a4a' }));
    g.add(W.box({ p: [0, 0.95, 0], s: [1.6, 0.16, 1.15], color: '#2a1a12' }));
    const coals = [];
    for (let i = 0; i < 9; i++) { const b = W.ball({ p: [-0.6 + (i % 3) * 0.6, 1.04, -0.3 + Math.floor(i / 3) * 0.3], r: 0.14, color: '#ff6a1e', ink: 0 }); g.add(b); coals.push(b); }
    const gl = K.glow({ p: [0, 1.3, 0], r: 2.1, color: 'rgba(255,150,50,1)', o: 0.32 }); g.add(gl);
    const pl = new T.PointLight(0xff8a30, 1.5, 10, 2); pl.position.set(0, 1.4, 0); g.add(pl);
    return { group: g, update(t) { coals.forEach((c, i) => { const k = 0.7 + 0.3 * Math.sin(t * 5 + i * 1.7); c.children[0].material.color.setRGB(1, 0.35 * k, 0.08 * k); }); gl.material.opacity = 0.26 + 0.09 * Math.sin(t * 4.2); pl.intensity = 1.3 + 0.35 * Math.sin(t * 6.1); } };
  }
  function anvil(T, W, K, p) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.box({ p: [0, 0.3, 0], s: [0.7, 0.6, 0.5], color: '#5a4636' }));
    g.add(W.box({ p: [0, 0.72, 0], s: [1.5, 0.26, 0.6], color: '#4a4a52', ink: 0.03 }));
    g.add(W.cone({ p: [0.78, 0.72, 0], r: 0.19, h: 0.45, color: '#3e3e46', seg: 10, rot: [0, 0, -Math.PI / 2] }));
    return g;
  }
  function crowd(T, W, K, A, positions, base = {}) {
    return positions.map(([x, z, s], i) => A.Actor({ p: [x, 0, z], h: 2.3 * (s || 1),
      look: Object.assign({ skin: ['#e8b88a', '#d9a878', '#c98f62'][i % 3], body: ['#8e44ad', '#2980b9', '#c0392b', '#16a085', '#d35400', '#5b5f7a'][i % 6], outfit: i % 3 === 0 ? 'blazer' : 'shirt', hair: i % 2 ? 'short' : 'bob', hairColor: '#2a1a12', shoe: '#33415c' }, base) }));
  }
  function addActors(sc, list) { list.forEach(a => { sc.add(a.group); sc.add(a.shadow); }); }
  // Sound made visible: rings that expand from the bell ONLY when it rings.
  function soundRings(T, { p = [0, 0, 0], n = 6, color = 0xffe196 } = {}) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const rings = [];
    for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.RingGeometry(0.9, 1.06, 48), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); m.rotation.x = Math.PI / 2; g.add(m); rings.push(m); }
    return { group: g, burst(t, t0, strength = 1) { rings.forEach((m, i) => { const dt = t - t0 - i * 0.16; if (dt < 0 || dt > 2.6) { m.material.opacity = 0; return; } const u = dt / 2.6; m.scale.setScalar(0.4 + u * 9 * strength); m.material.opacity = (1 - u) * 0.5 * strength; }); } };
  }
  // A foreground object placed near the lens for parallax / wipes.
  function foreground(T, W, K, S, kind, p) {
    if (kind === 'post') return W.box({ p, s: [0.3, 6, 0.3], color: '#6b4a30', ink: 0.04 });
    if (kind === 'arch') return W.box({ p, s: [0.7, 7, 0.7], color: '#b3a68d', ink: 0.04 });
    if (kind === 'rope') return W.cyl({ p, rt: 0.06, h: 7, color: '#c2a068', ink: 0.02 });
    return K.barrel({ p, s: 1.2 });
  }

  function hammerProp(T, W) {
    const g = new T.Group();
    g.add(W.cyl({ p: [0, 0, 0], rt: 0.022, h: 0.26, color: '#8a6a44', ink: 0.01 }));
    g.add(W.box({ p: [0, 0.15, 0], s: [0.13, 0.075, 0.075], color: '#4a4a52', ink: 0.02 }));
    return g;
  }

  /* ============================ SCENES ============================ */
  const scenes = [];

  // ---- 1. towerDawn: open ON the silent bell, then reveal what owns the silence ----
  scenes.push({ name: 'towerDawn', start: 0.0, dur: 6.6, trans: { type: 'fadein', dur: 0.7 }, beats: ['b01'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'dawn');
      sc.add(K.skyDome({ top: '#6fb0e0', mid: '#bcdcf0', bottom: '#f6e2be' }));
      const val = valleyFloor(T, W, K, S, { seed: 2 }); sc.add(val.group); anim.push(val);
      const tw = tower2(T, W, K, S, { p: [0, 0, -8], h: 16 }); sc.add(tw.group); anim.push(tw);
      const bl = bell2(T, W, K, S, { p: [0, 13.6, -5.6], s: 1.0 }); sc.add(bl.group);
      const cw = crowd(T, W, K, A, [[-2.6, 4.4, 1], [1.9, 5.2, 0.95], [-0.4, 6.2, 1.05], [3.6, 4.0, 0.9]], {});
      addActors(sc, cw);
      sc.add(foreground(T, W, K, S, 'arch', [-3.2, 3.0, 2.4]));   // parallax near the lens
      const M = C().moves;
      const comps = [
        M.macro([0, 12.50, -5.30], { d: 1.50, az: 0.18, h: 0.10, fov: 58, dur: 1.5, focus: 1.6, why: 'open on the bell that never sounded' }),
        M.pull([0, 12.4, -5.6], { d0: 1.6, d1: 14.0, h0: 0.2, h1: 3.0, fov0: 70, fov1: 56, az: 0.1, dur: 1.9, focus: 12.0, why: 'the silence belongs to this tower' }),
        M.low([0, 7.0, -8], { d: 15.0, h: -4.0, fov: 74, dur: 1.7, why: 'the tower looms as the obstacle', rise: 1.2, focus: 18.0 }),
        M.bird([0, 3.0, -4], { d: 17, h: 12, az: 0.3, fov: 64, dur: 1.5, focus: 16.0, why: 'Vellara: a whole valley that waited' }),
      ];
      const dir = C().Director({ comps, impacts: [], handheld: 0.006 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        bl.swing(Math.sin(t * 0.5) * 0.006);   // almost still: it has never rung
        cw.forEach((a, i) => a.update(dir.cam, t, Object.assign(A.idle(t + i), { mood: i % 2 ? 'think' : 'deadpan', lookX: -0.2, lookY: 0.5, brow: -0.1, blinkSeed: i * 0.8 })));
      } };
    } });

  // ---- 2. forge: skilled people, not fools ----
  scenes.push({ name: 'forge', start: 6.6, dur: 2.9, trans: { type: 'dissolve', dur: 0.32 }, beats: ['b02'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'forge');
      const fs = forgeSet(T, W, K, S); sc.add(fs.group); anim.push(fs);
      const f1 = A.Actor({ p: [1.9, 0, 0.2], h: 2.5, look: FOUNDER });
      const f2 = A.Actor({ p: [-1.5, 0, -0.4], h: 2.45, look: Object.assign({}, FOUNDER, { body: '#6b4a2a' }) });
      const f3 = A.Actor({ p: [3.4, 0, -1.4], h: 2.4, look: ELDER });
      addActors(sc, [f1, f2, f3]);
      const bl = bell2(T, W, K, S, { p: [-2.6, 2.6, -0.5], s: 0.8 }); sc.add(bl.group);
      sc.add(W.box({ p: [-2.6, 0.6, -0.5], s: [1.0, 1.2, 1.0], color: '#6b5a4a' }));
      sc.add(foreground(T, W, K, S, 'post', [2.9, 3.0, 2.2]));
      const M = C().moves;
      const comps = [
        M.push([0.4, 1.5, 0.0], { d0: 5.8, d1: 5.2, az: 0.10, h0: 1.6, h1: 1.4, fov0: 68, fov1: 66, dur: 1.5, focus: 2.6, why: 'every founder in the valley tried', kind: 'medium' }),
        M.dutch([1.9, faceY(2.5), 0.2], { d: 1.75, az: -0.22, fov: 50, roll: 0.10, dur: 1.4, why: 'they were skilled, not careless' }),
      ];
      const dir = C().Director({ comps, handheld: 0.008 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        f1.update(dir.cam, t, Object.assign(A.G.hammer(t), { brow: -0.4, blinkSeed: 0.3 }));
        f2.update(dir.cam, t, Object.assign(A.G.workWheel(t), { mood: 'stern', brow: -0.3, blinkSeed: 1.1 }));
        f3.update(dir.cam, t, Object.assign(A.idle(t), { mood: 'think', arms: 'chin', lookX: 0.3, blinkSeed: 2.0 }));
      } };
    } });

  // ---- 3. craftMontage: three literal verbs, three compositions ----
  scenes.push({ name: 'craftMontage', start: 9.5, dur: 5.2, trans: { type: 'wipe', dur: 0.42 }, beats: ['b03'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'forge');
      const fs = forgeSet(T, W, K, S); sc.add(fs.group); anim.push(fs);
      const pr = S.pour({ p: [0.1, 2.5, -1.2], h: 1.4 }); sc.add(pr.group); anim.push(pr);
      const ladle = W.cyl({ p: [0.1, 2.7, -1.2], rt: 0.28, rb: 0.22, h: 0.34, color: '#4a4a52', ink: 0.03, rot: [0, 0, 0.5] }); sc.add(ladle);
      const bl = bell2(T, W, K, S, { p: [-2.6, 2.6, -0.5], s: 0.8 }); sc.add(bl.group);
      sc.add(W.box({ p: [-2.6, 0.6, -0.5], s: [1.0, 1.2, 1.0], color: '#6b5a4a' }));
      const f1 = A.Actor({ p: [-1.6, 0, 0.1], h: 2.5, look: FOUNDER });
      const f2 = A.Actor({ p: [1.4, 0, -0.2], h: 2.45, look: Object.assign({}, FOUNDER, { body: '#7a4a2a' }) });
      addActors(sc, [f1, f2]);
      const hm = hammerProp(T, W); sc.add(hm);
      // the bell being hoisted for "they hung it higher"
      const hoist = bell2(T, W, K, S, { p: [3.2, 2.0, -2.4], s: 0.7 }); sc.add(hoist.group);
      sc.add(S.ropeCoil({ p: [3.2, 0, -2.4], r: 0.26 }));
      sc.add(foreground(T, W, K, S, 'post', [-4.4, 3.0, 2.6]));
      const M = C().moves;
      const comps = [
        M.macro([0.1, 1.75, -1.2], { d: 1.60, az: 0.35, h: 0.20, fov: 60, dur: 1.7, kind: 'medium', focus: 2.2, why: 'they poured bronze — shown literally' }),
        M.push([-2.6, 2.45, -0.5], { d0: 2.3, d1: 1.5, az: -0.35, h0: 0.35, h1: 0.2, fov0: 58, fov1: 50, dur: 1.7, why: 'they tuned the crown', kind: 'close' }),
        M.crane([3.2, 2.4, -2.4], { d: 5.6, az: 0.25, h0: 0.4, h1: 5.4, fov0: 68, fov1: 60, dur: 1.8, why: 'they hung it higher', focus: 5.0 }),
      ];
      const dir = C().Director({ comps, impacts: [{ t: 1.95, amp: 0.035 }, { t: 2.55, amp: 0.03 }], handheld: 0.008 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        pr.setVisible(t < 1.9);
        f2.update(dir.cam, t, Object.assign(A.G.fireKiln(t), { mood: 'stern', brow: -0.35, blinkSeed: 0.6 }));
        // tuning strikes on the crown
        const strike = (t % 0.6) / 0.6;
        f1.update(dir.cam, t, Object.assign(A.G.hammer(t), { brow: -0.45, blinkSeed: 1.4 }));
        hm.position.set(-2.35, 2.75 + (strike < 0.5 ? 0.18 : -0.02), -0.2); hm.rotation.z = strike < 0.5 ? -0.5 : 0.2;
        hoist.group.position.y = 2.0 + smooth(clamp((t - 3.4) / 1.8, 0, 1)) * 2.2;
      } };
    } });

  // ---- 4. silentTower: the town's hope collapsing, then the still clapper ----
  scenes.push({ name: 'silentTower', start: 14.7, dur: 5.1, trans: { type: 'dissolve', dur: 0.34 }, beats: ['b04'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'cold');
      sc.add(K.skyDome({ top: '#7ba6cc', mid: '#c3d6e6', bottom: '#dfe4e2' }));
      const val = valleyFloor(T, W, K, S, { seed: 8 }); sc.add(val.group); anim.push(val);
      const tw = tower2(T, W, K, S, { p: [0, 0, -8], h: 16 }); sc.add(tw.group); anim.push(tw);
      const bl = bell2(T, W, K, S, { p: [0, 13.6, -5.6] }); sc.add(bl.group);
      const cw = crowd(T, W, K, A, [[-2.8, 3.6, 1], [-1.2, 4.6, 0.95], [0.6, 3.9, 1.05], [2.4, 4.8, 0.9], [3.8, 3.4, 1], [-4.2, 5.4, 0.92]], {});
      addActors(sc, cw);
      sc.add(foreground(T, W, K, S, 'arch', [3.4, 3.0, 2.0]));
      const M = C().moves;
      const comps = [
        M.pull([0, 4.0, -2], { d0: 12.0, d1: 15.5, az: 0.12, h0: 2.2, h1: 2.8, fov0: 62, fov1: 60, dur: 1.8, focus: 17.0, why: 'every time, the whole town waited' }),
        M.push([-1.2, faceY(2.3 * 0.95), 4.6], { d0: 2.9, d1: 2.2, az: -0.15, h0: 0.16, h1: 0.06, fov0: 52, fov1: 50, dur: 1.7, focus: 1.5, why: 'hope turning into disappointment', kind: 'close' }),
        M.macro([0, 12.50, -5.30], { d: 1.45, az: -0.2, h: 0.08, fov: 58, dur: 1.6, focus: 1.6, why: 'the clapper never moved: the tower stayed silent' }),
      ];
      const dir = C().Director({ comps, handheld: 0.005 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        // faces fall as the line lands: think -> worry -> deadpan
        const mood = t < 1.9 ? 'think' : t < 3.6 ? 'worry' : 'deadpan';
        cw.forEach((a, i) => a.update(dir.cam, t, Object.assign(A.idle(t + i * 0.7), { mood, arms: i % 3 === 0 ? 'chest' : 'down', lookY: 0.6, brow: t < 1.9 ? 0.2 : -0.25, blinkSeed: i * 0.7, tilt: Math.sin(t * 0.6 + i) * 0.02 })));
      } };
    } });

  // ---- 5. stairs: the hammer, the climb, the effort, the resolve ----
  scenes.push({ name: 'stairs', start: 19.8, dur: 6.3, trans: { type: 'wipe', dur: 0.42 }, beats: ['b05'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'stair');
      const st = stairwell(T, W, K, S, { n: 18 }); sc.add(st.group); anim.push(st);
      const nora = A.Actor({ p: [0, 0, 0], h: 2.4, look: NORA }); addActors(sc, [nora]);
      const hm = hammerProp(T, W); sc.add(hm);
      const keys = [{ t: 0, i: 2 }, { t: 6.3, i: 15 }];
      const noraAt = (t) => { const u = smooth(clamp(t / 6.3, 0, 1)); const idx = lerp(2, 15, u); const p = st.at(idx); return [p[0], p[1] + 0.02, p[2]]; };
      const M = C().moves;
      const comps = [
        M.macro([0, 1.2, 0], { d: 0.72, az: 0.5, h: 0.1, fov: 62, dur: 1.5, focus: 0.45, why: 'a hammer no bigger than her hand' }),
        M.track((t) => { const p = noraAt(t); return [p[0], p[1] + 1.2, p[2]]; }, { d: 3.4, az: 0.85, h: 0.5, fov: 60, dur: 1.8, why: 'she climbs', kind: 'medium' }),
        M.low([0, 3.4, -5.0], { d: 9.5, az: 0.1, h: -1.8, fov: 76, dur: 1.6, why: 'the stairwell is long and she is small', kind: 'wide', rise: 0.8, focus: 8.5 }),
        M.dutch([0, 5.0, -6.6], { d: 1.8, az: 0.3, h: 0.15, fov: 50, roll: 0.11, dur: 1.4, why: 'resolve on her face' }),
      ];
      const dir = C().Director({ comps, handheld: 0.010 });
      return { sc, cam: dir.cam, dir, update(t) {
        const p = noraAt(t);
        // aim BEFORE the camera reads it
        comps[0].sub = [p[0] + 0.34, p[1] + 1.05, p[2] + 0.16];
        comps[3].sub = [p[0], p[1] + faceY(2.4), p[2]];
        dir.at(t, { globalT: t }); anim.forEach(a => a.update(t));
        nora.setPos(p[0], p[2]); nora.group.position.y = p[1] + nora.h * 0.483;
        nora.shadow.position.set(p[0], p[1] + 0.02, p[2]);
        const climb = A.G.climb(t);
        nora.update(dir.cam, t, Object.assign(climb, { mood: t > 4.9 ? 'stern' : 'deadpan', walk: t * 5.2, speed: 0.7, brow: -0.3, blinkSeed: 0.4, flip: false }));
        hm.position.set(p[0] + 0.34, p[1] + 1.05 + Math.sin(t * 3.4) * 0.05, p[2] + 0.16); hm.rotation.z = 0.3 + Math.sin(t * 3.4) * 0.15;
      } };
    } });

  // ---- 6. notTouching: the subversion — her attention is on the WALL ----
  scenes.push({ name: 'notTouching', start: 26.1, dur: 2.9, trans: { type: 'dissolve', dur: 0.32 }, beats: ['b06'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'belfry');
      const bf = belfry(T, W, K, S, { seed: 3 }); sc.add(bf.group); anim.push(bf);
      const bl = bell2(T, W, K, S, { p: [0, 3.6, 0] }); sc.add(bl.group);
      const nora = A.Actor({ p: [1.05, 0, 0.7], h: 2.4, look: NORA }); addActors(sc, [nora]);
      const hm = hammerProp(T, W); sc.add(hm);
      sc.add(foreground(T, W, K, S, 'rope', [-1.1, 3.0, 1.9]));
      const M = C().moves;
      const comps = [
        M.macro([0.78, 2.15, 0.50], { d: 1.15, az: 0.55, h: 0.12, fov: 60, dur: 1.5, focus: 1.2, why: 'her hand passes the bell without touching it' }),
        M.orbit([1.5, 1.5, 0.5], { d: 2.7, az0: -0.75, az1: 0.45, h0: 1.2, h1: 1.5, fov: 56, dur: 1.4, why: 'she is facing the wall, not the bell', kind: 'medium' }),
      ];
      const dir = C().Director({ comps, handheld: 0.006 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        bl.swing(Math.sin(t * 0.6) * 0.008);
        // hand rises past the bell, then turns toward the wall
        const reach = smooth(clamp(t / 1.4, 0, 1));
        nora.update(dir.cam, t, { mood: 'think', arms: 'hold', hunch: 0.12, armR: [0.16 + reach * 0.16, 0.52 + reach * 0.16], armRK: 0.95, armL: [-0.12, 0.44], armLK: 0.9, lookX: 0.45 + reach * 0.15, brow: 0.15, tilt: 0.03, blinkSeed: 0.4, squash: Math.sin(t * 1.1) * 0.006 });
        hm.position.set(1.05 + 0.3 + reach * 0.2, 1.3 + reach * 0.35, 0.7 + 0.1); hm.rotation.z = 0.4;
      } };
    } });

  // ---- 7. tapping: two strikes, anchored to the actual words ----
  scenes.push({ name: 'tapping', start: 29.0, dur: 7.2, trans: { type: 'dissolve', dur: 0.34 }, beats: ['b07'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'belfry');
      const bf = belfry(T, W, K, S, { seed: 3 }); sc.add(bf.group); anim.push(bf);
      const bl = bell2(T, W, K, S, { p: [0, 3.6, 0] }); sc.add(bl.group);
      const nora = A.Actor({ p: [1.55, 0, 0.6], h: 2.4, look: NORA }); addActors(sc, [nora]);
      const hm = hammerProp(T, W); sc.add(hm);
      // dust knocked out of the wall by each tap
      const chips = S.embers({ p: [2.3, 1.62, 0.5], n: 8, spread: 0.16, rise: -0.7, color: 'rgba(210,200,180,1)', speed: 1.4 });
      sc.add(chips.group); chips.group.visible = false;
      sc.add(foreground(T, W, K, S, 'rope', [-0.9, 3.0, 2.0]));
      const TAP1 = 2.972, TAP2 = 4.192, ANSWER = 5.892;
      const M = C().moves;
      const comps = [
        M.push([1.75, faceY(2.4), 0.6], { d0: 2.6, d1: 1.9, az: -0.5, h0: 0.25, h1: 0.12, fov0: 56, fov1: 50, dur: 1.6, why: 'she raises the hammer', kind: 'close' }),
        M.macro([2.20, 1.62, 0.60], { d: 1.9, az: -0.70, h: 0.14, fov: 60, dur: 1.9, focus: 1.4, why: 'once — the first tap on stone' }),
        M.push([1.98, 1.60, 0.60], { d0: 2.8, d1: 2.3, az: -0.80, h0: 0.34, h1: 0.18, fov0: 60, fov1: 56, focus: 1.9, dur: 1.9, why: 'twice — she compares the two answers', kind: 'close' }),
        M.dutch([1.62, faceY(2.4), 0.62], { d: 1.55, az: -0.3, h: 0.06, fov: 48, roll: 0.13, dur: 1.8, focus: 1.15, why: 'listening: her ear to the stone' }),
      ];
      const dir = C().Director({ comps, impacts: [{ t: TAP1, amp: 0.055, decay: 11 }, { t: TAP2, amp: 0.05, decay: 11 }], handheld: 0.006 });
      const lip = ctx.lip;
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        const near = (a) => Math.abs(t - a) < 0.14;
        chips.group.visible = near(TAP1) || near(TAP2); if (chips.group.visible) chips.update(t);
        let pose;
        if (t < 2.6) pose = Object.assign(A.G.tapWall(t), { mood: 'think', brow: -0.2 });
        else if (t < 5.3) {
          const ph = t < TAP1 ? (t - 2.6) / (TAP1 - 2.6) : (t - TAP1) / (TAP2 - TAP1);
          const strike = near(TAP1) || near(TAP2);
          pose = { mood: 'stern', arms: 'point', hunch: 0.2, armR: [strike ? 0.5 : 0.24, strike ? 0.52 : 0.66], armRK: 1, lookX: 0.55, brow: -0.4, tilt: strike ? 0.05 : -0.03, squash: strike ? -0.02 : 0 };
        } else pose = Object.assign(A.G.listen(t), { mood: 'think', brow: 0.1 });
        const g = lip && t > ANSWER ? lip.gasp(t, ANSWER, 0.55) : null;
        if (g) Object.assign(pose, g, { mood: 'shock' });
        pose.blinkSeed = 0.4;
        nora.update(dir.cam, t, pose);
        const swing = near(TAP1) || near(TAP2) ? 0.5 : 0.16;
        hm.position.set(t > 5.3 ? 1.30 : 2.05, t > 5.3 ? 0.95 : 1.6 + (t < 2.6 ? 0.28 : 0.02), t > 5.3 ? 0.78 : 0.62); hm.rotation.z = t > 5.3 ? 0.05 : swing;
        bl.swing(Math.sin(t * 0.7) * 0.006);
      } };
    } });

  // ---- 8. heldBreath: the town freezes ----
  scenes.push({ name: 'heldBreath', start: 36.2, dur: 3.8, trans: { type: 'dip', dur: 0.4 }, beats: ['b08'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'held');
      sc.add(K.skyDome({ top: '#7f9dc0', mid: '#b9c8d8', bottom: '#d8dcd8' }));
      const val = valleyFloor(T, W, K, S, { seed: 14, signs: true }); sc.add(val.group); anim.push(val);
      const tw = tower2(T, W, K, S, { p: [0, 0, -8], h: 16 }); sc.add(tw.group); anim.push(tw);
      const cw = crowd(T, W, K, A, [[-2.4, 3.4, 1], [-0.9, 3.9, 1.02], [0.8, 3.5, 0.98], [2.3, 4.1, 1], [-3.7, 4.6, 0.94], [3.6, 4.8, 0.96], [0.1, 5.4, 1.04]], {});
      addActors(sc, cw);
      sc.add(foreground(T, W, K, S, 'post', [-2.6, 3.0, 2.2]));
      const M = C().moves;
      const comps = [
        M.push([0, 2.4, 4.0], { d0: 10.0, d1: 8.2, az: 0.1, h0: 2.6, h1: 2.1, fov0: 62, fov1: 60, dur: 1.9, focus: 7.0, why: 'the whole town held its breath', kind: 'wide' }),
        M.push([-0.9, faceY(2.3 * 1.02), 3.9], { d0: 2.6, d1: 1.85, az: -0.12, h0: 0.16, h1: 0.06, fov0: 52, fov1: 46, dur: 1.9, why: 'three faces, nobody moving', kind: 'close' }),
      ];
      const dir = C().Director({ comps, handheld: 0.003, rollDrift: 0.006 });
      const lip = ctx.lip;
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        cw.forEach((a, i) => {
          const hb = lip ? lip.heldBreath(t, 0, 3.8) : { talk: 0.06, mouthShape: 'closed', brow: -0.3 };
          a.update(dir.cam, t, Object.assign({}, hb, { mood: 'nervous', arms: i % 3 === 0 ? 'chest' : 'down', hunch: 0.08, nerv: 0.12, lookY: 0.55, lookX: 0, blinkSeed: i * 0.9, tilt: 0, squash: 0.003 * Math.sin(t * 8 + i) }));
        });
      } };
    } });

  // ---- 9. bellFine: the bell is innocent ----
  scenes.push({ name: 'bellFine', start: 40.0, dur: 3.0, trans: { type: 'bloom', dur: 0.4 }, beats: ['b09'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'reveal');
      const bf = belfry(T, W, K, S, { seed: 3 }); sc.add(bf.group); anim.push(bf);
      const bl = bell2(T, W, K, S, { p: [0, 3.6, 0] }); sc.add(bl.group);
      const glint = K.glow({ p: [0.3, 2.9, 0.6], r: 0.5, color: 'rgba(255,240,190,1)', o: 0.0 }); sc.add(glint);
      const nora = A.Actor({ p: [1.7, 0, 0.8], h: 2.4, look: NORA }); addActors(sc, [nora]);
      const M = C().moves;
      const comps = [
        M.macro([0.1, 2.88, 0.50], { d: 1.00, az: 0.35, h: 0.05, fov: 58, dur: 1.5, focus: 1.0, why: 'the bell was never broken: no crack, clean cast' }),
        M.orbit([0, 2.9, 0], { d: 2.5, az0: -0.85, az1: 0.55, h0: 0.5, h1: 0.9, fov: 56, dur: 1.5, why: 'all the way round it, still flawless', kind: 'medium' }),
      ];
      const dir = C().Director({ comps, handheld: 0.005 });
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        bl.swing(Math.sin(t * 0.8) * 0.01);
        glint.material.opacity = 0.35 * Math.max(0, Math.sin(t * 2.2));
        glint.position.set(Math.sin(t * 1.2) * 0.4, 2.9 + Math.cos(t * 1.1) * 0.25, 0.62);
        nora.update(dir.cam, t, { mood: 'think', arms: 'chin', lookX: -0.4, brow: 0.2, hunch: 0.06, blinkSeed: 0.4, tilt: 0.02 });
      } };
    } });

  // ---- 10. stoneTruth: the twist, then a physical explanation inside the wall ----
  scenes.push({ name: 'stoneTruth', start: 43.0, dur: 9.6, trans: { type: 'dissolve', dur: 0.4 }, beats: ['b10', 'b11'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'reveal');
      const bf = belfry(T, W, K, S, { seed: 3, cutaway: true }); sc.add(bf.group); anim.push(bf);
      const bl = bell2(T, W, K, S, { p: [0, 3.6, 0] }); sc.add(bl.group);
      const nora = A.Actor({ p: [1.6, 0, 0.7], h: 2.4, look: NORA }); addActors(sc, [nora]);
      sc.add(foreground(T, W, K, S, 'arch', [-2.2, 3.0, 2.4]));
      const TWIST = 0.782;
      const M = C().moves;
      const comps = [
        M.dutch([1.62, faceY(2.4), 0.7], { d: 1.7, az: -0.25, h: 0.06, fov: 48, roll: 0.15, dur: 1.8, why: 'The tower was. — the twist lands on her face' }),
        M.macro([2.36, 2.05, -0.48], { d: 1.80, az: -1.25, h: 0.06, fov: 58, dur: 1.9, focus: 1.5, why: 'the hairline seam in the stone' }),
        M.push([2.36, 2.0, 0.0], { d0: 5.2, d1: 4.0, az: -1.0, h0: 0.6, h1: 0.2, fov0: 62, fov1: 58, dur: 2.1, why: 'go inside the stone to see the mechanism', kind: 'close', focus: 2.8 }),
        M.orbit([2.36, 2.0, 0.0], { d: 3.8, az0: -1.30, az1: -0.60, h0: 0.4, h1: 0.8, fov: 60, focus: 2.8, dur: 1.9, why: 'every note dies in the voids', kind: 'medium' }),
        M.pull([1.2, 2.4, 0.2], { d0: 2.4, d1: 7.2, az: -0.5, h0: 0.4, h1: 1.9, fov0: 62, fov1: 58, dur: 1.9, focus: 6.5, why: 'sixty years of swallowed notes belong to this wall' }),
      ];
      const dir = C().Director({ comps, impacts: [{ t: TWIST, amp: 0.03, decay: 7 }], handheld: 0.006 });
      const lip = ctx.lip;
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        if (bf.cut) { bf.cut.show(t > 3.5 && t < 7.9); bf.cut.update(t); }
        // the wall fades back so the cutaway reads
        bf.wall.visible = !(t > 3.7 && t < 7.7);
        const g = lip ? lip.gasp(t, TWIST, 0.6) : null;
        const pose = { mood: t < TWIST ? 'think' : t < 2.0 ? 'shock' : 'smug', arms: t < 2.0 ? 'head' : 'point', armR: t > 2.0 ? [0.42, 0.55] : undefined, armRK: 1, lookX: 0.5, hunch: 0.08, blinkSeed: 0.4, tilt: t < TWIST ? 0.02 : -0.04 };
        if (g) Object.assign(pose, g, { mood: 'shock' });
        nora.update(dir.cam, t, pose);
        bl.swing(Math.sin(t * 0.7) * 0.008);
      } };
    } });

  // ---- 11. movingBell: four feet to the left ----
  scenes.push({ name: 'movingBell', start: 52.6, dur: 4.1, trans: { type: 'wipe', dur: 0.4 }, beats: ['b12'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'reveal');
      const bf = belfry(T, W, K, S, { seed: 3 }); sc.add(bf.group); anim.push(bf);
      const bl = bell2(T, W, K, S, { p: [0, 3.6, 0] }); sc.add(bl.group);
      const nora = A.Actor({ p: [-1.5, 0, 1.1], h: 2.4, look: NORA }); addActors(sc, [nora]);
      const helper = A.Actor({ p: [-2.6, 0, -0.4], h: 2.45, look: FOUNDER }); addActors(sc, [helper]);
      const SEATS = 2.356;
      const bellX = (t) => -smooth(clamp((t - 0.5) / 1.9, 0, 1)) * 1.22;   // four feet ~ 1.22 m
      sc.add(foreground(T, W, K, S, 'rope', [1.6, 3.0, 2.1]));
      const M = C().moves;
      const comps = [
        M.track((t) => [bellX(t), 2.9, 0], { d: 3.0, az: 0.55, h: 0.6, fov: 58, dur: 1.5, why: 'she moves the bell', kind: 'medium' }),
        M.macro([0.0, 4.3, 0.0], { d: 1.20, az: 0.4, h: 0.1, fov: 60, dur: 1.3, focus: 1.0, why: 'the rope takes the weight' }),
        M.pull([-0.6, 2.6, 0.2], { d0: 2.6, d1: 6.2, az: 0.2, h0: 0.5, h1: 1.7, fov0: 62, fov1: 58, dur: 1.3, focus: 4.4, why: 'four feet to the left, and it seats' }),
      ];
      const dir = C().Director({ comps, impacts: [{ t: SEATS, amp: 0.06, decay: 10 }], handheld: 0.007 });
      return { sc, cam: dir.cam, dir, update(t) {
        const x = bellX(t);
        comps[1].sub = [x, 4.3, 0];
        dir.at(t, { globalT: t }); anim.forEach(a => a.update(t));
        bl.group.position.x = x; bl.swing(Math.sin(t * 2.4) * 0.03 * (t < SEATS ? 1 : 0.3));
        nora.update(dir.cam, t, Object.assign(A.G.pullRope(t), { mood: 'stern', brow: -0.45, blinkSeed: 0.4 }));
        helper.update(dir.cam, t, Object.assign(A.G.pullRope(t + 0.3), { mood: 'stern', brow: -0.4, blinkSeed: 1.2 }));
        nora.setPos(-1.5 - smooth(clamp(t / 2.2, 0, 1)) * 0.5, 1.1);
      } };
    } });

  // ---- 12. theRing: strike, reveal, three villages, joy, and the girl they listened to ----
  scenes.push({ name: 'theRing', start: 56.7, dur: 9.3, trans: { type: 'bloom', dur: 0.5 }, beats: ['b13', 'b14'],
    build(ctx) {
      const { THREE: T, W, K, A, S, C } = ctx; const sc = new T.Scene(); const anim = [];
      lightArc(T, sc, 'ring');
      sc.add(K.skyDome({ top: '#79b4e4', mid: '#cfe4f2', bottom: '#ffe9c0' }));
      const val = valleyFloor(T, W, K, S, { seed: 2 }); sc.add(val.group); anim.push(val);
      const tw = tower2(T, W, K, S, { p: [0, 0, -8], h: 16 }); sc.add(tw.group); anim.push(tw);
      const bl = bell2(T, W, K, S, { p: [-1.22, 13.6, -5.6] }); sc.add(bl.group);
      const rings = soundRings(T, { p: [-1.22, 12.6, -5.6], n: 7 }); sc.add(rings.group);
      const flash = K.glow({ p: [-1.22, 12.6, -5.4], r: 3.2, color: 'rgba(255,236,180,1)', o: 0 }); sc.add(flash);
      // three villages that HEAR it: windows light in sequence
      const villages = [[-15, 0, -20], [13, 0, -24], [-1, 0, -33]].map(([x, y, z], i) => {
        const g = new T.Group(); g.position.set(x, 0, z);
        for (let k = 0; k < 4; k++) g.add(S.facade({ p: [(k - 1.5) * 3.4, 0, (k % 2) * 2.2], w: 2.8, h: 3.4, d: 2.4, seed: 40 + i * 5 + k, lit: 0.0, rotY: (k % 2) * 0.3 }));
        const gl = K.glow({ p: [0, 2.2, 1.4], r: 4.0, color: 'rgba(255,214,140,1)', o: 0 }); g.add(gl);
        return { group: g, glow: gl };
      });
      villages.forEach(v => sc.add(v.group));
      const cw = crowd(T, W, K, A, [[-2.6, 3.6, 1], [-1.0, 4.2, 1.02], [2.1, 3.9, 0.98], [2.5, 4.4, 1], [-4.0, 5.0, 0.94], [3.8, 5.2, 0.96], [0.2, 5.8, 1.04], [-1.9, 6.4, 0.92]], {});
      addActors(sc, cw);
      const nora = A.Actor({ p: [0.75, 0, 3.0], h: 2.42, look: NORA }); addActors(sc, [nora]);
      sc.add(foreground(T, W, K, S, 'arch', [-3.0, 3.0, 2.0]));
      const R1 = 0.966, R2 = 3.166, CHEER = 2.146;
      const M = C().moves;
      const comps = [
        M.macro([-1.22, 12.50, -5.30], { d: 1.50, az: 0.3, h: 0.08, fov: 60, dur: 1.7, focus: 1.6, why: 'the clapper strikes — the first sound in sixty years' }),
        M.pull([-1.22, 12.6, -5.6], { d0: 1.6, d1: 16.0, az: 0.15, h0: 0.2, h1: 3.4, fov0: 70, fov1: 58, dur: 1.9, focus: 16.0, why: 'the sound leaves the tower' }),
        M.track((t) => { const u = clamp((t - 3.6) / 2.1, 0, 1); return [lerp(-15, 13, u), 3.2, lerp(-20, -25, u)]; }, { d: 11, az: 0.15, h: 6.5, fov: 66, dur: 2.1, why: 'they heard it in three villages', kind: 'wide', focus: 9.0 }),
        M.push([-1.0, faceY(2.3 * 1.02), 4.2], { d0: 3.4, d1: 2.2, az: -0.1, h0: 0.2, h1: 0.08, fov0: 54, fov1: 48, dur: 1.8, why: 'the town that mocked her, cheering', kind: 'close' }),
        M.push([0.75, faceY(2.42), 3.0], { d0: 2.8, d1: 1.95, az: 0.22, h0: 0.16, h1: 0.05, fov0: 54, fov1: 50, dur: 1.8, focus: 1.05, why: 'the girl they ignored became the one they listened to', kind: 'close' }),
      ];
      const dir = C().Director({ comps, impacts: [{ t: R1, amp: 0.085, decay: 7 }, { t: R2, amp: 0.06, decay: 8 }], handheld: 0.007 });
      const lip = ctx.lip;
      return { sc, cam: dir.cam, dir, update(t) {
        dir.at(t); anim.forEach(a => a.update(t));
        const dt1 = t - R1;
        const amp = dt1 > 0 ? 0.34 * Math.exp(-dt1 * 0.55) * Math.sin(dt1 * 7.2) : 0;
        bl.swing(amp);
        rings.burst(t, R1, 1.0); if (t > R2) rings.burst(t, R2, 0.8);
        flash.material.opacity = dt1 > 0 ? Math.max(0, 0.55 * Math.exp(-dt1 * 2.2)) : 0;
        flash.scale.setScalar(1 + Math.max(0, dt1) * 1.2);
        villages.forEach((v, i) => { const on = clamp((t - (4.0 + i * 0.42)) / 0.5, 0, 1); v.glow.material.opacity = on * 0.5; });
        cw.forEach((a, i) => {
          const ch = lip && t > CHEER ? lip.cheer(t, CHEER, 3.2, i * 1.1) : null;
          const pose = { mood: t < CHEER ? 'shock' : 'laugh', arms: t < CHEER ? 'head' : (i % 2 ? 'up' : 'chest'), lookY: 0.5, blinkSeed: i * 0.8, squash: t > CHEER ? 0.03 * Math.abs(Math.sin(t * 5 + i)) : 0, tilt: t > CHEER ? Math.sin(t * 4 + i) * 0.05 : 0, air: t > CHEER && i % 3 === 0 ? 0.12 * Math.abs(Math.sin(t * 4 + i)) : 0 };
          if (ch) Object.assign(pose, ch);
          a.update(dir.cam, t, pose);
        });
        nora.update(dir.cam, t, Object.assign(A.G.listened(t), { mood: t > 7.6 ? 'smile' : 'smug', brow: t > 7.6 ? 0.15 : 0.3, blinkSeed: 0.4, lookX: Math.sin(t * 0.4) * 0.15 }));
      } };
    } });

  window.BellFilm2 = {
    scenes, TOTAL, LEAD,
    build(i, ctx) { return scenes[i].build(ctx); },
    // Composition table for the inspector / QA report, without building WebGL scenes.
    spec() { return scenes.map(s => ({ name: s.name, start: s.start, dur: s.dur, trans: s.trans, beats: s.beats })); },
  };
})();
