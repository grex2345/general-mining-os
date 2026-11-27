import { narrationBundle } from '../src/audiopipe.mjs';
import fs from 'node:fs';
const ROOT = '/home/user/general-mining-os';
const script = fs.readFileSync(`${ROOT}/research/artifacts/round11/script.txt`, 'utf8').trim();
const bundle = await narrationBundle(script, `${ROOT}/research/artifacts/round11/narration-raw.mp3`, {
  outAudio: `${ROOT}/research/artifacts/round11/narration.wav`,
  lang: 'en', speed: 0.9, targetLUFS: -14,
  captionOpts: { playResX: 720, playResY: 1280, font: 'Inter Tight', size: 46, marginV: 400,
    keywords: ['Sami', 'clay', 'gold', 'crazy', 'spinning', 'thousand', 'kiln', 'silent', 'pottery', 'remembered'] },
});
fs.writeFileSync(`${ROOT}/research/artifacts/round11/words.json`, JSON.stringify(bundle.words, null, 2));
fs.writeFileSync(`${ROOT}/research/artifacts/round11/captions.ass`, bundle.ass);
console.log('DURATION', bundle.duration.toFixed(3));
console.log('WORDS', bundle.words.length);
console.log(bundle.words.map(w => `${w.word}@${w.t.toFixed(2)}`).join(' '));
