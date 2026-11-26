# Round 9 — Drive-wide research, the 3D Stick Figure Master skill, TTS pipeline & Darija

**Mission:** confirm Moroccan Darija handling; research everything relevant in Google Drive; study
the "3D Stick Figure Master" skill + other tools; build/test an automated AI-TTS audio pipeline;
grow a reusable knowledge base. No new finished production this round (per the user).

**Access/honesty:** Drive files read via the connector (text extracted / bytes downloaded + verified).
Videos analyzed from extracted frames I viewed; audio measured, not heard. Limits stated below.

## 1. Google Drive inventory (33 files) — relevant resources
**Production resources (studied):**
- `3D stick figure master prompt.docx` — the scriptwriting methodology (niche → 20 topics → research
  → 800–900-char mid-action story). Saved: `references/stick3d/SCRIPTWRITING-PROMPT.md`.
- `Stick3D-Pack-v4.zip` (13.3 MB) — Remotion+Three.js 3D toon stick-figure factory: MASTER-PROMPT.md,
  rules (RULES, STYLE-SPEC, ACTION-LIBRARY, CREATIVE-FREEDOM, QUALITY-CHECKLIST, STYLE-RULES-v2),
  voice tools (trim/align/prep_voice), engine (puppet/toon/kit/props/extra, NvidiaV4 reference).
  Knowledge saved: `references/stick3d/`.
- `prompt for zip folder claude code.docx` — setup behaviour (read rules, run setup, NvidiaV4 is the
  quality bar, reply in user's language, build from script+voiceover, self-check, deliver mp4+zip).
- `ANIMATION MASTER ENGINE.pdf` — the 23-part master spec (already studied Round 7).
- **Reference videos:** the 3 Round-8 clips (V1 3D drama; V2/V3 @Silenthys 2D explainers) + **5 new**
  (n1–n5) + `videoplayback (1).mp4` (34 MB, not yet analyzed) + a "Claude AI Made This 3D Animation
  With Code" tutorial (11 MB, not yet analyzed).
**Not relevant (cataloged, skipped):** school PDFs (Arabic exams, physics "le mouvement"), games
(.mrpack/.rar), capcut.exe, autoclicker, CASHLESS pdf, ROYAL COFFEIN site, SplatLabs/Sinners (others'
files), im-here json/zip.

## 2. The five new reference videos (analyzed from frames)
| | Length | Style | Genre | Language |
|---|---|---|---|---|
| n1 | 65 s | 2D illustrative cartoon | health/science explainer (paced bottle-feeding) | English |
| n2 | 2:50 | **3D toon stick figures** | history story (first pottery wheel, Stone Age) | **Moroccan Darija** |
| n3 | 61 s | 3D toon stick figures | mystery/scam story (lottery, "BAIT & GAS") | English |
| n4 | 67 s | 3D toon stick figures | history (railroad engineering race) | English |
| n5 | 58 s | 3D toon stick figures | fiction (Western fastest-gun duel) | English |

**n2 confirms the target:** creator **kounkan.ma** (Morocco), captions "واحد يوريهم" and title
"أول رويضة ديال الفخار فالعصر الحجري؟!" — authentic Darija (ديال، فالـ، رويضة). 60.5K likes. A Darija
3D-stick-figure history story. All use word-karaoke captions, dynamic camera, rich worlds, acting.
**Takeaway:** the 3D Stick Figure Master style is the user's main vehicle across genres; subject
dictates the visual world, not a fixed template. n2 loudness measured **−14.37 LUFS** (matches our
−14 target); whisper-small ASR of its narration is unmistakably Darija ("شنو يدير"، "القبيلة كاملة"،
"بحال شي معلم"، "شوية بشوية") — a Stone-Age village/pottery story.

**Two more Drive videos analyzed (meta/tutorial, not visual refs):**
- **n6 `videoplayback (1).mp4`** (11:09, 640×360, "ProvenTube"): reviews the Stick3D skill economy —
  "ONE FOLDER, NOT PROMPT", "30–40% OF SESSION SAVED" via prebuilt container, "OPUS VS SONNET" model
  choice, "EVERY WORD, TIMESTAMPED", "IT KEEPS LEARNING" (the ledger). Corroborates the pack's design.
- **n7 "Claude AI Made This 3D Animation With Code"** (6:00 tutorial): Claude + free SKILL.md →
  three.js scene ("CHICAGO 1893" hotel, ink outlines, FRONT camera) → Remotion render → 0:15 vertical
  video. Confirms the exact code→render workflow the pack encodes.

## 3. The 3D Stick Figure Master skill — what it teaches (adopted)
- Scriptwriting: mid-action hook, one narrative, end on payoff (§KB 1).
- QA checklist: feet/shadow, no slide/teleport/clip, doors open away, 15–20 props, colour differs per
  scene, 1–2-word captions on the spoken frame, sparse quiet SFX, 1-fps contact sheet viewed (§KB 6).
- Acting library: full-body emotion vocabulary + IK hands + physics recipes (§KB 3).
- Anti-template: 3 ideas/scene, neighbours differ, log to ledger (§KB 2).
- Camera follows voice meaning; handheld ≤0.004, FOV punch-ins, impact shake <0.5 s (§KB 2).
- Voice: trim → forced-align → words.json; sparse SFX −14 dB + ducking (§KB 5).
- **Runtime limit:** it uses Remotion+Three.js with swangle-on-CPU; our sandbox failed WebGL in
  earlier rounds. We adopt its *patterns* into our canvas engine; running its runtime here is an
  untested candidate (P2).

## 4. Automated audio pipeline — built + tested END-TO-END
`studio/src/audiopipe.mjs` (additive): `processVoice` (atempo+loudnorm+pad), `estimateWordTiming`
(fallback), `wordsToASS` (karaoke burn-in), `burnCaptions`, and NEW real alignment:
`whisperWords` (whisper.cpp DTW), `alignScriptToWords` (DP), `alignWords` (multilingual),
`alignWordsEnglish` (pocketsphinx, precise).
**Tests (real audio, ground-truth checked):**
- `processVoice`: 85% speed + loudnorm + pad → exactly 30.000 s, −14.45 LUFS / −4.01 dBTP. ✅
- **E2E chain:** script → processVoice(0.9×, pad 12) → exactly 12.000 s → alignWordsEnglish (14
  words, correctly speed-tracked) → wordsToASS (14 karaoke events). ✅
- **English alignment accuracy:** pocketsphinx matches acoustic energy (pottery@0.17s, One@2.60s =
  silence-end 2.612s). whisper DTW lags ~0.3 s → use pocketsphinx for English.
- **Darija alignment:** whisper-small DTW recognizes Darija and matched the burned-in caption
  (واحد يوريهم at clip-4.16s = full-video 40.2s). pocketsphinx on Darija = nonsense (English-only).
- **whisper.cpp gotchas solved:** `-nfa` required (flash-attn silently disables DTW); use `-ojf` +
  token `t_dtw` (centiseconds), NOT `-ml 1` offsets (collapse on short clips).
- Setup reproducible: `studio/whisper_setup.sh` (builds whisper.cpp + fetches ggml-small from a
  GitHub mirror, HF blocked). Model sha256 verified.

## 5. Moroccan Darija — confirmed + TTS tested honestly
I understand Darija natively (verified by correctly reading n2's captions/title AND its whisper ASR
transcript). Handling rules: preserve meaning/emotion/humour; internal English only for research;
final narration natural Darija, never MSA/robotic; captions in the requested language. §KB 7.
**Darija TTS — tested, not assumed:** edge-tts `ar-MA` **TESTED BLOCKED** (speech.platform.bing.com
refused by egress, 0.0s). In-sandbox the working AI-TTS path is the platform voice tool (the one the
user used) + piper (English, restored via voice_setup.sh). Native Darija TTS (Hamsa/DarijaTTS/XTTS)
needs the user's machine or an allowed API proxy — hosts blocked here. A platform Darija audition is
the naturalness test only the user's ear can judge. Full matrix in §KB 5.

## 6. Headless 3D rendering — SwANGLE claim TESTED, WORKS
Earlier rounds recorded "headless WebGL impossible (EGL_NOT_INITIALIZED)". **Overturned:** via
`@sparticuz/chromium` + SwiftShader ANGLE + the bundled al2023 nspr/nss libs, WebGL2 works headless
and three.js renders. Proof: renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))", cube at
720×1280 screenshot-verified (`round9/swangle-three-test.png`). Recipe: `studio/swangle_setup.sh` +
`studio/experiments/swangle_test.cjs`. This validates the pack's `--gl=swangle` CPU-render claim and
opens the 3D-toon/Remotion path for future productions.

## 7. Improvements made this round (real, preserved)
- `studio/src/audiopipe.mjs` — tested audio post-production + REAL word alignment (EN + Darija) + karaoke.
- `studio/whisper_setup.sh`, `studio/swangle_setup.sh`, `studio/experiments/swangle_test.cjs` — reproducible.
- `research/KNOWLEDGE_BASE.md` — the reusable KB (storytelling/visual/acting/motion/audio/QA/Darija/tools).
- `research/references/stick3d/` — the skill's rules + voice tools + scriptwriting prompt saved.
- Ledger: +records for the skill, audiopipe, Darija TTS, whisper alignment, swangle, kounkan, new videos.
- All Round 1–8 work intact; HEAD verified before changes.

## 8. Remaining limits (honest)
- Platform Darija TTS naturalness needs the user's audition (cannot be judged by ear here).
- Native Darija TTS (Hamsa/DarijaTTS) requires the user's machine or an allowed API proxy.
- whisper DTW has ~0.2–0.3 s onset lag; bound it via per-sentence TTS + alignment.
- whisper/ffmpeg/chromium stacks live in /tmp (out of git/snapshots); setup scripts re-fetch them.
