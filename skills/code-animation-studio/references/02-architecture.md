# 02 · Architecture & implementation

Everything here describes code that exists in `studio/`. Signatures are copied from the source,
not invented. If a signature here disagrees with the file, **the file wins** — re-read it.

---

## 1. The rendering stack

### Why headless WebGL works (and why it once didn't)

Round 2 concluded WebGL was impossible (`EGL_NOT_INITIALIZED` across 7 flag sets). Round 9
overturned it. The missing pieces were:

1. **Chromium from the npm tarball.** `@sparticuz/chromium` ships the browser binary *inside the
   package*, so it installs from `registry.npmjs.org` — no CDN, no Playwright download host.
2. **The bundled AL2023 shared libraries.** The package carries `bin/al2023.tar.br` (nspr/nss).
   It auto-extracts only when it detects Amazon Linux 2023. On Debian-like images you must
   brotli-decompress and untar it yourself, then point `LD_LIBRARY_PATH` at it.
3. **The right flags:** `--enable-unsafe-swiftshader` (plus the package's default args, which
   include the ANGLE/SwiftShader selection).

Verified renderer string: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))`.

```bash
bash studio/swangle_setup.sh
# installs /tmp/swangle (chromium + puppeteer-core + three@0.149.0), extracts /tmp/al2023
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/swangle_test.cjs
```

**Pin `three@0.149.0`.** Modern three (r15x+) ships ESM-only builds that cannot be injected with
`page.addScriptTag()` as a classic script. r149 still has `build/three.min.js` (UMD), which
defines `window.THREE`. This is a hard constraint of the injection approach, not a preference.

### The Node ↔ browser split

Node owns orchestration; the browser owns all drawing.

```
Node (.cjs)                              Browser (classic scripts, window globals)
──────────                               ─────────────────────────────────────────
launch chromium (puppeteer-core)   ──►   window.THREE            (UMD r149)
addScriptTag(puppet2d.js)          ──►   window.drawPuppet, PUPPET_INK
addScriptTag(stickworld.js)        ──►   window.StickWorld(THREE)      -> W
addScriptTag(worldkit.js)          ──►   window.WorldKit(THREE, W)     -> K
addScriptTag(actor.js)             ──►   window.ActorKit(THREE, W, K)  -> A
addScriptTag(film_*.js)            ──►   window.PotterFilm { shots, build(i,ctx) }
loop frames:
  page.evaluate(build shot)              build scene graph, camera, actors
  page.evaluate(update+render)           update(localT); renderer.render(sc, cam)
  page.evaluate(composite)               draw WebGL canvas -> 2D #out (+ transition)
  page.screenshot(#out)                  -> /tmp/frames/f0000.png
```

**Module loading gotcha:** `@sparticuz/chromium` is ESM with a strict `exports` map. Requiring it
by absolute path fails. Use a scoped `createRequire`:

```js
const { createRequire } = require('module');
const req = createRequire(`${DIR}/package.json`);   // DIR = /tmp/swangle
const chromium = req('@sparticuz/chromium').default;   // note .default
const puppeteer = req('puppeteer-core');
```

**Renderer settings that matter:**

```js
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(720, 1280);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.outputEncoding = THREE.sRGBEncoding;     // r149 API (newer three uses outputColorSpace)
```

`preserveDrawingBuffer: true` is **required** — without it, drawing the WebGL canvas onto a 2D
canvas (the transition compositor) yields a blank image.

---

## 2. The reference architecture: 2D puppet on a billboard in a 3D world

This is the single most valuable architectural insight in the project.

The reference films are **not** fully-3D characters. They are 2D canvas stick puppets drawn onto
an upright plane that yaws to face the camera, standing inside a real 3D toon world. You get:

- a **full 2D acting vocabulary** (facial moods, IK hands, outfits, sweat, squash/stretch) that
  would be expensive to rig in 3D;
- **real 3D depth, props, lighting, shadows and camera** from the world;
- **low cost** — one canvas redraw per character per frame instead of a skinned mesh.

`StickWorld.billboard({p, h, look})` creates a 512×768 canvas, a `CanvasTexture`, and a plane of
height `h`. Its `update(camera, pose)` redraws the puppet and sets
`group.rotation.y = atan2(camX − pX, camZ − pZ)` (yaw only — the puppet never tips over).
The group sits at `y = p[1] + h*0.483` so the drawn feet land on the floor.

**Consequence:** a billboard character always faces the camera, so "walking left" is conveyed by
leg animation + world-position change + `flip`, not by turning a 3D body. Plan staging accordingly.

---

## 3. Module API index (verified signatures)

### Production path

**`studio/src/puppet2d.js`** — browser classic script.
```js
window.drawPuppet(ctx, W, H, look, pose)   // W=512, H=768 canonical
window.PUPPET_INK = '#0b0d1a'
```
`look`: `{ skin, body, outfit:'suit'|'blazer'|'leather'|'hoodie'|'shirt', shirt, tie, hair:'short'|'swept'|'bob'|'grey'|'none', hairColor, glasses, badge, hat, shoe }`
`pose`: `{ t, mood, arms, armK, armR:[x,y], armL:[x,y], armRK, armLK, walk, speed, nerv, sweat, squash, tilt, hunch, air, lookX, flip }`
→ full semantics in [03-characters.md](03-characters.md). **`pose.t` is required.**

**`studio/src/stickworld.js`** — `window.StickWorld(THREE)` returns `W`:
```js
W.box({p,s,color,rot,ink})      // -> THREE.Group  (toon mesh + BackSide ink shell)
W.ball({p,r,color,s,ink})       // -> Group
W.cyl({p,rt,rb,h,color,rot,ink})// -> Group
W.cone({p,r,h,color,seg,rot,ink})// -> Group
W.patternTex(kind,a,b,rep)      // kind: brick|wood|plank|tile|marble|carpet|grass
W.surface({p,s,rot,kind,a,b,unit})
W.shadow({p,r,o})               // soft radial contact shadow plane
W.billboard({p,h,look})         // -> {group, update(camera,pose)}
W.cineCam({aspect,keys})        // -> {cam, at(t,{handheld,shake})}   smoothstep keyframes
W.INK, W.ramp, W.toonMat
```
⚠️ **All primitive factories return a `Group`.** The toon mesh is `children[0]`; the ink shell is
`children[1]`. To recolour: `g.children[0].material.color.setHex(...)`.

**`studio/src/worldkit.js`** — `window.WorldKit(THREE, W)` returns `K` (extends, never replaces):
```js
// props
K.hut({p,s,wall,roof,rotY})            K.building({p,s,color,face,seed,lit,trim})
K.tree({p,s,kind:'round'|'pine'|'palm'})
K.marketStall({p,rotY,awning,goods:'pottery'|'fruit'|'cloth'})
K.pot({p,s,color,kind:'round'|'vase'|'bowl'})
K.wheel({p})          // -> {group, disc, clay, setSpin(a), setClay(h)}
K.kiln({p,s})         // -> {group, mouth, fireGlow, setFire(t,intensity)}
K.masterpiece({p,s})  // ornate LatheGeometry vase, zellige canvas texture + handles
K.crate  K.barrel  K.sack  K.lantern  K.fence  K.well  K.cart  K.bench
K.streetLamp  K.banner  K.shelf  K.cloud  K.mountain
K.groundDetail({area:[x0,x1,z0,z1], n, seed})   // stones/tufts/flowers/shards scatter
K.canvasPlane({p,s,rot,px,draw,frame,transparent})
K.glow({p,r,color,o})                 // additive THREE.Sprite
// atmosphere + light
K.skyDome({top,mid,bottom,r})
K.stars({n,r})                        // -> {group, update(t)}
K.dustMotes({bounds,n,color})         // -> {group, update(t)}
K.dayLight(sc)  K.nightLight(sc)/*->{moon,warm}*/  K.warmInterior(sc)
// camera
K.catmullCam({aspect,keys})           // -> {cam, at(t,{handheld,impacts,fovKick})}
K.camAt(t,keys)   K.hand(h,tgt,sq,flip,dz)
```

**`studio/src/actor.js`** — `window.ActorKit(THREE, W, K)` returns `A`:
```js
A.Actor({p,h,look})   // -> {group, shadow, h, look, pos, setPos(x,z), update(camera,frameT,pose)}
A.path(t, keys, {stride})  // keys=[{t,x,z}] -> {x,z,walk,speed,moving,flip}
A.idle(t, base)            // weight-shift + breath + glance, merged over base pose
A.G.<recipe>(t)            // 12 gesture recipes -> pose fragment
```
`A.G`: `workWheel, shapeClay, throwPot, fireKiln, reveal, celebrate, mock, greedy, resolve, carry, gasp, applaud`.
**`Actor.update` injects `t` into the pose** — this is what prevents the `pose.t` crash.

**`studio/src/film_potter.js`** — the worked example.
```js
window.PotterFilm = { shots, TOTAL, LEAD, build(i, ctx) }
// ctx = {THREE, W, K, A};  build -> { sc, cam, update(localT) }
// shots[i] = { name, start, dur, trans:{type:'fadein'|'dissolve'|'cut'|'dip'|'bloom', dur} }
```
**Copy this file's structure for a new film.** One `if (name === '...')` block per shot, each
building its own scene, camera keys and acting timeline, returning a closure `update(localT)`.

**`studio/experiments/r11_render.cjs`** — the driver. Env vars:
`SWANGLE_DIR` (default `/tmp/swangle`), `OUTDIR` (default `/tmp/r11frames`),
`SMOKE=1` (2 frames/shot, crash-check), `MID=1` (1 frame at 60 % of each shot, composition-check).

### Audio path

**`studio/src/audiopipe.mjs`**
```js
FFMPEG, FFPROBE                       // npm-bundled binaries, repo-relative
DEFAULT_LANG = 'en'
probeDuration(file)
processVoice(in, out, {speed, targetLUFS=-14, targetTP=-1, lra=11, padToSec})
estimateWordTiming(text, durationSec, {leadIn, tail})      // fallback only
wordsToASS(words, {playResX, playResY, font, size, primary, stroke, accent, keywords, marginV, outline})
burnCaptions(video, ass, out, {crf})
whisperWords(audio, {lang, cli, model, threads, dtw})
alignScriptToWords(scriptText, asrWords)                   // Needleman-Wunsch
alignWords(audio, script, opts)                            // en -> pocketsphinx, else whisper+DP
alignWordsEnglish(audio, script, {alignPy})
narrationBundle(script, voiceFile, {outAudio, lang, speed, targetLUFS, padToSec, captionOpts})
   // -> { audio, duration, words, ass }
```

**`studio/src/score_world.mjs`**
```js
SR = 48000
synthesizeWorldScore({duration, sections:[{t0,t1,mood}], seed})  // -> Float32Array
// mood: dawn | tense | build | night | swell | wonder | joy
```

**`studio/src/sfxkit.mjs`**
```js
SR = 48000
readWavMono(file) -> {sr, data}
resample(data, from, to)
writeWav(file, samples, sr)
SFX = { birds, wind, wheelHum, claySquish, shatter, fireCrackle, doorCreak,
        gasp, applause, chime, whoosh, crickets }        // each (dur) -> Float32Array
buildSfxTrack(events:[{t,kind,gain,dur}], duration) -> Float32Array
mixNarration({voiceFile, music, sfx, duration, musicGain=0.3, sfxGain=0.55, leadIn=0})
```

**`studio/src/score.mjs`** (Round 7, Japanese palette — kept for anime/battle subjects)
```js
synthesizeScore({duration, sections:[{t0,t1,mood}], seed})  // calm|pulse|action|mystery|twist|resolve
battleSfx(kind, {gain})   // slash water growl roar sting crack rumble inhale steps ting wind
mixInto(dest, src, atSample, gain)   writeWav(file, samples, sr)
```

### Legacy paths (preserved, working — pick per subject)

| Module | Key exports | Use for |
|---|---|---|
| `cartoon.mjs` | `createCharacter`, `FACES`, `MOUTHS`, `ik2`, `walkCycle`, `walkPose`, `beanPath`, `paint` | flat 2D vector explainer characters |
| `stickman.mjs` | `createStickman`, `headBlob`, `outfitPath`, `EXPR`, `OUTFITS`, `drawKatana`, `blinkAt` | MASTER-PROMPT marker-style stickman |
| `lowpoly.mjs` | `makeCamera`, `createScene`, `box`, `cone`, `makeTerrain`, `renderScene`, `stageAt`, `screenToPlane`, `lowPolyPost` | PS1/low-poly 3D, **no browser needed** |
| `raster3d.mjs` | `createRenderer`, `createMesh`, `sphere`, `tube`, `loft`, `rbox`, `createShadowMap`, `geometryPass`, `shadePass`, `attachShadow` | higher-fidelity software 3D, G-buffer + PCF shadows |
| `character3d.mjs` | procedural mesh, 26-bone rig, FK/IK, IPA visemes | bone-rigged 3D characters, phoneme lip-sync |
| `animation.mjs` | `ease`, `smoothNoise`, `GAIT`, `poseGait`, `poseJump`, `poseImpact`, `poseIdle`, `cameraShake`, `cameraMove`, `blinkAt` | locomotion/performance for the bone rig |
| `cinema.mjs` | `depthOfField`, `motionBlurStack`, `bloom`, `grain`, `chromaticAberration`, `fitFov`, `letterbox`, `speedLines`, `impactFlash`, `gradeFrame` | lens/post stack on software renders |
| `kinetic.mjs` | `interpolate`, `spring`, `pulse`, `entrance`, `exit`, `glassCard`, `karaokeCaption`, `animatedCounter`, `rayBackdrop` | motion-graphics explainers, counters, perpetual backdrop |
| `vfx.mjs` | `drawLightShafts`, `drawHaze`, `motionBlur`, `ditherQuantise`, `pixelUpscale`, `createCloth`, `synthAmbience`, `applyLook` | atmosphere + PS1 look |
| `waterfx.mjs` | `waterRibbon`, `waterDragon`, `waterWheel`, `splash`, `breathVapor`, `aura`, `embers`, `snow` | anime-style elemental VFX |
| `audio.mjs` | `conditionVoice`, `synthesizeSpeech`, `buildVoiceTrack`, `synthesizeMusic`, `synthesizeSfx`, `buildAudio`, `readWav`/`writeWav` | the Round-1 explainer audio bed |

---

## 4. Scene construction pattern

```js
const sc = new THREE.Scene();
sc.fog = new THREE.Fog(0xdfeaf5, 26, 70);          // depth cue; match to sky colour
sc.add(K.skyDome({ top:'#8ec8ee', mid:'#cfe4f5', bottom:'#f6e6c4' }));
K.dayLight(sc);                                     // hemisphere + shadow-casting key
sc.add(W.surface({ p:[0,0,0], s:[90,90], kind:'grass', a:'#c9a86a', b:'#b8965a', unit:3 }));
// ...props, then actors:
const sami = A.Actor({ p:[0,0,0], h:2.5, look:{...} });
sc.add(sami.group); sc.add(sami.shadow);            // shadow is a SEPARATE object — add both
const { cam, at } = K.catmullCam({ keys:[...] });
return { sc, cam, update(t) { at(t,{handheld:0.004}); sami.update(cam, t*30, pose); } };
```

Notes that cost time to learn:
- **Add `actor.shadow` to the scene separately.** It is not a child of `actor.group`.
- `Actor.update`'s second argument is a **frame index** (`t*30`), not seconds — the puppet's
  breath/blink cycles are tuned in frame units.
- Fog colour should match the sky's mid tone or the horizon shows a hard seam.
- Keep shadow-casting lights to one per scene; multiple shadow maps multiply frame cost.

---

## 5. Performance budget (measured, 2 CPU cores)

| Path | Resolution | Cost |
|---|---|---|
| Toon world, sparse (Round 10) | 720×1280 | ~263 ms/frame |
| Toon world, rich + shadows (Round 11) | 720×1280 | **~519 ms/frame** (1080 frames = 561 s) |
| Software low-poly + upscale | 360×640 → 3× | 36.7 ms/frame |
| Software low-poly native | 1080×1920 | 172 ms/frame |
| Software raster3d, ss2 | 540×960 | 337–402 ms/frame |
| canvas2d cartoon | 1080×1920 | 171–178 ms/frame |
| HTML/CSS/GSAP browser cell | 1080×1920 | ~68 ms/frame |

**Budget rule:** at 30 fps, 1 second of film = 30 frames. A 60 s rich-scene film ≈ 1800 frames
≈ 15 min per render pass. Plan iteration accordingly: smoke-test → mid-shot check → full render,
and re-render only affected shots when fixing.

**Levers, in order of impact:** resolution ladder (render small, upscale) → JPEG q92 intermediates
instead of PNG (**5.3× faster**) → fewer shadow-casting lights → fewer props → 30 fps not 60.
