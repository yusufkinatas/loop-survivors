# Music Survivors (working title TBD): Development Plan

Status: planning complete, implementation not started. Compiled July 3, 2026.

## The Game in One Sentence

Vampire Survivors, but the weapons are sounds and a good build makes a track.
Target player sentence: "Have you tried a hip-hop build? It's crazy."

The player never touches music theory. Their gameplay decisions shape the music, and the system guarantees the result always sounds decent.

## Pillars (rules that settle future arguments)

1. **The things that make sounds are the weapons.**
2. **The system owns the theory.** No player choice can make the mix bad. Player-facing language is genre and vibe, never keys or BPM.
3. **Muted, it's still a good survivors-like.** Music multiplies a working game, it never excuses a broken one. Enforced by a recurring muted-run playtest.
4. **Combinations over volume.** Depth comes from systems interacting, not from content mass.

Cut, deliberately: a shareable per-run track artifact. No recording, rendering, or sharing systems in v1.

## Production Model and Constraints

- Solo designer-director. AI writes 100% of the code and is the candidate producer for art and sound content.
- The scarce resource is the developer's judgment hours. The plan optimizes for evaluation speed, not construction speed.
- Time availability varies, so progress is gated by milestones, never by calendar. Every milestone ends in something playable.
- Success definition: shipped and finished.
- Platforms: iOS and Android required. Desktop strongly wanted, and nearly free on the chosen stack.
- Visual style: fully open (AI-generated 2D, pixel art, procedural, audio-reactive, or a mix). Decision gate at M4.

## Core Architecture

**The dividing rule: the stage conducts the gameplay, the build alone makes the music.**

- The stage script is time and level driven. It owns spawn density, wave pressure, and boss timing. It carries no musical meaning and does not care how successful the build is. Bosses can meet a half-baked build or a monster.
- The build alone determines the player's music. The stage may act on the music only as a performer or conductor, never as a composer: it gets two narrow hooks (modulating global parameters like tempo, and injecting its own voice such as a boss instrument alongside the mix) and can never touch the build's charts, notes, or arrangement. The "I made a full track" feeling emerges because builds grow across a run: lone starting instrument, thickening arrangement, genre drop, full sound. (Neither stage hook is implemented in the M1 demo; the music system is built as a pure function of build and grid, with the hooks reserved, not forbidden.)

**Coupling (Model A).** Weapons fire on the musical grid. One trigger is one event with two outputs: damage in the world and a sound in the mix. The sequencer that decides when each weapon triggers is fire control and arranger at once. It is the main engine of the game.

**Weapons as sound.**
- Atomic unit: a **sound kit** plus a **music chart**. A kit is a small family of related samples per weapon (soft and hard variants, open and closed, multiple notes for pitched instruments). A chart says when, which variant, how hard, and for pitched weapons which note, so a synth chart is a melody.
- Charts are AI-drafted, approved by the developer's ear.
- Variation is guaranteed at three layers: free per-hit engine nudges to loudness and pitch, baked kit variants, and progression-driven change (richer charts, new notes, new voices, changed character).

**Coherence skeleton.** Each run locks its set of allowed notes at the start. Tempo is a live variable that design events may move. Because content is single sounds rather than baked clips, tempo changes are nearly free, no time-stretching.

**Tempo and damage.** Because charts fire on the grid, raising tempo mathematically raises trigger rate and therefore damage throughput. This is acknowledged, not fought: tempo is one damage lever among several, and per-trigger damage is the other axis. Slow, hard-hitting builds are a legitimate archetype, so stage pressure is tuned against a tempo range, never a constant, and slow genres stay competitive through per-trigger damage rather than special-case compensation.

**Genre system.** A mid-run evolution earned by meeting a recipe of ingredients, in the structure of VS weapon evolutions. Run arc: sketch phase, lock, full track. The moment, the musical drop, and the power spike are one event. Content is a reusable graph: one instrument type can sit inside many recipes. Scope currency is the count of tracks and instrument types, everything else derives. Refined at M3 grilling (`docs/phases/m3-the-drop.md`): the mechanical unit is a **track** (an exact recipe of instrument types → one composed song, deterministically selected); "genre" is a **flavor/family label** over tracks, not a mechanical layer. A **weapon is an instrument type** re-skinned per track, not a fixed sound. The lock is a **player-fired drop** (armed by an exact-match recipe), and it re-scores the build's weapons into the track's written parts.

**Bosses (candidate direction).** A boss arrives on the clock and carries its own instrument, audible during the fight. Duels are call-and-response, trading verses, never both mixed at once. Beating a boss takes its sound as an unlock. Details are playtest-era.

## Tech Stack

- **TypeScript + PixiJS v8** for rendering. Chosen after research: two-plus years inside AI training data on a stable API, official AI agent skills shipped in the npm package, and a particle system built for dynamic hordes. Phaser 4 was the runner-up, rejected because it shipped April 2026, after model training, with breaking changes exactly where thirteen years of Phaser 3 priors would mislead an AI coder.
- **Web Audio directly** for sound. Sample-accurate scheduled playback by specification. Our music scheduler is a thin lookahead layer over the audio clock. No middleware, no audio-engine building. Live effect chains are available, so baked-variant versus live-effect stays an open design choice forever.

## Roadmap

Every milestone ends playable and answers one named question.

- **M1, causality.** Greybox arena, a few weapon kits firing charts on the grid, enemies dying to it, deliberately ugly. Question: does it feel like my build and sound like music at the same time? This is the project's central bet. Fully specified in `docs/phases/m1-demo.md`.
- **M2, the arc.** Picks and leveling across a short full run. Question: does music growing with the build create the "I'm making a track" feeling? Fully specified in `docs/phases/m2-the-arc.md`.
- **M3, the drop.** First genre recipe and the lock event. Question: is the genre moment the peak worth betting the game on? Fully specified in `docs/phases/m3-the-drop.md`.
- **M4, vertical slice.** One stage, one boss (duel candidate auditions here), a few recipes, a first-time experience, and the visual style decision. Question: would a stranger play it twice? Content scope freezes at exit, priced with measured cost per sound and per genre.
- **M5, production.** Content build-out, meta progression, store prep including AI-content disclosure.

## Playtest Method

One question per session. The developer plays continuously and is the sole judge at each milestone exit. A recurring muted run enforces pillar 3.

An autoplay bot runs batch playtests as a balance instrument (floors, not peaks; it detects broken, never defines balanced). Spec: `docs/tools/autoplay-bot.md`.

## Parked Decisions (deliberately deferred to playtesting)

- ~~Genre lock delivery~~ **RESOLVED at M3 grilling**: a player-fired button, armed by recipe completion. See `docs/phases/m3-the-drop.md`.
- ~~What a genre lock changes~~ **RESOLVED at M3 grilling**: re-scores the build's weapons into one composed track (solo ladder charts swapped for the track's written parts, sounds re-skinned). Tempo adoption is build-tuning. See M3 spec.
- ~~Runs that never lock a genre~~ **RESOLVED at M3 grilling**: fine as freestyle, play the sketch out, no nudge. See M3 spec.
- ~~Recipe discoverability~~ **RESOLVED at M3 grilling (provisional)**: subtle dev overlay now, secret in the shipped game is the lean, final form deferred. See M3 spec.
- Collection loop under exact-match: how a player assembles an exact recipe on purpose (guided offers vs pure discovery), plus the brick-risk escape valve (drop/swap an instrument to recover a clean match). Entangled with recipe secrecy (parked at M3 grilling).
- Boss and enemy sound roles, duel format, whether a boss can silence the player's music for a bar.
- Audio effects: baked sound variants versus live engine effects, and items that act on sounds. (M3 grilling sketched the fit: an effect modifies an instrument slot and carries a coupled gameplay twin, e.g. echo → a delayed extra projectile; open tension is live effects smearing a composed track's mix.)
- Per-track signature drop effects: bespoke gameplay plus visuals per genre, beyond the shared slam and damage window (parked at M3 grilling; content and polish).
- Tempo-changing items and other progression mechanisms for sound variety.
- Multi-axis weapon growth: separate density/richness tiers or other alternative buff structures beyond the single linear ladder (parked at M2 grilling; revisit if ladders feel same-y).
- A weapon slot cap, once the catalog outgrows six kits (parked at M2 grilling; no cap while the catalog is six).
- Visual style (gate at M4).

## Ship Checklist Seeds

- AI-generated content disclosure where stores require it (Steam does).
- License verification for any purchased sample packs that ship in the final game.
