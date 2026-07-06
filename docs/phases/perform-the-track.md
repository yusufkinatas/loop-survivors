# Prototype: Perform the Track (swappable sections + the drop)

Status: exploratory prototype, not a locked spec. One of three parallel
independent prototypes exploring how to give a run *variance* — the shape of a
real track (buildups, drops, breakdowns) instead of the current monotonic
add-only ramp. Judge by ear and hands.

## The problem it answers

Across a run the build only ever ADDS instruments, so the mix only thickens.
Real tracks are not monotonic: they strip back, tense up, and slam. The player
needs a live verb that reshapes the arrangement into something performed, and
each reshape must carry a real gameplay stake (Pillar 3: still a good
survivors-like muted).

## The mechanic

A live **performance section** sits on top of the build. The player swaps it
with a keypress. A section decides which band positions are AUDIBLE right now —
and because a muted slot's weapon does not fire (Model A: one trigger = sound +
damage), pulling instruments out of the mix is exactly pulling their damage out
of the world. The section is the arrangement and the fire-control at once.

Three sections, plus the drop:

| Key | Section | What plays | Offense | Defense | Energy |
|---|---|---|---|---|---|
| **1** | FULL | the whole band | 1.0x | normal | 1.0x |
| **2** | BREAKDOWN | low end + pad only (Beat / Low / Color) | ~0.55x + muted slots silent | takes half contact damage, +20% move | 1.8x |
| **3** | BUILD-UP | kick + FX only | ~0.2x, exposed | slightly worse | 3.0x |
| **SPACE** | THE DROP | (armed at full energy) | screen-clearing slam, then +100% damage for 6s | brief i-frames on the slam | spends all |

**ENERGY** (the bottom meter) banks from time-in-section (so BUILD-UP and
BREAKDOWN can charge despite being toothless) plus a combat kicker from damage
dealt (so FULL rewards fighting). Full arms the drop.

The loop that emerges: fight in **FULL**; when a swarm closes, drop to
**BREAKDOWN** to tank hits and skate away while the meter climbs; or gamble into
**BUILD-UP** to buy the drop fast by going briefly defenceless; then **SPACE** —
the band slams back, a gold shockwave clears the screen, and you get a short
damage-doubled hype window. That is the intro → breakdown → build-up → drop
arc, performed with the hands.

## Why it stays honest

- **No player-facing music jargon.** Section names are FULL / BREAKDOWN /
  BUILD-UP / DROP — plain track-structure words, one plain gameplay line each.
- **Determinism preserved.** FULL is the baseline (all multipliers 1, full band,
  no drop). The autoplay bot and every existing seeded replay never leave it, so
  they are bit-identical to before. All section state lives in the world but is
  inert until a key is pressed.
- **Every swap is a real trade** (offense vs defense vs economy), never just an
  audio change.

## Where it lives

- `src/game/sections.ts` — the section catalog + drop/energy tuning.
- `src/game/run.ts` — section stat multipliers (damage/contact/move), energy
  banking, `triggerDrop()`, `setSection()`.
- `src/game/game.ts` — keyboard (1/2/3, SPACE), `applyPerformance()` (voice
  muting + arena tint + HUD each frame).
- `src/game/hud.ts` + `src/style.css` — the bottom-center performance panel.

## To try it

`npm run dev`, pick a genre + weapon (or open the sandbox and force-assemble a
band). Press **1/2/3** to swap section, watch the arena tint and the band rack
respond, and hit **SPACE** when the meter fills. The sandbox is the fastest path
(force a full band, spawn a ring of swarmers, drop into them).

## What I'd tune next

- **Energy rate** (`ENERGY_BASE_RATE`, `ENERGY_PER_DAMAGE`): a drop lands roughly
  every 20-30s now; the developer's ear decides if that is too spammy or too
  rare.
- **Breakdown/build-up dmg multipliers**: currently guarantee a trade even for
  builds that own no muted-slot weapons; may be redundant once a band is wide.
- **Beat-locking the drop** to the next downbeat for a tighter "on the one"
  slam (currently instant for responsiveness).
- Per-genre section flavor (a Lo-Fi breakdown vs a DnB breakdown should feel
  different); today the audible-slot sets are shared.
- A fourth "intro" state, or making BUILD-UP auto-resolve into the drop.
