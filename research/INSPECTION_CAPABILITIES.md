# What I can actually inspect — tested capability matrix

Session: Phase 3, branch `arena/9d597f99-general-mining-os`.
Every line below was **executed in this sandbox**, not inferred from documentation.
Probe artifacts lived in `research/fmtprobe/` and were deleted after the results were recorded here.

## Matrix

| Input | Can I do it? | Method | Evidence |
|---|---|---|---|
| PNG / JPG / WEBP | **Yes, natively** | `read_file` returns the image for direct viewing | Viewed `image-1.png`, `image-2.png`, `t.jpg`, `t.webp`, `titles.png` |
| SVG | Yes, but **not directly** | Rasterise via `@napi-rs/canvas` `loadImage(Buffer)` then `read_file` the PNG | `probe.svg` → `svg-rendered.png`, 400×200, read correctly |
| Animated GIF | **Frames yes, motion no** | Convert to PNG frames (`ffmpeg`), view frames | `anim.gif` displayed only its first frame at low res |
| MP4 / any video | **Frames yes, motion no** | `ffmpeg -ss T -frames:v 1` for a frame; `fps=1,scale,tile=6x2` for a storyboard contact sheet | `vid-frame.jpg`, `storyboard.jpg` from `mining-weekly-01.mp4` |
| Audio (wav/mp3) | **No** | `read_file` → `unsupported audio/wav` | Only numbers via `ffprobe`, `ebur128`, `loudnorm`, `showspectrumpic`/`showwavespic` (spectrograms are pictures I *can* see, but they are not hearing) |
| PDF | **Text yes, page images no** | Page fetcher parses the PDF text (tested on arXiv 2308.04079, 11 chunks). Local PDF: `read_file` → `unsupported application/pdf`; no `pdftotext`/`pdftoppm`, ImageMagick `convert` present but no PDF delegate check | arXiv paper read as text |
| Arbitrary website screenshot | **No** | No Chromium/Playwright browsers obtainable | — |
| Platform login (YouTube/IG/X) | **No** | — | — |

## Network reachability (curl, m, HTTP code)

```
200  github.com
200  api.github.com            <-- API v3
200  codeload.github.com       <-- source tarballs
200  registry.npmjs.org
200  nodejs.org
200  raw.githubusercontent.com (via page fetcher only; curl = 000, 0/8 retries)
200  arxiv.org/pdf/...         <-- papers as text
000  raw.githubusercontent.com (curl)
000  huggingface.co, hf-mirror.com
000  cdn.jsdelivr.net, cdnjs.cloudflare.com
000  release-assets.githubusercontent.com, objects.githubusercontent.com
```

### The single most useful discovery

`api.github.com/repos/{owner}/{repo}/contents/{path}` returns file bodies
**base64-inlined up to 1,000,000 bytes**. That means almost every repo screenshot,
still, diagram and contact sheet can be decoded to disk and *viewed directly*:

```python
d = json.load(urllib.request.urlopen(
    "https://api.github.com/repos/kunalkushwaha/vsim/contents/docs/media/titles.png"))
open("titles.png","wb").write(base64.b64decode(d["content"]))   # 17,986 B -> viewed
```

Above 1 MB, the API response carries no `content`; `download_url` points at
`raw.githubusercontent.com` which `curl` cannot reach, and the page fetcher
reaches only *text* raw URLs (an image raw URL fails). Workaround for large stills:
`ffmpeg -vf scale=...` a downscaled copy out of the repo tarball (`codeload`, HTTP 200),
so the 1 MB API ceiling is not a hard limit for anything already cloned.

## Consequences for Phase 3 research

1. **Reference visuals are obtainable at scale.** Between uploaded screenshots, the
   GitHub contents API, and tarball clones, I can see the actual output of a project —
   not just its README claims. This is the difference between "discovered" and "inspected".
2. **Motion must be judged from sampled stills.** I will never write "I watched the video".
   Correct phrasing: "sampled N frames at 1 fps".
3. **Voice quality cannot be judged by ear.** Any TTS decision I make is on measurable
   grounds only (prosody variance, F0 range, phoneme duration, spectral figures).
4. **Papers are readable as text** (arXiv PDFs parse), so techniques can be sourced
   from primary literature, not blog summaries.

## Two real defects this probing found in the *already-approved* output

Sampling frames of `studio/out/mining-weekly-01.mp4` exposed issues that the
100/100 automated score did not catch:

- **t ≈ 6.8 s** — the karaoke caption box ("It fell to **912 EH/s**,") overlaps the
  chart's x-axis date row ("Nov 3 / Nov 9 / Nov 14 / Nov 21"). Text-on-text collision.
- **Scene 02 holds a near-static frame for ~6 s** — frames at 1 fps are pixel-wise
  almost identical from t=0 to t=5. Long dead holds read as low production value
  on a Shorts feed.

Both are measurable, so both become automatic QA gates (see next round):
caption/axis bounding-box intersection, and a frame-difference "motion energy" floor.
