# Round 15 delivery record

Date: 2026-11-26. Branch `arena/9b543693-general-mining-os`, PR #7.

## What shipped

### Film — `the-bell-of-vellara-r15.mp4`
- Local: `research/artifacts/round15/the-bell-of-vellara-r15.mp4`
- 21,886,364 B · md5 `c23902bf2e29cad0d3bc73a9112f64c1` ·
  sha256 `3166c59e9a76240498246f7f7d7113b6405d2c21bcf8dda06b4c1a519769c718`
- h264 720×1280 @30, **1980 frames / 66.000000 s**; AAC 48 kHz stereo 66.000000 s
- Delivered-file loudness −14.98 LUFS / −2.84 dBTP / LRA 8.00
- Drive **`1whOwSIfeR6rF_jNuncFfqyVx5_FBTrWh`**, public (reader, not discoverable).
  <https://drive.google.com/file/d/1whOwSIfeR6rF_jNuncFfqyVx5_FBTrWh/view>
- **Upload verified byte-exact**: Drive `md5_checksum` equals local md5.

### A/B reel — `direction-shipped-vs-stronger.wav`
- Local: `research/artifacts/round15/direction-shipped-vs-stronger.wav`
- 12,249,678 B · md5 `fa639c0e950f980c6297e3b2410151e6` · 63.8 s pcm_s16le 48 kHz stereo
- Layout: A (shipped) 0–7 s = film 0–7; A 8–31 s = film 43–66; 1.8 s silence;
  B (stronger) 32.8–39.8 s = film 0–7; B 40.8–63.8 s = film 43–66.
- Guide: `direction-shipped-vs-stronger-guide.json`
- **Sent as a real Gmail attachment**, not a link.
  Draft `r9045347993092115577` → sent message **`1a21d84872cf066b`**
  (thread `1a21d84582e84b0d`), to spawn0766@gmail.com.
  Attachment confirmed on the sent message: `direction-shipped-vs-stronger.wav`,
  `audio/wav`, **12,249,678 B** — exact local size. Encoded message 16,552,927 B,
  under Gmail's 25 MB cap.

## Direction change, measured

Locked beat grid preserved: drift **0.000000 s**. Captions byte-identical to R13.

| metric (between beats) | shipped | stronger |
| --- | --- | --- |
| dynamic range | 3.79 dB | **4.74 dB** |
| spectral centroid | 420 Hz | **458.4 Hz** |
| centroid max | 1766 Hz | **1961 Hz** |
| pitch range | 2.40 st | **2.57 st** |
| global dynamic range | 47.41 dB | **50.79 dB** |

Emphasis was previously emitted into the direction plan but never rendered. It now
renders on **10 beats**: b01 sixty/bell/Vellara · b03 bronze · b04 tower/silent ·
b05 Nora · b06 bell · b09 bell · b10 tower · b11 stone/sixty · b12 bell/four ·
b13 rang/three.

Final parameters: gain spread ×1.9, tilt ×1.65 about means (−0.250 dB, −0.046);
emphasis `liftDb = 1.15 + 1.05*intensity`; post-shape presence lift `k = tilt*0.20`
at 2400 Hz on upward beats only; compression ratios unchanged; room-tone lowpass 0.20.

Mix: voice −21.17 dB RMS, music 21.5 dB under voice, 53 SFX with **0 masking flags**,
density 8.03/10 s. Master −14.96 LUFS / −2.00 dBTP / LRA 8.1 — **0.4 LU quieter than
R13 by choice**: wider dynamics legitimately cost integrated loudness, and
`master()` is a single linear gain capped at the ceiling, not a compressor.

## Defect disclosed, not patched over

R14's delivered MP4 has 1933 video frames / 64.433333 s against 66 s audio — 47 frames
of outro missing. Root cause `-shortest` + `-c:a copy`. Full write-up:
`research/audits/ROUND14-TAIL-TRUNCATION.md`. Both finish scripts now drop `-shortest`
and assert 1980 decoded frames.

**R13 and R14 deliverables were not touched.** sha256 re-verified after all R15 work:
- R13 `deeeead0f397f2f6a559f31b32078250520bcbd0a5088cf092dae66d7b3ae249`
- R14 `f2d49aab7d670649cb571dfc977432b27c4289f04704740f72edc9de1f275523`

## Commits

`1b0cc2a` direction · `8000d97` film mix · `2556e41` finish ·
`4cb065f` truncation fix + audit · `aa81112` R15 artifacts. All pushed.

Stems and intermediate audio are gitignored per the round13 convention; they are
reproducible with `node studio/experiments/r15_film_mix.mjs`.

## Still open

- Human verdict on the R14/R15 **pictures** (`round14-inspection.json`,
  `human_verdict: "pending"`). Only viewing can settle this; distance metrics missed
  the payoff occlusion defect once already.
- LOOSE vs TIGHT pacing decision (issue #1). TIGHT would save 4.54 s.
