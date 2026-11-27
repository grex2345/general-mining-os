// r16_film_mix.mjs — Round 16 "Infinity Is A Coffin" sound design + mix.
//
// Rules carried over from the R16 audio forensics:
//   * the voice is ONE continuous take. No re-splicing, no per-beat gain shaping.
//     (voicekit.restructureTake and prosody.shapeBeat are deliberately NOT imported.)
//   * every foley hit is anchored to the word that describes it, from the read-only
//     whisper alignment, so sound and picture land on the same syllable.
//   * music and SFX sit far under the voice and are ducked by the voice envelope.
//
// Run: node studio/experiments/r16_film_mix.mjs
import fs from 'node:fs';
import * as F from '../src/foley.mjs';
import * as SA from '../src/score_arc.mjs';
import * as M from '../src/mixdesk.mjs';
import { SR } from '../src/sfxkit.mjs';

const R = 'research/artifacts/round16';
const TOTAL = 83.20;                       // matches GojoFilm.TOTAL exactly
const words = JSON.parse(fs.readFileSync(`${R}/narration.words.json`, 'utf8'));
const cues = JSON.parse(fs.readFileSync(`${R}/scene-cues.json`, 'utf8')).cues;

// word-anchored time: w(index) is the onset of that exact script word
const w = (i, off = 0) => +(words[i].t + off).toFixed(3);
const cue = cues;   // { id: { wordIndex, t } }

/* ------------------------------------------------------------ score arc --- */
// Emotion/intensity per scene drives mood, intensity envelope, stingers and the
// pre-reveal dip. The danger act climbs; the Six Eyes reveal is the summit; the
// ending falls away to something quiet and personal.
const ARC = [
  ['hook', 'mystery', 0.55], ['twoway', 'tension', 0.50], ['thermos', 'mystery', 0.45],
  ['nasa', 'neutral', 0.50], ['suit', 'mystery', 0.50], ['watts100', 'neutral', 0.45],
  ['watts1000', 'excitement', 0.85], ['sweat', 'tension', 0.70], ['evaporate', 'tension', 0.75],
  ['cook', 'tension', 0.95], ['bakes', 'tension', 0.90], ['sixeyes', 'reveal', 0.95],
  ['filter', 'reveal', 0.80], ['focus', 'tension', 0.90], ['rct', 'reveal', 0.75],
  ['compare', 'neutral', 0.60], ['difference', 'neutral', 0.50], ['switch', 'neutral', 0.45],
  ['yourinfinity', 'sadness', 0.50], ['call', 'sadness', 0.45], ['nothing', 'sadness', 0.40],
  ['question', 'sadness', 0.42],
];
const beats = ARC.map(([id, emotion, intensity], i) => {
  const t0 = cue[id].t;
  const t1 = i < ARC.length - 1 ? cue[ARC[i + 1][0]].t : TOTAL;
  return { id, t0, t1, emotion, intensity };
});
fs.writeFileSync(`${R}/score-beats.json`, JSON.stringify(beats, null, 2));

/* ------------------------------------------------------------- ambience --- */
// Each world has its own air. Nothing loops identically across scenes.
const amb = [];
const A = (t, kind, args, gain, pan, room, name) => amb.push({ t, kind, args, gain, pan, room, name });
A(0.20, 'wind', { dur: 7.3, strength: 0.22 }, 0.34, -0.15, 0.55, 'void air (coffin)');
A(7.70, 'wheelHum', { dur: 5.4 }, 0.30, 0.10, 0.45, 'infinity field hum');
A(13.30, 'wheelHum', { dur: 2.7 }, 0.24, 0.00, 0.35, 'vacuum flask resonance');
A(16.10, 'wheelHum', { dur: 2.7 }, 0.30, 0.05, 0.30, 'mission control room tone');
A(18.95, 'wind', { dur: 4.4, strength: 0.26 }, 0.30, 0.20, 0.20, 'suit air / space hiss');
A(23.45, 'wheelHum', { dur: 3.4 }, 0.24, -0.10, 0.40, 'resting body hum');
A(26.95, 'fire', { dur: 3.0 }, 0.30, 0.12, 0.35, 'fight heat roar');
A(30.05, 'wind', { dur: 1.8, strength: 0.18 }, 0.22, 0.00, 0.50, 'still air, no evaporation');
A(31.90, 'wind', { dur: 1.6, strength: 0.16 }, 0.20, 0.00, 0.55, 'trapped vapour');
A(33.65, 'fire', { dur: 5.1 }, 0.30, 0.08, 0.45, 'core temperature rising');
A(38.80, 'fire', { dur: 2.1 }, 0.34, 0.00, 0.60, 'oven interior');
A(41.00, 'wheelHum', { dur: 2.5 }, 0.22, 0.00, 0.35, 'six eyes online');
A(43.60, 'wheelHum', { dur: 7.3 }, 0.24, 0.06, 0.40, 'atom filter lattice');
A(50.95, 'fire', { dur: 3.4 }, 0.30, -0.06, 0.45, 'focus lapse heat flood');
A(54.45, 'wheelHum', { dur: 6.8 }, 0.22, 0.04, 0.40, 'reverse cursed technique loop');
A(61.30, 'wheelHum', { dur: 4.2 }, 0.24, 0.00, 0.35, 'comparison lab');
A(66.85, 'wheelHum', { dur: 2.9 }, 0.24, -0.08, 0.35, 'radiator fan');
A(69.85, 'walla', { dur: 4.6, voices: 6 }, 0.22, -0.25, 0.30, 'distant city voices');
A(69.90, 'wind', { dur: 7.9, strength: 0.30 }, 0.28, 0.18, 0.25, 'night street air');
A(70.10, 'crickets', { dur: 4.4 }, 0.16, 0.30, 0.20, 'night insects');
A(77.90, 'wheelHum', { dur: 2.5 }, 0.22, 0.00, 0.50, 'shell closing again');
A(80.50, 'wind', { dur: 2.7, strength: 0.20 }, 0.20, 0.00, 0.55, 'quiet after the question');

/* ---------------------------------------------------------------- foley --- */
const sfx = [];
const S = (t, kind, args, gain, pan, room, name, extra = {}) =>
  sfx.push({ t, kind, args, gain, pan, room, name, ...extra });

/* 0 — hook: the shield is named, then the coffin closes */
S(0.10, 'whoosh', { dur: 1.0, up: false }, 0.34, -0.25, 0.4, 'open on the sealed man');
S(w(4), 'chime', { base: 1180, dur: 1.2 }, 0.22, 0.12, 0.5, '"infinity" — field rings');
S(w(10), 'thump', { size: 1.4 }, 0.46, 0.00, 0.6, '"coffin" — lid weight', { metres: 3 });
S(w(10, 0.18), 'doorSwing', { dur: 1.2 }, 0.28, -0.10, 0.6, 'coffin seals');
S(w(13), 'thump', { size: 1.1 }, 0.38, 0.05, 0.65, '"sealed" — lock');

/* 1 — two-way: knives stop, heat cannot leave */
S(w(17), 'shatter', { size: 0.9 }, 0.30, -0.30, 0.35, '"stops" — blade hits the boundary');
S(w(20), 'chime', { base: 2400, dur: 0.35 }, 0.24, 0.28, 0.3, '"touching" — deflection');
S(w(25), 'whoosh', { dur: 0.5, up: true }, 0.22, -0.20, 0.4, '"gets in" — nothing enters');
S(w(28), 'whoosh', { dur: 0.55, up: false }, 0.22, 0.20, 0.4, '"gets out" — nothing leaves');
S(w(29, 0.1), 'thump', { size: 0.9 }, 0.28, 0.00, 0.55, 'heat bounces back');

/* 2 — thermos */
S(w(33), 'thump', { size: 0.8 }, 0.24, -0.12, 0.4, '"wall" — the wrong model');
S(w(36), 'claySlap', { size: 1.1 }, 0.28, 0.06, 0.3, '"thermos" — flask set down');

/* 3 — NASA */
S(w(37), 'chime', { base: 1400, dur: 0.5 }, 0.24, 0.16, 0.25, '"NASA" — console ack');
S(w(42), 'chime', { base: 1600, dur: 0.4 }, 0.20, 0.10, 0.25, '"exact" — match found');

/* 4 — the suit still needs a radiator */
S(w(44), 'whoosh', { dur: 0.8, up: true }, 0.24, 0.18, 0.2, 'cut to orbit');
S(w(46), 'cloth', { dur: 0.5 }, 0.28, -0.16, 0.2, '"suit" — fabric shift');
S(w(50), 'chime', { base: 2000, dur: 0.6 }, 0.20, 0.20, 0.25, '"shield" — micrometeoroid tick');
S(w(56), 'wind', { dur: 1.6, strength: 0.5 }, 0.30, 0.00, 0.25, '"radiator" — heat rejected');

/* 5 — 100 watts doing nothing */
S(w(60), 'chime', { base: 880, dur: 0.8 }, 0.62, 0.10, 0.35, '"100" — gauge reads');

/* 6 — a thousand in a fight */
S(w(66), 'riser', { dur: 1.0 }, 0.32, 0.00, 0.3, 'fight builds');
S(w(67), 'whoosh', { dur: 0.45, up: true }, 0.32, -0.30, 0.25, '"high-speed"');
S(w(68), 'shatter', { size: 1.1 }, 0.36, 0.26, 0.3, '"fight" — impact');
S(w(71), 'thump', { size: 1.5 }, 0.46, 0.00, 0.4, '"thousand" — the number lands');
S(w(71, 0.12), 'chime', { base: 500, dur: 1.2 }, 0.22, 0.14, 0.4, 'gauge spikes');

/* 7 — sweating cannot save him */
S(w(72), 'waterDrip', {}, 0.32, -0.14, 0.45, '"Sweating" — first drop');
S(w(74), 'waterDrip', {}, 0.28, 0.16, 0.45, 'second drop');

/* 8 — the sweat cannot evaporate */
S(w(77), 'waterDrip', {}, 0.30, -0.10, 0.5, '"sweat" — still liquid');
S(w(79), 'whoosh', { dur: 0.5, up: false }, 0.26, 0.12, 0.5, '"evaporate" — vapour turns back');
S(w(79, 0.2), 'thump', { size: 0.7 }, 0.24, 0.00, 0.55, 'droplet re-forms on the shell');

/* 9 — four minutes per degree */
S(w(81), 'chime', { base: 1200, dur: 0.3 }, 0.22, 0.14, 0.35, '"four" — countdown tick');
S(w(85), 'chime', { base: 1000, dur: 0.3 }, 0.22, -0.14, 0.35, '"twenty" — countdown tick');
S(w(89), 'thump', { size: 1.0 }, 0.32, 0.00, 0.5, '"brain" — pulse');
S(w(91), 'fire', { dur: 1.6 }, 0.34, 0.00, 0.5, '"cooking" — heat blooms');

/* 10 — he bakes inside his own defence */
S(w(93), 'fire', { dur: 2.0 }, 0.36, 0.00, 0.6, '"bakes" — oven roar');
S(w(97), 'thump', { size: 1.3 }, 0.42, 0.00, 0.65, '"defense" — the door is the wall');

/* 11 — the Six Eyes are mandatory */
S(w(98), 'riser', { dur: 1.3 }, 0.36, 0.00, 0.3, 'the turn');
S(w(101), 'chime', { base: 1760, dur: 1.8 }, 0.28, -0.18, 0.4, '"six"');
S(w(102), 'chime', { base: 2637, dur: 2.0 }, 0.26, 0.18, 0.4, '"eyes" — the reveal');
S(w(102, 0.08), 'bell', { base: 523, dur: 2.4 }, 0.18, 0.00, 0.5, 'reveal bloom');

/* 12 — filtering every atom */
S(w(112), 'chime', { base: 1500, dur: 0.4 }, 0.20, 0.12, 0.35, '"filters"');
S(w(115), 'chime', { base: 2200, dur: 0.35 }, 0.20, -0.12, 0.35, '"atom"');
S(w(116), 'chime', { base: 1046, dur: 0.5 }, 0.24, -0.24, 0.35, '"oxygen" — in');
S(w(118), 'whoosh', { dur: 0.5, up: false }, 0.26, 0.00, 0.35, '"heat" — out');
S(w(120), 'shatter', { size: 1.0 }, 0.32, 0.26, 0.35, '"knives" — out');

/* 13 — one second of focus lost */
S(w(125), 'chime', { base: 1800, dur: 0.3 }, 0.20, 0.10, 0.35, '"focus"');
S(w(128), 'chime', { base: 600, dur: 0.5 }, 0.28, 0.00, 0.4, '"second" — alarm');
S(w(130), 'fire', { dur: 1.4 }, 0.36, 0.00, 0.5, '"cooks"');

/* 14 — reverse cursed technique, 24/7 */
S(w(133), 'riser', { dur: 1.2 }, 0.28, 0.00, 0.35, '"reverse"');
S(w(136), 'chime', { base: 1046, dur: 1.6 }, 0.24, 0.14, 0.4, '"24/7"');
S(w(139), 'chime', { base: 1568, dur: 1.2 }, 0.22, -0.14, 0.4, '"heal"');
S(w(141), 'thump', { size: 0.9 }, 0.28, 0.00, 0.45, '"brain" — repaired pulse');

/* 15 — radiator vs brain */
S(w(147), 'chime', { base: 1400, dur: 0.5 }, 0.22, -0.22, 0.3, '"NASA"');
S(w(150), 'wind', { dur: 1.4, strength: 0.5 }, 0.26, -0.22, 0.3, '"radiator" — fan');
S(w(151), 'chime', { base: 900, dur: 0.6 }, 0.22, 0.22, 0.3, '"Gojo"');
S(w(154), 'thump', { size: 1.0 }, 0.30, 0.22, 0.4, '"brain"');

/* 16 — that's the difference */
S(w(161), 'bell', { base: 392, dur: 1.8 }, 0.20, 0.00, 0.5, '"difference"');

/* 17 — one can be switched off */
S(w(165), 'doorCreak', { dur: 0.5 }, 0.32, -0.20, 0.3, '"switched" — lever travels');
S(w(166), 'thump', { size: 1.1 }, 0.42, -0.20, 0.35, '"off" — clunk');
S(w(168), 'wind', { dur: 1.2, strength: 0.3 }, 0.20, -0.18, 0.3, '"maintenance" — fan spins down');
S(w(171), 'chime', { base: 500, dur: 1.0 }, 0.20, 0.20, 0.4, '"can\'t"');

/* 18 — your own infinity */
S(w(172), 'whoosh', { dur: 0.7, up: true }, 0.58, 0.16, 0.25, 'cut to the street');
S(w(176), 'chime', { base: 800, dur: 1.2 }, 0.18, 0.00, 0.45, '"infinity" — yours');
S(w(181), 'thump', { size: 0.8 }, 0.22, -0.10, 0.4, '"break" — the rule holds');

/* 19 — the call you don't make */
S(w(187), 'chime', { base: 1046, dur: 0.35 }, 0.26, 0.14, 0.25, '"call" — ring 1');
S(w(189), 'chime', { base: 1046, dur: 0.35 }, 0.24, 0.14, 0.25, 'ring 2');
S(w(192), 'chime', { base: 880, dur: 0.4 }, 0.52, -0.12, 0.3, '"thing"');

/* 20 — nothing gets in, nothing gets out */
S(w(198), 'whoosh', { dur: 0.5, up: true }, 0.20, -0.16, 0.45, '"in"');
S(w(201), 'whoosh', { dur: 0.55, up: false }, 0.20, 0.16, 0.45, '"out"');
S(w(201, 0.14), 'thump', { size: 1.0 }, 0.28, 0.00, 0.6, 'the shell closes again');

/* 21 — so what's yours? */
S(w(202), 'chime', { base: 523, dur: 2.2 }, 0.54, 0.00, 0.6, '"So" — the question opens');
S(w(204), 'bell', { base: 262, dur: 2.6 }, 0.20, 0.00, 0.65, '"yours?" — let it ring out');

// transition hits on roughly one in three scene changes
const ORDER = ARC.map((a) => a[0]);
[2, 5, 8, 11, 14, 17, 20].forEach((i) => {
  const id = ORDER[i];
  S(+(cue[id].t - 0.25).toFixed(3), 'whoosh', { dur: 0.55, up: i % 2 === 0 }, 0.18, i % 2 ? 0.28 : -0.28, 0.3, `transition into ${id}`);
});

sfx.sort((a, b) => a.t - b.t);
amb.sort((a, b) => a.t - b.t);
fs.writeFileSync(`${R}/sound-plan.json`, JSON.stringify({ TOTAL, ambience: amb, sfx }, null, 2));

/* ------------------------------------------------------------- render ----- */
console.log('foley:', sfx.length, 'events;', amb.length, 'ambience beds');
const sfxTrack = F.renderEvents(sfx, TOTAL, SR, { defaultRoom: 0.38 });
const ambTrack = F.renderEvents(amb, TOTAL, SR, { defaultRoom: 0.35 });
console.log('building arc score...');
const score = SA.buildArcScore(beats, TOTAL, { seed: 41, silenceBeforeReveal: 0.4, revealDipDb: -10 });
console.log('score sections:', score.sections.length, 'stingers:', score.stingers.length,
  'bed silent frac:', score.report.bedSilentFrac, 'dip:', JSON.stringify(score.dip));

const voice = M.readWavStereo(`${R}/narration.wav`);
console.log('voice samples:', voice.L.length, '=', (voice.L.length / SR).toFixed(3), 's');
const mixed = M.mix(
  { voice: { L: voice.L, R: voice.R }, music: { L: score.L, R: score.R }, sfx: sfxTrack, ambience: ambTrack },
  TOTAL,
  { musicGainDb: -20, sfxGainDb: -11, ambienceGainDb: -27, duckDepth: 0.5, leadIn: 0, events: sfx, voiceLimitDb: -6 },
);
console.log('\nbus levels:', JSON.stringify(mixed.levels));

M.writeWavStereo(`${R}/stem-music.wav`, mixed.stems.music.L, mixed.stems.music.R, SR);
M.writeWavStereo(`${R}/stem-sfx.wav`, mixed.stems.sfx.L, mixed.stems.sfx.R, SR);
M.writeWavStereo(`${R}/stem-ambience.wav`, mixed.stems.ambience.L, mixed.stems.ambience.R, SR);
M.writeWavStereo(`${R}/stem-voice.wav`, mixed.stems.voice.L, mixed.stems.voice.R, SR);

const masking = M.maskingReport(sfx, mixed, { log: sfxTrack.log });
const checks = masking.filter((r) => r.check.startsWith('CHECK'));
console.log('\nmasking:', masking.length, 'events;', checks.length, 'flagged');
checks.slice(0, 15).forEach((c) => console.log('  ', JSON.stringify(c)));

const density = M.densityCheck(sfx, TOTAL);
console.log('\ndensity:', JSON.stringify(density));

const mastered = M.master(mixed, `${R}/final-audio.wav`, { targetLufs: -14, ceilingDb: -2 });
console.log('\nMASTER:', JSON.stringify(mastered, null, 1));

/* --------------------------------------------- voice-integrity assertion -- */
// The voice must survive the mix as the SAME continuous performance. Compare the
// exported voice stem against the source take sample-for-sample (modulo the bus
// limiter) and re-measure sentence-boundary loudness stepping on the FINAL mix.
function rmsDb(x) {
  let s = 0, n = 0;
  for (const v of x) { if (Math.abs(v) > 1e-5) { s += v * v; n++; } }
  return n ? 10 * Math.log10(s / n) : -120;
}
const src = M.readWavStereo(`${R}/narration.wav`);
const stem = M.readWavStereo(`${R}/stem-voice.wav`);
const nCmp = Math.min(src.L.length, stem.L.length);
// the peak limiter's 5 ms lookahead delays the stem; find the real lag first
const corrAt = (lag) => {
  let s = 0, sa = 0, sb = 0;
  for (let i = 48000; i < nCmp - 4800; i += 5) {
    const j = i + lag; if (j < 0 || j >= nCmp) continue;
    s += src.L[i] * stem.L[j]; sa += src.L[i] * src.L[i]; sb += stem.L[j] * stem.L[j];
  }
  return s / Math.sqrt(Math.max(1e-12, sa * sb));
};
let bestLag = 0, bestCorr = -1;
for (let lag = -600; lag <= 600; lag += 20) { const c = corrAt(lag); if (c > bestCorr) { bestCorr = c; bestLag = lag; } }
for (let lag = bestLag - 20; lag <= bestLag + 20; lag++) { const c = corrAt(lag); if (c > bestCorr) { bestCorr = c; bestLag = lag; } }
let num = 0, den = 0;
for (let i = 0; i < nCmp; i++) { const j = i + bestLag; if (j < 0 || j >= nCmp) continue; num += src.L[i] * stem.L[j]; den += src.L[i] * src.L[i]; }
const scale = den > 0 ? num / den : 0;
let maxDev = 0;
for (let i = 0; i < nCmp; i++) { const j = i + bestLag; if (j < 0 || j >= nCmp) continue; maxDev = Math.max(maxDev, Math.abs(stem.L[j] - src.L[i] * scale)); }

// Sentence-to-sentence continuity of the VOICE as it survives the mix.
const phrases = JSON.parse(fs.readFileSync(`${R}/captions.phrases.json`, 'utf8'));
const win = (bus, t0, t1) => bus.slice(Math.max(0, Math.round(t0 * SR)), Math.min(bus.length, Math.round(t1 * SR)));
// Measure at SENTENCE boundaries (the 22 script cues), and never let the trailing
// silence after the last word drag a window down -- that reads as a fake level drop.
const VOICE_END = 81.653;
const sentDb = [];
for (let i = 0; i < ORDER.length; i++) {
  const t0 = cue[ORDER[i]].t;
  const t1 = Math.min(i < ORDER.length - 1 ? cue[ORDER[i + 1]].t : VOICE_END, VOICE_END);
  const seg = win(stem.L, t0 + bestLag / SR, t1 + bestLag / SR);
  if (seg.length < SR * 0.02) continue;
  const nf = Math.floor(seg.length / (SR * 0.02));
  const e = [];
  for (let k = 0; k < nf; k++) {
    let s = 0; const a0 = k * Math.round(SR * 0.02);
    for (let j = 0; j < Math.round(SR * 0.02); j++) s += seg[a0 + j] * seg[a0 + j];
    e.push(Math.sqrt(s / Math.round(SR * 0.02)));
  }
  e.sort((x, y) => x - y);
  const top = e.slice(Math.floor(e.length * 0.6));
  sentDb.push(10 * Math.log10(top.reduce((s, v) => s + v, 0) / Math.max(1, top.length) + 1e-9));
}
const steps = [];
for (let i = 1; i < sentDb.length; i++) steps.push(Math.abs(sentDb[i] - sentDb[i - 1]));
const meanStep = steps.length ? steps.reduce((s, v) => s + v, 0) / steps.length : 0;
const maxStep = steps.length ? Math.max(...steps) : 0;

// Does the bed ever get loud enough to bury a phrase? Compare voice RMS against
// the summed music+sfx+ambience RMS over every caption phrase.
const mus = M.readWavStereo(`${R}/stem-music.wav`), sx = M.readWavStereo(`${R}/stem-sfx.wav`), am = M.readWavStereo(`${R}/stem-ambience.wav`);
const margins = [];
for (const p of phrases) {
  const v = rmsDb(win(stem.L, p.t0, p.t1));
  const bed = new Float32Array(Math.max(1, Math.round((p.t1 - p.t0) * SR)));
  const a0 = Math.round(p.t0 * SR);
  for (let i = 0; i < bed.length; i++) { const j = a0 + i; bed[i] = (mus.L[j] || 0) + (sx.L[j] || 0) + (am.L[j] || 0); }
  margins.push({ text: p.text, marginDb: +(v - rmsDb(bed)).toFixed(1) });
}
const worst = margins.slice().sort((a, b) => a.marginDb - b.marginDb)[0];
const integrity = {
  limiterDelaySamples: bestLag, limiterDelayMs: +(bestLag / SR * 1000).toFixed(2),
  voiceStemCorrelation: +bestCorr.toFixed(5),
  voiceStemScale: +scale.toFixed(4),
  voiceStemMaxDeviation: +maxDev.toFixed(5),
  voiceSentenceSteps: { count: steps.length, meanDb: +meanStep.toFixed(2), maxDb: +maxStep.toFixed(2), over3dB: steps.filter((s) => s > 3).length },
  voiceOverBed: { minMarginDb: worst.marginDb, worstPhrase: worst.text, phrasesUnder6dB: margins.filter((m) => m.marginDb < 6).length },
};
console.log('\nVOICE INTEGRITY:', JSON.stringify(integrity, null, 1));

fs.writeFileSync(`${R}/mix-report.json`, JSON.stringify({
  TOTAL, levels: mixed.levels, masking, density, mastered, integrity,
  scoreReport: score.report, sections: score.sections, stingers: score.stingers, dip: score.dip, beats,
}, null, 2));
console.log('\nwrote', `${R}/final-audio.wav`);
