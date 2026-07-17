# Loop Survivors: Infinite Night Field Guide

This is the concise player-facing reference for the current game. It explains
what happens during a run, what every build choice does, how career unlocks
work, and what the Sandbox can test. `docs/plan.md` remains the design intent;
this guide describes the playable systems.

Three instrument names used below may be unfamiliar:

- **Hi-hat** — a pair of small cymbals that supplies the short ticking sound.
- **Chord** — several notes played together as one hit.
- **Arp** — short for *arpeggio*: a chord's notes played one after another
  instead of all at once.

## A run at a glance

Move with WASD, the arrow keys, or the touch joystick. Weapons fire
automatically in time with the track: one heard hit creates one gameplay
attack. Blue gems give experience. A level-up drops three physical reward
pedestals around the player; walk into one to take it. A build can hold one
weapon in each of seven band positions and up to six passive items.

There is no victory timer. The first eight minutes are an authored opening
act; from minute eight onward, the endless director combines enemy families
and formations indefinitely. The run ends only when The Hush overwhelms the
player.

## Endless pressure

Every minute boundary announces a new pressure level, spawns a visible
formation, slightly speeds up the track, and locks stronger stats onto newly
spawned enemies.

| Pressure change | Rule at each minute |
| --- | --- |
| Enemy health | Multiplied by 1.08, compounding forever |
| Contact damage | Multiplied by 1.025, compounding forever |
| Enemy movement | +0.75% per minute, capped at +30% for visual clarity |
| Experience value | +1.5% per minute |
| Track speed | +0.2% per minute, capped at +8% |
| Headliner health | Adds another 40% of base health at each five-minute step |

From minute 12, ordinary enemies can become gold-marked **Amped** variants.
They have 2.2 times the health, deal 25% more damage, give three times the
experience, and always drop music-note currency. Their chance gradually rises
to 18%. Health and damage have no ceiling, so even an exceptional build
eventually meets a crowd it cannot clear.

## Music notes and the Afterhours Shop

Gold music notes are career currency, separate from blue experience gems.
Ordinary enemies have a small drop chance, and a seventh kill after six misses
guarantees a note. Strong ordinary enemies can drop notes worth two
or three; bosses drop 10; Headliners drop 25. Notes are physical pickups, so
the player must collect them before the run ends. Pickup-range bonuses also
help pull them in.

Collected notes bank into the career wallet when the run ends. Spend them in
the **Afterhours Shop** on the title screen. Unlocks are never granted
automatically for surviving, leveling, or reaching a rank: **the player always
chooses what to buy**. Buying enough items reveals later shelves.

The starting collection contains Kick, Snare, Hi-hat, Bass, and Chord; four
passives (High-Tops, Fast Forward, Mirrorball, and Wide Lens); and Neon Alley,
Midnight Warehouse, and Velvet Rooftop.

| Shelf opens after | Purchases available |
| --- | --- |
| 0 owned | First Reroll (35), Heavy Amp (45), Clap (55) |
| 2 owned | Arp (90), Needle Tips (65), Last Metro (110) |
| 5 owned | Lead (130), Extension Cable (75), Padded Jacket (85), Acid Basement (140) |
| 8 owned | Bell (180), Magnet Lanyard (110), Second Wind (160), Tour Loadout (150) |
| 12 owned | Second Reroll (200), Dawn Afterparty (220), Headliner Gold (300) |

Second Wind revives the player once per run at 30% health. Tour Loadout lets
the player choose one unlocked passive to start at tier I. Headliner Gold is a
cosmetic gold treatment for venues, enemies, and evolutions; it grants no
combat power. There are no repeatable permanent damage, health, or speed
purchases.

## The nine passive items

Every passive has five levels. The table shows its recognizable purpose and
its total effect at level five.

| Passive | Level-five effect | Evolution partner |
| --- | --- | --- |
| High-Tops | +20% movement speed | Kick |
| Fast Forward | +50% speed for moving projectiles | Snare |
| Needle Tips | +3 pierce and +12% moving-projectile damage | Lead |
| Mirrorball | 3 wall bounces, retaining 85% power after each bounce | Hi-hat |
| Wide Lens | +30% attack area and +15% orbit distance | Chord |
| Heavy Amp | +25% damage and +20% enemy shove | Bass |
| Extension Cable | +40% projectile, zone, and orbiter duration | Arp |
| Magnet Lanyard | +100% pickup range and +40% pull speed | Bell |
| Padded Jacket | +40 maximum health, immediate healing as it levels, and +2 armor | Clap |

## The nine weapon evolutions

Raise a weapon to tier IV and its paired passive to level five. The next
collected Encore Case offers any completed recipe. An evolution changes the
attack pattern, visual language, audio processing, and damage behavior; it is
not merely another percentage upgrade.

| Maxed recipe | Evolution | What it becomes |
| --- | --- | --- |
| Kick + High-Tops | **Redline Stomp** | Four floor strips cross the complete arena in one colossal stomp. |
| Snare + Fast Forward | **Railshot** | An instant 900-range beam with unlimited pierce; every fourth hit fires twin rails. |
| Hi-hat + Mirrorball | **Prism Rain** | Fast blades redirect through distinct targets in a controlled ricochet storm. |
| Bass + Heavy Amp | **Subquake** | The directional wave becomes an expanding ring with unlimited pierce. |
| Chord + Wide Lens | **Afterhours** | Huge drifting slow zones seek dense crowds and merge into larger supercells. |
| Lead + Needle Tips | **Neon Serpent** | A homing serpent pierces six targets and grows a giant head every fifth trigger. |
| Clap + Padded Jacket | **Standing Ovation** | A full-arena ring blasts outward, claps inward, and rewards packed crowds. |
| Arp + Extension Cable | **Event Horizon** | Counter-rotating pairs form a dense, breathing crown around the player. |
| Bell + Magnet Lanyard | **Gravity Bell** | Impact pulls the crowd inward, then shatters into ten seeking crystals. |

Once every ordinary weapon and passive reward is exhausted, level-ups become
**Encore** choices: heal 15 health, add 2% run-only damage (up to 20%), add 2%
movement speed (up to 10%), or add 3% area (up to 15%).

## The Infinite Night Tour

At every five-minute transition, two route gates appear before the venue
changes. Walk through one to choose the next stop. Each venue has one readable
advantage and one danger, and it also selects a matching drum-sound set.

| Venue | Rule |
| --- | --- |
| **Neon Alley — Wall Runner** | Moving projectiles gain one free bounce; enemies move 12% faster. |
| **Midnight Warehouse — Moving Spotlights** | Enemies in the light take 20% more damage; the player moves 8% slower outside it. |
| **Velvet Rooftop — Crosswind** | Wind shifts projectile speed and direction by up to 18%; enemies move 8% faster. |
| **Last Metro — Last Train** | Every 40 seconds, a warned lane deals 30 player damage and clears ordinary enemies. |
| **Acid Basement — Flooded Floor** | Puddles slow enemies 30% and the player 10%; zones last 20% longer. |
| **Dawn Afterparty — First Light** | Standing in light heals 1 health every 2 seconds; contact damage is 25% higher. |

## Three signature run systems

### Neon Loop

During seconds 50–56 of each minute, Neon Loop records the player's path. It
shows a preview for the final four seconds, then becomes a solid glowing rail
for 24 seconds after the minute changes. Enemies crossing it are slowed by 30%.
Moving player projectiles receive one free reflection from it, losing 15% power
but gaining a little lifetime; later reflections consume normal Mirrorball
bounces. Crossing the recorded path over itself creates especially useful
rail geometry and records a career milestone.

### Pressure Break

Pressure rises while enemies crowd within the player's body radius plus 130
units and gains an extra two points from close-range kills. Empty space drains
it; taking a hit removes 30 points. At 100%, the next four-beat section — four
steady counts of the track — is banked instead of firing normally. The music
muffles and moving attacks slow almost to a stop. At the following boundary,
the stored sounds and attacks replay together at 15% extra damage, followed by
a 45-second cooldown.

### Headliners and Encore Cases

Headliners are gold-marked bosses at five-minute pressure points. Later tour
stops can send up to four at once. A defeated Headliner drops 25 music notes
and a physical Encore Case. If a maxed weapon/passive recipe is ready, the case
offers an evolution. If no recipe is ready, collecting it restores 15 health.

## The Hush bestiary

The Hush is living interference: static, broken stage equipment, cable, light,
and Soundwood growth that gathers wherever the show becomes loud. Internal
behaviors stay deliberately readable even when the screen is crowded.

| Enemy | Behavior read |
| --- | --- |
| **Static Mite** | The weakest direct chaser and the one-health baseline. |
| **Flare Mite** | A larger, tougher mite that advances with the pack. |
| **Night Mite** | The broad armored mite that forms the opening crowd. |
| **Cable Husk** | A slow, steady walker. |
| **Jackwalker** | A tougher rigid walker worth more experience. |
| **Echo Shard** | A fast phasing chaser that ignores knockback. |
| **Moss Cabinet** | A very durable, slow speaker-stack wall with heavy knockback resistance. |
| **Cracked Cabinet** | A lighter angular cabinet that joins late dense waves. |
| **Mute Bloom** | A nearly stationary body used to build a temporary closing ring around the player. |
| **Static Rush** | A one-health signal shard that sweeps across the screen in a fixed direction. |
| **Signal Crown** | A scaling, knockbackable boss that can award an upgrade. |
| **The Shear** | A huge 500-base-health boss that cannot be knocked back. |
| **Shardling** | A tiny chaser released four at a time when a Crackbox breaks. |
| **Wallstack** | A slow, high-health endless-tour tank. |
| **Needlejack** | Repeatedly aims, dashes in a straight line, stops, and aims again. |
| **Crackbox** | A durable carrier that breaks into four Shardlings on death. |
| **Rail Ram** | Stops for a clear warning, then commits to a fast straight charge. |
| **Orbit Leech** | Circles the player at range instead of joining the direct pack. |
| **Phase Guard** | Carries a shield equal to its health; the barrier must break first. |
| **Blackout Idol** | A huge slow objective retained as a Sandbox-only stress-test fixture. |

## Audio and venue palettes

The soundtrack uses **house music** — dance music built around a steady
four-count beat. The nine live weapons were voiced from scratch with Web Audio,
meaning their sounds are generated by the game rather than taken from a
prerecorded song loop. Pitched weapons always use a safe shared set of notes,
so build choices can change the arrangement without making it clash.

A **drum palette** is one complete set of kick, snare, clap, hi-hat, and accent
sounds. The game ships three:

- **Midnight Warehouse:** deep club kick, smoky snap, crisp metal ticks, and a
  dry wooden accent. Used by Neon Alley and Acid Basement.
- **Velvet Rooftop:** round clean kick, softer drums, airy cymbals, and a bright
  triangle accent. Used by Velvet Rooftop and Dawn Afterparty.
- **Acid Circuit:** hard electronic kick, filtered snares, tiny ticks, and
  glitch percussion. Used by Midnight Warehouse and Last Metro.

The final instrument channels are calibrated after any venue palette is
loaded: Hi-hat runs at about 71% of its old channel level, while Chord runs at
133% and Arp at 141%. Evolution loudness adjustments multiply those calibrated
levels instead of resetting them, so the balance stays consistent all night.

The 18 drum samples are CC0 public-domain recordings. Every file was trimmed,
level-balanced, converted to mono 44.1 kHz WAV, probed, and fully decoded with
FFmpeg. Exact provenance is in `docs/audio-sources.md`.

## The four-tab Sandbox

The Sandbox runs the real arena with the automatic stage director disabled.
Its controls are deliberately reversible, so it can test a system without
altering the player's career.

- **Combat:** set threat/player level; spawn all 20 enemy fixtures near the
  player, in groups of eight, or as rings; create a Headliner or complete
  minute wave; toggle invulnerability; clear the arena.
- **Build:** set every live weapon tier and all nine passive levels; assemble or
  clear a full loadout; toggle each of the nine complete evolution recipes;
  inspect the live combined modifiers.
- **Tour:** switch among all six venues, open the real walk-through route-gate
  demo, and read their rules; arm, begin, release, or reset Pressure Break;
  install or clear a figure-eight Neon Loop.
- **Career:** use a disposable in-memory note wallet; create physical note
  drops or a note shower; grant testing currency; exercise the real gated
  17-offer Afterhours Shop. Nothing in this tab touches the player save.
