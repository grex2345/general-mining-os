// r16_audio.mjs — Round 16 narration conditioning.
//
// THE FIX FOR CHOPPY NARRATION
// ---------------------------
// R13/R15 built narration by slicing ONE take at whisper word boundaries and
// re-assembling it with per-emotion gain/tilt/compression per beat. Measured on the
// shipped files, adjacent sentences jumped in level by:
//     R13  mean 3.22 dB, max 7.17 dB
//     R15  mean 4.17 dB, max 8.13 dB   <- R15's "stronger direction" made it WORSE
// The ear hears those steps as punch-ins: "interrupted and choppy". There were no
// clicks (fadeEdges saw to that) -- the defect was LEVEL CONTINUITY, not splices.
//
// R16 removes the cause instead of masking it:
//   1. The whole 205-word / 1200-char script fits ONE generate_speech call, so the
//      performance is a single continuous take. ZERO splices, zero re-timing.
//   2. Conditioning is applied UNIFORMLY to the whole file (one highpass, one
//      compressor setting, one gain). No per-beat DSP => no level steps.
//   3. Pauses keep the take's own natural breath and room air; we never insert
//      digital silence between sentences.
//   4. Whisper is used READ-ONLY for captions and visual cue times. It never cuts audio.
//
// Run: node studio/experiments/r16_audio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { whisperWords } from '../src/audiopipe.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const R = path.join(ROOT, 'research/artifacts/round16');
const FF = path.join(ROOT, 'studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
const FP = path.join(ROOT, 'studio/node_modules/@ffprobe-installer/linux-x64/ffprobe');
const SR = 48000;

const ff = (args) => execFileSync(FF, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const dur = (f) => parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

// ---- read mono wav as float ----
function readWav(p) {
  const b = fs.readFileSync(p);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + sz);
    off += 8 + sz + (sz & 1);
  }
  const n = data.length / 2, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(data.byteOffset + i * 2) / 32768;
  return { x: out, sr: fmt.sr, ch: fmt.ch };
}
function writeWav(p, x, sr) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, x[i])); b.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
  fs.writeFileSync(p, b);
}

const script = fs.readFileSync(path.join(R, 'script.txt'), 'utf8').trim();
const take = path.join(R, 'narration-take.wav');
console.log(`take: ${dur(take).toFixed(3)}s`);

// ---- 1. find the true speech extent so we control lead-in / tail exactly ----
ff(['-i', take, '-ar', String(SR), '-ac', '1', '/tmp/r16take48.wav']);
const { x } = readWav('/tmp/r16take48.wav');
const win = Math.round(0.02 * SR);
const env = [];
for (let i = 0; i + win <= x.length; i += win) {
  let s = 0; for (let j = i; j < i + win; j++) s += x[j] * x[j];
  env.push(Math.sqrt(s / win));
}
const peak = Math.max(...env);
const thr = peak * 0.035;               // -29 dB below the loudest 20 ms frame
let a = 0; while (a < env.length && env[a] < thr) a++;
let b = env.length - 1; while (b > 0 && env[b] < thr) b--;
const speechStart = a * 0.02, speechEnd = (b + 1) * 0.02;
console.log(`speech extent: ${speechStart.toFixed(3)} -> ${speechEnd.toFixed(3)} (${(speechEnd - speechStart).toFixed(3)}s)`);

// Keep a deliberate 0.55 s lead-in and 1.05 s tail. Trim ONLY outer silence --
// never anything between words.
const LEAD = 0.55, TAIL = 1.05;
const s0 = Math.max(0, Math.round((speechStart - LEAD) * SR));
const s1 = Math.min(x.length, Math.round((speechEnd + TAIL) * SR));
const body = x.slice(s0, s1);
const headPad = Math.max(0, Math.round((LEAD - speechStart) * SR));
const trimmed = new Float32Array(headPad + body.length);
trimmed.set(body, headPad);
writeWav('/tmp/r16trim.wav', trimmed, SR);
console.log(`front pad: ${(headPad / SR).toFixed(3)}s -> speech begins at ${LEAD}s`);
console.log(`trimmed: ${(trimmed.length / SR).toFixed(3)}s  (lead ${LEAD}s, tail ${TAIL}s)`);

// ---- 2. UNIFORM conditioning. One setting for the entire performance. ----
// highpass 80: remove rumble.  acompressor: gentle 2:1 glue, slow enough to leave
// syllable transients intact.  loudnorm: single integrated target for the whole file.
ff(['-i', '/tmp/r16trim.wav',
  '-af', 'highpass=f=80,acompressor=threshold=-20dB:ratio=2:attack=12:release=180:makeup=1,loudnorm=I=-17:TP=-2.0:LRA=11:print_format=json',
  '-ar', String(SR), '-ac', '1', '/tmp/r16cond.wav']);
// loudnorm's first pass reports; run again linear using measured values for transparency
const pr = spawnSync(FF, ['-y', '-v', 'info', '-i', '/tmp/r16trim.wav',
  '-af', 'highpass=f=80,acompressor=threshold=-20dB:ratio=2:attack=12:release=180:makeup=1,loudnorm=I=-17:TP=-2.0:LRA=11:print_format=json',
  '-f', 'null', '-'], { encoding: 'buffer' });
const probe = (pr.stderr || Buffer.alloc(0)).toString();
const jm = probe.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
let condArgs;
if (jm) {
  const m = JSON.parse(jm[0]);
  condArgs = `highpass=f=80,acompressor=threshold=-20dB:ratio=2:attack=12:release=180:makeup=1,loudnorm=I=-17:TP=-2.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  console.log('loudnorm measured:', m.input_i, 'LUFS -> linear pass');
} else {
  condArgs = 'highpass=f=80,acompressor=threshold=-20dB:ratio=2:attack=12:release=180:makeup=1,loudnorm=I=-17:TP=-2.0:LRA=11';
}
ff(['-i', '/tmp/r16trim.wav', '-af', condArgs, '-ar', String(SR), '-ac', '1', path.join(R, 'narration.wav')]);
const narr = path.join(R, 'narration.wav');
const N = dur(narr);
console.log(`narration.wav: ${N.toFixed(3)}s`);

// ---- 3. READ-ONLY alignment: captions + visual cues. Never cuts the audio. ----
const asr = await whisperWords(narr, { lang: 'en', threads: 6, dtw: 'small' });
console.log(`whisper tokens: ${asr.length}`);

// Map the EXACT script words onto whisper times by dynamic programming on text
// similarity, so captions show the user's script verbatim (not ASR mishearings).
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, '');
const scriptWords = script.split(/\s+/).filter(Boolean);
const A = scriptWords.map(norm), Bw = asr.map((w) => norm(w.word));
const n = A.length, m = Bw.length;
const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
const P = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
for (let i = 0; i <= n; i++) { D[i][0] = i; P[i][0] = 1; }
for (let j = 0; j <= m; j++) { D[0][j] = j * 0.6; P[0][j] = 2; }
const sim = (p, q) => {
  if (!p || !q) return 0;
  if (p === q) return 1;
  if (p.startsWith(q) || q.startsWith(p)) return 0.82;
  let hit = 0; const seen = new Set(q);
  for (const c of p) if (seen.has(c)) hit++;
  return hit / Math.max(p.length, q.length) * 0.7;
};
for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
  const sub = D[i - 1][j - 1] + (1 - sim(A[i - 1], Bw[j - 1]));
  const del = D[i - 1][j] + 1.0, ins = D[i][j - 1] + 0.6;
  if (sub <= del && sub <= ins) { D[i][j] = sub; P[i][j] = 0; }
  else if (del <= ins) { D[i][j] = del; P[i][j] = 1; }
  else { D[i][j] = ins; P[i][j] = 2; }
}
const pairs = []; let i = n, j = m;
while (i > 0 || j > 0) {
  const op = P[i][j];
  if (i > 0 && j > 0 && op === 0) { pairs.push([i - 1, j - 1]); i--; j--; }
  else if (i > 0 && op === 1) { pairs.push([i - 1, -1]); i--; }
  else { j--; }
}
pairs.reverse();
const words = new Array(n).fill(null);
for (const [si, aj] of pairs) if (aj >= 0) words[si] = { word: scriptWords[si], t: asr[aj].t, dur: asr[aj].dur };
// interpolate any script word whisper missed, from its neighbours
for (let k = 0; k < n; k++) {
  if (words[k]) continue;
  let p = k - 1; while (p >= 0 && !words[p]) p--;
  let q = k + 1; while (q < n && !words[q]) q++;
  const t0 = p >= 0 ? words[p].t + words[p].dur : 0;
  const t1 = q < n ? words[q].t : N - TAIL;
  const span = Math.max(0.08, t1 - t0), steps = q - (p + 1) + 1;
  words[k] = { word: scriptWords[k], t: +(t0 + span * ((k - p) / steps)).toFixed(3), dur: +(span / steps).toFixed(3), interpolated: true };
}
// monotonic + sane durations
for (let k = 1; k < n; k++) if (words[k].t < words[k - 1].t) words[k].t = words[k - 1].t + 0.02;
for (let k = 0; k < n; k++) {
  const nx = k + 1 < n ? words[k + 1].t : N - TAIL * 0.4;
  words[k].dur = +Math.max(0.09, Math.min(words[k].dur, nx - words[k].t)).toFixed(3);
  words[k].t = +words[k].t.toFixed(3);
}
const interp = words.filter((w) => w.interpolated).length;
console.log(`aligned ${n} script words (${interp} interpolated), last word ends ${(words[n - 1].t + words[n - 1].dur).toFixed(3)}s`);
fs.writeFileSync(path.join(R, 'narration.words.json'), JSON.stringify(words, null, 1));

// ---- 4. PHRASE captions (R15 showed one word at a time -- hard to read) ----
// Group into 3-5 word phrases, breaking at punctuation and natural clause edges.
const phrases = [];
let cur = [];
const flush = () => {
  if (!cur.length) return;
  const t0 = cur[0].t, t1 = cur[cur.length - 1].t + cur[cur.length - 1].dur;
  phrases.push({ text: cur.map((w) => w.word).join(' '), t0: +t0.toFixed(3), t1: +t1.toFixed(3), words: cur.length });
  cur = [];
};
for (let k = 0; k < n; k++) {
  const w = words[k];
  cur.push(w);
  const hard = /[.;:?]$/.test(w.word);
  const soft = /,$/.test(w.word);
  const gap = k + 1 < n ? words[k + 1].t - (w.t + w.dur) : 1;
  if (hard || (soft && cur.length >= 3) || cur.length >= 5 || gap > 0.30) flush();
}
flush();
// hold each phrase until the next begins (no flicker gaps), cap the last
for (let k = 0; k < phrases.length; k++) {
  const nx = k + 1 < phrases.length ? phrases[k + 1].t0 : N - 0.35;
  phrases[k].t1 = +Math.max(phrases[k].t1, Math.min(nx - 0.02, phrases[k].t0 + 4.2)).toFixed(3);
}
fs.writeFileSync(path.join(R, 'captions.phrases.json'), JSON.stringify(phrases, null, 1));
console.log(`phrases: ${phrases.length}, avg ${(phrases.reduce((s, p) => s + p.words, 0) / phrases.length).toFixed(1)} words`);

const KEY = new Set(['infinity', 'coffin', 'thermos', 'nasa', 'radiator', '100', 'thousand', 'evaporate', 'cooking', 'six', 'eyes', 'atom', 'oxygen', 'reverse', 'curse', '24/7', 'brain', "what's", 'yours?']);
const esc = (s) => s.replace(/\{/g, '(').replace(/\}/g, ')');
const at = (s) => { const h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return `${h}:${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`; };
let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Tight,40,&H00FFFFFF,&H0066E4FF,&H000A0A12,&H90000000,-1,0,0,0,100,100,0.4,0,1,3.2,1.4,2,54,54,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
for (const p of phrases) {
  const txt = esc(p.text).split(' ').map((w) => {
    const bare = w.toLowerCase().replace(/[^a-z0-9'/]/g, '');
    return KEY.has(bare) ? `{\\c&H66E4FF&}${w}{\\c&HFFFFFF&}` : w;
  }).join(' ');
  ass += `Dialogue: 0,${at(p.t0)},${at(p.t1)},Cap,,0,0,0,,{\\fad(110,110)}${txt}\n`;
}
fs.writeFileSync(path.join(R, 'captions.ass'), ass);

// ---- 5. scene cue times, derived from the alignment (read-only) ----
// Each cue is the script sentence that opens a visual scene.
const SENT = [
  ['hook', "In Jujutsu Kaisen"],
  ['twoway', "Infinity stops anything"],
  ['thermos', "Infinity isn't a wall"],
  ['nasa', "NASA spent millions"],
  ['suit', "And astronauts' suit"],
  ['watts100', "You generate about"],
  ['watts1000', "A high-speed fight"],
  ['sweat', "Sweating can't save"],
  ['evaporate', "The sweat can't"],
  ['cook', "Roughly four minutes"],
  ['bakes', "He bakes inside"],
  ['sixeyes', "That's why the six"],
  ['filter', "He isn't just blocking"],
  ['focus', "If he loses focus"],
  ['rct', "He runs reverse curse"],
  ['compare', "NASA built a radiator"],
  ['difference', "That's the difference"],
  ['switch', "One can be switched"],
  ['yourinfinity', "You've got your own"],
  ['call', "The call you don't"],
  ['nothing', "Nothing gets in, nothing gets out. So"],
  ['question', "So what's yours?"],
];
const fullLower = words.map((w) => w.word.toLowerCase());
const cues = {};
for (const [id, prefix] of SENT) {
  const pw = prefix.toLowerCase().split(/\s+/);
  let found = -1;
  for (let k = 0; k <= n - pw.length; k++) {
    let ok = true;
    for (let q = 0; q < pw.length; q++) if (norm(fullLower[k + q]) !== norm(pw[q])) { ok = false; break; }
    if (ok) { found = k; break; }
  }
  if (found < 0) { console.log(`  !! cue not located: ${id} ("${prefix}")`); continue; }
  cues[id] = { wordIndex: found, t: words[found].t };
}
fs.writeFileSync(path.join(R, 'scene-cues.json'), JSON.stringify({ durationSec: +N.toFixed(3), cues }, null, 1));
console.log('scene cues located:', Object.keys(cues).length, '/', SENT.length);
for (const [k, v] of Object.entries(cues)) console.log(`  ${k.padEnd(14)} ${v.t.toFixed(3)}s`);
console.log('\nDONE r16_audio');
