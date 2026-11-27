# 12 · Portability — using this skill in another repo or environment

This skill is written to survive a move. Nothing in it requires *this* machine; everything
requires *capabilities* that can be rebuilt. This page tells you what to copy, what to rebuild,
and what to change when the environment differs.

---

## 1. What to copy into a new repository

**Minimum viable engine (the production path):**

```
studio/src/puppet2d.js          # 2D acting puppet
studio/src/stickworld.js        # toon primitives, textures, shadows, billboard, cineCam
studio/src/worldkit.js          # props, atmosphere, lighting, Catmull-Rom camera
studio/src/actor.js             # locomotion, idle, gesture recipes
studio/src/film_potter.js       # worked example -> rename/copy for your film
studio/src/audiopipe.mjs        # narration, alignment, ASS karaoke
studio/src/score_world.mjs      # procedural score
studio/src/sfxkit.mjs           # SFX + ducking mixer
studio/experiments/r11_render.cjs     # headless render driver
studio/experiments/r11_narration.mjs  # narration bundle runner
studio/experiments/r11_audio.mjs      # audio assembly
studio/experiments/r11_finish.sh      # encode/mux/burn
studio/swangle_setup.sh
studio/voice_setup.sh
studio/whisper_setup.sh
studio/package.json             # dependency list
research/references/stick3d/voice/align.py   # pocketsphinx aligner (used by audiopipe)
research/references/stick3d/rules/*.md       # the style contract
skills/code-animation-studio/                # this skill
```

**Optional legacy paths** (copy only if the subject needs them): `cartoon.mjs`, `stickman.mjs`,
`lowpoly.mjs`, `raster3d.mjs`, `character3d.mjs`, `animation.mjs`, `cinema.mjs`, `kinetic.mjs`,
`vfx.mjs`, `waterfx.mjs`, `audio.mjs`, `score.mjs`.

**Do NOT copy:** `node_modules/`, `/tmp` stacks, `research/clones/`, `google_drive/`,
`studio/lib*/`, `studio/piper/`, rendered frame directories. All are rebuildable or gitignored.

---

## 2. Paths you must adapt

The reference implementation has a few absolute paths. **Find and replace them:**

```bash
grep -rn "/home/user/general-mining-os" studio/ | grep -v node_modules
grep -rn "/tmp/" studio/experiments/*.mjs studio/experiments/*.sh studio/src/*.mjs
```

Known absolute-path locations:
- `studio/experiments/r11_audio.mjs` — `const R = '/home/user/…/research/artifacts/round11'`
- `studio/experiments/r11_narration.mjs` — `const ROOT = '/home/user/general-mining-os'`
- `studio/experiments/r11_finish.sh` — `cd /home/user/general-mining-os`
- `studio/src/audiopipe.mjs` — `FFMPEG`/`FFPROBE` resolve relative to the module; `WHISPER_CLI`,
  `WHISPER_MODEL` point at `/tmp`.

**Recommended fix when porting:** replace the constants with environment variables and a
repo-root resolver:

```js
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = process.env.STUDIO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const R = process.env.ARTIFACT_DIR || `${ROOT}/research/artifacts/roundN`;
```
```bash
# in finish.sh
cd "${STUDIO_ROOT:-$(git rev-parse --show-toplevel)}"
```

`/tmp` paths are **environment-scoped, not repo-scoped** — keep them configurable via
`SWANGLE_DIR`, `OUTDIR`, `FRAMES_DIR`, which the drivers already read.

---

## 3. Rebuilding the environment elsewhere

### Case A — same kind of sandbox (Linux, npm + pip + GitHub reachable)

```bash
bash studio/swangle_setup.sh
bash studio/voice_setup.sh
bash studio/whisper_setup.sh
pip3 install --break-system-packages pocketsphinx
cd studio && npm install --ignore-scripts
```
Then verify with the 3-frame smoke test in [START-HERE.md](../START-HERE.md).

### Case B — a normal developer machine (macOS/Windows/full Linux, GPU available)

You do **not** need the SwiftShader workaround. Simplify:

- Install Chrome/Chromium normally; use `puppeteer` (not `puppeteer-core` + `@sparticuz/chromium`).
- Drop `LD_LIBRARY_PATH` and the AL2023 extraction entirely.
- Launch with `headless: 'new'`; a real GPU makes rendering **much** faster than 519 ms/frame.
- You may use a modern three.js — but then you must switch from `addScriptTag` (classic) to an
  ESM page (`page.setContent` with `<script type="module">` and an import map, or bundle with
  esbuild). **The r149 pin exists only because of classic-script injection.**
- Install system `ffmpeg` (full build) — then `xfade` becomes available and you *may* move
  transitions into ffmpeg. The in-render compositor still works and keeps timing exact.
- HuggingFace is reachable → kokoro-js, XTTS v2 and **DarijaTTS** become viable. Re-evaluate them;
  their `rejected`/`blocked` status here was **environmental, not qualitative**.

### Case C — no browser at all

Use the **software rasteriser path**: `lowpoly.mjs` / `raster3d.mjs` + `character3d.mjs` +
`cinema.mjs`. It needs only Node + `@napi-rs/canvas`. Costs: 36.7 ms/frame at 360×640 upscaled,
172 ms native 1080. You lose the puppet/billboard architecture; you gain zero browser dependency.
The Round 7 3D short (21.63 s, QA-pass) was produced entirely this way.

### Case D — different egress rules

Re-test, don't assume. The blocked hosts here were: `huggingface.co` + `cdn-lfs`,
GitHub **release assets**, `speech.platform.bing.com`, apt. Allowed: `github.com`,
`codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.

```bash
curl -sI --max-time 8 https://huggingface.co | head -1
curl -sI --max-time 8 https://registry.npmjs.org | head -1
```
If HF is reachable, the TTS landscape changes completely — see the `darija-tts-landscape` ledger
record for the ranked options.

---

## 4. Capability checklist (what must be true, however you provide it)

| Capability | How it's provided here | Alternatives |
|---|---|---|
| Draw 2D canvas from Node | `@napi-rs/canvas` | `node-canvas`, browser canvas |
| Render 3D | headless Chromium + SwiftShader + three r149 | real GPU + modern three; or software rasteriser |
| Encode video | npm `@ffmpeg-installer` (4.1, no xfade) | system ffmpeg (full) |
| Neural TTS | platform voice tool, or Piper local | any cloud TTS; kokoro/XTTS if HF reachable |
| English forced alignment | pocketsphinx + `align.py` | whisperX, stable-ts, Montreal Forced Aligner |
| Non-English alignment | whisper.cpp DTW + DP | faster-whisper, whisperX |
| Caption burn | ffmpeg `subtitles=` + ASS | draw captions in-canvas per frame |
| Music/SFX | procedural synthesis in JS | licensed tracks (mind the rights) |
| Frame inspection | contact sheets + image-reading tool | any way to actually *view* pixels |

**If you cannot view rendered frames, you cannot do QA.** Solve that before producing anything.

---

## 5. What does NOT port (be honest about it)

- **The registered voice IDs** (`voice-02`, `voice-01`) belong to this platform session. A new
  environment must register its own voice or use Piper/cloud TTS.
- **The `/tmp` stacks** — always rebuild.
- **The reference videos** in `google_drive/` — they are the user's inputs, gitignored. Ask for
  them again or work from the measured findings in `research/ROUND8_REFERENCE_STUDY.md`.
- **The measured performance numbers** — 519 ms/frame is specific to 2 CPU cores with SwiftShader.
  Re-measure on new hardware; don't quote these as universal.
- **The egress conclusions** — environmental, not permanent. Re-test.

---

## 6. Porting verification (run before your first production)

```bash
# 1. render stack
LD_LIBRARY_PATH=... SWANGLE_DIR=... FRAMES=3 node studio/experiments/stickscene_demo.cjs
# 2. audio stack
node -e "import('./studio/src/audiopipe.mjs').then(m=>console.log(m.FFMPEG, m.DEFAULT_LANG))"
# 3. alignment on a known clip (compare a word onset to a measured silence boundary)
# 4. mid-shot sheet of the worked film -> VIEW IT -> must show 9 distinct scenes
# 5. QA filters run and print numbers
```

Only when all five pass should you start a new film. If any fails, the fix is in
[10-troubleshooting.md](10-troubleshooting.md).

---

## 7. Keeping the knowledge alive in the new repo

Recreate the three-layer knowledge system, because it is what makes the *next* agent effective:

1. `research/KNOWLEDGE_BASE.md` — copy it, then **append** your rounds. Never rewrite history.
2. `research/ledger.json` + `research/tools/kb.mjs` — copy both; keep the evidence ladder enforced.
3. `research/ROUND*_*.md` — write one per round: what was built, what broke, what is still wrong,
   how to reproduce.

When a conclusion changes, **add** a new record and state the supersession explicitly. That is how
the WebGL dead-end is handled here, and it is why this skill can tell you *why* the old doc is wrong
instead of silently contradicting it.
