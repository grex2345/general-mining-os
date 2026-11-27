// VideoIR: the neutral intermediate representation every renderer adapter consumes.
//
// Design borrowed from the research findings:
//  - artem's "spec JSON" (a small, validated object the agent writes)
//  - kalem's frame-indexed sound events (audio can never drift from picture)
//  - HyperFrames' determinism contract (every visible thing is a pure function of time)
//  - iart's rule that layout is designed first and motion only decides *when*

/** @typedef {'hook'|'stat'|'chart'|'compare'|'list'|'quote'|'title'|'outro'} SceneKind */

export const SCENE_KINDS = ['hook', 'stat', 'chart', 'compare', 'list', 'quote', 'title', 'outro'];

export class IRValidationError extends Error {
  constructor(problems) {
    super('VideoIR invalid:\n  - ' + problems.join('\n  - '));
    this.name = 'IRValidationError';
    this.problems = problems;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validateScene(s, i, problems) {
  const at = `scenes[${i}]`;
  if (!s || typeof s !== 'object') { problems.push(`${at} is not an object`); return; }
  if (!s.id) problems.push(`${at}.id missing`);
  if (!SCENE_KINDS.includes(s.kind)) problems.push(`${at}.kind "${s.kind}" not one of ${SCENE_KINDS.join('|')}`);
  if (!isNum(s.duration) || s.duration <= 0.3) problems.push(`${at}.duration must be > 0.3s (got ${s.duration})`);
  if (s.duration > 20) problems.push(`${at}.duration ${s.duration}s is too long for a single scene (max 20)`);
  if (!s.engine) problems.push(`${at}.engine missing (assigned by the router)`);

  const lineBudget = Math.max(2, Math.round((s.duration || 3) * 3.2)); // ~3.2 words/sec of caption
  const words = (n) => (typeof n === 'string' ? n.trim().split(/\s+/).filter(Boolean).length : 0);

  switch (s.kind) {
    case 'hook':
      if (!s.title) problems.push(`${at}.title missing`);
      if (words(s.title) > 12) problems.push(`${at}.title is ${words(s.title)} words; a hook must be <= 12`);
      break;
    case 'stat': {
      if (!isNum(s.value)) problems.push(`${at}.value must be a number`);
      if (!s.label) problems.push(`${at}.label missing`);
      if (words(s.label) > 8) problems.push(`${at}.label too long (<= 8 words)`);
      break;
    }
    case 'chart': {
      if (!Array.isArray(s.series) || s.series.length < 2) problems.push(`${at}.series needs >= 2 points`);
      else {
        for (const [j, p] of s.series.entries()) {
          if (!p || !isNum(p.value)) problems.push(`${at}.series[${j}].value must be a number`);
          if (!p || !p.label) problems.push(`${at}.series[${j}].label missing`);
        }
      }
      break;
    }
    case 'compare': {
      if (!Array.isArray(s.items) || s.items.length < 2 || s.items.length > 4)
        problems.push(`${at}.items needs 2..4 entries`);
      else for (const [j, it] of s.items.entries()) {
        if (!it.label) problems.push(`${at}.items[${j}].label missing`);
        if (!isNum(it.value)) problems.push(`${at}.items[${j}].value must be a number`);
      }
      break;
    }
    case 'list': {
      if (!Array.isArray(s.items) || s.items.length < 2 || s.items.length > 5)
        problems.push(`${at}.items needs 2..5 entries`);
      else for (const [j, t] of s.items.entries()) {
        if (typeof t !== 'string' || !t.trim()) problems.push(`${at}.items[${j}] must be a non-empty string`);
        if (words(t) > 9) problems.push(`${at}.items[${j}] too long (${words(t)} words, max 9)`);
      }
      break;
    }
    case 'quote':
      if (!s.text) problems.push(`${at}.text missing`);
      if (words(s.text) > 22) problems.push(`${at}.text too long for one screen (<= 22 words)`);
      break;
    case 'title':
      if (!s.title) problems.push(`${at}.title missing`);
      break;
    case 'outro':
      if (!s.title) problems.push(`${at}.title missing`);
      break;
  }
  // narration timing sanity: at ~2.9 words/sec of speech, the voice must fit the scene
  if (s.narration) {
    const secs = words(s.narration) / 2.9;
    if (secs > s.duration + 0.05)
      problems.push(`${at}.narration ~${secs.toFixed(1)}s of speech does not fit ${s.duration}s of scene`);
    if (words(s.narration) > lineBudget + 14) problems.push(`${at}.narration is denser than the scene can carry`);
  }
}

export function validateIR(ir, opts = {}) {
  const problems = [];
  if (!ir || typeof ir !== 'object') throw new IRValidationError(['root is not an object']);
  if (!ir.id) problems.push('id missing');
  if (!ir.title) problems.push('title missing');
  const { width, height, fps } = ir.format || {};
  if (!isNum(width) || width < 256) problems.push('format.width invalid');
  if (!isNum(height) || height < 256) problems.push('format.height invalid');
  if (!isNum(fps) || fps < 12 || fps > 60) problems.push('format.fps must be 12..60');
  if (!Array.isArray(ir.scenes) || ir.scenes.length === 0) problems.push('scenes missing/empty');
  else ir.scenes.forEach((s, i) => validateScene(s, i, problems));

  if (Array.isArray(ir.scenes) && ir.scenes.length) {
    const total = ir.scenes.reduce((a, s) => a + (s.duration || 0), 0);
    if (total < 8) problems.push(`total duration ${total.toFixed(1)}s is too short for a published video`);
    if (opts.maxDuration && total > opts.maxDuration)
      problems.push(`total duration ${total.toFixed(1)}s exceeds limit ${opts.maxDuration}s`);
    const first = ir.scenes[0];
    if (first && first.kind !== 'hook' && first.kind !== 'title')
      problems.push('first scene should be a hook or title (thumbnail/first frame matters)');
    const last = ir.scenes[ir.scenes.length - 1];
    if (last && last.kind !== 'outro')
      problems.push('last scene should be an outro');
  }
  if (problems.length) throw new IRValidationError(problems);
  return ir;
}

/** Total duration in seconds. */
export const totalDuration = (ir) => ir.scenes.reduce((a, s) => a + s.duration, 0);

/**
 * Build a scene timeline: absolute start/end frame for every scene.
 * Frame-exact, so audio and picture share one clock.
 */
export function timeline(ir) {
  const fps = ir.format.fps;
  let frame = 0;
  const scenes = ir.scenes.map((s) => {
    const frames = Math.max(1, Math.round(s.duration * fps));
    const entry = { ...s, startFrame: frame, frames, endFrame: frame + frames - 1, start: frame / fps, end: (frame + frames) / fps };
    frame += frames;
    return entry;
  });
  return { fps, scenes, totalFrames: frame, duration: frame / fps };
}

export function newIR(partial) {
  return {
    id: partial.id,
    title: partial.title,
    format: { width: 1080, height: 1920, fps: 30, ...(partial.format || {}) },
    meta: { createdAt: new Date().toISOString(), ...(partial.meta || {}) },
    palette: partial.palette,
    scenes: partial.scenes,
    audio: partial.audio || { music: null, sfx: [] },
    captions: partial.captions || null,
  };
}
