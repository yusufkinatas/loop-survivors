# Loop Survivors: Design Intent

This document describes the game and the rules it obeys. It is the design
contract used to settle implementation decisions. For a concise description of
everything a player can currently encounter, read the
[Neon Crypt Field Guide](field-guide.md).

The current pixel-art implementation is scheduled for a ground-up replacement.
Its autonomous production workflow and the only two player decision gates live
in the [Pixel-Art Overhaul handoff](pixelart-overhaul.md).

## The game in one sentence

A survivors-like in which every weapon is an instrument, every automatic
attack adds to the track, and every run ends only when an endlessly escalating
dark-fantasy horde finally overwhelms the player.

## Pillars

1. **The things that make sounds are the weapons.** One scheduled trigger
   produces both the audible hit and its gameplay attack.
2. **The system owns the music theory.** The player chooses combat behavior;
   the game keeps the notes and timing compatible. Player-facing copy describes
   what an attack does, not keys, scales, or production terminology.
3. **Muted, it is still a good survivors-like.** Movement, targeting, enemy
   reads, build decisions, and combat feedback must work without audio.
4. **Combinations over content mass.** A small catalog of strongly different
   weapons and passives should create more depth than many interchangeable
   percentage upgrades.
5. **Every run is endless.** There is no victory timer. Every minute raises the
   threat, and enemy health and contact damage have no ceiling.
6. **Career progress expands choices, not permanent raw power.** Music notes buy
   a finite set of authored weapons, passives, perks, and cosmetics. Nothing is
   awarded automatically by an invisible rank.
7. **The Neon Crypt is genuine pixel art.** Actors, attacks, pickups, effects,
   and icons use coherent raster sprites with hard transparency,
   nearest-neighbor sampling, integer-friendly scale, and readable silhouettes.

Deliberately out of scope for v1: recording, rendering, or sharing a completed
track as a separate artifact.

## Round lifecycle

### 1. Dedicated starting-weapon choice

A normal round creates the player at level 1 with zero experience and no
weapon. The game samples up to three distinct weapons from the unlocked live
catalog and places their labeled pickups around the player. This is its own
opening state, not a fake level-up:

- movement remains responsive, but the combat clock, enemies, recovery, and
  progression do not advance;
- only weapons can appear;
- collecting one installs it at tier I and removes every other opening pickup;
- the choice grants no experience and does not change the player's level;
- positions are clamped inside the visible play area, and the enemy director
  has not started, so every choice is visible and reachable;
- a profile with fewer than three live weapons receives however many exist;
  malformed legacy data with none receives one supported fallback weapon.

The selected weapon starts the clock and releases combat. No normal round may
advance without a weapon.

### 2. Authored opening act

Minutes 0–7 use authored wave rows, population floors, fixed-direction swarms,
temporary closing rings, and boss events. This teaches the Neon Crypt roster in
controlled combinations before the procedural director takes over at 8:00.

### 3. Endless director

At every whole minute, newly spawned enemies lock in that minute's scale and a
visible formation announces the step. The track also becomes slightly faster.
The rules are deterministic and uncapped where they must eventually win:

| Value | Minute rule |
| --- | --- |
| Enemy health | `1.08 ^ minute` |
| Contact damage | `1.025 ^ minute` |
| Movement speed | `1 + 0.0075 × minute`, capped at `1.30` |
| Experience value | `1 + 0.015 × minute` |
| Track speed | +0.2% per minute, capped at +8% |
| Headliner health | +40% of its already-scaled health per completed five-minute step |

Minutes 8–14 each have an authored endless roster. Minute 15 onward combines
adjacent roster rows cyclically. The population floor rises toward 360, spawn
intervals slowly shorten toward 0.22 seconds, and every five-minute boundary
adds Headliners. One appears at first; the count reaches two at minute 15,
three at minute 30, and four at minute 45 and beyond.

From minute 12, ordinary enemies can spawn as gold-marked **Amped** variants.
Their chance rises by 1.5 percentage points per minute to an 18% ceiling. They
have 2.2 times normal health, deal 25% more contact damage, give three times the
experience, and always leave music-note currency. Speed remains capped for
readability; health and damage do not, so death is inevitable rather than
scripted.

### 4. Settlement

Death ends the round. Collected music notes, survival time, kills, Headliners,
milestones, weapon damage, weapon kills, and evolutions are committed to the
local career profile. Uncollected floor currency is not banked.

## Combat rewards and build rules

Experience gems only advance the current round. A level-up rolls up to three
eligible physical rewards, clears breathing room around the player, briefly
slows the action and lowers weapon volume, then asks the player to walk into
one pickup. Item pickups show the exact next-tier effect in one line.

Ordinary rewards can:

- hire or improve one of nine live weapons through tier IV;
- add or improve one of ten passive items through level five;
- offer capped, run-only Encore bonuses after the finite build pool is empty.

Each of seven band positions holds at most one weapon, so Snare competes with
Clap and Lead competes with Bell. A build also holds at most six passives. The
first two minutes gently favor an empty Beat or Snap position, and from player
level 5 the reward roll includes a passive while fewer than two are owned,
provided an eligible passive exists. These nudges prevent brittle starts
without choosing the build for the player.

Weapon changes land on the next heard musical bar so sound and gameplay change
together. Passive effects apply immediately. Rerolls affect ordinary rewards,
not opening weapons or evolution decisions.

## Weapons, passives, and evolutions

The live weapon set is Kick, Snare, Hi-hat, Bass, Chord, Clap, Arp, Lead, and
Bell. Their base behaviors cover facing strips, piercing shots, chip sprays,
wide waves, thrown slowing zones, close slashes, orbiters, homing seekers, and
shattering projectiles.

The passive set is High-Tops, Fast Forward, Needle Tips, Mirrorball, Wide Lens,
Heavy Amp, Extension Cable, Magnet Lanyard, Padded Jacket, and Recovery Tape.
They modify movement, projectile speed, piercing, boundary bounces, attack
area, damage and shove, duration, pickup reach, health and armor, or health
regeneration. Recovery Tape intentionally has no evolution recipe; a useful
passive does not need to be a recipe tax.

Nine recipes pair every weapon with one maxed passive. A weapon at tier IV and
its partner at level five becomes eligible, but it changes only when the player
collects a Headliner's Encore Case. The resulting evolution must change the
attack pattern, sprite, effects, audio processing, and damage behavior—not just
raise a multiplier. The complete recipes and exact effects live in the
[field guide](field-guide.md#weapon-evolutions).

When ordinary build rewards are exhausted, level-ups offer small run-only
Encore choices: +15 health, +2% damage up to +20%, +2% movement up to +10%, or
+3% attack area up to +15%. Healing remains available after every stat cap.

## Headliners and Encore Cases

Headliners are gold-highlighted bosses placed at five-minute threat steps.
Their health receives the additional five-minute multiplier described above.
A defeated Headliner leaves 25 music notes and one deliberate walk-to-collect
Encore Case.

If one or more recipes are ready, the case presents up to three eligible
evolutions. Selecting one consumes that case. If no recipe is ready, collection
immediately restores 15 health. Cases are never swept up by ordinary pickup
range and cannot be rerolled.

## Neon Crypt enemies and visual language

The roster contains 20 distinct named enemies. Twelve drive the authored
opening and its events; seventeen participate in endless recipes; the remaining
special fixtures keep the Sandbox useful for movement, shield, split, charge,
orbit, boss, and extreme-density testing. Stable simulation identities preserve
their proven stats and behavior while the player sees the new Neon Crypt names
and coherent dark-fantasy sprites. The full bestiary is in the
[field guide](field-guide.md#neon-crypt-bestiary).

The committed pixel-art system uses two transparent PNG atlases:

- a 72-cell gameplay atlas with two-frame player and enemy animations, normal
  and evolved attacks for all nine weapons, pickups, impacts, explosions, and
  collection effects;
- a 20-cell UI atlas with all passive and status/action icons.

Every cell is 96 × 96 pixels. The asset builder removes the chroma background,
normalizes fully transparent pixels, permits only hard alpha, and validates
frame borders and mappings. PixiJS forces nearest-neighbor sampling globally.
Original source boards and licensing are recorded in
[`public/art/pixel/SOURCE_AND_LICENSE.md`](../public/art/pixel/SOURCE_AND_LICENSE.md).

Visual priority is semantic separation: the player reads first, hostile bodies
share a family but retain silhouettes, each weapon keeps its identity color,
experience and currency cannot be confused, and rewards remain legible through
dense effects.

## Career progression

Enemies leave gold music notes separately from experience. Notes use normal
pickup movement and enter the wallet only at round settlement. The Afterhours
Shop contains 15 finite purchases across five collection shelves: four new
weapons, six new passives, two rerolls, Second Wind, an optional Starting
Passive, and a cosmetic gold treatment. The base profile already owns five
weapons and four passives.

Second Wind revives the player once per round at 30% health. Starting Passive
lets the player choose one unlocked passive to begin at level one; it never
replaces the dedicated opening weapon choice. The gold treatment changes
Headliners and evolution presentation without combat power.

The v3 save schema validates every ID and repairs derived unlock state. Older
profiles migrate forward, preserve live progression, and receive a one-time
exact-price refund for purchases whose content no longer exists. The career
never offers repeatable permanent damage, health, or movement upgrades.

## Music architecture

**The stage conducts gameplay; the build alone composes the track.**

- The director owns time, enemy combinations, density, bosses, and the small
  global tempo rise. It never edits weapon charts or notes.
- The build determines which voices exist and which four-tier charts fire.
- A shared allowed-note set keeps pitched weapons compatible.
- One sequencer trigger is the coupling point for both audio and combat.

The live soundset is a 122-beat-per-minute house arrangement with nine complete
voice ladders. “House” here means dance music built on a steady four-count
beat. Instrument sounds are created with Web Audio, with validated CC0 drum
one-shots layered where available. Hi-hat, Chord, and Arp receive explicit
channel calibration so dense ticks do not dominate quieter pitched voices.
Evolution gain changes multiply those calibrated levels instead of replacing
them.

Because weapon attacks fire on the musical grid, tempo changes affect damage
through trigger rate. Per-trigger balance and the bounded tempo rise are tuned
together; slow, heavy attacks and fast, light attacks remain distinct.

## Sandbox contract

The Sandbox uses the real arena with scripted spawning disabled and an
in-memory career profile. Its three tabs are permanent coverage surfaces:

- **Combat:** exact threat minute and player level, all 20 enemy kinds, a full
  endless minute wave, a Headliner, invulnerability, and arena clearing.
- **Build:** every live weapon tier, every passive level, all nine evolution
  recipes, full-build and clear controls, and a combined-modifier readout.
- **Career:** isolated note grants, XP and music-note floor fixtures, a mixed
  pickup field, an Encore Case, and the real gated 15-offer shop.

Sandbox actions must be reversible and must never read or write the player's
stored career.

## Technology

- **TypeScript and Vite** for the application and build.
- **PixiJS v8** for atlas rendering, layered effects, and horde-scale display.
- **Web Audio** for sample-accurate scheduling and live voice processing.
- **No test framework:** focused TypeScript verification scripts cover pure
  systems, migrations, starting choices, atlas integrity, and endless recipes;
  `npm run check`, `npm run build`, and browser inspection remain release gates.
