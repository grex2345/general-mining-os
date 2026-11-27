// r13_sync.mjs — the audio director's last pass: anchor every diegetic hit to the
// WORD that describes it, and emit the picture cue times from the same anchors so
// sound and image cannot drift apart.
//
// Found by measurement, not by ear: the two wall taps were 1180 ms and 1000 ms
// BEFORE the words "once" and "twice", and the bell struck 320 ms before "rang".
import fs from 'node:fs';
const FD = 'research/artifacts/round13/film';
const words = JSON.parse(fs.readFileSync(`${FD}/narration.words.json`, 'utf8'));
const plan = JSON.parse(fs.readFileSync(`${FD}/sound-plan.json`, 'utf8'));
const shots = JSON.parse(fs.readFileSync(`${FD}/shots.json`, 'utf8'));

const clean = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
/** nth occurrence of a word (0-based), searched from a time floor. */
function wordTime(w, from = 0, nth = 0) {
  const hits = words.filter((x) => clean(x.word) === w && x.t >= from);
  if (!hits.length) throw new Error(`word not found: ${w} from ${from}`);
  return hits[Math.min(nth, hits.length - 1)].t;
}
const setEv = (name, t, why) => {
  const e = plan.sfx.find((x) => x.name === name);
  if (!e) throw new Error('event not found: ' + name);
  const was = e.t;
  e.t = +t.toFixed(3);
  e.syncedTo = why;
  return { name, wasSec: was, nowSec: e.t, shiftMs: Math.round((e.t - was) * 1000), why };
};

const anchors = {};
const changes = [];

// --- the two taps: land ON "once" and "twice" (+40 ms so the ear hears the word first)
anchors.tap1 = +(wordTime('once', 30) + 0.04).toFixed(3);
anchors.tap2 = +(wordTime('twice', 32) + 0.04).toFixed(3);
changes.push(setEv('tap the wall — once', anchors.tap1, 'word "once"'));
changes.push(setEv('tap the wall — twice', anchors.tap2, 'word "twice"'));
// the faint answer comes after she stops to listen
anchors.stoneAnswer = +(wordTime('listening', 33) + 0.30).toFixed(3);
changes.push(setEv('stone answers, faint', anchors.stoneAnswer, 'after word "listening"'));

// --- the twist: hit on "tower" in "The tower was."
anchors.twist = +(wordTime('tower', 43) + 0.02).toFixed(3);
changes.push(setEv('the tower — twist hit', anchors.twist, 'word "tower" (the twist)'));
changes.push(setEv('twist anticipation', anchors.twist - 0.22, '220 ms before the twist'));

// --- the bell seats on "left"
anchors.seats = +(wordTime('left', 54) + 0.06).toFixed(3);
changes.push(setEv('bell seats, four feet left', anchors.seats, 'word "left"'));

// --- THE payoff: strike on "rang"
anchors.ring1 = +(wordTime('rang', 57) + 0.05).toFixed(3);
anchors.ring2 = +(anchors.ring1 + 2.20).toFixed(3);
changes.push(setEv('THE BELL RINGS', anchors.ring1, 'word "rang"'));
changes.push(setEv('bell second strike', anchors.ring2, 'second strike, 2.2 s later'));
changes.push(setEv('sound leaves the tower', anchors.ring1 - 0.05, 'with the first strike'));

plan.sfx.sort((a, b) => a.t - b.t);
fs.writeFileSync(`${FD}/sound-plan.json`, JSON.stringify(plan, null, 2));

// --- picture cues derived from the SAME anchors
const shotOf = (name) => shots.shots.find((s) => s.name === name);
const cues = {
  tapping: { tap1Local: +(anchors.tap1 - shotOf('tapping').start).toFixed(3), tap2Local: +(anchors.tap2 - shotOf('tapping').start).toFixed(3) },
  stoneTruth: { twistLocal: +(anchors.twist - shotOf('stoneTruth').start).toFixed(3) },
  movingBell: { seatsLocal: +(anchors.seats - shotOf('movingBell').start).toFixed(3) },
  theRing: { ring1Local: +(anchors.ring1 - shotOf('theRing').start).toFixed(3), ring2Local: +(anchors.ring2 - shotOf('theRing').start).toFixed(3) },
};
fs.writeFileSync(`${FD}/picture-cues.json`, JSON.stringify({ anchors, cues }, null, 2));
fs.writeFileSync(`${FD}/sync-report.json`, JSON.stringify({ changes, anchors, cues }, null, 2));

console.log('SYNC CORRECTIONS');
changes.forEach((c) => console.log(`  ${c.name.padEnd(28)} ${String(c.wasSec).padStart(7)} -> ${String(c.nowSec).padStart(7)}  (${c.shiftMs > 0 ? '+' : ''}${c.shiftMs} ms)  <- ${c.why}`));
console.log('\nPICTURE CUES (local seconds)');
console.log(JSON.stringify(cues, null, 1));
