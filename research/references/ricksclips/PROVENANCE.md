# Provenance of this reference — read before trusting it

## What this is

A **partial vendored copy of a third-party study**, not our own research and not the channel
itself.

- **Upstream repo:** https://github.com/parthandparthfamily-cloud/ricksclips
- **Licence:** MIT (`LICENSE.txt`, copyright `@caesarscales`)
- **Subject of the study:** the YouTube channel *Ricks Clips* (`@RicksClips3000`)
- **Style only.** No frames, audio, scripts or other content from the channel are included
  here, and this project is not affiliated with the channel.

## The honest limitation

**Nobody on this project has watched a Ricks Clips video.** Every number we quote from
"the reference" is a measurement made by the upstream author and republished under MIT.
We inherited their conclusions; we did not reproduce their observations.

Direct verification was attempted on 2026-11-26 and is **not possible from this environment**:
`https://www.youtube.com/@RicksClips3000/videos` returns HTTP 401 to automated fetching, and
the sandbox's network allowlist does not include YouTube at all. So the upstream study is the
only evidence available, and it should be cited as such — "the vendored study reports X",
never "we measured X on the channel".

## What was vendored in Round 12, and what that cost us

Round 12 vendored **11 files**: `docs/01`-`docs/05`, `docs/07_RICKS_DEEP_STUDY.md`,
four `tools/*.py` (tts, tighten_voice, timing, captions) and the licence.

That selection is **audio-shaped**: the four tools are all voice/caption tools. Two things
were left out, and their absence caused a real quality gap:

| Left out | Consequence |
|---|---|
| `docs/08_SET_QUALITY_CELYXI_STUDY.md` | The set-detail bar was never read. Round 13 built 13 bare huts and zero detailed buildings. |
| `tools/study/qa_motion.py`, `motion.py` | There was no visual QA gate, so Round 13 shipped a film that fails 3 of 7 visual targets without anyone knowing. |

Both are now vendored (2026-11-26) and the gate has been run. Results:
`research/audits/ROUND13_VISUAL_AUDIT.md`.

## Files added on 2026-11-26

| File | Source |
|---|---|
| `docs/08_SET_QUALITY_CELYXI_STUDY.md` | upstream, MIT, verbatim |
| `tools/study/qa_motion.py` | upstream, MIT, verbatim |
| `tools/study/motion.py` | upstream, MIT, verbatim |

`motion.py` requires `numpy` + `opencv-python-headless` and `ffmpeg` on PATH.
CI installs these — see `.github/workflows/visual-qa.yml`.

## A second, independent source (not vendored)

https://github.com/MikelFR17/claude-animation-skills — `skills/ricks-clips/reference.md`
reports a frame-by-frame study of 14 shorts in the same genre, with two full uploads measured.
Its licence is `NOASSERTION`, so **its files are not copied into this repo**. Two of its
findings are worth recording as independently-reported facts, with attribution:

1. It corroborates the low hard-cut count (1 and 8 cuts in its two measured videos) and
   "camera always moving".
2. It **contradicts** the vendored study on one point: it reports **whip pans were not seen**,
   and puts a new setup at every **3.5-5 s** rather than 2.1 s.

That disagreement matters. The vendored study counts *composition changes* (including moves
within one setup); MikelFR17 counts *setups/places*. Our 5.07 s figure is measured with the
vendored tool, so it is comparable to the vendored 2.1 s target — but the honest reading is
that the pacing target is somewhere in the 2-5 s band depending on what is being counted,
and **2.2 s is the stricter, safer bar**. We adopt the stricter one and say so.

## Rule going forward

When citing reference targets, name the source and whether it was measured by us or inherited.
Inherited numbers are hypotheses to test on our own renders, not facts about the channel.
