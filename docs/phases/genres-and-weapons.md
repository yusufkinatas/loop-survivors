# Genres as Characters + a Twelve-Weapon Soundset

Direction set July 6, 2026 by the developer, replacing the dropped M3 "drop"
direction (`docs/phases/m3-the-drop.md`, superseded). Parent plan:
`docs/plan.md`. Everything from M1 and M2 carries forward unchanged unless
amended here (platform, input, collision, the phrase clock, the pick economy,
death tuning, the dividing rule, the dev tools).

This document records what was built. It was implemented directly at the
developer's instruction ("drop full tracks; genres are characters; ~12
weapons"), not through the usual grill-then-spec cycle, so it is a spec after
the fact. The developer's ear remains the gate on how it all sounds.

## The question

Does a genre, as a *character* that re-voices the whole soundset, make you want
to replay the game as someone else — and do twelve distinct weapons keep a
muted run varied? (Pillar 3: it must be a good survivors-like with the sound
off.)

## What was dropped

- The **full-track / destination-song** idea, in every form.
- The **drop event** (player-fired lock, exact-match recipe, vulnerable
  wind-up, synchronized slam, energy meter, re-score).

## What was kept

- The **Track Lab** stays, re-labeled the **Experimentation room**
  (`src/tracklab/`, the `#tracklab` route, a start-screen button). It is a
  standalone lab for auditioning reverse-engineered covers — no longer tied to
  a game mechanic, just a place to experiment. It works exactly as before; the
  only changes are the entry label and a self-identifying title. (It was briefly
  removed in the first pass of this work, then restored at the developer's
  request.)

## The model

- **A genre is a playable character.** Six ship: Lo-Fi, House, Synthwave,
  Phonk, Drum & Bass, Techno.
- **The soundset is shared.** All genres play the same twelve instrument types
  (the tools). A genre never adds or removes a weapon.
- **The track is the difference.** Each genre supplies its own tempo, swing,
  and a four-tier pattern ladder for every one of the twelve weapons. Same
  tool, different track: a House kick is four-on-the-floor, a Lo-Fi kick lays
  back, a Drum & Bass kick snaps a breakbeat.
- **Selection:** at the start of a run the player picks a genre, then a
  starting weapon (both on the start screen; the sandbox has a live genre
  switcher). Everything after is the M2 pick economy, unchanged, but voiced in
  the chosen genre.
- **Coherence still holds.** The minor-pentatonic note set and the chord-root
  rule (0/5/7) are enforced on every genre's charts at load, so no genre can
  clash (Pillar 2, the system owns the theory).
- **Tempo and damage.** A fast genre fires more triggers per second, so each
  genre carries a per-trigger `powerMul` (roughly inverse to tempo) so slow,
  hard-hitting genres stay competitive against fast, light ones (docs/plan.md,
  tempo and damage). Applied to every weapon as it fires.

## The twelve weapons

Six carried over from M1/M2, six new. Each is a distinct gameplay archetype,
with new-weapon behavior inspired by Vampire Survivors, plus a synthesized kit
(research-informed synthesis; see the M3-era sound research). Per-tier stats in
`src/game/config.ts`, behavior in `src/game/run.ts`, rendering in
`src/game/view.ts`, sounds in `src/audio/kits.ts`.

| Weapon | Sound | Gameplay archetype (VS analogue) |
|---|---|---|
| Kick | 808 kick | instant aura pulse around the player |
| Snare | snare | fast piercing bolt, aimed (Knife) |
| Hi-hat | hat | dense short spray, scattered |
| Bass | sub/saw | slow wide piercing wave |
| Chord | stab/pad | thrown slow-zone on the nearest pack (Santa Water) |
| Lead | square lead | homing seekers (Magic Wand) |
| Clap | 808 clap | wide forward melee slash cone (Whip) |
| Tom | pitched tom | boomerang out-and-back, deep pierce (Cross) |
| Cowbell | 808 cowbell | bolt that ricochets off the view edges (Runetracer) |
| Arp | pluck | orbiters circling the player (King Bible) |
| Zap | electric zap | instant lightning strikes on random foes (Lightning Ring) |
| Crash | cymbal crash | expanding shockwave, damage + knockback |

## Architecture

- `src/audio/kits.ts` — twelve synthesized kits (`Role` is now twelve-wide).
- `src/audio/groove.ts` — a tiny pattern DSL (`d()` drum strings, `m()` note
  tuples) so genre ladders stay legible.
- `src/audio/genres.ts` — the six genres: id, name, blurb, color, bpm, swing,
  powerMul, and a `Record<Role, Chart[]>` of four-tier ladders. Validated at
  load. Shared zap/crash ladders; everything else per genre.
- `src/audio/chartstore.ts` — genre-aware working copies; `setActiveGenre`
  swaps which charts `getChart` resolves to. Persistence keyed by genre.
- `src/audio/engine.ts` — `setGenre(genre)` sets tempo, swing, and re-points
  every voice's chart. `src/audio/clock.ts` — swing (offbeat-8th delay).
- `src/game/run.ts` — the six new weapon behaviors (cone, boomerang, ricochet,
  orbit, random strikes, shockwave + enemy knockback) and `powerMul`.
- `src/game/game.ts`, `src/game/hud.ts` — genre→weapon start flow.
- `src/game/sandbox.ts` — live genre switcher.
- Bot (`src/bot/*`, `scripts/bot.ts`) — genre-aware (`--genre <id>`), so
  floor-check batches can run per genre. The conductor times its virtual clock
  to the active genre's bpm.

## Verdict protocol

Same as every milestone: the developer plays it. Passes when (1) each genre
sounds recognizably itself and good to his ear, (2) the twelve weapons feel
distinct in the hand, muted, and (3) picking a genre feels like picking a
character worth replaying. Balance is the bot's job as a floor-check only
(floors, not peaks), per genre — no equalization.

## Known non-goals / follow-ups

- Per-genre balance is a floor-check, not tuned to parity (future systems will
  reshuffle weapon strength; equalizing now tunes a game that will not exist).
- Genre-specific drum *sounds* were deliberately not added: the soundset is one
  shared set of tools by design. Tempo, swing, and patterns carry the identity.
- The rehearsal room edits the active genre's charts (defaults to House).
