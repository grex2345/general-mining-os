#!/usr/bin/env python3
"""Rate-limit-friendly GitHub repo search -> JSON cache."""
import json, os, subprocess, sys, urllib.parse, time, hashlib

RAW = os.path.join(os.path.dirname(__file__), "raw")

def search(q, sort="stars", per_page=30, page=1):
    key = hashlib.sha1(f"{q}|{sort}|{per_page}|{page}".encode()).hexdigest()[:12]
    path = os.path.join(RAW, f"{key}.json")
    if os.path.exists(path):
        return json.load(open(path)), True
    url = f"search/repositories?q={urllib.parse.quote(q)}&sort={sort}&order=desc&per_page={per_page}&page={page}"
    r = subprocess.run(["gh", "api", url], capture_output=True, text=True)
    if r.returncode != 0:
        print("ERR", q, r.stderr[:300], file=sys.stderr)
        return None, False
    data = json.loads(r.stdout)
    data["_query"] = q
    json.dump(data, open(path, "w"))
    return data, False

def show(q, **kw):
    d, cached = search(q, **kw)
    if not d:
        return
    print(f"\n### {q}  (total={d.get('total_count')}, {'cached' if cached else 'live'})")
    for it in d.get("items", []):
        lic = (it.get("license") or {}).get("spdx_id") or "-"
        print(f"{it['stargazers_count']:>6} | {it['full_name']:<52} | {lic:<12} | {it['pushed_at'][:10]} | {(it.get('description') or '')[:95]}")

if __name__ == "__main__":
    for q in sys.argv[1:]:
        show(q)
        time.sleep(2.2)
