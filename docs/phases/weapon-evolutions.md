# Weapon Evolutions Spec

Status: **LOCKED July 15, 2026**, by the developer's explicit sign-off after
the grilling session of the same day. Drafted July 15, 2026. Parent plan:
`docs/plan.md`. Everything from M1, M2, `genres-and-weapons.md`, and
`the-band.md` carries forward unchanged unless amended here.

The nine weapon designs below are the locked-by-critique creative core (they
passed a two-axis adversarial review: musical-character alignment and
uniqueness). The six mechanic questions that were open pre-grill were settled
with the developer, one at a time, in the July 15 grilling session; the
decisions are folded into their sections below and summarized in "Grilling
decisions" at the end.

Answers this phase's question: **does taking a weapon to its final form feel
like a real transformation, in the hand and in the ear, or just a bigger number
on the same instrument?**

## Why this phase exists

The build today grows one way: each weapon climbs a four-tier ladder that makes
its chart denser or richer (`src/audio/ladders/house.ts`) and bumps its stats
(`WEAPONS` in `src/game/config.ts`). Tier 4 is more of tier 1, never something
new. Vampire Survivors' best moment is the evolution: a maxed weapon plus a
condition turns into a qualitatively different weapon with a new name, a new
behavior, and a new look. This phase brings that moment to Loop Survivors and
ties it to the one thing this game owns that VS does not: **the sound also
transforms.**

## What an evolution is

Every weapon has two forms:

- **Base form.** Tiers 1 through 4 as they exist now: the weapon's signature
  gameplay, growing in density/reach/damage along its ladder. Unchanged in
  spirit from `the-band.md`.
- **Evolved form.** A final transformation past tier 4. Same instrument, same
  band slot, but a new gameplay behavior (its "signature verb" sharpens or
  flips) **and a new timbre and arrangement**. The evolved form has its own
  name.

A build owns at most one instrument per band slot (`src/game/band.ts`), and two
slots hold two roster members each (Snap = snare/clap, Hook = lead/bell). So a
single run evolves at most **seven** weapons, one per slot. That is the ceiling
by design, not a bug: an evolution is a run-defining commitment, not a checklist.

## Core principle: sound transforms with gameplay, or the evolution fails

This is the non-negotiable that separates this phase from a stat bump, and it is
the developer's explicit requirement.

**An evolved weapon must SOUND different from its base form.** A denser chart on
the same kit voicing is not an evolution. When a weapon evolves, the player must
hear a new instrument take its place in the mix, not the old one playing more
notes. Concretely, an evolution changes both layers:

1. **Timbre (the voicing).** The evolved form gets its own kit voicing, either a
   re-synthesized variant in `src/audio/kits.ts` or a swapped sample via the
   `SAMPLE_OVERLAY` path in `src/audio/kits/index.ts`. A base kick is a tight
   punchy thump; the evolved kick is a deeper, rounder boom with a sub tail. The
   ear registers "the kick got bigger," not "the kick got busier."
2. **Arrangement (the chart).** The evolved form gets its own chart past the
   four-entry ladder (a fifth ladder slot, or a parallel evolved ladder). The
   pattern can change character, not just density: the evolved lead sustains and
   glides where the base lead plucked short notes.

**Gate rule.** At the sub-phase gate, an evolution that changes gameplay but
keeps the base timbre is a FAIL, even if it plays well. The transformation has
to land on the ear. This is Pillar 3 in reverse: normally we protect the game
from leaning on the music, but here the music is half the reward, and a silent
evolution is only half done. Each per-weapon entry below names its base sound and
its evolved sound in plain words so the developer can judge by ear, never by
theory.

## The nine weapons

Nine weapons across seven slots. Each owns one **signature verb** no other
weapon uses, on both axes it was reviewed against (does the gameplay + fantasy
match the real instrument, and is it distinct from every sibling). The
uniqueness matrix at the end is the contract.

### 1. Kick (Beat slot)

- **Fantasy:** you are the four-on-the-floor pulse of the whole floor, and every
  beat is a shock of pressure that throws the crowd off you.
- **Base "Four-on-the-Floor":** a hard percussive strip that stomps in your
  facing direction on every beat, with a light shove. (Today's Whip-mapped kick,
  `WEAPONS.kick`.)
- **Evolution "The Drop":** the stomp goes omnidirectional. Every beat erupts a
  pressure ring from your feet that damages and hard-launches enemies outward,
  keeping a clear bubble around you.
- **Base sound:** a tight, punchy thump on each of the four beats.
- **Evolved sound:** a deeper, fuller boom with a longer sub tail and a low
  "whoomph" underneath, so the four-on-the-floor turns heavy and physical.
- **Signature verb:** outward knockback pulse, on every beat.
- **Build role:** rhythmic spacing, the defensive crowd-control anchor.

### 2. Snare (Snap slot)

- **Fantasy:** a whip-crack on the backbeat that snaps across the field and rips
  a clean hole through a line.
- **Base "Backbeat Crack":** a fast, hard, piercing bolt on beats 2 and 4.
  (Today's snare sniper, `WEAPONS.snare`.)
- **Evolution "Rimshot Rail":** on the backbeat it snaps an instant rail through
  the densest line of enemies (auto-aimed at the most targets), infinite pierce,
  high single-hit damage, plus a snare-roll answering crack from the opposite
  angle.
- **Base sound:** a sharp, dry crack on 2 and 4.
- **Evolved sound:** the crack gains a metallic ring and a fast tail (a
  rimshot's ping), with a quick snare-roll flourish answering it a beat later.
- **Signature verb:** instant precise line-clear.
- **Build role:** the single-line burst, an elite and column cutter.

### 3. Clap (Snap slot)

- **Fantasy:** the crowd claps in unison and the space around you snaps shut on
  whatever's caught inside.
- **Base "Crowd Clap":** a wide forward slash cone close to you. (Today's clap
  melee arc, `WEAPONS.clap`.)
- **Evolution "Standing Ovation":** on the backbeat the crowd surrounds you and
  claps inward, a ring that collapses onto nearby enemies, crushing and briefly
  stunning everything caught.
- **Base sound:** a single flat hand-smack on the backbeat.
- **Evolved sound:** a layered crowd of hands with a room-sized reverb, so it
  reads as a whole hall clapping at once, wide and full.
- **Signature verb:** inward collapse plus stun (lockdown).
- **Build role:** hard crowd control, the lockdown that freezes a wall in place.

### 4. Hat (Tick slot)

- **Fantasy:** hi-hats ride your momentum, a fast metal stream that shreds
  whatever lies in the direction you are driving toward.
- **Base "Hi-Hat Shimmer":** a straight, linear stream of fast, weak chips fired
  in your travel direction with zero scatter (a single line). (Today's hat spray,
  `WEAPONS.hat`.)
- **Evolution "16th-Note Storm":** a continuous stream of shredding chips that all
  advance in your movement direction but spawn across a line perpendicular to it —
  a parallel wall of chips, exactly like the Vampire-Survivors knife evolution,
  with a bit more reach. Constant while the hat plays. See the amendment note.
- **Base sound:** a thin, closed "tss" tick on the off-beats.
- **Evolved sound:** an open, sizzling wash of fast hats, brighter and busier, a
  continuous shimmer that rides the run of 16th notes.
- **Signature verb:** continuous directional shred stream.
- **Build role:** mobile forward DPS, aimed by where you point yourself.

### 5. Arp (Groove slot)

- **Fantasy:** an arpeggio's rise and fall becomes a ring of blades that breathes
  out wide and pulls back tight around you.
- **Base "Arpeggio":** notes that orbit you as a rotating shield. (Today's arp
  orbiters, `WEAPONS.arp`.)
- **Evolution "Arp Carousel":** a dense spinning ring that breathes, sweeping
  wide on the arp's climb (clearing a large area) then tightening on its fall (a
  close guard), re-hitting as it sweeps.
- **Base sound:** clean plucked notes cycling up and down in a loop.
- **Evolved sound:** the same climb-and-fall but with a resonant filter sweep
  opening as the ring widens and closing as it tightens, wider and more liquid,
  so you hear the breathing.
- **Signature verb:** breathing rotating orbital barrier.
- **Build role:** the stationary bodyguard, area control that is always on.

### 6. Bass (Low slot)

- **Fantasy:** the sub rolls out like a tide, a wall of low pressure that
  flattens a whole lane as it travels.
- **Base "Bassline":** a slow, wide wave that rolls forward and pierces all.
  (Today's bass wave, `WEAPONS.bass`.)
- **Evolution "The Sub":** massive slow waves roll continuously across the arena,
  plus once per phrase a full-width sub-drop wall crosses the whole screen with
  heavy area damage.
- **Base sound:** a round, staccato off-beat bass note answering the kick.
- **Evolved sound:** a deeper, sustained rolling sub with a wobble on the drop
  (the "wub" of the sub-drop wall), lower and heavier than anything else in the
  mix.
- **Signature verb:** widest slow traveling wall of raw damage.
- **Build role:** the widest raw area weapon, the horde-thinner.

### 7. Chord (Color slot)

- **Fantasy:** a sustained chord hangs over the ground you choose, dragging
  everything caught in it to a crawl.
- **Base "Chord Stab":** a zone thrown onto the nearest pack that ticks damage
  and slows. (Today's chord slow-zone, `WEAPONS.chord`.)
- **Evolution "Sustain":** a large sustained field placed on the densest pack
  that heavily slows and steadily damages, lingering far longer than any other
  effect in the game.
- **Base sound:** a short, syncopated piano stab.
- **Evolved sound:** the stab opens into a held, lush pad that swells slowly and
  hangs in the air, atmospheric, coloring the space it controls.
- **Signature verb:** placed persistent slow-field (area denial).
- **Build role:** area denial, the control field you drop on a choke.

### 8. Lead (Hook slot)

- **Fantasy:** the lead is a single sustained voice that latches onto whatever
  matters most and slides to the next the instant it falls.
- **Base "Lead Melody":** a beam that locks onto one target and fires a short
  zap into it per melody note. It never misses (what the old homing was for),
  but reads as one voice aimed at one thing.
- **Evolution "The Solo":** the beam locks onto the **nearest** target, burns it
  down with continuous damage, and holds it (sticky) until it dies or leaves the
  screen, then glides (portamento) to the next nearest, an unbroken line that
  never stops singing. (Amended July 15: nearest + sticky, not toughest-priority
  — see the amendment note.)
- **Base sound:** short, plucked melody notes, one per note in the phrase.
- **Evolved sound:** one sustained, singing lead that glides between notes with
  audible portamento, expressive and held — a clear voice that sits in the mix,
  not a harsh or overbearing one (tamed at the gate: lower level, no resonant
  whistle).
- **Signature verb:** sustained lock-and-glide beam.
- **Build role:** single-target melt (locks and holds the nearest, glides on).
- **Note:** this weapon's design changed during review. The base was originally
  homing seekers; the critic (correctly) flagged homing as generic dressing that
  did not reflect how a lead line actually sounds. The sustained beam grounds the
  weapon in a lead's real character: one continuous voice that holds one note at
  a time.
- **LOCKED at grilling: the base change is confirmed.** Base Lead becomes the
  lock-on beam (one short zap per plucked melody note, never misses); the
  evolution turns the separate zaps into one unbroken gliding beam. Homing
  seekers stay shipped until sub-phase C builds the beam, and sub-phase C's
  gate explicitly includes "does base Lead still feel good."

### 9. Bell (Hook slot)

- **Fantasy:** a struck bell shatters into a cascade of glass that keeps
  sparkling outward.
- **Base "Bell Chime":** a note lobbed straight that shatters into shards on its
  first hit. (Today's bell shatter, `WEAPONS.bell` + `BELL`.)
- **Evolution "Carillon":** a bright shot that shatters into many shards, and
  each shard shatters once more on impact, a cascading chain of sparkle across a
  pack.
- **Base sound:** a single, twinkly music-box ping.
- **Evolved sound:** a bigger, richer bell with overtones that ring out and
  cascade into shimmering echoes, a chord of bells rather than one chime.
- **Signature verb:** cascading shatter-chain multiplication.
- **Build role:** crowd multiplication, damage that spreads itself through a pack.

## Uniqueness guarantee (the contract)

No two weapons share a signature verb or a tactical niche. This is the standard
every future edit to this spec must hold.

| Weapon | Signature verb | Tactical niche |
|---|---|---|
| Kick | outward knockback pulse | rhythmic spacing / defensive CC |
| Snare | instant piercing rail | single-line burst, elite line-cutter |
| Clap | inward collapse + stun | hard lockdown CC |
| Hat | continuous directional stream | mobile forward DPS |
| Arp | breathing orbital ring | stationary bodyguard |
| Bass | slow traveling wall | widest raw AoE |
| Chord | placed slow-field | area denial |
| Lead | lock-and-glide beam | single-target elite melt |
| Bell | shatter-chain | crowd multiplication |

Two overlap risks were checked and cleared during review:

- **Three crowd-control weapons, three different mechanics.** Kick pushes
  **out** (knockback), Clap pulls and freezes **in** (stun), Chord drags to a
  **crawl** (slow). Push, stun, and slow are distinct feels and distinct build
  roles.
- **Three area weapons, three different footprints.** Bass **travels** across
  the field, Chord is **placed** and lingers, Kick **pulses in place** on the
  beat. No two read as the same effect.
### Amendment — July 15, 2026 (developer-directed, sub-phase C gate loop)

During the sub-phase C gate the developer directed several changes:

- **Hat toward a Vampire-Survivors-knife feel.** Hat "16th-Note Storm" dropped
  the movement-speed coupling (a still player no longer goes quiet); it is now a
  **constant stream shaped like the VS knife evolution** — every chip advances in
  the player's movement heading (zero angular scatter) but spawns across a line
  perpendicular to it (`HAT_STORM.lineHalfWidth`), so the chips form a parallel
  wall, with a bit more reach. **Base Hat** (tiers 1-4) fires the same heading with
  **zero scatter** (a single straight line). Both read `player.moveDirX/Y`, a unit
  vector that holds the last heading while idle. Sound untouched, gate rule holds.

- **Kick base re-hit bug fixed.** The four-on-the-floor strip was re-hitting the
  same enemy every beat (the per-target lock was documented in the code but never
  implemented). Added a shared per-enemy cooldown (`Enemy.kickHitT`, `KICK_REHIT_S`
  = 1.35 s): the strip now hits each enemy at most once per 1.35 s, as intended.
  This de-inflates base-kick DPS (single target ~30.5→11.4 at T4), so kick balance
  can finally be judged on real numbers. The evolved ring ("The Drop") is
  unaffected (per-beat by design).

- **Global rule: no off-screen targeting or damage.** No weapon (base or evolved)
  may target or deal damage to anything outside the visible screen. Enforced at
  two choke points in `run.ts`: an `onScreen(e)` test filters every targeting
  helper (`nearestEnemy`, `densestEnemy`) and gates `damageEnemy` (which all
  weapon damage flows through). The visible rect is the camera (player foot),
  `worldW x worldH`, plus each enemy's radius (partially-visible counts). This is
  a broad gameplay rule, not evolution-specific.

- **Lead "The Solo" retargeting + sound.** The beam now locks the **nearest**
  target (not the toughest) and holds it **sticky** until it dies or leaves the
  screen, then glides to the next nearest. Its evolved voicing was **tamed** (the
  developer found it jarring and too loud): level cut ~0.4→0.26, the resonant
  lowpass peak removed (Q 2→0.8, cutoff lowered), gentler soft-clip, calmer
  vibrato. Base Lead's voicing is unchanged (the developer likes it). The tamed
  timbre is an ear-gate item.

(A parallel Snare rework toward the same directional feel was tried in this loop
and then reverted at the developer's direction: the instant densest-line rail +
answering crack remains the intended evolved Snare, unchanged from its lock.)

**Balance pass (July 16, power-neutral / mostly-nerf).** A DPS bench (real chart
cadence at 122 BPM, one 4-bar phrase against infinite-HP sponges) plus a senior
balance review found the evolved band's power concentrated in three crowd
outliers, with three other evolutions reading as single-target sidegrades. The
developer chose a power-neutral pass: pull the outliers down toward the pack and
apply only the buffs that could not be nerfs. Applied:

- arp EVO: `WEAPONS.arp[EVO].damage` 4→2 + `ARP_CAROUSEL.rehitS` 0.18→0.28 (~3582→~1499 swarm DPS).
- chord EVO: `WEAPONS.chord[EVO].damage` (per tick) 8→3 (~3245→~1217 swarm).
- kick EVO: `WEAPONS.kick[EVO].damage` 22→11 (~2237→~1118 swarm).
- lead EVO: `WEAPONS.lead[EVO].damage` (per tick) 5→10 — Lead becomes the single-target king (~46→~92 single), its intended niche; it locks one target so this can't leak into crowd DPS.
- clap EVO: `WEAPONS.clap[EVO].damage` 8→12 — evolving now clears T4 on single (8.1<11.7 → ~12.2).
- bell EVO: `WEAPONS.bell[EVO].damage` 6→8 — evolving now clears T4 on single (12.4<15.3 → ~16.5).

The crowd-clear band is now ~500–1500 swarm DPS (was ~167–3582), Lead clearly
tops single-target, and no evolution is a downgrade of its own tier 4. Base-tier
pacing kinks the review flagged (chord T2==T3, hat T1==T2, snare T3, lead T1–T2
floor) were left for a later pass. All numbers remain placeholders the gate can
retune; the bench harness was a throwaway and was removed.

## New engine systems required (implementation map)

The evolutions do not all fit the current `WeaponConf` shape. Grounding each
against real code seams so grilling and implementation price this honestly.

| Evolution | Cost | What is needed |
|---|---|---|
| Kick "The Drop" | new | radial expanding-ring hitbox on each beat + a knockback-launch channel. The old crash "Shock" system (removed with FX) is the closest ancestor; the boss module has its own shock/dash to reference. |
| Snare "Rimshot Rail" | new | instant/hitscan line targeting the densest enemy row, infinite pierce, plus a second angled crack. New: line-selection targeting. |
| Clap "Standing Ovation" | new | a collapsing-ring hitbox and a brief full stop: a timed **0× speed multiplier** per enemy caught, riding the same speed channel slow already uses (`ZONE_SLOW_MUL`), plus a frozen visual tell. The boss is immune to the stop and takes only the damage. |
| Hat "16th-Note Storm" | new | a persistent stream emitting chips at a constant rate in the player's movement heading (amended from movement-speed-coupled emission). New: movement-heading directional stream. |
| Arp "Arp Carousel" | extend | orbiters with a time-varying `orbitRadius` synced to the arp phrase. Extends today's fixed-radius orbiters (`ARP_OMEGA`, `ORBIT_REHIT_S`). |
| Bass "The Sub" | extend | continuous rolling waves (exist) + a once-per-phrase full-width screen-crossing wall. Extends `VARIANT_EFFECTS.bassSub` + `SHAKE.bassSub`. |
| Chord "Sustain" | extend | a large, long-lived placed field with a stronger slow. Extends `VARIANT_EFFECTS.chordPad` and the zone system. Lowest new-system cost. |
| Lead "The Solo" | new | a **beam** system: continuous tick damage to a locked target, priority target selection (toughest on screen), and instant glide-retarget on target death. New: beam + priority targeting. |
| Bell "Carillon" | extend | one extra shatter generation (shards shatter once more on impact, depth 2). Extends the existing `BELL` shatter. |

Biggest new systems, in rough build-cost order: the **beam** (lead), the
**radial knockback pulse** (kick), the **instant line-rail** (snare), the
**movement-coupled aura** (hat), the **collapsing ring** (clap — its stop rides
the existing speed channel, so no status framework), the **breathing orbit**
(arp). Bass, chord, and bell are extensions of systems that already ship.

## Sound-transformation work (the other half)

Per the core principle, every evolution ships a new voicing and a new chart.
Priced as content, mirroring `the-band.md`'s chart math:

- **9 evolved voicings** in `src/audio/kits.ts` (re-synthesized) or via
  `SAMPLE_OVERLAY` (`src/audio/kits/index.ts`) where synthesis falls short. Same
  rule as the base kits: anything that sounds cheap to the developer's ear swaps
  to a CC0 sample.
- **9 evolved charts** past the four-entry ladder in `src/audio/ladders/`, one
  per weapon, authored so the arrangement changes character, not just density.
- Chart authoring is AI-drafted, approved by the developer's ear, as always.

The developer is not a musician, so every evolved sound is described in plain
words in its weapon entry above (what it sounds like, and its gameplay role),
never by technique. His ear is the gate.

## Visual-transformation work (LOCKED at grilling)

The transformation must read on screen as well as on the ear. Scope:

- **A distinct silhouette per evolved effect** (all 9), in the game's vector
  style, held to the same standard the base weapons already meet (snare bolt vs
  hat chip vs bass wave front). The new-behavior evolutions get this almost
  free because their geometry is new anyway (kick ring, snare rail, lead beam,
  clap collapse); the extension evolutions (bass, chord, bell, arp) need
  deliberate silhouette work so they do not read as "the same thing, larger."
- **A frozen visual tell** on clap-stopped enemies, so the full stop reads as
  intended and not as a glitch.
- **The band rack shows the evolved name** from the moment the evolution lands.
- **A shared evolution ceremony**: reuse the existing level-up "moment"
  plumbing (brief slow-mo, ducked weapons, screen pulse) with the evolved
  weapon's name shown, fired when the evolution lands on its bar.

Out of scope, deliberately: player-body changes and bespoke per-weapon
ceremonies. Gate-time judgment can always ask for more.

## Persistence (LOCKED at grilling)

- **Permanent once taken.** No revert, no downgrade, no swap — like every pick
  since the band made hires permanent (`the-band.md`).
- **Next-bar entry**, like every pick: the new behavior, the new sound, and the
  ceremony land together on the bar boundary. A sound never changes damage
  before it is heard (the standing rule from the parity work).
- **A tier change for the deactivate rules.** Deactivation stickiness carries
  over (`instrument-deactivate.md`): evolving a deactivated instrument applies
  the evolution while the voice stays off; it returns evolved on reactivation.
- **Pool consequences.** Today a tier-4 weapon leaves the pick pool; now it
  instead contributes its guaranteed evolution card, and once evolved it leaves
  the pool for good. The "everything maxed" heal fallback simply triggers
  later. No rule change.
- **Sandbox force-evolve.** The sandbox loadout editor can set a weapon
  directly to its evolved form, so gate playtests do not spend five picks per
  test. In scope for sub-phase A.

## Evolution trigger (LOCKED at grilling)

Vampire Survivors evolves a weapon when it is maxed AND the player owns a
specific passive item, then opens a chest. Loop Survivors has **no passive items
and no chests** (both removed; the pick pool is weapons + tier-ups only). The
locked trigger:

**Max-then-offer, guaranteed.** Once a weapon reaches tier 4, its evolution
card enters the level-up offers and is **guaranteed one of the three cards in
every offer until taken**. It costs one pick, like anything else: the choice
stays deliberate, but eligibility is expensive enough (four picks into one
weapon) that the payoff is never hidden behind a bad roll. If two weapons are
eligible at once, both cards show — they sit in different band slots, and the
one-candidate-per-slot rule already allows it.

**Pacing intent.** A typical full-band run lands **one** evolution; a committed
narrow build lands **two**. The arithmetic enforces this without extra gating:
maxing a weapon costs 4 picks and the evolution is a 5th, against ~13 level-ups
a run. The XP curve is untouched by this phase; if the gate says evolutions
feel unreachable, the level-up count is the tuning knob then, not a spec
change.

**Eligibility is a swappable rule.** The trigger code is written as a
per-weapon eligibility check (today: "tier 4") so future ideas slot in without
touching anything else. Two such ideas were raised at grilling and deliberately
parked, blocking nothing in this phase:

- **Passive items.** The developer intends a future items phase (items are on
  the parked list in `docs/plan.md`): VS-style unique item + maxed weapon
  pairings, one item per weapon. When that phase lands, eligibility tightens to
  "tier 4 AND owns the paired item." Items get their own grill; nothing here
  depends on them.
- **Chest-style delivery.** Granting evolutions from a chest-like drop instead
  of the pick pool, closer to VS ceremony. A future variation on the same seam.

## Balance and content math

- Per-evolution stat blocks are placeholders until the gate, same as
  `src/game/config.ts` today. Expect a new evolved-tier entry per weapon in
  `WEAPONS`, plus new constants for the new systems (stun duration, beam
  tick/dps, pulse knockback, cloud emission rate).
- Content: **9 evolved gameplay behaviors, 9 evolved voicings, 9 evolved
  charts**, plus the six new engine systems above. At most 7 evolve in any one
  run (slot cap), but all 9 must ship because the two double-slots (Snap, Hook)
  each offer a choice.
- The two-axis critique already gated the creative layer. Balance and feel are
  the developer's gate, below.

## Build sub-phases, each gated by the developer

Sequenced so the riskiest new systems and the two hardest sounds do not all land
at once, mirroring `the-band.md`'s A/B/C shape.

- **Sub-phase A, the trigger and one full evolution.** Build the locked
  trigger (max-then-offer with the guaranteed card), the shared evolution
  ceremony, sandbox force-evolve, and ship **one** weapon end to end, base to
  evolved, gameplay AND sound, as the vertical slice. Kick "The Drop" is the
  candidate: its knockback pulse and its bigger, deeper boom are the clearest
  single test of the core principle. Gate: taking the kick to The Drop feels
  like a transformation in the hand and in the ear, and the trigger feels
  right.
- **Sub-phase B, the extensions.** The evolutions that extend existing systems:
  Bass "The Sub", Chord "Sustain", Bell "Carillon", Arp "Arp Carousel". Each
  with its evolved voicing and chart. Gate: each evolution plays and sounds like
  a real transformation, not a scaled tier.
- **Sub-phase C, the new systems.** The riskiest material together: Clap
  "Standing Ovation" (collapsing ring + full-stop freeze), Lead "The Solo"
  (beam + priority targeting, **including base Lead's respec** from homing
  seekers to the per-note lock-on beam), Snare "Rimshot Rail" (instant
  line-rail), Hat "16th-Note Storm" (movement-coupled aura). Gate: the new
  systems feel good, read clearly, their evolved sounds land, and base Lead
  still feels good as a beam.

Nothing advances past a gate without an explicit pass; a failed gate loops within
its sub-phase and never pushes problems downstream. Between gates, the developer
is brought only decisions that need taste (evolved sound A/Bs in the rehearsal
room, feel tuning), never code plumbing.

## Verdict protocol

After sub-phase C the developer plays full runs, evolving weapons across several
builds, and declares pass or fail on the phase's question by his own judgment.
The outcome is recorded in `docs/STATUS.md`. A pass folds evolutions into the
roadmap ahead of M4; a fail gets reworked at the level the failure points to.

## Grilling decisions (July 15, 2026)

The six pre-grill open questions, settled with the developer one at a time.
The full detail of each lives in its section above; this is the ledger.

1. **The evolution trigger:** max-then-offer, with the card **guaranteed** one
   of the three offers once a weapon hits tier 4, until taken. Costs one pick.
   Eligibility written as a swappable per-weapon rule. Passive items and
   chest-style delivery were raised, discussed, and deliberately parked — they
   block nothing in this phase.
2. **Budget and pacing:** one evolution in a typical full-band run, two in a
   committed narrow run, enforced by pick arithmetic alone. XP curve untouched;
   level-up count is the gate-time tuning knob.
3. **Base forms:** base Lead's respec to the per-note lock-on beam is
   **confirmed**. Homing seekers ship until sub-phase C; that sub-phase's gate
   judges the base feel too. No other base form changes.
4. **Stun:** no new status framework. Clap's freeze is a brief timed **0×
   speed multiplier** on the existing speed channel, with a per-enemy timer and
   a frozen visual tell. The boss is immune to the stop and takes only the
   damage.
5. **Evolved-form visuals:** distinct silhouette per evolution, the stun tell,
   the evolved name on the band rack, and one shared ceremony reusing the
   level-up moment plumbing. Player-body changes and bespoke ceremonies out of
   scope.
6. **Persistence:** permanent once taken, next-bar entry, sticky through
   deactivation, pool exit after evolving (heal fallback unaffected), sandbox
   force-evolve in scope for sub-phase A.
