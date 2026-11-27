// Concrete adapters registered with the router.
//
// Each adapter is honest about availability: `available()` actually probes the
// dependency instead of assuming it. Anything that needs an external binary,
// browser or API key reports itself as unavailable with the reason, and the
// router reports the gap instead of silently producing a worse video.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { FFMPEG, FFPROBE, ROOT, ensureFonts } from './env.mjs';
import { registerAdapter } from './router.mjs';

const has = (bin) => !!(bin && fs.existsSync(bin));
// ESM has no `require`; an availability probe that throws ReferenceError reports a
// perfectly good adapter as missing (this happened: meSpeak was flagged MISS).
const require = createRequire(import.meta.url);

// --- render ---------------------------------------------------------------
registerAdapter({
  id: 'native-canvas',
  name: 'Skia canvas -> ffmpeg rawvideo',
  capabilities: [
    'render:video', 'scene:text', 'scene:brand', 'scene:number', 'scene:chart',
    'scene:bars', 'scene:list', 'scene:typography',
  ],
  cost: 0.15,
  quality: 0.78,
  deterministic: true,
  licence: 'MIT (code) / Apache-2.0 & MIT deps',
  needs: ['@napi-rs/canvas', 'ffmpeg'],
  available: () => {
    if (!has(FFMPEG)) return false;
    try { ensureFonts(); return true; } catch { return false; }
  },
  notes: 'Default engine: frame-exact, no browser, no GPU. 8 scene kinds.',
});

registerAdapter({
  id: 'hyperframes',
  name: 'HyperFrames HTML->MP4 (research shortlist #1)',
  capabilities: ['render:video', 'scene:text', 'scene:brand', 'scene:chart', 'scene:bars', 'scene:typography', 'scene:components'],
  cost: 0.6,
  quality: 0.9,
  deterministic: true,
  licence: 'Apache-2.0',
  needs: ['node', 'hyperframes', 'chrome', 'ffmpeg'],
  available: () => {
    if (!has(FFMPEG)) return false;
    // needs a real Chrome + the CLI; probe both without downloading anything
    const cli = spawnSync('npx', ['--no-install', 'hyperframes', '--version'], { encoding: 'utf8', timeout: 20000 });
    const chrome = !!(process.env.HYPERFRAMES_BROWSER_PATH && fs.existsSync(process.env.HYPERFRAMES_BROWSER_PATH))
      || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].some((p) => fs.existsSync(p));
    const ok = cli.status === 0 && chrome;
    registerAdapter.lastReason = ok ? null : `cli=${cli.status === 0 ? 'ok' : 'missing'} chrome=${chrome ? 'ok' : 'missing'}`;
    return ok;
  },
  notes: 'Higher visual ceiling + 210 blocks, but needs Chrome; unavailable in this sandbox.',
});

registerAdapter({
  id: 'remotion',
  name: 'Remotion (React -> MP4)',
  capabilities: ['render:video', 'scene:text', 'scene:chart', 'scene:components'],
  cost: 0.7,
  quality: 0.88,
  deterministic: true,
  licence: 'UNVERIFIED — Remotion company licence may apply',
  needs: ['node', '@remotion/cli', 'chrome', 'ffmpeg'],
  available: () => {
    const p = path.join(ROOT, 'node_modules', '@remotion', 'cli');
    const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium'].some((x) => fs.existsSync(x));
    return fs.existsSync(p) && chrome && has(FFMPEG);
  },
  notes: 'Not wired: licence unresolved (research §7) and no Chrome here.',
});

// --- audio ---------------------------------------------------------------
registerAdapter({
  id: 'procedural-audio',
  name: 'synthesised music bed + frame-locked SFX',
  capabilities: ['audio:music', 'audio:sfx'],
  cost: 0,
  quality: 0.55,
  deterministic: true,
  licence: 'own work (generated, no samples)',
  needs: [],
  available: () => true,
  notes: 'Seeded patterns; no licensed samples, so no attribution risk. Quality is "good bed", not "composer".',
});

registerAdapter({
  id: 'mespeak-tts',
  name: 'meSpeak / eSpeak-NG offline TTS',
  capabilities: ['audio:voice'],
  cost: 0,
  quality: 0.42,
  deterministic: true,
  licence: 'GPL-3.0 (eSpeak-NG data) — check before commercial distribution',
  needs: ['mespeak'],
  available: () => {
    try { require.resolve('mespeak'); return true; } catch { return false; }
  },
  notes: 'Robotic but fully offline and word-timed. A hosted TTS (VoxCPM/VoiceStudio/ElevenLabs) should replace it when a key exists.',
});

registerAdapter({
  id: 'say-tts',
  name: 'macOS `say` (better prosody, local)',
  capabilities: ['audio:voice'],
  cost: 0,
  quality: 0.6,
  deterministic: true,
  licence: 'platform',
  needs: ['say'],
  available: () => process.platform === 'darwin' && spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).status === 0,
  notes: 'Preferred over meSpeak on macOS; not present on Linux.',
});

// --- captions / analysis -------------------------------------------------
registerAdapter({
  id: 'ir-captions',
  name: 'IR-derived SRT (narration is the transcript)',
  capabilities: ['captions:srt'],
  cost: 0,
  quality: 0.7,
  deterministic: true,
  licence: 'own work',
  needs: [],
  available: () => true,
  notes: 'Exact by construction because we author the narration; not ASR.',
});

registerAdapter({
  id: 'whisper-asr',
  name: 'Whisper / Parakeet ASR for burned-in captions',
  capabilities: ['captions:srt', 'eval:transcript'],
  cost: 0.3,
  quality: 0.92,
  deterministic: false,
  licence: 'MIT / Apache-2.0 (model weights separate)',
  needs: ['ffmpeg', 'sherpa-onnx or whisper.cpp', 'model download (blocked here)'],
  available: () => false,
  notes: 'Model download is blocked in this sandbox; captions come from the IR instead.',
});

registerAdapter({
  id: 'ffprobe-eval',
  name: 'ffprobe/ffmpeg static + audio analysis',
  capabilities: ['eval:video'],
  cost: 0.05,
  quality: 0.8,
  deterministic: true,
  licence: 'LGPL/GPL (ffmpeg build)',
  needs: ['ffmpeg', 'ffprobe'],
  available: () => has(FFMPEG) && has(FFPROBE),
  notes: 'Container/codec/loudness/black-frame/freeze detection + frame sampling for visual checks.',
});

registerAdapter({
  id: 'canvas-thumbnail',
  name: 'thumbnail composer (canvas, frame-derived)',
  capabilities: ['thumb:generate'],
  cost: 0,
  quality: 0.7,
  deterministic: true,
  licence: 'own work',
  needs: ['@napi-rs/canvas'],
  available: () => true,
  notes: 'Picks a hero frame and lays out a readable 1280x720 title card.',
});

registerAdapter({
  id: 'youtube-data-api',
  name: 'YouTube Data API v3 (upload/metadata)',
  capabilities: ['publish:youtube'],
  cost: 0,
  quality: 1,
  deterministic: false,
  licence: 'Google API terms',
  needs: ['OAuth client', 'refresh token', 'network to googleapis.com'],
  available: () => false, // resolved at runtime by the youtube adapter
  notes: 'Implemented in src/youtube.mjs; availability depends on credentials + network.',
});

registerAdapter({
  id: 'youtube-mock',
  name: 'YouTube submission rehearsal (no network)',
  capabilities: ['publish:youtube'],
  cost: 0,
  quality: 0.3,
  deterministic: true,
  licence: 'own work',
  needs: [],
  available: () => true,
  notes: 'Validates metadata against real API rules (title/description/tags/thumbnail size) and writes the exact request bodies. Never claims an upload happened.',
});
