#!/usr/bin/env node
/**
 * kb.mjs — the research ledger CLI.
 *
 * One append-only JSON ledger is the single source of truth for every reference,
 * project, paper and technique the research programme touches. The whole point is
 * the *status ladder*, because "I found a repo" and "I made it render frames here"
 * are wildly different claims and must never be blurred:
 *
 *   discovered -> inspected -> tested -> integrated
 *                    \-> rejected (with a reason)
 *
 * Usage:
 *   node research/tools/kb.mjs stats
 *   node research/tools/kb.mjs list [--status tested] [--kind project]
 *   node research/tools/kb.mjs show <id>
 *   node research/tools/kb.mjs search <term...>
 *   node research/tools/kb.mjs add --id x --name "X" --url ... --kind project --status discovered
 *   node research/tools/kb.mjs status <id> <newstatus> --evidence "what was actually run"
 *   node research/tools/kb.mjs note <id> --finding "technique extracted"
 *   node research/tools/kb.mjs intake <slug> --name "Reference name"  (scaffolds a checklist doc)
 *   node research/tools/kb.mjs report   (regenerates research/RESEARCH_LOG.md)
 *   node research/tools/kb.mjs validate
 *
 * Rules enforced by code, not by good intentions:
 *   - a record cannot reach `tested` without evidence, nor `integrated` without
 *     both evidence and an artifact path that exists on disk
 *   - `rejected` requires a reason
 *   - every status change is appended to a history array, never overwritten
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LEDGER = path.join(ROOT, 'research', 'ledger.json');
const LOG = path.join(ROOT, 'research', 'RESEARCH_LOG.md');

const LADDER = ['discovered', 'inspected', 'tested', 'integrated'];
const ALL_STATUS = [...LADDER, 'rejected'];
const KINDS = ['project', 'skill-kit', 'engine', 'technique', 'paper', 'doc', 'demo', 'asset'];

// ---------------------------------------------------------------- utilities
const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

function flag(name, dflt = undefined) {
  const i = rest.indexOf('--' + name);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : dflt;
}
function flags(name) {
  const out = [];
  rest.forEach((a, i) => {
    if (a === '--' + name && rest[i + 1] && !rest[i + 1].startsWith('--')) out.push(rest[i + 1]);
  });
  return out;
}
function positional() {
  return rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
}
function load() {
  if (!fs.existsSync(LEDGER)) return { version: 1, updated: null, records: [] };
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}
function save(db) {
  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(LEDGER, JSON.stringify(db, null, 2) + '\n');
}
function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- commands
function cmdAdd() {
  const id = flag('id');
  if (!id) die('add needs --id');
  const db = load();
  if (db.records.some((r) => r.id === id)) die(`record "${id}" already exists (use status/note to update it)`);
  const kind = flag('kind', 'project');
  if (!KINDS.includes(kind)) die(`--kind must be one of ${KINDS.join(', ')}`);
  const status = flag('status', 'discovered');
  if (!ALL_STATUS.includes(status)) die(`--status must be one of ${ALL_STATUS.join(', ')}`);
  const rec = {
    id,
    kind,
    name: flag('name', id),
    url: flag('url', null),
    license: flag('license', null),
    status,
    env_ok: flag('env', null) === 'true' ? true : flag('env', null) === 'false' ? false : null,
    deps: flags('dep'),
    tags: flags('tag'),
    findings: flags('finding'),
    evidence: flags('evidence'),
    artifacts: flags('artifact'),
    reason: flag('reason', null),
    first_seen: today(),
    history: [{ date: today(), status, note: 'created' }],
  };
  if (status === 'rejected' && !rec.reason) die('a `rejected` record needs --reason');
  db.records.push(rec);
  save(db);
  console.log(`+ ${id}  [${kind}] ${status}`);
}

function promoteGate(rec, next) {
  if (next === 'tested' && rec.evidence.length === 0) {
    die('cannot mark `tested` without --evidence describing what was actually run');
  }
  if (next === 'integrated') {
    if (rec.evidence.length === 0) die('cannot mark `integrated` without --evidence');
    if (rec.artifacts.length === 0) die('cannot mark `integrated` without --artifact (a file in this repo)');
    for (const a of rec.artifacts) {
      if (!fs.existsSync(path.join(ROOT, a))) die(`artifact not found on disk: ${a}`);
    }
  }
  if (next === 'rejected' && !rec.reason) die('cannot mark `rejected` without --reason');
}

function cmdStatus() {
  const [id, next] = positional();
  if (!id || !next) die('status needs <id> <newstatus>');
  if (!ALL_STATUS.includes(next)) die(`status must be one of ${ALL_STATUS.join(', ')}`);
  const db = load();
  const rec = db.records.find((r) => r.id === id);
  if (!rec) die(`no record "${id}"`);
  const ev = flag('evidence');
  if (ev) rec.evidence.push(ev);
  for (const f of flags('finding')) rec.findings.push(f);
  for (const a of flags('artifact')) rec.artifacts.push(a);
  if (flag('reason')) rec.reason = flag('reason');
  if (flag('env')) rec.env_ok = flag('env') === 'true';
  promoteGate(rec, next);
  rec.status = next;
  rec.history.push({ date: today(), status: next, note: flag('note', ev || '') });
  save(db);
  console.log(`~ ${id} -> ${next}`);
}

function cmdNote() {
  const [id] = positional();
  const db = load();
  const rec = db.records.find((r) => r.id === id);
  if (!rec) die(`no record "${id}"`);
  const fs_ = flags('finding');
  if (fs_.length === 0) die('note needs at least one --finding');
  rec.findings.push(...fs_);
  save(db);
  console.log(`~ ${id} +${fs_.length} finding(s)`);
}

function cmdList() {
  const db = load();
  const st = flag('status');
  const kd = flag('kind');
  let rows = db.records;
  if (st) rows = rows.filter((r) => r.status === st);
  if (kd) rows = rows.filter((r) => r.kind === kd);
  const w = Math.max(...rows.map((r) => r.id.length), 4);
  for (const r of rows.sort((a, b) => LADDER.indexOf(a.status) - LADDER.indexOf(b.status) || a.id.localeCompare(b.id))) {
    const env = r.env_ok === true ? 'yes' : r.env_ok === false ? 'NO ' : ' - ';
    console.log(`${r.status.padEnd(10)} ${r.id.padEnd(w)}  ${r.kind.padEnd(9)} env:${env}  ${r.name}`);
  }
  if (!rows.length) console.log('(no records)');
}

function cmdShow() {
  const [id] = positional();
  const db = load();
  const r = db.records.find((x) => x.id === id);
  if (!r) die(`no record "${id}"`);
  console.log(JSON.stringify(r, null, 2));
}

function cmdSearch() {
  const terms = positional().map((t) => t.toLowerCase());
  if (!terms.length) die('search needs at least one term');
  const db = load();
  const hits = db.records.filter((r) => {
    const hay = JSON.stringify(r).toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const w = Math.max(...hits.map((r) => r.id.length), 4);
  for (const r of hits) {
    const why = [];
    for (const t of terms) {
      if (r.findings.some((f) => f.toLowerCase().includes(t))) why.push('finding');
      if ((r.name + ' ' + (r.url || '')).toLowerCase().includes(t)) why.push('name');
      if (r.tags.some((g) => g.toLowerCase().includes(t))) why.push('tag');
    }
    console.log(`${r.status.padEnd(10)} ${r.id.padEnd(w)}  [${[...new Set(why)].join(',')}]  ${r.name}`);
  }
  if (!hits.length) console.log('(no matches)');
}

function cmdStats() {
  const db = load();
  const by = Object.fromEntries(ALL_STATUS.map((s) => [s, 0]));
  const kinds = {};
  for (const r of db.records) {
    by[r.status] = (by[r.status] || 0) + 1;
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  }
  console.log(`records: ${db.records.length}   updated: ${db.updated}`);
  console.log('--- status ladder ---');
  for (const s of ALL_STATUS) console.log(`  ${s.padEnd(11)} ${by[s] || 0}`);
  console.log('--- kinds ---');
  for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(11)} ${v}`);
  console.log(`evidence-backed (tested+integrated): ${by.tested + by.integrated}`);
}

function cmdValidate() {
  const db = load();
  const ids = new Set();
  let bad = 0;
  for (const r of db.records) {
    if (ids.has(r.id)) { console.error(`dup id: ${r.id}`); bad++; }
    ids.add(r.id);
    if (!ALL_STATUS.includes(r.status)) { console.error(`${r.id}: bad status ${r.status}`); bad++; }
    if (!KINDS.includes(r.kind)) { console.error(`${r.id}: bad kind ${r.kind}`); bad++; }
    if ((r.status === 'tested' || r.status === 'integrated') && r.evidence.length === 0) {
      console.error(`${r.id}: ${r.status} with no evidence`); bad++;
    }
    if (r.status === 'integrated') {
      if (r.artifacts.length === 0) { console.error(`${r.id}: integrated with no artifact`); bad++; }
      for (const a of r.artifacts) if (!fs.existsSync(path.join(ROOT, a))) { console.error(`${r.id}: missing artifact ${a}`); bad++; }
    }
    if (r.status === 'rejected' && !r.reason) { console.error(`${r.id}: rejected with no reason`); bad++; }
  }
  console.log(bad ? `✗ ${bad} problem(s)` : `✓ ${db.records.length} records valid`);
  process.exit(bad ? 1 : 0);
}

function cmdReport() {
  const db = load();
  const by = Object.fromEntries(ALL_STATUS.map((s) => [s, []]));
  for (const r of db.records) by[r.status].push(r);
  const line = (r) => {
    const env = r.env_ok === true ? '✔ runs here' : r.env_ok === false ? '✘ cannot run here' : '· untested';
    const lic = r.license || 'licence unknown';
    return `| \`${r.id}\` | ${r.name} | ${lic} | ${env} | ${(r.url || '').replace(/\|/g, '\\|')} |`;
  };
  let md = `# Research ledger — generated report\n\n`;
  md += `Generated ${today()} from \`research/ledger.json\`. **Do not hand-edit** — run ` + '`node research/tools/kb.mjs report`' + `.\n\n`;
  md += `## Scoreboard\n\n| stage | count | meaning |\n|---|---:|---|\n`;
  const meaning = {
    discovered: 'a URL or mention exists; nothing opened',
    inspected: 'source, docs or renders actually read/looked at',
    tested: 'executed in this environment, with evidence recorded',
    integrated: 'code/technique landed in our engine, artifact on disk',
    rejected: 'deliberately not used, reason recorded',
  };
  for (const s of ALL_STATUS) md += `| ${s} | **${by[s].length}** | ${meaning[s]} |\n`;
  md += `\n`;
  for (const s of [...LADDER].reverse().concat(['rejected'])) {
    if (!by[s].length) continue;
    md += `## ${s} (${by[s].length})\n\n| id | name | licence | environment | source |\n|---|---|---|---|---|\n`;
    md += by[s].map(line).join('\n') + '\n\n';
  }
  md += `## Findings by record\n\n`;
  for (const r of db.records.filter((x) => x.findings.length || x.evidence.length)) {
    md += `### \`${r.id}\` — ${r.name}\n\n`;
    if (r.evidence.length) md += `**Evidence**:\n${r.evidence.map((e) => `- ${e}`).join('\n')}\n\n`;
    if (r.findings.length) md += `**Extracted**:\n${r.findings.map((f) => `- ${f}`).join('\n')}\n\n`;
    if (r.reason) md += `**Why rejected**: ${r.reason}\n\n`;
  }
  fs.writeFileSync(LOG, md);
  console.log(`wrote ${path.relative(ROOT, LOG)} (${db.records.length} records)`);
}

function cmdIntake() {
  const [slug] = positional();
  if (!slug) die('intake needs a <slug>');
  const name = flag('name', slug);
  const dir = path.join(ROOT, 'research', 'references');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.md`);
  if (fs.existsSync(file)) die(`${file} exists`);
  const body = `# Reference intake — ${name}

Reference received: ${today()}
Status: **discovered** (fill this in as you go; promote in the ledger, don't upgrade the claim here)

## 0. What is it, in one line

## 1. Analyse it carefully
- What exactly was supplied (files, links, screenshots, video)?
- What was **actually looked at** vs assumed? (see research/INSPECTION_CAPABILITIES.md)

## 2. Techniques and architecture
- Rendering approach:
- Animation/timing model:
- Character/prop system:
- Typography/caption system:
- Lighting/colour:
- Audio:
- What makes it look expensive vs cheap:

## 3. Original project + similar implementations (GitHub search)
Search terms used:
\`\`\`
(site:github.com queries, one per line)
\`\`\`
| repo | stars | licence | last commit | looks relevant because |
|---|---:|---|---|---|
|  |  |  |  |  |

## 4. More advanced alternatives
| candidate | why it might be better | blocker here? |
|---|---|---|
|  |  |  |

## 5. Docs, papers, tutorials, demos
| source | type | what it adds |
|---|---|---|
|  |  |  |

## 6. Follow-on repos: dependencies and skills
| dependency | role | licence | installable here? |
|---|---|---|---|
|  |  |  |  |

## 7. Comparison verdict
- Best implementation for our goal:
- Why not the first one found:
- What we still lack:

## 8. What was tested (with real numbers)
| what | command | result |
|---|---|---|
|  |  |  |

## 9. Techniques extracted for our engine
1.
2.

## 10. Ledger updates
- ids added:
- ids promoted:
`;
  fs.writeFileSync(file, body);
  console.log(`+ ${path.relative(ROOT, file)}`);
}

function cmdCandidates() {
  const db = load();
  const rows = db.records.filter((r) => r.status === 'discovered' || r.status === 'inspected')
    .sort((a, b) => LADDER.indexOf(b.status) - LADDER.indexOf(a.status));
  if (!rows.length) return console.log('(nothing pending)');
  for (const r of rows) {
    console.log(`${r.status === 'inspected' ? '→ next: test  ' : '→ next: inspect'}  ${r.id.padEnd(22)} ${r.name}`);
  }
  const blocked = db.records.filter((r) => r.env_ok === false && r.status !== 'rejected');
  if (blocked.length) {
    console.log('\nenvironment-blocked (keep, revisit if the sandbox changes):');
    for (const r of blocked) console.log(`  ${r.id.padEnd(22)} ${r.reason || 'cannot run here'}`);
  }
}

switch (cmd) {
  case 'add': cmdAdd(); break;
  case 'status': cmdStatus(); break;
  case 'note': cmdNote(); break;
  case 'list': cmdList(); break;
  case 'show': cmdShow(); break;
  case 'search': cmdSearch(); break;
  case 'stats': cmdStats(); break;
  case 'validate': cmdValidate(); break;
  case 'report': cmdReport(); break;
  case 'intake': cmdIntake(); break;
  case 'candidates': cmdCandidates(); break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
}
