# Recovery & State Reconstruction — start of Round 7

Date: 2026-11-26 · Branch: `arena/9b543693-general-mining-os` (this session)
Written by the incoming agent before any new production work, per the handover rule:
*reconstruct the real state first; never claim an artifact was inspected unless it was.*

---

## 1. Where the previous work actually was

The handover said the Git patch was unavailable and the work had to be reconstructed
from GitHub. What I found, by execution:

- The local checkout of `grex2345/general-mining-os` had **one commit** (`5f2f35a`,
  "Cleanup: remove old components and APIs, keep new pro version") — the Next.js
  mining-radar app only. No animation files, no research folder.
- `git ls-remote origin` revealed a second remote branch,
  **`arena/9d597f99-general-mining-os` @ `2db228b`**, not fetched by default.
- That branch carries **13 commits on top of `5f2f35a`** — the entire Rounds 1–6
  history (2026-11-25 13:18 → 2026-11-26 00:20).
- Since `2db228b` is a direct descendant of this session's base commit, I brought the
  full history into the current branch with `git merge --ff-only 2db228b`.
  **Nothing was rewritten, deleted or recreated.** Working tree = previous agent's
  exact Round 6 state.

Commit ladder (oldest → newest):

| commit | round | content |
|---|---|---|
| `8e9701a` | 1 | research: discovery + evaluation of programmatic video skills/toolkits |
| `ebd706f` | 1 | studio: working video pipeline, automated QA, thumbnails, metadata, YouTube module |
| `fe01c26` | 1 | studio(audio): real pauses, conditioned voice, textured bed; fit pass matches mixer |
| `7d59e0d` | 1 | studio: rendered deliverables (mining-weekly-01, energy-01) |
| `68c7c01` | 2 | research(3d): zach-d-films skill + vsim inspected; software 3D layer |
| `c9cc622` | 2 | research: verified inspection capability matrix + style-reference analysis |
| `42a8a15` | 2 | research: permanent workflow (ledger/kb.mjs) + browser render cell + look-dev |
| `9293bef` | 3 | character: 2D vector bean-cartoon engine + expression/pose sheets |
| `147e415` | 3 | research: round 3 report — style correction, approach comparison |
| `abf4856` | 4 | low-poly cinematic engine, screen-space staging, procedural sound design |
| `c1964fd` | 5 | character rig (26 bones, IK), cinematics, Piper neural voice + lip-sync |
| `5ee0bc9` | 6 | implicit-body character, real shadow map, composited face, measured voice alignment |
| `2db228b` | 6 | comparison sheet filename fix (tip of previous branch) |

No Round 7 plan file exists in the repository; Round 6's "what is still wrong" and
"recommended next" lists are the de-facto Round 7 seed. No Tanjiro script or
Tanjiro-specific reference exists anywhere in the repo (searched all text files for
`tanjiro|demon slayer|kimetsu|water breathing` — zero hits). The handover says those
will be supplied separately; they had not arrived at reconstruction time.

## 2. What each round actually implemented (from reports + code + artifacts)

**Round 1 — research + first pipeline.** 724 repos discovered, 54 inspected, 801
SKILL.md indexed; HyperFrames contract tested (lint-level). `studio/` built:
evidence bundles → director (rule-based storyboard, VideoIR) → measured voice-fit →
Skia-canvas frame renderer → procedural music/SFX → meSpeak voice → captions/SRT →
automated evaluation gate → thumbnail + metadata + YouTube module (upload never
tested: no credentials). Two complete videos shipped and frame-inspected:
`mining-weekly-01.mp4` (42.5 s) and `energy-01.mp4` (31.6 s), both 100/100 QA,
≈ −15 LUFS. Known defects found by frame sampling: caption/axis collision at t≈6.8 s
and a ~6 s near-static scene in mining-weekly — both became QA gates.

**Round 2 — research system + browser cell.** Permanent workflow (`research/WORKFLOW.md`,
ledger enforced by `kb.mjs`: tested/integrated require evidence + artifact on disk).
Environment measured: 2 cores, 3 GB, **no WebGL** (7 flag sets / 3 Vulkan ICDs),
Chromium 158 via `@sparticuz/chromium` **works** for DOM/CSS/canvas2d/GSAP → MP4
(~68 ms/frame); three.js cannot run. Look-dev layer in `render3d.mjs` (LIGHT_RIG
specular, lathe volumes, bloom, grade) at 438 ms/frame. 4 defects found by viewing.

**Round 3 — 2D bean-cartoon engine.** Style correction: the viral reference
(`image-3.png`) is flat 2D vector, not shaded 3D. `studio/src/cartoon.mjs`:
9-expression face table, 2-bone IK, walk cycle, yaw, self-coloured outlines, one hard
shadow tone, head ≈ 42 % of figure. 171–178 ms/frame at 1080×1920. 9 defects found by
viewing and fixed. Artifacts: char-hero/expressions/poses/sheet PNGs + 150-frame
`char-preview.mp4`.

**Round 4 — low-poly cinematic engine.** `studio/src/lowpoly.mjs` software rasteriser
(camera, boxes/cones, terrain, near-plane clipping, painter's algorithm + terrain
pre-pass), `vfx.mjs` (light shafts, haze, motion blur, PS1 dither, Verlet cloth,
ambience), `scenes/lastTrain.mjs` (night station, dog, lamp, pines) staged in screen
space (`stageAt`). 36.7 ms/frame end-to-end at 360×640→3×; 172 ms native 1080.
12 defects found and fixed. `sounddesk.mjs`: 10-cue synthesised soundtrack, measured
(peak −1.5 dBFS, 0 clipped samples). Artifacts incl. two MP4 moves + build-up strips.

**Round 5 — character + cinematics + voice.** `character3d.mjs` (procedural mesh,
26-bone skeleton, FK + analytic two-bone IK, aimBone, expression space, IPA visemes),
`animation.mjs` (easing, noise, gait walk/run, jump, impact, idle, camera shake/move,
blink), `cinema.mjs` (DOF, motion blur, bloom, grain, CA, fitFov lens solver,
letterbox, speed lines, impact flash, grade). `voice.py`: **Piper neural TTS**
(en_US-amy-medium, MIT weights via GitHub) + espeak-ng word/IPA timing;
`voice_setup.sh` rebuilds the stack. 8 bugs found and fixed (incl. 54 black frames
from a shadowed canvas variable; magenta CA; feet-cropping → fitFov + distance rule).
~925 ms/frame combined scene at 1080×1920 (internal 480×853). Artifacts: walk,
impact, turntable, lip-sync line, combined scene MP4s + stills + timing JSONs.
Honest limit: alignment was a proportional estimate, not forced.

**Round 6 — visual quality.** `implicit.mjs` (SDF fields + surface nets with Newton
refinement), `raster3d.mjs` (G-buffer rasteriser, shadow map + PCF, AO, palette
remap), `char6.mjs` (implicit-body figure, 63 bones, 2D-composited face at rig
anchors, FACE expression numbers). 8 defect classes found by isolated renders and
fixed (shadow bias, in-place palette remap, fractional ss, inverted facing test,
quantised vertices, ragged material boundaries, shoes/hands/face, mouth `open`
inverted). `align.py`: energy-island word alignment measured from the Piper waveform
(replaces Round 5's estimate; still not a phoneme aligner). 337–402 ms/frame at
540×960 ss2 with 76 624 triangles. Artifacts: hero, expression sheet, 36-frame
turntable, walk MP4, reference comparison, voiced lip-sync MP4, alignment JSONs.
Still wrong by its own report: mannequin read, smooth hair cap, open-oval eyes,
non-flat shading, prong fingers, sharp knee fold, no cloth motion, mouth-only
lip-sync.

## 3. What I verified myself in THIS sandbox (2026-11-26)

Executed, not assumed:

- `git merge --ff-only` → full previous tree present; `git status` clean.
- Read all round reports, WORKFLOW, ENVIRONMENT, INSPECTION_CAPABILITIES,
  STYLE_REFERENCE_NOTES, PHASE2_REPORT (head), RESEARCH_LOG (tail), ledger stats
  (32 records: 15 integrated, 2 tested, 8 inspected, 6 discovered, 1 rejected).
- **Viewed directly**: `uploads-2026-11-25/image-1.png` (artem skills contact sheet),
  `image-2.png` (YouTube "Miko — What If Goku Trained You for 1 Year?" — the
  anime-crossover stick-animation genre context), `image-3.png` (bean-cartoon
  reference), `image-4.png` (dark 3D story short from zerotales.stories),
  `artifacts/characters/char-sheet.png`, `artifacts/round4/exp-lowpoly-1080.png`,
  `artifacts/round5/exp5-scene.png`, `artifacts/round6/01_character_hero.png`.
  All match their reports' descriptions.
- `cd studio && npm install --ignore-scripts` → OK.
- `node cli.mjs doctor` → ffmpeg/ffprobe (npm-bundled) OK, fonts OK,
  **7/12 adapters available** (native-canvas, procedural-audio, mespeak-tts,
  ir-captions, ffprobe-eval, canvas-thumbnail, youtube-mock).
- `@napi-rs/canvas` renders and encodes PNG (test image written).
- `bash voice_setup.sh` → espeak-ng + piper + onnxruntime + amy weights (282 MB).
- `python3 voice.py` → **Piper synthesised a test line successfully** (piper 1.8,
  en_US-amy-medium). Audio exists as a file; I have not heard it (cannot).
- Extracted the attached **ANIMATION MASTER ENGINE.pdf** (23 pages) to text
  (`research/uploads-2026-11-26/MASTER_PROMPT.txt`) and read it in full.

NOT verified / not available:

- The browser render cell (`.scratch/`, ~1 GB) is gitignored and absent here;
  reproducible via `research/tools/browser/provision.sh` if needed. Not required for
  Round 7's canvas path.
- `research/clones/` (2.8 GB) gitignored, absent. Reference skill sources that matter
  are already vendored under `research/references/` and `research/skills/`.
- The **Tanjiro script and Tanjiro visual references** mentioned in the handover are
  not in the repository and had not been supplied yet.
- I cannot hear audio or watch continuous motion; all audio claims are measurements,
  all motion claims come from sampled frames.

## 4. The MASTER PROMPT, read as one mission

The 23-page PDF contains two workflows with one unified style/pacing doctrine:

1. **Coding-agent workflow (Steps 1–18):** autonomous animation director; code-only
   production (originally Three.js + headless browser); flat 2D hand-drawn stickman
   characters (canvas billboard cards) in a colourful toon world with ink outlines,
   painted textures, DOF, cinematic camera; 1080p 30 fps 9:16/16:9; voiceover + music
   + SFX; script ≈ 3.7 words/s; hook→setting→escalation→pivot→twist; shot plan with
   **no shot > 90 frames (3 s)**, scene change every 3–4 s, **no consecutive repeated
   camera angle**, every hold creeps, smootherstep glides, 3–5° rolls on drama,
   7-frame impact shake, twist = music stop + low hit + push-in with roll; characters
   face movement direction, walk phase drives legs (no gliding), idle breathing +
   blink on every character (never frozen > 4 frames), secondary motion everywhere,
   anticipation→action→settle; look-check contact sheet before full render; sound
   design with music −6 dB under voice, SFX peaks ≤ 0.7× voice; finish at −14 LUFS,
   −1 dBFS limiter, H.264 + AAC; QA rejects frozen spans ≥ 0.4 s and black frames;
   deliver MP4 + 3 thumbnails + title/description/tags.
2. **Manual Google-Flow workflow:** same style bible (pure-white imperfect heads,
   thick navy-black outlines, black stick limbs, dot hands, no shoes, no nose, no
   face shading, outfit = body blob; richly illustrated 2D worlds, ink outlines,
   painted textures, atmospheric haze), character sheets first for consistency,
   15 s clips with 3–5 internal scene changes, same pacing rules.

Environment reconciliation: the PDF's Three.js/Playwright path cannot run here
(no WebGL — proven in Round 2 and re-recorded in the ledger). The previous agent
already solved this with the software rasterisers (`lowpoly.mjs`, `raster3d.mjs`)
and the canvas2d engine, which satisfy the same visual contract. Round 7 therefore
keeps the established architecture and applies the MASTER PROMPT's style, pacing,
camera, audio and QA rules to it.

## 5. Round 7 mission (this session)

Continue the Tanjiro experiments on the existing engines:

- **Exp 7A (2D):** stickman-style Tanjiro short per the MASTER PROMPT style bible,
  multiple environments (mountain dawn, training yard, river, snowy night), water-
  breathing VFX (ribbons, dragon, splash, particles), dynamic camera with cuts ≤ 3 s,
  Piper narration + measured alignment + procedural score + frame-locked SFX,
  captions, QA gates, thumbnails, metadata.
- **Exp 7B (3D):** low-poly cinematic Tanjiro scene(s) on `lowpoly.mjs` +
  `character3d.mjs` with Tanjiro palette, katana, water-dragon effect, snowy forest,
  multi-shot camera coverage, voice + sound, QA.
- Compare outputs, find defects by viewing frames, fix, re-render, report honestly.

Because the original Tanjiro script has not arrived, Round 7 starts from an
**original working script written in the target genre** (clearly labelled as such);
the pipeline is script-driven so the user's script can replace it without rework.