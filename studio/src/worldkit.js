// worldkit.js — Round 11 production world kit. EXTENDS StickWorld (does not replace it).
// Ported/adapted from Stick3D-Pack engine/src/style/extra.tsx (Catmull-Rom camera, lit-window
// buildings, glow, canvas planes, hand-glued props) + new pottery-village props and atmosphere.
// Browser-side classic script: window.WorldKit(THREE, W) where W = a StickWorld instance.
window.WorldKit = function (THREE, W) {
  const INK = W.INK;
  const ramp = W.ramp;

  /* ---------- additive glow sprite ---------- */
  function glow({ p = [0, 0, 0], r = 1, color = 'rgba(255,230,160,1)', o = 0.5 }) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    rg.addColorStop(0, color); rg.addColorStop(0.4, color.replace(/[\d.]+\)$/, (0.5 * o) + ')')); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: o }));
    sp.position.set(p[0], p[1], p[2]); sp.scale.set(r * 2, r * 2, 1); return sp;
  }

  /* ---------- canvas plane (signs, window grids, painted surfaces) ---------- */
  function canvasPlane({ p = [0, 0, 0], s = [1, 1], rot = [0, 0, 0], px = [256, 256], draw, frame = null, transparent = false }) {
    const c = document.createElement('canvas'); c.width = px[0]; c.height = px[1]; const g = c.getContext('2d');
    draw(g, px[0], px[1]);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), new THREE.MeshBasicMaterial({ map: tex, transparent, side: THREE.DoubleSide }));
    m.position.set(p[0], p[1], p[2]); m.rotation.set(rot[0], rot[1], rot[2]);
    const grp = new THREE.Group(); grp.add(m);
    if (frame) {
      // -0.01 put the frame box's FRONT face at exactly z=0, coplanar with the screen
      // plane: the two z-fought along the quad's triangle diagonal and half of every
      // framed display rendered as flat frame colour. Seat it clearly behind instead.
      const fr = W.box({ p: [0, 0, -0.04], s: [s[0] + 0.06, s[1] + 0.06, 0.02], color: frame, ink: 0.02 });
      grp.add(fr);
    }
    grp.position.set(p[0], p[1], p[2]); m.position.set(0, 0, 0);
    return grp;
  }

  /* ---------- village hut (door, window, chimney, roof) ---------- */
  function hut({ p = [0, 0, 0], s = 1, wall = '#d8b078', roof = '#9a5f3b', rotY = 0 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s); g.rotation.y = rotY;
    g.add(W.box({ p: [0, 0.85, 0], s: [2.2, 1.7, 1.9], color: wall }));
    g.add(W.cone({ p: [0, 2.35, 0], r: 1.85, h: 1.4, color: roof, seg: 4, rot: [0, Math.PI / 4, 0] }));
    g.add(W.box({ p: [0, 0.62, 0.97], s: [0.55, 1.15, 0.06], color: '#5a3a22' })); // door
    g.add(W.box({ p: [0.72, 1.05, 0.97], s: [0.5, 0.5, 0.05], color: '#ffe9a8', ink: 0.03 })); // lit window
    g.add(W.box({ p: [-0.7, 2.5, -0.3], s: [0.35, 0.9, 0.35], color: '#8a6a4a' })); // chimney
    return g;
  }

  /* ---------- lit-window building (from extra.tsx) ---------- */
  function building({ p = [0, 0, 0], s = [3, 6, 3], color = '#c9a26b', face = '+z', seed = 1, lit = 0.4, trim = '#7a5a3a' }) {
    const [w, h, d] = s; const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.box({ p: [0, h / 2, 0], s, color }));
    g.add(W.box({ p: [0, h + 0.18, 0], s: [w + 0.3, 0.36, d + 0.3], color: trim, ink: 0.03 }));
    const fw = face === '+z' ? w : d;
    const fp = face === '+z' ? [0, h / 2, d / 2 + 0.03] : face === '+x' ? [w / 2 + 0.03, h / 2, 0] : [-w / 2 - 0.03, h / 2, 0];
    const fr = face === '+z' ? [0, 0, 0] : face === '+x' ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];
    g.add(canvasPlane({ p: fp, rot: fr, s: [fw * 0.94, h * 0.94], px: [Math.round(fw * 26), Math.round(h * 26)], transparent: true, draw: (c, Wd, H) => {
      c.clearRect(0, 0, Wd, H); const cw = 20, ch = 28; let n = seed * 17;
      for (let y = 24; y < H - 40; y += ch + 14) for (let x = 14; x < Wd - cw - 6; x += cw + 12) {
        n = (n * 9301 + 49297) % 233280; const on = n / 233280 < lit;
        c.fillStyle = on ? '#ffd770' : 'rgba(30,24,60,.72)'; c.fillRect(x, y, cw, ch);
        c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x, y, cw, ch);
      }
    } }));
    return g;
  }

  /* ---------- trees ---------- */
  function tree({ p = [0, 0, 0], s = 1, kind = 'round' }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
    g.add(W.cyl({ p: [0, 0.8, 0], rt: 0.16, rb: 0.24, h: 1.6, color: '#7a4a2b' }));
    if (kind === 'pine') { g.add(W.cone({ p: [0, 2.1, 0], r: 1.0, h: 1.9, color: '#3f7d4e' })); g.add(W.cone({ p: [0, 3.0, 0], r: 0.7, h: 1.4, color: '#4a8f5a' })); }
    else if (kind === 'palm') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(W.cone({ p: [Math.sin(a) * 0.7, 2.5, Math.cos(a) * 0.7], r: 0.16, h: 1.5, color: '#4a8f5a', rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] })); } g.add(W.ball({ p: [0, 2.4, 0], r: 0.3, color: '#8a5a3b' })); }
    else { g.add(W.ball({ p: [0, 2.2, 0], r: 1.05, color: '#4a8f5a', s: [1, 0.9, 1] })); g.add(W.ball({ p: [0.5, 2.6, 0.2], r: 0.7, color: '#5aa06a' })); g.add(W.ball({ p: [-0.5, 2.5, -0.2], r: 0.65, color: '#3f7d4e' })); }
    return g;
  }

  /* ---------- market stall (awning + table + goods) ---------- */
  function marketStall({ p = [0, 0, 0], rotY = 0, awning = '#c0392b', goods = 'pottery' }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = rotY;
    g.add(W.box({ p: [0, 0.9, 0], s: [2.4, 0.12, 1.2], color: '#8a5a32' })); // table top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(W.box({ p: [sx * 1.05, 0.45, sz * 0.5], s: [0.12, 0.9, 0.12], color: '#6b4226' }));
    for (const sx of [-1, 1]) g.add(W.cyl({ p: [sx * 1.15, 1.5, -0.55], rt: 0.06, h: 1.3, color: '#6b4226' }));
    g.add(W.box({ p: [0, 2.2, -0.3], s: [2.7, 0.08, 1.6], color: awning, rot: [0.18, 0, 0] })); // awning
    g.add(W.box({ p: [0, 2.28, 0.45], s: [2.7, 0.3, 0.06], color: awning }));
    if (goods === 'pottery') { g.add(pot({ p: [-0.7, 0.96, 0], s: 0.5, color: '#b0713f' })); g.add(pot({ p: [0, 0.96, 0.1], s: 0.6, color: '#9a5f33' })); g.add(pot({ p: [0.7, 0.96, -0.1], s: 0.45, color: '#c08050' })); }
    else if (goods === 'fruit') { for (let i = 0; i < 6; i++) g.add(W.ball({ p: [-0.8 + (i % 3) * 0.6, 1.05, -0.2 + Math.floor(i / 3) * 0.4], r: 0.16, color: i % 2 ? '#e67e22' : '#c0392b' })); }
    else if (goods === 'cloth') { for (let i = 0; i < 3; i++) g.add(W.box({ p: [-0.7 + i * 0.7, 1.02, 0], s: [0.5, 0.18, 0.7], color: ['#8e44ad', '#2980b9', '#16a085'][i] })); }
    return g;
  }

  /* ---------- pottery variants ---------- */
  function pot({ p = [0, 0, 0], s = 1, color = '#b0713f', kind = 'round' }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
    if (kind === 'vase') { g.add(W.ball({ p: [0, 0.4, 0], r: 0.34, color, s: [1, 1.25, 1] })); g.add(W.cyl({ p: [0, 0.85, 0], rt: 0.12, rb: 0.2, h: 0.3, color })); g.add(W.cyl({ p: [0, 1.02, 0], rt: 0.16, rb: 0.12, h: 0.08, color })); }
    else if (kind === 'bowl') { g.add(W.cyl({ p: [0, 0.2, 0], rt: 0.4, rb: 0.22, h: 0.34, color })); }
    else { g.add(W.ball({ p: [0, 0.35, 0], r: 0.35, color, s: [1, 1.1, 1] })); g.add(W.cyl({ p: [0, 0.72, 0], rt: 0.16, rb: 0.2, h: 0.18, color })); }
    return g;
  }

  /* ---------- pottery wheel (animated) ---------- */
  function wheel({ p = [0, 0, 0] }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    g.add(W.cyl({ p: [0, 0.3, 0], rt: 0.42, rb: 0.52, h: 0.6, color: '#8a5a3b' }));
    const disc = W.cyl({ p: [0, 0.66, 0], rt: 0.68, rb: 0.68, h: 0.12, color: '#6b4226' }); g.add(disc);
    const clay = W.cyl({ p: [0, 0.92, 0], rt: 0.22, rb: 0.3, h: 0.42, color: '#b0713f' }); g.add(clay);
    return { group: g, disc, clay, setSpin(a) { disc.rotation.y = a; clay.rotation.y = a; }, setClay(h) { clay.scale.y = h; clay.position.y = 0.72 + 0.21 * h; } };
  }

  /* ---------- kiln (dome, mouth, fire) ---------- */
  function kiln({ p = [0, 0, 0], s = 1 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
    g.add(W.ball({ p: [0, 1.0, 0], r: 1.5, color: '#a86a4a', s: [1, 0.95, 1] }));
    g.add(W.cyl({ p: [0, 0.35, 0], rt: 1.55, rb: 1.7, h: 0.7, color: '#8a5a3b' }));
    g.add(W.box({ p: [0, 2.6, 0], s: [0.5, 1.0, 0.5], color: '#8a5a3b' })); // chimney
    const mouth = W.box({ p: [0, 0.75, 1.42], s: [0.8, 0.9, 0.1], color: '#2a1008', ink: 0.03 }); g.add(mouth);
    const fireGlow = glow({ p: [0, 0.75, 1.55], r: 1.2, color: 'rgba(255,140,40,1)', o: 0.0 }); g.add(fireGlow);
    const embers = []; for (let i = 0; i < 10; i++) { const e = glow({ p: [0, 0.7, 1.5], r: 0.12, color: 'rgba(255,176,64,1)', o: 0 }); g.add(e); embers.push(e); }
    return {
      group: g, mouth, fireGlow,
      setFire(t, intensity) {
        fireGlow.material.opacity = intensity * (0.55 + 0.2 * Math.sin(t * 9));
        fireGlow.scale.setScalar(2.2 * intensity * (1 + 0.08 * Math.sin(t * 13)));
        mouth.children[0].material.color.setHex(intensity > 0.3 ? 0xff6a20 : 0x2a1008);
        embers.forEach((e, i) => { const u = ((t * 0.5 + i / 10) % 1); e.material.opacity = (1 - u) * intensity; e.position.set(Math.sin(i * 2.1) * 0.3, 0.7 + u * 1.6, 1.5 + u * 0.3); e.scale.setScalar((1 - u) * intensity * 0.5 + 0.05); });
      }
    };
  }

  /* ---------- small props ---------- */
  function crate({ p = [0, 0, 0], s = 0.7, color = '#9a6a3a' }) { const g = new THREE.Group(); g.position.set(...p); g.add(W.box({ p: [0, s / 2, 0], s: [s, s, s], color })); g.add(W.box({ p: [0, s / 2, s / 2 + 0.01], s: [s * 0.9, s * 0.12, 0.02], color: '#6b4226', ink: 0.02 })); return g; }
  function barrel({ p = [0, 0, 0], s = 1 }) { const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.add(W.cyl({ p: [0, 0.5, 0], rt: 0.4, rb: 0.4, h: 1.0, color: '#8a5a32' })); g.add(W.cyl({ p: [0, 0.3, 0], rt: 0.42, h: 0.08, color: '#4a3020', ink: 0.02 })); g.add(W.cyl({ p: [0, 0.7, 0], rt: 0.42, h: 0.08, color: '#4a3020', ink: 0.02 })); return g; }
  function sack({ p = [0, 0, 0], s = 1, color = '#c9a86a' }) { const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.add(W.ball({ p: [0, 0.35, 0], r: 0.4, color, s: [1, 0.9, 1] })); g.add(W.cyl({ p: [0, 0.72, 0], rt: 0.1, rb: 0.16, h: 0.16, color: '#8a6a4a' })); return g; }
  function lantern({ p = [0, 0, 0], on = 1, color = '#ffb040' }) { const g = new THREE.Group(); g.position.set(...p); g.add(W.box({ p: [0, 0, 0], s: [0.28, 0.4, 0.28], color: '#3a2a1a', ink: 0.03 })); g.add(W.box({ p: [0, 0, 0], s: [0.2, 0.3, 0.2], color, ink: 0 })); if (on > 0) g.add(glow({ p: [0, 0, 0], r: 0.9, color: 'rgba(255,180,70,1)', o: 0.5 * on })); return g; }
  function fence({ p = [0, 0, 0], w = 3, rotY = 0 }) { const g = new THREE.Group(); g.position.set(...p); g.rotation.y = rotY; const n = Math.round(w / 0.5); for (let i = 0; i <= n; i++) g.add(W.box({ p: [-w / 2 + i * 0.5, 0.5, 0], s: [0.08, 1.0, 0.08], color: '#8a6a4a', ink: 0.02 })); g.add(W.box({ p: [0, 0.75, 0], s: [w, 0.08, 0.06], color: '#8a6a4a', ink: 0.02 })); g.add(W.box({ p: [0, 0.35, 0], s: [w, 0.08, 0.06], color: '#8a6a4a', ink: 0.02 })); return g; }
  function well({ p = [0, 0, 0] }) { const g = new THREE.Group(); g.position.set(...p); g.add(W.cyl({ p: [0, 0.45, 0], rt: 0.8, rb: 0.9, h: 0.9, color: '#9a9a92' })); g.add(W.cyl({ p: [0, 0.95, 0], rt: 0.7, h: 0.1, color: '#3a5a7a', ink: 0.02 })); for (const sx of [-1, 1]) g.add(W.box({ p: [sx * 0.7, 1.5, 0], s: [0.1, 1.2, 0.1], color: '#6b4226' })); g.add(W.cone({ p: [0, 2.3, 0], r: 1.0, h: 0.6, color: '#9a5f3b', seg: 4, rot: [0, Math.PI / 4, 0] })); return g; }
  function cart({ p = [0, 0, 0], rotY = 0 }) { const g = new THREE.Group(); g.position.set(...p); g.rotation.y = rotY; g.add(W.box({ p: [0, 0.7, 0], s: [1.8, 0.5, 1.0], color: '#8a5a32' })); for (const sx of [-1, 1]) g.add(W.cyl({ p: [sx * 0.7, 0.4, 0.55], rt: 0.4, h: 0.1, color: '#4a3020', rot: [Math.PI / 2, 0, 0] })); g.add(W.box({ p: [1.3, 0.8, 0], s: [0.8, 0.08, 0.08], color: '#6b4226', rot: [0, 0, 0.3] })); g.add(sack({ p: [-0.3, 0.95, 0], s: 0.6 })); return g; }
  function bench({ p = [0, 0, 0], rotY = 0 }) { const g = new THREE.Group(); g.position.set(...p); g.rotation.y = rotY; g.add(W.box({ p: [0, 0.72, 0], s: [2.2, 0.12, 0.6], color: '#8a5a32' })); g.add(W.box({ p: [0, 1.15, -0.28], s: [2.2, 0.5, 0.08], color: '#8a5a32' })); for (const sx of [-1, 1]) g.add(W.box({ p: [sx * 0.9, 0.36, 0], s: [0.1, 0.72, 0.5], color: '#4a3020', ink: 0.02 })); return g; }
  function streetLamp({ p = [0, 0, 0], h = 4.5, on = 1 }) { const g = new THREE.Group(); g.position.set(...p); g.add(W.cyl({ p: [0, h / 2, 0], rt: 0.08, rb: 0.13, h, color: '#2b3350', ink: 0.02 })); g.add(W.box({ p: [0.4, h, 0], s: [0.9, 0.08, 0.08], color: '#2b3350', ink: 0.02 })); g.add(W.cyl({ p: [0.8, h - 0.15, 0], rt: 0.12, rb: 0.3, h: 0.3, color: '#ffe9a8', ink: 0.02 })); if (on > 0) g.add(glow({ p: [0.8, h - 0.35, 0], r: 1.3, color: 'rgba(255,220,140,1)', o: 0.5 * on })); return g; }
  function banner({ p = [0, 0, 0], rotY = 0, color = '#c0392b', text = '' }) { const g = new THREE.Group(); g.position.set(...p); g.rotation.y = rotY; g.add(canvasPlane({ p: [0, 0, 0], s: [1.4, 2.2], px: [140, 220], draw: (c, Wd, H) => { c.fillStyle = color; c.fillRect(0, 0, Wd, H); c.strokeStyle = '#ffd770'; c.lineWidth = 8; c.strokeRect(8, 8, Wd - 16, H - 16); c.fillStyle = '#ffd770'; c.font = '900 40px Inter, Arial'; c.textAlign = 'center'; if (text) { c.save(); c.translate(Wd / 2, H / 2); c.fillText(text, 0, 0); c.restore(); } } })); return g; }
  function shelf({ p = [0, 0, 0], w = 2.4, levels = 3 }) { const g = new THREE.Group(); g.position.set(...p); for (const sx of [-1, 1]) g.add(W.box({ p: [sx * w / 2, levels * 0.35, 0], s: [0.1, levels * 0.75, 0.5], color: '#6b4226' })); for (let i = 0; i <= levels; i++) g.add(W.box({ p: [0, 0.2 + i * 0.72, 0], s: [w, 0.08, 0.5], color: '#8a5a32' })); return g; }
  function cloud({ p = [0, 0, 0], s = 1 }) { const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false }); for (const [x, y, r] of [[0, 0, 1], [1, 0.2, 0.8], [-1, 0.1, 0.7], [0.4, 0.5, 0.6]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); b.position.set(x, y, 0); g.add(b); } return g; }
  function mountain({ p = [0, 0, 0], s = 1, color = '#8a9ab0' }) { const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.add(W.cone({ p: [0, 3, 0], r: 6, h: 6, color, seg: 5, ink: 0 })); g.add(W.cone({ p: [0, 5.2, 0], r: 1.6, h: 1.8, color: '#f0f4f8', seg: 5, ink: 0 })); return g; }

  /* ---------- ground detail scatter (fills empty ground: stones, tufts, flowers, shards) ---------- */
  function groundDetail({ area = [-8, 8, -5, 3], n = 34, seed = 1 }) {
    const g = new THREE.Group(); let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < n; i++) {
      const x = area[0] + rnd() * (area[1] - area[0]), z = area[2] + rnd() * (area[3] - area[2]); const k = rnd();
      if (k < 0.4) g.add(W.ball({ p: [x, 0.06, z], r: 0.09 + rnd() * 0.1, color: ['#9a9a92', '#8f8f86', '#a8a89e'][i % 3], s: [1.3, 0.6, 1], ink: 0.02 }));
      else if (k < 0.72) { for (let b = 0; b < 3; b++) g.add(W.cone({ p: [x + (b - 1) * 0.06, 0.12, z], r: 0.03, h: 0.24 + rnd() * 0.1, color: '#5a8f4a', seg: 5, ink: 0 })); }
      else if (k < 0.9) { g.add(W.cyl({ p: [x, 0.1, z], rt: 0.015, h: 0.2, color: '#4a7a3a', ink: 0 })); g.add(W.ball({ p: [x, 0.24, z], r: 0.06, color: ['#e86a8a', '#ffd770', '#c084fc', '#ff8f50'][i % 4], ink: 0.01 })); }
      else g.add(W.box({ p: [x, 0.03, z], s: [0.14, 0.05, 0.1], color: '#b0713f', rot: [0, rnd() * 3, 0], ink: 0.01 }));
    }
    return g;
  }

  /* ---------- ornate masterpiece vase (lathe silhouette + zellige band texture + handles) ---------- */
  function masterpiece({ p = [0, 0, 0], s = 1 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(s);
    const profile = [[0.001, 0], [0.3, 0], [0.44, 0.08], [0.52, 0.34], [0.46, 0.66], [0.3, 0.92], [0.18, 1.08], [0.2, 1.22], [0.3, 1.32], [0.27, 1.4]].map(([x, y]) => new THREE.Vector2(x, y));
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const cx = c.getContext('2d');
    cx.fillStyle = '#f2e6c8'; cx.fillRect(0, 0, 512, 256);
    // decorative bands (zellige-style stars + teal/gold geometry)
    const band = (y, h, col) => { cx.fillStyle = col; cx.fillRect(0, y, 512, h); };
    band(20, 26, '#1f7a6d'); band(110, 36, '#c9962e'); band(200, 26, '#1f7a6d');
    cx.fillStyle = '#f2e6c8';
    for (let x = 0; x < 512; x += 40) { cx.save(); cx.translate(x + 20, 128); cx.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = k % 2 ? 7 : 15; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } cx.closePath(); cx.fill(); cx.restore(); }
    cx.fillStyle = '#0b3a34'; for (let x = 0; x < 512; x += 32) { cx.beginPath(); cx.moveTo(x + 16, 24); cx.lineTo(x + 26, 33); cx.lineTo(x + 16, 42); cx.lineTo(x + 6, 33); cx.closePath(); cx.fill(); cx.beginPath(); cx.moveTo(x + 16, 204); cx.lineTo(x + 26, 213); cx.lineTo(x + 16, 222); cx.lineTo(x + 6, 213); cx.closePath(); cx.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), new THREE.MeshToonMaterial({ map: tex, gradientMap: ramp })); body.castShadow = true; g.add(body);
    const ink = new THREE.Mesh(new THREE.LatheGeometry(profile.map(v => new THREE.Vector2(v.x + 0.025, v.y)), 40), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })); g.add(ink);
    // handles
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 10, 18, Math.PI * 1.2), new THREE.MeshToonMaterial({ color: '#c9962e', gradientMap: ramp })); h.position.set(sx * 0.42, 0.95, 0); h.rotation.z = sx * 0.5; h.castShadow = true; g.add(h); }
    return g;
  }

  /* ---------- atmosphere ---------- */
  function skyDome({ top = '#7ec2ee', mid = '#bfe0f5', bottom = '#f3e2c0', r = 70 }) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, top); grad.addColorStop(0.6, mid); grad.addColorStop(1, bottom);
    g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  }
  function stars({ n = 120, r = 60 }) {
    const g = new THREE.Group(); const mats = [];
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399) % (Math.PI * 2), e = 0.15 + ((i * 0.618) % 1) * 1.2;
      const x = Math.cos(a) * Math.cos(e) * r, y = Math.sin(e) * r, z = Math.sin(a) * Math.cos(e) * r;
      const sp = glow({ p: [x, y, z], r: 0.35 + (i % 3) * 0.2, color: 'rgba(255,255,240,1)', o: 0.7 }); g.add(sp); mats.push(sp);
    }
    return { group: g, update(t) { mats.forEach((s, i) => { s.material.opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i)); }); } };
  }
  function dustMotes({ bounds = [-6, 6, 0.3, 4, -4, 4], n = 40, color = 'rgba(255,240,200,1)' }) {
    const g = new THREE.Group(); const ps = [];
    for (let i = 0; i < n; i++) { const sp = glow({ p: [0, 0, 0], r: 0.06 + (i % 3) * 0.03, color, o: 0.35 }); g.add(sp); ps.push({ sp, seed: i }); }
    return { group: g, update(t) { ps.forEach(({ sp, seed }) => { const u = (t * 0.05 + seed * 0.1) % 1; sp.position.set(bounds[0] + ((seed * 0.37) % 1) * (bounds[1] - bounds[0]) + Math.sin(t * 0.5 + seed) * 0.3, bounds[2] + u * (bounds[3] - bounds[2]), bounds[4] + ((seed * 0.71) % 1) * (bounds[5] - bounds[4])); sp.material.opacity = 0.25 * Math.sin(u * Math.PI); }); } };
  }

  /* ---------- lighting presets ---------- */
  function dayLight(sc) {
    sc.add(new THREE.HemisphereLight(0xcfe8ff, 0x9a7b4f, 0.8));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.2); key.position.set(6, 10, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 14; key.shadow.camera.bottom = -14; key.shadow.bias = -0.0005; sc.add(key);
    return key;
  }
  function nightLight(sc) {
    sc.add(new THREE.HemisphereLight(0x2a3a6a, 0x1a1428, 0.5));
    const moon = new THREE.DirectionalLight(0x9ab8ff, 0.5); moon.position.set(-8, 12, -6); moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024); moon.shadow.camera.left = -14; moon.shadow.camera.right = 14; moon.shadow.camera.top = 14; moon.shadow.camera.bottom = -14; moon.shadow.bias = -0.0005; sc.add(moon);
    const warm = new THREE.PointLight(0xff8030, 1.4, 18, 2); warm.position.set(0, 1.5, 2); sc.add(warm);
    return { moon, warm };
  }
  function warmInterior(sc) {
    sc.add(new THREE.HemisphereLight(0xffe8c0, 0x6a4a2a, 0.65));
    const key = new THREE.DirectionalLight(0xffd9a0, 1.0); key.position.set(3, 6, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10; key.shadow.bias = -0.0005; sc.add(key);
    const lamp = new THREE.PointLight(0xffb060, 1.0, 12, 2); lamp.position.set(-2, 3, 1); sc.add(lamp);
    return key;
  }

  /* ---------- Catmull-Rom cinematic camera (ported from extra.tsx camAt/Cam) ---------- */
  const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  const smooth = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;
  function camAt(t, keys) {
    const n = keys.length; if (t <= keys[0].t) return keys[0]; if (t >= keys[n - 1].t) return keys[n - 1];
    let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
    let u = (t - keys[i].t) / (keys[i + 1].t - keys[i].t);
    if (n === 2) u = smooth(u); else if (i === 0) u = 2 * u * u - u * u * u; else if (i === n - 2) u = u + u * u - u * u * u;
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(n - 1, i + 2)];
    const v = (k) => [0, 1, 2].map((j) => cr(a[k][j], b[k][j], c[k][j], d[k][j], u));
    return { t, pos: v('pos'), look: v('look'), fov: lerp(b.fov ?? 42, c.fov ?? 42, smooth(u)), roll: lerp(b.roll ?? 0, c.roll ?? 0, smooth(u)) };
  }
  function catmullCam({ aspect = 720 / 1280, keys = [] }) {
    const cam = new THREE.PerspectiveCamera(keys[0]?.fov ?? 42, aspect, 0.1, 200);
    function at(t, { handheld = 0.004, impacts = [], fovKick = [] } = {}) {
      const k = camAt(t, keys);
      let sh = 0; for (const [ti, a] of impacts) if (t >= ti && t < ti + 0.5) sh += a * Math.exp(-(t - ti) * 9);
      let fk = 0; for (const ti of fovKick) if (t >= ti) fk += Math.exp(-(t - ti) * 5) * Math.min(1, (t - ti) / 0.06);
      const h = handheld;
      cam.position.set(k.pos[0] + Math.sin(t * 1.7) * h + Math.sin(t * 57) * sh, k.pos[1] + Math.sin(t * 2.3 + 1) * h + Math.cos(t * 49) * sh, k.pos[2] + Math.sin(t * 1.3) * h);
      cam.fov = (k.fov ?? 42) - fk * 5; cam.updateProjectionMatrix();
      cam.up.set(Math.sin(k.roll ?? 0), Math.cos(k.roll ?? 0), 0);
      cam.lookAt(k.look[0], k.look[1], k.look[2]);
    }
    return { cam, at };
  }
  // local IK hand target (same units as puppet Pose.armR) for a puppet of height h
  function hand(h, tgt, sq = 0, flip = false, dz = 0.06) { return [(flip ? -1 : 1) * tgt[0] * h * (1 - sq * 0.55), tgt[1] * h * (1 + sq), dz]; }

  return { INK, glow, canvasPlane, hut, building, tree, marketStall, pot, wheel, kiln, crate, barrel, sack, lantern, fence, well, cart, bench, streetLamp, banner, shelf, cloud, mountain, groundDetail, masterpiece, skyDome, stars, dustMotes, dayLight, nightLight, warmInterior, catmullCam, camAt, hand };
};
