# Variants and velocity are sound-only

Charts carry two expressive values per event — a variant (which sample) and a
velocity (how loud) — and both used to leak into the world: pad chords stamped
bigger, longer-lived, weaker zones; fat bass buffed Subquake; and most weapons
scaled damage by ±20% with loudness. We decided (2026-07-20, issue #137) that
chart expression may only affect the sound: every weapon has exactly one way
of dealing damage and one visual footprint, and the stat is the single truth
for damage. The alternative — keeping velocity→damage as an "invisible
wobble" — was rejected because damage that varies per trigger has no single
source of truth, is invisible to the player, and blocks exact headless
balance math (DPS = chart trigger count × stat).

## Consequences

- The trigger the game consumes is just "this role fired at this time";
  velocity and variant never cross from audio into gameplay. Do not wire
  chart expression back into damage, area, lifetime, or visuals — re-adding
  it means re-litigating this ADR, not just editing a formula.
- Charts and stats are retuned against flat damage after the severing; the
  old multipliers have no meaning as a rollback target.
