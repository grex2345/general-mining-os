/**
 * audiopipe.mjs — reusable, automated narration post-production pipeline.
 *
 * Implements the AI-TTS workflow the user described (script -> AI voice -> generate
 * -> FFmpeg process -> speed/loudness/pad -> word-timed captions -> mux), as a
 * repeatable module. TTS generation itself uses the platform voice tools
 * (add_voice / generate_speech) or a local engine; THIS module handles everything
 * after the raw speech file exists, plus caption timing/export.
 *
 * Learned from: Stick3D-Pack tools/voice (trim -> forced-align -> words.json),
 * the @Silenthys references (word-karaoke), and free.ai ASS-karaoke technique.
 * ADDITIVE: no existing engine modified.
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const FFMPEG = path.join(ROOT, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
export const FFPROBE = path.join(ROOT, 'node_modules/@ffprobe-installer/linux-x64/ffprobe');

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    const err = [];
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(err).toString()) : reject(new Error(`${path.basename(bin)} exit ${c}: ${Buffer.concat(err).toString().slice(-500)}`))));
  });
}

export async function probeDuration(file) {
  const p = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  await new Promise((res, rej) => { p.on('close', res); p.on('error', rej); });
  return parseFloat(out.trim());
}

/**
 * Process raw TTS speech: slow/speed up (atempo), normalize loudness (loudnorm),
 * optionally pad with silence to a target duration. Returns the new duration.
 * speed 0.85 = 85% (the user's gum-explainer setting). targetLUFS -14 = broadcast.
 */
export async function processVoice(inFile, outFile, { speed = 1, targetLUFS = -14, targetTP = -1, lra = 11, padToSec = null } = {}) {
  const filters = [];
  if (speed && speed !== 1) filters.push(`atempo=${speed}`);
  filters.push(`loudnorm=I=${targetLUFS}:TP=${targetTP}:LRA=${lra}`);
  if (padToSec) filters.push('apad');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inFile, '-af', filters.join(','), '-ar', '44100', '-ac', '2'];
  if (padToSec) args.push('-t', String(padToSec));
  args.push(outFile);
  await run(FFMPEG, args);
  return probeDuration(outFile);
}

/**
 * Word-timing ESTIMATE (the user's described method, not live ASR). Distributes a
 * known audio duration across words weighted by length, with a lead-in. Good enough
 * for karaoke when real forced alignment isn't available; replace with align.py /
 * whisper word timestamps for frame-accurate sync.
 */
export function estimateWordTiming(text, durationSec, { leadIn = 0.25, tail = 0.15 } = {}) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const span = Math.max(0.1, durationSec - leadIn - tail);
  const weights = words.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = leadIn;
  return words.map((word, i) => {
    const dur = (weights[i] / total) * span;
    const w = { word, t: +t.toFixed(3), dur: +dur.toFixed(3) };
    t += dur;
    return w;
  });
}

function assTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Export word-karaoke captions as ASS (burn-in via ffmpeg subtitles filter).
 * Style: 1-2 words, big 900-weight white with black stroke, y~69% (Stick3D spec),
 * current word pops; keywords get an accent colour. This is the standard
 * Whisper->ASS->ffmpeg karaoke path, driven here by any words[{word,t,dur}] array.
 */
export function wordsToASS(words, {
  playResX = 1080, playResY = 1920, font = 'Inter Tight', size = 64,
  primary = '&H00FFFFFF', stroke = '&H00000000', accent = '&H003FD2FF', // ASS = &HAABBGGRR
  keywords = [], marginV = 560, outline = 5,
} = {}) {
  const keyset = new Set(keywords.map((k) => k.toLowerCase()));
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${font},${size},${primary},${accent},${stroke},&H00000000,-1,0,0,0,100,100,0,0,1,${outline},0,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = words.map((w) => {
    const isKey = keyset.has(w.word.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, ''));
    const col = isKey ? `{\\c${accent}}` : '';
    // pop-in: scale 80->100 over 120ms, fade 80ms
    const txt = `{\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)\\fad(60,40)}${col}${w.word}`;
    return `Dialogue: 0,${assTime(w.t)},${assTime(w.t + w.dur)},Cap,,0,0,0,,${txt}`;
  });
  return header + lines.join('\n') + '\n';
}

/** Burn an ASS caption file into a video (re-encodes video, copies audio). */
export async function burnCaptions(videoFile, assFile, outFile, { crf = 18 } = {}) {
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoFile,
    '-vf', `subtitles=${assFile}`, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-c:a', 'copy', outFile]);
  return outFile;
}

/* ---------------------------------------------------------------------------
 * REAL word alignment (Round 9, tested): whisper.cpp ASR -> script alignment.
 *
 * Why: estimateWordTiming drifts up to ~0.9 s vs forced alignment (measured on
 * piper audio, see research/artifacts/round9/align/). pocketsphinx (the Stick3D
 * pack's align.py) is English-only — tested on real Darija audio it outputs
 * nonsense. whisper-small with -l ar DOES recognize Darija (tested on the
 * kounkan.ma reference: "واحد يوريهم" at 2.17 s matches the burned-in caption).
 *
 * Method (Stick3D philosophy): caption TEXT comes from the script, TIMESTAMPS
 * come from the audio. whisper gives approximate word times (-ml 1 -sow);
 * a Needleman-Wunsch DP aligns script words to ASR words tolerant of ASR
 * errors (critical for Darija, where whisper mishears words but keeps timing).
 * Unmatched script words are interpolated between matched neighbours.
 *
 * Setup: bash studio/whisper_setup.sh  (builds whisper.cpp + fetches ggml-small
 * from a GitHub mirror — HF is egress-blocked here). Override paths via env
 * WHISPER_CLI / WHISPER_MODEL.
 * ------------------------------------------------------------------------- */
export const WHISPER_CLI = process.env.WHISPER_CLI || '/tmp/wcpp/whisper.cpp-1.8.2/build/bin/whisper-cli';
export const WHISPER_MODEL = process.env.WHISPER_MODEL || '/tmp/whisper-dl/ggml-small.bin';

// PRODUCTION LANGUAGE DEFAULT = ENGLISH (user correction, Round 10). Moroccan Darija is the
// language we COMMUNICATE in, NOT the default video language. Videos are English unless the
// user explicitly requests another language. Pass { lang: 'ar' } etc. to override per-video.
export const DEFAULT_LANG = 'en';

/**
 * Run whisper.cpp on audio; return [{word, t, dur}] in seconds (word-level).
 *
 * Uses DTW attention-based token timestamps (`-dtw <preset> -nfa -ojf`), which
 * are far more reliable than the default timestamp-token estimates. IMPORTANT
 * (tested): flash attention is ON by default and SILENTLY DISABLES DTW — `-nfa`
 * is required; and `-ml 1` segment-split offsets collapse on short clips, so we
 * take normal segments and group tokens into words ourselves. `t_dtw` is in
 * centiseconds (verified in whisper.cpp source: printed as t_dtw/100).
 * Falls back to `-ml 1 -sow` segment offsets if DTW times are absent.
 */
export async function whisperWords(audioFile, { lang = DEFAULT_LANG, cli = WHISPER_CLI, model = WHISPER_MODEL, threads = 4, dtw = 'small' } = {}) {
  const tmp = `/tmp/apipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await run(FFMPEG, ['-y', '-v', 'error', '-i', audioFile, '-ar', '16000', '-ac', '1', `${tmp}.wav`]);
  const base = ['-m', model, '-l', lang, '-f', `${tmp}.wav`, '-t', String(threads), '-nt'];
  let words = [];
  if (dtw) {
    await run(cli, [...base, '-dtw', dtw, '-nfa', '-ojf', '-of', tmp]);
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(fs.readFileSync(`${tmp}.json`)));
    for (const seg of data.transcription || []) {
      const toks = (seg.tokens || []).filter((t) => t.id < 50257 && !/^\[?_/.test(t.text || '') && !/^<\|/.test(t.text || ''));
      const grouped = [];
      for (const tok of toks) {
        const txt = tok.text || '';
        if (!txt.trim()) continue;
        const start = (tok.t_dtw >= 0 ? tok.t_dtw : (tok.offsets?.from ?? 0) / 10) / 100;
        if (txt.startsWith(' ') || grouped.length === 0) grouped.push({ word: txt.trim(), t: start });
        else grouped[grouped.length - 1].word += txt;
      }
      const segEnd = (seg.offsets?.to ?? 0) / 1000;
      grouped.forEach((g, i) => {
        const end = i + 1 < grouped.length ? grouped[i + 1].t : Math.min(segEnd, g.t + 0.35);
        words.push({ word: g.word, t: +g.t.toFixed(3), dur: +Math.max(0.06, end - g.t).toFixed(3) });
      });
    }
    words = words.filter((w) => w.word);
  }
  if (!words.length) {
    // fallback: word-split segments (no DTW)
    await run(cli, [...base, '-ml', '1', '-sow', '-oj', '-of', tmp]);
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(fs.readFileSync(`${tmp}.json`)));
    for (const seg of data.transcription || []) {
      const w = (seg.text || '').trim();
      if (!w) continue;
      words.push({ word: w, t: +(seg.offsets.from / 1000).toFixed(3), dur: +Math.max(0.04, (seg.offsets.to - seg.offsets.from) / 1000).toFixed(3) });
    }
  }
  try { fs.unlinkSync(`${tmp}.wav`); fs.unlinkSync(`${tmp}.json`); } catch {}
  return words;
}

// Normalise for MATCHING only (display text is never altered): strip tashkeel,
// unify alef/hamza forms, ya/alef-maqsura, ta-marbuta/ha; lowercase Latin.
function normWord(w) {
  return w.toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function similarity(a, b) {
  const na = normWord(a), nb = normWord(b);
  if (!na || !nb) return 0;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

/**
 * Align script words to ASR words (Needleman-Wunsch, similarity-scored).
 * Returns [{word, t, dur}] with the EXACT script words and audio-derived times.
 * Gaps in the ASR (misheard/merged words) are interpolated by length between
 * the nearest matched neighbours, so captions never lose a script word.
 */
export function alignScriptToWords(scriptText, asrWords) {
  const S = scriptText.trim().split(/\s+/).filter(Boolean);
  const A = asrWords;
  const n = S.length, m = A.length;
  if (!n) return [];
  if (!m) return estimateWordTiming(scriptText, 1);
  const GAP = -0.55;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const P = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1=diag 2=up 3=left
  for (let i = 1; i <= n; i++) { D[i][0] = i * GAP; P[i][0] = 2; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * GAP; P[0][j] = 3; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const sim = similarity(S[i - 1], A[j - 1].word);
    const diag = D[i - 1][j - 1] + (sim > 0.34 ? sim : -0.6);
    const up = D[i - 1][j] + GAP, left = D[i][j - 1] + GAP;
    if (diag >= up && diag >= left) { D[i][j] = diag; P[i][j] = 1; }
    else if (up >= left) { D[i][j] = up; P[i][j] = 2; }
    else { D[i][j] = left; P[i][j] = 3; }
  }
  const match = new Array(n).fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = P[i][j];
    if (p === 1) { if (similarity(S[i - 1], A[j - 1].word) > 0.34) match[i - 1] = j - 1; i--; j--; }
    else if (p === 2) i--;
    else j--;
  }
  const out = S.map((word, k) => {
    if (match[k] >= 0) { const a = A[match[k]]; return { word, t: a.t, dur: a.dur, src: 'asr' }; }
    return { word, t: null, dur: null, src: 'interp' };
  });
  // interpolate unmatched words between matched neighbours
  let k = 0;
  while (k < n) {
    if (out[k].t !== null) { k++; continue; }
    let e = k; while (e < n && out[e].t === null) e++;
    const prevEnd = k > 0 ? out[k - 1].t + out[k - 1].dur : 0;
    const nextStart = e < n ? out[e].t : prevEnd + (e - k) * 0.3;
    const span = Math.max(0.05, nextStart - prevEnd);
    const weights = out.slice(k, e).map((w) => Math.max(2, normWord(w.word).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = prevEnd;
    for (let q = k; q < e; q++) { const d = (weights[q - k] / total) * span; out[q].t = +t.toFixed(3); out[q].dur = +d.toFixed(3); t += d; }
    k = e;
  }
  return out.map(({ word, t, dur }) => ({ word, t, dur }));
}

/**
 * Full real-alignment path: audio + script -> word-timed captions. DEFAULT LANGUAGE = ENGLISH.
 * English routes to precise pocketsphinx forced alignment (matches acoustic onsets), falling
 * back to whisper+DP if a script word is outside the cmudict dictionary. Other languages use
 * whisper+DP (multilingual). Override with { lang: 'ar' } etc. for non-English videos.
 */
export async function alignWords(audioFile, scriptText, opts = {}) {
  const lang = opts.lang || DEFAULT_LANG;
  if (lang === 'en' || lang.startsWith('en-')) {
    try { return await alignWordsEnglish(audioFile, scriptText, opts); }
    catch { /* unknown word / aligner issue -> robust multilingual fallback */ }
  }
  const asr = await whisperWords(audioFile, { ...opts, lang });
  return alignScriptToWords(scriptText, asr);
}

/**
 * English-default narration bundle: the repeatable script -> voice -> captions workflow.
 * Given a raw TTS voice file + the exact script, returns { duration, words, ass } after
 * loudness processing + word alignment + karaoke ASS. This is the standard production path;
 * narration language defaults to English (DEFAULT_LANG).
 */
export async function narrationBundle(script, voiceFile, { outAudio, lang = DEFAULT_LANG, speed = 1, targetLUFS = -14, padToSec = null, captionOpts = {} } = {}) {
  const audio = outAudio || `/tmp/narr-${Date.now()}.wav`;
  const duration = await processVoice(voiceFile, audio, { speed, targetLUFS, padToSec });
  const words = await alignWords(audio, script, { lang });
  const ass = wordsToASS(words, captionOpts);
  return { audio, duration, words, ass };
}

/**
 * English-only PRECISE forced alignment via the Stick3D pack's pocketsphinx
 * align.py (tested: matches acoustic energy onsets; whisper DTW lags ~0.3 s).
 * Requires: pip pocketsphinx + ffmpeg on PATH. Returns [{word,t,dur}].
 * Use this for English narration; use alignWords (whisper) for Darija/Arabic.
 */
export async function alignWordsEnglish(audioFile, scriptText, { alignPy = path.join(ROOT, '../research/references/stick3d/voice/align.py') } = {}) {
  const tmp = `/tmp/apipe-en-${Date.now()}`;
  fs.writeFileSync(`${tmp}.txt`, scriptText);
  const env = { ...process.env, PATH: `${path.dirname(FFMPEG)}:${process.env.PATH}` };
  await new Promise((resolve, reject) => {
    const p = spawn('python3', [alignPy, audioFile, `${tmp}.txt`, `${tmp}.json`], { env });
    const err = [];
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`align.py exit ${c}: ${Buffer.concat(err).toString().slice(-300)}`))));
  });
  const rows = JSON.parse(fs.readFileSync(`${tmp}.json`, 'utf8'));
  try { fs.unlinkSync(`${tmp}.txt`); fs.unlinkSync(`${tmp}.json`); } catch {}
  return rows.map((r) => ({ word: r.word, t: r.start, dur: +Math.max(0.06, r.end - r.start).toFixed(3) }));
}
