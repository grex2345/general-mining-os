// r13_film_mix.mjs — emotional score + foley + professional mix for the R13 film.
// Every event is tied to a narration beat or a visible action.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as F from '../src/foley.mjs';
import * as SA from '../src/score_arc.mjs';
import * as M from '../src/mixdesk.mjs';
import { SR } from '../src/sfxkit.mjs';

const R = 'research/artifacts/round13', FD = `${R}/film`;
const beats = JSON.parse(fs.readFileSync(`${FD}/narration.beats.json`, 'utf8'));
const narr = JSON.parse(fs.readFileSync(`${FD}/narration.report.json`, 'utf8'));
const TOTAL = 66.0;
const B = Object.fromEntries(beats.map((b) => [b.id, b]));
const t = (id, off = 0) => +(B[id].t0 + off).toFixed(3);

/* ---------------------------------------------------------- shot table ---- */
// One source of truth for picture AND sound.
const shots = [
  { name: 'towerDawn',   start: 0.0,   dur: 6.6,  trans: { type: 'fadein', dur: 0.9 },  beats: ['b01'] },
  { name: 'forge',       start: 6.6,   dur: 2.9,  trans: { type: 'dissolve', dur: 0.4 }, beats: ['b02'] },
  { name: 'craftMontage',start: 9.5,   dur: 5.2,  trans: { type: 'cut' },                beats: ['b03'] },
  { name: 'silentTower', start: 14.7,  dur: 5.1,  trans: { type: 'dissolve', dur: 0.45 },beats: ['b04'] },
  { name: 'stairs',      start: 19.8,  dur: 6.3,  trans: { type: 'cut' },                beats: ['b05'] },
  { name: 'notTouching', start: 26.1,  dur: 2.9,  trans: { type: 'dissolve', dur: 0.4 }, beats: ['b06'] },
  { name: 'tapping',     start: 29.0,  dur: 7.2,  trans: { type: 'cut' },                beats: ['b07'] },
  { name: 'heldBreath',  start: 36.2,  dur: 3.8,  trans: { type: 'dip', dur: 0.5 },      beats: ['b08'] },
  { name: 'bellFine',    start: 40.0,  dur: 3.0,  trans: { type: 'bloom', dur: 0.45 },   beats: ['b09'] },
  { name: 'stoneTruth',  start: 43.0,  dur: 9.6,  trans: { type: 'dissolve', dur: 0.5 }, beats: ['b10', 'b11'] },
  { name: 'movingBell',  start: 52.6,  dur: 4.1,  trans: { type: 'cut' },                beats: ['b12'] },
  { name: 'theRing',     start: 56.7,  dur: 9.3,  trans: { type: 'bloom', dur: 0.6 },    beats: ['b13', 'b14'] },
];
fs.writeFileSync(`${FD}/shots.json`, JSON.stringify({ TOTAL, LEAD: 1.0, shots }, null, 2));

/* ------------------------------------------------------------- ambience --- */
const amb = [];
amb.push({ t: 0.0, kind: 'wind', args: { dur: 20, strength: 0.45 }, gain: 0.5, pan: -0.2, room: 0.3, name: 'valley wind (open)' });
amb.push({ t: 0.4, kind: 'birds', args: { dur: 6 }, gain: 0.35, pan: 0.35, metres: 8, name: 'dawn birds' });
amb.push({ t: 6.6, kind: 'fire', args: { dur: 8.2 }, gain: 0.55, pan: 0.15, room: 0.25, name: 'forge fire' });
amb.push({ t: 14.9, kind: 'wind', args: { dur: 5, strength: 0.6 }, gain: 0.5, pan: 0.1, room: 0.4, name: 'tower wind' });
amb.push({ t: 15.2, kind: 'walla', args: { dur: 4.4, voices: 7 }, gain: 0.3, pan: -0.3, metres: 6, name: 'crowd below' });
amb.push({ t: 20.0, kind: 'wind', args: { dur: 6.4, strength: 0.35 }, gain: 0.32, pan: 0.25, room: 0.55, name: 'stairwell draught' });
amb.push({ t: 29.2, kind: 'wind', args: { dur: 7, strength: 0.22 }, gain: 0.24, pan: 0, room: 0.6, name: 'belfry air' });
amb.push({ t: 36.4, kind: 'walla', args: { dur: 3.4, voices: 9 }, gain: 0.22, pan: -0.2, metres: 7, name: 'town hush' });
amb.push({ t: 43.2, kind: 'wind', args: { dur: 9.4, strength: 0.3 }, gain: 0.3, pan: 0.15, room: 0.6, name: 'stone chamber air' });
amb.push({ t: 56.9, kind: 'walla', args: { dur: 8.6, voices: 10 }, gain: 0.34, pan: 0, metres: 5, name: 'valley crowd' });
amb.push({ t: 57.2, kind: 'birds', args: { dur: 7 }, gain: 0.3, pan: -0.4, metres: 9, name: 'birds return' });

/* ---------------------------------------------------------------- foley --- */
const sfx = [];
const add = (o) => sfx.push(o);

// b01 — the bell that never sounded: a dull, dead attempt
add({ t: t('b01', 3.1), kind: 'bell', args: { base: 150, dur: 1.2 }, gain: 0.30, pan: 0.05, room: 0.5, metres: 4, name: 'dead bell attempt (damped)' });
add({ t: t('b01', 0.2), kind: 'whoosh', args: { dur: 0.9, up: false }, gain: 0.40, pan: -0.3, name: 'open on the tower' });

// b02 — founders at work
add({ t: t('b02', 0.15), kind: 'step', args: { surface: 'stone' }, gain: 0.66, pan: -0.35, room: 0.3, name: 'founder enters' });
add({ t: t('b02', 0.62), kind: 'step', args: { surface: 'stone' }, gain: 0.60, pan: -0.22, room: 0.3, name: 'founder step' });
add({ t: t('b02', 1.30), kind: 'chime', args: { base: 1650, dur: 0.5 }, gain: 0.26, pan: 0.3, room: 0.3, name: 'hammer on metal' });

// b03 — pour / tune / hoist (three craft beats)
add({ t: t('b03', 0.30), kind: 'fire', args: { dur: 1.6 }, gain: 0.42, pan: 0.2, room: 0.3, name: 'bronze pour heat' });
add({ t: t('b03', 0.55), kind: 'claySquish', args: { size: 1.3 }, gain: 0.30, pan: 0.15, room: 0.3, name: 'molten pour (viscous)' });
add({ t: t('b03', 1.85), kind: 'chime', args: { base: 720, dur: 1.1 }, gain: 0.30, pan: -0.15, room: 0.35, name: 'tune the crown 1' });
add({ t: t('b03', 2.45), kind: 'chime', args: { base: 905, dur: 1.0 }, gain: 0.27, pan: 0.12, room: 0.35, name: 'tune the crown 2' });
add({ t: t('b03', 3.35), kind: 'doorCreak', args: { dur: 1.1 }, gain: 0.52, pan: 0.05, room: 0.4, name: 'rope hoist creak' });
add({ t: t('b03', 4.30), kind: 'thump', args: { size: 1.1 }, gain: 0.34, pan: 0, room: 0.4, name: 'bell seats higher' });

// b04 — silence is the point: one dead note, then nothing
add({ t: t('b04', 1.10), kind: 'bell', args: { base: 148, dur: 0.9 }, gain: 0.24, pan: 0, room: 0.55, metres: 5, name: 'another dead note' });
add({ t: t('b04', 3.40), kind: 'cloth', args: { dur: 0.4 }, gain: 0.42, pan: -0.3, room: 0.3, name: 'crowd shifts, uneasy' });

// b05 — Nora climbs: varied stone steps (never identical repeats)
for (let k = 0; k < 9; k++) {
  add({ t: t('b05', 0.45 + k * 0.56), kind: 'step', args: { surface: 'stone', force: 0.85 + (k % 3) * 0.12 },
        gain: 0.62 + (k % 2) * 0.09, pan: -0.1 + (k % 4) * 0.07, room: 0.55, seed: 500 + k * 13, name: `stair step ${k + 1}` });
}
add({ t: t('b05', 2.20), kind: 'cloth', args: { dur: 0.35 }, gain: 0.46, pan: 0.1, room: 0.5, name: 'coat rustle' });
add({ t: t('b05', 5.10), kind: 'doorSwing', gain: 0.30, pan: 0.2, room: 0.55, name: 'belfry hatch' });

// b06 — she does NOT touch it: only cloth and air
add({ t: t('b06', 0.70), kind: 'cloth', args: { dur: 0.45 }, gain: 0.48, pan: -0.15, room: 0.55, name: 'she stops, hand lowered' });

// b07 — two taps on stone, then listening
add({ t: t('b07', 1.55), kind: 'step', args: { surface: 'stone', force: 1.3 }, gain: 0.78, pan: 0.22, room: 0.6, name: 'tap the wall — once' });
add({ t: t('b07', 2.95), kind: 'step', args: { surface: 'stone', force: 1.15 }, gain: 0.72, pan: 0.22, room: 0.6, seed: 991, name: 'tap the wall — twice' });
add({ t: t('b07', 4.40), kind: 'chime', args: { base: 2400, dur: 0.7 }, gain: 0.16, pan: 0.3, room: 0.7, name: 'stone answers, faint' });

// b08 — held breath
add({ t: t('b08', 0.90), kind: 'gaspQuiet', gain: 0.24, pan: -0.2, metres: 6, room: 0.4, name: 'town inhales' });

// b09 — the bell itself is fine
add({ t: t('b09', 0.55), kind: 'chime', args: { base: 660, dur: 1.9 }, gain: 0.30, pan: 0.05, room: 0.5, name: 'the bell is sound' });

// b10 — THE TWIST. Quiet before it, then a low stone hit.
add({ t: t('b10', 0.05), kind: 'thump', args: { size: 1.5 }, gain: 0.46, pan: 0, room: 0.6, name: 'the tower — twist hit' });
add({ t: t('b10', 0.02), kind: 'whoosh', args: { dur: 0.5, up: false }, gain: 0.24, pan: 0, name: 'twist anticipation' });

// b11 — stone swallowing notes: chimes that die fast
for (let k = 0; k < 4; k++) {
  add({ t: t('b11', 0.9 + k * 1.15), kind: 'chime', args: { base: 520 + k * 140, dur: 0.45 },
        gain: 0.20 - k * 0.02, pan: -0.25 + k * 0.16, room: 0.75, seed: 700 + k * 29, name: `note swallowed ${k + 1}` });
}
add({ t: t('b11', 0.30), kind: 'riser', args: { dur: 2.2 }, gain: 0.16, pan: 0, room: 0.5, name: 'realisation riser' });

// b12 — moving the bell
add({ t: t('b12', 0.25), kind: 'doorCreak', args: { dur: 0.8 }, gain: 0.50, pan: -0.2, room: 0.5, name: 'rope takes the weight' });
add({ t: t('b12', 1.05), kind: 'cloth', args: { dur: 0.9 }, gain: 0.52, pan: 0.1, room: 0.5, name: 'bell slides on beam' });
add({ t: t('b12', 2.35), kind: 'thump', args: { size: 0.9 }, gain: 0.32, pan: 0.15, room: 0.5, name: 'bell seats, four feet left' });
add({ t: t('b12', 2.90), kind: 'step', args: { surface: 'stone' }, gain: 0.56, pan: -0.1, room: 0.5, name: 'she steps back' });

// b13 — THE RING. The payoff gets the biggest sound in the film.
add({ t: t('b13', 0.35), kind: 'bell', args: { base: 196, dur: 4.2 }, gain: 0.62, pan: 0, room: 0.7, name: 'THE BELL RINGS' });
add({ t: t('b13', 2.55), kind: 'bell', args: { base: 196, dur: 3.6 }, gain: 0.50, pan: 0.04, room: 0.7, seed: 1201, name: 'bell second strike' });
add({ t: t('b13', 0.30), kind: 'whoosh', args: { dur: 1.2, up: true }, gain: 0.24, pan: 0, name: 'sound leaves the tower' });
add({ t: t('b13', 1.90), kind: 'applause', args: { dur: 4.4, size: 1.2 }, gain: 0.36, pan: -0.1, metres: 4, room: 0.4, name: 'valley cheers' });
add({ t: t('b13', 3.30), kind: 'bell', args: { base: 262, dur: 2.6 }, gain: 0.26, pan: -0.55, metres: 14, room: 0.8, name: 'second village hears' });
add({ t: t('b13', 3.85), kind: 'bell', args: { base: 220, dur: 2.6 }, gain: 0.22, pan: 0.58, metres: 18, room: 0.8, name: 'third village hears' });

// b14 — resolve
add({ t: t('b14', 0.40), kind: 'gasp', args: { voices: 6 }, gain: 0.50, pan: 0.1, metres: 5, name: 'wonder in the crowd' });
add({ t: t('b14', 1.60), kind: 'chime', args: { base: 1046, dur: 2.2 }, gain: 0.22, pan: 0.2, room: 0.6, name: 'listened to' });

// transition hits on only ~1 in 3 scene changes (measured reference behaviour)
const transHits = [2, 5, 8, 11];
shots.forEach((s, i) => { if (transHits.includes(i)) add({ t: +s.start.toFixed(3), kind: 'whoosh', args: { dur: 0.55, up: i % 2 === 0 }, gain: 0.20, pan: i % 2 ? 0.3 : -0.3, name: `transition ${s.name}` }); });

sfx.sort((a, b) => a.t - b.t);
fs.writeFileSync(`${FD}/sound-plan.json`, JSON.stringify({ ambience: amb, sfx }, null, 2));
// Re-apply the word-sync anchors: every diegetic hit lands on the word that
// describes it, and the picture reads the same anchors (picture-cues.json).
execFileSync(process.execPath, ['studio/experiments/r13_sync.mjs'], { stdio: 'inherit' });

/* ------------------------------------------------------------- render ----- */
console.log('rendering foley:', sfx.length, 'events;', amb.length, 'ambience beds');
const sfxTrack = F.renderEvents(sfx, TOTAL, SR, { defaultRoom: 0.4 });
const ambTrack = F.renderEvents(amb, TOTAL, SR, { defaultRoom: 0.35 });
console.log('building arc score...');
const score = SA.buildArcScore(beats, TOTAL, { seed: 23 });
console.log('score sections:', score.sections.length, 'stingers:', score.stingers.length, 'bed silent frac:', score.report.bedSilentFrac);

const voice = M.readWavStereo(`${FD}/narration.wav`);
const mixed = M.mix({ voice: { L: voice.L, R: voice.R }, music: { L: score.L, R: score.R }, sfx: sfxTrack, ambience: ambTrack }, TOTAL,
  { musicGainDb: -18, sfxGainDb: -9, ambienceGainDb: -26, duckDepth: 0.45, leadIn: 0, events: sfx });
console.log('\nbus levels:', JSON.stringify(mixed.levels));

M.writeWavStereo(`${FD}/stem-music.wav`, mixed.stems.music.L, mixed.stems.music.R, SR);
M.writeWavStereo(`${FD}/stem-sfx.wav`, mixed.stems.sfx.L, mixed.stems.sfx.R, SR);
M.writeWavStereo(`${FD}/stem-ambience.wav`, mixed.stems.ambience.L, mixed.stems.ambience.R, SR);
M.writeWavStereo(`${FD}/stem-voice.wav`, mixed.stems.voice.L, mixed.stems.voice.R, SR);

const masking = M.maskingReport(sfx, mixed, { log: sfxTrack.log });
const checks = masking.filter((r) => r.check.startsWith('CHECK'));
console.log('\nmasking: ', masking.length, 'events;', checks.length, 'flagged');
checks.slice(0, 12).forEach((c) => console.log('  ', JSON.stringify(c)));

const density = M.densityCheck(sfx, TOTAL);
console.log('\ndensity:', JSON.stringify(density));

const mastered = M.master(mixed, `${FD}/final-audio.wav`, { targetLufs: -14, ceilingDb: -2 });
console.log('\nMASTER:', JSON.stringify(mastered, null, 1));

fs.writeFileSync(`${FD}/mix-report.json`, JSON.stringify({ levels: mixed.levels, masking, density, mastered, scoreReport: score.report, sections: score.sections, stingers: score.stingers, dip: score.dip, shots }, null, 2));

// captions with the lead already baked into narration word times
const words = JSON.parse(fs.readFileSync(`${FD}/narration.words.json`, 'utf8'));
const AP = await import('../src/audiopipe.mjs');
const ass = AP.wordsToASS(words, { playResX: 720, playResY: 1280, font: 'Inter Tight', size: 46, marginV: 400,
  keywords: ['Vellara', 'Nora', 'bell', 'tower', 'sixty', 'bronze', 'silent', 'stone', 'four', 'three', 'rang'] });
fs.writeFileSync(`${FD}/captions.ass`, ass);
console.log('\ncaptions:', words.length, 'words; first @', words[0].t, 'last @', words[words.length - 1].t);
