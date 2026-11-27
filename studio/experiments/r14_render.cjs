// r14_render.cjs — Round 14 renderer for BellFilm2 (39 compositions, 12 scenes).
// Same 66.000s timeline as Round 13 so the existing audio muxes without changes.
// Run: LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/r14_render.cjs
// Env: SMOKE=1 | MID=1 | PROBE=0.5 | ONLY=i | FROM=i | FRAME_OFFSET=n | OUTDIR=path
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUTDIR = process.env.OUTDIR || '/tmp/r14frames'; fs.mkdirSync(OUTDIR, { recursive: true });
const FPS = 30, Wd = 720, Hd = 1280;
const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/artifacts/round13/film/narration.words.json'), 'utf8'));

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: Wd, height: Hd });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
  await page.setContent(`<body style="margin:0;background:#000"><canvas id="out" width="${Wd}" height="${Hd}" style="display:block"></canvas></body>`);
  await page.addScriptTag({ path: `${DIR}/node_modules/three/build/three.min.js` });
  for (const f of ['puppet2d.js', 'stickworld.js', 'worldkit.js', 'actor.js', 'setkit.js', 'cinema2.js', 'lipsync.js', 'film_bell2.js'])
    await page.addScriptTag({ path: `${ROOT}/studio/src/${f}` });
  await page.waitForFunction('window.THREE && window.StickWorld && window.WorldKit && window.ActorKit && window.SetKit && window.Cinema2 && window.LipSync && window.BellFilm2', { timeout: 30000 });

  await page.evaluate((words, W, H) => {
    const T = window.THREE;
    const Wk = window.StickWorld(T), K = window.WorldKit(T, Wk), A = window.ActorKit(T, Wk, K), S = window.SetKit(T, Wk, K);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(W, H); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.outputEncoding = T.sRGBEncoding;
    r.domElement.style.display = 'none'; document.body.appendChild(r.domElement);
    const out = document.getElementById('out'), oc = out.getContext('2d');
    const prev = document.createElement('canvas'); prev.width = W; prev.height = H;
    const pc = prev.getContext('2d');
    window.__p = { T, W: Wk, K, A, S, r, out, oc, prev, pc, scenes: {},
      ctx: { THREE: T, W: Wk, K, A, S, C: window.Cinema2, lip: window.LipSync(words), words } };
  }, WORDS, Wd, Hd);

  const film = await page.evaluate(() => window.BellFilm2.spec());
  const TOTAL = await page.evaluate(() => window.BellFilm2.TOTAL);
  const FRAME_OFFSET = parseInt(process.env.FRAME_OFFSET || '0', 10);
  const t0 = Date.now(); let frame = 0, rendered = 0;
  const report = [];

  for (let si = 0; si < film.length; si++) {
    const shot = film[si];
    if (process.env.ONLY && String(si) !== process.env.ONLY) continue;
    if (process.env.FROM && si < parseInt(process.env.FROM, 10)) continue;
    const meta = await page.evaluate((si) => {
      const p = window.__p;
      if (!p.scenes[si]) p.scenes[si] = window.BellFilm2.build(si, p.ctx);
      const pl = p.scenes[si].dir.plan;
      return { problems: pl.problems, count: pl.count, kinds: pl.kinds, total: pl.total,
        marks: pl.marks.map(m => ({ i: m.i, t0: +m.t0.toFixed(3), t1: +m.t1.toFixed(3), kind: m.kind, why: m.why })) };
    }, si);
    report.push({ scene: si, name: shot.name, start: shot.start, dur: shot.dur, ...meta });
    if (meta.problems.length) console.log(`  !! ${shot.name} plan problems:`, meta.problems);
    const nFrames = process.env.SMOKE ? 2 : ((process.env.MID || process.env.PROBE) ? 1 : Math.round(shot.dur * FPS));
    const tr = shot.trans || { type: 'cut' };
    for (let k = 0; k < nFrames; k++) {
      const localT = process.env.PROBE ? (parseFloat(process.env.PROBE) * shot.dur) : (process.env.MID ? shot.dur * 0.6 : k / FPS);
      const globalT = shot.start + localT;
      await page.evaluate((si, lt) => { const p = window.__p, s = p.scenes[si]; s.update(lt); p.r.render(s.sc, s.cam); }, si, localT);
      await page.evaluate((mode, lt, dur, gT, TOTAL, W, H) => {
        const p = window.__p, oc = p.oc, cv = p.r.domElement;
        oc.globalAlpha = 1; oc.clearRect(0, 0, W, H);
        const inTrans = lt < dur && dur > 0;
        const u = inTrans ? Math.min(1, lt / dur) : 1;
        const ease = u * u * (3 - 2 * u);
        if (mode === 'dissolve' && inTrans) {
          oc.drawImage(p.prev, 0, 0); oc.globalAlpha = ease; oc.drawImage(cv, 0, 0); oc.globalAlpha = 1;
        } else if (mode === 'wipe' && inTrans) {
          // a foreground edge sweeps across; the new composition is revealed behind it
          oc.drawImage(p.prev, 0, 0);
          const edge = ease * (W + 160) - 80;
          oc.save(); oc.beginPath(); oc.rect(0, 0, Math.max(0, edge), H); oc.clip(); oc.drawImage(cv, 0, 0); oc.restore();
          const band = oc.createLinearGradient(edge - 90, 0, edge + 70, 0);
          band.addColorStop(0, 'rgba(18,14,10,0)'); band.addColorStop(0.45, 'rgba(18,14,10,.92)');
          band.addColorStop(0.62, 'rgba(30,24,18,.95)'); band.addColorStop(1, 'rgba(18,14,10,0)');
          oc.fillStyle = band; oc.fillRect(edge - 90, 0, 160, H);
        } else {
          oc.drawImage(cv, 0, 0);
          if ((mode === 'fadein' || mode === 'dip') && inTrans) { oc.globalAlpha = 1 - ease; oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
          if (mode === 'bloom' && inTrans) { oc.globalAlpha = (1 - ease) * 0.92; oc.fillStyle = '#fff'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
        }
        if (gT > TOTAL - 0.9) { oc.globalAlpha = Math.min(1, (gT - (TOTAL - 0.9)) / 0.9); oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
      }, tr.type, localT, tr.dur || 0, globalT, TOTAL, Wd, Hd);
      await page.screenshot({ path: `${OUTDIR}/f${String(frame + FRAME_OFFSET).padStart(4, '0')}.png` });
      frame++; rendered++;
      if (rendered % 120 === 0) console.log(`  ${rendered} frames (${shot.name}) ${((Date.now() - t0) / rendered).toFixed(0)} ms/frame`);
    }
    await page.evaluate(() => { const p = window.__p; p.pc.clearRect(0, 0, p.prev.width, p.prev.height); p.pc.drawImage(p.out, 0, 0); });
    console.log(`SCENE ${si} ${shot.name}: ${nFrames} frames, ${meta.count} compositions (total ${frame})`);
  }
  fs.writeFileSync(path.join(OUTDIR, 'composition-report.json'), JSON.stringify({ fps: FPS, total: TOTAL, scenes: report }, null, 2));
  console.log(`RENDERED ${frame} frames @${Wd}x${Hd}, ${((Date.now() - t0) / Math.max(1, frame)).toFixed(0)} ms/frame, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
