#!/usr/bin/env bash
# r15_finish.sh — Round 15: the stronger directed voice over the UNCHANGED Round 14 pictures.
#
# The narration timing grid is locked to Round 13 (verified 0.000000s beat drift), so the
# Round 14 frames, the burned captions and the lip-sync all remain valid and no re-render
# is needed. Only the voice performance and its master changed.
#
# Nothing in research/artifacts/round13/ or round14/ is written to.
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
FP=studio/node_modules/@ffprobe-installer/linux-x64/ffprobe
R15=research/artifacts/round15
FR=${FRAMES_DIR:-/tmp/r14frames}
OUT="$R15/the-bell-of-vellara-r15.mp4"

cp "$R15/captions.ass" /tmp/r15caps.ass

echo "=== encode pictures (CRF17) — same Round 14 frames ==="
$FF -y -hide_banner -loglevel error -framerate 30 -i "$FR/f%04d.png" \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p /tmp/r15video.mp4

echo "=== burn captions + mux the NEW stronger-direction master ==="
$FF -y -hide_banner -loglevel error -i /tmp/r15video.mp4 -i "$R15/final-audio.wav" \
  -map 0:v:0 -map 1:a:0 -vf "subtitles=/tmp/r15caps.ass" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ac 2 "$OUT"

echo "=== frame-count assertion (a truncated tail must never ship) ==="
NV=$($FP -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")
VD=$($FP -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$OUT")
echo "video frames: $NV (expected 1980), video duration: $VD"
if [ "$NV" != "1980" ]; then echo "FRAME COUNT MISMATCH — aborting"; exit 1; fi

echo "=== probe ==="
$FP -v error -show_entries format=duration,size:stream=codec_name,width,height,channels,sample_rate \
  -of default=noprint_wrappers=1 "$OUT"

echo "=== loudness of the delivered file ==="
$FF -hide_banner -nostats -i "$OUT" -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p'

echo "=== earlier deliverables must be untouched ==="
sha256sum research/artifacts/round13/film/the-bell-of-vellara.mp4 \
          research/artifacts/round14/film/the-bell-of-vellara-r14.mp4

ls -la "$OUT"
sha256sum "$OUT"
