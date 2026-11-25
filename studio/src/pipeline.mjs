// Orchestrator: evidence -> IR -> fit -> route -> render -> finish -> captions
//               -> thumbnail -> metadata -> evaluate -> (repair) -> evaluate.
//
// This is the "one command" entry point. Every stage records what actually
// happened into data/runs.jsonl so successful workflows can be reused and
// failures can be diagnosed later.

import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, CACHE_DIR } from './env.mjs';
import { loadBundle, validateBundle, sourceLine } from './research.mjs';
import { planVideo, outlineToIR, storyboard } from './director.mjs';
import { validateIR, timeline, totalDuration } from './ir.mjs';
import { fitScenes } from './fit.mjs';
import { logRun, routeIR } from './router.mjs';
import './adapters.mjs';
import {
  renderNative, finishVideo, exportSRT, srtString, still, contactSheet, probe,
} from './render.mjs';
import { evaluateVideo, summaryLine } from './evaluate.mjs';
import { heroFrame, composeThumbnail, validateThumbnail, buildMetadata, validateMetadata, writeMetadata } from './publish.mjs';

const p = (...a) => path.join(...a);

export async function produce({
  evidence, outline = null, id, palette = 'midnight', brand = 'GENERAL MINING OS',
  format = { width: 1080, height: 1920, fps: 30 }, maxDuration = 75,
  keepSegments = false, log = console.log, repairAttempts = 2,
} = {}) {
  const t0 = Date.now();
  const result = { stages: [], ok: false, repairs: [] };
  const stage = (name, data = {}) => {
    const s = { stage: name, ms: Date.now() - t0, ...data };
    result.stages.push(s);
    log(`\n▶ ${name}${data.note ? ' — ' + data.note : ''}`);
    return s;
  };

  // --- 1. evidence ------------------------------------------------------
  stage('evidence');
  const bundle = typeof evidence === 'string' ? loadBundle(evidence) : evidence;
  const ev = validateBundle(bundle);
  if (!ev.ok) throw new Error('evidence rejected:\n  - ' + ev.problems.join('\n  - '));
  log(`  bundle ${bundle.id}: ${bundle.facts.length} facts, ${(bundle.series || []).length} series`);
  if (ev.warnings.length) ev.warnings.forEach((w) => log(`  ! ${w}`));

  // --- 2. direction -----------------------------------------------------
  stage('director');
  const videoId = id || `video-${bundle.id}`;
  let ir = outline
    ? outlineToIR(outline, bundle, { id: videoId, palette, brand, format })
    : planVideo(bundle, { id: videoId, palette, brand, format });
  validateIR(ir, { maxDuration });
  log('\n' + storyboard(ir));

  // --- 3. fit to the real voice ----------------------------------------
  stage('fit');
  const fitted = fitScenes(ir, { pad: 0.5, maxTotal: maxDuration });
  if (fitted.changes.length) {
    fitted.changes.forEach((c) => log(`  ${c.scene} (${c.kind}): ${c.from.toFixed(2)}s -> ${c.to}s to fit ${c.vo}s of voice`));
  } else log('  all scenes already fit the voice');
  let tl = timeline(ir);
  validateIR(ir, { maxDuration });
  log(`  timeline: ${tl.totalFrames} frames, ${tl.duration.toFixed(2)}s`);

  // --- 4. routing -------------------------------------------------------
  stage('route');
  const plan = await routeIR(ir, { log });
  log(`  render=${plan.globals.find((g) => g.capability === 'render:video')?.adapter} audio=${
    plan.globals.filter((g) => g.capability.startsWith('audio:')).map((g) => g.adapter).join('+')}`);

  // --- 5. render --------------------------------------------------------
  stage('render');
  const silent = p(CACHE_DIR, ir.id, 'silent.mp4');
  let r;
  try {
    r = await renderNative(ir, tl, { outFile: silent, log: (m) => log('  ' + m) });
  } catch (e) {
    result.error = `render failed: ${e.message}`;
    log('  ✗ ' + result.error);
    logRun({ type: 'pipeline', ok: false, ir, error: result.error });
    throw e;
  }
  log(`  ${r.frames} frames in ${(r.renderMs / 1000).toFixed(1)}s (${(r.frames / (r.renderMs / 1000)).toFixed(1)} fps)`);

  // --- 6. audio + mux ---------------------------------------------------
  stage('audio');
  const finalFile = p(OUT_DIR, `${ir.id}.mp4`);
  const fin = await finishVideo(ir, tl, r.file, { outFile: finalFile });
  log(`  voice: ${fin.audio.voiceCues.length} cues, bed ${fin.audio.bedLevel}, sfx ${fin.audio.sfx.length}`);

  // --- 7. captions ------------------------------------------------------
  stage('captions');
  const cues = exportSRT(ir, tl);
  const srt = p(OUT_DIR, `${ir.id}.srt`);
  fs.writeFileSync(srt, srtString(cues));
  ir.captions = { srt, cues: cues.length };
  log(`  ${cues.length} cues -> ${path.basename(srt)}`);

  // --- 8. thumbnail -----------------------------------------------------
  stage('thumbnail');
  const t = (tl.scenes[0].end) * 0.55; // hero: settled hook frame
  const heroPng = await heroFrame(finalFile, t, p(CACHE_DIR, ir.id, 'hero.png'));
  const brief = ir.meta?.thumb || {};
  const thumb = await composeThumbnail({
    ir, heroPng,
    headline: brief.headline || ir.scenes[0]?.title,
    kicker: brief.kicker || ir.meta?.brand || 'MINING DATA',
    stat: brief.stat,
    statLabel: brief.statLabel,
    outFile: p(OUT_DIR, `${ir.id}.thumb.png`),
  });
  const thumbCheck = await validateThumbnail(thumb);
  log(`  ${path.basename(thumb)} ${thumbCheck.ok ? 'OK' : 'ISSUES: ' + thumbCheck.problems.join('; ')}`);

  // --- 9. metadata ------------------------------------------------------
  stage('metadata');
  const meta = buildMetadata(ir, bundle);
  const metaCheck = validateMetadata(meta);
  const metaFile = writeMetadata(ir, meta);
  if (!metaCheck.ok) log('  ! ' + metaCheck.problems.join('; '));
  log(`  "${meta.title}" (${meta.title.length} chars), ${meta.tags.length} tags, ${metaCheck.tagChars} tag chars`);

  // --- 10. evaluate (+ repair loop) ------------------------------------
  let evaluation;
  for (let attempt = 0; attempt <= repairAttempts; attempt++) {
    stage(`eval${attempt ? `-after-repair-${attempt}` : ''}`);
    evaluation = await evaluateVideo(finalFile, ir, { log });
    log('  ' + summaryLine(evaluation));
    for (const f of evaluation.findings) log(`    [${f.severity}] ${f.code}: ${f.message}  -> ${f.fix}`);
    if (evaluation.passed || attempt === repairAttempts) break;

    // automatic repair: only touch things we can fix without re-authoring
    const fixed = applyRepairs(ir, evaluation, { log });
    result.repairs.push({ attempt: attempt + 1, actions: fixed, findings: evaluation.findings.map((f) => f.code) });
    if (!fixed.length) { log('  no automatic repair available for the remaining findings'); break; }
    // re-derive timeline and re-render
    tl = timeline(ir);
    await renderNative(ir, tl, { outFile: silent });
    await finishVideo(ir, tl, silent, { outFile: finalFile });
    fs.writeFileSync(srt, srtString(exportSRT(ir, tl)));
  }

  const probeInfo = await probe(finalFile);
  await contactSheet(finalFile, p(OUT_DIR, `${ir.id}.sheet.jpg`));

  // --- result -----------------------------------------------------------
  const record = {
    type: 'pipeline',
    ok: evaluation.passed,
    at: new Date().toISOString(),
    ir: { id: ir.id, format: ir.format, scenes: ir.scenes.length, durationSec: +totalDuration(ir).toFixed(2) },
    adapters: {
      render: plan.globals.find((g) => g.capability === 'render:video')?.adapter,
      audio: plan.globals.filter((g) => g.capability.startsWith('audio:')).map((g) => g.adapter).join('+'),
      eval: plan.globals.find((g) => g.capability === 'eval:video')?.adapter,
    },
    durationSec: Number(probeInfo.format.duration),
    renderMs: r.renderMs,
    eval: { score: evaluation.score, grade: evaluation.grade, blocking: evaluation.blocking, major: evaluation.major },
    files: { video: finalFile, srt, thumb, metadata: metaFile },
    totalMs: Date.now() - t0,
  };
  logRun(record);
  result.ok = evaluation.passed;
  result.ir = ir;
  result.timeline = tl;
  result.evaluation = evaluation;
  result.files = record.files;
  result.record = record;
  result.thumbCheck = thumbCheck;
  result.metaCheck = metaCheck;
  result.totalMs = Date.now() - t0;
  if (!keepSegments) {
    try { fs.rmSync(p(CACHE_DIR, ir.id), { recursive: true, force: true }); } catch {}
  }
  log(`\n${evaluation.passed ? '✔ PASSED' : '✖ BLOCKED'}  score ${evaluation.score}/100 (${evaluation.grade}) in ${(result.totalMs / 1000).toFixed(1)}s`);
  log(`  video: ${finalFile}`);
  return result;
}

/**
 * Repairs that are safe and mechanical. Deliberately limited: a repair must not
 * invent content or change what is claimed on screen.
 */
export function applyRepairs(ir, evaluation, { log = () => {} } = {}) {
  const actions = [];
  const has = (code) => evaluation.findings.some((f) => f.code === code);

  if (has('slow_hook') || has('slow_pacing')) {
    // trim the tail of scenes that have lots of silence after the voice
    for (const s of ir.scenes.slice(1)) {
      const before = s.duration;
      s.duration = Number(Math.max(2.2, s.duration - 0.35).toFixed(2));
      if (s.duration !== before) actions.push(`trim ${s.id} ${before.toFixed(2)}->${s.duration}s`);
    }
  }
  if (has('loudness_off')) {
    ir.audio = { ...(ir.audio || {}), loudnessFix: true };
    actions.push('re-normalise loudness (mux again)');
  }
  if (has('srt_long_line') || has('srt_rushed')) {
    ir.meta = { ...(ir.meta || {}), captionChunk: 6 };
    actions.push('re-chunk captions at 6 words');
  }
  if (has('first_frame_empty')) {
    // make the hook text fully visible at t=0 by shortening its entrance
    const h = ir.scenes[0];
    if (h?.kind === 'hook') {
      h.instant = true;
      actions.push('hook rendered instantly at t=0');
    }
  }
  if (has('dead_air') || has('black_stretch')) {
    ir.audio = { ...(ir.audio || {}), energy: Math.min(1, (ir.audio?.energy ?? 0.5) + 0.15) };
    actions.push('raise bed energy for gaps');
  }
  actions.forEach((a) => log(`  ↻ repair: ${a}`));
  return actions;
}
