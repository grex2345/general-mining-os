// r16_render.cjs — Round 16 renderer for GojoFilm (22 scenes, 84.500s).
// Run: LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/r16_render.cjs
// Env: SMOKE=1 | MID=1 | PROBE=0.5 | ONLY=i | FROM=i | COMPS=1 | PROBES=a,b | FRAME_OFFSET=n | OUTDIR=path
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUTDIR = process.env.OUTDIR || '/tmp/r16frames'; fs.mkdirSync(OUTDIR, { recursive: true });
const FPS = 30, Wd = 720, Hd = 1280;
const R16 = path.join(ROOT, 'research/artifacts/round16');
const WORDS = JSON.parse(fs.readFileSync(path.join(R16, 'narration.words.json'), 'utf8'));
const CUES = JSON.parse(fs.readFileSync(path.join(R16, 'scene-cues.json'), 'utf8'));

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: Wd, height: Hd });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
  await page.setContent(`<body style="margin:0;background:#000"><canvas id="out" width="${Wd}" height="${Hd}" style="display:block"></canvas></body>`);
  await page.addScriptTag({ path: `${DIR}/node_modules/three/build/three.min.js` });
  for (const f of ['gojo2d.js', 'stickworld.js', 'worldkit.js', 'gojoworld.js', 'cinema2.js', 'lipsync.js', 'film_gojo.js'])
    await page.addScriptTag({ path: `${ROOT}/studio/src/${f}` });
  await page.waitForFunction('window.THREE && window.drawGojo && window.StickWorld && window.WorldKit && window.GojoWorld && window.Cinema2 && window.LipSync && window.GojoFilm', { timeout: 30000 });

  await page.evaluate((ns) => { window.__noshadow = ns; }, !!process.env.NOSHADOW);
  await page.evaluate((words, cues, W, H) => {
    const T = window.THREE;
    const Wk = window.StickWorld(T), K = window.WorldKit(T, Wk), G = window.GojoWorld(T, Wk, K);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(W, H); r.shadowMap.enabled = !window.__noshadow; r.shadowMap.type = T.PCFSoftShadowMap; r.outputEncoding = T.sRGBEncoding;
    // Additive VFX stacked to pure white without this. ACES rolls highlights off
    // instead of clipping them, so glows read as light rather than paper.
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.92;
    r.domElement.style.display = 'none'; document.body.appendChild(r.domElement);
    const out = document.getElementById('out'), oc = out.getContext('2d');
    const prev = document.createElement('canvas'); prev.width = W; prev.height = H;
    const pc = prev.getContext('2d');
    window.__p = { T, W: Wk, K, G, r, out, oc, prev, pc, scenes: {},
      ctx: { THREE: T, W: Wk, K, G, C: window.Cinema2(), lip: window.LipSync(words), words, cues } };
  }, WORDS, CUES, Wd, Hd);

  await page.evaluate((ns) => { window.__noshadow = ns; }, !!process.env.NOSHADOW);
  await page.evaluate((raw) => { window.__rawMode = raw; }, !!(process.env.COMPS || process.env.PROBES));
  const film = await page.evaluate(() => window.GojoFilm.spec());
  const TOTAL = await page.evaluate(() => window.GojoFilm.TOTAL);
  const FRAME_OFFSET = parseInt(process.env.FRAME_OFFSET || '0', 10);
  const t0 = Date.now(); let frame = 0, rendered = 0;
  const report = [];

  for (let si = 0; si < film.length; si++) {
    const shot = film[si];
    if (process.env.ONLY && String(si) !== process.env.ONLY) continue;
    if (process.env.FROM && si < parseInt(process.env.FROM, 10)) continue;
    const meta = await page.evaluate((si) => {
      const p = window.__p;
      if (!p.scenes[si]) {
        p.scenes[si] = window.GojoFilm.build(si, p.ctx);
        // three r149 reads texture.encoding, NOT texture.colorSpace. Every canvas
        // texture here was defaulting to LinearEncoding and getting brightened a
        // second time on sRGB output -- that is what washed the whole film out to
        // pastel. Tag every map in the scene as sRGB so dark colours stay dark.
        let fixed = 0;
        p.scenes[si].sc.traverse((o) => {
          const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          for (const m of ms) {
            for (const k of ['map', 'emissiveMap', 'alphaMap']) {
              if (m[k] && m[k].isTexture && m[k].encoding !== p.T.sRGBEncoding) { m[k].encoding = p.T.sRGBEncoding; m[k].needsUpdate = true; fixed++; }
            }
          }
        });
        p.scenes[si]._texFixed = fixed;
      }
      const d = p.scenes[si].dir, pl = d.plan;
      const frames = pl.marks.map(m => {
        const mid = (m.t0 + m.t1) / 2;
        p.scenes[si].update(mid); d.at(mid, { globalT: mid });
        const f = d.framing(mid);
        return { i: m.i, t0: +m.t0.toFixed(3), t1: +m.t1.toFixed(3), kind: m.kind, why: m.why,
                 coverage: f.coverage, verdict: f.verdict, dist: f.dist, focus: f.focus };
      });
      return { problems: pl.problems, count: pl.count, kinds: pl.kinds, total: pl.total, texFixed: p.scenes[si]._texFixed || 0, marks: frames };
    }, si);
    report.push({ scene: si, id: shot.id, name: shot.name, start: shot.start, dur: shot.dur, ...meta });
    if (meta.problems.length) console.log(`  !! ${shot.name} plan problems:`, meta.problems);
    const bad = meta.marks.filter(m => m.verdict !== 'ok');
    if (bad.length) console.log(`  FRAMING ${shot.name}: ` + bad.map(m => `comp${m.i} ${m.kind} ${m.verdict} (${(m.coverage * 100).toFixed(0)}%)`).join(', '));
    const bounds = process.env.COMPS ? await page.evaluate((si) => window.__p.scenes[si].dir.bounds, si) : null;
    const probes = process.env.PROBES ? process.env.PROBES.split(',').map(Number) : null;
    const nFrames = process.env.COMPS ? bounds.length
      : probes ? probes.length
      : process.env.SMOKE ? 2 : ((process.env.MID || process.env.PROBE) ? 1 : Math.round(shot.dur * FPS));
    const tr = shot.trans || { type: 'cut' };
    for (let k = 0; k < nFrames; k++) {
      const localT = process.env.COMPS ? (bounds[k][0] + bounds[k][1]) / 2
        : probes ? probes[k] * shot.dur
        : process.env.PROBE ? (parseFloat(process.env.PROBE) * shot.dur) : (process.env.MID ? shot.dur * 0.6 : k / FPS);
      const globalT = shot.start + localT;
      await page.evaluate((si, lt) => { const p = window.__p, s = p.scenes[si]; s.update(lt); p.r.render(s.sc, s.cam); }, si, localT);
      await page.evaluate((mode, lt, dur, gT, TOTAL, W, H) => {
        const p = window.__p, oc = p.oc, cv = p.r.domElement;
        oc.globalAlpha = 1; oc.clearRect(0, 0, W, H);
        const inTrans = lt < dur && dur > 0 && !window.__rawMode;
        const u = inTrans ? Math.min(1, lt / dur) : 1;
        const ease = u * u * (3 - 2 * u);
        if (mode === 'dissolve' && inTrans) {
          oc.drawImage(p.prev, 0, 0); oc.globalAlpha = ease; oc.drawImage(cv, 0, 0); oc.globalAlpha = 1;
        } else if (mode === 'wipe' && inTrans) {
          oc.drawImage(p.prev, 0, 0);
          const edge = ease * (W + 160) - 80;
          oc.save(); oc.beginPath(); oc.rect(0, 0, Math.max(0, edge), H); oc.clip(); oc.drawImage(cv, 0, 0); oc.restore();
          const band = oc.createLinearGradient(edge - 90, 0, edge + 70, 0);
          band.addColorStop(0, 'rgba(10,14,26,0)'); band.addColorStop(0.45, 'rgba(10,14,26,.92)');
          band.addColorStop(0.62, 'rgba(20,30,50,.95)'); band.addColorStop(1, 'rgba(10,14,26,0)');
          oc.fillStyle = band; oc.fillRect(edge - 90, 0, 160, H);
        } else {
          oc.drawImage(cv, 0, 0);
          if ((mode === 'fadein' || mode === 'dip') && inTrans) { oc.globalAlpha = 1 - ease; oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
          if (mode === 'bloom' && inTrans) { oc.globalAlpha = (1 - ease) * 0.92; oc.fillStyle = '#dff4ff'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
        }
        // final fade to black over the last 1.1s
        if (gT > TOTAL - 1.1) { oc.globalAlpha = Math.min(1, (gT - (TOTAL - 1.1)) / 1.1); oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H); oc.globalAlpha = 1; }
      }, tr.type, localT, tr.dur || 0, globalT, TOTAL, Wd, Hd);
      await page.screenshot({ path: `${OUTDIR}/f${String(frame + FRAME_OFFSET).padStart(4, '0')}.png` });
      frame++; rendered++;
      if (rendered % 150 === 0) console.log(`  ${rendered} frames (${shot.name}) ${((Date.now() - t0) / rendered).toFixed(0)} ms/frame`);
    }
    await page.evaluate(() => { const p = window.__p; p.pc.clearRect(0, 0, p.prev.width, p.prev.height); p.pc.drawImage(p.out, 0, 0); });
    console.log(`SCENE ${si} ${shot.id} "${shot.name}": ${nFrames} frames, ${meta.count} comps (total ${frame})`);
  }
  fs.writeFileSync(path.join(OUTDIR, 'composition-report.json'), JSON.stringify({ fps: FPS, total: TOTAL, scenes: report }, null, 2));
  console.log(`RENDERED ${frame} frames @${Wd}x${Hd}, ${((Date.now() - t0) / Math.max(1, frame)).toFixed(0)} ms/frame, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
