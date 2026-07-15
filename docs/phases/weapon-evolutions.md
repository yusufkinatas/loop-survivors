# Weapon Evolutions + Gear — Implementation Handoff Spec

Feature: one evolved form for every live weapon, unlocked through one-level
Gear and boss chests. Drafted July 15, 2026 at the developer's request. Parent
plan: `docs/plan.md`.

This is the implementation handoff for the approved nine-weapon roster. It is
the **next feature after the current July 11 parity hands gate**; it does not
claim that gate passed and must not be used to hide or retune parity failures.
It deliberately reintroduces a new, narrow enhancement system after the July
10 overhaul removed the old passive/item/effect system. Do not restore the
deleted `items.ts`, `effects.ts`, Mods bag, or `voicefx` chain.

The initial numbers below are implementation starting values. The mechanics,
trigger relationships, combat jobs, and player-facing fantasies are the design
locks. Numeric balance may move inside the stated developer gates.

## The question

Does completing a weapon create a memorable late-run fantasy without making
the full build sound less like one track or making two weapons solve the same
combat problem?

The feature passes only when all three statements are true:

1. Every evolution still sounds unmistakably like its base instrument.
2. Every evolution changes the player's tactical relationship to the horde.
3. Muted, the nine evolved weapons remain mechanically distinct.

## Non-negotiable constraints

- **Model A remains absolute.** One chart event is one trigger with two
  outputs: its instrument sound and its gameplay attack. An evolution may
  create bounded aftermath from that trigger—zones, shards, a moving wall,
  delayed palms—but may not invent an independent off-grid firing clock.
- **No Tier-5 chart.** An evolved weapon keeps its Tier-4 chart, note sequence,
  rhythm, and event count. Evolution changes the event's sound treatment and
  gameplay behavior, not when the instrument plays.
- **Movement remains the only player verb.** Aiming and target choice stay
  automatic. Chest and reward selection use the existing walk-onto-pickup
  language; there is no attack, aim, or evolution button.
- **The band still owns weapon capacity.** Evolution replaces the base weapon
  in its existing band slot. It never consumes another band slot.
- **Gear is silent.** Gear changes gameplay numbers or targeting but never adds
  a voice, sound loop, chart event, or musical note.
- **Gear never changes attack frequency.** Cooldown reduction and attack-speed
  stats are forbidden because chart density is both the track and fire rate.
- **The paired Gear remains after evolution.** It is a passive build component,
  not a consumed crafting material.
- **The system owns the mix.** Evolved sound layers are quieter treatments of
  existing events, are routed through the owning voice, and must clear the
  same full-build listening gate as base weapons.
- **Current parity work is a precondition.** Resolve or explicitly disposition
  the known shared Kick re-hit-lock mismatch before implementing Dancefloor;
  the evolution must build on one truthful base Kick rule.

## Player-facing vocabulary

- **Weapon:** one instrument in a band slot.
- **Tier:** the existing I–IV weapon ladder.
- **Gear:** a silent, one-level passive item in one of four Gear sockets.
- **Evolution:** the transformed form of a Tier-IV weapon.
- **Chest:** a boss reward that can evolve an eligible weapon or fall back to a
  normal build choice.

Do not expose terms such as backbeat, arpeggio, downbeat, sidechain, or
pentatonic in the run UI. Pick descriptions use plain gameplay language.

## Complete player flow

1. A weapon is acquired and raised through the existing four tiers.
2. Once the paired weapon is at least Tier II and the run has passed 1:00, its
   Gear may appear as the single Gear card in a normal three-choice reward.
3. Collecting Gear schedules it for the next heard bar. At that bar its passive
   effect and Gear-rack state become active together.
4. A successful boss reward roll drops a physical chest at the boss corpse.
   The chest persists until collected or the run ends and is never pulled by
   the gem magnet.
5. When a collected chest reward reaches the front of the reward queue, a
   weapon is eligible if it is Tier IV, owns its paired Gear, and is not already
   evolved.
6. One eligible weapon evolves automatically. With two to four eligible
   weapons, all are presented as walk-onto choices and the player chooses one.
7. The selected evolution lands on the next heard bar. Old in-flight attacks
   finish under their old rules; new chart triggers use the evolved rules and
   sound.
8. If no evolution is eligible when the chest is processed, it grants one
   normal weapon/Gear reward. If that pool is also empty, it heals 15 HP.

Eligibility is evaluated when the queued chest reward is **presented**, not
when the chest dropped or was collected. A Gear or Tier-IV change waiting in
front of it can therefore make the chest useful.

## Gear inventory and offer economy

### Capacity and ownership

- The run has **four Gear sockets**, separate from the seven live band slots.
- Gear has one level. It cannot be offered or owned twice.
- Gear is permanent for the run. There is no drop, swap, reroll, or consumption.
- An unowned Gear item enters the candidate pool only when:
  - its paired weapon is owned at Tier II or higher;
  - run time is at least 60 seconds; and
  - at least one Gear socket is empty.
- A Gear item whose paired weapon is absent never appears. This prevents dead
  recipe pieces and keeps the system readable without a recipe guide.

### Normal three-choice rewards

Extend `PickOption` into a discriminated union:

```ts
type PickOption =
  | { kind: 'weapon'; role: Role; tier: number }
  | { kind: 'gear'; gear: GearId };
```

The roll remains deterministic from build state, time, and RNG:

1. Build the current weapon pool exactly as today, including band-slot
   ownership, soundset support, and early drum weighting.
2. Build the eligible Gear pool from the rules above.
3. If at least two weapon candidates and one Gear candidate exist, reserve
   **at most one** of the three cards for Gear. The other cards are weapons and
   still span different band slots.
4. Weight eligible Gear by its paired weapon tier: Tier II = 1, Tier III = 2,
   Tier IV = 3. Draw one by the same weighted-key method used for weapons.
5. With only one weapon candidate, Gear may fill the other two cards. With no
   weapon candidates, Gear may fill all three. The four-socket ownership cap
   and no-duplicate rule still apply.
6. If no candidates remain, keep the existing +15 HP fallback.

The first minute stays weapon-only. From minute one onward, a player pursuing
an evolution gives up a weapon/tier alternative to take Gear; the recipe is a
real build cost, not a free unlock.

### Gear registry and exact passive effects

All multipliers apply only to attacks/entities created after the Gear lands.
Never retroactively resize, accelerate, extend, or retarget an in-flight entity.

| Gear | Paired weapon | Passive effect | Exact scope |
|---|---|---|---|
| Heavy Boots | Kick | Player-anchored attacks gain 15% reach. | Multiply Kick strip area, Clap reach, Arp orbit radius, Dancefloor stamp geometry, and Standing Ovation radius by 1.15. Do not enlarge projectile bodies or Chord zones. |
| Laser Sight | Snare | Automatically aimed projectiles acquire at 25% greater range and travel 25% faster. | Multiply `AIM_RANGE` only for launch-time straight-shot aiming and multiply projectile speed for Snare, Hat, Bass, Lead, and Bell. It does not accelerate Undertow's wall or Headliner's dash. |
| Needle Case | Hi-Hat | Finite-pierce projectiles pass through one additional enemy. | Add 1 to finite projectile pierce, including Bell shards. `Infinity` remains `Infinity`; zones, strips, cones, palms, and orbiters are unchanged. |
| Gyroscope | Arp | Orbiters rotate 25% faster and homing projectiles turn 25% faster. | Multiply Arp angular speed and the turn-rate cap of Lead seekers and Glass Choir shard curves. It does not add orbiters or triggers. |
| Lead Weight | Bass | Weapon hits deal 15% more damage; attacks that already push gain 20% shove. | Multiply all player-weapon/evolution damage by 1.15 and existing weapon shove distances by 1.20. Enemy contact, XP, and cosmetic force are unchanged. |
| Hourglass | Chord | Persistent weapon entities last 25% longer. | Multiply projectile, orbiter, zone, and Undertow-wall lifetime by 1.25. Do not extend Kick strips, Cut expiry, stuns, invulnerability, level-up slow motion, or purely visual FX. |
| Compass | Lead | Homing attacks search 35% farther and prefer a target not already claimed by the same weapon. | Applies to Lead seekers and Headliner. Laser Sight owns launch-time straight-shot range; Compass owns post-launch homing/retargeting. Fall back to the nearest valid enemy when every target is claimed. |
| Boxing Gloves | Clap | Hits close to the player deal 20% more damage and shove 30% farther. | At hit time, if the enemy center is within 140 world units of the player, multiply player-weapon damage by 1.20 and existing shove by 1.30. This composes with Lead Weight. |
| Prism | Bell | Secondary projectiles deal 40% more damage and live 20% longer. | Applies only to entities explicitly tagged `secondary`, initially Bell shards and Glass Choir shards. It does not affect a main projectile, Kick follow-up, Chord sub-zone, or Clap release. |

Multipliers compose multiplicatively. Apply integer changes such as `+1 pierce`
after base/evolution configuration and before collision. No effect may be
applied twice because an entity belongs to more than one semantic category.

For Compass, “claimed” is explicit entity state, not a frame-by-frame guess.
A base Lead seeker stores its assigned enemy id until that enemy dies or is
hit, then may retarget once. Headliner uses its phrase visited set. No normal
legal build can own both Lead's Compass and Bell because they share the Melody
slot; Glass Choir therefore does not depend on Compass.

### Exact reward copy

Evolution recipes are **not secret** in this feature. Every Gear offer names
its paired owned weapon. Use these terse lines on ground rewards and their full
versions in the pause Gear rack:

| Gear | Ground-reward detail |
|---|---|
| Heavy Boots | `Pairs with Kick · player attacks reach +15%` |
| Laser Sight | `Pairs with Snare · aimed shots farther + faster` |
| Needle Case | `Pairs with Hi-Hat · shots pass through +1` |
| Gyroscope | `Pairs with Arp · orbit + homing turn faster` |
| Lead Weight | `Pairs with Bass · damage +15% · shove +20%` |
| Hourglass | `Pairs with Chord · lasting attacks +25%` |
| Compass | `Pairs with Lead · homing range +35%` |
| Boxing Gloves | `Pairs with Clap · nearby damage + shove` |
| Prism | `Pairs with Bell · shards stronger + longer` |

Evolution-choice details:

| Evolution | Ground-reward detail |
|---|---|
| Dancefloor | `Beat 4 repeats your last four Kick positions` |
| Dead Center | `Crowds charge one stronger elite shot` |
| Needle Storm | `Closed hits build Cuts · open hits consume them` |
| Orrery | `Two rings open and close with the notes` |
| Undertow | `Waves push · the pattern's last note carries a wall` |
| Cathedral | `Every Chord creates three overlapping slow zones` |
| Headliner | `One soloist dashes between different enemies` |
| Standing Ovation | `Two palms crush, stun, and throw nearby enemies` |
| Glass Choir | `Bell shards curve toward different enemies` |

If a line does not fit at 390 px, wrap it; never abbreviate the paired weapon
or hide the passive effect behind an icon.

## Chests and reward sequencing

### Drop rules

The active eight-minute stage already has boss events at 1:00, 3:00, 5:00,
and 7:00 with reward chances 0.30, 0.43, 1.00, and 0.5635. Preserve those
values. Rename the runtime concept from `upgradeChance` to `chestChance`.

On a successful roll:

- spawn one simulation-owned chest at the dead boss's position;
- do not also enqueue the old direct level-up reward;
- give the chest a fixed 36-world-unit pickup radius;
- do not magnetize, despawn, recycle, or let enemies block/destroy it; and
- remove all chests on death, victory, new run, sandbox reset, or world swap.

The first two probabilistic chests are allowed to miss. The 5:00 Mantis chest
is the run's one guaranteed evolution opportunity if the build is ready.

`RunWorld` owns a bounded `Chest[]` collection and checks player overlap during
its normal pickup phase. A collected chest is removed once and calls a new
`RunEvents.onChestCollected()` shell event; the shell owns only the resulting
queued reward, not the world entity. `RunView` mirrors `Chest[]` like gems.

### Reward queue

Replace `pendingUpgrades: number[]` with one FIFO queue:

```ts
type PendingReward =
  | { kind: 'level'; level: number }
  | { kind: 'chest' };
```

- XP thresholds enqueue `level`.
- Walking onto a chest removes that chest and enqueues `chest`.
- Only one ground-choice group may exist at once.
- A reward behind a collected choice waits until that choice lands on its next
  bar and at least one fixed simulation step consumes the new state, matching
  the current stacked-level behavior.
- FIFO order is the order rewards were enqueued. Do not prioritize chests over
  earlier XP rewards or lose same-frame rewards.

### Chest resolution

When a `chest` reward reaches the queue front:

- **Zero eligible evolutions:** roll and present a normal reward. If the pool
  is empty, heal 15 HP and continue the queue.
- **One eligible evolution:** show the chest-open visual, announce
  `Weapon → Evolution`, and schedule it directly for the next bar.
- **Two evolutions:** drop two tokens opposite each other.
- **Three evolutions:** use the existing 0°/120°/240° triangle.
- **Four evolutions:** drop four tokens at 0°/90°/180°/270°.

Evolution tokens use `LEVELUP.itemRadius`, `enemyPushRadius`, and fixed
`itemPickupRadius`. Collecting one clears the rest. Chests and normal pickups
may remain elsewhere in the world, but no second choice group renders until
the current choice lands.

Chest opening adds no off-grid musical sound. Use the existing brief slow
motion, weapons-bus duck, screen pulse, and a gold/weapon-color visual. The
evolved instrument's first Tier-IV chart event after the bar boundary is the
audible payoff.

## Quantized build changes

Weapons, Gear, and evolutions all use the existing `engine.atNextBar` seam:

- In the scheduling callback, change audio-facing state before the new bar's
  events are scheduled.
- Use `engine.atAudioTime(barAudioTime, ...)` for simulation and UI state.
- Timed actions already run before triggers at the same audio timestamp; keep
  that ordering so the first heard evolved event also uses evolved gameplay.
- A queued change guards against run end/world replacement.
- A deactivated weapon can tier up or evolve while off. It remains off, and
  returns in its evolved form when reactivated.
- Existing projectiles, zones, orbiters, marks, and delayed attacks retain the
  rules/configuration snapshot with which they were created.

Add a boolean evolution snapshot to scheduled triggers so audio and gameplay
cannot disagree under lookahead scheduling. The role identifies the evolution;
the audio layer must not import game-owned `EvolutionId` and create a cycle:

```ts
interface ScheduledTrigger {
  // existing fields...
  evolved: boolean;
}
```

`MusicEngine.trigger()` snapshots `Voice.evolved` into this field. Gameplay
selects base/evolved mechanics from `t.evolved`, not from whatever mutable
world state happens to exist later. `world.evolved` remains the authority for
eligibility, UI, and new voice state.

An evolved audio event may internally start more than one quiet audio buffer,
but the engine dispatches exactly **one** `ScheduledTrigger` to gameplay.

## Canonical data and state ownership

Create `src/game/evolutions.ts` as the single static registry for:

- `GearId`, `GearConf`, and Gear metadata;
- `EvolutionId`, `EvolutionConf`, and role-to-evolution mapping;
- paired Gear requirements;
- player-facing names, one-line effects, fantasies, colors/icon ids; and
- initial gameplay tuning constants that are not generic weapon stats.

Recommended types:

```ts
type GearId =
  | 'heavyBoots' | 'laserSight' | 'needleCase' | 'gyroscope'
  | 'leadWeight' | 'hourglass' | 'compass' | 'boxingGloves' | 'prism';

type EvolutionId =
  | 'dancefloor' | 'deadCenter' | 'needleStorm' | 'orrery'
  | 'undertow' | 'cathedral' | 'headliner'
  | 'standingOvation' | 'glassChoir';

interface EvolutionConf {
  id: EvolutionId;
  role: Role;
  name: string;
  gear: GearId;
  fantasy: string;
  pickLine: string;
}
```

`RunWorld` owns run state:

```ts
readonly gear = new Set<GearId>();
readonly evolved = new Set<Role>();
```

Keep `tiers: Map<Role, number>` at IV for evolved weapons. Do not encode an
evolution as tier 5. Damage and kill attribution remain keyed by base `Role`,
so all evolved aftermath counts toward its owning instrument.

All entity-specific evolution data must live on that entity or in a bounded
world collection, never in module globals. Reset it through
`clearSandboxEntities`, new-run reset, and world destruction.

## Build-stat pipeline

Replace the current narrow `applyBuild(conf)` with one explicit transform
pipeline. For every newly created attack/entity:

1. Read the Tier-IV base weapon config.
2. Apply the existing chart-variant rule, such as Chord's held sound.
3. Apply the evolution's per-event geometry/behavior override.
4. Apply Gear geometry, speed, lifetime, pierce, targeting, secondary, and
   close-range rules once.
5. Apply global weapon damage multipliers (`powerMul`, Antonio's level Might,
   Lead Weight, and conditional Boxing Gloves).
6. Snapshot the final values onto the entity.

Do not scatter Gear checks across render code or audio code. A renderer reads
the already-decided entity/evolution state; it never determines mechanics.

## Evolution audio contract

Audio implementation may use evolved sample variants or quiet layers routed
through the owning voice. It may not add chart events or dispatch extra game
triggers. Evolved samples/layers must still obey voice gain, activate/deactivate,
master mute, pause transport, weapons-bus duck, bass ducking, and choke rules.

| Evolution | Sound treatment on existing events |
|---|---|
| Dancefloor | Beats 1–3 use a deeper Kick treatment; beat 4 uses a clearly heavier short room-thump treatment. Still exactly four Kick triggers per bar. |
| Dead Center | A tighter, harder Snare crack with a very short tail. Existing beats 2/4 and extra hits at each two-bar turnaround stay fixed. |
| Needle Storm | Closed Hat ticks become sharper; existing open Hat hisses become brighter so buildup and release are audible. |
| Orrery | Add one quiet copy of the same Arp note at a higher pitch inside the same event. It is an audio layer, not a second weapon trigger. |
| Undertow | Normal Bass events remain short. The existing final event at step 31 of the two-bar Tier-IV chart becomes a deeper 0.30–0.35 second plunge. The next Kick may duck it and the next Bass event may choke it. |
| Cathedral | The same three-note Chord event becomes wider with a longer tail; held Chord events remain the longer version. No extra notes or triggers. |
| Headliner | The same Lead melody uses a bolder singing sound with a slight pitch slide at the start of each existing note. |
| Standing Ovation | The same Clap event gains a quiet crowd-clap layer, routed through the Clap voice. |
| Glass Choir | The Bell event contains several very quiet, differently placed glass-like reflections in its decay. They are baked/layered reflections, not chart notes. |

Every evolved voice must be auditionable alone and in every legal seven-weapon
band mix that can contain it before its gameplay gate. If an evolved treatment
muddies the mix, simplify the sound before reducing the fantasy's gameplay
readability.

## Evolution roster and exact gameplay

### Kick IV → Dancefloor

**Requirement:** Kick IV + Heavy Boots.

**Base IV preserved:** Every Kick on the four steady beats makes the current
facing-side strip and its opposite-side follow-up 0.10 seconds later.

**Evolution:**

- At each Kick event, snapshot `{x, y, facingSide}` at the player's current
  position. Keep at most the four snapshots in the current bar.
- At beat 4 (`phraseStep % 16 === 12`), create the normal Kick attack, then
  re-slam the four stored snapshots from that same trigger and clear the list.
- Each echo uses the snapshot's original facing, Tier-IV strip geometry after
  Heavy Boots, and 60% of the event's final damage.
- One shared `Set<Enemy>` across the four beat-4 echoes lets an enemy take at
  most one echo hit per bar. The echo hit set is separate from the resolved
  base Kick re-hit lock, so the bar payoff cannot be erased by the normal hit.
- Echo strips grow/expire with the same bounded 0.20-second lifetime as a base
  strip. No mark deals damage before beat 4.
- Reset incomplete snapshots on evolution landing, run reset, sandbox clear,
  and any transport/world reset. Do not carry a three-beat partial bar across
  an evolution toggle.

**Combat job:** movement-planned, beat-counted positional burst.

**Fantasy:** “You become the beat beneath the arena—every beat stamps where
you stand, and the fourth kick makes the whole bar hit again.”

### Snare IV → Dead Center

**Requirement:** Snare IV + Laser Sight.

**Base IV preserved:** Fast narrow piercing shots on beats 2 and 4, with extra
hits at each two-bar turnaround.

**Evolution:**

- At the trigger, choose the alive enemy with the greatest current HP inside
  launch acquisition range. Tie-break by nearest distance, then stable enemy id.
- Fire an instant, 16-world-unit-wide line from the player to the far edge of
  that target. The line ends at the target; enemies behind it are not hit.
- Sort intersecting enemies by projected distance from the player.
- Lesser enemies before the target take the normal final event damage.
- The chosen target takes normal damage multiplied by `1 + 0.15 * N`, where
  `N` is the number of lesser enemies hit first, capped at +75%.
- “Lesser” means lower current HP than the chosen target. Equal-HP enemies do
  not charge the bonus.
- The line is hitscan gameplay with a 0.10-second tracer visual. It does not
  spawn a projectile or persist for later collision.
- If no target exists, the Snare sound still plays and no attack is created.

**Combat job:** narrow lineup-dependent elite and boss execution.

**Fantasy:** “Every crack is the perfect shot, turning the crowd lined up
before your quarry into extra force.”

### Hi-Hat IV → Needle Storm

**Requirement:** Hi-Hat IV + Needle Case.

**Base IV preserved:** The fixed `xxO.xxO.xxO.xxO.` event pattern remains a
dense short-range spray: two closed ticks lead into each brighter open hiss.

**Evolution:**

- A closed-Hat projectile that damages an enemy adds one `Cut`, maximum 8.
- Store `hatCuts` and `hatCutExpiryS` on the enemy. Refresh expiry to 1.5
  seconds after every Hat hit; clear Cuts when that time elapses.
- An open-Hat projectile that damages the enemy deals its normal hit, consumes
  all Cuts on that enemy, and adds bonus damage equal to
  `openHitDamage * 1.5 * consumedCuts`.
- The bonus is single-target, attributed to Hat, and creates no shard, splash,
  sound, or separate trigger.
- Open hits against zero Cuts are ordinary hits. A missed open projectile does
  not consume Cuts elsewhere.
- Cuts die with the enemy and are not transferred. Deactivating Hat allows the
  normal 1.5-second expiry to clear them.

**Combat job:** short-range sustained spray with audible buildup/release and a
same-target combo payoff.

**Fantasy:** “Relentless closed ticks score the cut; every bright open hiss
tears it wider.”

### Arp IV → Orrery

**Requirement:** Arp IV + Gyroscope.

**Base IV preserved:** Triggered notes create orbiting damage bodies around the
player and retain the existing timed per-target re-hit rule.

**Evolution:**

- Maintain two rings, maximum six orbiters per ring. The rings rotate in
  opposite directions.
- Each Arp trigger alternates rings. If that ring has fewer than six bodies,
  add one; otherwise refresh the oldest body's lifetime and event-snapshotted
  damage rather than spawning a seventh.
- Start inner/outer radius at 82/126. Compare each chart note with the previous
  Arp chart note: higher expands both radii by 8, lower contracts both by 8,
  equal holds. Clamp inner to 66–106 and outer to 110–158.
- The first note after evolution or phrase reset holds the current radii.
- Preserve at least a 24-unit gap between rings after every clamp.
- Inner angular speed is `-ARP_OMEGA`; outer is `+ARP_OMEGA`, then Gyroscope
  multiplies both by 1.25.
- Orbiters move immediately to the new radii over 0.12 seconds for visual
  readability; collision follows the interpolated position.
- Hourglass may extend orbiter lifetime but cannot raise the 12-body cap.

**Combat job:** a mobile two-radius perimeter whose reach follows the audible
melody contour.

**Fantasy:** “You walk inside a clockwork constellation that opens as the
notes climb and closes as they fall.”

### Bass IV → Undertow

**Requirement:** Bass IV + Lead Weight.

**Base IV preserved:** Tier IV contains only short `fat` Bass events. Each
ordinary event launches one slow, very wide, infinitely piercing wave.

**Evolution:**

- Ordinary Bass waves apply a directed shove along projectile travel direction
  when they hit. Starting shove distance is 14 world units before target
  knockback resistance and Gear multipliers.
- The existing final event of the two-bar Tier-IV chart
  (`phraseStep % 32 === 31`) becomes the deeper short plunge and creates the
  moving wall instead of a normal wave. It therefore occurs at each two-bar
  turnaround, without adding an event.
- The wall begins at the player, travels in the automatic aim direction at
  150 world units/second, lives 1.5 seconds before Hourglass, has 64-unit
  thickness, and spans `max(worldW, worldH) * 1.5` perpendicular to travel.
- Track per-enemy hit time. A wall may damage the same enemy at most once per
  0.45 seconds. Each tick deals 65% of the final Tier-IV Bass event damage.
- A normal enemy intersecting the wall is carried in its travel direction at
  wall speed while intersecting, after knockback resistance. Pursuit resumes
  on exit.
- Bosses are never carried. Each valid tick applies the normal Bass stagger/
  shove channel instead.
- The wall is a bounded gameplay aftermath from the step-31 sound. Its audio
  remains 0.30–0.35 seconds and is allowed to end long before the wall.
- Screen shake/flash occurs only on wall creation, not on every damage tick.

**Combat job:** slow directional lane clearing and scheduled mass displacement.

**Fantasy:** “The low end becomes a tide: each note shoves the horde, and the
last low note before the pattern restarts carries the whole screen away.”

### Chord IV → Cathedral

**Requirement:** Chord IV + Hourglass.

**Base IV preserved:** Short groups of simultaneous notes throw a damage/slow
zone toward the nearest pack. The held Chord event on the first beat of each
bar uses the existing larger, longer variant.

**Evolution:**

- Choose the target point with the existing nearest-pack rule.
- One Chord event creates a group of three simultaneous circles centered at
  angles 0°/120°/240° around that point.
- After existing short/held variant scaling, each sub-zone radius is 72% of
  the event radius and each center offset is 35% of the event radius.
- Each sub-zone deals 75% of the event's configured per-tick damage every
  `ZONE_TICK_S`. Overlap naturally deals two or three ticks.
- Track a group id on all three zones. An enemy inside one Cathedral circle
  uses the normal 0.55 speed multiplier; inside two or three active Cathedral
  circles it uses 0.18. Never multiply slows below 0.18.
- Other Chord groups may add damage, but their slows still clamp at 0.18.
- All three sub-zones share the event's bounded lifetime after Hourglass.
  Clearing one world/entity reset clears the entire group.

**Combat job:** remote persistent terrain and deliberate overlap choke points.

**Fantasy:** “Each chord raises a three-walled room around the horde, turning
overlap into territory they can barely escape.”

### Lead IV → Headliner

**Requirement:** Lead IV + Compass.

**Base IV preserved:** The Tier-IV melody and its event count stay unchanged;
the base form continues to launch independent homing seekers until evolution.

**Evolution:**

- On landing, allow old base seekers to finish and create one persistent
  visible soloist at the player. It is not a damaging body between notes.
- At every Lead chart event, select a living enemy within 900 world units
  before Compass. Prefer one not visited in the current four-bar phrase;
  tie-break by nearest distance then stable enemy id.
- Move the soloist to that target over 0.12 seconds. Damage is applied once on
  arrival, as bounded aftermath of that note. The dash path does not damage.
- Base hit damage is `2.0 * final Tier-IV Lead event damage`. Each consecutive
  different target adds +10%, capped at +50%.
- At phrase step 0, clear visited targets and combo before selecting the first
  target. If all valid enemies are already visited before phrase end, target
  the nearest valid enemy but do not raise the combo.
- If the selected enemy dies before arrival, Compass retargets once to the
  nearest unvisited valid enemy. If none exists, return the soloist to the
  player with no damage.
- During rests, the soloist waits at its last position. It follows no enemy and
  causes no collision or damage until the next chart event.
- When Lead is deactivated, hide the soloist and clear its visited/combo state
  at the landing bar. On reactivation, place it at the player before the first
  new evolved Lead event.

**Combat job:** sequential arena-wide cleanup of dispersed enemies.

**Fantasy:** “Your melody takes the spotlight as one tireless star dancing
from enemy to enemy across the arena.”

### Clap IV → Standing Ovation

**Requirement:** Clap IV + Boxing Gloves.

**Base IV preserved:** The base form keeps its large automatic close-range
sweep on beats 2 and 4 and at its existing extra turnaround hits.

**Evolution:**

- Replace the cone with two opposing palms centered on an automatically chosen
  direction. Spawn them 140 world units from the player on opposite sides.
- Heavy Boots may multiply the 140-unit radius. The palms close to the player
  over 0.12 seconds.
- On closure, damage every enemy inside the resulting 48-unit-wide corridor
  and within the palm radius once for `1.75 * final Tier-IV Clap event damage`.
- Apply `stunT = max(stunT, 0.35)` to caught normal enemies. Bosses receive no
  stun, only damage and their allowed shove.
- At 0.20 seconds after the trigger, throw each caught living enemy radially
  away from the player by 32 world units before resistance and Gear. The throw
  deals no second damage.
- One event owns one caught-enemy set, so overlapping palms never double-hit.
  Remove the set after the release.
- Palms and release complete within 0.28 seconds. They are bounded aftermath
  of the Clap event and do not create another sound.

**Combat job:** immediate current-position peel and breathing-room reset.

**Fantasy:** “The whole room claps with you, crushing anything that gets close
between two walls of hands.”

### Bell IV → Glass Choir

**Requirement:** Bell IV + Prism.

**Base IV preserved:** A sparse straight Bell projectile pierces and shatters
on its first hit into eight short radial shards.

**Evolution:**

- At launch, score every enemy within the Laser-Sight-adjusted aim range by the
  number of living enemies within 120 world units of it.
- Prefer candidates at least 180 units from the player. If none exist, consider
  all candidates. Choose highest local count, then farthest distance, then
  stable enemy id.
- Fire the normal main projectile toward that target. It keeps Tier-IV speed,
  damage, radius, pierce, and Laser Sight modifiers.
- On first hit, create exactly eight radial shards. Tag every shard
  `secondary` so Prism applies once.
- At shatter time, assign each shard at most one unique living enemy within
  180 units of the impact, excluding enemies already hit by the main projectile.
  Sort targets by distance and use stable id as tie-break.
- An assigned shard curves once toward its target using the normal homing turn
  cap after Gyroscope. It never retargets again. An unassigned shard stays
  radial. If its target dies, it continues on its current direction.
- Shards never split, create sound, or dispatch another trigger.

**Combat job:** sparse long-range cluster detonation and local branching
coverage.

**Fantasy:** “One pure chime breaks into a choir of glass reflections that
finds every body around the impact.”

## Required UI and visual language

### Ground rewards

Generalize `GroundPickView` so weapon, Gear, and evolution tokens share the
same physical renderer without pretending Gear is a `Role`:

```ts
type GroundPickView = {
  x: number;
  y: number;
  color: number;
  icon: { kind: 'weapon'; role: Role } | { kind: 'gear'; gear: GearId };
  name: string;
  detail: string;
  rarity: 'normal' | 'evolution';
};
```

- Weapon detail remains `1` or `2 → 3`.
- Gear detail is one terse effect, e.g. `shots pass through +1`.
- Evolution detail is `EVOLVE` and its name is `Kick → Dancefloor`.
- Gear uses a hexagonal/double-line coin silhouette and the paired weapon's
  color. Evolution uses the weapon glyph with a gold outer star/ring.
- Keep names and details readable at the existing world zoom. Text is the
  source of truth; icons only accelerate recognition.

### HUD and pause

- Add a compact four-socket **Gear** rack below the band rack in HUD and pause.
- Empty sockets show only their outline. Filled sockets show icon and short
  name, no tier pips.
- A Gear waiting for the next bar uses the same pending pulse language as an
  instrument change.
- An evolved band socket shows the evolution name and replaces four lit tier
  pips with four lit pips plus one distinct gold diamond. Do not display “V”.
- Track overlay rows retain the same Tier-IV mini-grid and show the evolved
  name/diamond. The grid must not imply extra events.
- End-screen damage attribution remains by base instrument but displays the
  evolution name if that role ended evolved.

### Evolution combat visuals

Visuals use existing weapon colors and vector language:

- Dancefloor: four faint non-damaging floor stamps, then synchronized strips.
- Dead Center: narrow 0.10-second tracer with a brighter terminal target flash.
- Needle Storm: tiny Cut ticks on the enemy rim; open-hit consumption makes one
  inward snap, not an explosion.
- Orrery: two readable counter-rotating rings with smooth radius movement.
- Undertow: one translucent moving wall with a heavier leading edge; no
  full-screen opaque fill.
- Cathedral: three overlapping circles whose overlap grows visibly denser.
- Headliner: one persistent bright soloist and a short curved dash ribbon.
- Standing Ovation: two palms/walls closing and separating; the release throw
  is legible without screen shake.
- Glass Choir: one impact glint and eight readable curved shard trails.

The full build must remain readable at normal zoom. Prefer fewer clear bodies
over particle count. Respect `prefers-reduced-motion` for HUD pulses and remove
nonessential screen motion; never remove combat geometry.

## Architecture and file ownership

Expected file changes:

- `src/game/evolutions.ts` — canonical Gear/evolution registry and constants.
- `src/game/picks.ts` — union options, Gear pool, capacity/tier/time rules.
- `src/game/game.ts` — unified reward queue, quantized Gear/evolution apply,
  ground-choice presentation, HUD refresh, sticky deactivation behavior.
- `src/game/run.ts` — Gear/evolved run state, chests, evolution mechanics,
  entity snapshots, stat pipeline, attribution.
- `src/game/config.ts` — generic tuning constants only; move evolution-specific
  constants to `evolutions.ts`. Remove the stale generic Bass-sub assumption.
- `src/game/view.ts` — chests, generic ground tokens, evolved entities/FX.
- `src/game/weaponicons.ts` plus new `src/game/gearicons.ts` — view-only glyphs.
- `src/game/hud.ts` — Gear rack, evolved sockets, end-screen names.
- `src/game/trackoverlay.ts` — evolved names/diamond, unchanged event grid.
- `src/game/sandbox.ts` — Gear/evolution controls and chest spawn/resolve.
- `src/game/style.css` — Gear/evolution token, rack, pending, and responsive UI.
- `src/audio/engine.ts` — `Voice.evolved`, `setVoiceEvolved(role, on)`, boolean
  trigger snapshot, and one-trigger layered playback. It must not import from
  `src/game/`.
- `src/audio/kits.ts` and/or `src/audio/kits/house.ts` — evolved buffers/layers.
- `src/lab/page.ts` — real Gear/evolved controls in Instrument Zoo.

Do not add evolution conditionals to `weaponicons.ts`, `hud.ts`, or render code
that decide simulation outcomes. Data flows registry → build state → attack
snapshot → renderer.

## Sandbox, rehearsal room, and Living Lab

### Sandbox

Add a Gear/Evolution section:

- toggle each Gear on/off;
- set any live weapon to Tier IV base or evolved;
- choosing evolved atomically grants Tier IV + paired Gear + evolved state;
- turning evolution off returns to Tier IV base and keeps Gear;
- spawn a physical chest;
- enqueue a chest reward immediately;
- clear chests/choices; and
- show current reward queue length.

Sandbox changes may apply immediately only while the audio clock is stopped.
While live, use next-bar quantization like a run. Run-parity sandbox mode keeps
the four-Gear cap; if an atomic evolution grant would exceed it, require the
developer to clear a Gear socket first rather than silently exceeding capacity.

### Rehearsal room

- Add Base IV / Evolved audition per live weapon.
- Keep chart cells identical between the two states.
- Allow solo A/B and full-base/full-evolved mix comparison.
- Gear has no rehearsal controls because it is silent.

The rehearsal room may bypass the four-Gear inventory cap for **audio audition
only**. It never constructs a run build or proves combat/economy balance.

### Living Lab

Instrument Zoo must exercise every base/evolved trigger through the real
engine → due trigger → `RunWorld.fireTrigger` path. It must expose the paired
Gear state and include fixtures for:

- Kick beat-4 stored stamps;
- Hat closed/open Cut release;
- Arp higher/lower/equal note movement;
- Bass step-31 wall;
- Chord short/held events;
- Lead phrase reset;
- Clap close/release timing; and
- Bell dense-cluster targeting and unique shard assignment.

Update the Living Lab registry checks rather than maintaining a parallel list.

## Edge cases and required behavior

- A Gear card collected while its weapon is deactivated still lands and works;
  the weapon remains deactivated.
- Evolving a deactivated weapon changes its audio/gameplay state but never
  enables it.
- If a weapon evolves after its event for the current bar was already heard,
  it waits naturally for its next Tier-IV chart event.
- A chest collected during an active choice is queued, never discarded.
- Multiple same-frame XP thresholds/chests retain FIFO order.
- Chests persist through camera movement and are never recycled off-screen.
- Death/victory clears uncollected chests, pending rewards, choice tokens,
  pending Gear, and pending evolutions.
- An evolution choice whose world/build is replaced before its bar no-ops.
- Gear capacity is checked both when rolling and when applying. A stale queued
  Gear option that becomes invalid resolves to a fresh normal roll; never exceed
  four sockets.
- Evolution eligibility is revalidated on collection and application. If stale,
  rerun chest resolution instead of silently consuming the chest reward.
- Removing a weapon in sandbox removes its evolved flag and weapon entities but
  does not automatically remove Gear.
- Gear modifiers apply to spawned children only when specified. Prism applies
  to Bell shards; Needle Case adds pierce to them; no generic recursive tagging.
- Damage attribution includes evolution bonus, wall ticks, Cut consumption,
  stored Kick echoes, and shards exactly once.
- Hourglass duration affects simulation and visual lifetime from the same
  snapshotted value.
- Pause freezes chest pickup, evolution selection, delays, stuns, wall motion,
  and soloist motion together with the world/audio transport.
- Developer activate/deactivate stops new evolution triggers; bounded in-flight
  evolution aftermath finishes normally, matching the existing tool spec.

## Verification requirements

### Pure/unit tests

- Gear eligibility at time 59.99/60.00, paired tiers I/II, full/empty sockets.
- An offer has at most one Gear when at least two weapon candidates exist and
  keeps weapon-slot uniqueness.
- No duplicate Gear; no Gear for an absent paired weapon.
- Every role maps to exactly one Gear/evolution and every Gear maps back once.
- Evolution eligibility for all combinations of tier, Gear, and evolved state.
- FIFO reward ordering for same-frame level/chest events.
- Zero/one/two/three/four eligible chest resolution.
- Gear modifier scopes, composition, finite/infinite pierce, and no retroactive
  mutation of existing entities.
- Scheduled trigger carries the correct evolution snapshot across a bar change.
- Every evolution produces one gameplay dispatch per chart event, never two.
- Deterministic target tie-breaks and bounded entity caps.

### Simulation tests

- Run every base IV and evolution against single fodder, dense fodder, a boss,
  and knockback-immune enemies.
- Confirm damage attribution equals effective damage and never counts overkill
  or one hit twice.
- Confirm all delayed state is bounded and cleared by sandbox/world reset.
- Confirm deactivated, pending, tier-up, Gear, and evolution combinations.
- Confirm chest collision ignores magnet and survives camera travel.
- Confirm Hourglass/Prism/Needle Case combinations do not recurse or leak.

### Audio/engine tests

- Tier-IV Base and Evolved charts expose identical event steps/counts.
- One evolved event may layer audio but dispatches one trigger.
- Voice gain, master mute, pause, weapons duck, Bass duck, and choke affect all
  evolved layers.
- Undertow's short plunge is ducked/choked correctly and never lasts 1.5 audio
  seconds merely because the wall does.
- No evolved sound clips, distorts, or masks the full mix at maximum build.

### Browser checks

- Normal 1440×900 and 390×844 layouts: band, Gear rack, choices, pause, overlay,
  end screen, and four-way evolution selection do not overlap.
- Walk onto each token/chest from every direction; only one choice collects.
- Start, death, victory, retry, sandbox entry/exit, and Living Lab exit restore
  clean state with no console errors.
- `tsc --noEmit`, production `vite build`, and the Living Lab browser drive pass.

## Build sub-phases and developer gates

### Sub-phase A — Gear and reward plumbing

Implement Gear data/state, four-socket UI, normal offers, physical chests,
unified reward queue, evolution eligibility, next-bar application, and sandbox
controls. Evolution may temporarily show a registry name/diamond without new
combat behavior.

**Gate:** In a live run, the developer can intentionally acquire Gear, prepare
one Tier-IV recipe, collect a physical chest, choose among multiple eligible
recipes, and see the selected change land on the next bar without losing or
duplicating any reward.

### Sub-phase B — evolved sound

Implement and audition all nine evolved sound treatments with unchanged charts.

**Gate:** The developer is happy to hear every legal evolved seven-voice band
mix (Snare or Clap × Lead or Bell, with the other five fixed roles); every
evolved weapon is recognizable by ear, no event count or rhythm changed, and
Undertow/Chord/Bell tails do not muddy the track.

### Sub-phase C — evolved combat

Implement the nine gameplay transformations, visuals, attribution, sandbox and
Living Lab fixtures, then run a muted balance pass.

**Gate:** Muted, the developer can identify each evolution by what it makes him
do and no pair feels like a stronger version of the same spatial job.

### Sub-phase D — fusion and run economy

Tune Gear offer pressure, chest conversion, damage, coverage, and final UI in
complete eight-minute runs with sound on.

**Gate:** At least one evolution is realistically reachable through deliberate
play by the guaranteed 5:00 chest, taking Gear feels like a meaningful cost,
the evolved attack and sound land as one event, and the feature improves the
late-run fantasy without trivializing minutes 5–8.

No sub-phase advances past its gate without the developer's explicit pass. A
failed gate loops inside its sub-phase.

## Verdict protocol

The developer plays:

1. one muted full run pursuing any evolution;
2. one sound-on full run pursuing a different evolution;
3. the sandbox roster, base IV versus evolved, for all nine weapons; and
4. the four legal evolved seven-voice band mixes in the rehearsal room.

**Pass** requires all of:

- every evolution's fantasy matches what is heard and what happens;
- all nine combat jobs remain distinct;
- the build still sounds coherent at full size;
- Gear choices do not crowd weapon growth out of the eight-minute economy;
- a prepared chest always evolves exactly one chosen weapon; and
- no hidden off-grid firing loop exists.

Any failure returns to the responsible sub-phase. Record the verdict and every
gate outcome in `docs/STATUS.md`.

## Explicit non-goals

- No meta-progression unlock tree.
- No evolution discovery/collection encyclopedia.
- No weapon fusion requiring two weapons.
- No Gear tiers, Gear rerolls, Gear drops, or Gear swapping.
- No unevolution or mid-run weapon replacement.
- No new genre, tempo, note-set, stage, enemy, boss, or boss-instrument system.
- No restoration of the deleted general item/effect/audio-FX framework.
- No automatic balance claim: final numbers remain a developer hands/ear gate.

