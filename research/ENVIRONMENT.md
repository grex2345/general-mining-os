# Environment — measured facts, not assumptions

Sandbox: Debian-like, **2 CPU cores, 3 GB RAM, 19 GB free disk**, Python 3.11.2, Node 22.22.3,
ImageMagick `convert` present, **no** `pdftotext`/`pdftoppm`/`tesseract`, no apt repositories.

Every line below was verified by execution. When a probe contradicts an older belief, the
line says so explicitly, because a wrong environment belief poisons every later decision.

## Network

```
200  github.com            api.github.com       codeload.github.com
200  registry.npmjs.org    pypi.org             nodejs.org
200  arxiv.org/pdf/...     threejs.org          (page fetcher also reaches threejs docs)
000  raw.githubusercontent.com (curl)           <-- but see note below
000  huggingface.co, hf-mirror.com
000  cdn.jsdelivr.net, cdnjs.cloudflare.com
000  release-assets.githubusercontent.com, objects.githubusercontent.com
000  deb.debian.org, archive.ubuntu.com  (so: no apt installs)
000  cdn.playwright.dev, storage.googleapis.com, playwright.azureedge.net
```

**The page fetcher reaches text on `raw.githubusercontent.com` even though `curl` gets 000.**
Verified: fetched `vsim/README.md` (3 chunks) and `vsim/package.json` while `curl` returned
000 on 8/8 retries. It is *not* stable for binary (an image raw URL returned HTTP 500), and
retrying did not make `curl` work — treat it as a text-only side door, not a network rule.

**`api.github.com` inlines file bodies up to 1,000,000 bytes as base64.** That is how repo
screenshots get inspected: decode to disk, then view. Above 1 MB, fall back to the
`codeload.github.com` tarball (HTTP 200) and downscale locally.

## Runtimes

| thing | state |
|---|---|
| WebGL (headless, ANGLE/SwiftShader) | **unavailable** — `eglInitialize SwANGLE failed`, Vulkan `-3`; see ledger `webgl-swiftshader` |
| Chromium (via `@sparticuz/chromium`) | **works**, version 158.0.8127.0, screenshot ~300 ms for 1080×1920 |
| DOM / CSS / canvas2d / SVG rendering | **works** — gradients, `background-clip:text`, `backdrop-filter`, `box-shadow`, `@font-face`, filters |
| GSAP timeline seeking | **works** — deterministic per-frame seek verified over 60 frames |
| HyperFrames HTML→MP4 | **works**, ~68 ms/frame at 1080×1920, static-frame dedup skips dead holds |
| Skia software 3D (`studio/src/render3d.mjs`) | works, 123–148 ms/frame at 1080×1920 |
| Neural TTS (kokoro-js) | runtime loads, **weights unreachable** (~327 MB on blocked hosts) |
| Blender / `bpy` | not installed; 3 GB RAM and no GPU make it impractical even though pypi is reachable |

## Consequences that shape the architecture

1. **No WebGL ⇒ no three.js.** Any reference whose value depends on three.js can be
   *studied* but not *run* here. That is why the browser cell is valuable for typography,
   layout, CSS compositing and canvas2d, while 3D has to come from our own Skia rasteriser.
2. **A browser that only does 2D is still a huge unlock** — it is the difference between
   hand-placing text with `measureText` and getting real shaping, wrapping, gradients,
   blurs and SVG for free.
3. **Two cores means per-frame cost matters.** 60 frames at 68 ms is 4 s; at 2 040 ms
   (vsim) it is 2 minutes. Anything over ~300 ms/frame is a design problem, not a tuning
   problem.
4. **`npm install` can fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`** — `--ignore-scripts`
   works around it and also skips native rebuilds.
