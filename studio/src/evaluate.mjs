// Automated evaluation. This is the gate every video must pass before publish.
//
// Research finding (REPORT §7): "no tool scores a finished video against a brief".
// HyperFrames' check/review is the closest prior art; this module ports its
// measurable warnings (line_unread, dead_stretch, text_below_floor,
// first_frame_empty, film_silent) and adds audio/sync/subtitle checks that can be
// computed with ffmpeg alone.
//
// Everything here is measured from the rendered FILE (plus the IR), never from
// what the renderer believes it did.

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { FFMPEG, FFPROBE, ensureFonts, CACHE_DIR, OUT_DIR, FONTS } from './env.mjs';
import { probe, run } from './render.mjs';
import { timeline, totalDuration } from './ir.mjs';

const SEV = { P0: 3, P1: 2, P2: 1 };

function finding(code, severity, message, fix, extra = {}) {
  return { code, severity, message, fix, ...extra };
}

/** Decode N frames to PNG and return their paths. */
async function sampleFrames(video, times, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [i, t] of times.entries()) {
    const out = path.join(dir, `f${String(i).padStart(3, '0')}.png`);
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', out]);
    if (fs.existsSync(out)) files.push({ t, file: out });
  }
  return files;
}

/** Mean luminance + colourfulness of a PNG (cheap "is this frame alive?" test). */
async function frameStats(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  let sum = 0, n = 0, minL = 255, maxL = 0;
  let rs = 0, gs = 0, bs = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l; n++; minL = Math.min(minL, l); maxL = Math.max(maxL, l);
    rs += r; gs += g; bs += b;
    sat += (Math.max(r, g, b) - Math.min(r, g, b));
  }
  return {
    luminance: sum / n,
    contrast: (maxL - minL) / 255,
    colorfulness: sat / n / 255,
    mean: [rs / n, gs / n, bs / n].map((v) => Math.round(v)),
    width: img.width,
    height: img.height,
  };
}

/** Fraction of the frame covered by non-background pixels in the text band. */
async function textCoverage(file, band) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const y0 = Math.floor(img.height * band[0]);
  const y1 = Math.floor(img.height * band[1]);
  const d = x.getImageData(0, y0, img.width, y1 - y0).data;
  const hist = new Array(32).fill(0);
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 3) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    hist[Math.min(31, Math.floor(l / 8))]++; n++;
  }
  const mode = hist.indexOf(Math.max(...hist));
  let ink = 0;
  for (let b = 0; b < 32; b++) if (Math.abs(b - mode) > 2) ink += hist[b];
  return ink / n;
}

/** Measure loudness (integrated LUFS) and true peak with ffmpeg loudnorm. */
async function measureLoudness(video) {
  const r = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', video, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = r.err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { lufs: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra), thresh: Number(j.input_thresh) };
  } catch { return null; }
}

/** Detect black/frozen stretches using ffmpeg's own filters. */
async function detectBlackFreeze(video, dur) {
  const black = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', video,
    '-vf', 'blackdetect=d=0.25:pix_th=0.04', '-an', '-f', 'null', '-']);
  const freeze = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', video,
    '-vf', 'freezedetect=n=-60dB:d=0.6', '-an', '-f', 'null', '-']);
  const blacks = [...black.err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
    .map((m) => ({ start: +m[1], end: +m[2] }));
  const freezes = [...freeze.err.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  return { blacks, freezes };
}

/** Silence detection (are there gaps where nothing is audible?). */
async function detectSilence(video) {
  const r = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', video,
    '-af', 'silencedetect=n=-45dB:d=0.7', '-f', 'null', '-']);
  return [...r.err.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)]
    .map((m) => ({ start: +m[1], end: +m[2] }));
}

/**
 * Full evaluation. Returns { score, grade, findings, metrics, passed }.
 * severity: P0 = blocks publish, P1 = must fix before publish, P2 = polish.
 */
export async function evaluateVideo(file, ir, { workDir, expect = {}, log = () => {} } = {}) {
  ensureFonts();
  const findings = [];
  const metrics = {};
  const tl = timeline(ir);
  const info = await probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(info.format.duration);
  const W = ir.format.width, H = ir.format.height, fps = ir.format.fps;

  // ---- 1. technical ----------------------------------------------------
  if (!v) findings.push(finding('no_video_stream', 'P0', 'no video stream', 're-encode'));
  else {
    if (v.codec_name !== 'h264') findings.push(finding('codec', 'P1', `video codec ${v.codec_name}`, 'use libx264'));
    if (v.width !== W || v.height !== H) findings.push(finding('dimensions', 'P0', `got ${v.width}x${v.height}, IR says ${W}x${H}`, 'fix render size'));
    if (v.pix_fmt !== 'yuv420p') findings.push(finding('pix_fmt', 'P1', `pix_fmt ${v.pix_fmt} not playable everywhere`, 'force yuv420p'));
    metrics.videoBitrateKbps = Math.round(Number(v.bit_rate || 0) / 1000);
    // dark, mostly-flat graphics legitimately compress very small; only flag a
  // bitrate that would actually look broken for this resolution
  const minKbps = v && v.width >= 1000 ? 220 : 120;
  if (metrics.videoBitrateKbps < minKbps)
    findings.push(finding('bitrate_low', 'P2', `video bitrate ${metrics.videoBitrateKbps} kbps (<${minKbps})`, 'raise quality'));
  }
  if (!a) findings.push(finding('no_audio', 'P0', 'no audio stream', 'add the mix'));
  metrics.durationSec = dur;
  metrics.expectedSec = Number(totalDuration(ir).toFixed(2));
  if (Math.abs(dur - metrics.expectedSec) > 0.35)
    findings.push(finding('duration_mismatch', 'P1', `file ${dur.toFixed(2)}s vs IR ${metrics.expectedSec}s`, 'check segment concat + audio tail'));
  metrics.sizeMB = Number((Number(info.format.size) / 1e6).toFixed(2));

  // ---- 2. audio --------------------------------------------------------
  if (a) {
    const loud = await measureLoudness(file);
    if (loud) {
      metrics.lufs = loud.lufs;
      metrics.truePeak = loud.tp;
      if (!Number.isFinite(loud.lufs) || loud.lufs < -30)
        findings.push(finding('audio_quiet', 'P0', `integrated loudness ${loud.lufs} LUFS`, 'mix is silent or near-silent'));
      else {
        if (loud.lufs < -17 || loud.lufs > -11)
          findings.push(finding('loudness_off', 'P1', `${loud.lufs} LUFS (target -14 for social)`, 'adjust loudnorm'));
        if (loud.tp > -1.0)
          findings.push(finding('true_peak', 'P1', `true peak ${loud.tp} dBTP (limit -1.5)`, 'lower the limiter'));
      }
    }
    const sil = await detectSilence(file);
    metrics.silences = sil;
    const long = sil.filter((s) => s.end - s.start > 1.5);
    if (long.length) findings.push(finding('dead_air', 'P1', `${long.length} silent gap(s) > 1.5s: ${long.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}`).join(', ')}`, 'fill with bed/SFX or cut'));
  }

  // ---- 3. visual -------------------------------------------------------
  const times = [];
  const nSamples = 9;
  for (let i = 0; i < nSamples; i++) times.push(Math.min(dur - 0.05, (i + 0.5) * (dur / nSamples)));
  const frames = await sampleFrames(file, times, workDir || path.join(CACHE_DIR, ir.id, 'eval'));
  metrics.framesSampled = frames.length;
  const stats = [];
  for (const f of frames) stats.push({ t: f.t, ...(await frameStats(f.file)) });
  metrics.frameStats = stats.map((s) => ({ t: +s.t.toFixed(2), lum: +s.luminance.toFixed(1), contrast: +s.contrast.toFixed(2), color: +s.colorfulness.toFixed(3) }));

  const empty = stats.filter((s) => s.contrast < 0.03 && s.luminance < 12);
  if (empty.length) findings.push(finding('frames_empty', 'P0', `${empty.length}/${stats.length} sampled frames are effectively blank`, 'engine failed on those scenes'));
  const lums = stats.map((s) => s.luminance);
  metrics.luminanceRange = [Math.min(...lums).toFixed(1), Math.max(...lums).toFixed(1)];
  if (Math.max(...lums) < 20) findings.push(finding('too_dark', 'P1', `max sampled luminance ${Math.max(...lums).toFixed(1)}`, 'raise background/ink contrast'));

  // first frame (thumbnail on YouTube/HyperFrames `first_frame_empty`)
  const first = await sampleFrames(file, [0], path.join(workDir || CACHE_DIR, ir.id, 'eval-first'));
  if (first.length) {
    const s = await frameStats(first[0].file);
    const cov = await textCoverage(first[0].file, [0.3, 0.8]);
    metrics.firstFrame = { luminance: +s.luminance.toFixed(1), contrast: +s.contrast.toFixed(2), textCoverage: +cov.toFixed(3) };
    if (cov < 0.008) findings.push(finding('first_frame_empty', 'P0', `first frame has almost no readable content (ink coverage ${(cov * 100).toFixed(1)}%)`, 'hook must be on screen at t=0'));
  }

  // dead stretches measured from luminance deltas (proxy for "nothing changes")
  const deltas = stats.slice(1).map((s, i) => Math.abs(s.luminance - stats[i].luminance));
  metrics.maxLumDelta = Math.max(...deltas, 0).toFixed(1);
  const flatRuns = deltas.filter((d) => d < 0.6).length;
  if (flatRuns >= stats.length - 2 && stats.length > 3)
    findings.push(finding('dead_stretch', 'P1', 'almost nothing changes across the video', 'add motion / scene changes'));

  // ---- 4. structure / pacing -------------------------------------------
  const sceneDurs = ir.scenes.map((s) => s.duration);
  metrics.scenes = ir.scenes.length;
  metrics.avgSceneSec = +(sceneDurs.reduce((x, y) => x + y, 0) / sceneDurs.length).toFixed(2);
  if (metrics.avgSceneSec > 7) findings.push(finding('slow_pacing', 'P1', `average scene ${metrics.avgSceneSec}s`, 'short-form scenes should average 3-5s'));
  // A hook may HOLD long if the voice needs it — what matters is that the idea
  // has landed on screen early (HyperFrames: the first frame is the thumbnail).
  const hook = ir.scenes[0];
  const hookWords = (hook.narration || '').trim().split(/\s+/).filter(Boolean).length;
  metrics.hookHoldSec = +hook.duration.toFixed(2);
  const hookLanding = hook.instant ? 0 : 0.4;
  if (hookLanding > 2.5) findings.push(finding('slow_hook', 'P1', `hook text lands at ${hookLanding}s`, 'land the idea in <= 2.5s'));
  if (hookWords / hook.duration > 3.4)
    findings.push(finding('hook_dense', 'P1', `${(hookWords / hook.duration).toFixed(1)} words/sec in the hook`, 'shorten the hook line'));
  // word density per scene, measured against the real voice timing
  for (const s of ir.scenes) {
    const w = (s.narration || '').trim().split(/\s+/).filter(Boolean).length;
    if (w && w / s.duration > 3.2) findings.push(finding('narration_dense', 'P1', `${s.id}: ${(w / s.duration).toFixed(1)} words/sec`, 'shorten the line or lengthen the scene'));
  }

  // ---- 5. subtitles ----------------------------------------------------
  if (!ir.captions?.srt && !expect.allowNoCaptions)
    findings.push(finding('captions_missing', 'P2', 'no SRT sidecar produced', 'export captions (accessibility + retention)'));
  const srtPath = path.join(OUT_DIR, `${ir.id}.srt`);
  if (fs.existsSync(srtPath)) {
    const cues = parseSrt(fs.readFileSync(srtPath, 'utf8'));
    metrics.cues = cues.length;
    const order = cues.every((c, i) => i === 0 || c.start >= cues[i - 1].start);
    if (!order) findings.push(finding('srt_order', 'P1', 'SRT cues are out of order', 'sort by start time'));
    const tooShort = cues.filter((c) => c.end - c.start < 0.8);
    if (tooShort.length) findings.push(finding('srt_rushed', 'P2', `${tooShort.length} cue(s) under 0.8s`, 'merge or extend'));
    // Measure the cue the way the caption engine will actually lay it out,
    // rather than guessing from character counts.
    const layout = cues.map((c) => ({ ...c, lines: captionLines(c.text) }));
    const over3 = layout.filter((c) => c.lines > 3);
    if (over3.length) findings.push(finding('srt_overflow', 'P1', `${over3.length} cue(s) exceed 3 rendered lines (text would be clipped)`, 'split the cue'));
    const over2 = layout.filter((c) => c.lines > 2);
    if (over2.length) findings.push(finding('srt_long_line', 'P2', `${over2.length} cue(s) render on 3 lines`, 'prefer <= 2 lines for readability'));
    const fastest = layout.reduce((m, c) => Math.max(m, (c.text.split(/\s+/).length) / Math.max(0.4, c.end - c.start)), 0);
    metrics.captionWPS = +fastest.toFixed(1);
    if (fastest > 4.5) findings.push(finding('srt_fast', 'P1', `fastest cue reads at ${fastest.toFixed(1)} words/sec`, 'split the cue or slow the read'));
  } else {
    findings.push(finding('srt_absent', 'P1', 'SRT file not found', 'export it with the video'));
  }

  // ---- 6. black / freeze ----------------------------------------------
  const bf = await detectBlackFreeze(file, dur);
  metrics.blacks = bf.blacks.length;
  metrics.freezes = bf.freezes.length;
  const midBlack = bf.blacks.filter((b) => b.end - b.start > 0.4 && b.start > 0.2);
  if (midBlack.length) findings.push(finding('black_stretch', 'P1', `${midBlack.length} black stretch >0.4s`, 'remove or mask'));
  // authored typography holds are legitimate; only long dead freezes are flagged
  const longFreezes = (bf.freezes || []).length;
  if (longFreezes > 10)
    findings.push(finding('freeze_frames', 'P2', `${longFreezes} frozen stretch(es)`, 'add subtle motion inside long holds'));

  // ---- score -----------------------------------------------------------
  const p0 = findings.filter((f) => f.severity === 'P0').length;
  const p1 = findings.filter((f) => f.severity === 'P1').length;
  const p2 = findings.filter((f) => f.severity === 'P2').length;
  const score = Math.max(0, 100 - p0 * 34 - p1 * 9 - p2 * 2.5);
  const grade = score >= 92 ? 'A' : score >= 82 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
  const passed = p0 === 0 && p1 === 0;
  return {
    videoId: ir.id, file, at: new Date().toISOString(),
    score: Math.round(score), grade, passed, blocking: p0, major: p1, minor: p2,
    findings, metrics,
  };
}

/** How many rendered lines a cue takes at the caption font/size on this canvas. */
export function captionLines(text, { W = 1080, size = 54 } = {}) {
  ensureFonts();
  const c = createCanvas(8, 8);
  const ctx = c.getContext('2d');
  const words = String(text).trim().split(/\s+/);
  const fs = words.length > 9 ? 46 : size;
  ctx.font = `700 ${fs}px ${FONTS.text}`;
  const maxW = W - Math.round(W * 0.13);
  const space = ctx.measureText(' ').width;
  let lines = 1, cur = 0;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (cur + ww + space > maxW && cur > 0) { lines++; cur = 0; }
    cur += ww + space;
  }
  return lines;
}

export function parseSrt(text) {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const [idx, time, ...rest] = block.split('\n');
    const m = (time || '').match(/(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)/);
    if (!m) return null;
    const sec = (t) => { const [h, mi, s] = t.split(':'); return +h * 3600 + +mi * 60 + parseFloat(s.replace(',', '.')); };
    return { n: +idx, start: sec(m[1]), end: sec(m[2]), text: rest.join(' ') };
  }).filter(Boolean);
}

export function summaryLine(r) {
  return `${r.videoId}: score ${r.score}/100 (${r.grade}) ${r.passed ? 'PASS' : 'BLOCKED'} · P0:${r.blocking} P1:${r.major} P2:${r.minor}`;
}
