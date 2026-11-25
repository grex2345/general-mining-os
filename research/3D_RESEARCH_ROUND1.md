# 3D Cartoon Explainer Research — Round 1

**Date:** 2026-11-25 · **Branch:** `arena/9d597f99-general-mining-os`
**Trigger:** the `/zach-d-films` skill (artemnovitckii/claude-animation-skills, MIT) plus a directive
to research 3D cartoon explainer production and raise quality.

Read `research/PHASE2_REPORT.md` first for the existing pipeline. This document covers only the
new research round. **No final video was generated**, per instruction.

---

## 1. Exact counts (no "searched everywhere" claims)

| Metric | Count |
|---|---|
| Search queries issued | **4** (character animation/rigs, Remotion+three.js, Kokoro/offline TTS, pure-TS rasterizers) |
| Distinct projects surfaced | **14** |
| Inspected — source code read file by file | **2** (`claude-animation-skills`, `vsim`) |
| Inspected — README/docs only | **3** (Remotion, drawcall/animate, ossos) |
| Discovered only (name + one-line capability) | **7** |
| Tested by execution | **2** (`vsim` full build+render, `kokoro-js` dependency resolution) |
| Environment probes | **13** hosts/binaries tested by curl/binary lookup |
| Files I wrote | 4 (`render3d.mjs`, `experiments/scene3d.mjs`, `knowledge_base.json`, this report) |

I did **not** search "everywhere". This is 4 queries and 2 deep code inspections, weighted
deliberately toward depth: both inspected projects were read in full and one was executed.

---

## 2. The decisive environmental finding

Everything in this space renders through **headless Chrome**. This sandbox cannot obtain one:

| Probe | Result |
|---|---|
| `google-chrome` / `chromium` / `chromium-browser` | **none present** |
| `cdn.playwright.dev` (Playwright browser download) | **HTTP 000** |
| `cdnjs.cloudflare.com` (GSAP) | **HTTP 000** |
| `cdn.jsdelivr.net` | **HTTP 000** |
| `headless-gl` (WebGL in Node) | **fails** — node-gyp needs Node headers from `nodejs.org`, TLS disconnect |
| `huggingface.co`, `hf-mirror.com` (model weights) | **HTTP 000** |
| `release-assets.githubusercontent.com` (GitHub release weights) | **HTTP 000** |
| npm registry / github.com | **reachable** |

So WebGL, browser capture, and any model download are all unavailable. **Any architecture that
depends on them cannot be tested here**, and I will not claim otherwise.

### A correction to my own earlier report

I previously wrote that neural TTS was blocked because `onnxruntime-node`'s postinstall downloads
a binary from a CDN. **That was wrong.** Verified now:

```
npm install --ignore-scripts kokoro-js   → 56 packages
find node_modules/onnxruntime-node -name "*.so*"
  → bin/napi-v3/linux/x64/libonnxruntime.so.1.21.0
node -e "require('onnxruntime-node')"    → LOADED ok, version 1.21.0
```

The native runtime ships **prebuilt inside the npm tarball** and needs no download. The only real
blocker is the ~327 MB of Kokoro weights, which exist only on blocked hosts. That is a much
smaller problem: **one file** unblocks a neural voice.

---

## 3. What the uploaded skill actually does (inspected, not assumed)

`claude-animation-skills` is 11 skills over one shared kit. It is genuinely engineering, not
promptware. The parts worth having:

**Lighting recipe** (`template.html`) — this is the single most transferable thing:
```js
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;  // PMREM, intensity .75
key  = DirectionalLight(0xffffff, 2.2)  at (-6, 12, 8)      // key
rim  = DirectionalLight(0xffd9c2, 1.2)  at ( 8,  4, -6)     // warm rim
scene.add(HemisphereLight(0xdfe6ff, 0x1a1b1e, .45))         // sky/ground fill
camera = PerspectiveCamera(26, 9/16, .5, 200)               // long lens = less distortion
```
Materials are all `MeshStandardMaterial` with explicit `metalness`/`roughness` (metal ≈ 1,
roughness .3–.4; plastic roughness .55–.6). Canvas-generated textures are used for screens,
battery stripes and PCB detail — cheap, deterministic detail without external assets.

**Word-timed captions done properly** (`words.py`): it runs Parakeet ASR to get heard word
timings, then re-spells them to the *script* using a `difflib.SequenceMatcher` alignment, and
interpolates any words the recogniser missed. That is a genuinely good technique — it decouples
caption spelling from ASR accuracy. Worth porting the moment a model is reachable.

**Cheap iteration loop**: `--snap 1.0,3.8` renders two stills instead of the whole video, and
`anim.py sheet` produces a contact sheet with Instagram's safe area drawn on it
(top 220 px, bottom 420 px, side 100 px).

**Scale reality:** one skill = one 4.2-second shot. The "29 s example" is a stitched sequence.
This is a shot factory, not a film generator.

---

## 4. vsim — the one project I could actually run

`kunalkushwaha/vsim` (MIT) is "Remotion for real 3D": a **pure-TypeScript software rasterizer**
with per-pixel PBR, PCF shadow maps, 2× supersampling, ACES, deterministic seeded RNG — no GPU,
no Chrome, no node-gyp. That profile is exactly what this sandbox can host, so I tested it.

**It builds and renders here.** Full detail:

| Test | Result |
|---|---|
| `pnpm build` (12 packages) | **succeeded** |
| `examples/01-cube` 640×360 90f | **rendered**, 18.7 s, correct shading + contact shadows |
| `examples/09-manga` (cel + ink) | **rendered** — honest cel shading |
| `examples/21-mouse` (procedural character) | **rendered** — crude primitive character |
| **1080×1920 benchmark, 30 frames** | **61.2 s = 2,040 ms/frame** |
| `--workers 2` vs 1 (640×360, 90f) | 18.7 s → 14.4 s (**1.30×** on 2 vCPU) |

Its own gotcha, worth recording because it cost me time: it shells out to `ffmpeg` **on PATH**.
When absent, the spawn fails and surfaces as `write EPIPE` — a misleading error that looks like a
piping bug, not a missing binary.

**Extrapolation:** a 30 s 1080×1920@30 clip = 900 frames ≈ **30 minutes** single-worker, ~23
minutes with 2 workers. Every pixel is written by JavaScript.

**Decision: adopt the architecture, not the runtime.** vsim's design — software raster → raw RGBA →
ffmpeg pipe — is already what this studio does with Skia. Skia does the rasterising natively, so
we keep the speed and the existing QA gate.

---

## 5. Implemented: a software 3D layer inside the existing pipeline

New file `studio/src/render3d.mjs` (no new dependencies — it draws through `@napi-rs/canvas`):

- look-at view matrix, perspective projection, backface culling
- painter's-algorithm face sorting for axis-aligned boxes
- per-face Lambert key light + hemisphere fill + rim term
- **ACES filmic tone mapping** (ported from the recipe above)
- directional **contact shadows** projected onto a ground plane
- **2× supersampling** with high-quality downsample
- top-face specular sheen so materials read as solid rather than flat

New experiment `studio/experiments/scene3d.mjs`: a turntable studio scene fed through the existing
canvas → `ffmpeg` pipe.

### Measured result

| Path | Resolution | ms/frame |
|---|---|---|
| vsim software engine | 1080×1920 | **2,040** |
| this studio, 3D box layer | 1080×1920 | **123–148** |

**~14× faster**, because Skia rasterises natively instead of looping per pixel in JS.

Rendered: `studio/out/exp-3d.mp4` — 2.0 s, 1080×1920@30, 60 frames, H.264, 0.28 MB.

### Honest QA on that experiment

Inspected a 3-frame strip at full size. **Two real defects found and fixed:**

1. **Framing was wrong twice.** The first pass cropped the subject. The cause was not the height
   I kept adjusting — at 9:16 the frame is **width-bound**: horizontal extent at distance `d` is
   only `2·d·tan(fov/2)·(9/16)`. A 4.6-unit-wide set needs `d ≈ 16.6` to fit. Fixed by making the
   set narrow (2.5 units) and the camera close. **This is a reusable design rule for vertical 3D.**
2. **The plinth read as a floating wedge** because the background had no ground plane. Fixed with
   a large ground slab so contact shadows land on a visible surface.

Remaining weakness, stated plainly: it is **box-only**. No arbitrary meshes, no skeletal rigs, no
texture mapping, no cel shading. It gives depth and material response — it does **not** yet give
you expressive characters. The mouse example from vsim shows how far primitive geometry gets: not
far enough for the reference quality bar.

---

## 6. Ranked candidates (by actual usefulness *in this environment*)

| # | Project | Verdict |
|---|---|---|
| 1 | **vsim** (MIT) | Tested, runs, 14× too slow at production res. **Architecture adopted.** |
| 2 | **claude-animation-skills** (MIT) | Best *craft* found: lighting rig, safe-area QA, ASR-align captions. **Techniques adopted.** Render path unrunnable. |
| 3 | **Kokoro-82M** (Apache-2.0) | Runtime verified working; weights blocked. **Best available voice upgrade, one file away.** |
| 4 | sherpa-onnx (Apache-2.0) | Best ASR/word-timing candidate. Models blocked. |
| 5 | js-renderer / aisa / facet / TinyRenderer | Good shading references; slower than Skia. |
| 6 | @drawcall/animate, ossos | Most promising character systems; need WebGL. |
| 7 | Remotion | Rejected: browser dependency + non-OSI licence. |
| 8 | HyperFrames | Kept as a dormant adapter; activates where Chrome exists. |

---

## 7. What this does NOT solve

Your stated target is *expressive procedural characters, cinematic lighting, fluid animation,
convincing impacts, natural narration*. Honestly:

- **Natural narration is not solved.** The neural voice is identified and wired, but the weights
  are unreachable. This is the single highest-impact unblock and it is one file.
- **Expressive characters are not solved.** Everything that produces them (Three.js + rigs +
  Chrome, or GLB assets with skeletons) needs a browser or GPU this sandbox lacks. My box
  rasteriser is a foundation for props/environments, not characters.
- **Quality gap is real.** vsim's own best character is a sphere-mouse. The reference frames in
  `five-styles.jpg` come from a WebGL pipeline that I cannot execute here.

I will not claim these are close. The defensible claim is narrower: the studio can now render
**real 3D depth and material response** on its existing fast CPU path, and the craft recipe for
lighting and caption timing is captured and portable.

---

## 8. Files added

| Path | What |
|---|---|
| `studio/src/render3d.mjs` | software 3D layer (projection, shading, ACES, shadows, supersampling) |
| `studio/experiments/scene3d.mjs` | turntable experiment, 123–148 ms/frame at 1080×1920 |
| `studio/out/exp-3d.mp4` | rendered experiment (gitignored, reproducible) |
| `research/knowledge_base.json` | persistent, append-only project/decision/failure database |
| `research/skills/zach-d-films/` | the uploaded skill, preserved verbatim (MIT) |
| `research/skills/reference/` | the two style sheets + OFL font licences |
| `research/3D_RESEARCH_ROUND1.md` | this document |

Existing pipeline untouched — no production file was modified, no video re-rendered.

---

## 9. Recommended next steps, in order of quality gained per unit of risk

1. **Get one file.** Place `kokoro-v1.0.onnx` + `voices-v1.0.bin` anywhere readable and the
   robotic voice is solved (adapter already exists). Biggest single jump available.
2. **Add arbitrary meshes** to `render3d.mjs` (triangle raster + perspective-correct UV + texture
   sampling), which unlocks real props and environments instead of boxes.
3. **Add PCF shadow mapping** (js-renderer approach) for genuine cast shadows.
4. **Add a cel-shading mode** (stepped ramp + ink outline) — cheap, and it is the look the
   references actually use for cartoon explainers.
5. Only then consider characters, which realistically need a GPU/browser path or pre-made rigged
   GLB assets.

Two things would change the whole picture, and both are outside my control here: an open egress
host for model weights, or a prebuilt Chromium binary.
