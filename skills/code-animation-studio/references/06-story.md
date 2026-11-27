# 06 · Story → script → storyboard → shots

The picture serves the words. Write the script first, align it, and let the **word timestamps**
become the edit timeline. Never write a script to fit an animation you already built.

---

## 1. The script formula (from the reference pack, validated in production)

Source: `research/references/stick3d/SCRIPTWRITING-PROMPT.md`.

- **Open mid-action. Zero warm-up.** The first line must already be inside the story.
  Delivered example: *"Everyone in the village laughed at Sami."* — conflict in word one.
- **One tight narrative** that explains a real phenomenon, principle, historical event, or a
  human truth. Not a list of facts.
- **Every line pulls forward.** No filler, no "let me tell you about…".
- **End the moment the concept lands.** No summary, no "so that's why", no call to action.
  Delivered ending: *"And the boy they laughed at became the one they remembered."*
- **Name the idea naturally inside the story**, never as a textbook definition.
- Plain flowing prose. No headings, bullets, scene directions or character tags in the narration.

### Length arithmetic (measured)

| Words | ≈ Characters | Duration @ speed 0.9 |
|---|---|---|
| 89 | ~500 | **31.975 s** (the delivered film) |
| ~150 | 800–900 | ~50–60 s (the pack's target) |

The pack targets 800–900 characters ≈ 45–60 s. Shorter is legitimate for a fable. **Always measure
the actual generated audio** — do not assume a words-per-minute rate.

### Niche menu that works for this format

Bizarre real phenomena (target fixation, Baader-Meinhof) · counterfactual history (the Library of
Alexandria never burns) · historical scams (salting a mine; selling the Eiffel Tower twice) ·
accidental discoveries (safety glass, the Slinky) · ancient war tricks · original fables.

**Fact-check real subjects before writing** (names, dates, sequence, mechanism) and flag
uncertainty. Fiction needs no research — go straight to script.

---

## 2. From script to beats

Split the script at sentence/clause boundaries. Each beat becomes one shot. For the delivered film:

| # | Narration | Beat | Shot |
|---|---|---|---|
| 1 | "Everyone in the village laughed at Sami." | establish + conflict | `square` 0.0–3.7 |
| 2 | "While the others chased gold, he chose clay." | the choice | `choice` 3.7–6.5 |
| 3 | "They called him crazy. They called him slow." | mockery | `mockery` 6.5–10.1 |
| 4 | "But every morning, his hands were already spinning." | daily work | `wheel` 10.1–13.1 |
| 5 | "He shaped a thousand pots, and threw a thousand more away." | repetition/failure | `montage` 13.1–17.1 |
| 6 | "Then one night, he fired the kiln hotter than ever before." | the risk | `kiln` 17.1–21.0 |
| 7 | "When the doors swung open, the whole village fell silent." | the turn | `doors` 21.0–24.5 |
| 8 | "Because what came out wasn't just pottery…" | the payoff | `reveal` 24.5–29.9 |
| 9 | "And the boy they laughed at became the one they remembered." | resolution | `celebration` 29.9–36.0 |

**Nine beats, nine locations, nine camera ideas.** That ratio is the target: roughly one shot per
3–5 seconds. Longer than ~6 s and the scene needs internal action changes; shorter than ~2 s and
the viewer can't read it.

---

## 3. Storyboard: the three-idea rule

From `references/stick3d/rules/CREATIVE-FREEDOM.md`:

> For each scene, generate **three** distinct visual ideas, then pick the least obvious one.
> Neighbouring scenes must differ in location, camera language and action type.
> **Reuse helpers, never layouts.**

Worked example for *"he chose clay"*:
1. *(obvious)* Sami holds a lump of clay. ✗ static, no contrast.
2. *(better)* Split frame: gold on one side, clay on the other. ✗ graphic, not a scene.
3. *(chosen)* A two-shot: the merchant clutches gold to his chest (`G.greedy`) while Sami carries
   a pot past him (`G.carry`), camera tracking laterally between them. ✓ the movement *is* the
   comparison, both characters act, the location is populated.

Write the storyboard as a table before coding: **beat | location | who | action | camera |
transition | SFX**. This table becomes the shot list in the film module and the SFX event list in
the audio assembler — one source of truth, three consumers.

---

## 4. Visual metaphor: making the abstract visible

Every scene must *show* what the narration *says*. Techniques that worked:

- **Contrast staging** — gold vs clay in one frame, two characters with opposite gestures.
- **Repetition made physical** — "a thousand pots" becomes a shelf of pots, camera racking across
  it, then one shattering. The count is implied by the shelf, not by a number.
- **Reaction as proof** — "the whole village fell silent" is shown by a crowd doing `G.gasp`,
  not by a caption saying they were amazed.
- **Light as time** — day → night → warm interior → night celebration carries the arc without a
  single word of exposition.
- **The hero object** — the payoff gets a dedicated, densely detailed prop (`K.masterpiece`) and
  the film's only `fovKick`. Spend your detail budget where the story lands.

---

## 5. Timing the shots to the words

1. Generate narration → `processVoice` → measure duration.
2. `alignWords` → `words.json` with real onsets.
3. Find the onset of each beat's first word. **That is the shot's `start`.**
4. Add the cold-open `LEAD` (1.2 s in the delivered film) to every word time for captions, and
   offset shot starts accordingly.
5. Round `TOTAL` up to a clean number that leaves room for a 1 s outro fade.

```js
shots = [
  { name:'square', start:0.0, dur:3.7, trans:{type:'fadein', dur:0.8} },
  ...
];
TOTAL = 36.0; LEAD = 1.2;
```

**If you regenerate the narration at a different speed, every boundary must be re-derived.**
Scaling by eye is how picture and voice drift apart.

---

## 6. Script quality gate (before you render anything)

- [ ] First line is mid-action; no warm-up.
- [ ] One narrative, not a list.
- [ ] Every sentence advances the story.
- [ ] Ends on the payoff — no summary, no CTA.
- [ ] Read it aloud mentally: does any phrase stumble? Rewrite those.
- [ ] Word count → expected duration is in the target range.
- [ ] Each beat is *visualisable* as an event, not a statement.
- [ ] Keywords for caption colouring chosen (8–12 story nouns/verbs).

Save the script as `research/artifacts/roundN/script.txt` next to the film — it is the source of
truth for alignment, and re-aligning later requires the exact same text.
