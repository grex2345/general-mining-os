# Video Production Knowledge Base (living reference)

Reusable techniques for animation, storytelling, visual explanation, audio, rendering, editing,
and production — learned from real references and tested where possible. Update this instead of
rediscovering. Companion: `research/ledger.json` (tool records), round reports, `references/`.

**Honesty rules (always):** audio is *measured*, never "heard"; motion is judged from *sampled
frames*, never "watched"; never claim access to something not actually opened; state limits.

---

## 1. Storytelling & scriptwriting
- **Open mid-action, zero warm-up.** Hook in the first line (a number, a conflict, a bizarre fact).
  No "today we're talking about". (Stick3D scriptwriting prompt; kounkan.ma reels.)
- **One tight narrative per video.** The concept explains itself through what happens. Name the
  real phenomenon *inside* the story, never textbook-style.
- **End the moment the concept lands.** No summary, no "so that's why", no CTA in the body.
- **Structure:** hook → myth/question → story/science → payoff. Curiosity beat mid-video (~40–60 s)
  to hold retention. ~800–900 chars ≈ 45–60 s; scale up for longer stories (kounkan 2:50).
- **Niches that fit:** bizarre phenomena, what-if history, scams/hustles, accidental discoveries,
  ancient weapons/war tricks, science/health explainers, fictional stories, mysteries.
- **Adapt style to subject** — not every video is the same visual style (see §2).

## 2. Visual direction (choose the right visual for every idea)
- **Narration drives the picture.** Every sentence needs a *live picture response* (slow camera
  push/pull or a change in existing elements). New elements enter only at **semantic beat
  boundaries** — never mechanical "one element per sentence". One protagonist per beat; it yields
  when done. (video-talkcraft anti-PPT; @Silenthys V2/V3.)
- **Anti-template:** per scene quote the exact words → write 3 genuinely different ideas (each with
  a camera path + character action) → pick the most unexpected that still serves the words → check
  the ledger so neighbours differ in layout/camera/transition/action/colour → build → log.
  Idea prompts: change scale, change viewpoint (keyhole/ceiling/inside a drawer), make the metaphor
  literal (a falling chart = stairs to tumble down), environment-as-joke, time ramps, cause-effect
  chains (domino), contrast cuts. (Stick3D CREATIVE-FREEDOM.)
- **Camera follows voice meaning:** push-in on key facts, pull-back on reveals, follow-cam on
  travel, low angle = power, high angle = weakness. Handheld ≤0.004 units; punch-ins by FOV only;
  positional shake ONLY for a real in-story impact, decaying <0.5 s.
- **Environment richness:** 15–20 purposeful props, textured floor/walls, windows/skyline, light
  shafts/glow/dust, depth layers (foreground/subject/background). Never an empty box room.
- **Colour:** one dominant hue per scene + complementary accent; one accent + one shadow + two font
  weights globally; alternate act backgrounds; forbid ad-hoc per-scene colour. Grade ≈
  saturate(1.32) contrast(1.07).
- **Genre → style map (from the user's references):**
  - Anime/science explainer → 2D vector bust + animated infographics + perpetual backdrop (V2/V3).
  - Health/practical explainer → clean 2D illustrative cartoon + numbered steps + magnifier insets (n1).
  - Story / history / fiction / mystery → 3D toon stick figures in rich worlds, cinematic camera
    (n2 Darija pottery-wheel history, n3 lottery scam, n4 railroad history, n5 Western duel; Stick3D).

## 3. Animation & acting
- **Acting is the product.** Full-body emotion vocabulary: nervous (sliding sweat drops, darting
  pupils, hunch, gulp, tremble ONLY at tense beats), shock (anticipation→jump-back→hands to head),
  working/carrying/eating/drinking/fighting/throwing/falling/fearing/celebrating. Secondary motion
  (tie, badge, hair lag) + breathing always on; never frozen >4 frames.
- **Real physics:** feet on a surface + shadow; walk phase = distance (no foot sliding); jumps =
  parabola with anticipation squash→stretch→landing squash; thrown/dropped objects follow arcs;
  doors are real openings that open AWAY from the walker (walk up→reach handle→open→pass); carried
  objects stay glued to hands (IK); nothing passes through solids; no teleport/morph/pop without cause.
- **Recipes** (build first time, then log): throw (wind-up→release→p=p0+vt+gt²/2→impact), pickup
  (reach→grasp→parent to hand→settle), eat/drink (arc to mouth→chew bob→swallow), fight (stance→
  wind-up→strike+stretch→3-frame hit-stop→knock-back), farm (dig/sow/water/growth spring/harvest),
  day→night (sun/moon arc + sky gradient + light colour + window glow + twinkling stars).
- Our rig: `stickman.mjs` (bean body, stick limbs, big head, idleT breathing), `character3d.mjs`
  (26-bone), `animation.mjs` (ease, smoothNoise, cameraMove, blinkAt, poseIdle/poseGait).

## 4. Motion graphics (the explainer engine)
- **Word-karaoke captions:** 1–2 words (or a 3–5 word sliding window), current word bold + accent,
  keywords coloured, pop-in, y≈69% (lower third), white 900-weight + black stroke. Driven by
  word timestamps. Built: `kinetic.karaokeCaption` (canvas) + `audiopipe.wordsToASS` (burn-in).
- **Animated infographics:** counters ticking with a pulse ring, bar meters, fraction morphs,
  graph draw-on, progress dot-strips. Built: `kinetic.animatedCounter`, `glassCard`.
- **Perpetual backdrop:** rotating rays + drifting particles so even a held beat never freezes
  (V2 had 0 freezes for this reason). Built: `kinetic.rayBackdrop`.
- **Eased beats:** entrance scale-up+fade+rise (outBack/spring), hold, exit shrink+fade.
  Built: `kinetic.entrance/exit/interpolate/spring/pulse` (Remotion interpolate + Manim easing).
- **Pacing:** a new visual idea every ~2–4 s, smooth swaps (no hard cuts), continuous narration.

## 5. Audio production (automated, AI-TTS-first)
**Pipeline (repeatable):** script → AI voice (audition once) → generate speech → FFmpeg process
(speed/loudness/pad) → word timing → karaoke captions → sparse SFX + music duck → mux → QA.
- **Built module `studio/src/audiopipe.mjs` (tested):**
  - `processVoice(in,out,{speed,targetLUFS=-14,targetTP=-1,padToSec})` — atempo + loudnorm + apad.
    Test: 85% speed + pad → exactly 30.000 s, −14.45 LUFS. ✅
  - `estimateWordTiming(text,durationSec)` — length-weighted word timing fallback. **Feed the
    duration of speech generated FROM that exact text** (not a padded/total duration), else words
    stretch. Prefer real alignment when available.
  - `wordsToASS(words,{keywords,...})` — ASS karaoke (pop-in + fade + keyword colour) for ffmpeg
    `subtitles=` burn-in. `burnCaptions(video,ass,out)`.
- **Word alignment — TESTED Round 9 (real audio, ground-truth checked):**
  - **English → pocketsphinx forced alignment is PRECISE.** `audiopipe.alignWordsEnglish` wraps the
    pack's `align.py`. Verified against acoustic energy: pottery@0.17s, "One"@2.60s = silence-end
    2.612s. Use for English narration. Needs `pip install --break-system-packages pocketsphinx`.
  - **Darija/Arabic → whisper.cpp DTW.** `audiopipe.alignWords`/`whisperWords` (whisper-small, `-l ar`).
    pocketsphinx is English-only: on real Darija audio it outputs nonsense English ("but a fitness
    and i'm so happy…") — DO NOT use it for Arabic. whisper-small DOES recognize Darija ("واحد
    يوريهم"، "شنو يدير"، "القبيلة كاملة"، "بحال شي معلم"). DTW word times matched the burned-in
    caption (واحد يوريهم at clip-4.16s = full-video 40.2s, caption frame at 40s).
  - **whisper.cpp gotchas (cost real debugging, do not rediscover):** flash attention is ON by
    default and SILENTLY DISABLES DTW → pass `-nfa`. `-ml 1` segment-split offsets COLLAPSE on short
    clips (all words pile at the end) → use normal segments + `-ojf` (full JSON) and group tokens
    into words yourself; read `t_dtw` (centiseconds, /100 = s), NOT `offsets`. DTW has a systematic
    ~0.2–0.3 s onset lag vs true energy; acceptable for karaoke, bound it by generating TTS
    per-sentence and aligning within each sentence.
  - **Robustness:** `alignScriptToWords` (Needleman-Wunsch, Arabic-normalised similarity) keeps the
    EXACT script words as caption text and takes only TIMING from ASR, interpolating across
    misheard words — so Darija ASR errors never corrupt the captions.
  - **Model egress:** HF/whisper CDNs blocked; ggml-small fetched as 6 committed parts from
    `fmyIo/whisper-models` via api.github.com (each <100 MB). `studio/whisper_setup.sh` reproduces.
  - Numbers/names: spell-as-spoken overrides (`spoken.json`). Groq Whisper + AtlasIA MoulSot = cloud
    Darija ASR alternative (Feedia) if higher accuracy needed.
- **Mix:** voice leads; SFX SPARSE (<8 events/20 s) and QUIET (−14 dB under voice + sidechain
  ducking); never SFX on every word. Final −14 LUFS / −1 dBTP. Our `score.mjs` (procedural music +
  battle SFX) + `audio.mjs` (conditionVoice) + Round 7 finish (duck + loudnorm).
- **TTS engines (honest capability/limit matrix):**
  | Engine | Darija? | In-sandbox? | Notes |
  |---|---|---|---|
  | Platform `add_voice`/`generate_speech` | **test pending** | ✅ (platform egress) | the tool the user used; model unknown; user's ear judges naturalness |
  | Piper (local, our voice.py) | ❌ (English amy; no Darija) | ✅ | fast, offline; Arabic voice quality limited |
  | edge-tts `ar-MA` | partial (MSA w/ Moroccan voice) | ❌ **TESTED blocked** | `speech.platform.bing.com:443` refused by egress (0.0s); free/no-key but unreachable here |
  | KandirResearch/DarijaTTS-v0.1-500M | ✅ (fine-tuned OuteTTS, Apache-2.0) | ❌ (HF weights blocked) | GGUF via `outetts`; runnable on user machine |
  | XTTS v2 (Coqui) fine-tuned | ✅ (research best path) | ❌ (HF blocked) | multilingual Arabic, no diacritics needed; needs fine-tune data |
  | Hamsa TTS | ✅✅ native Casablancan/Fassi, MOS 4.1+ | ❌ (API host blocked) | commercial; best naturalness; SDK |
  | Pāṇini / Sonex | ✅ reads Darija + French loans, clone | ❌ (API blocked) | commercial; 10-s voice clone |
  **Conclusion:** in this sandbox the only working AI-TTS path is the platform voice tool; for
  highest-quality Darija, Hamsa/native DarijaTTS on the user's machine or via an allowed API proxy.

## 6. Rendering & QA
- **Specs:** vertical 9:16; our engine 1080×1920 (Stick3D 720×1280), 30 fps (refs 60 fps — add
  toggle); H.264 CRF 17–18 + AAC 192k; length = trimmed voiceover; composition length = audio.
- **QA gates (run on stills + final):** feet on ground + shadow; no foot-slide/teleport/clip;
  props contact; subject upper 65%, captions lower third readable + correct text + on spoken frame;
  15–20 props + colour differs from previous scene; SFX sparse/quiet, voice dominant; nothing new
  in last ~0.9 s before a cut; no unwanted shake. ffmpeg `blackdetect`/`freezedetect` (≥0.4 s reject);
  loudnorm measure; **view a 1-fps contact sheet of the exported mp4**; verify duration/streams.
- **Loop:** plan → build → still-check → preview → render → mux → inspect → fix affected scenes
  (partial re-render + concat) → re-check → deliver. Log reusable poses/props to the action library.
- **Engine reality (UPDATED Round 9):** software canvas2d + software raster3d work headless.
  **Headless WebGL2 / three.js NOW WORKS** via `@sparticuz/chromium` + SwiftShader ANGLE —
  overturns the earlier "EGL_NOT_INITIALIZED" dead-end. Proof: WebGL2 context, renderer
  "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))", three.js cube at 720×1280 rendered +
  screenshot-verified (`research/artifacts/round9/swangle-three-test.png`). Recipe:
  `studio/swangle_setup.sh` (npm chromium + extract bundled al2023 nspr/nss libs) then
  `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp node studio/experiments/swangle_test.cjs`. Flags
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. This validates the Stick3D
  pack's `--gl=swangle` CPU-render claim and opens the 3D-toon/Remotion path. No image/video
  generators; everything code.

## 7. Moroccan Darija (language handling)
- **Understand natively:** expressions, vocabulary, sentence structure, humour, conversational tone.
  Preserve meaning/emotion/humour/intent. Internally translate to English only to aid research/
  planning; **final narration stays natural Darija** unless the user asks otherwise. **Never** convert
  to formal/MSA or robotic textbook Arabic. Captions in the language the user specifies.
- **Darija markers (verified from kounkan.ma n2):** ديال (dyal=of), فالـ (f+l=in the), واحد (wahed=
  one/someone), رويضة (rwida=little wheel), كيفاش (kifash=how), غادي (ghadi=will/going), واش (wash=
  is/do question), علاش (3lash=why), بلا (bla=without), دابا (daba=now), بزاف (bzaf=a lot), شحال
  (sh7al=how much), هاد/داك (had/dak=this/that), غير (ghir=just), يالله (yallah=let's go).
  Dropped short vowels + consonant clusters (kteb not kataba); كا present prefix (كنهضر); French
  loans in Arabic script read the Moroccan way (الطوموبيل، البورطابل).
- **Example understood:** "أول رويضة ديال الفخار فالعصر الحجري؟!" = "The first pottery wheel in the
  Stone Age?!" — a Darija history hook. "واحد يوريهم" = "someone shows them".
- **Captions:** Darija Arabic script, RTL; word-karaoke works (tokenise on spaces); keep keywords
  coloured. Provide a transliteration option if the user wants Latin-script (Arabizi) captions.

## 8. Tools & skills catalog (capabilities / limits / status)
- **Stick3D-Pack-v4 (user Drive):** Remotion+Three.js 3D toon stick-figure factory; complete rules
  (scriptwriting, QA, acting, anti-template), voice tools, NvidiaV4 reference. Knowledge saved to
  `references/stick3d/`. Status: studied; patterns adopted; runtime not run here (WebGL limit).
- **Remotion** (★75.9k): interpolate/spring keyframe model — patterns ported into `kinetic.mjs`.
- **Manim / ecmanim:** math animation easing vocabulary — ported; ecmanim is a Node port candidate.
- **video-talkcraft / iart motion-skills / anything2explainer / explainroo:** agent-skill methodology
  (anti-PPT camera, semantic beats, word sync, recipe cards) — adopted as directing rules.
- **cherifya/figures, bassimeledath/stix, claude-animation-skills (/stick-figure, /zachdfilms…):**
  stick-figure/3D agent skills (JSON/SVG/three.js) — comparison references.
- **Our modules:** `kinetic.mjs` (motion graphics, tested), `audiopipe.mjs` (audio post, tested),
  `stickman/waterfx/score/animation/raster3d/character3d/align.py` (Rounds 1–7).

## 9. Our engine map & roadmap
- **Have:** canvas2d + software 3D engines, Piper TTS + espeak alignment, procedural score, kinetic
  motion graphics, audiopipe post-production, QA gates, ledger.
- **P0:** wire word-karaoke into main pipeline; semantic-beat director; perpetual backdrop layer;
  Darija script→voice→caption path (platform TTS + audiopipe).
- **P1:** infographic component library; design tokens; acting vocabulary expansion; sparse-SFX duck.
- **P2:** 60 fps toggle; caption-sync QA gate; vector character states; test Remotion+swangle here;
  3D-drama mode; native Darija TTS integration (user machine / allowed proxy).
- **Preserve always:** all prior rounds, ledger, QA gates, placeholder-script swap path.
