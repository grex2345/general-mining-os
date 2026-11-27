#!/usr/bin/env bash
# r14_compare.sh — side-by-side Round 13 vs Round 14 at IDENTICAL timestamps.
#
# Both films are 1980 frames at 30 fps and share the same audio, so frame N is the same
# story moment in both. Left column = Round 13 (delivered), right column = Round 14.
# This is the evidence that the pictures actually changed; metrics alone cannot show it.
#
# Usage: bash studio/experiments/r14_compare.sh [outdir]
set -euo pipefail
cd /home/user/general-mining-os
FF=studio/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
A=${R13_FRAMES:-/tmp/r13frames}
B=${R14_FRAMES:-/tmp/r14frames}
OUT=${1:-/tmp/r14qa}
mkdir -p "$OUT"

# Story moments worth comparing: bell macro, tower wide, forge, pour, stair climb,
# first tap, the twist, the cutaway, seating the bell, the ring, the cheer, the payoff.
FRAMES=(24 96 240 330 500 960 1320 1440 1650 1740 1830 1950)

i=0
INPUTS=()
FILTER=""
for n in "${FRAMES[@]}"; do
  f=$(printf "f%04d.png" "$n")
  if [ ! -f "$A/$f" ] || [ ! -f "$B/$f" ]; then echo "skip $f (missing)"; continue; fi
  INPUTS+=(-i "$A/$f" -i "$B/$f")
  FILTER+="[$i:v]scale=250:444,drawtext=text='R13  t=$(python3 -c "print(f'{$n/30:.2f}')")s':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6[a$i];"
  j=$((i+1))
  FILTER+="[$j:v]scale=250:444,drawtext=text='R14':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6[b$i];"
  FILTER+="[a$i][b$i]hstack=inputs=2[r$i];"
  i=$((i+2))
done

ROWS=$((i/2))
if [ "$ROWS" -eq 0 ]; then echo "no comparable frames"; exit 1; fi
CHAIN=""
for ((k=0;k<ROWS;k++)); do CHAIN+="[r$((k*2))]"; done
FILTER+="${CHAIN}vstack=inputs=$ROWS,pad=iw+12:ih+12:6:6:color=0x101014[v]"

$FF -y -hide_banner -loglevel error "${INPUTS[@]}" -filter_complex "$FILTER" -map "[v]" -frames:v 1 "$OUT/r13-vs-r14.png"
echo "wrote $OUT/r13-vs-r14.png ($ROWS story moments, R13 left / R14 right)"
