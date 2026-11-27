# The research and learning workflow

This is the operating system for the work, not a one-off report. It exists so that a
reference sent on any future day goes through the same ten steps, produces the same
artefacts, and lands in a knowledge base that can be searched instead of remembered.

## The one rule everything serves

> **A status is a claim about the past, and it must be earned.**

`discovered` costs one line. `inspected` means source, docs or renders were actually
read or looked at. `tested` means it ran **in this environment**, and there is a command
and a result to prove it. `integrated` means code landed in our engine and an artefact
path exists on disk. `rejected` requires a written reason.

The ledger enforces this in code: `kb.mjs` refuses `tested` without `--evidence`, refuses
`integrated` without `--evidence` **and** an artifact path that exists, and refuses
`rejected` without `--reason`. No prose can quietly upgrade a project.

## Artefacts

| path | what it is |
|---|---|
| `research/ledger.json` | the single source of truth: every record, its status, evidence, findings, history |
| `research/tools/kb.mjs` | the CLI: add / status / note / search / stats / report / validate / intake / candidates |
| `research/RESEARCH_LOG.md` | generated report, never hand-edited |
| `research/references/<slug>.md` | one intake document per supplied reference, the 10-step checklist |
| `research/ENVIRONMENT.md` | what this sandbox can and cannot do, by measurement |
| `research/INSPECTION_CAPABILITIES.md` | what *I* can see and hear, by measurement |
| `research/STYLE_REFERENCE_NOTES.md` | visual read-off of the reference stills |
| `research/3D_RESEARCH_ROUND1.md` | round-1 narrative report |
| `research/knowledge_base.json` | Phase-3 provenance, superseded by the ledger |

## The loop, for every reference

**1. Intake.** `node research/tools/kb.mjs intake <slug> --name "…"` creates the
checklist. Record what was *actually* supplied (files, links, screenshots) and what was
actually looked at.

**2. Analyse.** Separate observation from inference. "The armour has a broad stretched
specular" is an observation from a frame; "it is a physical material" is an inference.

**3. Identify techniques.** Rendering approach, timing model, character/prop system,
typography, lighting, audio, and — most valuable — *what makes it look expensive*.

**4. Find the original and similar implementations.** Search GitHub explicitly; write
the queries into the intake doc so they are repeatable. Check stars, licence, last
commit, whether it is a wrapper or the real thing.

**5. Find more advanced alternatives.** Deliberately hunt for something better than the
first hit. If nothing better exists, record that as a finding, not a stop.

**6. Follow the graph.** Dependencies, sibling repos, the author's other work, the tools
a project depends on. `vsim`'s README led to Blender Cycles integration and a
validated-screenplay pipeline; `anim.py` led to HyperFrames, which led to
`@sparticuz/chromium`.

**7. Docs, papers, tutorials, demos.** Papers are readable as text (arXiv parses).
Prefer primary sources over blog summaries.

**8. Compare.** A verdict table: what fits *our* constraints (2 cores, no WebGL, 9:16
1080×1920, deterministic), what does not, and why. "The most popular" is not a verdict.

**9. Test.** Run it with the real workload and record ms/frame, output resolution, and
any defect found by looking at the frames. Then look at the frames — an unviewed render
is not a test.

**10. Extract and record.** Promote the ledger record with evidence; add the technique to
the "Techniques extracted" section of the intake doc; note explicitly what was *not*
built.

## Rules that are never relaxed

- Never claim to have heard audio. Audio is numbers, spectrograms and waveforms only.
- Never claim to have watched continuous video. The phrase is "sampled N frames at X fps".
- Never claim a technique works because a README says so.
- Never run an uploaded `setup.sh` / `install.sh` / `postinstall`. Read it first.
  (`hyperframes` is installed with `--ignore-scripts` precisely for this reason.)
- Never delete the working pipeline to make room for an experiment. Add alongside;
  integration is a separate, tested step.
- Never start final video production without explicit approval of the visual direction.

## Commands

```bash
node research/tools/kb.mjs stats                    # the scoreboard
node research/tools/kb.mjs candidates               # what to inspect or test next
node research/tools/kb.mjs list --status tested
node research/tools/kb.mjs search outline           # search findings, tags, names
node research/tools/kb.mjs show hf-dom
node research/tools/kb.mjs status vsim inspected --evidence "read packages/engine/src"
node research/tools/kb.mjs note vsim --finding "…"
node research/tools/kb.mjs validate && node research/tools/kb.mjs report

# render anything HTML/CSS/GSAP/SVG/canvas2d to MP4
bash research/tools/browser/provision.sh            # once per sandbox
bash research/tools/browser/render.sh <dir> out.mp4 --fps 30
```

## Batching

Research runs in rounds. Each round ends with: ledger validated, `RESEARCH_LOG.md`
regenerated, one narrative report in `research/`, and at most a small number of
*experimental* renders — never a final video. The user approves direction; only then does
`studio/` produce something shippable.

## Why this beats a report

The result of a round is not prose, it is state: a queryable ledger that answers "what do
we know, how do we know it, and what is still just a rumour" — plus a working render cell
that turns any future HTML composition into an MP4 in seconds.
