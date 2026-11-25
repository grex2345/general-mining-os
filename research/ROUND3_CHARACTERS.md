# Round 3 — characters: the style was wrong, and that was the finding

Date: 2026-11-25 · branch `arena/9d597f99-general-mining-os` · commit `9293bef`

## The correction that mattered

Round 2 concluded the target was **3D cartoon with a PMREM softbox specular**.
The new reference (`image-3.png`) shows something else, and reading it carefully
changed the whole approach:

| | armour reference (round 2) | new reference (round 3) |
|---|---|---|
| medium | shaded 3D, environment reflections | **flat 2D vector** |
| outline | none (physical edges) | **self-coloured, never black ink** |
| skin | PBR + bump | **flat fill, no shadow tone at all** |
| head | ~1/6 of figure | **~42% of figure**, no neck |
| hands | modelled | **mitts** |
| lighting | key/rim/hemisphere | one hard shadow tone on clothing only |

I had been building toward the wrong target for a round. Catching that before any
production work is exactly what the approval gate is for.

## What was researched (Phase 1–2)

Two MIT reference projects, both inspected at source level:

- **`artemnovitckii/claude-animation-skills`** (1259★) — `human.js`, `materials.js`,
  `textures.js`, `shots.js`, `main.js`, `render.mjs`. Parametric lathe bodies,
  procedural canvas2d textures, PMREM softbox, Bokeh + Bloom + grade.
  **Cannot run here: needs WebGL.**
- **`jonhelpangan-jpg/cartoon-short-kit`** — `rig3d.js`, `stick.js`, `toonbase.js`.
  `LOOK.flat` is `MeshToonMaterial` with a **two-step gradient**: flat colour plus
  exactly one hard shadow tone. `LOOK.bean` scales the head `[0.94, 1.12, 0.94]`.
  Their `FACE` table has **14 expressions over 5 eye kinds and 11 mouths**, with
  every feature positioned in units of `headWidth/100`. Faces are painted onto a
  canvas texture with plain 2D calls.
  **Cannot run here: needs WebGL. Only the style and the table structure port.**

Also surveyed: 2D skeletal runtimes (Rigby2D, Cani2D, canvas-sprite-skeletal-animation),
Lottie/Bodymovin pipelines, and the general "vector rig + anchor points" technique
behind the viral shorts. None of them beat a purpose-built canvas2d rig for a fixed
cast, because none of them remove the actual work (drawing a good character).

### Approach comparison, tested against this machine (2 cores, 3 GB, no WebGL)

| approach | verdict |
|---|---|
| **Canvas2D/Skia procedural** | **chosen.** 171–178 ms/frame at 1080×1920, no deps, deterministic, full control |
| SVG + GSAP in the browser cell | viable (cell works), but transforms on grouped SVG give no benefit over drawing directly, and adds a 1 GB cell dependency for a fixed cast |
| Browser 3D via Chromium | **impossible** — no WebGL, proven 7 flag sets / 3 Vulkan configs (`webgl-swiftshader`) |
| Lightweight software 3D | works (123–148 ms/frame) but produces *shaded* 3D, i.e. the wrong style for this reference |

## What was built (Phase 3–4)

`studio/src/cartoon.mjs` — no dependencies beyond the canvas we already ship.

```
createCharacter(opts) -> {
  draw(ctx, { x, y, height, yaw, expr, blink, look, lean, squash,
              headTilt, armL, armR, handL, handR, footL, footR })
  walkPose(phase, {stride, lift, swing})   // absolute IK targets
  walkCycle(phase) -> offsets              // the underlying data
  proportions, outfit, faces
}
```

- **9 expressions** (`neutral, happy, surprised, angry, confused, sad, laughing,
  thinking, wow`) as a data table over 5 eye kinds and 7 mouth kinds — adding an
  expression is one line.
- Face features derive from `E = 0.155 × head radius`, so the face reads identically
  from 200 px to 1280 px.
- 2-bone IK for both arms and both legs; yaw compresses horizontally and slides the
  face, with the far eye fading out past 0.8.
- Flat-illustrated yard (siding, door, windows, lawn, bushes) + the shared grade pass.

### Artifacts (tracked, in `research/artifacts/characters/`)

| file | what it shows |
|---|---|
| `char-hero.png` | one character, 1080×1920, happy, hands on hips |
| `char-expressions.png` | 8 expressions on the same rig |
| `char-poses.png` | front, three-quarter, side, walking, running, impact, cheer, thinking |
| `char-sheet.png` | two characters, the reference's composition |
| `char-preview.mp4` | 150 frames: blink → walk → run → impact → recover |

## Defects found by looking, and fixed

Nine, in order of discovery. The last four were only visible in a rendered frame:

1. no hair (drawn behind the skull) → clipped hair on top
2. torso shade ellipse spilling outside the body → shade clipped, path re-declared
3. legs crossed at the ankles → stance widened to `tw × 1.30`
4. head too large and empty → proportions retuned, features scaled to `E`
5. raised arms hidden behind the head → **two-pass z-order: up/wave draw after the head**
6. hands landing below the feet → **`walkCycle` returned absolutes; now offsets plus `walkPose`**
7. two same-coloured legs merging into one column → far leg darkened 22%
8. brown crescent across the cheek → **skin has no shadow tone at all** (matches reference)
9. nose tick reading as a wart → short curved line at lower opacity

## Honest limitations

- **Not "professional" yet, by my own standard.** It is a clean, consistent, on-style
  character. It is not a rigged 3D model, has no cloth/hair simulation, and the side
  view is an approximation — a true profile needs its own head path (the horizontal
  squash floors at 0.70 precisely to avoid the "thin egg" artefact).
- No lip-sync yet: mouths are 7 hand-authored shapes, not phoneme-driven.
- The walk is IK-driven from a sinusoid; it reads well in stills and in the clip, but
  it has no weight shift, no counter-rotation, no foot roll.
- I cannot hear audio, and motion was judged from 3 fps frame strips.

## Next

1. Phoneme mouth shapes + forced alignment → lip-sync (needs the TTS route unblocked).
2. A true profile head path, so `yaw = 1.0` is a real side view.
3. Weight/anticipation passes in the walk and the impact.
4. Scene layer: more locations, camera framings, and caption styling in this palette.
