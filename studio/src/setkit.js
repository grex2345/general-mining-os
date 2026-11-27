// setkit.js — Round 14: set dressing, architecture, signage, living things, atmosphere.
// Browser-side classic script: window.SetKit(THREE, W, K) -> kit
//
// Built against docs/08_SET_QUALITY_CELYXI_STUDY.md, which Round 13 never read:
// real architecture (6-10 parts, trim + mullions), ground never flat, clutter on every
// surface, something alive in every set, haze + light shafts, and typography IN the world.
// Everything here is story-usable: a foundry needs a tool wall, a tower needs a rope and
// a maker's mark, a valley needs birds and washing and a weather vane.
(function () {
  window.SetKit = function (THREE, W, K) {
    const T = THREE, INK = W.INK;
    const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

    /* ================= ARCHITECTURE ================= */
    // A real facade: foundation, textured wall, framed windows with mullions + shutters,
    // panelled door, steps, porch, roof overhang. ~10 parts, not a box.
    function facade({ p = [0, 0, 0], w = 4, h = 5, d = 3, wall = '#d9c3a0', roof = '#8a5a3c',
                      trim = '#6b4a30', win = 2, storeys = 2, seed = 1, lit = 0.5, rotY = 0, shop = false } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = rotY;
      const r = rng(seed);
      g.add(W.box({ p: [0, 0.22, 0], s: [w + 0.3, 0.44, d + 0.3], color: '#9a9284', ink: 0.03 }));   // foundation
      g.add(W.box({ p: [0, h / 2 + 0.4, 0], s: [w, h, d], color: wall }));                          // body
      // plaster / clapboard texture with stains and courses
      g.add(K.canvasPlane({ p: [0, h / 2 + 0.4, d / 2 + 0.02], s: [w, h], px: [Math.round(w * 40), Math.round(h * 40)], transparent: true,
        draw: (c, CW, CH) => {
          c.clearRect(0, 0, CW, CH);
          c.strokeStyle = 'rgba(90,70,50,.18)'; c.lineWidth = 1.5;
          for (let y = 8; y < CH; y += 13) { c.beginPath(); c.moveTo(0, y); c.lineTo(CW, y); c.stroke(); }
          for (let i = 0; i < 26; i++) { const x = r() * CW, y = r() * CH, rr = 3 + r() * 12;
            c.fillStyle = `rgba(110,90,66,${0.05 + r() * 0.09})`; c.beginPath(); c.ellipse(x, y, rr, rr * 0.6, r() * 3, 0, 7); c.fill(); }
          c.fillStyle = 'rgba(70,55,40,.13)'; c.fillRect(0, CH - 16, CW, 16);   // damp course
        } }));
      // windows: frame + mullions + sill + shutters, per storey
      for (let s = 0; s < storeys; s++) {
        const y = 1.5 + s * (h - 1.2) / Math.max(1, storeys);
        for (let i = 0; i < win; i++) {
          const x = -w / 2 + (i + 0.5) * (w / win);
          const on = r() < lit;
          g.add(W.box({ p: [x, y, d / 2 + 0.05], s: [0.86, 1.16, 0.08], color: trim, ink: 0.02 }));      // frame
          g.add(W.box({ p: [x, y, d / 2 + 0.10], s: [0.66, 0.96, 0.04], color: on ? '#ffd98a' : '#2f2a44', ink: 0.02 })); // glass
          g.add(W.box({ p: [x, y, d / 2 + 0.13], s: [0.05, 0.96, 0.03], color: trim, ink: 0 }));        // mullion V
          g.add(W.box({ p: [x, y, d / 2 + 0.13], s: [0.66, 0.05, 0.03], color: trim, ink: 0 }));        // mullion H
          g.add(W.box({ p: [x, y - 0.66, d / 2 + 0.12], s: [1.0, 0.10, 0.20], color: trim, ink: 0.02 })); // sill
          for (const sx of [-1, 1]) g.add(W.box({ p: [x + sx * 0.56, y, d / 2 + 0.09], s: [0.20, 1.10, 0.05], color: '#7d6a4a', ink: 0.02, rot: [0, sx * 0.25, 0] })); // shutters
        }
      }
      // panelled door + steps
      g.add(W.box({ p: [0, 1.05, d / 2 + 0.06], s: [0.92, 1.9, 0.10], color: '#5a3a22', ink: 0.03 }));
      for (const dy of [0.45, 1.35]) g.add(W.box({ p: [0, dy + 0.2, d / 2 + 0.12], s: [0.62, 0.52, 0.03], color: '#6b4a2e', ink: 0.01 }));
      g.add(W.ball({ p: [0.32, 1.05, d / 2 + 0.14], r: 0.055, color: '#d4a017', ink: 0.01 }));
      g.add(W.box({ p: [0, 0.10, d / 2 + 0.34], s: [1.3, 0.20, 0.6], color: '#a8a094', ink: 0.02 }));
      g.add(W.box({ p: [0, 0.02, d / 2 + 0.62], s: [1.5, 0.14, 0.5], color: '#b0a89c', ink: 0.02 }));
      // roof with overhang + ridge
      g.add(W.box({ p: [0, h + 0.52, 0], s: [w + 0.5, 0.24, d + 0.5], color: trim, ink: 0.03 }));
      g.add(W.cone({ p: [0, h + 1.35, 0], r: (w + 0.5) * 0.72, h: 1.5, color: roof, seg: 4, rot: [0, Math.PI / 4, 0] }));
      // chimney
      g.add(W.box({ p: [w * 0.28, h + 1.7, -d * 0.2], s: [0.42, 1.3, 0.42], color: '#8f7a62', ink: 0.03 }));
      g.add(W.box({ p: [w * 0.28, h + 2.38, -d * 0.2], s: [0.54, 0.14, 0.54], color: '#6b5a48', ink: 0.02 }));
      if (shop) g.add(W.box({ p: [0, 2.55, d / 2 + 0.55], s: [w * 0.9, 0.10, 1.0], color: '#b04a3a', ink: 0.02, rot: [0.22, 0, 0] })); // awning
      return g;
    }

    /* ================= IN-WORLD TYPOGRAPHY ================= */
    // Weathered hanging sign: real serif type, grain, nails, bracket, and it SWINGS.
    function sign({ p = [0, 0, 0], text = '', sub = '', w = 1.6, h = 0.7, rotY = 0,
                    bg = '#3f3226', fg = '#f0dcae', swing = 0.05, seed = 3 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = rotY;
      const pivot = new T.Group(); g.add(pivot);
      const r = rng(seed);
      pivot.add(K.canvasPlane({ p: [0, -h / 2, 0], s: [w, h], px: [Math.round(w * 150), Math.round(h * 150)],
        draw: (c, CW, CH) => {
          c.fillStyle = bg; c.fillRect(0, 0, CW, CH);
          for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(0,0,0,${0.04 + r() * 0.07})`; c.lineWidth = 1 + r() * 2;
            const y = r() * CH; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(CW * 0.3, y + r() * 6 - 3, CW * 0.7, y + r() * 6 - 3, CW, y); c.stroke(); }
          c.strokeStyle = fg; c.lineWidth = Math.max(2, CW * 0.012); c.strokeRect(CW * 0.045, CH * 0.09, CW * 0.91, CH * 0.82);
          c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
          const fs = Math.min(CH * (sub ? 0.34 : 0.46), CW / Math.max(4, text.length) * 1.7);
          c.font = `700 ${fs}px Georgia, 'Times New Roman', serif`;
          c.fillText(text, CW / 2, CH * (sub ? 0.40 : 0.5));
          if (sub) { c.font = `400 ${fs * 0.46}px Georgia, serif`; c.globalAlpha = 0.85; c.fillText(sub, CW / 2, CH * 0.72); c.globalAlpha = 1; }
          // wear: chips out of the paint
          for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(20,14,8,${0.10 + r() * 0.2})`; c.beginPath(); c.arc(r() * CW, r() * CH, 1 + r() * 3, 0, 7); c.fill(); }
          c.fillStyle = '#2a2118'; for (const x of [CW * 0.08, CW * 0.92]) { c.beginPath(); c.arc(x, CH * 0.16, CW * 0.014, 0, 7); c.fill(); }
        }, frame: '#241c14' }));
      // bracket + chains
      g.add(W.box({ p: [0, 0.06, 0], s: [w * 1.1, 0.07, 0.07], color: '#2f2a24', ink: 0.02 }));
      for (const sx of [-1, 1]) g.add(W.cyl({ p: [sx * w * 0.38, -0.10, 0], rt: 0.015, h: 0.22, color: '#3a342c', ink: 0 }));
      return { group: g, update(t) { pivot.rotation.z = Math.sin(t * 1.1 + seed) * swing; } };
    }

    // Aged poster with fake print: headline, rule, body lines, a star rating.
    function poster({ p = [0, 0, 0], rot = [0, 0, 0], w = 0.6, h = 0.85, title = 'HEARD', body = 'THREE VILLAGES', seed = 5 } = {}) {
      const r = rng(seed);
      return K.canvasPlane({ p, rot, s: [w, h], px: [Math.round(w * 260), Math.round(h * 260)],
        draw: (c, CW, CH) => {
          c.fillStyle = '#e8dcbc'; c.fillRect(0, 0, CW, CH);
          for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(150,120,80,${0.04 + r() * 0.10})`; c.beginPath(); c.arc(r() * CW, r() * CH, 1 + r() * 5, 0, 7); c.fill(); }
          c.fillStyle = '#2a2018'; c.textAlign = 'center';
          c.font = `900 ${CW * 0.20}px Georgia, serif`; c.fillText(title, CW / 2, CH * 0.19);
          c.fillRect(CW * 0.12, CH * 0.25, CW * 0.76, 2.5);
          c.font = `700 ${CW * 0.10}px Georgia, serif`; c.fillText(body, CW / 2, CH * 0.36);
          c.font = `400 ${CW * 0.055}px Georgia, serif`; c.textAlign = 'left';
          for (let i = 0; i < 9; i++) { const y = CH * (0.45 + i * 0.052); c.globalAlpha = 0.55; c.fillRect(CW * 0.13, y, CW * (0.5 + r() * 0.3), 1.8); }
          c.globalAlpha = 1; c.textAlign = 'center'; c.font = `700 ${CW * 0.075}px Georgia, serif`;
          c.fillText('VELLARA PARISH', CW / 2, CH * 0.95);
          c.strokeStyle = 'rgba(80,60,40,.5)'; c.lineWidth = 2; c.strokeRect(1, 1, CW - 2, CH - 2);
        } });
    }

    /* ================= LIVING THINGS ================= */
    function bird({ p = [0, 0, 0], s = 1, color = '#2f3a4a' } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
      const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
      const wing = (dir) => { const m = new T.Mesh(new T.PlaneGeometry(0.34, 0.11), mat); m.position.x = dir * 0.17; return m; };
      const L = wing(-1), R = wing(1); g.add(L); g.add(R);
      g.add(W.ball({ p: [0, 0, 0], r: 0.055, color, ink: 0 }));
      return { group: g, update(t, k = 0) { const f = Math.sin(t * 9 + k) * 0.8; L.rotation.z = f; R.rotation.z = -f; } };
    }
    // A flock crossing the sky on a path — background life that costs almost nothing.
    function flock({ from = [-14, 9, -8], to = [14, 11, -6], n = 5, period = 14, s = 1, phase = 0 } = {}) {
      const g = new T.Group(); const bs = [];
      for (let i = 0; i < n; i++) { const b = bird({ s }); g.add(b.group); bs.push(b); }
      return { group: g, update(t) {
        const u = ((t / period) + phase) % 1;
        bs.forEach((b, i) => {
          const off = i * 0.045, uu = (u + off) % 1;
          const x = from[0] + (to[0] - from[0]) * uu, y = from[1] + (to[1] - from[1]) * uu + Math.sin(uu * 6 + i) * 0.5 + (i % 2 ? 0.5 : -0.4);
          const z = from[2] + (to[2] - from[2]) * uu + (i - n / 2) * 0.5;
          b.group.position.set(x, y, z); b.update(t, i * 1.3);
        });
      } };
    }
    function chicken({ p = [0, 0, 0], s = 1, seed = 1 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
      const body = W.ball({ p: [0, 0.20, 0], r: 0.17, color: '#f0e6d2', s: [1.25, 1, 1] }); g.add(body);
      const head = new T.Group(); head.position.set(0.17, 0.30, 0);
      head.add(W.ball({ p: [0, 0, 0], r: 0.085, color: '#f7efe0' }));
      head.add(W.cone({ p: [0.09, -0.01, 0], r: 0.03, h: 0.09, color: '#e8a020', seg: 6, rot: [0, 0, -Math.PI / 2] }));
      head.add(W.box({ p: [0, 0.08, 0], s: [0.06, 0.06, 0.03], color: '#c0392b', ink: 0.01 }));
      g.add(head);
      for (const sx of [-1, 1]) g.add(W.cyl({ p: [sx * 0.06, 0.06, 0], rt: 0.014, h: 0.12, color: '#d8901e', ink: 0 }));
      const r = rng(seed); const ph = r() * 6;
      return { group: g, update(t) { const peck = Math.max(0, Math.sin(t * 2.2 + ph)); head.rotation.z = -peck * 0.9; head.position.y = 0.30 - peck * 0.10; g.position.x = p[0] + Math.sin(t * 0.35 + ph) * 0.35; } };
    }

    /* ================= ATMOSPHERE / FX ================= */
    // A light shaft with dust in it. Additive, tapered, and it breathes.
    function lightShaft({ p = [0, 0, 0], rot = [0, 0, 0], w = 1.4, h = 7, color = 'rgba(255,236,190,1)', o = 0.16 } = {}) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g2 = c.getContext('2d');
      const grad = g2.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, color.replace(/,1\)$/, ',0.85)')); grad.addColorStop(0.55, color.replace(/,1\)$/, ',0.30)')); grad.addColorStop(1, color.replace(/,1\)$/, ',0)'));
      g2.fillStyle = grad; g2.beginPath(); g2.moveTo(22, 0); g2.lineTo(42, 0); g2.lineTo(62, 256); g2.lineTo(2, 256); g2.closePath(); g2.fill();
      const tex = new T.CanvasTexture(c);
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.set(rot[0], rot[1], rot[2]); g.add(m);
      return { group: g, update(t) { m.material.opacity = o * (0.82 + 0.18 * Math.sin(t * 0.7)); m.rotation.z = Math.sin(t * 0.23) * 0.02; } };
    }
    // Drifting fog banks: layered soft planes, gives aerial depth without post-processing.
    function fogBank({ p = [0, 0, 0], w = 26, h = 4, n = 4, color = 'rgba(210,225,240,1)', o = 0.16, speed = 0.25 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const layers = [];
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const cx = c.getContext('2d');
      const rg = cx.createRadialGradient(128, 32, 2, 128, 32, 120);
      rg.addColorStop(0, color.replace(/,1\)$/, ',0.9)')); rg.addColorStop(1, color.replace(/,1\)$/, ',0)'));
      cx.fillStyle = rg; cx.fillRect(0, 0, 256, 64);
      const tex = new T.CanvasTexture(c);
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(new T.PlaneGeometry(w * (0.7 + i * 0.2), h), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: o, depthWrite: false, blending: T.NormalBlending, fog: false }));
        m.position.set(0, i * h * 0.22, -i * 1.6); g.add(m); layers.push({ m, i });
      }
      return { group: g, update(t) { layers.forEach(({ m, i }) => { m.position.x = Math.sin(t * speed * 0.2 + i) * (2 + i); m.material.opacity = o * (0.7 + 0.3 * Math.sin(t * 0.3 + i)); }); } };
    }
    function embers({ p = [0, 0, 0], n = 14, spread = 0.5, rise = 2.4, color = 'rgba(255,170,70,1)', speed = 0.5 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const ps = [];
      for (let i = 0; i < n; i++) { const s = K.glow({ p: [0, 0, 0], r: 0.05 + (i % 3) * 0.02, color, o: 0 }); g.add(s); ps.push(s); }
      return { group: g, update(t) { ps.forEach((s, i) => { const u = ((t * speed + i / n) % 1); s.position.set(Math.sin(i * 2.1 + t * 0.6) * spread, u * rise, Math.cos(i * 1.7) * spread * 0.6); s.material.opacity = (1 - u) * 0.75; s.scale.setScalar((1 - u * 0.6)); }); } };
    }
    function smoke({ p = [0, 0, 0], n = 7, rise = 3.2, color = 'rgba(220,220,225,1)', o = 0.3, speed = 0.22 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const ps = [];
      for (let i = 0; i < n; i++) { const s = K.glow({ p: [0, 0, 0], r: 0.4, color, o: 0 }); s.material.blending = T.NormalBlending; g.add(s); ps.push(s); }
      return { group: g, update(t) { ps.forEach((s, i) => { const u = ((t * speed + i / n) % 1); s.position.set(Math.sin(t * 0.4 + i) * 0.3 + u * 0.8, u * rise, 0); s.material.opacity = o * Math.sin(u * Math.PI); s.scale.setScalar(0.4 + u * 1.5); }); } };
    }
    // Falling leaves / drifting motes for exteriors.
    function leaves({ p = [0, 0, 0], n = 10, area = [8, 6, 5], color = '#c98a3a' } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const ps = [];
      const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.9 });
      for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.11, 0.07), mat); g.add(m); ps.push(m); }
      return { group: g, update(t) { ps.forEach((m, i) => { const u = ((t * 0.12 + i / n) % 1); m.position.set(Math.sin(t * 0.5 + i * 2) * area[0] * 0.5, area[1] * (1 - u), Math.cos(i * 1.3) * area[2] * 0.4); m.rotation.set(t * 1.2 + i, t * 0.9, t * 1.5 + i); }); } };
    }

    /* ================= PROP DETAIL ================= */
    function toolWall({ p = [0, 0, 0], rotY = 0, w = 2.6 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = rotY;
      g.add(W.box({ p: [0, 0, 0], s: [w, 0.09, 0.12], color: '#6b4a30', ink: 0.02 }));
      const tools = [];
      for (let i = 0; i < 6; i++) {
        const x = -w / 2 + 0.25 + i * (w - 0.5) / 5;
        const tg = new T.Group(); tg.position.set(x, -0.05, 0.06);
        tg.add(W.cyl({ p: [0, -0.22, 0], rt: 0.022, h: 0.44, color: '#8a6a44', ink: 0.01 }));
        if (i % 3 === 0) tg.add(W.box({ p: [0, -0.46, 0], s: [0.16, 0.10, 0.09], color: '#4a4a52', ink: 0.02 }));
        else if (i % 3 === 1) { tg.add(W.box({ p: [-0.04, -0.48, 0], s: [0.03, 0.20, 0.03], color: '#3e3e46', ink: 0.01, rot: [0, 0, 0.1] })); tg.add(W.box({ p: [0.04, -0.48, 0], s: [0.03, 0.20, 0.03], color: '#3e3e46', ink: 0.01, rot: [0, 0, -0.1] })); }
        else tg.add(W.cyl({ p: [0, -0.46, 0], rt: 0.07, rb: 0.05, h: 0.12, color: '#5a5a62', ink: 0.02 }));
        g.add(tg); tools.push(tg);
      }
      return { group: g, update(t) { tools.forEach((tg, i) => tg.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.035); } };
    }
    function ropeCoil({ p = [0, 0, 0], r = 0.3, color = '#c2a068' } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
      for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.TorusGeometry(r - i * 0.03, 0.035, 6, 18), new T.MeshToonMaterial({ color, gradientMap: W.ramp })); m.rotation.x = Math.PI / 2; m.position.y = 0.04 + i * 0.055; m.castShadow = true; g.add(m); }
      return g;
    }
    function bucket({ p = [0, 0, 0], s = 1 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
      g.add(W.cyl({ p: [0, 0.16, 0], rt: 0.17, rb: 0.14, h: 0.32, color: '#8a6a44', ink: 0.02 }));
      g.add(W.cyl({ p: [0, 0.30, 0], rt: 0.175, h: 0.03, color: '#5a4630', ink: 0.01 }));
      const hd = new T.Mesh(new T.TorusGeometry(0.16, 0.012, 5, 14, Math.PI), new T.MeshToonMaterial({ color: '#4a4a52', gradientMap: W.ramp }));
      hd.position.y = 0.32; hd.rotation.y = Math.PI / 2; g.add(hd);
      return g;
    }
    // Bronze pour: a glowing stream + splash glow. Story beat "they poured bronze".
    function pour({ p = [0, 0, 0], h = 1.2 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
      const stream = W.cyl({ p: [0, -h / 2, 0], rt: 0.055, rb: 0.075, h, color: '#ff9a3c', ink: 0 });
      stream.children[0].material.emissive = new T.Color('#ff6a10');
      g.add(stream);
      const gl = K.glow({ p: [0, -h, 0], r: 0.8, color: 'rgba(255,150,50,1)', o: 0.5 }); g.add(gl);
      const em = embers({ p: [0, -h, 0], n: 8, spread: 0.25, rise: 0.9, speed: 0.9 }); g.add(em.group);
      return { group: g, update(t) { const w = 0.85 + 0.15 * Math.sin(t * 14); stream.scale.set(w, 1, w); gl.material.opacity = 0.4 + 0.18 * Math.sin(t * 9); em.update(t); }, setVisible(v) { g.visible = v; } };
    }
    function weatherVane({ p = [0, 0, 0], s = 1 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
      g.add(W.cyl({ p: [0, 0.3, 0], rt: 0.025, h: 0.6, color: '#3a3a42', ink: 0.01 }));
      const arm = new T.Group(); arm.position.y = 0.6;
      arm.add(W.box({ p: [0, 0, 0], s: [0.7, 0.03, 0.03], color: '#3a3a42', ink: 0.01 }));
      arm.add(W.cone({ p: [0.4, 0, 0], r: 0.07, h: 0.2, color: '#d4a017', seg: 6, rot: [0, 0, -Math.PI / 2] }));
      arm.add(W.box({ p: [-0.36, 0, 0], s: [0.16, 0.18, 0.02], color: '#d4a017', ink: 0.01 }));
      g.add(arm);
      return { group: g, update(t) { arm.rotation.y = Math.sin(t * 0.35) * 0.5 + 0.4; } };
    }
    // A clock with a moving second hand — the reference loves a ticking clock in frame.
    function clockFace({ p = [0, 0, 0], r = 0.5, rotY = 0 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = rotY;
      g.add(K.canvasPlane({ p: [0, 0, 0], s: [r * 2, r * 2], px: [160, 160], transparent: true, draw: (c, CW, CH) => {
        c.clearRect(0, 0, CW, CH); c.fillStyle = '#f2e6c8'; c.beginPath(); c.arc(80, 80, 74, 0, 7); c.fill();
        c.strokeStyle = '#2a2018'; c.lineWidth = 6; c.stroke();
        c.fillStyle = '#2a2018'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.arc(80 + Math.sin(a) * 60, 80 - Math.cos(a) * 60, i % 3 === 0 ? 5 : 2.6, 0, 7); c.fill(); }
      } }));
      const hand = W.box({ p: [0, r * 0.34, 0.03], s: [0.025, r * 0.68, 0.02], color: '#8a2a2a', ink: 0 });
      const hp = new T.Group(); hp.add(hand); g.add(hp);
      const hour = W.box({ p: [0, r * 0.22, 0.02], s: [0.04, r * 0.44, 0.02], color: '#2a2018', ink: 0 });
      const hp2 = new T.Group(); hp2.add(hour); hp2.rotation.z = -1.1; g.add(hp2);
      return { group: g, update(t) { hp.rotation.z = -(t % 60) / 60 * Math.PI * 2; } };
    }
    // Cobbled ground with ruts, puddles and scatter — never a flat colour.
    function cobble({ p = [0, 0, 0], s = [24, 24], seed = 7, base = '#9c9484' } = {}) {
      const r = rng(seed);
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
      g.add(K.canvasPlane({ p: [0, 0.01, 0], rot: [-Math.PI / 2, 0, 0], s, px: [512, 512], draw: (c, CW, CH) => {
        c.fillStyle = base; c.fillRect(0, 0, CW, CH);
        for (let y = 0; y < CH; y += 22) for (let x = 0; x < CW; x += 26) {
          const ox = (y / 22 % 2) * 13, k = r();
          c.fillStyle = `rgba(${120 + k * 50 | 0},${115 + k * 45 | 0},${100 + k * 40 | 0},1)`;
          c.beginPath(); c.ellipse(x + ox + 13, y + 11, 11, 8.5, 0, 0, 7); c.fill();
          c.strokeStyle = 'rgba(60,52,42,.35)'; c.lineWidth = 1.6; c.stroke();
        }
        // cart ruts
        c.strokeStyle = 'rgba(70,58,44,.30)'; c.lineWidth = 13;
        for (const x of [CW * 0.36, CW * 0.52]) { c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 16, CH * 0.4, x - 14, CH * 0.7, x + 8, CH); c.stroke(); }
        // puddles
        for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(130,155,175,.34)'; c.beginPath(); c.ellipse(r() * CW, r() * CH, 16 + r() * 22, 9 + r() * 12, r() * 3, 0, 7); c.fill(); }
      } }));
      return g;
    }
    // Wall clutter: shelves of pots, stacked crates, sacks, a leaning ladder.
    function clutter({ p = [0, 0, 0], seed = 11, w = 3 } = {}) {
      const g = new T.Group(); g.position.set(p[0], p[1], p[2]); const r = rng(seed);
      g.add(K.shelf({ p: [0, 0, 0], w, levels: 2 }));
      for (let i = 0; i < 7; i++) g.add(K.pot({ p: [-w / 2 + 0.25 + r() * (w - 0.5), 0.28 + (i % 2) * 0.72, 0], s: 0.32 + r() * 0.2, color: ['#b0713f', '#9a6a4a', '#c08a5a'][i % 3] }));
      g.add(K.crate({ p: [w / 2 + 0.4, 0, 0.2], s: 0.6 }));
      g.add(K.crate({ p: [w / 2 + 0.4, 0.6, 0.2], s: 0.5 }));
      g.add(K.sack({ p: [-w / 2 - 0.45, 0, 0.25], s: 0.85 }));
      g.add(bucket({ p: [-w / 2 - 0.1, 0, 0.6], s: 0.9 }));
      g.add(ropeCoil({ p: [w / 2 + 0.9, 0, 0.5], r: 0.24 }));
      // leaning ladder
      const lad = new T.Group(); lad.position.set(-w / 2 - 0.9, 0, -0.1); lad.rotation.z = 0.16;
      for (const sx of [-1, 1]) lad.add(W.box({ p: [sx * 0.18, 1.1, 0], s: [0.06, 2.2, 0.06], color: '#8a6a44', ink: 0.02 }));
      for (let i = 0; i < 6; i++) lad.add(W.box({ p: [0, 0.3 + i * 0.34, 0], s: [0.42, 0.05, 0.05], color: '#9a7a54', ink: 0.01 }));
      g.add(lad);
      return g;
    }
    // Washing line / bunting that flutters — cheap, always-on exterior life.
    function bunting({ from = [-3, 3.4, 0], to = [3, 3.2, 0], n = 9, colors = ['#c0392b', '#f0c040', '#2980b9', '#16a085'] } = {}) {
      const g = new T.Group(); const flags = [];
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = from[0] + (to[0] - from[0]) * u, y = from[1] + (to[1] - from[1]) * u - Math.sin(u * Math.PI) * 0.35, z = from[2] + (to[2] - from[2]) * u;
        const m = new T.Mesh(new T.PlaneGeometry(0.26, 0.34), new T.MeshBasicMaterial({ color: colors[i % colors.length], side: T.DoubleSide }));
        m.position.set(x, y - 0.17, z); g.add(m); flags.push({ m, i, y: y - 0.17 });
      }
      const line = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, Math.hypot(to[0] - from[0], to[2] - from[2]), 5), new T.MeshBasicMaterial({ color: '#4a4038' }));
      line.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.1, (from[2] + to[2]) / 2); line.rotation.z = Math.PI / 2; g.add(line);
      return { group: g, update(t) { flags.forEach(({ m, i, y }) => { m.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.22; m.rotation.y = Math.sin(t * 1.6 + i) * 0.3; m.position.y = y + Math.sin(t * 2.6 + i) * 0.02; }); } };
    }

    return { facade, sign, poster, bird, flock, chicken, lightShaft, fogBank, embers, smoke, leaves,
             toolWall, ropeCoil, bucket, pour, weatherVane, clockFace, cobble, clutter, bunting };
  };
})();
