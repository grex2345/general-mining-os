/**
 * plan7.mjs — build the frame-accurate shot list from MEASURED voice timing.
 * MASTER PROMPT Step 7 (timing) before Step 8 (shot plan). No wps guesses.
 * Each shot references a line + word span; frames come from align.json onsets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIPT, qaShotPlan } from './tanjiro.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

/** word offset of each line within the full word array */
function lineOffsets() {
  let off = 0;
  return SCRIPT.map((s) => { const n = s.split(/\s+/).length; const o = off; off += n; return { off: o, n }; });
}

/**
 * Shot rows: line index, word span [a,b) within the line, angle, move, env, light,
 * chars, fx, sfx, twist. Spans split long lines so no shot exceeds 90 frames.
 */
const ROWS = [
  { id: 'hook',     line: 0,  w: [0, 10], angle: 'mcu',     move: 'push',     env: 'village',  light: 'dawn',    chars: ['tanjiro'],           fx: ['rays'],            sfx: ['wind'] },
  { id: 'climb',    line: 1,  w: [0, 3],  angle: 'wide',    move: 'track',    env: 'mountain', light: 'day',     chars: ['tanjiro'],           fx: ['clouds'],          sfx: ['whoosh', 'steps'] },
  { id: 'climb2',   line: 1,  w: [3, 6],  angle: 'low',     move: 'follow',   env: 'mountain', light: 'day',     chars: ['tanjiro'],           fx: [],                  sfx: ['steps'] },
  { id: 'swing',    line: 2,  w: [0, 8],  angle: 'medium',  move: 'arc',      env: 'yard',     light: 'predawn', chars: ['tanjiro'],           fx: ['sweat'],           sfx: ['swing', 'whoosh'] },
  { id: 'count',    line: 3,  w: [0, 7],  angle: 'insert',  move: 'push',     env: 'yard',     light: 'predawn', chars: ['tanjiro'],           fx: ['tally', 'speed'],  sfx: ['tick', 'swing'] },
  { id: 'master',   line: 4,  w: [0, 6],  angle: 'two',     move: 'pan',      env: 'falls',    light: 'day',     chars: ['tanjiro', 'master'], fx: ['mist'],            sfx: ['water'] },
  { id: 'falls',    line: 4,  w: [6, 12], angle: 'insert',  move: 'crane',    env: 'falls',    light: 'day',     chars: [],                    fx: ['mist'],            sfx: ['water'] },
  { id: 'breathe',  line: 5,  w: [0, 5],  angle: 'ecu',     move: 'pushroll', env: 'falls',    light: 'day',     chars: ['tanjiro'],           fx: ['breath', 'aura'],  sfx: ['inhale'] },
  { id: 'river',    line: 6,  w: [0, 4],  angle: 'wide',    move: 'crane',    env: 'river',    light: 'day',     chars: ['tanjiro'],           fx: ['ribbon'],          sfx: ['water', 'riser'] },
  { id: 'ribbon',   line: 6,  w: [4, 11], angle: 'insert',  move: 'push',     env: 'river',    light: 'day',     chars: ['tanjiro'],           fx: ['ribbon'],          sfx: ['water'] },
  { id: 'slash',    line: 7,  w: [0, 5],  angle: 'low',     move: 'dash',     env: 'river',    light: 'day',     chars: ['tanjiro'],           fx: ['arc', 'speed'],    sfx: ['slash', 'impact'] },
  { id: 'boulder',  line: 8,  w: [0, 3],  angle: 'insert',  move: 'shake',    env: 'river',    light: 'day',     chars: [],                    fx: ['debris', 'dust'],  sfx: ['crack', 'impact'] },
  { id: 'debris',   line: 8,  w: [3, 7],  angle: 'high',    move: 'pull',     env: 'river',    light: 'day',     chars: [],                    fx: ['dust'],            sfx: ['rumble'] },
  { id: 'night',    line: 9,  w: [0, 10], angle: 'wide',    move: 'pull',     env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['snow'],            sfx: ['wind'] },
  { id: 'demon',    line: 10, w: [0, 4],  angle: 'low',     move: 'push',     env: 'snow',     light: 'night',   chars: ['demon'],             fx: ['snow', 'eyes'],    sfx: ['growl'] },
  { id: 'demonface',line: 10, w: [4, 8],  angle: 'close',   move: 'push',     env: 'snow',     light: 'night',   chars: ['demon'],             fx: ['snow'],            sfx: ['growl'] },
  { id: 'thread',   line: 11, w: [0, 5],  angle: 'ecu',     move: 'pushroll', env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['thread'],          sfx: ['ting'] },
  { id: 'thread2',  line: 11, w: [5, 10], angle: 'insert',  move: 'pan',      env: 'snow',     light: 'night',   chars: ['tanjiro', 'demon'],  fx: ['thread'],          sfx: ['ting'] },
  { id: 'dragon',   line: 12, w: [0, 4],  angle: 'hero',    move: 'crane',    env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['dragon'],          sfx: ['roar', 'sting'], twist: true },
  { id: 'wheel',    line: 12, w: [4, 6],  angle: 'orbit',   move: 'orbit',    env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['wheel', 'flash'],  sfx: ['slash', 'impact'] },
  { id: 'quiet',    line: 13, w: [0, 5],  angle: 'wide',    move: 'pull',     env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['embers', 'snow'],  sfx: ['wind'] },
  { id: 'embers',   line: 13, w: [5, 9],  angle: 'close',   move: 'crane',    env: 'snow',     light: 'night',   chars: ['tanjiro'],           fx: ['embers'],          sfx: [] },
  { id: 'resolve',  line: 14, w: [0, 5],  angle: 'mcu',     move: 'push',     env: 'village',  light: 'golden',  chars: ['tanjiro'],           fx: ['haori', 'rays'],   sfx: ['ting'] },
  { id: 'endcard',  line: 14, w: [5, 12], angle: 'wide',    move: 'pull',     env: 'village',  light: 'golden',  chars: ['tanjiro'],           fx: ['rays'],            sfx: [] },
];

export function buildShotPlan({ alignPath, fps = FPS } = {}) {
  const align = JSON.parse(fs.readFileSync(alignPath, 'utf8'));
  const offs = lineOffsets();
  const shots = ROWS.map((r) => {
    const { off, n } = offs[r.line];
    const a = Math.max(0, Math.min(n, r.w[0])), b = Math.max(a + 1, Math.min(n, r.w[1]));
    const ws = align.words.slice(off + a, off + b);
    const t0 = ws[0].t;
    const t1 = ws[ws.length - 1].t + ws[ws.length - 1].dur;
    const f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
    return { ...r, t0, t1, f0, f1, frames: f1 - f0, text: ws.map((w) => w.word).join(' ') };
  });
  // pad the last shot toward the audio tail, but never past the 90-frame rule
  const last = shots[shots.length - 1];
  last.f1 = Math.min(last.f0 + 90, Math.round((align.duration + 0.4) * fps));
  last.frames = last.f1 - last.f0;
  const problems = qaShotPlan(shots);
  return { fps, duration: align.duration, totalFrames: last.f1, shots, problems, words: align.words };
}

if (process.argv[1] && process.argv[1].endsWith('plan7.mjs')) {
  const plan = buildShotPlan({ alignPath: path.join(here, '../../out/tanjiro/align.json') });
  console.log(`shots ${plan.shots.length}  frames ${plan.totalFrames}  dur ${plan.duration.toFixed(2)}s`);
  for (const s of plan.shots) console.log(`${String(s.f0).padStart(4)}-${String(s.f1).padStart(4)} (${String(s.frames).padStart(2)}f) ${s.angle.padEnd(7)} ${s.move.padEnd(8)} ${s.env.padEnd(8)} ${s.id.padEnd(10)} "${s.text}"`);
  console.log('problems:', plan.problems.length ? plan.problems : 'none');
}