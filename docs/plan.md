# Loop Survivors: Design Intent

This document describes the game and the rules it obeys. It is intent, not
status: what the design is trying to be, and the constraints that settle
arguments about how to build it. For what exists right now, read the code and
the git history.

> **Current player reference:** read
> [the Infinite Night Field Guide](field-guide.md) for every live system, passive,
> evolution recipe, enemy, and Sandbox tab.

## The Game in One Sentence

Vampire Survivors, but the weapons are sounds and a good build makes a track.

The player never touches music theory. Their gameplay decisions shape the
music, and the system guarantees the result always sounds decent.

## Pillars (rules that settle future arguments)

1. **The things that make sounds are the weapons.**
2. **The system owns the theory.** No player choice can make the mix bad.
   Nothing the player sees is stated in music-theory terms — never keys,
   scales, or BPM. Player-facing language is about feel.
3. **Muted, it's still a good survivors-like.** Music multiplies a working
   game, it never excuses a broken one. A muted run has to hold up on its own.
4. **Combinations over volume.** Depth comes from systems interacting, not
   from content mass.
5. **A run is a 30-minute authored set.** The Hush's assault follows an
   authored schedule from the first bar to the last; surviving all 30 minutes
   is victory, and the stage clears when the set completes. A run ends early
   only when The Hush overwhelms the player. There is no endless escalation.
6. **Career progress favors expression over stat grind.** Players collect
   music notes off the stage and choose weapons, passive items, and a few
   authored perks in the Afterhours Shop. Nothing unlocks automatically, and
   the shop never becomes an uncapped treadmill of permanent damage, health,
   or speed.

Cut, deliberately: a shareable per-run track artifact. No recording,
rendering, or sharing systems in v1.

## Run Shape

The whole run is a 30-minute authored set: a clean-room mirror of Vampire
Survivors' Mad Forest normal-mode schedule at its exact values (the locked
numbers live in [the Mad Forest spec](mad-forest-spec.md)). The enemy
faction is **The Hush**: living interference formed from static, cable, broken
stage equipment, light, and Soundwood growth rather than borrowed fantasy
monsters. Difficulty rises only through the schedule itself — tougher
variants, higher enemy floors, faster spawn drips, scheduled bosses and swarm
events — never through per-minute stat scaling, and the set plays at a
constant tempo. At 30:00 the stage clears and the run is won with a demo-end
win screen.

Scheduled boss enemies drop a **chest** on the
ground when defeated. Walking onto a chest starts a short slot-machine
ceremony — the case rattles under a reel of possible rewards while ticks climb
the run's own scale, then the reel stops on the payout. A ready weapon
evolution is always the top prize. Otherwise the chest pays 1, 3, or 5 free
level-ups of weapons and passives the player already owns (plus a small health
garnish), so a chest is never a dead reward at any point in a run. The payout
is physical: each level-up thuds onto the ground around the player one beat
after the last — pushing the horde back with every drop — and is collected by
walking onto it, with a pickup chirp that climbs while the player keeps
scooping. A save's
first chests follow a scripted 1-1-3-1-1-5 payout sequence, guaranteeing every
new player an early jackpot; after that, jackpots are rare rolls. Chests
opened while a ceremony is playing queue and present back to back.

A defeated enemy drops an **experience gem and nothing else**; a boss adds a
guaranteed music note alongside its chest. Everything else worth picking up
comes from the **Stage Light** — a destructible toppled follow-spot The Hush
has not finished consuming, glowing warm amber against the faction's cold
static. A handful stand on the field at any moment. They break silently under
weapon fire that happens to sweep them, never by being aimed at, and every
broken light drops exactly one pickup: usually music notes, sometimes a First
Aid, rarely a Stage Magnet. Hanging the floor economy on a prop the player has
to walk to and break makes gathering a positioning decision rather than a
passive dividend on kills.

A **First Aid** cross restores a fifth of maximum health. It is the only way to
heal by playing well rather than by reaching a menu, and unlike gems and notes
a Stage Magnet will not vacuum it in — reaching it is meant to be a decision.

A one-use **Stage Magnet** vacuums every freely collectible experience gem and
music note left anywhere on the map, however far off-screen, while
decision-bearing reward pedestals and chests remain deliberate walk-to-choose
interactions.

## Build Progression

A build has weapons and up to six passive items. Passives change recognizable
combat verbs—movement speed, projectile speed, piercing, wall bounces, size,
damage, duration, pickup reach, protection, and slow regeneration—so
combinations are useful even with the sound muted. Utility passives may stand
alone when the tradeoff is interesting; a passive is not required to be an
evolution ingredient. Once a weapon reaches its top level and the player owns
its paired passive at any level, the next chest offers an evolution. The
evolved weapon receives a new name, visuals, audio processing, damage profile,
and attack pattern; evolution is a qualitative transformation rather than
another percentage level.

After all normal build slots and levels are complete, level-ups become
**Encores**: a fixed two-option choice between a **First Aid**, worth a fifth
of maximum health, and a **Tip Jar** of 25 music notes granted on the spot.
Both are offered every time, even at full health. A maxed build's power is
final — the Encore keeps a level-up from being a dead reward without bolting a
late stat treadmill onto the authored weapon and item balance. A maxed build's
chests convert their leftover level-up hits into Tip Jars the same way.

## Meta Progression

Broken Stage Lights shed collectible music notes during a run, and every boss
drops one. Notes only enter the career wallet when the run ends, then the player spends them in the Afterhours Shop.
Purchases unlock new choice-space: instruments, passive items, and one
30%-health Second Wind. Later shelves open
after enough earlier purchases, but no survival result, kill total, or hidden
rank grants an unlock automatically.
The save is versioned, validated at load, and stored locally. Purchases are
finite and authored; there are no repeatable permanent damage, health, or
speed upgrades.

## Core Architecture

**The dividing rule: the stage conducts the gameplay, the build alone makes
the music.**

- The stage script is time and level driven. It owns spawn density, wave
  pressure, and boss timing. It carries no musical meaning and does not care
  how successful the build is. Bosses can meet a half-baked build or a monster.
- The build alone determines the player's music. The stage may act on the
  music only as a performer or conductor, never as a composer: it gets two
  narrow hooks (modulating global parameters like tempo, and injecting its own
  voice such as a boss instrument alongside the mix) and can never touch the
  build's charts, notes, or arrangement. The "I made a full track" feeling
  emerges because builds grow across a run: lone starting instrument,
  thickening arrangement, full sound. The music system is a pure function of
  build and grid; the stage's two hooks are reserved, not forbidden.

**Coupling (Model A).** Weapons fire on the musical grid. One trigger is one
event with two outputs: damage in the world and a sound in the mix. The
sequencer that decides when each weapon triggers is fire control and arranger
at once. It is the main engine of the game.

**Weapons as sound.**

- Each weapon is a distinct gameplay archetype (aura pulses, piercing bolts,
  sprays, melee arcs, orbiters, homing seekers, thrown zones, and so on), so a
  muted build already plays like a varied survivors-like. All weapons draw from
  one shared soundset at a time — one coherent voicing of the instrument
  catalog, one hand-authored set of patterns, and one fixed drum palette.
- Atomic unit: a **sound kit** plus a **music chart**. A kit is a small family
  of related samples per weapon (soft and hard variants, open and closed,
  multiple notes for pitched instruments). A chart says when, which variant,
  how hard, and for pitched weapons which note — so a pitched chart is a melody.
- Charts are AI-drafted and approved by the developer's ear.
- Variation is guaranteed at three layers: free per-hit engine nudges to
  loudness and pitch, baked kit variants, and progression-driven change (richer
  charts, new notes, new voices, changed character).

**The band cap.** A build holds a small fixed number of weapons and a small
fixed number of passive items, and picks are permanent. Any weapon may sit
alongside any other: there are no categories, no typed positions, and hiring
one weapon never retires another from the pool. Weapon slots are numbered by
the order they were filled, so the rack reads as the order the player built it.

The cap is the structural fix for cacophony by accumulation: a build stays
small enough to sound like a track rather than a pile of voices, and reaching
the cap turns every later level-up into deepening what is already playing.
Which voices collide is left to the player — a build that stacks two similar
instruments is allowed to, and is the player's own doing. (The exact cap
numbers and catalog size are implementation details; read `BUILD` in
`src/game/config.ts`.)

**Coherence skeleton.** Each run locks its set of allowed notes at the start.
Tempo is a live variable that design events may move. Because content is single
sounds rather than baked clips, tempo changes are nearly free — no
time-stretching.

**Tempo and damage.** Because charts fire on the grid, raising tempo
mathematically raises trigger rate and therefore damage throughput. This is
acknowledged, not fought: tempo is one damage lever, and per-trigger damage is
the other. Slow, hard-hitting builds are a legitimate archetype, so stage
pressure is tuned against a tempo range, never a constant, and slow builds stay
competitive through per-trigger damage rather than special-case compensation.

## Tech Stack

- **TypeScript + PixiJS v8** for rendering. Chosen after research: two-plus
  years inside AI training data on a stable API, official AI agent skills
  shipped in the npm package, and a particle system built for dynamic hordes.
  Phaser 4 was the runner-up, rejected because it shipped April 2026, after
  model training, with breaking changes exactly where thirteen years of Phaser
  3 priors would mislead an AI coder.
- **Web Audio directly** for sound. Sample-accurate scheduled playback by
  specification. The music scheduler is a thin lookahead layer over the audio
  clock. No middleware, no audio-engine building. Live effect chains are
  available, so baked-variant versus live-effect stays an open design choice.
