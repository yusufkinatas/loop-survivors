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
   editor, and the bot's item/effect handling are deleted. The pick pool is
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
   events. Tuned with headless bot batches; the developer's hands remain the
   real gate.

5. **Dev track toggles:** keys 1..8 map to the eight band slots in rack order.
   Pressing a number MUTES/UNMUTES the audio of the instrument owning that
   slot (voice gain 0/1). Gameplay triggers still fire (damage unchanged) so
   the toggle is a listening tool, not a balance cheat; this also keeps bot
   determinism and replays intact. The rack socket dims while muted.

6. **Track overlay minimalized:** the wide scrollable playground dock is
   replaced by a slim "now playing" readout — one row per active voice (color
   dot, name, tier pips, a 16-step single-bar mini-grid with a playhead),
   fixed width, no scrolling. The full editable playground remains in the
   rehearsal room.

7. **UI cleanup from a code-level review** (the Chrome extension being down,
   the review is over hud.ts/game.ts/style.css rather than screenshots):
   debug row hidden behind a single toggle, dev-only badges off player
   screens, corner chrome consolidated.
