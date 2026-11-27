import { synthesizeWorldScore } from '../src/score_world.mjs';
import { buildSfxTrack, mixNarration, writeWav, SR } from '../src/sfxkit.mjs';
import { wordsToASS } from '../src/audiopipe.mjs';
import fs from 'node:fs';
const R = '/home/user/general-mining-os/research/artifacts/round11';
const LEAD = 1.2, TOTAL = 36.0;

// music sections follow the narration beats (global time)
const music = synthesizeWorldScore({ duration: TOTAL, seed: 23, sections: [
  { t0: 0.0, t1: 6.5, mood: 'dawn' },
  { t0: 6.5, t1: 10.1, mood: 'tense' },
  { t0: 10.1, t1: 17.1, mood: 'build' },
  { t0: 17.1, t1: 21.0, mood: 'night' },
  { t0: 21.0, t1: 24.5, mood: 'swell' },
  { t0: 24.5, t1: 29.9, mood: 'wonder' },
  { t0: 29.9, t1: 36.0, mood: 'joy' },
] });

// SFX placed on the action beats
const sfx = buildSfxTrack([
  { t: 0.2, kind: 'birds', dur: 3.4, gain: 0.32 },
  { t: 0.0, kind: 'wind', dur: 6.5, gain: 0.18 },
  { t: 3.7, kind: 'whoosh', gain: 0.28 },
  { t: 10.1, kind: 'wheelHum', dur: 7.0, gain: 0.22 },
  { t: 10.7, kind: 'claySquish', gain: 0.3 }, { t: 11.6, kind: 'claySquish', gain: 0.28 }, { t: 12.5, kind: 'claySquish', gain: 0.26 },
  { t: 15.3, kind: 'shatter', gain: 0.5 },
  { t: 17.1, kind: 'whoosh', gain: 0.26 },
  { t: 17.1, kind: 'fireCrackle', dur: 7.4, gain: 0.28 },
  { t: 17.1, kind: 'crickets', dur: 7.4, gain: 0.12 },
  { t: 21.5, kind: 'doorCreak', gain: 0.4 },
  { t: 22.6, kind: 'gasp', gain: 0.38 },
  { t: 24.8, kind: 'chime', gain: 0.4 }, { t: 26.6, kind: 'chime', gain: 0.3 },
  { t: 25.2, kind: 'gasp', gain: 0.28 },
  { t: 29.9, kind: 'whoosh', gain: 0.22 },
  { t: 30.3, kind: 'applause', dur: 5.4, gain: 0.4 },
], TOTAL);

const mixed = mixNarration({ voiceFile: `${R}/narration.wav`, music, sfx, duration: TOTAL, musicGain: 0.32, sfxGain: 0.55, leadIn: LEAD });
writeWav(`${R}/mixed-raw.wav`, mixed, SR);
writeWav(`${R}/music.wav`, music, SR);
writeWav(`${R}/sfx.wav`, sfx, SR);

// captions shifted by the cold-open lead-in
const words = JSON.parse(fs.readFileSync(`${R}/words.json`, 'utf8')).map(w => ({ ...w, t: +(w.t + LEAD).toFixed(3) }));
const ass = wordsToASS(words, { playResX: 720, playResY: 1280, font: 'Inter Tight', size: 46, marginV: 400,
  keywords: ['Sami', 'clay', 'gold', 'crazy', 'spinning', 'thousand', 'kiln', 'silent', 'pottery', 'remembered'] });
fs.writeFileSync(`${R}/captions-final.ass`, ass);
console.log('AUDIO mixed:', (mixed.length / SR).toFixed(2), 's; captions:', words.length, 'words; first word @', words[0].t, 'last @', words[words.length - 1].t);
