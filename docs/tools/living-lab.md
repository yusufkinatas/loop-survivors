# Living Lab

The Living Lab is a public, in-game documentation suite. It mounts
one real `RunWorld`, `RunView`, input stack, and audio engine, then reuses that
shared arena across four rooms. The labels and rosters are generated from the
same registries and live objects as the game, so they update with the game or
fail the browser check when they drift.

This tool is additive. It does not advance or replace a phase's developer gate.

## Open it

The normal main menu always shows **living lab** directly below **start**.

For local development, start the server with:

```sh
npm run dev
```

Direct boots work in development and production:

- `/#lab` — hub
- `/?lab=movement` — Movement & Space Gym
- `/?lab=enemies` — Enemy Zoo
- `/?lab=instruments` — Instrument Zoo
- `/?lab=systems` — Systems Museum
- `/?lab=auto` — fail-fast automated tour

`VITE_LOOP_LAB_ROOM=<room>` can set a local default boot. `?lab=off` overrides
that default. The suite is intentionally public for now; there is no hidden or
build-time access gate.

Escape returns from a room to the hub, then exits to the normal game. The exit
restores the engine, movement globals, and event listeners before reloading the
ordinary start screen.

## Rooms

- **Movement & Space Gym** measures real cardinal and diagonal movement, shows
  the live camera size, and draws the real spawn clearance around it.
- **Enemy Zoo** derives its roster from the current stage's wave and event data.
  It shows live HP, damage, speed, size, XP, and behavior flags, and can spawn,
  group, kill, or clear real enemies.
- **Instrument Zoo** derives its roster from `supportedRoles()`. A manual pulse
  travels through `MusicEngine.preview()` and the normal due-trigger listener
  into `RunWorld.fireTrigger()`, so the same event makes the sound and performs
  the weapon action. Tier and sound-variation controls use the real charts and
  weapon configuration.
- **Systems Museum** demonstrates three cross-system rules with live objects:
  one sound event produces one weapon action, contact damage is attacker power
  minus player armor, and each band position has one permanent instrument
  owner.

## Drift check

Run the suite's browser drive and the normal-boot regression:

```sh
npm run check:lab
```

The command uses a locally installed Chrome; set `CHROME_BIN` when it is not at
the platform's usual path.

The check builds the production app, starts a temporary preview server, walks
every registered room and every tagged manual control in headless Chrome,
rejects console/runtime errors, checks the generated enemy and instrument roster
counts, exercises the three museum rules, and verifies shared-state restoration.
It then takes the real exit path, requires a clean normal start screen, and
reopens the hub through the visible **living lab** button.

The stable automation hooks are `data-lab-ready`, `data-lab-room`,
`data-lab-action`, `data-enemy-kind`, `data-role`, and
`data-lab-autodrive-state`. A newly registered room is automatically part of
the tour.

## Architecture guardrails

- Keep one top-level `#lab` mount and internal room navigation. Do not add one
  Pixi application, input stack, or audio listener per room.
- Add content to the canonical game registry first. Do not maintain a second
  handwritten roster inside the lab.
- Use small adapters over real construction paths when exact positioning is
  needed. Do not reconstruct simplified enemies or weapons for display.
- Reset every transient world collection between rooms and dispose every
  listener on exit.
- Any browser-check pass is an engineering result only. Sounds and gameplay
  feel still belong to the developer's ear and hands gate.
