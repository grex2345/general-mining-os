#!/usr/bin/env bash
# render.sh — render an HTML composition folder to MP4 with the local cell.
#
#   bash research/tools/browser/render.sh <dir-with-index.html> <out.mp4> [--fps 30] [--quality high]
#
# Why a wrapper: three environment variables and one shared-library path must all be
# right or the render fails with misleading errors (EACCES, "browser not found",
# blank frames). Nobody should have to rediscover that.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CELL="$ROOT/.scratch/chrome"

if [ ! -x "$CELL/bin-chromium" ]; then
  echo "render cell missing -> run: bash research/tools/browser/provision.sh" >&2
  exit 1
fi

DIR="${1:?usage: render.sh <composition-dir> <out.mp4> [--fps N] [--quality high]}"
OUT="${2:?missing output path}"
shift 2
FPS=30
QUALITY=high
while [ $# -gt 0 ]; do
  case "$1" in
    --fps) FPS="$2"; shift 2 ;;
    --quality) QUALITY="$2"; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$(dirname "$OUT")"

export LD_LIBRARY_PATH="$CELL/libs/lib:${LD_LIBRARY_PATH:-}"
export HYPERFRAMES_BROWSER_PATH="$CELL/bin-chromium"
export HYPERFRAMES_FFMPEG_PATH="$(node -e "console.log(require('$ROOT/studio/node_modules/@ffmpeg-installer/ffmpeg').path)")"
export HYPERFRAMES_FFPROBE_PATH="$CELL/node_modules/@ffprobe-installer/linux-x64/ffprobe"

exec node "$CELL/node_modules/hyperframes/bin/hyperframes.mjs" render "$DIR" \
  -o "$OUT" --fps "$FPS" -q "$QUALITY"
