# Round 6 — Visual Quality

Constraint repeated at the top of this report because it governed every decision
in it: *"I want to see a substantial visual improvement, not simply more technical
features."* A pile of new modules that still looks low-poly is a failure. So the
work below is judged by the rendered frames in `research/artifacts/round6/`, not
by the feature list. Where something still looks wrong, it is written down as
wrong.

---

## 1. What was actually broken, and what fixed it

Every entry here was found by rendering an isolated test and measuring, then
fixed and re-measured. No entry is a guess.

### 1.1 The shadow map was darkening fully-lit surfaces
`renderShadowMap` displaced every casting vertex **30 mm** along its normal
towards the light (`sm.bias * 12`, with `bias = 0.0025`). Measured on the
character, the stored depth was then **~24 mm nearer** than the receiving surface
— larger than the receiver's own bias — so an 80 %-lit chest compared as fully
occluded. That was the dark, blotchy, "dirty" shading all over the torso and
face.

A probe (`scratch/shprobe.mjs`) printed, for four points on the body:

```
chest: ndl=0.80  lz=1.884  stored=1.864  dz=+0.020  vis=0     before
chest: ndl=0.80  lz=1.884  stored=1.899  dz=-0.015  vis=1     after
```

Fix: one shadow texel of caster offset instead of twelve. The receiver offset and
compare band were retuned to `texelWorld*(1.1+2.2*slope)` and
`texelWorld*(2.2+3.0*slope)`, and the PCF kernel widened from 5 to 9 taps.

### 1.2 Multi-object scenes rendered with the wrong material (and went black)
The palette remap rewrote `mesh.mat` **in place**. Rendering a scene twice — or
two objects that shared a material array — remapped indices that were already
mapped, so every triangle fell out of palette range. The symptom was an entire
ground plane rendering as material 17 of 18, i.e. black.

Worse, the albedo lookup used the *object-local* packed table while the index was
already in *shared* palette space, so it read `undefined` and wrote albedo 0.

Fixes, both in `raster3d.mjs`:
- the original indices are preserved in `mesh.remapFrom` and the remap always
  starts from those;
- each object's packed albedo is expanded into shared palette order.

This is the kind of bug that silently caps the engine at one object per frame,
so it mattered.

### 1.3 Fractional supersampling corrupted the whole frame
`createRenderer({ ss: 1.6 })` produced a black image with a woven moiré pattern
and took **13.2 s** per frame instead of 1.9 s. The resolve step assumes an
`ss × ss` block per output pixel; at 1.6 the buffer size and the block grid
disagree and the resolve walks off each row. `ss` is now rounded to an integer
inside `createRenderer`, which makes the whole class of bug impossible.

### 1.4 The facing test was inverted
`if (!mtlDoubleT && !(vnz > 0)) continue;` culled *front* faces and drew back
faces. On convex solids this is invisible, which is why it survived: it only
showed on the flat iris discs, which were culled completely. Now
`if (!mtlDoubleT && vnz >= 0) continue;`.

Two related fixes: an out-of-range material index no longer skips the pixel (it
wrote depth but left stale colour, punching a transparent hole), and the
G-buffer no longer normalises normals in x/y only (which silently zeroed `nz` and
banded every curved surface).

### 1.5 Surface-nets vertices were quantised to the grid
The polygoniser placed each vertex at the average of its cell's edge crossings,
which is biased toward the cell centre. At 8 mm spacing that quantised the
silhouette: the arm edge came out visibly stepped. Two clamped Newton steps along
the field gradient now put every vertex on the true zero set. Measured on the
forearm, the radius per scanline is now smooth to **0.6 mm**.

### 1.6 Material boundaries were a ragged coastline
Taking the material from the nearest implicit shape produced a boundary that
wandered wherever two shapes were equidistant — a torn edge down the side of the
body. An absolute-`x` rule was no better: the forearm sits at x = 0.13 and the
sleeve at x = 0.19, so the plane cut the arm at an angle.

The fix is structural. The body is now **two implicit fields** — torso + legs,
and arms — each meshed separately, each with an unambiguous rule
(`y > hem ? shirt : trouser`, `y > elbow ? shirt : skin`). The two meshes
interpenetrate inside the shoulder where neither is visible. The torso field
carries only two boundaries, the shirt hem and the waistband; the shoe is
separate geometry (see 1.7).

### 1.7 Shoes, hands and facial features: three separate lessons

**Shoes.** Built in the body field, the ankle material boundary cut the
near-vertical shin at a shallow angle and tore. Built as a heel ball plus a toe
ball, they read as two spheres. Built as a cuff tube, that read as a bandage.
What works is **one elongated egg per foot**, flattened underneath, its own mesh.

**Hands.** Four defects in sequence, each found by an isolated render: the palm
did not reach the knuckles (fingers floated 20 mm below the hand); the fingers
were too long for a 90 mm hand (a five pronged stick); the knuckle pad drew a
hard shelf; and straight fingers read as a fork. The hand is now a palm
ellipsoid whose lower edge *is* the knuckle plane, four fingers curled by
0.62 rad per joint so the silhouette is one rounded mass, and a thumb tucked
down and forward.

**Facial features.** A 4 mm lip line and a 2 mm brow cannot be resolved by a
2.7 mm triangle grid. Painting them on the head produced a ragged gash and a
speckle of alternating materials across the cheeks. A 30 mm eyeball inside a
dished radial skull is either swallowed by the socket or protrudes as a
hemisphere, and no radius reads at every yaw.

So the eyes, brows, mouth and blush are **composited in 2D** at anchors taken
from the rig. This is what the reference art itself does — the eye there is a
flat graphic, not a sphere. It is exact (the anchor is a real 3D point under the
skinned rig), it costs microseconds, and every expression is now a set of
numbers (`FACE` in `char6.mjs`).

### 1.8 The `open` parameter closed the mouth instead of opening it
The lip shape was drawn from fixed control points and the opening was drawn as a
second, thinner curve *inside* it. Raising `open` therefore made the mouth look
**more** closed. Both outlines now come from one curve that sags by the opening;

```
open 0.0        open 0.5        open 1.0
   ___             ___             ___
  \___/           \       /       \       /
                   \_____/         \_____/
```

This mattered because it made the entire lip-sync deliverable a no-op: the frames
differed only in lip thickness. It was caught by rendering `drawMouth` at three
openings in isolation, not by looking at the video.

---

## 2. Proportions, against the reference rather than against a number

The user required comparison with the supplied references. `image-3.png` (the
Zach 3D Films style) is unambiguous: a head of roughly **a third of the body**,
an egg-shaped chunky torso, and thin limbs.

Measured against that, the Round 5 character was wrong in a way no amount of
shading could hide: 3.6 heads tall, a narrow tube torso, and limbs that tapered
like cones. Changes:

| | before | after |
|---|---|---|
| head height | 0.176 | 0.205 |
| total height / head | 3.62 | ~3.2 |
| torso | 3 stacked ellipsoids, waistband notch | one continuous egg, widest at the chest |
| upper arm radius | 0.058 → 0.043 | 0.052 → 0.036 |
| thigh radius | 0.084 → 0.060 | 0.070 → 0.046 |
| neck | long, exposed | 30 mm shorter, partly buried in the collar |
| shoulders | deltoid ball touching the shirt | deltoid pushed 25 mm *into* the shirt |

See `05_reference_comparison.png`. It shows the reference, our closest render at
the same framing, and enlarged crops of both heads. The differences panel is
filled in by hand after inspecting the two, and lists what is **still wrong**:

- the reference eyes are closed smiling arcs; ours are open ovals;
- the reference shading is nearly flat; ours still has visible specular falloff;
- the reference hair is a sculpted mass with a cowlick; ours is a smooth cap;
- the reference has bare arms; ours has sleeves and visible finger separations;
- the reference has no visible nose at all.

Those are honest gaps, not a to-do list that has been silently completed.

---

## 3. Deliverables

All in `research/artifacts/round6/`.

| # | file | what it is |
|---|---|---|
| 1 | `01_character_hero.png` | 1080×1350, lit environment, cast shadow, full body |
| 2 | `02_expression_sheet.png` | 9 expressions, rendered **and** composited, 1.6 s total |
| 3 | `03_turntable.png` | 36 frames × 12 angles, full 360°, contact-shadow sheet |
| 4 | `04_walk_preview.mp4` | 72 frames, 3 s at 24 fps, walk cycle with arm swing and blink |
| 5 | `05_reference_comparison.png` | reference / ours / both head crops / written difference list |
| 6 | `06_voice_and_sound.mp3` | piper voice + synthesised ambience and foley, mixed |
| — | `07_voice_only.wav` | the voice alone, 22.05 kHz |
| — | `07_voice_alignment.json` | the measured word alignment |
| — | `08_lipsync_voiced.mp4` | lip-sync driven by that alignment, with audio |

## 4. Performance, measured

Renderer, 540×960 at ss 2, 76 624 triangles, 17 materials, 63 bones:

| pass | ms |
|---|---|
| geometry | 94–107 |
| shadow map | 38–48 |
| AO (half-res) | 59–66 |
| shading | 137–152 |
| resolve | 18–21 |
| **total** | **337–402** |

Hero frame at 1080×1350 (ss 2, i.e. 2160×2700 internally) with a 7 m ground
plane: **1.75–1.83 s**. Turntable frames (420×560): median **278 ms**, p90
**354 ms**. Walk frames (480×640): median **332 ms**, p90 **376 ms**.

`createFigure6()` costs **1.1–1.3 s** — two surface-nets meshes at 84×146×84 and
64×104×52, plus the head at 88×66 — and is done once per figure, not per frame.

Round 5's baseline for comparison was ~2 550 faces and 853–989 ms per frame at
the same resolution. We are now **30× the geometry at 2.4× the frame time**.

## 5. Voice: measured alignment replaces a proportional estimate

Round 5 used espeak-ng's word onsets scaled per sentence by
`piper_duration / espeak_duration`. Its own report said
`"alignment": "proportional-estimate"`. That is a guess and it drifts.

`studio/align.py` measures instead, from the audio piper actually produced:

1. RMS envelope, 10 ms hop, 30 ms window;
2. an adaptive silence threshold from the recording's own 12th/92nd percentile
   of the envelope (so it does not depend on how hot the render was);
3. speech islands, with gaps under 25 ms closed (an unvoiced stop must not split
   a word) and islands under 40 ms dropped (breaths and clicks);
4. dynamic-programming assignment of words to islands, with a cost that
   penalises a bad duration match and a penalty for sharing an island, so
   "one word ← one island" wins unless the acoustics say otherwise;
5. where several words do share an island, the boundaries are placed at the
   **local minima of the envelope**, not by dividing the island by length.

Measured on the test line ("Mining never stops, and neither do we. Every seam
tells a story worth telling out loud."), 6.35 s, 12 energy islands for 16 words:
12 words resolved to their own island, 4 shared. Every word reports which method
produced it (`energy-island` or `energy-shared`) rather than presenting both as
equal.

**Honest limit:** this is energy-based alignment, not a phoneme aligner. It
resolves word onsets to about one syllable. It cannot distinguish /p/ from /b/,
and where speech is continuous several words necessarily share an island. A real
aligner (MFA, torchaudio forced alignment) needs models that cannot be
downloaded in this sandbox; that limitation is unchanged from Round 5 and is
stated rather than papered over.

**Sound.** `12 dB` of headroom, a wind bed across the whole line, a pad entering
on the second sentence, a 3.4 kHz tick at every measured word onset so the
timing is audible, a crunch on the first word of each sentence, and a 55 Hz sub
swell under the last word. Cue times are in `06_sound_cues.json` and all come
from the alignment.

I cannot hear these files. Everything claimed above is a number in the JSON
reports; the subjective judgement is the user's.

---

## 6. What is still wrong

Listed because the constraint was a substantial visual improvement, and the
honest position is that this is a large step, not a finished look.

- **The character reads as a mannequin, not as the reference's design.** The
  reference faces are a single flat shape with no nose; ours still has a
  modelled nose, cheek mass and chin, which puts us closer to generic "cute 3D"
  than to that specific style.
- **Hair is a smooth cap.** The reference has a sculpted mass with a cowlick and
  a shaped fringe. Azimuthal ridges were tried and aliased into corduroy at
  96 segments; a displaced-cap approach would need its own pass.
- **Eyes are open ovals.** The reference's signature is closed, upturned arcs.
  Our `FACE` presets can make that shape but the default is open.
- **Shading is still not flat.** The reference is almost cel-flat; ours has
  specular falloff and a rim light. This is a style choice we have not made.
- **Hands are readable but not good.** Finger separations still read as prongs at
  full-body distance, and the thumb is crude in profile.
- **The knee still folds too sharply** in the walk at the extreme of the cycle.
  Softening the cycle to ±0.38 rad helped; the skinning itself is the limit.
- **Cloth does not move.** There is no secondary motion anywhere.
- **The mouth is the only articulator in lip-sync.** No jaw, no tongue, no
  coarticulation, and the opening is a single scalar.
