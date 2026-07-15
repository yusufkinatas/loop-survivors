# Overhaul: weapons, enemies, balance, UI (July 10, 2026)

Developer directive (verbatim intent): redesign the weapon system from scratch
(list, effects, damage, visuals, catalog, house-idiomatic sounds and patterns),
then redesign enemies and spawn balancing for a more challenging, satisfying
base game (no new mechanics), remove ALL passive items and ALL weapon
enhancement effects (keep only base weapons + their tiers), add a dev mechanism
where keyboard number keys toggle the running tracks on/off, iterate on the UI
(the wide scrollable track overlay must become minimalistic; a review pass over
all UIs), then run a QoL review. Fully autonomous; decisions documented here.

The three chat links given for extra context could not be read: the Claude in
Chrome extension was not connected in this session. Decisions below are made
from the repo, docs/STATUS.md, and fresh research (house pattern conventions,
Vampire Survivors balance numbers), as authorized ("use your own judgement but
document these decisions").

## Decisions

1. **Catalog: 16 instruments, 8 slots x 2.** The band system stays (it passed
   its gate). The catalog is curated to the sounds that belong on a house
   track; the 8 that fit worst are deleted entirely (role, kit, charts, stats,
   render paths, systems they solely own):
   removed — cowbell, zap, rimshot, heartbeat, ride (and the freeze system),
   reese, choir, whistle (and the tag system).
   kept — kick+tom (Pulse), clap+snare (Backbeat), hat+shaker (Hats),
   arp+acid (Motion), crash+riser (FX, riser keeps the auto-dash), bass+pluck
   (Bass), chord+rhodes (Harmony), lead+bell (Melody).
   Rationale: two per slot keeps every pick a real fork while every voice is
   house-idiomatic; no NEW synthesis is introduced because the developer's ear
   is the gate and cannot be consulted mid-session.

2. **Items and weapon effects removed.** `items.ts`, `effects.ts`, the Mods
   bag, the audio `voicefx` insert chain, the item strip UI, the sandbox item
   editor are deleted. The pick pool is
   weapons and tier-ups only (heal fallback stays). This is deliberately a
   clean amputation, not a flag: a different enhancement system comes later.

3. **Patterns rewritten as one coherent house track** (122 BPM, swing 0.10),
   following researched conventions: four-on-the-floor kick (placement never
   changes across tiers), clap/snare locked to 2 & 4, open hats on the
   off-beats, closed-hat/shaker densification (on-beats -> 8ths -> 16ths with
   accents), off-beat bass answering the kick, M1-style piano stabs off the
   downbeat, sparse call-and-response lead, riser resolving into the crash on
   the phrase downbeat. Tiers grow by densifying and layering, never by
   breaking the skeleton.

4. **Balance anchored to Vampire Survivors ratios,** compressed to the 8-min
   arc: starting weapon single-target DPS ~10 vs minute-1 fodder HP ~8-10
   (TTK <= 1s), contact damage ~10% of player HP and mostly flat, danger
   scales through density and HP, sawtooth pressure (per-minute spikes with
   structural breathers), min-alive quota backfill, scripted swarm/wall
   events. The developer's hands remain the real gate.

5. **Dev track toggles:** keys 1..8 map to the eight band slots in rack order.
   Pressing a number MUTES/UNMUTES the audio of the instrument owning that
   slot (voice gain 0/1). Gameplay triggers still fire (damage unchanged), so
   the toggle is a listening tool, not a balance cheat. The rack socket dims
   while muted.

6. **Track overlay minimalized:** the wide scrollable playground dock is
   replaced by a slim "now playing" readout — one row per active voice (color
   dot, name, tier pips, a 16-step single-bar mini-grid with a playhead),
   fixed width, no scrolling. The full editable playground remains in the
   rehearsal room.

7. **UI cleanup from a code-level review** (the Chrome extension being down,
   the review is over hud.ts/game.ts/style.css rather than screenshots):
   debug row hidden behind a single toggle, dev-only badges off player
   screens, corner chrome consolidated.

## Explicit parity addendum (July 11, 2026)

The developer explicitly authorized a rework after the July 10 overhaul: make
movement and enemy pressure feel as close as practical to Vampire Survivors'
first stage, especially Mad Forest's first eight minutes; keep this game's own
weapons and visual language, but bring their damage, footprints, and challenge
onto the same mathematical scale. This is explicit sign-off to amend decision
4 above. It is **authorization to build, not a passed developer gate**.

The version-pinned factual and derived calibration record is
`docs/research/mad-forest-reference.md`. Where that document labels a value
CURRENT, LEGACY, DERIVED, ADOPTED, or INFERENCE, implementation and review must
preserve the distinction. In particular, the current commercial game's data
table and the old official v0.2.4 demo are not to be represented as one
authoritative source version.

### Locks for this rework

1. **Eight-minute boundary.** Reproduce the `0:00` through `7:00` Mad Forest
   waves and events at their original minute positions. The run resolves at
   8:00; the `8:00` Zombie wave and Giant Bat are documented but not moved
   earlier. No 30-minute schedule compression.
2. **Movement and contact.** Use the height-normalized Antonio/Mad Forest
   movement target, normalized diagonals, direct-homing regular enemies,
   overlap resolution, 120 ms contact lock, 120 HP, and one point of Armor.
   Pressure comes from the source roster, live floors, intervals, and events,
   not an invented global time ramp.
3. **Enemy roster and rewards.** Add project-rendered equivalents of the units
   required by minutes 0–7, with source HP, Power, speed, XP, knockback, and
   explicit HP-per-player-level rules. Use original names/shapes/colors in the
   shipped presentation. Chest/evolution and stage-item systems remain outside
   this addendum. Preserve each boss row's any-chest probability by translating
   a successful roll into one project-native weapon-tier choice; this is a
   documented reward-economy adaptation, not chest/evolution parity.
4. **Kick becomes the Whip analogue.** The four project tiers map to Whip
   levels 1/3/5/8 for raw damage, Amount, and Area. Replace the radial aura with
   facing-relative horizontal pass-through strips. Tier 1 is front-facing;
   tiers 2–4 add the opposite strip 0.10 s later.
5. **Model A cadence compromise.** Kick remains an audible **and gameplay**
   strip on every four-on-the-floor beat at 122 BPM. Either side starts one
   shared, per-target 1.35 s Kick re-hit lock. This preserves one trigger ->
   sound plus gameplay while approximating Whip's per-target damage cadence.
   It deliberately permits fresh enemies to be caught every beat, so the
   hands gate must judge crowd throughput and feel.
6. **Other AoE.** Audit the remaining weapons against the new enemy/player
   scale and reduce generous radii or damage where necessary. Their identities
   and audio patterns stay this game's own; this is not a request to replace
   every weapon with a named Vampire Survivors counterpart.
7. **Original death satisfaction and enemy reads.** Add a bounded procedural
   vanish/burst effect and make regular/elite archetypes distinguishable using
   the existing vector style. Do not copy sprites, frames, sounds, map art,
   code, or UI from the reference game.

### Gate state

Implementation and engineering verification are complete. Nothing in this
addendum passes the developer's ear/eye/hands gate. That gate must cover a full
manual eight-minute run: movement weight, crowd collision and contact danger,
minute-event rhythm, XP/pick cadence, Kick facing/area/damage, the reduced AoE
budget, elite readability, and kill satisfaction. A failure loops inside this
rework rather than advancing the roadmap.
