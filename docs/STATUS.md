# Project Status

Last updated: July 15, 2026

## Latest change (July 16, 2026) — power-neutral EVO balance pass

A per-weapon/per-tier DPS bench (real 122-BPM chart cadence, one 4-bar phrase vs
infinite-HP sponges, single target + 50-enemy horde) was built and fed to a
senior balance review (3-lens panel + synthesis). It found the evolved band's
power concentrated in three crowd outliers (arp/chord/kick EVO at ~2200–3600
swarm DPS) with three evolutions reading as single-target sidegrades (bass/clap/
bell EVO ≤ their own T4). The developer chose a **power-neutral (mostly-nerf)**
pass — pull the outliers down toward the pack, and apply only the buffs that
cannot be nerfs. Applied to `WEAPONS`/`ARP_CAROUSEL` in `config.ts`:

- **arp EVO** dmg 4→2 + `ARP_CAROUSEL.rehitS` 0.18→0.28 (~3582→~1499 swarm DPS)
- **chord EVO** per-tick dmg 8→3 (~3245→~1217 swarm)
- **kick EVO** dmg 22→11 (~2237→~1118 swarm)
- **lead EVO** per-tick dmg 5→10 — Lead is now the single-target king (~46→~92 single); locks one target so it can't leak into crowd DPS
- **clap EVO** dmg 8→12 — evolving now clears T4 on single (~12.2 > 11.7)
- **bell EVO** dmg 6→8 — evolving now clears T4 on single (~16.5 > 15.3)

Result: the crowd-clear band is ~500–1500 swarm DPS (was ~167–3582), Lead clearly
tops single-target, no evolution is a downgrade of its own tier 4, and total power
leans slightly DOWN (the three big nerfs outweigh the small buffs), so difficulty
stays stable-to-slightly-harder rather than inflating. `tsc` + `vite build` clean;
re-benched to confirm each landing number. Base-tier pacing kinks the review
flagged (chord T2==T3, hat T1==T2, snare T3, lead T1–T2) were **left for a later
pass** at the developer's direction. All numbers remain placeholders the gate can
retune. Bench harness was throwaway (removed).

## Previous change (July 15, 2026) — sub-phase C gate loop: Hat directional, off-screen rule, Lead retarget + sound

Several developer-directed changes during the sub-phase C gate loop (the gate is
still PENDING — this is feedback within the sub-phase, not a pass).

**Global rule — no off-screen targeting or damage.** No weapon (base or evolved)
may target or damage anything outside the visible screen. A new `onScreen(e)`
helper in `run.ts` filters the targeting helpers (`nearestEnemy`, `densestEnemy`)
and gates `damageEnemy` — the single choke point all weapon damage flows through,
so it covers projectiles, zones, rails, pulses, beams, cones, orbiters, and
shards at once. Visible rect = camera (player foot) `worldW x worldH` plus each
enemy's radius (partially visible counts). Removed the now-unused `outOfRange` and
`toughestEnemy` helpers.

**Kick base re-hit bug fixed.** The four-on-the-floor strip was re-hitting the
same enemy every beat (the intended per-target lock was in the comments but never
coded). Added a shared per-enemy cooldown (`Enemy.kickHitT`, `KICK_REHIT_S` =
1.35 s) gating the strike loop, so the strip hits each enemy at most once per
1.35 s. This de-inflates base-kick DPS (single target ~30.5→11.4 at T4; the swarm
also drops since re-hits are gated), so kick balance can now be judged on real
numbers. The evolved ring ("The Drop") is unaffected.

**Lead "The Solo" — nearest + sticky, and a tamed sound.** The evolved beam now
locks the **nearest** target (not the toughest) and holds it **sticky** until it
dies or leaves the screen, then glides to the next nearest (`updateLeadBeam`).
Its evolved voicing was **tamed** (developer: jarring + too loud): level cut
~0.4→0.26, resonant lowpass peak removed (Q 2→0.8, cutoff 4400/4200→3200),
gentler soft-clip (1.5/1.6→1.15), calmer vibrato — in both the in-game house kit
(`kits/house.ts` `leadSolo`) and the rehearsal-room builtin (`kits.ts`
`renderLeadSolo`). **Base Lead's voicing is unchanged** (the developer likes it).
The tamed timbre is an ear-gate item.

**Hat — VS-knife directional feel.** The **Hat** was redirected to aim by
**player movement** instead of auto-targeting, Vampire-Survivors-knife style:

- **Hat "16th-Note Storm"** — the movement-**speed** coupling is gone (a still
  player no longer goes quiet). It is now a **VS-knife-evolution wall**: every chip
  advances in the movement heading with **zero angular scatter** but spawns across
  a line perpendicular to it (`HAT_STORM.lineHalfWidth`), a parallel wall of chips,
  with a bit more reach (`WEAPONS.hat[EVO].lifetimeS` 0.55→0.75; `spawnHatChip`).
  The speed-fraction logic (`playerMoveFrac`, `speedRate/baseRate`) was removed.
- **Base Hat (tiers 1-4)** fires along the movement heading with **zero scatter**
  (a single straight line, `moveAim(0)`), not auto-aimed at the nearest enemy —
  matching its "chips in your travel direction" spec line and the evolution's feel.

A parallel **Snare** rework toward the same directional feel (a "Rimshot Rain"
forward volley) was tried in this loop and then **reverted at the developer's
direction**: the evolved Snare stays **"Rimshot Rail"** (the instant densest-line
hitscan rail + answering crack), unchanged from its lock.

New shared seam: `player.moveDirX/moveDirY`, a unit vector of the last non-zero
movement input that holds the last heading while idle (VS-knife behaviour), set
in `movePlayer`. Snare and the other six evolutions, and all other base weapons,
are untouched. Balance numbers are placeholders pending the gate.

**Verification.** `tsc --noEmit` + production `vite build` clean. Two headless
deterministic sim tests (since removed): one (10/10) confirmed the hat stream
fires in the movement heading, holds the last heading while idle, and emits at a
**constant rate regardless of player speed**; a second (8/8) confirmed off-screen
enemies are neither targeted nor damaged (even along a snare rail's line) while
on-screen ones are, and that evolved Lead locks the **nearest** target (not the
toughest) and stays **sticky** on it when a nearer enemy appears. Spec
(`docs/phases/weapon-evolutions.md`) amended with a dated developer-directed note;
the uniqueness matrix and implementation map updated.

A per-weapon, per-tier **DPS bench** (single high-HP target vs a 50-enemy horde,
practically-infinite-HP sponges, one 4-bar phrase) was built and is being fed to
a senior balance-specialist review; results and recommendations to follow.

## Previous change (July 15, 2026) — weapon-evolutions SUB-PHASE C implemented

The last, riskiest sub-phase (the new systems) is built end to end: **Clap
"Standing Ovation"**, **Lead "The Solo"** (with base Lead's respec), **Snare
"Rimshot Rail"**, and **Hat "16th-Note Storm"**. **No developer gate has passed
for C** — its gate is his ear and hands, and it also judges whether base Lead
still feels good as a beam.

- **Base Lead respec (ships now):** homing seekers are gone. Each melody note
  fires an instant hitscan **lock-on zap** into a sticky-locked nearest target
  (never misses), re-locking only on death/out-of-range (`fireLeadZap`; the
  `Projectile.homing` field, its steering branch, and the lead projectile/trail/
  spark are removed). Reads as one voice aimed at one thing.
- **Lead "The Solo":** a persistent **beam** (`updateLeadBeam` + `world.leadBeam`
  + `view.drawLeadBeam`) that locks the **toughest** target (bosses first, then
  HP+shield), ticks continuous damage (`LEAD_SOLO.tickS`), and **glides**
  instantly to the next priority on death. Each trigger refreshes the beam so it
  stays lit while the lead plays and stops when the voice is deactivated. Sound:
  one sustained, singing lead with vibrato.
- **Clap "Standing Ovation":** a ring **collapses inward** onto everything within
  `CLAP_OVATION.radius`, crushing and briefly **freezing** each non-boss — a 0x
  speed timer (`Enemy.freezeT`) on the existing speed channel (no new status
  framework), which also **roots** them against collision de-overlap; bosses
  take the damage but are immune to the stop. The view tints frozen enemies icy
  and draws the closing ring. Sound: a whole-hall layered clap with reverb.
- **Snare "Rimshot Rail":** an instant infinite-pierce **rail** auto-aimed
  through the densest line (`fireSnareRail`/`railHit`, a band hitbox), plus an
  answering angled crack. Sound: the crack gains a metallic rimshot ping.
- **Hat "16th-Note Storm":** a persistent **swirl of shards** emitted around the
  player at a rate scaled by how fast the player is moving (`updateHatStorm`,
  `HAT_STORM.baseRate + speedRate * playerMoveFrac`) — moving shreds, still goes
  quiet. Sound: an open, sizzling continuous wash.

The framework carried the data (4 EVOLUTIONS entries, 4 evolved charts, 4 new
kit variants — snare's routes from the builtin kit since the house kit has no
snare — 4 WEAPONS[4] blocks, config, and one fireTrigger/update branch each). The
pool, guaranteed card, ceremony, band rack, and sandbox force-evolve picked all
four up unchanged.

**Verification.** `tsc --noEmit` + production build clean. A **headless
deterministic sim test** (drives `fireTrigger`, steps the pure sim) asserts all
five, 17/17: base lead is hitscan/never-misses/sticky; The Solo locks the
toughest, its beam lights, and it glides on death; Ovation freezes a non-boss,
leaves a boss unfrozen but damaged, roots the frozen enemy (fully stopped) and
thaws; the Rail hits a whole in-line row (infinite pierce) and misses off-line;
the Storm emits, and a **moving player shreds more than a still one**. A four-lens
adversarial review of the diff was run. Browser-driven: no console errors; the
four evolved voicings/charts are wired in-game (snare from the builtin kit); and
a screenshot confirmed all four render distinctly — the magenta **beam** locked
on the boss, the icy-**frozen** tank ring inside a collapsing clap ring, and the
gold **rails** (main + answer).

**Sub-phase C gate (PENDING, the developer's ear/hands):** do the four new
systems feel good and read clearly, do their evolved sounds land, and does base
Lead still feel good as a beam? This is the final sub-phase — a pass takes the
whole weapon-evolutions phase to its verdict protocol (full runs, evolving across
builds); a fail loops within sub-phase C.

## Previous change (July 15, 2026) — SUB-PHASE B gate PASSED; bass Rolling Crest

After the rework (below), the developer flagged the **bass** evolution one more
time: the traveling-wall visual popped in full-size and read as a confusing
slab. A design subagent generated and ranked six alternatives; the chosen
**"Rolling Crest"** ships: the evolved bass now spawns a bright bowed wave crest
narrow and just ahead of the player that **unfurls** open to full width (with a
fast fade-in) as it rolls, drawn as a bright leading crest line + trailing ripple
arcs over a soft glow body (`view.ts` `drawBassWall`, redrawn per frame; sim in
`run.ts` `BassWall` grows `halfWidth` over `BASS_SUB.openS`). It reads clearly as
a low-frequency wave and no longer pops in. tsc + build clean; headless sim
(narrow spawn, seated ahead, opens to full, hits in-path/misses off-side,
despawns) and browser screenshots verified.

With the bass fixed, **sub-phase B's gate PASSED** (the developer's sign-off on
all four: Bass "The Sub", Chord "Sustain", Arp "Arp Carousel", Bell "Carillon").
Committed and pushed; PR #99 open.

**Sub-phase C is now in progress** — the last, riskiest set (new systems): Clap
"Standing Ovation" (collapsing ring + a brief 0x-speed freeze, boss-immune),
Lead "The Solo" (a beam with toughest-target priority + glide, INCLUDING base
Lead's respec from homing seekers to a per-note lock-on beam), Snare "Rimshot
Rail" (instant densest-line rail + answering crack), and Hat "16th-Note Storm" (a
movement-coupled shred aura). Its gate also judges whether base Lead still feels
good as a beam.

## Previous change (July 15, 2026) — weapon-evolutions SUB-PHASE B REWORK (gate-fail loop)

The first sub-phase B build FAILED its developer gate with specific per-weapon
feedback; the fail loops within sub-phase B (never downstream). All four were
reworked to his direction. **The gate is re-PENDING** on the reworked four.

The feedback and the fix:
- **Bass "The Sub"** — "terrible": the old once-per-phrase huge wall was one
  wide ellipse that looked wrong (a single note stretched huge), came out of
  nowhere, and sounded ugly (the resonant `wub`). **Full refactor.** Dropped the
  ellipse-projectile wall entirely. Every evolved bass trigger now spawns a real
  traveling **wall entity** (`BassWall` in `run.ts`: a long thin damage band that
  sweeps along its facing, grinding enemies in the band on a re-hit cooldown),
  rendered as a **thick glowing bar perpendicular to travel** (`makeBassWallGfx`),
  so it reads as a wall, not a stretched wave, and it is consistent (no
  out-of-nowhere surprise). The sound variant was renamed `wub` → `sub` and
  rewritten to a **clean, deep, powerful sub** (strong sine + gentle body, no
  resonant LFO), with the level lowered for limiter headroom (peak 1.77 → 1.28).
- **Arp "Arp Carousel"** — the breathing (grow/shrink) "feels wrong", the
  evolved ring had FEWER notes than tier 4, and it was "the same dots".
  **Removed the breathing**: a **fixed larger radius** (140), a **dense**
  near-16ths chart so the ring stays packed, a **faster re-hit**
  (`ARP_CAROUSEL.rehitS`) for reliable continuous DPS, and a distinct **blade**
  silhouette (`Projectile.blade`) rotated radially — spinning steel, not dots.
- **Chord "Sustain"** — weaker than tier 4 (tier 4 stacks many stab-zones for a
  lot of damage; the evolution was sparse/big/slow, so "less area", didn't feel
  stronger). Made it a **kill-field**: per-tick damage 3 → 8, a per-zone tick
  rate (`Zone.tickS` = 0.3, faster than the base 0.45), and one field per bar (4
  per phrase) so 2-3 overlap for coverage. It now measurably out-damages tier 4.
- **Bell "Carillon"** — sound is good; the weapon problem is that shards spawned
  on a hit could re-hit the SAME (tanky) enemy and be swallowed, never reaching
  behind it. **Fixed (base + evolved), Sivir-W style**: `spawnShards` takes the
  source enemy and pre-adds it to each shard's hit set, so shards scatter PAST
  the body they broke on and reach the enemies behind/around it.

**Verification.** `tsc --noEmit` + production build clean. A **headless
deterministic sim test** (drives `fireTrigger`, steps the pure sim) asserts the
reworked mechanics, 10/10: the bass wall damages an enemy in its band and misses
one past its ends and despawns on lifetime; the **chord evolution out-damages
tier 4 over a phrase** (7552 vs 2806); the **arp ring radius is fixed at 140**
(no breathing) with blades and **out-damages tier 4** (13010 vs 4822, continuous
DPS); the **bell shards reach the enemy behind the tank**. (Temporary test file,
removed.) A four-lens adversarial review of the rework diff was run (bass-wall,
chord/arp, bell/integration). Browser-driven: no console errors; the `bass`
variants are now `[bass, fat, sub]` (`wub` gone) and the `sub` buffer is a clean
deep sub at the tamed level; a screenshot confirmed the new visuals render
distinctly — the bass **wall bar** (not an ellipse) with a bright leading edge,
the arp **blade ring**, and the large chord **Sustain field**, all landing
damage.

**Sub-phase B gate (re-PENDING, the developer's ear/hands):** do the four now
feel and sound like real transformations — the bass wall satisfying and clean,
the arp a reliable continuous-DPS ring, the chord clearly stronger than tier 4,
the bell reaching behind tanky enemies? A pass unlocks sub-phase C.

## Previous change (July 15, 2026) — weapon-evolutions SUB-PHASE B implemented

Sub-phase A's gate PASSED (below), which unlocked sub-phase B: the four
**extension evolutions**, each built end to end (gameplay AND sound) on the
generic framework A established. This first build FAILED its gate (see the
rework entry above).

The four:
- **Bass "The Sub"** (variant `wub`): the base rolling wave becomes massive slow
  waves plus a **once-per-phrase screen-wide wall** (fired on the phrase
  downbeat, `t.step === 0`, in a 4-bar evolved chart); the wall is one enormous
  bass wave whose tall wave-front reads as a wall crossing the arena. Sound: a
  deep, sustained sub with an LFO wobble (the "wub"), seated lower still by the
  bass voice's −3 sample tune (on-brief for "lower and heavier than anything
  else").
- **Chord "Sustain"** (variant `sustain`): the stab becomes a large, long-lived
  field dropped on the **densest pack** (`densestEnemy`) that **slows harder**
  and lingers far longer. A per-enemy `slowMul` (last-writer-wins, reset when the
  slow lapses) lets the Sustain field slow to 0.3 where the base zone slows to
  0.55; a distinct larger, brighter zone silhouette. Sound: a held, lush pad
  that swells and hangs (2.9 s vs the base 0.42 s stab).
- **Arp "Arp Carousel"** (variant `carousel`): the fixed-radius orbit becomes a
  **breathing ring** — every evolved orbiter shares one breathing phase, so the
  ring sweeps out to `maxR` then pulls in to `minR` (`ARP_CAROUSEL`). Sound: a
  more resonant, liquid arp with a longer filter sweep.
- **Bell "Carillon"** (variant `carillon`): the single shatter becomes a
  **depth-2 cascade** — the main shot's shards each shatter once more, then
  terminate (sub-shards carry `shatter 0` via the `shatterChild` field). Sound:
  a bigger, richer bell, a chord of bells (1.3 s ring-out).

**How the framework carried it.** A's generic seams meant B was mostly data: a
new `EVOLUTIONS` entry, a `SOUNDSET_EVOLVED` chart, a new kit variant (declared
in `ROLE_META`, wired into the builtin and/or house kit; the sample-overlay
merge preserves synth variants — that is how bass keeps `wub`), a `WEAPONS[4]`
block, and one `fireTrigger`/`updateProjectiles` branch per weapon plus new
config blocks (`BASS_SUB`, `CHORD_SUSTAIN`, `ARP_CAROUSEL`, `BELL_CARILLON`).
The trigger, guaranteed card, ceremony, band rack, and sandbox force-evolve are
unchanged and picked all four up with no per-weapon special-casing. arp/bell are
not built by the house kit, so their evolved voicings come from the builtin kit
via the engine's existing per-role fallback.

**Verification.** `tsc --noEmit` and the production build are clean. A four-lens
adversarial-review workflow (audio, bass/chord, arp/bell, visuals+integration),
each finding adversarially verified, returned **zero confirmed defects**; the one
flagged item was a stale `Enemy.slowMul` docstring (it said "strongest wins"
while the code does the sound last-writer-wins) — corrected, no behaviour change.
Browser-driven on the dev server: boot is console-error-clean; all four evolved
buffers and charts are confirmed live (bass `wub`/chord `sustain`/arp
`carousel`/bell `carillon`, each audibly distinct from its base by duration and
timbre); and a screenshot caught three at once rendering distinctly — the bass
wall crossing the arena, the large concentric Sustain field, and the arp
breathing ring. A **headless deterministic sim test** (drives `fireTrigger`
directly, steps the pure sim) asserts all four mechanics: the bass wall (r 420)
vs rolling wave (r 58) split on the downbeat; the Sustain field (r 150, slow 0.3,
resets cleanly); the arp ring breathing exactly across 72↔172 with no NaN; and
the bell cascade terminating **exactly** at the depth-2 cap (41 = 1 + 10 + 30)
with no projectile leak — 15/15 pass. (The test file was temporary and removed;
`check:lab` still cannot run in this worktree, see sub-phase A note.)

**Sub-phase B gate (PENDING, the developer's ear/hands):** each of the four
plays and sounds like a real transformation, not a scaled tier. A pass unlocks
sub-phase C (the new-system evolutions: Clap, Lead, Snare, Hat, plus base Lead's
respec); a fail loops within sub-phase B.

## Previous change (July 15, 2026) — weapon-evolutions SUB-PHASE A implemented

Sub-phase A of the weapon-evolutions phase is built end to end: the evolution
**trigger**, the shared **ceremony**, **sandbox force-evolve**, and the one full
vertical-slice evolution, **Kick "The Drop"** (gameplay AND sound). Built on
branch `worktree-weapon-evolutions-spec` per the locked spec
(`docs/phases/weapon-evolutions.md`). **No developer gate has passed** — the
sub-phase A gate is his ear and hands (below).

**The evolved-tier model.** An evolution is tier 5 (`EVOLVED_TIER = TIER_COUNT +
1`, `src/audio/charts.ts`), threaded through the existing tier machinery. A
weapon evolves only if the soundset supplies an evolved chart (`SOUNDSET.evolved`
in `src/audio/soundset.ts`, `soundsetEvolves`) AND the game registers it
(`src/game/evolutions.ts` `EVOLUTIONS`), so the two halves can never drift.
`getChart(role, EVOLVED_TIER)` returns a fifth working copy built in
`chartstore.ts`; `engine.setVoiceTier` now clamps to `EVOLVED_TIER` for evolvable
roles only (every other voice still caps at 4, so a stray evolve can't leave a
non-evolving voice on a silent chart).

**The two-layer transformation (the core principle).** The kick's *timbre*
changes via a new `drop` kit variant — a deeper, longer boom with a sub
"whoomph" (`renderKickDrop` in `kits.ts` and `kits/house.ts`), measured in the
browser at 0.9 s / peak 1.44 against the base hard hit's 0.37 s / 0.89. Its
*arrangement* is the evolved chart `dVar('kick','drop','X...X...X...X...')`
(`ladders/house.ts`): still four-on-the-floor (the kick's contract), now voiced
on the drop. The synth `drop` variant survives the `SAMPLE_OVERLAY` because that
overlay now **merges** onto the synth kit's variants instead of replacing them
(`kits/index.ts`) — behaviour-neutral for every existing role. So base Kick still
plays the sampled `hard` thump; evolved Kick plays the deep `drop` boom.

**The Drop gameplay.** The facing strip becomes an omnidirectional **pressure
ring** on every beat (`fireTrigger` kick branch → `spawnKickPulse` /
`updateKickPulses` in `run.ts`): each ring expands to `KICK_DROP.maxRadius` over
`expandS`, damaging (`WEAPONS.kick[4].damage`) and hard-launching every enemy
once as the front passes (per-pulse hit set + the shared shove channel), carving
a clear bubble. A distinct expanding-shockwave silhouette (`kickpulse` fx,
`view.ts`) replaces the flat strip. Base-kick behaviour is untouched.

**Trigger + ceremony + persistence.** A maxed weapon with an evolution now
contributes a **guaranteed** evolution card to every offer until taken
(`picks.ts` `rollOffers`: evolutions claim their slot before the weighted draw);
once evolved it leaves the pool. The card leads with the evolved name and an
"EVOLVE" tag. On its bar, the evolution lands (next-bar entry, old-tier damage
preserved) and fires a shared **ceremony** reusing the level-up moment (slow-mo,
duck, cue, burst) plus an "evolved — The Drop" toast. The band rack shows the
evolved name with an evolved style from that moment (`hud.ts`, `style.css`).
Sandbox loadout gains a ★ force-evolve button (`sandbox.ts`).

**Verification.** `tsc --noEmit` and the production `vite build` are clean (771
modules). A four-lens adversarial-review workflow (pool/trigger, audio wiring,
sim/gameplay, shell/persistence), each finding adversarially verified, returned
**zero defects**. Browser-driven on the dev server: boot is console-error-clean;
the audio wiring is confirmed live (the kick voice carries both `hard` and `drop`
buffers, the evolved chart is four drop hits, the drop buffer is the deeper
boom); sandbox force-evolve sets the kick to tier 5 and the rack reads "The
Drop"; the pulse dealt 1540 dmg clearing a tank ring in sandbox and 1320 in a
live run; and a full run reproduced the guaranteed evolution card → collect →
next-bar ceremony (toast + 0.75× slow-mo) → "The Drop" on the rack. (The
`check:lab` harness could not run: this worktree has no local `node_modules`, so
its hard-coded `node_modules/vite/bin/vite.js` preview path is unresolvable — a
worktree tooling limitation, not a code issue; its `build` step passed.)

**Flag for the ear gate:** the drop's raw level sits a touch hotter than the
other drums (limiter-safe, and on-brief for "lower and heavier than anything
else"), so exact mix balance is a taste call at the gate.

**Sub-phase A gate: PASSED** (July 15, 2026, the developer's explicit sign-off):
taking the kick to The Drop feels like a transformation in the hand and in the
ear, and the trigger feels right. This unlocks sub-phase B (the extension
evolutions: Bass, Chord, Bell, Arp), now in progress; sub-phase C is not started.

## Previous change (July 15, 2026) — weapon-evolutions spec grilled and LOCKED

The weapon-evolutions phase was grilled and its spec **locked with the
developer's explicit sign-off**: `docs/phases/weapon-evolutions.md` (a roadmap
pointer was added to `docs/plan.md`, interstitial before M4). The phase gives
each of the nine weapons a final evolved form past tier 4 that transforms
gameplay AND sound together; the core gated principle is that an evolution
which does not sound different from its base form fails its gate.

The six open mechanic questions were settled one at a time: (1) trigger =
max-then-offer with the evolution card **guaranteed** one of the three offers
once a weapon hits tier 4, costing one pick, eligibility written as a swappable
per-weapon rule; (2) pacing = one evolution in a typical run, two in a narrow
one, XP curve untouched; (3) base Lead's respec from homing seekers to a
per-note lock-on beam is confirmed (ships in sub-phase C, whose gate judges the
base feel too); (4) Clap's freeze = a brief timed 0× speed multiplier on the
existing speed channel, no new status framework, boss immune to the stop; (5)
visuals = distinct silhouette per evolution + frozen tell + evolved name on the
band rack + one shared ceremony reusing the level-up moment plumbing; (6)
persistence = permanent, next-bar entry, sticky through deactivation, pool exit
after evolving, sandbox force-evolve in scope. Passive items and chest-style
delivery were raised and deliberately parked; they block nothing in this phase.

Work happened on branch `worktree-weapon-evolutions-spec` (docs only, no code).
**Implementation has not started.** Next action for this phase: sub-phase A
(trigger plumbing + shared ceremony + sandbox force-evolve + Kick "The Drop"
end to end), gated by the developer per the spec.

## Previous change (July 15, 2026) — remove unreachable sound variants

At the developer's direction, the three sound variants that exist in code but are
never selected by the four-tune (the house ladders) are removed everywhere:
**kick `soft`**, the snare role's **`clap`** variant (a separate `clap` weapon is
untouched), and **bass `sub`**. An audit found the four-tune only ever fires kick
`hard`, snare `snare`, bass `bass`/`fat`, hat `closed`/`open`, and chord
`stab`/`pad`; the three above were reachable only through the Instrument Zoo's
manual variation control, never in a normal run.

Removed: the three ids from `ROLE_META.variants` (the single source of truth the
Instrument Zoo and rehearsal playground read, so the buttons disappear
automatically); their rendered buffers and builders (`renderBassSub`, the
`kick(hard)`/`renderKick(hard)` boolean collapsed to hard-only, the house `bass`
`'sub'` branch, the snare `clap` and kick `soft` entries in `buildKits`/
`buildHouseKit`); the kick `soft` overlay entry in `SAMPLE_OVERLAY`
(`kits/index.ts`); the kick special-case in `groove.ts` `drumVariant` (only the
hat carries two variants now); and the entire dead bass sub-drop gameplay path
that hung off the never-fired variant — `VARIANT_EFFECTS.bassSub`, the whole
`SHAKE`/`FLASH` config tables (bass sub was their only member), the two
`fireTrigger` blocks in `run.ts`, and the now-unfed `'shake'`/`'flash'` `FxEvent`
carriers and their `view.ts` cases. The independent player-hit shake
(`view.pushShake`) and level-up flash (`view.levelBurst`) use their own paths and
are untouched.

Note this supersedes the M2 spec's "designed top-tier peak" (the bass sub drop),
which was never wired into the shipped four-tune. Removal is developer-directed;
the locked M2 spec text is left as the historical record.

Verification: `tsc --noEmit` + `vite build` clean (771 modules). `npm run
check:lab` passes: the Instrument Zoo drive exercises every remaining
instrument/tier/variant pulse with no runtime/console errors, and the normal game
boots clean. No developer gate advanced; this is a scope edit.

## Previous change (July 15, 2026) — instrument activate/deactivate on the next bar

The developer number-key toggles (Digit1–Digit7 → band slot → owning instrument)
were converted from an instant, audio-only mute into a true **activate/deactivate
quantized to the next heard bar**. Grilled and locked this session; spec at
`docs/phases/instrument-deactivate.md`.

Behavior: a press flips the owning voice's `enabled` flag via
`engine.setVoiceEnabled`, scheduled through the existing `engine.atNextBar` seam.
Because a live run's damage rides the audio engine's triggers and a disabled voice
generates no notes, the sound AND the damage stop together on the next bar and
return together on reactivation. In-flight projectiles, zones, and orbiters finish
their bounded lifetime; only new triggers stop.

UI: the moment a key is pressed the slot shows a **pending pulse** until the bar
lands, then settles (dim = off, normal = on). A pending deactivate pulses down
from full; a pending reactivate pulses up from the dim. Shown on all three
surfaces (HUD band rack, pause rack, track overlay hotkey C). Double-tap flips the
target and self-cancels on a round-trip. Sticky across tier-ups: a tier-up applies
the new tier but leaves a deactivated instrument off (it returns at the higher tier
when reactivated). The control is gated to run + sandbox only. Vocabulary moved
off "mute": `mutedRoles` → `deactivatedRoles` plus a new `pendingRoles`, the CSS
`.muted` → `.deactivated`, and the track overlay's `m` mark → `off`.

Seams: `game.ts` owns the toggle (`toggleRoleActive`, the two sets, `paintBand`,
`resetDeactivations`); `hud.ts` `renderBand` and `trackoverlay.ts` `refresh` each
gained a `pending` set; `style.css` adds the `voice-pending-off`/`voice-pending-on`
keyframes (with a `prefers-reduced-motion` fallback). No audio or sim files touched.

Verification: `tsc --noEmit` + `vite build` clean. Browser-driven on
`npm run dev`: no console errors; pending and settled states render across the HUD,
pause rack, and track overlay; bar landing and double-tap cancellation work.
**No developer gate advanced: whether it sounds silent, deals no damage, and the
pulse feels right is the developer's ear/hands gate, still pending.**

## Previous change (July 15, 2026) — automated playtest harness removed

At the developer's direction, the automated playtest system has been deleted:
the CLI batch runner and worker, virtual conductor, seeded run simulator, pick
policies, browser replay route and controls, cross-runtime replay math, generated
batch artifacts, and the tool's spec and guide. Project and phase documentation
no longer prescribe automated balance runs.

The in-game and sandbox **auto-move** control remains. Its Kiter and Greedy
movement behaviors now live in `src/game/auto-move.ts`, independent of recording,
replay, or batch infrastructure. No developer gate advanced; this is a tooling
scope removal.

Verification: `tsc --noEmit` and the production Vite build pass; the four-room
Living Lab browser drive passes and returns to a clean normal-game start. The
pre-existing Mad Forest check still stops at its stale starting-spawn assertion
(`30 !== 10`).

## Previous change (July 15, 2026) — shared player damage feedback

A landed player hit now gives the same **0.5-second recovery window** in the
normal run, sandbox, and boss fights. The already-shared hit overlay was
retuned to match: a light red tint stays on the screen edges for that recovery
window, then fades out without obscuring the combat area. Dash invulnerability
in boss fights remains its separate 0.3-second movement-dodge rule.

Verification: TypeScript check and production build clean. No developer gate
advanced; this is a focused feedback and fairness adjustment.

## Previous change (July 13, 2026) — pluck bass, Rhodes, acid, and shaker removed

At the developer's direction, **pluck bass, Rhodes, acid, and shaker are
removed from the player's build/weapons system**. The playable catalog is now
nine weapons across seven band slots: Kick; Snare/Clap; Hat; Arp; Bass;
Chord; and Lead/Bell. The four removed instruments are not offered, voiced in
a run, shown on pick cards, or available in the Living Lab's active weapon
roster.

Removed: the four roles from their slot rosters in `src/game/band.ts` and from
the soundset playability-floor alternatives; their ladders in
`src/audio/ladders/house.ts` (making `soundsetSupports` false); their weapon
stats and tier lines in `config.ts`; their pick-card glyphs; pluck bass from
the Kick sidechain target list; and their exclusive gameplay/rendering paths.
Those paths were shaker's damaging trail, acid's pulling gravity well, pluck
bass's lob-and-burst projectile, and Rhodes's armed mine. Their now-unused
projectile/zone fields, the acid-only `WeaponConf.pull` stat, and the Living
Lab stat label were removed with them.

**Kept (audio catalog, used elsewhere):** the four `Role` entries, metadata,
colors, synthesis/sample renderers, and kit wiring remain because the
rehearsal room iterates the complete `ROLES` catalog. They are dormant catalog
voices, like tom/crash/riser, and cannot enter a normal run without a soundset
ladder.

Verification: `tsc --noEmit`, the production Vite build, and the four-room
Living Lab browser drive pass. A 20-run kiter/random headless batch completed
without crashes; its output contains no pluck, Rhodes, acid, or shaker damage.
No developer gate advanced; this is a scope edit.

## Previous change (July 13, 2026) — tom weapon removed from the build

At the developer's direction, the **tom weapon (a Cross-style boomerang, the
second Pulse-slot instrument) is removed from the player's build/weapons
system**. The Pulse slot now offers only the kick; tom is no longer supported
by the soundset, so it is never offered, never voiced in a run, and never
appears on a pick card. Mirrors the FX removal (#26) exactly, including the
keep/cut split.

Removed: tom from the Pulse roster in `src/game/band.ts` (`kick`/`tom` → `kick`)
and from the `'a beat (Pulse)'` playability-floor group in
`src/audio/soundset.ts`; the tom ladder in `src/audio/ladders/house.ts` (which
is what makes `soundsetSupports('tom')` false, so it is never offered/voiced);
the tom blocks in `WEAPONS` and `TIER_LINES` in `config.ts` plus its exclusive
`WeaponConf.count` field and the `BOOMERANG_OUT_FRAC` constant; the tom
pick-card glyph in `weaponicons.ts`; and tom's exclusive mechanics in `run.ts`
(the whole `spawnBoomerang` method, the `'tom'` trigger case, the boomerang
turn-around branch in `updateProjectiles`, the `outS`/`returned` projectile
fields, and tom's membership in `SPARK_HIT_ROLES`) and `view.ts` (the spinning
chevron silhouette, the boomerang spin, and tom's membership in `TRAIL_ROLES`).

**Kept (audio config, used elsewhere):** the tom sound synthesis stays whole —
the `Role` type entry, `ROLES`, `ROLE_META`, its `variants`/`add` render wiring
in `src/audio/kits.ts`, `KIT_COLORS` (a total `Record<Role,…>`) — because the
rehearsal room iterates the full `ROLES` catalog. tom is now a dormant catalog
voice, like crash/riser: the engine never enables it.

Verification: `tsc --noEmit` + `vite build` clean. Rebased onto the Living
Lab commit (#91): its Instrument Zoo listed the now-removed `count` stat, so that
one dead `WeaponConf` label was dropped from `src/lab/page.ts`; the merged tree
builds clean. No developer gate is attached; this is a scope edit, not a
milestone.

## Previous change (July 13, 2026) — Living Lab: in-game documentation suite

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
touch layouts were inspected with no overlap or unreadable controls. **No developer
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

Verification: `tsc --noEmit` + `vite build` clean; a direct pick-pool assertion over 5000 rolls across random
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
(live-only); `engine.ts` `weaponsBus`
between the per-voice ducks and master, plus `duckWeapons`/`playLevelCue`;
`weaponicons.ts` (new — 16 glyphs); `view.ts` ground-pick rendering + `levelBurst`;
`game.ts` owns the flow (`momentScale`/`momentT`, `dropGroundPicks`,
`startLevelMoment`, `collectGroundPick`, loop pickup detection, cleanup). The old
`'pick'` state, the DOM pick screen (`hud.ts` `showPick`/`kitCard`/`armKeys`), and
its now-dead CSS were removed.

The pickup flow is shell-owned. Verification: `tsc` + `vite build` clean. A
four-lens adversarial review (state-machine, audio graph,
rendering, determinism/spec), each finding independently refuted, surfaced **one
real defect** — `shoveEnemiesOut` left knockback-immune enemies (ghost, some
elites, knockbackMul 0) glued to the player through the reward moment — now fixed
by pushing the full deficit regardless of knockback resistance. All other findings
were refuted (the occasional one-bar-late entry is correct musical quantization
given the no-pause design; the coin `GraphicsContext` self-reclaims via Pixi's GC;
the rest unreachable/self-healing). Browser-verified live: the triangle drops with
correct glyphs/names/levels + burst, no console errors. **The walk-to-collect loop
and overall feel await the developer's hands/ear gate**.

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
`timeScale` snaps back to 1.0 on every new run or sandbox entry; the slider is
inert (disabled) outside run/sandbox.

Engineering verification: `tsc --noEmit` + `vite build` clean. A four-dimension adversarial review workflow
(sim-step math, audio seam, control-surface/reset, scope/juice), each finding
independently verified, returned **no defect in the sim math** and confirmed all
juice/HUD coverage; three low-severity UI-affordance findings
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
   (~2 picks/min), finale that overruns any build.
4. **UI overhaul**: the wide scrollable chart dock replaced by a compact
   per-voice "now playing" overlay (hotkey C); **keys 1–8 toggle audio mute of
   the owning band slot** (audio-only, gameplay untouched); debug row and
   start-screen lab links behind disclosures; dead CSS deleted; glow calmed.

Engineering verification: `tsc` + `vite build` clean at every commit;
adversarial review passes on patterns, weapon code, and UI.
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
- **Start flow.** Pick a genre (character), then a starting weapon. Sandbox gains a live genre switcher. Chart store, engine (`setGenre`), and clock (swing) are genre-aware; the coherence skeleton is enforced on every genre's charts at load.

## Verification (July 6)

- `tsc --noEmit` clean; `vite build` succeeds (746 modules).
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
TypeScript, the production build, and browser visual checks are clean. The
developer then judges:

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
**awaiting developer**, regardless of browser results.

## Side branch: per-genre sound (`audio-refresh`)

A parallel, additive branch (not a phase gate). **Redirected July 7, 2026** away from "pick the best of three tracks per genre by ear" toward **each genre owning its own sound**. Reverses the locked `plan.md:52` model (shared soundset, per-genre patterns) at the developer's explicit direction. The three-pattern-alternatives work (`src/audio/variant.ts`, `src/audio/variants/*.ts`) was removed.

New model — a genre now has:
- **Its own voicing** of the soundset. A Lo-Fi kick and a Drum & Bass kick are different sounds, not the same sound played differently. `src/audio/kits/<genre>.ts` builds each genre's kit (via the shared primitives + `makeKit`/`ROLE_META` in `kits.ts`); `kits/index.ts` is the cached registry; `engine.setGenre` swaps every voice's buffers to the active genre's kit (async, click-free). Samples may be downloaded where synthesis falls short (logged in `public/samples/<genre>/CREDITS.md`, licensing to clear before ship).
- **Its own instrument set.** A genre supports exactly the roles it supplies a ladder for; `genres.ts supportedRoles` is the single source of truth, read by the pick pool (`picks.ts`), the band rack (`hud.ts`, dropped slots shown unavailable), and the engine (unsupported voices never enable). Genres may drop whole band slots, subject to a build-time **playability floor** (a beat, a low end, a tick, a melodic voice).
- **One track.** A single hand-picked four-tier ladder per supported role — no alternatives. The sandbox track-switcher is gone; the sandbox now shows an **"optimized for"** readout of the genre's instrument set and keeps the **▶ play full band** button (assembling only the genre's supported slots).

**Real drum samples (the identity layer).** Synthesized drums from one engine converge on a shared character (the first pass sounded too alike between genres). Signature UNPITCHED drums are now real one-shots from the freely-distributed TidalCycles Dirt-Samples set — 909 for house/techno, 808 for hiphop, LinnDrum for synthwave, distorted break for dnb, warm for lofi — overlaid onto the synth kit in `kits/index.ts` (`SAMPLE_OVERLAY` + `loadSample`), so a role whose files load is voiced by the sample and everything else stays synthesized (melodic/bass), with graceful fallback to synth if a file fails.

**The fix lives in the asset, not the game (ffmpeg pipeline).** `scripts/build-samples.mjs` downloads each raw sample and runs an **ffmpeg** pass that makes the file correct once: strip leading/trailing silence, cap length per role + fade the tail, peak-normalize to a per-role target (so the kit is balanced ON DISK), force mono/44.1k/16-bit. The per-role numbers live in that script's `PROC` table (build tooling), NOT in game code. Consequently the runtime `loadSample` is dumb — **fetch + decode only, no trimming or leveling in code**. The script also writes `public/samples/<genre>/CREDITS.md` (source+license, verify before ship) and a health report at `public/samples/health-report.md` (currently **0 flags** on the processed assets). Re-run with `node scripts/build-samples.mjs` after any manifest/PROC change.

**Sound health-check screen (`#soundcheck`) — REMOVED July 7, 2026.** This was a developer surface listing every genre × voice with play buttons, health badges, and pass/flag export. It (the `src/soundcheck/` page, its start-screen button, CSS, and the `sampleFilesFor`/`sampleDir` helpers and orphaned `*.raw.wav` assets it alone used) was deleted at the developer's request. The variant A/B system it shared with the sandbox (`variantsFor`/`getGenreVariant`/`setGenreVariant`/`sampledRoles`) stays, driven from the sandbox only.

**Delivery + verification.** Stage 1 (skeleton, behavior-neutral refactor) → Stage 2 (per-genre synth voicings + one authored track each, via an ultracode workflow) → real drum samples + ffmpeg pipeline + health check. Verified at each step: `tsc` + `vite build` clean; browser render of every genre kit (all voices non-silent, no NaN, no console errors; drums confirmed distinct — lofi kick 257ms vs hiphop 88ms vs techno 108ms, all peak-normalized). Everything is ONE commit on `audio-refresh` (`06b34e9` at time of writing), pushed to origin.

### Every genre now has a chosen sampled kit (July 7, later) — DONE

All six genres are voiced by a real sampled drum/bass kit. House adopted Wave Point "Tight Tech"; the developer then auditioned prototypes for the other five and **picked variant A for every one**, each promoted into its shipped voicing (mirroring House's `build-house-kit.mjs` finalize):

- **lofi** → itslucid Tape Kit (kick/kick_soft/snare/rimshot/hat; shaker stays synth)
- **synthwave** → Clean 808 (TR-808 drums + A1 Jupiter/FM bass, tune 0)
- **hiphop** → MusicRadar Trap (full trap drums + A1 808 bass, tune 0)
- **dnb** → MusicRadar 170 Kit A (break kit + C2 bass, tune −3)
- **techno** → MusicRadar Digital (digital drum core + C2 bass, tune −3)

Each genre's chosen kit is built by `scripts/build-<genre>-kit.mjs` straight into `public/samples/<genre>/` (corrected `.wav` + verbatim `.raw.wav`, 0 health flags), listed in `kits/index.ts` `SAMPLE_OVERLAY`/`SAMPLE_TUNE`. The prototype/selector system is retired for these genres (their `protos/<genre>.ts` manifests are `{ variants: [] }`), so no selector shows — exactly House's end state. Licensing per genre in `public/samples/<genre>/CREDITS.md` (verify before commercial ship; the lofi packs have no explicit license file, flagged).

The generalized variant plumbing (`setGenreVariant`/`variantsFor`/`sampledRoles`/`sampleDir`, the `#soundcheck` dropdown, the sandbox "kit prototype" row) stays in place, dormant, ready to reuse for any future kit audition. The sandbox loadout is now grouped by band slot (rack order) with a `★ custom` badge on sample-backed voices. The same dev-only `★ custom` badge (driven by `sampledRoles(genre)`) also shows on the **weapon-select screen** and on **level-up pick cards**, so the genre's real sampled voices are visible at every offer.

**Enemy roster: spitter removed.** The projectile-firing enemy (spitter — kited at range and fired `EnemyShot`s at the player) was removed entirely at the developer's request: the `EnemyKind`, its config/band/`SPITTER` constants, spawn-mix weights, kite-and-fire AI, the `Enemy.fireT` field, and the whole `EnemyShot` system it solely owned (world array, `updateEnemyShots`, and view rendering + `makeEnemyShotGfx`) are gone. The roster is now eight kinds (swarmer, tank, darter, splitter, charger, circler, shielded, elite); spawn-mix weights are relative so the rest reweight automatically. Verified: `tsc` + `vite build` clean.

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

- July 9, 2026 — **Genre system removed entirely** at the developer's request; techno was removed, the House sound was kept unnamed, and the default tempo became 120 BPM. Genre-aware charts, UI, kits, ladders, and samples were collapsed into one `SOUNDSET`. TypeScript, the production build, and Chrome end-to-end checks passed. The deeper historical design docs still describe the superseded multi-genre model.
- July 8, 2026 — **Auto-move modes added** at the developer's request. Kiter flees nearby pressure; Greedy also detours for XP. Manual remains the default. The start selector, live debug button, and **B** hotkey work in both the run and sandbox, while the shared `autoMove` flag suppresses touch input whenever movement is automatic. TypeScript, the production build, and Chrome checks passed.
- July 8, 2026 — **Synthwave genre removed fully** at the developer's request. Its ladders, kits, sample assets, build scripts, metadata, and documentation references were deleted. TypeScript and the production build passed.
- July 8, 2026 — **Lo-Fi genre removed fully** at the developer's request. Its ladders, kits, sample assets, build scripts, metadata, and documentation references were deleted. TypeScript and the production build passed.
- July 7, 2026 — **Sound health-check room (`#soundcheck`) removed fully** at the developer's request, as a separate commit after the genre removal. Deleted `src/soundcheck/page.ts` (and the dir), the `#soundcheck` branch + dynamic import in `main.ts`, the "sound health check" start-screen button in `hud.ts`, all `.soundcheck`/`.sc-*` CSS in `style.css`, the now-dead `sampleFilesFor`/`sampleDir` exports in `kits/index.ts` (used only by the screen), and the 31 orphaned `public/samples/*/*.raw.wav` audition assets (their sole runtime consumer was the screen; the build scripts still keep a raw copy as the ffmpeg input, comments reworded off `#soundcheck`). The shared variant A/B plumbing (`variantsFor`/`get`/`setGenreVariant`/`sampledRoles`) stays — the sandbox still uses it. `tsc` + `vite build` clean.
- July 7, 2026 — **Hip-Hop and Drum & Bass genres removed fully** at the developer's request. `GenreId` narrowed to `'lofi' | 'house' | 'synthwave' | 'techno'`; four genres now ship. Deleted their dedicated code (`src/audio/ladders/{hiphop,dnb}.ts`, `src/audio/kits/{hiphop,dnb}.ts`, `src/audio/kits/protos/{hiphop,dnb}.ts`, `scripts/build-{hiphop,dnb}-kit.mjs`), their real sample folders (`public/samples/{hiphop,dnb}/` — WAVs, CREDITS, health reports), and every reference (genre metadata + `GENRES` in `genres.ts`, `BUILDERS`/`SAMPLE_OVERLAY`/`SAMPLE_TUNE` in `kits/index.ts`, `PROTOS` in `kits/protos/index.ts`, the affinity rows in `band.ts`, the two entries in `scripts/build-samples.mjs`, the two sections in `public/samples/health-report.md`). Kit/techno comments that named the two genres reworded (reese/tom/cowbell instruments stay — still used by the remaining genres). `tsc --noEmit` clean; `vite build` clean (chart guard passes). Docs updated (`plan.md`, `genres-and-weapons.md`).
- July 7, 2026 (`audio-refresh`) — **Spitter enemy removed** at the developer's request: the only projectile-firing enemy and the `EnemyShot` system it solely owned were deleted. TypeScript and the production build passed.
- July 7, 2026 (`audio-refresh`) — **`★ custom` dev badge extended** from the sandbox loadout to the **weapon-select screen** and **level-up pick cards** (same `sampledRoles(genre)` source), so the genre's real sampled voices are marked at every weapon offer.
- July 7, 2026 (`audio-refresh`) — **All six genres now ship a chosen sampled kit.** House adopted Wave Point "Tight Tech"; prototypes were built for the other five from downloaded packs, auditioned in-game via a generalized variant selector (`#soundcheck` dropdown + sandbox "kit prototype" row), and the developer **picked variant A for every genre**, each promoted into its shipped voicing (`build-<genre>-kit.mjs` → `public/samples/<genre>/`, wired into `SAMPLE_OVERLAY`/`SAMPLE_TUNE`; prototype folders removed, `protos/<genre>.ts` manifests emptied). The variant plumbing stays dormant for future auditions. Sandbox loadout regrouped by band slot. See the side-branch section above.
- July 7, 2026 — **Band sub-phase C implemented**: ride, riser, reese, choir, bell, and whistle were added with their sound, gameplay, charts, stats, and rendering. TypeScript, the production build, adversarial code review, and Chrome end-to-end checks passed. Awaiting the combined gate B+C.
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
- July 4, 2026 — Sub-phase B second pass: enemy HP, contact damage, and speed scale over the run; spawn pressure and late waves increased; chord became a thrown slow-zone; gem XP and the XP curve were retuned; magnet radius became 110; arrow-key/enter navigation and a direct debug level-up button were added. Awaiting the next Gate B playtest.
- July 4, 2026 — **Gate B failed again** with VS screenshots as the density reference: still super easy, the build always outscales the enemies regardless of picks, AFK in the middle is safe, screen still feels empty, AoE overpowered, and the chart overlay covers the whole game.
- July 4, 2026 — Sub-phase B third pass increased enemy HP, contact damage, swarm rate, wave caps, and late gem XP; weakened separation packed the horde into a wall. The chart overlay became a compact translucent dock. Awaiting the next Gate B playtest.
- July 4, 2026 — Enemy visual clarity (gate B note): a minute-7 swarmer was 16x tougher than a minute-1 swarmer but looked identical. Enemies now carry visual "toughness bands" that advance with the run (at 28% / 55% / 78% of the arc): color runs cool to hot per kind, size creeps up ~34%, and the top band gets a dark core. Shape stays the kind's read, band carries the danger read. One shared `enemyScaling` formula drives stats and band in both the run and the sandbox; the sandbox gained a stage-minute preview (0/2/4/6/8) whose spawn buttons and stat lines reflect the chosen minute. Verified in Chrome with a 4-band × 3-kind lineup.
- July 4, 2026 — **Gate B passed** on the third pass: the muted eight-minute run plays as a competent survivors-like with real picks.
- July 4, 2026 — The developer judged Kiter movement believable but spotted it abandoning large gem piles. Greedy movement was added as an experimental XP-seeking alternative.
- July 4, 2026 — Developer decision: the gem economy stays as it is (magnet 110, no merging, no consolidation). The "uncollected gems" gate-C item is closed by decision, not by change.
- July 4, 2026 — Scope decision: no deep per-weapon equalization in M2. Future systems would reshuffle weapon strength, so Gate C would judge whether every ladder remained respectable and fun by hand.
- July 4, 2026 — Sub-phase C frame-rate work landed: spatial hash single-cell insertion, squared-distance early-outs, shared render geometry, and off-screen culling.
- July 4, 2026 — **Gate C passed and M2 verdict: pass**, declared by the developer after full 8-minute runs with sound: music growing with the build creates the "I'm making a track" feeling. M2 complete. M3 (the drop) grilling deliberately not started yet, at the developer's request.
- July 5, 2026 — M3 grilling opened, then paused for a proof of concept. Genre system redefinition surfaced (genre lock swaps per-weapon ladder charts for parts of one composed destination track — the sketch→song flip; conversation-only, no spec). Developer ordered the POC before locking anything: reverse-engineer real tracks he loves into the engine, since a known-good composition isolates the variable (if a great track sounds bad, the problem is engine/samples, not composition). **Track Lab** built (`#tracklab`, `src/tracklab/`): labengine (string-keyed voices, per-track bpm/swing/sections, sidechain pump, per-voice tune), labkits (synthesized + CC0-sampled instruments), lab UI (cards, sections, mute/solo/volume, read-only grid + playhead). Five covers from a multi-agent research + adversarial-fact-check workflow: Sahara, METAMORPHOSIS, Pursuit, Satisfaction, Da Funk. All five verified firing in Chrome. Timing bug found and fixed (`2ee97bc`): samples pitched far from their recorded root stretch their transients, reading as delayed notes; cure is multi-octave rendering with chart notes near rate 1.0. Additive only — game untouched but for two entry links.
- July 5, 2026 — Satisfaction deep-dive listening loop. Developer's one taste change: remove the MacinTalk robot vocals (he didn't like them). Vocals unwired from the track (voice row, chart defs, drop + breakdown slots), then the five voice sample WAVs deleted from disk/git and dropped from the samples LICENSE. tsc clean, verified in Chrome (no voice reference survives in the track object). **Satisfaction passed the developer's ear** — "all sounds pretty good to me, audio is satisfying." First Track Lab cover to clear the listen gate.
- July 5, 2026 — POC treated as proven; **M3 grilling resumed and completed, M3 spec locked** (`docs/phases/m3-the-drop.md`). Design tree walked one question at a time. Key locks: emergent model; a **weapon is an instrument type** (not a fixed sound), re-skinned per track; a **track is the mechanical unit** (an exact recipe of instrument types → one composed song, deterministic), "genre" a flavor label over tracks; the lock is a **player-fired drop** armed by an **exact-match recipe** with **off-recipe instruments blocking** it; **vulnerable wind-up** (riser + silence, weapons cut, exposed) resolving on the next downbeat into a **synchronized slam + damage-amp window + strong visual/UI spectacle**; the first drop turns the composed track **on permanently**, re-drops are snappier surges gated by a **combat-charged energy meter**; the **re-score** keeps Model A (each part is still a weapon firing = damage + sound). M3's destination is **Satisfaction** (reuse the approved cover): catalog = the six existing weapons, recipe = five (kick, snare, hat, bass, lead), **chord is the blocking decoy**, fx riser/crash is the ceremony; sandbox force-assemble is the primary playtest path. The four parked M3 decisions resolved; new parked items recorded (exact-match collection loop + brick escape valve, item/sound effects, per-track signature effects). `docs/plan.md` genre paragraph and roadmap updated with pointers.
- July 6, 2026 — **Direction change: drop full tracks; genres become playable characters; expand to twelve weapons.** Six weapons and six genre characters were added with genre-aware charts, sound, and start/sandbox flows. TypeScript, the production build, and Chrome checks passed. Spec after the fact: `docs/phases/genres-and-weapons.md`. Awaiting the developer's ear/hands as the gate.
- July 6, 2026 — The Track Lab was restored as a standalone Experimentation room, and Phonk was replaced by Hip-Hop. The production build and Chrome genre checks passed.
- July 6, 2026 — **Band sub-phase B implemented**: rimshot, heartbeat, shaker, acid, pluck bass, and Rhodes were added with their sound, gameplay, stats, charts, and rendering. TypeScript, the production build, chart guards, and Chrome checks passed. Awaiting Gate B.
- July 6, 2026 — **Band sub-phase A gate passed** by the developer: a run built as a band sounds cleaner at full size and feels like assembling a character. The same playtest passed the co-judged genres-and-weapons material (six genre characters, twelve weapons, items, effects, VS enemies, UI redesign). Sub-phase B (the first six damage hires) is next.
- July 6, 2026 — **Band sub-phase A implemented**: the eight-slot taxonomy, slot-aware permanent picks, early drum nudge, kick-to-bass sidechain, band rack UI, and revised charts landed. TypeScript, the production build, Chrome checks, and adversarial review passed. Awaiting Gate A.
- July 6, 2026 — **The band grilling session held; spec locked** (`docs/phases/the-band.md`). The developer raised the cacophony problem (unlimited instruments, role collision) and proposed band slots; the session locked: eight typed band-position slots capping ownership (Pulse, Backbeat, Hats, Motion, FX/Transition, Bass, Harmony, Melody), permanent picks (no mid-run swap; parked as a future meta unlock), three offer rules (one candidate per slot per offer with genre-weighted roster draws, an early drum nudge, pick budget untouched), the band rack UI (HUD + pause menu, plain player-facing slot names: Beat/Snap/Tick/Groove/FX/Low/Color/Hook), and a 24-instrument catalog — twelve new instruments (heartbeat, rimshot, shaker, ride, acid, riser, Reese, pluck bass, Rhodes, choir pad, bell, whistle), exactly two of them utility weapons (ride = freeze sweep, riser = auto-dash; token damage, never zero). Three expert sub-agent reviews gated the locks: taxonomy (found my Accent slot was a grab-bag and the motion-layer collision ungated → the 8-slot cut), genre × slot stress test (no locks or rule-breaks needed; five design rules recorded: kick-ducks-bass, hip-hop bass off kick steps, Motion thinning in Hip-Hop/DnB, FX barred as starter, genre-weighted offers; plus lo-fi sparseness and techno-lead-stays-riffy chart discipline and an M4 timbre-ceiling flag), assignments (tom → Pulse on timbre grounds, Techno's chart as template; cowbell/arp/chord placements verified against code; zap tier-4 thinning). A fourth agent drafted the twelve instruments. Resolves the parked M2 slot-cap decision; `docs/plan.md` updated. Build order: A = system on today's twelve, B = six damage hires, C = last six + freeze/dash systems.
