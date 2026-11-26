# 11 · Resource catalog — repos, libraries, references, tools

**Status vocabulary is strict:** `integrated` = code landed here with an artifact; `tested` = ran
here with a measured result; `inspected` = source/docs read, not run; `discovered` = found only;
`rejected` = ruled out with a reason. Query the live ledger for details:

```bash
node research/tools/kb.mjs list --status integrated
node research/tools/kb.mjs show <id>
node research/tools/kb.mjs stats     # 64 records: 6 discovered / 17 inspected / 6 tested / 33 integrated / 2 rejected
```

---

## A · Vendored references (already in the repo — read these first)

| Path | What it is | Status |
|---|---|---|
| `research/references/stick3d/MASTER-PROMPT.md` | the 23-page ANIMATION MASTER ENGINE spec — primary production contract | inspected, rules adopted |
| `research/references/stick3d/SCRIPTWRITING-PROMPT.md` | the story/script half: mid-action hook, one narrative, end on payoff | inspected, adopted |
| `research/references/stick3d/rules/QUALITY-CHECKLIST.md` | physics/continuity/camera/environment/captions/sound/final gates | adopted verbatim |
| `research/references/stick3d/rules/STYLE-SPEC.md` | measured format, palette hexes, ink width, head ratio, caption band | adopted |
| `research/references/stick3d/rules/CREATIVE-FREEDOM.md` | 3 ideas/scene, neighbours differ, reuse helpers never layouts | adopted |
| `research/references/stick3d/rules/{RULES,STYLE-RULES-v2,ACTION-LIBRARY,LEDGER.template}.md` | acting/anti-template rules, action vocabulary | inspected |
| `research/references/stick3d/voice/{align,prep_voice,trim}.py` | **pocketsphinx forced alignment** — used in production for English | **integrated** |
| `research/references/zach-d-films-engine/` | `src/{anim,human,main,materials,props,shots,textures}.js`, `captions.py`, `render.mjs`, MIT | inspected; patterns ported |
| `research/references/cartoon-short-kit/` | `SKILL.md`, `STYLE.md`, `framing/motion/paint/rig3d/stick/toonbase.js` | inspected |
| `research/references/lowpoly/` | `SKILL.md`, `build.py`, `template.html` — PS1 look | **integrated** (patterns → `lowpoly.mjs`) |
| `research/skills/zach-d-films/` | the packaged skill with `install.sh`, `marketplace.json` | inspected |

⚠️ **Known defect in the vendored zach-d engine:** `render.mjs` burns word-level `captionCues`
(L93–97) but `exportSRT` (L283–330) is phrase-level. Don't trust its SRT to match its captions.

**The single highest-value read:** the Stick3D pack's `puppet.ts` + `toon.tsx` + `extra.tsx`.
They revealed the 2D-puppet-on-billboard architecture and the Catmull-Rom camera. Both were ported
(`puppet2d.js`, `stickworld.js`, `worldkit.js`) rather than adopting the Remotion runtime.

---

## B · External repos & libraries (with honest status)

### Rendering / animation engines

| Resource | URL | Status | Takeaway |
|---|---|---|---|
| **@sparticuz/chromium** | https://github.com/Sparticuz/chromium | **integrated** | browser binary inside the npm tarball; bundled AL2023 libs are the WebGL key |
| **three.js r149** | https://github.com/mrdoob/three.js | **integrated** | last UMD build; `window.THREE` via `addScriptTag` |
| **@napi-rs/canvas** | https://github.com/Brooooooklyn/canvas | **integrated** | Skia canvas in Node; `ctx.filter` blur used for DOF/bloom |
| Remotion | https://github.com/remotion-dev/remotion | inspected | `interpolate`/`spring` semantics ported into `kinetic.mjs`; runtime not adopted |
| ecmanim (Node Manim) | https://github.com/johnhenry/ecmanim | inspected | closest JS math-animation analogue; rate functions studied |
| vsim | https://github.com/kunalkushwaha/vsim | **tested** | CLI ran; `packages/film3d` inspected, not adopted |
| HyperFrames | https://www.npmjs.com/package/hyperframes | discovered | CLI reachable, `check` passes; **render blocked** (needs Chrome+FFmpeg at the time) |
| js-renderer | https://github.com/jtsorlinis/js-renderer | inspected | software rasteriser patterns |
| ossos | https://github.com/sketchpunklabs/ossos | discovered | IK rig reference |
| drawcall-ai/animate | https://github.com/drawcall-ai/animate | discovered | — |
| Rive | https://github.com/rive-app/rive-react | inspected | state-machine vector animation; not adopted |

### Skill kits / methodology

| Resource | URL | Status | Takeaway |
|---|---|---|---|
| **video-talkcraft** | https://github.com/Vincentwei1021/video-talkcraft | inspected | SKILL.md read in full: word-level VO sync, **108 motion recipe cards**, 7-layer anti-PPT camera, 6 motion-continuity transitions, freeze detection + subagent review |
| iart-ai/motion-skills | https://github.com/iart-ai/motion-skills | inspected | 56 skills: kinetic typography, data-viz, explainers, WebGL, Manim |
| artemnovitckii/claude-animation-skills | https://github.com/artemnovitckii/claude-animation-skills | inspected | source of zach-d-films + low-poly skills |
| cartoon-short-kit | https://github.com/jonhelpangan-jpg/cartoon-short-kit | inspected | 2D toon base + framing/motion/paint modules |
| anything2explainer | https://github.com/Vincentwei1021/anything2explainer | inspected | black-canvas explainer, literally the V2/V3 format |
| explainroo | https://github.com/vincentsch/explainroo | inspected | Kokoro + Whisper + canvas → MP4; same shape as our pipeline |
| manim-video-generator | https://github.com/rohitg00/manim-video-generator | inspected | motion-graphics beat: `scale(0)→1` ease_out_back, hold, shift+fade exit |
| stickman-video-director | https://github.com/kaomei/stickman-video-director | discovered | ★8.4k |

### Audio / TTS / alignment

| Resource | URL | Status | Takeaway |
|---|---|---|---|
| **Piper** | https://github.com/OHF-Voice/piper1-gpl | **integrated** | local neural TTS; `en_US-amy-medium` ONNX, MIT weights via a GitHub repo |
| **espeak-ng** | https://github.com/espeak-ng/espeak-ng | **integrated** | phonemes + word/IPA timing for Piper |
| **whisper.cpp** | https://github.com/ggml-org/whisper.cpp | **tested** | v1.8.2 built here; DTW word times for non-English; `-nfa` + `-ojf` + `t_dtw` |
| **pocketsphinx** | https://github.com/cmusphinx/pocketsphinx | **tested** | precise **English** forced alignment; English-only |
| whisper model parts | https://github.com/fmyIo/whisper-models | **integrated** | `ggml-small.bin` as 6 committed parts (release assets are blocked) |
| kokoro-js | https://github.com/hexgrad/kokoro | **tested → unusable here** | installs; ~327 MB weights on HuggingFace, host blocked |
| edge-tts | https://github.com/rany2/edge-tts | **rejected** | `speech.platform.bing.com:443` refused by egress; also MSA-with-Moroccan-voice, not true Darija |
| DarijaTTS-v0.1-500M | https://huggingface.co/KandirResearch/DarijaTTS-v0.1-500M | inspected | fine-tuned OuteTTS, Apache-2.0; **best native Darija path off-sandbox** |
| XTTS v2 | https://github.com/coqui-ai/TTS | inspected | voice cloning; HF weights blocked here |
| sherpa-onnx | https://github.com/k2-fsa/sherpa-onnx | discovered | offline ASR/TTS runtime |
| stable-ts / whisper-timestamped | https://github.com/jianfch/stable-ts | inspected | alternative word-timestamp stabilisers |

### Papers / docs

- SwiftShader docs: https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
  (the `rejected` Round-2 record points here; superseded by `swangle-headless-webgl`).
- 3D Gaussian Splatting: https://arxiv.org/pdf/2308.04079 — inspected, not applicable to this pipeline.
- Whisper→ASS karaoke pipeline overview: https://free.ai/video/caption/

---

## C · Reference videos (inputs, not repo assets)

Stored in `google_drive/` (**gitignored** — they are the user's inputs, fetched via the Drive
connector). Analysis artifacts live in `research/artifacts/round8/`.

| ID | What | What it taught |
|---|---|---|
| V1 | 3D dramatic narrative | 0 cuts, red-keyword karaoke |
| V2 | @Silenthys Gojo "Six Eyes" explainer | 60 fps, no hard cuts, eased beats every 2–4 s, word-karaoke, counters, **perpetual backdrop → 0 freezes**, −14 LUFS |
| V3 | @silenthysanime Tanjiro breathing explainer | same grammar as V2 |
| n1–n5 | additional genre references | pacing, caption style |
| n2 (kounkan) | authentic Darija 3D toon stick figures | confirms target: ديال/فالـ/رويدة, word-karaoke, **−14.37 LUFS**, 60.5K likes |
| n6, n7 | ProvenTube, Claude tutorial | workflow context |
| Stick3D-Pack-v4.zip | the source skill pack | vendored to `research/references/stick3d/` |

**Analysis protocol:** [08-methodology.md §4](08-methodology.md).

---

## D · Local tooling (in this repo)

| Tool | Purpose |
|---|---|
| **`skills/code-animation-studio/`** | **this skill** — SKILL.md entry, START-HERE cold start, 12 reference docs, VALIDATION.md |
| `research/tools/kb.mjs` | evidence-enforced ledger CLI: `add/list/show/stats/validate/report` |
| `research/tools/bootstrap_ledger.mjs` | initial ledger construction |
| `research/tools/browser/{provision,render}.sh` | the Round-2 DOM/CSS/GSAP render cell |
| `research/tools_gh_search.py` | cached, rate-limit-friendly GitHub repo search |
| `research/tools_meta.py` | exact repo metadata via `gh api` |
| `research/tools_inspect.py` | structural inspector (SKILL.md, deps, engine signals) |
| `research/tools_matrix.py` | runs the inspector over all clones |
| `research/tools_apiprobe.py` | tree + SKILL.md reader for repos not cloned |
| `studio/{swangle,voice,whisper}_setup.sh` | reproducible environment setup |
| `studio/cli.mjs` | the Round-1 explainer pipeline CLI (`doctor/plan/render/adapters/runs`) |
| `studio/voice.py`, `studio/align.py` | Piper synthesis; energy-island word alignment |

**Research data:** `research/data/capability_database.json` (9 capability groups × 46 providers),
`repos_inspected.csv` (33 clones), `skills_inventory.csv` (185 SKILL.md records),
`research/raw/discovered_repos.json` (724 repos), `research/raw/matrix.json`.
`research/clones/` (2.8 GB) and `research/raw/apiprobe/` are gitignored — recreate with the scripts.

---

## E · Decision summary — what we adopted vs. what we left

**Adopted as patterns (no new runtime dependency):** Remotion's `interpolate`/`spring`; the Stick3D
puppet/billboard architecture and Catmull-Rom camera; Manim's rate functions; video-talkcraft's
anti-PPT camera and freeze-review loop; the pack's QA/style/creative-freedom rules; pocketsphinx
alignment (actual code reuse).

**Adopted as dependencies:** `@sparticuz/chromium`, `puppeteer-core`, `three@0.149.0`,
`@napi-rs/canvas`, `@ffmpeg-installer`/`@ffprobe-installer`, Piper + espeak-ng, whisper.cpp,
pocketsphinx.

**Left alone:** Remotion runtime, Manim, vsim film3d, HyperFrames render, Rive, kokoro-js, edge-tts,
XTTS, DarijaTTS (the last four blocked by egress, not by quality).

> **The principle:** take the *idea*, not the *dependency*, whenever the idea can be expressed in
> the existing architecture. It kept the engine portable, offline-capable and debuggable.
