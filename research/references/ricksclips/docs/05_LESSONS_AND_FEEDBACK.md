# Lessons (read before every video)

Every mistake that has already happened once, so it never happens twice.

## Style
- Characters that don't match the reference kill the whole look. Study close-up frames, use a thick brush outline,
  Ricks-style faces and chunky limbs. **Replicate the reference, never the kit default.**
- Thin outlines and limbs vanish at small sizes (banners, pfps): use `weight: 1.35` for branding.
- Moustache in the nose or mouth, a beard covering the mouth, hats floating above heads, hidden eyebrows: all wrong.
- Keep FX (smoke, sparkles) clear of faces and hats.
- His characters are more expressive than you think (eyes, faces) and have a thicker outline. Push expressiveness.

## Motion and shots
- **Something must move every second.** Characters walk, gesture, change expression, flap mouths and blink, and the background reacts.
  Holding poses while only the camera moves reads as flat and boring.
- Empty shots and slow straight-line camera moves kill retention.
- A frame showing only a hat means the camera is looking too high. Check stills of EVERY shot.
- 9:16 pushes characters out of frame. Keep them close together (two-shots ±0.5–0.7 m). Avoid over-zoomed frames.
- A procedural layer (beat nods, ±0.05 m hops, small gesture swaps) is invisible at 9:16 and isn't acting. Something has to happen
  **every frame**: in the background, in the foreground, on the character, around it, on the set, tied together by seamless camera
  movement. Measured fix: docs/07 (7 motion layers, story action on every clause, transitions as camera moves, composition change
  ≤ 2.2 s) and the `tools/study/qa_motion.py` gate. Never take the easy route of more camera wiggle.
- In all 19 Ricks clips, everything except the characters is 3D (flies, paper, lamps, coins). Flat 2D card FX look cheap.
  Every FX is real 3D geometry with the ink outline.
- Never frame body parts alone (a tilt-up starting on boots). A reveal starts on a named story object, and a face/context is always in frame.
- Sign text can overflow its board: auto-fit sign text.
- A camera that is fitted to "include everyone" can fly backwards through a wall. Clamp every camera key inside the set's walls and ceiling.

## Audio
- Trimming at whisper timestamps (-45 dB) cuts words mid-syllable. Trim on silence only (-58 dB, 90 ms guards).
  The video can be longer; a cut word can't be fixed.
- Music/SFX too loud drowns the narrator. Keep them under the voice like Ricks, or quieter.
- Use real downloaded sounds, never synthesized ones.
- **Never reuse the same music bed.** A different track for every video; keep a music log.
- Time-stretching the voice (even 1.1x) smears it. Write a shorter script instead.
- Long comma-chained sentences make the voice monotone. Short standalone lines, questions and real pauses sound natural.
- Glow must be **visible**: 0.16 opacity is invisible, 0.4 is right.

## Process and usage
- **ElevenLabs: one take only, and state the credit cost first.** Multiple takes burn thousands of credits.
- 192 kbps output needs a paid tier; use mp3_44100_128.
- Render on your own PC. Cloud renders are slow and expensive; use the cloud for checking stills only.
- Freesound's CDN can return 403 from cloud machines and Mixkit rate-limits (429). Keep a local SFX/music folder.
- Keep API keys out of git (`.env`, env var). Rotate a key if it was ever pasted somewhere public.

## The "huge drop in quality" checklist (root causes seen once, never repeat)
- **Choppy motion.** Gesture blends quantised to 0.1 steps (`q(..., 1)`) make arms jump in 10 visible steps. Never quantise motion
  coarser than 0.02. Render a low-res moving proxy of the whole video and pass qa_motion before shipping.
- **Low-quality sets.** Building many sets in one pass and shipping after one round of stills. Every set gets a full detail pass
  (textures, clutter, life, lighting) and a side-by-side comparison with the reference.
- **Bad TTS.** Guessed stock voice IDs that were never auditioned, stacked time-stretches, hard splice gaps. Audition every voice first.
- **Skipping the gate.** "Go" means run the checklist first, then ship.
- **EEVEE "Shadow buffer full".** Too many shadow-casting lamps on a 6 GB GPU. Raise `shadow_pool_size`, halve `shadow_resolution_scale`,
  and let only key lights cast shadows.
