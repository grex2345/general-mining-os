// Scene engines: each kind of scene is a pure function of (ctx, scene, localTime).
//
// Contract for every engine:
//   1. layout is computed from the spec alone (deterministic, no clock, no random)
//   2. motion is a pure function of t (seconds since the scene started)
//   3. the frame at t = scene.duration-epsilon must show the FINISHED composition
//      (research: "end on the complete static frame held still")

import { Path2D } from '@napi-rs/canvas';
import {
  ensureFonts, FONTS,
} from './env.mjs';
import {
  clamp, lerp, prog, ease, hash, wrap, fitFont, drawText, drawGrid, drawBackground, setSceneTime,
  hexA, fillRoundRect, chip, drawBrand, drawProgressBar,
} from './design.mjs';

const IN = 0.5; // default entrance window

function safeArea(W, H) {
  // vertical social safe area: 8% top, 14% bottom (Instagram/TikTok/Shorts chrome)
  return { top: Math.round(H * 0.09), bottom: Math.round(H * 0.14), side: Math.round(W * 0.055) };
}

function fmtNumber(n, { prefix = '', suffix = '', decimals = 0, compact = false } = {}) {
  let v = n;
  let suf = suffix;
  if (compact && Math.abs(n) >= 1000) {
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [u, s] of units) {
      if (Math.abs(n) >= u) { v = n / u; suf = s + suffix; break; }
    }
    return prefix + (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + suf;
  }
  const s = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return prefix + s + suf;
}

/** Reveal helper: returns 0..1 eased progress for element i of n with stagger. */
function stagger(t, i, { start = 0.15, step = 0.1, dur = IN, easing = ease.outCubic } = {}) {
  return easing(prog(t, start + i * step, dur));
}

// ---------------------------------------------------------------------------
// HOOK — the first 2 seconds. Big, single idea, one loud thing at a time.
// ---------------------------------------------------------------------------
function hook(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  drawGrid(ctx, W, H, pal, { step: 72, alpha: 0.7 });

  const sa = safeArea(W, H);
  const maxW = W - sa.side * 2;

  // Frame 0 must already read as the finished hook: YouTube autoplays and the
  // first frame IS the thumbnail in feeds. So the eyebrow and headline are drawn
  // fully at t=0 and the motion happens *within* the composition (underline,
  // subtitle rise, accent sweep) instead of fading the whole thing in.
  const instant = !!scene.instant;

  // headline: shrink until the WHOLE title fits in at most 3 lines.
  // (Truncating a headline is how a hook silently loses its punch word.)
  let size = 100;
  let lines = [];
  for (; size >= 52; size -= 4) {
    ctx.font = `800 ${size}px ${FONTS.display}`;
    lines = wrap(ctx, scene.title, maxW);
    if (lines.length <= 3) break;
  }
  ctx.font = `800 ${size}px ${FONTS.display}`;
  const lineH = size * 1.08;
  // Anchor the headline block by its BOTTOM so a 2-line and a 3-line title both
  // end in the same place; only the first baseline moves. The eyebrow is placed
  // relative to the actual block top, which is what stopped the 3-line hook title
  // from colliding with the "ENERGY" chip.
  const blockBottom = H * 0.545;
  const blockTop = blockBottom - (lines.length - 1) * lineH;

  // eyebrow chip, positioned from the computed block top (never a fixed Y: a
  // 3-line headline would otherwise run into the chip)
  const eye = (scene.eyebrow || 'MARKET SIGNAL').toUpperCase();
  const p0 = instant ? 1 : ease.outCubic(prog(t, 0, 0.26));
  ctx.save();
  ctx.globalAlpha = p0;
  chip(ctx, eye, sa.side, blockTop - size * 0.92 - 74, { pal, size: 26 });
  ctx.restore();
  lines.forEach((line, i) => {
    const p = instant ? 1 : stagger(t, i, { start: 0.04, step: 0.07, dur: 0.34, easing: ease.outQuart });
    const dy = (1 - p) * 46;
    ctx.save();
    ctx.globalAlpha = p;
    // a masked slide-up: clip to the line box so text never floats over another line
    ctx.beginPath();
    ctx.rect(sa.side - 4, blockTop + i * lineH - size, maxW + 8, size * 1.35);
    ctx.clip();
    drawText(ctx, line, sa.side, blockTop + i * lineH + dy, {
      size, weight: 800, family: FONTS.display, color: pal.ink,
    });
    ctx.restore();
  });

  // accent underline grows under the last word
  const ulP = instant ? 1 : ease.outQuart(prog(t, 0.30, 0.45));
  const lastW = (() => {
    ctx.font = `800 ${size}px ${FONTS.display}`;
    const l = lines[lines.length - 1] || '';
    return ctx.measureText(l).width;
  })();
  ctx.fillStyle = pal.accent;
  ctx.fillRect(sa.side, blockTop + (lines.length - 1) * lineH + size * 0.28, Math.max(0, lastW * ulP), 8);

  // subtitle: fades up under the anchored headline block
  if (scene.subtitle) {
    const p = instant ? 1 : ease.outCubic(prog(t, 0.42, 0.4));
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `500 40px ${FONTS.text}`;
    const subLines = wrap(ctx, scene.subtitle, maxW * 0.86);
    const subTop = blockBottom + lineH * 0.55 + 40;
    subLines.slice(0, 2).forEach((l, i) => {
      drawText(ctx, l, sa.side, subTop + i * 54 + (1 - p) * 18, {
        size: 40, weight: 500, color: pal.inkDim,
      });
    });
    ctx.restore();
  }

  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// STAT — one number, counting up, with a label. iart: only ONE number animates.
// ---------------------------------------------------------------------------
function stat(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  const sa = safeArea(W, H);
  const cx = W / 2;

  // static layout: number centred at 46% height, label under it
  const numY = H * 0.47;
  const countP = ease.outCubic(prog(t, 0.2, Math.min(1.6, scene.duration * 0.55)));
  const value = scene.value * countP;

  const text = fmtNumber(value, scene);
  ctx.font = `800 210px ${FONTS.display}`;
  const size = Math.min(240, fitFont(ctx, fmtNumber(scene.value, scene), {
    family: FONTS.display, weight: 800, maxWidth: W - sa.side * 2, start: 210, min: 90,
  }));
  const appear = ease.outBack(prog(t, 0.05, 0.45), 1.2);
  ctx.save();
  ctx.globalAlpha = clamp(appear, 0, 1);
  ctx.translate(cx, numY);
  ctx.scale(lerp(0.86, 1, clamp(appear)), lerp(0.86, 1, clamp(appear)));
  ctx.font = `800 ${size}px ${FONTS.display}`;
  drawText(ctx, text, 0, 0, { size, weight: 800, family: FONTS.display, color: pal.accent, align: 'center' });
  ctx.restore();

  // label
  const lp = ease.outCubic(prog(t, 0.55, 0.5));
  ctx.save();
  ctx.globalAlpha = lp;
  ctx.font = `600 52px ${FONTS.text}`;
  wrap(ctx, scene.label, W - sa.side * 2.4).slice(0, 3).forEach((l, i) => {
    drawText(ctx, l, cx, numY + 120 + i * 66 + (1 - lp) * 14, {
      size: 52, weight: 600, color: pal.ink, align: 'center',
    });
  });
  ctx.restore();

  // context line + delta chip
  if (scene.delta) {
    const up = !String(scene.delta).trim().startsWith('-');
    const col = up ? pal.accent : pal.danger;
    const dp = ease.outCubic(prog(t, 0.8, 0.4));
    ctx.save();
    ctx.globalAlpha = dp;
    ctx.font = `700 40px ${FONTS.mono}`;
    const w = ctx.measureText(String(scene.delta)).width + 56;
    fillRoundRect(ctx, cx - w / 2, numY + 214, w, 76, 38, hexA(col, 0.14));
    drawText(ctx, String(scene.delta), cx, numY + 264, { size: 40, weight: 700, family: FONTS.mono, color: col, align: 'center' });
    ctx.restore();
  }
  if (scene.source) {
    ctx.save();
    ctx.globalAlpha = ease.outCubic(prog(t, 1.0, 0.4)) * 0.9;
    drawText(ctx, 'SOURCE · ' + scene.source.toUpperCase(), cx, H - sa.bottom - 30, {
      size: 22, weight: 600, family: FONTS.mono, color: hexA(pal.ink, 0.4), align: 'center', spacing: 1.4,
    });
    ctx.restore();
  }
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// CHART — a line that draws itself while the tip value counts (artem /graph).
// ---------------------------------------------------------------------------
function chart(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  const sa = safeArea(W, H);

  // --- static layout (designed first, then revealed) -----------------------
  // title top, big value below it, plot in the lower half. No collisions.
  const titleY = H * 0.145;
  const valueY = H * 0.245;
  const plotTop = H * 0.335;
  const plotBottom = H * 0.70;
  const x0 = sa.side + 26, x1 = W - sa.side - 26;

  const titleP = ease.outCubic(prog(t, 0.05, 0.4));
  ctx.save();
  ctx.globalAlpha = titleP;
  ctx.font = `600 36px ${FONTS.text}`;
  wrap(ctx, scene.title || '', W - sa.side * 2).slice(0, 2).forEach((l, i) => {
    drawText(ctx, l, sa.side, titleY + i * 44, { size: 36, weight: 600, color: pal.inkDim });
  });
  ctx.restore();

  const V = scene.series.map((p) => Number(p.value));
  const vmax = Math.max(...V) * 1.06;
  const vmin = Math.min(0, Math.min(...V));
  const px = (i) => x0 + (i * (x1 - x0)) / Math.max(1, V.length - 1);
  const py = (v) => plotBottom - ((v - vmin) / (vmax - vmin || 1)) * (plotBottom - plotTop);
  const P = V.map((v, i) => [px(i), py(v)]);

  const drawP = ease.inOutCubic(prog(t, 0.3, Math.min(1.9, scene.duration * 0.5)));

  // --- big value: counts up with the tip, top-left, below the title --------
  const tipV = valueAt(P, V, drawP);
  const valueSize = Math.min(132, fitFont(ctx, fmtNumber(V[V.length - 1], scene), {
    family: FONTS.display, weight: 800, maxWidth: W - sa.side * 2, start: 132, min: 56,
  }));
  const valueP = ease.outCubic(prog(t, 0.12, 0.4));
  ctx.save();
  ctx.globalAlpha = valueP;
  drawText(ctx, fmtNumber(drawP >= 0.999 ? V[V.length - 1] : tipV, scene), sa.side, valueY, {
    size: valueSize, weight: 800, family: FONTS.display, color: pal.ink,
  });
  ctx.restore();

  // --- plot ---------------------------------------------------------------
  ctx.save();
  // grid + baseline
  const axisP = ease.outCubic(prog(t, 0.15, 0.45));
  ctx.globalAlpha = axisP;
  ctx.strokeStyle = hexA(pal.ink, 0.10);
  ctx.lineWidth = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = plotBottom - (plotBottom - plotTop) * f;
    ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); ctx.stroke();
  });
  ctx.restore();

  // everything inside the plot is clipped to it — no bleed, no rectangles
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, plotTop - 20, (x1 - x0) * drawP, plotBottom - plotTop + 40);
  ctx.clip();

  const path = new Path2D();
  path.moveTo(P[0][0], P[0][1]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const k = 0.16;
    path.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k,
      p2[0], p2[1],
    );
  }
  // area fill: gradient anchored to the plot box
  const fill = new Path2D();
  fill.moveTo(P[0][0], P[0][1]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const k = 0.16;
    fill.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k,
      p2[0], p2[1],
    );
  }
  fill.lineTo(P[P.length - 1][0], plotBottom);
  fill.lineTo(P[0][0], plotBottom);
  fill.closePath();
  const ag = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  ag.addColorStop(0, hexA(pal.accent, 0.30));
  ag.addColorStop(1, hexA(pal.accent, 0.02));
  ctx.fillStyle = ag;
  ctx.fill(fill);
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.restore();

  // tip dot + baseline drop (drawn outside the clip so it is never cut)
  if (drawP > 0.02) {
    const [tx_, ty_] = pointAt(P, drawP);
    ctx.beginPath(); ctx.arc(tx_, ty_, 22, 0, Math.PI * 2); ctx.fillStyle = hexA(pal.accent, 0.20); ctx.fill();
    ctx.beginPath(); ctx.arc(tx_, ty_, 12, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = pal.bg; ctx.stroke();
    if (drawP > 0.98) {
      ctx.save();
      ctx.globalAlpha = clamp((drawP - 0.98) / 0.02) * 0.6;
      ctx.setLineDash([3, 10]); ctx.strokeStyle = hexA(pal.ink, 0.4); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx_, ty_ + 16); ctx.lineTo(tx_, plotBottom); ctx.stroke();
      ctx.restore();
    }
  }

  // x labels
  const every = Math.ceil(V.length / 7);
  scene.series.forEach((p, i) => {
    if (i % every !== 0 && i !== V.length - 1) return;
    const lp = stagger(t, i, { start: 0.5, step: 0.05, dur: 0.3 });
    ctx.save(); ctx.globalAlpha = lp * 0.8;
    drawText(ctx, p.label, px(i), plotBottom + 48, {
      size: 24, weight: 500, family: FONTS.mono, color: pal.inkDim, align: 'center',
    });
    ctx.restore();
  });

  if (scene.source) {
    ctx.save(); ctx.globalAlpha = 0.6;
    drawText(ctx, 'SOURCE · ' + scene.source.toUpperCase(), sa.side, H - sa.bottom - 26, {
      size: 20, weight: 600, family: FONTS.mono, color: hexA(pal.ink, 0.45), spacing: 1.2,
    });
    ctx.restore();
  }
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

/** value under the drawn tip, interpolated along the series */
function valueAt(P, V, p) {
  const segs = P.length - 1;
  const f = clamp(p) * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  return lerp(V[i], V[i + 1], f - i);
}

function pointAt(P, p) {
  // sample the polyline (good enough for a dot position)
  const segs = P.length - 1;
  const f = clamp(p) * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const lt = f - i;
  return [lerp(P[i][0], P[i + 1][0], lt), lerp(P[i][1], P[i + 1][1], lt)];
}

// ---------------------------------------------------------------------------
// COMPARE — 2..4 horizontal bars, grown in sequence, values counted.
// ---------------------------------------------------------------------------
function compare(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  const sa = safeArea(W, H);

  const titleP = ease.outCubic(prog(t, 0.05, 0.4));
  ctx.save(); ctx.globalAlpha = titleP;
  ctx.font = `700 48px ${FONTS.text}`;
  wrap(ctx, scene.title || '', W - sa.side * 2).slice(0, 2).forEach((l, i) =>
    drawText(ctx, l, sa.side, H * 0.18 + i * 58, { size: 48, weight: 700, color: pal.ink }));
  ctx.restore();

  const items = scene.items;
  const vmax = Math.max(...items.map((i) => Number(i.value))) || 1;
  const top = H * 0.3;
  const avail = H * 0.5;
  const rowH = Math.min(150, avail / items.length);
  const barX = sa.side;
  const barMaxW = W - sa.side * 2;

  items.forEach((it, i) => {
    const y = top + i * rowH;
    const p = stagger(t, i, { start: 0.25, step: 0.16, dur: 0.75, easing: ease.outQuart });
    const val = Number(it.value) * p;
    const w = (val / vmax) * barMaxW;

    // label
    ctx.save(); ctx.globalAlpha = clamp(p * 1.2);
    drawText(ctx, it.label, barX, y + 34, { size: 34, weight: 600, color: pal.ink });
    ctx.restore();

    // track + bar
    const bh = Math.min(56, rowH * 0.42);
    fillRoundRect(ctx, barX, y + 52, barMaxW, bh, bh / 2, hexA(pal.ink, 0.06));
    if (w > 2) {
      // Bar colour encodes position, not series index: in a ranking the best
      // (cheapest power) end must carry the accent, and the worst must not read
      // as an error state. Cycling the palette made the cheapest site red.
      // Colour carries MEANING, not position: whichever bar is the desirable one
      // (cheapest power, highest hashrate) gets the accent. Ranking by index made
      // the most expensive site the brightest bar in the frame.
      const col = it.color
        || (it.good === true ? pal.accent
          : it.good === false ? hexA(pal.ink, 0.30)
          : pal.series[i % pal.series.length]);
      const g = ctx.createLinearGradient(barX, 0, barX + Math.max(w, 1), 0);
      g.addColorStop(0, hexA(col, 0.85)); g.addColorStop(1, col);
      fillRoundRect(ctx, barX, y + 52, Math.max(w, bh), bh, bh / 2, g);
      // The value must ALWAYS be the full, untruncated number. If it does not fit
      // to the right of the bar it goes inside the bar (dark ink on the accent fill)
      // -- a clipped "$31.89" reading "$3" is a data-accuracy bug, not a style issue.
      const label = fmtNumber(Number(it.value), { ...scene, ...it });
      ctx.font = `700 32px ${FONTS.mono}`;
      const lw = ctx.measureText(label).width;
      const outsideFits = barX + Math.max(w, bh) + 18 + lw <= barX + barMaxW;
      if (outsideFits) {
        drawText(ctx, label, barX + Math.max(w, bh) + 18, y + 52 + bh * 0.7, {
          size: 32, weight: 700, family: FONTS.mono,
          // the dimmed "bad" bar still needs a readable value
          color: it.good === false ? hexA(pal.ink, 0.62) : col,
        });
      } else {
        drawText(ctx, label, barX + Math.max(w, bh) - 18, y + 52 + bh * 0.7, {
          size: 32, weight: 700, family: FONTS.mono, color: pal.bg, align: 'right',
        });
      }
    }
  });

  if (scene.source) {
    ctx.save(); ctx.globalAlpha = 0.55;
    drawText(ctx, 'SOURCE · ' + scene.source.toUpperCase(), sa.side, H - sa.bottom - 26, {
      size: 20, weight: 600, family: FONTS.mono, color: hexA(pal.ink, 0.45), spacing: 1.2,
    });
    ctx.restore();
  }
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// LIST — 2..5 numbered items, staggered (iart: 6-10 frame stagger, one curve).
// ---------------------------------------------------------------------------
function list(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  const sa = safeArea(W, H);

  const titleP = ease.outCubic(prog(t, 0.05, 0.4));
  ctx.save(); ctx.globalAlpha = titleP;
  ctx.font = `800 76px ${FONTS.display}`;
  wrap(ctx, scene.title || '', W - sa.side * 2).slice(0, 2).forEach((l, i) =>
    drawText(ctx, l, sa.side, H * 0.19 + i * 84, { size: 76, weight: 800, family: FONTS.display, color: pal.ink }));
  ctx.restore();

  const items = scene.items;
  // The caption band starts at H*0.765. Size the list so the LAST item's text
  // still ends above it -- an item hidden behind a caption is worse than smaller type.
  const bandTop = H * 0.765 - 34;
  const top = H * 0.34;
  const step = Math.min(200, (bandTop - top) / Math.max(1, items.length - 1 || 1));
  const itemSize = items.length > 2 ? 42 : 46;

  items.forEach((text, i) => {
    const p = stagger(t, i, { start: 0.3, step: 0.18, dur: 0.6, easing: ease.outQuart });
    const y = top + i * step;
    ctx.save();
    ctx.globalAlpha = clamp(p);
    ctx.translate((1 - p) * -34, 0);

    // number badge
    const bx = sa.side, by = y - 40;
    const bs = 58;
    fillRoundRect(ctx, bx, by, bs, bs, 18, hexA(pal.accent, 0.14));
    drawText(ctx, String(i + 1), bx + bs / 2, by + bs * 0.68, {
      size: 30, weight: 800, family: FONTS.mono, color: pal.accent, align: 'center',
    });
    // text
    ctx.font = `600 ${itemSize}px ${FONTS.text}`;
    const lines = wrap(ctx, text, W - sa.side * 2 - bs - 34).slice(0, 3);
    lines.forEach((l, j) => drawText(ctx, l, bx + bs + 32, y - 2 + j * (itemSize * 1.25), {
      size: itemSize, weight: 600, color: pal.ink,
    }));
    ctx.restore();
  });
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// QUOTE — a pull quote with a big typographic mark.
// ---------------------------------------------------------------------------
function quote(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  const sa = safeArea(W, H);

  // Slow parallax drift keeps a text-only card from being a static frame.
  const drift = Math.sin(t * 0.6) * 8;
  const markP = ease.outCubic(prog(t, 0.05, 0.5));
  ctx.save();
  ctx.globalAlpha = 0.18 * markP;
  drawText(ctx, '“', sa.side - 10 + drift, H * 0.32 - drift * 0.6, { size: 260, weight: 800, family: FONTS.display, color: pal.accent });
  ctx.restore();
  // accent rule that grows under the quote: continuous motion for the whole card
  const ruleP = ease.outQuart(clamp((t - 0.15) / Math.max(0.6, scene.duration ?? 4) * 0.85));
  ctx.save();
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sa.side, H * 0.395, (W - sa.side * 2) * ruleP, 5);
  ctx.restore();

  ctx.font = `700 64px ${FONTS.display}`;
  const lines = wrap(ctx, scene.text, W - sa.side * 2).slice(0, 6);
  const size = lines.length > 4 ? 54 : 64;
  ctx.font = `700 ${size}px ${FONTS.display}`;
  lines.forEach((l, i) => {
    const p = stagger(t, i, { start: 0.25, step: 0.1, dur: 0.45, easing: ease.outCubic });
    ctx.save(); ctx.globalAlpha = p;
    drawText(ctx, l, sa.side + drift * 0.5, H * 0.46 + i * size * 1.22 + (1 - p) * 16, {
      size, weight: 700, family: FONTS.display, color: pal.ink,
    });
    ctx.restore();
  });
  if (scene.attribution) {
    const p = ease.outCubic(prog(t, 0.7, 0.4));
    ctx.save(); ctx.globalAlpha = p;
    drawText(ctx, '— ' + scene.attribution, sa.side, H * 0.46 + lines.length * size * 1.22 + 40, {
      size: 34, weight: 600, color: pal.inkDim,
    });
    ctx.restore();
  }
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// TITLE — section divider / channel ident.
// ---------------------------------------------------------------------------
function title(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal, { glowColor: pal.accent2 });
  drawGrid(ctx, W, H, pal, { step: 90, alpha: 0.5 });
  const sa = safeArea(W, H);

  const p = ease.outQuart(prog(t, 0.08, 0.7));
  ctx.save();
  ctx.globalAlpha = clamp(p);
  const size = Math.min(120, fitFont(ctx, scene.title, {
    family: FONTS.display, weight: 800, maxWidth: W - sa.side * 2, start: 120, min: 54,
  }));
  drawText(ctx, scene.title, W / 2, H * 0.5 + (1 - p) * 30, {
    size, weight: 800, family: FONTS.display, color: pal.ink, align: 'center',
  });
  ctx.restore();

  const lp = ease.outCubic(prog(t, 0.35, 0.5));
  if (scene.subtitle) {
    ctx.save(); ctx.globalAlpha = lp;
    drawText(ctx, scene.subtitle, W / 2, H * 0.5 + size * 0.9, {
      size: 38, weight: 500, color: pal.inkDim, align: 'center',
    });
    ctx.restore();
  }
  // rule
  ctx.fillStyle = pal.accent;
  const rw = 160 * ease.outQuart(prog(t, 0.2, 0.6));
  ctx.fillRect(W / 2 - rw / 2, H * 0.5 - size * 0.95, rw, 6);
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

// ---------------------------------------------------------------------------
// OUTRO — CTA card. Must be readable when paused (YouTube end screen).
// ---------------------------------------------------------------------------
function outro(ctx, scene, t, ctxInfo) {
  const { W, H, pal, brand, index, total } = ctxInfo;
  ensureFonts();
  drawBackground(ctx, W, H, pal);
  drawGrid(ctx, W, H, pal, { step: 76, alpha: 0.55 });
  const sa = safeArea(W, H);

  const p = ease.outQuart(prog(t, 0.1, 0.6));
  ctx.save(); ctx.globalAlpha = clamp(p);
  const size = Math.min(96, fitFont(ctx, scene.title, {
    family: FONTS.display, weight: 800, maxWidth: W - sa.side * 2, start: 96, min: 44,
  }));
  ctx.font = `800 ${size}px ${FONTS.display}`;
  const lines = wrap(ctx, scene.title, W - sa.side * 2).slice(0, 3);
  // keep the outro block clear of the caption band (H*0.765) and the CTA pill
  const titleTop = H * 0.30;
  lines.forEach((l, i) => drawText(ctx, l, W / 2, titleTop + i * size * 1.1 + (1 - p) * 24, {
    size, weight: 800, family: FONTS.display, color: pal.ink, align: 'center',
  }));
  ctx.restore();

  const sp = ease.outCubic(prog(t, 0.4, 0.5));
  if (scene.subtitle) {
    ctx.save(); ctx.globalAlpha = sp;
    ctx.font = `500 40px ${FONTS.text}`;
    wrap(ctx, scene.subtitle, W - sa.side * 2.2).slice(0, 3).forEach((l, i) =>
      drawText(ctx, l, W / 2, titleTop + lines.length * size * 1.1 + 52 + i * 52, {
        size: 40, weight: 500, color: pal.inkDim, align: 'center' }));
    ctx.restore();
  }

  if (scene.cta) {
    const cp = ease.outBack(prog(t, 0.6, 0.5), 1.1);
    ctx.save();
    ctx.globalAlpha = clamp(cp);
    ctx.font = `700 38px ${FONTS.text}`;
    const w = ctx.measureText(scene.cta).width + 96;
    const cy = H * 0.615;
    fillRoundRect(ctx, W / 2 - w / 2, cy, w, 96, 48, pal.accent);
    drawText(ctx, scene.cta, W / 2, cy + 62, { size: 38, weight: 700, color: pal.bg, align: 'center' });
    ctx.restore();
  }
  drawBrand(ctx, W, H, pal, { brand, index, total, progress: ctxInfo.filmProgress });
}

export const ENGINES = { hook, stat, chart, compare, list, quote, title, outro };

/** Render one scene at local time t (seconds since scene start). */
export function renderScene(ctx, scene, t, info) {
  const fn = ENGINES[scene.kind];
  if (!fn) throw new Error(`no engine for scene kind "${scene.kind}"`);
  setSceneTime(t);
  fn(ctx, scene, t, info);
}

export { drawProgressBar, safeArea, fmtNumber };

/**
 * Burned-in captions with word-level highlight.
 * Social video is watched muted first; a caption band is the single highest-value
 * retention change we can make. Words are highlighted as the voice reaches them,
 * and the band sits above the platform bottom UI.
 */
export function drawCaptions(ctx, cue, tAbs, info) {
  if (!cue || !cue.text) return;
  // If the narration is already on screen as display type (hook headline, quote),
  // a caption would just repeat it in a colliding band. Skip those cues.
  if (cue.skip) return;
  const { W, H, pal } = info;
  const words = cue.text.trim().split(/\s+/);
  const dur = Math.max(0.2, cue.end - cue.start);
  const elapsed = clamp((tAbs - cue.start) / dur);
  const activeIdx = Math.min(words.length - 1, Math.floor(elapsed * words.length));

  const band = Math.round(H * 0.765);
  const maxW = W - Math.round(W * 0.13);
  const size = words.length > 9 ? 46 : 54;
  ctx.save();
  ctx.font = `700 ${size}px ${FONTS.text}`;
  // greedy wrap into at most 3 lines
  const lines = [];
  let cur = [], curW = 0;
  const spaceW = ctx.measureText(' ').width;
  words.forEach((wd) => {
    const w = ctx.measureText(wd).width;
    if (curW + w + spaceW > maxW && cur.length) { lines.push(cur); cur = []; curW = 0; }
    cur.push(wd); curW += w + spaceW;
  });
  if (cur.length) lines.push(cur);
  const shown = lines.slice(-3);
  const lineH = size * 1.24;
  const blockH = shown.length * lineH;

  // legibility plate
  const plateW = maxW + 48;
  ctx.globalAlpha = 0.55;
  fillRoundRect(ctx, W / 2 - plateW / 2, band - size - 18, plateW, blockH + 34, 22, 'rgba(0,0,0,0.55)');
  ctx.globalAlpha = 1;

  let idx = 0;
  shown.forEach((line, li) => {
    const widths = line.map((w) => ctx.measureText(w).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaceW * (line.length - 1);
    let x = W / 2 - total / 2;
    const y = band - blockH + li * lineH + size;
    line.forEach((wd, wi) => {
      const isActive = idx === activeIdx;
      drawText(ctx, wd, x, y, {
        size, weight: 700, family: FONTS.text,
        color: isActive ? pal.accent : '#ffffff',
      });
      x += widths[wi] + spaceW;
      idx++;
    });
  });
  ctx.restore();
}
