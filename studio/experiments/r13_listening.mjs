// r13_listening.mjs — build the listening handoff files.
// Numbers cannot certify audio quality; these are for a human to actually hear.
import fs from 'node:fs';
import * as M from '../src/mixdesk.mjs';
import * as P from '../src/prosody.mjs';
import { SR } from '../src/sfxkit.mjs';

const R = 'research/artifacts/round13', FD = `${R}/film`;
const gap = (sec) => new Float32Array(Math.round(sec * SR));
const join = (parts) => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const y = new Float32Array(n); let o = 0;
  for (const p of parts) { y.set(p, o); o += p.length; }
  return y;
};
const cut = (x, t0, t1) => x.slice(Math.round(t0 * SR), Math.round(t1 * SR));
const norm = (x, peak = 0.89) => {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  if (pk < 1e-6) return x;
  const g = peak / pk; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
  return y;
};
const stereo = (file, mono) => M.writeWavStereo(file, mono, mono, SR);

/* ---------- 1. EMOTION REEL: one voice, six emotional states ---------- */
const narr = M.readWavStereo(`${FD}/narration.wav`);
const beats = JSON.parse(fs.readFileSync(`${FD}/narration.beats.json`, 'utf8'));
const pick = ['b01', 'b08', 'b10', 'b11', 'b13', 'b14'];
const parts = []; const guide = [];
let cursor = 0;
for (const id of pick) {
  const b = beats.find((x) => x.id === id);
  const seg = norm(cut(narr.L, b.t0, b.t1));
  guide.push({ emotion: b.emotion, beat: id, startsAtSec: +cursor.toFixed(2), endsAtSec: +(cursor + seg.length / SR).toFixed(2), text: b.text });
  parts.push(seg); cursor += seg.length / SR;
  parts.push(gap(1.3)); cursor += 1.3;
}
const reel = join(parts);
stereo(`${R}/emotion-reel.wav`, reel);
fs.writeFileSync(`${R}/emotion-reel-guide.json`, JSON.stringify({
  file: 'emotion-reel.wav', durationSec: +(reel.length / SR).toFixed(2), voice: 'voice-03',
  note: 'All six excerpts are the SAME voice from ONE contextual take of the film script, cut at sentence boundaries and shaped per emotion. 1.3 s of silence separates them. This is real generated audio, not a measurement.',
  segments: guide,
}, null, 2));
console.log('emotion-reel.wav', (reel.length / SR).toFixed(2), 's');
guide.forEach((g) => console.log(`  ${g.startsAtSec}s  ${g.emotion.padEnd(11)} ${g.text}`));

/* ---------- 2. DIRECTION ON/OFF: same words, same voice ---------- */
const rawTake = M.readWavStereo('/tmp/r13film-take.wav');
const raw = norm(rawTake.L);
const directed = norm(narr.L);
const cmp = join([raw, gap(1.8), directed]);
stereo(`${R}/direction-off-on.wav`, cmp);
const rawM = P.analyzeTake(raw, SR, { label: 'take as generated' });
const dirM = P.analyzeTake(directed, SR, { label: 'directed' });
fs.writeFileSync(`${R}/direction-off-on-guide.json`, JSON.stringify({
  file: 'direction-off-on.wav', durationSec: +(cmp.length / SR).toFixed(2),
  A: { label: 'OFF — the contextual take exactly as the TTS produced it (trimmed only)', startsAtSec: 0, endsAtSec: +(raw.length / SR).toFixed(2), durationSec: +(raw.length / SR).toFixed(2) },
  B: { label: 'ON — same take, cut at sentence boundaries, per-emotion shaping, directed pauses and breaths', startsAtSec: +(raw.length / SR + 1.8).toFixed(2), endsAtSec: +(cmp.length / SR).toFixed(2), durationSec: +(directed.length / SR).toFixed(2) },
  note: 'Identical words and identical voice. The ONLY difference is the audio direction. Listen for whether the emotional turns land, and whether the pauses feel intentional rather than dead air.',
  measured: { off: { pitchRangeSt: rawM.pitchRangeSt, dynamicRangeDb: rawM.dynamicRangeDb, pauseMaxSec: rawM.pauseMaxSec, centroidHz: rawM.centroidHz }, on: { pitchRangeSt: dirM.pitchRangeSt, dynamicRangeDb: dirM.dynamicRangeDb, pauseMaxSec: dirM.pauseMaxSec, centroidHz: dirM.centroidHz } },
}, null, 2));
console.log('\ndirection-off-on.wav', (cmp.length / SR).toFixed(2), 's  (OFF', (raw.length / SR).toFixed(2), 's -> ON', (directed.length / SR).toFixed(2), 's)');

/* ---------- 3. SOUND DESIGN ON/OFF: the climax, voice alone vs full mix ---------- */
const full = M.readWavStereo(`${FD}/final-audio.wav`);
const voiceStem = M.readWavStereo(`${FD}/stem-voice.wav`);
const T0 = 55.0, T1 = 66.0;
// match loudness of the two excerpts so the comparison is about content, not level
const vSeg = norm(cut(voiceStem.L, T0, T1), 0.7);
const fSeg = norm(cut(full.L, T0, T1), 0.7);
const vSegR = norm(cut(voiceStem.R, T0, T1), 0.7);
const fSegR = norm(cut(full.R, T0, T1), 0.7);
const sd = { L: join([vSeg, gap(1.8), fSeg]), R: join([vSegR, gap(1.8), fSegR]) };
M.writeWavStereo(`${R}/sound-design-off-on.wav`, sd.L, sd.R, SR);
fs.writeFileSync(`${R}/sound-design-off-on-guide.json`, JSON.stringify({
  file: 'sound-design-off-on.wav', durationSec: +(sd.L.length / SR).toFixed(2),
  excerpt: 'the climax, film time 55.0-66.0 s: the bell is moved, then rings; the valley hears it',
  A: { label: 'OFF — narration alone', startsAtSec: 0, endsAtSec: +(vSeg.length / SR).toFixed(2) },
  B: { label: 'ON — narration + emotional score + foley + ambience, ducked and mastered', startsAtSec: +(vSeg.length / SR + 1.8).toFixed(2), endsAtSec: +(sd.L.length / SR).toFixed(2) },
  note: 'Both halves are peak-matched to 0.7 so you are judging the sound design, not the volume. Listen for: does the bell strike land ON the word "rang"? Do the distant villages read as far away (they are panned wide and distance-filtered)? Does the music stay out of the way of the words?',
  eventsInExcerpt: JSON.parse(fs.readFileSync(`${FD}/sound-plan.json`, 'utf8')).sfx.filter((e) => e.t >= T0 && e.t <= T1).map((e) => ({ t: e.t, name: e.name, pan: e.pan ?? 0, metres: e.metres ?? null })),
}, null, 2));
console.log('sound-design-off-on.wav', (sd.L.length / SR).toFixed(2), 's');

/* ---------- 4. full mix, plain stereo, for reference ---------- */
console.log('\nfinal-audio.wav', (full.L.length / SR).toFixed(2), 's');
console.log('MASTER:', JSON.stringify(M.measureLoudness(`${FD}/final-audio.wav`)));
