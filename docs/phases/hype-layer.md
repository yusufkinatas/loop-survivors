# The Hype Layer (self-directed prototype)

One of three parallel, independent prototypes exploring the same problem: a run
only ever ADDS instruments, so the track's energy is a monotonic ramp — it never
breathes. This is the self-directed one; it deliberately avoids the other two
directions (pulling instruments back for a charged payoff; building and swapping
track sections).

## The idea

A live, rhythm-driven energy fader the player rides to shape the run's dynamic
arc — like a DJ riding a filter and dropping layers in and out, but expressed as
a gamified survivors-like meter, not beat-making.

- A **CROWD** meter that constantly drains toward a low resting groove.
- **Tap SPACE in time with the beat** to pump it up. Dead-on taps pump hard and
  build a streak (`x2`, `x3`, …); sloppy taps barely register and break it.
- As the meter climbs, the band **assembles from the top down** — snap, ticks,
  color, then the hook and FX layer in — and a **master filter opens**, so the
  whole mix brightens. Let it fall and the track strips back to just the beat
  and the low end: an instant breakdown. This is the non-monotonic shape: the
  player builds and drops the arrangement live, without changing the build.
- Riding it high is a **risk/reward dial**: +damage dealt and +XP, but you take
  more damage. Chilling low is safe but quiet and weak. So a player naturally
  pushes into the red when safe and greedy, breathes down when overwhelmed — an
  energy curve over the 8 minutes that reads as a real track.

## Why the gate is honest (Model A)

A gated voice fires **no trigger**, so it makes no sound AND deals no damage in
the same instant (one event, two outputs). Muting the hook silences it in the
mix and drops its damage together — the player literally hears and feels their
firepower breathe with the music. A floor guarantee always keeps the lowest-rank
owned voice sounding, so a lone opener never falls silent.

## Controls

- **SPACE** — pump the crowd, scored against the beat. Key-repeat is ignored
  (holding it can't cheese the meter). Everything else is unchanged (WASD/arrows
  to move).

## Scope / determinism

Kept to one polished mechanic. The world reads three neutral-by-default
multipliers (`hypeDamageMul`, `hypeDamageTakenMul`, `hypeXpMul`), all 1 in
headless runs — the autoplay bot and seeded replays never pump the crowd, so
they are bit-identical to before. Engine additions: a master lowpass tone
filter, per-voice source gating, and quarter-note beat timing for scoring taps.

## What I'd tune next

- Drain rate and per-tap gains per genre (a 174 BPM DnB beat asks for a
  different tap cadence than 84 BPM Lo-Fi).
- The risk side (`+damage taken`) against late-game contact scaling — peak
  should feel spicy, not suicidal.
- Whether the layer-open order should follow the genre's own arrangement rather
  than one fixed rank table.
