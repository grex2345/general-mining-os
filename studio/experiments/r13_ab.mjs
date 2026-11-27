// r13_ab.mjs — A/B: single-take baseline (B) vs beat-segmented directed (A).
// Same voice (voice-03), same story text. Only the METHOD differs.
// Run: node studio/experiments/r13_ab.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as D from '../src/voicedir.mjs';
import * as VK from '../src/voicekit.mjs';
import * as P from '../src/prosody.mjs';
import { writeWav, SR } from '../src/sfxkit.mjs';

const R = 'research/artifacts/round13';
const AB = `${R}/ab`;
const scenes = JSON.parse(fs.readFileSync(`${R}/test-scenes.json`, 'utf8')).scenes;
const arc = scenes.find((s) => s.id === 'arc');
const plan = JSON.parse(fs.readFileSync(`${R}/arc-plan.json`, 'utf8'));

// ---- A: assemble the directed beats ---------------------------------------
const clips = plan.beats.map((b) => ({ beatId: b.id, file: `${AB}/A-${b.id}.wav` }));
console.log('assembling A (directed, per-beat)...');
const asm = await VK.assemble(clips, plan, { leadIn: 0.8, tighten: true, breaths: true, applyDsp: true, align: true, lang: 'en' });
VK.writeAssembly(asm, `${AB}/A-directed`);
console.log(`A: ${asm.durationSec}s, ${asm.beats.length} beats, ${asm.words.length} words`);
console.log('align methods:', JSON.stringify(asm.alignMethods));

// ---- B: the single take, trimmed the same way for fairness -----------------
let bx = VK.loadVoice(`${AB}/B-baseline-single.wav`, SR);
const btr = VK.trimEdges(bx, SR, { thrDb: -58 });
bx = btr.samples;
// same lead-in so both start at the same place
const lead = new Float32Array(Math.round(0.8 * SR));
const B = new Float32Array(lead.length + bx.length);
B.set(lead, 0); B.set(bx, lead.length);
writeWav(`${AB}/B-baseline.wav`, B, SR);

// ---- measure ---------------------------------------------------------------
const mA = P.analyzeTake(asm.samples, SR, { words: asm.words, label: 'A: directed, per-beat' });
const mB = P.analyzeTake(B, SR, { label: 'B: single take' });
const perBeat = P.analyzeBeats(asm.samples, SR, asm.beats);
const variationA = P.beatVariation(perBeat);

// B has no beat metadata; segment it by its own sentences for a comparable view
const bSegs = P.segments(B, SR, { thrDb: -45, minSec: 0.15 }).filter((s) => s.speech);
const bBeats = bSegs.map((s, i) => ({ id: `B${i}`, emotion: '-', t0: s.t0, t1: s.t1 }));
const bPerBeat = P.analyzeBeats(B, SR, bBeats);
const bVariation = P.beatVariation(bPerBeat);

fs.writeFileSync(`${AB}/measurements.json`, JSON.stringify({ A: mA, B: mB, perBeatA: perBeat, variationA, perBeatB: bPerBeat, variationB: bVariation }, null, 2));

const row = (k, a, b, unit = '') => `  ${k.padEnd(24)} ${String(a).padStart(9)}  ${String(b).padStart(9)}   ${unit}`;
console.log('\n════════ A/B MEASUREMENTS (A = directed, B = single take) ════════');
console.log(row('metric', 'A', 'B'));
for (const [k, u] of [['durationSec', 's'], ['wordsPerSec', 'w/s(speech)'], ['wordsPerSecWall', 'w/s(wall)'], ['f0MedianHz', 'Hz'], ['pitchRangeSt', 'semitones'], ['pitchStdSt', 'semitones'], ['pitchMoveMeanSt', 'st/frame'], ['gesturesPer10s', '/10s'], ['dynamicRangeDb', 'dB'], ['rmsStdDb', 'dB'], ['pauseCount', ''], ['pauseMeanSec', 's'], ['pauseMaxSec', 's'], ['silenceFrac', ''], ['centroidHz', 'Hz']]) {
  console.log(row(k, mA[k] ?? '-', mB[k] ?? '-', u));
}
console.log('\n──── PER-BEAT (A): did delivery follow the emotion? ────');
console.log('  beat  emotion     dur   f0Hz  rangeSt  w/s   dynDb  centroid');
for (const b of perBeat) {
  if (b.skipped) { console.log(`  ${b.id}  ${b.emotion}  (too short)`); continue; }
  console.log(`  ${b.id}  ${b.emotion.padEnd(10)} ${String(b.dur).padStart(5)} ${String(b.f0MedianHz).padStart(5)} ${String(b.pitchRangeSt).padStart(7)} ${String(b.wordsPerSec ?? '-').padStart(5)} ${String(b.dynamicRangeDb).padStart(6)} ${String(b.centroidHz).padStart(8)}`);
}
console.log('\n──── BETWEEN-BEAT VARIATION (higher std = more emotional travel) ────');
console.log('  A:', JSON.stringify(variationA));
console.log('  B:', JSON.stringify(bVariation));
console.log('\n──── assembly report ────');
for (const r of asm.report) console.log(`  ${r.id} ${r.emotion.padEnd(10)} raw ${r.rawSec}s -> ${r.finalSec}s  trimmed ${r.trimmedStart}/${r.trimmedEnd}  gaps ${r.gapsTightened} (-${r.gapSecRemoved}s)  breath ${r.breathSec}s`);
console.log('\nNOTE: these are MEASUREMENTS, not listening. Ear judgement is the user\'s.');
