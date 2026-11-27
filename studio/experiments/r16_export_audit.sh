#!/usr/bin/env bash
# r16_export_audit.sh — verify the DELIVERED MP4, not the sources.
#
# The user's rule: check the final exported file. This pulls the audio back out of
# the finished MP4, re-runs ASR on it, and compares the recovered transcript with the
# verbatim script word for word. If a syllable were clipped, masked or dropped by the
# mix or the AAC encode, it would show up here as a missing or substituted word.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
R16=research/artifacts/round16
MP4=${1:-"$R16/infinity-is-a-coffin-r16.mp4"}
CLI=/tmp/wcpp/whisper.cpp-1.8.2/build/bin/whisper-cli
MODEL=/tmp/whisper-dl/ggml-small.bin

echo "=== pull the audio back OUT of the delivered MP4 ==="
$FF -y -hide_banner -loglevel error -i "$MP4" -vn -ac 1 -ar 48000 -c:a pcm_s16le /tmp/r16_export_audio.wav
$FP -v error -show_entries format=duration:stream=codec_name,channels,sample_rate -of default=noprint_wrappers=1 "$MP4"

echo "=== re-transcribe the exported audio (read-only ASR) ==="
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp "$CLI" -m "$MODEL" -f /tmp/r16_export_audio.wav \
  -l en -t 6 -oj -of /tmp/r16_export_asr -np 2>/tmp/r16_asr.log || { tail -5 /tmp/r16_asr.log; exit 1; }

/tmp/rqa/bin/python - <<'PY'
import json, re, wave, numpy as np
R = 'research/artifacts/round16/'
script = open(R + 'script.txt').read()
def norm(s):
    return re.sub(r"[^a-z0-9' ]", ' ', s.lower()).split()
want = norm(script)
asr = json.load(open('/tmp/r16_export_asr.json'))
segs = asr.get('transcription', asr.get('segments', []))
heard = norm(' '.join(s.get('text', '') for s in segs))
# word-level alignment (Levenshtein) so we can name every miss, not just a score
n, m = len(want), len(heard)
d = [[0] * (m + 1) for _ in range(n + 1)]
for i in range(n + 1): d[i][0] = i
for j in range(m + 1): d[0][j] = j
for i in range(1, n + 1):
    for j in range(1, m + 1):
        d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (want[i-1] != heard[j-1]))
i, j = n, m; ops = []
while i > 0 or j > 0:
    if i > 0 and j > 0 and d[i][j] == d[i-1][j-1] + (want[i-1] != heard[j-1]):
        if want[i-1] != heard[j-1]: ops.append(('SUB', want[i-1], heard[j-1]))
        i -= 1; j -= 1
    elif i > 0 and d[i][j] == d[i-1][j] + 1:
        ops.append(('DEL', want[i-1], '')); i -= 1
    else:
        ops.append(('INS', '', heard[j-1])); j -= 1
ops.reverse()
wer = d[n][m] / max(1, n)
print(f"script words: {n}   recovered words: {m}   word error rate: {wer*100:.2f}%")
print(f"exact recoveries: {n - sum(1 for o in ops if o[0] in ('SUB','DEL'))}/{n}")
if ops:
    print("differences (ASR on a compressed mix is not a transcript oracle; listed in full):")
    for k, a, b in ops: print(f"   {k}  script={a!r}  heard={b!r}")
else:
    print("EVERY script word recovered from the exported MP4 audio, in order.")

w = wave.open('/tmp/r16_export_audio.wav', 'rb'); sr = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
print(f"\nexported audio: {len(a)/sr:.3f}s  peak {20*np.log10(np.abs(a).max()):.2f} dBFS  clipped {(np.abs(a)>=0.9995).sum()}")
loc = np.abs(a[1:-1] - (a[:-2] + a[2:]) / 2)
wf = int(0.02 * sr); nf = len(a) // wf
energy = np.sqrt((a[:nf*wf].reshape(nf, wf) ** 2).mean(1))
clicks = [i / sr for i in (np.where(loc > 0.08)[0] + 1) if i // wf < nf and energy[i // wf] < 0.02]
print(f"click candidates in quiet frames: {len(clicks)}")
z = (np.abs(a) < 1e-6).astype(np.int8); dd = np.diff(np.concatenate(([0], z, [0])))
s = np.where(dd == 1)[0]; e = np.where(dd == -1)[0]
runs = [(x / sr, (y - x) / sr) for x, y in zip(s, e) if (y - x) / sr > 0.12]
print(f"digital-silence runs >120ms: {len(runs)} ({sum(x[1] for x in runs):.3f}s)")
C = json.load(open(R + 'scene-cues.json'))['cues']; ks = list(C.items())
dbs = []
for i, (k, v) in enumerate(ks):
    t0 = v['t']; t1 = min(ks[i+1][1]['t'] if i + 1 < len(ks) else 81.653, 81.653)
    seg = a[int(t0*sr):int(t1*sr)]
    if len(seg) < wf: continue
    fr = seg[:len(seg)//wf*wf].reshape(-1, wf); en = np.sqrt((fr*fr).mean(1))
    dbs.append(20*np.log10(en[en >= np.percentile(en, 60)].mean() + 1e-9))
st = np.abs(np.diff(dbs))
print(f"exported sentence-level steps: mean {st.mean():.2f} dB  max {st.max():.2f} dB  >3dB {(st>3).sum()}/{len(st)}")
json.dump({'scriptWords': n, 'recoveredWords': m, 'wer': wer, 'ops': ops,
           'durationSec': len(a)/sr, 'clipped': int((np.abs(a)>=0.9995).sum()),
           'clicks': len(clicks), 'silenceRuns': runs,
           'sentenceSteps': {'mean': float(st.mean()), 'max': float(st.max()), 'over3': int((st>3).sum()), 'n': len(st)}},
          open(R + 'export-audio-audit.json', 'w'), indent=2)
PY

echo "=== pull frames back OUT of the delivered MP4 for visual QC ==="
mkdir -p /tmp/r16qc
$FF -y -hide_banner -loglevel error -i "$MP4" -vf "fps=1/3,scale=240:-1,tile=7x4" -frames:v 1 /tmp/r16qc/export_sheet.png
echo "wrote /tmp/r16qc/export_sheet.png"
