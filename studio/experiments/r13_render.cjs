// r13_render.cjs — Round 13 production renderer. Drives BellFilm shot-by-shot, composites
// transitions (dissolve/bloom/dip/fade) on a 2D output canvas so narration timing stays exact.
// Run: LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/r13_render.cjs
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUTDIR = process.env.OUTDIR || '/tmp/r13frames'; fs.mkdirSync(OUTDIR, { recursive: true });
const FPS = 30;

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280 });
  await page.setContent('<body style="margin:0;background:#000"><canvas id="out" width="720" height="1280" style="display:block"></canvas></body>');
  for (const f of ['three/build/three.min.js']) await page.addScriptTag({ path: `${DIR}/node_modules/${f}` });
  for (const f of ['puppet2d.js', 'stickworld.js', 'worldkit.js', 'actor.js', 'film_bell.js']) await page.addScriptTag({ path: `${ROOT}/studio/src/${f}` });
  await page.waitForFunction('window.THREE && window.StickWorld && window.WorldKit && window.ActorKit && window.BellFilm', { timeout: 20000 });

  await page.evaluate(() => {
    const T = window.THREE, W = window.StickWorld(T), K = window.WorldKit(T, W), A = window.ActorKit(T, W, K);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(720, 1280); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.outputEncoding = T.sRGBEncoding;
    r.domElement.style.display = 'none'; document.body.appendChild(r.domElement);
    const out = document.getElementById('out'), oc = out.getContext('2d');
    const prev = document.createElement('canvas'); prev.width = 720; prev.height = 1280; const pc = prev.getContext('2d');
    window.__p = { T, W, K, A, r, out, oc, prev, pc, ctx: { THREE: T, W, K, A }, shots: {} };
  });

  const film = await page.evaluate(() => window.BellFilm.shots.map(s => ({ name: s.name, start: s.start, dur: s.dur, trans: s.trans })));
  const TOTAL = await page.evaluate(() => window.BellFilm.TOTAL);
  const t0 = Date.now(); let frame = 0, rendered = 0;
  const FRAME_OFFSET = parseInt(process.env.FRAME_OFFSET || '0', 10);

  for (let si = 0; si < film.length; si++) {
    const shot = film[si];
    if (process.env.ONLY && String(si) !== process.env.ONLY) continue;
    if (process.env.FROM && si < parseInt(process.env.FROM, 10)) continue;
    await page.evaluate((si) => { const p = window.__p; if (!p.shots[si]) p.shots[si] = window.BellFilm.build(si, p.ctx); }, si);
    const nFrames = process.env.SMOKE ? 2 : ((process.env.MID || process.env.PROBE) ? 1 : Math.round(shot.dur * FPS));
    const tr = shot.trans || { type: 'cut' };
    for (let k = 0; k < nFrames; k++) {
      const localT = process.env.PROBE ? (parseFloat(process.env.PROBE) * shot.dur) : (process.env.MID ? shot.dur * 0.6 : k / FPS);
      const globalT = shot.start + localT;
      // render the live shot to the hidden WebGL canvas
      await page.evaluate((si, lt) => { const p = window.__p, s = p.shots[si]; s.update(lt); p.r.render(s.sc, s.cam); }, si, localT);
      // composite onto #out with the transition
      await page.evaluate((mode, alpha, color, lt, dur, gT, TOTAL) => {
        const p = window.__p, oc = p.oc, cv = p.r.domElement;
        oc.globalAlpha = 1; oc.clearRect(0, 0, 720, 1280);
        const inTrans = lt < dur;
        if (mode === 'dissolve' && inTrans) { oc.drawImage(p.prev, 0, 0); oc.globalAlpha = Math.min(1, lt / dur); oc.drawImage(cv, 0, 0); oc.globalAlpha = 1; }
        else { oc.drawImage(cv, 0, 0);
          if (mode === 'fadein' && inTrans) { oc.globalAlpha = 1 - lt / dur; oc.fillStyle = '#000'; oc.fillRect(0, 0, 720, 1280); oc.globalAlpha = 1; }
          if (mode === 'dip' && inTrans) { oc.globalAlpha = 1 - lt / dur; oc.fillStyle = '#000'; oc.fillRect(0, 0, 720, 1280); oc.globalAlpha = 1; }
          if (mode === 'bloom' && inTrans) { oc.globalAlpha = 1 - lt / dur; oc.fillStyle = '#fff'; oc.fillRect(0, 0, 720, 1280); oc.globalAlpha = 1; }
        }
        // outro fade-to-black over the last 1.0s
        if (gT > TOTAL - 1.0) { oc.globalAlpha = Math.min(1, (gT - (TOTAL - 1.0)) / 1.0); oc.fillStyle = '#000'; oc.fillRect(0, 0, 720, 1280); oc.globalAlpha = 1; }
      }, tr.type, 0, '#000', localT, tr.dur || 0, globalT, TOTAL);
      await page.screenshot({ path: `${OUTDIR}/f${String(frame + FRAME_OFFSET).padStart(4, '0')}.png` });
      frame++; rendered++;
      if (rendered % 90 === 0) console.log(`  ${rendered} frames (${shot.name}) ${((Date.now() - t0) / rendered).toFixed(0)} ms/frame`);
    }
    // capture this shot's final frame as the dissolve source for the next shot
    await page.evaluate(() => { const p = window.__p; p.pc.clearRect(0, 0, 720, 1280); p.pc.drawImage(p.out, 0, 0); });
    console.log(`SHOT ${si} ${shot.name}: ${nFrames} frames done (total ${frame})`);
  }
  console.log(`RENDERED ${frame} frames @720x1280, ${((Date.now() - t0) / frame).toFixed(0)} ms/frame, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
