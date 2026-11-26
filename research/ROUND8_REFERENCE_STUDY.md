# Round 8 — Reference Video Study, Technology Research & Engine Improvement Roadmap

**Mission:** deeply study three reference videos the user uploaded to Google Drive, research the
real technologies behind similar animation, learn from actual implementations, and turn that into a
concrete improvement plan for our **existing** engine (no separate toy project).

**Honesty / access statement.** All three videos were located via the Google Drive connector and
downloaded into the workspace (`google_drive/…`), byte-verified against Drive's reported sizes, and
analyzed with ffmpeg/ffprobe. Visual claims below come from **extracted frames I actually viewed**
(overview sheets at 1 fps across each *entire* clip, dense 20 fps motion strips, and full-resolution
key frames). Audio claims come from **measurements** (loudness, silence detection, spectrograms) —
I did **not** *hear* the audio. Nothing here is inferred from titles/descriptions alone.

---

## PHASE 1 — Deep study of all three videos

### Measured facts (ffprobe / ffmpeg)

| | V1 | V2 | V3 |
|---|---|---|---|
| File | WhatsApp 2026-11-25 21.10.47 | WhatsApp 2026-11-26 14.09.15 | WhatsApp 2026-11-26 13.27.21 |
| Duration | 61.11 s | 58.36 s | 56.75 s |
| Resolution | 384×832 (9:19.5) | 384×832 | 384×832 |
| Frame rate | 300 container (≈30 effective, VFR) | **60 fps** | **60 fps** |
| Bitrate | 824 kb/s | 970 kb/s | ~830 kb/s |
| Loudness (integrated) | −14.64 LUFS | −14.27 LUFS | −14.11 LUFS |
| True peak | **+0.08 dBTP (clips)** | −1.98 dBTP | −1.83 dBTP |
| Loudness range (LRA) | 4.30 (dynamic) | **1.30 (tight)** | **1.30 (tight)** |
| Hard cuts (scene>0.3) | **0** | 4 (intro only) | 2 (intro only) |
| Soft transitions (scene>0.08) | — | **24 (~every 2.4 s)** | **14 (~every 4 s)** |
| Freeze spans ≥0.2 s | 6 (dramatic holds) | **0** | 17 (held infographic beats) |
| Narration gaps ≥0.3 s | 2 | 2 | **0 (continuous)** |
| Genre | 3D dramatic narrative | 2D anime-science explainer | 2D anime-science explainer |
| Creator / audio | TikTok 3D story | **@Silenthys**, JJK OST "Delirious" | **@silenthysanime**, "Original audio", 117K likes |

### V1 — dark 3D dramatic narrative
A single continuous moonlit **bedroom scene** with a stylized 3D human figure doing small acting
motions (head/arm shifts), a near-static camera that drifts almost imperceptibly, and moody
blue-grey lighting. **Zero hard cuts** — the whole minute is one location. Story is carried by
**word-synced karaoke captions** (white text, **red keyword emphasis**: "MOMMY", "HURT", "NEXT",
"FAULT") and a continuous, dynamic voiceover (LRA 4.3, dramatic pauses). It is a phone
screen-recording (TikTok UI visible; the final frames catch the phone's control centre).
**Engagement devices:** intimate single-set drama, slow push-in tension, red keyword pops, vocal
dynamics. **Smoothness:** character micro-motion + slow camera; holds are intentional dramatic beats.

### V2 — Gojo "Six Eyes / energy efficiency" explainer (@Silenthys)
Flat **2D vector Gojo bust** (white spiky hair, blue eyes, blindfold) on a **persistent deep-blue
radial-burst background with drifting gold particles**. The character mostly holds (blink/expression)
while a **foreground motion-graphics layer** changes every ~2.4 s: energy **bar meters**, a
**glassmorphic dark card** holding color-coded math (gold `100`, red `0.001`, label "COST"),
**animated counters** that tick up (19→41→59→…→100) inside a **rotating gold pulse ring**, fraction
values that morph, a progress **dot-strip**, and **graphs whose curves draw on**. Big bold kinetic
numbers (`∞`, `96,300`), color-coded semantics (blue=MOVES, gold=ENERGY, red=COST). Word-karaoke
captions ("Costs one **thousandth?**"). Music is a real anime OST under a tightly-compressed voiceover
(LRA 1.3). **Zero freezes** because the ray/particle background never stops moving.

### V3 — Tanjiro "Total Concentration Breathing" explainer (@silenthysanime)
Same series/format as V2. Flat **vector Tanjiro** (checkered haori) on a near-black gradient. Visual
metaphors animate: he blows a blue stream into an **orange gourd that inflates and cracks** (lung
training), **stick-figure athletes** (gray vs gold cyclist = "≈5% FASTER", tennis serve "+4 MPH",
lifter "pressure tank"), **bar comparisons**, and big gold result numbers. Dense motion strip shows
the base character holding with micro-idle while a **red demon scales/fades in synced to the word
"demons"** and captions advance word-by-word with gold/red keyword highlights. 17 short holds =
infographic beats held while narration continues; captions keep advancing so it never feels frozen.

### Three-way comparison — what makes them professional
| Dimension | V1 (3D drama) | V2 / V3 (2D explainer) |
|---|---|---|
| "Constant change" source | character acting + slow camera + caption pops | **foreground graphic swaps** over a persistent animated background |
| Cuts | none (one set) | **no hard cuts** — smooth eased entrances/exits at semantic beats |
| Character animation | small 3D acting | **limited** (bust + blink/idle); the *graphics* carry the motion |
| Captions | word-karaoke, red keywords | word-karaoke, gold current word + red/gold keywords |
| Pacing driver | vocal dynamics + pauses | **continuous narration**, a new visual idea every 2–4 s |
| Smoothness | 30 fps + intentional holds | **60 fps** + eased transforms + perpetual background |
| Audio | dynamic voice, music drone | tight voice (LRA 1.3) over music bed, all ~−14 LUFS |
| Info design | none | **color-coded labels, big numbers, visual metaphors, charts** |

**The core lesson:** these videos are *not* frame-by-frame character animation. They are
**narration-driven motion graphics**: a persistent themed background + a foreground layer of
eased, color-coded infographic "beats" + word-karaoke captions, with limited character animation.
This is exactly the genre our Round 7 Tanjiro placeholder targeted — and it shows precisely where
our engine must improve.

---

## PHASE 2 — Technologies behind this genre (GitHub + docs, actually inspected)

The genre is produced by **code-rendered video** (an agent writes code that draws every frame, then
renders to MP4 — not AI pixel generation) [3](https://www.reddit.com/r/ClaudeCode/comments/1xd8zsr/claude_can_make_animations_without_ai_video/).

**Programmatic video engines**
- `remotion-dev/remotion` (★75.9k, TS) — React video; `interpolate(frame,[in],[out],{easing,clamp})`
  + `spring()` are the core keyframe primitives (docs read). Frame-by-frame ⇒ timing never drifts.
- `0xS4N4TG/kinetograph` (★547) — "programmatic video engine, made for agents".
- `codedbytahir/motionforge` (★120) — open-source Remotion alternative.
- Motion Canvas / Revideo — TypeScript programmatic motion graphics (scene graph + generator timeline).

**Math / infographic animation (V2's equations, graphs, counters)**
- **Manim** (3b1b) — `malhotra5/Manim-Tutorial` (★832), `HyperCluster-Tech/manimator` (★75,
  papers→visual explanations). Rate functions: `smooth`, `rush_into/from`, `there_and_back` (pulse),
  `ease_out_back` (read `skills/shared/easing-reference.md`).
- `johnhenry/ecmanim` (★10, **Node** port of Manim, MP4 out) and `careyear/Manim.three.js` (★28) —
  math animation in JS, closest to our Node stack.

**Agent skills (reusable methodology + recipe cards)**
- `iart-ai/motion-skills` (★2.2k) — 56 skills: kinetic typography, data-viz, explainers, TikTok/Reels,
  WebGL, Manim [1](https://github.com/topics/explainer-video).
- `Vincentwei1021/video-talkcraft` — **SKILL.md read in full**: word-level voiceover sync, **108 motion
  recipe cards**, a **seven-layer "anti-PPT" camera system** (extremely slow push/pull, motion-by-
  subtraction), six motion-continuity transitions, a long-take "world canvas", anime.js+three.js
  bridge, and **automatic freeze detection + a subagent review loop**.
- `Vincentwei1021/anything2explainer` — black-canvas motion-graphics explainer, TTS + subtitles +
  chapter progress bar, every frame drawn in code with Remotion (literally the V2/V3 format)
  [1](https://github.com/topics/explainer-video).
- `vincentsch/explainroo` — local voice (Kokoro) + Whisper word timing + canvas renderer → MP4
  (same shape as our pipeline) [1](https://github.com/topics/explainer-video).
- `rohitg00/manim-video-generator` — its motion-graphics skill template is the exact V2/V3 beat:
  word `scale(0)→1` with `ease_out_back`, hold, exit `shift+fade` with `ease_in_cubic`, then
  `Indicate` pulse [2](https://github.com/rohitg00/manim-video-generator/blob/main/skills/motion-graphics/SKILL.md).
- `kaomei/stickman-video-director` (★8.4k), `tuzhechen2005/opus-video-skills` (★577),
  `Anil-matcha/vox-ai-motion-graphics-generator` (★377), `fahniazz/claude-shorts-skills` (★288).

**Word-level captions (the karaoke sync)**
- Standard pipeline: **Whisper word timestamps → ASS karaoke (`\k`) → ffmpeg burn-in**
  [1](https://free.ai/video/caption/); or draw per-word in code. `kzkhykw/AlwaysWhisper` (★46),
  `stable-ts`, `whisper-timestamped`. video-talkcraft uses FireRedASR2-CTC / faster-whisper with a
  `{sentences:[{words:[{text,start,end}]}]}` schema — **the same shape our `align.py` already emits**.

**2D vector character + 3D drama**
- `rive-app/rive-react` (★1.2k) — state-machine vector animation (blink/expression states for the
  Gojo/Tanjiro busts); Lottie for JSON vector anim.
- `Moh4696/open-3d-skills` (★514) — three.js scenes from code (the V1-style 3D drama path).

---

## PHASE 3 — Comparison with our engine & reuse decisions

Our engine (Node + `@napi-rs/canvas` software 2D, `raster3d` software 3D, Piper TTS, `align.py`
word timing, procedural `score.mjs`, ffmpeg encode + QA gates) already has the right foundations:
`ease.outBack/outCubic/inOutCubic/outElastic`, `cameraMove(easeFn)`, `smoothNoise` handheld drift,
and word timestamps. The gaps are about **patterns**, not architecture.

| Technique (from refs) | Our current state | Source to learn from | Decision |
|---|---|---|---|
| Word-karaoke captions | **phrase-level SRT cues** (`render.mjs drawCaptions`) | free.ai ASS karaoke; video-talkcraft | **Integrate** — render per-word from existing `align.py` words |
| Animated counters / pulse ring | absent | Manim `Indicate`; V2 counters | **Integrate** (built: `kinetic.animatedCounter`) |
| Perpetual animated backdrop | static worlds + grain | V2 rays/particles | **Integrate** (built: `kinetic.rayBackdrop`) |
| Eased entrances/exits at beats | per-shot camera only | Remotion `interpolate`/`spring`; Manim | **Integrate** (built: `kinetic.entrance/exit/spring`) |
| Glass infographic cards | absent | V2 card; anything2explainer | **Integrate** (built: `kinetic.glassCard`) |
| "One protagonist per beat, yields" | scene = shot | video-talkcraft anti-PPT | **Adopt as director rule** |
| Semantic-beat boundaries | fixed shot lengths | video-talkcraft semantic annotation | **Adopt** — drive beats from narration clauses |
| 60 fps smoothness | 30 fps | V2/V3 | **Add fps toggle** (cost: 2× render) |
| Color-coded info design | ad-hoc palette | video-talkcraft "one accent" rule | **Adopt design tokens** |
| Freeze/black QA + review loop | present (Round 7 gates) | video-talkcraft subagent eval | **Keep + extend** to caption-sync check |
| 3D drama (V1) | `raster3d` exists | open-3d-skills / three.js | **Deferred** — software 3D only (no WebGL headless) |

**Reusable without replacement:** Remotion's *interpolate/spring model*, Manim's *easing vocabulary*,
video-talkcraft's *anti-PPT directing rules*, and the *Whisper→word-timing* caption schema all map
onto our existing modules. We do **not** adopt Remotion/Manim as runtimes (they would replace our
stack); we port their **patterns** into our canvas engine.

### Tested proof (Phase 3/4)
Built `studio/src/kinetic.mjs` (additive; imports only the existing `ease` table) and
`studio/experiments/kinetic_demo.mjs`, which renders an 8 s short using our **existing** Tanjiro
stickman + `score.mjs` plus the new kinetic layer. Result (`research/artifacts/round8/kinetic-demo.mp4`,
contact sheet + full frame viewed): perpetual ray/particle backdrop, breathing Tanjiro, a glass
"SWING POWER" card with a counter ticking 3%→99% inside a rotating pulse ring, and word-karaoke
captions (current word bold-gold, keywords red, sliding window). **QA: 0 black, 0 freezes**, 50 ms/frame.
This confirms the three biggest gaps are closable in our engine without touching existing work.
*(Demo audio is a music bed only, −26.9 LUFS; production loudnorms to −14 once voice is wired.)*

---

## PHASE 4 — Prioritized improvement roadmap (preserve existing engine)

**P0 — highest impact, lowest risk (next round)**
1. **Word-karaoke captions in the main pipeline.** Replace phrase-level `drawCaptions` with
   `kinetic.karaokeCaption`, fed by the word timestamps `align.py` already produces. Add a
   `keywords` list per scene (numbers/emphasis) for red/gold pops. *Files: `render.mjs`, `ir.mjs`.*
2. **Semantic-beat director.** Derive beat boundaries from narration clauses (not fixed shot
   lengths); enforce "one protagonist per beat, yields when done"; new elements enter only at beats.
   *Files: `director.mjs`, `stories/*`.*
3. **Perpetual backdrop layer** behind every scene so held beats never freeze (already built; wire
   into `render.mjs` as a base layer with per-genre themes). *Files: `render.mjs`, `kinetic.mjs`.*

**P1 — infographic vocabulary**
4. **Animated counters, bar meters, fraction morphs, graph draw-on** as reusable scene components
   (`kinetic.animatedCounter` done; add `barMeter`, `fractionMorph`, `graphDraw`). *Files: `kinetic.mjs`.*
5. **Design tokens**: one accent + one shadow + two font weights + alternating act backgrounds;
   forbid ad-hoc per-scene colors. *Files: `design.mjs`.*
6. **Eased entrance/exit library** (`entrance/exit/spring/interpolate` done) used by all components.

**P2 — polish & fidelity**
7. **60 fps toggle** for explainer genre (match refs); keep 30 fps for heavy 3D. *Files: `pipeline.mjs`.*
8. **Caption-sync QA gate**: verify each caption word's on-screen time matches its audio timestamp.
9. **Vector character states** (blink/expression/limited gestures) via a small state machine
   (Rive-inspired) on the existing stickman/bust. *Files: `stickman.mjs`, `cartoon.mjs`.*
10. **3D drama mode (V1)**: single-set, slow push-in, moody lighting on `raster3d` — deferred,
    software-rendered only (no WebGL headless in this sandbox).

**Explicitly preserved:** all Rounds 1–7 engines, the ledger, the QA gates, the placeholder-script
swap path. Everything above is additive or a pattern adoption, not a rewrite.

---

## Limitations (honest)
- Audio was **measured, not heard** (loudness/silence/spectrograms). I cannot judge mix *quality* by ear.
- Motion was judged from **sampled frames** (1 fps overviews + 20 fps strips), not continuous playback.
- V1's exact 3D tool is unknown (it's a screen-recording); I describe its *look*, not its software.
- The demo's caption timeline is a scripted reading rhythm; real ASR word-sync is a P0 wiring task.
- No WebGL/three.js headless here; 3D remains software-rasterized.

## Reproduce
```bash
# videos already downloaded to google_drive/ via the Drive connector
node studio/experiments/kinetic_demo.mjs          # renders the techniques proof
# analysis artifacts: research/artifacts/round8/v{1,2,3}-{overview,motion-*,spectro,full-*}
```
