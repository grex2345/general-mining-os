"""One-word-at-a-time captions (Ricks look) as an .ass file.

Usage: python3 tools/captions.py work/words.json captions.ass [--fix "boughs=bows,trapped door=trapdoor"]

Look: Lilita One 104 px, white, 9 px black outline + soft shadow, centred at y=1250 on 1080x1920
(about 65% height, where Ricks puts them), each word pops from 88% to 100% in 70 ms.
Each word stays until the next one starts (gaps under 0.4 s are bridged so captions never flicker off).
Always read the words back and fix whisper mishearings with --fix (e.g. "boughs" -> "bows").
"""
import json, sys

src, dst = sys.argv[1], sys.argv[2]
fixes = {}
if "--fix" in sys.argv:
    for pair in sys.argv[sys.argv.index("--fix") + 1].split(","):
        a, b = pair.split("="); fixes[a.strip().lower()] = b.strip()
W = json.load(open(src))
# multi-word fixes ("trapped door" -> "trapdoor")
i = 0
while i < len(W) - 1:
    two = (W[i]["w"] + " " + W[i + 1]["w"]).lower().strip(".,!?")
    if two in fixes: W[i] = {"w": fixes[two], "s": W[i]["s"], "e": W[i + 1]["e"]}; del W[i + 1]
    i += 1
for w in W:
    core = w["w"].strip(".,!?\"'").lower()
    if core in fixes: w["w"] = w["w"].lower().replace(core, fixes[core])

ts = lambda t: f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"
head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: W,Lilita One,104,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,9,3,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
lines = []
for k, w in enumerate(W):
    end = W[k + 1]["s"] if k + 1 < len(W) and W[k + 1]["s"] - w["e"] < 0.4 else w["e"] + 0.1
    lines.append(f"Dialogue: 0,{ts(w['s'])},{ts(end)},W,,0,0,0,,{{\\pos(540,1250)\\fscx88\\fscy88\\t(0,70,\\fscx100\\fscy100)}}{w['w']}")
open(dst, "w", encoding="utf-8").write(head + "\n".join(lines) + "\n")
print(len(lines), "words ->", dst)
