# CI definitions awaiting installation

## `visual-qa.yml` — needs one manual step

This is a complete, tested GitHub Actions workflow. It is stored here instead of
`.github/workflows/` for one reason: **the token this session authenticates with is a GitHub
App token without the `workflows` permission**, so GitHub rejects any attempt to create a
workflow file. Both routes were tried and both were refused:

```
PUT /repos/.../contents/.github/workflows/visual-qa.yml
  -> 403 Resource not accessible by integration

git push
  -> remote rejected: refusing to allow a GitHub App to create or update workflow
     `.github/workflows/visual-qa.yml` without `workflows` permission
```

**CI is therefore NOT active yet.** Nothing in this repo is being checked automatically.

### To enable it

Either create `.github/workflows/visual-qa.yml` in the GitHub web UI and paste this content,
or from a checkout authenticated as a user with the `workflows` scope:

```bash
mkdir -p .github/workflows
git mv research/ci/visual-qa.yml .github/workflows/visual-qa.yml
git commit -m "Enable the visual QA gate in CI"
git push
```

Or grant the Arena GitHub App the `workflows` permission and ask for it to be installed.

### What it does once enabled

On any push or PR touching a film, `studio/src/**`, or the gate itself, it runs on
`ubuntu-latest`:

1. installs `numpy`, `opencv-python-headless`, `ffmpeg`
2. runs `research/tools/visual_gate.py` on every committed film
3. writes a PASS/FAIL table to the job summary
4. uploads the raw measurements as an artifact
5. **fails only on a regression** against `research/audits/round13-visual-gate.json`

The ratchet is deliberate. The Round 13 film fails 3 of 7 absolute targets today; a blocking
gate would be permanently red and would teach everyone to ignore CI. Instead the baseline
ratchets forward as the visuals improve, and must never be loosened.

### Verified before committing

The gate path was executed end to end against the real delivered MP4, mirroring the repo
layout, on 2026-11-26:

- reproduces the recorded numbers exactly (97.63 / 97.07 / 2.37 / 0.33 / 24.07 / 5.07 / 4)
- exits **0** when there is no regression
- exits **1** when tested against a deliberately stricter baseline (composition 3.00 vs 5.07)
- writes a correct Markdown job summary
- workflow YAML parses; 1 job, 6 steps

### Running it by hand today

The gate does not need CI. From a checkout with the dependencies installed:

```bash
python3 research/tools/visual_gate.py \
  research/artifacts/round13/film/the-bell-of-vellara.mp4 \
  --baseline research/audits/round13-visual-gate.json
```
