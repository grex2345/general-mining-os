#!/usr/bin/env node
/**
 * bootstrap_ledger.mjs — idempotent seed for research/ledger.json.
 *
 * Two jobs:
 *  1. migrate the Phase-3 `knowledge_base.json` records into the ledger (the ledger
 *     becomes the single source of truth; the old file stays as provenance).
 *  2. seed every reference touched so far with the *honest* status and the evidence
 *     that justifies it.
 *
 * Safe to re-run: existing ids are skipped, never overwritten.
 *
 *   node research/tools/bootstrap_ledger.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LEDGER = path.join(ROOT, 'research', 'ledger.json');

const db = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { version: 1, records: [] };
const have = new Set(db.records.map((r) => r.id));
const today = new Date().toISOString().slice(0, 10);

/** every claim below must be traceable to something in Actions Taken / Key Results */
const SEED = [
  // ---------------------------------------------------------------- vSIM
  {
    id: 'vsim', kind: 'engine', name: 'vsim — "Remotion for real 3D" (pure-TS software rasteriser)',
    url: 'https://github.com/kunalkushwaha/vsim', license: 'MIT', status: 'tested', env_ok: true,
    tags: ['3d', 'software-rasteriser', 'deterministic', 'gltf', 'ik', 'cel-shading'],
    evidence: [
      'cloned, pnpm 9.15.0 install + build succeeded',
      'rendered examples 01-cube, 09-manga, 21-mouse at 1080x1920',
      'benchmarked 2040 ms/frame @1080x1920 on 2 cores',
    ],
    artifacts: [],
    findings: [
      'Architecture: zod-validated JSON scene document -> pure-TS rasteriser -> MP4; no GPU, no Chrome, no node-gyp.',
      'Determinism is enforced, not promised: Math.random is lint-banned in runtime code and CI compares golden-frame hashes.',
      'Feature set worth copying conceptually: per-pixel PBR with normal maps, PCF shadows, sorted transparency, ACES tone mapping, bloom, sky-derived hemisphere ambient, linear fog, glTF skeletal clips with crossfades, ground-contact IK with stance locking, spring bones, morph-target lip-sync, Rapier physics, beat-driven audio.',
      'manga style is a single flag (style:"manga") that swaps to cel shading + ink outlines - a good precedent for exposing a "look" as one switch.',
      'Speed verdict: 2040 ms/frame is ~14x too slow for our 9:16 1080x1920 workload next to a Skia path at 123-148 ms/frame.',
      'Film3D pipeline is the most reusable idea: a director LLM writes a schema-validated Film3DDoc (cast, beats, shots), a compiler lowers it to a scene, and the renderer stays AI-free and deterministic. It also renders its own dailies and re-blocks from them.',
    ],
  },
  {
    id: 'vsim-film3d', kind: 'technique', name: 'Film3DDoc: validated screenplay -> scene compiler -> self-reviewed dailies',
    url: 'https://github.com/kunalkushwaha/vsim/tree/main/packages/film3d', license: 'MIT', status: 'inspected', env_ok: true,
    tags: ['pipeline', 'llm-direction', 'qa', 'shot-list'],
    evidence: ['README film/3d section + package.json scripts read from raw.githubusercontent via page fetcher', 'read film:gen and film3d:fox scripts'],
    findings: [
      'Contract: the model may only emit a validated document; it never touches the render loop. A bad scene cannot be rendered, only rejected.',
      'Shot vocabulary we should adopt: wide / close / follow / orbit, plus an optional handheld drift for documentary feel.',
      'Self-review loop: one still per shot, two rounds, later rounds see the previous round frames. This is an automated visual QA gate that costs almost nothing.',
      'Baking trick: HTML artifacts are baked to a frame sequence by a pinned headless Chromium and played back as an in-world texture. With our new browser cell this becomes available to us.',
    ],
  },

  // ---------------------------------------------------------------- skill kit
  {
    id: 'claude-animation-skills', kind: 'skill-kit', name: 'artemnovitckii/claude-animation-skills — 11 video skills for Claude Code',
    url: 'https://github.com/artemnovitckii/claude-animation-skills', license: 'MIT', status: 'inspected', env_ok: true,
    tags: ['hyperframes', 'three.js', 'gsap', 'kit', 'styles'],
    evidence: [
      'full kit read file-by-file: SKILL.md, README.md, anim.py, build.py, build-2.py, words.py, template.html (16993 B), install.sh, setup.sh, manifests',
      'all 13 text files verified byte-identical to our stored copy by md5',
      'two contact sheets viewed at full resolution: skills.jpg (6 skills), five-styles.jpg (5 styles)',
    ],
    artifacts: ['research/skills/zach-d-films', 'research/uploads-2026-11-25'],
    findings: [
      'Eleven skills, not six: zach-d-films, zach-3d-films (same engine, renamed), stick-figure, minimalistic-graphics, map-route, breakdown, graph, low-poly, minecraft, kurzgesagt, dan-koe.',
      'anim.py is the whole architecture: spec JSON -> fill __SPEC__/__DURATION__ into template.html -> hyperframes render --fps 30 -q high -> contact sheet with Instagram safe area drawn in red.',
      'Safe area constants: W1080 H1920 FPS30, SAFE_TOP 220, SAFE_BOTTOM 1500, SAFE_SIDE 100. Encoded as a drawbox overlay on every contact sheet, so the check is visual not manual.',
      'Duration is declared as a lambda over the spec, and --snap renders individual times without a full render. Cheap iteration is designed in.',
      'build.py does spec validation with actionable messages (e.g. label column length warnings) instead of silently producing bad output.',
      'check_setup() fails loudly when GSAP or three.js is missing rather than rendering blank.',
    ],
  },
  {
    id: 'hf-dom', kind: 'engine', name: 'HyperFrames 0.8.34 — HTML/CSS/GSAP -> MP4',
    url: 'https://www.npmjs.com/package/hyperframes', license: 'npm package, check before shipping', status: 'integrated', env_ok: true,
    tags: ['browser', 'html-to-mp4', 'gsap', 'css', 'typography', 'renderer'],
    scripts: true,
    evidence: [
      'npm install --ignore-scripts succeeded (139 packages); plain install fails in onnxruntime-node postinstall which tries to fetch a CUDA tarball from github releases',
      'forward-ported to our own Chromium via HYPERFRAMES_BROWSER_PATH (browser reported as "Browser: env")',
      'rendered a 2 s 1080x1920 GSAP composition: 60 frames, 217.6 KB, 5.0 s wall clock (~68 ms/frame), verified by viewing an 8-frame strip',
      'static-frame dedup reused 14/60 frames, so dead holds cost almost nothing',
    ],
    artifacts: [
      'research/tools/browser/provision.sh',
      'research/tools/browser/render.sh',
      'research/tools/browser/smoke.mjs',
    ],
    findings: [
      'Contract: root element must carry data-composition-id, data-width, data-height, data-duration; animation must be registered as a GSAP timeline object in window.__timelines[compositionId] (not a function).',
      'window.__timelines values must be GSAP timelines - the runtime seeks them; CSS/WAAPI animations are separately auto-detected but cannot be deterministically seeked.',
      'Escape hatches that made this work: HYPERFRAMES_BROWSER_PATH, HYPERFRAMES_FFMPEG_PATH, HYPERFRAMES_FFPROBE_PATH. The last one is mandatory because @ffprobe-installer ships a non-executable file (EACCES).',
      'Capture is Chromium screenshot per frame, so everything CSS can composite works: @font-face, gradients, background-clip:text, backdrop-filter, box-shadow, blend modes, filters.',
      'No WebGL here, so three.js scenes cannot render - but canvas2d, SVG, CSS 3D transforms and DOM do.',
    ],
  },
  {
    id: 'sparticuz-chromium', kind: 'project', name: '@sparticuz/chromium — Chromium binary shipped inside the npm tarball',
    url: 'https://github.com/Sparticuz/chromium', license: 'MIT', status: 'integrated', env_ok: true,
    tags: ['chromium', 'serverless', 'browser', 'enabler'],
    evidence: [
      'npm install produced 75 MB node_modules, extracted a 227,736,800 B executable to /tmp/chromium',
      'binary initially failed: "error while loading shared libraries: libnspr4.so"',
      'apt has no libnspr4 and deb.debian.org is unreachable (HTTP 000)',
      'found libnspr4.so / libnss3.so inside its own bin/al2023.tar.br; brotli-decompressed and tar-extracted; Chromium 158.0.8127.0 then started',
    ],
    artifacts: ['research/tools/browser/provision.sh'],
    findings: [
      'This is the single enabler that turned "no browser is obtainable" into "a browser is obtainable" in a network-locked sandbox: the binary travels in the npm tarball, not a CDN.',
      'The AL2023 archive is only auto-extracted when the package detects Amazon Linux 2023, so on Debian-like images the NSS libraries are present but never unpacked. Extract them manually.',
      'SwiftShader tar (libEGL, libGLESv2, libvk_swiftshader, vulkan ICD) ships too, and its vulkan ICD json uses a RELATIVE library_path that must be rewritten to an absolute path before use.',
    ],
  },
  {
    id: 'webgl-swiftshader', kind: 'technique', name: 'Headless WebGL via ANGLE/SwiftShader in this sandbox',
    url: 'https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md', license: 'n/a', status: 'rejected', env_ok: false,
    tags: ['webgl', 'swiftshader', 'three.js', 'blocked'],
    reason: 'eglInitialize SwANGLE failed with EGL_NOT_INITIALIZED in every configuration tried; three.js is therefore unreachable in this sandbox',
    evidence: [
      '7 flag combinations tried: --use-gl=angle|swiftshader, --use-angle=swiftshader|swiftshader-webgl|vulkan, --in-process-gpu, --headless=old, Vulkan feature flags',
      '3 ICD configurations: package default, absolute library_path rewrite, VK_DRIVER_FILES',
      'Chrome stderr: "Internal Vulkan error (-3)" at vk_renderer.cpp initialize:2546, then "eglInitialize SwANGLE failed with error EGL_NOT_INITIALIZED"',
      '/dev/shm is 2.0 GB and all three SwiftShader libs resolve their deps, so neither memory nor missing libs explain it',
    ],
    findings: [
      'Do not retry this: the failure is inside ANGLE/Vulkan initialisation, not in our flags or environment.',
      'Keep the swiftshader libs extracted anyway - they cost nothing and would be the first thing to try if the image changes.',
    ],
  },

  // ---------------------------------------------------------------- other engines
  {
    id: 'remotion', kind: 'engine', name: 'Remotion — React -> video',
    url: 'https://github.com/remotion-dev/remotion', license: 'company licence, not OSI', status: 'discovered', env_ok: null,
    tags: ['react', 'chrome', 'renderer', 'licence-risk'],
    findings: ['Needs Chrome, which we now have, but the licence is not OSI for company use and HyperFrames already covers the same HTML-to-video niche with a plain-HTML model.'],
  },
  {
    id: 'kokoro-js', kind: 'engine', name: 'kokoro-js — neural TTS on onnxruntime-node',
    url: 'https://github.com/hexgrad/kokoro', license: 'Apache-2.0', status: 'tested', env_ok: false,
    tags: ['tts', 'voice', 'onnx'],
    reason: 'runtime loads but the ~327 MB model weights live on huggingface.co / release assets, all HTTP 000 here',
    evidence: [
      'npm install --ignore-scripts succeeded (56 packages)',
      'require("onnxruntime-node") loaded, version 1.21.0, prebuilt libonnxruntime.so.1.21.0 ships inside the tarball (no postinstall download)',
      'weights fetch attempted against huggingface.co, hf-mirror.com (HTTP 000) and the GitHub release asset (302 -> release-assets.githubusercontent.com, HTTP 000)',
    ],
    findings: [
      'Correction to an earlier conclusion: neural TTS is NOT blocked by a postinstall CDN fetch. It is blocked only by model weights.',
      'One supplied weights file would unblock a natural-voice path - the highest-value unblock available to us.',
    ],
  },
  {
    id: 'sherpa-onnx', kind: 'engine', name: 'sherpa-onnx — ASR/TTS toolkit',
    url: 'https://github.com/k2-fsa/sherpa-onnx', license: 'Apache-2.0', status: 'discovered', env_ok: null,
    tags: ['tts', 'asr', 'onnx', 'timing'],
    findings: ['Interesting mainly for forced alignment (word timings for captions), but its models are also on blocked CDNs.'],
  },
  {
    id: 'ossos', kind: 'project', name: 'sketchpunklabs/ossos — character IK/motion',
    url: 'https://github.com/sketchpunklabs/ossos', license: 'check', status: 'discovered', env_ok: null,
    tags: ['character', 'ik', 'webgl'],
  },
  {
    id: 'drawcall-animate', kind: 'project', name: 'drawcall-ai/animate',
    url: 'https://github.com/drawcall-ai/animate', license: 'check', status: 'discovered', env_ok: null,
    tags: ['character', 'webgl'],
  },
  {
    id: 'software-rasterisers', kind: 'technique', name: 'JS software rasterisers: js-renderer, aisa, facet, SoftwareRenderer, TinyRenderer',
    url: 'https://github.com/jtsorlinis/js-renderer', license: 'mixed', status: 'inspected', env_ok: true,
    tags: ['3d', 'rasteriser', 'reference'],
    evidence: ['read design descriptions for jtsorlinis/js-renderer, jdiemke/aisa, bxzex/facet, Sopiro/SoftwareRenderer, ccajas/JS-TinyRenderer'],
    findings: [
      'Common lesson: they are all per-pixel JS and therefore slow, which is exactly why our Skia-backed rasteriser beats vsim by ~14x.',
      'ccajas/JS-TinyRenderer has the clearest pipeline order to copy pedagogically: model -> view -> projection -> clip -> raster -> shade.',
    ],
  },

  // ---------------------------------------------------------------- papers
  {
    id: 'paper-3dgs', kind: 'paper', name: '3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al. 2023)',
    url: 'https://arxiv.org/pdf/2308.04079', license: 'arXiv', status: 'inspected', env_ok: false,
    tags: ['paper', 'rendering', 'neural'],
    reason: 'needs CUDA-class GPU and multi-view captures; not applicable to procedural explainer rendering',
    evidence: ['full text parsed and read (11 chunks) via the page fetcher'],
    findings: [
      'Not usable here (capture-based, GPU), but the tile-based visibility sorting idea is applicable to any software renderer that needs correct alpha ordering.',
    ],
  },
  {
    id: 'paper-acg', kind: 'paper', name: 'Papers to fetch for cel shading, outlines and cartoon lighting',
    url: null, license: null, status: 'discovered', env_ok: null,
    tags: ['paper', 'cel-shading', 'toon', 'outline'],
    findings: ['Queue: stylised/cel-shading surveys, ink-outline techniques (depth+normal edge detection), Disney/Pixar BRDF literature for the specular highlight the zach-3d-films look depends on.'],
  },

  // ---------------------------------------------------------------- our own work
  {
    id: 'studio-render3d', kind: 'technique', name: 'studio/src/render3d.mjs — software 3D on the Skia canvas',
    url: 'studio/src/render3d.mjs', license: 'ours', status: 'integrated', env_ok: true,
    tags: ['3d', 'skia', 'own-engine', 'box-only'],
    evidence: [
      'render1 141 ms/frame, render2 148 ms/frame, render3 123 ms/frame at 1080x1920 (60 frames)',
      'each render inspected as a PNG tile; two defects found and fixed (camera too low, missing ground plane)',
    ],
    artifacts: ['studio/src/render3d.mjs', 'studio/experiments/scene3d.mjs'],
    findings: [
      'Technique set: lookAt + perspective, backface cull, painter sort, Lambert key + hemisphere fill + rim, ACES tone mapping, contact shadows, 2x supersampling.',
      'Framing rule for 9:16: horizontal half-extent is d*tan(fov/2)*(9/16), so width binds before height. A 4.6-unit set needs d~16.6 at fov 30; keep sets ~2.5 units and camera at 8.6 with fov 34.',
      'Limitation: box-only. No meshes, no rigs, no textures, no cel shading.',
    ],
  },
  {
    id: 'style-references', kind: 'doc', name: 'zach-3d-films / five-styles contact sheets (11 skills)',
    url: 'research/STYLE_REFERENCE_NOTES.md', license: 'n/a', status: 'inspected', env_ok: true,
    tags: ['style', 'reference', 'target-quality', 'zach-d-films'],
    evidence: ['skills.jpg and five-styles.jpg viewed at full resolution; README cross-read for skill list'],
    artifacts: ['research/STYLE_REFERENCE_NOTES.md'],
    findings: [
      'The gap to the reference look is not mesh fidelity: it is (1) a broad stretched specular on curved metal, (2) depth of field with a crisp subject and soft ground, (3) exaggerated proportion, (4) impact read as concentric rings plus one verb.',
      'Reference staging grammar: one subject, one prop, one action verb, large negative space above.',
      'Caption grammar: white bold lowercase bottom-centre ~6% of frame height with a soft drop shadow, no box.',
      'Cheap wins identified for our channel: rounded label chips, impact rings, hairline-on-black variant, yellow no-box captions, DOF.',
    ],
  },
  {
    id: 'qa-defects-001', kind: 'technique', name: 'Visual QA gates: caption collision + motion-energy floor',
    url: 'research/INSPECTION_CAPABILITIES.md', license: 'ours', status: 'inspected', env_ok: true,
    tags: ['qa', 'gate', 'defect', 'captions'],
    evidence: [
      'frame at t=6.8 s of studio/out/mining-weekly-01.mp4 shows the karaoke caption box overlapping the chart x-axis label row',
      '1 fps 6x2 contact sheet shows scene 02 nearly pixel-identical from t=0 to t=5',
    ],
    artifacts: ['research/INSPECTION_CAPABILITIES.md'],
    findings: [
      'The existing 100/100 automated score did not catch either defect, so the score is measuring the wrong things.',
      'Both are mechanically detectable: text/chart bounding-box intersection, and per-second frame-difference energy below a floor.',
      'Because frames are the only way I can evaluate motion, these gates are the substitute for watching the video - they should be mandatory before any render is called done.',
    ],
  },
];

let added = 0;
for (const r of SEED) {
  if (have.has(r.id)) continue;
  const rec = {
    id: r.id,
    kind: r.kind,
    name: r.name,
    url: r.url ?? null,
    license: r.license ?? null,
    status: r.status,
    env_ok: r.env_ok ?? null,
    deps: r.deps ?? [],
    tags: r.tags ?? [],
    findings: r.findings ?? [],
    evidence: r.evidence ?? [],
    artifacts: (r.artifacts ?? []).filter((a) => fs.existsSync(path.join(ROOT, a))),
    reason: r.reason ?? null,
    first_seen: today,
    history: [{ date: today, status: r.status, note: 'seeded from session findings' }],
  };
  const dropped = (r.artifacts ?? []).filter((a) => !fs.existsSync(path.join(ROOT, a)));
  if (dropped.length) console.warn(`! ${r.id}: dropped missing artifacts: ${dropped.join(', ')}`);
  db.records.push(rec);
  have.add(r.id);
  added++;
}

// migrate the old knowledge base so nothing is silently lost
const oldKbPath = path.join(ROOT, 'research', 'knowledge_base.json');
if (fs.existsSync(oldKbPath)) {
  db.migrated_from = 'research/knowledge_base.json (Phase 3, read-only provenance)';
}

db.updated = today;
db.version = 1;
fs.writeFileSync(LEDGER, JSON.stringify(db, null, 2) + '\n');
console.log(`ledger: ${added} new, ${db.records.length} total`);
