# Validation record — what was actually checked when this skill was written

Written at commit `4c7eae0` (branch `arena/9b543693-general-mining-os`), 2026-11-26.
This file exists so a future agent knows **which claims were re-verified** and which were
transcribed from existing project records. It is not a marketing page.

---

## 1. Executed during skill authoring (fresh evidence)

| Check | Command | Result |
|---|---|---|
| Render stack alive | `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle FRAMES=3 node studio/experiments/stickscene_demo.cjs` | **`RENDERED 3 frames @720x1280, 563 ms/frame, total 1.7s`** |
| `FRAMES` env var honoured | `grep -n "process.env.FRAMES" studio/experiments/stickscene_demo.cjs` | line 14: `parseInt(process.env.FRAMES \|\| '240', 10)` |
| Mid-shot procedure | `MID=1 OUTDIR=/tmp/skillmid node studio/experiments/r11_render.cjs` | **9 frames, 839 ms/frame, 7.5 s**, one per shot |
| Contact-sheet command | `ffmpeg -start_number 0 -i /tmp/skillmid/f%04d.png -vf "scale=236:420,tile=5x2:padding=4:color=black" -frames:v 1 sheet.png` | 521,835-byte PNG produced |
| **Sheet viewed** | image-reading tool on the PNG | **9 distinct scenes confirmed**: village square, gold-vs-clay two-shot, mocking three-shot, workshop wheel, montage shelf, night kiln, gasping crowd, ornate vase, night celebration with confetti |
| Container probe | `ffprobe -show_entries format=duration,size:stream=...` | `h264 720x1280 30/1`, `aac`, `duration=36.000000`, `size=9744427` |
| Freeze gate | `freezedetect=n=0.003:d=0.4` | **0** `freeze_start` events |
| Black gate | `blackdetect=d=0.1:pix_th=0.10` | 2 intervals: **0.0–0.1 s** (shot 0 `fadein`) and **17.1–17.2 s** (shot 5 `dip`) — both match the shot table's intended transitions |
| Loudness gate | `loudnorm=I=-14:TP=-1:LRA=11:print_format=json` | **`input_i −14.70`, `input_tp −3.98`, `input_lra 3.60`** |
| Ledger CLI | `node research/tools/kb.mjs stats` | printed **63 records** — 6 discovered / 17 inspected / 6 tested / 32 integrated / 2 rejected; 38 evidence-backed. After recording this skill (`code-animation-studio-skill`) the ledger is **64 / 33 integrated / 39 evidence-backed**, and `validate` passes. |

| GitHub byte verification | `gh api repos/…/contents/PATH?ref=BRANCH -H "Accept: application/vnd.github.raw"` + `sha256sum` | **15 / 15 skill files byte-identical on GitHub** |
| Egress finding | `curl https://raw.githubusercontent.com/…` | **failed** (`SSL_ERROR_SYSCALL`, error 35) — `gh api` used instead; recorded as troubleshooting entry A9 |

The validation sheet is preserved at
`research/artifacts/round11/skill-validation-sheet.png`.

**Note on loudness rounding:** earlier project records say −14.69 LUFS; this re-measurement printed
−14.70. The skill uses **−14.7 LUFS** throughout to stay accurate to both.

---

## 2. Static verification (every reference checked against the filesystem)

| Check | Method | Result |
|---|---|---|
| Internal markdown links | script walking every skill file, resolving each relative markdown link target against the filesystem | **0 broken links** (48 internal links across 15 files) |
| Repo paths cited | script extracting every `studio/…`, `research/…`, `skills/…` path | **73 paths checked, all exist** (glob patterns expanded and checked individually) |
| Gitignored paths | `research/clones/`, `research/raw/apiprobe/` | correctly absent; documented as rebuildable, not as available |
| Placeholder paths | `research/artifacts/roundN/…` | intentional template placeholders in the runbook, not real paths |
| `WorldKit` members | 32 claimed names grepped in `worldkit.js` | **all present** in the return object |
| `ActorKit` members | `Actor`, `path`, `idle`, `G` | all present |
| `StickWorld` members | `box ball cyl cone patternTex surface shadow billboard cineCam` | all present |
| `ActorKit.G` recipes | read `actor.js` L48–75 | **12 recipes confirmed** with the exact pose fields documented |
| `drawPuppet` pose fields | `grep -oE 'p\.[a-zA-Z]+' puppet2d.js` | `air armK armL armLK armR armRK arms flip hunch lookX mood nerv speed squash sweat t tilt walk` — matches the documented table exactly |
| `look` fields | `grep -oE 'look\.[a-zA-Z]+'` | `badge body glasses hair hairColor hat outfit shirt shoe skin tie` — matches |
| Mood names | read the mood branches | `grin smile shock deadpan worry angry laugh gulp` confirmed |
| Arm modes | read the mode branches | `down up head chest hold box shrug point` confirmed; `point` extends the right arm only |
| SFX kinds | `grep` on `sfxkit.mjs` | **12 listed + `crickets` = 13** confirmed |
| Score moods | `grep` on `score_world.mjs` | `dawn tense build night swell wonder joy` confirmed |
| Framing table | recomputed `2·atan(tan(vFov/2)·0.5625)` and `z·tan(hFov/2)` | table **corrected** to the computed values (24.4°/27.5°/31.3°/34.6°; ±1.30…±3.12) |
| Billboard height fraction | `2.5/(2·9·tan(55°/2))` | **26.7 %** — matches the "≈27 %" claim |
| `fitFov` 22 iterations | `cinema.mjs` L237 | `for (let i = 0; i < 22; i++)` confirmed |
| Grain 0.07 | `tanjiro3d.mjs` L243 | comment confirms the CRF-survival rationale |
| Module/experiment counts | `ls \| wc -l` | **39** src modules, **20** experiments |
| Commit ladder | `git rev-list --count HEAD`, `git rev-parse HEAD` | **21 commits**, HEAD `4c7eae0b4014cd0cb3034320cb94c8e2ae395596` |
| Shot table | `grep "name: '" film_potter.js` | 9 shots with the exact `start`/`dur`/`trans` values documented in [04-camera.md](references/04-camera.md) |
| Transition compositor | read `r11_render.cjs` L54–62 | `dissolve/fadein/dip/bloom` + 1.0 s outro confirmed |
| Ducking constants | read `sfxkit.mixNarration` | `0.002` smoothing, `sm*12`, `1−0.45*duck`, limiter `0.98` confirmed |
| Audio runner constants | read `r11_audio.mjs` | 7 music sections, 17 SFX events, `LEAD 1.2`, `TOTAL 36.0`, `musicGain 0.32`, `sfxGain 0.55`, `marginV 400` confirmed |
| Setup scripts | read all three verbatim | commands and paths in the skill match the scripts |

---

## 3. Transcribed from existing project records (not re-executed)

These are quoted from `research/ROUND*.md`, `RECOVERY_ROUND7.md`, `KNOWLEDGE_BASE.md` and the
ledger, which were themselves written from measured runs in earlier rounds. They are labelled
as historical results in the skill, not as fresh measurements:

- Rounds 1–8 frame costs, defect lists and QA outcomes.
- Round 11's original full-render statistics (1080 frames, 519 ms/frame, 560.9 s).
- The whisper/pocketsphinx alignment accuracy figures (`pottery@0.17 s`, `One@2.60 s` vs
  silence-end 2.612 s; Darija caption match at clip-4.16 s).
- The egress blocks (HuggingFace, GitHub release assets, `speech.platform.bing.com`, apt).
- Reference-video measurements (V2/V3 60 fps, −14 LUFS; n2 at −14.37 LUFS).
- GitHub star counts and repo descriptions in the resource catalog.

**Not re-tested here:** the Stick3D Remotion runtime, Remotion, Manim/ecmanim, vsim film3d, Rive,
kokoro-js, edge-tts, XTTS, DarijaTTS. Their statuses in the skill are exactly the ledger's statuses.

---

## 4. Known limitations of this validation

- The full 1080-frame render was **not** re-run; only the 3-frame smoke and 9-frame mid passes.
- Audio was **measured, not heard**. No claim is made about how the film sounds.
- Motion was judged from **9 mid-shot frames plus the previously viewed 24-frame QA sheet**, not
  by watching the video.
- The portability instructions for **Case B** (developer machine with a GPU, modern three.js,
  system ffmpeg, HuggingFace reachable) are **reasoned adaptations, not executed procedures**.
  They are labelled as such in [12-portability.md](references/12-portability.md).
- No new film was produced during skill authoring; the deliverable referenced throughout is the
  existing Round-11 film, unmodified.

---

## 5. How to re-run this validation

```bash
# structure
node research/tools/kb.mjs stats
ls studio/src | wc -l && ls studio/experiments | wc -l

# render stack
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle FRAMES=3 \
  node studio/experiments/stickscene_demo.cjs
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle MID=1 OUTDIR=/tmp/skillmid \
  node studio/experiments/r11_render.cjs
studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg -y -hide_banner -loglevel error \
  -start_number 0 -i /tmp/skillmid/f%04d.png \
  -vf "scale=236:420,tile=5x2:padding=4:color=black" -frames:v 1 /tmp/skillmid/sheet.png
# then VIEW /tmp/skillmid/sheet.png

# QA gates on the delivered film
V=research/artifacts/round11/the-boy-who-chose-clay.mp4
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
$FF -hide_banner -i "$V" -vf freezedetect=n=0.003:d=0.4 -an -f null - 2>&1 | grep -c freeze_start
$FF -hide_banner -i "$V" -vf blackdetect=d=0.1:pix_th=0.10 -an -f null - 2>&1 | grep blackdetect
$FF -hide_banner -i "$V" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | tail -14
```
