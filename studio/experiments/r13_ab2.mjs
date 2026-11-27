// r13_ab2.mjs — rigorous A/B with two controls:
//   (1) B is segmented into the SAME 7 sentences via word alignment, so the
//       per-beat comparison is like-for-like (not arbitrary silence chunks).
//   (2) A's RAW per-beat clips are measured BEFORE DSP, so we can attribute
//       variation to the TTS performance vs to our shaping.
import fs from 'node:fs';
import * as VK from '../src/voicekit.mjs';
import * as P from '../src/prosody.mjs';
import * as AP from '../src/audiopipe.mjs';
import { SR } from '../src/sfxkit.mjs';

const R = 'research/artifacts/round13', AB = `${R}/ab`;
const plan = JSON.parse(fs.readFileSync(`${R}/arc-plan.json`, 'utf8'));
const scenes = JSON.parse(fs.readFileSync(`${R}/test-scenes.json`, 'utf8')).scenes;
const arcText = scenes.find((s) => s.id === 'arc').script;

// ---- align B and cut it into the same 7 sentences --------------------------
console.log('aligning B (single take) to sentence boundaries...');
const bWords = await AP.alignWords(`${AB}/B-baseline-single.wav`, arcText, { lang: 'en' });
console.log('B words aligned:', bWords.length);
const B = VK.loadVoice(`${AB}/B-baseline.wav`, SR);
let wi = 0;
const bBeats = [];
for (const b of plan.beats) {
  const n = b.text.split(/\s+/).filter(Boolean).length;
  const slice = bWords.slice(wi, wi + n);
  wi += n;
  if (!slice.length) { bBeats.push({ id: b.id, emotion: b.emotion, t0: 0, t1: 0.01, words: n }); continue; }
  const t0 = Math.max(0, slice[0].t + 0.8 - 0.06);           // +0.8 lead added to B
  const t1 = Math.min(B.length / SR, slice[slice.length - 1].t + slice[slice.length - 1].dur + 0.8 + 0.06);
  bBeats.push({ id: b.id, emotion: b.emotion, t0, t1, words: n });
}

// ---- measure: A raw (pre-DSP), A final (post-DSP), B per sentence ----------
const rawPer = [], rawLabels = [];
for (const b of plan.beats) {
  let x = VK.loadVoice(`${AB}/A-${b.id}.wav`, SR);
  x = VK.trimEdges(x, SR, { thrDb: -58 }).samples;
  const m = P.analyzeTake(x, SR, { label: b.id });
  rawPer.push({ id: b.id, emotion: b.emotion, dur: m.durationSec, f0MedianHz: m.f0MedianHz, pitchRangeSt: m.pitchRangeSt, pitchStdSt: m.pitchStdSt, dynamicRangeDb: m.dynamicRangeDb, centroidHz: m.centroidHz, wordsPerSec: +(b.words / Math.max(0.1, m.speechSec)).toFixed(2) });
}
const A = VK.loadVoice(`${AB}/A-directed.wav`, SR);
const aBeats = JSON.parse(fs.readFileSync(`${AB}/A-directed.beats.json`, 'utf8'));
const aPer = P.analyzeBeats(A, SR, aBeats);
const bPer = P.analyzeBeats(B, SR, bBeats);

const vRaw = P.beatVariation(rawPer), vA = P.beatVariation(aPer), vB = P.beatVariation(bPer);
fs.writeFileSync(`${AB}/comparison.json`, JSON.stringify({ rawPerBeatA: rawPer, finalPerBeatA: aPer, perBeatB: bPer, variationRawA: vRaw, variationFinalA: vA, variationB: vB, bWords }, null, 2));

const f = (v, d = 2) => (v == null ? '-' : Number(v).toFixed(d));
console.log('\n════ PER-BEAT: raw TTS read (no DSP) ════');
console.log('  beat emotion     f0Hz rangeSt  w/s  centroid');
for (const b of rawPer) console.log(`  ${b.id} ${b.emotion.padEnd(10)} ${String(b.f0MedianHz).padStart(5)} ${f(b.pitchRangeSt).padStart(7)} ${f(b.wordsPerSec).padStart(5)} ${String(b.centroidHz).padStart(8)}`);
console.log('\n════ PER-BEAT: B single take, SAME sentences ════');
console.log('  beat emotion     f0Hz rangeSt  w/s  centroid');
for (const b of bPer) console.log(b.skipped ? `  ${b.id} skipped` : `  ${b.id} ${(b.emotion || '-').padEnd(10)} ${String(b.f0MedianHz).padStart(5)} ${f(b.pitchRangeSt).padStart(7)} ${f(b.wordsPerSec).padStart(5)} ${String(b.centroidHz).padStart(8)}`);

const cmp = (name, r, a, b) => {
  const g = (o, k) => o?.[k]?.std;
  console.log(`  ${name.padEnd(16)} rawTTS=${f(g(r, name) ?? 0)}   directed=${f(g(a, name) ?? 0)}   single=${f(g(b, name) ?? 0)}`);
};
console.log('\n════ BETWEEN-BEAT STD (emotional travel; higher = more varied) ════');
for (const k of ['f0MedianHz', 'pitchRangeSt', 'wordsPerSec', 'dynamicRangeDb', 'centroidHz']) cmp(k, vRaw, vA, vB);
console.log('\nInterpretation: rawTTS column = what the per-beat performance alone achieved.');
console.log('directed column adds our DSP. single column = the old one-take method.');
console.log('These are measurements. The ear test is the user\'s.');
