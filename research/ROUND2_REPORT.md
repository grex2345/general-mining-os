# Round 2 — building the research system, and what it immediately found

Date: 2026-11-25 · branch `arena/9d597f99-general-mining-os`

This round was about establishing a permanent workflow (the ask), and then letting that
workflow do real work immediately — on the reference already in hand.

## Scoreboard

| | count |
|---|---:|
| ledger records | **19** |
| discovered | 5 |
| inspected | 8 |
| tested | 2 |
| integrated | 3 |
| rejected (with reason) | 1 |
| environment probes run this round | 21 |
| experimental renders produced | 4 stills + 2 clips |
| final videos | **0** (not approved, not started) |

Status meaning is enforced by code: `tested` cannot be set without evidence, `integrated`
cannot be set without an evidence line *and* an artifact that exists on disk.

## What the workflow found that I had already got wrong

Three corrections, all from following step 3/4 (find the original, inspect the source) on a
reference I thought I had finished with:

**1. The uploaded kit was incomplete.** The repo tree has **111 entries**. The upload held
the packaging layer only. Missing: `engine/src/{human,materials,props,textures,anim,shots,main}.js`,
`render.mjs`, `index.html`, and 13 font binaries. Reading those files is what produced every
real insight this round.

**2. Its licence is MIT.** GitHub reports `NOASSERTION`; decoding `LICENSE` shows a plain
MIT licence, Copyright (c) 2026 Artem Novitckii.

**3. The look does not come from modelling.** From `main.js`, in order of impact:
a hand-built **PMREM softbox** (three emissive planes at intensity 3.2 / 1.6 / 1.0, prefilted)
gives the broad directional metal highlight; then BokehPass DOF; then UnrealBloom at
threshold 1.6; then a custom grade (aspect-compensated vignette + per-frame grain); plus a
triple-layer caption shadow. Their characters are `LatheGeometry` over a smoothstep radius
profile, and every texture is procedural canvas2d from a seeded RNG. They render at
**720×1280**, not 1080×1920.

My round-1 conclusion ("the gap is not mesh fidelity") was directionally right but arrived
at without the source. Now it is evidenced per line.

## The big environment finding: a browser exists here

I had recorded "no Chromium, no Playwright, cannot screenshot websites" as fact. That was
wrong, and the workflow's step 6 (follow the dependencies) is what broke it.

`anim.py` shells out to `hyperframes@0.8.34`. Following that:

- `hyperframes` installs from npmjs (with `--ignore-scripts`, because its optional
  onnxruntime postinstall fetches a CUDA tarball from a blocked host).
- It needs puppeteer + a Chromium. `@sparticuz/chromium` ships a 227 MB binary **inside its
  npm tarball** — designed for serverless, which is exactly our constraint.
- It fails to start: `libnspr4.so` missing, and `apt`/`deb.debian.org` are unreachable.
- Both `libnspr4.so` and `libnss3.so` are inside that same package's `al2023.tar.br`, which it
  only unpacks when it thinks it is on Lambda. Decompress, extract, set `LD_LIBRARY_PATH`.
- **Chromium 158.0.8127.0 runs.** DOM, CSS, `@font-face`, `background-clip:text`,
  `backdrop-filter`, `box-shadow`, SVG, canvas2d all composite correctly.

Then the render contract: `data-composition-id` / `data-width` / `data-height` /
`data-duration` on the root, and a **GSAP timeline** registered on
`window.__timelines[id]` (a function does not work — the runtime seeks timeline objects).
Rendered a 2 s 1080×1920 GSAP clip in 5.0 s wall clock (**~68 ms/frame**) and verified the
animation by viewing an 8-frame strip.

**WebGL is still impossible.** 7 flag combinations, 3 Vulkan ICD configurations:
`eglInitialize SwANGLE failed with error EGL_NOT_INITIALIZED`, `Internal Vulkan error (-3)`.
Recorded as `rejected` so nobody retries it.

Net: **HTML/CSS/GSAP/SVG/canvas2d → MP4 now works in this sandbox.** three.js does not.

## What that made possible, and the limits I kept

All of this is additive. `studio/src/pipeline.mjs` was not touched; the shipped videos are
untouched; the new code is in `render3d.mjs` beyond a clearly marked "look development"
section, plus one new experiment file.

New in `render3d.mjs`: `LIGHT_RIG`, `specular`, `shadeFacePhysical`, `drawGlow`,
`drawImpactRings`, `bloomPass`, `rng`, `drawGrade`, `profileFn`, `lathe`, `drawLatheRing`,
`drawLatheSolid`.

Experiment `studio/experiments/lookdev.mjs` renders three stills, a contact strip and a
30-frame clip at **438–444 ms/frame** at 1080×1920 with 2× supersampling, bloom and grain.

Four defects were found **by looking at the output**, not by reasoning:

| defect | symptom | fix |
|---|---|---|
| stacked ring ellipses | horizontal banding across the body | silhouette fill + vertical gradient + cross-shading |
| `ctx.ellipse` inside the silhouette path | wedge cut out of the torso | draw caps as their own paths |
| bloom threshold too low | metal blown to flat white | threshold 1.5 → 2.6, strength 0.40 → 0.30 |
| flat bottom chord | body looked sliced, not capped | occluding dome cap at the base |

And two API traps worth more than the code, because they cost hours:

- `perspective()` returns a plain **array** `[x,y,z]` and divides x by `aspect`, so a
  narrow sub-panel squashes the subject. Frame full width instead of slicing.
- `@napi-rs/canvas` **aborts the process** on NaN geometry (`sk.rs:3166 unwrap` panic)
  instead of throwing. The "crash inside drawBoxes" was me passing `{project, space}` to a
  function that takes `{width, height, camera}`.

## Honest limits of this round

- The lathe experiment proves the *technique*, not a finished character. It is a torso
  volume with impact FX. No head, no face, no limbs, no rig.
- I still cannot hear audio, and I still cannot watch continuous motion. Every motion
  claim above is from sampled frames (6 fps strips).
- The browser cell is provisioned into `.scratch/` (gitignored, ~1 GB). It is reproducible
  from `research/tools/browser/provision.sh`, not checked in.
- The reference's own pipeline cannot run here (needs WebGL), so its `inspects` status
  stands. Its *techniques* are what got tested.

## Next candidates (from `kb.mjs candidates`)

1. Font shaping in the browser cell — real kerning/wrapping for captions, replacing
   `measureText` guesses. Highest quality-per-hour available now.
2. The reference's `align.py` forced-alignment path — captions locked to word timings.
3. Cel-shading + ink outlines in the Skia path (ink outlines are a depth/normal edge pass,
   no GLSL needed).
4. A TTS route: still blocked on weights, worth one more search for a smaller model that
   fits inside what is reachable.
