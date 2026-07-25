# Baseline: the game as it stands, captured

Prototypes for the core-loop redesign need something to A/B against, and "how
the mix sounds once the build is full" is not a thing anyone can hold in their
head across a week. This is that reference: the arrangement recorded at nine
points along the power curve, the exact build behind each one, the trigger
count that produced it, and what a meter makes of the result.

Captured from `main` at `3b090c4` — the game exactly as it stood before any
redesign work. Re-capture instructions are at the bottom, so a prototype branch
can produce a directly comparable set.

> **Trigger** — one musical-grid event with two outputs: a sound in the mix and
> one attack in the world. Density here is always triggers per bar. A bar is the
> ~2-second musical measure the loop is built from; at this track's 122 BPM one
> bar is 1.97 seconds.

## Listen

Open **`player.html`** in a browser for all nine takes side by side, each
labelled with its build and density. Or play the `.webm` files in `audio/`
directly — any browser reads them. They are Opus at 128 kbps, one lossy
generation from the game's own output bus.

Each take is **16 bars (31.5 seconds)**, starting on a four-bar phrase line,
with a full phrase played in beforehand so nothing is captured mid-change.

## What was captured, and what was not

These are **arrangement captures**: the music the build makes, alone.

- **In the signal.** Every weapon's chart, the per-voice mix, the
  kick-ducks-bass sidechain (the kick briefly pushes the bass down so the two
  low ends never sum into mud), and the master limiter. The tap is
  `engine.analyser`, which sits after the limiter and immediately before the
  speakers — this is what a player hears, not a re-render.
- **Not in the signal.** Combat. No enemies were on the field: no hit cue, no
  pickup chirps, no level-up cue or its mix dip, no chest ceremony, no boss.

That split is deliberate. The question this baseline serves is what the *build*
does to the mix; combat noise on top would make two capture points differ for
reasons that have nothing to do with the build. What a full run sounds like with
everything playing belongs to the played-run trace below.

## The captures

| capture | weapons | build (weapon levels) | triggers/bar | grid steps | LUFS | true peak |
|---|---|---|---|---|---|---|
| `01-opening-one-weapon` | 1 | kick 1 | 4.00 | 4/16 | -13.1 | -2.4 |
| `02-early-two` | 2 | kick 2, bass 1 | 6.00 | 6/16 | -12.8 | -2.4 |
| `03-building-three` | 3 | kick 3, bass 3, hat 1 | 12.00 | 8/16 | -12.5 | -2.0 |
| `04-mid-four` | 4 | kick 4, bass 4, hat 3, chord 2 | 14.00 | 8/16 | -12.2 | -1.6 |
| `05-band-full-five` | 5 | kick 5, bass 5, hat 4, chord 4, lead 3 | 18.25 | 11/16 | -11.0 | -0.5 |
| `06-late-five` | 5 | kick 7, bass 7, hat 6, chord 6, lead 6 | 23.50 | 13/16 | -10.7 | -0.1 |
| `07-maxed-five` | 5 | kick 8, bass 8, hat 8, chord 8, lead 8 | 34.00 | 16/16 | -10.6 | 0.0 |
| `08-thinnest-maxed-five` | 5 | kick 8, clap 8, snare 8, bass 8, lead 8 | 22.00 | 13/16 | -10.4 | -0.2 |
| `09-all-eight-maxed` | 8 | all eight roles at 8 | 54.00 | 16/16 | -10.3 | +0.6 |

"Grid steps" is how many of the bar's sixteen 16th-note slots carry at least one
trigger. 16/16 means there is no silent moment left anywhere in the bar.

Captures 01–07 trace one plausible run: one opening weapon, growing to the
five-weapon cap, everything eventually maxed. **08 and 09 are not points on that
run** — 08 is the *sparsest* five-weapon maxed build the catalog allows, and 09
is all eight roles at once, which the weapon cap of 5 makes unreachable. Both
are bounds, not steps.

LUFS is integrated loudness (how loud it actually sounds); true peak is the
highest sample value, where 0.0 is the ceiling.

## What the numbers say

Density figures come from the shipped ladders in `src/audio/ladders/house.ts`;
the full derivation and per-rung table are in [`density.md`](density.md), which
is generated, not hand-written. Loudness figures are measured off the captures
with `ffmpeg -af ebur128`.

**No weapon ever gets quieter.** Across all eight roles and all four chart
stages, no rung fires fewer triggers per bar than the rung below it. There is no
level-up anywhere in the game that thins anything out.

**Half of every weapon's levels are musically silent.** A weapon has eight
gameplay levels but four authored chart stages, banded two levels each
(`chartStageForLevel`). Levels 2, 4, 6 and 8 change damage and nothing you can
hear. Of the 40 weapon levels in a full build, 15 move the music.

**Thirteen times the triggers buys 2.8 dB.** From `01` to `09` the trigger count
goes up ×13.5 while integrated loudness rises from -13.1 to -10.3 LUFS — and the
last of that pushes true peak to +0.6, past full scale and into the limiter. The
limiter is converting added density into lost headroom rather than added impact.
Growth is audible as *more things happening*, not as more force.

**The loudness range never moves.** Measured across all nine takes, loudness
range sits at 0.4–0.6 LU — a flat line. One kick alone is as dynamically flat as
eight maxed weapons. Within any held build the music does not breathe at all,
and the total arc across a whole run is the 2.8 dB above. There are no peaks and
no valleys anywhere in the current design, at any scale.

**There is no thin build available late.** The sparsest five-weapon maxed build
the catalog permits (`08`) still fires 22 triggers a bar across 13 of 16 grid
steps. A player who wants to strip back has no way to ask: the only lever on
density is refusing level-ups, which costs damage and buys nothing musically.

**The bar fills completely.** A maxed five-weapon build with a hat in it (`07`)
occupies all sixteen grid steps. There is nowhere left for a new element to
arrive, which is another way of saying nothing late can arrive as an *event*.

**The order never changes.** Weapons climb the same authored ladder in the same
sequence every run. Nothing in the build model can reorder, remove, or hold back
a voice, so run two's arrangement differs from run one's only in which five
weapons were rolled.

### Why no passives and no evolutions are in these captures

Both were left at zero, and neither omission changes what you hear.

**Passives are silent by construction.** All six change combat verbs — movement
speed, projectile speed, piercing, bounces, area, damage, duration, pickup
reach, protection, regeneration. None touches a chart, a kit, or the mix. A
build with six maxed passives fires the same triggers as one with none; it just
hits harder.

**Evolution is very nearly silent too.** Its whole audio side is one gain
constant (`setEvolutionGain`), and in the shipped catalog that constant is
**0 dB for six of the eight** weapons. The two exceptions, Strobe Lane (-3 dB)
and Neon Serpent (-1.5 dB), turn their voice *down*. No evolution changes a
chart, so none changes density.

That is worth stating plainly because `docs/plan.md` describes evolution as a
qualitative transformation with "new name, visuals, audio processing, damage
profile, and attack pattern". On the world side that holds. On the audio side,
the transformation is a volume trim or nothing at all — the biggest reward the
current game offers is inaudible.

## The decision trace

[`run-log.md`](run-log.md) holds one real, played run — died at 13:17 on level
29, 29 offers, 44 things taken, 7 chests — with every decision stamped with the
run second it happened at, and `audio/full-run.webm` is that same run's full mix
with combat over it (14 minutes; the first ~57 seconds are the title screen).

Mapping that run's build onto the ladders:

- **2.00 → 23.00 triggers per bar, and the curve never went down once** across
  all 44 takes.
- **A decision every 16 seconds** (median gap; 0s when a chest pays five at
  once, 62s at the slowest).
- The run spent **57% of its time with 12–13 of the bar's 16 steps occupied**,
  and only 6% at the opening's 2/16. It reaches its plateau early and stays.
- **Eight of the nine levels dropped by the last two chests were inaudible.**
  The ×5 at 12:31 moved density not at all — it sat at exactly 20.00 through the
  whole payout. The jackpot ceremony, the game's biggest reward beat, changed
  nothing you could hear.

**To record another:**

The recorder is **not in the tree** — it ships as [`run-log.patch`](run-log.patch)
instead. It has to hook the game's decision sites to see anything, and those are
exactly the sites this map exists to redesign, so leaving it live in `game.ts`
would mean carrying ~100 lines shaped around a build model that is on its way
out. As a patch it costs nothing and stays exact.

```
git apply docs/baseline/run-log.patch    # adds src/game/run-log.ts + the wiring
npm run dev
```

Play one honest run start to finish — normally, not optimised for the log. When
it ends (win screen or game over), in the browser console:

```js
copy(loop.runLog.markdown())     // or loop.runLog.json() for the raw entries
```

Paste into `run-log.md`, then `git checkout -- src/ && rm src/game/run-log.ts`
to put the tree back.

The recorder only ever receives — it never reads the world and never writes to
it — so a recorded run and an unrecorded one are the same run. If the build
model has moved since, the patch will conflict, and reshaping it to the new
model is the right move rather than forcing it.

To also capture the full mix *with* combat on top of it, paste `capture-rig.js`
and call `__recordUntilStopped()` before starting the run, then
`__stopRecording('full-run')` when it ends. Budget ~1 MB per minute.

### The cadence a run is built on

Independent of any particular run, the decision stream's shape is fixed by the
XP curve (`xpForNextLevel`, cloned from Vampire Survivors) and the chest
schedule. The table is in [`density.md`](density.md).

A build holds **5 weapons** and **6 passives** (`BUILD` in `config.ts`), weapons
cap at level 8. A save's first six chests pay a scripted 1-1-3-1-1-5 sequence;
after that a chest rolls ×5 at 6% and ×3 at 22%. Once every slot and level is
full, further level-ups become Encores — a fixed First Aid / Tip Jar pair that
never touches the build.

## Re-capturing on a prototype branch

The audio rig needs **no repo code**: it is a console snippet against
`window.loop`, the developer handle `main.ts` already exposes. That is the
point — a prototype branch produces a comparable set without carrying a harness.

1. `npm run dev`, open the game, enter the **Sandbox** (link at the foot of the
   title screen). The sandbox runs the real arena with waves off, so the field
   stays empty and the capture is arrangement-only.
2. Start the sink, so takes land here instead of in Downloads:
   ```
   node docs/baseline/receiver.mjs
   ```
3. Paste [`capture-rig.js`](capture-rig.js) into the console.
4. `await __capture(PLAN)` — the same nine build states, so the sets compare
   point for point. Progress is readable at `__progress` while it runs.
5. Regenerate the density table: `npx tsx docs/baseline/density.ts > docs/baseline/density.md`

**Do not edit anything under `src/` while a capture is running.** Vite's hot
reload replaces the page, takes the rig with it, and the run dies silently.
