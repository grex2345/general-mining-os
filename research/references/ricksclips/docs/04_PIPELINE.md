# Pipeline: idea → uploaded Short

Video specs: 1080x1920, 30 fps. Frames are rendered by three.js in a browser (headless). Characters are 2D canvas
"cards" (600x1000 design, soles at y=975, card height 2.25 m) standing in a 3D world with ink, depth-of-field and grade passes.

## PC folders (example layout)
```
<Your shorts folder>\
  SFX\            real Mixkit sound effects (+ music)
  Voiceovers\     every generated voiceover is saved here too
  Projects\<Project>\
     Raw\         voice, previews, raw stuff
     Claude\      the render package (web/, render_pc.mjs, RENDER.bat, mix.wav, captions.ass, fonts/)
     Rendered\    final mp4
```
Add your own edit folder (e.g. for CapCut) if you like.

## Steps

1. **Script**: docs/02 + docs/03. Approve the script before any voice is generated.
2. **Voice** (one take only, say the cost first):
   `python3 tools/tts.py projects/<slug>/script.txt voice.mp3` prints the credit cost, then add `--yes`.
   Also save a copy to your `Voiceovers` folder.
3. **Tighten**: `python3 tools/tighten_voice.py voice.mp3 voice_tight.wav --speed 1.1`.
   Silence-only trimming (below -58 dB, 90 ms guards). **Never clip words.** The video may run longer instead.
4. **Timing**: `python3 tools/timing.py voice_tight.wav script.txt --out work` (faster-whisper word timestamps → words.json).
   Paste word start frames into `BEATS` in story.js (they drive nods, squashes and hops).
5. **Captions**: `python3 tools/captions.py work/words.json captions.ass --fix "boughs=bows"`. Read every word back.
6. **Cast**: design a NEW cast in `projects/<slug>/<slug>_cast.js` in the locked style, render a design sheet, and approve it.
   Then `python3 tools/build_toon.py projects/<slug>`.
7. **World + story**: `python3 tools/new_project.py <slug>` scaffolds it. Write the world section of main.js and story.js
   (SHOTS, camera keys K, LIGHTS, actorsAt with the performance layer, fxAt).
8. **Preview stills**: render one still from the middle of EVERY shot in the cloud (`node tools/render.mjs stills/x "f1,f2,..."`,
   ~3.5 s/frame) and build a contact sheet. Check: characters visible, faces in frame, nothing empty, something acting.
9. **Mix**: real music + SFX cue table (build a cue table: frame → sound file → level). Music ~14–15 dB under the voice, SFX -11..-17 dB,
   loudness -16 LUFS.
10. **Render on your own PC** (saves cloud usage): copy the package into `Projects\<Project>\Claude\`, set `LAST` (last frame)
    and `NAME` at the top of `RENDER.bat`, and double-click it. Edge (D3D11 on the GTX 1660), falling back to Brave → ~1 s/frame
    (100 s video ≈ 50 min). Glow, captions and audio are applied by ffmpeg in the same .bat. **Delete the old `frames` folder before a
    re-render** (RESUME=1 skips existing frames).

## Render notes
- render_pc.mjs: `chromium.launch({channel:'msedge', args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']})`, Brave
  executablePath fallback. The bundled Playwright Chromium download hangs on Windows, so don't use it.
- playwright@1.49.1 is installed by RENDER.bat once (no browser download).
- Cloud render (tools/render.mjs, swiftshader) is ~3.5 s/frame: only for checking stills.

## Retiming without clipping
If the voice had to be lengthened after frames were rendered: retime frames with blend/hold, and drop blends where the
99.5th-percentile frame difference is >40 (to avoid ghosting on cuts).
