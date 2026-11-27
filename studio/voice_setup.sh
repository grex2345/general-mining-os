#!/usr/bin/env bash
# voice_setup.sh — one-time install of the speech stack.
#
# Everything lands in studio/. voice artifacts are downloaded from PyPI and from
# a MIT-licensed GitHub repo, because huggingface.co and the ms/edge TTS
# endpoints are unreachable from this sandbox (verified: HTTP 000).
#
#   pip3 install --target lib  espeakng-loader      -> libespeak-ng + data (timing)
#   pip3 install --target lib_piper piper-tts onnxruntime -> neural TTS runtime
#   gh api .onnx from Mobile-Artificial-Intelligence/babylon (MIT) -> the voice
set -euo pipefail
cd "$(dirname "$0")"

[ -d lib/espeakng_loader ] || pip3 install --quiet --target ./lib espeakng-loader
[ -d lib_piper/piper ]     || pip3 install --quiet --target ./lib_piper piper-tts onnxruntime

mkdir -p piper
if [ ! -s piper/amy.onnx ]; then
  gh api "repos/Mobile-Artificial-Intelligence/babylon/contents/scripts/piper/en_US-amy-medium.onnx" \
     -H "Accept: application/vnd.github.raw" > piper/amy.onnx
fi
if [ ! -s piper/amy.json ]; then
  gh api "repos/Mobile-Artificial-Intelligence/babylon/contents/scripts/piper/en_US-amy-medium.onnx.json" \
     -H "Accept: application/vnd.github.raw" > piper/amy.json
fi
echo "voice stack ready: $(du -sh lib lib_piper piper 2>/dev/null | tr '\n' ' ')"
