# Music Survivors (working title TBD): Development Plan

Status: foundation implemented through the July 10 House refactor; awaiting the
developer's ear-and-hands gate before M4. Originally compiled July 3, 2026.

## The Game in One Sentence

Vampire Survivors, but the weapons are sounds and a good build makes a track.
Target player sentence: "My build turned into a House track, and it wrecked the horde."

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
- The active soundset is a deliberately small **twelve-weapon House band**: kick, clap, hi-hat, rimshot, shaker, crash, bass, acid bass, chord, Rhodes, lead, and vocal chop. Each owns a distinct muted combat shape, and every combination is authored to fit the fixed House arrangement. Earlier roles remain prototypes, not available catalog entries.
- **Band slots.** Instruments live in eight typed band-position slots (Pulse, Backbeat, Hats, Motion, FX, Bass, Harmony, Melody); a build holds at most one instrument per slot, picks are permanent, and a full build is an 8-voice band — the structural fix for cacophony by accumulation and role collision. The clean-slate catalog and the decisions superseding the earlier 24-role pool are locked in `docs/phases/house-foundation-refactor.md`.
- Progression is weapon-only: four authored tiers per weapon. Passive items and per-weapon enhancement/effect picks are absent until a different future system is deliberately designed.
- Atomic unit: a **sound kit** plus a **music chart**. A kit is a small family of related samples per weapon (soft and hard variants, open and closed, multiple notes for pitched instruments). A chart says when, which variant, how hard, and for pitched weapons which note, so a synth chart is a melody.
- Charts are AI-drafted, approved by the developer's ear.
- Variation is guaranteed at three layers: free per-hit engine nudges to loudness and pitch, baked kit variants, and progression-driven change (richer charts, new notes, new voices, changed character).

**Coherence skeleton.** Each run locks its set of allowed notes at the start. Tempo is a live variable that design events may move. Because content is single sounds rather than baked clips, tempo changes are nearly free, no time-stretching.

**Tempo and damage.** Because charts fire on the grid, raising tempo mathematically raises trigger rate and therefore damage throughput. This is acknowledged, not fought: tempo is one damage lever among several, and per-trigger damage is the other axis. Slow, hard-hitting builds are a legitimate archetype, so stage pressure is tuned against a tempo range, never a constant, and slow genres stay competitive through per-trigger damage rather than special-case compensation.

**Genre system (removed July 9, 2026).** The earlier mid-run drop and later
"genre as character" experiments are historical (`m3-the-drop.md` and
`genres-and-weapons.md`). The active game has no genre selection or genre
logic. It boots directly into one fixed, unnamed House soundset at 120 BPM;
the build still makes the arrangement through Model A. A future genre system
must be designed again rather than restoring either superseded experiment.

**Bosses (candidate direction).** A boss arrives on the clock and carries its own instrument, audible during the fight. Duels are call-and-response, trading verses, never both mixed at once. Beating a boss takes its sound as an unlock. Details are playtest-era.

## Tech Stack

- **TypeScript + PixiJS v8** for rendering. Chosen after research: two-plus years inside AI training data on a stable API, official AI agent skills shipped in the npm package, and a particle system built for dynamic hordes. Phaser 4 was the runner-up, rejected because it shipped April 2026, after model training, with breaking changes exactly where thirteen years of Phaser 3 priors would mislead an AI coder.
- **Web Audio directly** for sound. Sample-accurate scheduled playback by specification. Our music scheduler is a thin lookahead layer over the audio clock. No middleware, no audio-engine building. Live effect chains are available, so baked-variant versus live-effect stays an open design choice forever.

## Roadmap

Every milestone ends playable and answers one named question.

- **M1, causality.** Greybox arena, a few weapon kits firing charts on the grid, enemies dying to it, deliberately ugly. Question: does it feel like my build and sound like music at the same time? This is the project's central bet. Fully specified in `docs/phases/m1-demo.md`.
- **M2, the arc.** Picks and leveling across a short full run. Question: does music growing with the build create the "I'm making a track" feeling? Fully specified in `docs/phases/m2-the-arc.md`.
- ~~**M3, the drop.**~~ **Dropped July 6, 2026.** Its replacement, genres as
  playable characters, was also removed July 9. Both specs are historical;
  the active foundation is the single fixed House soundset below.
- ~~**The band (interstitial, before M4).** Twenty-four instruments and utility
  weapons.~~ **Superseded July 10, 2026** by the smaller House foundation; the
  eight-slot ownership structure survives, the 24-role catalog does not.
- **House foundation refactor (interstitial, before M4).** Replaces the accumulated 24-role/item/effect sandbox with a twelve-weapon House catalog, weapon-only tiers, a kill-forward enemy director, and a compact live track deck. Question: does a deliberately small House band create a stronger survivors-like and a cleaner track? Specced in `docs/phases/house-foundation-refactor.md`.
- **M4, vertical slice.** One stage, one boss (duel candidate auditions here), a few recipes, a first-time experience, and the visual style decision. Question: would a stranger play it twice? Content scope freezes at exit, priced with measured cost per sound and per genre.
- **M5, production.** Content build-out, meta progression, store prep including AI-content disclosure.

## Playtest Method

One question per session. The developer plays continuously and is the sole judge at each milestone exit. A recurring muted run enforces pillar 3.

An autoplay bot runs batch playtests as a balance instrument (floors, not peaks; it detects broken, never defines balanced). Spec: `docs/tools/autoplay-bot.md`.

## Parked Decisions (deliberately deferred to playtesting)

> **Historical:** both the full-track/drop direction and its genre-character
> replacement were removed. The resolved M3 items below are moot and retained
> only as decision history; they do not describe the active game.

- ~~Genre lock delivery~~ **RESOLVED at M3 grilling** *(moot, superseded)*: a player-fired button, armed by recipe completion. See `docs/phases/m3-the-drop.md`.
- ~~What a genre lock changes~~ **RESOLVED at M3 grilling**: re-scores the build's weapons into one composed track (solo ladder charts swapped for the track's written parts, sounds re-skinned). Tempo adoption is build-tuning. See M3 spec.
- ~~Runs that never lock a genre~~ **RESOLVED at M3 grilling**: fine as freestyle, play the sketch out, no nudge. See M3 spec.
- ~~Recipe discoverability~~ **RESOLVED at M3 grilling (provisional)**: subtle dev overlay now, secret in the shipped game is the lean, final form deferred. See M3 spec.
- Collection loop under exact-match: how a player assembles an exact recipe on purpose (guided offers vs pure discovery), plus the brick-risk escape valve (drop/swap an instrument to recover a clean match). Entangled with recipe secrecy (parked at M3 grilling).
- Boss and enemy sound roles, duel format, whether a boss can silence the player's music for a bar.
- Audio effects: baked sound variants versus live engine effects, and items that act on sounds. (M3 grilling sketched the fit: an effect modifies an instrument slot and carries a coupled gameplay twin, e.g. echo → a delayed extra projectile; open tension is live effects smearing a composed track's mix.)
- Per-track signature drop effects: bespoke gameplay plus visuals per genre, beyond the shared slam and damage window (parked at M3 grilling; content and polish).
- Tempo-changing items and other progression mechanisms for sound variety.
- Multi-axis weapon growth: separate density/richness tiers or other alternative buff structures beyond the single linear ladder (parked at M2 grilling; revisit if ladders feel same-y).
- ~~A weapon slot cap, once the catalog outgrows six kits~~ **RESOLVED July 6, 2026 at the band grilling**: eight typed band-position slots, one instrument each, permanent picks. See `docs/phases/the-band.md`.
- Mid-run instrument swapping (a "second audition"): deliberately absent from the band system; a candidate meta-progression unlock later (parked at the band grilling).
- Visual style (gate at M4).

## Ship Checklist Seeds

- AI-generated content disclosure where stores require it (Steam does).
- License verification for any purchased sample packs that ship in the final game. **Active concern (July 7, 2026):** the `audio-refresh` branch may download free (not necessarily CC0) samples for per-genre voicing where synthesis falls short; every downloaded file's source + license is logged in `public/samples/<genre>/CREDITS.md` and must be cleared before ship.
