# 10 · Troubleshooting & lessons — every significant failure, its cause and its fix

**This is the most valuable file in the skill.** Every entry below was actually encountered,
diagnosed and fixed (or explicitly recorded as blocked). Nothing here is a hypothetical.
Entries marked **[BLOCKED]** are dead ends — do not retry them without a changed environment.

Format: **Symptom → Cause → Diagnosis → Fix → Prevention.**

---

## A · Environment & toolchain

### A1 · WebGL "impossible" — the conclusion that was wrong for seven rounds
**Symptom:** every headless WebGL attempt failed with `EGL_NOT_INITIALIZED`. Seven flag sets and
three Vulkan ICDs were tried in Round 2; the environment doc declared WebGL unavailable.
**Cause:** the missing piece was not a flag — it was the **nspr/nss shared libraries** that
`@sparticuz/chromium` bundles as `bin/al2023.tar.br` and auto-extracts **only on Amazon Linux 2023**.
On a Debian-like image they are never extracted, so Chromium's GPU process cannot initialise.
**Diagnosis (Round 9):** read the package's own extraction logic instead of trying more flags.
**Fix:** brotli-decompress + untar `bin/al2023.tar.br` to `/tmp/al2023`, then
`LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp` and launch with `--enable-unsafe-swiftshader`.
Verified: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))`, WebGL2 context, three.js renders.
**Prevention:** when a browser package ships platform-specific binaries, read its extraction
conditions. `bash studio/swangle_setup.sh` reproduces the whole recipe.
**Note:** the ledger keeps the old `webgl-swiftshader` record as `rejected` (its original reason)
and adds `swangle-headless-webgl` as `tested`. `research/ENVIRONMENT.md` still carries the stale
claim — **the newer record wins**.

### A2 · `Cannot find module '@sparticuz/chromium'` despite it being installed
**Cause:** the package is ESM with a strict `exports` map; `require()` by absolute path fails.
**Fix:** scoped require + `.default`:
```js
const req = require('module').createRequire(`${DIR}/package.json`);
const chromium = req('@sparticuz/chromium').default;
```
**Prevention:** always `createRequire` from the *installing* directory's package.json, not the repo's.

### A3 · `THREE is not defined` after injecting three.js
**Cause:** three r15x+ ships **ESM-only**; `page.addScriptTag()` injects a classic script.
**Fix:** pin **`three@0.149.0`**, which still has `build/three.min.js` (UMD → `window.THREE`).
**Prevention:** for classic-script injection, always check the package still ships a UMD build.

### A4 · Transition compositor produces a blank/black image
**Cause:** the WebGL drawing buffer is cleared after present, so `drawImage(glCanvas,…)` reads empty.
**Fix:** `new THREE.WebGLRenderer({ preserveDrawingBuffer: true })`.
**Prevention:** any time you composite a WebGL canvas onto a 2D canvas, this flag is mandatory.

### A5 · `ffmpeg: command not found` / `xfade` filter missing
**Cause:** no system ffmpeg. The npm-bundled binary is a **4.1-era static build without `xfade`**.
**Fix:** call by path from the repo root:
`studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg` (and the `@ffprobe-installer` twin).
Composite transitions **in-render** on a 2D canvas instead.
Available: `fade`, `afade`, `acrossfade`, `blend`, `tblend`, `overlay`.
**Prevention:** run `ffmpeg -filters | grep xfade` before designing a transition strategy.

### A6 · `amix` makes everything quieter
**Cause:** ffmpeg 4.1's `amix` **averages** inputs; adding a track attenuates all of them.
**Fix:** mix in JS sample-by-sample with an explicit ducking envelope (`sfxkit.mixNarration`).
**Prevention:** never use `amix` for voice+music+SFX on this build.

### A7 · `/tmp` stacks vanished after a sandbox reset
**Cause:** `/tmp` is not persisted; only the repo workspace is.
**Fix:** re-run `studio/{swangle,voice,whisper}_setup.sh` (all idempotent).
**Prevention:** treat every `/tmp` path as rebuildable; never commit an assumption that it exists.

### A8 · [BLOCKED] Model/weight downloads
- **HuggingFace** (`huggingface.co`, `cdn-lfs`): blocked. Kills kokoro-js (~327 MB), XTTS v2,
  `KandirResearch/DarijaTTS-v0.1-500M`.
- **GitHub release assets**: blocked. **Repo files are allowed** — this is the workaround.
- **`speech.platform.bing.com:443`** (edge-tts): connection refused, 0.0 s. Tested, rejected.
- **apt**: unavailable.
**Workaround that worked:** whisper's 487 MB `ggml-small.bin` was fetched as **six committed file
parts (aa–af)** from `fmyIo/whisper-models` via `api.github.com`, concatenated, SHA-256 verified.
Piper's amy weights came from a GitHub repo via `gh api`.
**Prevention:** before adopting any library, find out **where its weights download from at runtime**
and test that host. Installing successfully proves nothing.

---

## B · The three.js / puppet engine (Round 10–11)

### B1 · `createRadialGradient: The provided double value is non-finite`
**Symptom:** crash on the very first frame of a new film.
**Cause:** `drawPuppet` reads **`pose.t`** for breath/blink/tremble. A pose built without `t` makes
every derived coordinate `NaN`.
**Fix:** always route poses through `ActorKit.Actor.update(camera, frameT, pose)`, which does
`Object.assign({ t: frameT }, pose)`. If you call `billboard.update` directly, inject `t` yourself.
**Prevention:** `t` is a required field, not an optional one. Note it is in **frame units** (`t*30`),
not seconds.

### B2 · `K.box is not a function`
**Cause:** the primitive factories live on **`StickWorld` (`W`)**, not `WorldKit` (`K`).
`WorldKit` *extends* the world with props; it does not re-export primitives.
**Fix:** `W.box`, `W.ball`, `W.cyl`, `W.cone`, `W.surface`, `W.shadow`, `W.billboard`.
**Prevention:** memorise the split — **W = primitives, K = props/atmosphere/camera, A = acting**.

### B3 · `Cannot read properties of undefined (reading 'color')` when recolouring a prop
**Cause:** `W.box`/`W.ball`/etc. return a **`THREE.Group`** (toon mesh + BackSide ink shell), not a
`Mesh`. `group.material` is `undefined`.
**Fix:** `group.children[0].material.color.setHex(0x…)`. The ink shell is `children[1]`.
**Prevention:** any helper that returns a Group needs child access for material edits. This bit the
kiln recolor specifically.

### B4 · Characters are outside the frame (portrait framing)
**Symptom:** a two-shot renders with one or both actors missing or half-cropped.
**Cause:** `PerspectiveCamera.fov` is **vertical**. At 720×1280 (aspect 0.5625), a 42° vertical fov
is only ~24.5° horizontal. At z = 8 that is a visible half-width of ±1.74 — actors at x = ±2 are
simply outside.
**Diagnosis:** compute `z·tan(hFov/2)` and compare to each actor's x. Do this *before* rendering.
**Fix (verified recipes):** two-shot → fov 53–58 at z ≈ 9–10, actors x ≈ ±2; three-shot → fov 43–47
at z ≈ 6–7, actors x ≈ ±1.2.
**Prevention:** **never move the camera closer to "fix" cropping** — it makes it worse. Widen fov,
pull back, or move actors inward. This is the single most repeated framing mistake in the project
(Round 4 #9, Round 5 #3, Round 11 shots 1/2/7).

### B5 · Empty foregrounds — the scene reads as a stage set
**Symptom:** mid-shot frames show a character, a wall, and nothing else.
**Cause:** props were placed only in the mid-ground; no ground detail, no foreground layer.
**Fix:** add `K.groundDetail({area,n,seed})` (stones/tufts/flowers/shards) plus a foreground prop
(crate, bench, fence) near the frame edge. Target **15–20 props** per scene.
**Prevention:** the three-depth-layer rule — foreground occluder → subject → background silhouette.

### B6 · The hero reveal is blown out to flat white
**Symptom:** the ornate vase loses all texture and reads as a white blob.
**Cause:** **additive glow opacity > 0.4** saturates toon materials; combined with a strong warm key
it clips every channel.
**Fix:** glow opacity **≤ 0.32**, warm key intensity **≤ 1.4** for hero reveals.
**Prevention:** additive blending stacks — check exposure on a viewed mid-shot frame, not in code.

### B7 · Actor's contact shadow is missing
**Cause:** `Actor.shadow` is a **separate object**, not a child of `Actor.group`.
**Fix:** `sc.add(actor.group); sc.add(actor.shadow);` — both.
**Prevention:** `setPos` moves both; adding only the group leaves the shadow at the origin.

### B8 · Character marching in place / foot sliding
**Cause:** walk phase driven by time while position moves at a variable rate.
**Fix:** `A.path()` computes `walk = accumulatedDistance / stride * 2π` and derives `speed` from
instantaneous velocity. Use its outputs; don't hand-roll `walk = t*5`.
**Prevention:** below `speed 0.06`, switch to `A.idle(t)` so the character breathes instead.

---

## C · Motion, freezes and compression

### C1 · Freeze at the start of every wide shot (cost three render passes)
**Symptom:** `freezedetect` flags 2.33–2.77 s, then 9.47 s after the first fix.
**Cause (layer 1):** a pure ease-in-out camera move has **zero initial velocity** — the first frames
are pixel-identical.
**Fix 1:** blend a linear creep `0.28k + 0.72·ease(k)`; add always-on micro-handheld.
**Cause (layer 2):** a distant small subject + slow move produces motion so small that **CRF 17
compresses it away** — flat sky and snow become literally identical frames.
**Fix 2:** linear zoom creep from frame 0 (`fov·(1−0.06k)`), stronger handheld, closer camera,
earlier action, and **grain 0.05 → 0.07** so flat regions survive encoding.
**Result:** 0 black, 0 freezes.
**Prevention:** `handheld` is never 0. Every shot needs at least one of: camera drift, character
idle, animated atmosphere. **The defect can live in the encoder, not the renderer.**

### C2 · A "static" shot that is actually fine, flagged as a freeze
**Cause:** `freezedetect` threshold too aggressive for a deliberately quiet moment.
**Fix:** keep `n=0.003:d=0.4` and add atmosphere (`dustMotes`, `stars`, lantern flicker) rather than
loosening the gate. The reference V2 had zero freezes *because its backdrop always moved*.

### C3 · PNG encoding dominates frame time
**Measured:** 805 ms/frame with PNG intermediates → **159 ms/frame with JPEG q92** (5.3× faster).
**Fix:** write JPEG intermediates when you will re-encode to H.264 anyway.
**Note:** the Round-11 driver uses PNG at 519 ms/frame for maximum fidelity; if you need speed,
switch to JPEG q92 and accept the tiny generational loss.

### C4 · Smoke sheet looks black/faded — "is my render broken?"
**Cause:** `SMOKE=1` samples frames 0–1 of each shot, which are **inside the transition**.
**Fix:** this is expected. Judge composition with **`MID=1`** (one frame at 60 % of each shot).
**Prevention:** never diagnose composition from a smoke sheet.

---

## D · Software rasteriser (Rounds 4–6, legacy path)

### D1 · Whole frame black
**Cause:** double-sided terrain fell through `shadeFace` returning **0..1** albedo where 0..255 was
expected. **Fix:** return albedo×255 when there is no normal.

### D2 · Fog turned everything blue-grey
**Cause:** fog colour in 0..1 mixed against 0..255 channels. **Fix:** mix at one scale.

### D3 · Ground painted over everything (three attempts to fix)
1. Painter's algorithm sorted a plane touching the camera *nearer* than distant objects → `sortKey:'far'`.
2. **That fix was inverted** — sorted descending, so "min" put the ground last → sort on the
   *farthest* corner.
3. Still broken: **painter's algorithm cannot interleave a ground plane with objects at all** →
   **terrain pre-pass**: paint the whole ground layer, then solids.
**Prevention:** ground is a separate pass, always. This is architectural, not a sorting tweak.

### D4 · Holes in the ground in front of the camera
**Cause:** faces with any vertex behind the lens were dropped entirely.
**Fix:** near-plane **clipping** in camera space.

### D5 · God rays 8× too strong
**Cause:** gradient offsets are measured **along the gradient axis**, not absolutely; a narrow wedge
only sampled offset 0. **Fix:** project the offset onto the axis.

### D6 · Hero frame empty
**Cause:** the driver rendered frame 22 of an 8-frame run; the camera formula extrapolated 11 units
backwards. **Fix:** clamp `k` to 0..1. **Prevention:** clamp every interpolation parameter.

### D7 · Everything at the wrong screen position
**Cause:** a 56° **vertical** lens is 33° horizontal, so hand-placed world coordinates never land
where intended. **Fix:** depth-first staging (`stageAt`) — decide screen position and depth first,
derive world coordinates from measured px/unit.

### D8 · Shadow map darkening fully-lit surfaces ("dirty" torso)
**Cause:** caster vertices displaced **30 mm** toward the light (`bias*12`), so stored depth was
~24 mm nearer than the receiver — larger than the receiver's own bias. An 80 %-lit chest compared
as fully occluded.
**Diagnosis:** a probe printed `chest: ndl=0.80 lz=1.884 stored=1.864 dz=+0.020 vis=0` before,
`stored=1.899 dz=-0.015 vis=1` after.
**Fix:** one shadow texel of caster offset instead of twelve; retune receiver offset/compare band to
`texelWorld*(1.1+2.2*slope)` / `texelWorld*(2.2+3.0*slope)`; widen PCF 5 → 9 taps.

### D9 · Multi-object scenes render black / wrong material
**Cause:** the palette remap rewrote `mesh.mat` **in place**. Rendering twice — or two objects
sharing a material array — remapped already-mapped indices out of palette range. Also the albedo
lookup used the object-local table while the index was in shared palette space → `undefined` → 0.
**Fix:** preserve originals in `mesh.remapFrom` and always remap from those; expand each object's
packed albedo into shared palette order.
**Why it mattered:** it silently capped the engine at **one object per frame**.

### D10 · Fractional supersampling corrupts the frame
**Cause:** `ss: 1.6` — the resolve assumes an `ss×ss` block per output pixel; at 1.6 the buffer size
and block grid disagree and the resolve walks off each row. Black image with woven moiré, 13.2 s/frame.
**Fix:** round `ss` to an integer **inside `createRenderer`**, making the class of bug impossible.

### D11 · Facing test inverted
**Cause:** `if (!mtlDoubleT && !(vnz > 0)) continue;` culled **front** faces. Invisible on convex
solids, which is why it survived; it showed only on flat iris discs, which vanished.
**Fix:** `if (!mtlDoubleT && vnz >= 0) continue;`
**Related:** an out-of-range material index wrote depth but left stale colour (transparent hole);
the G-buffer normalised normals in x/y only, silently zeroing `nz` and banding curved surfaces.

---

## E · Character & animation defects (Rounds 5–7)

### E1 · 54 black frames in a "valid" MP4
**Cause:** a local `const big` shadowed the canvas parameter, so frames were drawn to a canvas that
was never encoded. The MP4 was **6,354 bytes** with a perfectly valid `ffprobe` report.
**Fix:** draw into the `frame` argument.
**Prevention:** **check byte size AND extract a frame.** `ffprobe` validates the container, not the
content. This is the origin of QA gate G1.

### E2 · Chromatic aberration turned the picture magenta
**Cause:** multiplied copies by pure red/blue and added with `'lighter'`, doubling R and B against
the untouched frame. **Fix:** rewrite as three isolated channel layers.

### E3 · Feet cropped in three consecutive framings
**Cause:** hand-tuning `eye`/`fov` does not converge — narrowing the lens crops the feet.
**Fix:** `fitFov()` binary search (22 iterations) for the smallest fov keeping all world points
inside a margin-safe rect, **plus an explicit distance rule** (fitFov alone collapsed the scene
into a close-up). See B4 for the three.js equivalent.

### E4 · Contact shadow floating a metre from the character
**Cause:** `skeleton.pos()` returns **rig-local** coordinates; the root bone carries the world
offset. **Fix:** add the root bone's world offset before projecting.

### E5 · Contact shadow buried by the ground
**Cause:** drawn before `renderScene`, so the ground pass painted over it.
**Fix:** a `groundPass` callback that fires after terrain and before solids.

### E6 · Nobody was lit (cardboard look at night)
**Cause:** a flat-shaded figure with only key + hemispheric fill has nothing brighter on its
silhouette than the background.
**Fix:** a **Fresnel rim term** in `shadeFace` (cool moon-side, power 1.9, intensity 1.75), plus pale
stone cornice/plinth/pilaster bands and window mullions so the wall differs in value from the sky.

### E7 · Subtitle covered the character's feet
**Cause:** subtitle at 79.5 % height. **Fix:** move to 90.5 % (legacy path) / the 65–70 % band with
`marginV:400` on the portrait puppet path. **Prevention:** QA gate G6 — view a burned frame.

### E8 · Brows poked through the hair as "gum drops"
**Fix:** lower the hairline caps, move brows to `y0 = 0.232`.

### E9 · Stickman drawn a full height below ground
**Cause:** unit space has y=1 at the feet but the origin wasn't offset.
**Fix:** `translate(0,-1)` after the scale. Found in the first contact sheet.

### E10 · Mouth got *more* closed as `open` increased
**Cause:** the lip shape used fixed control points and the opening was a second, thinner curve
drawn *inside* it. **Fix:** both outlines derive from one curve that sags by the opening.

### E11 · Hands: four defects in sequence
Palm didn't reach the knuckles (fingers floated 20 mm below); fingers too long for a 90 mm hand
(five-pronged stick); knuckle pad drew a hard shelf; straight fingers read as a fork.
**Fix:** palm + knuckle pad + curved fingers, each verified by an isolated render.

### E12 · `plan7.lineOffsets` returned the post-increment offset
**Cause:** shifted every line's word span and crashed the planner.
**Fix:** return the captured offset. **Prevention:** when a function both mutates and returns a
cursor, return the value *before* mutation.

### E13 · 3D night wide shot was an empty frame
**Fix:** tighten the camera 7.5 → 5.0 units and raise night key/rim/exposure.

### E14 · Boulder shot was a gray wall
**Cause:** camera too close, no visible split. **Fix:** pull back; rebuild the boulder as two halves
that separate and tilt as the cut lands, plus a falling cap stone.
**Lesson:** an action must be *readable*, not merely present in the scene graph.

---

## F · Audio & sync

### F1 · whisper.cpp word timestamps are wrong / all piled at the end
Three independent causes, each cost real debugging:
1. **Flash attention silently disables DTW.** → pass **`-nfa`**.
2. **`-ml 1` offsets collapse on short clips.** → use normal segments + **`-ojf`**, group tokens
   into words yourself, read **`t_dtw`** (centiseconds, ÷100), **not** `offsets`.
3. **DTW has a systematic ~0.2–0.3 s onset lag.** Acceptable for karaoke; bound it by generating TTS
   per sentence and aligning within each sentence.

### F2 · pocketsphinx outputs fluent English nonsense on Darija audio
**Cause:** pocketsphinx is **English-only**.
**Fix:** route by language — `alignWords` sends `en` to pocketsphinx and everything else to
whisper DTW + DP. **Prevention:** never assume an aligner is multilingual.

### F3 · ASR mistakes corrupting caption text
**Fix:** `alignScriptToWords` (Needleman-Wunsch, Arabic-normalised similarity) keeps the **exact
script words** as caption text and takes only **timing** from ASR, interpolating across misheard
words. **Prevention:** you always know the script — never caption the ASR output directly.

### F4 · Captions desynchronised by a constant offset
**Cause:** the mix adds `leadIn` silence before the voice, but word times were not shifted.
**Fix:** `words.map(w => ({...w, t: w.t + LEAD}))` before generating the final ASS.
**Prevention:** `LEAD` is exported from the film module so render and audio cannot disagree.

### F5 · Caption burn fails or renders nothing
**Cause:** the `subtitles=` filter chokes on paths with special characters.
**Fix:** copy the ASS to a simple path (`/tmp/caps.ass`) first — `r11_finish.sh` does this.

### F6 · Music/SFX drowning the narration
**Fix:** amplitude-envelope ducking (`1 − 0.45*duck`), music gain 0.32, SFX gain 0.55, ambience
0.12–0.32, punctual effects 0.28–0.5, soft limiter at 0.98, final `loudnorm=I=-14:TP=-1:LRA=11`.
**Measured result:** −14.7 LUFS, TP −3.98, LRA 3.60.

### F7 · Reference engine's SRT doesn't match its burned captions
**Cause:** `references/zach-d-films-engine/render.mjs` burns `captionCues` (L93–97) but `exportSRT`
(L283–330) is **phrase-level**. **Prevention:** if you reuse that engine, regenerate the SRT from
the same word array. Our `audiopipe` path does not have this defect.

---

## G · Process, Git and project management

### G1 · Declaring previous work "lost"
**What happened:** the incoming agent was told Rounds 1–6 were gone. The local checkout had one
commit; `git ls-remote origin` revealed a second remote branch with 13 commits.
**Fix:** `git merge --ff-only 2db228b` — nothing rewritten, deleted or recreated.
**Prevention:** **always `git ls-remote origin` before concluding work is missing.** Reconstruct by
fast-forward, never by rebuilding from a summary.

### G2 · Staging someone else's dirty working tree
**Prevention:** `git status --short` first; stage **explicit paths**, never `git add -A`. Verify the
staged diff has **zero deletions** of prior knowledge before committing.

### G3 · Editing a generated file by hand
`research/RESEARCH_LOG.md` is generated by `kb.mjs report`. Hand edits are lost on the next run.
**Prevention:** edit the ledger via the CLI, then regenerate.

### G4 · Claiming a status the evidence doesn't support
**Prevention:** the CLI enforces it — `tested` needs evidence, `integrated` needs evidence **and an
existing artifact**, `rejected` needs a reason. Run `kb.mjs validate` before every commit.

### G5 · Wasted full renders
**What happened:** a 9-minute render would have been wasted on shots with framing and exposure
defects. **Fix:** the `SMOKE=1` → `MID=1` → view → fix → full-render sequence caught all five
Round-11 defects **before** the full pass.
**Prevention:** never start a full render before viewing a mid-shot sheet.

### G6 · Presenting a smoke test as the deliverable
**User correction:** short test clips are proof-of-engine, not the quality ceiling.
**Prevention:** label integration proofs explicitly; keep developing until you have a real
multi-scene film. See [08-methodology.md §7](08-methodology.md).

### G7 · Trusting a stale document over a newer measurement
`research/ENVIRONMENT.md` ("no WebGL") and `INSPECTION_CAPABILITIES.md` ("no Chromium obtainable")
are Round-2 conclusions overturned in Round 9.
**Prevention:** check the ledger's newest record on a topic; when superseding, **add** the new
record and state the supersession — never silently rewrite history.

### G8 · Redoing research that already exists
**Prevention:** `kb.mjs list`, `kb.mjs show <id>`, and `grep -ril topic research/*.md` before any
new search. 64 records already cover the toolchain landscape.

---

## H · Quick symptom index

| Symptom | Entry |
|---|---|
| `non-finite` gradient crash on frame 0 | B1 |
| `K.box is not a function` | B2 |
| `undefined.color` on a prop | B3 |
| Character missing from frame | B4, E3, D7 |
| Scene looks empty / stage-like | B5 |
| Hero object is a white blob | B6 |
| No shadow under character | B7, E4, E5 |
| Foot sliding / marching in place | B8 |
| `freezedetect` at shot start | C1 |
| Smoke sheet all black | C4 |
| Render too slow | C3, [02 §5](02-architecture.md) |
| Whole frame black (software 3D) | D1, D9, D10, E1 |
| Ground covers objects | D3 |
| Holes in ground | D4 |
| "Dirty" blotchy shading | D8 |
| Magenta picture | E2 |
| Mouth opens backwards | E10 |
| Word times all at the end | F1 |
| Nonsense English on Arabic audio | F2 |
| Captions offset by a constant | F4 |
| Captions won't burn | F5 |
| Voice drowned by music | F6, A6 |
| `EGL_NOT_INITIALIZED` | A1 |
| `THREE is not defined` | A3 |
| Blank transition composite | A4 |
| `xfade` unknown filter | A5 |
| Model download fails | A8 |
| Work seems lost | G1 |
