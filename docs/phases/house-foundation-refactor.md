# House Foundation Refactor Spec

Phase: autonomous foundation refactor, before M4. Locked July 10, 2026 from
the developer's explicit direction to redesign the weapons, enemies, balance,
and UI from first principles without a question round. Parent plan:
`docs/plan.md`.

This spec supersedes the catalog, pick-economy, passive-item, weapon-effect,
enemy-director, and in-run UI decisions in `the-band.md`. The eight band slots
and Model A remain: one scheduled musical event still produces one sound and
one weapon attack. No new reward, drop, or meta-progression mechanic is added.

Answers this phase's question: **does a deliberately small House band create a
stronger survivors-like and a cleaner track than the accumulated 24-weapon,
item, and enhancement sandbox?**

## Research basis

- Ableton's rhythm material identifies the stable House skeleton used here:
  kick on every beat, clap/snare on beats 2 and 4, and open hi-hats between the
  beats. Sources: [Ableton Backbeats](https://learningmusic.ableton.com/make-beats/backbeats.html)
  and [Programming Beats 2](https://makingmusic.ableton.com/programming-beats-2-linear-drumming).
- Roland's traditional House walkthrough also uses the 909 kick, clap, and
  offbeat open hat; the original TR-909 exposes a 16-step pattern grid and the
  drum voices this soundset already samples. Sources:
  [Roland House beat walkthrough](https://www.roland.com/uk/blog/creating-beats-dance-styles-dj-808/?lang=en-GB)
  and [TR-909 specifications](https://support.roland.com/hc/en-us/articles/201921899-TR-909-Technical-Specifications).
- The identifiable [Empire Survivors](https://psymil.itch.io/empire-survivors)
  page describes an in-development project but publishes no dependable combat
  tables to borrow. The nearest usable numerical reference is Vampire
  Survivors. Its Mad Forest data uses minute-based roster swaps, minimum
  populations, short spawn
  intervals, and authored swarm events rather than one smooth stat ramp. Source:
  [Mad Forest waves](https://vampire-survivors.fandom.com/wiki/Mad_Forest).

These are references, not targets to copy. Loop Survivors has an eight-minute
arc, grid-fired weapons, and a different movement model; its bot and the
developer's hands remain the balance instruments.

## Weapon catalog: twelve, no filler

Every available weapon must pass four tests: a good House voice, a distinct
muted combat silhouette, a useful tier-1 floor, and a lane that cannot muddy a
full band. The old 24-role implementation may remain dormant as reusable
prototypes, but only these twelve are part of the game catalog:

| Key | Player slot | Weapon | Sound in plain words | Combat job |
|---|---|---|---|---|
| 1 | Beat | Kick | deep 909 thump on every beat | close aura pulse and breathing room |
| 2 | Snap | Clap | wide 909 hand-clap on beats 2 and 4 | forward close-range cone |
| 3 | Tick | Hi-hat | crisp closed/open metallic ticks | rapid aimed chip fan |
| 4 | Groove | Rimshot | dry wooden click between the main drums | crack that chains through a cluster |
| 4 | Groove | Shaker | softer sand-like sixteenth-note motion | damaging trail behind movement |
| 5 | FX | Crash | rare wide cymbal impact | expanding knockback shockwave |
| 6 | Low | Bass | deep rounded bass wave | slow, wide, piercing lane clear |
| 6 | Low | Acid Bass | rubbery, sliding short synth notes | thrown gravity well |
| 7 | Color | Chord | several notes as one short warm punch | thrown slowing damage field |
| 7 | Color | Rhodes | warm bell-like electric-piano hit | armed mine that blooms on contact |
| 8 | Hook | Lead | short bright synth hook | sparse homing seekers |
| 8 | Hook | Vocal Chop | brief human-like sung syllable | tag that bursts one beat later |

One slot still holds at most one weapon. Alternatives are concentrated where
they create a real gameplay fork: targeted versus movement damage, travelling
versus placed low-end damage, control versus traps, and direct versus delayed
targeting. The House skeleton stays fixed: every run starts with Kick; Clap,
Hi-hat, and Crash do not need weaker same-lane substitutes merely to reach a
catalog quota.

### Tier contract

There are exactly four tiers and no other upgrade system:

1. **Identity:** useful immediately; the player understands the shape.
2. **Cadence:** fires more often or stays relevant for longer.
3. **Coverage:** reaches more enemies through area, pierce, count, or control.
4. **Payoff:** a visible and audible phrase-level peak, not a generic percent
   modifier.

Only weapon cards appear at level-up. Passive items, global stat bags,
per-weapon sound/gameplay effects, effect eligibility tags, effect audio-node
chains, and their sandbox/UI surfaces are deleted. A complete eight-slot,
four-tier build caps at level 32; further XP has no benefit. Catalog exhaustion
does not hide a repeatable heal or any other substitute passive.

### House arrangement contract

- **120 BPM**, with a subtle 0.04 late-step shuffle. This keeps the developer's
  July 9 tempo decision and makes it the one source of truth.
- Kick keeps steps 0/4/8/12 of every 16-step bar at every tier.
- Clap keeps steps 4/12 (beats 2 and 4); higher tiers add quiet pickups, never
  replace the backbeat.
- Hi-hat owns steps 2/6/10/14 first, then fills selected gaps. Shaker is a
  softer percussion alternative to Rimshot and may use continuous quiet
  sixteenths.
- Bass and Acid Bass land between kicks and can never coexist. Acid uses short
  syncopated answers rather than a continuous high-density alarm.
- Chord/Rhodes hits are short and off the kick. Lead is a sparse four-bar hook.
- Vocal Chop answers the lead sparsely; neither becomes a continuous tune.
- Crash marks phrase starts and turnarounds.
- Tier growth changes accents, note movement, phrase length, and combat stats;
  it never turns every lane into sixteenth notes.
- Kick sidechain ducking stays on whichever Low-slot weapon is owned.

### Damage and visual contract

Per-trigger numbers are balanced against each authored chart, not in isolation.
Tier-1 weapons target a comparable survival floor while keeping intentional
specialties: Hi-hat/Lead are single-target leaning, Acid/Chord control packs,
and Crash is rare burst. Tier 4 should land around 2.2–3.0 times its own tier-1
effective contribution in focused bot runs; no one weapon should repeatedly
own more than about half of full-band effective damage without a clear risk or
positioning cost. These are diagnostics, never an automatic gate.

The shared visual language is weapon color plus shape:

- pulses/rings for Kick and Crash;
- a directional fan for Clap and thin needles for Hi-hat;
- a chained angular crack for Rimshot and fading footprints/pools for Shaker;
- a broad wave for Bass and a rotating vortex for Acid Bass;
- a segmented field for Chord and diamond target/mine for Rhodes;
- an arrowhead with a short trail for Lead and a tightening reticle for Vocal Chop.

Large camera shake and full-screen flash remain reserved for Crash and the
rarest Bass payoff. Frequent attacks use local feedback only.

## Enemy and stage redesign

The old curve made most of its difficulty through a global 1x→16x HP ramp and
up to 3,000 live enemies. That creates visually repeated damage sponges and
long late-game cleanup, not readable decisions. The new base roster is six:

| Enemy | Job |
|---|---|
| Swarmer | fragile crowd mass; the main source of satisfying kills |
| Tank | slow high-health body that anchors a wall |
| Darter | fragile needle that tells, dashes straight, then rests |
| Splitter | medium target that becomes three swarmers on death |
| Charger | heavy chevron that telegraphs, then commits to a dodgeable line dash |
| Elite | large checkpoint target at authored times |

Circler and Shielded are removed from the active roster; one frequently orbits
without pressure and the other compounds the bullet-sponge problem. Darter
gains a visible tell so it and the heavier Charger test different dodge timing.
Tank must actually appear in the director. Global HP ends at 5x rather than
16x, damage at 1.65x, and speed at 1.18x. Fodder density and authored mixed waves
carry the threat. The director changes every 30 seconds, introduces one threat
at a time in the first half, and alternates pressure pulses with 8–12 second
breathers. Elites land near 1:30, 3:30, 5:30, and the finale. Steady spawning
now refills a target live population instead of growing unconditionally; the
soft/hard caps fall to 450/600 so the screen can communicate the pressure and
the renderer can hold it comfortably.

Balance goals for engineering comparison:

- AFK dies during the opening quarter.
- A calibrated Kiter still experiences HP pressure; a coherent build can
  finish, a scattered build can fail, and choices create visible spread.
- Full runs reach roughly 14–18 weapon picks so the four-tier-only economy has
  an arc without maxing the whole band.
- Late play contains many kills plus a few priority bodies, not a screen of
  identical 16x-health circles.
- No dynamic difficulty adjustment: the time script remains independent of
  player performance.

## UI and development controls

The full chart-grid overlay is removed from the arena. The Rehearsal room keeps
its editable grid; gameplay gets a compact live track deck:

- a fixed 4×2 panel, one cell per band slot, never horizontally scrollable;
- key number, short owned weapon name, four tiny tier marks, and a trigger
  pulse; empty slots are quiet outlines;
- muted/disabled tracks dim and show an off mark;
- desktop keys **1–8** toggle the owned weapon in the matching slot off/on;
  clicking the cell provides the same developer action;
- toggling mutes the audio monitor only; attacks keep running so an audition
  does not silently change the balance scenario. This is a deliberate
  development-only exception to Model A, not a shipped combat mechanic.

The HP/XP/time HUD remains compact. Debug actions move behind one small `DEV`
disclosure instead of forming a permanent button ribbon. The start screen
leads with one Start action; autoplay modes and lab/sandbox links move into a
secondary developer disclosure. Pick cards show weapon, slot, next tier, and
one honest gameplay sentence. Desktop and phone layouts must not cover the
player's central play space.

## Build order and gates

1. Catalog/patterns/stats/visuals plus passive/effect deletion. Engineering
   gate: build clean; all twelve available and every tier fires; full-band
   arrangement satisfies chart guards.
2. Enemy roster/director/scaling and XP cadence. Engineering gate: AFK/Kiter
   comparative batches show pressure and policy spread without dead weapons.
3. UI/track deck/number toggles. Engineering gate: desktop and phone browser
   passes, level-up/pause/end/sandbox flows, key and click toggles, no console
   errors.
4. Independent quality-of-life review. In-scope, low-risk findings are fixed;
   larger future systems are documented rather than smuggled into this phase.

The developer's ear and hands remain the only final gate. Engineering and bot
checks can prove coherence, reachability, determinism, and gross balance; they
cannot declare that the track sounds good or the run feels satisfying.

## Implementation decisions recorded July 10

The developer explicitly delegated these judgments and prohibited a question
round, so the implementation pass locked the following details after measured
comparisons:

- XP thresholds were front-loaded and the collection halo settled at 180px.
  Kill-forward winning builds reach the intended 14-pick neighborhood; a bot
  that wins mostly by evasion remains visibly under-built instead of receiving
  free progression.
- Crash cadence and radius were cut, Bass waves received finite pierce, and
  Acid Bass/Chord were capped at one live control field. Focus batches had
  exposed those as unbounded whole-screen work. Hi-hat, Shaker, and Lead
  received stronger floors.
- Darter's tell is 0.34 seconds, its dash is 0.46 seconds, and it braces only
  during that tell/dash before a long vulnerable recovery. Close, opposed
  pincer events carry a stronger contact hit and make movement—not passive
  aura damage—the answer. This is a short readable state, not the removed
  always-on Shielded enemy.
- The old pool-exhaustion heal was deleted after it let a stationary maxed
  build turn surplus XP into indefinite sustain, contradicting the requested
  weapon-tier-only economy.
