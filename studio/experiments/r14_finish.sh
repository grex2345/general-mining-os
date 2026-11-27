#!/usr/bin/env bash
# r14_finish.sh — encode the Round 14 pictures and attach the Round 13 audio UNCHANGED.
#
# The audio is not re-encoded. The AAC stream is copied straight out of the delivered
# Round 13 MP4, so the finished Round 14 film carries bit-identical audio. That makes the
# two films a clean A/B: same voice, same mix, same captions, same 66.000 s — only the
# pictures differ. Nothing in research/artifacts/round13/ is written to.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
R13=research/artifacts/round13/film
R14=research/artifacts/round14/film
FR=${FRAMES_DIR:-/tmp/r14frames}
OUT="$R14/the-bell-of-vellara-r14.mp4"
mkdir -p "$R14"

# libass needs the captions reachable at a stable path; reuse the R13 file unmodified.
cp "$R13/captions.ass" /tmp/r14caps.ass

echo "=== encode pictures (CRF17) ==="
$FF -y -hide_banner -loglevel error -framerate 30 -i "$FR/f%04d.png" \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p /tmp/r14video.mp4

echo "=== burn captions + copy the delivered audio stream verbatim ==="
$FF -y -hide_banner -loglevel error -i /tmp/r14video.mp4 -i "$R13/the-bell-of-vellara.mp4" \
  -map 0:v:0 -map 1:a:0 -vf "subtitles=/tmp/r14caps.ass" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a copy -shortest "$OUT"

echo "=== probe ==="
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,channels,sample_rate \
  -of default=noprint_wrappers=1 "$OUT"

echo "=== audio must be byte-identical to the delivered film ==="
A13=$($FF -v error -i "$R13/the-bell-of-vellara.mp4" -map 0:a:0 -c:a copy -f md5 -)
A14=$($FF -v error -i "$OUT" -map 0:a:0 -c:a copy -f md5 -)
echo "R13 audio $A13"
echo "R14 audio $A14"
if [ "$A13" != "$A14" ]; then echo "AUDIO MISMATCH — aborting"; exit 1; fi
echo "audio identical: yes"

echo "=== the delivered Round 13 files must be untouched ==="
sha256sum "$R13/the-bell-of-vellara.mp4" "$R13/final-audio.wav"

ls -la "$OUT"
sha256sum "$OUT"
