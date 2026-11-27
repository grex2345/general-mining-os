#!/usr/bin/env bash
# r11_finish.sh — encode the rendered frames, mux the mixed audio, burn word-synced captions.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
R=research/artifacts/round11
FR=${FRAMES_DIR:-/tmp/r11frames}
cp "$R/captions-final.ass" /tmp/r11caps.ass
echo "=== encode video (CRF17) ==="
$FF -y -hide_banner -loglevel error -framerate 30 -i "$FR/f%04d.png" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p /tmp/r11video.mp4
echo "=== mux audio + burn captions (CRF18) ==="
$FF -y -hide_banner -loglevel error -i /tmp/r11video.mp4 -i "$R/final-audio.wav" \
  -vf "subtitles=/tmp/r11caps.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest "$R/the-boy-who-chose-clay.mp4"
echo "=== probe ==="
studio/node_modules/@ffprobe-installer/linux-x64/ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of default=noprint_wrappers=1 "$R/the-boy-who-chose-clay.mp4"
ls -la "$R/the-boy-who-chose-clay.mp4"
