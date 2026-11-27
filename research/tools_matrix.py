#!/usr/bin/env python3
import json, os, re, subprocess, sys
sys.path.insert(0,'.')
from tools_inspect import inspect
CL="clones"
res={}
if os.path.exists("raw/matrix.json"): res=json.load(open("raw/matrix.json"))
for d in sorted(os.listdir(CL)):
    p=os.path.join(CL,d)
    if not os.path.isdir(p) or d in res: continue
    try: res[d]=inspect(p)
    except Exception as e: res[d]={"error":str(e)}
json.dump(res,open("raw/matrix.json","w"))
for d,v in res.items():
    if "error" in v: print(d,"ERR",v["error"][:60]); continue
    sig=",".join(f"{k}:{x}" for k,x in sorted(v["signals"].items(), key=lambda t:-t[1])[:6] if x)
    deps=",".join(v["depfiles"].keys()) or "-"
    print(f"\n### {d}  [{v['repo']}] skills={v['skill_count']} {v['size_kb']}KB")
    print(f"    deps: {deps}")
    print(f"    sig : {sig}")
    for s in v["skills"][:16]:
        print(f"     - {s['name'][:34]:<34} {s['bytes']:>5}b S{'Y' if s['has_scripts'] else 'n'} | {s['desc'][:95]}")
