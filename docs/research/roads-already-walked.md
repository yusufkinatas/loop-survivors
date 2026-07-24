# Roads already walked: the removed genre system, the dropped full-track direction, and everything else this project has cut

Research for issue #252 (part of #247). A ledger of the design systems this
project built and then abandoned in the area the core-loop map is about — the
shape of a run, what powering up buys, and what constrains a build. For each
one it records what the thing actually was, mechanically, and then the
distinction that matters for reviving it: was it **rejected on its merits**
(built, judged, and found wanting, with a reason on the record) or merely
**deferred, simplified, or redirected** (it may work fine; it was scope, taste,
or a change of direction). Where the record does not say, this document says so
rather than guessing.

All sources are local — no web sources were used. Mined 2026-07-24/25:

- Git history on `main` and on unmerged side branches, via `git log --all`,
  `git show <sha>`, and `git show <sha>:<path>` to read deleted files as they
  were. Principal commits: `e427209` (genre removal), `de9612d` / `1011a0e` /
  `0ecf271` / `bc13425` / `e56c9e4` / `3eff19d` / `2461b9c` (the Track Lab and
  the full-track direction), `5c83750` (per-genre sound and the removed track
  variants), `967b6bf` (the house-first overhaul), `e0c62dd` / `0c3a8a1` (the
  Infinite Night Tour and its teardown), `9bbfccc`, `512aab7`, `06a52ce`,
  `a339c61`, `74e468b` (#191), `803a2c7` (the docs deletion).
- `docs/STATUS.md` as it stood at `e427209` and at `803a2c7^` — a 596-line
  append-only project history that no longer exists in the working tree. It is
  the single richest source of stated reasons in the repo and every gate
  verdict is recorded there.
- The deleted phase specs `docs/phases/m3-the-drop.md`, `genres-and-weapons.md`,
  `the-band.md`, `overhaul-2026-07.md`, and the pre-`803a2c7` `docs/plan.md`
  (its "Parked Decisions" list).
- **Spec documents that only ever existed on unmerged branches** and are
  therefore invisible to `git log` on `main`:
  `perform-the-track.md` / `-v2.md`, `hold-and-drop.md` / `-v2.md`,
  `hype-layer.md` / `-v2.md` / `-v3.md`, `mixer-system.md`,
  `alternative-complexity-power.md`, `house-foundation-refactor.md`. Read them
  with `git show <rev>:docs/phases/<file>` at the revisions named in §10–§12.
- GitHub issues and PRs via `gh` (all 300 closed issues scanned; PR bodies for
  #12, #26, #92, #106, #123, #150, #152, #157, #244).
- Live code: `src/experiments/tracklab/`, `src/audio/soundset.ts`,
  `src/audio/charts.ts`, `src/game/weapons/levels.ts`, `src/game/config.ts`,
  `docs/adr/`, `docs/mad-forest-spec.md`, `docs/player-power-spec.md`.

A note on this project's evidence: it ran a **gate protocol** — the developer
plays the build and declares pass or fail, recorded in `STATUS.md`. So "it
passed its gate" and "it was removed" are independent facts here, and several
systems are both. Treat a gate pass as the strongest evidence a road is
walkable; treat a removal without a recorded gate failure as *not* evidence
against it.

**If you read one section, read §10.** On 2026-07-07 this project ran three
parallel prototypes against the exact problem #247 exists to solve, and produced
four playtest rejections with written diagnoses. All three live on unmerged
branches; none of their specs ever existed on `main`, so nothing in the working
tree points at them. §14 is a ledger of every finding sorted by merits vs.
deferred; the closing section maps everything onto the triad.

---

## 1. The two-genre system (removed `e427209`, 2026-07-09)

### What it was, mechanically

At its widest (2026-07-06, commit `3eff19d`) there were **six genres**; by the
time it was removed there were **two**, House and Techno. A genre was a
playable character picked on the start screen before the run.

`src/audio/genres.ts` (deleted; readable at `git show e427209^:src/audio/genres.ts`)
defined a genre as:

```ts
export interface Genre {
  id: GenreId; name: string; blurb: string; color: string;
  bpm: number;
  swing: number;      // fraction of a 16th the offbeat 8ths are pushed late
  powerMul: number;   // per-trigger damage compensation for tempo
  ladders: Partial<Record<Role, Chart[]>>;  // its ONE track, 4 tiers per role
}
```

The two shipped values:

| | House | Techno |
|---|---|---|
| bpm | 124 | 130 |
| swing | 0.06 | 0 |
| powerMul | 0.9 | 0.86 |
| blurb | "Four-on-the-floor. Offbeat hats, stabby chords. Steady and relentless." | "Hypnotic warehouse pulse. Four-on-floor, offbeat hats, dark stabs." |

`powerMul` is the tempo/damage compensation the design law in `docs/plan.md`
still describes: "a fast genre fires more triggers, so each hits softer"
(`e427209^:src/audio/genres.ts`, comment on `powerMul`). It survives today as
`SOUNDSET.powerMul`, set to `1` — an identity multiplier
(`src/audio/soundset.ts:26` and `:36`), so the lever exists but is switched off.

Four things a genre carried, all of them constraints on a build:

1. **Its own tempo and swing.** The whole run's grid.
2. **Its own voicing.** Not a re-EQ: `src/audio/kits/house.ts` and
   `kits/techno.ts` (593 lines) were separate synthesis programs, overlaid with
   real one-shots per genre (909 for house and techno, 808 for hip-hop,
   LinnDrum for synthwave, a distorted break for drum & bass) via
   `SAMPLE_OVERLAY` in `e427209^:src/audio/kits/index.ts`. The techno kit's
   header states the intent: "Every voice is engineered darker/harder than the
   neutral builtin so the genre reads unmistakably as techno rather than a
   re-EQ of house."
3. **Its own instrument set — a genre dropped weapons it did not suit.** This
   is the strongest constraint the game has ever shipped. `supportedRoles(id)`
   derived from which roles the genre supplied a ladder for, and it was "the
   single source of truth for 'optimized for these instruments', read by the
   pick pool, the band rack, and the engine (unsupported voices never enable)"
   (`e427209^:src/audio/genres.ts`). Concretely:
   - **House supported 11 roles** — kick, clap, rimshot, hat, shaker, crash,
     riser, bass, chord, rhodes, lead — and **dropped the whole Motion band
     slot** and the snare. Its kit header: "House DROPS whole slots to stay
     idiomatic: no Motion voice (acid/arp belong to techno and the busier
     genres), no snare (the clap owns the backbeat)"
     (`e427209^:src/audio/kits/house.ts`).
   - **Techno supported 12 roles** — kick, clap, rimshot, hat, ride, acid,
     crash, riser, bass, reese, chord, lead — filling all eight slots, and
     dropped snare, tom, heartbeat, shaker, cowbell, arp, zap, pluck, rhodes,
     choir, bell, whistle (`e427209^:src/audio/kits/techno.ts`).

   Different genres therefore offered **different, partly non-overlapping
   weapon catalogs**. Picking a genre was picking which build space existed.
4. **A build-time playability floor** guarding that constraint: a genre could
   drop instruments and whole slots but had to keep "a beat (Pulse), a low end
   (Bass), a tick (Hats), a melodic voice (Harmony/Melody)", enforced as a
   thrown error at module load (`e427209^:src/audio/genres.ts`, `FLOOR_GROUPS`).
   This survives verbatim in `src/audio/soundset.ts:57-80`.

### The genre/role affinity table

Design rule 6 from the band grilling: "when an offer shows a slot, the roster
instrument drawn is weighted toward the genre's idiomatic option (House leads
with clap, DnB with snare)" (`e427209^:docs/phases/the-band.md:118-120`). The
implementation, deleted from `src/game/band.ts` in `e427209`:

```ts
const GENRE_ROLE_AFFINITY: Record<GenreId, Partial<Record<Role, number>>> = {
  house:  { clap: 1.5, snare: 0.7,  cowbell: 1.3, arp: 0.85, choir: 1.25, ride: 1.2 },
  techno: { clap: 1.3, snare: 0.85, cowbell: 1.2, arp: 0.9,  tom: 1.15, ride: 1.3, reese: 1.2 },
};
```

Its doc comment records the design stance exactly: "A soft multiplier on the
draw weight, never a lock — the off-genre member can still appear. Anything
unlisted is 1.0. Single-member slots (Hats/Bass/Harmony/Melody) are
unaffected." It multiplied into the weapon draw weight in
`picks.ts weaponWeight(role, genreId, timeS)` alongside the early-drum nudge.
Note the ordering: the *hard* constraint was `supportedRoles` (the genre simply
did not have the instrument); the affinity table was only a thumb on the scale
among the instruments a genre did have.

### The rest of the wiring (the cost of having it)

`chartstore` keyed charts per genre and persisted edits per genre;
`engine.setGenre` re-pointed every voice's charts and swapped every voice's
buffers asynchronously; `clock` carried per-genre swing; the start screen had a
genre grid; the HUD had a genre header; the sandbox had a live genre switcher
and a kit-prototype A/B selector; the headless bot took `--genre` and
`SimSpec.genre`; replays took `?genre=`. All listed in the `e427209` commit
body. The teardown was **391 insertions, 1705 deletions** across 41 files
(PR #12).

### Why it was removed — and what the record actually says

**The record gives no design reason.** Every genre removal in the chain is
recorded as a developer instruction:

- `db57ebc` (Hip-Hop, Drum & Bass) — commit body states only what was deleted.
- `890adbb` (Lo-Fi) — likewise. STATUS: "**Lo-Fi genre removed fully** at the
  developer's request."
- `e70395a` (Synthwave) — "Narrows the shipped genres to House and Techno **at
  the developer's request**."
- `e427209` (the system itself) — STATUS: "July 9, 2026 — **Genre system
  removed entirely** at the developer's request; techno gone, House sound kept
  but unnamed, default tempo dropped 124 → **120 BPM**."

The framing STATUS gives it is explicitly temporary: "This is a **'for now'
simplification ahead of a new version** — the soundset content (kit, ladders,
samples) is kept" (`e427209:docs/STATUS.md`).

**Critically, the genre system had already PASSED its gate.** The gate ledger
in `e427209:docs/STATUS.md:42` reads: "Gate A also implicitly co-judged the
July 6 genres-and-weapons material it stacked on (six genres as characters,
twelve weapons, items, effects, VS enemies, UI redesign); that work is now
**passed** by the same playtest." The genre system's own stated gate question —
"is a genre worth replaying as a character" — is never recorded as answered no.

**Verdict: deferred / redirected, not rejected on its merits.** There is no
recorded playtest in which genres were judged and found wanting. What the
record shows is a steady simplification (six → four → three → two → none) under
developer instruction, framed as clearing the deck for a new direction that had
not been decided yet.

**One merits-based finding does exist, and it cuts the other way** — in favour
of per-genre *sound*, not against genres. `the-band.md:125-126` flags: "the
shared sample set is a genre-identity ceiling patterns cannot fix. Re-audit
timbre per genre at the M4 style gate." That flag was acted on: the
`audio-refresh` branch was redirected on 2026-07-07 to give each genre its own
voicing, "Reverses the locked `plan.md:52` model (shared soundset, per-genre
patterns) at the developer's explicit direction"
(`e427209:docs/STATUS.md:62`). So: *"same instruments, different patterns" was
tried and found insufficient to carry musical identity.* Anything that proposes
carrying variety on patterns alone over one shared kit is re-proposing a thing
that was explicitly found not to work.

### The sibling casualty: three alternative tracks per genre

Inside the same `audio-refresh` work, commit `5c83750` first built **"Track
variants: each genre carries selectable 'tracks' — Classic (the shipped
patterns, still default) plus three researched alternatives grounded in named
sub-styles (18 new full ladder sets)"**, with a sandbox switcher persisting the
choice. It was then removed within the same PR by the redirect: "Redirect the
audio-refresh branch from 'pick the best of three tracks per genre by ear' to
each genre owning its own sound. … The three-pattern-alternatives work
(`variant.ts`, `variants/*.ts`) is removed."

**Verdict: redirected, not judged.** Eighteen complete alternative ladder sets
were authored and deleted without a recorded ear-verdict on any of them. This
matters for "run-to-run variance": the machinery for *multiple authored charts
per instrument, selectable* has been built once already and thrown away for
reasons unrelated to whether it was fun.

### Also removed in the same commit: starting-instrument choice — and later revived

`e427209`'s third sub-commit, `2322aae`: "Remove starting-instrument selection;
every run opens on the kick … Runs always begin with the kick at tier 1
(**non-negotiable for now**)."

That "for now" was honoured. Issue #112 reopened it and `62b6583` (2026-07-19,
via PR #123) landed the current behaviour: **a run opens with no weapon at all
and three weapon pedestals on the ground.** `src/game/game.ts:1031-1035`: "The
run opens silent, on a choice of instrument rather than a fixed one. Three
weapon pedestals drop around the player and collectGroundPick arms the chosen
one on the next bar. This is deliberately NOT a level-up: no upgrade is
enqueued and world level/XP are untouched." PR #123 flags the consequence:
"Runs now open silent until the first pedestal is collected."

**Verdict: deferred, then revived.** This is the cleanest worked example in the
repo of a "for now" cut coming back ten days later and sticking.

---

## 2. The full-track direction and Track Lab (dropped `3eff19d` / `e56c9e4`, 2026-07-06)

### The chain of events

| Date | Commit | What happened |
|---|---|---|
| 07-04 | `1b6ea36` | M2 verdict **pass**. "music growing with the build creates the 'I'm making a track' feeling." M3 deliberately not started. |
| 07-05 | `de9612d` | M3 grilling opens, then pauses for a proof of concept. Track Lab built: 4 (soon 5) reverse-engineered covers of real tracks. |
| 07-05 | `64c1882`, `5026726` | Satisfaction's MacinTalk robot vocals removed on the developer's ear. |
| 07-05 | `0ecf271` | **Satisfaction passes the ear.** "all sounds pretty good to me, audio is satisfying." |
| 07-05 | `bc13425` | POC "treated as proven"; M3 grilling resumed and the drop spec locked at `docs/phases/m3-the-drop.md`. |
| 07-06 | `e56c9e4` | The whole direction dropped. Sub-phase A/B work-in-progress discarded. Bosses take the composed tracks instead. |
| 07-06 | `3eff19d` | Genres-as-characters replaces it; Track Lab removed. |
| 07-06 | `2461b9c` | Track Lab restored as the standalone "Experimentation room", at the developer's request. |

### What the direction actually was

From `bc13425:docs/phases/m3-the-drop.md` (90 lines, locked spec, quoted
verbatim throughout):

- **A weapon is an instrument type, not a fixed sound.** "The instrument type
  carries the gameplay — its projectile, its damage, its behavior — and it is
  what gets balanced, once, consistently across every track that uses it."
- **A track is an exact recipe of instrument types.** "The track is the
  mechanical unit. 'Genre' is a flavor and family label over tracks, not a
  mechanical layer. Your exact build deterministically selects the exact track.
  There is no random assignment — **exactness and randomness cannot coexist**,
  because if the instrument set fully determines the track there is nothing
  left to roll."
- **The re-score.** "On the drop, your weapons stop playing their solo ladder
  charts and start playing their **written parts in one composed song**. Every
  note is still a trigger… Model A is intact — the only thing that changed is
  the sheet music, from six solos to one arrangement."
- **The constraint, and it was severe.** "**Off-recipe instruments block the
  drop.** To arm it, your build's instrument types must be a clean exact match
  to a track's recipe — no missing types, no extra types. Building wide is an
  early price; the reward is unlocking the track." The spec banks the
  consequence in the same breath: "with secret recipes this can brick a run, so
  the shipped game will likely need an escape valve — drop or swap an
  instrument. Parked."
- **The active verb, and its risk.** "The drop is a player-fired active
  ability, never auto-cast." Firing it opened a **vulnerable wind-up**: "a riser
  … then a beat of silence. During the wind-up the weapons thin out and cut, so
  **you deal little or no damage and are briefly exposed** while the horde keeps
  closing. … The drop is a setup tool you read the moment for, not a panic
  button that always saves you." Then the **slam**: all parts hitting one
  downbeat, a short damage-amp window, spectacle.
- **Two-stage economy.** The first drop is recipe-gated and permanent ("the
  composed track is the run's music permanently"). Every drop after is a
  **re-drop** gated by "a combat-charged energy meter: a bar that fills as you
  deal damage and kill, full means ready, firing empties it." The asymmetry was
  deliberate: "the *first* drop is the earned ceremonial transition …; every
  drop after is a combat surge (energy-gated)."
- **Where dynamics came from.** "**Exact-match means the track always plays in
  full.** … The track's breathing comes from its own sections (the quiet and
  loud stretches inside the composition), not from build variation."
- Freestyle runs were fine: "Runs that never complete a recipe are freestyle and
  fine. You play M2's growing sketch out to the end. No nudging in M3."

### What Track Lab proved

Track Lab exists to answer one question, stated in its own engine header
(`src/experiments/tracklab/labengine.ts:4-6`): "**can our engine render a track
the developer sincerely wants to listen to?** — no gameplay attaches to it."
The reason for using real tracks is recorded in `STATUS.md`: "a known-good
composition isolates the variable (if a great track sounds bad, the problem is
engine/samples, not composition)."

**Proved:** a chart-based cover, rendered through this project's own scheduling
approach, can clear the developer's ear. Satisfaction did, on 2026-07-05, and
is the only cover recorded as passing. The engineering findings stand too — the
timing bug in `2ee97bc` ("samples pitched far from their recorded root stretch
their transients, reading as delayed notes; cure is multi-octave rendering with
chart notes near rate 1.0") is a live constraint on any pitched sampled voice.

**Did not prove:** the overarching verdict it was built for. STATUS, at the
moment of the pass, names it as still open: "the overarching POC verdict (**can
a chart-based cover make him sincerely want to stay inside the music**) that
gates whether the M3 destination-track direction gets specced." The next
STATUS entry records it as "POC **treated as** proven" — a judgment call on one
track, not a declared verdict — and two evidence items were left open and never
closed: "the Sahara bell-pickup A/B and a METAMORPHOSIS drop re-listen after
the timing fix" (still listed as loose ends at `e56c9e4`).

**Never tested at all:** the drop mechanic itself. `e56c9e4`: "the uncommitted
sub-phase A/B WIP was discarded; it survives in a git stash." No gate on the
drop was ever run.

### Why it was dropped

`e56c9e4` and `3eff19d` both attribute it to the developer without a design
reason. `3eff19d`: "**Redirect from the developer:** the full-track /
genre-drop direction (M3) is dropped and the Track Lab that prototyped it
removed." STATUS (`3eff19d`): "On July 6 the developer dropped the full-track /
genre-drop direction entirely." The replacement spec's own summary of what died
(`genres-and-weapons.md:21-25`): "What was dropped — The **full-track /
destination-song** idea, in every form. The **drop event** (player-fired lock,
exact-match recipe, vulnerable wind-up, synchronized slam, energy meter,
re-score)."

**Verdict: dropped before it was ever built or judged.** The spec was locked on
2026-07-05 and the direction was gone on 2026-07-06, with the implementation
still uncommitted. This is the opposite of rejected-on-merits: nobody played it.
The one thing the record *does* establish is that the underlying audio claim
(charts can render a real composed track well) held up for one track.

### What survived, and what it can do

Track Lab is live at `src/experiments/tracklab/` and #247 already names it as a
prototyping surface. Its header states the status plainly
(`src/experiments/tracklab/lab.ts:1-6`): "It was the M3 proof-of-concept
surface; **the full-track game direction it explored was dropped**, but the room
is kept for experimentation."

Its engine has four capabilities the *game's* engine does not, listed at
`labengine.ts:9-12`: "voices keyed by string id, any number of them;
per-track bpm, phrase length (up to 16 bars), swing; **sections: named sets of
charts, switched on a bar boundary**; sidechain pump: kick-tagged voices duck
the rest." The game engine is locked to a 4-bar phrase (`BARS_PER_PHRASE = 4`,
`src/audio/scale.ts:34`), one tempo, and the fixed role list. Five covers
remain: Sahara, METAMORPHOSIS, Pursuit, Satisfaction, Da Funk
(`src/experiments/tracklab/tracks/index.ts`). Three of them also drive the boss
fights, which reuse `LabEngine` rather than the weapon engine — the one place
in the shipped game where a composed multi-section track plays.

### The boss pivot that replaced it

Worth recording because it is the same problem solved from the other side
(`e56c9e4`): "**the boss makes the music.** A boss locks the player into a fixed
arena, takes their weapons, and plays a whole track whose structure is the
fight: sections are phases, beats are attacks. The player only moves and dodges
(with a dodge dash), and wins by surviving to the last bar — the boss can't be
damaged, its health bar is the song draining away." Three bosses shipped and
are still in the game (`src/experiments/boss`, promoted on the main menu in
`16ed7cb`). It was never gated either: STATUS at `e56c9e4` records "awaiting the
developer's hands/ear", and "**Parked:** wiring the 'boss every 3 minutes'
interrupt into the live M2 run (deferred to protect the gated M2 loop + bot
determinism)" — an explicit scope deferral, not a rejection.

---

## 3. The tempo ramp and the Pressure UI (removed `74e468b`, issue #191, 2026-07-22)

### The tempo ramp

One line in `src/game/game.ts`:

```ts
const updateArenaMinute = (minute: number): void => {
  engine.clock.bpm = SOUNDSET.bpm * (1 + Math.min(0.08, minute * 0.002));
  if (minute > 0) hud.showToast(`PRESSURE ${minute} · enemies scale up`);
};
```

That is +0.2% BPM per elapsed minute, capped at +8%. Over a 30-minute set at
122 BPM it reached ~129 BPM — audible over the whole run, imperceptible minute
to minute. It was the only implementation the "stage may modulate tempo" hook
in `docs/plan.md` ever had.

### The Pressure UI

Two toasts (a per-minute `PRESSURE n · enemies scale up` and a "rises in 3"
warning with its minute tracker), plus `Enemy.band` — a 0–3 "toughness band"
computed as `min(3, floor(minute / 5))` and drawn as danger diamonds on enemy
sprites, with `spawnMinute` recorded on every body to feed it.

### Why they went, and what kind of removal this is

The stated reason is structural, not aesthetic. `74e468b`: "The 30-minute Mad
Forest table orphaned three systems; this is the cleanup pass that takes them
out end to end." Issue #191's body: "**Tempo ramp:** the music clock's BPM no
longer rises with the minute — the whole 30-minute set plays at one constant
tempo. (Tempo stays a reserved design lever per `docs/plan.md`; **any future
tempo drama is a new authored decision**.)" `docs/mad-forest-spec.md:422-425`
repeats that parenthetical verbatim in the live spec.

The Pressure UI died the same way: it displayed per-minute stat scaling, and
per-minute stat scaling was itself deleted by #189 in favour of the authored
30-minute wave table. `74e468b` also drops `ENEMIES.hpScaleEnd /
damageScaleEnd / speedScaleEnd / rampExp` as "unreferenced endless-era ramp
factors … which contradict spec 5 (HP × Level is the only scaling in the
game)."

**Verdict: neither. It is a third category — orphaned by a decision made
elsewhere.** The tempo ramp was not judged bad; the thing it was attached to
(a time-driven difficulty ramp) was replaced by an authored schedule, and the
ramp had nothing left to track. The record is unusually explicit that the lever
is *reserved*, not condemned. A new proposal that moves tempo is not
re-proposing this road — but it must be an authored decision, and it collides
with pillar 5's constant-tempo set (`docs/plan.md:29-53`) and with the fact
that raising tempo raises damage throughput (`docs/plan.md:182-187`).

---

## 4. The Infinite Night Tour: four systems that lived 3 hours 48 minutes

`e0c62dd` "Infinite Night Tour (#105)" merged 2026-07-19 17:59 (+49 files,
+11,417/−1,496). `0c3a8a1` "Remove neon loop, pressure drop, venues,
headlines; rework into chest drops (#106)" merged the **same day at 21:47**
(−33 files, +296/−3,530). Four systems, each one a candidate answer to a
different corner of the triad, all cut together.

### Venues, route gates, and per-venue drum palettes — *run shape and constraint*

Six venues (`VENUE_IDS = ['alley','warehouse','rooftop','metro','basement','dawn']`
in the deleted `src/game/tour.ts`, readable at `git show 0c3a8a1^:src/game/tour.ts`,
1,102 lines). Each carried a floor colour, an accent colour, and exactly one
mechanic that gave **one benefit and one danger**:

| Venue | Mechanic | Benefit | Danger |
|---|---|---|---|
| Neon Alley | Wall Runner | projectiles get 1 free bounce | enemy speed ×1.12 |
| Midnight Warehouse | Moving Spotlights | lit enemies take ×1.2 damage | unlit player speed ×0.92 |
| Velvet Rooftop | Crosswind | — | projectile velocity shifts up to ±0.18; enemy speed ×1.08 |
| Last Metro | Last Train | a train every 40 s clears ordinary enemies | it deals 30 damage to the player |
| Acid Basement | Flooded Floor | enemy speed ×0.7; zone lifetime ×1.2 | player speed ×0.9 |
| Dawn Afterparty | First Light | +1 HP every 2 s | contact damage ×1.25 |

The route: a gate every 5 minutes (`TOUR_GATE_INTERVAL_S = 300`), two options
(`TOUR_GATE_OPTION_COUNT = 2`), an 18-second window to choose, chosen by
**walking through** a gate rather than picking from a menu, unvisited venues
sorted ahead of revisits, and a seeded fallback on timeout.

Each venue also swapped the drum palette. The deleted
`src/audio/venue-audio.ts` header states the rule it obeyed: "**Venues conduct
timbre, never notes or charts.** Shared by the run and sandbox so the visible
room and its drum palette cannot diverge." Three palettes existed
(`midnight-warehouse`, `velvet-rooftop`, `acid-circuit`); `0c3a8a1` deleted two
of them, WAVs and all. `src/audio/audio-sets.ts` today declares exactly one
id, `midnight-warehouse`, and that is the whole list.

This is the only shipped mechanism this project has ever had for **a run
choosing its own shape mid-flight** and for **the stage changing the sound
without composing** — the "performer, never composer" hook in
`docs/plan.md:133-140`, actually implemented.

### The Pressure Drop — *an active verb and a combat-charged meter*

A phrase-boundary state machine with phases `'charging' | 'armed' | 'drop' |
'cooldown'`. Frozen config from the deleted `tour.ts`: `maxHeat 100`,
heat gained at `0.45/s` per enemy within `proximityPadding 130` (capped at
`6/s`), `+2` per close kill, decaying at `3/s` when nothing is near, and
**`−30` heat for taking a hit**. When armed, it fired on the next complete
four-bar phrase and opened a 4-bar window: damage ×1.5, area ×1.25, projectile
speed ×1.2, move speed ×1.15, knockback ×1.25, plus a 220-unit opening shove,
then a 45-second cooldown. The audio side lifted the mix
(`pressureDropLift 1.18`) for the window.

Two design commitments are written into the code comments: "*Taking a hit
removes 30 heat while charging. Ready/live Drops never become weaker: once
earned, the complete four-bar reward is guaranteed.*" and "*Begin the power
window at an armed phrase boundary. Nothing was withheld beforehand; this
transition only adds positive modifiers.*"

Note what this is: **the M3 re-drop's combat-charged energy meter, shipped**
— the same "fills as you deal damage and kill, full means ready, firing empties
it" idea from `m3-the-drop.md`, minus the re-score. Reward-only, never a
penalty, quantised to the musical phrase. It ran for under four hours.

### The Neon Loop — *a drawn, temporary piece of terrain*

A path recorder turned into a reflective rail. It sampled the player's path
every 0.1 s (min 10 units apart, max 480 points), simplified it with
Ramer–Douglas–Peucker at tolerance 6, and built up to 48 segments, with a
guaranteed fallback rail perpendicular to heading if the player had not drawn
enough of a loop. Player-facing behaviour, from the deleted field guide:
records during **seconds 50–56 of each minute**, previews for four seconds,
stands as a solid rail for **24 seconds**, **slows crossing enemies 30%**, and
gives moving projectiles **one free reflection at −15% power**. Self-crossing
fed a `loopCross` career milestone.

### Headliners — *the reward event, since replaced*

Gold-marked bosses at five-minute marks, up to four at once
(`m % 5 === 0 ? min(4, 1 + floor(m / 15)) : 0`), dropping 25 music notes and a
physical **Encore Case** carrying an evolution (or +15 HP if no recipe was
ready). `0c3a8a1` generalised this into what the game still has: any boss-class
or elite enemy drops a Chest. The `hitlessHeadliner` and `loopCross` and
`pressureBreak` milestones went with them, trimming the milestone list to
`first5m / fullBand / firstEvolution`. "Tour Loadout" was renamed "Opening
Loadout" here and deleted outright later (section 6).

### Why they went

**No stated reason anywhere.** `0c3a8a1`'s body, PR #106's body, and PR #105's
body all describe in detail *what* was cut and never say *why*. PR #106's only
comment is the Vercel deploy bot. There is no linked issue — the issue numbers
jump from #101 to #107, and #105/#106 are PRs.

**Verdict: unstated.** These are neither recorded as rejected on their merits
nor as deferred. Given the same-day timing, nobody had time to play them
much. Four of the most directly relevant systems the project has ever built —
a mid-run branching route, a stage that changes the sound, an active player
verb on a combat meter, and player-drawn temporary terrain — sit in git with
no verdict attached to any of them.

---

## 5. Typed band slots → two flat caps (`9bbfccc`, #157, ADR 0003, 2026-07-21)

### What the slots were

Eight typed band positions at their fullest (`the-band.md`, locked 2026-07-06):
Pulse/Beat, Backbeat/Snap, Hats/Tick, Motion/Groove, FX, Bass/Low,
Harmony/Color, Melody/Hook — each holding **at most one instrument** drawn
from that slot's roster of three, for a 24-instrument catalog (8 × 3). By the
time they were removed the FX slot was already gone and the rosters had
shrunk, leaving seven slots (`git show 9bbfccc^:src/game/band.ts`).

The spec is explicit about the problem it was solving
(`e427209^:docs/phases/the-band.md:18-25`): "As a build accumulates instruments
the mix turns chaotic, two ways at once: raw count (up to twelve simultaneous
voices) **and role collision** (several instruments doing the same musical job,
e.g. hat + cowbell + arp all filling the fast ticking layer). Both worsen as the
catalog grows."

Two jobs in one mechanism: it **capped** the build, and it made instruments
**mutually exclusive within a position** ("Picks are permanent. Once a slot is
filled, its other roster instruments leave the pick pool for the rest of the
run. You hired your drummer; the audition is over.").

### Why it went — **rejected on its merits, with the argument written down**

`docs/adr/0003-flat-build-caps.md` is in the current tree and states the
rejected alternative:

> "The rejected alternative was to keep exclusivity and merely re-group the
> rosters into fewer, broader categories. It was rejected because with a
> five-weapon cap against an eight-weapon catalog, the cap already does the work
> the slots were doing — the build is small either way — while exclusivity keeps
> cutting reachable builds for a guarantee the player never asked for."

And it books the cost knowingly:

> "Two similar voices can now play together (Snare + Clap). The slots existed
> partly to guarantee one voice per frequency lane, so this ADR trades a
> structural guarantee of separation for build freedom. Cacophony is now
> prevented by the cap alone — a five-voice build is small — and by the
> player's own choices. If a specific pairing turns out to sound bad, fix it in
> the mix (kit gain, choke groups), not by reintroducing categories."

> "Evolutions get scarcer. Every recipe needs a specific passive at level 5, and
> the item cap dropped six to five, so fewer recipes line up by chance. This was
> accepted, not overlooked."

PR #157 flags it as untested at merge: "The slots existed partly to guarantee
one voice per frequency lane. Snare+Clap and Lead+Bell builds are now reachable
and are the cases to listen to." and "Not play-tested yet — the audio
consequence above wants an ear on it."

**Verdict: rejected on its merits, on a legibility-and-freedom argument — but
the audio consequence the ADR trades away was never listened to on the record.**
The mechanism was rejected; the *problem it was built for* (role collision in
the mix) was not solved by anything else, only made smaller by the cap.

### The 5-weapon cap is itself a live constraint held on merits

Issue #231 and `docs/player-power-spec.md:466`: "**Build caps become 5 weapons /
6 passives.** … A step toward VS Mad Forest's 6/6; **weapons hold at 5 because a
sixth weapon is a sixth concurrent voice in the mix — the build-as-track pillar
outranks verbatim parity there.**" Implemented in `09abb69`. Live values:
`BUILD = { weaponCap: 5, itemCap: 6 }` (`src/game/config.ts:83-86`).

This is the only place in the current design where a musical argument is
explicitly allowed to overrule a gameplay-parity argument, and it is a hard
ceiling on how many voices a build can ever hold.

---

## 6. Sound severed from power: ADR 0001 (`224bb12`, #137, 2026-07-20)

Chart expression used to leak into the world: pad chord variants stamped
bigger, longer-lived, weaker zones; the `fat` bass variant buffed Subquake by
×1.2; and seven damage formulas carried a velocity term
(`fireRailshot (0.8+0.4v)`, `fireTwoHands (0.85+0.3v)`,
`spawnSubquake (0.8+0.4v)`, `spawnProjectile (0.75+0.5v)`, `spawnOrbiter`,
`spawnEventHorizon`, `spawnBell`).

Issue #137: "**Decision (grilled 2026-07-20):** chart variants and velocity may
only affect the sound — sample choice and loudness. Nothing chart-expressive
may change damage, area, lifetime, or visuals. Every weapon has exactly one way
of dealing damage and one visual footprint."

`docs/adr/0001-variants-are-sound-only.md`, current tree:

> "The alternative — keeping velocity→damage as an 'invisible wobble' — was
> rejected because damage that varies per trigger has no single source of truth,
> is invisible to the player, and blocks exact headless balance math (DPS =
> chart trigger count × stat)."

> "Do not wire chart expression back into damage, area, lifetime, or visuals —
> re-adding it means re-litigating this ADR, not just editing a formula."

> "Charts and stats are retuned against flat damage after the severing; the old
> multipliers have no meaning as a rollback target."

**Verdict: rejected on its merits, with the strongest written defence in the
repo, and an explicit "do not re-add without re-litigating" clause.** It is also
the sharpest constraint on any future design: after ADR 0001, **the only channel
from music to damage is trigger count.** How loud a note is, and which sample
it uses, are guaranteed to be worth exactly zero damage. Anything that wants
musical expression to *mean* something mechanically has to either go through
trigger count or overturn this ADR.

Related, from the same file's neighbour `docs/adr/0002`: the Arp's orbiters
chip on a timer rather than on pierce, which made the pierce passive "a **100%
no-op** there".

### The other half of the same seam: level ≠ chart stage

Issue #225 split the two ladders apart, and the result is live in
`src/game/weapons/levels.ts:1-9`: "**TWO LADDERS, NOT ONE.** A weapon's LEVEL is
a gameplay number… A CHART STAGE is an audio number… The gameplay ladder is
twice as long as the chart one — eight levels over four authored stages — and
`chartStageForLevel` is the only place they meet."

The banding comment states the current relationship exactly
(`levels.ts:25-31`): "levels 1-2 play stage 1, 3-4 stage 2, 5-6 stage 3, 7-8
stage 4 — so the sound (and with it trigger density) steps at levels 3, 5 and 7
and **the even levels are payload-only**."

So the seam #247's framing asks for — power that does not automatically mean
more notes — **already exists in the code, and half of all level-ups already go
through it.** What has never been tried is making the density step go anywhere
but up, or letting a player choose which side of the seam a level-up lands on.

---

## 7. The endless era → the 30-minute authored set (#189, `5adf261`, 2026-07-22)

### What the endless era was

`ENDLESS_START_MINUTE = 8`: eight authored minutes, then a procedural director
forever. `endlessScale(minute)` was the per-minute stat table, whose deleted
comment states the intent: "Locked per-minute enemy scaling. HP, damage, XP,
and headliner toughness keep rising forever. Ordinary movement gets only a 30%
ceiling so collision remains readable while the uncapped HP/damage race
eventually wins." The values: `hp = 1.08^m`, `damage = 1.025^m`,
`speed = 1 + min(0.3, 0.0075m)`, `xp = 1 + 0.015m`,
`boss = 1 + 0.4·floor(m/5)`, `ampedChance = min(0.18, 0.015·(m−11))`.

Wave recipes existed for minutes 8–14; from minute 15 the director
**concatenated adjacent pairs of authored rows and cycled forever**. Amped
variants (gold-marked ordinary enemies from minute 12: 2.2× health, +25%
damage, 3× XP, a guaranteed note) and five-minute elite bosses layered on top.

### Why it went

**Replaced by a redrawn destination, not by a failure finding.** Wayfinder map
#170's decisions: "**Run shape** — 30 authored minutes; at 30:00 the run ends
with a demo-end win screen. The endless system … is **removed entirely**. This
supersedes the endless pillar in `docs/plan.md` ('no victory timer')."

The telling detail is issue #175, "Design the endless handoff at 30:00", which
had asked exactly the hard questions ("Where does `endlessScale` anchor so
minute 30→31 is a continuous difficulty step off the VS stat curve, not a cliff
or a discount?"). #170 lists it as "**closed unresolved**; the destination was
redrawn to end the run at 30:00, and the endless system is removed outright."

`5adf261`: "HP×Level, applied once at spawn by `enemyStats`, is now the only
scaling in the game; **nothing multiplies a stat after that and no value moves
with the clock.**" `docs/mad-forest-spec.md:337` on the XP layer: "The endless
`xpMul` (+1.5%/min) and amped 3x XP vanish with the endless era — **no
replacement layer.**"

Pillar 5 was rewritten in the same effort, from "A run ends when The Hush
overwhelms the stage. There is no victory timer" to the current "**A run is a
30-minute authored set** … There is no endless escalation."

**Verdict: replaced as a direction, not tried and rejected.** There is no
recorded playtest, balance audit, or ADR saying the endless director failed.
The map holds the enemy schedule fixed anyway (#247, "Held fixed for this map"),
so this matters less as a revival candidate than as a reminder that "no endless
escalation" is a *charting decision from #170*, not a tested conclusion.

---

## 8. The catalog shrink: 24 playable instruments → 8

The instrument catalog has only ever gone one way. Every step, with what the
record says:

| Commit | Cut | Stated reason |
|---|---|---|
| `283bd7d` (#26) | The whole **FX band slot**: crash (shockwave) and riser (auto-dash). Band 8→7 slots. Also deleted the Shock system and the player auto-dash. | PR #26: "**per the developer's request. They won't be part of the build anymore.**" Nothing further. Audio kept: "They are now dormant catalog voices the engine never enables." |
| `3aee577` | **Tom** (boomerang, second Pulse instrument). | No design reason. "Mirrors the FX removal (#26) exactly." Plus a measured finding: "A byte-level diff against clean HEAD on the same seeds is identical: **the kick always fills the Pulse slot first, so tom was never actually surfaced in an offer.**" |
| `6948768` (#92) | **Pluck bass, Rhodes, acid, shaker.** → "the new nine-weapon playable catalog". | Commit body empty. PR #92 states only the effect: "Hat, Arp, Bass, and Chord are now the sole choices for their respective band slots." |
| `bf4145d` (#167) | **Bell**, and with it the whole gravity-well entity kind, `ctx.displace()`, and three `Projectile` fields. 9→8 weapons. | No reason for the cut. Reasons given only for sub-decisions (Magnet Lanyard kept as a standalone passive). |
| `b814cc1` (#96) | Unreachable **sound variants**: kick `soft`, snare's `clap`, bass `sub` — plus the dead bass sub-drop path and the `SHAKE`/`FLASH` tables. | On merits, and measured: "Three sound variants exist in the kit code but are **never selected by the four-tune** (the house ladders), so users cannot reach them in a normal run." |

Earlier and larger: `967b6bf` (the 2026-07-10 house-first overhaul) cut the
24-instrument catalog to 16 "8 slots × 2", deleting cowbell, zap, rimshot,
heartbeat, ride (and the freeze system), reese, choir, whistle (and the tag
system). Its stated rationale
(`803a2c7^:docs/phases/overhaul-2026-07.md:20-31`): "The catalog is curated to
the sounds that belong on a house track; the 8 that fit worst are deleted
entirely… Rationale: two per slot keeps every pick a real fork while every voice
is house-idiomatic."

The same overhaul amputated the enhancement layer entirely — and said so in
terms that matter here (`overhaul-2026-07.md:33-37`):

> "**Items and weapon effects removed.** `items.ts`, `effects.ts`, the Mods bag,
> the audio `voicefx` insert chain, the item strip UI, the sandbox item editor
> are deleted. The pick pool is weapons and tier-ups only… **This is
> deliberately a clean amputation, not a flag: a different enhancement system
> comes later.**"

Passives came back later; per-weapon *sound* effects (reverb, echo, sustain —
each with a coupled gameplay twin) never did. The old plan's parked list still
described them: "Item and sound effects … as modifiers on an instrument slot,
each carrying a coupled gameplay twin (echo → a delayed second projectile,
sustain → lingering damage, opening filter → a damage ramp). Fits the model
cleanly; the open tension is that live effects can smear a composed track's
mix, tunable only by ear."

**Verdict on the catalog shrink as a whole: mostly directed, with two removals
backed by measured evidence** (tom was unreachable; three variants were never
fired by any chart). "Combinations over volume" (pillar 4) is the standing
argument against re-growing the catalog, and #247 explicitly reopens the door
("New content is a legitimate answer").

Live consequence worth knowing before anyone proposes voices: **even three
voices already mask each other.** Issue #132 (a designer playtest report, after
a first mix fix in #114): "With just kick + snare + arp — only three voices, not
even a full band — I can barely hear the Arp. That's a small mix and it still
gets buried." And #114's own note: "The Arp's 4800→1500 Hz bandpass sits right
where the hi-hats live."

---

## 9. Smaller cuts that touch run shape, power, or constraint

- **The re-roll** (`512aab7`, issues #147 / #150 / #133). A purchased meta perk
  refreshing a level-up offer mid-run, in two shop ranks (First Reroll 70,
  Second Reroll 400), a save field, a live button and the `R` hotkey. Removal
  also took `openingPickOut`, "which existed only to block rerolling the
  committed opening hire". Issue #147's body in full: "Remove the re-roll
  mechanic from the game fully, and any meta-progression about it." **No stated
  reason.** The nearest thing is #133, closed unimplemented the day before,
  which complains only about the *button* being permanently visible and inert:
  "That's clutter during normal play, and it's misleading."
  **Verdict: unstated.** The only mechanism the game ever had for a player to
  refuse an offer went without a recorded argument.

- **The Opening Loadout** (`06a52ce`, #169) — a shop perk letting a run begin
  with one passive already at tier I. **Rejected on its merits, with the
  reason stated:** "Every run therefore opened from a slightly different board,
  which **made the first few level-ups read as pre-decided rather than
  chosen**." Note the shape of that argument: it is about the *legibility of
  the opening choice*, and it applies to any proposal that pre-seeds a build.

- **The unlock shop and revival** (`a339c61`, #244, 2026-07-24 — three days
  ago). The old career shop sold **content**: eleven offers across three shelves
  gating weapons and passives behind notes, with its header stating "Nothing
  here grants repeatable raw damage, health, or speed." It was replaced by a
  clone of Vampire Survivors' PowerUp screen — nine stats, VS-exact base prices,
  rank caps, and price formula — and **everything is unlocked from run one**.
  Second Wind (revive once at 30% health, 320 notes) went with it: "Death is
  final." **No stated reason for either removal.** VS parity is the evident
  frame but is never given as the reason.
  **Live tension to know about:** pillar 6 in `docs/plan.md:33-37` was not
  rewritten and still reads "Career progress favors expression over stat
  grind… the shop never becomes an uncapped treadmill of permanent damage,
  health, or speed." #247 already flags this ("the Afterhours Shop is a Vampire
  Survivors PowerUp stat-grind clone and sits badly against 'expression over
  stat grind'").

- **Slow, everywhere** (`2628fe9` then `62d4c63`, both 2026-07-24, eleven
  minutes apart). The first removed slow from evolved Chord zones with a design
  reason: "The evolution now trades the base zone's control for reach and
  movement… **Base zones keep their slow.**" The second reversed that and took
  slow out of the base weapon too, with only an implementation reason: "Chord
  was the only consumer of the shared zone-slow channel, so removing slow from
  both base and evolved zones lets the whole plumbing go… Chord now only ticks
  damage." **The game now has no slow mechanic at all.** Together with #168
  (Two Hands stops dragging enemies) and #26 (the auto-dash), the trend is
  consistent: crowd-control and movement verbs have been steadily stripped out,
  mostly without design arguments.

- **The Living Lab** (`4ce112d` #91 → `02beaba` #100). An in-game documentation
  suite (Movement & Space Gym, Enemy Zoo, Instrument Zoo, Systems Museum) that
  lived four days. Reason stated: "At the developer's direction… **It was
  additive tooling and never gated a phase.**" The same commit trimmed the
  rehearsal room to just the chart playground, removing the run-arc preview
  (wide-shallow / narrow-deep / end-of-run mix) and the progression scrub.

- **The check harnesses** (`554a551`, #152) — `systems-check.ts` (5,322 lines),
  `weapon-parity-check.ts` (5,725), `tour-check.ts`, and the parity baseline,
  plus `npm run verify`. "Per the removal brief." Consequence stated: "`check`
  (`tsc --noEmit`) is now the only verification in the repo — **there is no
  runtime testing left.**" Relevant to the map only as a fact about how any new
  system will be validated: by the developer's hands, or not at all.

---

## 10. The three parallel prototypes of 2026-07-07 — the most important section in this document

**This is the material most likely to embarrass a future design session.** On
2026-07-07 the project launched **three independent prototypes against exactly
the problem #247 is chartering a map for.** All three are on unmerged branches
that `git log` on `main` does not show. Their spec documents never existed on
`main` and were never touched by the `803a2c7` docs deletion, so nothing in the
working tree points at them.

The shared problem statement, quoted from
`git show ec365ed:docs/phases/hold-and-drop.md`:

> "One of three parallel, independent prototypes exploring the same problem. …
> **Across a run the player only ever ADDS instruments, so the track's
> complexity is a monotonic ramp — it never breathes.** Real tracks have
> variance: buildups, drops, breakdowns, sections that pull back and come
> roaring back in. **Tuning gain or tier counts only changes how fast the player
> climbs the same ramp.**"

That is #247's premise, written thirteen days earlier and prototyped three
different ways. Between them these branches contain **six iterations, four
recorded playtest rejections with diagnoses, and one recorded gate pass.**

Where to find them:

| Prototype | Branch | Spec (read with `git show <rev>:<path>`) |
|---|---|---|
| Perform the Track (v1, v2 rounds 3–5) | `worktree-agent-a0f197bc39248c1c6`, tip `19d03f8` | `ab49b75:docs/phases/perform-the-track.md`, `…-v2.md` |
| Hold & Drop (v1, v2-B, v2.1) | `prototype-hold-drop`, tip `ec365ed`; backup `backup/prototype-hold-drop-premerge` | `ec365ed:docs/phases/hold-and-drop.md`, `…-v2.md` |
| Hype Layer (v1, v2, v3) | `worktree-agent-ab937d650700e2226`, tip `e773d80` | `e5ba907:docs/phases/hype-layer.md`, `…-v2.md`, `…-v3.md` |

### 10a. Four rejections, one diagnosis

Every recorded rejection across the three prototypes lands on the same fault.
Verbatim:

- **Hype Layer v1** (`e5ba907:docs/phases/hype-layer-v2.md`, "Why v1 was
  rejected"): "**It was a dominant strategy with a fake cost.** Holding the
  CROWD meter at max gave +50% damage / +60% XP against a 'risk' of
  +damage-taken. But in a survivors-like the player is *already* trying not to
  get touched, so the downside was invisible during good play and irrelevant
  during bad play. The optimal line was 'always max'…" and "**The reward was a
  scalar, so it couldn't express music.** Damage/XP multipliers scale a thing;
  they don't change its *shape*. Musical dynamics are structural (which voices,
  which register, density, tension/release), not a volume knob. **Bolting a
  scalar economy onto a structural problem is why 'it doesn't do anything
  meaningful to the music.'**"
- **Perform the Track v1** (`ab49b75:docs/phases/perform-the-track-v2.md:128-139`):
  "**Muting is subtractive only.** A v1 section only decides which slots are
  audible; every surviving voice keeps playing the exact same thing… **It cannot
  sound like a breakdown or a build because those are defined by *what the
  remaining voices play*.**" And: "**The tuned baseline (FULL) is the ceiling.**
  Every non-FULL section is a downgrade, so the only verb is 'voluntarily make
  yourself weaker.' In a power-fantasy genre that fights the grain."
- **Hold & Drop v1** (`ec365ed:docs/phases/hold-and-drop-v2.md`): "**It doesn't
  feel like making a drop.** … Pull-then-toggle produced neither the audio of a
  drop nor the gameplay juice." Plus "Tension is too cheap" (a wall-clock
  timer), "No build-up", and "**Breaks with few instruments.** With only 2 owned
  voices … there is nothing to thin and nothing to re-stack."
- **Hype Layer v2** ("The Conducted Grid" — built, playtested, rejected;
  `fc57fd2`): "v2 (the Conducted Grid) was **rejected on playtest**: the drop
  sounded like the peak because **the system only ever FILTERED one fixed
  pattern louder/quieter — it never changed what the voices PLAY.**" The fuller
  verdict in `e5ba907:docs/phases/hype-layer-v3.md`: "The drop doesn't feel
  satisfying — **it plays similarly to the peak, so there's no difference when
  it drops.** … The meter **starts at peak** — a fresh run with one kick is
  immediately at peak, which felt wrong."

**Four independent rejections, one diagnosis: a run-shape system expressed as a
multiplier, a mute, or a filter over one fixed pattern cannot make the music
breathe.** Anything that proposes dynamics as a scalar on a static chart is
re-proposing something this project has already tried, played, and rejected four
separate times.

### 10b. The second recurring failure: "there is no chill in a horde game"

Two prototypes independently built a meter fed by *how surrounded the player is*,
and both diagnoses came back structurally broken.

- **Hype Layer v3's root cause** (`e5ba907:docs/phases/hype-layer-v3.md`): "v2
  tied arrangement fullness AND tension to one fader, driven by 'how swarmed am
  I.' **In a survivors-like the player is *by design* increasingly swarmed, so
  that signal pins near max and never moves** — recreating the exact static-wall
  problem the feature was meant to solve. … 'Going back to chill feels weird'
  because **there is no chill in a horde game.**"
- **Hold & Drop v2 sub-phase B's root cause**
  (`ec365ed:docs/phases/hold-and-drop-v2.md`, "Why the first pass was sent
  back"): "the danger-priced pool has a real design flaw: it fills fastest when
  you're swarmed, and arming (losing fire) makes you *more* swarmed, so **the
  optimal line is a near-death spiral** — while a well-positioned player who
  stays safe **can never charge a drop at all**. **A toy that is available only
  when you are dying rewards the wrong behavior and reads as random.**"

That same commit records the four hands-on complaints that sent it back: "(1)
closed sockets don't look like they're charging; (2) the meter is illegible — no
read on what tension is or why it fills; (3) the borrowed build voices (a
generic snare/hat/kick/sub) clash with the player's owned instruments; (4) P (a
leftover debug drop) vs Q is confusing and Q is never taught." Complaint (3) is
worth flagging separately: **a drop assembled from voices the player does not own
was heard and rejected.**

### 10c. What each prototype was, at its most developed

**Perform the Track v2, round 5** — four live sections, one held at a time:

| Section | What it plays | Offense | Cost |
|---|---|---|---|
| GROOVE | the whole band | ×1.0 exactly (also the bot's home, which preserved replay determinism) | none |
| BREAK | low end + pad only | ~×0.55 | pulses a knockback + slow shove (the kit's only hard crowd control), decaying full → 20% over ~6 s while held; banks a **contrast** meter that multiplies the next drop |
| CLIMB | thin, hollow, rising | **×1.0 — no damage bonus at all** | contact damage taken ramps **+40% → +80%**, horde chase +15%, magnet off, no CC |
| DROP (Space) | slam | screen-clear + hype window | spends the charge; i-frames from the press |

Round 4 (`ab49b75`) is the interesting one, and its stated reason for
converting CLIMB from a power spike into pure risk: "**CLIMB reads *up*.** It
plays a tier denser *and* grants +35% weapon damage, so it sounds and plays like
a power spike that competes with the drop. **A build is *tension with less
body*, not more.**" Charge was bound to the current CLIMB entry, zeroed on any
section change, with a ~2-bar minimum — which "explicitly killed the
charge-dip-re-enter-instant-drop exploit". An 8-bar ceiling (~17.5 s) ended in a
**brownout**: the riser flatlines, the track sags, "no shockwave, no i-frames —
pure loss of the payoff plus the full exposure already eaten." Sections were
soft-gated on band size: GROOVE ≥1 voice, BREAK ≥2, CLIMB+DROP ≥3.

**Hold & Drop v2.1** — the pivot after the hands rejection. Charge became
**per-armed-voice**, not one global pool: each armed (silenced) voice banks its
own 0..1 at a slow base rate, and **danger only multiplies that rate (up to
~3×) rather than being its source** — explicitly so "a careful, well-positioned
player can *always eventually* load a drop — the toy is never locked out." Per-
voice overflow bleed (~15%/s) meant you could not bank forever. The socket
itself is the gauge. And the drop was **rebuilt from the player's own
instruments**: the roll uses your Hats/Backbeat, the gap strips your whole loop
to a floor, the "one" re-fires your Pulse/Bass in key; a generic kick is
borrowed only for an empty slot. One taught verb (Q). The spec names its own
two gates: "(a) the fire loss during ARM (real DPS you gave up…), and (b)
overflow decay (you cannot bank forever). **Danger is a bonus on top, not the
gate.**"

**Hype Layer v3, "The Tension Cycle"** — the most elaborated design of the
three. Its core line, verbatim: "aggression automatically *winds* a tension bar
to a held READY plateau; the player *times the release* (one tap); the tap
commits a fixed 5-bar build→hold that lands a big half-time DROP you aim by
repositioning during the build — earned, deterministic, mobile-safe."

Its structural moves, each aimed at a named prior failure:
- **Two independent axes that multiply.** MACRO fullness is a function of build
  size and stage minute — *not* threat — and never resets ("my track fills
  out"). MICRO tension is a sawtooth: cruise → wind → drop → settle. This is the
  direct fix for "arrangement fullness and tension on one fader".
- **Winding is automatic, from aggression only** — kill momentum in a rolling
  window, kills inside dense clusters weighted higher, damage taken bleeds it.
  The player can never manually pump the bar: "that was v1's fatal free lever."
- **READY is a plateau, not a trigger**, and it bleeds back below ready after
  ~8 s of passivity so it cannot be banked. Overcharge past ready **scales the
  drop's size only, never its flight time**, and decays in ~3–4 s.
- **Release is one tap that can never fire instantly**: tap → BUILD (4 bars) →
  HOLD (1 bar) → DROP on the downbeat ~5 bars later. "**Aiming a mortar, not a
  pistol**" — the delay is the product, because you reposition during it.
- **The drop is a transformation, not a volume boost**: half-time, emptier,
  lower, heavier — the sub arrives, the kick becomes a few huge thuds, clutter
  drops out. Implemented in a new `src/audio/program.ts` as pure functions of
  `(bar, step, section, tension, seed)`.
- **Pillar 3 safeties**: auto-fire at ~16 bars held at READY, an overcharge
  ceiling auto-fire, and an ambient trickle to ready in ~90 s so a passive
  player still sees the system.

Its own last commit (`e773d80`) partly walks the transformation thesis back:
"The v3 drop stripped to four half-time voices with the clutter removed, so **it
read as a breakdown, not a peak.**" Worth knowing before anyone re-proposes
"the drop is emptier".

### 10d. How all three ended

**All three died the same way: engineering-complete, awaiting the developer's
ear/hands gate, and no verdict was ever recorded.** Perform the Track's STATUS
at its tip reads "Next: the developer's ear/hands gate". Hold & Drop v2.1 is
recorded as "SPEC LOCKED… This is the current build target" and was built and
hardened, with Gate B defined and never run. Hype Layer v3 sub-phase A is
"implemented, awaiting gate A", with B (the combat coupling — i.e. all the
interesting questions) and C "not started". None of the three has a PR. No later
commit, doc, or issue anywhere in the repo records a verdict on any of them.

They stopped because `main` moved: the genre system was deleted on 07-09
(`e427209`), the house-first overhaul landed 07-10 (`967b6bf`), and the
VS-fidelity pass 07-11 (`7d60f71`).

**Verdict, split carefully:**
- The **iterations within each line** (Hype v1 and v2, Perform v1, Perform's
  round-3 BREAK and round-4 CLIMB, Hold & Drop v1 and the global-pool v2-B)
  were **tried and rejected on their merits, with reasons on record**. Those are
  real dead ends.
- The **final form of each line** — Perform round-5, Hold & Drop v2.1, Hype v3
  — was **never judged**. Those are parked, not refuted.
- One thing in this whole area *did* pass a gate: **Hold & Drop v2 sub-phase A,
  the drop event itself** (build → gap → slam), "PASSED (July 7, 2026,
  developer's ear/hands: **'drop feels right'**)", committed as `13b72ca`. The
  drop *moment* is the only piece of this material with a recorded pass.

---

## 11. The mixer: Arsenal / Complexity / Power (two competing branches, 2026-07-10, neither merged)

Two implementations of the same directive, built the same day, on two branches.
Neither reached `main`; neither was ever judged.

### `mixer-system` (`0d34abd`) — spec at `0d34abd:docs/phases/mixer-system.md`

Tier cards deleted. Three resources:

- **Arsenal** — which instruments you own, one per band slot. Hiring permanent.
- **Complexity (C), per instrument, 0–4** — *which pattern it plays*, mapped 1:1
  onto the existing four-tier chart ladders. "more complexity = more notes per
  phrase = more damage events. **C0 = muted** (plays nothing, fires nothing)."
- **Power (P), per instrument, 1–4** — *how strong each note is*, mapped 1:1
  onto the existing `WEAPONS[role][p-1]` stat blocks, plus a per-voice tone
  filter that opens with power ("P1 thin/dark/quiet → P4 the full sound").

"The old tier T is exactly (C=T, P=T). All authored charts and stat blocks are
reused." Every level-up grants exactly 2 points (+1 C, +1 P) into **freely
redistributable pools**, delivered as a toast with no card screen; levels 2, 3,
5, 7, 9, 11, 13 give a hire screen instead. The budget was set to match the old
one exactly — "14 C + 14 P = 28 points = the old 14 tier-picks, so enemy scaling
and the spawn director stand unchanged."

**Tab** opened a mixer panel mid-run (run and clock freeze); the draft committed
at the start of the next bar, with live validation including a **silence rule —
at least one instrument must be playing**.

**Freshness — the anti-camping constraint, and the only mechanism in this
project's history that punishes *not* changing your build mid-run.** "Rule one:
**low complexity never fatigues.** C1–C2 is the sustainable groove. Only hot
patterns (C ≥ 3) wear out."

| Knob | Value |
|---|---|
| Hot threshold | C ≥ 3 |
| Fresh window | 8 hot phrases ≈ 63 s |
| Stale penalty | ×0.6 per-note damage + dulled voicing |
| Rest requirement | 2 full phrases at C ≤ 2 or muted |
| Primed on return | ×1.5 for 4 phrases |

All state advanced on phrase boundaries only, so it stayed deterministic for the
bot. Measured: rotating two staggered peaks ≈ ×1.08 of the no-fatigue baseline,
camping stale sits at ×0.6, and bot medians landed inside the old system's band
(`random 4:31 / deep 4:33 / wide 4:13`, `focus:kick 5:21`).

### `codex/complexity-power-arsenal` (`b93a57f`) — the competing take

Branched off `967b6bf`, spec at `b93a57f:docs/phases/alternative-complexity-power.md`.
Differences worth knowing:

- **Complexity is literal, not a ladder index**: "an instrument allocated C16
  schedules exactly **16** sound-and-weapon triggers in every complete four-bar
  phrase." Charts are *generated* from the authored ladders (rank positions by
  first appearance, take the first C, sort back into time) with an invariant
  check on the event count. Each level adds +4 C to a *global* budget.
- **Power has five levels**, the fifth extending the top stat block.
- **Arsenal capacity keys off lifetime Power earned, never current allocation** —
  1..8 instruments at lifetime Power 1/3/5/7/9/12/15/18 — so "Reallocating Power
  cannot relock a slot."
- Its fatigue analogue, **arrangement pressure**, redlines at 80% of a role's
  authored complexity cap: two redline phrases = **Push, +15% damage**; from the
  third = **Overplayed, −30% damage** and it sounds one Power step thinner
  (trigger count unchanged). Two Rest phrases earn two **Re-entry** phrases at
  +20%; new hires get the same as a **Debut**. And explicitly: "Rest keeps the
  instrument's C/P committed. It is therefore an arrangement and combat timing
  decision, **not a free refund or a rapidly toggled damage exploit.**"

### Why they went

**No stated reason. Neither was ever played to a verdict.** The mixer spec's own
status header is unusually candid: "**Status: experimental side branch, built
July 10, 2026 at the developer's direction. NOT a grilled/locked phase spec —
this replaces the tier-card level-up system as an alternative version, awaiting
the developer's ear/hands verdict.**" The Codex variant says the same: "a
**playable competing version intended for an ear/hands comparison**." The
comparison never happened.

**Verdict: deferred, never judged.** This is the clearest road-not-walked-to-the-
end in the repo, and it is the only serious attempt this project has made at
separating *how often a weapon fires* from *how hard it hits* as two separately
spendable currencies — which is the exact axis #247 names as the structural
cause of its three complaints.

Four open questions were left on record in the mixer spec: the muting refund
policy, back-to-back hire levels 2 and 3 on mobile, where items and effects
re-enter, and the tuning order for primed ×1.5 → ×1.4 against the 8-phrase fresh
window.

---

## 12. Other unmerged branches worth knowing exist

- **`full-game`** (tip `8162cd3`, diverged from `main` at `789ed82` on
  2026-07-03). A one-session fully-autonomous spike that built M3, M4 and M5 on
  top of the M1/M2 base: 10 passive items with a modifier accumulator; **7–8
  genre recipes that "drop"** (assembling a specific instrument recipe triggered
  a genre drop with tempo snap, swing change, power spike and banner, with a
  live "nearest recipe" hint); a boss system; **3 stages** (Club / Warehouse /
  After Hours); **meta progression with coins, a 5-upgrade shop, and a genre
  Collection chase**; and three optional toggleable mechanics (Dash, Combo,
  Elites) behind a menu. Its own STATUS says: "No formal gates were run this
  session (the developer was AFK by design). Everything here is agent-judged and
  open to rework." **No verdict recorded; it became unreachable when `main` took
  a different base two days later.** It is the only branch that ever implemented
  stage selection or a coins-and-collection meta layer.
- **`origin/refactor-2`** (2026-07-10, ten commits, none on `main`). A parallel
  take on the same house-first amputation that `967b6bf` did, plus the only
  work in the repo on **integer XP curves, level gap, and slow late-run XP
  progression** (`6599531`, `131157c`, `88a45d7`). Its spec
  `docs/phases/house-foundation-refactor.md` never existed on `main`. **No
  stated reason for abandonment** — it appears to have lost a race to PR #13,
  but the record does not say so.
- **`origin/codex/dev-campus`** — contains `6487270`, which registers a museum
  room titled "Current, dormant, removed, parked, and experimental system
  status", whose stated purpose is "**Prevent future developers and AI agents
  from resurrecting superseded mechanics or treating experiments as shipped
  systems.**" It has placeholder body text only; the Living Lab that would have
  hosted it was deleted from `main` at `02beaba`. The project tried to build
  this document twice before and did not finish either attempt.

---

## 13. The design docs "left pending the new direction"

`e427209`'s commit body ends: "**Deeper design docs still describe the
multi-genre model and are left pending the new direction.**" PR #12 names them:
`docs/plan.md`, `docs/phases/genres-and-weapons.md`, `docs/phases/the-band.md`.

That pending state was never resolved by a new direction. It was resolved by
**deletion**: `803a2c7` (2026-07-17, PR #102) removed `docs/STATUS.md` (596
lines), all eight `docs/phases/` specs, `docs/research/`, `docs/tools/`, and
`scripts/`, and rewrote `plan.md` to "intent only". Its stated rationale: "Drop
the M1–M5 phase/milestone ceremony and the append-only history book. **Docs now
describe only the present; git holds how it got here.**"

What went out with it, and is only findable via `git show`:

- The **parked decisions list** from the pre-`803a2c7` `plan.md`. Two entries
  are directly on #247's subject and were never resolved:
  - "**Multi-axis weapon growth**: separate density/richness tiers or other
    alternative buff structures beyond the single linear ladder (parked at M2
    grilling; **revisit if ladders feel same-y**)." — the mixer branches are the
    unmerged attempt at exactly this.
  - "**Tempo-changing items** and other progression mechanisms for sound
    variety."
  - Also parked and unresolved: "**Mid-run instrument swapping** (a 'second
    audition'): deliberately absent from the band system; a candidate
    meta-progression unlock later"; "**Audio effects**: baked sound variants
    versus live engine effects, and items that act on sounds… an effect modifies
    an instrument slot and carries a coupled gameplay twin, e.g. echo → a
    delayed extra projectile; **open tension is live effects smearing a composed
    track's mix**"; and "**Boss and enemy sound roles**, duel format, whether a
    boss can silence the player's music for a bar."
- Every gate verdict the project ever recorded.
- The M3 drop spec, the genre spec, and the band spec.

**Practical consequence for anyone working this map: the working tree contains
almost none of this history.** `docs/plan.md` is intent-only, `CONTEXT.md` is a
glossary, and there are three ADRs. Everything in sections 1, 2, 4, 5, 7, 8, 10,
11 and 12 above is reachable only through `git show` against commits or branches
that `git log` on `main` will not surface.

---

## 14. The verdict ledger

### Rejected on their merits — a reason is on the record

| Thing | Where the reason is | The reason, compressed |
|---|---|---|
| Hype Layer v1 (beat-tapped CROWD meter) | `e5ba907:docs/phases/hype-layer-v2.md` | dominant strategy with a fake cost; "the reward was a scalar, so it couldn't express music"; beat-tapping is desktop-only |
| Hype Layer v2 (the Conducted Grid) | `fc57fd2`, `e5ba907:…hype-layer-v3.md` | played and rejected: "it never changed what the voices PLAY"; the meter starts at peak; "there is no chill in a horde game" |
| Perform the Track v1 (mute-based sections) | `ab49b75:…perform-the-track-v2.md:128-139` | muting is subtractive only; the tuned baseline is the ceiling, so the only verb is "make yourself weaker" |
| Perform the Track's round-3 BREAK, round-4 CLIMB | `ab49b75` | "'Hit softer, take less, move faster' is a non-choice when moving already dodges"; "CLIMB reads *up*… A build is tension with less body, not more" |
| Hold & Drop v1, and v2-B's global danger-priced pool | `ec365ed:…hold-and-drop-v2.md` | doesn't feel like a drop; tension too cheap; no build-up; breaks with 2 voices. And the pool "fills fastest when you're swarmed… the optimal line is a near-death spiral" |
| Typed band slots | `docs/adr/0003-flat-build-caps.md` | the 5-cap already does the slots' job; "exclusivity keeps cutting reachable builds for a guarantee the player never asked for" |
| Velocity/variant → damage | `docs/adr/0001-variants-are-sound-only.md` | no single source of truth, invisible to the player, blocks exact headless balance math |
| The Opening Loadout perk | `06a52ce` | "made the first few level-ups read as pre-decided rather than chosen" |
| Unreachable sound variants | `b814cc1` | measured dead content — no chart ever fired them |
| "Same instruments, different patterns" as genre identity | `e427209^:…the-band.md:125-126` | "the shared sample set is a genre-identity ceiling patterns cannot fix" |
| Slow on evolved Chord zones | `2628fe9` | a stated trade: control for reach and movement |

### Deferred, parked, or redirected — no merits judgment on the record

| Thing | What the record says |
|---|---|
| The whole genre system (tempo/swing/powerMul, per-genre kits, per-genre instrument sets, the affinity table) | removed "at the developer's request"; framed as "a 'for now' simplification ahead of a new version". **Its gate had already passed.** |
| Three alternative tracks per genre (18 authored ladder sets) | built and deleted inside one PR by a redirect; no ear-verdict recorded on any of them |
| The full-track / drop direction (M3) | spec locked 07-05, direction dropped 07-06 with the implementation still uncommitted; "Redirect from the developer" |
| Track Lab's own POC verdict | "treated as proven" on one track; two evidence items left open and never closed |
| Perform the Track round-5, Hold & Drop v2.1, Hype Layer v3 | all engineering-complete, all "awaiting the developer's ear/hands gate", no verdict anywhere |
| Both mixer branches (Complexity + Power) | "awaiting the developer's ear/hands verdict… a playable competing version intended for an ear/hands comparison" — which never happened |
| The `full-game` spike (stages, coins, collection, genre-recipe drops) | "No formal gates were run this session… Everything here is agent-judged and open to rework" |
| The tempo ramp | explicitly reserved: "Tempo stays a reserved design lever per `plan.md`; any future tempo drama is a new authored decision" |
| The endless director | "closed unresolved" (#175); destination redrawn to 30 minutes while charting #170 |
| The fixed starting kick | "non-negotiable **for now**" — and it was in fact revived ten days later |
| Mid-run instrument swapping, tempo-changing items, multi-axis weapon growth, sound-effect items with gameplay twins | parked on the old `plan.md` list, never resolved, deleted with the doc |
| Boss-every-3-minutes interrupt | "deferred to protect the gated M2 loop + bot determinism" |
| The Living Lab | "additive tooling and never gated a phase" |

### Cut with no stated reason at all

The Neon Loop, the Pressure Drop, Venues / route gates / per-venue drum palettes,
Headliners (`0c3a8a1` — all four, 3 h 48 m after they shipped); the re-roll
(#147); the unlock shop and the Second Wind revival (`a339c61`); the FX weapon
class (#26, "per the developer's request"); tom (`3aee577`); pluck bass, Rhodes,
acid, shaker (#92); the Bell (#167); the Rail Ram enemy (#119); Two Hands'
inward drag (#168); base-Chord slow (`62d4c63`, only a plumbing reason); the
check harnesses (#152).

Also: **one recorded gate pass in this whole space** — Hold & Drop v2 sub-phase
A, the drop event itself: "PASSED (July 7, 2026, developer's ear/hands: 'drop
feels right')" (`13b72ca`).

---

## Pointers for the triad

Observations only. Where each finding lands against #247's three questions, and
what a design session should read before it writes.

### (a) The shape of a run

1. **The monotonic-ramp problem has been formally attacked three times, in
   parallel, on 2026-07-07.** The problem statement on those branches is #247's
   own thesis, thirteen days earlier: "Across a run the player only ever ADDS
   instruments, so the track's complexity is a monotonic ramp — it never
   breathes. … Tuning gain or tier counts only changes how fast the player
   climbs the same ramp." Read §10 before generating candidates. Six iterations,
   four recorded rejections with diagnoses, and one recorded pass exist there.
2. **Four independent rejections converge on one diagnosis: dynamics expressed
   as a scalar, a mute, or a filter over one fixed pattern do not read as music.**
   Hype v1's "the reward was a scalar, so it couldn't express music", Perform v1's
   "muting is subtractive only", Hype v2's "it never changed what the voices
   PLAY", Hold & Drop v1's "pull-then-toggle produced neither the audio of a drop
   nor the gameplay juice." (§10a)
3. **Two independent findings say a meter fed by "how surrounded am I" is
   structurally broken in this genre:** it pins near max because the horde grows
   by design (Hype v3's root cause), and it produces a near-death spiral that
   locks out a well-positioned player (Hold & Drop's root cause). (§10b)
4. **The only shipped mechanism for a run branching mid-flight was the venue
   route** — a gate every 5 minutes, two options, chosen by walking through, each
   venue one benefit + one danger + its own drum palette. It ran for under four
   hours and no reason for cutting it is on record. (§4)
5. **The 30-minute authored set is a charting decision, not a tested one.** #175,
   the ticket that would have designed what happens past the end, was "closed
   unresolved". #247 holds the schedule fixed anyway, but "there is no endless
   escalation" (pillar 5) has no playtest behind it. (§7)
6. **Tempo is explicitly reserved, not condemned** — "any future tempo drama is a
   new authored decision" — but it collides with pillar 5's constant-tempo set
   and with the fact that raising tempo raises damage throughput. The one
   implementation the project had was +0.2%/minute capped at +8%. (§3)
7. **Track Lab is the only surface where a multi-section arrangement actually
   runs**, and it has capabilities the game engine does not: any number of
   string-keyed voices, per-track BPM, phrase length up to 16 bars, named
   sections switched on a bar boundary, and a sidechain pump. The game engine is
   locked to `BARS_PER_PHRASE = 4` and one tempo. Three boss fights already run
   on it in the shipped game. (§2)
8. **The one recorded pass in this whole space:** the drop *event* — build → gap
   → slam — "drop feels right" (`13b72ca`). Note what passed: a debug-triggered,
   fixed 2-bar build with a guaranteed generic riser and kick. The *moment* is
   evidence-backed; everything wrapped around it (how it is earned, what it
   costs, whose voices play it) is not. (§10d)

### (b) What powering up buys

9. **The seam #247 asks for partly exists already.** `src/game/weapons/levels.ts`
   states "TWO LADDERS, NOT ONE", and `chartStageForLevel` bands eight gameplay
   levels onto four chart stages, so "the sound (and with it trigger density)
   steps at levels 3, 5 and 7 and **the even levels are payload-only**." Half of
   all level-ups already buy power without buying notes. What has never been
   tried is making that step go anywhere but up, or letting the player choose
   which side of the seam a level-up lands on. (§6)
10. **The only serious attempt at a non-scalar power currency is unmerged and
    unjudged: the mixer.** Complexity (which pattern plays — hits per phrase) and
    Power (per-trigger stats and how full the voice sounds) as **two separately
    spendable, freely redistributable pools**, with the budget deliberately
    matched to the old tier budget so enemy scaling did not move. Bot-verified,
    never played. Two different implementations exist. (§11)
11. **The mixer branch also contains the only mechanism in this project's history
    that punishes *not* changing your build mid-run** — freshness: patterns at
    C≥3 go stale after ~8 phrases (×0.6 damage, dulled voicing), 2 phrases of
    rest primes them, re-entry pays ×1.5 for 4 phrases; low complexity never
    fatigues. The Codex variant's "arrangement pressure" is the same idea with
    Push / Overplayed / Rest / Re-entry / Debut states. (§11)
12. **ADR 0001 is the hard boundary on making music mean power.** After it, the
    only channel from music to damage is **trigger count**. Velocity and variant
    are guaranteed worth exactly zero. The ADR says re-adding them "means
    re-litigating this ADR, not just editing a formula", and that the old
    multipliers "have no meaning as a rollback target". (§6)
13. **CLIMB is a worked example of power that buys nothing.** Round 4 of Perform
    the Track deliberately stripped a +35% damage bonus off the build stance
    because "CLIMB reads *up*… A build is tension with less body, not more." A
    stance whose entire payoff is the right to arm something later has been
    designed and built once. (§10c)
14. **The Encore already exists as the "power is final" terminal state** — a
    fixed First Aid / Tip Jar pair once everything is maxed, deliberately so a
    level-up is never dead and no late stat treadmill bolts on
    (`docs/plan.md:103-109`, `CONTEXT.md`). Meanwhile the Afterhours Shop was
    turned into a VS PowerUp stat clone on 2026-07-24 (`a339c61`) without
    rewriting pillar 6, which still forbids exactly that. #247 already flags
    this. (§9)
15. **Per-trigger damage compensation for tempo is built and switched off.**
    `SOUNDSET.powerMul` is the surviving hook; it was 0.9 for House and 0.86 for
    Techno and is `1` today. (§1)

### (c) What constrains a build

16. **The strongest constraint this project ever shipped is the one nobody
    recorded a reason for removing: a genre supplied a partial catalog.** House
    supported 11 roles and dropped the whole Motion slot and the snare; Techno
    supported a different 12. `supportedRoles` was "the single source of truth…
    read by the pick pool, the band rack, and the engine", guarded by a
    build-time playability floor (a beat, a low end, a tick, a melodic voice).
    Choosing a genre chose which build space existed. **That floor guard is still
    in the code** (`src/audio/soundset.ts:57+`) and still enforced at load. (§1)
17. **The genre/role affinity table was only a soft nudge on top of that** — a
    draw-weight multiplier (House clap ×1.5, snare ×0.7; Techno ride ×1.3, reese
    ×1.2), "never a lock — the off-genre member can still appear", and unaffecting
    single-member slots. Do not confuse it with the hard constraint. (§1)
18. **Typed slots were rejected on their merits, but the problem they solved was
    not.** The band spec named it: "role collision (several instruments doing the
    same musical job, e.g. hat + cowbell + arp all filling the fast ticking
    layer)." ADR 0003 knowingly traded "a structural guarantee of separation for
    build freedom" and directs that any bad pairing be fixed "in the mix (kit
    gain, choke groups), not by reintroducing categories" — and PR #157 records
    that the audio consequence was never listened to. (§5)
19. **Cacophony is empirically worse than the cap suggests.** Issue #132, a
    designer playtest: "With just kick + snare + arp — only three voices, not
    even a full band — I can barely hear the Arp." The current cap is five
    weapons, held there on an explicitly musical argument that outranks VS
    parity: "a sixth weapon is a sixth concurrent voice in the mix — the
    build-as-track pillar outranks verbatim parity." (§5, §8)
20. **Exact-match recipes as a constraint were specced in full and never built.**
    "Off-recipe instruments block the drop… no missing types, no extra types",
    with the brick risk banked in the same paragraph and an escape valve parked.
    The spec also states the tension any recipe system inherits: "exactness and
    randomness cannot coexist, because if the instrument set fully determines the
    track there is nothing left to roll." (§2)
21. **Two constraint shapes have working reference implementations that cost
    nothing to re-read:** a spend-it-or-lose-it charge with per-voice overflow
    bleed and an explicit "the toy is never locked out" rule (Hold & Drop v2.1),
    and a committed-flight-time constraint where the delay *is* the product —
    "aiming a mortar, not a pistol" (Hype v3). (§10c)
22. **The catalog has only ever shrunk: 24 → 16 → 14 → 13 → 9 → 8 playable
    instruments.** Two of those cuts are backed by measurement (tom was never
    surfaced in an offer; three sound variants were never fired by any chart);
    the rest are directed. Pillar 4 ("Combinations over volume") is the standing
    argument against re-growing it; #247 explicitly reopens the door. (§8)
23. **The game currently has no slow, no player dash, no crowd-control verbs
    beyond knockback.** Chord's slow went on 2026-07-24 taking the whole shared
    slow channel with it; Two Hands' inward drag went in #168; the riser's
    auto-dash and the ride's freeze went with the FX slot and the 16-instrument
    curation. Almost none of those removals carries a design argument. (§8, §9)
24. **There is a standing argument against pre-seeding a build.** The Opening
    Loadout let a run begin with one passive already owned, and was cut because
    "every run therefore opened from a slightly different board, which made the
    first few level-ups read as pre-decided rather than chosen." Any proposal
    that pre-seeds or biases a build's opening has that argument to answer.
    Note the counterpoint two sections over: runs currently open on a choice of
    three weapon pedestals, and no weapon at all until one is collected. (§9,
    §1)
25. **Nothing in any shipped version has ever taken anything away from a build.**
    Picks have always been permanent; mid-run swapping is parked on a deleted
    list; the re-roll — the only mechanism a player ever had for refusing an
    offer — was deleted without a stated reason. The two designs in the repo's
    history in which a build could get *smaller* are the mixer (freely
    redistributable C/P pools, plus freshness making a hot pattern actively
    worse the longer it runs) and Hold & Drop's ARM (silencing a voice you own,
    at the cost of its fire). Both are unmerged and unjudged. #247's framing —
    "nothing in the design can ever *take something away*" — is accurate about
    `main` and not accurate about the branches.
