// Thumbnail + metadata generation.
//
// Research gap (REPORT §7.3): thumbnail generation is essentially absent from the
// agent-skill ecosystem. This composes a real 1280x720 thumbnail from a hero
// frame of the rendered video plus a designed text block, and validates it
// against YouTube's actual constraints (<2MB, readable at 210px wide).

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { FFMPEG, ensureFonts, FONTS, OUT_DIR } from './env.mjs';
import { run } from './render.mjs';
import { palette, drawText, fillRoundRect, hexA, wrap, fitFont, chip } from './design.mjs';

export const THUMB = { width: 1280, height: 720, maxBytes: 2 * 1024 * 1024 };

/** Pull a hero frame (default: the first scene's settled frame). */
export async function heroFrame(video, t, outPng) {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', outPng]);
  return outPng;
}

/**
 * Compose the thumbnail: darkened/cropped hero frame + big type + topic chip.
 * The composition is deliberately "YouTube legible": 3-5 words, huge, high contrast.
 */
export async function composeThumbnail({ ir, heroPng, headline, kicker, stat, statLabel, outFile }) {
  ensureFonts();
  const pal = palette(ir);
  const { width: W, height: H } = THUMB;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // 1. background: dark base, then the hero frame HEAVILY blurred + dimmed.
  //    Using the raw frame ghosted the in-video headline behind the thumbnail
  //    headline (two competing copies of the text -- unreadable at 210px).
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);
  try {
    const img = await loadImage(heroPng);
    const scale = Math.max(W / img.width, H / img.height) * 1.08;
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.filter = 'blur(26px)';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  } catch { /* keep the flat base */ }

  // 2. scrim + accent frame
  const scrim = ctx.createLinearGradient(0, H, W, 0);
  scrim.addColorStop(0, 'rgba(3,6,9,0.96)');
  scrim.addColorStop(0.55, 'rgba(3,6,9,0.72)');
  scrim.addColorStop(1, 'rgba(3,6,9,0.42)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, 0, 12, H);

  const m = 70;
  // 3. kicker chip
  if (kicker) chip(ctx, String(kicker).toUpperCase(), m, 78, { pal, size: 28 });

  // 4. headline: 3-5 words, fitted so EVERY line is complete
  const text = headline || ir.summary || ir.title;
  let size = 132;
  let lines = [];
  for (; size >= 56; size -= 6) {
    ctx.font = `800 ${size}px ${FONTS.display}`;
    lines = wrap(ctx, text, W - m * 2 - 30);
    if (lines.length <= 2) break;
  }
  ctx.font = `800 ${size}px ${FONTS.display}`;
  const lineH = size * 1.02;
  const blockH = lines.length * lineH;
  const baseY = H - m - blockH + size * 0.82;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 26;
  lines.forEach((l, i) => drawText(ctx, l, m, baseY + i * lineH, {
    size, weight: 800, family: FONTS.display, color: '#ffffff',
  }));
  ctx.restore();

  // 5. accent rule under the headline
  ctx.fillStyle = pal.accent;
  ctx.fillRect(m, baseY + (lines.length - 1) * lineH + size * 0.24, 190, 12);

  // 6. the one number, top-right: the reason to click
  if (stat) {
    ctx.save();
    ctx.font = `800 116px ${FONTS.mono}`;
    const w = ctx.measureText(String(stat)).width;
    drawText(ctx, String(stat), W - m, 250, { size: 116, weight: 800, family: FONTS.mono, color: pal.accent, align: 'right' });
    if (statLabel) {
      drawText(ctx, String(statLabel).toUpperCase(), W - m, 300, {
        size: 26, weight: 700, family: FONTS.mono, color: hexA('#ffffff', 0.72), align: 'right', spacing: 1.6,
      });
    }
    ctx.restore();
  }

  // 7. brand mark bottom-right
  drawText(ctx, (ir.meta?.brand || 'GENERAL MINING OS'), W - m, H - 44, {
    size: 22, weight: 700, family: FONTS.mono, color: hexA('#ffffff', 0.55), align: 'right', spacing: 2,
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, c.toBuffer('image/png'));
  return outFile;
}

/** Legibility check: downscale to 210px wide (YouTube mobile) and measure ink. */
export async function validateThumbnail(file) {
  const img = await loadImage(file);
  const problems = [];
  const bytes = fs.statSync(file).size;
  if (img.width !== THUMB.width || img.height !== THUMB.height)
    problems.push(`size ${img.width}x${img.height}, YouTube wants ${THUMB.width}x${THUMB.height}`);
  if (bytes > THUMB.maxBytes) problems.push(`${(bytes / 1e6).toFixed(2)}MB exceeds 2MB`);
  const sw = 210, sh = Math.round((img.height / img.width) * sw);
  const c = createCanvas(sw, sh);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data;
  const hist = new Array(32).fill(0);
  let n = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    hist[Math.min(31, Math.floor(l / 8))]++; n++;
    sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
  }
  const mode = hist.indexOf(Math.max(...hist));
  const ink = hist.filter((_, b) => Math.abs(b - mode) > 2).reduce((a, b) => a + b, 0) / n;
  const contrast = ink;
  const colorfulness = sat / n / 255;
  if (contrast < 0.10) problems.push(`text contrast too low at 210px (${(contrast * 100).toFixed(1)}% ink)`);
  if (colorfulness < 0.04) problems.push('thumbnail is nearly monochrome; low feed contrast');
  return { ok: problems.length === 0, problems, metrics: { bytes, contrast: +contrast.toFixed(3), colorfulness: +colorfulness.toFixed(3), at210: `${sw}x${sh}` } };
}

// --- metadata -------------------------------------------------------------
const MAX_TITLE = 100;
const MAX_DESC = 5000;
const MAX_TAGS_CHARS = 500;

/** Build YouTube metadata from the IR + evidence. Deterministic, then validated. */
export function buildMetadata(ir, bundle, { channel = 'General Mining OS', hashtags = ['#bitcoin', '#mining', '#hashrate'] } = {}) {
  const hook = ir.scenes[0]?.title || ir.title;
  const title = (hook.length > 92 ? hook.slice(0, 89) + '…' : hook);
  const facts = (bundle?.facts || []).slice(0, 5);
  const sources = (bundle?.sources || []);
  const chapters = [];
  let t = 0;
  for (const s of ir.scenes) {
    if (s.kind === 'hook') { t += s.duration; continue; }
    const label = s.title || s.label || s.text || s.kind;
    chapters.push(`${fmtTime(t)} ${String(label).slice(0, 60)}`);
    t += s.duration;
  }
  const desc = [
    hook,
    '',
    'In this short: what the mining data actually shows this week, and what it means for a miner.',
    '',
    ...facts.map((f) => `• ${f.claim} (${f.source?.name}${f.source?.date ? ', ' + f.source.date : ''})`),
    '',
    'Sources:',
    ...sources.filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i).map((s) => `- ${s.name}: ${s.url}`),
    '',
    'Chapters:',
    ...chapters,
    '',
    hashtags.join(' '),
    '',
    'Data is reported as published by the cited sources and is not financial advice.',
  ].join('\n');

  const tags = [
    'bitcoin mining', 'mining profitability', 'hashprice', 'hashrate', 'difficulty adjustment',
    'asic mining', 'mining rig', 'crypto mining 2026', 'bitcoin network', 'mining data',
  ];

  return {
    title,
    description: desc.slice(0, MAX_DESC),
    tags,
    categoryId: '28', // Science & Technology
    defaultLanguage: 'en',
    defaultAudioLanguage: 'en',
    privacyStatus: 'private',
    madeForKids: false,
    channel,
    hashtags,
  };
}

/** Validate metadata against YouTube's documented limits. */
export function validateMetadata(meta) {
  const problems = [];
  if (!meta.title || meta.title.length > MAX_TITLE) problems.push(`title must be 1..${MAX_TITLE} chars (got ${meta.title?.length})`);
  if (/[<>]/.test(meta.title || '')) problems.push('title cannot contain < or >');
  if (!meta.description) problems.push('description missing');
  if (meta.description.length > MAX_DESC) problems.push(`description > ${MAX_DESC}`);
  const tagChars = (meta.tags || []).join(',').length;
  if (tagChars > MAX_TAGS_CHARS) problems.push(`tags exceed ${MAX_TAGS_CHARS} chars (${tagChars})`);
  if ((meta.tags || []).some((t) => t.length > 30)) problems.push('a tag is longer than 30 chars');
  if (!['private', 'unlisted', 'public'].includes(meta.privacyStatus)) problems.push('privacyStatus must be private|unlisted|public');
  if (!meta.categoryId) problems.push('categoryId missing');
  return { ok: problems.length === 0, problems, tagChars };
}

const fmtTime = (s) => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export function writeMetadata(ir, meta, dir = OUT_DIR) {
  const file = path.join(dir, `${ir.id}.metadata.json`);
  fs.writeFileSync(file, JSON.stringify(meta, null, 2));
  return file;
}
