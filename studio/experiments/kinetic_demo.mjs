/**
 * kinetic_demo.mjs — Round 8 proof: the discovered V2/V3 techniques rendered by OUR
 * existing engine (stickman + score) plus the new additive kinetic.mjs layer.
 *
 * Demonstrates: perpetual ray/particle backdrop, breathing Tanjiro (existing rig),
 * a glass card with an animated counter + pulse ring, and word-by-word karaoke
 * captions with keyword colour. Music bed from the existing score engine.
 *
 * NOTE: this is a VISUAL techniques demo. The caption word-timeline here is a
 * scripted reading rhythm; production wires real Whisper/Piper word timestamps
 * (align.py already emits {word,t,dur}) straight into karaokeCaption. See roadmap.
 *
 * Run: node experiments/kinetic_demo.mjs
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createStickman } from '../src/stickman.mjs';
import { rayBackdrop, karaokeCaption, animatedCounter, glassCard, entrance } from '../src/kinetic.mjs';
import { synthesizeScore, writeWav } from '../src/score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'out', 'kinetic');
const FR = path.join(OUT, '.frames');
fs.mkdirSync(FR, { recursive: true });

const F = (w) => path.join(ROOT, 'node_modules/@expo-google-fonts/inter-tight', w);
GlobalFonts.registerFromPath(F('400Regular/InterTight_400Regular.ttf'), 'Inter Tight');
GlobalFonts.registerFromPath(F('700Bold/InterTight_700Bold.ttf'), 'Inter Tight Bold');

const W = 1080, H = 1920, fps = 30, dur = 8, N = Math.round(dur * fps);
const FFMPEG = path.join(ROOT, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg');

// scripted word timeline (reading rhythm). keywords stay coloured.
const TEXT = 'Tanjiro trains his breathing until every swing hits ninety nine percent harder';
const raw = TEXT.split(' ');
const keywords = ['breathing', 'ninety', 'nine', 'percent', 'harder'];
let cursor = 0.7;
const words = raw.map((word) => {
  const key = keywords.includes(word.toLowerCase());
  const d = key ? 0.5 : 0.4 + (word.length > 6 ? 0.08 : 0);
  const w = { word, t: cursor, dur: d };
  cursor += d + 0.02;
  return w;
});

const tanjiro = createStickman('tanjiro', 7);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

console.log(`rendering ${N} frames @ ${fps}fps (${dur}s)...`);
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const t = f / fps;
  // 1) perpetual backdrop (never static)
  rayBackdrop(ctx, W, H, t, { base: '#0a1236', glow: '#16307a', particle: '#ffd23f', seed: 7, cy: H * 0.42 });

  // 2) breathing Tanjiro from the EXISTING rig (idleT animates every frame)
  tanjiro.draw(ctx, { x: W / 2, y: H * 0.60, h: H * 0.30, idleT: t, facing: 1 });

  // 3) glass card + animated counter (enters at a semantic beat ~3s)
  const cardK = Math.max(0, Math.min(1, (t - 2.8) / 0.5));
  const cardX = W * 0.16, cardY = H * 0.665, cardW = W * 0.68, cardH = H * 0.16;
  if (cardK > 0) {
    glassCard(ctx, { x: cardX, y: cardY, w: cardW, h: cardH, r: 34, k: cardK });
    ctx.save();
    ctx.globalAlpha = entrance(cardK).opacity;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `34px "Inter Tight"`;
    ctx.fillText('SWING POWER', W / 2, cardY + 52);
    ctx.restore();
    animatedCounter(ctx, { x: W / 2, y: cardY + cardH * 0.62, from: 0, to: 99, t0: 3.2, t1: 6.4, t, size: 116, color: '#ffd23f', suffix: '%' });
  }

  // 4) word-by-word karaoke caption (upper third)
  karaokeCaption(ctx, { words, t, cx: W / 2, y: H * 0.175, maxW: W * 0.86, size: 60, accent: '#ffd23f', keywordColor: '#ff5470', keywords, window: 5 });

  // honest watermark
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `26px "Inter Tight"`;
  ctx.fillText('general-mining-os · Round 8 kinetic primitives demo', W / 2, H * 0.94);
  ctx.restore();

  fs.writeFileSync(path.join(FR, `f${String(f).padStart(4, '0')}.jpg`), canvas.toBuffer('image/jpeg', 90));
  if (f % 60 === 0) console.log(`  frame ${f}/${N} ${Math.round((Date.now() - t0) / (f + 1))} ms/f`);
}
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// music bed from the EXISTING score engine
const music = synthesizeScore({ duration: dur, sections: [{ t0: 0, t1: dur, mood: 'pulse' }], seed: 9 });
const wav = path.join(OUT, 'music.wav');
writeWav(wav, music);

// encode + mux
const outMp4 = path.join(OUT, 'kinetic-demo.mp4');
await new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps),
    '-i', path.join(FR, 'f%04d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outMp4]);
  p.stderr.on('data', (d) => process.stderr.write(d));
  p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c))));
});
console.log('wrote', outMp4);
