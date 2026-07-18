# Loop Survivors: Neon Crypt Field Guide

This is the concise “everything new and how it works” reference for the live
game. [`plan.md`](plan.md) contains the deeper design rules.

Three instrument names used below may be unfamiliar:

- **Hi-hat** — a pair of small cymbals that makes the short ticking sound.
- **Chord** — several notes played together as one hit.
- **Arp** — short for *arpeggio*: a chord's notes played one after another.

## A round from the first second

Move with WASD, the arrow keys, or the touch joystick. Weapons aim and fire
automatically in time with the track: one heard hit creates one gameplay
attack.

You now begin every normal round at **level 1, zero XP, and no weapon**. Up to
three distinct random weapons from your unlocked live collection appear as
labeled pickups around you. Walk into one to choose it. The other opening
pickups vanish, the chosen weapon starts at tier I, and combat begins.

This opening is not a level-up. It grants no XP, does not change your level,
and cannot contain passives or perks. Before you choose, you can move, but the
round clock, enemies, and progression wait. The pickups are clamped inside the
visible area and appear before enemies, so they are reachable. If a repaired or
very small profile has fewer than three weapons, the game safely shows fewer
rather than duplicating or crashing.

An unlocked **Starting Passive** may already be at level one when this happens,
but it never supplies a weapon or skips the opening choice.

## Experience and ordinary level-ups

Blue, green, and red gems give XP. When you level up, enemies near the player
are pushed away and up to three physical reward pickups appear. The action
briefly slows and the weapon mix becomes quieter so the choice is readable.
Walk into one reward; the others disappear.

Ordinary rewards include:

- a new eligible weapon or an upgrade, through tier IV;
- a new passive or an upgrade, through level five;
- small run-only Encore bonuses once the finite weapon/passive pool is empty.

Weapon changes enter on the next heard musical bar so the new sound and attack
arrive together. Passive effects apply immediately. Every item pickup displays
its exact next-tier effect as a one-line description, and the pause screen shows
current totals.

A build holds one weapon in each of seven band positions and no more than six
passives. Snare and Clap compete for the same position; Lead and Bell compete
for another. Taking one retires the other from that round. During the first two
minutes the roll gently favors an empty Beat or Snap position. From player
level 5, at least one passive is included while you own fewer than two, if an
eligible passive remains.

There is no random general-purpose floor-item system. Loose resources are XP
gems and music notes; deliberate choices are the opening weapons, level-up
rewards, and Encore Cases.

## Endless minute scaling

There is no victory timer. Minutes 0–7 form an authored opening act with dense
waves, directional swarms, temporary closing rings, and bosses. At 8:00 the
endless director takes over. Minutes 8–14 have specific enemy combinations;
from minute 15 onward, neighboring combinations are merged and cycled forever.

Every minute boundary announces a new threat step, creates a visible formation,
and locks stronger values onto newly spawned enemies:

| Value | Exact rule at minute `m` |
| --- | --- |
| Enemy health | `1.08 ^ m` |
| Contact damage | `1.025 ^ m` |
| Movement speed | `1 + 0.0075 × m`, capped at 1.30 |
| Experience value | `1 + 0.015 × m` |
| Track speed | +0.2% per minute, capped at +8% |
| Headliner health | `1 + 0.4 × floor(m / 5)` after ordinary scaling |
| Endless population floor | `min(360, 180 + 8 × m)` |
| Endless spawn interval | Slowly falls toward a 0.22-second minimum |

From minute 12, ordinary enemies can be **Amped**: gold-marked versions with
2.2 times health, 25% more contact damage, three times XP, and a guaranteed
music note. Their chance rises by 1.5 percentage points each minute until it
reaches 18%.

Enemy speed and track speed stop rising so motion stays readable. Health and
damage never stop. A strong build can survive for a long time, but the numbers
eventually overtake every build.

## The nine weapons

Weapons have four tiers. Their charts become busier as they level, while their
combat identity remains recognizable.

| Weapon | Band position | Base behavior |
| --- | --- | --- |
| **Kick** | Beat | A horizontal strike on the facing side; later tiers add an opposite-side follow-up. |
| **Snare** | Snap | A sparse, fast, hard piercing shot that drills through a line. |
| **Hi-hat** | Tick | A dense spray of tiny fast chips. Tier I damage is high enough to kill the weakest enemy even on its quietest hit. |
| **Bass** | Low | One slow, broad wave that passes through the crowd and grows heavier and wider. |
| **Chord** | Color | A damaging slow zone thrown onto the nearest group; louder hits stamp larger zones. |
| **Clap** | Snap | An instant close-range forward slash with a wide cone and strong crowd control. |
| **Arp** | Groove | Notes orbit the player and repeatedly chip enemies they sweep through. |
| **Lead** | Hook | Bright homing seekers that rarely miss and gain piercing at high tier. |
| **Bell** | Hook | A straight crystal note that shatters into a radial burst on its first impact. |

The base profile owns Kick, Snare, Hi-hat, Bass, and Chord. Clap, Arp, Lead,
and Bell come from the Afterhours Shop.

## The ten passives

Every passive has five levels. The table shows its total level-five effect.

| Passive | Level-five effect | Recipe partner |
| --- | --- | --- |
| **High-Tops** | +20% movement speed | Kick |
| **Fast Forward** | +50% moving-projectile speed | Snare |
| **Needle Tips** | +3 pierce and +12% moving-projectile damage | Lead |
| **Mirrorball** | Three screen-boundary bounces, retaining 85% power after each | Hi-hat |
| **Wide Lens** | +30% attack area and +15% orbit distance | Chord |
| **Heavy Amp** | +25% damage and +20% enemy shove | Bass |
| **Extension Cable** | +40% projectile, zone, and orbiter duration | Arp |
| **Magnet Lanyard** | +100% pickup range and +40% pull speed | Bell |
| **Padded Jacket** | +40 maximum health, healing as it levels, and +2 armor | Clap |
| **Recovery Tape** | Restores 0.5 HP per second while below maximum health | None; deliberately standalone |

Only six passives fit in one round. A passive remains worthwhile even when its
partner is absent, and Recovery Tape proves that not every item must unlock an
evolution.

## Weapon evolutions

Raise a weapon to tier IV and its paired passive to level five. That completes
a recipe. The next collected Encore Case can then transform the weapon. An
evolution changes its sprite, combat effects, audio processing, damage, and
attack pattern rather than merely adding another level.

| Maxed recipe | Evolution | New attack |
| --- | --- | --- |
| Kick + High-Tops | **Redline Stomp** | Four crossing attacks cover the arena in one colossal stomp. |
| Snare + Fast Forward | **Railshot** | An instant 900-range beam with unlimited pierce; every fourth hit adds twin beams. |
| Hi-hat + Mirrorball | **Prism Rain** | Faster blades redirect between distinct targets in a controlled ricochet storm. |
| Bass + Heavy Amp | **Subquake** | The directional wave becomes an expanding, unlimited-pierce seismic ring. |
| Chord + Wide Lens | **Afterhours** | Huge drifting slow zones seek the densest crowd and merge into supercells. |
| Lead + Needle Tips | **Neon Serpent** | A sharp homing serpent pierces six targets and grows a giant head every fifth trigger. |
| Clap + Padded Jacket | **Standing Ovation** | A full-arena blast expands, then strikes inward; packed crowds can restore small amounts of health. |
| Arp + Extension Cable | **Event Horizon** | Counter-rotating pairs form a dense breathing crown around the player. |
| Bell + Magnet Lanyard | **Gravity Bell** | Impact pulls the horde inward, then shatters into ten seeking crystals. |

## Headliners, Encore Cases, and late level-ups

Every five minutes brings gold-highlighted **Headliners**. The first endless
steps send one; minute 15 sends two, minute 30 sends three, and minute 45 onward
can send four at once. Their extra health rises at every five-minute step.

A defeated Headliner leaves a music note worth 25 and a physical Encore Case.
Collecting the case offers up to three completed evolution recipes. If none is
ready, it immediately restores 15 health. Cases require deliberate collection
and cannot be rerolled.

Once every ordinary weapon and passive reward is exhausted, regular level-ups
become Encore choices:

- heal 15 HP, always available;
- +2% run-only damage, up to +20%;
- +2% run-only movement speed, up to +10%;
- +3% run-only attack area, up to +15%.

## Music notes and the Afterhours Shop

Gold music notes are career currency, separate from XP. Ordinary enemies have
a strength-weighted chance to leave one, and the seventh eligible kill after
six misses guarantees currency. Stronger enemies can leave notes worth two or
three. Bosses leave 10, Headliners leave 25, and Amped enemies always leave
three. You must physically collect notes before death; pickup bonuses pull both
notes and XP from farther away.

Collected notes bank when the round ends. Spend them in the title-screen
**Afterhours Shop**. Purchases are permanent and finite; no survival time,
level, kill count, or hidden rank automatically grants content.

| Shelf opens after | Available purchases |
| --- | --- |
| 0 owned | First Reroll (35), Heavy Amp (45), Recovery Tape (50), Clap (55) |
| 2 owned | Arp (90), Needle Tips (65) |
| 4 owned | Lead (130), Extension Cable (75), Padded Jacket (85) |
| 6 owned | Bell (180), Magnet Lanyard (110), Second Wind (160), Starting Passive (150) |
| 10 owned | Second Reroll (200), Headliner Gold (300) |

**Second Wind** revives you once per round at 30% maximum health. **Starting
Passive** lets you choose one unlocked passive to begin at level one.
**Headliner Gold** is cosmetic and grants no combat power. Rerolls refresh
ordinary level-up rewards only.

The base profile starts with four passives: High-Tops, Fast Forward,
Mirrorball, and Wide Lens. The shop adds the other six. Career mastery records
damage, kills, and evolutions by weapon; dealing 100,000 damage with a weapon
reveals its recipe hint on the title screen. Older profiles migrate safely,
retain live purchases and progress, and receive a one-time refund for any
retired shop content.

## Neon Crypt bestiary

The 20 enemies share one dark-fantasy pixel-art direction but keep distinct
silhouettes and behaviors.

| Enemy | Behavior read |
| --- | --- |
| **Crypt Wisp** | Tiny direct chaser; four emerge when a Spore Maw breaks. |
| **Void Golem** | Slow, high-health endless wall worth substantial XP. |
| **Iron Scarab** | Repeatedly aims, dashes straight, pauses, and aims again. |
| **Thorn Maw** | Durable carrier that splits into four Crypt Wisps on death. |
| **Ember Boar** | Stops for a clear warning, then commits to a fast straight charge. |
| **Rune Eye** | Circles the player at range rather than joining the direct pack. |
| **Aegis Knight** | Carries a shield equal to its health; the barrier must break first. |
| **Eclipse Guardian** | Huge, slow, extremely durable Sandbox stress-test objective with a large XP reward. |
| **Dusk Moth** | The one-health direct-chaser baseline. |
| **Ember Moth** | A larger, tougher moth that advances with the pack. |
| **Frost Moth** | The broad moth that forms the opening crowd. |
| **Plague Husk** | A slow, steady walker. |
| **Bone Warden** | A tougher walker with a little more XP. |
| **Phase Shade** | Fast phasing chaser that ignores knockback. |
| **Moss Golem** | Extremely durable, slow, and strongly resistant to shove. |
| **Slate Golem** | A lighter golem used in late dense combinations. |
| **Spore Maw** | Nearly stationary body used to form a temporary closing ring. |
| **Crown Wraith** | Player-level-scaling boss that can be knocked back. |
| **Crypt Spider** | Huge 500-base-health boss that cannot be knocked back. |
| **Dusk Swarm** | One-health bodies that sweep across the screen in a fixed direction. |

## Pixel-art presentation

The player, all 20 enemies, nine normal and nine evolved weapon attacks, XP,
music notes, reward objects, impacts, explosions, collection effects, and UI
icons now come from coherent transparent PNG sprite atlases rather than smooth
engine-drawn actor shapes.

The gameplay atlas contains 72 exact 96 × 96 cells; the UI atlas contains 20.
Actors have separate idle and walk frames. Transparent pixels are normalized to
transparent black, alpha is hard rather than blurry, and PixiJS uses
nearest-neighbor sampling so sprites stay crisp. Bright outlines, identity
colors, and different pickup silhouettes keep the player, enemies, attacks,
XP, currency, and deliberate rewards readable in a crowd.

The art is original, generated specifically for this repository, with no paid
or third-party sprite pack. Source boards, rebuild instructions, and licensing
are recorded in
[`public/art/pixel/SOURCE_AND_LICENSE.md`](../public/art/pixel/SOURCE_AND_LICENSE.md).

## Audio

The track is house music—dance music built around a steady four-count beat.
All nine playable voices have complete four-tier arrangements and fresh Web
Audio synthesis; validated CC0 drum one-shots may replace the matching
procedural hits as a group, with a procedural fallback if loading fails.
Pitched weapons share a safe set of notes, so adding a weapon changes the
arrangement without creating clashes.

The dense Hi-hat channel is calibrated to 70.8% of its original channel level,
while Chord runs at 133.4% and Arp at 141.3%, bringing the quieter voices
forward without letting the tick dominate. Evolution adjustments multiply this
base calibration instead of resetting it. Audio provenance and processing
details are in [`audio-sources.md`](audio-sources.md).

## Three-tab Sandbox

The Sandbox uses the real arena with scripted enemy spawning disabled. It is a
reversible developer surface and never touches the player's stored career.

- **Combat:** choose threat minute 0, 5, 8, 12, 20, or 30 and player level 1,
  5, 10, 20, or 40; spawn every one of the 20 enemies near the player, in a
  group of eight, or as a ring; spawn a Headliner or complete endless minute
  wave; fire every equipped normal/evolved pattern at once for visual testing;
  toggle invulnerability; clear the arena.
- **Build:** set all nine weapons from off through tier IV; assemble or clear a
  full band; set all ten passives from off through level five; toggle every one
  of the nine evolutions; inspect combined movement, damage, projectile speed,
  pierce, bounce, area, and regeneration values.
- **Career:** use an in-memory note wallet; create XP gems, music notes of
  several values, a note shower, a mixed pickup field, or an Encore Case;
  grant test currency; exercise the real gated 15-purchase shop.
