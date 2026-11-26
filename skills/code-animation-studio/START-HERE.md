# START HERE — a completely new agent's first 30 minutes

You have never seen this project. This page gets you to a verified first render without
guessing. Follow it in order. Every command here was executed in the reference environment.

---

## Minute 0–5 · Establish ground truth (never skip)

Do not trust any summary, including this one, over the repository.

```bash
git rev-parse HEAD                 # what commit am I on?
git branch --show-current          # which branch am I allowed to work on?
git status --short                 # what is already dirty? (do NOT stage other people's noise)
ls studio/src/ research/           # does the engine exist here?
```

**If `studio/` does not exist** you are in a different repository. Go to
[12-portability.md](references/12-portability.md) — it explains which files to copy and how to
rebuild the environment from scratch. The skill is designed to work in that case.

**If `studio/` exists**, read these three, in this order:

1. `research/KNOWLEDGE_BASE.md` — the living technical reference (~240 lines). This is the
   single densest source of truth. Read all of it.
2. `skills/code-animation-studio/references/01-history.md` — how the engine got here.
3. `studio/src/film_potter.js` — a complete worked film. This is the pattern you will copy.

Then check the evidence ledger:

```bash
node research/tools/kb.mjs stats            # 64 records at time of writing
node research/tools/kb.mjs list --status integrated
node research/tools/kb.mjs show worldkit    # any record: findings + evidence + artifacts
```

---

## Minute 5–15 · Rebuild the environment

The render/audio stacks install into `/tmp`, which **does not survive a sandbox reset**. Assume
they are missing and re-run setup. Each script is idempotent — it skips what already exists.

```bash
bash studio/swangle_setup.sh       # Chromium + SwiftShader + three@0.149.0 -> /tmp/swangle
bash studio/voice_setup.sh         # Piper TTS + espeak-ng + amy voice -> studio/lib*, studio/piper
bash studio/whisper_setup.sh       # whisper.cpp + ggml-small (487 MB) -> /tmp/wcpp, /tmp/whisper-dl
pip3 install --break-system-packages pocketsphinx   # precise English forced alignment
cd studio && npm install --ignore-scripts && cd ..  # ffmpeg/ffprobe/canvas live here
```

Read each script before running it. Never execute an uploaded `setup.sh` unread.

**Verify the render stack actually works** (this is a 3-frame smoke test, ~10 s):

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle FRAMES=3 \
  node studio/experiments/stickscene_demo.cjs
# expect: RENDERED 3 frames @720x1280, ... ms/frame
```

If that fails, stop and read
[10-troubleshooting.md § Environment](references/10-troubleshooting.md). Do not proceed to
production on a broken stack.

**Verify the audio stack:**

```bash
ls /tmp/wcpp/whisper.cpp-1.8.2/build/bin/whisper-cli /tmp/whisper-dl/ggml-small.bin
ls studio/piper/amy.onnx
studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg -version | head -1
```

---

## Minute 15–30 · Prove you can see what you make

Render one frame per shot of the existing film and **look at it**. This calibrates your eye
against a known-good output and proves the whole visual path works.

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle MID=1 OUTDIR=/tmp/mid \
  node studio/experiments/r11_render.cjs

studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg -y -hide_banner -loglevel error \
  -start_number 0 -i /tmp/mid/f%04d.png \
  -vf "scale=236:420,tile=5x2:padding=4:color=black" -frames:v 1 /tmp/mid/sheet.png
```

Now **open `/tmp/mid/sheet.png` with your image-reading tool and actually look at it.**
You should see 9 distinct scenes: a village square, a gold-vs-clay two-shot, a mocking
three-shot, a pottery workshop, a montage shelf, a night kiln, opening doors with a crowd,
an ornate glowing vase, and a night celebration with confetti.

If you see that, you are ready. If you see black frames, empty rooms, or characters outside
the frame, you have a real defect — go to
[10-troubleshooting.md](references/10-troubleshooting.md).

---

## Then: produce something

Go to [07-workflow.md](references/07-workflow.md) and follow the 15 steps. The short version:

1. Write an original English script with a first-line hook (~89 words ≈ 32 s at 0.9× pace).
2. Generate narration; force-align it; get word timestamps. **The word track is your timeline.**
3. Cut the script into beats; design one shot per beat, each with a different location,
   camera language and action. Write 3 ideas per scene and pick the least obvious one.
4. Copy `film_potter.js` → your film module. Build worlds with `WorldKit`, act with `ActorKit`.
5. `SMOKE=1` render (2 frames/shot) to catch crashes → `MID=1` render to judge composition →
   **view both sheets** → fix → only then full render.
6. Assemble audio (score sections + SFX on action beats + ducked mix), encode, mux, burn captions.
7. QA: `blackdetect`, `freezedetect`, loudness, `ffprobe`, and a 1-fps contact sheet you **view**.
8. Fix, re-render, re-check. Commit, push, verify the remote bytes by SHA-256, deliver links.

---

## Traps that will bite you in the first hour

These are the ones that cost real time in this project. Full catalogue in
[10-troubleshooting.md](references/10-troubleshooting.md).

- **`pose.t` is mandatory.** `drawPuppet` reads `p.t` for breathing/blink. Omit it and you get
  `createRadialGradient ... non-finite` on the first frame. `ActorKit.Actor.update` injects it.
- **`W.box/ball/cyl/cone` return a `THREE.Group`, not a `Mesh`.** Material is
  `group.children[0].material`. `group.material` is `undefined`.
- **`box` lives on `StickWorld` (`W`), not `WorldKit` (`K`).** `K.box is not a function`.
- **Portrait 720×1280 has a narrow horizontal field of view.** Two characters at x = ±2 need
  camera z ≥ 9 or fov ≥ 55, or they are simply outside the frame. Vertical fov is not horizontal fov.
- **The first 2 frames of every shot are inside its transition.** A `SMOKE=1` sheet looks
  mostly black/faded — that is expected, not a bug. Use `MID=1` to judge composition.
- **`/tmp` is not persisted.** Re-run setup scripts after any reset; never commit `/tmp` paths
  as if they were durable.
- **ffmpeg here is a 4.1-era static build: no `xfade`.** Transitions are composited in-render.
- **Run ffmpeg from the repo root** — the binary paths in the scripts are repo-relative.
