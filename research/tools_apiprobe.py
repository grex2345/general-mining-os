#!/usr/bin/env python3
"""For repos we don't clone: list tree, find SKILL.md, print frontmatter + size + signal counts."""
import base64, json, os, subprocess, sys, re
RAW="raw/apiprobe"; os.makedirs(RAW, exist_ok=True)
def api(path):
    p=subprocess.run(["gh","api",path],capture_output=True,text=True)
    return json.loads(p.stdout) if p.returncode==0 else None
for repo in sys.argv[1:]:
    key=repo.replace("/","__")
    cache=f"{RAW}/{key}.json"
    if os.path.exists(cache): tree=json.load(open(cache))
    else:
        d=api(f"repos/{repo}/git/trees/HEAD?recursive=1")
        if not d or "tree" not in d: print(f"!! {repo} tree fail"); continue
        tree=d["tree"]; json.dump(tree,open(cache,"w"))
    paths=[t["path"] for t in tree if t["type"]=="blob"]
    skills=[t for t in tree if t["path"].lower().endswith("skill.md")]
    ext={}
    for p in paths:
        e=os.path.splitext(p)[1].lower(); ext[e]=ext.get(e,0)+1
    print(f"\n=== {repo} files={len(paths)} skills={len(skills)}")
    print("   ext:", dict(sorted(ext.items(), key=lambda t:-t[1])[:8]))
    print("   top:", ", ".join(paths[:14]))
    for s in skills[:8]:
        c=api(f"repos/{repo}/contents/{s['path']}")
        if not c: continue
        try: txt=base64.b64decode(c["content"]).decode("utf-8","ignore")
        except: continue
        fm=re.match(r"^---\n(.*?)\n---",txt,re.S)
        name=re.search(r"^name:\s*(.+)$",fm.group(1),re.M) if fm else None
        desc=re.search(r"^description:\s*(.+)$",fm.group(1),re.M) if fm else None
        sig={k:len(re.findall(v,txt,re.I)) for k,v in {"ffmpeg":r"ffmpeg","remotion":r"remotion","three":r"three\.js","gsap":r"gsap","manim":r"manim","whisper":r"whisper","lottie":r"lottie","blender":r"blender","d3":r"\bd3\b"}.items() if len(re.findall(v,txt,re.I))}
        print(f"   - {s['path']} ({len(txt)}b) name={(name.group(1) if name else '?')[:30]} | {(desc.group(1) if desc else '')[:100]}")
        if sig: print(f"     sig {sig}")
