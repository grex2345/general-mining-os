// Director: concept -> script -> storyboard (VideoIR).
//
// Two modes:
//   mode: 'planner'  – deterministic, rule-based, no network. Used for CI and as
//                      the fallback whenever a model/API is unavailable.
//   mode: 'llm'      – optional. The agent (or any provider) supplies an
//                      "outline" JSON; `outlineToIR` compiles it with the same
//                      validation, so a model can never bypass the contract.
//
// This split is deliberate: the research showed agent-made explainers fail on
// pacing and on invented numbers, so the *structure* is owned by code and only
// the *wording* is delegated.

import { validateIR, newIR, totalDuration } from './ir.mjs';
import { factMap, sourceLine } from './research.mjs';
import { hash } from './design.mjs';

const WPS = 2.05; // words/sec of speech for our TTS voice — MEASURED, see eval/REPORT (was 2.85: 4/7 scenes overran)
const SCENE_PAD = 0.75; // breathing room after the voice stops, per scene

/**
 * Classify a series by SHAPE, because the shape decides the visual and the
 * sentence. A categorical ranking (power cost by site type) is not a time series
 * and must not be drawn or narrated as one -- that mistake crashed the first
 * attempt at planning a non-hashrate bundle.
 */
export function seriesShape(series) {
  if (!series || !Array.isArray(series.points)) return 'none';
  const pts = series.points;
  if (pts.length < 2) return 'none';
  const val = (p) => (Number.isFinite(p.value) ? p.value : p.y);
  if (pts.some((p) => !Number.isFinite(val(p)))) return 'none';

  // Distinguish a trend from a ranking using the point NAMES, which is what the
  // data actually carries: a trend's points are dates/progressions ("Nov 3",
  // "Nov 9", "Q1"), a ranking's points are entities ("Stranded gas", "Grid retail").
  const names = pts.map((p) => String(p.label || p.date || ''));
  if (names.some((n) => !n)) return 'timeline';
  const allDates = names.every((n) => /^(\d{4}-\d{2}(-\d{2})?|Q[1-4]|\d{4})$/.test(n));
  if (allDates) return 'timeline';
  const monthish = names.every((n) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(n) || /^\d/.test(n));
  if (monthish) return 'timeline';
  const repeatDates = new Set(pts.map((p) => p.date).filter(Boolean)).size < pts.length;
  return repeatDates ? 'categorical' : 'categorical';
}

/** Normalise a series' points to {label, value, date} (bundles may use y or value). */
export function normalizePoints(series) {
  return (series?.points || []).map((p) => ({
    label: String(p.label || p.date || ''),
    value: Number(Number.isFinite(p.value) ? p.value : p.y),
    date: p.date || null,
  })).filter((p) => Number.isFinite(p.value));
}

/** Pick the series that can actually carry a chart (>= 3 points). */
export function primarySeries(bundle) {
  const list = bundle.series || [];
  return list.find((s) => s.points?.length >= 3) || list[0] || null;
}

/** Choose the scene architecture for a topic (this is the "format director"). */
export function chooseFormat(bundle, { tone = 'data-news' } = {}) {
  const has = (id) => bundle.facts.some((f) => f.id === id);
  const series = primarySeries(bundle);
  const shape = seriesShape(series);
  const beats = ['hook'];
  if (shape === 'timeline') beats.push('chart');
  if (shape === 'categorical') beats.push('compare');
  if (has('hashprice_now') || has('difficulty_next')) beats.push('compare');
  beats.push('stat', 'list', 'quote');
  if (tone === 'data-news') {
    return {
      beats,
      shape,
      rationale: `data-news (series=${shape}): signal -> ${shape === 'categorical' ? 'ranking' : 'trend'} -> comparison -> number -> actions -> quote`,
    };
  }
  return { beats, shape, rationale: 'default explainer arc' };
}

// --- wording helpers (deterministic, no model) ---------------------------
const ordinal = (n) => ['first', 'second', 'third', 'fourth', 'fifth'][n] || `${n + 1}th`;

function hookFrom(bundle) {
  // The hook must be derivable from the evidence, because a hardcoded headline
  // silently lies the moment the pipeline is pointed at a different bundle.
  const f = factMap(bundle);
  const facts = bundle.facts || [];
  const share = facts.find((x) => /curtail|demand.response/i.test(x.claim || ''));
  if (share && /energy/i.test(bundle.topic || '')) {
    return {
      eyebrow: 'ENERGY',
      title: 'Cheap power decides who keeps mining',
      subtitle: 'Stranded gas still undercuts the grid on cost',
    };
  }
  if (f.hashprice_now && f.hashprice_earlier) {
    const pct = ((f.hashprice_now.value - f.hashprice_earlier.value) / f.hashprice_earlier.value) * 100;
    return {
      eyebrow: 'NETWORK',
      title: `Hashrate is at record highs while pay is down ${Math.abs(pct).toFixed(0)}%`,
      subtitle: 'Record hashrate meets a collapsing hashprice',
    };
  }
  return { eyebrow: 'SIGNAL', title: bundle.topic, subtitle: 'What the data actually says' };
}

/** Actionable items, derived from what the evidence actually says. Max 9 words each. */
function listFrom(bundle, facts) {
  if (facts.breakeven_power || /energy/i.test(bundle.topic || '')) {
    return [
      'Check your power contract before your rigs',
      'Stranded gas still beats grid retail',
      'Curtailment income changes the maths',
    ];
  }
  if (facts.hashprice_now) {
    return [
      'Watch hashprice, not the BTC price',
      'Model the next difficulty change',
      'Expect the oldest machines to switch off first',
    ];
  }
  // Generic path: turn the bundle's own facts into imperatives, 9 words max.
  const items = (bundle.facts || [])
    .filter((f) => f.claim)
    .slice(0, 3)
    .map((f) => {
      const words = String(f.claim).replace(/\s+/g, ' ').split(' ');
      return words.slice(0, 8).join(' ').replace(/[.,;:]$/, '');
    });
  return items.length >= 2 ? items : ['Check the numbers, not the headlines', 'Compare against last week', 'Track the source dates'];
}

/** Narration for the hook: one short sentence that lands the idea in ~1.5s. */
function hookNarration(bundle) {
  const f = factMap(bundle);
  if (f.hashprice_now && f.hashprice_earlier) return 'Record hashrate. Falling paychecks.';
  if (f.breakeven_power) return 'Cheap power decides who survives.';
  return 'Here is what the data says.';
}

function speakNumber(v, { unit = '', decimals = 0 } = {}) {
  // TTS-friendly rendering of a value (no symbols it would mispronounce)
  const rounded = Number(v.toFixed(decimals));
  return `${rounded}${unit ? ' ' + unit : ''}`;
}

/**
 * Compile an evidence bundle into a validated VideoIR using the rule-based planner.
 */
export function planVideo(bundle, opts = {}) {
  const {
    id = `video-${bundle.id}`,
    palette = 'midnight',
    brand = 'GENERAL MINING OS',
    format = { width: 1080, height: 1920, fps: 30 },
    tone = 'data-news',
  } = opts;

  const facts = factMap(bundle);
  const series = primarySeries(bundle);
  const scenes = [];
  let n = 1;

  // 1. HOOK ---------------------------------------------------------------
  const h = hookFrom(bundle);
  const hookNarr = 'Record hashrate. Falling paychecks.';
  scenes.push({
    id: `s${n++}`, kind: 'hook', engine: 'native',
    duration: Math.max(2.6, words(hookNarr) / WPS + SCENE_PAD), instant: true,
    eyebrow: h.eyebrow, title: h.title, subtitle: h.subtitle,
    narration: hookNarr,
    sfx: [{ at: 0.05, kind: 'riser', level: 0.35 }],
  });

  // 2a. RANKING — a categorical series becomes bars, not a fake trend line.
  const shape = seriesShape(series);
  if (series && shape === 'categorical' && normalizePoints(series).length >= 2) {
    const pts = normalizePoints(series).sort((a, b) => b.value - a.value);
    const unit = series.unit || '';
    const cheapest = pts[pts.length - 1], dearest = pts[0];
    const narr = `On power cost, ${cheapest.label} comes in at ${cheapest.value} dollars per kilowatt hour, against ${dearest.value} for ${dearest.label}.`;
    scenes.push({
      id: `s${n++}`, kind: 'compare', engine: 'native',
      duration: Math.max(3.6, words(narr) / WPS + SCENE_PAD + 0.4),
      title: `${series.label}${unit ? ` (${unit})` : ''}`,
      // Cheaper power is the desirable end of this ranking, so the LAST value is
      // the "good" bar. Slice first, then flag, or the flag lands on the wrong bar.
      items: (() => {
        const shown = pts.slice(0, 4);
        const costRanking = /cost|price/i.test(series.label || '');
        return shown.map((p, i) => ({
          label: p.label,
          value: p.value,
          rank: i,
          good: costRanking ? i === shown.length - 1 : i === 0,
        }));
      })(),
      prefix: '$', decimals: 3,
      source: sourceLine(series.source), narration: narr,
      sfx: [{ at: 0.2, kind: 'whoosh', level: 0.4 }],
    });
  }

  // 2b. CHART — the trend -----------------------------------------------
  if (series && shape === 'timeline' && normalizePoints(series).length >= 3) {
    // Describe the SHAPE, not just endpoints: a dip-then-rebound must not be
    // narrated as a straight climb (that is how agent videos fabricate trends).
    const pts = normalizePoints(series);
    const first = pts[0].value;
    const last = pts[pts.length - 1].value;
    const minIdx = pts.reduce((bi, p, i) => (p.value < pts[bi].value ? i : bi), 0);
    const maxIdx = pts.reduce((bi, p, i) => (p.value > pts[bi].value ? i : bi), 0);
    const monotonic = pts.every((p, i) => i === 0 || p.value >= pts[i - 1].value) ||
                      pts.every((p, i) => i === 0 || p.value <= pts[i - 1].value);
    let narr;
    if (monotonic) {
      narr = `${series.unit === 'EH/s' ? 'Hashrate' : 'It'} ${last >= first ? 'climbed' : 'fell'} from ${Math.round(first)} to ${Math.round(last)} ${series.unit}.`;
    } else if (minIdx > 0 && minIdx < pts.length - 1) {
      narr = `It fell to ${Math.round(pts[minIdx].value)} ${series.unit}, then rebounded to ${Math.round(last)}.`;
    } else if (maxIdx === 0) {
      narr = `It slid from ${Math.round(first)} to ${Math.round(last)} ${series.unit}.`;
    } else {
      narr = `It swung between ${Math.round(Math.min(...pts.map(p=>p.value)))} and ${Math.round(Math.max(...pts.map(p=>p.value)))} ${series.unit}, ending at ${Math.round(last)}.`;
    }
    scenes.push({
      id: `s${n++}`, kind: 'chart', engine: 'native',
      duration: Math.max(3.6, words(narr) / WPS + SCENE_PAD + 0.5),
      title: series.label, series: pts, suffix: ` ${series.unit}`,
      source: sourceLine(series.source), narration: narr,
      sfx: [{ at: 0.2, kind: 'whoosh', level: 0.4 }],
    });
  }

  // 3. COMPARE — the money ----------------------------------------------
  if (facts.hashprice_now && facts.hashprice_earlier) {
    const shortDate = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return Number.isNaN(+d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    };
    const pair = [
      { label: shortDate(facts.hashprice_earlier.source.date), value: facts.hashprice_earlier.value, suffix: '' },
      { label: shortDate(facts.hashprice_now.source.date), value: facts.hashprice_now.value, suffix: '' },
    ];
    const pct = ((facts.hashprice_now.value - facts.hashprice_earlier.value) / facts.hashprice_earlier.value) * 100;
    const narr = `Hashprice fell from ${facts.hashprice_earlier.value} to ${facts.hashprice_now.value} dollars per petahash per day.`;
    scenes.push({
      id: `s${n++}`, kind: 'compare', engine: 'native',
      duration: Math.max(3.4, words(narr) / WPS + SCENE_PAD + 0.4),
      title: `Hashprice, USD per PH/s per day (${pct.toFixed(1)}%)`,
      items: pair, prefix: '$', decimals: 2,
      source: sourceLine(facts.hashprice_now.source), narration: narr,
    });
  }

  // 4. STAT — the headline number ---------------------------------------
  // Prefer the difficulty estimate when it exists, otherwise promote the most
  // quotable fact. A stat scene with a made-up number is worse than no scene.
  if (facts.difficulty_next) {
    const v = facts.difficulty_next.value;
    const narr = `The next difficulty adjustment is tracking plus ${v} percent.`;
    scenes.push({
      id: `s${n++}`, kind: 'stat', engine: 'native',
      duration: Math.max(3.0, words(narr) / WPS + SCENE_PAD + 0.2),
      value: v, prefix: '+', suffix: '%', decimals: 2, label: 'Estimated next difficulty change',
      delta: '~27 Nov 2026', source: sourceLine(facts.difficulty_next.source),
      narration: narr,
      sfx: [{ at: 0.15, kind: 'pop', level: 0.5 }],
    });
  } else {
    // Promote the most quotable fact, but render it in its OWN unit. A 0.42 share
    // is "42 percent", not "0.42 dollars", and a 24-word claim is not narration.
    const money = (bundle.facts || []).find((f) => Number.isFinite(f.value) && /usd|\$/i.test(f.unit || ''));
    const share = (bundle.facts || []).find((f) => Number.isFinite(f.value) && /share|%|percent/i.test(f.unit || ''));
    const cand = money && money.value < 1 ? money : share || money;
    if (cand) {
      const isShare = /share|%|percent/i.test(cand.unit || '');
      const isMoney = /usd|\$/i.test(cand.unit || '');
      const v = cand.value;
      const decimals = isShare ? 0 : (v < 0.1 ? 3 : (v < 10 ? 2 : 0));
      const shown = isShare ? v * 100 : v;
      const label = isShare
        ? 'Share of miners running demand response'
        : isMoney
          ? 'Cost per kilowatt hour'
          : (cand.unit || 'From the evidence').replace(/^\w+ of\s*/i, '').slice(0, 40);
      const narr = isShare
        ? `About ${shown.toFixed(0)} percent of surveyed miners now run demand response.`
        : isMoney
          ? `That is ${v < 0.1 ? (v * 100).toFixed(1) + ' cents' : '$' + v.toFixed(2)} per kilowatt hour.`
          : cand.claim.split('.')[0].slice(0, 90) + '.';
      scenes.push({
        id: `s${n++}`, kind: 'stat', engine: 'native',
        duration: Math.max(3.0, Math.min(6.4, words(narr) / WPS + SCENE_PAD + 0.2)),
        value: shown, prefix: isMoney ? '$' : '', suffix: isShare ? '%' : '', decimals,
        label, source: sourceLine(cand.source), narration: narr,
        sfx: [{ at: 0.15, kind: 'pop', level: 0.5 }],
      });
    }
  }

  // 5. LIST — what a miner can actually do -------------------------------
  const listItems = listFrom(bundle, facts);
  // The voice must read the items that are actually on screen. Hardcoding this
  // sentence made the audio contradict the video as soon as the topic changed.
  const listNarr = listItems.map((t) => t.replace(/\.$/, '')).join('. ') + '.';
  const listTitle = /energy/i.test(bundle.topic || '') ? 'What this means for a site' : 'What this means for a miner';
  scenes.push({
    id: `s${n++}`, kind: 'list', engine: 'native',
    duration: Math.max(4.0, words(listNarr) / WPS + SCENE_PAD + 0.4),
    title: listTitle, items: listItems, narration: listNarr,
  });

  // 6. QUOTE — the takeaway ---------------------------------------------
  const q = 'The network got stronger. The paycheck got smaller.';
  if (facts.margin_low) {
    scenes.push({
      id: `s${n++}`, kind: 'quote', engine: 'native',
      duration: Math.max(3.0, words(q) / WPS + SCENE_PAD),
      text: q, attribution: 'General Mining OS',
      narration: q,
    });
  }

  // 7. OUTRO -------------------------------------------------------------
  const outroNarr = 'Subscribe for weekly mining data.';
  scenes.push({
    id: `s${n++}`, kind: 'outro', engine: 'native',
    duration: Math.max(2.6, words(outroNarr) / WPS + SCENE_PAD),
    title: 'Follow for weekly mining data',
    subtitle: 'New episode every Monday',
    cta: 'Subscribe',
    narration: outroNarr,
    sfx: [{ at: 0.3, kind: 'hit', level: 0.4 }],
  });

  scenes.forEach((s, i) => { s.index = i + 1; });

  // Thumbnail brief: 3-5 words and ONE number. A thumbnail is a different medium
  // from the hook sentence, so the copy is derived here and shows up in the
  // storyboard for review instead of being invented at render time.
  const priceStat = facts.hashprice_now?.value;
  const hpSeries = (bundle.series || []).find((s) => /hashprice|ph/i.test(s.label || s.id || ''));
  const hpNow = hpSeries?.points?.at(-1)?.y;
  let stat = null, statLabel = null;
  if (Number.isFinite(priceStat)) { stat = '$' + priceStat; statLabel = 'per PH/s per day'; }
  else if (Number.isFinite(hpNow)) { stat = '$' + hpNow.toFixed(2); statLabel = 'per PH/s per day'; }
  else { const s2 = scenes.find((x) => x.kind === 'stat'); if (s2?.value != null) { stat = String(s2.value) + (s2.suffix || ''); statLabel = s2.label || ''; } }
  const thumb = {
    kicker: 'MINING WEEK',
    headline: priceStat && facts.hashprice_earlier
      ? `Pay cut ${(((priceStat - facts.hashprice_earlier.value) / facts.hashprice_earlier.value) * 100).toFixed(0)}%`
      : 'Miners feel the squeeze',
    stat,
    statLabel,
  };

  const ir = newIR({
    id, title: h.title, format, palette, scenes,
    meta: {
      brand, evidenceBundle: bundle.id, asOf: bundle.asOf,
      sources: bundle.sources, tone, planner: 'rule-based/v1', thumb,
    },
    audio: { bpm: 92, energy: 0.5, mood: 'minor', root: 110 },
  });
  validateIR(ir);
  return ir;
}

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Compile a model/agent-authored outline into a validated IR.
 * The outline may choose wording and scene order, but every numeric field must
 * reference an evidence fact id — anything else is rejected.
 */
export function outlineToIR(outline, bundle, opts = {}) {
  const {
    id = `video-${bundle.id}`, palette = 'midnight', brand = 'GENERAL MINING OS',
    format = { width: 1080, height: 1920, fps: 30 },
  } = opts;
  const facts = factMap(bundle);
  const problems = [];
  if (!Array.isArray(outline?.scenes) || !outline.scenes.length) {
    throw new Error('outline.scenes missing');
  }
  const scenes = outline.scenes.map((s, i) => {
    const out = { ...s, id: s.id || `s${i + 1}`, engine: 'native', index: i + 1 };
    if (s.factId) {
      const f = facts[s.factId];
      if (!f) problems.push(`scene ${out.id} references unknown fact "${s.factId}"`);
      else {
        if (s.kind === 'stat' || s.kind === 'chart' || s.kind === 'compare') {
          out.value = out.value ?? f.value;
          out.source = sourceLine(f.source);
        }
        out.narration = out.narration || f.claim;
      }
    }
    if (s.seriesId) {
      const se = (bundle.series || []).find((x) => x.id === s.seriesId);
      if (!se) problems.push(`scene ${out.id} references unknown series "${s.seriesId}"`);
      else { out.series = se.points; out.suffix = ` ${se.unit}`; out.source = sourceLine(se.source); out.title = out.title || se.label; }
    }
    return out;
  });
  if (problems.length) throw new Error('outline rejected:\n  - ' + problems.join('\n  - '));
  const ir = newIR({
    id, title: outline.title, format, palette, scenes,
    meta: { brand, evidenceBundle: bundle.id, asOf: bundle.asOf, sources: bundle.sources, planner: outline.model || 'llm-outline' },
    audio: outline.audio || { bpm: 92, energy: 0.5, mood: 'minor', root: 110 },
  });
  validateIR(ir);
  return ir;
}

/** Human-readable storyboard sheet (what the agent/human reviews before render). */
export function storyboard(ir) {
  const lines = [`STORYBOARD  ${ir.id} — ${ir.title}`, `${ir.format.width}x${ir.format.height} @${ir.format.fps}fps · ${totalDuration(ir).toFixed(1)}s`, ''];
  ir.scenes.forEach((s, i) => {
    lines.push(`${String(i + 1).padStart(2, '0')} [${s.kind.padEnd(7)}] ${s.duration.toFixed(1)}s  ${s.title || s.text || s.label || ''}`);
    if (s.narration) lines.push(`     VO: ${s.narration}`);
    if (s.source) lines.push(`     src: ${s.source}`);
  });
  return lines.join('\n');
}
