# Which voice take actually shipped — verified, not assumed

Question asked: *"build a new film version using the directed voice"* (the ON take from
`direction-off-on.wav`).

Answer: **the shipped film already uses exactly that take.** A new film built "using the
directed voice" would be byte-for-byte the same performance. This file records the proof so
the question does not have to be re-litigated.

## Chain of evidence

### 1. The reel's ON section IS `narration.wav`

`direction-off-on-guide.json` marks section B ("ON — same take, cut at sentence
boundaries, per-emotion shaping, directed pauses and breaths") at 57.2 s → 122.58 s,
duration 65.38 s. `film/narration.wav` is 65.376 s.

Decoded both to mono 48 kHz s16le and compared 3,138,048 samples:

| measurement | result |
|---|---|
| zero-lag normalised correlation | **1.000000** |
| best lag over ±0.5 s | **0 samples (+0.0000 s)** |
| RMS, ON segment | 3272.7 |
| RMS, narration.wav | 2835.7 |
| ratio | 1.1541 (≈ +1.25 dB, presentation gain only) |

Identical waveform, differing only by a constant gain. The reel was cut from
`narration.wav`.

### 2. `narration.wav` IS what reached the final master

Sample-level correlation against `film/stem-voice.wav` fails (r ≈ 0.03), which is
**expected and not evidence of a different take**: the voice bus is EQ'd, compressed,
limited and reverbed, and reverb decorrelates the waveform. Sample correlation is the
wrong instrument for a mastered stem.

Comparing 50 ms RMS **envelopes** instead, which survive that processing:

| candidate | best envelope r | lag |
|---|---|---|
| **narration.wav (= the ON take)** | **0.9840** | **+0.00 s** |
| OFF segment (0 → 55.4 s) | 0.5531 | +1.50 s |
| narration-take.wav (raw, undirected) | 0.5506 | +1.40 s |

The directed take matches the shipped voice stem at zero offset. The undirected take and
the raw take do not match at any offset.

## Conclusion

- Direction **ON** is in the delivered Round 13 film and in the Round 14 film (which copies
  the Round 13 AAC stream verbatim).
- Pacing ships **LOOSE**; the TIGHT variant exists only inside `pacing-loose-vs-tight.wav`.
- Therefore "use the directed voice" is already satisfied. Any genuinely new film version
  needs a *different* instruction: stronger direction, a different pacing, or the OFF take
  as a deliberate contrast.

## Method note

Do not use sample-level correlation to identify a take inside a mastered stem. Use the
envelope. The first measurement here looked like a contradiction (r ≈ 0.01) and was a
measurement artefact, not a finding.
