# Ricks Clips Style Bible

The target is the Ricks Clips (@RicksClips3000) look, replicated as closely as possible.
**Always compare against the reference (reference/ricks-study/) before delivering. Never fall back to the kit's default look.**
We copy the *style*. Stories, scripts, characters and shots are always our own.

---

## 1. Characters (LOCKED, approved Nov 7 2026)

Every character in every video uses this exact style. The renderer is `characters/rick.js`; extra outfits, hats and props go in
`characters/rick_ext.js` or the project's `<slug>_cast.js`.
**A new cast is designed for every video. Never reuse old characters.**

| Part | Rule |
|---|---|
| Head | White/skin round head, slightly **wider than tall**, no nose |
| Outline | **Thick near-black brown brush outline** (~6% of head width), heavier at the bottom. Never a thin flat line. |
| Body | Pear-shaped pill body, clothes painted on (stitching, pockets, puffy sleeves, lapels) |
| Limbs | **Chunky brown limbs**, small dark hands, small dark shoe ovals |
| Eyes | Tall dark ovals (default), thick dashes (bored/sleepy/blink), white rings with dot pupil (shock), flat-lidded half eyes (angry/smug), `><` (laugh) |
| Brows | Thick, arched, sit high on the forehead. **Must always be visible.** |
| Mouth | Wide dark D-grin with a white tooth row; heavy wide frowns |
| Hats | Sit **on** the crown (worn, not floating), brows always show under the brim |
| Facial hair | Moustache sits under where the nose would be, never in the mouth. Beards start **below** the mouth. |

FACES available: neutral, grin, beam, smile, smugsmile, smirk, sly, bored, sleepy, stern, angry, shock, nervous, think, laugh, wink.
ARM POSES: hang, hip, wave, up, point, hold, holdUp, staff, chin, mouth, cross, thumb. Blend two with `{a:'hang', b:'up', t:0.4}`.
OPTS: `pose` stand/sit, `expr`, `look` (-1..1), `L`/`R`, `propL`/`propR`, `headTilt`, `weight`, `blink`, `talk` (0..1 mouth flap), `walk` (0..1 leg phase), `squash`.

Design sheets: `characters/sheets/`. Branding renders (pfp/banner) use `weight: 1.35` so outlines and limbs hold up at small sizes.

## 2. Something moves EVERY frame (the #1 difference between us and Ricks)

**Full measured study: docs/07_RICKS_DEEP_STUDY.md. Read it before planning any shot.** Summary:

- His video is one continuous camera flight: ~0 hard cuts, a new composition every ~2.1 s, the camera moving on 83% of frames, roll drifting on ~38%.
- 96.6% of frames have motion, about 1/3 of the pixels move on an average frame, and the longest still moment is under 0.5 s.
- Motion is **NOT pulsed on words** (measured flat). It comes from 7 layers stacked in every shot:
  **A** story action (the character does what the narrator just said, on that word), **B** face (meaningful expression change every 0.3–0.8 s,
  darting eyes, mouth flaps on quoted lines), **C** body idle (sway, fidget, props moving), **D** reactors (others laugh, lean in, walk in, fall over),
  **E** props/FX (sparks, glints, smoke, pours, glow-ups), **F** living environment (water, weather, flames, clocks, birds and bugs, crowds),
  **G** parallax (the camera glides past foreground objects).
- Every shot needs at least 4 layers, always A or D, plus F and G. Every noun and verb in the narration gets a visual.
- QA gate before rendering: `python3 tools/study/qa_motion.py preview.mp4` must PASS.

A procedural `perform()` layer (blink, expression cycling, gesture swaps, beat nods/hops) is **not enough on its own**. Its beat nods and
hops are the wrong model: tiny procedural wiggles that read as jitter, not acting. Keep blink, eye darts and expression changes (layer B),
drop the beat-pulse nods/hops, and add real story actions, reactors, FX, environment and parallax.

## 3. Shots and camera

- **No shot without a character in it** (or a macro of the prop the narrator names, which then pulls back to a character). No long empty establishing shots (they lose viewers).
- **No slow straight-line camera moves, and no parking.** Fast eased move (0.3–0.6 s) into each new composition, then a slow drift with a little roll.
- **Change composition every ≤ 2.2 s, via camera moves rather than cuts**: moving dissolves (6–10 f, both shots moving the same way), pull-back reveals
  from a macro detail, tilt-up reveals, follow-the-object, orbits, foreground wipes, push-throughs (doors, windows, *into* objects),
  look-through iris (mirror, porthole), speed whips with motion blur. Hard cuts ≤ 2 per video, on a word onset.
- Alternate scale: macro → wide → face. Never two medium shots in a row.
- Avoid over-zoomed frames. A face fills at most ~60% of the frame width. **Never a hat-only frame**: aim the camera's look at the face (standing face ≈ y 1.55–1.6 m, seated ≈ 1.35–1.4 m).
- **9:16 framing math:** horizontal half-width visible = `d · tan(hfov/2)`, hfov = `2·atan(tan(vfov/2)·0.5625)`. At 2–4 m that's only ±0.4–0.9 m.
  Keep two-shots within ~±0.5–0.7 m of the look point or someone falls out of frame.
- **Before every render: render one still from the middle of EVERY shot** and check the whole contact sheet (tools/sheet.py). A shot skipped in checking is how the hat-only shot shipped.

## 4a. Faces and color (measured, docs/07 S2)
- **Faces/heads stay pure white in every scene.** Render cards unlit with a fixed soft shade. Scene lights, tints and grades never touch the characters.
- 4+ distinct hue families per frame (complementary accents in costumes and props). Bright overall (≈0.64), neutral warmth, never a one-color grade.
- White flashes: 0–1 per video, only for literal light sources.
- 3–6 in-world signs/labels per video that carry a joke or a fact ("CAREER DEVELOPMENT ROOM", a box labelled "LAW").
- Extras: 3+ characters on screen in ~25% of frames.

## 4. World / sets

- 2D character cards in dense, ornate **inked 3D sets** (black outlines on the world too), painted textures (velvet, bricks, wallpaper, boards).
- Lighting presets per mood: golden key + violet shadows for drama, moon-blue for explanation, warm stage, cold cell, fire orange.
- One cutaway / X-ray / mechanism shot per video.
- Props that might read as "the character is inside it" (glass tanks etc.) only appear in the shots that need them.

## 5. Post

- **Face glow: visible but slight.** ffmpeg: `format=gbrp,split[a][b];[b]curves=all='0/0 0.5/0 1/1',gblur=sigma=20[g];[a][g]blend=all_mode=screen:all_opacity=0.4`
  (0.16 is invisible, 0.32 still faint, 0.4 is right).
- Captions: one word at a time, Lilita One, white with a black outline, centred at y=1250 of 1920, 88→100% pop (tools/captions.py).

## 6. Audio

- **Real** music and SFX only (a local folder of downloaded sounds, e.g. Mixkit / Pixabay / Freesound). Never code-synthesized sounds.
- Music bed **~20 dB under the voice** (measured on 19 Ricks videos with the voice separated: median 19.8 dB, range 14–23.5). Light, playful
  ukulele/pizzicato/acoustic/light-jazz bed, never silent, mood shift at the twist.
- SFX **~8 hits per 10 s**, peaking ~12 dB under the voice: whooshes on camera moves, chimes/glock/kalimba on reveals, cartoon foley locked to
  on-screen actions (squeaks, bloops, drops, scrapes, thuds, register dings). About 1 in 3 scene changes gets a hit, not every one.
- Final master about **-14 LUFS**, true peak -2 dBTP.
- The voice is never clipped. See docs/04_PIPELINE.md, "Voice".
