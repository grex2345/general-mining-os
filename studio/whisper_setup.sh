#!/usr/bin/env bash
# whisper_setup.sh — reproducible local whisper.cpp + ggml-small for REAL word
# timestamps (English AND Arabic/Darija). Round 9, tested end-to-end.
#
# Why this exists: huggingface.co and the whisper model CDNs are egress-blocked
# in this sandbox. Everything below comes from ALLOWED hosts only:
#   - codeload.github.com  -> whisper.cpp source (tag v1.8.2)
#   - pypi.org             -> cmake (build tool)
#   - api.github.com       -> ggml-small.bin as 6 committed parts (fmyIo/whisper-models,
#                             each <100 MB so the contents API serves raw bytes)
#
# Installs into /tmp (NOT the workspace: the 487 MB model must stay out of git
# and out of snapshots). Re-run after a sandbox reset.
#
# Verified model: 487,601,967 bytes
#   sha256 1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
set -euo pipefail

BIN=/tmp/wcpp/whisper.cpp-1.8.2/build/bin/whisper-cli
MODEL=/tmp/whisper-dl/ggml-small.bin

if [ ! -x "$BIN" ]; then
  pip install --break-system-packages --quiet cmake
  mkdir -p /tmp/wcpp
  curl -sL https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v1.8.2 -o /tmp/wcpp/src.tgz
  tar xzf /tmp/wcpp/src.tgz -C /tmp/wcpp
  (cd /tmp/wcpp/whisper.cpp-1.8.2 && cmake -B build -DCMAKE_BUILD_TYPE=Release \
     -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DBUILD_SHARED_LIBS=OFF \
     && cmake --build build -j"$(nproc)" --target whisper-cli)
fi

if [ ! -s "$MODEL" ]; then
  mkdir -p /tmp/whisper-dl && cd /tmp/whisper-dl
  for p in partaa partab partac partad partae partaf; do
    gh api "repos/fmyIo/whisper-models/contents/$p" -H "Accept: application/vnd.github.raw" > "$p"
  done
  cat partaa partab partac partad partae partaf > ggml-small.bin
  rm -f parta[a-f]
  echo "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b  ggml-small.bin" | sha256sum -c -
fi

echo "whisper ready:"
echo "  WHISPER_CLI=$BIN"
echo "  WHISPER_MODEL=$MODEL"
echo "usage: node -e \"import('./src/audiopipe.mjs').then(async m => console.log(await m.alignWords('voice.wav', 'script text', {lang:'ar'})))\""
