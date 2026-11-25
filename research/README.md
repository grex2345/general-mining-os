# Research workspace — programmatic video creation toolkit

**Start here → [`REPORT.md`](./REPORT.md)** (full findings) and [`TESTLOG.md`](./TESTLOG.md) (verbatim test evidence).

## Layout

```
research/
├── REPORT.md                  # the deliverable: findings, evaluations, architecture, shortlist
├── TESTLOG.md                 # every test command + output (incl. what failed and why)
├── data/
│   ├── capability_database.json   # 9 capability groups × 46 provider entries with evidence levels
│   ├── repos_inspected.csv        # 33 cloned repos: stars, licence, lang, last push, skills, signals
│   ├── skills_inventory.csv       # 185 SKILL.md records
│   └── inspected.json              # machine-readable version of both CSVs
├── raw/
│   ├── discovered_repos.json      # all 724 discovered repos
│   ├── meta.json                  # API metadata for 99 candidates
│   ├── matrix.json                # structural inspection of the 33 clones
│   └── *.json                     # 54 cached GitHub search responses (query in `_query`)
├── tools_gh_search.py         # cached, rate-limit-friendly repo search
├── tools_meta.py              # exact repo metadata via `gh api`
├── tools_inspect.py           # structural inspector (SKILL.md, deps, engine signals)
├── tools_matrix.py            # runs the inspector over all clones → raw/matrix.json
└── tools_apiprobe.py          # tree + SKILL.md reader for repos not cloned (gh api)
```

`research/clones/` (2.8 GB of shallow clones) and `research/raw/apiprobe/` are **gitignored** —
re-create them with the scripts, e.g.:

```bash
cd research
python3 tools_gh_search.py 'claude skills animation'     # cached search
python3 tools_meta.py 01_candidates.txt                  # metadata
git clone --depth 1 https://github.com/heygen-com/hyperframes clones/hyperframes
python3 tools_matrix.py                                  # inspect every clone
python3 tools_apiprobe.py remotion-dev/skills            # for repos you don't clone
```

## Reproducing the tests

```bash
npx --yes hyperframes@0.9.94 --version          # CLI reachable?
cd /tmp && npx --yes hyperframes@0.9.94 init t --skip-skills && cd t
npx --yes hyperframes@0.9.94 check --json       # static gate
npx --yes hyperframes@0.9.94 render             # needs Chrome + FFmpeg (not available here)
```

Block-library audit: copy each `registry/blocks/<name>/<name>.html` to `<name>/index.html`
and run `npx hyperframes lint .` — see TESTLOG.md §T6 for the recorded results (99/123 clean).
