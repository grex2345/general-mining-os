/**
 * swangle_test.cjs — proof that headless WebGL2 + three.js work in this sandbox
 * via SwiftShader ANGLE (the Stick3D pack's "--gl=swangle" rendering path).
 * Round 9: this OVERTURNS the earlier "headless WebGL impossible" dead-end.
 *
 * Setup:  bash studio/swangle_setup.sh
 * Run:    LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle \
 *           node studio/experiments/swangle_test.cjs [outPng]
 *
 * Verified result (2026-11-26): WebGL 2.0 context, renderer
 * "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", three.js cube
 * at 720x1280 rendered + screenshot-checked. See research/artifacts/round9/.
 */
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const chromium = require(`${DIR}/node_modules/@sparticuz/chromium`).default;
const puppeteer = require(`${DIR}/node_modules/puppeteer-core`);
const fs = require('fs');
const OUT = process.argv[2] || 'research/artifacts/round9/swangle-three-test.png';

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--enable-unsafe-swiftshader'],
    executablePath: exe, headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280 });

  // 1) raw WebGL2 context + readPixels proof
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return { ok: false };
    const dbg = g.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    g.clearColor(1, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
    return { ok: true, renderer, px: [...px], version: g.getParameter(g.VERSION) };
  });
  console.log('RAW WEBGL:', JSON.stringify(gl));
  if (!gl.ok) { await browser.close(); process.exit(2); }

  // 2) three.js scene render (UMD build r149 exposes window.THREE)
  await page.setContent('<body style="margin:0;background:#000"></body>');
  await page.addScriptTag({ path: `${DIR}/node_modules/three/build/three.min.js` });
  await page.waitForFunction('window.THREE !== undefined', { timeout: 15000 });
  const res = await page.evaluate(() => {
    const T = window.THREE;
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(720, 1280); document.body.appendChild(r.domElement);
    const sc = new T.Scene(); sc.background = new T.Color(0x1a2b4a);
    const cam = new T.PerspectiveCamera(50, 720 / 1280, 0.1, 100);
    cam.position.set(2.5, 2, 4); cam.lookAt(0, 0, 0);
    sc.add(new T.AmbientLight(0xffffff, 0.6));
    const dl = new T.DirectionalLight(0xffffff, 1.2); dl.position.set(3, 5, 2); sc.add(dl);
    const cube = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.6), new T.MeshNormalMaterial());
    sc.add(cube);
    for (let i = 0; i < 30; i++) { cube.rotation.y = i * 0.1; cube.rotation.x = i * 0.05; r.render(sc, cam); }
    const g = r.getContext(); const px = new Uint8Array(4);
    g.readPixels(360, 640, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
    return { centerPixel: [...px] };
  });
  console.log('THREE.JS:', JSON.stringify(res));
  await page.screenshot({ path: OUT });
  await browser.close();
  const nonBlack = res.centerPixel.slice(0, 3).some((v) => v > 10);
  console.log(nonBlack ? `PASS — screenshot: ${OUT}` : 'FAIL — black frame');
  process.exit(nonBlack ? 0 : 3);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
