// Capability router + adapter registry.
//
// Research basis:
//  - OpenMontage: tools declare capability/provider/cost, a scored selector picks
//    one, runtime swaps are logged and never silent, escalation is explicit.
//  - HyperFrames: prefer the engine whose output can be *checked*.
//  - kalem: route per scene, not per film.
//
// An adapter declares what it can do and what it needs. The router only picks
// adapters whose `available()` is true, prefers the cheapest that satisfies the
// scene, and records why. If nothing is available it fails loudly with the list
// of what was missing — it never quietly falls back to a half-capability.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './env.mjs';

export const RUNLOG = path.join(DATA_DIR, 'runs.jsonl');

/** @typedef {{id:string,name:string,capabilities:string[],cost:number,quality:number,deterministic:boolean,licence:string,available:()=>Promise<boolean>|boolean,needs:string[],notes?:string}} Adapter */

const registry = new Map();

export function registerAdapter(a) {
  for (const k of ['id', 'name', 'capabilities', 'available']) {
    if (!(k in a)) throw new Error(`adapter missing ${k}`);
  }
  registry.set(a.id, {
    cost: 0.5, quality: 0.5, deterministic: true, licence: 'unknown', needs: [],
    ...a,
  });
  return a.id;
}

export const listAdapters = () => [...registry.values()];

export async function probeAdapters({ log = () => {} } = {}) {
  const rows = [];
  for (const a of registry.values()) {
    let ok = false, err = null;
    try { ok = await a.available(); } catch (e) { err = String(e.message || e); }
    rows.push({ id: a.id, available: ok, error: err, capabilities: a.capabilities, cost: a.cost, quality: a.quality, needs: a.needs });
    log(`  ${ok ? 'OK  ' : 'MISS'} ${a.id.padEnd(18)} ${a.capabilities.join(',')}${err ? ' — ' + err : ''}`);
  }
  return rows;
}

/**
 * Pick an adapter for one capability.
 * score = quality*2 - cost, with hard filters for availability and determinism.
 */
export async function select(capability, { requireDeterministic = false, prefer = null, exclude = [] } = {}) {
  const candidates = [];
  for (const a of registry.values()) {
    if (exclude.includes(a.id)) continue;
    if (!a.capabilities.includes(capability)) continue;
    if (requireDeterministic && !a.deterministic) continue;
    let ok = false;
    try { ok = await a.available(); } catch { ok = false; }
    if (!ok) { candidates.push({ adapter: a, available: false }); continue; }
    candidates.push({ adapter: a, available: true, score: a.quality * 2 - a.cost + (a.id === prefer ? 0.5 : 0) });
  }
  const usable = candidates.filter((c) => c.available).sort((x, y) => y.score - x.score);
  const decision = {
    capability,
    at: new Date().toISOString(),
    chosen: usable[0]?.adapter.id || null,
    considered: candidates.map((c) => ({ id: c.adapter.id, available: c.available, score: c.score ?? null })),
    reason: usable.length
      ? `highest score among ${usable.length} available (quality*2-cost)`
      : `NO ADAPTER AVAILABLE for "${capability}" — needs: ${[...new Set(candidates.flatMap((c) => c.adapter.needs))].join(', ') || 'unknown'}`,
  };
  if (!decision.chosen) {
    const err = new Error(decision.reason);
    err.code = 'NO_CAPABILITY';
    err.decision = decision;
    throw err;
  }
  return { adapter: usable[0].adapter, decision };
}

/**
 * Route a whole IR: each scene kind is a requirement, plus global capabilities
 * (render, audio, captions, eval). Returns a routing plan and logs it.
 */
export async function routeIR(ir, { log = () => {} } = {}) {
  const plan = { videoId: ir.id, at: new Date().toISOString(), scenes: [], globals: [], swaps: [] };
  const sceneReqs = {
    hook: ['scene:text', 'scene:brand'],
    stat: ['scene:number', 'scene:brand'],
    chart: ['scene:chart', 'scene:brand'],
    compare: ['scene:bars', 'scene:brand'],
    list: ['scene:list', 'scene:brand'],
    quote: ['scene:typography', 'scene:brand'],
    title: ['scene:typography', 'scene:brand'],
    outro: ['scene:typography', 'scene:brand'],
  };
  for (const s of ir.scenes) {
    const reqs = sceneReqs[s.kind] || ['scene:typography'];
    const picked = [];
    for (const cap of reqs) {
      try {
        const { adapter, decision } = await select(cap, { requireDeterministic: true, prefer: s.engineAdapter });
        picked.push({ capability: cap, adapter: adapter.id, decision });
      } catch (e) {
        if (e.code === 'NO_CAPABILITY') {
          // escalation: record it, then try the generic fallback capability
          plan.swaps.push({ scene: s.id, capability: cap, problem: e.message });
          log(`  ! ${s.id}: ${cap} unavailable — ${e.message}`);
        } else throw e;
      }
    }
    plan.scenes.push({ scene: s.id, kind: s.kind, adapters: picked });
    // annotate the scene so renderers can honour the choice
    s.engineAdapter = picked[0]?.adapter || null;
  }
  for (const cap of ['render:video', 'audio:music', 'audio:voice', 'audio:sfx', 'captions:srt', 'eval:video', 'thumb:generate']) {
    try {
      const { adapter, decision } = await select(cap);
      plan.globals.push({ capability: cap, adapter: adapter.id, decision });
    } catch (e) {
      plan.globals.push({ capability: cap, missing: true, problem: e.message });
      log(`  ! ${cap}: ${e.message}`);
    }
  }
  logRun({ type: 'route', ...plan });
  return plan;
}

export function logRun(record) {
  fs.mkdirSync(path.dirname(RUNLOG), { recursive: true });
  fs.appendFileSync(RUNLOG, JSON.stringify(record) + '\n');
}

export function readRuns() {
  if (!fs.existsSync(RUNLOG)) return [];
  return fs.readFileSync(RUNLOG, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

/** Aggregate what has been proven to work, so workflows can be reused. */
export function provenConfigurations() {
  const runs = readRuns().filter((r) => r.type === 'pipeline' && r.ok);
  const byKey = new Map();
  for (const r of runs) {
    const key = `${r.ir?.format?.width}x${r.ir?.format?.height}@${r.ir?.format?.fps}|${r.adapters?.render}|${r.adapters?.audio}`;
    const cur = byKey.get(key) || { key, runs: 0, best: null, totalSeconds: 0, avgScore: 0, scores: 0 };
    cur.runs++;
    cur.totalSeconds += r.durationSec || 0;
    if (r.eval?.score != null) { cur.avgScore += r.eval.score; cur.scores++; }
    if (!cur.best || (r.eval?.score ?? 0) > (cur.best.eval?.score ?? 0)) cur.best = r;
    byKey.set(key, cur);
  }
  return [...byKey.values()].map((c) => ({ ...c, avgScore: c.scores ? c.avgScore / c.scores : null }));
}
