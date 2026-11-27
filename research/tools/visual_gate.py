#!/usr/bin/env python3
"""Run the vendored Ricks visual QA gate on a film and ratchet against a recorded baseline.

Usage: python3 research/tools/visual_gate.py FILM.mp4 [--baseline BASE.json] [--out CUR.json]

Why a ratchet: the Round 13 film currently FAILS 3 of 7 targets (see
research/audits/ROUND13_VISUAL_AUDIT.md). Making the absolute gate blocking would red-X every
push and teach everyone to ignore CI. Instead this fails only when a metric gets WORSE than
the recorded baseline, while always printing the absolute verdict. Tighten the baseline as
the visuals improve; never loosen it.

The gate itself is third-party MIT code; the targets are inherited from that study, not
measured by us on the channel. See research/references/ricksclips/PROVENANCE.md.
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATE = os.path.join(ROOT, "references", "ricksclips", "tools", "study", "qa_motion.py")
LINE = re.compile(r"^(PASS|FAIL|ok|LOW)\s+(.+?)\s+([-\d.]+)\s+\((target|advisory)\s+(>=|<=)\s+([-\d.]+)\)")
# metric label -> (json key, higher_is_better)
KEYS = {
    "anything moving %": ("anything_moving_pct", True),
    "local (non-camera) moving %": ("local_moving_pct", True),
    "dead frames %": ("dead_frames_pct", False),
    "longest dead stretch s": ("longest_dead_stretch_s", False),
    "avg moving area %": ("avg_moving_area_pct", True),
    "composition change every s": ("composition_change_s", False),
    "hard cuts": ("hard_cuts", False),
    "camera roll frames %": ("camera_roll_frames_pct", True),
    "pull-back frames %": ("pullback_frames_pct", True),
}
TOL = 0.05  # ignore measurement noise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--baseline")
    ap.add_argument("--out")
    a = ap.parse_args()

    if not os.path.exists(GATE):
        sys.exit(f"gate not found: {GATE}")
    proc = subprocess.run([sys.executable, GATE, a.film], capture_output=True, text=True)
    print(proc.stdout, end="")
    if proc.stderr.strip():
        print(proc.stderr, file=sys.stderr)

    rows = []
    for ln in proc.stdout.splitlines():
        m = LINE.match(ln.strip())
        if not m:
            continue
        verdict, label, val, kind, op, tgt = m.groups()
        label = label.strip()
        if label not in KEYS:
            continue
        key, hib = KEYS[label]
        rows.append({"metric": key, "label": label, "value": float(val), "op": op,
                     "target": float(tgt), "verdict": verdict,
                     "advisory": kind == "advisory", "higher_is_better": hib})
    if not rows:
        print(proc.stdout)
        sys.exit("could not parse any gate metrics — gate output format changed?")

    n_fail = sum(1 for r in rows if r["verdict"] == "FAIL")
    n_pass = sum(1 for r in rows if r["verdict"] == "PASS")
    cur = {"subject": a.film, "results": rows,
           "summary": {"pass": n_pass, "fail": n_fail,
                       "advisory_low": sum(1 for r in rows if r["verdict"] == "LOW")}}
    if a.out:
        with open(a.out, "w") as f:
            json.dump(cur, f, indent=2)
            f.write("\n")

    regressions = []
    if a.baseline and os.path.exists(a.baseline):
        base = json.load(open(a.baseline))
        bmap = {r["metric"]: r["value"] for r in base.get("results", [])}
        for r in rows:
            if r["metric"] not in bmap:
                continue
            b = bmap[r["metric"]]
            worse = (r["value"] < b - TOL) if r["higher_is_better"] else (r["value"] > b + TOL)
            if worse:
                regressions.append((r["label"], b, r["value"]))

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"### Visual QA gate — `{os.path.basename(a.film)}`", "",
             f"**{n_pass} PASS / {n_fail} FAIL** against the inherited reference targets.", "",
             "| Metric | Value | Target | Verdict |", "|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['label']} | {r['value']:.2f} | {r['op']} {r['target']:g} | {r['verdict']} |")
    if regressions:
        lines += ["", "**REGRESSIONS vs baseline:**"]
        for label, b, v in regressions:
            lines.append(f"- {label}: baseline {b:.2f} -> now {v:.2f}")
    if summary:
        with open(summary, "a") as f:
            f.write("\n".join(lines) + "\n")

    print(f"\nAbsolute verdict: {n_pass} PASS / {n_fail} FAIL")
    if regressions:
        print("REGRESSIONS vs baseline:")
        for label, b, v in regressions:
            print(f"  {label}: {b:.2f} -> {v:.2f}")
        sys.exit(1)
    print("No regression vs baseline.")
    if n_fail:
        print(f"NOTE: {n_fail} absolute target(s) still unmet — tracked in the visual-round issues.")


if __name__ == "__main__":
    main()
