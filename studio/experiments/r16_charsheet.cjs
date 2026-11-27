// r16_charsheet.cjs — character QA sheet: Gojo in every mood/pose the film uses.
// Run: LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/r16_charsheet.cjs
const DIR = process.env.SWANGLE_DIR || '/tmp/swangle';
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
const puppeteer = req('puppeteer-core');
const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.OUT || '/tmp/r16char.png';

const CASES = [
  { mood: 'calm', arms: 'down', label: 'calm / blindfold' },
  { mood: 'smirk', arms: 'hips', label: 'smirk / hands on hips' },
  { mood: 'serious', arms: 'cross', label: 'serious / arms crossed' },
  { mood: 'point', arms: 'point', label: 'point gesture' },
  { mood: 'focus', arms: 'palm', sixEyes: 1, label: 'SIX EYES / palm out' },
  { mood: 'reveal', arms: 'wide', sixEyes: 1, label: 'SIX EYES / arms wide' },
  { mood: 'strain', arms: 'chest', heat: 0.7, sweat: 0.8, label: 'strain / heat + sweat' },
  { mood: 'agony', arms: 'head', heat: 1, sweat: 1, nerv: 0.6, label: 'agony / cooking' },
  { mood: 'focus', arms: 'chest', sixEyes: 1, rct: 1, label: 'RCT heal glow' },
  { mood: 'warm', arms: 'down', lean: 0.06, label: 'warm / lean' },
  { mood: 'question', arms: 'palm', sixEyes: 1, headTilt: 0.10, label: 'question / to camera' },
  { mood: 'shock', arms: 'up', aura: 1, label: 'aura / cursed energy' },
];

(async () => {
  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: [...chromium.args, '--enable-unsafe-swiftshader'], executablePath: exe, headless: true });
  const page = await browser.newPage();
  const CW = 300, CH = 470, COLS = 4, ROWS = Math.ceil(CASES.length / COLS);
  await page.setViewport({ width: CW * COLS, height: CH * ROWS });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.setContent(`<body style="margin:0;background:#101425"><canvas id="s" width="${CW * COLS}" height="${CH * ROWS}"></canvas></body>`);
  await page.addScriptTag({ path: `${ROOT}/studio/src/gojo2d.js` });
  await page.waitForFunction('window.drawGojo');
  await page.evaluate((cases, CW, CH, COLS) => {
    const s = document.getElementById('s'), g = s.getContext('2d');
    const off = document.createElement('canvas'); off.width = 900; off.height = 1400;
    const oc = off.getContext('2d');
    const look = {};
    cases.forEach((cs, i) => {
      const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
      const grad = g.createLinearGradient(cx, cy, cx, cy + CH);
      grad.addColorStop(0, '#1b2138'); grad.addColorStop(1, '#0c1020');
      g.fillStyle = grad; g.fillRect(cx, cy, CW, CH);
      const pose = Object.assign({ t: 3.2 + i * 0.7, blink: 1 }, cs);
      window.drawGojo(oc, 900, 1400, look, pose);
      g.drawImage(off, cx + 8, cy + 6, CW - 16, CH - 40);
      g.fillStyle = '#9fd8ff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
      g.fillText(cs.label, cx + CW / 2, cy + CH - 12);
      g.strokeStyle = 'rgba(120,180,255,.25)'; g.lineWidth = 1; g.strokeRect(cx + .5, cy + .5, CW - 1, CH - 1);
    });
  }, CASES, CW, CH, COLS);
  await page.screenshot({ path: OUT });
  console.log('wrote', OUT);
  await browser.close();
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
