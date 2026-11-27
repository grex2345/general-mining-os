# Round 13 visual audit — honest, measured

**Date:** 2026-11-26 · **Subject:** `research/artifacts/round13/film/the-bell-of-vellara.mp4`
(66.000 s, 720x1280@30, sha256 `deeeead0f397f2f6a559f31b32078250520bcbd0a5088cf092dae66d7b3ae249`)

This audit exists because the user asked a fair question: *did the visuals get the same
effort as the audio?* The answer is **no**, and this file records the evidence rather than
an opinion.

---

## 0. The one-paragraph answer

Round 13 built a **measurement harness for sound and never built one for picture**. The audio
side got prosody metrics, a 6/6 foley target check, loudness targets, and word-anchored sync
verified to +/-60 ms. The picture side got a contact sheet looked at by eye and two framing
patches. When the reference study's own visual QA gate is finally run on the delivered film,
it returns **4 PASS / 3 FAIL / 2 LOW**. The film is never static — that part is real — but it
is cinematically **too slow, too thinly dressed in motion, and too cut-heavy** versus the
reference bar.

## 1. Measured result (the gate we should have run in Round 13)

Tool: `research/references/ricksclips/tools/study/qa_motion.py` (vendored, MIT).
It was **not** vendored during Round 13 — only the study's prose was. That is the root cause.
Run on the delivered MP4, 1979 frame pairs, caption band masked:

| Metric | Ours | Target | Verdict |
|---|---|---|---|
| Anything moving % | **97.63** | >= 95 | PASS |
| Local (non-camera) moving % | **97.07** | >= 91 | PASS |
| Dead frames % | **2.37** | <= 4.5 | PASS |
| Longest dead stretch s | **0.33** | <= 0.7 | PASS |
| Avg moving area % | **24.07** | >= 30 | **FAIL** |
| Composition change every s | **5.07** | <= 2.2 | **FAIL** |
| Hard cuts | **4** | <= 2 | **FAIL** |
| Camera roll frames % | 17.53 | >= 25 (advisory) | LOW |
| Pull-back frames % | 8.99 | >= 14 (advisory) | LOW |

Reference median for composition change is **2.1 s**. Ours is **5.07 s** — 2.4x too slow.
This is the single largest visual gap in the film.

## 2. What was genuinely built (credit where due)

- **12 shots**, each with a spline camera path (`K.catmullCam`, 12 call sites).
- **5 transition types**: fadein 1, dissolve 4, cut 4, dip 1, bloom 2.
- **119 set-dressing calls**: 13 hut, 12 skyDome, 10 lantern, 9 crate, 8 tree,
  6 groundDetail, 6 cloud, 6 barrel, 4 mountain, 4 marketStall, 3 well, 3 cart,
  2 shelf, 2 fence, 1 sack, 1 bench, 1 banner.
- **Lighting rigs**: `K.dayLight` x4, `K.warmInterior` x8; fog x12; glow x6; dust x13.
- **20 gesture recipes** in `actor.js`, incl. 8 written for this film
  (climb, tapWall, listen, holdBreath, pullRope, awe, listened, hammer).
- **Locomotion**: distance-driven walk phase (no foot-sliding), speed-ramped amplitude,
  waypoint paths with smoothstep.
- **Idle life**: breath, weight-shift, glance, blink, nervous tremble, sweat, squash/stretch.
- **Faces are unlit** (`MeshBasicMaterial` billboard) — this correctly satisfies the
  reference rule that character heads never take the scene tint.
- Teeth rows on grin/laugh, eye dart with pupil highlight, 8 moods.

## 3. What is missing, by the user's four questions

### Q1 — camera, transitions, effects, lighting
Implemented: spline moves, dissolves, fog, glow, dust, two lighting rigs.
**Absent entirely from `film_bell.js`** (grep count = 0): orbit, dutch **roll**, camera
**shake**, foreground **wipe**, speed **whip**, **parallax** foreground layer,
**depth of field**, colour **grade**, haze, rain, birds, embers.
Shot lengths are 6.6 / 2.9 / 5.2 / 5.1 / 6.3 / 2.9 / 7.2 / 3.8 / 3.0 / **9.6** / 4.1 / **9.3** s.
Two shots hold a single composition for 9+ seconds. The reference never does this.

### Q2 — characters feeling alive
Strong: story actions (layer A), body idle (layer C), walk cycles, IK hands.
**Weak: the face (layer B).** `puppet2d.js` has **no mouth-flap / `talk` parameter at all**, so
quoted dialogue cannot be lip-synced — the reference flaps mouths on every quoted line.
8 moods versus 16 in the reference style bible. Expression changes are not driven by
per-word meaning on a 0.3-0.8 s cadence; they are set per gesture recipe.
**Reactors (layer D)** exist (mock, gasp, applaud) but are used sparsely.

### Q3 — environment richness
There is real dressing (119 calls), but measured against the set-quality bar
(`docs/08_SET_QUALITY_CELYXI_STUDY.md`, vendored now, was **missing** in Round 13):

| Set-quality rule | Ours |
|---|---|
| Real architecture, 6-10 parts per building | **NO** — `K.building` (trim/mullions/lit facade) used **0 times**; 13 simple `K.hut` instead |
| Ground never flat colour | PARTIAL — `groundDetail` x6 |
| Clutter on every wall/floor | PARTIAL — crates/barrels/lanterns, but many bare surfaces |
| Animals / living things in every set | **NO** — no birds, no livestock, no insects |
| Haze, DOF, dust in light beams | PARTIAL — fog + dust, **no DOF, no light shafts** |
| Light changes with the story | **NO** — static rig per set; no day->night->sunset arc |
| Deep layered backgrounds | YES — skyDome, mountains, clouds, trees |
| Hero prop macro treatment | PARTIAL — the bell, but no engraved/printed detail |
| Analogy becomes a character | **NO** |
| 3-6 in-world signs carrying a fact or joke | **NO** — 1 banner total |

### Q4 — was the channel actually studied?
**Not directly. No video was ever watched.** What happened instead: 11 files were vendored
from a third-party MIT repo containing *someone else's* frame-by-frame study of 19 videos.
Round 13 consumed that study's **audio** conclusions and ignored its **visual** conclusions.
See `research/references/ricksclips/PROVENANCE.md` for the full accounting.

## 4. Which reference techniques were actually applied

| Reference rule | Applied? | Evidence |
|---|---|---|
| Music bed ~20 dB under voice | YES | 21.51 dB measured |
| SFX ~7.7 hits / 10 s | YES | 8.03 / 10 s |
| SFX ~12 dB under voice peak | YES | 11.66 dB |
| Master -14 LUFS / -2 dBTP | YES | -14.56 / -2.23 |
| Narration 3.67 words/s | CLOSE | 3.43 |
| Captions 1-2 words, word-synced | YES | `captions.ass`, 123/123 words aligned |
| Faces stay unlit white | YES | `MeshBasicMaterial` billboard |
| Dissolve as the default place-change | YES | 4 dissolves |
| Camera never parks | YES | 97.63% frames moving |
| No long still moment | YES | 0.33 s longest |
| New composition <= 2.2 s | **NO** | 5.07 s |
| Hard cuts <= 2 | **NO** | 4 |
| Moving area >= 30% | **NO** | 24.07% |
| Roll drifting >= 25% of frames | **NO** | 17.53% |
| Pull-back reveals >= 14% | **NO** | 8.99% |
| 4+ motion layers per shot | **NOT VERIFIED** | no per-shot layer audit existed |
| In-world signage 3-6 | **NO** | 1 |
| Set detail bar (doc 08) | **NO** | doc was not vendored |

The pattern is unambiguous: **every audio rule was applied and measured; most visual rules
were neither applied nor measured.**

## 5. Root cause

1. The vendored subset was chosen for audio. `docs/08_SET_QUALITY_CELYXI_STUDY.md` and
   `tools/study/*.py` were left out, so there was no visual gate to fail.
2. Round 13's acceptance criteria were audio metrics. Picture QA was "look at a contact
   sheet", which catches framing bugs (it caught two) but cannot see pacing or motion area.
3. No CI. Nothing re-checked the film after the framing patches and the shot-4 splice.

## 6. Remediation plan (measured targets, not vibes)

Tracked as GitHub issues. Order is by measured gap size.

1. **Pacing** — split the 9.6 s and 9.3 s shots; target composition change <= 2.2 s.
   Convert the 4 hard cuts into moving dissolves / foreground wipes; target <= 2.
2. **Camera grammar** — add drifting roll (+/-1-3 deg), orbit, pull-back reveals,
   handheld micro-jitter, impact shake. Targets: roll >= 25%, pull-backs >= 14%.
3. **Motion area** — add always-on background life and a foreground parallax layer per
   shot; target moving area >= 30%.
4. **Faces** — add a `talk` mouth-flap parameter driven by word timings; expand moods;
   drive expression changes from beat meaning.
5. **Sets** — use `K.building` instead of bare huts; add in-world signage (3-6),
   animals, light arc across the story, DOF on dialogue.
6. **Gate in CI** — `.github/workflows/visual-qa.yml` runs `qa_motion.py` on every
   film change so this regression cannot recur silently.

**Rule adopted:** no film ships on an eyeball check again. The visual gate must pass, or the
failure is stated explicitly in the delivery message.
