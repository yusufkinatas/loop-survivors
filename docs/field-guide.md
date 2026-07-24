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
pedestals around the player; item pedestals print the exact next-tier effect in
one line, and the pause screen lists every current passive total. Walk into one
pedestal to take it. A build can hold up to five weapons and up to five passive
items, in any combination — no weapon locks another out. Once both caps are
full, level-ups deepen what is already there.

A run opens silent and unarmed: three weapon pedestals drop around the player,
and walking into one arms that weapon at tier I on the next bar. The choice
costs no level.

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
| Boss health | Adds another 40% of base health at each five-minute step |

From minute 12, ordinary enemies can become gold-marked **Amped** variants.
They have 2.2 times the health, deal 25% more damage, give three times the
experience, and always drop music-note currency. Their chance gradually rises
to 18%. Health and damage have no ceiling, so even an exceptional build
eventually meets a crowd it cannot clear.

## Music notes and the Afterhours Shop

Gold music notes are career currency, separate from blue experience gems.
Ordinary enemies have a small drop chance, and a seventh kill after six misses
guarantees a note. Strong ordinary enemies can drop notes worth two or three;
bosses drop 10. Notes are physical pickups, so the player must collect them
before the run ends. Pickup-range bonuses also help pull them in.

Collected notes bank into the career wallet when the run ends. Spend them in
the **Afterhours Shop** on the title screen. Unlocks are never granted
automatically for surviving, leveling, or reaching a rank: **the player always
chooses what to buy**. Buying enough items reveals later shelves.

The starting collection contains Kick, Snare, Hi-hat, Bass, and Chord, plus
four passives (High-Tops, Fast Forward, Mirrorball, and Wide Lens).

| Shelf opens after | Purchases available |
| --- | --- |
| 0 owned | Heavy Amp (90), Recovery Tape (100), Clap (110) |
| 2 owned | Arp (180), Needle Tips (130) |
| 5 owned | Lead (260), Extension Cable (150), Padded Jacket (170), Double Take (280) |
| 8 owned | Magnet (220), Second Wind (320) |

Second Wind revives the player once per run at 30% health. There are no
repeatable permanent damage, health, or speed purchases.

## Rare floor pickup: Stage Magnet

Every eligible enemy kill has a 0.12% chance to drop a **Stage Magnet**. Bad
luck cannot last forever: the 700th eligible kill without one guarantees the
drop. That is the whole rule — a lucky streak may drop several in a row, any
number can wait on the floor at once, and one left behind stays there for the
rest of the run.

Walk onto it to snapshot every blue/green/red experience gem and gold music
note left anywhere on the map, including everything dropped screens away
earlier in the run. They surge into the player at high speed
through their normal collection rules, so experience multipliers, queued
level-ups, note values, and pickup bonuses remain correct. New drops created
after the activation are not pulled. The Stage Magnet deliberately leaves
level-up reward pedestals and chests alone because those are player choices
rather than loose resources. It is also separate from the permanent **Magnet
Lanyard** passive.

## Rare floor pickup: First Aid

Every eligible enemy kill has a 0.12% chance to drop a **First Aid** cross on
the floor where the enemy died. That is the whole rule: a flat probability, on
its own random stream so it cannot make Stage Magnets rarer. A lucky streak may
drop several in a row, any number can wait on the floor, and one you walk past
stays there for the rest of the run.

Walking onto it restores **20% of maximum health**, so the heal keeps pace with
Padded Jacket rather than shrinking against a raised ceiling. Collecting it at
high health is allowed and simply tops the player up — overheal is clamped, not
refused. Leaving it on the floor until it is needed is a legitimate play.

A Stage Magnet does **not** vacuum it. Like a chest, it must be walked onto, so
deciding whether to cross the arena for it stays a real decision.

## The eleven passive items

Every passive has five levels except Double Take, which deliberately stops at
two. The table shows each one's recognizable purpose and its total effect at
maximum level. Nine passives complete weapon recipes; Recovery Tape and Double
Take are deliberately standalone, so a useful item does not always need to be
an evolution ingredient.

| Passive | Effect at maximum level | Evolution partner |
| --- | --- | --- |
| High-Tops | +20% movement speed | Kick |
| Fast Forward | +100% speed for moving projectiles | Snare |
| Needle Tips | +5 pierce for moving projectiles | Lead |
| Mirrorball | 3 wall bounces, retaining 85% power after each bounce | Hi-hat |
| Wide Lens | +30% attack area and +15% orbit distance | Chord |
| Heavy Amp | +25% damage and +20% enemy shove | Bass |
| Extension Cable | +40% projectile, zone, and orbiter duration | Arp |
| Magnet | +100% pickup range and +40% pull speed | None — standalone |
| Padded Jacket | +40 maximum health, immediate healing as it levels, and +2 armor | Clap |
| Recovery Tape | Restores 0.5 HP per second while below maximum health | None — standalone |
| Double Take | +2 emissions from every weapon that emits a countable thing | None — standalone |

## The eight weapon evolutions

Raise a weapon to its maximum level and own its paired passive at any level —
level one is enough. The next collected chest offers any completed recipe. An
evolution changes the attack pattern, visual language, audio processing, and
damage behavior; it is not merely another percentage upgrade.

| Recipe | Evolution | What it becomes |
| --- | --- | --- |
| Kick + High-Tops | **Redline Stomp** | Four floor strips cross the complete arena in one colossal stomp. |
| Snare + Fast Forward | **Railshot** | An instant 900-range beam with unlimited pierce; every fourth hit fires twin rails. |
| Hi-hat + Mirrorball | **Strobe Lane** | A barrage of chips rails toward the nearest enemy, piercing everything in the lane. |
| Bass + Heavy Amp | **Subquake** | The directional wave becomes an expanding ring with unlimited pierce. |
| Chord + Wide Lens | **Afterhours** | Huge drifting slow zones seek dense crowds and merge into larger supercells. |
| Lead + Needle Tips | **Neon Serpent** | A homing serpent pierces seven targets — eleven with Needle Tips maxed — and grows a giant head every fifth trigger. |
| Clap + Padded Jacket | **Two Hands** | Paired slabs snap shut on the nearest few enemies and crush whatever they close on. |
| Arp + Extension Cable | **Event Horizon** | Counter-rotating pairs form a dense, breathing crown around the player. |

Once every ordinary weapon and passive reward is exhausted, level-ups become
**Encore** choices: heal 15 health, add 2% run-only damage (up to 20%), add 2%
movement speed (up to 10%), or add 3% area (up to 15%).

## Elite bosses and chests

Elite and boss enemies are the Vampire-Survivors-style objectives of a run.
The authored opening act sends a boss at each five-minute mark and elite
objectives in between, and from minute eight the endless director keeps
spawning periodic gold-marked elite bosses whose health scales with the run.

Every defeated elite or boss drops a **chest** on the ground. Chests are not
magnetized, so the player walks onto one to open it. If a completed
weapon/passive recipe is ready, the chest offers an evolution; otherwise it
restores 15 health. Bosses also drop 10 music notes.

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
| **Wallstack** | A slow, high-health endless-run tank. |
| **Needlejack** | Repeatedly aims, dashes in a straight line, stops, and aims again. |
| **Crackbox** | A durable carrier that breaks into four Shardlings on death. |
| **Orbit Leech** | Circles the player at range instead of joining the direct pack. |
| **Phase Guard** | Carries a shield equal to its health; the barrier must break first. |
| **Blackout Idol** | A huge slow elite objective; it drops a chest on death. |
| **Practice Cabinet** | A Sandbox-only target that never moves, never hits back, and never dies; it prints live damage per second instead. |

## Audio

The soundtrack uses **house music** — dance music built around a steady
four-count beat. The eight live weapons were voiced from scratch with Web Audio,
meaning their sounds are generated by the game rather than taken from a
prerecorded song loop. Pitched weapons always use a safe shared set of notes,
so build choices can change the arrangement without making it clash.

A **drum palette** is one complete set of kick, snare, clap, hi-hat, and accent
sounds. The game ships one:

- **Midnight Warehouse:** deep club kick, smoky snap, crisp metal ticks, and a
  dry wooden accent.

The final instrument channels are calibrated after the drum palette is loaded:
Hi-hat runs at about 71% of its old channel level, while Chord runs at 133% and
Arp at 178%. Evolution loudness adjustments multiply those calibrated levels
instead of resetting them, so the balance stays consistent all night.

The 6 drum samples are CC0 public-domain recordings. Every file was trimmed,
level-balanced, converted to mono 44.1 kHz WAV, probed, and fully decoded with
FFmpeg. Exact provenance is in `docs/audio-sources.md`.

## The three-tab Sandbox

The Sandbox runs the real arena with the automatic stage director disabled.
Its controls are deliberately reversible, so it can test a system without
altering the player's career.

- **Combat:** set threat/player level; spawn all 20 enemy fixtures near the
  player, in groups of eight, or as rings; create an elite boss or complete
  minute wave; drop or clear practice dummies; toggle invulnerability; clear
  the arena.
- **Build:** set every live weapon tier and all eleven passive levels; assemble
  or clear a full loadout; toggle each of the eight complete evolution recipes;
  inspect the live combined modifiers.
- **Career:** use a disposable in-memory note wallet; create physical notes,
  XP pickup fields, Stage Magnets, and chests; trigger the map-wide vacuum;
  grant testing currency; exercise the real gated Afterhours Shop. Nothing in
  this tab touches the player save.
