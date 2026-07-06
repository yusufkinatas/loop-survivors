> ⚠️ **SUPERSEDED (July 6, 2026).** This spec is kept for history only. The developer dropped the full-track / genre-drop direction entirely. Genres are now **playable characters** that re-voice a shared twelve-weapon soundset (tempo, swing, per-weapon patterns); there is no recipe, no drop event, and no destination song. The Track Lab that prototyped it is kept, but only as a standalone "Experimentation room" (`#tracklab`), not a game mechanic. The live design is `docs/phases/genres-and-weapons.md`. Nothing below describes the shipped game.

# M3 Drop Spec

Phase: M3, the drop. Locked July 5, 2026, after a grilling session that resumed once the Track Lab proof of concept passed (Satisfaction cleared the developer's ear). Parent plan: `docs/plan.md`.

The first genre recipe and the lock event. Answers M3's question: **is the genre moment the peak worth betting the game on?**

Everything from M1 and M2 carries forward unchanged unless amended here (platform, input, collision, the phrase clock, the pick economy, death tuning, the dividing rule, the dev tools).

## The model shift: weapons are instrument types, a track is a destination

This is the architectural change M3 introduces. It is conceptual; M3 implements it minimally on the existing six weapons.

- **A weapon is an instrument type** (kick, snare, hat, bass, lead, chord, and in the shipped game many more), not a specific sound file. The instrument type carries the gameplay — its projectile, its damage, its behavior — and it is what gets balanced, once, consistently across every track that uses it.
- **A track is an exact recipe of instrument types.** Each track picks a subset of instrument types, gives each one its own track-specific sound and its own written part, and is a single hand-authored composition. The same instrument type appears in many tracks wearing different sounds (a muted subtle kick in one, a hard stabby kick in another). This is the plan's reusable content graph: one instrument type sits inside many recipes.
- **The track is the mechanical unit. "Genre" is a flavor and family label over tracks, not a mechanical layer.** Your exact build deterministically selects the exact track. There is no random assignment — exactness and randomness cannot coexist, because if the instrument set fully determines the track there is nothing left to roll.
- **Each weapon has a default sketch sound** (its plain instrument voice, what M2 already ships). When a track locks, the weapon **re-skins** to that track's specific sound for its type and plays that track's part. That is the sketch-to-song flip made literal.
- **Balance lives on the instrument type, not the sound.** A kick behaves like a kick regardless of which track skins it. The track changes how *often* it fires (the part), which shifts its damage throughput — the tempo-and-density-equals-damage coupling the plan already accepts.

## The re-score: what the drop does to the music (and why gameplay stays loyal)

- On the drop, your weapons stop playing their solo ladder charts and start playing their **written parts in one composed song**. Every note is still a trigger: it still fires that weapon's attack and deals its damage. Model A is intact — the only thing that changed is the sheet music, from six solos to one arrangement.
- The "burst" is diegetic. The drop lands on a big downbeat where all the song's parts hit at once, and because those parts are your weapons, that downbeat is your whole build firing simultaneously. A built-up build all landing together naturally carves a hole in a horde or lands one massive combined hit on a boss. It is not a separate music-independent nuke.
- **Exact-match means the track always plays in full.** Everyone who reaches a track has exactly its instruments, so there are no partial or thinned versions. The track's breathing comes from its own sections (the quiet and loud stretches inside the composition), not from build variation. (This supersedes the earlier "decorative layers breathe with your build" idea, which belonged to the discarded six-parts model.)

## Earning and firing the drop

- **The drop is a player-fired active ability, never auto-cast.** Completing a track's recipe *arms a button*. The player presses it when they choose.
- **Runs that never complete a recipe are freestyle and fine.** You play M2's growing sketch out to the end. No nudging in M3.
- **Off-recipe instruments block the drop.** To arm it, your build's instrument types must be a clean exact match to a track's recipe — no missing types, no extra types. Building wide is an early price; the reward is unlocking the track. (Consequence banked: with secret recipes this can brick a run, so the shipped game will likely need an escape valve — drop or swap an instrument. Parked. In M3 the sandbox and the small catalog make it a non-issue.)

### The lock event (the first drop)

1. **Arm.** Recipe complete, the button lights.
2. **Fire.** The player presses it. The drop resolves on the **next downbeat** (quantized to the grid so the slam always lands musically and you get a half-beat of anticipation for free).
3. **Vulnerable wind-up.** A riser (rising tension sweep, roughly two bars) then a beat of silence. During the wind-up the weapons thin out and cut, so **you deal little or no damage and are briefly exposed** while the horde keeps closing. This makes *when* you fire the drop a real decision: fire it surrounded and low and the silence may kill you; fire it with a sliver of space and the slam clears the room. The drop is a setup tool you read the moment for, not a panic button that always saves you.
4. **Slam.** The composed track kicks in, all parts hitting the downbeat together (the synchronized volley), a **short damage-amp window** opens (your hits deal extra for a few bars), and **strong visual and UI effects** announce the climactic moment. Spectacle plus numbers, because numbers alone would not sell it.
5. **The track is now on for good.** From here the composed track is the run's music permanently, breathing via its own sections.

### Re-drops (the ongoing combat tool)

- After the first drop the button becomes a repeatable **re-drop**, gated by a **combat-charged energy meter**: a bar that fills as you deal damage and kill, full means ready, firing empties it. The intensity you build in the fight powers the drop.
- Re-drops are **snappier than the first drop**: a short telegraph, no full silence, weapons keep firing (no repeated vulnerability gap). The surge throws the track to its hardest section, re-fires the synchronized slam, re-opens the damage-amp window, and punches the visual.
- The asymmetry is deliberate: the *first* drop is the earned ceremonial transition (recipe-gated, with the vulnerable wind-up); every drop after is a combat surge (energy-gated). The first stays special because the recipe buys it once; everything after is fought for.

The exact numbers — damage-amp amount, energy fill rate, wind-up length, whether the lock adopts the track's tempo (Satisfaction is 130 BPM; default is that the track brings its own tempo on lock, tuned so it lifts rather than lurches) — are hands-on gate tuning, decided in the build, not here.

## M3 concrete: the destination is Satisfaction

M3 reuses the Track Lab cover the developer already approved, so the milestone tests the *drop mechanic* without re-litigating whether the composition is good.

- **Catalog** = the existing six game weapons (kick, snare, hat, bass, lead, chord). No new instrument types built for M3.
- **Recipe** = Satisfaction's five instruments: **kick, snare, hat, bass, lead**. Chord is not in it, so **chord is the decoy that blocks the drop** if picked up — the exact-match discipline made concrete.
- **The fx** (riser, crash) is not a collectible weapon. It is the drop ceremony itself: the fx riser becomes the wind-up riser, the crash becomes the slam.
- **Sketch phase** = M2's existing growing build with default weapon sounds. On the drop, the five weapons re-skin to Satisfaction's sounds and play its parts (both already authored in the Track Lab: `src/tracklab/tracks/satisfaction.ts` and `labkits`).
- **Recipe counts instrument types present at any tier.** Tiers stay the M2 sketch-growth layer, orthogonal to the recipe. Keeps M3 simple.
- **Reaching the drop in a playtest:** the **sandbox force-assemble** is the primary path (assemble any recipe on demand, trigger the drop reliably, judge it by ear). A disciplined normal run can also reach it.
- **Placeholder caveat:** Satisfaction is a demo cover with non-shipping samples. M3 uses it to prove the mechanic. A shipping genre needs an original track — M5 content work, not M3's problem.

## Developer tools (amendments)

- **Recipe-progress overlay.** A subtle in-game overlay showing which track the current build is closest to and what it still needs. Dev-facing for now (in the shipped game recipes lean secret — deferred). This is the visible-progress that makes the drop anticipated.
- **Sandbox force-assemble.** Extend the M2 sandbox loadout editor so any track's exact recipe can be assembled in one action, arming the drop immediately for judging.
- The M2 chart playground, rehearsal room, and read-only in-game chart overlay carry forward.

## The four parked M3 decisions, now resolved

- **Genre lock delivery** → a player-fired button, armed by recipe completion. Not instant-auto, not chest, not level-up.
- **What a genre lock changes** → it re-scores the build's weapons into the composed track (swaps solo ladder charts for the track's written parts and re-skins their sounds). Tempo adoption is a build-tuning detail (default: the track brings its own tempo).
- **Runs that never lock a genre** → fine as freestyle; play the sketch out. No nudge.
- **Recipe discoverability** → subtle dev overlay now; secret in the shipped game is the developer's lean, final form deferred to playtesting. (The real-game *reachability* mechanism — e.g. guided offers — is parked with it, since guiding offers toward a recipe would reveal it and fight the intended secrecy.)

## Build sub-phases, each gated by the developer

- **Sub-phase A, the destination in-engine.** Bring Satisfaction into the game's audio engine as a re-score target: the five weapons' Satisfaction sound-skins and written parts, playing as the composed track (triggered from the sandbox). **Gate:** the in-game Satisfaction, played by the game's weapons, sounds as good as the approved Track Lab version — the port did not degrade it.
- **Sub-phase B, the drop event.** The arm, the quantized fire, the vulnerable wind-up (riser and silence, weapons cut), the slam (synchronized volley, damage-amp window, visual and UI spectacle), the permanent track-on, and the re-drops with the combat-charged energy meter. **Gate:** the drop *moment* plays as a climactic peak — the wind-up creates real tension, the slam is a real release, the timing is a genuine decision, and re-drops feel earned.
- **Sub-phase C, the loop.** Fusion: the exact-match recipe with chord as blocker, the recipe-progress overlay, sandbox force-assemble, and the full run — sketch, build the recipe, arm, drop, live inside the permanent track with re-drops to the end. **Gate:** M3's question itself, judged across full runs.

Nothing advances past a gate without an explicit pass; a failed gate loops within its sub-phase. Between gates, the developer is brought only decisions that need taste, never code plumbing.

## Verdict protocol

After sub-phase C the developer plays full runs and declares pass or fail on M3's question — is the genre moment the peak worth betting the game on? — by his own judgment. The outcome is recorded in `docs/STATUS.md`. A pass starts M4 grilling (the vertical slice); a fail gets reworked within M3 at the level the failure points to, or sends the destination-track direction back to rethinking if the peak does not land.

## Decisions parked during this grilling (recorded in `docs/plan.md`)

- The shipped-game **collection loop under exact-match**: how a player assembles an exact set on purpose (guided offers vs pure discovery), and the **brick-risk escape valve** (dropping or swapping an instrument to climb back toward a clean match). Entangled with recipe secrecy; playtest-era.
- **Item and sound effects** (reverb, echo, sustain, and the like) as modifiers on an instrument slot, each carrying a coupled gameplay twin (echo → a delayed second projectile, sustain → lingering damage, opening filter → a damage ramp). Fits the model cleanly; the open tension is that live effects can smear a composed track's mix, tunable only by ear. Playtest-era, as the plan already parks it.
- **Per-track signature drop effects** (bespoke gameplay plus visuals per genre). Content and polish; not needed to answer M3's question.
