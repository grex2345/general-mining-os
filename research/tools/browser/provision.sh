#!/usr/bin/env bash
# provision.sh — build the HTML->MP4 render cell from scratch, idempotently.
#
# Everything here was discovered by probing a sandbox that blocks every browser CDN
# (playwright.dev, storage.googleapis.com, jsdelivr, cdnjs, raw.githubusercontent).
# The only reachable registry is registry.npmjs.org, so the entire cell is npm-only,
# and the Chromium binary itself ships *inside* a tarball that npm can deliver.
#
#   bash research/tools/browser/provision.sh          # install + verify
#   bash research/tools/browser/provision.sh --force  # rebuild from scratch
#
# Installs into .scratch/chrome (gitignored, NOT part of the repo).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CELL="$ROOT/.scratch/chrome"
FORCE="${1:-}"

say() { printf '\033[36m%s\033[0m\n' "$*"; }
ok()  { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
bad() { printf '\033[31m  ✗ %s\033[0m\n' "$*"; }

if [ "$FORCE" = "--force" ]; then rm -rf "$CELL"; fi
mkdir -p "$CELL"
cd "$CELL"

# ---------------------------------------------------------------- 1. packages
if [ ! -d node_modules/@sparticuz/chromium ]; then
  say "installing Chromium (npm-only evidence: @sparticuz/chromium ships the binary in-tarball)"
  npm init -y >/dev/null 2>&1 || true
  npm install --no-audit --no-fund @sparticuz/chromium >/dev/null
  ok "@sparticuz/chromium"
fi

for pkg in puppeteer-core gsap @ffprobe-installer/ffprobe hyperframes; do
  if [ ! -d "node_modules/${pkg%%/*}" ]; then
    say "installing $pkg"
    # --ignore-scripts matters: hyperframes pulls onnxruntime-node whose postinstall
    # tries to fetch a CUDA build from github releases and fails here. The JS-only
    # render path does not need it.
    npm install --no-audit --no-fund --ignore-scripts "$pkg" >/dev/null 2>&1 || npm install --no-audit --no-fund "$pkg" >/dev/null
    ok "$pkg"
  fi
done

# ffprobe arrives without its executable bit; hyperframes fails with "EACCES" that
# looks like a permissions bug in our own code. It is not.
chmod +x node_modules/@ffprobe-installer/linux-x64/ffprobe 2>/dev/null || true

# ---------------------------------------------------------------- 2. chromium
if [ ! -f "$CELL/bin-chromium" ]; then
  say "extracting Chromium"
  node --input-type=module -e "
    import Chromium from '@sparticuz/chromium';
    import fs from 'node:fs';
    const p = await Chromium.executablePath();
    fs.copyFileSync(p, 'bin-chromium');
    fs.chmodSync('bin-chromium', 0o755);
  " >/dev/null
  ok "bin-chromium ($(du -h bin-chromium | cut -f1))"
fi

# The binary needs libnspr4/libnss3, which this image does not have and apt cannot
# fetch (deb.debian.org unreachable). They are inside the same AL2023 archive that
# the package only extracts when it thinks it is on Lambda -- so we decompress it.
if [ ! -f "$CELL/libs/lib/libnspr4.so" ]; then
  say "extracting AL2023 shared libraries (libnspr4/libnss3)"
  node --input-type=module -e "
    import fs from 'node:fs'; import zlib from 'node:zlib';
    const br = 'node_modules/@sparticuz/chromium/bin/al2023.tar.br';
    fs.writeFileSync('al2023.tar', zlib.brotliDecompressSync(fs.readFileSync(br)));
  "
  mkdir -p libs && tar -xf al2023.tar -C libs && rm -f al2023.tar
  ok "libs/ ($(ls libs/lib | wc -l) libraries)"
fi

# ---------------------------------------------------------------- 3. verify
say "verifying Chromium"
export LD_LIBRARY_PATH="$CELL/libs/lib:${LD_LIBRARY_PATH:-}"
VER="$(./bin-chromium --version 2>/dev/null || true)"
if [ -n "$VER" ]; then ok "$VER"; else bad "Chromium will not start"; exit 1; fi

say "verifying headless screenshot + DOM/CSS compositing"
# ESM resolves bare imports relative to the *script file*, not the cwd, so the smoke
# test must physically live inside the cell where puppeteer-core is installed.
cp "$ROOT/research/tools/browser/smoke.mjs" "$CELL/smoke.mjs"
(cd "$CELL" && KB_ROOT="$ROOT" node smoke.mjs) || { bad "smoke test failed"; exit 1; }

say "checking WebGL (expected: absent -- documented in research/ENVIRONMENT.md)"
node --input-type=module -e "
  import puppeteer from 'puppeteer-core';
  const b = await puppeteer.launch({executablePath:'$CELL/bin-chromium', headless:true,
    args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox',
          '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir=/tmp/cr-prov'],
    env:{...process.env}});
  const p = await b.newPage();
  const r = await p.evaluate(()=>{const c=document.createElement('canvas');
    const gl=c.getContext('webgl2')||c.getContext('webgl');
    return gl ? 'WebGL available: '+gl.getParameter(gl.VERSION) : 'WebGL absent';});
  console.log('  · '+r);
  await b.close();
" 2>/dev/null || true

cat <<EOF

$(printf '\033[32m%s\033[0m' "Render cell ready.")

  CELL=$CELL
  export LD_LIBRARY_PATH="$CELL/libs/lib:\$LD_LIBRARY_PATH"
  export HYPERFRAMES_BROWSER_PATH="$CELL/bin-chromium"
  export HYPERFRAMES_FFMPEG_PATH="\$(node -e "console.log(require('$ROOT/studio/node_modules/@ffmpeg-installer/ffmpeg').path)")"
  export HYPERFRAMES_FFPROBE_PATH="$CELL/node_modules/@ffprobe-installer/linux-x64/ffprobe"

The wrapper 'research/tools/browser/render.sh' sets all of these for you.
EOF
