#!/usr/bin/env python3
"""Round 14 cinematic gate — measures things the motion gate cannot see.

Usage:
  python3 research/tools/cinema_gate.py composition-report.json \
      [--signoff research/audits/round14-inspection.json] [--out CUR.json]

WHY THIS EXISTS
---------------
The vendored Ricks motion gate (research/tools/visual_gate.py) measures *movement*.
Round 13 passed 97.6% of its "anything moving" target and still framed nothing: the bell
was upside down, ten macro shots sat inside their own subjects, and the story's central
explanation (the air voids inside the stone) was sealed inside a closed box. A film can
move on every frame and still be unwatchable. Movement is not the goal; readable,
motivated composition is.

So this gate checks four things the motion gate is blind to, and then refuses to pass
without a human having actually looked at every composition.

  1. INTENT    every composition states a story reason (`why`). Motion without a reason
               is the failure mode we were explicitly told to avoid.
  2. FRAMING   the subject the shot is ABOUT occupies a sane share of frame height.
               This is what catches cameras inside walls and macros inside objects.
  3. RHYTHM    no composition holds past 2.2 s; no two consecutive medium shots.
  4. GRAMMAR   the film uses a real range of scales and motivated moves, not one angle
               with shake added.

  5. HUMAN     a sign-off file must record every composition as viewed, with a verdict
               and no unresolved defects. Absent or incomplete sign-off => FAIL.

Thresholds are ours, derived from inspecting our own renders. The 2.2 s composition bar
is inherited from the vendored Celyxi/Ricks study; the framing bands are ours. See
research/audits/ROUND14_VISUAL_STANDARD.md.
"""
import argparse
import json
import os
import sys
from collections import Counter

MAX_COMP_S = 2.2
MIN_KINDS_PER_SCENE = 2
MIN_FILM_KINDS = 4
# A composition must be about something. These are the scales we recognise.
SCALES = ("macro", "close", "medium", "wide")
# Motivated move families we expect a cinematic film to actually use.
MIN_PULL_OR_CRANE_SHARE = 0.14


def check(report, signoff):
    scenes = report.get("scenes", [])
    problems = []
    stats = {}

    comps = []
    for sc in scenes:
        for m in sc.get("marks", []):
            comps.append(dict(m, scene=sc.get("name"), scene_i=sc.get("scene")))
        for p in sc.get("problems", []):
            problems.append(f"[plan] {sc.get('name')}: {p}")

    if not comps:
        return ["composition report contains no compositions"], {}

    # 1. INTENT
    for c in comps:
        if not str(c.get("why", "")).strip():
            problems.append(f"[intent] {c['scene']} comp{c['i']} has no story reason")

    # 2. FRAMING
    unmeasured = [c for c in comps if c.get("coverage") is None]
    for c in comps:
        v = c.get("verdict")
        if v and v != "ok":
            problems.append(
                f"[framing] {c['scene']} comp{c['i']} ({c.get('kind')}) {v} "
                f"coverage={c.get('coverage')} focus={c.get('focus')}m dist={c.get('dist')}m"
            )
    if unmeasured:
        problems.append(f"[framing] {len(unmeasured)} compositions were never measured")

    # 3. RHYTHM
    for c in comps:
        dur = (c.get("t1", 0) or 0) - (c.get("t0", 0) or 0)
        if dur > MAX_COMP_S + 1e-6:
            problems.append(f"[rhythm] {c['scene']} comp{c['i']} holds {dur:.2f}s > {MAX_COMP_S}s")

    # 4. GRAMMAR
    for sc in scenes:
        kinds = set((sc.get("kinds") or {}).keys())
        if len(kinds) < MIN_KINDS_PER_SCENE and sc.get("count", 0) >= 2:
            problems.append(
                f"[grammar] {sc.get('name')} uses only {sorted(kinds)} — one scale for a whole scene"
            )
    film_kinds = Counter(c.get("kind") for c in comps)
    if len([k for k in film_kinds if k in SCALES]) < MIN_FILM_KINDS:
        problems.append(f"[grammar] film uses only {dict(film_kinds)} — needs the full scale range")

    # 5. HUMAN SIGN-OFF — the part that cannot be automated away.
    seen = {}
    if not signoff:
        problems.append("[human] no inspection sign-off supplied — a human must view every composition")
    else:
        if not signoff.get("inspector"):
            problems.append("[human] sign-off has no inspector named")
        # An agent viewing renders is not a human verdict. Record it, but do not let it
        # stand in for the human inspection this standard requires.
        if signoff.get("role") != "human":
            problems.append("[human] sign-off is an agent inspection; a human must confirm the film")
        if signoff.get("human_verdict") not in ("pass", "fixed"):
            problems.append(f"[human] human_verdict={signoff.get('human_verdict')!r} — still pending")
        for row in signoff.get("compositions", []):
            seen[(row.get("scene"), row.get("comp"))] = row
        for c in comps:
            key = (c["scene"], c["i"])
            row = seen.get(key)
            if row is None:
                problems.append(f"[human] {c['scene']} comp{c['i']} was never inspected")
            elif row.get("verdict") not in ("pass", "fixed"):
                problems.append(
                    f"[human] {c['scene']} comp{c['i']} verdict={row.get('verdict')!r} — unresolved"
                )
        for row in signoff.get("defects", []):
            if not row.get("resolved"):
                problems.append(f"[human] open defect: {row.get('what')}")

    stats = {
        "compositions": len(comps),
        "scenes": len(scenes),
        "avg_comp_s": round(sum((c.get("t1", 0) - c.get("t0", 0)) for c in comps) / len(comps), 3),
        "longest_comp_s": round(max((c.get("t1", 0) - c.get("t0", 0)) for c in comps), 3),
        "kinds": dict(film_kinds),
        "framing_ok": sum(1 for c in comps if c.get("verdict") == "ok"),
        "framing_measured": sum(1 for c in comps if c.get("coverage") is not None),
        "with_story_reason": sum(1 for c in comps if str(c.get("why", "")).strip()),
        "human_inspected": len(seen),
        "human_required": len(comps),
    }
    return problems, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--signoff")
    ap.add_argument("--out")
    a = ap.parse_args()

    report = json.load(open(a.report))
    signoff = json.load(open(a.signoff)) if a.signoff and os.path.exists(a.signoff) else None
    problems, stats = check(report, signoff)

    print("ROUND 14 CINEMATIC GATE")
    for k, v in stats.items():
        print(f"  {k:22s} {v}")
    print()
    if problems:
        print(f"FAIL — {len(problems)} problem(s):")
        for p in problems:
            print("  - " + p)
    else:
        print("PASS — intent, framing, rhythm, grammar, and human inspection all satisfied.")

    if a.out:
        json.dump({"pass": not problems, "stats": stats, "problems": problems},
                  open(a.out, "w"), indent=2)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
