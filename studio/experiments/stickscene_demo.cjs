// stickscene_demo.cjs — reference-architecture demo: 2D acting puppet billboard in a 3D toon
// world (ink-outlined props, textured ground, soft shadows, gradient sky, cinematic camera).
// Proves the ported Stick3D pipeline renders headless. Round 10 engine development.
// Run: LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle FRAMES=240 node studio/experiments/stickscene_demo.cjs
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUTDIR = '/tmp/stickframes'; fs.mkdirSync(OUTDIR, { recursive: true });
const N = parseInt(process.env.FRAMES || '240', 10);
const FPS = 30;

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280 });
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: `${DIR}/node_modules/three/build/three.min.js` });
  await page.addScriptTag({ path: `${ROOT}/studio/src/puppet2d.js` });
  await page.addScriptTag({ path: `${ROOT}/studio/src/stickworld.js` });
  await page.waitForFunction('window.THREE && window.drawPuppet && window.StickWorld', { timeout: 15000 });

  await page.evaluate(() => {
    const T = window.THREE, W = window.StickWorld(T);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(720, 1280); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.outputEncoding = T.sRGBEncoding;
    document.body.appendChild(r.domElement);
    const sc = new T.Scene(); sc.fog = new T.Fog(0xbfe0f5, 22, 60);
    // gradient sky dome
    const skyC = document.createElement('canvas'); skyC.width = 16; skyC.height = 256; const sg = skyC.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#7ec2ee'); grad.addColorStop(0.6, '#bfe0f5'); grad.addColorStop(1, '#f3e2c0'); sg.fillStyle = grad; sg.fillRect(0, 0, 16, 256);
    const skyTex = new T.CanvasTexture(skyC); skyTex.colorSpace = T.SRGBColorSpace;
    sc.add(new T.Mesh(new T.SphereGeometry(70, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false })));
    // lights
    sc.add(new T.HemisphereLight(0xcfe8ff, 0x9a7b4f, 0.75));
    const key = new T.DirectionalLight(0xfff1d6, 1.15); key.position.set(6, 10, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.bias = -0.0005; sc.add(key);
    // ground
    sc.add(W.surface({ p: [0, 0, 0], s: [80, 80], kind: 'grass', a: '#c9a86a', b: '#b8965a', unit: 3 }));
    // sun
    sc.add(W.ball({ p: [-18, 22, -30], r: 3, color: '#ffe9a8', ink: 0.0 }));
    // huts
    function hut(x, z, s = 1) { const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); sc.add(g); g.add(W.box({ p: [0, 0.8, 0], s: [2, 1.6, 1.8], color: '#c9a26b' })); g.add(W.cone({ p: [0, 2.1, 0], r: 1.7, h: 1.3, color: '#8a5a3b', seg: 4, rot: [0, Math.PI / 4, 0] })); g.add(W.box({ p: [0, 0.6, 0.92], s: [0.5, 1.0, 0.06], color: '#5a3a22' })); }
    hut(-5, -6, 1.1); hut(5.5, -7, 1.3); hut(-1, -10, 1.5);
    // trees
    function tree(x, z, s = 1) { const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); sc.add(g); g.add(W.cyl({ p: [0, 0.7, 0], rt: 0.16, rb: 0.22, h: 1.4, color: '#7a4a2b' })); g.add(W.cone({ p: [0, 2.0, 0], r: 1.0, h: 2.0, color: '#3f7d4e' })); g.add(W.cone({ p: [0, 2.9, 0], r: 0.7, h: 1.4, color: '#4a8f5a' })); }
    tree(-7, -2, 1.2); tree(7, -3, 1.4); tree(3, -9, 1.1); tree(-9, -8, 1.6);
    // pottery wheel + clay + finished pots
    const wheel = new T.Group(); wheel.position.set(1.7, 0, 0.4); sc.add(wheel);
    wheel.add(W.cyl({ p: [0, 0.3, 0], rt: 0.4, rb: 0.5, h: 0.6, color: '#8a5a3b' }));
    const disc = W.cyl({ p: [0, 0.65, 0], rt: 0.65, rb: 0.65, h: 0.12, color: '#6b4226' }); wheel.add(disc);
    const clay = W.cyl({ p: [0, 0.9, 0], rt: 0.22, rb: 0.3, h: 0.4, color: '#b0713f' }); wheel.add(clay);
    function pot(x, z, s) { const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); sc.add(g); g.add(W.ball({ p: [0, 0.35, 0], r: 0.35, color: '#b0713f', s: [1, 1.1, 1] })); g.add(W.cyl({ p: [0, 0.72, 0], rt: 0.16, rb: 0.2, h: 0.18, color: '#9a5f33' })); }
    pot(-1.6, 0.8, 1); pot(-2.2, 0.3, 0.8); pot(-1.2, 1.4, 0.7); pot(2.8, 1.2, 0.9);
    // rocks
    sc.add(W.ball({ p: [3.5, 0.2, 2], r: 0.3, color: '#9a9a92', s: [1.3, 0.7, 1] }));
    sc.add(W.ball({ p: [-3.2, 0.15, 2.5], r: 0.22, color: '#8f8f86', s: [1.4, 0.6, 1] }));
    // puppet + contact shadow
    const puppet = W.billboard({ p: [0, 0, 0], h: 2.5, look: { skin: '#f1c9a5', body: '#2a9d8f', outfit: 'shirt', hair: 'short', hairColor: '#2a1a12', shoe: '#33415c' } });
    sc.add(puppet.group); sc.add(W.shadow({ p: [0, 0, 0], r: 0.7, o: 0.4 }));
    // cinematic camera keyframes (wide -> push -> side medium -> close-up -> pull back)
    const { cam, at } = W.cineCam({ keys: [
      { t: 0, pos: [0, 2.4, 10], look: [0, 1.3, 0], fov: 46 },
      { t: 2, pos: [0, 1.9, 6.5], look: [0, 1.4, 0], fov: 42 },
      { t: 4, pos: [3.0, 1.7, 4.8], look: [0.4, 1.5, 0], fov: 38 },
      { t: 6, pos: [0.7, 2.1, 3.4], look: [0, 2.0, 0], fov: 30 },
      { t: 8, pos: [0, 2.6, 9], look: [0, 1.3, 0], fov: 47 },
    ] });
    window.__w = { r, sc, cam, at, puppet, disc, clay };
  });

  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate((i, N, FPS) => {
      const { r, sc, cam, at, puppet, disc, clay } = window.__w;
      const t = i / FPS;
      // acting sequence: idle -> point -> shock(sweat) -> celebrate
      let pose = { t: i, mood: 'smile', arms: 'down' };
      if (t >= 2 && t < 4) pose = { t: i, mood: 'grin', arms: 'point', lookX: 0.6 };
      else if (t >= 4 && t < 6) pose = { t: i, mood: 'shock', arms: 'head', nerv: 0.7, sweat: 0.8 };
      else if (t >= 6) pose = { t: i, mood: 'laugh', arms: 'up', squash: 0.04 * Math.sin(i * 0.5) };
      at(t, { handheld: 0.004 });
      puppet.update(cam, pose);
      disc.rotation.y = i * 0.2; clay.rotation.y = i * 0.2;
      r.render(sc, cam);
    }, i, N, FPS);
    await page.screenshot({ path: `${OUTDIR}/f${String(i).padStart(4, '0')}.png` });
  }
  console.log(`RENDERED ${N} frames @720x1280, ${((Date.now() - t0) / N).toFixed(0)} ms/frame, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
