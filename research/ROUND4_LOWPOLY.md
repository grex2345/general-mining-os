# Round 4 — Low-Poly Cinematic Engine

Status: **experimental results only. Nothing published, nothing produced for release.**
Date: 2026-11-25 · Branch: `arena/9d597f99-general-mining-os`

---

## 1. The constraint that shaped everything

| | |
|---|---|
| Cores | ~2 |
| RAM | 3 GB |
| GPU | none usable (WebGL dead across 7 flag sets / 3 ICDs, established in Round 2) |
| Previous best frame | 438 ms at 1080×1920 (Round 2 look-dev) |

Every conventional path was already measured and rejected:

| Path | ms/frame | Verdict |
|---|---|---|
| Browser WebGL / three.js | — | dead, no GL context in this sandbox |
| `vsim` | 2 040 | rejected |
| Round 2 look-dev | 438 | too slow for anything but stills |
| Round 3 2D vector engine | 171 | good, but it is 2D |

So Round 4 could not be "a bit faster 3D". It had to be a different render model.

---

## 2. What was inspected from the new reference

`research/references/lowpoly/template.html` (34 917 B) was decoded from the
`artemnovitckii/claude-animation-skills` repo and read in full. The two mechanisms
that matter are both `onBeforeCompile` patches:

```js
// vertex: quantise the projected position to a virtual 360x640 grid
gl_Position.xy = floor(gl_Position.xy / gl_Position.w * sn + 0.5) / sn * gl_Position.w;

// fragment: 15-bit ordered dither with the classic 4x4 Bayer matrix
gl_FragColor.rgb = clamp(floor(gl_FragColor.rgb * 31.0 + th + 0.5) / 31.0, 0.0, 1.0);
```

plus `renderer.setSize(360, 640, false)` with `image-rendering: pixelated`, and
`NearestFilter` on textures drawn at 16–64 px.

**The insight is not the shader.** It is that the reference renders **one ninth of
the pixels** and spends the savings on look. That is a budget decision, not a
quality compromise, and it is the one thing a 2-core machine can actually use.

---

## 3. What was built

| File | Role |
|---|---|
| `studio/src/lowpoly.mjs` | software rasteriser: camera, boxes/cones, terrain, per-face shading, near-plane clipping, painter's algorithm, post |
| `studio/src/vfx.mjs` | light shafts, haze, motion blur, PS1 dither, Verlet cloth, procedural ambience |
| `studio/src/scenes/lastTrain.mjs` | the scene, staged in **screen space** |
| `studio/experiments/lowpoly.mjs` | driver: stills, build-up strip, clip, timings |
| `studio/experiments/sounddesk.mjs` | 10-cue synthesised soundtrack + measurements |

### Measured frame cost

| Target | render | post | upscale | **total** |
|---|---|---|---|---|
| 360×640 → 3× nearest | 8.5 ms | 4.1 ms | 3.1 ms | **15.8 ms** (core passes) |
| 360×640 → 3× end-to-end incl. atmosphere, snow, PNG encode | | | | **36.7 ms** |
| native 1080×1920 end-to-end | | | | **172.1 ms** |

`36.7 ms` is **12× faster than the previous best** and **56× faster than `vsim`**.
At 30 fps that is 1.2 s of wall clock per second of finished film *including PNG
encode*, so a 60-second vertical film is ~70 s of render.

**Honesty:** the 36.7 ms figure was printed by the driver on the same machine
that produced the artifact. The per-pass table (15.8 ms) is lower because it
excludes backdrop, god rays, lamp cone, snow, and PNG encoding. Both are real;
they measure different things.

### Where the 9× actually went

A resolution sweep, measured with forced Skia flush (without the flush the first
numbers were nonsense because rasterisation is deferred):

| internal | render | post | total | vs 1080p |
|---|---|---|---|---|
| 360×640 | 8.5 | 4.1 | 15.8 | 30% |
| 540×960 | 8.7 | 10.0 | 18.7 | 36% |
| 720×1280 | 8.4 | 18.2 | 26.6 | 51% |
| 1080×1920 | 11.5 | 40.3 | 51.8 | 100% |

Two findings that were not obvious:

1. **Geometry cost is resolution-independent.** 380 faces cost 8–11 ms at every
   size. Fill rate is 100% of the difference.
2. **The post pass dominated and was fixable.** Tint, grain and dither were three
   separate full-buffer passes (33.4 ms at 360×640). Folding them into one
   `getImageData` / loop / `putImageData` brought it to 4.1 ms — an 8× saving on
   the dominant term, achieved without touching the look.

After that fix, **a native 1080×1920 frame became affordable at 172 ms**, which
was not true at the start of the round. The 360 path is still 4.7× faster and is
the one that carries the style, so both are shipped.

---

## 4. Results

`research/artifacts/round4/`

| File | What it is |
|---|---|
| `exp-lowpoly.png` | hero still, 360→3× path |
| `exp-lowpoly-1080.png` | the identical shot, native 1080 |
| `exp-lowpoly.mp4` | 60-frame move (2 s), 360→3× path |
| `exp-lowpoly-1080.mp4` | same move, native 1080 |
| `exp-lowpoly-steps.png` | 4-panel build-up: geometry → lighting → atmosphere → grade |
| `exp-lowpoly-steps-1080.png` | the same strip at 1080 |
| `exp-sound.wav` / `.mp3` | 6 s, 10 cues, 44.1 kHz stereo |
| `exp-sound-wave.png` | waveform + spectrogram |
| `exp-sound.json` | every measurement |

Measured layout on the 360×640 buffer, mid-shot:

```
dog      x=214  baseY=424  topY=302  depth=7.0   h=122px  (19% of frame height)
station  x=62   baseY=338  topY=137  depth=16.5  h=201px
lamp     x=300  baseY=386  topY=167  depth=9.5   h=219px
```

### Sound

10 cues, all synthesised — no sample library, no network:

| Measurement | Value |
|---|---|
| peak | −1.5 dBFS |
| RMS | −16.17 dBFS |
| crest factor | 14.67 dB |
| DC offset | −1.4×10⁻⁴ |
| clipped samples | 0 |
| band energy | low 0.131 · mid 0.075 · high 0.036 |
| RMS per second | −17.2 −18.4 −13.4 −18.1 −27.9 −21.6 |

**I have not listened to it.** The claims above are all measurements. The
spectrogram shows the wind bed as a continuous low-mid field, the footsteps as
broadband transients, and the horn as a narrow band around 174 Hz with visible
harmonics — that is consistent with the design, but consistency is not the same
as "it sounds good". Please judge the audio yourself: `exp-sound.mp3`.

---

## 5. Defects found and fixed this round

Each of these cost real debugging time and is now guarded in code.

| # | Defect | Cause | Fix |
|---|---|---|---|
| 1 | whole frame black | double-sided terrain fell through `shadeFace` returning **0..1** albedo where 0..255 was expected | return albedo×255 when there is no normal |
| 2 | fog turned everything blue-grey | fog colour was 0..1 but mixed against 0..255 channels | mix at one scale |
| 3 | ground painted over everything | painter's algorithm sorted a plane touching the camera *nearer* than distant objects | `sortKey:'far'` |
| 4 | **#3's fix was inverted** | sorted descending, so "min" put the ground last | sort on the *farthest* corner |
| 5 | ground still ate the scene | painter's algorithm cannot interleave a ground plane with objects at all | **terrain pre-pass**: ground layer painted whole, then solids |
| 6 | holes in the ground in front of camera | faces with any vertex behind the lens were dropped | near-plane **clipping** in camera space |
| 7 | god rays were 8× too strong | gradient offsets are measured along the gradient axis, not absolutely; a narrow wedge only sampled offset 0 | project offset onto the axis |
| 8 | hero frame was empty | driver rendered frame 22 of an 8-frame run; the camera formula extrapolated 11 units backwards | clamp `k` to 0..1 |
| 9 | everything at the wrong screen position | 56° **vertical** lens = 33° horizontal, so hand-placed world coordinates never land where intended | **depth-first staging** (`stageAt`) |
| 10 | station was 12 units away but sized for 5 | pixel plan and depth plan were solved independently | derive size from measured px/unit |
| 11 | visible ground rectangles | per-quad albedo noise at a 2.2-unit grid aliased | one albedo; texture moved to post |
| 12 | rocks read as blue cubes | albedo too bright, positions outside the 33° field | near-black, outer thirds only |

---

## 6. What this round did **not** do

- **No skeletal rigging, facial animation, or character cloth on the dog.** The
  dog is ~20 posed boxes. Cloth exists in `vfx.mjs` but is not yet driving
  anything in a shot.
- **No lip-sync, no voice-over.** Only SFX-type synthesis so far.
- **The full research sweep the user asked for is not complete.** This round
  established one working engine and one working sound pipeline; the broader
  sweep (PBR materials, DOF, motion capture, grading tools, editing systems)
  is the next block of work, not something I can claim here.
- **Only one scene.** One subject, one camera move, one cue sheet.

---

## 7. Next

1. **Rig the dog properly** — a joint hierarchy with IK so it can walk, sit, and
   look, reusing the `ik2` maths already proven in `cartoon.mjs`.
2. **Cloth on a cape/scarf** using the Verlet solver, measured for cost.
3. **Depth of field** — a cheap two-layer blur using `ctx.filter`, measured.
4. **The research sweep** the user asked for, recorded properly in the ledger.
5. **Only then** a complete experimental scene combining character, camera,
   lighting, VFX and the soundtrack.

---

## 8. Reproduce

```bash
cd studio
node experiments/lowpoly.mjs 60          # 360x640 -> 3x path
RES=1080 node experiments/lowpoly.mjs 60 # native 1080 path
node experiments/sounddesk.mjs           # soundtrack + measurements
```
