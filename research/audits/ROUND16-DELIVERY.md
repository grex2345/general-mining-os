# Round 16 — "Infinity Is A Coffin" (Gojo / Jujutsu Kaisen)

**Deliverable:** `research/artifacts/round16/infinity-is-a-coffin-r16.mp4`
**Script:** the user's text, verbatim, 205 words / 23 sentences. Nothing substituted, nothing shortened.

---

## 1. What was actually tested

Every number below comes from the **finished MP4**, not from a source WAV or a
pre-encode frame dump. Where a source measurement is quoted it is labelled as such.

| Check | How it was tested | Result |
|---|---|---|
| Script integrity | word-level Levenshtein between `script.txt` and ASR of the audio **pulled back out of the MP4** | 200/207 words recovered exactly; WER 3.86% |
| Narration continuity | sentence-boundary loudness steps on the exported audio | mean **1.26 dB**, max **3.31 dB**, 1/21 over 3 dB |
| Clicks / splices | isolated-sample deviation detector gated on quiet 20 ms frames | **0** candidates |
| Dead air | digital-silence runs > 120 ms in the exported audio | **0** (the score bed carries the tail) |
| Clipping | samples at ≥ 0.9995 full scale in the exported audio | **0** |
| Loudness | `loudnorm` analysis of the delivered file | **−14.03 LUFS**, **−3.37 dBTP**, LRA 2.70 |
| Voice vs bed | voice-stem RMS against summed music+SFX+ambience RMS over all 53 caption phrases | worst phrase **14.6 dB** above the bed; **0** phrases under 6 dB |
| Voice identity | aligned correlation of the exported voice stem with the original take | **0.99451** (same performance, only peak-limited) |
| Completeness | `ffprobe -count_frames` on the delivered file | **2496 / 2496** frames, video **83.200000 s**, audio **83.200000 s** |
| Picture | contact sheets of frames decoded **from the MP4**, viewed | see §4 |
| Motion | per-frame difference + ECC camera-compensated residual over all 2496 decoded frames | see §4 |
| Prior deliverables | md5/sha256 of R13 / R14 / R15 before and after | unchanged |

### The ASR differences, in full

ASR on a compressed mix is not a transcript oracle. These are the only eight
differences, and none is a missing or broken syllable:

```
SUB  kaisen      -> kaizen        (proper-noun spelling)
SUB  astronauts' -> astronaut's   (apostrophe placement)
SUB  you         -> to            (decoder quirk at a phrase start)
SUB  four        -> 4             (numeral normalisation)
SUB  twenty      -> 20            (numeral normalisation)
INS  -           -> eye           ("six eyes are" -> "six eye is a")
SUB  eyes        -> is
SUB  are         -> a
```

The four words the decoder stumbled on were checked individually in the exported
audio: `You` sits **26.2 dB** over the bed, `generate` 24.1 dB, `six` 17.8 dB,
`eyes` 19.2 dB, `are` 20.5 dB, `mandatory` 14.4 dB, each within ~1 dB of its level
in the source take. They are present and loud; the decoder simply normalised them.

---

## 2. The interruption problem — cause and fix

R13 and R15 built narration by **slicing one take at whisper word boundaries and
re-assembling it**, then applied per-beat gain shaping. That is what produced the
choppy feel: every splice is a loudness step, and the per-beat DSP added more.

R16 does neither.

- **One continuous TTS take** of the whole script, generated in a single call.
- Whole-file processing only: trim outer silence → front-pad → `highpass=80` →
  one gentle compressor → two-pass **linear** `loudnorm`. No per-beat gain, no
  re-splicing. `voicekit.restructureTake` and `prosody.shapeBeat` are deliberately
  not imported anywhere in the R16 path.
- Whisper is used **read-only**, to place the exact script words on the take's
  timeline for captions, lip-sync and sound-design anchors.

Sentence-to-sentence loudness stepping, measured the same way on all three films:

| Film | mean step | max step | steps > 3 dB |
|---|---|---|---|
| R13 (shipped) | 3.22 dB | 7.17 dB | 6/13 |
| R15 (shipped) | 4.17 dB | 8.13 dB | 9/13 |
| **R16 source take** | **1.12 dB** | **2.81 dB** | **0/21** |
| **R16 exported MP4** | **1.26 dB** | **3.31 dB** | **1/21** |

The single remaining >3 dB step is `compare → difference`, where the line
"That's the difference." is deliberately delivered quieter. It is in the
performance, not in an edit.

---

## 3. Sound design

78 foley events, each anchored to the **exact script word** it describes, plus 22
ambience beds (one per world) and a continuous arc score.

- `"coffin"` → lid weight + seal; `"sealed"` → lock.
- `"stops"` / `"touching"` → blade deflections; `"gets out"` → heat bouncing back.
- `"thermos"` → flask set down + glass ring.
- `"NASA"` → console ack; `"radiator"` → heat-rejection hiss.
- `"100"` → gauge; `"thousand"` → the number lands on a body blow.
- `"Sweating"` → three distinct drops; `"evaporate"` → vapour turning back.
- `"four"` / `"twenty"` → countdown ticks; `"cooking"` → heat bloom + riser.
- `"six"` / `"eyes"` → the reveal chime, with a **−10 dB score dip in the 0.4 s
  before it** so the turn lands in near-silence.
- `"oxygen"` / `"heat"` / `"knives"` → three different filter sounds, in that order.
- `"second"` → alarm; `"24/7"` → loop pulse; `"off"` → a real lever clunk.
- `"call"` → two phone rings; `"yours?"` → a low bell that rings out under the fade.

Mix: music −20 dB, SFX −11 dB, ambience −27 dB relative to the voice, all three
ducked by the voice envelope. Mastered with **one linear gain** to −14 LUFS /
−2 dBTP ceiling — no master compression.

---

## 4. Picture

22 scenes, 62 compositions, 720×1280 @ 30 fps, 83.200 s.

Every composition carries a story reason, runs ≤ 2.2 s, and passes the framing
band for its shot size: **62/62 ok, 0 planner problems**. Scene changes ride
dissolves, wipes, blooms and a fade-in rather than hard cuts.

### Defects found by looking at frames, and fixed

These were all invisible to numerical metrics:

1. **The whole film rendered as washed-out pastel.** three r149 reads
   `texture.encoding`, not `texture.colorSpace`. Every canvas texture was
   defaulting to Linear and being brightened a second time on sRGB output.
   The renderer now re-tags every map per scene (3–88 textures per scene) and
   tone-maps with ACES at 0.92 exposure.
2. **Additive VFX stacked to pure white.** Halos, shell, wire, embers, rays and
   atom glows had their opacities cut ~50–60 %.
3. **Half of every framed display was flat frame colour.** In the shared
   `worldkit.canvasPlane`, the frame box's front face sat at exactly z = 0,
   coplanar with the screen plane, and the two z-fought along the quad's triangle
   diagonal. The frame is now seated 0.04 behind. This was a real bug in the
   shared kit, not an R16-only problem.
4. **The "brain" read as an atom.** It was built from great-circle torus rings.
   Replaced with a drawn brain: two hemispheres, gyri, longitudinal fissure,
   cerebellum and stem, recolouring with heat and healing. Its orbiting equation
   glyphs now billboard to the camera instead of showing mirrored backs.
5. **Every character wide shot reported OVERFLOWS.** `cinema2`'s default wide
   subject height is 12 m, calibrated on the village film. Each scene now declares
   its own subject scale, so the verdicts mean something.
6. **Six frames were empty walls, inside a prop, or cropped a HUD mid-word** —
   the NASA crane rose into the ceiling slab; the suit macro sat inside the
   astronaut; the evaporate macro looked at the back of a HUD panel; the focus
   macro cropped "CONCENTRATION" to "RATION". All six were re-framed and re-viewed.

7. **The "100 WATTS" gauge was never fully readable in any composition.** Three
   diagram callouts (the thermos vacuum-gap label, the resting-output gauge and the
   manual-filter legend) were world-anchored, so orbit moves slid them out of frame.
   They are now pinned to the camera at a fixed, fully-visible spot in the upper
   left, clear of the character and of the burned captions. Verified by rendering
   three probe frames per scene and reading them: the gauge shows
   `RESTING OUTPUT / 100 WATTS / doing nothing at all` in all three compositions,
   and the filter legend highlights `oxygen IN`, then `heat OUT`, then `knives OUT`
   in step with the narration.

### Motion

`outCubic` easing means each composition's camera move is nearly finished by 80 %
of its duration, which left ~0.3–0.7 s tails where the frame barely changed. Every
scene now runs through a wrapper that puts a floor under continuous camera life
(handheld ≥ 0.014 m, horizon sway ≥ 0.032 rad), so the camera never parks.

Measured on scene 16 before/after: near-static frames **15.4 % → 0 %**, minimum
inter-frame difference **0.00 → 0.81**.

---

## 5. What is still not perfect

- The vendored motion gate's **average moving area** target (≥ 30 %) is not met.
  A single character plus diagrams moves less of the frame than the reference's
  busy village scenes. This is a structural difference of subject, not a frozen
  shot: the longest static hold is under 0.7 s.
- A few secondary HUD panels (the suit callout, the core-temperature readout) still
  drift partly out of frame during orbit moves. Each has at least one composition
  where it is fully readable, and the burned captions carry the exact narrated
  words regardless. The three primary diagrams are pinned and always readable.
- The street scenes deliberately switch to a second character (dark hair, grey
  coat) for "You've got your own infinity". Gojo stays white-haired and consistent
  in every scene he is in.

---

## 6. Reproduce

```bash
node studio/experiments/r16_audio.mjs          # narration + alignment + captions
node studio/experiments/r16_film_mix.mjs       # sound design + mix + master
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle \
  OUTDIR=/tmp/r16frames node studio/experiments/r16_render.cjs
bash studio/experiments/r16_finish.sh          # encode, burn captions, mux, assert
bash studio/experiments/r16_export_audit.sh    # re-transcribe + re-measure the MP4
```

Nothing in `round13/`, `round14/` or `round15/` is written to by any R16 script.
