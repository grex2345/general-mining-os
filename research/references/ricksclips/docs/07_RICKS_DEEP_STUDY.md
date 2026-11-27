# Ricks Clips Deep Study (19 videos, frame by frame)

Studied Nov 8 2026: 19 Ricks Clips shorts (~18.5 min, ~33,000 frames). The 5 earlier references plus 14 new ones.
Every frame was measured in code (tools/study/), and dense frame strips (10 fps and 30 fps) were inspected by eye.
Raw numbers: `reference/ricks-study/data/` (stats.json, trans.json, aud.json, scripts.txt). Sheets: `reference/ricks-study/sheets/`.

Videos: Spear vs Shield, Spot Winning Tickets, Mirror Rigged a Horse Race, Levels of Pirate Cannonballs, Ancient Jar (32M),
Burglar Who Only Moved Furniture, Job Nobody Wants in Japan (16M), Pink Prison Cell, Scientist's Time Test, Town Built Around a Button,
Window That Breaks Japan's Gambling Law, Shape That Saved Roller Coasters, Grave Bell, Cashiers Win the Lottery, Humans Can't Pick
Random Numbers, Perfect Railroads (24M), Storm Oil (14M), Second Draw Always Wins, Brain's Secret Idea Zone.

---

## 0. The one-paragraph answer

His videos are **one continuous camera flight through a living world where the narration is acted out literally, word by word**.
The camera almost never stops and almost never hard-cuts (median **0 hard cuts** per video). It changes the picture every **~2.1 s**
by flying, pulling back, tilting, orbiting, following a moving object, or dissolving *while moving*. Inside every picture, a third of the
screen is moving (**33% of pixels**). That motion comes from characters *doing the thing the narrator just said*, other
characters reacting, props and FX (sparks, liquid, smoke, glow), a living environment (waves, rain, clocks, twinkling stars, flames,
birds, a fly on a cup), and deep 3D parallax as the camera glides past foreground objects. A frame with nothing moving is **3.4%** of
his video. The longest still moment is **under half a second**.

---

## 1. The numbers (median across 19 videos, with range)

| Metric | Ricks median (range) | Target |
|---|---|---|
| Length | 60.5 s (39–66) | 40–65 s |
| Frames with ANY motion (camera or local) | **96.6%** (88.7–99.9) | ≥ 96% |
| Frames with local (non-camera) motion | **94.6%** (84–99.6) | ≥ 94% |
| Frames with camera motion | 83.5% (71–94) | ≥ 83% |
| Dead frames (nothing moves at all) | **3.4%** (0.1–11) | ≤ 4% |
| Longest dead stretch | **0.47 s** (0.03–1.17) | ≤ 0.5 s |
| Average share of the frame that's moving | **33%** (23–48) | ≥ 30% |
| Scene/composition change every | **2.1 s** (1.5–3.2) | ≤ 2.2 s |
| Hard cuts per video | **0** (0–2) | 0–1 |
| Frames with camera roll (dutch tilt changing) | 38% (12–56) | 35–45% |
| Frames zooming/pushing in | 45% | ~45% |
| Frames pulling back (reveals) | 17% (11–33) | ≥ 17% |
| Camera direction reversals per minute | 26 (12–42) | ~25 |
| New local-motion bursts (an action starting) | 1.2 per s | ≥ 1.2 per s |
| Narration speed | **3.67 words/s** (3.35–4.06) | 3.6–3.8 |
| Pauses > 0.3 s in the whole video | 5 (0–15) | ≤ 6 |
| Longest pause | 0.44 s | ≤ 0.5 s |
| Music+SFX bed under the voice (integrated) | **19.8 dB** (14–23.5) | 18–20 dB |
| SFX/accent hits | **7.7 per 10 s** (2.9–13.8) | 7–9 per 10 s |
| SFX peak vs the voice | −12 dB (−7 to −17) | −12 dB |
| Scene changes that carry a sound hit | 35% | 30–40% |
| Final loudness | −14 LUFS, true peak −2 | −14 LUFS |

Two important corrections to common assumptions:
- **His motion is NOT pulsed on words.** The average local motion around word onsets is flat (35.2% → 36.0% → 35.0%). He doesn't nod
  or bounce on every syllable. The world moves *continuously*, and the *actions* match the *meaning* of the words. A beat-pulsed nod and
  squash layer is the wrong model; it reads as jitter, not acting.
- **Music is quieter than we thought.** With the voice separated out, his bed sits ~20 dB under the voice, not 7–9 dB. The SFX poke up to about −12 dB.

---

## 2. Camera: one continuous flight

**2.1 The camera never parks.** It moves on 83% of frames. When it "holds" on a character, it still drifts or slowly pushes, and it
usually rolls a degree or two (the horizon tilts back and forth: 38% of frames have roll changing). That roll is a big reason his frames
never feel locked off.

**2.2 It moves in two speeds.** A **fast move** (0.3–0.6 s, eased out hard) brings in each new picture, then a **slow drift** carries
on under the line of narration. Fast in, slow drift, fast to the next beat. The fast moves land roughly every 2 s.

**2.3 Moves we saw over and over** (each is a "transition" with no cut):
1. **Pull-back reveal**: start on a macro detail (wine cup with a fly on it, a ticket, a clock, a belt buckle) and pull back fast to reveal
   the character and the room. (Jar 0:20, Japan 0:10, Western 0:08)
2. **Tilt/pedestal reveal**: start on what the narrator mentions (holster: "his hands are at his sides") and glide up to the face.
3. **Follow the object**: the cannonball flies, the camera flies with it across the water into the hull. A man falls off a tower and the camera falls with him.
4. **Orbit**: circle the character 90–180° while he talks, so the background sweeps behind him (Railroads 0:02).
5. **Foreground wipe**: something passes close to the lens (a train, a pole, a door edge) and the next composition is revealed behind it.
6. **Push through**: fly through a doorway or window, or *into* an object (the camera dives inside the jar to show the pendulum mechanism).
7. **Look-through/iris**: the image inside a mirror, porthole or telescope becomes the next scene.
8. **Moving dissolve**: a 6–10 frame cross-dissolve where the outgoing AND incoming shots are both moving in the same direction, so
   it reads as one flight. This is his most common scene change.
9. **Speed whip**: a forward/sideways rush with heavy motion blur (railroad).
10. **Cutaway/X-ray dive**: into the mechanism (jar pendulum, ground cross-section) for the "You see," explanation.
Hard cuts: almost none, and when they happen they land exactly on a word onset (median 0 frames off).

**2.4 Scale jumps.** He alternates macro → wide → macro: an extreme close-up of a prop, then the whole palace, then a face. He never
uses two medium shots in a row.

## 3. Inside every frame: the motion layers

Every composition stacks most of these at once. Use this as the per-shot checklist:

| Layer | What he does | Examples |
|---|---|---|
| **A. Story action** (the verb of the sentence) | The character performs exactly what the narrator says, *on that word* | "sawed gaps" → sawing with sparks; "painted pink" → roller painting a stripe; "feet up… scrolling" → feet go on the desk, thumb scrolls; "has a mirror" → pulls out a mirror and twirls it; "grabs him by the collar" → walks in and grabs; "laughed harder" → a man falls off the bench laughing |
| **B. Face** | Expression changes every ~0.3–0.8 s *according to meaning* (squint → grin → smug); eyes dart; mouth flaps on quoted dialogue; blinks | Railroad boy squints at the train; girl's eyes dart in bed; captain's mouth flaps on "We're about to get boarded" |
| **C. Body** | Idle sway, weight shifts, leg swing, hands fidget, props held move; hats wobble | Mirror man swings his foot; western straw wiggles in his mouth |
| **D. Reactors** | Other characters react: laugh, lean in, walk in, point, fall over | The feast crowd laughing; a coworker walks in and leans to look at the phone |
| **E. Props/FX** | Sparks, glints, smoke puffs, liquid pours, steam, glow-ups, paper flutter, impact cracks | Gold glow on the winning ticket; oil pouring; splinter cracks; glint on the mirror |
| **F. Living environment** | Always-on ambience | Waves and rain, clouds moving, clock second hand, candle flames, twinkling stars, birds, a fly landing, smoke from a chimney, trains approaching in the BG |
| **G. Parallax depth** | The camera glides past foreground objects (posts, rails, plants, furniture, pots), so near and far move at different speeds | The green pot sliding in front on the ship deck; rails rushing under the lens |

Rules derived from this:
- **Every noun and verb in the narration gets a visual.** If the narrator says "clock", we see a clock ticking. If he says "a million", the ticket glows.
- **Every ~1 s, something new starts** (1.2 local-motion bursts per second): a gesture, an entrance, an FX pop, a prop move.
- **Something is always on the move in the background** (layer F). It costs nothing and kills dead frames.
- **The focal character is never just standing.** At minimum, layers B+C are on.
- Motion fills the frame: about 1/3 of all pixels move on an average frame (FX, crowds, environment and parallax, not just one character).

## 4. Hooks (first 3 seconds), visually

Frame 0 is **already mid-action**, showing the hook sentence literally:
- Blacksmith hammering at the anvil, then the spear pierces the shield (sparkle) on "pierce"
- Scratch cards slapped on the counter, and the winner glows gold on "winner"
- Cannon fires, the camera follows the ball across the sea, and it smashes the hull, all within 2.5 s
- A guard rolling pink paint up the wall on "painted"
- Hammering the coaster track, then the camera rises to reveal the deformed loop on "out of shape"
- Close-up of the ticket on "had won a million" while the cashier's face goes shocked
- A scientist shoves a man off a tower, and the camera falls with him

Rule: **the first frame shows the hook happening, the camera is already moving fast, and by 2.5 s there has been a second visual
beat** (a reveal, an impact or a glow). Never an establishing shot or a slow move.

## 5. Script

### Ideas he picks
Clever tricks, loopholes and hidden mechanisms behind a dramatic story, mostly from history or science, told as a mini-heist or mystery:
- **Money, gambling, lottery, betting** (6 of 19: scratch cards, mirror betting, cashier lottery, Japan pachinko window, fake checks, burglar real-estate scam). **This is a strong lane.**
- Clever inventions or old tech that sounds crazy (storm oil, earthquake jar, railroad gaps, coaster loop, grave bell, cannonballs)
- Psychology/brain (time slowing, random numbers, quick draw, hypnagogia, pink cell)
- Weird institutions or rules (Japan's "banishment room", the gambling law, the town button)

### Hook formulas (sentence 1, about 3 s, 8–20 words)
1. **Action + absurd detail** (10 of 19): "He sawed gaps into a railroad every 39 feet." / "They buried a man alive with a bell tied to his finger." / "He bet his life savings on the slowest horse in the race."
2. **Paradox**: "It's impossible to get fired in Japan, but companies found something way worse." / "Gambling is illegal in Japan, yet there's a gambling hall on almost every street." / "If your ship got hit by a cannonball, you'd actually be one of the lucky ones."
3. **You-address/challenge**: "Look at these two scratch cards. One's a winner…" / "If you ever fake a number, there's a way to tell…" / "If you fall asleep holding two steel balls, you might wake up a genius."
4. **Rule/legend**: "The fastest gun in the West had one rule. Never draw first." / "There's a button in the middle of town, and nobody's allowed to press it."

### Story skeleton (what nearly every script does)
1. Hook (absurd action or paradox)
2. "You see," + one sentence of context (or straight into the story)
3. **Mockery**: the crowd, boss or rival mocks the hero in a short *quoted* line. These lines are jokes: "Barbie's gonna love it in here." / "Hey, mirror man, maybe try wiping it." / "Did your frogs get hungry again?" / "You're wrecking my railroad!"
4. **Escalation with time markers**: "Weeks later… Then one night… Then another… Then all eight at once." / "In May… By July…" / "At 15 minutes… At 20…"
5. **"Wait, …?"**: the viewer's confusion said out loud ("Wait, what's a mirror going to do?" / "Wait, practiced?")
6. **Twist/payoff**: the hero is proven right, often with a dark or ironic turn (the buyer is him; the wife wanted him buried; the guy in the corner is gone)
7. **"You see,"**: the real explanation, with **one everyday analogy** (blowing on soup; an elevator's buttons; catching a falling phone; a car on a hairpin turn)
8. **Last line = a short physical image** that closes the loop, often a callback to the hook ("…and by the time it spells out 9, nobody's laughing anymore."). No CTA.

### Voice and lines
- 3.67 words/s, almost no pauses (max ~0.45 s). Rhythm comes from short sentences, not silence.
- **A joke about every 10 s**: hyperbolic comparisons ("that horse lost a race to the milk cart, and it was pulling the milk cart"; "he'd lose a race to the saloon against a guy carrying two beers"; "who measures their couch?").
- **Present tense** for the story ("he grabs", "he sits"), and **second person "you"** to put the viewer inside it (Japan, Gambling, Western).
- Specific numbers make it real: 39 feet, 15 minutes, 47 scratches, 300 pounds, 90%.
- 145–246 words total.

## 6. Sound

- **Music**: one continuous, light, playful bed (ukulele, pizzicato, acoustic, light jazz/funk, "corporate inspirational" feel), shifting
  mood at the twist (mysterious → triumphant). It sits **~20 dB under the voice** and is never silent (bed silent ~5% of the time).
- **SFX ~7.7 hits per 10 s**, peaking ~12 dB under the voice. In the samples, about half are music accents (stingers) and half are effects:
  - whooshes and swipes on camera moves and transitions
  - chimes, dings, glockenspiel, kalimba and celesta notes on reveals and "aha" moments
  - cartoon foley locked to on-screen actions: squeaks, bloops, water drops, squelches, record scratch, cash register, door creak, metal scrape, thuds and impacts
- About 1 in 3 scene changes carries a hit, so not every transition gets a whoosh.
- Final master about −14 LUFS integrated, true peak −2 dBTP. The voice sits around −17 LUFS on its own.

## 7. Build rules (apply to every video)

1. **Shot list = word list.** Write a timeline where every clause of narration gets (a) a story action and (b) a camera move. No clause without an action.
2. **Per shot, at least 4 of the 7 motion layers** (A–G), always including A or D, plus F and G.
3. **Fast move into each new composition, then drift.** Never park. Roll ±1–3° drifting. New composition ≤ every 2.2 s.
4. **Transitions are camera moves**: moving dissolves (6–10 f, both shots moving the same way), pull-back reveals, follow-the-object,
   foreground wipes, push-throughs, look-through iris, speed whips. Hard cuts only on word onsets, at most 1–2 per video.
5. **Hook frame 0 = the hook happening**, with a second visual beat by 2.5 s.
6. **Quoted dialogue = mouth flaps + gesture** on the speaking character, and a reaction face on the listener.
7. **Background life always on** (weather, water, flames, clocks, birds and bugs, crowds, smoke), and something in the foreground for parallax.
8. **One X-ray/cutaway/macro mechanism shot** for the "You see," explanation.
9. **QA gate before any render** (`tools/study/qa_motion.py` on a preview render). Thresholds are what 75% of his videos achieve:
   anything-moving ≥ 95%, local motion ≥ 91%, dead ≤ 4.5%, longest dead ≤ 0.7 s, moving area ≥ 30%, composition change ≤ 2.2 s,
   hard cuts ≤ 2 (roll ≥ 25% and pull-backs ≥ 14% are advisory). Calibrated: his Job-in-Japan video passes. If it fails, add actions; don't ship it.
10. Audio: bed ~20 dB under the voice, SFX ~8 per 10 s at about −12 dB, master −14 LUFS.

## Appendix: per-video measurements

| Video | s | any motion % | dead % | moving area % | comp. change s | hard cuts | words/s | bed under voice dB | SFX /10 s |
|---|---|---|---|---|---|---|---|---|---|
| An Unstoppable Spear vs an Unbreakable Shield | 45.0 | 92.8 | 7.21 | 31.4 | 2.14 | 1 | 3.67 | 20.3 | 6.2 |
| He Could Spot Winning Tickets Just by Looking | 63.3 | 96.1 | 3.9 | 25.4 | 1.92 | 0 | 3.67 | 20.5 | 7.7 |
| How a Mirror Rigged a Horse Race | 64.1 | 98.2 | 1.84 | 36.9 | 1.78 | 0 | 3.81 | 20.9 | 6.5 |
| Levels of Pirate Cannonballs | 63.5 | 95.5 | 4.46 | 48.4 | 2.05 | 0 | 3.48 | 19.1 | 11.6 |
| The Ancient Jar That Warned an Empire | 64.8 | 95.3 | 4.71 | 30.9 | 2.02 | 1 | 3.62 | 16.8 | 9.2 |
| The Burglar Who Only Moved Furniture | 58.4 | 97.7 | 2.29 | 33.2 | 2.34 | 0 | 4.06 | 17.3 | 11.6 |
| The Job Nobody Wants in Japan | 60.5 | 98.8 | 1.16 | 38.9 | 1.51 | 0 | 3.72 | 19.5 | 10.9 |
| The Pink Prison Cell Experiment | 65.2 | 97.6 | 2.37 | 30.2 | 2.25 | 0 | 3.63 | 14.4 | 10.7 |
| The Scientists Insane Time Test | 40.0 | 99.6 | 0.42 | 46.5 | 1.74 | 2 | 3.58 | 16.1 | 7.0 |
| The Town Built Around a Button | 65.5 | 95.6 | 4.38 | 31.9 | 2.11 | 0 | 3.74 | 20.5 | 2.9 |
| The Window That Breaks Japans Gambling Law | 45.0 | 97.9 | 2.15 | 23.8 | 3.21 | 0 | 3.58 | 19.8 | 6.9 |
| This Shape Saved Roller Coasters | 63.2 | 96.0 | 3.97 | 43.0 | 2.18 | 1 | 3.74 | 17.5 | 8.2 |
| What the Grave Bell Really Meant | 59.5 | 95.3 | 4.66 | 37.1 | 2.12 | 0 | 3.7 | 15.0 | 2.9 |
| Why Cashiers Keep Winning The Lottery | 57.7 | 96.6 | 3.43 | 23.2 | 2.14 | 0 | 3.46 | 20.4 | 11.6 |
| Why Humans Cant Pick Random Numbers | 47.1 | 98.6 | 1.42 | 30.7 | 2.77 | 0 | 3.5 | 22.7 | 13.8 |
| Why Perfect Railroads Don t Work | 65.2 | 98.6 | 1.44 | 46.6 | 1.67 | 0 | 3.35 | 20.2 | 3.5 |
| Why Sailors Carried Storm Oil | 64.6 | 99.9 | 0.1 | 43.8 | 1.58 | 2 | 3.81 | 23.5 | 6.0 |
| Why the Second Draw Always Wins | 56.1 | 88.7 | 11.26 | 37.4 | 2.08 | 0 | 3.91 | 19.8 | 5.7 |
| Your Brains Secret Idea Zone | 39.1 | 95.3 | 4.71 | 24.8 | 2.44 | 0 | 3.71 | 16.3 | 9.7 |

The stillest Ricks video is the Western standoff (Second Draw): 11% dead frames, by design for tension. Even there, the composition changes every 2.1 s.

---

# SECOND PASS (Nov 8 2026): what the first pass missed

Added measurements (tools/study/pass2.py → reference/ricks-study/data/pass2.json), endings and "You see" sheets, narration pitch analysis, and his channel's view counts (data/channel_views_2026-11-08.md).

## S1. What decides 4M vs 32M: the IDEA, not the craft
- I correlated 25 production measurements with views across the 19 videos. **None matter** (all |r| < 0.33, n=19): motion, cuts,
  color, SFX density, length, music level. His craft is constant, and it gets every video into the game.
- His flops come from the *same* production: **"The Science Behind Slot Machines" 123K, "How Painkillers Actually Work" 309K,
  "Every Memory Has a Price" 498K, "This Tree Hates You" 991K, "This Knight Found the Ultimate Loophole" 1.6M.**
- Flop pattern: **school-explainer titles** ("The Science Behind…", "How X Actually Works") with no story, no person and no twist, or vague/abstract concepts.
  **A money topic in explainer framing flopped (Slot Machines 123K), while money topics as a STORY hit (Cashiers 8M, Tickets 6.2M, Window 14M, Mirror 5.3M).**
- Hit title patterns: **"The [specific object/person] That [did something impossible]"** (Ancient Jar That Warned an Empire 32M), **"Why [perfect/
  obvious thing] Doesn't Work"** (Railroads 27M), **"The Job Nobody Wants in [place]"** (17M), **"Why [group] [did odd thing]"** (Sailors Carried Storm Oil 15M),
  **"The [X] That Breaks [a law]"** (14M). Each one is a mystery the viewer can't answer.
- **Every video is a story with a person, a trick and a twist. Never an explainer.** Test the title: if it could be a school
  lesson, rewrite it.

## S2. Color and lighting
| | Ricks median |
|---|---|
| Brightness (0–1) | 0.64 |
| Distinct saturated hue families per frame | **3.8** |
| Colorfulness (Hasler) | 72 |
| Warm/cool bias (R−B) | +0.05 (neutral) |
| Saturation | 0.45 |
- **Character heads stay PURE WHITE in every scene** (soft cool shading on one side, never tinted by scene light). A common mistake is letting them turn cream/orange
  or blue with the scene grade. Rule: **render character cards unlit (white base + fixed soft shade); never apply scene tint, LIGHTS or color
  grade to the faces**. Grade only the world. This is also why his faces "glow".
- Each frame mixes **4 hue families** in props and costumes (teal shirt + red bow tie + blue sky + yellow sign). Give every set
  complementary color accents, not one mood color.
- Bright overall: even night scenes are blue-lit but readable (night ≈ saturated blue, not dark grey).
- Backgrounds are detailed and readable (sky, buildings, signage), softened by depth of field rather than lost in darkness.

## S3. Framing and casting
- Head width is usually **small: median 7% of frame width** (wide/medium shots that show the world). Close-ups (20–45% width) are the
  exception, saved for reactions and punchlines. Don't park on big faces.
- **About 40% of frames show no face at all** (a macro of the prop the narrator names, a mechanism, an environment beat), but always as part
  of a move that comes back to a character. A "no character shot" is fine if it's *a named object doing something*, never an empty set.
- **3+ characters on screen in ~25% of frames** (crowds, rivals, witnesses, guards).
  Every story gets extras who react.

## S4. Flashes, shake, speed
- White flashes: **0–1 per video** (max 4 in action-heavy ones). We used **11**. Cut almost all of them; use a flash only for a literal light
  (explosion, lightning, camera flash).
- Small camera jitter/shake hits: ~55 per minute (handheld feel and impact shakes). Add a subtle 1–2 px procedural handheld noise plus a real
  shake on impacts.
- Time split: ~35% fast moves, ~55% drift, ~10% still-ish.

## S5. Diegetic text = jokes and clarity
He writes the joke or concept **into the world** as signs and labels, readable at a glance:
"CAREER DEVELOPMENT ROOM" (the banishment room), a fire-alarm box labelled **"LAW"**, a **"STORM OIL"** can, a **"WINNER NINE"** board, "BETS OPEN",
"REEL BIG CASH" scratch cards, "KYLE" name tag. **Abstract ideas become physical labelled props.**
Rule: every video needs 3–6 in-world signs/labels that carry a fact or a joke.

## S6. "You see," explanation sections stay physical
Never a static talking head. They are:
- a **tour of the mechanism** (orbit around the jar's dragons and frogs, then dive inside)
- **the hero demonstrating** (the chef holds the STORM OIL can and blows on the soup)
- **metaphor props** (the LAW alarm box)
- **flashback reenactments in a new set** (the betting room with the telegraph wire "clicking in")
- the camera **dropping into the depth** being described ("a canyon so deep you can't see the bottom": the camera falls past the wall with a pebble)

## S7. Endings (last 3 s)
- **The biggest spectacle of the video**: derailment explosion, a wave crushing the pirates, money raining down, a glowing fault under the city.
- Then **reaction faces** (shocked witnesses) or **an ironic sign** (CAREER DEVELOPMENT ROOM, NOBODY GAMBLED).
- The video ends **0.05–0.5 s after the last word** (median 0.27 s). No outro, no hold.
- The first frame doesn't visually match the last (no seamless-loop trick), but the last line often calls back to the hook.

## S8. Narration delivery (measured on separated vocals)
| | Ricks |
|---|---|
| Median pitch | 178–212 Hz (bright, mid-high) |
| Pitch range (10–90%) | **12.3–13.2 semitones** (very melodic) |
| Loudness range | **5–6 dB** (tightly compressed, every word equally present) |
- Push expressiveness: short lines, questions and real pauses, so the voice lands close to a 12-semitone range. **Compress the voice** (about 3:1, 5–6 dB loudness range) so quiet words don't get lost under SFX.

## S9. Captions
1–2 words per caption (short phrases like "him by", "making soup?", "a million" stay together), white with a black outline, centred around
y ≈ 1250–1350 of 1920. 

## S10. How we beat him (not just copy him)
His weak spots in this data: some videos hold a single wide shot for 1+ s (11% dead frames in the Western); flops come from explainer topics;
and the voice is very similar across every video. We can:
1. Keep his craft bar (QA gate) **and** pick only story-first ideas (money stories are where his hits cluster, 6 of 19), so every idea passes the title test.
2. Hit ≥ 4 hue families, white faces and in-world signage in every frame, matching or beating his clarity.
3. Give every shot a reactor (he does it in ~25% of frames; we can do more crowds at almost no cost because our cast is code).
4. Stack a signature payoff: the final spectacle + reaction + ironic sign, all in the last 3 s.
5. Never post a weak title: run 3 title options through the S1 pattern test before rendering.
