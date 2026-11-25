# Research ledger — generated report

Generated 2026-11-25 from `research/ledger.json`. **Do not hand-edit** — run `node research/tools/kb.mjs report`.

## Scoreboard

| stage | count | meaning |
|---|---:|---|
| discovered | **6** | a URL or mention exists; nothing opened |
| inspected | **8** | source, docs or renders actually read/looked at |
| tested | **2** | executed in this environment, with evidence recorded |
| integrated | **4** | code/technique landed in our engine, artifact on disk |
| rejected | **1** | deliberately not used, reason recorded |

## integrated (4)

| id | name | licence | environment | source |
|---|---|---|---|---|
| `sparticuz-chromium` | @sparticuz/chromium — Chromium binary shipped inside the npm tarball | MIT | ✔ runs here | https://github.com/Sparticuz/chromium |
| `studio-render3d` | studio/src/render3d.mjs — software 3D on the Skia canvas | ours | ✔ runs here | studio/src/render3d.mjs |
| `studio-lookdev` | Look-dev layer: LIGHT_RIG specular, lathe volumes, bloom, grade, impact rings | ours | · untested | studio/src/render3d.mjs |
| `bean-cartoon-engine` | bean-cartoon 2D vector character engine (studio/src/cartoon.mjs) | ours | · untested | studio/src/cartoon.mjs |

## tested (2)

| id | name | licence | environment | source |
|---|---|---|---|---|
| `vsim` | vsim — "Remotion for real 3D" (pure-TS software rasteriser) | MIT | ✔ runs here | https://github.com/kunalkushwaha/vsim |
| `kokoro-js` | kokoro-js — neural TTS on onnxruntime-node | Apache-2.0 | ✘ cannot run here | https://github.com/hexgrad/kokoro |

## inspected (8)

| id | name | licence | environment | source |
|---|---|---|---|---|
| `vsim-film3d` | Film3DDoc: validated screenplay -> scene compiler -> self-reviewed dailies | MIT | ✔ runs here | https://github.com/kunalkushwaha/vsim/tree/main/packages/film3d |
| `claude-animation-skills` | artemnovitckii/claude-animation-skills — 11 video skills for Claude Code | MIT | ✔ runs here | https://github.com/artemnovitckii/claude-animation-skills |
| `software-rasterisers` | JS software rasterisers: js-renderer, aisa, facet, SoftwareRenderer, TinyRenderer | mixed | ✔ runs here | https://github.com/jtsorlinis/js-renderer |
| `paper-3dgs` | 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al. 2023) | arXiv | ✘ cannot run here | https://arxiv.org/pdf/2308.04079 |
| `style-references` | zach-3d-films / five-styles contact sheets (11 skills) | n/a | ✔ runs here | research/STYLE_REFERENCE_NOTES.md |
| `qa-defects-001` | Visual QA gates: caption collision + motion-energy floor | ours | ✔ runs here | research/INSPECTION_CAPABILITIES.md |
| `zach-df-engine` | zach-d-films engine: PMREM softbox, Bokeh, Bloom, grade, lathe humans | MIT | · untested | https://github.com/artemnovitckii/claude-animation-skills/tree/main/skills/zach-d-films/engine |
| `cartoon-short-kit` | jonhelpangan-jpg/cartoon-short-kit — '2D look, 3D motion' house style (rig3d.js, stick.js) | MIT | · untested | https://github.com/jonhelpangan-jpg/cartoon-short-kit |

## discovered (6)

| id | name | licence | environment | source |
|---|---|---|---|---|
| `hf-dom` | HyperFrames (HTML/CSS/GSAP -> MP4) | see npm | · untested | https://www.npmjs.com/package/hyperframes |
| `remotion` | Remotion — React -> video | company licence, not OSI | · untested | https://github.com/remotion-dev/remotion |
| `sherpa-onnx` | sherpa-onnx — ASR/TTS toolkit | Apache-2.0 | · untested | https://github.com/k2-fsa/sherpa-onnx |
| `ossos` | sketchpunklabs/ossos — character IK/motion | check | · untested | https://github.com/sketchpunklabs/ossos |
| `drawcall-animate` | drawcall-ai/animate | check | · untested | https://github.com/drawcall-ai/animate |
| `paper-acg` | Papers to fetch for cel shading, outlines and cartoon lighting | licence unknown | · untested |  |

## rejected (1)

| id | name | licence | environment | source |
|---|---|---|---|---|
| `webgl-swiftshader` | Headless WebGL via ANGLE/SwiftShader in this sandbox | n/a | ✘ cannot run here | https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md |

## Findings by record

### `vsim` — vsim — "Remotion for real 3D" (pure-TS software rasteriser)

**Evidence**:
- cloned, pnpm 9.15.0 install + build succeeded
- rendered examples 01-cube, 09-manga, 21-mouse at 1080x1920
- benchmarked 2040 ms/frame @1080x1920 on 2 cores

**Extracted**:
- Architecture: zod-validated JSON scene document -> pure-TS rasteriser -> MP4; no GPU, no Chrome, no node-gyp.
- Determinism is enforced, not promised: Math.random is lint-banned in runtime code and CI compares golden-frame hashes.
- Feature set worth copying conceptually: per-pixel PBR with normal maps, PCF shadows, sorted transparency, ACES tone mapping, bloom, sky-derived hemisphere ambient, linear fog, glTF skeletal clips with crossfades, ground-contact IK with stance locking, spring bones, morph-target lip-sync, Rapier physics, beat-driven audio.
- manga style is a single flag (style:"manga") that swaps to cel shading + ink outlines - a good precedent for exposing a "look" as one switch.
- Speed verdict: 2040 ms/frame is ~14x too slow for our 9:16 1080x1920 workload next to a Skia path at 123-148 ms/frame.
- Film3D pipeline is the most reusable idea: a director LLM writes a schema-validated Film3DDoc (cast, beats, shots), a compiler lowers it to a scene, and the renderer stays AI-free and deterministic. It also renders its own dailies and re-blocks from them.

### `vsim-film3d` — Film3DDoc: validated screenplay -> scene compiler -> self-reviewed dailies

**Evidence**:
- README film/3d section + package.json scripts read from raw.githubusercontent via page fetcher
- read film:gen and film3d:fox scripts

**Extracted**:
- Contract: the model may only emit a validated document; it never touches the render loop. A bad scene cannot be rendered, only rejected.
- Shot vocabulary we should adopt: wide / close / follow / orbit, plus an optional handheld drift for documentary feel.
- Self-review loop: one still per shot, two rounds, later rounds see the previous round frames. This is an automated visual QA gate that costs almost nothing.
- Baking trick: HTML artifacts are baked to a frame sequence by a pinned headless Chromium and played back as an in-world texture. With our new browser cell this becomes available to us.

### `claude-animation-skills` — artemnovitckii/claude-animation-skills — 11 video skills for Claude Code

**Evidence**:
- full kit read file-by-file: SKILL.md, README.md, anim.py, build.py, build-2.py, words.py, template.html (16993 B), install.sh, setup.sh, manifests
- all 13 text files verified byte-identical to our stored copy by md5
- two contact sheets viewed at full resolution: skills.jpg (6 skills), five-styles.jpg (5 styles)
- original repo found via api.github.com (1259 stars, 179 forks, pushed 2026-11-17); full 111-entry tree listed; engine source downloaded and read

**Extracted**:
- Eleven skills, not six: zach-d-films, zach-3d-films (same engine, renamed), stick-figure, minimalistic-graphics, map-route, breakdown, graph, low-poly, minecraft, kurzgesagt, dan-koe.
- anim.py is the whole architecture: spec JSON -> fill __SPEC__/__DURATION__ into template.html -> hyperframes render --fps 30 -q high -> contact sheet with Instagram safe area drawn in red.
- Safe area constants: W1080 H1920 FPS30, SAFE_TOP 220, SAFE_BOTTOM 1500, SAFE_SIDE 100. Encoded as a drawbox overlay on every contact sheet, so the check is visual not manual.
- Duration is declared as a lambda over the spec, and --snap renders individual times without a full render. Cheap iteration is designed in.
- build.py does spec validation with actionable messages (e.g. label column length warnings) instead of silently producing bad output.
- check_setup() fails loudly when GSAP or three.js is missing rather than rendering blank.
- CORRECTION: the supplied upload omitted the entire engine/src directory (human.js, materials.js, props.js, textures.js, anim.js, shots.js, main.js), render.mjs, and the 13 font binaries. Source has now been fetched from the original repo.
- Licence is plain MIT (verified by decoding LICENSE), not NOASSERTION as GitHub's classifier reports
- Repo also ships a real Kokoro voice sample vo_kokoro.wav plus words_ref.json and tools/align.py - evidence they ship neural TTS output, and a forced-alignment approach we can study

### `sparticuz-chromium` — @sparticuz/chromium — Chromium binary shipped inside the npm tarball

**Evidence**:
- npm install produced 75 MB node_modules, extracted a 227,736,800 B executable to /tmp/chromium
- binary initially failed: "error while loading shared libraries: libnspr4.so"
- apt has no libnspr4 and deb.debian.org is unreachable (HTTP 000)
- found libnspr4.so / libnss3.so inside its own bin/al2023.tar.br; brotli-decompressed and tar-extracted; Chromium 158.0.8127.0 then started

**Extracted**:
- This is the single enabler that turned "no browser is obtainable" into "a browser is obtainable" in a network-locked sandbox: the binary travels in the npm tarball, not a CDN.
- The AL2023 archive is only auto-extracted when the package detects Amazon Linux 2023, so on Debian-like images the NSS libraries are present but never unpacked. Extract them manually.
- SwiftShader tar (libEGL, libGLESv2, libvk_swiftshader, vulkan ICD) ships too, and its vulkan ICD json uses a RELATIVE library_path that must be rewritten to an absolute path before use.

### `webgl-swiftshader` — Headless WebGL via ANGLE/SwiftShader in this sandbox

**Evidence**:
- 7 flag combinations tried: --use-gl=angle|swiftshader, --use-angle=swiftshader|swiftshader-webgl|vulkan, --in-process-gpu, --headless=old, Vulkan feature flags
- 3 ICD configurations: package default, absolute library_path rewrite, VK_DRIVER_FILES
- Chrome stderr: "Internal Vulkan error (-3)" at vk_renderer.cpp initialize:2546, then "eglInitialize SwANGLE failed with error EGL_NOT_INITIALIZED"
- /dev/shm is 2.0 GB and all three SwiftShader libs resolve their deps, so neither memory nor missing libs explain it

**Extracted**:
- Do not retry this: the failure is inside ANGLE/Vulkan initialisation, not in our flags or environment.
- Keep the swiftshader libs extracted anyway - they cost nothing and would be the first thing to try if the image changes.

**Why rejected**: eglInitialize SwANGLE failed with EGL_NOT_INITIALIZED in every configuration tried; three.js is therefore unreachable in this sandbox

### `remotion` — Remotion — React -> video

**Extracted**:
- Needs Chrome, which we now have, but the licence is not OSI for company use and HyperFrames already covers the same HTML-to-video niche with a plain-HTML model.

### `kokoro-js` — kokoro-js — neural TTS on onnxruntime-node

**Evidence**:
- npm install --ignore-scripts succeeded (56 packages)
- require("onnxruntime-node") loaded, version 1.21.0, prebuilt libonnxruntime.so.1.21.0 ships inside the tarball (no postinstall download)
- weights fetch attempted against huggingface.co, hf-mirror.com (HTTP 000) and the GitHub release asset (302 -> release-assets.githubusercontent.com, HTTP 000)

**Extracted**:
- Correction to an earlier conclusion: neural TTS is NOT blocked by a postinstall CDN fetch. It is blocked only by model weights.
- One supplied weights file would unblock a natural-voice path - the highest-value unblock available to us.

**Why rejected**: runtime loads but the ~327 MB model weights live on huggingface.co / release assets, all HTTP 000 here

### `sherpa-onnx` — sherpa-onnx — ASR/TTS toolkit

**Extracted**:
- Interesting mainly for forced alignment (word timings for captions), but its models are also on blocked CDNs.

### `software-rasterisers` — JS software rasterisers: js-renderer, aisa, facet, SoftwareRenderer, TinyRenderer

**Evidence**:
- read design descriptions for jtsorlinis/js-renderer, jdiemke/aisa, bxzex/facet, Sopiro/SoftwareRenderer, ccajas/JS-TinyRenderer

**Extracted**:
- Common lesson: they are all per-pixel JS and therefore slow, which is exactly why our Skia-backed rasteriser beats vsim by ~14x.
- ccajas/JS-TinyRenderer has the clearest pipeline order to copy pedagogically: model -> view -> projection -> clip -> raster -> shade.

### `paper-3dgs` — 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al. 2023)

**Evidence**:
- full text parsed and read (11 chunks) via the page fetcher

**Extracted**:
- Not usable here (capture-based, GPU), but the tile-based visibility sorting idea is applicable to any software renderer that needs correct alpha ordering.

**Why rejected**: needs CUDA-class GPU and multi-view captures; not applicable to procedural explainer rendering

### `paper-acg` — Papers to fetch for cel shading, outlines and cartoon lighting

**Extracted**:
- Queue: stylised/cel-shading surveys, ink-outline techniques (depth+normal edge detection), Disney/Pixar BRDF literature for the specular highlight the zach-3d-films look depends on.

### `studio-render3d` — studio/src/render3d.mjs — software 3D on the Skia canvas

**Evidence**:
- render1 141 ms/frame, render2 148 ms/frame, render3 123 ms/frame at 1080x1920 (60 frames)
- each render inspected as a PNG tile; two defects found and fixed (camera too low, missing ground plane)

**Extracted**:
- Technique set: lookAt + perspective, backface cull, painter sort, Lambert key + hemisphere fill + rim, ACES tone mapping, contact shadows, 2x supersampling.
- Framing rule for 9:16: horizontal half-extent is d*tan(fov/2)*(9/16), so width binds before height. A 4.6-unit set needs d~16.6 at fov 30; keep sets ~2.5 units and camera at 8.6 with fov 34.
- Limitation: box-only. No meshes, no rigs, no textures, no cel shading.

### `style-references` — zach-3d-films / five-styles contact sheets (11 skills)

**Evidence**:
- skills.jpg and five-styles.jpg viewed at full resolution; README cross-read for skill list

**Extracted**:
- The gap to the reference look is not mesh fidelity: it is (1) a broad stretched specular on curved metal, (2) depth of field with a crisp subject and soft ground, (3) exaggerated proportion, (4) impact read as concentric rings plus one verb.
- Reference staging grammar: one subject, one prop, one action verb, large negative space above.
- Caption grammar: white bold lowercase bottom-centre ~6% of frame height with a soft drop shadow, no box.
- Cheap wins identified for our channel: rounded label chips, impact rings, hairline-on-black variant, yellow no-box captions, DOF.

### `qa-defects-001` — Visual QA gates: caption collision + motion-energy floor

**Evidence**:
- frame at t=6.8 s of studio/out/mining-weekly-01.mp4 shows the karaoke caption box overlapping the chart x-axis label row
- 1 fps 6x2 contact sheet shows scene 02 nearly pixel-identical from t=0 to t=5

**Extracted**:
- The existing 100/100 automated score did not catch either defect, so the score is measuring the wrong things.
- Both are mechanically detectable: text/chart bounding-box intersection, and per-second frame-difference energy below a floor.
- Because frames are the only way I can evaluate motion, these gates are the substitute for watching the video - they should be mandatory before any render is called done.

### `zach-df-engine` — zach-d-films engine: PMREM softbox, Bokeh, Bloom, grade, lathe humans

**Evidence**:
- api.github.com git/trees listed 111 entries; identified the engine files the upload omitted
- downloaded and read line by line: human.js (18995 B), materials.js (3089 B), props.js (14413 B), textures.js (5515 B), anim.js (3238 B), shots.js (24450 B), main.js (7875 B), index.html, render.mjs, captions.py, SKILL.md, LICENSE
- LICENSE decoded: plain MIT, Copyright (c) 2026 Artem Novitckii (GitHub classifier reported NOASSERTION)

**Extracted**:
- PMREM env built from explicit emissive planes (key 8x4 @3.2, rim 4x10 @1.6, fill 10x3 @1.0) prefilters reflections -> the broad directional specular; this is the highest-value technique
- Post chain order: RenderPass -> BokehPass -> UnrealBloom(0.25*0.6, thr 1.6) -> OutputPass -> grade(vignette 0.28 aspect-compensated, grain 0.018)
- Renders at 720x1280 not 1080x1920; deliberate cost trade
- Characters have no rig and no mesh: LatheGeometry over a smoothstep-interpolated radius profile torsoR(y), 11 keys, scaled elliptically 1.13 x 1 x 0.66; armour shells are offset lathes with a Gaussian sternum ridge
- All textures are procedural canvas2d from a seeded RNG: steel = blotches+scratches+pits as roughness with screen-blended colour map; chainmail = alternating tilted ellipse rings + bump map
- Render contract: window.renderAt(t) -> page.screenshot(clip) -> PNG pipe -> ffmpeg libx264 crf 17; shots cached lazily by index
- Per-frame lighting is returned by the shot (dof/bloom/exposure) instead of being a global setting - transferable immediately
- Caption: triple-layer text-shadow + 0.6px dark stroke, 46px on 1280 (~3.6% of height), heavy grotesque, negative tracking

### `studio-lookdev` — Look-dev layer: LIGHT_RIG specular, lathe volumes, bloom, grade, impact rings

**Evidence**:
- lookdev.mjs renders 3 stills + a 30-frame clip; 438-444 ms/frame at 1080x1920 with 2x supersampling, bloom, grain
- defects found by viewing: banding from stacked rings (fixed), wedge cut by ellipse-in-silhouette-path (fixed), bloom blowout (fixed), hard bottom slice (fixed)

**Extracted**:
- Broad directional specular from 3 explicit emissive planes (LIGHT_RIG) reproduces the reference metal look without any WebGL environment map
- Lathed volumes of revolution work in a 2D canvas: project offset points to measure screen radii, then fill silhouette + vertical gradient + cross-shading. Stacking ring ellipses produces horizontal banding and must be avoided
- bloomPass brightness-filter approach blows out mid-grey metal; needs threshold above 2 to be a real bright-pass
- @napi-rs/canvas ABORTS the process on NaN geometry (sk.rs unwrap) instead of throwing - the earlier 'crash in drawBoxes' was undefined width/height being passed by me
- perspective() returns a plain array [x,y,z] and divides x by aspect, so narrow sub-panel renders squash the subject; frame full width

### `bean-cartoon-engine` — bean-cartoon 2D vector character engine (studio/src/cartoon.mjs)

**Evidence**:
- charsheet.mjs renders 4 PNG contact sheets and a 150-frame 1080x1920 clip at 171-178 ms/frame
- 9 defects found and fixed by viewing output: missing hair, torso shade spilling outside the body, crossed legs, oversized vacant skull, hidden raised arms, hands below feet, merged legs, cheek stain, wart-like nose
- animation strip verified at 3 fps: blinks, neutral->happy walk, walk->run, impact squash with shock->angry, recovery to happy
- artifacts mirrored to research/artifacts/characters for a tracked, shareable copy

**Extracted**:
- Style recovery: the viral reference frame (image-3.png) is 2D VECTOR, not shaded 3D. Verified by reading its construction: self-coloured outlines (darkened fill, never black ink) and flat fills with at most one hard shadow tone.
- Key correction to round 2: skin is a FLAT fill with no shadow tone. A dark crescent across the cheek reads as a stain. Shading tones belong to clothing only.
- Face is a data table: 9 expressions x (2 eye kinds, 2 brow offsets, 1 mouth kind). Eye kinds lid|happy|squeeze|shock|dot, mouths dash|grin|frown|o|smirk|teeth|laugh. All features derive from E = eye radius = 0.155 rx, which is why the face reads identically at 200px and 1280px.
- Head is ~42% of total height with no neck: the single strongest style cue. Mitt hands, 2-bone IK limbs, stubby tube legs.
- API traps fixed and recorded: (1) walkCycle must return OFFSETS not absolutes, or hands land below the feet; (2) raised arms must be drawn AFTER the head or the hands vanish behind the skull; (3) two same-coloured legs merge into one dark column in front view - the far leg needs a darker tone; (4) squish must floor at 0.70 or a front-view skull squashed sideways reads as a thin egg rather than a profile.

### `cartoon-short-kit` — jonhelpangan-jpg/cartoon-short-kit — '2D look, 3D motion' house style (rig3d.js, stick.js)

**Evidence**:
- api.github.com tree listed 27 blobs; STYLE.md, rig3d.js, paint.js, framing.js, stick.js, motion.js, toonbase.js, README and SKILL.md downloaded (96 KB) and read
- expression vocabulary extracted programmatically from the FACE table in toonbase.js

**Extracted**:
- LOOK.flat = THREE.MeshToonMaterial with a two-step gradientMap: flat colour plus exactly one hard shadow tone. LOOK.bean scales the head to [0.94, 1.12, 0.94]. This is the mechanism behind the entire look.
- Faces are painted onto a canvas texture with plain 2D calls (drawFace3D -> faceFront), so the expression system is canvas2d code, not shader work - which is why it ports to us without WebGL.
- FACE table: 14 expressions (neutral, stern, grin, laugh, whistle, nervous, shock, relief, relief_open, dazed, pained, smile, smile_closed, lick) over 5 eye kinds and 11 mouths. Feature positions are expressed in units of u = headWidth/100, so the face scales with the head.
- Their rigs still need WebGL, so the reference cannot run here. Only the style and the face-table idea were carried over.

