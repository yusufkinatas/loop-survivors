# The Circuit — The Night Out + Headroom + Coverage

Round-1 prototype for [#270](https://github.com/yusufkinatas/loop-survivors/issues/270),
branched from `prototype-base` at the nineteen-voice palette. Packages 7, 2 and 10
from [#255](https://github.com/yusufkinatas/loop-survivors/issues/255), built as one
stack because they answer each other's debts.

Built **agent-driven** (map Notes, [#247](https://github.com/yusufkinatas/loop-survivors/issues/247)):
every design call in this build was made by the session rather than the designer, and
every one of them is recorded below **as a call, with the alternative named**. The
build is explicitly disposable and a steered redo is the known fallback.

```
npm run dev -- --port 3204          # play it (3200 is prototype-base, the control)
npx tsx tools/play-the-night.ts      # drive a night headless and print the trace
```

## The question this branch exists to answer

> **Does an upkeep budget make going thin something you want to do — and does seeing
> what is in the next venue make setting your band a real decision?**

Short answers, measured (see [Measurements](#measurements)):

- **Yes, and the budget is the necessary part.** With Headroom switched off, density
  never falls once in a whole night — even with Coverage and the whole map running. It
  is the only one of the three layers without which the hard floor cannot be met.
- **But on its own it is late and abstract.** Headroom alone waits until **8:47** to
  bite, and in a single arena until **20:19**, because before that the band is too small
  and too cheap for a budget to be a constraint. Add Coverage and the first fall is at
  **2:45**, nineteen times a night, for a reason with a subject: *this room cannot be
  hurt by this voice* rather than *I am over budget*.
- **Seeing what is in the next room is the whole game.** A harness that ignored the
  telegraph walked a band covering punch and hold into a room whose entire crowd is
  shielded, correctly muted its punch voice because the room did not need it, and then
  had nothing that could hurt anything: 320 off-kind hits, 0% answered, dead at 3:56.
  Reading the plate is not a convenience, it is the skill.

## Where everything is

| | |
|---|---|
| `src/circuit/toggles.ts` | The three layer switches. `?circuit=` in the browser, `CIRCUIT=` for the harness. |
| `src/circuit/upkeep.ts` | Headroom: the pool, the floor, the brownout, the Blackout. Design calls 1-4. |
| `src/circuit/coverage.ts` | Coverage: the answer matrix, the armour table, the chip number. |
| `src/circuit/venues.ts` | The Night Out: the map, the sets, the night clock, the telegraph. Calls 5-7. |
| `src/circuit/run-state.ts` | The one object that holds a night together. |
| `src/circuit/hud.ts` | The pool, the bank and the wheel, with no number in any of them. |
| `tools/play-the-night.ts` | The headless night. Where every measurement below comes from. |
| `docs/circuit/*.txt` | The raw traces, one per toggle configuration. |

Edits to the base are deliberately narrow: `run.ts` gains an armour field, a stage
clock and a night; `picks.ts` gains one pick kind; `game.ts` gains a bar line; `view.ts`
gains two draw passes. `engine.ts` gains a recurring bar listener and a bed re-rate.
Nothing outside `src/circuit/` reads the palette's attack axis.

## The three layers

### Headroom — the engine

Every trigger the band plays costs one unit from a shared pool. The pool refills per
bar. At each bar line the coming bar is priced: if it does not fit, voices are switched
off — most expensive first — until it does. Running under budget banks the surplus, and
a full bank buys a **Blackout**: four bars where everything you own plays, upkeep is
free, and nothing is armoured against you.

The player's verb is the number keys, which were already in the base as a dev
mechanism. This branch promotes them to the core verb and nothing else was needed.

### Coverage — the pistol-test fix

Bodies are **armoured** (only a **PUNCH** cracks it), **shielded** (only a **CUT** cuts
it) or **phasing** (only a **HOLD** catches it), keyed to the palette's *attack* axis
and never to its *seat* axis. An off-kind hit does 12%. The wheel on screen lights the
kinds your **playing** band answers — so muting a voice to afford the rest visibly
opens a hole, which is the tightest interlock in the stack.

### The Night Out — the shape

Seven hand-placed rooms, entered from the same door every night. A room plays a **set**:
an authored pressure curve with a climax and an end. Survive it and the room is
finished, pays a chest, and goes quiet. Leaving pauses the set where it stood; the
night clock never pauses. Doors ask what your band can answer, so recruiting unlocks
*map*. The **Attic** is the summit: three rooms finished and all three answers covered,
and finishing its set wins the night. Closing time at 03:00 ends the night but does not
win it.

## Every design call this session made

Each is a call the designer might have made differently. The alternative is named in
every case, and the full reasoning sits in the source at the reference given.

| # | The call | The alternative | Where |
|---|---|---|---|
| 1 | **Upkeep is charged per trigger**, not as a flat per-bar rate. Density becomes the cost literally, levelling gets expensive for free, and the interlock (#255's "upkeep peaks that alternate") becomes true by construction. | A table of flat per-bar costs per (role, level). Simpler to balance; makes the meter a step function and the interlock fictional. | `upkeep.ts` call 1 |
| 2 | **The floor is derived** from the busiest level-1 chart (measured 4.0/bar), and **regeneration is two floors, not one**. | One floor, exactly as #255 words it. Measured: it brownouts the *second* weapon a run is offered. | `upkeep.ts` call 2, `OPENING_FLOORS` |
| 3 | **Overspending browns the band out at the bar line**, never mid-bar. | Dropping triggers as the pool empties. Musically ugly, and it breaks the audibility rule's usefulness. | `upkeep.ts` call 3 |
| 4 | **A Blackout is four bars and costs a full bank** — twenty bars of lean play. | Duration proportional to the bank. Makes the peak's length a number the player computes rather than a shape they recognise. | `upkeep.ts` call 4 |
| 5 | **A venue plays a set** with an end, rather than being a region of endless pressure. | Endless pressure while you stand in it. Gives the map no rhythm and no reason to leave a room. | `venues.ts` call 5 |
| 6 | **Venue tempo is real**, and the composed pad's loop is re-rated to match — so the three tempos were chosen as intervals the note set already allows (109 = ♭7, 122 = root, 145 = ♭3). | Drop per-venue tempo; make genre mean roster-plus-groove. Smaller, and this is a prototype. | `venues.ts` call 6 |
| 7 | **The map is fixed and the bill is rolled.** Each room has two authored sets and one is drawn per night. | Rolling the geography. Would stop the map being knowledge, which is the one thing #253 said the map was for. | `venues.ts` `rollBill` |
| 8 | **A Blackout ignores armour.** For its four bars everything plays *and* everything is answerable. | Armour applies through a Blackout — the version #255 literally describes. Rejected because it makes the run's only active verb weakest exactly where the run is hardest. | `run.ts`, `damageEnemy` |
| 9 | **Closing time is not a win.** The Headliner wins the night; 03:00 merely ends it. | Both are wins, as the base's 30:00 is. Measured: the `loiter` route — one room then stand on the street for 28 minutes — was the best-scoring run of any route, because the street is unbounded and inherits the base's real pressure valve. | `run.ts`, `update` |
| 10 | **Coverage pays for itself through the stat seam**: `mods.damageMul = 1.5`. | Leave the base's damage curve alone. Then every enemy statline is silently a third tougher, because effective output is only the share of the band that answers the room. | `run.ts`, constructor |
| 11 | **The Sandbox is exempt from the economy.** | Run the economy there too. Then FULL BAND VIII browns out on the first bar line and this branch cannot produce a capture comparable to `docs/palette-control/`. | `game.ts`, `addBarListener` |

Two further calls are recorded in the code but are corrections rather than choices:
`ARMOUR_HP_MUL` went 2.2 → 1.5 → **1.0** (armour adds no HP; its identity is what
answers it, and the bestiary's armoured kinds were already its heavy bodies), and the
venue crowd floors are now **authored per room** rather than derived from one formula,
because a room's danger is bodies times weight and the rooms differ fiftyfold in
weight.

## Measurements

All from `tools/play-the-night.ts`, one seed (`0xc19c1`), the greedy route. The full
traces are in `docs/circuit/`. **`--invincible` runs are the instrument for the
economy** — the interesting half of an upkeep budget is minute twenty, and a bot dies
at minute four, so a mortal run measures the opening and nothing else. Difficulty is
reported separately from the mortal run.

### The hard floor's first clause

> A run's density must fall at least once **because the player chose it**.

| configuration | player-caused density falls | first fall | peak / trough triggers a bar |
|---|---|---|---|
| **control** — no layers, Mad Forest | **0 — FAIL** | — | 9.3 / 2.0 |
| Coverage + Night Out — **no budget** | **0 — FAIL** | — | 10.5 / 2.0 |
| Headroom + Coverage — **no map** | 5 — PASS | 20:19 | 9.8 / 2.0 |
| Headroom + Night Out — **no Coverage** | 11 — PASS | 8:47 | 9.5 / 2.0 |
| **all three** | **19 — PASS** | **2:45** | 12.5 / 2.0 |

The control never falls, which is `docs/baseline/`'s finding reproduced through a
different instrument: the base's density climbs and never once comes down.

**Read down that column and the stack explains itself.** Each layer's contribution is
separable and they compose in one direction:

- **Headroom is necessary.** With it switched off, density never falls *once* in a whole
  night, even with Coverage and the whole map running. Coverage on its own gives the
  player no reason to switch anything off — you keep everything playing and accept that
  some of your hits chip. **Nothing else in this stack can produce the hard floor.**
- **The map is what makes Coverage actionable.** Headroom + Coverage in one arena falls
  only 5 times and not until **20:19**: with no room whose roster tells you which voice
  is useless *here*, the only pressure left is the raw budget, and the raw budget is
  late. The telegraph is not decoration on Coverage, it is the half that does the work.
- **Coverage is what makes it early and legible.** Headroom alone bites at 8:47 for
  accounting reasons. Add Coverage and the first fall is at 2:45 for a reason with a
  subject: *this room cannot be hurt by this voice.*

So the three-way interlock #270 called "unusually tight" is real and measurable, and the
dependency runs **Headroom → Coverage → the map**: the budget is the engine, Coverage
tells you which voice to spend, and the room tells Coverage when.

### The economy, over a whole night

| | all three | no Coverage | no map |
|---|---|---|---|
| brownouts | **0** | **0** | **0** |
| Blackouts | 7 | 10 | 4 |
| units drawn | 6,171 | 6,347 | 7,295 |
| units banked | 1,130 | 1,628 | 773 |

**Zero brownouts across a whole night, in every configuration.** The budget never
actually forced anything: the bot's band peaked at 12.5 triggers a bar against a
regeneration of 8.0 plus a pool 48 deep, and it never reached the five-maxed-weapon
band that draws **34**. So the brownout is a rule this build never had to enforce, and
whether it is a good rule is genuinely untested. **A human who levels a real build will
hit it; this bot cannot.**

### Coverage

| | all three |
|---|---|
| hits that answered the body | **29%** |
| damage into the wrong body | 57,238 |

29% is low and partly the bot's fault — it retools worse than a person. The number to
watch when a human plays is whether it rises, because that *is* the skill the layer
adds.

### The run shape

The complete night: **all seven rooms played, the Headliner beaten at 24:01, WON** —
and again at 23:08 with the budget switched off, so the route and the summit do not
depend on Headroom. The
route, the set pause on leaving, the door gates, the summit ending, the chest payouts
and the rolled bill all work end to end. Room order came out
Doors → Back Room → Loading Bay → Cellar → Stairwell → Balcony → Attic.

### What is NOT measured

- **The loudness range.** The hard floor's second clause — *the run's loudness range
  must clear 0.6 LU* — is an audio measurement and needs a foreground browser: the
  capture rig is a console snippet against `window.loop`, and Chrome does not run
  `requestAnimationFrame` in a background tab, so an automated session can play audio
  while the world never advances a frame. **This session could not take it.** The
  procedure is unchanged from `docs/prototype-base.md` and the Sandbox link works
  (design call 11 keeps the economy out of it), so the set is reproducible by anyone
  with the page in front of them.
- **Whether the arrangement capture can see this stack at all.** It probably cannot,
  and that is worth knowing before anyone takes it: none of the three layers changes
  what a *fixed* build sounds like at rest. They change **which build is playing, over
  time, inside a run**. The nine reference build states should therefore come back
  identical to `docs/palette-control/` — which is a useful negative result, and it
  means the measurement that matters here is a **played-run** capture, not an
  arrangement one.
- **Whether any of it feels good.** Not a thing a bot can report.

## What this branch found that outlives it

1. **A bounded room removes the survivors-like's implicit pressure valve.** In an
   unbounded arena, walking in a straight line permanently sheds a crowd —
   `recycleEnemies` despawns whatever falls behind, and the genre leans on that far
   more than it looks like it does. Inside a room you circle, nothing falls behind, and
   the crowd accumulates to the global cap: 227 alive at 4:31 in a room whose floor was
   38. **Any candidate with rooms has to price its arrival rates for a pen, not an
   arena** — and the same fact is why the unbounded street was the best place in the
   game to stand.
2. **Two clocks, and they diverge.** Bar lines arrive from the audio clock's
   `setInterval`; the world advances from `requestAnimationFrame`. In a background tab
   the economy kept banking against a band that played nothing — measured at 0.2
   seconds of world time with the bank 65% full, so alt-tabbing was a free Blackout.
   Anything a later stack drives off the bar line needs the same guard.
3. **A telegraph that counts bosses lies about its room.** Reading armour off the boss
   rows as well as the crowd made Doors "want CUT" because of one shielded boss, while
   95% of its crowd was bare mites. A player reading that correctly mutes their punch
   voice for the whole set and starves.
4. **A door that reads the playing band is a trap unless it names the key.** A build
   that *owned* a muted bright-transient voice was locked out of the last two rooms for
   fourteen minutes while the readout said only "DOOR NEEDS CUT". The interlock is worth
   keeping; the message has to distinguish *you have nothing* from *you have it and it
   is switched off*.
5. **A layer's own RNG needs its own stream.** Rolling the night's bill off the main
   stream shifted every later draw, so the opening weapon a seed handed you depended on
   whether The Night Out was switched on — the control opened on the bass and the stack
   on the kick, and kill counts that looked like a run-shape difference were a weapon
   difference. Any A/B a later ticket runs needs this or it is measuring noise.
6. **Two constraints that each halve effective damage do not compose.** Coverage's
   chip multiplier and an armour HP multiplier stacked to roughly six times the base's
   time-to-kill. The base's damage curve is authored against unarmoured bodies at full
   damage, and a layer that removes a third of it has to give it back — `RunWorld.mods`
   is exactly the channel, and it is one line.
7. **A peak has to be gated from both sides.** #253 gates the drop until there is
   something worth stripping; the mirror is equally true. A Blackout with the whole band
   already playing buys four bars of free upkeep and not one new note, and the harness
   spent its first bank on exactly that.

## Verdicts, per mechanic

Per #270: verdicts are per mechanic, not per stack. These are the session's own reads,
and every one of them is a read of a bot's night plus one boot of the real game — not
of playing it.

| mechanic | verdict | why |
|---|---|---|
| **the venue map / night clock** | **holds** | Seven rooms, a route worth choosing, a summit ending, and a run boundary that falls out of the fiction. It works end to end on the first complete night. |
| **a set with an end** | **holds** | This is what gives the map a rhythm — arrive loud, play a set, walk out quiet — and it is where the authored valley comes from. |
| **the telegraph** | **holds, and is load-bearing** | It is the retooling answer #255 said Coverage owed, and a player who ignores it dies. |
| **Coverage** | **holds** | It moves the first density fall from 8:47 to 2:45, doubles the count, gates the route, and gives going thin a *subject*. |
| **upkeep as a budget** | **holds, and is load-bearing** | It is the only layer without which density never falls at all — 0 falls in a whole night with it off, against 19 with it on. What it does NOT do is bite early or legibly on its own: alone it waits until 8:47, and in one arena until 20:19. |
| **the brownout specifically** | **untested** | Zero across every configuration. The budget produced falls the player *chose*; it never once forced one. The bot's band peaked at 12.5 triggers a bar against a five-maxed-weapon band's 34, so the rule that makes upkeep a hard constraint is the one this build never reached. A human will. |
| **the Blackout** | **holds, once gated** | Seven per night, a real peak, and the armour-ignoring version (call 8) is what makes it worth saving for a climax. |
| **the Headroom pick cards** | **untested** | They fill the base's minute-fourteen drought by construction, but the bot never levelled far enough to need them. |
| **closing time as a non-win** | **holds** | It is the only thing that makes time a constraint; without it the degenerate route scores best. |

## Round 1's shared rubric

Answered against [#253](https://github.com/yusufkinatas/loop-survivors/issues/253),
item by item.

- **Peaks the player authors and pays for in advance** — yes, and the payment is
  literal: the bank fills only while you are under budget, and it buys exactly four
  bars. Seven of them in a night.
- **A job down in the valley** — yes, and it is the strongest thing in the build. The
  walk between rooms pays double regeneration, so going thin on the street is income
  rather than abstinence. That is the corridor problem's escape (b) at full strength.
- **The drop gated until there is something worth stripping** — yes, both ways round:
  a Blackout needs something switched off to switch on (call 8's mirror), and the
  budget cannot bite a band that is not yet expensive.
- **Ordinary play eroding late** — **no, and this build does not attempt it.** Nothing
  gets harder to hold as the night goes on except the band you chose to grow.
- **An ending that is a summit** — yes. The Attic, not the clock.
- **Discovery that is musical with a combat payoff, visible on screen** — partly. A
  room's tempo and groove are its identity and its plate is on the floor from across
  the map. What is *not* musical discovery is the reward: a finished room pays a chest,
  which is the base's currency and not a new sound.
- **Run two plays differently** — yes, and by construction rather than by numbers: the
  bill is rolled, so the room that wants PUNCH tonight wanted HOLD last night and the
  band that opens the map is a different band.

## What it breaks

Pillar 5 completely, the single-arena assumption, and the held-fixed enemy schedule —
all three as #270 predicted. `docs/plan.md`'s *"no categories, no typed positions"* is
also broken, and knowingly: Coverage types the bestiary and reads a column of the
palette grid as a gameplay rule. #256 unlocked that for round 1 and #257 decides
whether it survives.

**Grouping** (this stack's own call, per the shared protocol): the palette stays
**ungrouped by seat** and is **typed by attack** for exactly one purpose — what a hit
answers. No seat rule, no exclusivity, no slot the grid decides. That separation is the
reason this stack is a different idea from The Route with its exclusivity toggle on.

**Evolutions** are kept, unchanged from the base. No competing transformation system
here, and no attempt was made to give one a musical consequence — so #247's open
question about what evolution becomes is untouched by this branch.
