# 04 · Camera, framing, transitions

Camera work is where most of the recorded defects live. Read the framing section before you
place a single character.

---

## 1. Portrait framing — the rule that costs the most time

**`PerspectiveCamera.fov` is VERTICAL.** At 720×1280 (aspect 0.5625) the horizontal field of view
is far narrower than the vertical one:

```
hFov = 2 * atan( tan(vFov/2) * aspect )
vFov 42° , aspect 0.5625  ->  hFov ≈ 24.4°
vFov 55° , aspect 0.5625  ->  hFov ≈ 32.6°
```

At camera distance `z`, the visible half-width at the subject plane is `z * tan(hFov/2)`
(values below computed, not estimated):

| vFov | hFov | z = 6 | z = 8 | z = 10 |
|---|---|---|---|---|
| 42° | 24.4° | ±1.30 | ±1.73 | ±2.16 |
| 47° | 27.5° | ±1.47 | ±1.96 | ±2.45 |
| 53° | 31.3° | ±1.68 | ±2.24 | ±2.80 |
| 58° | 34.6° | ±1.87 | ±2.49 | ±3.12 |

**Verified working recipes (from the delivered film):**

- **Two-shot:** actors at x ≈ ±2, camera z ≈ 9–10, fov 53–58.
- **Three-shot:** actors at x ≈ ±1.2, camera z ≈ 6–7, fov 43–47.
- **Single close-up:** actor at x ≈ 0, z ≈ 4–5, fov 38–45.

> **Never "fix" a cropped character by moving the camera closer.** That makes it worse. Either
> widen the fov, pull the camera back, or move the actors inward. This exact mistake produced
> three bad shots in Round 11 before the mid-shot check caught it.

**Do the arithmetic before rendering.** For each shot, list every actor's x and the camera's
z/fov, and check `|x_actor − x_cam| < z * tan(hFov/2) − margin`. A 0.3-unit margin keeps limbs
inside the frame. This five-second calculation replaces a 10-minute render pass.

**Legacy alternative:** `cinema.mjs`'s `fitFov()` binary-searches (22 iterations) for the smallest
fov that keeps a list of world points inside a margin-safe rect. It works, but it collapses scenes
into close-ups if used alone — Round 5 had to add an explicit *distance rule* alongside it. For
the three.js path, use the table above.

---

## 2. The cinematic camera

`K.catmullCam({aspect, keys})` → `{cam, at(t, opts)}`. Ported from the reference pack's `camAt`/`Cam`.

```js
const { cam, at } = K.catmullCam({ keys: [
  { t:0.0, pos:[0, 3.2, 11], look:[0, 1.4, 0], fov:52 },
  { t:2.0, pos:[1.2, 2.6, 9], look:[0, 1.5, 0], fov:48 },
  { t:3.7, pos:[2.0, 2.2, 8], look:[0.3, 1.6, 0], fov:44, roll:0.01 },
]});
at(localT, { handheld: 0.004, impacts: [[1.8, 0.05]], fovKick: [2.4] });
```

**Interpolation:** Catmull-Rom through `pos` and `look` (smooth C¹ motion, no polygonal corners),
smoothstep on `fov` and `roll`. The first and last segments use a modified ease
(`2u²−u³` in, `u+u²−u³` out) so the move accelerates *from* frame 0 rather than starting at zero
velocity — this is the freeze fix from Round 7, baked into the interpolator.

**Options:**
- `handheld` (default **0.004**) — always-on sinusoidal micro-drift on x/y/z at different
  frequencies. **Never set it to 0.** It is the guarantee that a "static" shot still has
  inter-frame difference.
- `impacts: [[t, amplitude], …]` — decaying shake `a·exp(−(t−ti)·9)` at high frequency, for hits.
- `fovKick: [t, …]` — a 5° fov punch that ramps in over 0.06 s then decays `exp(−Δt·5)`. Use on
  reveals and impacts; it reads as a lens "snap".

**Roll:** `cam.up = (sin(roll), cos(roll), 0)`. Small values (0.01–0.03) add unease; large values
look like a mistake.

### Camera language per beat

| Story beat | Move | Why |
|---|---|---|
| Establish a place | wide, slow push in | gives the viewer the geography |
| A choice / contrast | lateral track between two subjects | the movement *is* the comparison |
| Mockery / conflict | tighter, handheld, slightly low | discomfort |
| Work / process | orbit around the object | shows the action from a new side |
| Montage / repetition | rack across a shelf of results | time passing without a cut per item |
| Night / dread | low angle, slow rise | scale and threat |
| The reveal | slow arc + `fovKick` | the payoff gets the only lens punch |
| Resolution | pull back to wide | releases tension, restores the world |

**Anti-repetition rule:** no two neighbouring shots may share a camera idea. If you find yourself
writing "slow push in" three times, redesign two of them.

---

## 3. Composition

- **Subject placement:** keep the acting area in the middle ~60 % of the height. Captions occupy
  the bottom (see [05-audio.md](05-audio.md)); the top ~12 % is sky/headroom.
- **Headroom:** a billboard of height `h` at distance `z` occupies `h / (2·z·tan(vFov/2))` of the
  frame height. For `h=2.5, z=9, fov=55` that's ≈ 27 % — comfortable for a two-shot.
- **Foreground occluders** (a crate corner, a fence post, leaves) at the frame edge create depth
  cheaply. They also fix the "empty foreground" defect.
- **Never let the horizon sit exactly at the character's neck.** Raise or lower the camera y.
- **Look-at target ≈ 1.4–1.6** for a 2.5-unit-tall puppet (chest/face height), not 0.

---

## 4. Transitions — composited in-render, not in ffmpeg

**Why:** the bundled ffmpeg is a 4.1-era static build with **no `xfade` filter**. Available
alternatives (`fade`, `afade`, `acrossfade`, `blend`, `tblend`, `overlay`) cannot cross-dissolve
two clips on a timeline cleanly. So transitions are drawn on a 2D output canvas during rendering,
which also keeps narration timing exact — frame counts never shift.

`r11_render.cjs` keeps the previous shot's final frame on an offscreen canvas (`p.prev`) and
composites:

| Type | Implementation | Feel |
|---|---|---|
| `cut` | no composite | instant; use for energy/comedy |
| `dissolve` | draw `prev`, then current at `alpha = lt/dur` | soft time passage |
| `fadein` | draw current, overlay black at `1 − lt/dur` | open the film |
| `dip` | same as fadein mid-film | dip-to-black; a chapter break |
| `bloom` | overlay **white** at `1 − lt/dur` | flash into a reveal |

Plus a global outro: fade to black over the last 1.0 s of the film.

**Rules learned:**
- Transition durations 0.45–0.8 s. Shorter reads as a glitch; longer eats story time.
- **The first frames of every shot are inside its transition.** A `SMOKE=1` contact sheet is
  therefore mostly black/faded — this is expected. Judge composition with `MID=1` (60 % into
  each shot), never with the smoke sheet.
- Match the transition to the emotion: `bloom` into the reveal, `dip` before the night, `cut`
  into the mockery. A uniform dissolve everywhere is the template look the rules forbid.
- `blackdetect` will legitimately report the intentional fade-in/dip/outro. Record them as
  *intended* in the QA report; the gate is "no **unintended** black".

---

## 5. Timing: the narration is the clock

The film's total duration is derived from the narration, not chosen arbitrarily:

```
narration audio duration (after atempo + pad)  = 31.975 s
LEAD (silence before the first word)           =  1.2 s
film TOTAL                                     = 36.0 s   (rounded up, includes 1 s outro fade)
```

Shot `start`/`dur` values are laid against the **word timestamps**, so each shot begins on the
sentence it illustrates. Captions are shifted by `+LEAD` to match. If you change narration speed,
**re-derive every shot boundary** — do not scale them by eye.

`PotterFilm.shots` is the authoritative table; `TOTAL` and `LEAD` are exported alongside it so the
render driver and the audio assembler cannot disagree.
