#!/usr/bin/env python3
import json, os, subprocess, sys
RAW="raw"; os.makedirs(RAW, exist_ok=True)
out={}
path=f"{RAW}/meta.json"
if os.path.exists(path): out=json.load(open(path))
for line in open(sys.argv[1]):
    r=line.strip()
    if not r or r in out: continue
    p=subprocess.run(["gh","api",f"repos/{r}"],capture_output=True,text=True)
    if p.returncode!=0:
        out[r]={"error":p.stderr.strip()[:120]}; continue
    d=json.loads(p.stdout)
    out[r]={"stars":d["stargazers_count"],"size_kb":d["size"],"license":(d.get("license") or {}).get("spdx_id"),
            "pushed":d["pushed_at"][:10],"created":d["created_at"][:10],"lang":d.get("language"),
            "topics":d.get("topics",[]),"archived":d.get("archived"),"desc":(d.get("description") or "")[:200],
            "homepage":d.get("homepage"),"forks":d.get("forks_count"),"open_issues":d.get("open_issues_count"),
            "default_branch":d.get("default_branch")}
    json.dump(out,open(path,"w"),indent=0)
print("done", len(out))
