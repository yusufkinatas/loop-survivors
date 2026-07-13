# Project Status

Last updated: July 13, 2026

## Latest change (July 13, 2026) — Living Lab: in-game documentation suite

Built the public **Living Lab** on branch
`codex/in-game-lab-suite`, started directly from `main`. It is one
`#lab` mount with an internal hub and one shared real `RunWorld` / `RunView` /
audio context. The four rooms are: **Movement & Space Gym** (real input speed,
camera, and spawn-boundary measurements), **Enemy Zoo** (the exact active-stage
roster derived from starting/wave/event data), **Instrument Zoo** (the exact
active soundset roster, with tier/variation controls and manual
`MusicEngine.preview()` → due trigger → real weapon fire), and **Systems Museum**
(one sound event/two outputs, contact damage + invulnerability, and one-owner
band positions). The practical guide is `docs/tools/living-lab.md`.

At the developer's explicit direction after the initial build, the route access
gate was removed **for now**: `#lab` / `?lab=<room>` work in production as well
as development. At his final UI direction, the homepage's small **living lab**
button sits alongside the other auxiliary rooms inside the collapsed **dev
tools** disclosure below **start**. `VITE_LOOP_LAB_ROOM=<room>` remains the
direct local boot shortcut. Room rosters and stage reference rows come from
canonical game data, not parallel lists. Exact-position enemy display is a thin
adapter over the real constructor, and manual instrument pulses travel through
the normal audio/gameplay coupling. One suite-level trigger listener, one input
stack, and one Pixi application are reused across every room.

Global-state isolation is explicit: entry snapshots the AudioContext state,
clock, every voice's enable/tier/gain, touch input, and auto-move state; room
changes flush pending audio/gameplay triggers and all transient world entities;
exit restores the snapshot and disposes the trigger, keyboard, joystick, view,
and application before the normal game reloads. `npm run check:lab` builds the
production app, then drives every room and manual action in bounded headless
Chrome, compares exact generated registry IDs, exercises every active
instrument/tier/sound variation, fails on
runtime/console errors, verifies the shared snapshot, then takes the real exit
path, requires a clean normal start screen with the Lab entry collapsed, expands
**dev tools**, and reopens the hub through the revealed button.

Verification: `tsc --noEmit` clean; production `vite build` clean (772 modules);
the production browser drive passes and reopens the Lab through the collapsed
homepage disclosure; desktop 1440×900 screenshots of all rooms and 390×844
touch layouts were inspected with no overlap or unreadable controls;
deterministic bot seed 1729 remains byte-for-byte on its reference result (death
173.6 s, level 2, 98 kills, Kick damage 306, peak alive 449). **No developer
phase gate advanced; this is additive tooling and the parity hands/ear gate
remains pending.**

The architecture audit exposed one pre-existing parity discrepancy: the locked
spec and comments describe a shared 1.35-second per-target Kick re-hit lock, but
the live simulation currently remembers hits only within each individual strip;
a fresh beat can hit the same target again. The Museum deliberately does not
claim that rule. This gameplay mismatch was not silently changed as part of the
documentation-suite branch and remains to be resolved before that gate item can
be judged.

## Previous change (July 13, 2026) — FX weapon class removed from the build

At the developer's direction, the **FX band slot and its two weapons (crash =
shockwave, riser = auto-dash) are removed from the player's build/weapons
system**. The band is now **seven slots** (Beat/Snap/Tick/Groove/Low/Color/Hook);
the pick pool offers **14 instruments** (was 16). crash/riser are no longer
supported by the soundset, so they are never offered, never voiced in a run,
and never appear on a pick card. (Layered on top of the diegetic-pickup feature
#25 below; the two changes are orthogonal, `picks.ts` untouched by both.)

Removed: the `fx` slot everywhere in `src/game/band.ts` (type, SLOTS, rosters,
labels) plus the now-dead `barredFromStart`/`startableRoles` helpers (their only
job was barring FX from the starting offer; they had no callers since the
start-weapon-choice system was cut); the crash/riser ladders in
`src/audio/ladders/house.ts` and the whole `src/audio/ladders/shared.ts` file
(only house imported it); the crash/riser blocks in `WEAPONS` and `TIER_LINES`
in `config.ts` (both now `Partial<Record<Role,…>>`, the pattern the soundset
ladders already use) plus their exclusive feel constants (`SHOCK_BAND`,
`KNOCK_S`, `DASH`, `SHAKE.crash`, `FLASH.crash`, the `WeaponConf.knockback`
field); the crash/riser pick-card glyphs in `weaponicons.ts`; and the two
weapons' exclusive mechanics — the whole game **Shock** system
(spawnShock/updateShocks/`Shock`/`world.shocks` in run.ts, its
`shockGfx`/`syncShocks` rendering in view.ts) and the player **auto-dash**
(`player.dashT/dashX/dashY`, the movePlayer surge, the `Digit8` mute key, now
`Digit1..Digit7`). The Kick's own Whip-geometry system and the shared
weapon-shove knockback channel (snare/clap/bass) were verified independent and
are untouched; the boss module has its own separate shock/dash and is untouched.

**Kept (audio config, used elsewhere):** the crash/riser sound synthesis stays
whole — `Role` type entries, `ROLE_META`, `ROLES`, `buildKits`,
`renderCrash`/`renderRiser`, `KIT_COLORS`, and the soundset kit's crash/riser
buffers (`kits/house.ts`, `kits/index.ts`) — because the rehearsal room iterates
the full `ROLES` catalog and the Track Lab tracks (`satisfaction.ts`,
`sahara.ts`) use crash/riser (via Track Lab's own independent `labkits.ts`
synthesis, not the game kit). They are now dormant catalog voices, like any
role the soundset does not build a weapon around: the engine still creates their
(disabled, silent) voices via the total `getChart` stand-in, and they never
enable.

Verification: `tsc --noEmit` + `vite build` clean; headless bot batches
(kiter/random, harvester/deep) run full runs with no crashes and no crash/riser
in the damage share; a direct pick-pool assertion over 5000 rolls across random
build states confirms crash/riser are never offered and every offered role maps
to a valid slot. (Pre-existing, unrelated: `scripts/madforest-check.ts` fails
`STAGE_STARTING_SPAWNS 30 !== 10` on clean HEAD too — a stale assertion after
the "3× enemy spawn" commit #24, not caused by this change.) No developer gate
is attached; this is a scope edit, not a milestone.

## Previous change (July 13, 2026) — Diegetic level-up pickup (replaces the pause menu)

At the developer's direction, the full-screen level-up menu was replaced with an
in-world pickup. On level-up the three rolled offers (`picks.ts`, unchanged) drop
as physical ground items in a triangle around the player at 0/120/240° (radius
`LEVELUP.itemRadius`); every enemy inside `LEVELUP.enemyPushRadius` (further out
than the item ring) is shoved clear; and a one-second cosmetic "moment" fires — a
0.5× slow-mo (a new `momentScale` that COMPOSES with issue #21's dev `timeScale`:
effective clock rate = `timeScale × momentScale`), the weapons ducked on a new
engine `weaponsBus`, a bright level cue, and a screen pulse + ring burst. The
player keeps moving; after one second speed and weapon volume snap back to normal.
Collecting an item is walking onto it — a FIXED `LEVELUP.itemPickupRadius`,
deliberately NOT the gem `pickupRadius`/magnet, so a future pickup-range buff never
reaches it. On pickup the other two vanish and the chosen weapon enters at the next
bar (unchanged `atNextBar`/`atAudioTime` entry, old-tier damage preserved; audio is
never paused now). Each item shows an abstract vector glyph in the weapon's color,
its name, and its level ("1" for a new pick, "2 → 3" for a tier-up). Stacked
level-ups queue one triangle at a time; the build-complete +15 heal fallback is
unchanged.

Seams: `config.ts` `LEVELUP` (all tunables); `run.ts` new `shoveEnemiesOut`
(live-only, purely additive, never called headless); `engine.ts` `weaponsBus`
between the per-voice ducks and master, plus `duckWeapons`/`playLevelCue`;
`weaponicons.ts` (new — 16 glyphs); `view.ts` ground-pick rendering + `levelBurst`;
`game.ts` owns the flow (`momentScale`/`momentT`, `dropGroundPicks`,
`startLevelMoment`, `collectGroundPick`, loop pickup detection, cleanup). The old
`'pick'` state, the DOM pick screen (`hud.ts` `showPick`/`kitCard`/`armKeys`), and
its now-dead CSS were removed.

Determinism preserved: `run.ts` and `config.ts` (the only sim-graph files touched)
changed PURELY ADDITIVELY, so the headless bot and replays are byte-identical — the
entire pickup flow is shell-owned; the bot/replay still resolve every level
instantly via `VirtualConductor`. Verification: `tsc` + `vite build` clean; bot
batch runs unchanged. A four-lens adversarial review (state-machine, audio graph,
rendering, determinism/spec), each finding independently refuted, surfaced **one
real defect** — `shoveEnemiesOut` left knockback-immune enemies (ghost, some
elites, knockbackMul 0) glued to the player through the reward moment — now fixed
by pushing the full deficit regardless of knockback resistance. All other findings
were refuted (the occasional one-bar-late entry is correct musical quantization
given the no-pause design; the coin `GraphicsContext` self-reclaims via Pixi's GC;
the rest unreachable/self-healing). Browser-verified live: the triangle drops with
correct glyphs/names/levels + burst, no console errors. **The walk-to-collect loop
and overall feel await the developer's hands/ear gate** — a backgrounded automation
tab throttles requestAnimationFrame, so sustained live movement could not be driven
headlessly.

## Previous change (July 12, 2026) — Global timeScale (issue #21), dev/playtest tool

Implemented the locked spec in GitHub issue #21: one global `timeScale` knob that
speeds up or slows down everything together (simulation, audio tempo, and world
juice), adjustable live mid-run, modeled on Unity's `Time.timeScale`. This is a
dev/playtest tool (not a player-facing setting), and the reusable speed primitive
future slow-mo / hit-stop effects will sit on.

Seams (as specced): `Clock` (`src/audio/clock.ts`) gained a neutral `rate` field
(default 1) dividing `stepDuration`; the game shell (`src/game/game.ts`) owns the
`timeScale` local (beside `muted`/`paused`/`autoMode`), sets `engine.clock.rate`
on every change, and in the live loop pays out `frameDt × timeScale` worth of
fixed `SIM_DT` steps (the step count scales, never the dt — determinism intact)
with a `timeScale`-scaled-but-bounded per-frame cap; `view.update` is fed
`frameDt × timeScale` so juice scales. Control surface: a slider in the debug row
(min 0.25, max 3.0, step 0.25, default 1.0, live `speed X.XXx` readout) plus `[` /
`]` keys that nudge by 0.25 and drag the handle. Applies to **run + sandbox only**;
`timeScale` snaps back to 1.0 on every new run/sandbox/replay entry; the slider is
inert (disabled) outside run/sandbox. **Replay is untouched** (its 1/2/5/10 speed +
seek use the separate `replaySpeed` mechanism; replay's `clock.rate` is reset to 1).
The headless bot is untouched (never uses the ticker or `engine.clock`).

Engineering verification: `tsc --noEmit` + `vite build` clean; headless bot batch
runs unchanged (determinism intact). A four-dimension adversarial review workflow
(sim-step math, audio seam, control-surface/reset, scope/juice), each finding
independently verified, returned **no defect in the sim math** and confirmed all
juice/HUD/replay/determinism coverage; three low-severity UI-affordance findings
were fixed (slider left enabled after sandbox exit; slider not greyed during a
level-up pick; `Clock.rate ≤ 0` now freezes the grid in place instead of poisoning
the scheduler with `Infinity`, hardening the primitive for future hit-stop callers).
Browser-verified live (dev server): the sim time-compresses/expands exactly
(2x → 2.0×, 0.25x → 0.25×, 3x → 3.0× via the real ticker callback), keys + slider
drive the same value with correct 0.25/3.0 clamping, the value resets 2.75x → 1.0x
across a death→start→new-run flow, the slider greys correctly on start/end/pick/
sandbox-exit, and no console errors. This is a self-contained tooling change, not a
milestone gate; it does not affect the pending Mad Forest parity developer gate below.

## Previous change (July 11, 2026) — Mad Forest parity rework in progress

The developer explicitly authorized a mechanical parity pass focused on
Vampire Survivors' Mad Forest: movement weight, enemy roster/stats/contact,
the first eight minutes of wave events, XP/gems, tighter AoE, a Whip-like Kick,
and a satisfying original enemy vanish. The game's own weapons, audio identity,
and vector visual style remain. The dated spec amendment is in
`docs/phases/overhaul-2026-07.md`; the version-pinned evidence and all
exact-vs-inference labels are in `docs/research/mad-forest-reference.md`.

The rework is being implemented on branch `vs-attempt-codex`. The adopted
eight-minute slice plays source minutes 0–7 and resolves before the 8:00 wave.
The Kick keeps an audible/gameplay strip every 122 BPM beat for Model A, with a
shared 1.35 s per-target re-hit lock to approximate Whip's damage cadence.
Its converted feet-origin body, 100 ms growth, 200 ms lifetime, and delayed
opposite strip now follow the legacy slash timing; enemy bodies use the
legacy frame-width circle formula, including weighted Skeleton/Flower/sweep
variants, with feet-anchored spawn/pursuit converted to their circle centers.
Audio lookahead is frozen on pick screens, and bar-boundary upgrades
apply to the world at heard time so a sound never silently changes damage early.
Boss any-chest odds are preserved as direct project-native upgrade-pick odds;
no chest/evolution UI was imported. **Implementation is complete and
engineering verification is clean. No developer gate has passed; the result
is awaiting the developer's ear/eye/hands.**

## Previous change (July 10, 2026) — the overhaul (branch `overhaul-weapons-enemies-ui`, PR open)

A four-part overhaul at the developer's direction, decisions logged in
`docs/phases/overhaul-2026-07.md`, fully autonomous (never gated mid-build).
**Awaiting the developer's ear/hands gate on the whole branch.**

1. **Catalog cut 24 → 16 instruments (8 slots × 2)** — cowbell, zap, rimshot,
   heartbeat, ride (+freeze system), reese, choir, whistle (+tag system)
   removed entirely. **All passive items and all weapon enhancement effects
   removed** (items.ts, effects.ts, voicefx.ts, the Mods bag, the item strip):
   the pick pool is weapons + tier-ups only. A different enhancement system
   comes later.
2. **Weapons redesigned from scratch**: house pattern ladders rewritten to
   researched conventions (four-on-the-floor law, off-beat bass, Chicago
   backbeat pickups, densifying hats/shaker; swing 0.06 → 0.10), stats retuned
   to a VS-derived ~10 DPS tier-1 anchor (zone tick math folded in), velocity
   now scales damage or size on every weapon, distinct zone/hat silhouettes.
3. **Enemies + spawns rebalanced** around sawtooth pressure: one new kind
   introduced per minute as a telegraphed spike, breathers after events,
   near-flat contact damage (danger = density + HP), front-loaded xpCurve
   (~2 picks/min), finale that overruns any build. Bot-verified: AFK 1:35,
   kiter random 5:12, deep 6:05 / 8% wins; per-weapon floors clear (riser's
   collapsed solo floor is a bot artifact — FX is barred from the start offer).
4. **UI overhaul**: the wide scrollable chart dock replaced by a compact
   per-voice "now playing" overlay (hotkey C); **keys 1–8 toggle audio mute of
   the owning band slot** (audio-only, sim/replays untouched); debug row and
   start-screen lab links behind disclosures; dead CSS deleted; glow calmed.

Engineering verification: `tsc` + `vite build` clean at every commit; bot
batches healthy; adversarial review passes on patterns, weapon code, and UI.
**Not browser-verified** (the Chrome extension was down): the developer should
eyeball start screen, the C overlay, and 1–8 mutes on `npm run dev`.
Flags for the ear/eye gate: acid remains the strongest carry (pull is the
knob); the debug row hidden-by-default deviates from an old gate-B note.

## Previous change (July 9, 2026)

**The genre system was removed.** There is no genre selection or genre logic
anymore: the game boots straight to a start screen and plays one
fixed soundset (the former House voicing, unnamed), default tempo **120 BPM**.
Every run opens on the kick (no starting-instrument choice, non-negotiable for now).
Techno is gone entirely. Nothing in the game UI names a genre or "House". This is
a "for now" simplification ahead of a new version — the soundset content (kit,
ladders, samples) is kept. See the History entry below for the full teardown.

## Current phase

**July 11 parity rework — explicitly authorized, implementation complete,
awaiting a dedicated developer hands gate.** This is an addendum to the July 10
overhaul, not a claim that the older band B+C gate passed. The historical band
work and ledger below are retained for context, but they are not the current
next action after the catalog cut and parity directive. The Living Lab audit has
since identified the shared Kick re-hit lock as one known implementation/spec
mismatch; no gate credit is attached to it.

## What was built (July 6)

- **Full tracks dropped from the game.** The drop / destination-song mechanic is gone; the game keeps the emergent build→music model (Model A, the dividing rule). The Track Lab is kept as a standalone **Experimentation room** (`#tracklab`, start-screen link), unchanged and outside the game loop.
- **Twelve-weapon soundset (was six).** Added clap (melee slash cone / Whip), tom (boomerang / Cross), cowbell (ricochet / Runetracer), arp (orbiters / King Bible), zap (random lightning strikes / Lightning Ring), crash (expanding shockwave + knockback). Each has a distinct gameplay archetype, a synthesized kit (research-informed), a per-tier stat block, a pick-card line, and a projectile/fx silhouette.
- **Genres as characters.** Six genres — Lo-Fi (84 BPM, swung), House (124), Synthwave (100), Hip-Hop (140, halftime trap), Drum & Bass (174), Techno (130). Each supplies its own tempo, swing, and a four-tier pattern ladder for all twelve weapons via a compact groove DSL (`src/audio/groove.ts`, `src/audio/genres.ts`). Same tools, different tracks. Per-genre `powerMul` compensates fast genres' higher trigger rate.
- **Start flow.** Pick a genre (character), then a starting weapon. Sandbox gains a live genre switcher. `?replay=…&genre=…` supported. Chart store, engine (`setGenre`), clock (swing), and the autoplay bot (`--genre`) are all genre-aware; the coherence skeleton is enforced on every genre's charts at load.

## Verification (July 6)

- `tsc --noEmit` clean; `vite build` succeeds (746 modules).
- Headless bot smoke across all six genres (random policy, all twelve weapons exercised): every genre loads and plays a full run with no crashes; new weapons carry real damage share; survival spread 3:13–6:35 for random builds (healthy floors, none broken).
- Chrome: genre-select and weapon-select screens render; a live Hip-Hop run confirms bpm 140 / swing 0.1 / powerMul 0.8 applied; all twelve weapons' render paths (clap arc, zap bolt, crash shockwave, arp orbiters, tom boomerangs, cowbell diamonds) draw with zero console errors; rehearsal room loads all twelve voices; the Experimentation room (`#tracklab`) plays.
- **Gate: the developer's ear and hands** — does each genre sound like itself and good, do the twelve weapons feel distinct muted, is a genre worth replaying as a character.

## Historical gate ledger (the band)

This ledger records the pre-overhaul band phase. It does not supersede the
current July 11 parity gate.

| Gate | Status |
|---|---|
| Sub-phase A: a run built as a band sounds cleaner at full size and feels like assembling a character | **passed** |
| Sub-phase B: the first six damage hires sound like themselves across genres; each slot's choice is a real fork | **awaiting developer** (built + engineering-verified; judged with C) |
| Sub-phase C: the utility weapons feel worth a slot; nothing sounds cheap | **awaiting developer** (built + engineering-verified) |
| Verdict: does capping the build into a band keep a full build sounding like a track while making every pick feel like hiring a character | not started |

Gate A also implicitly co-judged the July 6 genres-and-weapons material it stacked on (six genres as characters, twelve weapons, items, effects, VS enemies, UI redesign); that work is now **passed** by the same playtest.

## Next action

Resolve or explicitly disposition the shared Kick re-hit-lock mismatch noted
above, then run the manual eight-minute playtest and sandbox for the actual gate.
TypeScript, the production build, deterministic bot smoke/batches, and browser
visual checks are clean. The developer then judges:

- whether manual movement, collision, and contact danger have the first-level
  Vampire Survivors weight;
- whether minutes 0–7 produce the right density, breathers, sweeps, flower
  enclosure, elites, XP, and pick cadence;
- whether Kick's facing strips, opposite-side follow-up, damage, shared
  per-target lock (after the known mismatch is resolved), and small footprint
  feel like the Whip despite the Model A compromise;
- whether every other AoE is disciplined on the new scale; and
- whether enemy/elite reads and the original vanish effect make kills clear
  and satisfying.

A pass or fail must be recorded here explicitly. Until then, this rework is
**awaiting developer**, regardless of bot or browser results.

## Side branch: per-genre sound (`audio-refresh`)

A parallel, additive branch (not a phase gate). **Redirected July 7, 2026** away from "pick the best of three tracks per genre by ear" toward **each genre owning its own sound**. Reverses the locked `plan.md:52` model (shared soundset, per-genre patterns) at the developer's explicit direction. The three-pattern-alternatives work (`src/audio/variant.ts`, `src/audio/variants/*.ts`) was removed.

New model — a genre now has:
- **Its own voicing** of the soundset. A Lo-Fi kick and a Drum & Bass kick are different sounds, not the same sound played differently. `src/audio/kits/<genre>.ts` builds each genre's kit (via the shared primitives + `makeKit`/`ROLE_META` in `kits.ts`); `kits/index.ts` is the cached registry; `engine.setGenre` swaps every voice's buffers to the active genre's kit (async, click-free). Samples may be downloaded where synthesis falls short (logged in `public/samples/<genre>/CREDITS.md`, licensing to clear before ship).
- **Its own instrument set.** A genre supports exactly the roles it supplies a ladder for; `genres.ts supportedRoles` is the single source of truth, read by the pick pool (`picks.ts`), the band rack (`hud.ts`, dropped slots shown unavailable), and the engine (unsupported voices never enable). Genres may drop whole band slots, subject to a build-time **playability floor** (a beat, a low end, a tick, a melodic voice).
- **One track.** A single hand-picked four-tier ladder per supported role — no alternatives. The sandbox track-switcher is gone; the sandbox now shows an **"optimized for"** readout of the genre's instrument set and keeps the **▶ play full band** button (assembling only the genre's supported slots).

**Real drum samples (the identity layer).** Synthesized drums from one engine converge on a shared character (the first pass sounded too alike between genres). Signature UNPITCHED drums are now real one-shots from the freely-distributed TidalCycles Dirt-Samples set — 909 for house/techno, 808 for hiphop, LinnDrum for synthwave, distorted break for dnb, warm for lofi — overlaid onto the synth kit in `kits/index.ts` (`SAMPLE_OVERLAY` + `loadSample`), so a role whose files load is voiced by the sample and everything else stays synthesized (melodic/bass), with graceful fallback to synth if a file fails.

**The fix lives in the asset, not the game (ffmpeg pipeline).** `scripts/build-samples.mjs` downloads each raw sample and runs an **ffmpeg** pass that makes the file correct once: strip leading/trailing silence, cap length per role + fade the tail, peak-normalize to a per-role target (so the kit is balanced ON DISK), force mono/44.1k/16-bit. The per-role numbers live in that script's `PROC` table (build tooling), NOT in game code. Consequently the runtime `loadSample` is dumb — **fetch + decode only, no trimming or leveling in code**. The script also writes `public/samples/<genre>/CREDITS.md` (source+license, verify before ship) and a health report at `public/samples/health-report.md` (currently **0 flags** on the processed assets). Re-run with `node scripts/build-samples.mjs` after any manifest/PROC change.

**Sound health-check screen (`#soundcheck`) — REMOVED July 7, 2026.** This was a developer surface listing every genre × voice with play buttons, health badges, and pass/flag export. It (the `src/soundcheck/` page, its start-screen button, CSS, and the `sampleFilesFor`/`sampleDir` helpers and orphaned `*.raw.wav` assets it alone used) was deleted at the developer's request. The variant A/B system it shared with the sandbox (`variantsFor`/`getGenreVariant`/`setGenreVariant`/`sampledRoles`) stays, driven from the sandbox only.

**Delivery + verification.** Stage 1 (skeleton, behavior-neutral refactor) → Stage 2 (per-genre synth voicings + one authored track each, via an ultracode workflow) → real drum samples + ffmpeg pipeline + health check. Verified at each step: `tsc` + `vite build` clean; headless bot across all six genres (no crashes/NaN); browser render of every genre kit (all voices non-silent, no NaN, no console errors; drums confirmed distinct — lofi kick 257ms vs hiphop 88ms vs techno 108ms, all peak-normalized). Everything is ONE commit on `audio-refresh` (`06b34e9` at time of writing), pushed to origin.

### Every genre now has a chosen sampled kit (July 7, later) — DONE

All six genres are voiced by a real sampled drum/bass kit. House adopted Wave Point "Tight Tech"; the developer then auditioned prototypes for the other five and **picked variant A for every one**, each promoted into its shipped voicing (mirroring House's `build-house-kit.mjs` finalize):

- **lofi** → itslucid Tape Kit (kick/kick_soft/snare/rimshot/hat; shaker stays synth)
- **synthwave** → Clean 808 (TR-808 drums + A1 Jupiter/FM bass, tune 0)
- **hiphop** → MusicRadar Trap (full trap drums + A1 808 bass, tune 0)
- **dnb** → MusicRadar 170 Kit A (break kit + C2 bass, tune −3)
- **techno** → MusicRadar Digital (digital drum core + C2 bass, tune −3)

Each genre's chosen kit is built by `scripts/build-<genre>-kit.mjs` straight into `public/samples/<genre>/` (corrected `.wav` + verbatim `.raw.wav`, 0 health flags), listed in `kits/index.ts` `SAMPLE_OVERLAY`/`SAMPLE_TUNE`. The prototype/selector system is retired for these genres (their `protos/<genre>.ts` manifests are `{ variants: [] }`), so no selector shows — exactly House's end state. Licensing per genre in `public/samples/<genre>/CREDITS.md` (verify before commercial ship; the lofi packs have no explicit license file, flagged).

The generalized variant plumbing (`setGenreVariant`/`variantsFor`/`sampledRoles`/`sampleDir`, the `#soundcheck` dropdown, the sandbox "kit prototype" row) stays in place, dormant, ready to reuse for any future kit audition. The sandbox loadout is now grouped by band slot (rack order) with a `★ custom` badge on sample-backed voices. The same dev-only `★ custom` badge (driven by `sampledRoles(genre)`) also shows on the **weapon-select screen** and on **level-up pick cards**, so the genre's real sampled voices are visible at every offer.

**Enemy roster: spitter removed.** The projectile-firing enemy (spitter — kited at range and fired `EnemyShot`s at the player) was removed entirely at the developer's request: the `EnemyKind`, its config/band/`SPITTER` constants, spawn-mix weights, kite-and-fire AI, the `Enemy.fireT` field, and the whole `EnemyShot` system it solely owned (world array, `updateEnemyShots`, view rendering + `makeEnemyShotGfx`, bot mover shot-avoidance) are gone. The roster is now eight kinds (swarmer, tank, darter, splitter, charger, circler, shielded, elite); spawn-mix weights are relative so the rest reweight automatically. Verified: `tsc` + `vite build` clean, headless bot batch runs full runs with no crashes.

Verified: `tsc --noEmit` + `vite build` clean; every `SAMPLE_OVERLAY` file base resolves to a real corrected `.wav`; no prototype folders remain.

#### The original prototype build (superseded by the finalize above)

House's finalize process was generalized to all genres, and the other five got prototypes built from downloaded sound packs (`/Users/yusufeminkinatas/Desktop/soundpacks/<pack>`) for the developer's A/B pick (now made — variant A everywhere).

- **Generalized variant plumbing** (`src/audio/kits/index.ts`): `setGenreVariant`/`getGenreVariant`/`variantsFor`/`sampledRoles`/`sampleDir`, localStorage-persisted per genre, cache-invalidating so `engine.setGenre` re-renders the chosen voicing live. Under a prototype ONLY that prototype's roles are sample-backed (loaded from `public/samples/<genre>/<variant>/`); every other role falls back to synth. Each genre declares its prototypes in its own file `src/audio/kits/protos/<genre>.ts` (a `ProtoManifest`, see `protos/types.ts`) gathered by `protos/index.ts` — conflict-free authoring.
- **Selectors:** a per-genre dropdown in `#soundcheck` (reloads to the chosen voicing) and an in-arena "kit prototype" button row in the sandbox (swaps live, with the `raw` A/B still available).
- **Sandbox upgrades (developer request):** the loadout list is grouped by band slot in the top-of-screen rack order (Beat/Snap/Tick/Groove/FX/Low/Color/Hook) with slot headers, and a `★ custom` badge marks every voice that is sample-backed for the active genre + prototype (updates on genre/prototype switch).
- **Prototypes built** (per-genre sub-agents, one per genre, each in its own namespace — `scripts/build-<genre>-protos.mjs` + `public/samples/<genre>/<variant>/` + manifest; ffmpeg pipeline copied from `build-house-kit.mjs`; 0 health flags across all): **lofi** 3 (A itslucid Tape, B MyLofi Bedroom, C LoFi Pads Room — kick/snare/rimshot/hat, shaker stays synth), **synthwave** 2 (A Clean 808, B Reimagined — +pitched bass, tune 0), **hiphop** 2 (A MusicRadar Trap, B TriSamples 808 Trapstep — full drum set +808 bass, tune 0), **dnb** 3 (A 170 Kit A, B 170 Kit B, C 175 Two-Step — +pitched bass, tune −3), **techno** 2 (A MusicRadar Digital, B Analogue Machines — +pitched bass, tune −3). Licensing recorded per genre in `public/samples/<genre>/CREDITS.md` (verify before commercial ship; a couple of lo-fi packs have no explicit license file, flagged there).
- **Verified:** `tsc --noEmit` + `vite build` clean; every manifest fileBase resolves to a real corrected `.wav`; behavior-neutral for `house` (no prototypes). NOT yet auditioned in-browser (the developer's ear is the gate) and NOT committed.
- **Next:** developer opens `#soundcheck` / sandbox, A/Bs each genre's prototypes, picks one per genre. Then per genre: promote the pick to the shipped kit (mirror commit `68c0169` — fold the chosen variant into `public/samples/<genre>/` + `SAMPLE_OVERLAY`, delete the losing prototype folders, empty that genre's manifest so its selector disappears). Genres with no clear winner can keep their `original` synth voicing.

### Current state & how to continue (for the next agent)

**Done and committed/pushed.** The architecture, per-genre voicings, one track each, real ffmpeg-corrected drum samples, the health analyzer, and the `#soundcheck` screen are all in the single `audio-refresh` commit.

**The next step is the developer's ear pass (the real gate).** The developer auditions every genre × voice (via the sandbox / a live run) and reports what sounds off. Then:
- **A flagged DRUM** (kick/snare/clap/hat/rimshot/shaker/ride) is a FILE fix: adjust that file's entry in `scripts/build-samples.mjs` (`MANIFEST` source swap, or `PROC` cap/level) or add an ffmpeg EQ op (e.g. `highpass=f=45` for boom), then `node scripts/build-samples.mjs`. No game code changes.
- **A flagged SYNTH voice** (bass/chord/rhodes/lead/bell/reese/acid/…) is a code fix: edit the synthesis params in `src/audio/kits/<genre>.ts`. (If synth voices need frequent fixes, consider "Option 2": pre-render synth voices to WAV assets at build time so every voice is a file — a larger refactor, not yet done. Option 1 = samples-as-files-only is what shipped.)
- After fixes: re-run health analyzer, `tsc` + `vite build`, browser render check, and **amend** the single commit (force-with-lease to push).

**Key files:** `src/audio/kits.ts` (primitives, `ROLE_META`, `makeKit`, `loadSample`), `src/audio/kits/index.ts` (registry + `SAMPLE_OVERLAY`), `src/audio/kits/<genre>.ts` (synth voicings), `src/audio/ladders/<genre>.ts` (the one track each) + `ladders/shared.ts`, `src/audio/genres.ts` (thin assembler + `supportedRoles` + guards), `src/audio/engine.ts` (`setGenre` swap), `scripts/build-samples.mjs` (download + ffmpeg + health report).

## History

- July 9, 2026 — **Genre system removed entirely** at the developer's request; techno gone, House sound kept but unnamed, default tempo dropped 124 → **120 BPM**. There is no genre selection or genre logic anymore. `src/audio/genres.ts` was replaced by `src/audio/soundset.ts` — a single `SOUNDSET` (bpm/swing/powerMul + the one ladder set) with `supportedRoles()`/`soundsetSupports()` and the build-time playability-floor guard; `GenreId`/`Genre`/`GENRES`/`GENRE_BY_ID`/`DEFAULT_GENRE` are gone. `chartstore.ts` dropped its per-genre keying and `activeGenre`/`setActiveGenre`/`activeGenreBpm` (charts key on `role.tier` now); `engine.ts` lost `setGenre`/`applyGenreKit` and instead applies the one soundset kit once in its constructor and sets clock bpm/swing from `SOUNDSET`; `kits/index.ts` collapsed `kitForGenre`+the per-genre BUILDERS/overlay/variant-prototype machinery into a single `buildSoundsetKit`/`sampledRoles()` (the `kits/protos/` dir, `variantsFor`/`get`/`setGenreVariant` deleted). `band.ts` dropped the genre-affinity table and `genreRoleWeight`; `supportedRoster`/`supportedSlots` no longer take a genre. `picks.ts` `rollOffers`/`buildPickPool` no longer take `genreId` (uniform weapon weights + the early drum nudge kept). UI: the start screen's genre grid is gone (boots straight to instrument select), the HUD genre header + `hud.setGenre` are gone, and the sandbox lost its genre switcher and kit-prototype selector (keeps a static "instruments" readout + full-band + loadout). Bot: `--genre` CLI flag, `SimSpec.genre`/`RunRecord.genre`, and the `?genre=` replay param all removed. Deleted: `kits/techno.ts`, `ladders/techno.ts`, `kits/protos/*`, `scripts/build-techno-kit.mjs`, `public/samples/techno/`; the techno MANIFEST entry and health-report section. Genre-referencing comments across `kits.ts`/`charts.ts`/`groove.ts`/`run.ts`/`config.ts`/`ladders/*` reworded. The Track Lab (`#tracklab`) is untouched — its `genre` field is free-text track metadata, independent of the removed system. Verified: `tsc --noEmit` + `vite build` clean (770 modules, soundset floor guard passes); headless bot smoke across random/deep/focus:kick runs full runs with no crashes and distributed damage share; Chrome end-to-end (boots to instrument select with no genre/House text, live run at bpm 120 / powerMul 0.9 / 24 engine voices, band rack correctly dims the dropped Motion slot, sandbox full-band assembles the 7 supported slots, zero console errors). **NOTE:** the deeper design docs (`docs/plan.md`, `docs/phases/genres-and-weapons.md`, `docs/phases/the-band.md`) still describe the multi-genre model and are now out of date; they were left as-is pending the "new version" direction.
- July 8, 2026 — **Auto-move modes added** (developer request), uncommitted on `main`. Two opt-in movement modes chosen on the start screen take the movement verb away from the player: **Kiter** (survival first, flees the horde) and **Greedy** (survives but detours for XP / faster level-ups). Both reuse the proven, deterministic bot movers (`src/bot/movers.ts`): Kiter → `kiter`, Greedy → the gem-hungry `harvester`, wired through `RunWorld`'s existing `control` seam so there is one movement policy shared by bot and player. A shared `autoMove` flag (`src/game/input.ts`) suppresses the touch joystick (`joystick.ts`) so no stick summons on mobile, and the keyboard/touch axis is simply not read. Start screen gains a "Movement" segmented selector (Manual default / Auto · Kiter / Auto · Greedy) with a one-line hint (`hud.ts`, `style.css`); `startRun` threads the mode. The control seam reads a live `setAutoMode`/`playerControl` state, so the mode can also be **toggled/cycled in-game** via a debug-row button + hotkey (**B**), sitting next to the invincibility toggle and cycling Manual → Kiter → Greedy → Manual (the button label shows the active mode). Both the run and the sandbox route through it. Verified: `tsc --noEmit` + `vite build` clean; in Chrome, Greedy holds at spawn while enemies are on the far ring then flees once they close (643 px of travel, zero input), Manual stays put under 30 closing enemies (wires `input.axis()`, not a mover); the in-game toggle switches control live (manual 0 px → kiter fled 864 px → back to manual 0 px), the B hotkey cycles the same, label updates correctly, no console errors.
- July 8, 2026 — **Synthwave genre removed fully** at the developer's request. `GenreId` narrowed to `'house' | 'techno'`; two genres now ship. Deleted its dedicated code (`src/audio/ladders/synthwave.ts`, `src/audio/kits/synthwave.ts`, `src/audio/kits/protos/synthwave.ts`, `scripts/build-synthwave-kit.mjs`), its sample folder (`public/samples/synthwave/`), and every reference (the `SYNTHWAVE` genre metadata + `GENRES` entry in `genres.ts`, `BUILDERS`/`SAMPLE_OVERLAY` in `kits/index.ts`, `PROTOS` in `kits/protos/index.ts`, the affinity row in `band.ts`, the `synthwave` MANIFEST entry in `scripts/build-samples.mjs`, the synthwave section in `public/samples/health-report.md`). Descriptive comments naming Synthwave (genres.ts production-practice note, kits/index.ts LinnDrum overlay note, SAMPLE_TUNE A1-root note) reworded to the surviving genres. `tsc --noEmit` clean; `vite build` clean (chart/floor guard passes); headless bot smoke on both genres runs full runs with no crashes (house random, techno random); an unknown `--genre synthwave` arg falls back to the default (house) at every call site, no crash. Docs updated (`plan.md`, `genres-and-weapons.md`).
- July 8, 2026 — **Lo-Fi genre removed fully** at the developer's request. `GenreId` narrowed to `'house' | 'synthwave' | 'techno'`; three genres now ship. Deleted its dedicated code (`src/audio/ladders/lofi.ts`, `src/audio/kits/lofi.ts`, `src/audio/kits/protos/lofi.ts`, `scripts/build-lofi-kit.mjs`), its sample folder (`public/samples/lofi/`), and every reference (the `LOFI` genre metadata + `GENRES` entry in `genres.ts`, `BUILDERS`/`SAMPLE_OVERLAY` in `kits/index.ts`, `PROTOS` in `kits/protos/index.ts`, the affinity row in `band.ts`, the `lofi` MANIFEST entry in `scripts/build-samples.mjs`, the lofi section in `public/samples/health-report.md`). Descriptive comments naming Lo-Fi (clock swing example, techno/kits.ts "lo-fi keys", kits/index.ts header) reworded to surviving genres. `tsc --noEmit` clean; `vite build` clean (chart/floor guard passes); headless bot smoke on all three genres runs full runs with no crashes (synthwave focus:lead 5:34 median / lv 12.5, house random 5:54 / lv 9.3, techno loads and plays). Docs updated (`plan.md`, `genres-and-weapons.md`, `the-band.md`).
- July 7, 2026 — **Sound health-check room (`#soundcheck`) removed fully** at the developer's request, as a separate commit after the genre removal. Deleted `src/soundcheck/page.ts` (and the dir), the `#soundcheck` branch + dynamic import in `main.ts`, the "sound health check" start-screen button in `hud.ts`, all `.soundcheck`/`.sc-*` CSS in `style.css`, the now-dead `sampleFilesFor`/`sampleDir` exports in `kits/index.ts` (used only by the screen), and the 31 orphaned `public/samples/*/*.raw.wav` audition assets (their sole runtime consumer was the screen; the build scripts still keep a raw copy as the ffmpeg input, comments reworded off `#soundcheck`). The shared variant A/B plumbing (`variantsFor`/`get`/`setGenreVariant`/`sampledRoles`) stays — the sandbox still uses it. `tsc` + `vite build` clean.
- July 7, 2026 — **Hip-Hop and Drum & Bass genres removed fully** at the developer's request. `GenreId` narrowed to `'lofi' | 'house' | 'synthwave' | 'techno'`; four genres now ship. Deleted their dedicated code (`src/audio/ladders/{hiphop,dnb}.ts`, `src/audio/kits/{hiphop,dnb}.ts`, `src/audio/kits/protos/{hiphop,dnb}.ts`, `scripts/build-{hiphop,dnb}-kit.mjs`), their real sample folders (`public/samples/{hiphop,dnb}/` — WAVs, CREDITS, health reports), and every reference (genre metadata + `GENRES` in `genres.ts`, `BUILDERS`/`SAMPLE_OVERLAY`/`SAMPLE_TUNE` in `kits/index.ts`, `PROTOS` in `kits/protos/index.ts`, the affinity rows in `band.ts`, the two entries in `scripts/build-samples.mjs`, the two sections in `public/samples/health-report.md`). Kit/techno comments that named the two genres reworded (reese/tom/cowbell instruments stay — still used by the remaining genres). `tsc --noEmit` clean; `vite build` clean (chart guard passes). Docs updated (`plan.md`, `genres-and-weapons.md`).
- July 7, 2026 (`audio-refresh`) — **Spitter enemy removed** at the developer's request: the only projectile-firing enemy is gone, and the `EnemyShot` system it solely owned with it (kind/config/AI/`fireT`/world array/`updateEnemyShots`/view render/bot avoidance). Roster now eight kinds. `tsc` + `vite build` clean; headless bot batch runs full runs with no crashes.
- July 7, 2026 (`audio-refresh`) — **`★ custom` dev badge extended** from the sandbox loadout to the **weapon-select screen** and **level-up pick cards** (same `sampledRoles(genre)` source), so the genre's real sampled voices are marked at every weapon offer.
- July 7, 2026 (`audio-refresh`) — **All six genres now ship a chosen sampled kit.** House adopted Wave Point "Tight Tech"; prototypes were built for the other five from downloaded packs, auditioned in-game via a generalized variant selector (`#soundcheck` dropdown + sandbox "kit prototype" row), and the developer **picked variant A for every genre**, each promoted into its shipped voicing (`build-<genre>-kit.mjs` → `public/samples/<genre>/`, wired into `SAMPLE_OVERLAY`/`SAMPLE_TUNE`; prototype folders removed, `protos/<genre>.ts` manifests emptied). The variant plumbing stays dormant for future auditions. Sandbox loadout regrouped by band slot. See the side-branch section above.
- July 7, 2026 — **Band sub-phase C implemented** (the last six hires + the two utility systems), uncommitted on `main`, at the developer's instruction to skip gate B and judge B+C together. Six new roles added to the closed `Role` union with synthesized kits (`kits.ts`): **ride** (bright metallic ring), **riser** (reversed-cymbal swell), **reese** (growling detuned monster bass), **choir** (formant "aah" pad), **bell** (inharmonic music-box), **whistle** (pure sine with an LFO vibrato). Gameplay (`run.ts`): **ride = the freeze weapon** (a radar beam rotating a golden-angle step per trigger freezes only the wedge it crosses via a new `Enemy.frozenT`, so a fast Hats cadence never permafreezes the screen); **riser = the auto-dash** (its release grants a short player movement surge via new `player.dashT/dashX/dashY`); **reese** = a grinding slow-zone on the nearest pack; **choir** = a long-lived pulsing zone; **bell** = a straight note that shatters into radial shard projectiles on first hit (`Projectile.shatter/shard`); **whistle** = tags the nearest enemy (new `WhistleTag` list + `updateTags`) that pops for a heavy delayed burst, with a token pop-at-player fallback when nothing is in range. Slot rosters filled to the full 24-instrument catalog (`band.ts`), genre affinities added (DnB→reese, synthwave→bell, techno→ride, …). `config.ts`: per-tier stats, capability tags, tier lines, and new constants (RIDE freeze/wedge/step, DASH surge, BELL shards, WHISTLE pop). `view.ts`: icy frozen tint, a bell note/shard shape, a whistle reticle that rides the doomed enemy and tightens toward the pop. Charts: a shared `RISER` FX ladder plus per-genre ride/reese/choir/bell/whistle ladders (5 × 6 genres × 4 tiers = 120), authored by a parallel per-genre workflow (author→adversarial-critique) respecting the note set and genre discipline (DnB even-step, techno short melody, lo-fi sparse), then inserted programmatically. Engine kick-ducks-bass sidechain extended to every Bass-slot sub (bass/reese/pluck), per design rule 1. Verified: `tsc` + `vite build` clean (766 modules, chart guard passes); headless bot smoke across all six genres (no crashes/NaN, every new damage weapon carries real share — reese 61–68%, choir 67%, bell 17–29%, whistle 14–23%; ride/riser are utility, token-only); a three-lens adversarial code review (determinism, Web Audio, spec/chart) whose five confirmed findings were all resolved (whistle Model-A fallback, ride angle wrap, bell dead tags, kick-ducks-all-sub-bass) except one pre-existing B-scope nit left flagged; Chrome end-to-end (start→genre→weapon select with the full slot-badged catalog and riser correctly barred from start; a live DnB Reese run rendering the grind zones; sandbox force-assembly of all six exercising freeze/dash/tags/shatter/zones with zero console errors). Awaiting the combined gate B+C.
- July 3, 2026 — Master plan compiled (`docs/plan.md`).
- July 3, 2026 — M1 grilling session held; three plan inconsistencies fixed (dividing rule reworded, tempo-damage coupling acknowledged, M1 pick scope settled); M1 spec locked (`docs/phases/m1-demo.md`); document structure and agent process established.
- July 3, 2026 — Sub-phase A implemented on branch `m1-claude`: repo scaffold, lookahead scheduler, six synthesized placeholder kits, one chart per kit, rehearsal room (voice toggles, progression scrub, per-voice volume, sample audition, hotkeys), master limiter, `window.loop` dev console handle. Verified end-to-end in Chrome. Awaiting gate A.
- July 3, 2026 — Sample sets added: 22 CC0 samples downloaded from the Sonic Pi library, organized as "808" / "Machine" / "Electro" sets with one-click switching in the rehearsal room, pitched samples retuned to the A root (measured, tune values in `src/audio/samplesets.ts`). All three sets verified audible in Chrome.
- July 3, 2026 — Gate A feedback: Electro bass tail stacked into mud; bass made a choked monophonic kit. **Gate A passed** by the developer. Sub-phase B begins.
- July 3, 2026 — Sub-phase B implemented: PixiJS greybox arena, six weapon archetypes fired by engine triggers, swarmer/tank spawn script, spatial hash, XP/level-up picks, end screens, debug hotkeys, clock pause/resume for picks. All weapon kill paths, death, victory, pick and retry flows verified by simulation in Chrome.
- July 3, 2026 — **Gate B passed** with notes: run too easy end to end, weapons visually unclear, picks same-ish. Sub-phase C begins and absorbs the notes.
- July 3, 2026 — Sub-phase C first pass: difficulty curve steepened (undefended player now dies ~19s in; a defended stationary kick+snare build still survives, developer judges live), distinct projectile silhouettes (snare bolt, hat chip dot, bass wave front, lead seeker arrow), XP gems recolored white so they can't read as hat shots, clap removed from the snare chart per feedback, homing turn tightened, per-weapon kill attribution in the overlay and on end screens, on-screen debug buttons mirroring the hotkeys, rehearsal room linked from the start screen with a back button. All verified in Chrome.
- July 3, 2026 — **Gate C passed** by the developer: the fused build answers M1's question. Verdict protocol begins; log created at `docs/phases/m1-verdict-log.md`.
- July 3, 2026 — Verdict protocol simplified with developer sign-off: the written run log (file deleted), the three formal questions, and the outside-tester step removed from `docs/phases/m1-demo.md` and `docs/plan.md`. The developer's own judgment is the whole protocol, at M1 and at every future milestone exit.
- July 3, 2026 — **M1 verdict: pass**, declared by the developer. M1 complete. Next: M2 grilling session.
- July 3, 2026 — M2 grilling session held. Locked: 4-bar phrase clock; four tiers per weapon as single hand-authored chart ladders with per-weapon character (hat=density, lead=richness, bass=weight with a top-tier subwoofer peak); pick pool of weapons and tier-ups only, three options per level-up, terse VS-style pick cards with no music text; 8-minute run at ~12–14 level-ups; no weapon cap (wide-vs-deep carried by the pick budget); next-bar entry for all picks; one new darter enemy plus wave events; real death, tuned so attentive play usually completes the arc; chart playground (editable in rehearsal room, read-only in-game overlay) and enemy/weapon sandbox as first-class dev tools. Two decisions parked in `docs/plan.md` (multi-axis growth, future slot cap). Spec locked at `docs/phases/m2-the-arc.md`.
- July 3, 2026 — M2 sub-phase A implemented: 4-bar phrase clock (charts loop inside the phrase, position readout shows bar 1–4), six tier ladders as 24 charts in `src/audio/charts.ts` (M1 charts recycled at their ladder positions; engine defaults to those tiers so the M1 game is unchanged), bass "fat" and "sub" weight variants, chart store with localStorage persistence and JSON export, editable chart playground in the rehearsal room (velocity cycling, variant cycling, bars control, playhead, cells light as they fire, read-only mount ready for the game overlay), progression scrub rebuilt to walk pick-by-pick arcs with wide-shallow and narrow-deep archetypes. Verified end-to-end in Chrome: playback, both arcs, tier switching, live cell edit + persistence + reset, M1 game boot. Awaiting gate A.
- July 3, 2026 — **Gate A passed** by the developer over a Cloudflare tunnel playtest: every ladder audibly grows tier to tier, both end-of-run mix shapes (wide-shallow, narrow-deep) pass the ear. No chart edits requested; the AI drafts stand as shipped. Sub-phase B begins.
- July 3, 2026 — Sub-phase B implemented: pick pool of weapons + tier-ups (three options, tier-4 weapons leave the pool, heal fallback when everything is maxed), terse tier pick cards with honest gameplay lines, per-tier weapon stats in `src/game/config.ts`, next-bar entry for all picks via `engine.atNextBar` (visual pulse fires when the change lands), 8-minute stage with xpCurve retuned, darter enemy (straight dash bursts), wave events as pure data (`WAVES`), sandbox mode (stage script off, enemy roster + spawn buttons, clear-all, invulnerability, loadout editor at any tier), read-only chart overlay on hotkey C. Verified in Chrome by headless full-run simulation: victory at 8:00 with 14 level-ups (gaps 14–54s, avg ~33s), all enemy kinds and waves spawning, all six weapons killing, death and end screens, sandbox controls, next-bar timing measured. Awaiting gate B (the muted run).
- July 3, 2026 — Mobile support: floating analog touch joystick (touch the arena, drag to move; buttons stay taps), viewport locked against pinch/double-tap zoom and pull-to-refresh, safe-area insets, camera zoom (0.5–1×) keeps the visible world comparable on small screens, retina-capped canvas resolution, audio auto-resume after mobile tab switches, phone-size layout for screens/HUD/sandbox. Joystick verified with synthetic touch events in Chrome.
- July 4, 2026 — **Gate B failed** with notes: run not challenging at all, late game reads as scattered individuals instead of hordes (enemy HP never scaled), chord feels useless (stationary zones underfoot), and with no difficulty the picks feel interchangeable. Also requested: arrow-key + enter pick selection. Rework loops within sub-phase B.
- July 4, 2026 — Sub-phase B second pass: enemy HP (×4.5), contact damage (×1.6), and speed (×1.35, darters excluded) now scale over the run; spawn ramp made superlinear (rampExp 1.6, swarm 2→22/s) with bigger late waves that may exceed the soft alive-cap (hard cap 1500); chord reworked to throw its zone at the nearest pack and slow enemies inside (damage kept moderate after a first pass showed it taking ~70% of all kills); gem XP scales with time so pick cadence holds (~13-14 level-ups); XP curve retuned; magnet radius 90→110; arrow-key + enter navigation on pick and start screens; debug "+xp" button replaced by a direct "level up" button. Verified by accelerated autoplay simulation in Chrome: kiting builds win with hp pressure, a scattered low-tier build dies around minute 6-7, alive counts reach 1200+ in the back half. Awaiting gate B replay.
- July 4, 2026 — **Gate B failed again** with VS screenshots as the density reference: still super easy, the build always outscales the enemies regardless of picks, AFK in the middle is safe, screen still feels empty, AoE overpowered, and the chart overlay covers the whole game.
- July 4, 2026 — Sub-phase B third pass, the scaling race flipped: enemy HP ×16 by minute 8 (rampExp 1.8) so no build ever clears the screen, only carves a bubble; contact damage ×2; swarm rate 2→36/s; alive caps 2400 soft / 3000 hard for waves; final rings up to 280 swarmers; separation steering weakened so the horde packs into a VS-style wall; gem XP up to ×4 late to hold pick cadence. Chart overlay redone as a compact translucent dock (bottom-left, ~480px, 38vh max). Simulation results: AFK deep build dies ~2:10 (AFK is never safe now), greedy all-tier-4 build dies ~6:40, scattered build dies ~5:30, strong focused build completes with hp scares; 9-16 level-ups; on-screen enemy counts 50-265 through the back half; sim update cost ~11ms/frame above 2000 alive (frame-rate watch item for C). Awaiting gate B replay.
- July 4, 2026 — Enemy visual clarity (gate B note): a minute-7 swarmer was 16x tougher than a minute-1 swarmer but looked identical. Enemies now carry visual "toughness bands" that advance with the run (at 28% / 55% / 78% of the arc): color runs cool to hot per kind, size creeps up ~34%, and the top band gets a dark core. Shape stays the kind's read, band carries the danger read. One shared `enemyScaling` formula drives stats and band in both the run and the sandbox; the sandbox gained a stage-minute preview (0/2/4/6/8) whose spawn buttons and stat lines reflect the chosen minute. Verified in Chrome with a 4-band × 3-kind lineup.
- July 4, 2026 — Autoplay bot grilling session held. Locked: balance instrument only (no gate ever passes on bot output; results comparative, never absolute; hands beat numbers); usage doctrine "floors, not peaks" (detects broken, never defines balanced, no target win rates; equal win rates across pick policies is the failure signal); one source of truth (real RunWorld/configs/charts driven by a virtual clock, no-graphics mode, fixed 60 Hz tick, seeded RNG, instant picks); CLI batches with parallel workers + browser replay-from-seed; movers AFK and Kiter; pick policies over real three-card offers (random, deep-first, wide-first, focus), no forced build orders; damage share replaces kill share as primary attribution (in-game end screen/overlay too); JSON-lines per run + ten-second batch report with auto-surfaced outlier seeds; one-time developer calibration gate on the Kiter. Build timing: after the gate B verdict, before gate C tuning. Spec locked at `docs/tools/autoplay-bot.md`.
- July 4, 2026 — **Gate B passed** on the third pass: the muted 8-minute run plays as a competent survivors-like with real picks. Autoplay bot build begins per the locked tool spec.
- July 4, 2026 — Autoplay bot implemented per the tool spec, both sub-phases. Sub-phase 1: `run.ts` split into pure simulation (no pixi, no input devices, injectable RNG and movement control, fx queue) and a new `view.ts` renderer that diffs world state per frame; shared trigger matching extracted to `arranger.ts` (engine and bot use the same function); pick pool extracted to `picks.ts` (game and bot face identical offers); damage-share attribution added as the primary metric in the world, end screen, and debug overlay (kills now secondary — the seed-7 replay showed snare at 461 kills but only 24% damage vs bass 490 kills / 38%). Sub-phase 2: virtual conductor (`bot/conductor.ts`) replaces the audio clock for bot runs, next-bar pick entry preserved; AFK and Kiter movers; random/deep/wide/focus pick policies; headless simulator; CLI batch harness (`npm run bot`, parallel workers, JSONL + ten-second report + outlier seeds with replay links); browser replay via `?replay=<seed>&mover=&policy=`. One real bug found and fixed during verification: V8's Math.sin/cos differ bitwise between Node and Chrome, so replays drifted off their batch runs after ~2 minutes; gameplay now uses deterministic fdlibm-kernel sin/cos (`dmath.ts`), and a replay was verified bit-identical to its headless run by full-precision position probes through the full run (seed 7: death at 4:37, level 10, 1429 kills, both sides). Game verified unchanged in Chrome: start, run, arrow-key picks, next-bar entry, end screen, sandbox. Reference batches (config 99e52a0-dirty): AFK dies 0:47 median (canary healthy); Kiter 0% wins, median deaths deep 4:48 / random 4:08 / wide 3:34 (spread exists, mover may be too weak — calibration gate material). Awaiting the calibration gate.
- July 4, 2026 — Calibration gate feedback: the developer judged the Kiter's movement believable but spotted it abandoning large gem piles. Investigation (three Harvester mover designs, all batch-compared against the Kiter on paired seeds): none beat it — even at a fixed 3:00 mark the gem-seeking movers collected less, because collection follows the kill-dense orbit path, and every gem-steering behavior disrupts that orbit. Structural finding, quantified: the Kiter collects only 20–37% of dropped XP because weapons kill at hundreds of pixels while the magnet reaches 110 — no movement policy bridges that geometry. The decisive lever is the gem economy itself: magnet 110→200 in a script-only experiment added 30–180s survival on 5/6 seeds and lifted final levels from ~12 to 17–24. Feeds the known gate-C item (uncollected gems); the magnet number is the developer's call. The Harvester (v3: gem-weighted orbit direction + close-bubble vacuum) ships as an experimental mover alongside AFK and Kiter (the spec anticipated a gem-prioritizing mover); movers are now per-run factories so they can carry state. Kiter remains the comparison workhorse.
- July 4, 2026 — Developer decision: the gem economy stays as it is (magnet 110, no merging, no consolidation). The "uncollected gems" gate-C item is closed by decision, not by change.
- July 4, 2026 — **Calibration gate passed** by the developer with the original Kiter: it plays believably. Bot batch numbers are now trusted tuning input (comparative, never absolute, per the tool spec). Scope decision recorded at the same time: no deep per-weapon balance work in M2. Future systems (items, passives, genres) will reshuffle weapon strength — a hi-hat unlock may someday overwhelm today's dominant bass — so equalizing now would tune a game that will not exist. Sub-phase C keeps only the spec's floor requirement: every ladder kills respectably at every tier, verified by bot floor-check batches, no equalization. Sub-phase C begins.
- July 4, 2026 — Sub-phase C engineering: frame-rate work landed (spatial hash single-cell insertion + squared-distance early-outs + shared render geometry + off-screen culling; real minute-7 scene now ~11 ms/frame ≈ 89 fps at 836 alive, synthetic 2400-packed worst case 66→25 ms; sim-affecting change, all bot seeds re-baselined). Floor-check batch (focus:each, 90 runs, pre-rebaseline config): bass 6:01 and chord 5:59 median survival, kick 4:44, lead 4:03, snare 3:31 — all with their focused weapon carrying real damage share; **hat collapses at 2:37 median, avg level 4.8**, a possible floor violation. Per the no-equalization decision this goes to the developer's hands at gate C as "is a hat-leaning build still fun to lose with, or a trap?" — no automatic tuning. Practical tool manual written at `docs/tools/autoplay-bot-guide.md` (commands, outputs, replay, determinism rules, experiment recipes for future items/genres).
- July 4, 2026 — **Gate C passed and M2 verdict: pass**, declared by the developer after full 8-minute runs with sound: music growing with the build creates the "I'm making a track" feeling. M2 complete. M3 (the drop) grilling deliberately not started yet, at the developer's request.
- July 5, 2026 — M3 grilling opened, then paused for a proof of concept. Genre system redefinition surfaced (genre lock swaps per-weapon ladder charts for parts of one composed destination track — the sketch→song flip; conversation-only, no spec). Developer ordered the POC before locking anything: reverse-engineer real tracks he loves into the engine, since a known-good composition isolates the variable (if a great track sounds bad, the problem is engine/samples, not composition). **Track Lab** built (`#tracklab`, `src/tracklab/`): labengine (string-keyed voices, per-track bpm/swing/sections, sidechain pump, per-voice tune), labkits (synthesized + CC0-sampled instruments), lab UI (cards, sections, mute/solo/volume, read-only grid + playhead). Five covers from a multi-agent research + adversarial-fact-check workflow: Sahara, METAMORPHOSIS, Pursuit, Satisfaction, Da Funk. All five verified firing in Chrome. Timing bug found and fixed (`2ee97bc`): samples pitched far from their recorded root stretch their transients, reading as delayed notes; cure is multi-octave rendering with chart notes near rate 1.0. Additive only — game untouched but for two entry links.
- July 5, 2026 — Satisfaction deep-dive listening loop. Developer's one taste change: remove the MacinTalk robot vocals (he didn't like them). Vocals unwired from the track (voice row, chart defs, drop + breakdown slots), then the five voice sample WAVs deleted from disk/git and dropped from the samples LICENSE. tsc clean, verified in Chrome (no voice reference survives in the track object). **Satisfaction passed the developer's ear** — "all sounds pretty good to me, audio is satisfying." First Track Lab cover to clear the listen gate.
- July 5, 2026 — POC treated as proven; **M3 grilling resumed and completed, M3 spec locked** (`docs/phases/m3-the-drop.md`). Design tree walked one question at a time. Key locks: emergent model; a **weapon is an instrument type** (not a fixed sound), re-skinned per track; a **track is the mechanical unit** (an exact recipe of instrument types → one composed song, deterministic), "genre" a flavor label over tracks; the lock is a **player-fired drop** armed by an **exact-match recipe** with **off-recipe instruments blocking** it; **vulnerable wind-up** (riser + silence, weapons cut, exposed) resolving on the next downbeat into a **synchronized slam + damage-amp window + strong visual/UI spectacle**; the first drop turns the composed track **on permanently**, re-drops are snappier surges gated by a **combat-charged energy meter**; the **re-score** keeps Model A (each part is still a weapon firing = damage + sound). M3's destination is **Satisfaction** (reuse the approved cover): catalog = the six existing weapons, recipe = five (kick, snare, hat, bass, lead), **chord is the blocking decoy**, fx riser/crash is the ceremony; sandbox force-assemble is the primary playtest path. The four parked M3 decisions resolved; new parked items recorded (exact-match collection loop + brick escape valve, item/sound effects, per-track signature effects). `docs/plan.md` genre paragraph and roadmap updated with pointers.
- July 6, 2026 — **Direction change (developer's call): drop full tracks; genres become playable characters; expand to twelve weapons.** The M3 drop / destination-song direction was abandoned and `docs/phases/m3-the-drop.md` marked superseded. The Track Lab is kept as a standalone **Experimentation room** (`#tracklab`, start-screen link), outside the game loop, unchanged. Built on branch `worktree-genres-and-weapons`: (1) six new weapons — clap (Whip melee cone), tom (Cross boomerang), cowbell (Runetracer ricochet), arp (King Bible orbiters), zap (Lightning Ring strikes), crash (shockwave + knockback) — each a distinct gameplay archetype with a research-informed synthesized kit, per-tier stats, pick line, and silhouette (twelve weapons total). (2) Six genres as characters — Lo-Fi/House/Synthwave/Hip-Hop/Drum&Bass/Techno — each with its own tempo, swing, and a four-tier ladder for all twelve weapons, authored via a groove DSL (`src/audio/groove.ts`, `src/audio/genres.ts`); genre-aware chart store, `engine.setGenre`, clock swing, and per-genre `powerMul` tempo compensation. (3) Start flow picks genre then weapon; sandbox genre switcher; bot `--genre`. Verified: tsc + vite build clean; headless bot smoke across all six genres (no crashes, new weapons carry damage share); Chrome confirms both select screens, a live run applying the genre's bpm/swing/powerMul, all twelve weapons' render paths error-free, rehearsal room with twelve voices. Spec after the fact: `docs/phases/genres-and-weapons.md`. Awaiting the developer's ear/hands as the gate.
- July 6, 2026 — Two follow-ups on developer request: (a) the Track Lab was restored as a standalone **Experimentation room** (`#tracklab`, start-screen link) — kept as a lab, not a game mechanic, works as before; (b) **Phonk was replaced by Hip-Hop** as a genre (trap-flavored, 140 BPM, halftime snare, rolling hats, booming 808, melodic lead hook; swing 0.1, powerMul 0.8) so the aggressive-halftime slot stays distinct from Lo-Fi. Verified: build clean, bot smoke on Hip-Hop, Chrome genre select + live run.
- July 6, 2026 — **Band sub-phase B implemented** (the first six damage hires), committed on `main` (`124cc99` rimshot, `023c30e` the other five). Six new instrument roles added to the closed `Role` union with synthesized kits (`kits.ts`), per-tier stats + capability tags + card lines (`config.ts`), KIT_COLORS, and slot-roster wiring (`band.ts`): rimshot (Backbeat) — a woody chain-crack that hops enemy-to-enemy (`chainCrack`, reusing the zigbolt/spark fx); heartbeat (Pulse) — a breathing field that shoves the inner ring out and drags the outer ring in (new `drag` helper); shaker (Hats) — a damage trail dropped as a short-lived non-slowing zone per trigger; acid (Motion) — a gravity well (Zone with a per-frame inward pull); pluck bass (Bass) — a note lobbed to the nearest pack that bursts on landing (new `pluck` projectile branch, no en-route hits, small-bead silhouette); Rhodes (Harmony) — an armed mine (Zone variant) that blooms on contact. The `Zone` struct gained `slow`/`pull`/`mine` variants; `view.ts` renders the pluck bead and the zones generically. 120 new charts (5 instruments × 6 genres × 4 tiers) authored via the groove DSL, respecting the design rules (Lo-Fi sparse, DnB even-steps, Motion thinning in Hip-Hop/DnB, hip-hop pluck off the kick steps). Rimshot's kit + chain passed the developer's ear as a tracer before the other five were built. Verified: `tsc` + `vite build` clean; the build-time chart guard passes; bot focus-builds confirm every new weapon carries real damage share across genres (shaker ~17%, heartbeat ~21–27%, acid ~63–72% [reads strong], pluck ~21–37%, rhodes ~31%), no floor collapses; Chrome loads clean with the new instruments in their slot rosters/rack and their zones/projectile rendering, zero console errors. Awaiting gate B (live feel of each behavior and sound is the developer's call). Sub-phase C (ride/riser utility weapons + freeze/auto-dash systems + bell/whistle/Reese/choir pad) not started.
- July 6, 2026 — **Band sub-phase A gate passed** by the developer: a run built as a band sounds cleaner at full size and feels like assembling a character. The same playtest passed the co-judged genres-and-weapons material (six genre characters, twelve weapons, items, effects, VS enemies, UI redesign). Sub-phase B (the first six damage hires) is next.
- July 6, 2026 — **The band sub-phase A implemented** (the system on today's twelve instruments, no new content), uncommitted on `main`. New `src/game/band.ts` holds the eight-slot taxonomy (Pulse/Backbeat/Hats/Motion/FX/Bass/Harmony/Melody), the twelve-role→slot map and per-slot roster, the genre-affinity table (rule 6) and the early-drum-nudge knobs. `picks.ts` is now slot-aware: permanent picks (a fresh instrument is offered only while its slot is empty; filling a slot retires its roster rivals), one instrument candidate per slot per offer (greedy post-draw filter), genre-weighted weapon weights and an early Pulse/Backbeat nudge (~2 min) — all pure in `(tiers, items, effects, rng, genreId, timeS)`, so the seeded bot and replays stay deterministic (genre sourced from `activeGenre().id` at both offer sites). FX barred from the starting offer on the player screen (`hud.ts`) and the bot's random openers (`policies.ts`), still offered on level-up. Engine (`engine.ts`) gains a per-voice `duck` GainNode (gain→duck→[fx]→master) so the kick sidechains the bass (rule 1). Band rack UI: eight sockets (empty dashed, filled showing instrument color/name + tier pips) in the HUD top-center and in the pause menu, plus a slot badge on every weapon/effect pick card (`hud.ts`, `style.css`); the sandbox loadout editor keeps the rack live. Charts (`genres.ts`): tom rewritten from phrase-end rolls into steady Pulse grooves for the five non-Techno genres (Techno was the template, kept), hip-hop bass moved off the kick steps (rule 2), Motion thinned in Hip-Hop and Drum & Bass (rule 3, DnB kept to even steps at 174), zap tier-4 thinned to four hits (rule 4). Verified: `tsc` + `vite build` clean (766 modules); headless bot smoke across all six genres (random/deep/wide, no crashes, distributed damage share, tom now carries 12–16% as a Pulse voice); Chrome end-to-end (genre select, FX-barred start screen, slot-badged offers, live band rack, permanent-pick + one-per-slot invariants confirmed over repeated offers, pause rack) with zero console errors; a three-lens adversarial code review (determinism, Web Audio graph, spec/chart conformance) returned no findings. Awaiting gate A (the developer's ear/hands) — kick-duck feel, tom-groove and Motion feel per genre, and the phase question. Utility weapons (ride/riser) and the twelve new hires are sub-phases B and C, not built.
- July 6, 2026 — **The band grilling session held; spec locked** (`docs/phases/the-band.md`). The developer raised the cacophony problem (unlimited instruments, role collision) and proposed band slots; the session locked: eight typed band-position slots capping ownership (Pulse, Backbeat, Hats, Motion, FX/Transition, Bass, Harmony, Melody), permanent picks (no mid-run swap; parked as a future meta unlock), three offer rules (one candidate per slot per offer with genre-weighted roster draws, an early drum nudge, pick budget untouched), the band rack UI (HUD + pause menu, plain player-facing slot names: Beat/Snap/Tick/Groove/FX/Low/Color/Hook), and a 24-instrument catalog — twelve new instruments (heartbeat, rimshot, shaker, ride, acid, riser, Reese, pluck bass, Rhodes, choir pad, bell, whistle), exactly two of them utility weapons (ride = freeze sweep, riser = auto-dash; token damage, never zero). Three expert sub-agent reviews gated the locks: taxonomy (found my Accent slot was a grab-bag and the motion-layer collision ungated → the 8-slot cut), genre × slot stress test (no locks or rule-breaks needed; five design rules recorded: kick-ducks-bass, hip-hop bass off kick steps, Motion thinning in Hip-Hop/DnB, FX barred as starter, genre-weighted offers; plus lo-fi sparseness and techno-lead-stays-riffy chart discipline and an M4 timbre-ceiling flag), assignments (tom → Pulse on timbre grounds, Techno's chart as template; cowbell/arp/chord placements verified against code; zap tier-4 thinning). A fourth agent drafted the twelve instruments. Resolves the parked M2 slot-cap decision; `docs/plan.md` updated. Build order: A = system on today's twelve, B = six damage hires, C = last six + freeze/dash systems.
