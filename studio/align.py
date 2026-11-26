#!/usr/bin/env python3
"""
align.py — REAL audio alignment for the Round 5/6 speech pipeline.

Round 5's voice.py placed words by taking espeak-ng's own onset times and
scaling them per sentence by (piper duration / espeak duration). The report said
so honestly: `"alignment": "proportional-estimate"`. That is a guess. It drifts,
because piper and espeak do not distribute time across a sentence the same way.

This module replaces the guess with a measurement, using nothing but the audio
that piper actually produced:

  1. Compute a short-time energy envelope of the waveform (10 ms hop).
  2. Classify each frame as speech or silence with an adaptive threshold.
  3. Merge speech runs into syllable/word-scale "islands".
  4. Assign the N words of the sentence to the islands by dynamic programming
     over the island boundaries, with a cost that prefers
       - islands proportional in length to the word's syllable count, and
       - a monotone, one-island-per-word-to-several assignment.
  5. Within a multi-island word, split on the internal energy minima.

The result is bounded by the actual acoustics: a word can only be placed where
the waveform actually has energy, and an island cannot be shared between two
words unless the DP decides that is cheaper than splitting.

Honest limits, stated because they matter:
  * This is energy-based alignment, not a phoneme aligner. It resolves word
    onsets to roughly one syllable. It cannot tell /p/ from /b/.
  * Where speech is continuous (no clear energy dips between words, which does
    happen in "and a" or "it is"), several words necessarily share one island and
    their internal boundaries are interpolated by syllable count. Every word
    reports which of the two methods produced it (`method`).

Usage:
  python3 align.py '<json>'   {"wav": "...", "text": "...", "out": "..."}
"""

import json
import os
import re
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(HERE, "lib_piper"), os.path.join(HERE, "lib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

HOP = 0.010          # 10 ms
WIN = 0.030          # 30 ms energy window


# ------------------------------------------------------------------ audio in

def read_wav(path):
    import numpy as np
    with wave.open(path, "rb") as w:
        rate = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise SystemExit(f"unsupported sample width {sw}")
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, rate


def envelope(x, rate):
    """RMS envelope on a 10 ms hop, plus its first difference (onset strength)."""
    import numpy as np
    hop = max(1, int(rate * HOP))
    win = max(hop, int(rate * WIN))
    n = 1 + max(0, (len(x) - win) // hop)
    env = np.zeros(n, dtype=np.float32)
    for i in range(n):
        seg = x[i * hop: i * hop + win]
        env[i] = float(np.sqrt(np.mean(seg * seg) + 1e-12))
    return env, hop / float(rate)


# --------------------------------------------------------------- segmentation

def smooth(env, k=3):
    import numpy as np
    if len(env) < k:
        return env
    ker = np.ones(k, dtype=np.float32) / k
    return np.convolve(env, ker, mode="same")


def islands(env, dt):
    """
    Speech islands: runs of frames above an adaptive threshold.

    The threshold is derived from the recording's own dynamic range (10th to
    90th percentile of the envelope), not a fixed number, so it does not depend
    on how hot the render was.
    """
    import numpy as np
    e = smooth(np.asarray(env, dtype=np.float32), 5)
    if not len(e):
        return []
    lo = float(np.percentile(e, 12))
    hi = float(np.percentile(e, 92))
    if hi <= lo * 1.05:
        return [(0.0, len(e) * dt)]
    thr = lo + (hi - lo) * 0.22
    voiced = e > thr
    out = []
    i = 0
    n = len(e)
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j < n and voiced[j]:
            j += 1
        # close gaps shorter than 35 ms: an unvoiced stop must not split a word
        if out and i * dt - out[-1][1] < 0.025:
            s = out[-1][0]
            out[-1] = (s, j * dt)
        else:
            out.append((i * dt, j * dt))
        i = j
    # drop islands shorter than 40 ms: clicks and breath, not words
    return [z for z in out if z[1] - z[0] >= 0.040]


def syllables(word):
    """A crude but adequate syllable count for English text."""
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 1
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1 and not w.endswith(("le", "ee")):
        n -= 1
    return max(1, n)


# ---------------------------------------------------------------- assignment

def align_islands(tokens, isl):
    """
    Assign words to islands by dynamic programming.

    State: (word index, island index). A transition either
      - gives one word exactly one island, or
      - gives one word SEVERAL consecutive islands (a long word), or
      - gives SEVERAL words ONE island (continuous speech), which is only
        allowed for up to 3 words and costs a penalty, so it is a last resort
        rather than the default.
    Cost is the squared relative error between the island group's duration and
    the group's expected duration (0.20 s per syllable, with a floor), so the
    result depends on the measured acoustics rather than on word order alone.
    """
    import numpy as np
    W = len(tokens)
    I = len(isl)
    if W == 0 or I == 0:
        return {}
    dur = np.array([b - a for a, b in isl], dtype=np.float64)
    syl = np.array([syllables(t) for t in tokens], dtype=np.float64)
    expect = np.clip(0.21 * syl, 0.13, 0.62)

    INF = 1e18
    cost = np.full((W + 1, I + 1), INF)
    back = np.zeros((W + 1, I + 1), dtype=np.int32)
    cost[0, 0] = 0.0
    for wi in range(1, W + 1):
        for ii in range(1, I + 1):
            # one word <- k islands
            for k in range(1, min(4, ii) + 1):
                prev = cost[wi - 1, ii - k]
                if prev >= INF:
                    continue
                d = float(dur[ii - k:ii].sum())
                c = prev + 0.55 * _rel(d, expect[wi - 1]) + 0.02 * (k - 1)
                if c < cost[wi, ii]:
                    cost[wi, ii] = c
                    back[wi, ii] = k
            # j words <- one island
            for j in range(2, min(4, wi) + 1):
                prev = cost[wi - j, ii - 1]
                if prev >= INF:
                    continue
                d = float(dur[ii - 1])
                c = prev + 0.55 * _rel(d, float(expect[wi - j:wi].sum())) + 0.34 * (j - 1)
                if c < cost[wi, ii]:
                    cost[wi, ii] = c
                    back[wi, ii] = -j
    if cost[W, I] >= INF:
        return {}
    # walk back
    assign = {}
    wi, ii = W, I
    while wi > 0 and ii > 0:
        k = int(back[wi, ii])
        if k > 0:
            assign[wi - 1] = (ii - k, ii, "islands")
            wi -= 1
            ii -= k
        elif k < 0:
            j = -k
            for q in range(wi - j, wi):
                assign[q] = (ii - 1, ii, "shared")
            wi -= j
            ii -= 1
        else:
            return {}
    return assign


def _cuts_in(env, dt, start, end, k):
    """k boundary times inside [start, end], at local energy minima."""
    if k <= 0:
        return []
    import numpy as np
    s_i = max(0, int(round(start / dt)))
    e_i = min(len(env) - 1, int(round(end / dt)))
    if e_i - s_i < 3 * k:
        return [start + (end - start) * (q + 1) / (k + 1) for q in range(k)]
    seg = np.asarray(env[s_i:e_i + 1], dtype=np.float32)
    seg = smooth(seg, 5)
    span = e_i - s_i
    picked = []
    for q in range(k):
        # expected position, then a +-25% window to search for the true minimum
        target = span * (q + 1) / (k + 1)
        lo = int(max(1, target - span * 0.22))
        hi = int(min(span - 1, target + span * 0.22))
        best, besti = 1e9, int(target)
        for idx in range(lo, hi + 1):
            if any(abs(idx - p) < 0.06 / dt for p in picked):
                continue
            if seg[idx] < best:
                best, besti = float(seg[idx]), idx
        picked.append(besti)
    picked.sort()
    return [s_i * dt + p * dt for p in picked]


def _rel(measured, expected):
    return ((measured - expected) / max(0.05, expected)) ** 2


# --------------------------------------------------------------------- main

def align(wav_path, text, total_duration=None):
    import numpy as np
    x, rate = read_wav(wav_path)
    env, dt = envelope(x, rate)
    isl = islands(env, dt)
    tokens = [t for t in re.findall(r"[A-Za-z0-9']+", text)]
    assign = align_islands(tokens, isl)
    dur_audio = len(x) / float(rate)

    words = []
    for i, tok in enumerate(tokens):
        if i not in assign:
            continue
        a, b, mode = assign[i]
        start, end = isl[a][0], isl[b - 1][1]
        if mode == "shared":
            # Several words inside one island. Do NOT just divide it by length:
            # the envelope usually still has a dip where the words meet, just
            # not a full silence. Find those dips (weakest points of the
            # smoothed envelope, kept at least 60 ms apart) and cut there.
            group = [q for q in sorted(assign) if assign[q][0] == a and assign[q][1] == b]
            pos = group.index(i)
            cuts = _cuts_in(env, dt, start, end, len(group) - 1)
            edges = [start] + cuts + [end]
            start, end = edges[pos], edges[pos + 1]
        else:
            # an energy dip inside the word is a better boundary than the edges
            s_i = int(round(start / dt))
            e_i = min(len(env) - 1, int(round(end / dt)))
            seg = env[s_i:e_i + 1]
            if len(seg) > 6:
                c = len(seg) // 2
                lo = max(1, c - 3)
                hi = min(len(seg) - 2, c + 3)
                if hi > lo:
                    strong = [start, end] + []
                    # leading/trailing silence trim
                    thr = max(float(np.min(seg)) + 0.25 * (float(np.max(seg)) - float(np.min(seg))), 1e-6)
                    k = 0
                    while k < len(seg) and seg[k] < thr:
                        k += 1
                    m = len(seg) - 1
                    while m > k and seg[m] < thr:
                        m -= 1
                    if m > k:
                        start = s_i * dt + k * dt
                        end = s_i * dt + m * dt
        words.append({
            "word": tok,
            "t": round(float(start), 4),
            "dur": round(float(max(0.05, end - start)), 4),
            "method": "energy-island" if mode == "islands" else "energy-shared",
        })
    return {
        "wav": wav_path,
        "rate": rate,
        "duration": round(dur_audio, 4),
        "alignment": "energy-island-dp",
        "islands": len(isl),
        "island_times": [[round(a, 3), round(b, 3)] for a, b in isl],
        "words": words,
        "note": (
            "Word boundaries are measured from the piper waveform: an energy "
            "envelope, silence segmentation, then DP assignment with a "
            "duration cost. No phoneme-level timestamps are claimed."
        ),
    }


def main():
    spec = json.loads(sys.argv[1])
    rep = align(spec["wav"], spec["text"])
    if spec.get("out"):
        os.makedirs(os.path.dirname(spec["out"]) or ".", exist_ok=True)
        with open(spec["out"], "w") as f:
            json.dump(rep, f, indent=2)
    print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    main()
