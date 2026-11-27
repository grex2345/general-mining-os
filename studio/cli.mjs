#!/usr/bin/env node
// Studio CLI. Every subcommand prints what it actually did, and exits non-zero
// when a video does not pass evaluation (so it can be used in CI/cron).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');

const [, , cmd = 'help', ...rest] = process.argv;
const arg = (name, fallback = undefined) => {
  const i = rest.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = rest[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const flag = (name) => rest.includes(`--${name}`);

const HELP = `studio <command> [options]

  doctor                        probe toolchain, fonts, adapters
  plan <bundle>                 print the plan without rendering
  storyboard <bundle>           print the storyboard sheet
  render <bundle>               full pipeline: render + eval + thumbnail + metadata
      --id <id>                 output id (default video-<bundle>)
      --palette midnight|paper|ember
      --max <seconds>           duration cap (default 75)
      --allow-blocked           exit 0 even if evaluation fails
  eval <file> --bundle <bundle> re-evaluate an existing mp4
  thumb <bundle>                regenerate only the thumbnail + metadata
  publish <id>                  upload to YouTube (private by default)
      --public                  owner-authorised public upload (also needs YT_ALLOW_PUBLIC=1)
      --dry-run                 build the request without sending it
  runs                          show recorded pipeline runs
  adapters                      show the capability registry
`;

async function main() {
  switch (cmd) {
    case 'help': case '--help': case '-h': {
      console.log(HELP);
      return 0;
    }

    case 'doctor': {
      const { assertToolchain, fontSmokeTest, FFMPEG, FFPROBE, DATA_DIR } = await import('./src/env.mjs');
      const { probeAdapters } = await import('./src/router.mjs');
      await import('./src/adapters.mjs');
      console.log('toolchain');
      assertToolchain();
      console.log(`  ffmpeg  ${FFMPEG}`);
      console.log(`  ffprobe ${FFPROBE}`);
      const f = await fontSmokeTest();
      console.log(`  fonts   ${f.ok ? 'ok' : 'MISSING'} ${JSON.stringify(f.families || {})}`);
      console.log('adapters');
      const rows = await probeAdapters({ log: (m) => console.log(m) });
      const missing = rows.filter((r) => !r.available);
      console.log(`\n${rows.length - missing.length}/${rows.length} adapters available`);
      if (missing.length) console.log('unavailable: ' + missing.map((m) => m.id).join(', '));
      const { credentialStatus } = await import('./src/youtube.mjs');
      const c = credentialStatus();
      console.log(`youtube: ${c.configured ? 'credentials present' : 'NOT CONFIGURED'} (no values shown)`);
      console.log(`data dir: ${DATA_DIR}`);
      return 0;
    }

    case 'plan': case 'storyboard': {
      const bundleId = rest[0];
      if (!bundleId) throw new Error('usage: studio ' + cmd + ' <bundle>');
      const { loadBundle, validateBundle } = await import('./src/research.mjs');
      const { planVideo, storyboard } = await import('./src/director.mjs');
      const { fitScenes } = await import('./src/fit.mjs');
      const { validateIR, timeline } = await import('./src/ir.mjs');
      const b = loadBundle(bundleId);
      const ev = validateBundle(b);
      console.log(`evidence ${bundleId}: ${ev.ok ? 'valid' : 'INVALID'} (${b.facts.length} facts, ${(b.series || []).length} series)`);
      ev.warnings.forEach((w) => console.log('  ! ' + w));
      const ir = planVideo(b, { id: `plan-${bundleId}`, palette: arg('palette', 'midnight'), maxDuration: Number(arg('max', 75)) });
      fitScenes(ir, { maxTotal: Number(arg('max', 75)) });
      validateIR(ir, { maxDuration: Number(arg('max', 75)) });
      const tl = timeline(ir);
      console.log('\n' + storyboard(ir));
      console.log(`timeline: ${tl.totalFrames} frames / ${tl.duration.toFixed(2)}s\n`);
      console.log('thumbnail brief: ' + JSON.stringify(ir.meta.thumb || {}));
      return 0;
    }

    case 'render': {
      const bundleId = rest[0];
      if (!bundleId) throw new Error('usage: studio render <bundle> [--id x] [--palette p]');
      const { produce } = await import('./src/pipeline.mjs');
      const res = await produce({
        evidence: bundleId,
        id: arg('id', `video-${bundleId}`),
        palette: arg('palette', 'midnight'),
        maxDuration: Number(arg('max', 75)),
      });
      const e = res.evaluation;
      console.log('\nfiles:');
      for (const [k, v] of Object.entries(res.files)) console.log(`  ${k.padEnd(9)} ${v}`);
      if (!res.thumbCheck.ok) console.log('thumb issues: ' + res.thumbCheck.problems.join('; '));
      if (!e.passed && !flag('allow-blocked')) return 2;
      return 0;
    }

    case 'eval': {
      const file = rest[0];
      const bundleId = arg('bundle');
      if (!file || !bundleId) throw new Error('usage: studio eval <file> --bundle <bundle>');
      const { loadBundle } = await import('./src/research.mjs');
      const { planVideo } = await import('./src/director.mjs');
      const { fitScenes } = await import('./src/fit.mjs');
      const { evaluateVideo, summaryLine } = await import('./src/evaluate.mjs');
      const ir = planVideo(loadBundle(bundleId), { id: path.basename(file, '.mp4') });
      fitScenes(ir, { maxTotal: Number(arg('max', 75)) });
      const r = await evaluateVideo(path.resolve(file), ir, { workDir: '/tmp/studio-eval' });
      console.log(summaryLine(r));
      r.findings.forEach((f) => console.log(`  [${f.severity}] ${f.code}: ${f.message}`));
      console.log(JSON.stringify(r.metrics, null, 1));
      const out = path.join(OUT, `${ir.id}.qa.json`);
      fs.writeFileSync(out, JSON.stringify(r, null, 2));
      console.log('written: ' + out);
      return r.passed ? 0 : 2;
    }

    case 'thumb': {
      const bundleId = rest[0];
      if (!bundleId) throw new Error('usage: studio thumb <bundle>');
      const { loadBundle } = await import('./src/research.mjs');
      const { planVideo } = await import('./src/director.mjs');
      const { fitScenes } = await import('./src/fit.mjs');
      const { timeline } = await import('./src/ir.mjs');
      const { heroFrame, composeThumbnail, validateThumbnail, buildMetadata, validateMetadata, writeMetadata } = await import('./src/publish.mjs');
      const b = loadBundle(bundleId);
      const ir = planVideo(b, { id: arg('id', `video-${bundleId}`), palette: arg('palette', 'midnight') });
      fitScenes(ir, { maxTotal: 75 });
      const tl = timeline(ir);
      const video = path.join(OUT, `${ir.id}.mp4`);
      if (!fs.existsSync(video)) throw new Error(`no rendered video at ${video}; run render first`);
      const hero = await heroFrame(video, tl.scenes[0].end * 0.55, path.join('/tmp', `${ir.id}-hero.png`));
      const brief = ir.meta.thumb || {};
      const out = await composeThumbnail({
        ir, heroPng: hero, headline: brief.headline, kicker: brief.kicker,
        stat: brief.stat, statLabel: brief.statLabel, outFile: path.join(OUT, `${ir.id}.thumb.png`),
      });
      const check = await validateThumbnail(out);
      console.log(`thumbnail ${out}: ${check.ok ? 'OK' : 'ISSUES'} ${JSON.stringify(check.metrics)}`);
      const meta = buildMetadata(ir, b);
      const mcheck = validateMetadata(meta);
      console.log(`metadata: ${mcheck.ok ? 'valid' : mcheck.problems.join('; ')} -> ${writeMetadata(ir, meta)}`);
      return check.ok && mcheck.ok ? 0 : 2;
    }

    case 'publish': {
      const id = rest[0];
      if (!id) throw new Error('usage: studio publish <id> [--public] [--dry-run]');
      const { publishVideo, credentialStatus } = await import('./src/youtube.mjs');
      const st = credentialStatus();
      console.log(`credentials: ${st.configured ? 'present' : 'NOT CONFIGURED'} (${st.source || 'none'})`);
      const meta = JSON.parse(fs.readFileSync(path.join(OUT, `${id}.metadata.json`), 'utf8'));
      const res = await publishVideo({
        file: path.join(OUT, `${id}.mp4`),
        thumbnail: path.join(OUT, `${id}.thumb.png`),
        meta,
        allowPublic: flag('public'),
        dryRun: flag('dry-run'),
      });
      console.log(JSON.stringify({ status: res.status, privacy: res.privacy, videoId: res.videoId || null, url: res.url || null, reason: res.reason || null }, null, 1));
      if (res.status === 'not_configured') {
        console.log('\nThe upload path is implemented but cannot run here. To enable it:');
        console.log('  1. create an OAuth client (Desktop) in Google Cloud Console with YouTube Data API v3 enabled');
        console.log('  2. do the consent flow once for the channel, scope https://www.googleapis.com/auth/youtube.upload');
        console.log('  3. export YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN (or data/youtube_credentials.json, git-ignored)');
        console.log('  4. studio publish ' + id + ' --dry-run   then drop --dry-run once the request looks right');
        return 3;
      }
      return res.ok ? 0 : 1;
    }

    case 'runs': {
      const { readRuns, provenConfigurations } = await import('./src/router.mjs');
      const runs = readRuns().filter((r) => r.type === 'pipeline');
      if (!runs.length) { console.log('no pipeline runs recorded yet'); return 0; }
      console.log('id                     when                  dur    score  grade  ok');
      for (const r of runs.slice(-20)) {
        console.log([
          String(r.ir?.id || '?').padEnd(22),
          String(r.at || '').slice(0, 19).padEnd(21),
          String(r.durationSec?.toFixed?.(1) ?? '?').padStart(5),
          String(r.eval?.score ?? '-').padStart(6),
          String(r.eval?.grade ?? '-').padStart(6),
          r.ok ? 'yes' : 'NO',
        ].join(' '));
      }
      const proven = provenConfigurations();
      console.log('\nproven configurations (reusable):');
      for (const p of proven) console.log(`  ${p.key}  runs=${p.runs} avgScore=${p.avgScore?.toFixed?.(1) ?? '-'}`);
      return 0;
    }

    case 'adapters': {
      const { probeAdapters, listAdapters } = await import('./src/router.mjs');
      await import('./src/adapters.mjs');
      const rows = await probeAdapters({ log: (m) => console.log(m) });
      const reg = listAdapters();
      console.log('\n' + reg.map((a) => `${a.id}\n  ${a.name}\n  caps: ${a.capabilities.join(', ')}\n  cost ${a.cost} quality ${a.quality} det ${a.deterministic}\n  licence: ${a.licence}\n  needs: ${a.needs.join(', ') || 'none'}\n  available: ${rows.find((r) => r.id === a.id)?.available}`).join('\n'));
      return 0;
    }

    default:
      console.error(`unknown command "${cmd}"\n`);
      console.log(HELP);
      return 1;
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('error: ' + e.message);
  process.exit(1);
});
