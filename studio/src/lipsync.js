// lipsync.js — Round 14: word-timed mouth animation + meaning-driven expression.
// Browser-side classic script: window.LipSync(words, opts) -> { at(t), mouthAt(t), stats }
//
// WHY THIS EXISTS: puppet2d had no mouth aperture at all, so quoted dialogue could not be
// lip-synced. This turns the 123 aligned narration words (or any word list) into a viseme
// track. It is deliberately NOT used to make a character mime the third-person narrator —
// that would read as bad dubbing. It drives (a) diegetic speech where a character owns the
// line, (b) non-verbal vocal beats that DO have audio (the valley cheer), and (c) directed
// reaction mouths (gasp, held breath). See references/13-visual-cinema.md.
(function () {
  // Letter-cluster -> viseme. Crude but readable at billboard scale; the mouth is ~30px.
  const VISEME = [
    [/^(m|b|p)/i, 'closed'],
    [/^(f|v)/i, 'narrow'],
    [/(oo|ou|ow|u)/i, 'round'],
    [/(ee|ea|ie|ei|i|y)/i, 'wide'],
    [/(a|o|e)/i, 'open'],
  ];
  function visemeOf(chunk) {
    for (const [re, v] of VISEME) if (re.test(chunk)) return v;
    return 'open';
  }
  // Split a word into 1-3 mouth events so a long word is not one static hole.
  function chunks(word) {
    const w = word.replace(/[^A-Za-z']/g, '');
    if (!w) return [];
    if (w.length <= 3) return [w];
    const n = w.length >= 7 ? 3 : 2;
    const out = []; let i = 0;
    for (let k = 0; k < n; k++) {
      const take = Math.ceil((w.length - i) / (n - k));
      out.push(w.slice(i, i + take)); i += take;
    }
    return out.filter(Boolean);
  }

  function LipSync(words, { attack = 0.035, release = 0.07, gain = 1.0, seed = 0 } = {}) {
    // Build a flat event list: {t0,t1,shape,peak}
    const events = [];
    for (const w of words) {
      const cs = chunks(w.word);
      if (!cs.length) continue;
      const dur = Math.max(0.08, w.dur || 0.2);
      const per = dur / cs.length;
      cs.forEach((c, i) => {
        const shape = visemeOf(c);
        // closed visemes are brief; open vowels carry the energy
        const peak = shape === 'closed' ? 0.28 : shape === 'narrow' ? 0.5 : shape === 'wide' ? 0.82 : 1.0;
        events.push({ t0: w.t + i * per, t1: w.t + (i + 1) * per, shape, peak });
      });
    }
    events.sort((a, b) => a.t0 - b.t0);

    function mouthAt(t) {
      // find the active event (list is short; linear scan from a cached cursor)
      let ev = null;
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (t >= e.t0 - attack && t <= e.t1 + release) { ev = e; break; }
        if (e.t0 > t + release) break;
      }
      if (!ev) return { talk: 0, mouthShape: 'closed', word: null };
      let env;
      if (t < ev.t0) env = Math.max(0, (t - (ev.t0 - attack)) / attack) * 0.5;
      else if (t > ev.t1) env = Math.max(0, 1 - (t - ev.t1) / release);
      else {
        const u = (t - ev.t0) / Math.max(1e-4, ev.t1 - ev.t0);
        env = 0.72 + 0.28 * Math.sin(u * Math.PI); // slight swell inside the chunk
      }
      return { talk: Math.max(0, Math.min(1, env * ev.peak * gain)), mouthShape: ev.shape, word: null };
    }

    // Non-verbal vocal beats that have real audio: a cheer, a gasp, a held breath.
    function cheer(t, t0, dur, seedK = 0) {
      if (t < t0 || t > t0 + dur) return null;
      const u = (t - t0) / dur;
      const env = Math.sin(Math.min(1, u * 3) * Math.PI / 2) * (1 - Math.max(0, (u - 0.7) / 0.3));
      const flap = 0.55 + 0.45 * Math.abs(Math.sin((t - t0) * 7.5 + seedK));
      return { talk: Math.max(0, env * flap), mouthShape: 'open', brow: 0.7 };
    }
    function gasp(t, t0, dur = 0.5) {
      if (t < t0 || t > t0 + dur) return null;
      const u = (t - t0) / dur;
      return { talk: Math.sin(u * Math.PI) * 0.95, mouthShape: 'round', brow: 0.9 };
    }
    function heldBreath(t, t0, dur) {
      if (t < t0 || t > t0 + dur) return null;
      return { talk: 0.06 + 0.02 * Math.sin(t * 9), mouthShape: 'closed', brow: -0.3 };
    }

    return {
      events, mouthAt, cheer, gasp, heldBreath,
      at(t) { return mouthAt(t); },
      stats: { words: words.length, events: events.length, span: events.length ? events[events.length - 1].t1 : 0 },
    };
  }
  window.LipSync = LipSync;
})();
