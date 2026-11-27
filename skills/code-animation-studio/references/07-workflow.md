# 07 · The production runbook (15 steps)

Follow this top to bottom. Every command was executed in the reference environment. Paths are
repo-relative unless absolute; see [12-portability.md](12-portability.md) for adapting them.

Set once per shell:
```bash
export SW="LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle"
export FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
export FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
export R=research/artifacts/roundN          # your round's artifact directory
mkdir -p "$R"
```

---

## Step 1 · Inspect the repository and architecture

```bash
git rev-parse HEAD && git branch --show-current && git status --short
git ls-remote origin | head -20        # is there work on another branch you must recover?
ls studio/src studio/experiments research
node research/tools/kb.mjs stats
```

**Do not proceed on assumptions.** If the tree is dirty with someone else's changes, leave them
unstaged. If `studio/` is missing, you are porting — go to [12-portability.md](12-portability.md).

## Step 2 · Read the skill and the project's own docs

In order: this skill's [01-history.md](01-history.md) → `research/KNOWLEDGE_BASE.md` →
`research/WORKFLOW.md` → the most recent `research/ROUND*_PRODUCTION.md` →
`studio/src/film_potter.js`. Skim `research/references/stick3d/rules/` (STYLE-SPEC,
QUALITY-CHECKLIST, CREATIVE-FREEDOM) — they are the style contract.

**Check for superseded claims.** `research/ENVIRONMENT.md` and `INSPECTION_CAPABILITIES.md`
contain Round-2 conclusions ("no WebGL", "no Chromium") that Round 9 overturned. The ledger's
newer records win.

## Step 3 · Research only what you actually need

Do **not** redo the existing research. Query the ledger first:

```bash
node research/tools/kb.mjs list --status integrated
node research/tools/kb.mjs show <id>
grep -ril "your-topic" research/*.md
```

Only if the capability is genuinely absent, research it using the method in
[08-methodology.md](08-methodology.md), and record the result:

```bash
node research/tools/kb.mjs add --id my-thing --name "My Thing" --kind engine \
  --status inspected --url https://github.com/... --finding "what the source actually does"
node research/tools/kb.mjs validate && node research/tools/kb.mjs report
```

## Step 4 · Write an original script

Follow [06-story.md](06-story.md). English by default. Save to `$R/script.txt`.
Target 80–160 words for a 30–60 s film. First line mid-action, end on the payoff.

## Step 5 · Storyboard → shot list

Produce the table **beat | location | who | action | camera | transition | SFX**. Three ideas per
scene, pick the least obvious. Neighbouring scenes must differ. This table drives the film module,
the camera keys and the SFX events — keep it in `$R/storyboard.md`.

## Step 6 · Generate narration and align it

```
add_voice(text: ~35 words of the actual script, language: 'en', use_case: 'narration')
generate_speech(voice_id, text: <full script>, file_path: "$R/narration-raw.mp3")
```
Then (copy `r11_narration.mjs`, change the paths):
```bash
node studio/experiments/r11_narration.mjs
# -> narration.wav (atempo 0.9 + loudnorm -14), words.json, captions.ass
# prints DURATION and every word@time
```
Offline alternative: `python3 studio/voice.py` (Piper) then the same bundle call.

**Record the measured duration.** It defines the film's length.

## Step 7 · Build environments, characters, props

Create `$R/../studio/src/film_<name>.js` by copying `film_potter.js`. Define character `look`
objects **once**. Per shot: sky + fog + light preset + textured ground + `groundDetail` +
≥3 depth layers of props + at least one animated prop. See [03-characters.md](03-characters.md).

**Before rendering, do the framing arithmetic** ([04-camera.md §1](04-camera.md)): for every actor,
check `|x| < z·tan(hFov/2) − 0.3`. This prevents the most common defect.

## Step 8 · Animate

Per shot, build the acting timeline: `A.path` for locomotion, `A.idle` as the standing base,
`A.G.<recipe>` on the narration beats. Merge them (`Object.assign(base, gesture)`).
Every character moves or breathes in every frame. Every visible action gets a matching SFX entry
in your storyboard table.

## Step 9 · Cameras and transitions

`K.catmullCam` with 2–4 keys per shot; `handheld` never 0; `impacts` on hits; `fovKick` only on the
reveal. Assign a different transition per emotional boundary (`cut`/`dissolve`/`dip`/`bloom`).
Set `shots`, `TOTAL`, `LEAD` from the measured narration.

## Step 10 · Smoke-render, then mid-render — and LOOK

```bash
# crash check: 2 frames per shot (~20 s)
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle SMOKE=1 OUTDIR=/tmp/smoke \
  node studio/experiments/r11_render.cjs

# composition check: 1 frame at 60% of each shot, past the transitions
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle MID=1 OUTDIR=/tmp/mid \
  node studio/experiments/r11_render.cjs

$FF -y -hide_banner -loglevel error -start_number 0 -i /tmp/mid/f%04d.png \
  -vf "scale=236:420,tile=5x2:padding=4:color=black" -frames:v 1 "$R/mid-sheet.png"
```

**Open `mid-sheet.png` with your image tool and inspect every tile.** Check: characters inside the
frame, foreground not empty, no blown-out whites, props reading clearly, each scene distinct.
Fix and repeat. **Do not start a full render until this sheet is clean.** This step saved a
9-minute wasted render in Round 11.

## Step 11 · Full render (background process)

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle OUTDIR=/tmp/rNframes \
  node studio/experiments/r11_render.cjs
```
~0.5 s/frame with rich scenes: 1080 frames ≈ 9.4 min. Use the platform's background-process tool,
not a foreground command that will time out. Poll the log for `RENDERED … ms/frame`.

## Step 12 · Assemble audio

Copy `r11_audio.mjs`; set music sections to your shot boundaries and SFX events to your storyboard
times. Then:
```bash
node studio/experiments/r11_audio.mjs        # -> mixed-raw.wav, music.wav, sfx.wav, captions-final.ass
$FF -y -hide_banner -loglevel error -i "$R/mixed-raw.wav" \
  -af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000 -ac 2 "$R/final-audio.wav"
```
Remember the `+LEAD` caption shift ([05-audio.md §4](05-audio.md)).

## Step 13 · Encode, mux, burn captions

```bash
FRAMES_DIR=/tmp/rNframes bash studio/experiments/r11_finish.sh
```
Edit the script's output filename first. It encodes CRF 17, then muxes audio and burns the ASS at
CRF 18, then probes the result.

## Step 14 · Inspect the actual result, diagnose, re-render, repeat

This is the step that separates a test from a production. Run **all** of these:

```bash
# container truth
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of default=noprint_wrappers=1 "$R/film.mp4"

# unintended black (intentional fade-in/dip/outro will appear — classify them)
$FF -hide_banner -i "$R/film.mp4" -vf blackdetect=d=0.1:pix_th=0.10 -an -f null - 2>&1 | grep blackdetect

# freezes
$FF -hide_banner -i "$R/film.mp4" -vf freezedetect=n=0.003:d=0.4 -an -f null - 2>&1 | grep freeze

# loudness
$FF -hide_banner -i "$R/film.mp4" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | tail -14

# the sheet you MUST view: 24 frames across the film
$FF -y -hide_banner -loglevel error -i "$R/film.mp4" \
  -vf "fps=1/1.5,scale=270:480,tile=6x4:padding=4:color=black" -frames:v 1 "$R/qa-sheet.png"
```

**View `qa-sheet.png`.** Check caption position/legibility, character continuity (same clothes
across shots), framing, exposure, scene variety. State honestly: *"sampled 24 frames at 1/1.5 fps"*,
never "watched the video".

If anything is wrong: diagnose against [10-troubleshooting.md](10-troubleshooting.md), fix the
module, re-render **only the affected shots** if possible, re-run the gates. Repeat until clean.
Publish a "what is still wrong" list — Round 6 established this practice and it is mandatory.

## Step 15 · Deliver with verified links

```bash
# record what you built
node research/tools/kb.mjs add --id my-film-rN --name "My Film" --kind demo --status integrated \
  --evidence "36.0s, 0 unintended black, 0 freeze, -14.7 LUFS, 24-frame sheet viewed" \
  --artifact "$R/film.mp4" --finding "..."
node research/tools/kb.mjs validate

# commit additively — never delete existing knowledge
git add studio/src/... studio/experiments/... "$R" research/ledger.json research/KNOWLEDGE_BASE.md
git status --short          # confirm ZERO deletions of prior work
git commit -m "Round N: <what was built>"
git push origin <current-branch>

# VERIFY the remote bytes, don't assume the push worked.
# Preferred: gh api (api.github.com is an allowed host; raw.githubusercontent.com may be blocked)
gh api "repos/<owner>/<repo>/contents/$R/film.mp4?ref=<branch>" \
  -H "Accept: application/vnd.github.raw" > /tmp/remote.mp4
sha256sum "$R/film.mp4" /tmp/remote.mp4        # must be identical
$FP -v error -show_entries format=duration -of csv=p=0 /tmp/remote.mp4

# Alternative when raw.githubusercontent.com IS reachable (it is a public, clickable link):
# curl -sL "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/$R/film.mp4" -o /tmp/remote.mp4
```

⚠️ **Egress note (verified during skill authoring):** `raw.githubusercontent.com` failed with
`SSL_ERROR_SYSCALL` in this sandbox, while `gh api … contents/…?ref=…` with
`Accept: application/vnd.github.raw` succeeded — all 15 skill files were confirmed byte-identical
that way. **Verify through `gh api`; deliver the raw URL to the user** (their browser is not
inside the sandbox and can reach it). If the raw host is blocked for you too, say so and give the
Drive link as the primary.

Optionally upload to Google Drive via the connector and **make it public**, then verify the link
resolves. Deliver: the file itself (`present_file`), the raw GitHub URL, the Drive URL, and the
measured QA numbers. **Never invent a link or point at a file you have not verified.**

---

## The loop, compressed

```
inspect → read → (research if needed) → script → storyboard → build → animate →
camera → narration+captions → music+SFX → render → INSPECT → diagnose → re-render → deliver
                                                        ↑___________|
```

The inspect→diagnose→re-render loop is not optional and not a single pass. Round 11 ran it three
times before the full render and once after. That is what "production quality" means here.
