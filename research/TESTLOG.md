# TESTLOG — verbatim test evidence

All commands were run in this sandbox on 2026-11-25. Node v22.22.3, npm 10.9.8, Python 3.x, **no ffmpeg, no Chrome**.

---

## T1. HyperFrames CLI reachable

```
$ npx --yes hyperframes@0.9.94 --version
0.9.94

$ npx --yes hyperframes@0.9.94 --help
hyperframes v0.9.94 — Create and render HTML video compositions
  init / add / capture / catalog / preview / present / share / publish / render / open / catch-up
  lint / check / validate / beats / audio / inspect / keyframes / snapshot / media-treatment /
  normalize-audio / grade-compare / compare / diff / measure / reverse / templates / info /
  compositions / timeline / history / docs / billing
```
**Result:** PASS — CLI installs and runs (npmjs CDN allowed).

---

## T2. Project scaffold + static gates

```
$ npx --yes hyperframes@0.9.94 init hftest --skip-skills
  … cd hftest && npm run dev / check / render …
→ index.html, meta.json, AGENTS.md, CLAUDE.md, hyperframes.json, package.json

$ cd hftest && npx hyperframes@0.9.94 check --json
  "hdr": { "autoPromotion": null, "inspection": "available" },
  "saved": { "report": "/tmp/hftest/.hyperframes/artifacts/checks/4819fe8d-….json" }
[hyperframes] check: report saved …
```
**Result:** PASS (no errors).

---

## T3. Render path — BLOCKED (environmental)

```
$ npx hyperframes@0.9.94 snapshot --at 0,5
✗ Snapshot failed: Failed to install chrome-headless-shell 158.0.8127.88: All providers failed …
  No Chrome or Chromium was found on this machine. Install Google Chrome, then set HYPERFRAMES_BROWSER_PATH …

$ npx hyperframes@0.9.94 render -o out.mp4 --fps 30 -q high
   30fps · high · auto workers (2 cores usable)
   GPU: browser GPU (auto-detect)
✗  Chrome not found
@hf-diagnostic {"version":1,"operation":"render","code":"RENDER_FAILED"}
```
**Result:** FAIL — cannot be fixed in this sandbox (TLS reset to Chrome CDN). Consequence: **no pixel-level verification is claimed anywhere in the report.**

FFmpeg is also unavailable: `apt-get install -y ffmpeg` → *"Could not open lock file /var/lib/dpkg/lock-frontend … Are you root?"*; `npm i ffmpeg-static` → `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

---

## T4. Registry reachability + registry URL rule

```
$ npx hyperframes@0.9.94 add bar-chart-race
Item "bar-chart-race" not found — registry unreachable or empty. The registry could not be read:
fetch failed (Client network socket disconnected before secure TLS connection was established [ECONNRESET])

$ curl -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/.../registry/registry.json
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL

# with registry set to file:///…/hyperframes/registry
Item "bar-chart-race" not found — … Registry URLs must be an absolute https:// URL
without credentials or fragments
```
**Result:** registry requires network + `https://`. **Finding:** no offline/air-gapped registry support → a production system needs an HTTPS mirror of a pinned registry.

---

## T5. artem skill template → HyperFrames composition

```
# injected the skill's DEFAULTS spec into template.html (__SPEC__ / __DURATION__)
$ cd graphproj && npx hyperframes@0.9.94 lint .
◆  Linting graphproj/index.html
◇  0 errors, 0 warnings

$ npx hyperframes@0.9.94 compositions
◇  graphproj — 1 composition
   main   4.0s   1080×1920   0 elements

$ npx hyperframes@0.9.94 timeline --json
{ "timeline": { "duration": 4, "tracks": [] } }
```
**Result:** PASS on validity; **finding:** elements are not declared as timed clips → `0 elements / 0 tracks` → limited Studio editability (render-valid but not fully editable).

---

## T6. Registry block library — lint audit (123 blocks)

Method: copy `registry/blocks/<name>/<name>.html` → `/tmp/blocktest/p/<name>/index.html`, run `npx hyperframes@0.9.94 lint .` in each.

```
prepared 210 blocks (87 have no single .html entry point → not testable this way)
…
[TOTALS] blocks linted: 123 | 0 errors: 99 | with errors: 24
```
The 24 failing blocks and the errors (sample, verbose):

```
$ cd p/heygen-avatar-promo-card && npx hyperframes@0.9.94 lint . --verbose
  ✗ audio_src_not_found: <audio> element references file(s) not found: assets/bgm.m4a.
    The rendered video will be silent.
    Fix: Add the file "assets/bgm.m4a" …
  ✗ missing_local_asset: <img> references local file(s) not found: assets/heygen-logo.svg …
  ✗ missing_local_asset: <video> references local file(s) not found: assets/av_r1k1.mp4, av_r1k3.mp4, …
```
Failing: ai-chat-reveal, apple-money-count, blue-sweater-intro-video, editorial-flash-overlay, freeze-frame-dressing, heygen-avatar-promo-card, instagram-follow, ios26-liquid-glass, liquid-glass-notification, liquid-glass-widgets, macos-tahoe-liquid-glass, message-thread-reveal, north-korea-locked-down, notes-reveal, notification-cascade, nyc-paris-flight, organic-light-leak-overlay, share-sheet-carousel, snow, starfield, tiktok-follow, vfx-text-cursor, vpn-youtube-spot, yt-lower-third.

`check --json` on blocks also emits `composition_file_too_large` and `nested_structure_needs_subcomposition` warnings plus `check_runtime_failure` (needs Chrome).

**Result:** 80.5 % of testable blocks are clean; all failures are **missing media**, i.e. blocks are components you must feed.

---

## T7. artem skills 2..8 — lint sweep

```
graph                : ◇  0 errors, 0 warnings
minimalistic-graphics: ◇  0 errors, 0 warnings
dan-koe              : ◇  0 errors, 0 warnings
kurzgesagt           : ◇  0 errors, 0 warnings
map-route            : ◇  1 error(s), 1 warning(s)
breakdown            : ◇  1 error(s), 1 warning(s)
low-poly             : ◇  1 error(s), 2 warning(s)
minecraft            : ◇  1 error(s), 2 warning(s)

$ cd low-poly && npx hyperframes@0.9.94 lint .
  ✗ missing_timeline_registry: Missing `window.__timelines` registration.
    Fix: Register each composition timeline on `window.__timelines[compositionId]`.
```
**Result:** 4/8 clean. The 3D templates need the timeline-registration fix (and asset paths) before they satisfy the full contract.

---

## T8. Network surface actually available

| Host | Status |
|---|---|
| github.com, api.github.com, codeload.github.com | OK |
| registry.npmjs.org (+ CDN tarballs) | OK |
| raw.githubusercontent.com | **blocked** (TLS reset) |
| Chrome for Testing / headless-shell CDN | **blocked** |
| pypi.org | not needed this phase |

---

## T9. Searches performed

54 GitHub search queries via `research/tools_gh_search.py` (cached as 54 response files in `research/raw/`). Full query list is recoverable from each JSON's `_query` field:

```
jq -r '._query' research/raw/*.json | sort -u
```

Query themes: claude/agent skills × {animation, video, motion graphics, kinetic typography};
topics {claude-skills, agent-skills, remotion, manim, video-generation, motion-graphics,
video-editing, subtitle, text-to-speech}; style families {low-poly, minecraft, voxel, stickman,
cartoon, anime, isometric, whiteboard, bar-chart-race, data-viz, infographic, map, scientific};
systems {agentic video production, cinematic pipeline, faceless youtube, explainer video};
audio/voice {tts, voice cloning, music generation, sound design, foley, LUFS};
editing {auto caption, karaoke captions, ffsubsync, clip factory, thumbnail, youtube upload};
interop {OpenTimelineIO, MCP video servers, video understanding}.
```
