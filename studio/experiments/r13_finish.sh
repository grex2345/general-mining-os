#!/usr/bin/env bash
# r13_finish.sh — encode the Round 13 frames, mux the mastered stereo mix, burn
# word-synced captions. Audio is already mastered to -14.55 LUFS / -2 dBTP, so
# there is NO loudnorm here: re-normalising would undo the bus balance.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
R=research/artifacts/round13/film
FR=${FRAMES_DIR:-/tmp/r13frames}
OUT="$R/the-bell-of-vellara.mp4"

# libass needs the font file reachable; copy captions to a stable path
cp "$R/captions.ass" /tmp/r13caps.ass

echo "=== encode video (CRF17) ==="
$FF -y -hide_banner -loglevel error -framerate 30 -i "$FR/f%04d.png" \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p /tmp/r13video.mp4

echo "=== mux mastered audio + burn captions (CRF18) ==="
$FF -y -hide_banner -loglevel error -i /tmp/r13video.mp4 -i "$R/final-audio.wav" \
  -vf "subtitles=/tmp/r13caps.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ac 2 -shortest "$OUT"

echo "=== probe ==="
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,channels,sample_rate -of default=noprint_wrappers=1 "$OUT"
echo "=== loudness of the delivered file ==="
$FF -hide_banner -nostats -i "$OUT" -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p'
ls -la "$OUT"
sha256sum "$OUT"
