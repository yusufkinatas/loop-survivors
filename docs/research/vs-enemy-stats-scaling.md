# Vampire Survivors: Mad Forest enemy stats and scaling (normal mode)

Research for issue #172 (part of #170). Answers two questions against the
official wiki (https://vampire.survivors.wiki, a wiki.gg site): the base stats
of every enemy in the Mad Forest normal-mode wave table, and the scaling VS
applies on top of those base stats. Ends with an audit of this repo's existing
mirror in `src/game/config.ts`.

Primary sources are the per-enemy wiki pages (their `Statbox Enemy` templates,
read via the raw-wikitext API endpoint where possible), cross-checked against
the stage page. Every table cites its page. Where the wiki is ambiguous it is
flagged in the final section — nothing there is guessed.

**Naming note.** The wiki spells the bat family "Pipeestrello" and warns that
most enemy names are wiki inventions derived from internal IDs, not official
names. This document uses the ticket's spellings ("Pipistrello") with the
internal ID alongside, since the IDs are the stable handle.

**Reading the stat columns.**

- *Power* is the enemy's contact damage before the player's armor is
  subtracted.
- *Move Speed* is in the game's legacy units (the same units
  `ENEMY_SPEED_UNIT` in `config.ts` converts from), before the stage's x1.1
  enemy-speed modifier.
- *Knockback* is the enemy's knockback-taken multiplier (0 = immune,
  1 = pushed fully). The parenthesized number is the wiki's "max knockback":
  a cap on how high the multiplier can be raised by debuffs (Garlic /
  Soul Eater add +0.3 knockback-taken per hit until that cap). Source:
  https://vampire.survivors.wiki/w/Knockback
- *HP x Level* is a per-enemy skill flag: max HP is multiplied based on the
  player's level **at the moment the enemy spawns** and is not updated if the
  player levels up while it is alive. Source:
  https://vampire.survivors.wiki/w/Enemies (Skills section). See the scaling
  section for the exact formula and its one caveat.

## 1. Stage-level modifiers (normal mode)

From the Mad Forest stage infobox, https://vampire.survivors.wiki/w/Mad_Forest:

| Modifier | Normal value |
|---|---|
| Time limit | 30:00 |
| Player MoveSpeed | x1.1 |
| **Enemy MoveSpeed** | **x1.1** |
| Projectile speed | x1 |
| Greed (gold) | x1 |
| Luck bonus | +0 |
| XP bonus | x1 |
| **Enemy health bonus** | **x1** |
| Enemy minimum multiplier | x1 |
| Starting spawns | 10 |
| Spawn type | Standard (from all four directions around the player) |

So in normal mode the stage applies exactly one stat modifier to enemies:
MoveSpeed x1.1. No stage-wide HP or power multiplier. (For contrast: Hyper is
enemy speed x2 and enemy-minimum x1.25; Inverse adds enemy HP x3 with
+0.05/min and enemy speed +0.005/min — the only mode with a per-minute ramp.)

## 2. Base stats per enemy

### 2a. Regular spawns

| Enemy | Internal ID | Max HP | Power | Speed | XP | Knockback (max) | HP x Level | Notes |
|---|---|---|---|---|---|---|---|---|
| Little Pipistrello | BAT1 | 1 | 5 | 140 | 1 | 1 (3) | no | |
| Red-Eyed Pipistrello 1 | BAT2 | 5 | 5 | 140 | 1 | 1 (3) | no | |
| Red-Eyed Pipistrello 2 | BAT3 | 5 | 5 | 140 | 1 | 1 (3) | no | Sprite-only difference from BAT2; stats identical |
| Zombie | — | 10 | 10 | 100 | 1 | 0.8 (3) | no | "Takes reduced knockback"; 3 visual variants, identical stats |
| Skeleton | — | 15 | 10 | 100 | 2 | 1 (3) | no | 6 visual variants, identical stats |
| Ghost (blue and red) | — | 10 | 5 | 200 | 1.5 | 0 (3) | no | Both color variants identical |
| Gray Mudman | Mudman 1 | 70 | 10 | 100 | 2.5 | 0.3 (3) | no | |
| Green Mudman | Mudman 2 | 150 | 10 | 100 | 2.5 | 0.3 (3) | no | |
| Flower (Flower Wall) | FLOWER | 30 | 1 | 20 | 2 | 1 (3) | **yes** | Appears both as the closing-ring event and as a normal spawn (min 21–24, 26) |
| Bat Swarm | BATSWARM | 1 | 1 | 700 | 1 | not listed | no | Fixed direction; sweeps in a straight line pushing other enemies; resistant to defang |
| Ghost Swarm | (Ghost swarm variant) | 1-tier swarm like Bat Swarm | — | 700 | — | — | no | Same fixed-direction sweep behavior, Ghost sprites (min 13, 27 events) |
| Mantichana | XLMANTIS | 500 | 20 | 80 | 3 | 0 (3) | no | Normal spawn at 16:00; the same statline is also its 5:00 boss-type spawn (see 2c) |

Sources: https://vampire.survivors.wiki/w/Pipeestrello (all bat variants on
one page; `Little_Pipistrello` and `Silver_Bat` redirect/404 into it),
/w/Zombie, /w/Skeleton, /w/Ghost, /w/Mudman, /w/Flower_Wall (`/w/Flower` is a
disambiguation page), /w/Mantichana.

The wiki lists a **single stat row per variant**: stats do not change with the
minute an enemy appears in Mad Forest. What changes per minute is which
variant spawns (e.g. Zombie sprites 1/2/3 at minutes 1/6/8 are visual
variants of one statline; the bat family's escalation is BAT1 → BAT2/3 →
Giant/Glowing/Silver, each a distinct statline).

### 2b. Special (elite) enemies the repo does not have yet

| Enemy | Internal ID | Max HP | Power | Speed | XP | Knockback (max) | HP x Level | Mad Forest minutes |
|---|---|---|---|---|---|---|---|---|
| Giant Bat | — | 270 | 10 | 140 | 2.5 | 0.1 (3) | no | Boss-type at 8; normal at 9, 14, 15, 20, 28 |
| Silver Bat | BAT5 | 50 | 10 | 140 | 30 | 1 (3) | **yes** | Boss-type at 9, 14, 18, 23; normal at 29 |
| Glowing Bat | BAT4 | 50 | 10 | 140 | 30 | 1 (3) | **yes** | Boss-type at 1, 3, 7, 11*, 12, 16, 21*, 22, 27, 29; normal at 28, 29 |
| Werewolf | WEREWOLF | 180 | 14 | 130 | 2 | 0.8 (3) | no | Normal at 12, 13, 14, 15 |
| Big Mummy | XLMUMMY | 500 | 20 | 80 | 3 | 0 (3) | no | Normal at 17–20, 22–24, 27 |
| Venus | XLFLOWER | 500 | 20 | 80 | 3 | 0 (3) | no | Boss-type at 21 and 24; normal at 25, 26 |

\* The 11:00 and 21:00 Glowing Bats only spawn when Arcanas are enabled, and
their chests award only an Arcana.

Sources: https://vampire.survivors.wiki/w/Giant_Bat, /w/Pipeestrello,
/w/Werewolf, /w/Big_Mummy, /w/Venus. The wiki's Mantichana trivia notes that
Mantichana, Big Mummy, and Venus deliberately share one statline
(500/20/80/3, knockback 0).

Silver Bat and Glowing Bat are stat-identical; Silver is the later-game
recolor. Both carry HP x Level — the only non-boss kinds besides Flower
that do.

### 2c. Bosses

The four "Giant" bosses are separate stat blocks (internal `BOSS_*` IDs), all
rendered at 1.5x sprite scale, all with HP x Level:

| Boss | Internal ID | Base HP | Power | Speed | XP | Knockback (max) | HP x Level | Freeze resist | Minute |
|---|---|---|---|---|---|---|---|---|---|
| Giant Mantichana | BOSS_XLMANTIS | 150 | 20 | 160 | 50 | 0 (1) | yes | 1.1 | 10:00 |
| Giant Werewolf | BOSS_WEREWOLF | 200 | 20 | 130 | 2 | 0.1 (1) | yes | (blank) | 15:00 |
| Giant Mummy | BOSS_XLMUMMY | 250 | 20 | 80 | 25 | 0 (1) | yes | 1.1 | 20:00 |
| Giant Blue Venus | BOSS_XLFLOWER | 150 | 30 | 160 | 50 | 0 (1) | yes | 1.1 | 25:00 |

Sources: /w/Mantichana, /w/Werewolf, /w/Big_Mummy, /w/Venus (each boss lives
on its base enemy's page as an "unlisted variant"). Defeating Giant Blue
Venus unlocks Hyper mode for the stage.

Two structural findings about how VS builds its boss schedule:

1. **"Boss" is a spawn type, not always a separate statline.** The 5:00
   Mantichana, 8:00 Giant Bat, and 21:00/24:00 Venus boss rows use the
   *normal* variant's stats (500/270/500 HP, no level scaling) spawned as a
   boss-type: they get the boss behaviors (no despawn — teleported back
   on-screen instead — and a treasure-chest config) without a special stat
   block. A `BOSS_XLBAT` variant (500 HP, HP x Level) exists on the wiki but
   appears only in Boss Rash, not Mad Forest.
2. **The Giant bosses have *lower* base HP than their normal kin** (Giant
   Blue Venus 150 vs Venus 500) because HP x Level does the work: the boss
   overtakes the normal variant from player level 4 onward. Boss durability
   in VS comes from level scaling, not from a big base number.

The Reaper (30:00+) for completeness: 655,350 HP multiplied by player level
at spawn, Power 65,535, Speed 1,200, XP 0, knockback **-0.5** (negative:
knockback pulls it toward the player), resistant to freeze / instant-kill /
debuff (Orologion-style full freezes still work). One more Reaper spawns each
minute past 30, and all other enemies are cleared at 30:00. Source:
https://vampire.survivors.wiki/w/The_Reaper, /w/Mad_Forest.

### 2d. Wave table (normal mode) for cross-reference

From the raw wikitext of https://vampire.survivors.wiki/w/Mad_Forest.
"Min" is the wave's enemy minimum, "Int" its spawn interval in seconds.

| Minute | Spawn pool | Min | Int | Boss (and chest?) | Event |
|---|---|---|---|---|---|
| 0 | Red-Eyed Pipistrello 2 | 15 | 1.0 | — | — |
| 1 | Zombie, Little Pipistrello | 30 | 1.0 | Glowing Bat (chest) | — |
| 2 | Little Pip., Red-Eyed 1, Red-Eyed 2 | 50 | 0.5 | — | Bat Swarm x2 |
| 3 | Skeleton | 40 | 0.25 | Glowing Bat (chest) | Bat Swarm 10% |
| 4 | Skeleton, Ghost | 30 | 1.0 | — | Bat Swarm 10% |
| 5 | Green Mudman | 10 | 1.0 | Mantichana (chest) | Flower Wall ring, 30s |
| 6 | Zombie, Green Mudman | 20 | 0.5 | — | Bat Swarm 10% |
| 7 | Red-Eyed 1, Red-Eyed 2, Gray Mudman | 80 | 0.5 | Glowing Bat (chest) | Bat Swarm 80% x5 |
| 8 | Zombie | 100 | 1.5 | Giant Bat (**no chest config**) | Bat Swarm 80% x2 |
| 9 | Giant Bat, Zombie | 30 | 0.5 | Silver Bat (chest) | Bat Swarm 70% x2 |
| 10 | Gray Mudman, Green Mudman | 10 | 0.5 | **Giant Mantichana** (chest) | Flower Wall ring, 60s |
| 11 | Skeleton | 300 | 0.1 | Glowing Bat (Arcana only) | Bat Swarm 10%, amount 50 |
| 12 | Werewolf, Ghost, Skeleton | 20 | 0.25 | Glowing Bat (chest) | Bat Swarm 10% |
| 13 | Werewolf, Ghost (double weight) | 150 | 0.5 | — | Ghost Swarm 70% x20, twice |
| 14 | Giant Bat, Werewolf | 20 | 0.1 | Silver Bat (chest) | — |
| 15 | Werewolf, Giant Bat, Green Mudman | 100 | 0.1 | **Giant Werewolf** (chest) | Flower Wall ring 80%, 60s |
| 16 | Mantichana, Gray Mudman, Green Mudman | 100 | 0.1 | Glowing Bat (chest) | — |
| 17 | Big Mummy | 20 | 1.0 | — | — |
| 18 | Big Mummy, Gray Mudman | 60 | 0.5 | Silver Bat (chest) | — |
| 19 | Big Mummy, Gray Mudman | 100 | 0.5 | — | — |
| 20 | Big Mummy, Green Mudman, Giant Bat | 100 | 0.1 | **Giant Mummy** (chest) | Bat Swarm 70% x20, twice |
| 21 | Flower Wall | 300 | 0.1 | Venus + Glowing Bat (Arcana only) | — |
| 22 | Flower Wall, Big Mummy | 200 | 0.1 | Glowing Bat (chest) | — |
| 23 | Flower Wall, Big Mummy | 300 | 0.1 | Silver Bat (chest) | — |
| 24 | Flower Wall, Big Mummy | 300 | 0.1 | Venus (**no chest config**) | — |
| 25 | Venus | 100 | 0.1 | **Giant Blue Venus** (chest) | Flower Wall ring x5, 10s each |
| 26 | Venus, Flower Wall | 150 | 0.1 | — | — |
| 27 | Big Mummy, Gray Mudman, Green Mudman | 300 | 0.1 | Glowing Bat (chest) | Ghost Swarm guaranteed + x19 |
| 28 | Giant Bat, Glowing Bat | 300 | 0.1 | — | — |
| 29 | Glowing Bat, Silver Bat | 300 | 0.1 | Glowing Bat (chest; one of the spawns is the boss) | Bat Swarm guaranteed + x19 |
| 30+ | — | 1 | 60 | The Reaper, +1 per minute; screen cleared | — |

## 3. Scaling logic on top of base stats

### 3a. HP x Level (player-level HP scaling)

- **Formula:** max HP = base HP x player level, evaluated once at spawn time;
  never re-evaluated while the enemy is alive. The plain "x level" form is
  stated verbatim only on the Reaper page ("health pool is set at 655,350,
  further multiplied by the player's level when it spawns"); the general
  Enemies-page description says "multiplies the enemy's health based on the
  player's level" without writing the formula — see ambiguity 5.
- **Who has it in Mad Forest:** Flower (Flower Wall), Glowing Bat, Silver
  Bat, Giant Mantichana, Giant Werewolf, Giant Mummy, Giant Blue Venus, The
  Reaper. **Nobody else** — explicitly not the normal Giant Bat, Werewolf,
  Big Mummy, Venus, or Mantichana, including when those spawn as boss-type
  (minutes 5, 8, 21, 24).
- Sources: https://vampire.survivors.wiki/w/Enemies (Skills),
  /w/The_Reaper, plus the `skills = [[HP x Level]]` field of each stat box.

### 3b. Curse

From https://vampire.survivors.wiki/w/Curse:

- Base 100%; the displayed stat is a delta (+30% shown = 130% total).
  Sources stack additively; no upper limit.
- Curse multiplies, by its total percentage: enemy **health**, enemy
  **speed**, wave **enemy minimum** (quantity), and wave **spawn frequency**
  (`effective interval = interval / totalCurse`). The health/speed/minimum
  multipliers stack multiplicatively with other effects of the same kind
  (e.g. the stage's x1.1 speed).
- Timing: the health multiplier applies immediately to newly spawned enemies
  when Curse is gained mid-run; the other effects apply at the start of the
  next minute.
- Hard cap: at most 500 enemies on screen regardless of Curse/Charm.

### 3c. Time-based ramp

**There is none in normal mode.** The wiki documents no per-minute HP, power,
or speed growth for normal Mad Forest; difficulty ramps only through the wave
table (stronger variants, higher minimums, shorter intervals). Per-minute
stat ramps exist only in Inverse mode (HP +0.05/min, speed +0.005/min on top
of x3 HP). At 30:00 all enemies are cleared and Reapers take over.
Sources: /w/Mad_Forest infobox and wave table, /w/Enemies.

### 3d. Boss rules

- No special HP formula beyond HP x Level: the Giant bosses are just distinct
  stat blocks with the skill (section 2c).
- Bosses never despawn; if the player runs away they are teleported back to
  the screen edge.
- Chest drops are configured per boss *spawn row* in the wave table, not per
  enemy type: e.g. the 9:00 Silver Bat row rolls 3% for a 5-item chest, else
  10% for 3-item, else 50% for 1-item, else a guaranteed level-1 chest;
  Luck multiplies each roll chance. Sources: /w/Enemies (Bosses),
  /w/Treasure_Chest, /w/Mad_Forest.

### 3e. Wave minimums and despawn/refill

From https://vampire.survivors.wiki/w/Enemies (Waves): each minute's wave has
a minimum count and a spawn interval. Below minimum, the game spawns until
the quota fills; above it, one of each pool enemy spawns per tick. At 300+
alive, periodic spawning stops (only bosses and map events spawn). Non-boss
enemies despawn when the player moves far enough away (distance unquantified)
and are refilled as ordinary new spawns — the wiki documents **no stat
consequence** of the despawn/refill cycle.

## 4. Audit of the repo's mirror (`src/game/config.ts`)

Checked against the tables above (Mad Forest bestiary block plus
`madForestEnemyStats`):

**Correct and complete for what it covers.**

- All 12 mirrored statlines match the wiki exactly: bat 1/5/140/1 kb 1;
  redBat and redBat2 5/5/140/1 kb 1; zombie 10/10/100/1 kb 0.8; skeleton
  15/10/100/2 kb 1; ghost 10/5/200/1.5 kb 0; greenMudman 150/10/100/2.5
  kb 0.3; grayMudman 70/10/100/2.5 kb 0.3; flower 30/1/20/2 kb 1; glowingBat
  50/10/140/30 kb 1; mantis 500/20/80/3 kb 0; batSwarm 1/1/700/1 fixed
  direction.
- `hpPerLevel: true` on exactly flower and glowingBat is **correct and
  complete for the current roster** — those are the only implemented kinds
  carrying the wiki's HP x Level skill.
- `madForestEnemyStats` applying `hp * max(1, playerLevel)` at spawn matches
  the wiki's "applied the moment the enemy was spawned, not updated" rule.
- `ENEMY_SPEED_UNIT` baking in the x1.1 stage modifier matches the infobox.
- `mantis` at 500 HP without level scaling is the right statline for both
  its 5:00 boss-type appearance and its 16:00 normal appearance — VS gives
  the 5:00 boss no special stats, only boss spawn behavior (no despawn,
  chest). The `boss: true` flag is therefore about behavior, and would be
  wrong to pair with `hpPerLevel`.

**Gaps (missing kinds, expected — this is what #170 is mapping):** Giant Bat,
Silver Bat, Werewolf, Big Mummy, Venus, the four Giant bosses, Ghost Swarm,
The Reaper. When Silver Bat is added it needs `hpPerLevel: true` (it is
stat-identical to Glowing Bat); the four Giant bosses all need it too.

**One soft mismatch:** the repo gives batSwarm `knockback: 1`, but the wiki
does not list a knockback value for Bat Swarm at all (ambiguity 2 below).

## 5. Ambiguities the wiki leaves open

1. **Enemy names are wiki inventions.** The stage page warns that most names
   are made up from internal IDs and may change. IDs (BAT1, XLMANTIS,
   BOSS_XLFLOWER, ...) are the stable reference.
2. **Bat Swarm knockback** is not listed on its stat box; nor is any
   despawn/time-limit flag, though its sweep-across-and-leave behavior
   implies one.
3. **Chest-drop guarantees are not reconciled.** The Enemies page says
   bosses have "a chance" to drop a chest, but wave-table treasure configs
   have a guaranteed level-1 fallback; and two boss rows (8:00 Giant Bat,
   24:00 Venus) carry no treasure config at all, with no statement whether
   that means no chest.
4. **Curse vs bosses/Reaper:** the Curse page says its multipliers affect
   "enemies" with no boss carve-out documented either way.
5. **The exact general HP x Level formula** (plain x level, no offset or
   curve) is stated verbatim only for the Reaper; for the 30–250-HP carriers
   it is inferred from the same skill name, not spelled out.
6. **Despawn distance** ("far enough from them") is never quantified; the
   knockback duration on the Knockback page (120 ms) is tagged as
   unverified by the wiki itself.
7. **Giant Werewolf oddities:** XP 2 (vs 25–50 for the other three Giants)
   is verbatim from its stat box and unexplained; its freeze-resistance
   field is blank where the other three list 1.1 (blank vs 0 is not
   disambiguated).
8. **Knockback "(max)" numbers** are defined on the Knockback page as the
   debuff-raised cap, but per-enemy pages never restate this — normal
   enemies cap at 3, bosses at 1.
