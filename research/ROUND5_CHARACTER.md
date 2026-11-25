# Round 5 — Character, Cinematics, Voice

Scope: build a **reusable** character + cinematography + sound engine on top of the
Round 4 renderer. No final YouTube production. Everything below was rendered on
this machine (2 cores, no GPU) and inspected as images or extracted frames.

Artifacts: `research/artifacts/round5/` (14 files).

---

## 1. What was built

| Module | New capability |
|---|---|
| `studio/src/character3d.mjs` | Procedural character mesh, 26-bone skeleton, FK, analytic two-bone IK, `aimBone`, continuous expression space + 10 presets, IPA visemes |
| `studio/src/animation.mjs` | Easing library, band-limited noise, `solveLeg`/`solveArm` IK, gait walk/run, jump, impact, idle, camera shake (squared trauma), `cameraMove`, blinking |
| `studio/src/cinema.mjs` | Depth-sliced DOF, sub-frame motion blur, bloom, grain, chromatic aberration, `fitFov` lens solver, letterbox, speed lines, impact flash, grade |
| `studio/voice.py` | Piper neural TTS + espeak-ng word/IPA extraction → JSON timing |
| `studio/experiments/voiceclip.mjs` | Line → speech → phoneme timeline → visemes → subtitled MP4 |
| `studio/experiments/scene5.mjs` | Character inside the Round 4 `lastTrain` environment with light, camera, snow, audio |
| `studio/src/lowpoly.mjs` | **Added** `rim` light term to `shadeFace`, `groundPass` hook, `cam.target`/`cam.rebase()` |

The character is **2 548 faces**; the whole 1080×1920 frame is rasterised on the
2D canvas in JavaScript. No WebGL (dead in this Chromium build — see Round 3).

---

## 2. Measured results

Render cost at 1080×1920 output (internal 480×853, 2 upscale passes):

| Clip | Frames | ms/frame | File |
|---|---|---|---|
| walk cycle | 54 | 989 | `exp5-walk.mp4` (743 KB) |
| impact | 54 (3 sub-frames each) | 1 059 | `exp5-impact.mp4` (1.48 MB) |
| turntable | 54 | 853 | `exp5-turntable.mp4` (1.27 MB) |
| lip-sync line | 200 | 943 | `exp5-voice.mp4` (2.63 MB, AAC) |
| combined scene | 150 | 925 | `exp5-scene.mp4` (2.84 MB, AAC) |
| 3 stills | — | 1.8 s total | `exp5-character/expressions/poses.png` |

Speech: **0.40 s to synthesise 5.75 s of audio (14× realtime)** on CPU.
Audio levels: scene mix mean −22.0 dB / peak −4.3 dB; voice mix mean −22.3 / −3.9.

---

## 3. Bugs found and fixed (all reproduced, then verified fixed)

1. **`walkClip` produced 54 black frames** (a 6 354 B MP4 with a valid stream, so
   `ffprobe` looked fine). A local `const big` shadowed the canvas parameter, so
   frames were drawn to a canvas that was never encoded. Fixed by drawing into the
   `frame` argument. *Lesson: always check MP4 byte size **and** extract a frame.*
2. **Chromatic aberration turned the picture magenta.** The old version multiplied
   copies by pure red / pure blue and added them with `'lighter'`, which doubled R
   and B against the untouched frame. Rewritten as three isolated channel layers.
3. **Feet cropped in three consecutive framings.** Hand-tuning `eye`/`fov` does not
   converge — narrowing the lens crops the feet. Solved with `fitFov()`, a binary
   search (22 iterations) for the smallest FOV that keeps all passed world points
   inside a margin-safe rect. But `fitFov` alone collapsed the scene into a
   close-up, so the combined scene also got an explicit **distance rule**: the
   figure must occupy 22–46 % of frame height (target 34 %), else the eye is pulled
   back along the view axis and `cam.rebase()` is called.
4. **`skeleton.pos()` returns rig-local coordinates.** Projecting it placed the
   contact shadow at the world origin — a dark blob floating a metre left of the
   character. The root bone carries the world offset.
5. **A contact shadow drawn before `renderScene` is buried by the ground pass.**
   Fixed with a new `groundPass` callback that fires after terrain and before solids.
6. **Nobody was lit.** In a night scene, a flat-shaded figure with only a key plus
   hemispheric fill has nothing brighter on its silhouette than the background: it
   reads as cardboard. Added a **Fresnel rim term** to `shadeFace`
   (cool moon-side, `power 1.9`, `intensity 1.75`) and pale stone cornice/plinth/
   pilaster bands plus window mullions — without them the station wall was the same
   value as the sky and the lit windows looked like paper rectangles glued on.
7. **Subtitle at 79.5 % height covered the character's feet.** Moved to 90.5 %.
8. **Brow capsules poked through the hair as "gum drops"**; fixed by lowering the
   hairline caps and moving brows to `y0 = 0.232`.

---

## 4. Techniques that had to change (documented so they are not retried)

- **Feet must be IK targets, not joint angles.** Angle-driven legs skate across the
  ground. The pole vector must be passed explicitly (`axisSign = -1` for limbs,
  `aimBone` assumes +Y).
- **Arms must ALSO be IK targets.** Stacking shoulder + upper-arm + forearm pitch
  rotations never converged; three composed rotations put a "guard" pose above the
  character's head. `solveArm` with world targets fixed it.
- **Positive X rotation pitches the face *down* in this rig** — no large negative
  neck pitch.
- **`tint` in `gradeFrame` is a multiply**, so tinting skin made it lavender. Skin is
  never tinted.
- **DOF `strength` 0.55 / `maxBlur` 11 obliterates a 1080×1920 frame.** Medium shots
  stay at ≤ 0.30 / 8.
- **`@napi-rs/canvas` aborts (not throws) on NaN geometry.** A silent process death
  is usually a NaN vertex, not a memory problem.
- **HuggingFace is unreachable** (HTTP 000), so Kokoro weights could not be fetched.
  Piper voices were obtained from an MIT GitHub repo instead (see §5).

---

## 5. Voice + lip-sync

`studio/voice.py` runs **Piper** (`en_US-amy-medium`, 22 050 Hz mono, ONNX Runtime,
CPU) for audio and **espeak-ng** for timing only: word events give
`audio_position` in ms, and `espeak_TextToPhonemes(espeakCHARS_IPA)` gives one IPA
cluster per word.

- Line: *"Every night the last train leaves without me. I stopped counting the ones I missed."*
  → **5.7605 s**, 15 words, 57 phonemes.
- Scene line: *"The last train left an hour ago. I am still here."* → **4.01 s**, 11 words.

Visemes: 53 IPA symbols → `{mouthOpen, mouthWide, mouthCurve}`; diacritics stripped;
co-articulation blends 30 % toward the next phoneme 45 ms early. Phoneme-driven
mouth shapes beat amplitude lip-flap — an `m` closes the lips and an `o` rounds them,
which amplitude cannot express.

> **Honest limitation:** the `alignment` field in `exp5-voice-timing.json` is
> `proportional-estimate (even-fallback, espeak)`. It is word-level timing derived
> from espeak's own event stream and proportionally distributed, **not** forced
> alignment against the Piper waveform. Piper and espeak do not share a duration
> model, so word onsets can drift by tens of milliseconds. Tighter sync needs a
> forced aligner (e.g. wav2vec2 CTC alignment), which is not installed.

Also: espeak phoneme events are **compiled out** of this build
(`espeak_SetParameter(21,1,0)` returns −1), so timing comes from IPA clusters, not
phoneme events.

---

## 6. Licence / attribution

- **Piper** — MIT (rhasspy/piper, piper1-gpl). Voice models: MIT repo
  `Mobile-Artificial-Intelligence/babylon`.
- **espeak-ng** — GPL-3.0. Used as a library to generate audio; redistributing the
  binary would carry the licence. Not redistributed here.
- Character mesh, rig, animation, lens stack and scene are original code in this
  repository.

Installed speech binaries (`studio/lib/`, `studio/lib_piper/`, `studio/piper/`,
~280 MB) are **gitignored** and are rebuilt by `studio/voice_setup.sh`.

---

## 7. What is still weak (do not mistake this for professional quality)

- **Shading is flat.** Faceted low-poly faces with per-face lighting, not smooth
  normals. Good stylisation, not realism. Real skin needs smooth normals plus
  subsurface approximation.
- **Hair and clothing are solids**, no strands, no cloth simulation. Secondary motion
  is limited to procedural lag, not simulated cloth.
- **Hands are mitten-ish** — fingers are suggested by a few capsules, not articulated.
- **Shadows are only contact blobs.** There is no shadow map; characters and props do
  not cast onto each other or onto walls.
- **The camera move is a slow dolly, not a choreographed sequence.** No cuts, no
  coverage, no match-on-action.
- **I cannot hear the audio.** Levels, durations, stream presence and codec were
  verified programmatically; the mixes are provided as MP3 so the judgement can be
  made by ear.
- **The environment is one location** (`lastTrain`). A real film needs set variety.

Recommended next: shadow mapping or a cheap sun-occlusion pass, smooth-normal
shading with a wrap-diffuse skin term, articulated fingers, and a shot-list system
(cuts + coverage) rather than a single continuous take.
