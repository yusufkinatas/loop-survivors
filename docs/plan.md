# Loop Survivors: Design Intent

This document describes the game and the rules it obeys. It is intent, not
status: what the design is trying to be, and the constraints that settle
arguments about how to build it. For what exists right now, read the code and
the git history.

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
5. **A run ends when the crowd wins.** There is no victory timer. Threat rises
   at every minute mark forever, with authored opening acts flowing into a
   procedural tour that must eventually overwhelm the player.
6. **Career progress favors expression over stat grind.** Reputation unlocks
   weapons, passive items, venues, and a few authored late-career perks. It
   never becomes an uncapped treadmill of permanent damage, health, or speed.

Cut, deliberately: a shareable per-run track artifact. No recording,
rendering, or sharing systems in v1.

## Run Shape

The first eight minutes are a deliberately authored opening act. After that,
an endless director recombines enemy families, formation patterns, population
pressure, elite modifiers, and five-minute Headliner encounters. Every minute
is a visible threat step: enemy health, damage, speed, rewards, density, and a
small tempo lift scale together. Scaling is slow enough that a strong build can
keep finding a new ceiling, but uncapped health and damage ensure every run
eventually ends.

Every five minutes the **Infinite Night Tour** moves to a new venue. Before the
transition, the player walks through one of two stage gates; each offers a
legible benefit and danger. Venues change the arena art, sampled drum palette,
and a bounded combat rule without rewriting the build's composition.

Two run systems reward movement and mounting danger:

- **Neon Loop** remembers the player's path at the end of each minute, then
  turns it into a temporary glowing rail that slows enemies and reflects moving
  attacks.
- **Pressure Break** fills from close calls and close-range kills. When full,
  it banks one short four-beat section (four steady counts of the music),
  briefly muffles the track and slows moving attacks, then replays the stored
  sounds and attacks as one amplified burst.

## Build Progression

A build has weapons and up to six passive items. Passives change recognizable
combat verbs—movement speed, projectile speed, piercing, wall bounces, size,
damage, duration, pickup reach, and protection—so combinations are useful even
with the sound muted. Once a weapon and its paired passive are both maxed, the
next Headliner drops an evolution case. The evolved weapon receives a new
name, visuals, audio processing, damage profile, and attack pattern; evolution
is a qualitative transformation rather than another percentage level.

After all normal build slots and levels are complete, level-ups become Encore
picks. Encore bonuses are small, diminishing run-only improvements, preventing
dead rewards without displacing the authored weapon and item balance.

## Meta Progression

Death settles reputation from survival, kills, level, evolutions, bosses, and
new venues. Reputation advances a fifteen-rank career ladder. Rank rewards add
new choice-space: instruments, passive items, venues, rerolls, an optional
starting passive, and one late-career second chance. The save is versioned,
validated at load, and stored locally. The two fixed combat perks are a tier-I
starting passive and one 30%-health Second Wind; there are no repeatable
permanent-stat purchases, and the authored ladder ends at rank fifteen.

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
  catalog and one set of hand-authored patterns. The venue may rotate among
  curated drum palettes; this changes texture, not notes, charts, or build
  power, and is never presented as a player theory decision.
- Atomic unit: a **sound kit** plus a **music chart**. A kit is a small family
  of related samples per weapon (soft and hard variants, open and closed,
  multiple notes for pitched instruments). A chart says when, which variant,
  how hard, and for pitched weapons which note — so a pitched chart is a melody.
- Charts are AI-drafted and approved by the developer's ear.
- Variation is guaranteed at three layers: free per-hit engine nudges to
  loudness and pitch, baked kit variants, and progression-driven change (richer
  charts, new notes, new voices, changed character).

**The band cap.** Instruments live in typed band-position slots. A build holds
at most one instrument per slot, and picks are permanent, so a full build is a
band — one voice per slot, each in its own frequency lane and rhythmic job.
Filling a slot retires that slot's other candidates from the pick pool. This is
the structural fix for cacophony by accumulation and role collision: it is what
keeps a full build sounding like a track instead of a pile of voices. (The
exact slot count and catalog size are implementation details; read the code.)

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
