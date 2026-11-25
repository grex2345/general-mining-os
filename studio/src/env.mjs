// Environment resolution: ffmpeg/ffprobe binaries + font registration.
// Everything is prebuilt from npm so the studio works on a machine with no
// system ffmpeg, no Chrome and no GPU.
import { createRequire } from 'node:module';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FONT_DIR = path.join(ROOT, 'node_modules', '@expo-google-fonts');
export const OUT_DIR = path.join(ROOT, 'out');
export const CACHE_DIR = path.join(ROOT, 'cache');
export const DATA_DIR = path.join(ROOT, 'data');

for (const d of [OUT_DIR, CACHE_DIR, DATA_DIR]) fs.mkdirSync(d, { recursive: true });

function bin(pkg) {
  try {
    return require(pkg).path;
  } catch {
    return null;
  }
}

export const FFMPEG = process.env.STUDIO_FFMPEG || bin('@ffmpeg-installer/ffmpeg');
export const FFPROBE = process.env.STUDIO_FFPROBE || bin('@ffprobe-installer/ffprobe');

export function assertToolchain() {
  const problems = [];
  if (!FFMPEG || !fs.existsSync(FFMPEG)) problems.push('ffmpeg binary missing (@ffmpeg-installer/ffmpeg)');
  if (!FFPROBE || !fs.existsSync(FFPROBE)) problems.push('ffprobe binary missing (@ffprobe-installer/ffprobe)');
  if (problems.length) {
    const e = new Error('toolchain incomplete: ' + problems.join('; '));
    e.code = 'TOOLCHAIN_MISSING';
    throw e;
  }
  for (const p of [FFMPEG, FFPROBE]) {
    try { fs.chmodSync(p, 0o755); } catch {}
  }
  return { ffmpeg: FFMPEG, ffprobe: FFPROBE };
}

// --- fonts ---------------------------------------------------------------
export const FONTS = {
  display: 'InterTight',   // headlines / big numbers
  text: 'Inter',           // body
  mono: 'JetBrainsMono',   // data / labels
};

let fontsReady = false;
export function ensureFonts() {
  if (fontsReady) return FONTS;
  const wanted = [
    ['@expo-google-fonts/inter-tight/800ExtraBold/InterTight_800ExtraBold.ttf', 'InterTight'],
    ['@expo-google-fonts/inter-tight/700Bold/InterTight_700Bold.ttf', 'InterTight'],
    ['@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf', 'Inter'],
    ['@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf', 'Inter'],
    ['@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf', 'Inter'],
    ['@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', 'Inter'],
    ['@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf', 'JetBrainsMono'],
    ['@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf', 'JetBrainsMono'],
  ];
  const loaded = [];
  const missing = [];
  for (const [rel, family] of wanted) {
    const abs = path.join(ROOT, 'node_modules', rel);
    if (!fs.existsSync(abs)) { missing.push(rel); continue; }
    GlobalFonts.registerFromPath(abs, family);
    loaded.push(family);
  }
  if (!loaded.length) {
    // No webfonts: fall back to whatever the platform has, but say so loudly.
    const fams = GlobalFonts.families.map((f) => f.family);
    if (fams.includes('DejaVu Sans')) {
      FONTS.display = FONTS.text = 'DejaVu Sans';
      FONTS.mono = fams.includes('DejaVu Sans Mono') ? 'DejaVu Sans Mono' : 'monospace';
    }
    FONTS.degraded = true;
    FONTS.missing = missing;
  }
  fontsReady = true;
  return FONTS;
}

/** Probe a font family is actually usable by drawing and measuring. */
export function fontSmokeTest() {
  ensureFonts();
  const c = createCanvas(200, 60);
  const x = c.getContext('2d');
  x.font = `700 32px ${FONTS.text}`;
  const w = x.measureText('Mining ₹1').width;
  return { ok: w > 20, family: FONTS.text, width: Math.round(w), degraded: !!FONTS.degraded };
}
