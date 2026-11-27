#!/usr/bin/env bash
# r16_finish.sh — Round 16 "Infinity Is A Coffin" (Gojo / Jujutsu Kaisen).
#
# Pictures: 2496 frames @30fps = 83.200s, rendered by r16_render.cjs.
# Audio:    research/artifacts/round16/final-audio.wav (83.200s), one continuous
#           narration take + word-anchored foley + arc score, mastered -14 LUFS.
#
# Hard rules learned from the R14 tail truncation:
#   * NEVER pass -shortest (it cut 47 frames off R14).
#   * Assert the DECODED frame count, not the container duration.
#   * Nothing in round13/ round14/ round15/ is written to.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
R16=research/artifacts/round16
FR=${FRAMES_DIR:-/tmp/r16frames}
OUT="$R16/infinity-is-a-coffin-r16.mp4"
EXPECT=2496

HAVE=$(ls "$FR"/f*.png 2>/dev/null | wc -l)
echo "frames present: $HAVE (expected $EXPECT)"
if [ "$HAVE" != "$EXPECT" ]; then echo "FRAME FILES MISSING — aborting"; exit 1; fi

# libass needs the caption face on the font path. The repo ships Inter; without
# this the burn silently falls back to DejaVu Sans.
mkdir -p ~/.fonts
cp studio/node_modules/@expo-google-fonts/inter/{400Regular,500Medium,600SemiBold,700Bold}/Inter_*.ttf ~/.fonts/ 2>/dev/null || true
cp "$R16/captions.ass" /tmp/r16caps.ass

echo "=== encode pictures (CRF17) ==="
$FF -y -hide_banner -loglevel error -framerate 30 -i "$FR/f%04d.png" \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p /tmp/r16video.mp4

echo "=== burn captions + mux the R16 master (no -shortest) ==="
$FF -y -hide_banner -loglevel error -i /tmp/r16video.mp4 -i "$R16/final-audio.wav" \
  -map 0:v:0 -map 1:a:0 -vf "subtitles=/tmp/r16caps.ass" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ac 2 -ar 48000 "$OUT"

echo "=== decoded frame-count assertion ==="
NV=$($FP -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")
VD=$($FP -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$OUT")
AD=$($FP -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$OUT")
echo "video frames: $NV (expected $EXPECT) | video duration: $VD | audio duration: $AD"
if [ "$NV" != "$EXPECT" ]; then echo "FRAME COUNT MISMATCH — aborting"; exit 1; fi

echo "=== probe ==="
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,channels,sample_rate \
  -of default=noprint_wrappers=1 "$OUT"

echo "=== loudness of the DELIVERED file ==="
$FF -hide_banner -nostats -i "$OUT" -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p'

echo "=== earlier deliverables must be untouched ==="
sha256sum research/artifacts/round13/film/the-bell-of-vellara.mp4 \
          research/artifacts/round14/film/the-bell-of-vellara-r14.mp4 \
          research/artifacts/round15/the-bell-of-vellara-r15.mp4

ls -la "$OUT"
sha256sum "$OUT"
