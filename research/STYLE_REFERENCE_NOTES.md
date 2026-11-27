# Style references — what the two contact sheets actually show

Source: `research/uploads-2026-11-25/skills.jpg` (6 skills) and `five-styles.jpg` (5 styles).
Both images were **viewed directly** at full resolution. The README documents 11 skills total:
`zach-d-films`, `zach-3d-films` (same engine, new name), `stick-figure`, `minimalistic-graphics`,
`map-route`, `breakdown`, `graph`, `low-poly`, `minecraft`, `kurzgesagt`, `dan-koe`.

Only **one still per skill** is available — no motion, no source, so everything below is
composition/lighting/typography read off a single frame. Do not over-claim.

## The 3D-cartoon target (`/zach-d-films`, `/zach-3d-films`)

This is the quality bar. Read off the frame:

- **Character construction**: enlarged head on a short thick neck, torso in a single
  metallic shell (armour/robot). Face is *not* a detailed sculpt — a brow ridge, a
  protruding simple nose, a dark open mouth, small dark eyes under heavy brows.
  Everything reads at thumbnail size. This is achievable with primitives + a few
  extruded parts; it does not need a rigged human mesh.
- **Material**: the armour shows a broad, soft, **stretched highlight** along its upper
  curve — classic anisotropic-looking specular on a curved metal surface, not a
  mirror. That single highlight does most of the "expensive" work.
- **Lighting**: warm key from upper-left, cool sky fill, clear gradient sky background,
  and **depth of field** — subject crisp, background soft. Strong figure/ground separation.
- **Caption**: white, bold, all-lowercase, bottom-centre, tight soft drop shadow, sized
  to ~6% of frame height. No box, no outline.
- **VFX**: red **arrow** with a motion-trail smear and a small impact spark at the tip.
  The `/five-styles` version shows the same family: a **concentric red ripple** (ellipse
  rings radiating from an impact point) and the word "strikes" mid-frame — i.e. impact
  is communicated by rings + a single verb, not by debris simulation.
- **Staging**: single subject, single prop, single action verb. Negative space above.

**Implication for us:** the gap between our current flat 2D scenes and this look is
*not* mesh fidelity. It is (a) a curved-surface specular highlight, (b) a depth-of-field
falloff, (c) a contact-shadow/grounding, (d) exaggerated proportion. Items (c) and (d)
we can already do; (a) is a shading-model addition to `render3d.mjs`; (b) is a blur pass
on the background layer only, which Skia can do cheaply.

## The 2D / graphic styles

| Style | Read off the frame | Cheap to build? |
|---|---|---|
| `/stick-figure` | Thick black outlines, big white round faces with dot eyes, saturated primaries, painted plank floor in perspective, white caption with black outline bottom-left | Yes — pure 2D canvas, the perspective floor is the only 3D part |
| `/minimalistic-graphics` | Pure black, white hairline strokes, no fill, huge negative space, one tiny caption top-centre. Rising steps + orbit | Yes — trivially |
| `/dan-koe` | Same family: black, one hairline white tree, glowing tips, one small caption. Highest negative-space ratio of all 11 | Yes — trivially |
| `/map-route` | Light 3D extruded city blocks with soft AO, blue route polyline with round caps, red pin, white rounded info chips with shadow, tiny grey labels | Medium — needs extruded blocks + projected routing |
| `/breakdown` | Near-black, phone layers floating in exploded view, thin grey leader lines, small mono labels, gradient reflected on the top face | Medium — layering + leader-line layout |
| `/graph` | White, thin black line, giant number top-left, tiny axis labels | Already have (our mining videos) |
| `/low-poly` | PS1 look: chunky pixelation, dithering, wobbly vertices, sodium-warm palette, small **yellow** caption | Medium — a post-process quantise+dither+vertex-jitter pass |
| `/minecraft` | Hard voxel grid, procedural 16×16 textures, flat per-face shading, big white slab text | Medium — voxel builder + texture generator |
| `/kurzgesagt` | Flat vector, dark-crescent planet shading, glowing rim, star field, **rounded label chips with fill + thin border** | Yes — pure 2D vector |

## What to steal, ranked by payoff for *our* channel

1. **The label-chip grammar** (`/map-route`, `/kurzgesagt`): rounded rect, coloured fill,
   thin border, small caps. We currently have none. It makes a chart look designed.
2. **Impact rings + a single verb** (`/zach-3d-films`): a 3-line effect that reads
   instantly and is ~20 lines of code.
3. **Hairline-on-black economy** (`/dan-koe`, `/minimalistic-graphics`): our mining
   channel is the direct opposite (dense, teal-on-navy). A two-tone variant of the
   existing renderer would produce a second, higher-end series almost for free.
4. **Yellow caption on dark** (`/low-poly`): our captions are white-on-box. Yellow
   sans-serif with no box is more readable at speed and looks less like a template.
5. **Depth of field** (`/zach-d-films`): the single highest-value lighting change
   available to a 2.5D compositor.

Deliberately **not** copying: PS1 dithering (reads as "broken" to a general audience)
and the Minecraft texture art (production-heavy, off-brand for mining finance).
