# Prototype: Hold & Drop (the pull-back mechanic)

Status: exploratory prototype, not a locked spec. One of three parallel,
independent prototypes exploring the same problem. Judge by ear and hands.

## The problem

Across a run the player only ever ADDS instruments, so the track's complexity
is a monotonic ramp — it never breathes. Real tracks have variance: buildups,
drops, breakdowns, sections that pull back and come roaring back in. Tuning
gain or tier counts only changes how fast the player climbs the same ramp.

## The idea

Let the player PULL an instrument back and get a gameplay reward for holding it,
then bring it back in for a satisfying payoff. In a normal survivors-like,
muting a weapon is a straight nerf; here holding is an investment.

**The buildup you hold is a bomb you release.**

- **Pull back** (number keys 1–8, one per band-rack position): the instrument
  goes silent immediately and stops firing. The track thins out — an audible,
  instant breakdown. The socket desaturates and starts banking **charge**.
- While held, charge fills over ~7 seconds (a buildup). A per-socket ring fills;
  the global **TENSION** meter rises with the total charge held back.
- **Bring it back in** (same number key): on the next beat the instrument's
  sound returns on the grid (the "here it comes back in" moment), and it fires
  at hugely amplified damage for a short window (up to 4× at full charge). At
  the same instant it detonates an **area slam** — an expanding shock that
  knocks the horde back and clears space, sized by the banked charge.
- **Q — drop everything at once**: releases all held instruments in one
  synchronized full-band drop. A combo multiplier makes the whole-band drop beat
  the sum of its parts (bigger slams, bigger amplified windows).

So the loop is: pull instruments back → survive a tenser, sparser section while
charge and tension build → time the re-entry (or slam Q when surrounded) →
the track kicks back in hard while the slam clears the screen. Buildup → drop.

Why it is not a nerf: holding trades current firepower for a stored, amplified
burst that also works as a panic-clear bomb. The reward is the drop.

## Controls

- **1–8** — pull back / bring in the instrument in that band-rack socket
  (the socket shows its key number). Toggling is immediate and tactile.
- **Q** — drop all held instruments at once (synchronized full-band drop).

## Pillar 3 (muted still a good survivors-like)

All of the mechanic (charge, tension, payoff window, slam) lives in the pure
simulation, so it plays as a real tactical tool — a chargeable panic-clear —
with the sound off. The audio breathing is the multiplier on top.

Determinism: the mechanic is player-driven; the world's hold/payoff state stays
empty on the autoplay-bot / replay path, so those runs are bit-identical to
before (no equalization needed, seeded replays unaffected).

## Tuning knobs (config.ts `HOLD`)

`chargeFullS` (7s to full charge), `payoffS` (4s amplified window),
`maxFireMul` (4× fire damage at full charge), `slamRadius` / `slamDamage` /
`slamKnockback` (the clear), `comboBonus` (0.5 per extra instrument on Q),
`tensionFull` (summed charge that reads as full tension).

## What I'd tune next

- Slam damage scaling vs. the late-game 16× enemy-HP curve (currently a
  breathing-room tool more than a nuke; may want it to scale with the held
  instrument's own DPS so it stays proportional across the run).
- Whether a small live benefit while under tension (a nudge to move speed or
  pickup range) makes holding feel better moment-to-moment, or muddies it.
- Beat vs. bar for the re-entry (currently next beat, ≤ ~0.5s, for responsive
  hands); a bar-locked drop lands more ceremonially but feels laggier in a panic.
