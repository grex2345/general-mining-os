# Phase 2 — Programmatic Video Production System

**Status date:** 2026-11-25 · **Branch:** `arena/9d597f99-general-mining-os`
**Scope:** turn the Phase 1 research (see `research/REPORT.md`) into a working, evaluated,
self-critiquing video pipeline. The existing Next.js mining app is untouched except for one
`package.json` script (`npm run studio`), which is the documented entry point.

---

## 1. Honest status summary

Read this table before any other claim in this document. Nothing here is rounded up.

| Capability | Implemented | Executed | Rendered | Visually inspected |
|---|---|---|---|---|
| Evidence bundle + validator (sourced facts only) | ✅ | ✅ | — | — |
| Director (rule-based storyboard, 8 scene kinds) | ✅ | ✅ | — | — |
| Voice-fit (`fitScenes`, measured TTS timing) | ✅ | ✅ | — | — |
| Capability router + adapter registry + run log | ✅ | ✅ | — | — |
| Frame renderer (Skia canvas → h264) | ✅ | ✅ | ✅ | ✅ |
| Procedural music bed + SFX (no licensed samples) | ✅ | ✅ | ✅ | ✅ (audible, not yet studio-judged) |
| Voiceover (meSpeak / eSpeak-NG, offline) | ✅ | ✅ | ✅ | ⚠️ robotic — quality is the main weakness |
| Burned-in captions + SRT export | ✅ | ✅ | ✅ | ✅ |
| Automated evaluation gate + repair loop | ✅ | ✅ | — | — |
| Thumbnail generator + legibility check | ✅ | ✅ | ✅ | ✅ |
| Metadata generator + YouTube limit validation | ✅ | ✅ | — | — |
| YouTube Data API module (OAuth, resumable upload) | ✅ | ⚠️ request-shape only | — | — |
| **API-connected / upload-tested** | ❌ | ❌ | — | — |

**Videos produced:** 2 complete videos, both rendered and visually inspected frame by frame.

| Video | Duration | Resolution | QA score | Status |
|---|---|---|---|---|
| `out/mining-weekly-01.mp4` | 42.5 s | 1080×1920 @30 | **100/100 (A)** | PASS |
| `out/energy-01.mp4` | 31.6 s | 1080×1920 @30 | **100/100 (A)** | PASS |

Both: h264 high / yuv420p / AAC 192 kbps 48 kHz, −15.1 / −14.9 LUFS integrated,
true peak −1.72 / −1.58 dBTP, zero narration overruns, no silent gaps over 1.5 s.

**Not done, and not claimed:** no upload has ever occurred (no OAuth client, no network egress
from this sandbox); TTS quality is still robotic (improved, not solved — see §9.1); the music is a
procedural bed, not a composed score;
no human has watched either video in real time (inspection was via extracted frames/contact
sheets); whisper-based ASR caption verification and HyperFrames/Remotion engines are unavailable
in this environment.

---

## 2. What the pipeline actually is

```
studio/data/evidence/*.json      researched facts, every one carrying source.url/name/date
        │
        ▼  validateBundle()      rejects unsourced facts, warns on data older than 45 days
   director.mjs                  seriesShape() → chooseFormat() → planVideo()
        │                        (shape decides the visual: timeline→chart, ranking→bars)
        ▼  validateIR()          frame-exact schema; narration must fit its scene
   fit.mjs                       measures the REAL TTS audio, grows scenes to fit it
        │
        ▼  timeline()            every scene gets an integer frame range
   router.mjs + adapters.mjs     capability → adapter selection, with reasons logged
        │
        ▼  renderNative()        canvas → raw RGBA → ffmpeg segments → concat
   audio.mjs                     TTS + procedural bed + SFX, frame-locked cues
        │  finishVideo()          linear gain + limiter, verified by re-measuring the file
        ▼
   evaluate.mjs                  ffprobe + ffmpeg + frame sampling → P0/P1/P2 findings → score
        │                        fails → applyRepairs() → re-render → re-evaluate (≤2 rounds)
        ▼
   publish.mjs                   thumbnail (canvas) + metadata (validated to YouTube limits)
        │
        ▼
   youtube.mjs                   OAuth refresh → resumable upload → thumbnail → status verify
```

Entry point: `node studio/cli.mjs <doctor|plan|storyboard|render|eval|thumb|publish|runs|adapters>`.

### Can it make a video it has never seen before?

Yes, within the limits of the evidence format. Two structurally different bundles were run
end-to-end: a **timeline** bundle (hashrate over four dates → line chart) and a **categorical**
bundle (power cost by site type → ranking bars). The format router had to be rewritten to get
there: the first attempt hardcoded the hashrate narrative and crashed on the energy bundle.
That failure and its fix are recorded in §6.

---

## 3. Evidence discipline

`studio/data/evidence/mining-2026-11-25.json` holds 8 facts and 2 series from Cointribune,
Cryptoticker, Pickaxe and bitcoin.com, each with URL and publication date; the validator
returns `{ok: true, problems: [], warnings: []}`. The second bundle
(`energy-2026-11-25.json`) was built from the same retrieved sources.

Three specific anti-fabrication mechanisms exist because they caught real mistakes:

1. **Shape-aware narration.** The hashrate series dips to 912 EH/s before rebounding to 1,065.
   Narrating that as "climbed" (the obvious template) would have been false. `planVideo`
   classifies monotonic / V-shape / slide / swing and words the sentence accordingly.
2. **Narration is generated from the numbers on screen.** Compare and chart scenes derive
   their voice line from the same array the renderer draws.
3. **The voice must match the visuals.** The list scene originally had a hardcoded narration
   that contradicted its items once the topic changed; it now joins the items themselves.

---

## 4. The evaluation gate

`studio/src/evaluate.mjs` measures the finished FILE, never the renderer's intentions.

| Check | Severity | Method |
|---|---|---|
| codec / dimensions / pix_fmt / bitrate floor | P0–P2 | ffprobe |
| duration vs IR expectation (±0.35 s) | P1 | ffprobe |
| integrated loudness vs −14 LUFS, true peak vs −1.5 dBTP | P0/P1 | `loudnorm` measurement pass |
| silent gaps > 1.5 s | P1 | `silencedetect` |
| blank / near-black sampled frames | P0 | 9-frame luminance + contrast sampling |
| first-frame ink coverage (it is the feed thumbnail) | P0 | banded luminance histogram |
| black stretches, frozen stretches | P1/P2 | `blackdetect`, `freezedetect` |
| scene pacing, hook density | P1 | IR arithmetic |
| caption overflow (real wrapped line count), cue speed, ordering | P1/P2 | canvas text measurement + SRT parse |
| dead stretch across the whole film | P1 | inter-sample luminance deltas |

Score = `100 − 34·P0 − 9·P1 − 2.5·P2`. **Pass requires zero P0 and zero P1.**

`applyRepairs()` then fixes only what is mechanically safe (trim over-long tails, re-chunk
captions, force the hook to be instant at t=0, re-normalise loudness) and the video is
re-rendered and re-evaluated, up to two rounds. Repairs never invent content.

### The gate was wrong, twice — and both times it was the gate that was fixed, not the score

Being honest about this matters more than the score:

- It flagged `slow_hook` for a hook that holds 5.6 s. But the hook *landed* its idea on frame 0
  and the voice needed the time. The check now measures **when the idea lands**, not how long
  the scene lasts.
- It scored a video 100/100 that visually had list content showing under the outro's caption.
  The metric set could not see a late cut. That is why frame-level inspection is mandatory and
  why the dissolve-order bug (§6) was found by eyes, not by the score.

---

## 5. Visual standard (what "inspected" means here)

Both videos were inspected by extracting frames at scene boundaries and mid-scene, plus
contact sheets, and reading them at full size. Confirmed on screen:

- brand rule + wordmark + `NN / NN` scene counter, bottom progress bar;
- one accent idea per scene, no element collisions, source line bottom-left in mono;
- caption band at 76.5 % height with word-level highlight, clear of all scene content;
- ranking bars coloured **semantically** (the cheapest power site is the accent bar);
- every number shown in full and in its correct unit (`$31.89` inside the bar rather than a
  clipped `$3`; `$0.021` on the stat scene, not a raw `0.42` share).

Defects found by inspection and fixed are listed in §6.

---

## 6. Defect log — every defect found, and what it taught

This is the part that distinguishes "rendered" from "verified".

**Pipeline / correctness**

| Defect | Cause | Fix |
|---|---|---|
| Teal rendered olive | frames piped as `bgra` while canvas emits RGBA | `-pix_fmt rgba` |
| Black first frame, no thumbnail-worthy frame 0 | scene fade started from black | cross-dissolve; hook drawn fully at t=0 |
| Every cut landed ~0.2 s late (list content under outro caption) | cross-dissolve painted the *outgoing* scene on top | outgoing painted first, incoming alpha-ramped over it |
| `$31.89` displayed as `$3` | value text placed outside the bar and clipped | place value inside the bar when it does not fit outside |
| Energy bundle crashed the planner | planner hardcoded a hashrate narrative | data-shape classifier (`timeline` vs `categorical`) |
| `0.42` narrated as a dollar figure | stat beat ignored units | unit-aware narration/prefix/suffix |
| Cheapest power source shown in red | bar colour from palette index | semantic colouring (`good` flag) |
| Voice said "Full breakdown on…" while CTA said Subscribe | hardcoded outro line | narration derived from the CTA |
| Render hung for 20 min on a frame exception | exception escaped while ffmpeg held the pipe | fail fast, kill ffmpeg, name the frame |
| Session hung on `Cannot access 'blockTop' before initialization` | hook referenced layout before computing it | layout computed first; eyebrow positioned from it |

**Audio** — single-pass `loudnorm` produced −16.1 LUFS against a −14 target; two-pass *linear*
mode produced −19.1 (it silently falls back to dynamic reshaping). Replaced with a measured
linear gain + limiter, then verification from the finished file in a loop that corrects both
loudness and true peak independently, because AAC adds inter-sample overshoot. Final: −14.8 LUFS,
−1.5 dBTP.

**Captions** — bullets read `…to 1065.` / `per petahash per day.` because cues were split by
word count. Now clauses are packed (never split mid-clause), cues under 0.8 s are merged, and
overflow is measured by rendering the text with the real font, not by character count.

**Frozen frames** — `freezedetect` reported 17 stretches. Film grain was quantised away by the
encoder, so the backdrop now has slow, large-scale motion (orbiting glows, a panning grid), and
the quote card has an authored drift + growing rule.

---

## 7. YouTube integration

`studio/src/youtube.mjs` implements the documented Data API v3 flow: OAuth 2.0 refresh-token
grant, `videos.insert` with `uploadType=resumable` (8 MB chunks, `308` + `Range` resume),
`thumbnails.set`, and a status read-back (`snippet,status,processingDetails`) that waits for
processing before reporting success.

Safety properties, all unit-checked:

- credentials come from env or a git-ignored file, and **only presence is ever reported** —
  no value is logged, echoed, or written into an artifact;
- `enforcePrivacy()` refuses `public` unless **both** `allowPublic: true` and
  `YT_ALLOW_PUBLIC=1`; default is `private`;
- with no credentials the module returns `status: 'not_configured'` plus the exact request it
  would have sent. It has never returned a fabricated video id.

**Why it is not upload-tested:** this sandbox has no outbound network (all 11 API probes
returned `000`) and no OAuth client for the channel. Steps to enable it are printed by
`node studio/cli.mjs publish <id>`.

---

## 8. Capability routing

`router.mjs` + `adapters.mjs` register 12 adapters declaring capability, cost, quality,
determinism, licence and dependencies. Availability is **probed**, not assumed — and the probe
itself had a bug that reported a working adapter as missing (`require.resolve` inside an ES
module), which is exactly the kind of quiet failure the router exists to surface.

Currently available: native-canvas renderer, procedural audio, meSpeak TTS, IR captions,
ffprobe evaluation, canvas thumbnails, YouTube rehearsal.
Unavailable, with reasons: HyperFrames and Remotion (need Chrome + network), Whisper ASR
(model download blocked), `say` (darwin only), YouTube API (no credentials).

Every routing decision and every pipeline run is appended to `data/runs.jsonl` (git-ignored),
which `router.provenConfigurations()` reduces to reusable configurations. Current record:
`1080x1920@30 | native-canvas | procedural-audio+mespeak-tts | 13 runs | avg score 99.5`.

---

## 8b. Voice and music work (after the first render)

The first render's audio was the weakest link, so it was worked directly:

**Voice.** `speakable()` now normalises text for eSpeak before synthesis — units are spelled
(`EH/s` → "exahashes per second", `$26.16` → "26 dollars 16"), and sentence/clause breaks are
preserved. Crucially, **pauses are real inserted silence**, not `[[slnc]]` markup: measured, that
directive yields only ~23 % of the requested gap (1.85 s → 2.20 s for a 1.5 s request). The voice
bus is therefore built phrase by phrase, trimmed of leading/trailing silence, faded to avoid
clicks, and conditioned with a presence EQ + gentle compressor.

**This exposed a real bug in the fit pass.** Because punctuation now adds pause time, `voiceDuration`
had to measure the *same* chunked phrases the mixer builds; the old whole-line measurement drifted
low and one scene overran by 0.36 s. Both paths now share one function, `fitScenes` grew 6 scenes,
and `evaluate.mjs` gained a `voice_overrun` P1 check fed by the mixer so a line can never run past
its scene again.

**Music.** The bed had nothing above ~3 kHz, which is why it read as a game beep rather than a
track. Three layers were added: a pink-noise air pad (breathes per bar), highpassed off-beat hats,
and very low surface noise. Spectral inspection confirms broadband content and a visible rhythmic
pattern.

**Not claimed:** the voice is intelligible and correctly paced, but it is not natural. This is a
formant synthesiser; §9.1 explains exactly what blocks the neural alternative here.

## 9. Known weaknesses (ranked)

1. **Voice quality — the blocker, with a diagnosed cause.** A neural TTS is reachable in
   principle via `@huggingface/transformers`, which is on npm (allowed) and pulls
   `onnxruntime-node`, whose **postinstall script downloads the ONNX native binary** from a CDN
   outside this sandbox's allowlist (`ECONNRESET` from `node ./script/install`; `huggingface.co`
   is unreachable, `000`). Model weights would be blocked too. Any of these unblocks it:
   a machine with open egress, a prebuilt `onnxruntime-node` binary, or a hosted TTS API key.
   The `audio:voice` capability slot and `conditionVoice()` chain are already in place.
2. **Music.** Procedural bed only — clean and licence-safe, but not a score.
3. **Storyboard variety.** Eight scene engines and two data shapes; more shapes (before/after,
   distribution, map) would widen coverage.
4. **No ASR verification of captions.** Captions are exact by construction (we author the
   narration), but nothing independently confirms the audio matches.
5. **No human real-time viewing.** Inspection is frame-based; timing feel is inferred from
   pacing metrics, not felt.
6. **Upload path unproven.** Code complete, never executed against Google.

---

## 10. How to run it

```bash
cd studio && npm install            # nested; does not touch the Next.js app
node cli.mjs doctor                 # toolchain + adapter availability
node cli.mjs plan mining-2026-11-25 # storyboard + thumbnail brief, no render
node cli.mjs render mining-2026-11-25 --id mining-weekly-01
node cli.mjs eval out/energy-01.mp4 --bundle energy-2026-11-25
node cli.mjs publish mining-weekly-01 --dry-run
```

`render` exits non-zero when evaluation fails, so it can be scheduled and gated.

---

## 11. What would make this production-ready

1. Replace meSpeak with a neural voice adapter (drop-in: `audio:voice` capability).
2. Execute one authorised private upload and verify it server-side — the only untested link.
3. Add ASR caption verification (needs a model download, blocked here).
4. Extend the shape classifier to >2 data shapes and add a distribution scene engine.
5. Have a human watch the next render in real time and feed notes back into the evaluation
   thresholds — the automated gate has already needed two corrections that only eyes caught.
