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
