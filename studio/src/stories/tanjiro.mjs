/**
 * stories/tanjiro.mjs — Round 7 working script + shot plan.
 *
 * IMPORTANT PROVENANCE: the handover's original Tanjiro script had not arrived in
 * the repository at Round 7 start (verified: zero hits for tanjiro/kimetsu/water
 * breathing across all tracked text). This is an ORIGINAL working script written
 * in the target genre (the "Miko" anime-crossover training-story shorts, see
 * research/uploads-2026-11-25/image-2.png). It is a placeholder pending the user's
 * script; the pipeline is script-driven so swapping text only re-runs voice+timing.
 *
 * Structure follows the MASTER PROMPT: hook (absurd fact) -> setting -> escalation
 * -> pivot -> twist/payoff. ~3.7 words/s target; every line has a visual counterpart.
 * No stage directions in the spoken text.
 */

export const TITLE = 'The Charcoal Boy Who Split a Boulder';

export const SCRIPT = [
  'They said a charcoal boy could never hold a blade.',
  'Tanjiro Kamado climbed the mountain anyway.',
  'Before dawn, he swings until his palms bleed.',
  'One thousand cuts. Then one thousand more.',
  'His master says, water has no shape, so it cannot be broken.',
  'Breathe in. Total concentration. Constant.',
  'The river answers first. A ribbon of blue wraps the steel.',
  'First form. Water Surface Slash!',
  'The boulder splits before the sound arrives.',
  'But the real test comes at night, in the snow.',
  'A demon, faster than sight, hungry and smiling.',
  'Tanjiro closes his eyes, and listens for the opening thread.',
  'Then the dragon rises. Water Wheel!',
  'One rotation. One flash. And the night goes quiet.',
  'Kindness was never his weakness. It was the reason he kept swinging.',
];

export const FULL_TEXT = SCRIPT.join(' ');

/**
 * Shot plan skeleton — one row per shot, in narration order. Frame ranges are
 * filled by `planShots()` from the MEASURED voice timing (never a wps guess).
 * MASTER PROMPT rules encoded here:
 *   - every shot <= 90 frames (3 s) at 30 fps; long sentences split into 2 shots
 *   - camera angle never repeats consecutively (checked by qaShotPlan)
 *   - every shot has a camera move (creep at minimum)
 *   - light preset per beat; twist shot flagged for music-stop + low hit + roll
 */
export const SHOTS = [
  { id: 'hook',      line: 0,  env: 'village',  light: 'dawn',    angle: 'mcu',        move: 'push',    chars: ['tanjiro'],            fx: [],                 sfx: ['wind'] },
  { id: 'climb',     line: 1,  env: 'mountain', light: 'day',     angle: 'wide',       move: 'track',   chars: ['tanjiro'],            fx: ['clouds'],         sfx: ['whoosh', 'steps'] },
  { id: 'swing',     line: 2,  env: 'yard',     light: 'predawn', angle: 'medium',     move: 'arc',     chars: ['tanjiro'],            fx: ['sweat'],          sfx: ['swing', 'whoosh'] },
  { id: 'count',     line: 3,  env: 'yard',     light: 'predawn', angle: 'insert',     move: 'push',    chars: ['tanjiro'],            fx: ['tally', 'speed'], sfx: ['tick', 'swing'] },
  { id: 'master',    line: 4,  env: 'falls',    light: 'day',     angle: 'two',        move: 'pan',     chars: ['tanjiro', 'master'],  fx: ['mist'],           sfx: ['water'] },
  { id: 'breathe',   line: 5,  env: 'falls',    light: 'day',     angle: 'ecu',        move: 'pushroll',chars: ['tanjiro'],            fx: ['breath', 'aura'], sfx: ['inhale'] },
  { id: 'river',     line: 6,  env: 'river',    light: 'day',     angle: 'wide',       move: 'crane',   chars: ['tanjiro'],            fx: ['ribbon'],         sfx: ['water', 'riser'] },
  { id: 'slash',     line: 7,  env: 'river',    light: 'day',     angle: 'low',        move: 'dash',    chars: ['tanjiro'],            fx: ['arc', 'speed'],   sfx: ['slash', 'impact'] },
  { id: 'boulder',   line: 8,  env: 'river',    light: 'day',     angle: 'insert',     move: 'shake',   chars: [],                     fx: ['debris', 'dust'], sfx: ['crack', 'impact'] },
  { id: 'night',     line: 9,  env: 'snow',     light: 'night',   angle: 'wide',       move: 'pull',    chars: ['tanjiro'],            fx: ['snow'],           sfx: ['wind'] },
  { id: 'demon',     line: 10, env: 'snow',     light: 'night',   angle: 'low',        move: 'push',    chars: ['demon'],              fx: ['snow', 'eyes'],   sfx: ['growl'] },
  { id: 'thread',    line: 11, env: 'snow',     light: 'night',   angle: 'ecu',        move: 'pushroll',chars: ['tanjiro'],            fx: ['thread'],         sfx: ['ting'] },
  { id: 'dragon',    line: 12, env: 'snow',     light: 'night',   angle: 'hero',       move: 'crane',   chars: ['tanjiro'],            fx: ['dragon'],         sfx: ['roar', 'sting'], twist: true },
  { id: 'wheel',     line: 12, env: 'snow',     light: 'night',   angle: 'orbit',      move: 'orbit',   chars: ['tanjiro'],            fx: ['wheel', 'flash'], sfx: ['slash', 'impact'], split: 'tail' },
  { id: 'quiet',     line: 13, env: 'snow',     light: 'night',   angle: 'wide',       move: 'pull',    chars: ['tanjiro'],            fx: ['embers', 'snow'], sfx: ['wind'] },
  { id: 'resolve',   line: 14, env: 'village',  light: 'golden',  angle: 'mcu',        move: 'push',    chars: ['tanjiro'],            fx: ['haori', 'rays'],  sfx: ['ting'] },
];

/** Shot kinds that must never repeat back-to-back (MASTER PROMPT camera rule 1). */
export function qaShotPlan(shots) {
  const problems = [];
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].angle === shots[i - 1].angle) problems.push(`shots ${i - 1}/${i} repeat angle ${shots[i].angle}`);
  }
  for (const s of shots) {
    if (s.frames > 90) problems.push(`shot ${s.id} holds ${s.frames} frames (>90)`);
    if (!s.move) problems.push(`shot ${s.id} has no camera move`);
  }
  return problems;
}