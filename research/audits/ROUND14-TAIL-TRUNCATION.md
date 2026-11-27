# Defect: R14 film lost its last 47 video frames

**Found:** 2026-11-26, while comparing the R15 rebuild against R14 frame by frame.
**Severity:** real, visible, in an already-delivered file. Not fixed in place (delivered
artifacts are never silently altered). **R15 carries the complete tail.**

## What is wrong

`research/artifacts/round14/film/the-bell-of-vellara-r14.mp4`
(sha256 `f2d49aab7d670649cb571dfc977432b27c4289f04704740f72edc9de1f275523`,
Drive file `17BiuZabvBE58Jm2qgZgWAJWkqHTdBb-A`) has:

| stream | duration | frames |
| --- | --- | --- |
| video | **64.433333 s** | **1933** |
| audio | 66.000000 s | 3095 AAC frames |

The picture stops **1.567 s** before the sound does. The last ~47 frames of the outro —
the held final shot under the closing bell decay — are missing. Players hold the last
decoded frame (or go black) while the audio finishes, so the film ends on a freeze
instead of the intended settling shot.

For comparison, both neighbouring films are complete:

| film | video frames | video duration | audio duration |
| --- | --- | --- | --- |
| R13 `round13/film/the-bell-of-vellara.mp4` | 1980 | 66.000000 | 66.000000 |
| **R14** `round14/film/the-bell-of-vellara-r14.mp4` | **1933** | **64.433333** | 66.000000 |
| R15 `round15/the-bell-of-vellara-r15.mp4` | 1980 | 66.000000 | 66.000000 |

## How it was found

Not by the gates. The motion gate and the cinema gate both sample the *frame sequence*,
and the sequence on disk is complete — 1980 PNGs, none missing, none zero-byte. Every
gate passed.

The defect only appeared under a **per-frame PSNR** comparison of R15 against R14:

- frames 0–1932: PSNR `inf` — pixel-identical, as expected, since R15 reuses the R14 pictures.
- frames 1933–1979: **47 differing frames**, min PSNR 5.48 dB — R15 has picture, R14 has none.

Earlier in this work I compared the two MP4s by video-stream md5 and by decoded-pixel
md5 and treated the mismatch as ordinary encoder noise. That was the wrong instrument:
separate encodes never produce identical bytes, so those hashes cannot localise a
difference. Per-frame PSNR can, and it pointed straight at the tail.

## Root cause

The final mux in `studio/experiments/r14_finish.sh` was:

```
ffmpeg -i /tmp/r14video.mp4 -i <R13 final audio> ... -c:a copy -shortest "$OUT"
```

The video input `/tmp/r14video.mp4` is correct — **1980 frames**, verified, and
byte-for-byte the same file R15 encodes from (22,068,926 B). The loss happens in the mux.
`-shortest` ends the output at the shortest input, and with `-c:a copy` the copied AAC
stream carries its own encoder delay / edit-list signalling, so its *signalled* end lands
before the video's last frames. ffmpeg then dropped 47 video frames to honour it.

The probe in the finish script printed `duration=66.000000` — the **container** duration,
which is set by the audio. That is why the truncation went unnoticed: the check read the
one number that was still correct.

R15 did not hit this because its audio is re-encoded to AAC in the same command rather
than copied, so the two streams agree and `-shortest` had nothing to cut.

## Fix

Applied to **both** finish scripts:

1. **`-shortest` removed.** Both streams are exactly 66.000 s by construction; the flag
   was never needed and could only subtract.
2. **A hard frame-count assertion added**, before the probe:

```
NV=$($FP ... -count_frames -show_entries stream=nb_read_frames ... "$OUT")
if [ "$NV" != "1980" ]; then echo "FRAME COUNT MISMATCH — aborting"; exit 1; fi
```

The check now counts *decoded video frames in the delivered file*, not container
duration. A truncated tail can no longer pass the finish step.

Verified: R15 = 1980 frames / 66.000000 s → passes the new guard.

## What was NOT done

- **R14 was not re-rendered, re-muxed, or replaced.** Its sha256 is unchanged
  (`f2d49aab…`), as is R13's (`deeeead0…`). The standing rule is that delivered files are
  never silently altered; a corrected R14 would be a new file, and it is not needed,
  because R15 is built from the same complete frame sequence and already has the full tail.
- No claim that this was cosmetic. It is 1.57 s of missing picture at the emotional
  resolution of the film.

## Recommendation

Watch **R15**. It contains the same R14 pictures (pixel-identical for all 1933 frames R14
actually holds), the complete outro, and the stronger voice direction. Treat the R14
upload as superseded, with this defect on record.
