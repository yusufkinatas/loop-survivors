# Boss Fights — standalone playtest area

Added July 6, 2026. **This is a separate experiment, not wired into the run.**
It lives beside the current direction (genres as characters + the twelve-weapon
soundset, `docs/phases/genres-and-weapons.md`); nothing here changes the game
loop. It exists so the developer can playtest the "boss makes the music" idea on
its own before deciding whether it earns a place in the game.

## The idea

A boss fight is a duel against a whole track. You are locked into a fixed arena,
you have **no weapons**, and the boss plays a composed track whose **structure is
the fight**: sections are the boss's phases, beats are its attacks. You only move
and dodge (with a short dodge dash), and you **win by surviving until the song
ends** — the boss can't be damaged, its "health" bar is the song draining away.
(The coupling is Model A, inverted: the boss's instruments fire attacks the way
the player's weapons fire in a normal run.)

## Where to play it

Start screen → **boss fights** (or the `#boss` route). Pick a boss, move with
WASD/arrows or the joystick, dash with Space/Shift. `invincible` / `mute` toggles
are top-right for inspection.

## Three bosses, three feels

Each is a real Experimentation-room cover, walking an arrangement of its sections:

| Boss | Track | Feel |
|---|---|---|
| **METAMORPHOSIS** | INTERWORLD · 175 phonk | Close-range brawler — hunts you, ground-slam shockwave on the kick, lunge + melee arc on the snare. |
| **Satisfaction** | Benny Benassi · 130 electro | Bullet hell — anchored core painting beat-locked radial rings and counter-rotating spirals; you read the gaps. |
| **Pursuit** | Gesaffelstein · 109 dark techno | Arena-hazard rhythm survival — center shockwaves, sweeping laser bars, and a lane grid that leaves one safe corridor per bar. |

## Architecture (self-contained, additive)

All of it lives in `src/boss/` and touches the rest of the game in only three
tiny, additive spots: a `#boss` route in `src/main.ts`, a "boss fights" button on
the start screen (`src/game/hud.ts`), and appended CSS. The weapon system, the
genres and the main run are untouched.

- `conductor.ts` — wraps the Experimentation room's `LabEngine` (the ear-tested
  track player) and walks a per-boss **arrangement** (`{section, bars}` list,
  auto-switching on the bar). Beat events are queued at schedule time and
  **drained in the render loop at audio time**, so a backgrounded/stalled tab
  can't dump a burst of catch-up attacks. Exposes `progress01()` for the song
  bar. Uses only one added lab hook, `LabEngine.addStepListener` (the lab itself
  registers none, so its behavior is unchanged).
- `world.ts` — the arena sim: player move + dodge dash + i-frames + arena clamp;
  the boss body; player-damaging hazards (bullets, expanding shockwaves,
  sweeping/lane lasers, telegraphed zones, melee arcs); a hard bullet cap.
- `bosses.ts` — the three `BossDef`s and their per-section, per-beat attack
  grammar (what gives each boss its feel).
- `view.ts` — a fixed-camera Pixi renderer that letterboxes the locked arena and
  styles telegraph vs. live clearly.
- `page.ts` — `mountBossFight`: boss select, fight loop, HUD (player hp +
  draining song bar + phase), win/lose screens.

Boss music deliberately reuses the `LabEngine`, not the weapon engine: the player
has no weapons in a fight, so a build re-score would be the wrong shape.

## Dodge dash tuning (July 6)

Pursuit read as unfair against its beat-frequent attacks — not the patterns, the
dodge couldn't keep pace. The fix is the dash, not the attacks: cooldown 0.8s →
**0.42s** (a dash roughly every beat at 109 bpm) and a real invulnerability
window — a dedicated `dashIframesS` (0.3s) granted up front on the dash so it
outlasts the 0.15s movement, making a dash *through* an attack reliably clear it
(before, the dash only kept i-frames alive at ~0.05s, barely covering the move).
Both numbers live in `BOSS_PLAYER` in `src/boss/world.ts`.

## Record variant: an mp3 boss (July 6)

A fourth boss, **Pursuit (record)** (`pursuit-mp3`), runs the *identical* fight to
synth Pursuit — same arrangement, same attack grammar — but plays a real audio
file of the record instead of synthesizing the cover live. It's a straight A/B on
the sound; the mechanics are byte-for-byte the same `BossDef`, spread from
`PURSUIT_BOSS` with only the sound source swapped.

- `mp3engine.ts` — `Mp3Engine`, an alternate track transport that decodes and
  plays a file and emits the **same beat grid** the conductor drives attacks off.
  Both it and `LabEngine` satisfy the new `BossTransport` interface (in
  `conductor.ts`), so a boss runs on either with no other change.
- **Sync model.** One number, `offsetS`, is the file position that plays at
  fight-step 0; the grid is anchored so fight-time *t* always sounds file content
  *(offsetS + t)*, keeping beat-locked attacks on the same musical instant. A live
  **sync strip** (top-right, mp3 bosses only) nudges `offsetS` — coarse (¼s) skips
  any silent intro so the two variants line up bar-for-bar, fine (20ms) locks the
  downbeats under the attacks. Dial it in by ear, then bake the shown number into
  the boss's `offsetS`. `loop.boss.sync(x)` sets it precisely from the console.
- **The file isn't committed** (copyrighted recording — supply your own). Drop it
  at `public/boss/pursuit.mp3` (see `public/boss/README.md`); a missing/undecodable
  file shows a "drop the track there" screen instead of crashing.
- The fight stays the same 56-bar length as synth Pursuit (comparable A/B). If the
  record is shorter than that, its tail plays out in silence and the fight still
  resolves as a win.

## Status

`tsc` + production build clean. The three synth bosses were verified in Chrome
earlier (arrangements advance; movement/dash/clamp, damage + i-frames, every
attack kind, bounded spawns, both end screens). The dash tuning and the mp3
transport were verified headlessly: types + build clean, the sync-timing math
checked numerically (step grid, the re-seek invariant, 56-bar → 123.3s finish at
109 bpm, downbeats on the bar), the served-file path confirmed, and an adversarial
code review found and **fixed three real bugs** (an offset-nudge that could stall
the fight with no win; a same-boss double-click that leaked a second engine/track;
a queued dash carrying into the next fight). Live in-Chrome playtest of the record
boss is pending the developer supplying `pursuit.mp3` (the Chrome extension wasn't
connected this session). What only the developer can judge is whether the fights
feel distinct, fair, and musical at 60 fps with sound — and, for the A/B, whether
the record and the engine's cover sit right against each other. Every difficulty
number is a one-line edit in `src/boss/world.ts` / `src/boss/bosses.ts`.

**Not decided:** whether boss fights join the game at all, and if so how (e.g. an
interrupt in a run) — and how they'd relate to the genre soundset (a boss could
one day be voiced in the run's chosen genre). This area is here to inform that
call, nothing more.
