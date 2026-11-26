// toon_smoke.cjs — integration smoke test: reference-style 3D toon scene rendered
// headless via SwiftShader. Proves character+acting+shadows+camera+props+lighting
// combine into actual video frames (not just a cube). Round 9 readiness check.
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const fs = require('fs');
const OUTDIR = '/tmp/toonframes'; fs.mkdirSync(OUTDIR, { recursive: true });
const N = parseInt(process.env.FRAMES || '48', 10);
(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280 });
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: `${DIR}/node_modules/three/build/three.min.js` });
  await page.waitForFunction('window.THREE!==undefined', { timeout: 15000 });
  await page.evaluate(() => {
    const T = window.THREE;
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(720, 1280); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.outputEncoding = T.sRGBEncoding;
    document.body.appendChild(r.domElement);
    const sc = new T.Scene(); sc.background = new T.Color(0x87c5eb); sc.fog = new T.Fog(0x87c5eb, 18, 42);
    const cam = new T.PerspectiveCamera(40, 720 / 1280, 0.1, 100);
    sc.add(new T.HemisphereLight(0xbfe3ff, 0x8a6f4d, 0.5));
    const key = new T.DirectionalLight(0xfff2d9, 1.0); key.position.set(5, 9, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    sc.add(key);
    const gm = new T.DataTexture(new Uint8Array([70, 150, 235, 255]), 4, 1, T.RedFormat);
    gm.minFilter = gm.magFilter = T.NearestFilter; gm.needsUpdate = true;
    const toon = (c) => new T.MeshToonMaterial({ color: c, gradientMap: gm });
    const outlineMat = new T.MeshBasicMaterial({ color: 0x1a1a1a, side: T.BackSide });
    function part(geo, c, parent, s = 1.05) { const m = new T.Mesh(geo, toon(c)); m.castShadow = true; const o = new T.Mesh(geo, outlineMat); o.scale.setScalar(s); m.add(o); parent.add(m); return m; }
    const ground = new T.Mesh(new T.PlaneGeometry(60, 60), toon(0xd9b98a)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
    const fig = new T.Group(); sc.add(fig);
    const body = part(new T.CapsuleGeometry(0.42, 0.75, 6, 12), 0x2a9d8f, fig); body.position.y = 1.15;
    const head = part(new T.SphereGeometry(0.5, 20, 16), 0xf1c9a5, fig); head.position.y = 2.25;
    const eyeG = new T.SphereGeometry(0.07, 10, 8);
    const e1 = new T.Mesh(eyeG, new T.MeshBasicMaterial({ color: 0x1a1a1a })); e1.position.set(-0.18, 2.32, 0.44); fig.add(e1);
    const e2 = e1.clone(); e2.position.x = 0.18; fig.add(e2);
    const armR = new T.Group(); armR.position.set(0.45, 1.75, 0); fig.add(armR);
    const aR = part(new T.CapsuleGeometry(0.11, 0.7, 4, 8), 0xf1c9a5, armR); aR.position.y = -0.4;
    const armL = new T.Group(); armL.position.set(-0.45, 1.75, 0); fig.add(armL);
    const aL = part(new T.CapsuleGeometry(0.11, 0.7, 4, 8), 0xf1c9a5, armL); aL.position.y = -0.4; armL.rotation.z = 0.3;
    const legR = part(new T.CapsuleGeometry(0.13, 0.7, 4, 8), 0x33415c, fig); legR.position.set(0.2, 0.45, 0);
    const legL = part(new T.CapsuleGeometry(0.13, 0.7, 4, 8), 0x33415c, fig); legL.position.set(-0.2, 0.45, 0);
    const wheelG = new T.Group(); wheelG.position.set(1.5, 0, 0.3); sc.add(wheelG);
    const base = part(new T.CylinderGeometry(0.35, 0.45, 0.5, 16), 0x8a5a3b, wheelG); base.position.y = 0.25;
    const disc = part(new T.CylinderGeometry(0.6, 0.6, 0.1, 24), 0x6b4226, wheelG); disc.position.y = 0.55;
    const clay = part(new T.CylinderGeometry(0.2, 0.28, 0.35, 16), 0xb0713f, wheelG); clay.position.y = 0.75;
    function tree(x, z) { const g = new T.Group(); g.position.set(x, 0, z); sc.add(g); const trunk = part(new T.CylinderGeometry(0.12, 0.16, 1, 8), 0x7a4a2b, g); trunk.position.y = 0.5; const leaf = part(new T.ConeGeometry(0.8, 1.6, 8), 0x3f7d4e, g); leaf.position.y = 1.7; }
    tree(-3, -2); tree(3.5, -3); tree(-2.5, -5);
    const hut = new T.Group(); hut.position.set(-3.5, 0, -4); sc.add(hut);
    const hb = part(new T.BoxGeometry(1.6, 1.2, 1.4), 0xc9a26b, hut); hb.position.y = 0.6;
    const hr = part(new T.ConeGeometry(1.3, 1, 4), 0x8a5a3b, hut); hr.position.y = 1.7; hr.rotation.y = Math.PI / 4;
    window.__s = { r, sc, cam, fig, armR, armL, head, body, disc, clay };
  });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate((i, N) => {
      const { r, sc, cam, armR, head, body, disc, clay } = window.__s; const t = i / N;
      cam.position.set(0.6 + 0.3 * Math.sin(t * 2), 2.0 + 0.1 * t, 6.5 - 2.0 * t); cam.lookAt(0.4, 1.4, 0);
      body.scale.y = 1 + 0.03 * Math.sin(i * 0.4); head.position.y = 2.25 + 0.03 * Math.sin(i * 0.4);
      armR.rotation.z = -0.5 - 0.9 * Math.abs(Math.sin(i * 0.35)); head.rotation.z = 0.06 * Math.sin(i * 0.2);
      disc.rotation.y = i * 0.3; clay.rotation.y = i * 0.3;
      r.render(sc, cam);
    }, i, N);
    await page.screenshot({ path: `${OUTDIR}/f${String(i).padStart(3, '0')}.png` });
  }
  console.log(`RENDERED ${N} frames @720x1280, ${((Date.now() - t0) / N).toFixed(0)} ms/frame avg, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
