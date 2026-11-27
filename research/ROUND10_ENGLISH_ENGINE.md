# Round 10 — English-default engine + reference-architecture 3D pipeline

User correction: **videos are ENGLISH by default**; Moroccan Darija is only the language we
communicate in. Task: keep improving the engine with English as the default production language;
do not redo research; preserve all existing work.

## 1. English is now the engine default
- `audiopipe.DEFAULT_LANG = 'en'`; `whisperWords`/`alignWords`/`narrationBundle` default to English.
- `alignWords` routes English → **precise pocketsphinx forced alignment** (matches acoustic onsets),
  with whisper+DP fallback for out-of-dictionary words. Non-English still uses whisper+DP.
- `narrationBundle(script, voiceFile)` codifies the repeatable English workflow:
  script → TTS voice → loudnorm → word alignment → karaoke ASS.
- Tested: piper English (10.39 s) and natural platform voice `voice-02` (8.63 s) both → 26-word
  precise alignment (Meet@0.08 … stared@9.68) → English karaoke captions. ✅
- Two English voices ready: piper/amy (local, no interaction) and platform `voice-02` (natural,
  user-selected). Darija `voice-01` remains available for explicitly-requested Darija videos.

## 2. Reference-architecture 3D pipeline — ported + tested (the quality leap)
Key insight from the pack source: the references are **2D canvas stick puppets on upright
billboards inside a 3D toon world**, not fully-3D characters. Ported into reusable headless modules:
- `studio/src/puppet2d.js` — full acting puppet (moods, arms + IK hands, walk, nervous sweat,
  squash/stretch, outfits, hair, glasses, hats).
- `studio/src/stickworld.js` — ink-outlined toon primitives, canvas-textured surfaces, soft contact
  shadows, yaw-only puppet billboard, cinematic camera (keyframed pos/look/fov + micro-handheld).
- `studio/experiments/stickscene_demo.cjs` — headless SwANGLE renderer combining them.
Result: an expressive puppet (smile → point → shock-with-sweat → laugh) in a Stone-Age pottery
village (huts, trees, pottery wheel, pots, gradient sky, soft shadows) with a cinematic camera that
pushes into a close-up on the shocked face. ~263 ms/frame @720×1280. This is near-reference quality.

## 3. Full English integration proof
`research/artifacts/round10/english-integration.mp4` — 8.67 s, 720×1280, h264+aac, **0 black / 0
freeze, −13.62 LUFS**. Combines: 3D toon village + acting puppet + natural English narration
(voice-02) + word-synced English captions (keyword-coloured) + mystery→resolve music bed. Acting
beats match the narration (point→"spin clay into pots", shock→"called him crazy", celebrate→"the
whole village stopped and stared"). Viewed contact sheet confirms captions + acting + camera.

## 4. What improved vs Round 9
- Round 9 prototype: basic 3D bean character, sparse scene, washed lighting.
- Round 10: reference-architecture 2D acting puppet (rich emotion/IK/outfits) in a layered 3D toon
  world, cinematic camera, English-default narration + precise word-sync. This closes most of the
  visual-polish gap identified in the readiness assessment.

## 5. Remaining polish (iteration, not missing capability)
- Richer scenes (15–20 props), more acting recipes (throw/pickup/eat/fight from ACTION-LIBRARY),
  look-dev grade, more camera variety, 60 fps option. All buildable on the new modules.
- Render speed ~263 ms/frame → ~8 min/60 s @30 fps; mitigate with partial re-render + 720p/30 fps.

## 6. Preserved
All Round 1–9 work intact; HEAD verified before changes; only additive modules + English-default
routing changed. Ledger 56 records, valid.
