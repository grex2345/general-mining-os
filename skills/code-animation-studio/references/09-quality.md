# 09 · Quality standards & QA gates

Two sources: the reference pack's checklist (`research/references/stick3d/rules/QUALITY-CHECKLIST.md`)
and the gates this project added after its own failures. Both apply.

---

## 1. The style contract (measured from the references)

From `research/references/stick3d/rules/STYLE-SPEC.md`:

| Property | Value |
|---|---|
| Format | **720×1280 vertical, 30 fps** |
| Loudness | **−14 LUFS** |
| Camera motion | ~35 % of the time continuous |
| Scene changes | every 4–8 s, via 0.2–0.3 s ghost dissolve |
| Palette (reference) | teal `#6b9386`, sky `#849dcc`, royal `#264dba`, navy `#172353`, cream/skin `#ceb5a3`, off-white `#e8e7e9` |
| Saturation | reference 0.43 → we push **+30 %** |
| Ink outline | ~10–11 px @ 400 px canvas |
| Head size | ~27 % of canvas width |
| World lens | fov ~60–65 (the pack's 3D world; our portrait framing table in [04-camera.md](04-camera.md) governs actual shots) |
| Captions | 65–70 % height, 1–2 words visible, keyword-coloured |

Per-scene **colour world** must differ from the previous scene (wood-orange / office blue-white /
green tile / dusk blue). This is the cheapest way to make nine scenes feel like nine places.

---

## 2. The reference checklist (verbatim gates, all must pass)

**Physics**
- [ ] Every character's feet touch a surface; shadow present
- [ ] No foot sliding (walk phase = distance travelled)
- [ ] Jumps/throws follow arcs with anticipation and landing squash
- [ ] Nothing passes through walls or props
- [ ] Doors open away; the hand reaches the handle first
- [ ] Carried objects stay attached to hands

**Continuity**
- [ ] No teleport, morph or pop-in without cause
- [ ] Exits/entries via openings
- [ ] The same character looks the same across scenes

**Camera**
- [ ] No unwanted shake
- [ ] Subject framed in the upper 65 % (captions own the lower third)
- [ ] No clipping into props or the lens
- [ ] Every move has a reason

**Environment**
- [ ] **15–20 props**, textures, depth layers, light
- [ ] Colour world differs from the previous scene

**Captions/sync**
- [ ] 1–2 words visible, readable, correct text
- [ ] The key visual lands on its spoken word's frame
- [ ] Film length = audio length

**Sound**
- [ ] SFX sparse and quiet; voice dominant; not one SFX per word

**Final**
- [ ] 1-fps contact sheet of the exported MP4 **viewed**
- [ ] Duration/streams verified (h264 720×1280 30 fps + aac)
- [ ] Files actually delivered

---

## 3. The gates this project added (each exists because of a real failure)

### G1 · Byte-size sanity
Round 5 shipped a 6,354-byte MP4 with a valid `ffprobe` report and 54 black frames.
**Gate:** an MP4 under ~50 KB for a multi-second clip is suspect. Extract a frame and look.

### G2 · Text bounding-box intersection
Round 1's approved 100/100 video had a caption box overlapping the chart's x-axis.
**Gate:** compute caption rect vs every on-screen text/graphics rect; any intersection fails.

### G3 · Motion floor (frame difference)
Round 1 had a ~6 s near-static scene that scored 100/100.
**Gate:** `freezedetect=n=0.003:d=0.4` must report **zero** freezes. Plus: every shot must have
camera handheld > 0, character idle, or animated atmosphere.

### G4 · Unintended black
`blackdetect=d=0.1:pix_th=0.10`. Intentional fade-in/dip/outro are expected — **classify each
reported interval** against the shot list's transitions. Anything else fails.

### G5 · Loudness window
`loudnorm=I=-14:TP=-1:LRA=11:print_format=json`. Target −14 LUFS; within ~1 dB is acceptable and
must be reported as measured. True peak must be below −1 dBTP.

### G6 · Caption band vs composition
The caption band (65–70 % height) must not cover feet, hands or the hero object. Verified by
viewing a burned frame, not by trusting `marginV`.

### G7 · Framing arithmetic
Before rendering: every actor satisfies `|x_actor − x_cam| < z·tan(hFov/2) − 0.3`.
See [04-camera.md §1](04-camera.md).

### G8 · Exposure check
Additive glow opacity ≤ 0.32; warm key intensity ≤ 1.4 on hero reveals. Above that, toon materials
blow out to flat white and lose their texture. Verified by viewing the mid-shot frame.

### G9 · Scene-identity check
Neighbouring shots must differ in location, camera language and action type. Read the shot table
and confirm no two adjacent rows are the same idea.

---

## 4. The QA command block

```bash
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
V="$R/film.mp4"

# container
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
    -of default=noprint_wrappers=1 "$V"

# G4 black
$FF -hide_banner -i "$V" -vf blackdetect=d=0.1:pix_th=0.10 -an -f null - 2>&1 | grep blackdetect

# G3 freeze
$FF -hide_banner -i "$V" -vf freezedetect=n=0.003:d=0.4 -an -f null - 2>&1 | grep freeze

# G5 loudness
$FF -hide_banner -i "$V" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | tail -14

# the sheet you must VIEW
$FF -y -hide_banner -loglevel error -i "$V" \
    -vf "fps=1/1.5,scale=270:480,tile=6x4:padding=4:color=black" -frames:v 1 "$R/qa-sheet.png"

# byte identity after push
sha256sum "$V" /tmp/remote.mp4
```

---

## 5. What "verified" means in a report

Use this vocabulary and no other:

| Claim | Allowed when |
|---|---|
| "rendered N frames at X ms/frame" | the driver printed it |
| "0 unintended black, 0 freezes" | the filters ran and you classified the intervals |
| "−14.7 LUFS, TP −3.98, LRA 3.60" | `loudnorm` printed it |
| "sampled 24 frames at 1/1.5 fps and viewed the sheet" | you opened the image |
| "byte-identical on GitHub (sha256 …)" | you downloaded and hashed both |
| "playable" | `ffprobe` read the remote copy's streams |
| ❌ "sounds good" / "I watched it" / "smooth animation" | **never** — you cannot hear or watch |

**Measured reference results** (the delivered Round-11 film): 36.000000 s, 720×1280@30, h264+aac,
9,744,427 bytes, 1080 frames at 519 ms/frame (560.9 s render), −14.7 LUFS / TP −3.98 / LRA 3.60,
0 unintended black, 0 freezes, 24-frame sheet viewed.

---

## 6. Publish what is still wrong

Every round report ends with an honest limitations section. Round 6's list (mannequin read, smooth
hair cap, open-oval eyes vs the reference's closed smiling arcs, non-flat shading, prong fingers,
sharp knee fold, no cloth motion, mouth-only lip-sync) is the model.

Current known limitations of the production path, to carry forward:
- Billboard characters always face the camera; no true 3D body turn.
- No sitting pose; no phoneme lip-sync on the puppet path (the bone-rig path has visemes).
- Procedural score, not a composed/licensed track.
- 30 fps (the references are 60 fps); a 60 fps option is roadmap, not built.
- Gesture library is 12 recipes; physics-driven throw/pickup/eat/fight are roadmap.
- Caption sync is verified by measurement and sampled frames, not by an automated sync gate.
