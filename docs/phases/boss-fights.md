# Boss Fights — the "boss makes the music" pivot

Status: built and self-verified (July 6, 2026), on branch `boss-fights`. Developer's ear/hands are still the gate.

## The pivot

We dropped the "full tracks" idea — the M3 direction where the **player** assembles a
recipe and fires a **drop** that re-scores their build into a composed track
(`docs/phases/m3-the-drop.md`, now superseded). That whole player-drop mechanic
(arm → wind-up → slam → damage-amp → energy re-drops) is gone.

In its place: **the boss makes the music.** A boss fight is a duel against a whole
track. When a boss arrives you are locked into a fixed arena, your weapons are
gone, your music stops, and the boss's track starts. The **structure of that
track is the fight's rhythm** — its sections are the boss's phases, its beats are
the boss's attacks. You have no weapons; you only move and dodge. You win by
**surviving until the song ends**. You never damage the boss — the "health" bar
is really the song draining away. When the last bar plays, the boss falls.

This keeps the pillars intact: the coupling is inverted but still Model A (a
trigger is one event — here the boss's instrument fires both a sound and an
attack), the system still owns the theory (the track is a fixed, ear-approved
composition), and muted it's still a competent bullet-dodging survival fight.

## What shipped

A standalone **Boss Fight page** (`#boss`, linked from the start screen as
"boss fights"): pick a boss, fight it, win or die, retry or pick another. Three
bosses, each a real Track Lab cover, each a drastically different survival
problem:

| Boss | Track | Archetype | The fight |
|---|---|---|---|
| **METAMORPHOSIS** | INTERWORLD, 175 BPM phonk | Close-range brawler | A body that hunts you. Ground-slam shockwave on every heavy kick (beat 1), a lunge + melee arc on the snare (beat 3). `peak`/`finale` add radial bursts and speed. You fight in its face and dash out on the beat. |
| **Satisfaction** | Benny Benassi, 130 BPM electro | Bullet hell | An anchored core. Radial rings on the 4-on-floor kick (rotating into spirals), a counter-rotating arm on the downbeat, aimed fans on the claps. `intro`→`build`→`drop` scale the density. You read the gaps and weave. |
| **Pursuit** | Gesaffelstein, 109 BPM dark techno | Rhythm survival (the creative one) | The room is the weapon. Center shockwaves on the kick, sweeping laser bars in `build`/`drop`, and in `dropvar` a **lane grid** that rules the arena into strips and leaves exactly one safe corridor per bar. You survive by being in the right place when the beat lands. |

Each boss defines an **arrangement**: an ordered list of `{section, bars}` the
song plays through (e.g. Metamorphosis: intro 8 → drop 16 → peak 16 → break 8 →
drop 16 → finale 16). Fights run ~1:50–2:00.

## Architecture

Boss music reuses the **Track Lab's `LabEngine`** (the ear-approved track player:
string-keyed voices, sections switched on the bar, sidechain pump), not the
game's weapon engine — the player has no weapons here, so a re-score would be the
wrong shape. New code lives in `src/boss/`:

- `conductor.ts` — wraps a `LabEngine`, walks the arrangement (auto-switches
  sections on the bar), and hands the boss AI a `BeatInfo` per step. **Timing
  discipline matches the game's `MusicEngine`:** the audio clock *schedules* beat
  events, but gameplay *drains* them in the render loop at audio time, so a
  backgrounded/stalled tab can't dump a burst of catch-up attacks (it fast-
  forwards silently instead). Also exposes `progress01()` for the song/health bar.
- `world.ts` — the arena sim: player (move + dodge dash with i-frames + arena
  clamp), the boss body, and hazards that damage the **player** — bullets,
  expanding shockwaves, sweeping/lane laser beams, telegraphed zones, melee arcs.
  A hard bullet cap guards against runaway spawns.
- `bosses.ts` — the three `BossDef`s: track + arrangement + palette + the per-
  section, per-beat attack grammar (`onStep`) that gives each its feel.
- `view.ts` — a fixed-camera Pixi renderer that letterboxes the locked arena into
  the viewport, with clear telegraph-vs-live styling on every hazard.
- `page.ts` — `mountBossFight`: boss select, fight loop, HUD (player hp + draining
  boss song bar + phase), win/lose screens, dash on Space/Shift + a touch button,
  invincible/mute debug toggles.

One tiny, backward-compatible addition to the Track Lab: `LabEngine.addStepListener`
(the lab registers none, so its behavior is unchanged).

`LabEngine`, the five track covers, and `labkits` are reused untouched. The M2
game, the rehearsal room, the track lab, and the autoplay bot are all unchanged
(the boss page is additive: one route + one start-screen button).

## Self-verified (July 6, 2026, Chrome)

`tsc` clean; production build clean; no console errors. All three boss cards
render and load their tracks (audio context runs, sections advance through the
arrangement). Deterministic sim checks all pass: bullets move at spec speed and
despawn (no leak, counts bounded even under a throttled render loop); damage +
i-frames land one hit per window; the brawler's slam/arc/lunge, the bullet-hell's
32-bullet drop, and Pursuit's 6-of-7 lane grid + 3-ray drop all fire; player
WASD movement, dash (distance + cooldown + i-frames), and arena clamp all correct;
**both end screens work** — "You survived." on song end and "Down." on death, each
with retry/choose-boss/back-to-game.

**Not machine-judgeable:** whether the three fights actually *feel* distinct and
fair at 60 fps with sound, and whether the attack timing reads as musical. That's
the developer's gate. Every difficulty number (hp, i-frames, dash, damage,
telegraph windows, pattern density) is a small edit in `world.ts` / `bosses.ts`.

## Parked / next

- **Main-run integration ("a boss every 3 minutes").** The pivot's framing is that
  bosses interrupt a normal run on a timer. That was deliberately **not** wired
  into the live M2 run in this pass: it would entangle the gated M2 loop and the
  determinism of the autoplay bot (which replays real `RunWorld` runs). The boss
  page is the safe, complete play surface for judging the bosses first. Wiring the
  3-minute interrupt into the run — pause weapons, lock the arena, hand off to the
  boss layer, resume on win — is the next step once the fights pass the ear/hands.
- Boss attack tuning and per-boss signature polish (screen shake, better death
  flourish, telegraph legibility) after the first hands-on gate.
- A "practice / difficulty" affordance beyond the invincible debug toggle.
