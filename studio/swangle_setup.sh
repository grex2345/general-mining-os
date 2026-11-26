#!/usr/bin/env bash
# swangle_setup.sh — reproducible headless WebGL2 / three.js in THIS sandbox.
# Round 9: OVERTURNS the earlier "headless WebGL impossible" dead-end.
#
# Verified working: @sparticuz/chromium (npm, allowed registry) bundles Chromium
# + SwiftShader; its al2023.tar.br carries the nspr/nss libs the sandbox lacks.
# Flags --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader give:
#   WebGL 2.0, renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))"
#   three.js 720x1280 renders verified by screenshot (research/artifacts/round9/
#   swangle-three-test.png). This validates the Stick3D pack's --gl=swangle claim.
#
# Installs into /tmp/swangle (node_modules stay out of git/snapshots).
set -euo pipefail
mkdir -p /tmp/swangle && cd /tmp/swangle
[ -f package.json ] || npm init -y >/dev/null
npm install --no-audit --no-fund @sparticuz/chromium puppeteer-core three@0.149.0
# extract the bundled AL2023 nspr/nss libs next to the chromium binary
node -e "
const zlib=require('zlib'),fs=require('fs');
fs.writeFileSync('/tmp/al2023.tar', zlib.brotliDecompressSync(fs.readFileSync('/tmp/swangle/node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
"
mkdir -p /tmp/al2023 && tar xf /tmp/al2023.tar -C /tmp/al2023
echo "swangle ready. Run the proof:"
echo "  LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp SWANGLE_DIR=/tmp/swangle node studio/experiments/swangle_test.cjs"
