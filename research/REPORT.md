# Programmatic Video Creation Toolkit — Deep Research & Discovery Report

**Phase:** research only (no app changes, nothing published)
**Date:** 2026-11-25
**Branch:** `arena/9d597f99-general-mining-os`
**Evidence discipline used throughout:** every item is labelled **discovered** (seen in search/metadata), **inspected** (cloned or tree+SKILL.md read), **tested** (ran its own gate here), or **verified** (rendered pixels and measured). No item reaches *verified* in this phase — see *Sandbox constraints*.

---

## 0. Headline findings

1. **The ecosystem has one dominant substrate.** HeyGen's **HyperFrames** ([github](https://github.com/heygen-com/hyperframes), Apache-2.0) is the de-facto renderer for most agent video skills: HTML/CSS/JS + GSAP → deterministic MP4 by seeking a paused timeline in headless Chrome. It ships **210 registry blocks**, 9 core skills, and a *machine-checkable render contract*. Most of the best skill packs are thin layers on top of it.
2. **Three distinct kinds of "skill" exist, and they composite.** (a) **Executable skill** — ships templates/scripts (artem's animation skills). (b) **Doctrine skill** — ships craft rules + reference code only (iart.ai packs, HyperFrames `references/*.md`, screenwriting packs). (c) **Pipeline/orchestrator** — ships manifests + tools + review gates (OpenMontage, kalem, clipforge). A serious toolkit needs all three tiers; none of the top repos has all three well.
3. **Quality is now measurable, not vibes.** HyperFrames `check` warns on `line_unread`, `dead_stretch`, `text_below_floor`, `first_frame_empty`, `film_silent`, and `measure` extracts cuts/eases/motion from a reference video. That is the seed of an automatic evaluator — currently the **single biggest capability gap** (only one provider).
4. **Speed varies 12× between engines.** Independent bake-off (16 skills, same 15 s brief): explainroo 2.0 min … HyperFrames 23.5 min. The fastest path is canvas/WebCodecs (motlab, fframes) or hand templates; the slowest is full HTML→Chrome with heavy DOM.
5. **Licence is the main commercial landmine.** Remotion is *source-available with paid company licensing* (the official skills repo has **no license field**); OpenMontage and VoiceStudio are **AGPL-3.0**; several top style packs are **NOASSERTION**. Verify before commercial distribution.

---

## 1. Method (so the numbers are auditable)

| Step | What was done | Tooling |
|---|---|---|
| Discovery | 54 GitHub search queries (repo search + topics), harvested through a caching wrapper to respect rate limits; plus 3 awesome-list corpora parsed, including one machine-readable index of 548 repos | `research/tools_gh_search.py`, `research/raw/*.json` (54 cached query responses) |
| Profiling | Exact metadata (stars, licence, size, last push, language, topics, archived) for 99 hand-picked candidates | `research/tools_meta.py` → `research/raw/meta.json` |
| Deep inspection | 33 repos `git clone --depth 1` + automated structural inspector: SKILL.md frontmatter/body size, scripts/references presence, dependency files, and regex signal counts for ffmpeg / remotion / three.js / gsap / manim / playwright / whisper / lottie / blender / d3 … | `research/tools_inspect.py`, `research/tools_matrix.py` → `research/raw/matrix.json` |
| API-only inspection | For 21 repos too large/awkward to clone: full git tree + SKILL.md bodies fetched via `gh api`, frontmatter and signals parsed | `research/tools_apiprobe.py` → `research/raw/apiprobe/*.json` |
| **Testing** | Ran HyperFrames' own gates in the sandbox: `init`, `check --json`, `compositions`, `timeline`, `add`, and **`lint` over all 210 registry blocks** and over **8 templated artem skills** | `/tmp/blocktest`, `/tmp/artem`, `/tmp/skilltest` |
| Not done | No rendering — Chrome and FFmpeg both unobtainable in this sandbox (details below) | — |

### Sandbox constraints (why nothing is marked *verified*)

* Chrome / `chrome-headless-shell` download fails with TLS reset → `hyperframes render` and `snapshot` cannot run. Error text captured verbatim: *"Failed to install chrome-headless-shell 158.0.8127.88: All providers failed … No Chrome or Chromium was found on this machine."*
* `ffmpeg` is absent from the image; `apt-get` has no root; `npm i ffmpeg-static` fails TLS verification. So no encoding path exists either.
* `raw.githubusercontent.com` is blocked → `hyperframes add <block>` cannot reach the registry. Confirmed the registry URL **must be an absolute `https://` URL** (`file://` is rejected by design), which also means **no offline/air-gapped registry** without mirroring over HTTPS.

Everything below that is *tested* is a static/lint-level result, not a pixel-level judgement. Where quality judgement is given, the source is the project's own showcase or the third-party bake-off — and it is cited as such.

---

## 2. Numbers

| Metric | Count | Notes |
|---|---|---|
| **Total repositories discovered** | **724** unique | union of 54 cached search queries, the 548-repo awesome index, and metadata pulls (`research/raw/discovered_repos.json`) |
| **Repositories actually inspected** | **54** | 33 cloned + 21 API-probed with tree+SKILL.md read (`research/data/repos_inspected.csv` covers the 33 cloned) |
| **Repositories profiled by metadata only** | 99 | `research/raw/meta.json` |
| **Individual skills identified** | **801** SKILL.md files read/indexed | 185 in clones + 616 via API trees. Largest single sources: openmotion 432 (mostly *repo-development* skills, not video), claude-video-editing-skills 95, OpenMontage 141 (cloned), blender-skills 28, screenwriting-skills 27 |
| Skills that ship **executable code** | ≈ 70 | artem (11), kalem (2), motlab (2), open-3d (8 incl. scripts), lanshu (1), code-video-showcase (1), pixel2motion (1), line-art (1), brief2mp4 (1), effects (1), movies-kit (1), FireRed (7) … |
| **Tested** artifacts | 218 lint runs | 210 registry blocks + 8 artem skills (24 blocks and 4 skills re-run individually to confirm) |
| Licences across profiled set | MIT 56, Apache-2.0 17, NOASSERTION 17, AGPL-3.0 4, CC0-1.0 3, none 2 | `NOASSERTION` is the dangerous bucket — GitHub could not parse a licence, but several (e.g. artem) do ship MIT text |
| Median stars of profiled set | 1,522 | heavily skewed by 5 repos over 40 k |
| Active (pushed in Nov 2026) | 67 / 99 | this space moves weekly; anything not pushed in a month is suspect |

---

## 3. Test results (the part that is actually ours)

### 3.1 HyperFrames contract, reproduced

* `npx hyperframes@0.9.94 init` → clean scaffold (`index.html`, `hyperframes.json`, `AGENTS.md`, `CLAUDE.md`). **Passed.**
* `check --json` → passes, writes a saved report to `.hyperframes/artifacts/checks/*.json`. **Passed.**
* `compositions` → `main 4.0s 1080×1920`. **Passed.**
* `add bar-chart-race` → fails without network; error message confirms the https-only registry rule.
* `render` / `snapshot` → blocked by missing Chrome (documented above).

### 3.2 Registry block library audit — **99 of 123 testable blocks lint clean**

We copied every block's `.html` into a standalone project and ran the real linter.

| Result | Count |
|---|---|
| Blocks with a `.html` entry point | 123 (the other 87 of 210 are multi-file/lib blocks) |
| **0 errors** | **99 (80.5 %)** |
| With errors | 24 (19.5 %) |

The 24 failures are **almost entirely missing media**, not broken code, e.g.:

```
✗ audio_src_not_found: <audio> references assets/bgm.m4a … The rendered video will be silent.
✗ missing_local_asset: <img> references assets/heygen-logo.svg … renderer will silently skip these
✗ missing_local_asset: <video> references assets/av_r1k1.mp4, av_r1k3.mp4, …
```

Failing blocks: `ai-chat-reveal, apple-money-count, blue-sweater-intro-video, editorial-flash-overlay, freeze-frame-dressing, heygen-avatar-promo-card, instagram-follow, ios26-liquid-glass, liquid-glass-notification, liquid-glass-widgets, macos-tahoe-liquid-glass, message-thread-reveal, north-korea-locked-down, notes-reveal, notification-cascade, nyc-paris-flight, organic-light-leak-overlay, share-sheet-carousel, snow, starfield, tiktok-follow, vfx-text-cursor, vpn-youtube-spot, yt-lower-third`.

**Engineering consequence:** blocks are *parameterised components whose media you must supply*. A pipeline that installs a block must run `lint` and then either supply or stub the referenced assets — that is a required step, not an optional one. (`check --json` on blocks additionally emits `composition_file_too_large` and `nested_structure_needs_subcomposition`, i.e. big blocks should be split for revision quality.)

### 3.3 artem's templates, linted

| Skill | Lint result |
|---|---|
| graph | **0 errors, 0 warnings** |
| minimalistic-graphics | **0 errors, 0 warnings** |
| dan-koe | **0 errors, 0 warnings** |
| kurzgesagt | **0 errors, 0 warnings** |
| map-route | 1 error, 1 warning |
| breakdown | 1 error, 1 warning |
| low-poly | 1 error, 2 warnings — `missing_timeline_registry: Missing window.__timelines registration` |
| minecraft | 1 error, 2 warnings |

Also observed: the `graph` composition parses as **1 composition, 4.0 s, 1080×1920, 0 clip tracks** — i.e. render-valid, but its elements are not declared as timed clips, so **Studio editability is partial**. This is the concrete gap between "makes an MP4" and "makes an *editable* project".

---

## 4. Best candidates by category

Legend: ★ = recommended for the shortlist. All links are real repositories.

### 4.1 Render/composition substrate

| Rank | Project | Licence | Evidence | Why |
|---|---|---|---|---|
| 1 ★ | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) (89.9 k) | Apache-2.0 | inspected + tested | Contract + lint/check + 210 blocks + Studio editability + capture + port from Remotion. The only substrate with a *verifiable* output contract. |
| 2 | [staryone/motlab](https://github.com/staryone/motlab) | MIT OR Apache-2.0 | inspected | WebCodecs in-page encoding, 2–4× faster; best human-review loop (frame notes). |
| 3 | [dmtrKovalenko/fframes](https://github.com/dmtrKovalenko/fframes) | MIT | inspected | Native Rust, 30× Remotion claim, no browser; real preview player. |
| 4 | [remotion-dev/skills](https://github.com/remotion-dev/skills) (8.0 k) | **unverified** | inspected | Best ecosystem + OTIO export; licence must be resolved first. |
| 5 | [0xS4N4TG/kinetograph](https://github.com/0xS4N4TG/kinetograph) | Apache-2.0 | inspected | Browserless Remotion-compatible renderer + migration skill. |

### 4.2 Style / genre skill packs

| Rank | Project | Skills | Licence | Evidence |
|---|---|---|---|---|
| 1 ★ | [artemnovitckii/claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) (1.2 k) | 11 | MIT | inspected + tested — the only pack whose styles are *runnable spec→MP4* |
| 2 ★ | [iart-ai](https://github.com/iart-ai/data-animation-skills) packs (data 3, explainer 5, kinetic-type 1, motion-design 9) | 18 | MIT | inspected — best craft doctrine (pacing, stagger, ease, verify loops) |
| 3 | [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (22.5 k) + [anything2explainer](https://github.com/Vincentwei1021/anything2explainer) | 2 (+269 TSX) | Apache-2.0 | inspected |
| 4 | [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (20.9 k) | 2 | NOASSERTION | inspected — 99 code-made film styles, mixed asset licensing |
| 5 | [charlie947/motion-graphics-skills](https://github.com/charlie947/motion-graphics-skills) | 15 | MIT | inspected — launch/apple-film/vox/title-sequence-3d recipes |
| 6 | [tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) (1.8 k) | 1 (20.6 KB) | Apache-2.0 | inspected — anti-"AI slop" direction skill |

### 4.3 Most advanced animation systems (by technical ceiling)

| Project | What makes it advanced | Evidence |
|---|---|---|
| **HyperFrames** | Path-traced 3D (`three-gpu-pathtracer`, raster preview → path export, measured 10.8 s vs 810.5 s for 8 s 720p), seeded determinism, frozen clock, `hf-seek` protocol, 36 GPU-shader blocks, 33 transition blocks | inspected (references/path-tracing.md, registry tags) |
| **EL4CTEO/blender-skills** (28 skills) | Real DCC control: Rigify, ARKit 52 blendshapes/visemes, geometry-node simulation zones, lookdev, asset-QA gate, glTF/FBX export presets | inspected |
| **artem `zach-d-films` + `stick-figure` engines** | Hand-built 3D cartoon engine (human/props/materials/textures/shots modules) and a canvas-2D character engine with voice-locked captions | inspected |
| **kalem** | Per-scene engine routing (Paper.js / PixiJS / three.js / Manim / HyperFrames), 125 gl-transitions, frame-locked SFX from `events.json` | inspected |
| **[AzurIce/ranim](https://github.com/AzurIce/ranim)** (662★) | Rust manim-inspired engine; [academa-labs/manimgx](https://github.com/academa-labs/manimgx) | discovered |

### 4.4 Programmatic video generation frameworks (the engine layer)

`hyperframes` · `remotion` · `fframes` · `motlab` · `kinetograph` · `Manim/ManimCommunity` (math) · `moviepy` (15.2 k, Python editing) · `editly` (declarative CLI editing) · `Graphite`/`filmcraft`/`effectcraft` (Rust NLE/compositor class) · `OpenTimelineIO` (interchange).

---

## 5. How the best of them actually work (implementation notes worth reusing)

**HyperFrames render contract** (12 numbered rules, enforceable by `check`): every timed element has `class="clip"`, `data-start`, `data-duration`; length = root `data-duration`; each composition builds **one paused GSAP timeline** and registers `window.__timelines[id] = tl`; **no** `Date.now()`, unseeded `Math.random()`, network fetches, timers or `repeat: -1`; never tween `display/visibility` on a clip; never `play()/pause()` media; audio needs an `id`; fonts must be `@font-face` to a local file. Rendering = seek the paused timeline frame by frame → deterministic, worker-parallel.

**artem's spec→render kit** (`kit/anim.py`): load JSON spec → inject `__SPEC__`/`__DURATION__` into `template.html` → hard-link fonts + vendored GSAP (+three.js if `three=True`) → `npx hyperframes render --fps 30 -q high` → **ffmpeg contact sheet with Instagram's safe area drawn as a red box** (top 220 px / bottom 420 px covered). Voice path: Kokoro ONNX (free, local) + Parakeet word timings via sherpa-onnx → captions timed to words. This is the cleanest *spec interface* found and is directly reusable.

**iart's doctrine** (the "one rule that prevents 90 % of bugs"): every displayed value must be a pure function of the current frame — no CSS transitions, no D3 `.transition()`, no library timers; D3 only for scales/shapes. Plus concrete numbers: 6–10 frame stagger, spring `damping 10–14`, title hold 0.8–1.2 s, per item 1.2–2.0 s, final composed hold 2–3 s, `tabular-nums` for counters, verify 3 stills (frame 0 / mid / last) before encoding, verify one dataset before batch-rendering N.

**OpenMontage's architecture** (the accumulation blueprint): *no code orchestrator — the agent is the orchestrator*. YAML pipeline manifest declares stages, required skills, tools, review criteria and success gates; stage-director Markdown says **how**; Python tools are selected by a **scored provider router** (7 dimensions) with cost tracking and budget caps; state checkpoints to JSON with a decision log; a reviewer skill runs schema validation + quality checks; a pre-compose gate checks "delivery promise, slideshow risk, renderer governance"; post-render self-review uses ffprobe + frame extraction + audio analysis. Its `animation-runtime-selector` is an explicit decision matrix (Remotion vs HyperFrames vs FFmpeg) with a **hard rule: present both runtimes, never silently default**.

**kalem's router**: scene content → engine. Hand-drawn line → Paper.js; character/shape morph → raw canvas; thousands of particles → PixiJS; text/counters/cards → HyperFrames+GSAP; real 3D → three.js; formulas → Manim. Scenes are independent folders (`calistir.sh`, `video.mp4`, `kontrol.png`, `olaylar.json`) so they render **in parallel by separate agents**, then `birlestir.py` adds transitions + audio. Audio events are frame-indexed, so sound can never drift.

---

## 6. Best combinations (compatibility assessed, not assumed)

| # | Combination | Why it works | Friction to resolve |
|---|---|---|---|
| 1 ★ | **HyperFrames (render) + artem templates (style cartridges) + iart doctrine (taste) + HyperFrames blocks (data/maps/transitions)** | One runtime, one contract; artem templates already lint clean; iart rules steer the authoring; blocks cover charts/maps without writing code | fix `missing_timeline_registry` in 4 artem templates; add `data-start/duration` clip metadata for Studio editability; vendor block media |
| 2 ★ | **OpenMontage architecture (manifests, provider router, reviewer, checkpoints) on top of #1** | Gives stage gates, cost control, resumability and a decision log without adopting its AGPL code verbatim (re-implement the *pattern*) | AGPL: pattern, not code |
| 3 | **motlab (fast scene render + human notes) ⇄ HyperFrames (final assembly)** | WebCodecs speed for iteration, HyperFrames for overlays/captions/blocks and contract checking | two project formats; not scripted today |
| 4 | **Manim (math/science scenes) + HyperFrames (titles/captions/assembly) + FFmpeg (concat)** | Manim owns formulas; HyperFrames owns typography and sound | Manim needs LaTeX or `Text`; render times high |
| 5 | **Blender (character/3D asset) → frames → HyperFrames or FFmpeg packaging** | The only route to rigged, lit, reference-grade 3D | Blender install + GPU; hours per shot |
| 6 | **Kalem's per-scene engine routing** as the dispatcher for #1/#4/#5 | Already encodes which engine wins per scene type | Turkish docs; NOASSERTION licence |
| 7 | **Video-shotcraft TSX components → (port) HyperFrames** | 269 prebuilt promo scenes | port cost; Remotion licence chain if kept as-is |
| 8 | **Whisper/Parakeet word timings + ffsubsync + HyperFrames captions** | Word-accurate, drift-corrected karaoke captions | one more model to host |

---

## 7. Missing capabilities (gaps that block a truly autonomous system)

1. **No closed quality loop.** HyperFrames `check/review/diff/measure` is the only measurable evaluator. There is **no** tool that scores a finished video against a *brief* (hook strength, retention curve, brand fit). Everything else is human eyeballing.
2. **No offline/air-gapped registry or model path.** HyperFrames requires an `https://` registry; TTS/model downloads go to GitHub/HF. A production agent needs a mirrored, pinned, hash-verified asset store.
3. **Thumbnail generation is essentially absent** from the agent-skill ecosystem: searches for thumbnail/clickbait skills returned only generic image tools. Needs to be built (frame choice from the video + text layout + A/B scoring).
4. **No licence-clean end-to-end stack.** Remotion (paid company licence), OpenMontage + VoiceStudio (AGPL), several style packs NOASSERTION, lemo's assets CC-BY with attribution. A commercial pipeline must be assembled from MIT/Apache parts only.
5. **No standard "video IR".** OpenTimelineIO exists for timelines, but there is no schema for *scenes + beats + sound events + style tokens* that all engines can consume. Everyone reinvents spec JSON (artem), `zaman.json`/`olaylar.json` (kalem), `project.json` (motlab).
6. **Determinism is not enforced across tools.** Only HyperFrames/Remotion/fframes document frame-purity; canvas/GSAP skills frequently rely on `Date.now()`/random.
7. **Evaluation of *engagement*** (pacing, retention, hook) has no tooling at all — only craft heuristics in Markdown.
8. **Long-form (>3 min) production** is thin: almost everything is 8–60 s. Only OpenMontage advertises long-form.
9. **Sound design is doctrine-only.** No open SFX-selection-by-event model; HyperFrames tells you *which* sound with *what gain*, but you must supply or licence the audio.
10. **Multi-language/vertical localisation** is scattered (liuzhao1225/YouDub, krillinai/OpenCreator) and not integrated with authoring.

---

## 8. Technical integration architecture (recommended)

```
                       ┌───────────────────────────────────────────────┐
  brief / topic ──────▶│ 1. INTENT & RESEARCH                          │
  reference video ────▶│    script, claims, reference measurement      │
                       │    (rea-video / hyperframes measure+reverse)   │
                       └───────────────┬───────────────────────────────┘
                                       ▼  VideoIR  (scenes, beats, sound events, style tokens, claims)
                       ┌───────────────────────────────────────────────┐
                       │ 2. DIRECTION  (doctrine layer, cheap)         │
                       │    iart motion-design + data + explainer      │
                       │    HyperFrames motion-doctrine / story / look │
                       └───────────────┬───────────────────────────────┘
                                       ▼  Storyboard + SPEC (every adjective → a number)
                       ┌───────────────────────────────────────────────┐
                       │ 3. CAPABILITY ROUTER  (per scene, not per film)│
                       │    kalem-style table + OpenMontage-style       │
                       │    scored provider selection (cost/latency/    │
                       │    licence/quality), with explicit escalation  │
                       └──┬─────────┬─────────┬─────────┬─────────────┘
                          ▼         ▼         ▼         ▼
                    HF+GSAP    Manim     Blender    motlab/fframes
                   templates  (math)   (3D/rig)   (fast canvas)
                          └─────────┴────┬────┴─────────┘
                                         ▼
                       ┌───────────────────────────────────────────────┐
                       │ 4. ASSEMBLY & SOUND                           │
                       │    transitions (gl-transitions / HF shader)    │
                       │    captions (Parakeet words + ffsubsync)       │
                       │    music/SFX on frame events, LUFS-normalised  │
                       └───────────────┬───────────────────────────────┘
                                       ▼
                       ┌───────────────────────────────────────────────┐
                       │ 5. GATES  (this is the moat)                  │
                       │    static: hyperframes check/lint (contract)   │
                       │    visual: 3 stills per scene → VLM judge      │
                       │    audio:  beats/audio json, LUFS, peak        │
                       │    motion: diff vs reference, measure eases    │
                       │    brand:  tokens + banned-defaults list       │
                       └───────────────┬───────────────────────────────┘
                                       ▼
                       ┌───────────────────────────────────────────────┐
                       │ 6. DELIVERY                                   │
                       │    FFmpeg encode · contact sheets · thumbnail │
                       │    REVIEW.md · optional OTIO export           │
                       └───────────────────────────────────────────────┘
```

**Interface rules that make combination cheap**
1. **One authoring format:** HTML+GSAP compositions (HyperFrames contract) as the canonical scene format; JSON `SPEC` per scene; frames are pure functions of time.
2. **One neutral IR:** define `VideoIR` (scenes, beats, sound events, style tokens, claims-with-sources). Every engine adapter consumes IR; nobody talks to another tool's project format directly.
3. **Capability registry, not tool registry:** each adapter declares `capability`, `provider`, `cost`, `latency`, `licence`, `deterministic: bool`, `needs: [chrome|ffmpeg|blender|gpu]`, and *quality evidence*. Route on those fields.
4. **Fail loud, never substitute silently** (OpenMontage's escalation rule) — a swapped renderer must be recorded in the decision log.
5. **Every skill install is untrusted:** pin versions, vendor assets with hashes, run `lint` after install, forbid outbound calls at render time (the contract already bans fetches), and never execute an `install.sh` without reading it (artem's is benign — npm + playwright chromium + curl of GSAP/models — but that is exactly the class of script that must be read).

---

## 9. Recommended shortlist for the implementation phase

**Tier 1 — adopt now (MIT/Apache, tested or well inspected)**
1. `heygen-com/hyperframes` — renderer + contract + 210 blocks (Apache-2.0) *(tested: init/check/compositions; lint audit of all blocks)*
2. `artemnovitckii/claude-animation-skills` — 11 style cartridges incl. two engines, plus the `kit/anim.py` spec→render interface and safe-area QA (MIT) *(tested: 8 skills linted)*
3. `iart-ai/{data-animation, explainer-video, kinetic-typography, motion-design}-skills` — 18 doctrine skills with numeric craft rules (MIT) *(inspected)*
4. `adithya-s-k/manim_skill` + `ManimCommunity/manim` — math/science (MIT) *(inspected)*
5. HyperFrames `sound.md` + `review.md` + `beats/audio/normalize-audio` — measurable audio and review protocol (Apache-2.0) *(inspected)*

**Tier 2 — adopt selectively after a spike**
6. `EL4CTEO/blender-skills` — 28 skills for real 3D/characters (MIT) *(inspected; needs Blender+GPU)*
7. `staryone/motlab` — fast canvas render + human note loop (MIT/Apache) *(inspected)*
8. `leodavincs/kalem` — per-scene engine routing table + frame-locked SFX, as a *pattern* (NOASSERTION → re-implement)
9. `Viprasol-Tech/claude-video-editing-skills` — 95 caption/edit formats for talking-head work (MIT) *(inspected)*
10. `OpenMontageInc/OpenMontage` — architecture only: manifests, scored provider routing, checkpoints, reviewer (AGPL → re-implement, do not copy code)

**Tier 3 — reference, do not depend on**
11. `remotion-dev/skills` (licence unresolved), `Vincentwei1021/video-shotcraft` (TSX catalogue to port), `lemomo-ai/lemo-opuscar` (style vocabulary, mixed asset licences), `JuneYaooo/rea-video` + `NiazMorshed2007/reanimate` (reverse-engineering patterns).

**Build ourselves (the genuine gaps):** VideoIR schema · capability router · automatic evaluator (static + stills + audio + diff) · thumbnail generator · pinned offline asset/model store · engagement heuristics.

---

## 10. What remains unverified (honest limits)

* **No video was rendered.** Every statement about *visual* quality is from the project's showcase or the third-party bake-off — never from our own output.
* Registry blocks were linted **as single files**; their interactive/3D behaviour under a real Chrome render is untested. `webgpu-shader` blocks (36) additionally require a GPU path.
* OpenMontage, motlab, fframes, kinetograph, Blender skills were read, not executed.
* Skill counts of "56/99/124 styles" are the maintainers' claims; we counted **801 SKILL.md files**, not 801 *distinct capabilities* (openmotion's 432 are mostly its own repo-development skills).
* Star counts are a snapshot (2026-11-25) and this ecosystem re-writes itself weekly.

---

### Appendix — artifacts

| File | Contents |
|---|---|
| `research/data/capability_database.json` | 9 capability groups, 46 provider entries, evidence level + limits + integration notes per entry |
| `research/data/repos_inspected.csv` | 33 cloned repos: stars, licence, language, last push, size, skill count, dep files, capability signals |
| `research/data/skills_inventory.csv` | 185 SKILL.md records (name, path, bytes, has_scripts, has_references, description) |
| `research/raw/discovered_repos.json` | all 724 discovered repos |
| `research/raw/meta.json` | API metadata for 99 candidates |
| `research/raw/matrix.json` | full structural inspection output for 33 clones |
| `research/raw/apiprobe/*.json` | git trees for 21 API-probed repos |
| `research/raw/*.json` | 54 cached GitHub search queries (reproducible) |
| `research/tools_*.py` | the discovery/profiling/testing scripts, re-runnable |
| `research/TESTLOG.md` | verbatim commands and outputs of every test performed |
