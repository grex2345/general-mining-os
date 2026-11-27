// stickworld.js — 3D toon world helpers (ported/adapted from Stick3D-Pack toon.tsx + extra.tsx).
// Browser-side classic script: window.StickWorld(THREE) -> factories. Architecture matches the
// references: 2D canvas puppet (puppet2d.js) on an UPRIGHT billboard inside a 3D toon world with
// ink-outlined primitives, canvas-textured surfaces, soft contact shadows, cinematic camera.
window.StickWorld = function (THREE) {
  const INK = window.PUPPET_INK || "#0b0d1a";
  const ramp = (() => { const d = new Uint8Array([90, 170, 255]); const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
  const toonMat = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  const inkMat = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  function box({ p = [0, 0, 0], s = [1, 1, 1], color = "#ffffff", rot = [0, 0, 0], ink = 0.04 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.set(rot[0], rot[1], rot[2]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), toonMat(color)); m.castShadow = true; m.receiveShadow = true; g.add(m);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(s[0] + ink, s[1] + ink, s[2] + ink), inkMat()));
    return g;
  }
  function ball({ p = [0, 0, 0], r = 0.5, color = "#ffffff", s = [1, 1, 1], ink = 0.035 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.scale.set(s[0], s[1], s[2]);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), toonMat(color)); m.castShadow = true; g.add(m);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r + ink, 22, 16), inkMat()));
    return g;
  }
  function cyl({ p = [0, 0, 0], rt = 0.5, rb, h = 1, color = "#ffffff", rot = [0, 0, 0], ink = 0.035 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.set(rot[0], rot[1], rot[2]);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb ?? rt, h, 22), toonMat(color)); m.castShadow = true; m.receiveShadow = true; g.add(m);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(rt + ink, (rb ?? rt) + ink, h + ink, 22), inkMat()));
    return g;
  }
  function cone({ p = [0, 0, 0], r = 0.5, h = 1, color = "#ffffff", seg = 18, rot = [0, 0, 0], ink = 0.035 }) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.set(rot[0], rot[1], rot[2]);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), toonMat(color)); m.castShadow = true; g.add(m);
    g.add(new THREE.Mesh(new THREE.ConeGeometry(r + ink, h + ink, seg), inkMat()));
    return g;
  }

  function patternTex(kind, a, b, rep) {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.fillStyle = a; g.fillRect(0, 0, 256, 256); g.strokeStyle = INK; g.lineWidth = 5;
    if (kind === "brick") { for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { g.fillStyle = (r + k) % 2 ? a : b; g.fillRect(k * 128 + (r % 2) * 64, r * 64, 128, 64); } for (let r = 0; r <= 4; r++) { g.beginPath(); g.moveTo(0, r * 64); g.lineTo(256, r * 64); g.stroke(); } for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const x = k * 128 + (r % 2) * 64; g.beginPath(); g.moveTo(x, r * 64); g.lineTo(x, r * 64 + 64); g.stroke(); } }
    if (kind === "wood" || kind === "plank") { const horiz = kind === "plank"; for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? a : b; if (horiz) g.fillRect(0, k * 64, 256, 64); else g.fillRect(k * 64, 0, 64, 256); g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 3; for (let y = 10; y < 256; y += 34) { g.beginPath(); if (horiz) { g.moveTo(10, k * 64 + (y % 50)); g.bezierCurveTo(80, k * 64 + (y % 50) - 6, 170, k * 64 + (y % 50) + 6, 246, k * 64 + (y % 50)); } else { g.moveTo(k * 64 + 8, y); g.bezierCurveTo(k * 64 + 24, y - 8, k * 64 + 40, y + 10, k * 64 + 58, y); } g.stroke(); } g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); if (horiz) { g.moveTo(0, k * 64); g.lineTo(256, k * 64); } else { g.moveTo(k * 64, 0); g.lineTo(k * 64, 256); } g.stroke(); } }
    if (kind === "tile" || kind === "marble") { g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); g.strokeStyle = kind === "marble" ? "rgba(0,0,0,.35)" : INK; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke(); }
    if (kind === "carpet") { g.fillStyle = b; for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) if (((x + y) / 64) % 2 === 0) g.fillRect(x, y, 64, 64); g.strokeStyle = "rgba(0,0,30,.35)"; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256); }
    if (kind === "grass") { g.fillStyle = b; for (let i = 0; i < 40; i++) { const x = (i * 53) % 256, y = (i * 97) % 256; g.fillRect(x, y, 3, 9); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function surface({ p = [0, 0, 0], s = [10, 10], rot = [-Math.PI / 2, 0, 0], kind = "plain", a = "#cccccc", b = "#bbbbbb", unit = 1.6 }) {
    const mat = kind === "plain" ? new THREE.MeshToonMaterial({ color: a, gradientMap: ramp }) : new THREE.MeshBasicMaterial({ map: patternTex(kind, a, b, [s[0] / unit, s[1] / unit]) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), mat); m.position.set(p[0], p[1], p[2]); m.rotation.set(rot[0], rot[1], rot[2]); m.receiveShadow = true; return m;
  }
  function shadow({ p = [0, 0, 0], r = 0.6, o = 0.4 }) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62); rg.addColorStop(0, `rgba(0,0,0,${o})`); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.position.set(p[0], p[1] + 0.02, p[2]); m.rotation.x = -Math.PI / 2; return m;
  }
  // Upright (yaw-only) billboard: feet stay on the floor; redraws the 2D puppet each frame.
  function billboard({ p = [0, 0, 0], h = 2.4, look = {} }) {
    const W = 512, H = 768; const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = new THREE.Group(); g.position.set(p[0], p[1] + h * 0.483, p[2]);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(h * W / H, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02 })));
    // Face the camera from the group's CURRENT position, not the construction
    // position `p`. Using `p` meant a moved actor kept facing as if it still
    // stood where it was created; once the camera crossed to the other side the
    // plane turned back-facing and the character vanished entirely (Round 13
    // stairs shot: only her hammer was visible for the last 0.4 s). Actors that
    // never move are unaffected, so Round 11 renders identically.
    return { group: g, update(camera, pose) { window.drawPuppet(ctx, W, H, look, pose); tex.needsUpdate = true; g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z); } };
  }
  // Cinematic camera: smoothstep keyframes (pos/look/fov) + micro-handheld + optional impact shake.
  function cineCam({ aspect = 720 / 1280, keys = [] }) {
    const cam = new THREE.PerspectiveCamera(keys[0]?.fov ?? 40, aspect, 0.1, 120);
    const sm = (x) => x * x * (3 - 2 * x);
    function at(t, { handheld = 0.004, shake = 0 } = {}) {
      let i = 0; while (i < keys.length - 1 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
      const span = Math.max(1e-4, b.t - a.t), u = sm(Math.min(1, Math.max(0, (t - a.t) / span)));
      const L = (x, y) => x + (y - x) * u;
      const px = L(a.pos[0], b.pos[0]), py = L(a.pos[1], b.pos[1]), pz = L(a.pos[2], b.pos[2]);
      const lx = L(a.look[0], b.look[0]), ly = L(a.look[1], b.look[1]), lz = L(a.look[2], b.look[2]);
      cam.position.set(px + Math.sin(t * 1.7) * handheld + (Math.random() - 0.5) * shake, py + Math.sin(t * 2.3 + 1) * handheld, pz + Math.cos(t * 1.3) * handheld);
      cam.lookAt(lx, ly, lz);
      cam.fov = L(a.fov ?? 40, b.fov ?? 40); cam.updateProjectionMatrix();
    }
    return { cam, at };
  }
  return { INK, ramp, toonMat, box, ball, cyl, cone, patternTex, surface, shadow, billboard, cineCam };
};
