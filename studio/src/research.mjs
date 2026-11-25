// Evidence store: every number that appears in a video must trace to a source.
//
// Research finding: the single most common failure in agent-made "news" videos is
// a fabricated or mis-quoted number. So the IR is only allowed to consume facts
// from here, and every scene carrying a figure also carries its source string,
// which the renderer prints on screen.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './env.mjs';

export const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export class EvidenceError extends Error {}

const nowIso = () => new Date().toISOString();

/** Create/append an evidence bundle. */
export function createBundle({ id, topic, asOf, facts = [], series = [], notes = [], sources = [] }) {
  return {
    id, topic, asOf: asOf || nowIso().slice(0, 10),
    createdAt: nowIso(),
    facts, series, notes, sources,
  };
}

export function saveBundle(bundle) {
  const file = path.join(EVIDENCE_DIR, `${bundle.id}.json`);
  fs.writeFileSync(file, JSON.stringify(bundle, null, 2));
  return file;
}

export function loadBundle(idOrPath) {
  const file = fs.existsSync(idOrPath) ? idOrPath : path.join(EVIDENCE_DIR, `${idOrPath}.json`);
  if (!fs.existsSync(file)) throw new EvidenceError(`evidence bundle not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Validate that an evidence bundle is publishable:
 *  - every fact has a claim, a source with url+name, and a date
 *  - no fact is older than maxAgeDays relative to asOf (stale numbers are a trap)
 *  - series have >= 2 points and consistent units
 */
export function validateBundle(b, { maxAgeDays = 45 } = {}) {
  const problems = [];
  const warnings = [];
  if (!b || !b.id) problems.push('bundle.id missing');
  if (!b.topic) problems.push('bundle.topic missing');
  if (!Array.isArray(b.facts) || b.facts.length === 0) problems.push('bundle.facts empty');
  const asOf = new Date(b.asOf || Date.now());
  (b.facts || []).forEach((f, i) => {
    const at = `facts[${i}]`;
    if (!f.claim) problems.push(`${at}.claim missing`);
    if (!f.source || !f.source.url) problems.push(`${at}.source.url missing (unverifiable claim)`);
    if (!f.source?.name) problems.push(`${at}.source.name missing`);
    if (!f.source?.date) warnings.push(`${at}.source.date missing (cannot check staleness)`);
    else {
      const age = (asOf - new Date(f.source.date)) / 86400000;
      if (age > maxAgeDays) warnings.push(`${at} is ${Math.round(age)} days old (>${maxAgeDays}); do not present as "now"`);
    }
    if (f.value !== undefined && typeof f.value !== 'number') problems.push(`${at}.value must be a number`);
  });
  (b.series || []).forEach((s, i) => {
    const at = `series[${i}]`;
    if (!Array.isArray(s.points) || s.points.length < 2) problems.push(`${at}.points needs >= 2`);
    if (!s.unit) problems.push(`${at}.unit missing`);
    if (!s.source || !s.source.url) problems.push(`${at}.source.url missing`);
  });
  return { ok: problems.length === 0, problems, warnings };
}

/** Facts keyed by id for storyboarding. */
export function factMap(b) {
  return Object.fromEntries((b.facts || []).map((f) => [f.id, f]));
}

/** A short, human-readable provenance line for on-screen display. */
export function sourceLine(src, { max = 30 } = {}) {
  if (!src) return '';
  let name = String(src.name || 'unnamed');
  // "Hashrate Index via Cointribune" -> "Hashrate Index" (the originating source)
  name = name.split(/\s+via\s+/i)[0].split(' / ')[0].trim();
  const s = `${name}${src.date ? ', ' + src.date : ''}`;
  if (s.length <= max) return s;
  return `${name.slice(0, Math.max(6, max - 12)).trim()}, ${src.date || ''}`.replace(/, $/, '');
}
