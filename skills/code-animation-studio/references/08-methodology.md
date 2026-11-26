# 08 · Methodology — how this knowledge was acquired

This is the part that transfers the *ability to learn*, not just the results. Every principle below
is illustrated with something that actually happened in this project.

---

## 1. The evidence ladder (enforced by code, not by prose)

`research/WORKFLOW.md` defines five statuses; `research/tools/kb.mjs` **refuses** to record a
status without its proof:

| Status | Means | CLI requires |
|---|---|---|
| `discovered` | found in a search, nothing read | url |
| `inspected` | source/docs/renders actually read | url + finding |
| `tested` | **executed here**, with a command and a result | **evidence** |
| `integrated` | code landed in the engine and works | **evidence + an artifact that exists on disk** |
| `rejected` | tried or evaluated and ruled out | **reason** |

```bash
node research/tools/kb.mjs add --id X --name "X" --kind engine --status tested \
  --url https://... --evidence "ran cmd; output Y; 3 frames rendered at 68ms" --finding "..."
node research/tools/kb.mjs validate     # fails loudly if any record violates the ladder
node research/tools/kb.mjs report       # regenerates RESEARCH_LOG.md (never hand-edit it)
```

At the time of writing: **64 records — 6 discovered, 17 inspected, 6 tested, 33 integrated,
2 rejected; 39 carry evidence.** (The 64th is this skill itself.)

**Why this matters:** an agent's natural failure mode is to write "X supports Y" after reading a
README. The ladder makes that impossible to record as `tested`. The distinction between
"the README claims CPU rendering" and "I rendered 3 frames on CPU here" is the whole difference
between a research report and engineering knowledge.

**Concrete example:** the Stick3D pack claims `--gl=swangle` CPU rendering. We never ran its
Remotion runtime. So `stick3d-pack` is recorded **inspected**, with the finding *"Runtime not run
here, but its --gl=swangle CPU-render claim VALIDATED via swangle-headless-webgl"* — and a separate
record `swangle-headless-webgl` is **tested** with our own measurement. Two records, two honest
claims, no conflation.

---

## 2. Researching unfamiliar technology

**The sequence that works:**

1. **Search broadly, then go deep.** Round 1 discovered 724 repos across 54 cached GitHub
   searches, then cloned and structurally inspected 33, indexing 801 `SKILL.md` files. Breadth
   first prevents anchoring on the first result.
2. **Read the source, not the marketing.** `research/tools_inspect.py` extracts dependencies,
   engine signals and skill files from each clone; `tools_apiprobe.py` reads trees and `SKILL.md`
   from repos too large to clone.
3. **Check the licence and the last push date** before investing time.
4. **Find the one file that contains the actual idea.** Reading `puppet.ts` and `toon.tsx` in the
   Stick3D pack revealed the entire architecture (2D puppet on a billboard in a 3D world) in
   ~20 minutes. That single insight was worth more than the previous five rounds of 3D character
   work.

**Concrete example — the style correction (Round 3).** Two rounds were spent building shaded 3D
characters to match a viral reference. Then the reference frame was actually *read*: self-coloured
outlines (darkened fill, never black ink), flat fills, at most one hard shadow tone, skin with no
shadow tone at all. It was **flat 2D vector**. The engine was wrong for the target. Round 3 built
`cartoon.mjs` and the look matched immediately.

> **Rule:** identify the reference's actual construction *before* choosing an engine. A beautiful
> renderer aimed at the wrong style is wasted work.

---

## 3. Evaluating whether a tool is worth integrating

Five questions, in order. A "no" at any step usually ends it.

1. **Does it solve a gap we actually measured?** Not "is it popular". Round 8 identified specific
   gaps against the reference videos (word-karaoke, counters, perpetual backdrop) and built
   `kinetic.mjs` to close exactly those.
2. **Can it run in this environment?** Check *every* network dependency, including runtime weight
   downloads. `edge-tts` installs fine and then fails: `speech.platform.bing.com:443` is refused.
   kokoro-js installs fine and then can't fetch 327 MB from HuggingFace. Both were **tested and
   rejected**, with the reason recorded.
3. **What does it cost per frame?** Measured, not estimated. The resolution ladder
   (360×640 → 3× upscale) took low-poly from 172 ms to **36.7 ms/frame** — a 4.7× win that no
   library could have matched.
4. **Can we take the idea without the dependency?** This is the highest-leverage move in the whole
   project. We did not adopt Remotion, Manim or the Stick3D runtime. We **ported their patterns**
   into our own modules: `interpolate`/`spring` from Remotion, `camAt` Catmull-Rom from the pack's
   `extra.tsx`, the puppet/billboard architecture from `puppet.ts`/`toon.tsx`, the QA and
   anti-template rules from its markdown. Zero new runtime dependencies, full benefit.
5. **Does it fit the existing architecture additively?** If integrating requires replacing working
   code, it is not worth it. Every round added modules alongside; nothing was thrown away.

**Concrete example — the whisper model.** GitHub *release assets* are blocked by egress, but repo
*files* are not. The 487 MB `ggml-small.bin` was fetched as **six file parts (aa–af)** from a
GitHub repo and concatenated, with a SHA-256 check. The "obvious" download path was blocked; the
workaround used only allowed hosts. That is what "understand the environment" means in practice.

---

## 4. Studying reference videos

Never judge a reference from a thumbnail. The Round-8 protocol:

1. **Download the actual file** (Drive connector → `google_drive/`).
2. **Measure it:** `ffprobe` for resolution, fps, duration, bitrate; `loudnorm` for LUFS.
3. **Extract an overview sheet** (1 fps) to see structure.
4. **Extract motion pairs** — frames 0.1 s apart at several timestamps — to see *how much* moves
   between frames. This is the measurement that revealed V2's "perpetual backdrop".
5. **Extract dense sheets around beats** to see the easing and the transition style.
6. **Spectrogram** the audio to see the music/voice/SFX layering.
7. **Transcribe** with whisper to confirm language and pacing.

**What the measurements taught (V2/V3, @Silenthys):** 60 fps; **no hard cuts**; eased graphic beats
every 2–4 s; word-level karaoke; animated counters; a background that is *always* moving (which is
why V2 had **zero freezes**); −14 LUFS. V1 (3D drama) used 0 cuts and red-keyword karaoke.

> **The conclusion that changed the engine:** the gap between our work and the references was
> **not mesh fidelity**. It was continuous motion, eased beats, word-synced captions and a
> never-freezing backdrop. We had been optimising the wrong variable.

**Concrete example — loudness.** Measuring the Darija reference `n2` gave **−14.37 LUFS**, which
matched our −14 target and confirmed the mixing goal was right rather than guessed.

---

## 5. Experiment → hypothesis → measure → improve

The loop, with a real instance of each stage:

**Hypothesis:** "the wide-shot freezes are caused by the camera easing."
**Isolated test:** render only the river shot; run `freezedetect`.
**Measurement:** freeze at 2.33–2.77 s — exactly the first 0.44 s of the shot.
**Diagnosis:** a pure ease-in-out has zero initial velocity, so the first frames are pixel-identical.
**Fix:** blend a linear creep `0.28k + 0.72·ease(k)` + always-on micro-handheld.
**Re-measure:** freeze gone at the river… **but still present at the boulder shot (9.47 s).**
**Second diagnosis:** a distant small subject + slow move compresses to near-identical frames at
CRF 17 — the *encoder* was discarding the motion that existed.
**Second fix:** linear zoom creep from frame 0 (`fov·(1−0.06k)`), stronger handheld, closer camera,
earlier boulder split, and grain 0.05 → 0.07 so flat sky/snow survives compression.
**Result:** 0 black, 0 freezes — PASS.

> **Two lessons:** (a) a fix that resolves one instance may not resolve the class — re-measure
> everywhere; (b) the defect can live in the *encoder*, not the renderer. Grain is not decoration;
> it is what makes motion survive compression.

**Isolated-render discipline (Round 6):** every one of the 8 defect classes was found by rendering
*one thing alone* — one object, one hand, one mouth — and measuring. The report states: *"Every
entry here was found by rendering an isolated test and measuring, then fixed and re-measured. No
entry is a guess."* When a composite scene looks wrong, decompose it until the failing element is
alone on screen.

---

## 6. Inspecting rendered frames honestly

- **Contact sheets are the primary instrument.** 1 fps for structure; 24-frame sheets for QA;
  mid-shot frames for composition; frame pairs for motion.
- **Always view the image.** Generating a sheet and not opening it is not inspection.
- **Say what you sampled.** "Sampled 24 frames at 1/1.5 fps" — never "watched the video".
- **Audio is measured, never heard.** LUFS, true peak, LRA, waveform, spectrogram, and word-onset
  comparison against measured silence boundaries.
- **Check byte size, not just the stream.** Round 5 produced a 6,354-byte MP4 with a perfectly
  valid `ffprobe` report — and 54 black frames, because a shadowed variable drew to a canvas that
  was never encoded. **`ffprobe` says the container is fine; only pixels tell the truth.**

---

## 7. Distinguishing a technical test from a production

This distinction was an explicit user correction and it is now a rule.

| Smoke test | Production |
|---|---|
| 5–9 s, 1–3 scenes | 30–90 s, 8+ scenes |
| Proves the pipeline is wired | Proves the film is worth watching |
| One render pass | Multiple inspect→fix→re-render loops |
| "0 black, 0 freeze" | Plus: density, acting, framing, exposure, variety, caption legibility |
| Delivered as *proof* | Delivered as *the deliverable* |

`integration-smoke.mp4` (5.0 s) and `english-integration.mp4` (8.67 s) were **correctly labelled as
integration proofs**, and the readiness report explicitly listed what was still missing. Only
Round 11 — 9 scenes, 36 s, three pre-render fix loops — was presented as a production.

> **Never present a smoke test as the quality ceiling.** And never stop at research: the standing
> instruction is to keep developing, testing, improving and producing actual videos.

---

## 8. Recording knowledge so the next agent inherits it

Three layers, all preserved:

1. **`research/KNOWLEDGE_BASE.md`** — the living, human-readable reference. Append a section per
   round; never rewrite history.
2. **`research/ledger.json` + `kb.mjs`** — the machine-readable, evidence-enforced record.
3. **`research/ROUND*_*.md`** — the per-round narrative: what was built, what broke, what is still
   wrong, how to reproduce.

**Append, never replace.** When a conclusion is overturned, add the new record and *say* it
supersedes the old one — do not silently edit the old claim. That is exactly how the WebGL
dead-end is handled: `webgl-swiftshader` stays `rejected` with its original reason, and
`swangle-headless-webgl` is `tested` with the working recipe.

**Publish your remaining defects.** Round 6's "what is still wrong" list (mannequin read, smooth
hair cap, open-oval eyes, prong fingers, mouth-only lip-sync) is more useful to the next agent than
any success claim, because it tells them exactly where to spend the next round.
