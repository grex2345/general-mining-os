# 01 · Complete project history (Rounds 1–11)

Why this matters: the engine's shape is the result of eleven rounds of measured failures and
corrections. Knowing *why* a module exists prevents you from "simplifying" away something that
was added to fix a real defect.

**Source of truth:** `research/ROUND*.md`, `research/RECOVERY_ROUND7.md`, `research/ledger.json`,
and the git log. This page indexes them; it does not replace them.

---

## The commit ladder

| Commit | Round | What landed |
|---|---|---|
| `5f2f35a` | base | Next.js mining-radar app only — no animation code |
| `8e9701a` | 1 | Research: discovery + evaluation of programmatic video skills |
| `ebd706f` | 1 | Working video pipeline, automated QA, thumbnails, metadata, YouTube module |
| `fe01c26` | 1 | Audio: real pauses, conditioned voice, textured bed |
| `7d59e0d` | 1 | First rendered deliverables |
| `68c7c01` | 2 | zach-d-films + vsim inspected; software 3D layer |
| `c9cc622` | 2 | Verified inspection-capability matrix; style-reference analysis |
| `42a8a15` | 2 | Permanent research workflow (ledger/kb.mjs), browser render cell, look-dev |
| `9293bef` | 3 | 2D vector bean-cartoon engine + expression/pose sheets |
| `147e415` | 3 | Round 3 report: style correction, approach comparison |
| `abf4856` | 4 | Low-poly cinematic engine, screen-space staging, procedural sound |
| `c1964fd` | 5 | 26-bone character rig, cinematics, Piper neural voice, lip-sync |
| `5ee0bc9` | 6 | Implicit-body character, real shadow map, composited face, measured alignment |
| `2db228b` | 6 | Comparison-sheet filename fix (tip of the previous agent's branch) |
| `a8adc54` | 7 | **Recovery**: ff-merge `2db228b`, reconstruct Rounds 1–6, ingest MASTER PROMPT |
| `fd6c990` | 7 | Tanjiro experiments: 2D short (55 s) + 3D short (22 s), both QA-pass |
| `1a10877` | 8 | Study 3 reference videos, motion-graphics research, tested kinetic primitives |
| `c060aef` | 9 | Drive-wide research, Stick3D skill study, tested AI-TTS pipeline, SwANGLE validated |
| `83c792b` | 9 | Readiness: end-to-end integration proof + honest readiness assessment |
| `a0fee33` | 10 | English default + ported reference-architecture 3D pipeline |
| `4c7eae0` | 11 | Production layer + 36 s multi-scene English film |

### The recovery lesson (Round 7, important for any inheriting agent)

The incoming agent was told the previous work was lost. It was not. The local checkout had
**one commit**; `git ls-remote origin` revealed a *second* remote branch carrying 13 commits of
Rounds 1–6. Because that tip was a direct descendant of the session base, it was brought in with
`git merge --ff-only 2db228b` — **nothing rewritten, deleted or recreated**.

> **Rule:** before declaring work lost, run `git ls-remote origin` and look at *all* branches.
> Reconstruct by fast-forward, never by rebuilding from a summary.

---

## Round 1 — research + the first working pipeline

- **Scale of research:** 724 repos discovered, 54 inspected, 801 `SKILL.md` files indexed.
- **Built `studio/`:** evidence bundles → rule-based director (storyboard, VideoIR) → measured
  voice-fit → Skia-canvas frame renderer → procedural music/SFX → meSpeak voice → captions/SRT
  → automated evaluation gate → thumbnail + metadata + YouTube module (upload never tested —
  no credentials).
- **Shipped:** `mining-weekly-01.mp4` (42.5 s), `energy-01.mp4` (31.6 s). Both scored 100/100
  on the automated gate, ≈ −15 LUFS.
- **The lesson that shaped everything after:** sampling frames of the *already-approved*
  100/100 output exposed two defects the score missed — a caption box overlapping the chart's
  x-axis at t≈6.8 s, and a ~6 s near-static scene. **A passing automated score is not quality.**
  Both became permanent QA gates (text bounding-box intersection; frame-difference motion floor).

## Round 2 — the research system + a browser

- **Permanent workflow:** `research/WORKFLOW.md` + `research/ledger.json` enforced by
  `research/tools/kb.mjs`. The CLI *refuses* `tested` without evidence, `integrated` without
  evidence **and** an on-disk artifact, `rejected` without a reason. Prose cannot upgrade a status.
- **Environment measured, not assumed:** 2 CPU cores, 3 GB RAM, Python 3.11, Node 22.
  Chromium 158 obtainable via `@sparticuz/chromium` (the binary ships *inside the npm tarball*,
  which is why it works where CDN downloads fail). DOM/CSS/canvas2d/GSAP → MP4 at ~68 ms/frame.
- **WebGL believed impossible** (7 flag sets, 3 Vulkan ICDs, `EGL_NOT_INITIALIZED`).
  ⚠️ **This conclusion was later overturned in Round 9.** `research/ENVIRONMENT.md` still carries
  the old claim; the ledger record `webgl-swiftshader` is marked rejected but
  `swangle-headless-webgl` is tested-and-working. Trust the newer record.
- **Look-dev layer** in `render3d.mjs`: LIGHT_RIG specular from explicit emissive planes, lathe
  volumes, bloom, grade — reproducing a "broad stretched specular on metal" without WebGL.

## Round 3 — style correction: the reference is 2D vector

The viral reference frame was **flat 2D vector, not shaded 3D**. Verified by reading its
construction: self-coloured outlines (darkened fill, never black ink), flat fills with at most
one hard shadow tone, skin flat with *no* shadow tone. Built `cartoon.mjs`: 9-expression face
table, 2-bone IK, walk cycle, yaw, head ≈ 42 % of figure. 171–178 ms/frame at 1080×1920.
**9 defects found by viewing and fixed.**

> **Lesson:** identify the reference's actual construction before choosing an engine. Two
> rounds of 3D shading work were chasing a look that was flat vector all along.

## Round 4 — low-poly cinematic engine

`lowpoly.mjs` software rasteriser (camera, boxes/cones, terrain, near-plane clipping, painter's
algorithm + **terrain pre-pass**), `vfx.mjs` (light shafts, haze, motion blur, PS1 dither, Verlet
cloth), screen-space staging (`stageAt`). **36.7 ms/frame** at 360×640→3× upscale; 172 ms native
1080. 12 defects found and fixed. `sounddesk.mjs`: 10-cue synthesised soundtrack, measured peak
−1.5 dBFS, 0 clipped samples.

> **Two hard-won rasteriser rules:** terrain must be a *separate pre-pass* (painter's algorithm
> cannot interleave a ground plane with objects standing on it), and near-plane clipping is
> mandatory or the ground tears open in front of the camera.
> **The resolution ladder is the biggest CPU lever:** render small, upscale nearest-neighbour.

## Round 5 — character rig, cinematics, neural voice

`character3d.mjs` (procedural mesh, 26-bone skeleton, FK + analytic two-bone IK, aimBone,
expression space, IPA visemes), `animation.mjs` (easing, noise, gait, jump, impact, idle, camera
shake/move, blink), `cinema.mjs` (DOF, motion blur, bloom, grain, CA, `fitFov` lens solver,
letterbox, speed lines, impact flash, grade). **Piper neural TTS** (`en_US-amy-medium`, MIT
weights vendored in a GitHub repo) + espeak-ng word/IPA timing.

**8 bugs found and fixed**, including: 54 black frames from a shadowed canvas variable;
chromatic aberration turning the picture magenta; feet cropped in three consecutive framings.
~925 ms/frame combined at 1080×1920. Honest limit recorded: alignment was a *proportional
estimate*, not forced.

> **Lesson:** feet must be IK targets, not joint angles — angle-driven legs skate. Arm poses
> must *also* be IK targets. And hand-tuning eye/fov never converges; solve it (`fitFov` binary
> search) plus an explicit distance rule.

## Round 6 — visual quality, and honest "still wrong" lists

`implicit.mjs` (SDF fields + surface nets with Newton refinement), `raster3d.mjs` (G-buffer
rasteriser, shadow map + PCF, AO, palette remap), `char6.mjs` (implicit body, 63 bones,
2D-composited face at rig anchors). **8 defect classes** found by isolated renders and fixed:
shadow bias darkening lit surfaces, in-place palette remap corrupting multi-object scenes,
fractional supersampling corrupting frames, inverted facing test, quantised vertices, ragged
material boundaries, shoes/hands/face, and a mouth whose `open` parameter was inverted.
`align.py`: energy-island word alignment measured from the waveform (replacing Round 5's estimate).

The report ends with an explicit **"what is still wrong"** list (mannequin read, smooth hair cap,
open-oval eyes, non-flat shading, prong fingers, sharp knee fold, no cloth motion, mouth-only
lip-sync). **This practice — publishing your own remaining defects — is mandatory.**

## Round 7 — recovery + two full shorts under the MASTER PROMPT

Recovered Rounds 1–6 (above), ingested the 23-page **ANIMATION MASTER ENGINE** spec, and produced
two shorts on the existing engines: 2D stickman (55.23 s) and 3D low-poly (21.63 s), both QA-pass.

**7 defects found and fixed**, the most instructive being **repeated freezes at wide-shot opens**:
a pure ease-in-out camera move has *zero initial velocity*, so the first frames are pixel-identical
and `freezedetect` rejects them. Fix: blend a linear creep (`0.28k + 0.72·ease`), add always-on
micro-handheld, add a linear zoom creep from frame 0 (`fov·(1−0.06k)`), and raise grain 0.05→0.07
so flat sky/snow survives CRF-17 compression. Also: PNG encode dominated frame cost — switching
intermediates to JPEG q92 gave a **5.3× speedup** (842 → 159 ms/frame).

## Round 8 — reference forensics + motion graphics

Downloaded and analysed three reference videos from the user's Drive (V1 3D drama; V2/V3
@Silenthys 2D anime-science explainers). Measured: 60 fps, no hard cuts, eased graphic beats
every 2–4 s, word-karaoke, counters, **perpetual backdrop** (V2 had 0 freezes *because* the
background always moves), −14 LUFS.

Researched the toolchain behind the genre (Remotion, Manim/ecmanim, video-talkcraft's 7-layer
anti-PPT camera + 108 motion recipe cards, iart motion-skills, Whisper→ASS karaoke). Built and
tested `kinetic.mjs`: `interpolate/spring/pulse/entrance/exit`, `karaokeCaption`,
`animatedCounter`, `rayBackdrop`, `glassCard`.

> **Lesson:** the difference between amateur and professional was *not* mesh fidelity. It was
> continuous motion, eased beats, word-synced captions, and a background that never freezes.

## Round 9 — the two breakthroughs

**(a) Headless WebGL2 works.** The Round-2 dead-end was overturned: `@sparticuz/chromium` +
SwiftShader ANGLE + the **bundled AL2023 nspr/nss libs** (auto-extracted only on Amazon Linux,
so on Debian you must extract them yourself) give WebGL2 and three.js on CPU. Verified renderer
string: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))`. Recipe: `studio/swangle_setup.sh`.

**(b) A real, tested audio pipeline.** `audiopipe.mjs` with **real forced alignment**:
English → pocketsphinx (matches acoustic onsets: `pottery@0.17s`, `One@2.60s` vs silence-end
2.612 s); Darija/Arabic → whisper.cpp DTW + Needleman-Wunsch script alignment. whisper-small
genuinely recognises Darija; pocketsphinx on Darija outputs nonsense English.
Three whisper gotchas cost real debugging (see [10-troubleshooting.md](10-troubleshooting.md)).

Also: Drive-wide inventory (33 files), the **Stick3D-Pack-v4** skill studied and its rules
vendored to `research/references/stick3d/`, five new reference videos analysed, and the
**readiness proof** `integration-smoke.mp4` (5.000 s, 0 black/0 freeze, −13.89 LUFS) combining
3D toon + Darija TTS + word-synced RTL captions + ducked music.

The readiness report honestly separated **proven capability** from **missing polish**, and named
the one dependency outside the agent's control: Darija voice naturalness needs the user's ear.

## Round 10 — English default + the reference architecture ported

**User correction:** videos are **English by default**; Moroccan Darija is only the chat
language. `audiopipe.DEFAULT_LANG='en'`; `alignWords` routes English → pocketsphinx with a
whisper fallback; `narrationBundle()` codifies script → voice → loudnorm → align → karaoke.

**The quality leap:** reading the pack's source revealed that the references are **2D canvas
stick puppets on upright billboards inside a 3D toon world** — *not* fully-3D characters.
Ported `puppet2d.js` (full acting vocabulary) + `stickworld.js` (toon primitives, textures,
shadows, billboard, cineCam). Proof: `english-integration.mp4` (8.67 s, 0 black/0 freeze,
−13.62 LUFS) with acting beats matched to narration. ~263 ms/frame.

## Round 11 — the production layer

Built on Round 10 without replacing it: `worldkit.js` (25+ props, ground detail, ornate lathe
masterpiece vase, atmosphere, lighting presets, Catmull-Rom camera), `actor.js` (distance-driven
walk, idle micro-motion, 12 gesture recipes), `film_potter.js` (9-shot director),
`r11_render.cjs` (transition compositor), `score_world.mjs` + `sfxkit.mjs` (warm score, 13 SFX,
ducking mixer).

**Delivered:** `the-boy-who-chose-clay.mp4` — 36.0 s, 9 scenes, 1080 frames, 519 ms/frame
(561 s render), −14.7 LUFS / TP −3.98, 0 unintended black, 0 freezes.

Five defects were found by viewing mid-shot frames and fixed *before* the full render:
`pose.t` missing, `K.box` vs `W.box`, Group material access, portrait framing putting characters
outside the frame, empty foregrounds, and an over-exposed reveal. All are catalogued in
[10-troubleshooting.md](10-troubleshooting.md).

---

## What is proven vs. what is not (state at `4c7eae0`)

**Proven end-to-end, with artifacts:** headless WebGL2/three.js rendering; 2D-puppet-in-3D-world
architecture; rich props/environments; continuous acting and locomotion; cinematic camera;
in-render transitions; English AI narration; precise English forced alignment; whisper Darija
alignment; ASS karaoke burn-in; procedural score and SFX; ducked mixing; loudness normalisation;
encode/mux; black/freeze/loudness QA; byte-verified delivery.

**Inspected but not run here:** the Stick3D Remotion runtime itself (its *patterns* were ported
and its `--gl=swangle` CPU claim independently validated); Remotion; Manim/ecmanim; vsim's
film3d pipeline; Rive.

**Tested and blocked in this sandbox:** edge-tts (`speech.platform.bing.com` refused);
HuggingFace-hosted weights (kokoro-js, DarijaTTS, XTTS); GitHub *release assets*; apt.

**Roadmap, not built:** 60 fps option; physics action recipes (throw/pickup/eat/fight) beyond the
current gesture set; a look-dev colour-grade pass on the toon path; 60–90 s formats; automated
caption-sync QA gate; native Darija TTS.
