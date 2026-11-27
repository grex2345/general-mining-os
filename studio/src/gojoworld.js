// gojoworld.js — Round 16 environment + effects kit.
//
// R15's frames showed flat sky gradients, bare ground planes, a handful of boxes for
// buildings and five identical stick villagers. Every scene here is built to carry
// detail at 720x1280: layered skylines with lit windows, console banks with live
// screens, an Earth limb, volumetric shafts, drifting particulate, and animated
// diagram geometry for the physics metaphors.
//
// Browser-side classic script: window.GojoWorld(THREE, W, K) -> kit.
window.GojoWorld = function (THREE, W, K) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  // W.box/ball/cyl return a Group; reach the mesh material safely.
  const mat = (o) => {
    if (!o) return null;
    if (o.material && o.material.color) return o.material;
    if (o.children) { for (const c of o.children) { if (c.material && c.material.color) return c.material; } }
    return null;
  };
  const rnd = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

  /* ---------------- character billboard (high-res, drawGojo) ---------------- */
  function gojo({ p = [0, 0, 0], h = 2.6, look = {} }) {
    const CW = 900, CH = 1400;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = new THREE.Group(); g.position.set(p[0], p[1] + h * 0.492, p[2]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * (CW / CH), h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    g.add(mesh);
    const sh = W.shadow({ p: [p[0], 0.02, p[2]], r: h * 0.30, o: 0.45 });
    return {
      group: g, shadow: sh, h, pos: [p[0], p[2]],
      setPos(x, z) { this.pos[0] = x; this.pos[1] = z; g.position.set(x, h * 0.492, z); sh.position.set(x, 0.02, z); },
      update(camera, pose) {
        window.drawGojo(ctx, CW, CH, look, pose); tex.needsUpdate = true;
        g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      },
    };
  }

  /* ---------------- deep-space / void backdrop ---------------- */
  function voidDome({ top = '#05060f', mid = '#0b1030', bottom = '#1a0f2e', r = 90, nebula = true }) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, top); grad.addColorStop(0.55, mid); grad.addColorStop(1, bottom);
    g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
    if (nebula) {
      const R = rnd(7);
      for (let i = 0; i < 34; i++) {
        const x = R() * 512, y = R() * 512, rr = 40 + R() * 150;
        const hue = [ 'rgba(70,110,220,', 'rgba(140,60,200,', 'rgba(30,150,190,', 'rgba(200,60,120,' ][i % 4];
        const rg = g.createRadialGradient(x, y, 2, x, y, rr);
        rg.addColorStop(0, hue + (0.16 + R() * 0.16) + ')'); rg.addColorStop(1, hue + '0)');
        g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      // faint star field baked into the dome (cheap, no sprites)
      for (let i = 0; i < 420; i++) {
        const x = R() * 512, y = R() * 512, a = 0.25 + R() * 0.65, s = R() < 0.9 ? 1 : 2;
        g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, s, s);
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  }

  /* ---------------- Infinity: the shell that is also a coffin ---------------- */
  // Concentric refraction rings + a shimmering boundary. `seal` closes it into a coffin.
  function infinityShell({ p = [0, 1.4, 0], r = 1.9, color = '#7fe3ff' }) {
    const g = new THREE.Group(); g.position.set(...p);
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const rr = r * (0.74 + i * 0.062);
      const m = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.012 + i * 0.004, 8, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11 - i * 0.013, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2 + (i - 3) * 0.22; m.rotation.z = i * 0.4;
      g.add(m); rings.push(m);
    }
    // the boundary surface itself
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(shell);
    // latitude/longitude wire so the sphere reads as a surface, not a haze
    const wire = new THREE.Mesh(new THREE.SphereGeometry(r * 1.002, 16, 9),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.026, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(wire);
    const halo = K.glow({ p: [0, 0, 0], r: r * 1.5, color: 'rgba(120,225,255,1)', o: 0.07 }); g.add(halo);
    return {
      group: g, shell, wire,
      update(t, { pulse = 0, seal = 0, heat = 0 } = {}) {
        rings.forEach((m, i) => {
          m.rotation.z = i * 0.4 + t * (0.12 + i * 0.03) * (i % 2 ? -1 : 1);
          m.rotation.x = Math.PI / 2 + (i - 3) * 0.22 + Math.sin(t * 0.5 + i) * 0.06;
          m.material.opacity = (0.11 - i * 0.013) * (1 + pulse * 0.7);
        });
        wire.rotation.y = t * 0.07; wire.rotation.x = Math.sin(t * 0.2) * 0.1;
        const c = new THREE.Color(color).lerp(new THREE.Color('#ff5a32'), heat);
        shell.material.color.copy(c); wire.material.color.copy(c);
        shell.material.opacity = 0.035 + pulse * 0.045 + seal * 0.035;
        wire.material.opacity = 0.026 + seal * 0.034;
        halo.material.opacity = 0.07 + pulse * 0.09;
        g.scale.setScalar(1 - seal * 0.10 + Math.sin(t * 1.6) * 0.006);
      },
    };
  }

  /* ---------------- coffin: the metaphor made literal ---------------- */
  function coffin({ p = [0, 0, 0], h = 2.9, open = 0 }) {
    const g = new THREE.Group(); g.position.set(...p);
    const w = 0.95, d = 0.55;
    const wood = '#2a2036', trim = '#5b4a72';
    // tapered hexagonal casket
    g.add(W.box({ p: [0, h / 2, 0], s: [w, h, d], color: wood }));
    g.add(W.box({ p: [0, h + 0.05, 0], s: [w + 0.12, 0.1, d + 0.12], color: trim }));
    g.add(W.box({ p: [0, 0.06, 0], s: [w + 0.14, 0.12, d + 0.14], color: trim }));
    for (const s of [-1, 1]) g.add(W.box({ p: [s * (w / 2 + 0.02), h / 2, 0], s: [0.05, h * 0.9, d * 0.9], color: trim, ink: 0.02 }));
    // lid, hinged at the back
    const lid = new THREE.Group(); lid.position.set(0, h + 0.1, -d / 2);
    lid.add(W.box({ p: [0, 0.04, d / 2], s: [w + 0.12, 0.09, d + 0.12], color: '#332742' }));
    g.add(lid);
    // interior glow
    const inner = K.glow({ p: [0, h * 0.55, 0], r: 0.9, color: 'rgba(150,220,255,1)', o: 0.18 }); g.add(inner);
    return { group: g, update(t, o = 0) { lid.rotation.x = -o * 1.15; inner.material.opacity = 0.12 + o * 0.20 + Math.sin(t * 2) * 0.03; } };
  }

  /* ---------------- Tokyo night skyline ---------------- */
  function tokyo({ seed = 3, n = 16, spread = 46, z = -22 }) {
    const g = new THREE.Group(); const R = rnd(seed); const lit = [];
    for (let i = 0; i < n; i++) {
      const x = -spread / 2 + (i / (n - 1)) * spread + (R() - 0.5) * 2.2;
      const h = 5 + R() * 17, w = 2.2 + R() * 2.8, d = 2.2 + R() * 2.4;
      const zz = z - R() * 16;
      const b = K.building({ p: [x, 0, zz], s: [w, h, d], color: ['#1a2038', '#212a46', '#161c30'][i % 3], face: '+z', seed: i + 1, lit: 0.34 + R() * 0.3, trim: '#0e1222' });
      g.add(b);
      // rooftop mast + aircraft warning light
      if (R() < 0.5) {
        g.add(W.cyl({ p: [x, h + 0.9, zz], rt: 0.05, h: 1.8, color: '#2a3350', ink: 0 }));
        const sp = K.glow({ p: [x, h + 1.9, zz], r: 0.30, color: 'rgba(255,70,60,1)', o: 0.9 });
        g.add(sp); lit.push({ sp, ph: R() * 6 });
      }
    }
    // elevated expressway ribbon
    g.add(W.box({ p: [0, 3.4, z + 8], s: [spread * 0.9, 0.22, 1.5], color: '#232b45', ink: 0.02 }));
    for (let i = -6; i <= 6; i++) g.add(W.cyl({ p: [i * 3.4, 1.7, z + 8], rt: 0.16, h: 3.4, color: '#1b2138', ink: 0 }));
    const cars = [];
    for (let i = 0; i < 8; i++) {
      const sp = K.glow({ p: [0, 3.62, z + 8], r: 0.22, color: i % 2 ? 'rgba(255,220,150,1)' : 'rgba(255,90,70,1)', o: 0.85 });
      g.add(sp); cars.push({ sp, off: i / 8, dir: i % 2 ? 1 : -1 });
    }
    // moon
    const moon = K.glow({ p: [-16, 24, z - 20], r: 3.2, color: 'rgba(220,235,255,1)', o: 0.26 }); g.add(moon);
    g.add(W.ball({ p: [-16, 24, z - 20], r: 1.5, color: '#e8f0ff', ink: 0 }));
    return {
      group: g,
      update(t) {
        lit.forEach(({ sp, ph }) => { sp.material.opacity = 0.35 + 0.6 * (Math.sin(t * 1.7 + ph) > 0.3 ? 1 : 0.15); });
        cars.forEach(({ sp, off, dir }) => {
          const u = ((t * 0.06 * dir + off) % 1 + 1) % 1;
          sp.position.x = -spread * 0.45 + u * spread * 0.9;
        });
      },
    };
  }

  /* ---------------- NASA mission control ---------------- */
  function missionControl({ seed = 5 }) {
    const g = new THREE.Group(); const R = rnd(seed); const screens = [];
    // floor + ceiling
    g.add(W.surface({ p: [0, 0, 0], s: [30, 24], kind: 'plain', a: '#1a1f2e' }));
    g.add(W.box({ p: [0, 6.2, -2], s: [30, 0.3, 24], color: '#12161f', ink: 0 }));
    // back wall + big main display
    g.add(W.box({ p: [0, 3, -11], s: [30, 6.4, 0.4], color: '#181d2b', ink: 0.02 }));
    const main = K.canvasPlane({
      p: [0, 3.2, -10.7], s: [4.6, 3.6], px: [552, 432], frame: '#0b0e16',
      draw: (c, Wd, H) => {
        c.fillStyle = '#0d2438'; c.fillRect(0, 0, Wd, H);
        c.strokeStyle = 'rgba(120,210,255,.30)'; c.lineWidth = 1.5;
        for (let x = 0; x < Wd; x += 44) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
        for (let y = 0; y < H; y += 42) { c.beginPath(); c.moveTo(0, y); c.lineTo(Wd, y); c.stroke(); }
        // world map dots
        c.fillStyle = 'rgba(140,225,255,.85)';
        for (let i = 0; i < 260; i++) { const x = 40 + R() * (Wd - 80), y = 40 + R() * (H - 120); c.fillRect(x, y, 3, 3); }
        // trajectory arc
        c.strokeStyle = '#ffd166'; c.lineWidth = 5; c.beginPath();
        c.moveTo(60, H - 70); c.quadraticCurveTo(Wd * 0.5, 30, Wd - 70, H - 90); c.stroke();
        c.fillStyle = '#9ff0ff'; c.font = 'bold 34px monospace';
        c.fillText('THERMAL CONTROL / EVA-9', 26, 46);
        c.fillStyle = '#ffb07a'; c.font = 'bold 30px monospace';
        c.fillText('HEAT REJECTION REQUIRED', 26, H - 24);
      },
    });
    g.add(main);
    // console rows: desks, monitors, chairs
    for (let row = 0; row < 3; row++) {
      const z = -6.5 + row * 3.2;
      for (let col = -3; col <= 3; col++) {
        const x = col * 2.5;
        g.add(W.box({ p: [x, 0.78, z], s: [2.2, 0.12, 1.1], color: '#2b3348', ink: 0.02 }));
        g.add(W.box({ p: [x, 0.38, z + 0.45], s: [2.0, 0.76, 0.14], color: '#20263a', ink: 0.02 }));
        for (let m = 0; m < 2; m++) {
          const mx = x + (m - 0.5) * 0.95;
          const scr = K.canvasPlane({
            p: [mx, 1.28, z - 0.3], s: [0.86, 0.62], px: [172, 124], rot: [-0.18, 0, 0], frame: '#0a0d14',
            draw: (c, Wd, H) => {
              c.fillStyle = '#0d2135'; c.fillRect(0, 0, Wd, H);
              const hue = ['#66e4ff', '#8affc0', '#ffd166', '#ff8f5a'][(row + col + m + 8) % 4];
              c.strokeStyle = hue; c.lineWidth = 2; c.beginPath();
              for (let i = 0; i <= 30; i++) { const px = 8 + i * (Wd - 16) / 30, py = H * 0.6 - Math.sin(i * 0.5 + row + m) * H * 0.22 - R() * 8; i ? c.lineTo(px, py) : c.moveTo(px, py); }
              c.stroke();
              c.fillStyle = 'rgba(120,200,255,.5)'; c.font = '11px monospace';
              c.fillText('THERM ' + (row * 7 + col + 4), 8, 16);
              for (let i = 0; i < 4; i++) c.fillRect(8, H - 12 - i * 9, 20 + R() * (Wd - 40), 4);
            },
          });
          g.add(scr); screens.push(scr);
        }
        // chair
        g.add(W.box({ p: [x, 0.46, z + 1.15], s: [0.62, 0.1, 0.62], color: '#171c2c', ink: 0.02 }));
        g.add(W.box({ p: [x, 0.82, z + 1.42], s: [0.62, 0.72, 0.1], color: '#171c2c', ink: 0.02 }));
        g.add(W.cyl({ p: [x, 0.22, z + 1.15], rt: 0.07, h: 0.44, color: '#0f1320', ink: 0 }));
      }
    }
    // ceiling light strips
    for (let i = -2; i <= 2; i++) {
      g.add(W.box({ p: [i * 5, 6.0, -2], s: [1.6, 0.08, 12], color: '#cfe4ff', ink: 0 }));
      g.add(K.glow({ p: [i * 5, 5.7, -2], r: 2.2, color: 'rgba(180,215,255,1)', o: 0.07 }));
    }
    // engineers (silhouette puppets at consoles, subtle idle)
    const crew = [];
    for (let i = 0; i < 5; i++) {
      const x = -5 + i * 2.5, z = -3.3 + (i % 2) * 3.2;
      const a = gojo({ p: [x, 0, z], h: 1.7, look: { coat: '#243050', coatHi: '#33436e', pants: '#1a2138', hair: '#3a3f52', hairSh: '#22263a', skin: '#e8c4a8' } });
      g.add(a.group); crew.push({ a, x, z, ph: i * 1.3 });
    }
    return {
      group: g, crew,
      update(t, camera) {
        crew.forEach(({ a, ph }) => a.update(camera, {
          t: t + ph, mood: 'focus', arms: 'chest', blindfold: 0, hunch: 0,
          lean: 0.10, headTilt: 0.04, lookX: Math.sin(t * 0.4 + ph) * 0.3,
          armR: [0.10, 0.42], armL: [-0.10, 0.42], curl: 0.6, blink: (Math.sin(t * 0.7 + ph) > 0.985 ? 0.1 : 1),
        }));
        screens.forEach((s, i) => { s.children[0].material.opacity = 1; });
      },
    };
  }

  /* ---------------- space: Earth limb, station truss, radiator ---------------- */
  function spaceRig({ earth = true }) {
    const g = new THREE.Group();
    let earthGrp = null;
    if (earth) {
      earthGrp = new THREE.Group(); earthGrp.position.set(-6, -16, -34);
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const ec = c.getContext('2d');
      const og = ec.createLinearGradient(0, 0, 0, 256);
      og.addColorStop(0, '#123a6e'); og.addColorStop(0.5, '#1d6fa8'); og.addColorStop(1, '#0e2a52');
      ec.fillStyle = og; ec.fillRect(0, 0, 512, 256);
      const R = rnd(11);
      ec.fillStyle = '#2f7a4a';
      for (let i = 0; i < 22; i++) { const x = R() * 512, y = 40 + R() * 176, w = 24 + R() * 80, h = 16 + R() * 46; ec.beginPath(); ec.ellipse(x, y, w, h, R() * 3, 0, TAU); ec.fill(); }
      ec.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 40; i++) { const x = R() * 512, y = R() * 256, w = 20 + R() * 70, h = 8 + R() * 20; ec.beginPath(); ec.ellipse(x, y, w, h, R(), 0, TAU); ec.fill(); }
      const etex = new THREE.CanvasTexture(c); etex.colorSpace = THREE.SRGBColorSpace;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(15, 40, 28), new THREE.MeshToonMaterial({ map: etex }));
      earthGrp.add(ball);
      // atmosphere rim
      const atm = new THREE.Mesh(new THREE.SphereGeometry(15.7, 32, 24),
        new THREE.MeshBasicMaterial({ color: '#7fc8ff', transparent: true, opacity: 0.20, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      earthGrp.add(atm);
      g.add(earthGrp);
    }
    // station truss
    const truss = new THREE.Group(); truss.position.set(3.5, 2.2, -8);
    truss.add(W.box({ p: [0, 0, 0], s: [10, 0.34, 0.34], color: '#b9c2d4', ink: 0.02 }));
    for (let i = -5; i <= 5; i++) {
      truss.add(W.box({ p: [i * 0.9, 0, 0], s: [0.09, 0.9, 0.09], color: '#8f9ab0', ink: 0 }));
      truss.add(W.box({ p: [i * 0.9, 0, 0], s: [0.09, 0.09, 0.9], color: '#8f9ab0', ink: 0 }));
    }
    // solar wings
    for (const s of [-1, 1]) {
      const wing = W.box({ p: [s * 6.2, 0, 0], s: [3.4, 0.06, 2.2], color: '#1b2a5e', ink: 0.02 });
      truss.add(wing);
      for (let k = 0; k < 5; k++) truss.add(W.box({ p: [s * 6.2, 0.05, -1 + k * 0.5], s: [3.3, 0.02, 0.06], color: '#4a6ad0', ink: 0 }));
    }
    // THE RADIATOR: white panel with serpentine coolant lines, glowing when active
    const rad = new THREE.Group(); rad.position.set(0, -1.5, 0.6);
    rad.add(W.box({ p: [0, 0, 0], s: [4.6, 2.6, 0.10], color: '#e8eef7', ink: 0.03 }));
    const lines = [];
    for (let k = 0; k < 7; k++) {
      const y = -1.05 + k * 0.35;
      const ln = W.box({ p: [0, y, 0.07], s: [4.2, 0.09, 0.03], color: '#9fb4cc', ink: 0 });
      rad.add(ln); lines.push(ln);
    }
    const radGlow = K.glow({ p: [0, 0, 0.3], r: 3.0, color: 'rgba(255,140,80,1)', o: 0.0 }); rad.add(radGlow);
    truss.add(rad);
    g.add(truss);
    return {
      group: g, radiator: rad, truss,
      update(t, { radiate = 0 } = {}) {
        if (earthGrp) earthGrp.rotation.y = t * 0.012;
        truss.rotation.z = Math.sin(t * 0.12) * 0.02;
        lines.forEach((ln, k) => {
          const u = (t * 0.5 + k / 7) % 1;
          mat(ln) && mat(ln).color.setStyle(radiate > 0.05 ? `rgb(${Math.round(159 + 96 * radiate)},${Math.round(180 - 60 * radiate)},${Math.round(204 - 120 * radiate)})` : '#9fb4cc');
          ln.scale.x = 1;
        });
        radGlow.material.opacity = radiate * (0.15 + 0.05 * Math.sin(t * 3));
      },
    };
  }

  /* ---------------- EVA suit figure with a cutaway radiator ---------------- */
  function evaSuit({ p = [0, 0, 0], h = 3.0 }) {
    const g = new THREE.Group(); g.position.set(...p);
    const suit = '#eef2f8', shade = '#c3ccdb', joint = '#8e99ad';
    // torso
    g.add(W.box({ p: [0, h * 0.58, 0], s: [h * 0.34, h * 0.34, h * 0.22], color: suit }));
    // life-support backpack
    g.add(W.box({ p: [0, h * 0.60, -h * 0.16], s: [h * 0.30, h * 0.32, h * 0.12], color: shade }));
    // helmet
    const helm = W.ball({ p: [0, h * 0.86, 0], r: h * 0.15, color: suit }); g.add(helm);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(h * 0.128, 24, 18, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: '#1d3a5c', transparent: true, opacity: 0.85 }));
    visor.position.set(0, h * 0.86, h * 0.02); visor.rotation.y = -Math.PI / 2; g.add(visor);
    g.add(K.glow({ p: [h * 0.05, h * 0.89, h * 0.14], r: h * 0.09, color: 'rgba(190,230,255,1)', o: 0.5 }));
    // limbs
    for (const s of [-1, 1]) {
      g.add(W.cyl({ p: [s * h * 0.24, h * 0.58, 0], rt: h * 0.062, h: h * 0.30, color: suit, rot: [0, 0, s * 0.22] }));
      g.add(W.ball({ p: [s * h * 0.30, h * 0.42, 0], r: h * 0.06, color: joint }));
      g.add(W.cyl({ p: [s * h * 0.34, h * 0.30, 0], rt: h * 0.055, h: h * 0.22, color: shade, rot: [0, 0, s * 0.12] }));
      g.add(W.cyl({ p: [s * h * 0.11, h * 0.24, 0], rt: h * 0.075, h: h * 0.30, color: suit }));
      g.add(W.box({ p: [s * h * 0.11, h * 0.06, h * 0.03], s: [h * 0.14, h * 0.08, h * 0.20], color: joint }));
    }
    // chest control module
    g.add(W.box({ p: [0, h * 0.60, h * 0.13], s: [h * 0.18, h * 0.12, h * 0.04], color: '#2b3348', ink: 0.02 }));
    for (let i = 0; i < 3; i++) g.add(K.glow({ p: [(i - 1) * h * 0.05, h * 0.60, h * 0.16], r: h * 0.02, color: ['rgba(120,255,180,1)', 'rgba(255,210,110,1)', 'rgba(120,200,255,1)'][i], o: 0.9 }));
    // cutaway radiator on the back, with heat plumes
    const rad = new THREE.Group(); rad.position.set(0, h * 0.60, -h * 0.24);
    rad.add(W.box({ p: [0, 0, 0], s: [h * 0.26, h * 0.26, h * 0.03], color: '#9fb2c9', ink: 0.02 }));
    for (let i = 0; i < 5; i++) rad.add(W.box({ p: [0, (i - 2) * h * 0.05, -h * 0.02], s: [h * 0.22, h * 0.018, h * 0.012], color: '#5d708c', ink: 0 }));
    const plumes = [];
    for (let i = 0; i < 10; i++) {
      const sp = K.glow({ p: [0, 0, 0], r: h * 0.055, color: 'rgba(255,130,50,1)', o: 0.5 });
      rad.add(sp); plumes.push({ sp, off: i / 10, x: (i % 5 - 2) * h * 0.05 });
    }
    g.add(rad);
    return {
      group: g,
      update(t, { radiate = 0.6 } = {}) {
        g.rotation.z = Math.sin(t * 0.35) * 0.05;
        g.position.y = p[1] + Math.sin(t * 0.5) * 0.06;
        plumes.forEach(({ sp, off, x }) => {
          const u = ((t * 0.35 + off) % 1);
          sp.position.set(x, u * h * 0.5, -u * h * 0.45);
          sp.material.opacity = radiate * (1 - u) * 0.42;
          sp.scale.setScalar(1 + u * 1.6);
        });
      },
    };
  }

  /* ---------------- thermos cutaway ---------------- */
  function thermos({ p = [0, 0, 0], h = 3.4 }) {
    const g = new THREE.Group(); g.position.set(...p);
    const r = h * 0.26;
    // outer wall (half cylinder so we see inside)
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, true, 0, Math.PI),
      new THREE.MeshToonMaterial({ color: '#e9f0fa', side: THREE.DoubleSide }));
    outer.position.y = h / 2; outer.rotation.y = Math.PI / 2; g.add(outer);
    // inner wall
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.74, h * 0.9, 32, 1, true, 0, Math.PI),
      new THREE.MeshToonMaterial({ color: '#54688a', side: THREE.DoubleSide }));
    inner.position.y = h * 0.47; inner.rotation.y = Math.PI / 2; g.add(inner);
    // vacuum gap ring markers
    const gap = [];
    for (let i = 0; i < 12; i++) {
      const y = h * 0.1 + i * (h * 0.8 / 11);
      const m = W.box({ p: [0, y, r * 0.87], s: [0.05, 0.05, 0.05], color: '#66e4ff', ink: 0 });
      g.add(m); gap.push(m);
    }
    // hot contents
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.60, r * 0.60, h * 0.62, 28),
      new THREE.MeshBasicMaterial({ color: '#ff6a3a', transparent: true, opacity: 0.68 }));
    fluid.position.y = h * 0.36; g.add(fluid);
    const hot = K.glow({ p: [0, h * 0.4, 0], r: r * 2.2, color: 'rgba(255,120,60,1)', o: 0.20 }); g.add(hot);
    // cap + rim rings so the two walls are unmistakable
    g.add(W.cyl({ p: [0, h + 0.1, 0], rt: r * 1.06, h: 0.24, color: '#4a5570' }));
    g.add(W.cyl({ p: [0, h * 0.96, 0], rt: r * 1.02, h: 0.07, color: '#9fb0c8', ink: 0.01 }));
    g.add(W.cyl({ p: [0, h * 0.04, 0], rt: r * 1.04, h: 0.09, color: '#9fb0c8', ink: 0.01 }));
    // vacuum-gap callout arrow pointing into the space between the walls
    g.add(W.box({ p: [r * 0.90, h * 0.55, r * 0.30], s: [0.05, 0.9, 0.05], color: '#66e4ff', ink: 0 }));
    // trapped heat arrows bouncing inside
    const arrows = [];
    for (let i = 0; i < 8; i++) {
      const sp = K.glow({ p: [0, 0, 0], r: 0.13, color: 'rgba(255,190,90,1)', o: 0.40 });
      g.add(sp); arrows.push({ sp, off: i / 8, a: i / 8 * TAU });
    }
    return {
      group: g,
      update(t, { trap = 1 } = {}) {
        hot.material.opacity = 0.16 + 0.07 * Math.sin(t * 2.2) + trap * 0.08;
        fluid.material.color.setStyle(`rgb(255,${Math.round(106 - trap * 30)},${Math.round(58 - trap * 20)})`);
        gap.forEach((m, i) => { mat(m) && mat(m).color.setStyle(i % 2 ? '#66e4ff' : '#2b8fbf'); m.scale.setScalar(0.8 + 0.4 * Math.sin(t * 3 + i)); });
        arrows.forEach(({ sp, off, a }) => {
          // heat travels outward, hits the vacuum wall, and reflects back IN
          const u = ((t * 0.55 + off) % 1);
          const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
          const rr = lerp(r * 0.2, r * 0.86, tri);
          sp.position.set(Math.cos(a) * rr, h * 0.25 + ((off * 7) % 1) * h * 0.5, Math.sin(a) * rr);
          sp.material.opacity = trap * (0.18 + 0.26 * (1 - tri));
        });
      },
    };
  }

  /* ---------------- rising heat column / thermal shimmer ---------------- */
  function heatColumn({ p = [0, 0, 0], r = 1.2, h = 4, n = 26, color = 'rgba(255,140,60,1)' }) {
    const g = new THREE.Group(); g.position.set(...p); const ps = [];
    const R = rnd(23);
    for (let i = 0; i < n; i++) {
      const sp = K.glow({ p: [0, 0, 0], r: 0.10 + R() * 0.16, color, o: 0.22 });
      g.add(sp); ps.push({ sp, off: R(), a: R() * TAU, rr: R() * r, sp2: 0.3 + R() * 0.5 });
    }
    return {
      group: g,
      update(t, { intensity = 1 } = {}) {
        ps.forEach(({ sp, off, a, rr, sp2 }) => {
          const u = ((t * sp2 * 0.35 + off) % 1);
          sp.position.set(Math.cos(a + t * 0.3) * rr * (1 + u * 0.5), u * h, Math.sin(a + t * 0.3) * rr * (1 + u * 0.5));
          sp.material.opacity = intensity * Math.sin(u * Math.PI) * 0.26;
          sp.scale.setScalar(1 + u * 1.4);
        });
      },
    };
  }

  /* ---------------- atom filter: sorted particle streams ---------------- */
  // kind: 'oxygen' (passes in), 'heat' (pushed out), 'knife' (blocked)
  function atomStream({ p = [0, 0, 0], n = 14, kind = 'oxygen', from = [-4, 2, 0], to = [0, 1.6, 0], barrierR = 1.9 }) {
    const g = new THREE.Group(); g.position.set(...p); const ps = [];
    const R = rnd(kind.length * 7 + 3);
    const col = kind === 'oxygen' ? 'rgba(130,255,190,1)' : kind === 'heat' ? 'rgba(255,150,70,1)' : 'rgba(255,90,90,1)';
    for (let i = 0; i < n; i++) {
      let obj;
      if (kind === 'knife') {
        obj = new THREE.Group();
        obj.add(W.box({ p: [0, 0, 0], s: [0.34, 0.05, 0.02], color: '#d8e2f0', ink: 0.01 }));
        obj.add(W.box({ p: [-0.20, 0, 0], s: [0.10, 0.07, 0.03], color: '#3a2a22', ink: 0.01 }));
      } else {
        obj = W.ball({ p: [0, 0, 0], r: kind === 'heat' ? 0.075 : 0.085, color: kind === 'oxygen' ? '#8affc0' : '#ff9a4a', ink: 0.02 });
      }
      const halo = K.glow({ p: [0, 0, 0], r: 0.20, color: col, o: 0.30 });
      const holder = new THREE.Group(); holder.add(obj); holder.add(halo); g.add(holder);
      ps.push({ holder, halo, off: R(), lane: (R() - 0.5) * 1.5, lane2: (R() - 0.5) * 1.2, spin: R() * TAU });
    }
    return {
      group: g,
      update(t, { active = 1 } = {}) {
        ps.forEach(({ holder, halo, off, lane, lane2, spin }) => {
          const u = ((t * 0.42 + off) % 1);
          let x, y, z, vis = active;
          if (kind === 'oxygen') {
            // travels inward and PASSES the shell
            x = lerp(from[0], to[0], u); y = lerp(from[1], to[1], u) + lane * 0.4; z = lane2;
            halo.material.opacity = active * 0.30 * (1 - Math.abs(u - 0.5) * 0.8);
          } else if (kind === 'heat') {
            // travels outward FROM the body and is allowed out
            x = lerp(to[0], -from[0] * 0.9, u); y = lerp(to[1], from[1] + 1.2, u) + lane * 0.4; z = lane2;
            halo.material.opacity = active * 0.32 * (1 - u * 0.5);
          } else {
            // approaches, STOPS at the shell, then falls away
            const stop = 0.62;
            if (u < stop) { const q = u / stop; x = lerp(from[0], to[0] - barrierR * 0.98, q); y = lerp(from[1], to[1], q) + lane * 0.3; z = lane2; }
            else { const q = (u - stop) / (1 - stop); x = to[0] - barrierR * 0.98 - q * 0.35; y = to[1] + lane * 0.3 - q * q * 2.2; z = lane2; }
            holder.rotation.z = spin + u * 6;
            halo.material.opacity = active * (u < stop ? 0.28 : 0.28 * (1 - (u - stop) / (1 - stop)));
          }
          holder.position.set(x, y, z);
          holder.visible = vis > 0.02;
          holder.scale.setScalar(kind === 'knife' ? 1 : 0.8 + 0.4 * Math.sin(t * 3 + spin));
        });
      },
    };
  }

  /* ---------------- brain hologram (Six Eyes / RCT / thermal calculus) ---------------- */
  function brainHolo({ p = [0, 0, 0], r = 0.9 }) {
    const g = new THREE.Group(); g.position.set(...p);
    // The first version used great-circle torus rings and read as an ATOM, not a brain.
    // Draw an actual brain profile (two hemispheres, gyri, fissure, stem) on a canvas.
    const CW = 512, CH = 512;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const bc = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.5, r * 2.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    g.add(plane);
    const halo = K.glow({ p: [0, 0, -0.05], r: r * 1.9, color: 'rgba(255,140,170,1)', o: 0.13 }); g.add(halo);

    function paint(heat, heal, pulse) {
      bc.clearRect(0, 0, CW, CH);
      const cx = CW / 2, cy = CH / 2 - 14, R = 168;
      const base = heat > 0.02
        ? `rgb(${Math.round(255)},${Math.round(150 - 110 * heat)},${Math.round(170 - 130 * heat)})`
        : heal > 0.02 ? `rgb(${Math.round(255 - 120 * heal)},${Math.round(150 + 95 * heal)},${Math.round(170 - 20 * heal)})`
        : '#ff9ab0';
      const dark = heat > 0.02 ? '#8e1c10' : heal > 0.02 ? '#1c6e46' : '#8e3a52';
      bc.save(); bc.translate(cx, cy); bc.scale(1 + pulse * 0.03, 1 + pulse * 0.03);
      // outer brain silhouette: two lobes with a bumpy rim
      bc.beginPath();
      const N = 84;
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        const bump = 1 + 0.055 * Math.sin(a * 9) + 0.035 * Math.sin(a * 15 + 1);
        const rx = R * 1.10 * bump, ry = R * 0.94 * bump;
        const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        i ? bc.lineTo(x, y) : bc.moveTo(x, y);
      }
      bc.closePath();
      const rg = bc.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.15, 0, 0, R * 1.3);
      rg.addColorStop(0, '#ffe2ea'); rg.addColorStop(0.45, base); rg.addColorStop(1, dark);
      bc.fillStyle = rg; bc.globalAlpha = 0.92; bc.fill(); bc.globalAlpha = 1;
      bc.strokeStyle = dark; bc.lineWidth = 6; bc.stroke();
      // central longitudinal fissure
      bc.strokeStyle = dark; bc.lineWidth = 7; bc.globalAlpha = 0.85;
      bc.beginPath(); bc.moveTo(0, -R * 0.92); bc.bezierCurveTo(R * 0.10, -R * 0.3, -R * 0.10, R * 0.3, 0, R * 0.90); bc.stroke();
      // gyri: squiggly folds on each hemisphere
      bc.lineWidth = 5.5; bc.globalAlpha = 0.7;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const y0 = -R * 0.66 + k * R * 0.32;
          bc.beginPath();
          bc.moveTo(side * R * 0.14, y0);
          bc.bezierCurveTo(side * R * 0.52, y0 - R * 0.16, side * R * 0.30, y0 + R * 0.20, side * R * 0.86, y0 + R * 0.04);
          bc.stroke();
        }
      }
      bc.globalAlpha = 1;
      // cerebellum + brain stem
      bc.fillStyle = dark; bc.globalAlpha = 0.55;
      bc.beginPath(); bc.ellipse(R * 0.42, R * 0.78, R * 0.34, R * 0.22, 0.2, 0, Math.PI * 2); bc.fill();
      bc.globalAlpha = 1;
      bc.fillStyle = base; bc.strokeStyle = dark; bc.lineWidth = 5;
      bc.beginPath(); bc.moveTo(-R * 0.12, R * 0.86); bc.lineTo(R * 0.12, R * 0.86);
      bc.lineTo(R * 0.09, R * 1.20); bc.lineTo(-R * 0.09, R * 1.20); bc.closePath(); bc.fill(); bc.stroke();
      // heat shimmer overlay
      if (heat > 0.05) {
        bc.globalAlpha = heat * 0.35; bc.fillStyle = '#ff2a10';
        bc.beginPath(); bc.ellipse(0, 0, R * 1.12, R * 0.96, 0, 0, Math.PI * 2); bc.fill(); bc.globalAlpha = 1;
      }
      bc.restore();
      tex.needsUpdate = true;
    }
    paint(0, 0, 0);

    // orbiting equation glyphs
    const glyphs = [];
    const texts = ['dQ/dt', 'kA\u0394T', '\u03c3T\u2074', 'mc\u0394T', 'O\u2082', '\u2207\u00b2T', 'W=1000', 'RCT'];
    for (let i = 0; i < texts.length; i++) {
      const pl = K.canvasPlane({
        p: [0, 0, 0], s: [0.62, 0.24], px: [186, 72], transparent: true,
        draw: (c, Wd, H) => {
          c.clearRect(0, 0, Wd, H);
          c.fillStyle = 'rgba(160,240,255,.95)'; c.font = 'bold 40px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(texts[i], Wd / 2, H / 2);
        },
      });
      g.add(pl); glyphs.push({ pl, a: i / texts.length * Math.PI * 2, rr: r * (1.55 + (i % 3) * 0.24), yy: (i % 4 - 1.5) * r * 0.40 });
    }
    return {
      group: g, core: plane,
      update(t, { heat = 0, heal = 0, spin = 1, camera = null } = {}) {
        const pulse = Math.sin(t * 2.4);
        paint(heat, heal, pulse);
        const c = new THREE.Color('#ff8fa8').lerp(new THREE.Color('#ff3a20'), heat).lerp(new THREE.Color('#7dffb4'), heal);
        halo.material.color.copy(c);
        halo.material.opacity = 0.12 + heat * 0.16 + heal * 0.12;
        if (camera) {
          const wp = new THREE.Vector3(); plane.getWorldPosition(wp);
          plane.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z) - g.rotation.y;
        }
        glyphs.forEach(({ pl, a, rr, yy }, i) => {
          const ang = a + t * 0.5 * spin;
          pl.position.set(Math.cos(ang) * rr, yy + Math.sin(t * 0.8 + i) * 0.06, Math.sin(ang) * rr);
          if (camera) {
            const wp = new THREE.Vector3(); pl.getWorldPosition(wp);
            pl.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z) - g.rotation.y;
          } else pl.rotation.y = -ang + Math.PI / 2;
          pl.children[0].material.opacity = 0.45 + 0.4 * Math.sin(t * 1.5 + i);
        });
      },
    };
  }

  /* ---------------- HUD panel: gauges, countdowns, labels ---------------- */
  function hud({ p = [0, 0, 0], s = [2.2, 1.2], px = [512, 280], draw }) {
    const cv = document.createElement('canvas'); cv.width = px[0]; cv.height = px[1];
    const cx2 = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const g = new THREE.Group(); g.add(m); g.position.set(...p);
    return { group: g, update(t, state) { cx2.clearRect(0, 0, px[0], px[1]); draw(cx2, px[0], px[1], t, state || {}); tex.needsUpdate = true; } };
  }

  /* ---------------- modern city street (the ending) ---------------- */
  function street({ seed = 9 }) {
    const g = new THREE.Group(); const R = rnd(seed);
    g.add(W.surface({ p: [0, 0, 0], s: [40, 30], kind: 'plain', a: '#20242e' }));
    // pavement + kerb
    g.add(W.box({ p: [0, 0.08, 3.4], s: [40, 0.16, 5], color: '#2c313d', ink: 0.02 }));
    g.add(W.box({ p: [0, 0.17, 0.95], s: [40, 0.06, 0.18], color: '#3a4050', ink: 0 }));
    // road markings
    for (let i = -8; i <= 8; i++) g.add(W.box({ p: [i * 2.4, 0.02, -2.2], s: [1.1, 0.02, 0.14], color: '#8a8f9c', ink: 0 }));
    // buildings both sides with lit windows
    for (let i = 0; i < 9; i++) {
      const x = -18 + i * 4.6;
      const h = 6 + R() * 10;
      g.add(K.building({ p: [x, 0, -9], s: [4.0, h, 4], color: ['#232a3a', '#1c2230', '#283044'][i % 3], face: '+z', seed: i + 4, lit: 0.42, trim: '#141824' }));
    }
    // street lamps with pools of light
    const lamps = [];
    for (let i = -3; i <= 3; i++) {
      const x = i * 5.2;
      g.add(W.cyl({ p: [x, 1.9, 2.4], rt: 0.07, h: 3.8, color: '#2a3040', ink: 0.02 }));
      g.add(W.box({ p: [x, 3.85, 2.1], s: [0.5, 0.12, 0.7], color: '#3a4256', ink: 0.02 }));
      const sp = K.glow({ p: [x, 3.7, 2.1], r: 0.9, color: 'rgba(255,214,150,1)', o: 0.34 }); g.add(sp); lamps.push(sp);
      g.add(K.glow({ p: [x, 0.1, 2.1], r: 2.0, color: 'rgba(255,200,130,1)', o: 0.07 }));
    }
    // phone box / doorway prop anchor
    g.add(W.box({ p: [4.6, 1.3, 3.0], s: [1.5, 2.6, 0.3], color: '#1a1f2c', ink: 0.03 }));
    const door = W.box({ p: [4.6, 1.15, 3.16], s: [1.0, 2.2, 0.08], color: '#3b2f4a', ink: 0.03 });
    g.add(door);
    g.add(K.glow({ p: [4.6, 2.5, 3.3], r: 0.5, color: 'rgba(255,220,160,1)', o: 0.4 }));
    return { group: g, door, update(t) { lamps.forEach((s, i) => { s.material.opacity = 0.30 + 0.05 * Math.sin(t * 2.3 + i); }); } };
  }

  /* ---------------- phone prop (the call you don't make) ---------------- */
  function phone({ p = [0, 0, 0], s = 1 }) {
    const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s);
    g.add(W.box({ p: [0, 0, 0], s: [0.42, 0.84, 0.05], color: '#0e1118', ink: 0.03 }));
    const scr = hud({
      p: [0, 0, 0.032], s: [0.36, 0.76], px: [180, 380],
      draw: (c, Wd, H, t, st) => {
        c.fillStyle = '#0a1626'; c.fillRect(0, 0, Wd, H);
        c.fillStyle = '#8fd8ff'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center';
        c.fillText('incoming', Wd / 2, 46);
        c.fillStyle = '#fff'; c.font = 'bold 26px sans-serif';
        c.fillText(st.name || 'the call', Wd / 2, 92);
        // ringing avatar
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        c.fillStyle = `rgba(120,220,255,${0.3 + pulse * 0.4})`;
        c.beginPath(); c.arc(Wd / 2, 176, 40 + pulse * 8, 0, TAU); c.fill();
        c.fillStyle = '#1b3550'; c.beginPath(); c.arc(Wd / 2, 176, 34, 0, TAU); c.fill();
        // accept / decline
        c.fillStyle = '#3ddc84'; c.beginPath(); c.arc(Wd * 0.30, H - 62, 26, 0, TAU); c.fill();
        c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(Wd * 0.70, H - 62, 26, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 24px sans-serif';
        c.fillText('\u2713', Wd * 0.30, H - 54); c.fillText('\u2715', Wd * 0.70, H - 54);
        if (st.dim) { c.fillStyle = `rgba(4,8,14,${st.dim})`; c.fillRect(0, 0, Wd, H); }
      },
    });
    g.add(scr.group);
    return { group: g, update(t, st) { scr.update(t, st); g.rotation.y = Math.sin(t * 0.5) * 0.12; } };
  }

  /* ---------------- atmosphere: god rays, fog banks, embers ---------------- */
  function godRays({ p = [0, 0, 0], n = 5, color = 'rgba(150,210,255,1)', h = 9, w = 1.1 }) {
    const g = new THREE.Group(); g.position.set(...p); const rays = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const cg = c.getContext('2d');
      const lg = cg.createLinearGradient(0, 0, 0, 256);
      lg.addColorStop(0, color.replace(/[\d.]+\)$/, '0.13)'));
      lg.addColorStop(0.6, color.replace(/[\d.]+\)$/, '0.05)'));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = lg; cg.beginPath(); cg.moveTo(24, 0); cg.lineTo(40, 0); cg.lineTo(60, 256); cg.lineTo(4, 256); cg.closePath(); cg.fill();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set((i - (n - 1) / 2) * w * 1.3, h / 2, -i * 0.4);
      m.rotation.z = (i - (n - 1) / 2) * 0.06;
      g.add(m); rays.push({ m, ph: i * 0.8 });
    }
    return { group: g, update(t) { rays.forEach(({ m, ph }) => { m.material.opacity = 0.40 + 0.22 * Math.sin(t * 0.6 + ph); m.rotation.z += Math.sin(t * 0.3 + ph) * 0.0004; }); } };
  }
  function fogBank({ p = [0, 0, 0], n = 6, color = 'rgba(120,150,200,1)', spread = 12, y = 0.6, r = 4 }) {
    const g = new THREE.Group(); g.position.set(...p); const ps = [];
    for (let i = 0; i < n; i++) {
      const sp = K.glow({ p: [0, 0, 0], r, color, o: 0.05 });
      g.add(sp); ps.push({ sp, off: i / n, ph: i * 1.7 });
    }
    return { group: g, update(t) { ps.forEach(({ sp, off, ph }) => { sp.position.set(-spread / 2 + ((off + t * 0.012) % 1) * spread, y + Math.sin(t * 0.3 + ph) * 0.2, -2 + Math.sin(ph) * 3); sp.material.opacity = 0.035 + 0.022 * Math.sin(t * 0.4 + ph); }); } };
  }
  function embers({ bounds = [-5, 5, 0, 6, -4, 2], n = 24, color = 'rgba(255,170,90,1)' }) {
    const g = new THREE.Group(); const ps = []; const R = rnd(31);
    for (let i = 0; i < n; i++) { const sp = K.glow({ p: [0, 0, 0], r: 0.05 + R() * 0.06, color, o: 0.28 }); g.add(sp); ps.push({ sp, off: R(), x: R(), z: R(), sw: R() * TAU }); }
    return {
      group: g, update(t, { intensity = 1 } = {}) {
        ps.forEach(({ sp, off, x, z, sw }) => {
          const u = ((t * 0.12 + off) % 1);
          sp.position.set(bounds[0] + x * (bounds[1] - bounds[0]) + Math.sin(t * 0.8 + sw) * 0.4, bounds[2] + u * (bounds[3] - bounds[2]), bounds[4] + z * (bounds[5] - bounds[4]));
          sp.material.opacity = intensity * Math.sin(u * Math.PI) * 0.30;
        });
      },
    };
  }

  // Dense ambient life for the quiet talking-head scenes. The visual gate counts
  // a frame dead when BOTH camera flow and local residual motion are ~0; sparse
  // embers (n~20, r~0.08, o~0.3) cover <0.2% of the frame and never clear the 1%
  // local-motion floor. These are bigger, brighter and faster so a handful in
  // frame always reads as drifting cursed-energy residue / ice / city dust.
  function motes({ bounds = [-5, 5, 0.2, 5.5, -3, 3], n = 80, color = 'rgba(150,210,255,1)', r = 0.2, speed = 0.28, o = 0.5 }) {
    const g = new THREE.Group(); const ps = []; const R = rnd(97);
    for (let i = 0; i < n; i++) {
      const sp = K.glow({ p: [0, 0, 0], r: r * (0.6 + R() * 0.8), color, o });
      g.add(sp); ps.push({ sp, off: R(), x: R(), z: R(), sw: R() * TAU, v: 0.7 + R() * 0.6 });
    }
    return {
      group: g, update(t, { intensity = 1 } = {}) {
        ps.forEach(({ sp, off, x, z, sw, v }) => {
          const u = ((t * speed * v + off) % 1);
          sp.position.set(bounds[0] + x * (bounds[1] - bounds[0]) + Math.sin(t * 0.9 + sw) * 0.5, bounds[2] + u * (bounds[3] - bounds[2]), bounds[4] + z * (bounds[5] - bounds[4]));
          sp.material.opacity = intensity * Math.sin(u * Math.PI) * o;
        });
      },
    };
  }

  /* ---------------- lighting rigs ---------------- */
  function rig(sc, kind) {
    const out = {};
    if (kind === 'void') {
      sc.add(new THREE.HemisphereLight(0x2a3f7a, 0x0a0a18, 0.55));
      const key = new THREE.DirectionalLight(0x9fd0ff, 0.85); key.position.set(-5, 8, 6); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.bias = -0.0006; sc.add(key);
      const rim = new THREE.PointLight(0x66e4ff, 1.6, 16, 2); rim.position.set(2.5, 2.4, -3); sc.add(rim);
      out.key = key; out.rim = rim;
    } else if (kind === 'lab') {
      sc.add(new THREE.HemisphereLight(0x7f9fd0, 0x141824, 0.65));
      const key = new THREE.DirectionalLight(0xdce9ff, 0.9); key.position.set(4, 9, 5); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 14; key.shadow.camera.bottom = -14; key.shadow.bias = -0.0006; sc.add(key);
      const scr = new THREE.PointLight(0x66b4ff, 1.1, 20, 2); scr.position.set(0, 3, -8); sc.add(scr);
      out.key = key; out.screen = scr;
    } else if (kind === 'space') {
      sc.add(new THREE.HemisphereLight(0x35507f, 0x05060c, 0.35));
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.5); sun.position.set(9, 6, 7); sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14; sun.shadow.bias = -0.0006; sc.add(sun);
      const bounce = new THREE.PointLight(0x5f9fe0, 0.7, 30, 2); bounce.position.set(-6, -3, 4); sc.add(bounce);
      out.sun = sun;
    } else if (kind === 'heat') {
      sc.add(new THREE.HemisphereLight(0x6a2a20, 0x140806, 0.55));
      const key = new THREE.DirectionalLight(0xffb08a, 0.8); key.position.set(-4, 7, 5); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.bias = -0.0006; sc.add(key);
      const fire = new THREE.PointLight(0xff5a28, 2.2, 14, 2); fire.position.set(0, 1.4, 1.6); sc.add(fire);
      out.key = key; out.fire = fire;
    } else if (kind === 'six') {
      sc.add(new THREE.HemisphereLight(0x2f5f8f, 0x08101c, 0.5));
      const key = new THREE.DirectionalLight(0xdff4ff, 1.0); key.position.set(3, 8, 6); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.bias = -0.0006; sc.add(key);
      const eye = new THREE.PointLight(0x66e4ff, 2.6, 12, 2); eye.position.set(0, 2.3, 1.2); sc.add(eye);
      out.key = key; out.eye = eye;
    } else if (kind === 'street') {
      sc.add(new THREE.HemisphereLight(0x2b3a5e, 0x101018, 0.5));
      const moon = new THREE.DirectionalLight(0xa8c4ff, 0.55); moon.position.set(-7, 11, 5); moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024); moon.shadow.camera.left = -14; moon.shadow.camera.right = 14; moon.shadow.camera.top = 14; moon.shadow.camera.bottom = -14; moon.shadow.bias = -0.0006; sc.add(moon);
      const lamp = new THREE.PointLight(0xffc070, 1.5, 16, 2); lamp.position.set(0, 3.6, 2.1); sc.add(lamp);
      out.moon = moon; out.lamp = lamp;
    }
    return out;
  }

  return { gojo, voidDome, infinityShell, coffin, tokyo, missionControl, spaceRig, evaSuit, thermos, heatColumn, atomStream, brainHolo, hud, street, phone, godRays, fogBank, embers, motes, rig };
};
