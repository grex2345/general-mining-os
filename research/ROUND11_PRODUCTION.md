# Round 11 — From integration tests to a production film

**Deliverable:** `research/artifacts/round11/the-boy-who-chose-clay.mp4`
**36.0 s · 720×1280 · 30 fps · h264+aac · 9,744,427 bytes**
SHA-256 `0babb9043c0f2998bac66cdfa0dd546a2805c03f3af9cf7bdd0e474c01eca47c`

## Answer to the user's question
The round9 (`integration-smoke.mp4`, 5 s) and round10 (`english-integration.mp4`, 8.7 s) clips were
**integration tests** — proof that the full pipeline (render → AI narration → forced alignment →
word-karaoke captions → music/SFX mix → mux) works end-to-end. They were never the quality ceiling.
Round 11 builds the **production layer** on that same architecture and produces a real, longer,
multi-scene film. Development continues from here (see roadmap).

## What was built (additive — nothing replaced)
| Module | Role |
|---|---|
| `studio/src/worldkit.js` | 25+ props, ground-detail scatter, ornate lathe masterpiece vase, glow/stars/dust, day/night/warm lighting, Catmull-Rom camera |
| `studio/src/actor.js` | distance-driven walk, idle micro-motion, waypoint locomotion, 12 gesture recipes |
| `studio/src/film_potter.js` | 9-shot director; each shot has its own location, camera, acting, props |
| `studio/experiments/r11_render.cjs` | headless renderer + in-render transition compositor (dissolve/bloom/dip/fade) |
| `studio/src/score_world.mjs` | warm cinematic score, 7 story moods |
| `studio/src/sfxkit.mjs` | 13 procedural SFX + precise ducking mixer |

## The film — "The Boy Who Chose Clay"
An underdog fable: a village mocks Sami for choosing clay over gold; he works relentlessly; one
night he fires the kiln hotter than ever; the reveal of an ornate masterpiece silences then wins
the village. 9 scenes, each visually representing the narration:
1. **Village square** — crane-down establishing; Sami walks in; villagers mock.
2. **The choice** — readable two-shot: gold-clutcher (left) vs Sami at the wheel (right).
3. **Mockery** — medium three-shot, mockers pointing; Sami's resolve.
4. **The wheel** — warm interior, orbit + tilt; clay rises, dust in the light shaft.
5. **Montage** — pots accumulate on the shelf; a failed pot shatters (shard burst).
6. **Night kiln** — day→night dip; stars, moon, fire glow, embers; Sami feeds the kiln.
7. **Doors open** — bloom transition; doors swing, light spills, crowd gasps.
8. **The reveal** — reverent orbit + push to the ornate zellige vase; sparkles.
9. **Celebration** — crane-up wide; lanterns, confetti, applauding crowd; Sami holds the vase aloft.

## Audio
- Narration: platform `voice-02` (natural English), 0.9× storyteller pace, 89 words.
- Captions: pocketsphinx forced alignment → word-karaoke ASS, gold keywords, +1.2 s cold-open offset.
- Music: warm major-pentatonic score following the beats (dawn→tense→build→night→swell→wonder→joy).
- SFX: birds/wind, wheel hum, clay squish, shatter, fire crackle, door creak, crowd gasp, sparkle
  chime, applause — placed on the action beats and ducked under the voice.
- **Measured:** integrated −14.7 LUFS, true peak −3.98 dB; mean −18.3 dB, max −4.0 dB.

## QA evidence (actually run)
- Render: 1080 frames @720×1280, 519 ms/frame, 561 s total.
- `blackdetect`: no unintended black. `freezedetect`: no freezes ≥0.5 s.
- ffprobe: video+audio both 36.000 s, h264+aac.
- Sampled 24 frames across the timeline → contact sheet **viewed**: motion, captions, transitions confirmed.
- Mid-shot frames **viewed** during iteration; fixed empty foregrounds, portrait framing, reveal brightness.

## Lessons logged to KB §10
Portrait horizontal FOV is narrow (two/three-shots need z≥9 or fov≥55); W.box/ball return Groups
(material on children[0]); drawPuppet needs pose.t; in-render dissolves preserve narration timing;
duck via amplitude envelope (ffmpeg-4.1 amix averages inputs).

## Roadmap (continuing development)
60 fps option · more ACTION-LIBRARY physics recipes (throw/pickup/eat/fight) · look-dev grade pass ·
longer formats (60–90 s) · per-subject art direction · automated caption-sync QA gate.
