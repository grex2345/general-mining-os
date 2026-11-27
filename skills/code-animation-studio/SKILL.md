---
name: code-animation-studio
description: Complete knowledge-transfer skill for building, operating, troubleshooting and improving a code-rendered animated video production system (2D acting puppets in a 3D toon world, headless WebGL/three.js, AI English narration, forced-aligned word-karaoke captions, procedural music/SFX, cinematic camera, transitions, QA gates, verified delivery). Use when asked to produce an animated explainer/story/history/mystery video from a script, to extend or debug this video engine, to render frames headlessly, to sync captions to narration, or to reproduce the "Stick3D"-style 3D stick-figure film pipeline in a new repository. Contains the full project history (Rounds 1-13), the learning methodology, a 15-step production runbook, a bug/lessons catalogue with exact causes and fixes, and the Round-13 professional audio method (contextual-take voice restructuring, emotion direction, material-based foley, 4-bus stereo mixing, word-anchored sync).
---

# Code Animation Studio — inherited experience

**What this is.** One portable skill that transfers the entire experience of building a
code-rendered animation studio: every architecture decision, every working technique, every
bug and its exact fix, the research methodology that produced them, and a runbook another
agent can follow end-to-end without asking questions.

**What it produces.** Vertical 9:16 animated films — richly populated toon worlds, expressive
acting characters, cinematic camera moves, natural AI narration, word-synced karaoke captions,
procedural music and action-synced SFX — rendered entirely from code (no AI pixel/video
generation), QA-gated, and delivered as a real MP4 with verified links.

**Reference implementation.** The `general-mining-os` repository, `studio/` engine +
`research/` knowledge base. Latest proven deliverable: a 36.0 s, 9-scene English film,
`research/artifacts/round11/the-boy-who-chose-clay.mp4` (720×1280, h264+aac, −14.7 LUFS,
0 unintended black frames, 0 freezes).

---

## Round 13 changed the audio method — read §R13.1 before generating any narration

**Do not synthesise one TTS clip per sentence.** It was tested and it is *worse*: the model
loses story context and the assembled read varies less than a single continuous take
(between-beat pitch std 17.63 Hz isolated vs 41.80 Hz single take). Generate **one take of
the whole script**, then cut it at aligned sentence boundaries and shape each beat
(`VK.restructureTake`). Full evidence in [05-audio.md](references/05-audio.md) §R13.1.

Two more Round-13 rules that cost real debugging time:
- **Anchor every sound effect to the WORD**, not to a beat offset. Beat-relative placement
  put wall taps 1.1 s before the words they illustrate (§R13.9).
- **Numbers cannot certify audio quality.** Measure to catch broken sound, then hand a
  human an audition file. Never write "sounds natural" on the strength of a metric.

---

## Read this first — the five rules that make everything else work

These are not style preferences. Each one exists because violating it produced a real,
recorded failure in this project.

1. **A status is a claim about the past, and it must be earned.**
   `discovered` → `inspected` (source/renders actually read) → `tested` (ran *here*, with a
   command and a result) → `integrated` (code landed + artifact exists on disk).
   Never write "works" because a README says so. See [08-methodology.md](references/08-methodology.md).

2. **Never claim to have heard audio or watched video.**
   Audio is *measured* (LUFS, true peak, waveform, spectrogram). Motion is judged from
   *sampled frames* — say "sampled N frames at X fps". An unviewed render is not a test.

3. **Never replace working code to make room for an experiment.** Add alongside; integration
   is a separate, tested step. Verify repository state (`git rev-parse HEAD`, `git status`)
   before changing anything.

4. **An integration test is not a production.** A 5-second clip that proves the pipeline is
   wired is a *smoke test*. Production quality comes from repeated
   render → inspect frames → fix → re-render loops. Do not present a smoke test as the
   quality ceiling. See [09-quality.md](references/09-quality.md).

5. **English is the default production language.** English script, natural English AI
   narration, English word-synced captions — unless the user explicitly requests another
   language. The language you *chat* in is not the language you *produce* in.

---

## Where to go next

| If you are… | Read |
|---|---|
| **A brand-new agent, start here** | [START-HERE.md](START-HERE.md) — 15-minute orientation + first-render procedure |
| Producing a video now | [07-workflow.md](references/07-workflow.md) — the 15-step runbook with commands |
| Writing the story | [06-story.md](references/06-story.md) — script → beats → storyboard → shots |
| Building scenes/props/characters | [02-architecture.md](references/02-architecture.md), [03-characters.md](references/03-characters.md) |
| Directing camera/transitions | [04-camera.md](references/04-camera.md) |
| Doing voice/captions/music/SFX | [05-audio.md](references/05-audio.md) — Round-13 sections §R13.1–R13.10 are the current best method |
| Something is broken | [10-troubleshooting.md](references/10-troubleshooting.md) — symptom → cause → fix |
| Checking if it's good enough | [09-quality.md](references/09-quality.md) — gates + verification commands |
| Looking for a tool/reference | [11-resources.md](references/11-resources.md) — catalog with status + URLs |
| Porting to another repo/machine | [12-portability.md](references/12-portability.md) |
| Understanding how we got here | [01-history.md](references/01-history.md) — Rounds 1–11, what each proved |
| Checking what was verified | [VALIDATION.md](VALIDATION.md) — exactly what was re-executed vs. transcribed |

---

## The architecture in one paragraph

A headless Chromium (from the `@sparticuz/chromium` npm tarball) runs **three.js on
SwiftShader/ANGLE** — real WebGL2 on CPU, no GPU. Into that 3D scene we place **ink-outlined
toon primitives** (boxes/balls/cylinders/cones with a BackSide ink shell), canvas-textured
surfaces, soft contact shadows, lighting rigs and atmosphere. Characters are **2D canvas
puppets drawn fresh every frame onto an upright, yaw-only billboard** — this is the key
insight from the reference architecture: you get a full 2D acting vocabulary (moods, IK hands,
outfits, sweat, squash/stretch) with 3D depth, props and camera, at a fraction of the cost of
rigging 3D characters. A shot director builds one scene per shot, each with its own camera
path, acting timeline and props. Frames are screenshotted, transitions are composited on a 2D
canvas, and ffmpeg encodes. Separately, AI narration is loudness-normalised, force-aligned to
word timestamps, turned into ASS karaoke, and mixed with procedural music and SFX under a
ducking envelope. The result is muxed, caption-burned, QA-gated and delivered.

```
script ──► beats ──► shot plan ──► scene build (world + actors + camera)
                                        │
                                        ▼
                          headless render loop (frame → PNG)
                                        │
                          transition compositor (2D canvas)
                                        │
                                        ▼
                              ffmpeg encode (CRF 17)
                                        │
voice ──► loudnorm ──► forced align ──► ASS karaoke ──┐
music ──► sections ─┐                                 │
SFX ──► beat events ─┴─► ducked mix ──► loudnorm ──────┤
                                                      ▼
                                        mux + burn captions ──► QA ──► deliver
```

---

## The engine map (reference implementation)

**Production path — use this for new films (Rounds 10–11, verified):**

| File | Role |
|---|---|
| `studio/src/puppet2d.js` | `drawPuppet(ctx,W,H,look,pose)` — the 2D acting puppet |
| `studio/src/stickworld.js` | `StickWorld(THREE)` — toon primitives, textures, shadows, billboard, `cineCam` |
| `studio/src/worldkit.js` | `WorldKit(THREE,W)` — 25+ props, atmosphere, lighting, `catmullCam`, masterpiece vase |
| `studio/src/actor.js` | `ActorKit(THREE,W,K)` — locomotion, idle, **20 gesture recipes** (12 pottery + 9 Round-13: climb, tapWall, listen, holdBreath, pullRope, awe, listened, hammer) |
| `studio/src/film_potter.js` | `PotterFilm` — worked 9-shot film (Round 11) |
| `studio/src/film_bell.js` | `BellFilm` — worked 12-shot film (Round 13), **audio-driven shot table + word-synced cues + follow camera**; copy this one for a new film |
| `studio/experiments/r11_render.cjs` | headless render driver + transition compositor |
| `studio/src/audiopipe.mjs` | narration processing, forced alignment, ASS karaoke |
| `studio/src/score_world.mjs` | warm cinematic score, 7 story moods |
| `studio/src/sfxkit.mjs` | 13 procedural SFX + ducking mixer (Round 11) |
| `studio/src/prosody.mjs` | **Round 13** — F0/energy/FFT prosody measurement, per-beat shaping. Validated on synthetic tones |
| `studio/src/voicedir.mjs` | **Round 13** — per-sentence emotion scoring with reasons, pause/emphasis plan, negation handling |
| `studio/src/voicekit.mjs` | **Round 13** — `restructureTake()`: the hybrid voice method that beat isolated per-beat TTS |
| `studio/src/foley.mjs` | **Round 13** — 22 material-based recipes, stereo pan/distance, reverb, numeric QA |
| `studio/src/score_arc.mjs` | **Round 13** — emotion-following score with a continuous bed, stingers, pre-reveal dip |
| `studio/src/mixdesk.mjs` | **Round 13** — 4-bus stereo mix, voice-keyed ducking, voice limiter, masking report, one-gain master |
| `studio/experiments/r11_audio.mjs`, `r11_finish.sh` | Round-11 audio assembly; encode/mux/burn |
| `studio/experiments/r13_film_audio.mjs`, `r13_film_mix.mjs`, `r13_sync.mjs`, `r13_finish.sh` | **Round 13** narration → score/foley/mix → word-sync → encode |
| `studio/{swangle,voice,whisper}_setup.sh` | reproducible environment setup |

**Legacy paths — preserved, still working, use when the subject calls for them (Rounds 1–8):**
`cartoon.mjs` (flat 2D vector), `stickman.mjs` (marker-style stickman), `lowpoly.mjs` +
`raster3d.mjs` (software 3D, no browser needed), `character3d.mjs` + `animation.mjs` (bone rig,
IK, visemes), `cinema.mjs` (DOF/bloom/grain/grade), `kinetic.mjs` (motion graphics/karaoke/
counters), `vfx.mjs`, `waterfx.mjs`, `audio.mjs`, `score.mjs`. Full API index in
[02-architecture.md](references/02-architecture.md).

**Knowledge system:** `research/KNOWLEDGE_BASE.md` (living reference),
`research/ledger.json` + `research/tools/kb.mjs` (evidence-enforced status ladder, 72 records),
`research/ROUND*.md` (per-round reports), `research/references/stick3d/` (the source skill's
rules and voice tools). **Never delete or overwrite these.** This skill indexes them; it does
not replace them.

---

## Minimum viable production (condensed)

Full detail in [07-workflow.md](references/07-workflow.md). This is the shape, not a substitute.

```bash
# 0. orient
git rev-parse HEAD && git status --short
cat research/KNOWLEDGE_BASE.md

# 1. environment (once per sandbox; /tmp does not survive resets)
bash studio/swangle_setup.sh      # headless WebGL2 + three.js
bash studio/voice_setup.sh        # local Piper TTS (offline fallback voice)
bash studio/whisper_setup.sh      # whisper.cpp + ggml-small (non-English alignment)
pip3 install --break-system-packages pocketsphinx   # precise English alignment

# 2. write script -> generate narration -> align -> captions
node studio/experiments/r11_narration.mjs     # pattern: narrationBundle(script, voiceFile)

# 3. build your film module (copy film_potter.js), then smoke-test EVERY shot
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle SMOKE=1 \
  node studio/experiments/r11_render.cjs
# then inspect MID-shot frames (past the transitions) before committing to a full render
MID=1 ... node studio/experiments/r11_render.cjs   # -> contact sheet -> VIEW IT

# 4. full render (background; ~0.5 s/frame at 720x1280 with rich scenes)
# 5. audio assembly + mix
node studio/experiments/r11_audio.mjs
# 6. encode + mux + burn captions
bash studio/experiments/r11_finish.sh
# 7. QA: blackdetect, freezedetect, loudness, ffprobe, 1-fps contact sheet -> VIEW IT
# 8. fix what you saw, re-render affected shots, re-check
# 9. commit, push, verify remote bytes by hash, deliver links
```

---

## Honesty ledger for this skill itself

Everything labelled **verified** here was executed in the reference sandbox and has an
artifact or a measurement behind it. Items labelled **inspected** were read but not run.
Items labelled **blocked**, **untested** or **roadmap** are exactly that. Where an older
project document is now superseded (notably `research/ENVIRONMENT.md`'s "no WebGL" claim,
overturned in Round 9), this skill says so explicitly rather than silently repeating it.
See [01-history.md](references/01-history.md) and [12-portability.md](references/12-portability.md).
