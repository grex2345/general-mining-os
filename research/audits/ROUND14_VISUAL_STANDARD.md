# Round 14 visual standard — what "good" means, and how it is enforced

Status: active. Applies to `studio/src/film_bell2.js` and every film built on Cinema2.
Supersedes nothing: the Round 13 motion gate still runs. This document adds the checks it
cannot make.

---

## 1. Why a second standard was necessary

Round 13 scored **97.63%** on "anything moving" against a 95% target, and **97.07%** on
local motion against 91%. By the motion gate it was nearly excellent.

It was not. Direct inspection of the rendered frames found:

- the bell had been **built upside down** since Round 13 — wide base at the top;
- **ten** macro compositions were positioned *inside* their own subjects, so they
  rendered as flat colour fill;
- seven "wide" shots of a 19 m tower were taken from 4–11 m away;
- the bronze pour was blown out to white;
- the story's central explanation — the air voids inside the stone that swallow the
  note — was **sealed inside a closed box** and never visible at any point in the film.

Every one of these passed the motion gate, because a camera inside a wall still moves.

**Movement is not the goal. Readable, motivated composition is.** The motion gate is
necessary and blind. It is kept, and complemented.

---

## 2. The four machine checks

Implemented in `research/tools/cinema_gate.py`, run against the
`composition-report.json` emitted by `studio/experiments/r14_render.cjs`.

### 2.1 Intent
Every composition carries a `why` — the story reason it exists. A composition without one
fails. This is the explicit guard against adding motion to satisfy a number: if a move
cannot be described in terms of the narration, it does not belong in the film.

### 2.2 Framing
The subject a shot is *about* must occupy a sane share of frame height.

```
coverage = focus / (2 · distance · tan(fov / 2))
```

`focus` is the real height in metres of the intended subject, declared per composition.
Bands, by scale:

| scale  | coverage band |
|--------|---------------|
| macro  | 0.35 – 1.05   |
| close  | 0.30 – 0.95   |
| medium | 0.35 – 1.10   |
| wide   | 0.45 – 1.30   |

Below band → `TOO SMALL`. Above → `OVERFLOWS`. Both fail.

Two lessons are baked into this:

- **A default focus is a guess.** The first version of this check fell back to generic
  heights (1.3 m close, 12 m wide) and produced eleven false failures, because *no move
  builder accepted or forwarded the `focus` option*. Five of the six remaining failures
  after that were the same plumbing bug. The standard now reports whether focus was
  explicit, and reports the actual fov.
- **A pull or a crane deliberately traverses scales.** A single midpoint number cannot
  describe it, so `framing()` also returns coverage at both endpoints (`sweep`).

### 2.3 Rhythm
No composition holds longer than **2.2 s**; no two consecutive medium shots. The 2.2 s bar
is inherited from the vendored Celyxi/Ricks study (see
`research/references/ricksclips/PROVENANCE.md`). Note the stricter of the two available
references is used deliberately: the MikelFR17 study describes a new *setup* every
3.5–5 s, which is a different unit from a *composition change*.

### 2.4 Grammar
Each scene with two or more compositions must use at least two scales; the film as a whole
must use all four. One angle with shake added is not a scene.

---

## 3. The check that cannot be automated

**A human must view the finished film.** `cinema_gate.py` fails without a sign-off file,
and it fails an agent inspection too: `role` must be `human` and `human_verdict` must be
`pass` or `fixed`. An agent looking at renders is useful and is recorded — it found all
sixteen defects in `round14-inspection.json` — but it is not a substitute for the user's
eyes, and the tool says so rather than quietly accepting it.

### 3.1 How the agent inspection is done

`SMOKE=1` is **useless for judging framing**: it samples t=0 and t=1/30, which land inside
every fade, dissolve and wipe, so the contact sheet is black, white and blends.

Use:

- `COMPS=1` — one frame at each composition midpoint, transitions suppressed
  (`window.__rawMode`). This is the framing pass.
- `PROBES=0.1,0.2,…` with `ONLY=<scene>` — a time series through one scene, used to find
  defects that a midpoint misses (the cutaway cameras inside the wall were found this
  way, by probing scene 9 at thirteen times across its 9.6 s).

Contact sheets at 270×480 in a 5×4 tile are enough to spot voids, flat fills, cropped
faces and inverted props. Anything suspicious is then probed as a time series before it is
called a defect.

### 3.2 Defect classes worth checking every time

These are the ones that actually occurred, in rough order of how invisible they are to
metrics:

1. **Camera inside geometry** → flat single-colour frame. Check the camera position
   against the set's wall planes, not just the target.
2. **Closed volume presented as a cutaway** → the interesting interior is sealed. A
   section must have its camera-facing side removed.
3. **Missing backdrop** → black void above, below or behind an interior set. Every
   interior needs sky, ground and a ceiling, because the camera will find them.
4. **Aiming at the wrong point on the subject** → the seam macro aimed 0.7 m from the
   seam actually painted on the wall.
5. **Wrong subject scale assumed** → faces low in frame because the puppet's head centre
   is at ~62% of billboard height, not the assumed 1.6 m.
6. **Composition contradicts the narration** → "they heard it in three villages" showing
   no villages; a stern beat played as a grin.
7. **Prop intersecting an actor** → the hammer at head height during the listening beat.

---

## 4. Order of work

The gate is a floor, not a target. The sequence that produced Round 14:

1. Implement.
2. Render **actual frames** (`COMPS=1`).
3. **Look at every composition.**
4. Fix what the eyes found; use the framing numbers to explain, not to decide.
5. Repeat until a full pass is clean.
6. Full render → motion gate ratchet → mux the unchanged audio → human inspection.

Never loosen a band to make a number pass. In this round every one of the sixteen fixes
changed the film, not the threshold.

---

## 5. Current state

39 compositions, 12 scenes, 66.000 s.

| check | result |
|---|---|
| intent (`why` present) | 39 / 39 |
| framing within band | 39 / 39 |
| longest composition | 2.10 s |
| average composition | 1.69 s |
| scales used | macro 9, close 13, medium 7, wide 10 |
| plan problems | 0 |
| page / console errors | 0 |
| agent inspection | 39 / 39 viewed, 16 defects found and fixed |
| **human verdict** | **pending** |
