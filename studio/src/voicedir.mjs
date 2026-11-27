// voicedir.mjs — Round 13: the intelligent AUDIO DIRECTOR.
//
// Reads a whole script, understands its emotional arc, and emits a per-beat
// direction that drives FOUR things from one source of truth:
//   1. narration  — how each beat is spoken (TTS text shaping + mild DSP)
//   2. music      — mood + intensity per beat, continuous bed
//   3. sound      — foley/ambience/stinger events tied to the beat's actions
//   4. silence    — where to withhold sound so a reveal lands
//
// Deterministic and inspectable: every decision carries a `why`. No hidden
// randomness, so a director plan can be reviewed, diffed and hand-corrected.
//
// Emotions: neutral warm mystery tension sadness surprise excitement comedy reveal resolve

/* ------------------------------------------------------------- lexicon ---- */
// Weighted cues. Weights are deliberate: strong story words outrank filler.
const LEX = {
  mystery:    { words: { secret:3, hidden:3, nobody:2, strange:3, mysterious:3, whisper:3, shadow:2, unknown:3, wondered:2, question:2, why:1, somehow:2, unseen:3, silence:2, silent:2, sound:1, dark:1, night:1, locked:2, vanished:3, disappeared:3, listening:2, tapped:1 }, punct: { '?': 1.0 } },
  tension:    { words: { danger:3, risk:3, afraid:3, fear:3, worried:2, nervous:2, hotter:2, barely:2, almost:2, waited:2, watching:2, closer:2, never:1, before:1, trembled:3, held:1, breath:2, still:1 }, punct: {} },
  sadness:    { words: { lost:3, alone:3, empty:2, failed:3, failure:3, cried:3, tears:3, gone:2, broke:2, broken:2, threw:1, away:1, poor:2, sad:3, nobody:1, forgotten:3, gave:1, hurt:2 }, punct: {} },
  surprise:   { words: { suddenly:3, suddenly:3, unexpected:3, gasped:3, shocked:3, stunned:3, unbelievable:3, impossible:3, never:1, seen:1, wow:3, actually:2, turned:1, swung:2, open:1 }, punct: { '!': 1.2 } },
  excitement: { words: { finally:2, won:3, victory:3, cheered:3, celebrated:3, applause:3, amazing:3, incredible:3, best:2, greatest:3, alive:2, rising:2, spun:1, spinning:1, faster:2, built:1, thousand:1, rang:3, ring:2, heard:2, roar:2, thunder:2 }, punct: { '!': 1.5 } },
  comedy:     { words: { laughed:3, laugh:3, funny:3, ridiculous:3, crazy:2, silly:3, joke:3, absurd:3, stupid:2, mocked:2, teasing:2, called:2, slow:1, somehow:1, literally:1 }, punct: {} },
  reveal:     { words: { because:3, revealed:3, reveal:3, masterpiece:3, truth:3, discovered:3, realized:3, behold:3, came:1, out:1, wasn:2, just:1, something:2, remembered:2, became:2, swallowing:2, stone:1 }, punct: {} },
  warm:       { words: { every:1, morning:2, village:1, home:2, family:2, friend:2, kind:2, loved:3, heart:2, hands:1, chose:2, clay:1, boy:1, girl:1, together:2 }, punct: {} },
  resolve:    { words: { decided:3, determined:3, kept:2, continued:2, again:2, still:1, but:1, promised:2, would:1, remembered:2, became:2, one:1 }, punct: {} },
};

// Structural position priors: a story's shape carries emotion even without cues.
function positionPrior(i, n) {
  const u = n <= 1 ? 0 : i / (n - 1);
  if (u < 0.12) return { comedy: 0.6, warm: 0.8, mystery: 0.5 };      // hook / establish
  if (u < 0.35) return { warm: 0.6, tension: 0.4 };                    // setup / contrast
  if (u < 0.62) return { tension: 0.8, sadness: 0.5, resolve: 0.5 };   // struggle
  if (u < 0.78) return { tension: 1.0, mystery: 0.9 };                 // the risk / turn
  if (u < 0.92) return { reveal: 1.6, surprise: 1.2 };                 // payoff
  return { resolve: 1.4, excitement: 1.0, warm: 0.8 };                 // resolution
}

const EMOTION_PROFILE = {
  neutral:    { intensity: 0.45, rate: 1.00, pitch: 0,  gainDb: 0,    tilt: 0,     pauseAfter: 0.30, breath: 0.25, music: 'dawn',   comp: { thresholdDb: -14, ratio: 2.2 } },
  warm:       { intensity: 0.50, rate: 0.98, pitch: 0,  gainDb: 0,    tilt: -0.15, pauseAfter: 0.32, breath: 0.35, music: 'dawn',   comp: { thresholdDb: -14, ratio: 2.2 } },
  mystery:    { intensity: 0.35, rate: 0.92, pitch: -1, gainDb: -2.0, tilt: -0.35, pauseAfter: 0.45, breath: 0.55, music: 'night',  comp: { thresholdDb: -18, ratio: 1.8 } },
  tension:    { intensity: 0.55, rate: 0.94, pitch: -1, gainDb: -1.0, tilt: -0.20, pauseAfter: 0.40, breath: 0.45, music: 'tense',  comp: { thresholdDb: -16, ratio: 2.0 } },
  sadness:    { intensity: 0.30, rate: 0.90, pitch: -2, gainDb: -2.5, tilt: -0.45, pauseAfter: 0.55, breath: 0.65, music: 'night',  comp: { thresholdDb: -20, ratio: 1.6 } },
  surprise:   { intensity: 0.85, rate: 1.06, pitch: 2,  gainDb: 1.5,  tilt: 0.35,  pauseAfter: 0.42, breath: 0.70, music: 'swell',  comp: { thresholdDb: -12, ratio: 2.8 } },
  excitement: { intensity: 0.90, rate: 1.08, pitch: 2,  gainDb: 1.5,  tilt: 0.40,  pauseAfter: 0.26, breath: 0.50, music: 'joy',    comp: { thresholdDb: -12, ratio: 3.0 } },
  comedy:     { intensity: 0.70, rate: 1.04, pitch: 1,  gainDb: 0.5,  tilt: 0.20,  pauseAfter: 0.34, breath: 0.30, music: 'build',  comp: { thresholdDb: -13, ratio: 2.5 } },
  reveal:     { intensity: 0.80, rate: 0.93, pitch: 1,  gainDb: 0.5,  tilt: 0.15,  pauseAfter: 0.60, breath: 0.60, music: 'wonder', comp: { thresholdDb: -14, ratio: 2.2 } },
  resolve:    { intensity: 0.65, rate: 0.97, pitch: 0,  gainDb: 0,    tilt: 0.05,  pauseAfter: 0.40, breath: 0.35, music: 'joy',    comp: { thresholdDb: -14, ratio: 2.3 } },
};

/* -------------------------------------------------------------- helpers --- */
const norm = (w) => w.toLowerCase().replace(/[^a-z']/g, '');

/** Split a script into beats at sentence boundaries, keeping the punctuation. */
export function splitBeats(script) {
  const clean = script.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [clean];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Optional explicit direction: a beat may start with [emotion] or [emotion:0.8]. */
function parseMarker(text) {
  const m = text.match(/^\[([a-z]+)(?::([0-9.]+))?\]\s*/i);
  if (!m) return { text, forced: null, forcedIntensity: null };
  const e = m[1].toLowerCase();
  if (!EMOTION_PROFILE[e]) return { text, forced: null, forcedIntensity: null };
  return { text: text.slice(m[0].length), forced: e, forcedIntensity: m[2] ? +m[2] : null };
}

/** Score every emotion for one beat. Returns ranked list with reasons. */
export function scoreEmotions(text, i, n) {
  const words = text.split(/\s+/).map(norm).filter(Boolean);
  const scores = {}, reasons = {};
  for (const [emo, def] of Object.entries(LEX)) {
    let s = 0; const hits = [];
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      if (!def.words[w]) continue;
      // NEGATION: "the bell was NEVER broken" is not a sad statement. A negator
      // in the two preceding tokens cancels a sadness cue (and halves others).
      const prev = words.slice(Math.max(0, k - 2), k);
      const negated = prev.some((q) => ['never', 'not', 'no', "wasn't", "isn't", "didn't", "hadn't", "weren't"].includes(q));
      if (negated) {
        if (emo === 'sadness') { continue; }
        s += def.words[w] * 0.5; hits.push(w + '(negated)');
      } else { s += def.words[w]; hits.push(w); }
    }
    for (const [p, wt] of Object.entries(def.punct || {})) {
      const c = text.split(p).length - 1;
      if (c) { s += wt * c; hits.push(`${p}x${c}`); }
    }
    if (hits.length) reasons[emo] = hits.slice(0, 5);
    scores[emo] = s;
  }
  const prior = positionPrior(i, n);
  for (const [emo, wt] of Object.entries(prior)) { scores[emo] = (scores[emo] || 0) + wt; (reasons[emo] ||= []).push(`position+${wt}`); }
  const ranked = Object.entries(scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return { ranked, reasons };
}

/**
 * Rewrite a beat's text so a plain-text TTS engine reads it with the intended
 * delivery. We cannot pass SSML, so punctuation and sentence length ARE the
 * control surface: short sentences punch, ellipses suspend, dashes aside.
 * Returns { ttsText, changes[] }.
 */
export function shapeForTTS(text, emotion, intensity) {
  const changes = [];
  let t = text.trim();
  const strip = (s) => s.replace(/[.!?]+$/, '');

  if (emotion === 'mystery' || emotion === 'tension') {
    // suspend the final clause; a trailing ellipsis reads as unfinished thought
    if (intensity > 0.3 && !/[.!?]$/.test(t)) { t += '…'; changes.push('ellipsis: suspend'); }
    else if (/\.$/.test(t) && intensity > 0.45) { t = strip(t) + '…'; changes.push('period->ellipsis: suspense'); }
    // break a long clause into two shorter breaths
    const w = t.split(' ');
    if (w.length > 14) {
      const mid = Math.floor(w.length / 2);
      let cut = mid;
      for (let k = mid; k < Math.min(w.length - 3, mid + 5); k++) if (/,$/.test(w[k])) { cut = k + 1; break; }
      t = w.slice(0, cut).join(' ') + ' ' + w.slice(cut).join(' ');
      changes.push('clause split for breath');
    }
  } else if (emotion === 'sadness') {
    if (/\.$/.test(t)) { t = strip(t) + '…'; changes.push('period->ellipsis: trailing off'); }
    t = t.replace(/,\s*/g, ', '); // keep commas as soft pauses
  } else if (emotion === 'surprise') {
    if (/\.$/.test(t)) { t = strip(t) + '!'; changes.push('period->exclamation: reaction'); }
  } else if (emotion === 'excitement') {
    if (/\.$/.test(t) && intensity > 0.6) { t = strip(t) + '!'; changes.push('period->exclamation: energy'); }
    // short punchy sentences: split on ", and" / ", but"
    const before = t;
    t = t.replace(/,\s+(and|but)\s+/gi, '. $1 ');
    if (t !== before) changes.push('compound -> two sentences: punch');
  } else if (emotion === 'comedy') {
    // comedic timing: isolate the punchline clause after the last comma
    const idx = t.lastIndexOf(',');
    if (idx > 0 && t.length - idx > 8 && t.length - idx < 40) {
      t = t.slice(0, idx) + '.' + t.slice(idx + 1);
      changes.push('comma->period: comedic beat before punchline');
    }
  } else if (emotion === 'reveal') {
    // a dramatic dash before the payoff phrase
    const m = t.match(/^(.*?)(\b(?:it was|because|what came out|and the)\b.*)$/i);
    if (m && m[1].trim().length > 6) { t = strip(m[1].trim()) + ' — ' + m[2]; changes.push('em-dash before payoff'); }
    else if (/\.$/.test(t)) { t = strip(t) + '.'; }
  }
  return { ttsText: t, changes };
}

/** Pick words worth emphasising: story nouns/verbs, numbers, proper nouns. */
export function emphasisWords(text, keywords = []) {
  const kw = new Set(keywords.map((k) => k.toLowerCase()));
  const out = [];
  const toks = text.split(/\s+/);
  toks.forEach((raw, idx) => {
    const w = norm(raw);
    if (!w) return;
    if (kw.has(w)) { out.push(raw.replace(/[^\w']/g, '')); return; }
    if (/^\d/.test(raw)) { out.push(raw.replace(/[^\w']/g, '')); return; }
    if (idx > 0 && /^[A-Z]/.test(raw) && w.length > 2) { out.push(raw.replace(/[^\w']/g, '')); return; }
  });
  return [...new Set(out)];
}

/* ------------------------------------------------------- the director ----- */
/**
 * Build a full direction plan.
 * opts: { keywords, leadIn, minBeatSec, maxBeatSec, silenceBeforeReveal, seed }
 */
export function direct(script, opts = {}) {
  const { keywords = [], leadIn = 1.0, silenceBeforeReveal = 0.55 } = opts;
  const raw = splitBeats(script);
  const n = raw.length;
  const beats = [];
  let prevEmotion = null;

  raw.forEach((orig, i) => {
    const { text, forced, forcedIntensity } = parseMarker(orig);
    const { ranked, reasons } = scoreEmotions(text, i, n);
    let emotion = forced || (ranked[0] ? ranked[0][0] : 'neutral');
    const why = forced ? [`forced marker [${forced}]`] : (reasons[emotion] || ['default neutral']);

    // HUSH OVERRIDE. A line ABOUT quiet must be spoken quietly. Without this,
    // "the whole village fell silent" scored as surprise (from "swung open") and
    // got an exclamation mark — the exact opposite of the intended delivery.
    const hush = /\b(silent|silence|quiet|quietly|hushed|stillness|froze|held (?:its|their) breath|no one (?:spoke|moved))\b/i.test(text);
    if (!forced && hush && ['surprise', 'excitement', 'comedy'].includes(emotion)) {
      emotion = 'mystery';
      why.push('hush override: the line describes silence, so it is spoken hushed');
    }

    // Avoid a monotonous run: if the same emotion repeats 3x, take the runner-up
    // when it is close, so the arc keeps moving. Recorded as a decision.
    if (!forced && prevEmotion === emotion && i >= 2 && beats[i - 1]?.emotion === emotion && beats[i - 2]?.emotion === emotion) {
      const alt = ranked.find(([e]) => e !== emotion && e !== prevEmotion);
      if (alt && alt[1] >= (ranked[0][1] * 0.7)) { emotion = alt[0]; why.push('anti-monotony switch'); }
    }

    // SHORT ELLIPTICAL TWIST: a <=4-word beat right after a "Because..." clause
    // is the turn of the story ("Because the bell was never broken. The tower
    // was."). Position priors alone called it tension; it is the surprise.
    if (!forced && text.split(/\s+/).length <= 4 && i > 0 && /^because\b/i.test(raw[i - 1] || '')) {
      emotion = 'surprise'; why.push('short elliptical twist after a because-clause');
    }

    const p = EMOTION_PROFILE[emotion];
    const score = forced ? 1 : Math.min(1, (ranked[0]?.[1] || 1) / 5);
    const intensity = forcedIntensity != null ? Math.min(1, forcedIntensity) : +Math.min(1, p.intensity * (0.75 + 0.5 * score)).toFixed(2);
    const { ttsText, changes } = shapeForTTS(text, emotion, intensity);
    const words = text.split(/\s+/).filter(Boolean).length;

    beats.push({
      id: `b${String(i + 1).padStart(2, '0')}`,
      index: i, text, ttsText, words, emotion, intensity,
      why, ttsChanges: changes,
      emphasis: emphasisWords(text, keywords),
      prosody: { rateHint: p.rate, pitchHintSt: p.pitch, pauseAfterSec: p.pauseAfter, breathBeforeProb: p.breath },
      dsp: { gainDb: p.gainDb, tilt: p.tilt, compress: p.comp },
      music: { mood: p.music, intensity },
      ranked: ranked.slice(0, 3).map(([e, s]) => ({ emotion: e, score: +s.toFixed(2) })),
    });
    prevEmotion = emotion;
  });

  // ---- silence plan: withhold sound right before the biggest reveal ----------
  let revealIdx = -1, best = 0;
  beats.forEach((b, i) => {
    const w = (b.emotion === 'reveal' ? 2 : b.emotion === 'surprise' ? 1.5 : 0) * b.intensity;
    if (w > best) { best = w; revealIdx = i; }
  });
  if (revealIdx > 0) {
    beats[revealIdx - 1].prosody.pauseAfterSec = Math.max(beats[revealIdx - 1].prosody.pauseAfterSec, silenceBeforeReveal);
    beats[revealIdx - 1].silencePlan = 'hold music down, no SFX in the last 0.35s — quiet before the payoff';
    beats[revealIdx].silencePlan = 'land the reveal after the held silence';
  }

  // ---- global arc -----------------------------------------------------------
  const arc = beats.map((b) => ({ id: b.id, emotion: b.emotion, intensity: b.intensity }));
  const estSec = beats.reduce((a, b) => a + b.words / 3.5 + b.prosody.pauseAfterSec, leadIn);
  return {
    leadIn, beats, arc, revealBeat: revealIdx >= 0 ? beats[revealIdx].id : null,
    estimatedDurationSec: +estSec.toFixed(2),
    keywords,
    notes: [
      'Speaking rate is NOT time-stretched: the Ricks study measured that even 1.1x atempo smears the voice.',
      'Pacing comes from sentence length + explicit pauses between beats.',
      'Each beat is a separate TTS call so the read is contextual, not one flat pass.',
    ],
  };
}

/** Compact human-readable plan for review / hand-correction. */
export function formatPlan(plan) {
  const L = [];
  L.push(`AUDIO DIRECTION — ${plan.beats.length} beats, est ${plan.estimatedDurationSec}s, reveal at ${plan.revealBeat}`);
  L.push('');
  for (const b of plan.beats) {
    L.push(`${b.id}  [${b.emotion} ${b.intensity}]  ${b.words}w  pause ${b.prosody.pauseAfterSec}s`);
    L.push(`   say: ${b.text}`);
    if (b.ttsText !== b.text) L.push(`   tts: ${b.ttsText}`);
    L.push(`   why: ${b.why.join(', ')}${b.ttsChanges.length ? ' | shape: ' + b.ttsChanges.join(', ') : ''}`);
    if (b.emphasis.length) L.push(`   emphasise: ${b.emphasis.join(', ')}`);
    if (b.silencePlan) L.push(`   SILENCE: ${b.silencePlan}`);
    L.push('');
  }
  return L.join('\n');
}

export { EMOTION_PROFILE };
