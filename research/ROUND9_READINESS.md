# Round 9 — Production Readiness Verification (honest, test-backed)

Question: can the current environment produce a COMPLETE video at the reference quality level?
Method: not assumed — ran the two unproven integrations and combined EVERYTHING into one file.

## The single-file proof
`research/artifacts/round9/integration-smoke.mp4` — 5.000 s, 720×1280, h264+aac, QA clean
(0 black, 0 freeze, −13.89 LUFS / −1.00 dBTP). It combines, in one render:
- 3D toon character (ink outline, toon shading) + ground shadow + pottery-wheel prop + sky/fog
  + camera push-in, rendered headless via SwiftShader (`studio/experiments/toon_smoke.cjs`).
- Natural Moroccan Darija narration (platform voice `voice-01`, user-selected) → loudnorm.
- Word-level timing: whisper-small DTW → DP script alignment (kept exact script words even where
  ASR misheard) → Arabic RTL karaoke captions with keyword colour, burned in.
- Procedural music bed (`score.mjs`) ducked under the voice.
This is a PIPELINE PROOF, not a finished video and not yet reference polish.

## What is now PROVEN end-to-end (tested, combined)
| Stage | Status | Evidence |
|---|---|---|
| Script → Darija TTS → loudness | ✅ | voice-01 mp3 22.07 s → processVoice −14 LUFS |
| Word timing (Darija) | ✅ | whisper DTW + DP, 36 words, exact script text preserved |
| Arabic karaoke captions | ✅ | ASS burn-in, RTL, keyword colour, visible in sheet |
| 3D character + acting + shadow + camera + props | ✅ | toon_smoke 150 frames, screenshot-verified |
| Music + ducking | ✅ | score.mjs calm bed, amix under voice |
| Mux + QA (black/freeze/loudness/duration) | ✅ | integration-smoke.mp4 clean |
| Render speed | ✅ measured | ~200 ms/frame steady @720×1280 w/ shadows (~5 fps) |

## What is NOT yet reference quality (craft work — capability exists, polish missing)
- Character detail: current puppet is head+bean+sticks; references have hair, faces, hands, clothes.
  The Stick3D pack's `puppet.ts` has this vocabulary — needs porting/building into three.js.
- Acting richness: only breathing + subtle arm wave now; references use full-body emotion. Pack's
  ACTION-LIBRARY has the recipes — needs building.
- Scene richness: one prop + empty ground now; references use 15–20 props + layered worlds.
- Look-dev: lighting still bright/flat; needs grade + light rig to match reference polish.
- Camera variety: push-in only; needs the pack's spline/punch-in/angle vocabulary.
These are iteration tasks I can do — NOT missing capabilities.

## Critical risks / dependencies (honest)
1. **Darija voice naturalness — the biggest risk, partly outside my control.** The platform has NO
   native `ar-MA` voice (tested: "accent ar-MA not supported"). The available path is the `ar` voice
   reading Darija text (voice-01, which you auditioned and selected). I cannot hear it; whether it
   sounds natural enough is YOUR judgment. If it is not acceptable, native Darija TTS (Hamsa /
   KandirResearch DarijaTTS / XTTS) requires your machine or an allowed API proxy — hosts are
   egress-blocked here.
2. **Render speed / iteration cost.** ~200 ms/frame → ~6 min per 60 s at 30 fps/720p. Reference clips
   are 60 fps (double). Multiple render-review-fix cycles multiply this. Manageable, but a real
   constraint; mitigations: 30 fps, 720p, partial re-render + concat, frame reuse.
3. **Quality gap is iteration, not a switch.** References are skilled-human polish built over many
   versions. Reaching that level takes repeated render→inspect→fix loops (which the pipeline supports).
4. **Stick3D Remotion engine not run here.** I proved the equivalent capability with raw three.js;
   porting the pack's exact puppet/scene code is the fastest route to reference quality.

## Verdict
**Technically READY to produce a complete video end-to-end** — every required stage is proven and
combined into one QA-clean file. **NOT yet at reference visual polish**, and **Darija voice
naturalness is the one critical dependency that needs your ear/approval** (or an external native
Darija TTS). I can close the visual-polish gap myself by building out the puppet/acting/scene/look-dev
from the pack's patterns; I cannot, by myself, guarantee the Darija voice sounds native — that needs
your judgment or an external model.

Recommended next step: you confirm whether voice-01's Darija is acceptable. If yes, I build the first
real short (pottery-wheel story) with full puppet/acting/scene richness and iterate to quality. If no,
we arrange a native Darija TTS path first.
