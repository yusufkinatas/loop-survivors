# Build size is two flat caps, not typed band slots

A build used to be shaped by seven typed band-position slots — Beat, Snap,
Tick, Groove, Low, Color, Hook — each holding at most one instrument drawn from
that slot's roster. The slot did two jobs at once: it capped how many weapons a
build could hold (seven), and it made instruments mutually exclusive within a
position (hiring Snare permanently retired Clap; Lead retired Bell).

We decided (2026-07-21) to split those two jobs apart and keep only the first.
A build now holds at most `BUILD.weaponCap` weapons and `BUILD.itemCap` passive
items — five and five — and nothing else constrains it. There are no
categories: any weapon may be offered alongside any other, and hiring one never
removes another from the pool. Weapon slots are numbered by acquisition order,
which is why `RunWorld.tiers` is an append-only `Map` and why reordering it
would renumber the rack and the number-key toggles underneath the player.

The rejected alternative was to keep exclusivity and merely re-group the
rosters into fewer, broader categories. It was rejected because with a
five-weapon cap against a nine-weapon catalog, the cap already does the work
the slots were doing — the build is small either way — while exclusivity keeps
cutting reachable builds for a guarantee the player never asked for.

## Consequences

- Two similar voices can now play together (Snare + Clap, Lead + Bell). The
  slots existed partly to guarantee one voice per frequency lane, so this ADR
  trades a structural guarantee of separation for build freedom. Cacophony is
  now prevented by the cap alone — a five-voice build is small — and by the
  player's own choices. If a specific pairing turns out to sound bad, fix it in
  the mix (kit gain, choke groups), not by reintroducing categories.
- `src/game/band.ts` is deleted. The early drum nudge that lived there — Kick,
  Snare and Clap draw heavier for the first two minutes — moved into
  `picks.ts`. It is an offer-weight knob, not a grouping: the roles it lists
  have no relationship beyond drawing heavier early.
- Evolutions get scarcer. Every recipe needs a specific passive at level 5, and
  the item cap dropped six to five, so fewer recipes line up by chance. This
  was accepted, not overlooked; retune the recipes if evolutions feel too rare.
- The rack renders `max(weaponCap, owned)` sockets. A run can never exceed the
  cap, but the sandbox loads the whole catalog on purpose, and a rack that
  truncated would hide weapons that are audibly playing.
