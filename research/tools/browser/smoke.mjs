#!/usr/bin/env node
/**
 * smoke.mjs — prove the browser cell works, with hard assertions.
 * Writes .scratch/smoke.png (gitignored) and exits non-zero if anything is off.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KB_ROOT || path.resolve(HERE, '..', '..', '..');
const CELL = path.join(ROOT, '.scratch', 'chrome');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;background:#08101e;overflow:hidden}
#root{position:relative;width:1080px;height:1920px}
.glow{position:absolute;left:120px;top:300px;width:840px;height:840px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#7ff0ff33,#3b82f666 45%,#0000 72%);filter:blur(2px)}
.card{position:absolute;left:110px;top:1180px;width:860px;padding:48px;border-radius:34px;
  background:linear-gradient(135deg,rgba(22,44,76,.95),rgba(8,16,30,.95));
  border:1px solid rgba(120,220,255,.22);
  box-shadow:0 40px 100px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.09);
  backdrop-filter:blur(8px)}
h1{margin:0;font:800 92px/1.03 system-ui,sans-serif;color:#fff;letter-spacing:-.025em;
  background:linear-gradient(90deg,#fff,#6ee7ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{margin:20px 0 0;font:400 36px/1.4 system-ui,sans-serif;color:#93a9c0}
</style></head><body><div id="root">
<div class="glow"></div>
<div class="card"><h1>Render cell<br>online.</h1><p>Chromium composites CSS gradients, backdrop blur, inset highlights and real text shaping.</p></div>
</div></body></html>`;

const file = path.join(ROOT, '.scratch', 'smoke.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, html);

const browser = await puppeteer.launch({
  executablePath: path.join(CELL, 'bin-chromium'),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--user-data-dir=/tmp/cr-smoke'],
  env: { ...process.env, LD_LIBRARY_PATH: `${CELL}/libs/lib:${process.env.LD_LIBRARY_PATH || ''}` },
});

const t0 = Date.now();
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto('file://' + file, { waitUntil: 'load' });

const probe = await page.evaluate(() => {
  const el = document.querySelector('h1');
  const cs = getComputedStyle(el);
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
    bgClip: cs.webkitBackgroundClip || cs.backgroundClip,
    backdrop: getComputedStyle(document.querySelector('.card')).backdropFilter,
    shadow: getComputedStyle(document.querySelector('.card')).boxShadow.length > 10,
  };
});
const shot = await page.screenshot({ type: 'png' });
await browser.close();
fs.writeFileSync(path.join(ROOT, '.scratch', 'smoke.png'), shot);

const checks = [
  ['viewport 1080x1920', probe.w === 1080 && probe.h === 1920],
  ['gradient text clip applied', /text/.test(probe.bgClip || '')],
  ['backdrop-filter accepted', /blur/.test(probe.backdrop || '')],
  ['box-shadow composited', probe.shadow === true],
  ['screenshot non-trivial', shot.length > 100_000],
];

let bad = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}`);
  if (!pass) bad++;
}
console.log(`  · ${Date.now() - t0} ms, png ${(shot.length / 1024).toFixed(0)} KB -> .scratch/smoke.png`);
process.exit(bad ? 1 : 0);
