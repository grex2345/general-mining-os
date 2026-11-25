# Reference intake — zach-d-films engine (claude-animation-skills)

Reference received: 2026-11-25 (kit as zip-style upload; engine source **omitted** from the upload)
Status: **inspected** (source read line by line) — not tested here: it is three.js/WebGL and
this sandbox has no working WebGL. See ledger `webgl-swiftshader` for the proof.

## Correction to the earlier assessment

The upload contained `SKILL.md`, `anim.py`, `build.py`, `template.html`, `words.py`, two
contact sheets. Those are the **packaging layer**. The repo tree
(`api.github.com/.../git/trees/main?recursive=1`, 111 entries) shows what was missing:

```
skills/zach-d-films/engine/src/   human.js 18995 B  materials.js 3089 B  props.js 14413 B
                                  textures.js 5515 B  anim.js 3238 B  shots.js 24450 B
                                  main.js 7875 B
skills/zach-d-films/engine/       index.html 1242 B  render.mjs 3002 B  captions.py 1444 B
kit/fonts/                        13 woff2/ttf + OFL texts
skills/stick-figure/engine/       audio/vo_kokoro.wav, words_ref.json, tools/align.py,
                                  tools/tts_kokoro.py, tools/tts_elevenlabs.py
```

So my earlier "the gap is not mesh fidelity" conclusion was based on a frame and a
description. Reading `main.js` shows precisely **where** the look comes from. The fetch
of these files is the single most valuable thing this round produced.

Licence: GitHub's classifier says `NOASSERTION`, but `LICENSE` is a plain
**MIT License, Copyright (c) 2026 Artem Novitckii**. Verified by decoding the file.

## Technique: what actually makes it look expensive

All five layers, with their real parameters from `main.js`:

1. **PMREM environment from a hand-built softbox scene.** Not a skybox — a *studio*:
   a gradient sphere plus three emissive planes (key 8×4 at intensity 3.2 upper-left,
   rim strip 4×10 at 1.6, back fill 10×3 at 1.0) and a dark floor plane. Prefiltered with
   `pmrem.fromScene(envScene, 0.02)`. This is what gives the armour its broad, stretched,
   *directional* highlight instead of a flat sheen. **The single highest-value technique.**
2. **BokehPass depth of field**, live-updated per shot: `{focus, aperture, maxblur}` and
   *disabled entirely* when `aperture === 0`. Subject crisp, ground soft.
3. **UnrealBloomPass** at strength `0.25 * 0.6` resting, threshold 1.6, radius 0.4 —
   only genuinely bright things bleed.
4. **A custom grade pass**: vignette `c.rgb *= 1 - 0.28 * smoothstep(0.18, 0.62, len(q))`
   with `q.x *= 0.5625` (so the vignette is *elliptical in portrait*, not circular), plus
   time-varying film grain `±0.009`.
5. **Layered caption shadow**: `0 0 2px / 0 3px 10px / 0 0 22px` black + a 0.6px dark
   text-stroke. That triple shadow is why their captions stay readable over any background.

Rendering resolution is **720×1280**, not 1080×1920. Verified in `main.js` (`const W=720,H=1280`).
They upscale later if at all. That is a deliberate, honest trade and it explains how a
"cinematic" look ships at a sane cost.

## Technique: character system (no rig, no meshes)

`human.js`: the torso is the function `torsoR(y)` — a **smoothstep-interpolated radius
profile** through 11 keys from `[-0.16, 0.150]` to `[0.58, 0.055]`, passed to
`LatheGeometry`, then `scale(1.13, 1, 0.66)` to make it elliptical. Armour shells are the
same lathe at an offset, with a `ridge` displacement (a Gaussian bump
`exp(-(x/0.045)^2)` masked by height ramps) down the sternum. Rims are torus rings at the
shell edge. Head: spheres, one-dimensional scales, a jaw group, a visor slit box.

**Nothing here needs a mesh pipeline.** It needs a lathe/ring sweep and smoothstep
profiles — both of which a software rasteriser can do. This meaningfully revises my
"We can only do boxes" limitation: we can do *lathed volumes of revolution* cheaply,
which covers torso/armour/helmet/props — most of the reference look.

## Technique: textures are procedural canvas2d

`textures.js`: deterministic mulberry32-style RNG (`rng(seed)`), then draw to a canvas —
steel via 260 radial blotches + 1400 fine scratches + 500 pits into a *roughness* map, with
the colour map being the same image `screen`-blended toward grey; chainmail as interlinked
ellipse rings with a rotated alternate row and a separate bump map; wood as 90 sine-warped
vertical strokes; fabric as a 2px checker with jitter. A `glowTexture()` radial sprite
serves flashes, sparks and bloom seeds.

**Zero authored image assets.** All of it is portable to any canvas2d implementation,
including ours.

## Technique: the render contract

`render.mjs` is browser-agnostic and worth copying verbatim:
deterministic `window.renderAt(t)` → `page.screenshot({clip})` → PNG bytes piped into
`ffmpeg -c:v libx264 -crf 17` → MP4. Plus `GL=swiftshader` as an env-var fallback and a
tiny local static server with correct MIME types. Shots are (re)built lazily by index and
cached in a `Map`; `renderAt` picks the shot by `t >= start && t < end`, calls its
`update(lt, t)`, and **the shot returns per-frame lighting intent**
`{dof, bloom, exposure}` rather than the global renderer being tuned once.

That "lighting is a function of the shot, not a setting" idea is the structural insight,
and it transfers to us immediately.

## Techniques extracted for our engine

1. Build the specular env as a small set of emissive planes with explicit intensities, and
   prefilter it — never light metal with a single directional light. (Adopt in `render3d.mjs`.)
2. Render at 720×1280 and design up; do not pay 1080×1920 unless the delivery needs it.
3. Elliptical (aspect-compensated) vignette + per-frame grain as the last two ops,
   always.
4. Caption = triple-layer shadow + hairline stroke, ~3.6% of frame height, Montserrat-like
   heavy grotesque, small negative tracking.
5. Per-shot `{focus, aperture, maxblur, bloom, exposure}` intent object.
6. Lathed volumes of revolution from smoothstep radius profiles as the character primitive.
7. Procedural canvas2d texture generators, seeded, with matching bump/roughness variants.

## What we still lack after this reference

- Real 3D lighting for that specular look (no WebGL ⇒ we need our own screen-space
  approximation; see the round-2 experiment).
- A working TTS route (their `vo_kokoro.wav` proves Kokoro output is what they ship; we
  still cannot fetch the weights).
- Their `align.py` / `words.py` forced-alignment approach — needs a transcript + audio,
  both of which we can generate but not listen to.

## Ledger updates

- `claude-animation-skills` → remains `inspected`, evidence extended with the source path
  and the correction that the upload omitted the engine.
- `zach-df-engine` → new record, `inspected`, with the seven techniques above.
- `webgl-swiftshader` → stays `rejected`, now with the specific evidence that their own
  pipeline needs WebGL (and offers a SwiftShader fallback we have proven does not work here).
