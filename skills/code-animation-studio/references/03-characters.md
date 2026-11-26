# 03 · Characters, environments, props & animation

The production rule: **every scene must visually represent what the narration says.** A character
standing in front of a background is a failed scene, no matter how pretty the background is.
Each beat needs an *event*: an interaction, a change of place, a reaction, a visual metaphor.

---

## 1. The acting puppet — full pose semantics

`drawPuppet(ctx, W, H, look, pose)` in `studio/src/puppet2d.js`. Verified fields:

### `pose`

| Field | Type / range | Effect |
|---|---|---|
| **`t`** | number (**required**) | animation clock in **frame units**. Drives blink, breath, tremble. Missing → non-finite gradient crash. |
| `mood` | `grin` `smile` `shock` `deadpan` `worry` `angry` `laugh` `gulp` | eyes + brows + mouth. `grin`/`laugh` = closed happy arcs + toothed mouth (`laugh` taller). `shock` = huge pupils, raised flat brows, oval mouth. `deadpan` = level brows. `worry`/`gulp` = slanted brows + wobbly frown. `angry` = V brows. |
| `arms` | `down` `up` `head` `chest` `hold` `box` `shrug` `point` | IK target preset for both arms. `point` extends only the **right** arm. |
| `armK` | 0–1 | global IK blend (0 = rest, 1 = full preset). |
| `armR`, `armL` | `[x,y]` normalised | explicit IK hand targets, override the preset. y grows upward in puppet space. |
| `armRK`, `armLK` | 0–1 | per-arm blend for the explicit targets. |
| `walk` | radians | leg-cycle **phase**. Feed accumulated distance, not time (see §3). |
| `speed` | 0–1 | walk amplitude / lean. 0 = standing. |
| `nerv` | 0–1 | tremble amplitude; >0.2 also adds red cheek flush. |
| `sweat` | 0–1 | sweat droplets. |
| `squash` | ±0.05 | squash & stretch. Positive = bounce compression. |
| `tilt` | radians | body lean. |
| `hunch` | 0–1 | shoulders forward / head down (working, shame, effort). |
| `air` | 0–1 | vertical lift (jump / bounce). |
| `lookX` | −1..1 | pupil dart direction (glance left/right). |
| `flip` | bool | mirror the whole puppet (face the other way). |

### `look` (identity — keep it constant for a character across the whole film)

`skin`, `body` (limb colour), `outfit` (`shirt` etc.), `shirt`, `tie`, `hair`
(`short` `swept` `bob` `grey` `none`), `hairColor`, `glasses`, `badge`, `hat`, `shoe`.

**Continuity rule:** define each character's `look` once at the top of the film module and reuse
the same object in every shot. Re-declaring it per shot is how characters silently change clothes.

```js
const LOOK = {
  sami:    { skin:'#f0c9a0', body:'#2b3a55', outfit:'shirt', shirt:'#7a9e6f', hair:'short', hairColor:'#2a1c12' },
  merchant:{ skin:'#e8bd93', body:'#3a2b45', outfit:'shirt', shirt:'#c9a227', hair:'grey',  glasses:true },
};
```

### What the puppet does NOT have

No sitting pose, no leg-mode presets beyond the walk cycle, no phoneme lip-sync. If a beat needs
sitting, stage it as a low crouch (`hunch` + `squash`) or place the character behind a prop that
hides the legs. **Do not claim a feature exists because the reference kit has it** — the port
covers the fields listed above and no more.

---

## 2. The gesture library (`ActorKit.G`)

Twelve recipes, each a function of local beat time returning a pose fragment. Verified:

| Recipe | Reads as | Use on narration like |
|---|---|---|
| `workWheel(t)` | leaning in, hands shaping, focused bob | "he worked", "every day he tried" |
| `shapeClay(t)` | hands rising, proud grin | "the clay rose", "it grew" |
| `throwPot(t)` | wind-up → fling | "he threw it away", "another failure" |
| `fireKiln(t)` | reaching into heat, worry + sweat | "he fed the fire" |
| `reveal(t)` | arms open wide, proud | "and then…", the payoff |
| `celebrate(t)` | bounce + laugh + air | "everyone cheered" |
| `mock(t)` | point and laugh | "they laughed at him" |
| `greedy(t)` | clutching to chest | "he wanted gold" |
| `resolve(t)` | deadpan → grin over 2 s | "but he decided" |
| `carry(t)` | careful two-hand carry | "he carried it to…" |
| `gasp(t)` | shock, hands to head | "the village gasped" |
| `applaud(t)` | rhythmic clapping | "they applauded" |

**Composition pattern** — merge a recipe over idle, then over locomotion:

```js
const mv = A.path(lt, [{t:0,x:-3,z:1},{t:1.6,x:0,z:0}]);
sami.setPos(mv.x, mv.z);
const base = mv.moving ? { mood:'deadpan', arms:'down', walk:mv.walk, speed:mv.speed, flip:mv.flip }
                       : A.idle(lt);
sami.update(cam, frame, Object.assign(base, A.G.workWheel(lt)));
```

**Writing a new recipe:** keep it a pure function of `t`, return only pose fields, and make the
motion *periodic or eased* — never a constant pose, or the freeze detector will flag the shot.
Follow `CREATIVE-FREEDOM.md`: three candidate ideas per beat, pick the least obvious.

---

## 3. Locomotion without foot-sliding

`A.path(t, keys, {stride=0.95})` returns `{x, z, walk, speed, moving, flip}`.

The important detail: **`walk` phase is computed from accumulated distance travelled, not from
time.** `walk = distance / stride * 2π`. This is what stops the classic "ice-skating" defect where
legs cycle at a fixed rate while the body moves at a variable speed.

`speed` is derived from instantaneous segment velocity (`segLen / Δt`, normalised by 1.6), so a
character that slows down also shortens its stride. `moving` is `speed > 0.06`; below that, switch
to `A.idle(t)` so the character breathes instead of marching in place.

**Idle is mandatory.** A standing character with a constant pose is a freeze. `A.idle` supplies
weight-shift (`sin(t*0.9)*0.02` tilt), breath (`sin(t*1.1)*0.008` squash) and glance
(`sin(t*0.35)*0.35` lookX). Always use it as the base when not moving.

---

## 4. Environments — density is a requirement, not decoration

The recorded failure: early Round-11 shots had **empty foregrounds** — a character, a wall, and
nothing else. Fixed by adding `groundDetail` and foreground props. The checklist:

- **Ground is never a bare plane.** Use `W.surface({kind:'grass'|'tile'|'plank'…})` *plus*
  `K.groundDetail({area, n, seed})` for scattered stones, tufts, flowers, shards.
- **Three depth layers minimum:** foreground prop (crate, bench, fence, plant) → subject →
  background silhouette (buildings, mountains, trees, sky).
- **Populate the world:** stalls, barrels, sacks, lanterns, banners, carts, wells, shelves.
  A village square with 3 props reads as a stage set; with 15 it reads as a place.
- **Atmosphere:** `K.skyDome` + matching `THREE.Fog` + `K.dustMotes` (day) or `K.stars` (night).
  These also *guarantee* inter-frame motion in otherwise static shots.
- **Light tells time of day:** `K.dayLight` / `K.nightLight` (returns `{moon, warm}`) /
  `K.warmInterior`. Night scenes need a warm practical (lantern, kiln mouth) or they go flat.

### The reveal-object pattern

The film's payoff is a single hero object. `K.masterpiece({p,s})` builds a LatheGeometry vase with
a procedurally drawn zellige canvas texture and handles, lit by `K.warmInterior` plus a glow
sprite. **Glow opacity must stay ≤ 0.32** and the warm key ≤ 1.4 — above that, additive blending
blows the toon material out to flat white and the texture disappears. This was a real defect,
found by viewing the mid-shot frame.

### Props that move

Static props are fine, but at least one prop per shot should react:
`wheel.setSpin(angle)` / `wheel.setClay(height)`, `kiln.setFire(t, intensity)`,
`stars.update(t)`, `dustMotes.update(t)`, lantern flicker, banner sway. These are cheap and they
satisfy the motion gate without animating the camera harder.

---

## 5. Per-scene identity (the anti-template rule)

From `references/stick3d/rules/CREATIVE-FREEDOM.md`, adopted after the reference study:

- Generate **3 ideas per scene**, choose the least obvious.
- **Neighbouring scenes must differ** in location, camera language and action type.
- **Reuse helpers, never layouts.** Calling `K.marketStall` twice is fine; composing the same
  arrangement twice is not.

The worked film's nine shots each use a different location and camera idea:

| Shot | Location | Camera language | Transition in |
|---|---|---|---|
| square | village square, wide | slow push, wide establishing | fadein 0.8 s |
| choice | two-shot, gold vs clay | lateral track | dissolve 0.45 s |
| mockery | three-shot crowd | handheld, tighter | cut |
| wheel | workshop interior | orbit around the wheel | dissolve 0.45 s |
| montage | shelf of attempts | rack across shelf | cut |
| kiln | night exterior | low angle, slow rise | dip 0.7 s |
| doors | doors opening, crowd | push through | bloom 0.5 s |
| reveal | hero object | slow arc + fov kick | dissolve 0.5 s |
| celebration | night square, confetti | pull back to wide | dissolve 0.5 s |

---

## 6. Animation quality rules learned the hard way

1. **Nothing may be perfectly still.** Camera micro-handheld + idle + atmosphere = the floor.
   Round 7 lost three render passes to freezes at wide-shot opens before this was internalised.
2. **Ease, but never start at zero velocity.** Pure ease-in-out has zero initial velocity → the
   first frames are identical → freeze. Blend a linear creep: `0.28k + 0.72*ease(k)`.
3. **Squash & stretch sells weight.** `squash` on impacts and bounces; `air` on jumps.
4. **Anticipation → action → follow-through.** `throwPot` winds up for 0.4 of its duration before
   the fling. A gesture with no anticipation reads as a teleport.
5. **Reaction shots are content.** `gasp`, `mock`, `applaud` on the crowd are what make a scene
   feel populated rather than staged.
6. **Motion must mean something.** Random jitter is not animation; every movement should be
   readable as an intention (reach, look, flinch, celebrate).
