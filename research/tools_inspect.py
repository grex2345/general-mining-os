#!/usr/bin/env python3
"""Structural inspector for cloned repos: skills found, deps, rendering signals."""
import json, os, re, subprocess, sys

SIG = {
 "ffmpeg": r"\bffmpeg\b", "remotion": r"\bremotion\b", "three.js": r"\bthree(\.js)?\b|@react-three",
 "gsap": r"\bgsap\b", "manim": r"\bmanim\b", "playwright": r"playwright", "puppeteer": r"puppeteer",
 "canvas2d": r"getContext\(['\"]2d", "wgsl/glsl": r"\b(wgsl|glsl|shader)\b", "d3": r"\bd3(-scale|-shape)?\b",
 "svg-anim": r"animateMotion|<animate|stroke-dashoffset", "blender": r"\bblender\b", "moviepy": r"\bmoviepy\b",
 "whisper": r"whisper", "elevenlabs": r"elevenlabs", "kokoro": r"kokoro", "edge-tts": r"edge-tts",
 "lottie": r"lottie", "framer-motion": r"framer-motion|motion/react", "chromium-cdp": r"CDP|--headless",
 "python": r"^import |^from .* import", "typescript": r"interface \w+|: string\b",
}
DEPFILES = ["package.json","requirements.txt","pyproject.toml","environment.yml","Cargo.toml","composer.json"]

def sh(c, cwd):
    return subprocess.run(c, shell=True, cwd=cwd, capture_output=True, text=True).stdout.strip()

def inspect(path):
    out = {}
    out["repo"] = sh("git config --get remote.origin.url", path).replace(".git","").split("github.com/")[-1]
    out["head"] = sh("git log -1 --format='%h %ad %s' --date=short", path)
    out["size_kb"] = int(sh("du -sk --exclude=.git . | cut -f1", path) or 0)
    out["license"] = next((f for f in ["LICENSE","LICENSE.md","LICENSE.txt","COPYING"] if os.path.exists(os.path.join(path,f))), None)
    if out["license"]:
        head = open(os.path.join(path,out["license"]), errors="ignore").read(400).replace("\n"," ")
        out["license_head"] = head[:180]
    # skills
    skills = []
    for root, dirs, files in os.walk(path):
        if ".git" in root: continue
        for f in files:
            if f.upper() == "SKILL.MD":
                p = os.path.join(root,f)
                txt = open(p, errors="ignore").read()
                fm = {}
                m = re.match(r"^---\n(.*?)\n---", txt, re.S)
                if m:
                    for line in m.group(1).split("\n"):
                        if ":" in line and not line.strip().startswith("#"):
                            k,v = line.split(":",1); fm[k.strip()] = v.strip().strip('"\'')
                skills.append({"name": fm.get("name") or f, "path": os.path.relpath(p, path),
                    "desc": (fm.get("description") or "")[:200], "bytes": len(txt),
                    "has_scripts": os.path.isdir(os.path.join(os.path.dirname(p),"scripts")),
                    "has_refs": os.path.isdir(os.path.join(os.path.dirname(p),"references")) or os.path.isdir(os.path.join(os.path.dirname(p),"assets"))})
    out["skill_count"] = len(skills); out["skills"] = skills
    # deps
    deps = {}
    for d in DEPFILES:
        fp = os.path.join(path,d)
        if os.path.exists(fp):
            txt = open(fp, errors="ignore").read()[:6000]
            deps[d] = txt
    out["depfiles"] = {k: v[:2500] for k,v in deps.items()}
    # signals over code
    files = [os.path.join(r,f) for r,_,fs in os.walk(path) if ".git" not in r for f in fs
             if os.path.splitext(f)[1] in (".ts",".tsx",".js",".jsx",".py",".md",".glsl",".wgsl",".html",".sh",".json")]
    blob = ""
    for fp in files[:600]:
        try: blob += open(fp, errors="ignore").read()[:20000]
        except: pass
    blob = blob[:2_000_000]
    out["signals"] = {k: len(re.findall(v, blob, re.M|re.I)) for k,v in SIG.items()}
    out["file_types"] = {}
    for fp in files:
        e = os.path.splitext(fp)[1]; out["file_types"][e] = out["file_types"].get(e,0)+1
    readme = os.path.join(path,"README.md")
    out["readme_head"] = open(readme, errors="ignore").read()[:3000] if os.path.exists(readme) else ""
    return out

if __name__ == "__main__":
    res = {}
    for p in sys.argv[1:]:
        try: res[os.path.basename(p)] = inspect(p)
        except Exception as e: res[os.path.basename(p)] = {"error": str(e)}
    print(json.dumps(res, indent=1)[:120000])
