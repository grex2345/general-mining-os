# 05 · Narration, alignment, captions, music, SFX, mixing

**Standing constraint:** you cannot hear the audio. Every audio claim must be a measurement —
LUFS, true peak, LRA, sample counts, word-onset comparisons against silence boundaries. Say
"measured", never "sounds good".

---

## 1. Narration: where the voice comes from

Three sources, in order of preference:

| Source | Quality | Availability | Notes |
|---|---|---|---|
| **Platform voice tool** (`add_voice` → `generate_speech`) | best — natural prosody | requires the agent platform's voice tools | **voice-02** is the registered English voice used for the delivered film; voice-01 is Darija |
| **Piper** (`en_US-amy-medium`) | good, local, offline | `bash studio/voice_setup.sh` | ONNX weights vendored in a GitHub repo, MIT; espeak-ng provides phonemes |
| meSpeak (Round 1) | robotic | npm, always | legacy fallback only |

**English is the default.** Darija/Arabic only on explicit request.

### Platform voice workflow

```
add_voice(text: ~35 words from the actual script, language: 'en', use_case: 'narration')
   -> user picks -> voice_id (e.g. 'voice-02')
generate_speech(voice_id, text: script, file_path: 'research/artifacts/roundN/narration-raw.mp3')
```
Max 1500 characters per `generate_speech` call; split long scripts at sentence boundaries and
concatenate. A registered `voice_id` maps to the same speaker across calls — reuse it for a whole film.

### Piper (offline)

```bash
bash studio/voice_setup.sh
# pip espeakng-loader -> studio/lib ; piper-tts + onnxruntime -> studio/lib_piper
# amy .onnx/.json fetched via `gh api` from Mobile-Artificial-Intelligence/babylon
python3 studio/voice.py --text "$(cat script.txt)" --out narration.wav
```

### Why not the "obvious" TTS libraries

**Tested and blocked in this sandbox:** `edge-tts` (`speech.platform.bing.com:443` refused by
egress), kokoro-js (weights on HuggingFace, ~327 MB, host blocked), XTTS v2 and
`KandirResearch/DarijaTTS-v0.1-500M` (HuggingFace). GitHub **release assets** are also blocked —
which is why whisper's model was fetched as six repo *file* parts instead.

> **Method:** before integrating any TTS, check *where its weights actually download from* and
> whether that host is reachable. A library that installs fine but downloads weights at runtime
> will fail at the worst moment. See [08-methodology.md](08-methodology.md).

---

## 2. Voice conditioning

```js
processVoice(inFile, outFile, { speed=1, targetLUFS=-14, targetTP=-1, lra=11, padToSec=null })
// ffmpeg: atempo=<speed>, loudnorm=I=-14:TP=-1:LRA=11 [, apad -t padToSec]
// -> 44100 Hz stereo; returns the measured duration
```

**Speed matters for storytelling.** The delivered film used **`speed: 0.9`**, turning the raw
narration into **31.975 s** — slower, more deliberate, more "storyteller". 1.0 is fine for
explainers; 0.9 for fables; avoid >1.1 (captions become unreadable).

`padToSec` pads with silence to an exact duration so the audio and video timelines match without
`-shortest` truncating a tail.

---

## 3. Forced alignment — the hardest-won part of the project

**Goal:** a `[{word, t, dur}]` array that matches the *actual acoustic onsets*, not an estimate.

```js
alignWords(audioFile, scriptText, { lang })
// lang 'en' -> alignWordsEnglish (pocketsphinx) with a whisper fallback on error
// otherwise -> whisperWords + alignScriptToWords (Needleman-Wunsch DP)
```

### English → pocketsphinx (precise)

Uses the reference pack's `research/references/stick3d/voice/align.py`. Requires
`pip3 install --break-system-packages pocketsphinx`.

**Measured accuracy:** `pottery@0.17 s`, `One@2.60 s` against a measured silence-end of 2.612 s.
Mean error ≈ 0.246 s across the test clip, but onsets track energy boundaries closely.
**This is the English default** — it is more precise than whisper DTW, which lags ~0.3 s.

⚠️ **pocketsphinx is English-only.** On Darija audio it outputs fluent nonsense English. Never
route non-English through it.

### Non-English → whisper.cpp DTW + DP alignment

```bash
bash studio/whisper_setup.sh    # builds whisper.cpp 1.8.2; model from 6 GitHub file parts
/tmp/wcpp/whisper.cpp-1.8.2/build/bin/whisper-cli \
  -m /tmp/whisper-dl/ggml-small.bin -f audio.wav -l ar -ojf -nfa -t 2
```

**Three gotchas, each of which cost real debugging time:**

1. **`-nfa` is mandatory.** Flash-attention *silently disables* DTW word timestamps. Without
   `-nfa` you get token times that look plausible but are not aligned.
2. **Use `-ojf` and read `t_dtw` (centiseconds → divide by 100).** Do **not** use `-ml 1` word
   offsets — on short clips they collapse (all words pile onto one timestamp).
3. **DTW onsets lag ~0.2–0.3 s.** Acceptable for karaoke; if you need tighter, subtract a measured
   constant offset determined from a known silence boundary.

Then `alignScriptToWords(scriptText, asrWords)` runs a Needleman-Wunsch alignment between the
*known* script and the ASR output, so ASR mistakes don't corrupt the caption text — you keep the
script's spelling and take the ASR's timing. Validated on Darija: the burned-in caption
`واحد يوريهم` at clip-4.16 s matched full-40.2 s.

### The fallback (be honest about it)

`estimateWordTiming(text, duration, {leadIn, tail})` distributes duration across words weighted by
length. **This is an estimate, not alignment.** Use only when both aligners are unavailable, and
label the result as estimated in the report. Round 5 shipped this and the report said so; Round 6
replaced it with measured energy-island alignment (`studio/align.py`).

---

## 4. Captions: ASS karaoke

```js
wordsToASS(words, { playResX:720, playResY:1280, font:'Inter Tight', size:46,
                    marginV:400, keywords:['Sami','clay','gold',...], accent, outline })
```

- **Word-by-word highlight** (`\k` karaoke) — the reference genre's signature. Not phrase-level.
- **Keyword colouring:** story nouns/verbs get the accent colour. Choose ~8–12 keywords per film.
- **Position:** `marginV: 400` on a 1280-tall frame puts the baseline at ~69 % height — inside the
  style spec's 65–70 % band, clear of the characters' feet. Round 5's subtitle at 79.5 % covered
  feet and had to move; Round 1's caption box overlapped a chart. **Always check the caption band
  against the composition in a viewed frame.**
- **RTL:** for Arabic/Darija the ASS renderer handles bidi; verify by viewing a burned frame, not
  by assuming.
- **Known gap in the vendored reference:** `references/zach-d-films-engine/render.mjs` burns
  `captionCues` (L93–97) but its `exportSRT` (L283–330) is phrase-level. If you reuse that engine,
  the SRT will not match the burned karaoke. Our `audiopipe` path does not have this problem.

**Lead-in shift:** if the mix adds `LEAD` seconds of silence before the voice, every word time must
be shifted by `+LEAD` before generating the final ASS:

```js
const words = JSON.parse(fs.readFileSync('words.json')).map(w => ({...w, t: +(w.t + LEAD).toFixed(3)}));
```
Forgetting this desynchronises the entire film by the lead-in amount.

---

## 5. Music: procedural, section-driven

```js
synthesizeWorldScore({ duration, sections:[{t0,t1,mood}], seed })  // -> Float32Array @ 48 kHz
```

Moods: `dawn` `tense` `build` `night` `swell` `wonder` `joy`. Sections are laid on the **same
boundaries as the shots**, so the score changes exactly when the picture does. The delivered film:

```
0.0–6.5 dawn | 6.5–10.1 tense | 10.1–17.1 build | 17.1–21.0 night
21.0–24.5 swell | 24.5–29.9 wonder | 29.9–36.0 joy
```

`score.mjs` (Round 7) offers an anime/battle palette instead:
`calm pulse action mystery twist resolve`, plus `battleSfx` (slash, water, growl, roar, sting…).

**Why procedural:** no licensing risk, no download dependency, deterministic from a seed, and it
can be shaped to the exact beat map. It is *not* a composed orchestral track — say so in the report.

---

## 6. SFX on action beats

```js
buildSfxTrack([{ t, kind, gain, dur }], duration)
```
13 kinds: `birds wind wheelHum claySquish shatter fireCrackle doorCreak gasp applause chime whoosh crickets`.

**Placement rule:** every visible action gets a sound at its exact frame time, and every location
gets an ambience bed. From the delivered film: birds+wind over the opening square, `wheelHum` for
7 s across the workshop, three `claySquish` hits on the shaping beats, `shatter` at 15.3 s on the
failed pot, `fireCrackle`+`crickets` for the night kiln, `doorCreak` at 21.5 s, `gasp` at 22.6 s,
`chime` on the reveal, `applause` for 5.4 s over the celebration.

Ambience beds are quiet (gain 0.12–0.32); punctual effects are louder (0.28–0.5). Nothing should
compete with the voice.

---

## 7. Mixing: amplitude-envelope ducking

```js
mixNarration({ voiceFile, music, sfx, duration, musicGain=0.32, sfxGain=0.55, leadIn=1.2 })
```

**Why not ffmpeg `amix`:** the bundled ffmpeg 4.1 `amix` *averages* its inputs, so adding a track
quietens everything. Instead the mix is done in JS sample-by-sample:

1. Build a smoothed voice-activity envelope: `sm += (|v| − sm) * 0.002`, `duck = min(1, sm*12)`.
2. Attenuate music and SFX by `1 − 0.45*duck` — up to **45 % ducking under speech**.
3. Sum voice + ducked music + ducked SFX.
4. Soft limiter: if peak > 0.98, scale the whole track by `0.98/peak`.

Then a final loudness pass:

```bash
ffmpeg -i mixed-raw.wav -af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000 -ac 2 final-audio.wav
```

**Measured result on the delivered film:** **−14.7 LUFS, true peak −3.98 dBTP, LRA 3.60.**
Target is −14 LUFS (YouTube/Instagram normalisation). Being within ~1 dB is acceptable; report the
actual number.

---

## 8. Encode, mux, burn

`studio/experiments/r11_finish.sh` (run from the repo root):

```bash
# 1. frames -> video
ffmpeg -framerate 30 -i /tmp/r11frames/f%04d.png -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p video.mp4
# 2. mux audio + burn captions in one pass
ffmpeg -i video.mp4 -i final-audio.wav -vf "subtitles=/tmp/r11caps.ass" \
       -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest out.mp4
```

Notes:
- **Copy the ASS to a simple path** (`/tmp/r11caps.ass`) before burning — the `subtitles=` filter
  chokes on paths with special characters.
- CRF 17 for the intermediate, 18 for the caption burn. Two encodes cost a little quality; a single
  pass is possible but separating them makes re-burning captions cheap when only text changes.
- `-pix_fmt yuv420p` is required for broad player compatibility.
- `-shortest` prevents an audio tail extending past the last frame.
- **Grain matters for compression:** flat skies/snow at CRF 17 compress to identical frames and
  trip `freezedetect`. Round 7 raised grain 0.05 → 0.07 to fix this.

---

# Round 13 — Professional audio & voice realism (VERIFIED)

Everything below was executed and measured in this environment. Where a claim is a
*hypothesis* rather than a result, it is labelled. **No listening verdict is asserted
here** — numbers catch broken audio, they cannot certify that a voice sounds human.
Audition files are listed in §R13.7 so a human can judge.

## R13.1 The decisive experiment: do NOT generate one TTS clip per sentence

The obvious way to get per-sentence emotion is to synthesise each beat separately with
its own direction. **It measurably fails.** Same voice, same 65-word script, three methods:

| method | what it is | f0 median **std across beats** | pitch-range std | centroid std |
|---|---|---|---|---|
| **A** | 7 isolated per-beat TTS clips, assembled | 17.63 Hz | 2.66 st | 127.7 Hz |
| **B** | one contextual take, untouched | 41.80 Hz | 3.18 st | 186.8 Hz |
| **C** | one contextual take → cut at aligned sentence boundaries → per-emotion DSP + directed pauses | **46.02 Hz** | **3.53 st** | **203.7 Hz** |

Higher std = the voice actually *travels* between emotional states. **C wins 4 of 5 metrics;
B beats A on every prosody metric.** Raw pre-DSP A equalled final A (17.63 Hz), so the limit
was the isolated *performance*, not our processing — no amount of DSP recovers it.

**Why:** generating a sentence in isolation removes the story context the model uses to
choose prosody. Every clip comes back neutral-ish, so the assembled read is *flatter* than
just letting the model read the whole thing.

**Rule: generate ONE take of the whole script, then restructure it.**
`VK.restructureTake()` in `studio/src/voicekit.mjs` implements C:
trim edges → align words (`AP.alignWords`) → cut at the plan's sentence boundaries →
per-beat `PS.shapeBeat` → insert directed pauses and breaths → assemble.

Artifacts: `research/artifacts/round13/ab/{measurements,comparison,three-way}.json`;
runners `studio/experiments/r13_{ab,ab2,abc}.mjs`.

## R13.2 Measurement bugs that silently produced wrong numbers

These all produced *plausible-looking* output. Each was found by checking against a known
signal, not by reading the code.

1. **Pitch-detector octave correction must prefer the SHORTER lag.** Preferring the longer
   period invents subharmonics (220 Hz read as 110). Use threshold **0.97**, order `[2,3]`.
   At 0.90 a strong 3rd harmonic on real speech reaches ~0.92 and manufactures a 340–400 Hz
   cluster on a 128 Hz narrator.
2. **Per-beat outlier rejection must reference the WHOLE-SPEAKER median.** A beat that locks
   onto a 3rd harmonic has *every* frame wrong together, so its own median is also wrong and
   the filter passes it. `analyzeBeats` now computes the speaker median once from the full
   track and passes `speakerMedianHz` into each beat. This changed two beats from 370/407 Hz
   to 145/129 Hz — the arc became readable.
3. **`powerSpectrum` returned an EMPTY spectrum for any sound shorter than one FFT window.**
   A 0.1 s footstep is ~3200 samples at 32 kHz vs a 4096 window: the frame loop ran zero
   times, centroid came back **0**, and every short SFX "failed" its spectral target.
   Fix: zero-pad to at least one window.
4. **Analyse at 32 kHz, not 16 kHz** — the `air` band sits above 16 kHz Nyquist and read 0.
5. **Goertzel band bank is untrustworthy** (off-bin leakage, per-probe normalisation).
   Use radix-2 FFT + Welch averaging (`PS.powerSpectrum`).
6. **Segmenting a take by arbitrary silence chunks is not a valid A/B.** The first attempt
   split B into 35 "beats" and reported f0 std 63 Hz — artefacts of tiny fragments. Always
   align words and cut at the *same sentence boundaries* as the plan.

## R13.3 Foley: material decides the recipe, and QA is numeric

`studio/src/foley.mjs` — 22 procedural recipes, stereo pan/distance, Freeverb-style reverb,
deterministic event mixer (`renderEvents`), plus `analyzeSound` / `variationCheck`.
Targets come from `research/references/procedural-sfx/references/design-method.md`.

**All 6 published targets now pass** (attack / t-20 / centroid):

| recipe | attack ms | t-20 ms | centroid Hz | target |
|---|---|---|---|---|
| step:stone | 0.31 | 10 | 9633 | atk 0–2, t20 10–60, cen 8000–14000 |
| step:wood | 0.15 | 30 | 364 | atk 0–15, t20 30–100, cen 300–900 |
| step:dirt | 6.83 | 30 | 505 | atk 0–15, t20 30–100, cen 300–900 |
| thump | 2.52 | 220 | 71 | atk 2–10, t20 100–300, cen 40–200 |
| whoosh | 216.4 | 210 | 1489 | atk 80–250, t20 150–300, cen 1000–4000 |
| chime | 0.94 | 1200 | 1335 | atk 0–2, t20 >800, cen 1000–3000 |

Getting there took three measure→adjust rounds. Footsteps were far too dull (centroid
220 Hz for wood, 115 Hz for dirt) because the low modal body dominated; the fix was to
**lift the granular attack band and cut the body gain**, not to add more overall level.

**Reverb had two real bugs, both found by impulse-response test:**
- The allpass wrote `b[p] = 0.5*in + bufOut` — **unity feedback**, so the delay line
  integrated forever. Output reached ~1e5 and the SFX bus measured **+53 dBFS**.
  Correct Freeverb allpass: `v = in + g*bufOut; b[p] = v; out = bufOut - g*v` with `g = 0.5`.
- Eight combs sum to ~8/(1−fb) ≈ 128×. Un-scaled, that alone blew the bus up.
  Fixed scale `acc * 0.1`, chosen by measuring **wet/dry RMS on a real chime** (−13.8 dB),
  not by guessing. Normalising by `(1−fb)` instead makes reverb *quieter* as the room gets
  bigger — wrong. Verify RT60 scales with `room`: 0.2→0.9 s, 0.45→1.25 s, 0.6→1.65 s, 0.85→3.4 s.

**Repeats must vary.** `variationCheck` renders 4 takes of a recipe and reports RMS spread
and attack spread. All tested recipes report "takes vary" (e.g. step 2.99 dB / 8.5 ms).
Vary pitch ±5–10 %, level ±20 %, pan ±0.2, and pass an explicit `seed` per event.

## R13.4 Mixing: bus gains must be relative to the MEASURED voice

`studio/src/mixdesk.mjs`. Reference targets (19 @RicksClips3000 videos): master −14 LUFS /
−2 dBTP, music ~20 dB under voice, SFX peak ~12 dB under voice, bed silent ~5 % of the time,
~7.7 SFX hits per 10 s, and only ~1 in 3 scene changes carries a transition hit.

Three things that were wrong until measured:

1. **Normalising a bed to a fixed absolute RMS drifts.** The −60 dB gate re-classifies frames
   once the gain changes, so "-20 dB under voice" came out as 31 dB. Fix: measure the voice
   bus first, then normalise each bed to `voiceRms + gainDb` and apply unity bus gain.
2. **Whole-file RMS is the wrong metric for sparse SFX.** It reported the SFX bus 22 dB under
   the voice when the events themselves were fine. Use **peak over each event's own duration**
   (`eventPeakDb`, p90) against the voice peak.
3. **TTS narration has a ~18 dB crest factor**, so the master hits the true-peak ceiling
   ~3.5 dB before it reaches −14 LUFS. A **lookahead peak limiter on the VOICE bus only**
   (`peakLimit`, 5 ms lookahead, 60 ms release, −9 dB threshold) recovered it.
   Never compress the master — master with **one linear gain**.

**Masking report:** the first version used a fixed 80 ms RMS at each event's start and
flagged 29 of 53 events. That wrongly condemns a footstep (all its energy is in the first
15 ms) and a 2 s riser (intentionally near-silent at its start). Measuring **peak over the
event's real duration** from `renderEvents`' log dropped it to 1 genuine flag, which was a
real gain error and was fixed. Final: **44 ok / 8 note / 0 flagged.**

**Delivered mix:** voice −21.27 dBFS gated RMS; music **21.51 dB** under voice; SFX p90
**11.66 dB** under voice peak; ambience −49.72; bed silent fraction **0.003**;
density **8.03 hits/10 s**; master **−14.55 LUFS / −2.0 dBTP / LRA 7.0**.

## R13.5 Emotional score that never stops

`studio/src/score_arc.mjs`. Round 11 changed mood per section but had no continuous bed.
Round 13 adds: emotion→mood map, a **continuous low pad** underneath everything (so the bed
is never silent), an intensity envelope interpolated between beat centres, chime/bell
stingers on reveal/surprise/excitement beats above 0.7 intensity, and a real **dip before
the payoff** honouring the director's silence plan. Adjacent identical moods are merged so
the score does not re-trigger on every beat.

Result on the film: 11 sections, 5 stingers, bed silent fraction 0.003.

## R13.6 Audio direction: two lexicon bugs worth remembering

`studio/src/voicedir.mjs` scores emotion per sentence and records *why*.

- **Negation.** "Because the bell was **never broken**" scored as **sadness** — the word
  "broken" fired. A negator (`never/not/no/wasn't/isn't/didn't/hadn't/weren't`) in the two
  preceding tokens now cancels a sadness cue entirely and halves other cues.
- **Short elliptical twist.** "The tower was." (3 words, right after a "Because…" clause)
  is the story's turn. Position priors called it tension; a rule now forces **surprise** for
  a ≤4-word beat immediately after a because-clause.
- Clamp intensity to ≤1.0 — it was reaching 1.13.

After the fixes the 14-beat arc reads correctly: mystery → warm → warm → mystery → warm →
tension → mystery → tension → reveal → **surprise** → reveal → reveal → **excitement** → resolve.

**TTS control is punctuation and sentence length only — no SSML.** The provider ignores tags.

## R13.7 What was actually measured on the film narration

123 words, one contextual take, `voice-03`, restructured by method C:

- duration **65.376 s**; speech-only rate **3.43 words/s** (reference 3.67); wall rate 1.88
- f0 median 141 Hz; pitch range **22.16 st**; pitch std 6.41 st; gestures 13.0/10 s
- dynamic range 47.41 dB; centroid 540 Hz; outliers rejected 27.9 %
- **silence fraction 0.451**, pause max **1.21 s**, mean 0.321 s

**Honest deviation:** the reference channel keeps pauses under ~0.45 s. This film holds
longer deliberately for suspense. Applying the Ricks tightening rule (−58 dBFS, 90 ms guard,
keep 0.12 s) removed only **4.54 s across 21 gaps** (65.38 → 60.84 s, silence 0.451 → 0.411),
so most of the space is intentional or natural, not dead air. Both versions are in the
audition set so a human can choose; the film ships the LOOSE one.

Per-emotion travel (f0 median / centroid): mystery 129 Hz / 855 Hz · tension 146 / 379 ·
surprise **185 / 1766** · reveal 166 / 1144 · excitement 135 / 286 · resolve **117 / 393**.

**Audition files (for human listening — no verdict claimed):**
`research/artifacts/round13/`
- `voice-comparison-ABC.wav` — methods A → B → C, 95.16 s
- `emotion-reel.wav` — one voice, six emotions, 32.25 s (+ `emotion-reel-guide.json`)
- `direction-off-on.wav` — same words/voice, direction OFF then ON, 122.58 s
- `sound-design-off-on.wav` — climax, narration alone then full mix, 23.80 s
- `pacing-loose-vs-tight.wav` — 127.81 s

## R13.8 Picture must be driven by the audio plan

`studio/src/film_bell.js` reads the same shot table the sound plan uses
(`research/artifacts/round13/film/shots.json`), and a check asserts they agree. Every cut
lands on a narration beat; the two wall taps in shot 6 are at local 1.55 s and 2.95 s, which
are exactly the two `step:stone` events in the sound plan; the bell strikes in shot 11 are
at local 0.35 s and 2.55 s, matching `THE BELL RINGS` and `bell second strike`.

**Portrait framing rule learned the hard way:** a bell hung at y≈4.6 and an actor standing
at y≈0–2.2 do **not** share a 720×1280 frame at these distances — the bell clips the top and
the actor's head clips the bottom. Hang belfry bells at **y≈3.6–3.9** so the rim sits just
above the actor's head, and aim the camera at **y≈1.9–2.6**. Two MID-sheet review rounds
were needed; the first pass had 5 shots with clipped subjects.

## R13.9 Word-anchored sync (the audio director's last pass)

Beat-relative offsets are not good enough. Placing the wall taps at `beat.t0 + 1.55`
put them **1180 ms** and **1000 ms** before the words "once" and "twice"; the bell struck
**320 ms** before "rang". Nothing looked wrong in the plan — the numbers were only
comparable once checked against `narration.words.json`.

`studio/experiments/r13_sync.mjs` now anchors every diegetic hit to the aligned word and
writes `picture-cues.json`, which the film reads for its animation cues. One anchor, two
consumers, so sound and image cannot drift.

| event | was | now | shift | anchored to |
|---|---|---|---|---|
| tap the wall — once | 30.752 | 31.972 | +1220 ms | word "once" |
| tap the wall — twice | 32.152 | 33.192 | +1040 ms | word "twice" |
| stone answers, faint | 33.602 | 34.892 | +1290 ms | after "listening" |
| the tower — twist hit | 43.262 | 43.782 | +520 ms | word "tower" |
| bell seats, four feet left | 55.176 | 54.956 | −220 ms | word "left" |
| THE BELL RINGS | 57.296 | 57.666 | +370 ms | word "rang" |
| bell second strike | 59.496 | 59.866 | +370 ms | +2.2 s |

Hits sit **+20…+60 ms after** the word onset so the ear hears the word first.
`r13_film_mix.mjs` re-applies this pass automatically after rebuilding the plan.

## R13.10 Engine fix: billboards must face the camera from where they ARE

`W.billboard.update` used the construction position `p` for its yaw. A moving actor kept
facing as if it still stood where it was created; once the camera crossed to the other
side the plane turned back-facing and the character **vanished entirely** — only her
hammer (a box) remained. Fixed to use `g.position`.

**Regression evidence:** all 9 Round-11 MID frames rendered with old vs new code at the
identical time — **8 of 9 byte-identical**; the single changed frame is the only shot with
a locomoting actor. See troubleshooting **F17**.

Also added a **follow camera** to the stairs shot: the authored Catmull-Rom keys rose
faster than the character climbed, so she left the frame by 95 % of the shot. The camera
now tracks her with a drifting lateral offset and a tightening lens (52°→46°).
