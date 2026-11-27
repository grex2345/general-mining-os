"""Speed up the narration and remove dead air WITHOUT ever clipping a word.

Usage: python3 tools/tighten_voice.py voice.mp3 voice_tight.wav [--speed 1.1] [--keep 0.12]

How it works (this version never cuts a word):
- Optional atempo for speed. Prefer --speed 1.0: even 1.1x smears the voice. Shorten the script instead.
- A gap is only cut where the audio is below -58 dB (true silence), never from whisper timestamps.
- 90 ms of guard is left on both sides of every word, and each gap keeps at least --keep seconds.
- Word tails (breaths, soft consonants) live between -58 and -45 dB: an earlier -45 dB threshold cut them off.
Re-run tools/timing.py on the output afterwards so captions and BEATS match the new timing.
"""
import sys, subprocess, io, numpy as np, soundfile as sf

args = [a for a in sys.argv[1:] if not a.startswith("--")]
src, dst = args[0], args[1]
speed = float(sys.argv[sys.argv.index("--speed") + 1]) if "--speed" in sys.argv else 1.0
keep = float(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else 0.12
SR, THR_DB, GUARD, WIN = 48000, -58.0, 0.09, 0.01

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-af", f"atempo={speed}", "-ac", "1", "-ar", str(SR), "-f", "wav", "-"], capture_output=True).stdout
y, _ = sf.read(io.BytesIO(raw), dtype="float32")
n = int(WIN * SR); frames = len(y) // n
rms = np.sqrt(np.mean(y[: frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
loud = 20 * np.log10(rms) > THR_DB
# grow every loud frame by the guard so word edges are never touched
g = int(GUARD / WIN); keep_mask = np.convolve(loud.astype(int), np.ones(2 * g + 1, int), "same") > 0

out, i = [], 0
while i < frames:
    j = i
    while j < frames and keep_mask[j] == keep_mask[i]: j += 1
    seg = y[i * n: j * n]
    if not keep_mask[i] and 0 < i and j < frames:   # inner silence: shorten, but keep a natural gap
        k = min(len(seg), int(keep * SR)); h = k // 2
        seg = np.concatenate([seg[:h], seg[len(seg) - (k - h):]])
    out.append(seg); i = j
z = np.concatenate(out + [y[frames * n:]])
sf.write(dst, z, SR)
print(f"{len(y)/SR:.2f}s -> {len(z)/SR:.2f}s  (speed {speed}x, gaps kept >= {keep}s)")
