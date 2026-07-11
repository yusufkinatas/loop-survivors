# VS fidelity pass: enemies, whip, weapons, spawns, kill effect (July 11, 2026)

Developer directive (verbatim intent): make the movement and enemy feeling match
Vampire Survivors, especially its first level (Mad Forest) — the experience, the
enemy types, how fast enemies move, how much contact damage they deal, and the
per-minute events — and implement it the same. Keep our own weapons but adjust
their damage areas and numbers to VS; especially make the **kick feel like the
starting Whip**, with close damage numbers so the challenge feels the same. Shrink
the over-generous AoE toward VS. Add enemies and a satisfying VS-style vanish
effect (enemies "break into pixels"). Keep the current rendering style (no pixel
art, no new assets) but make elites and enemy types visually distinct. Research
VS deeply for correct numbers.

Two forks were put to the developer and answered:
1. **Kick = a directional Whip** (not a retuned aura).
2. **Compress Mad Forest's escalation into a complete 8-minute arc** (not mirror
   the literal first 8 minutes, which stays gentle throughout).

Numbers were sourced from a deep, adversarially-verified research pass on the VS
wiki, written up in `docs/phases/vs-fidelity-research.md` (the sole numbers
reference). The code was tuned against headless-bot batches; the developer's
ear/hands/eye remain the real gate.

## Decisions

1. **Contact-damage model = VS.** VS applies contact damage repeatedly while you
   overlap an enemy, gated by a **240ms global i-frame**. Our model already
   matched that shape; the i-frame was 0.5s and is now `RUN.iframesS = 0.24`.
   `contactDamage` now takes the **highest-power** overlapping enemy (a pin
   against a mantis hurts like a mantis, not a bat). A single Power-10 enemy is
   ~42 dmg/s → ~2.4s to die pinned. That "don't get surrounded" budget is the
   whole tension.

2. **Enemies = a VS Mad Forest roster of straight chasers.** VS's first stage
   differentiates enemies by SPEED / HP / SIZE / contact-damage, not by fancy AI.
   The old dash/charge/orbit/split/shield behaviours were removed; every enemy is
   now a straight chaser except swarm-sweep events. Eight kinds (renamed for
   readability): **bat** (quick weak fodder), **zombie** / **skeleton** (kiteable
   fodder), **ghost** (the one enemy that outruns you, low HP, knockback-immune),
   **mudman** (mid HP wall), **werewolf** (fast-ish, hits hard, tanky), **mantis**
   (slow heavy wall, knockback-immune), **elite** (slow huge objective, fat gem).
   Stats are VS-derived (bat 4 HP / zombie 10 / skeleton 16 / ghost 12 / mudman
   70 / werewolf 180 / mantis 400 / elite 800; contact 6/10/10/6/10/14/20/24).

3. **No per-minute stat scaling (VS-authentic).** Mad Forest does NOT scale base
   HP/damage/speed by minute — difficulty is tankier TYPES + rising density +
   events. So `enemyScaling` is a **mild HP creep only** (`hpScaleEnd 1.6`), flat
   damage / speed / XP. The arc lives entirely in `SPAWN_DIRECTOR`.

4. **Spawn arc = Mad Forest compressed into 8 minutes.** A gentle bat on-ramp,
   one tougher type introduced roughly per minute (bat → zombie → skeleton →
   ghost → mudman → werewolf → mantis), the three VS event types reproduced —
   **SWEEP** (a wall of speed-1460 bats/ghosts flying a locked line across the
   screen), **RING** (a closing wall — the flower-wall), and the recurring
   **ELITE** objective — climbing through event clusters with short breathers to
   a no-breather horde finale from 7:00. On-screen counts sit in VS's band
   (~15-30 early, ~300-500 finale; `maxAlive 420`, hard cap 640).

5. **The kick is the Whip.** A rectangular slash in the player's facing direction
   (facing = last move direction, deterministic from the control seam). Per-hit
   damage matches the VS whip (~11/15/24/34 shown after the 0.9 powerMul); it
   fires four-on-the-floor, so it out-rates a real whip and clears its lanes fast.
   Tiers grow reach/thickness/damage; a single crack hits each enemy once
   (overlapping lanes are deduped). **It one-shots minute-1 fodder but cannot
   clear the mid-game walls single-target — that crossover forces build growth,
   the VS whip's whole character.**

6. **All weapon damage/areas pulled toward VS.** Every weapon's per-hit damage was
   dropped toward VS references (Magic Wand 10 @1.2s, Knife 6.5, Axe 20 @4s, etc.,
   scaled by our trigger rate) and every AoE radius shrunk hard — the old auras,
   waves, shockwaves and zones covered far more of the arena than any VS weapon
   (crash 400→280, bass wave 64→54, chord zone 140→105, acid 145→116, kick's
   360° r=185 aura replaced by a narrow whip lane, etc.). Archetypes are
   unchanged. Knockback-immune kinds (ghost/mantis/elite) ignore shove, shockwave
   knockback, AND the acid pull.

7. **VS-style pixel vanish.** On death an enemy scatters into a burst of small
   coloured squares (its own colour, a third brightened) that fly out, decelerate
   and fade, fronted by a quick bright core flash. One batched draw call, hard
   fragment cap (1100), bigger enemies burst bigger/longer. View-only — the
   headless bot never renders it, so determinism/replays are untouched.

8. **Visual distinctness (kept the current render style, no assets).** Each kind
   has ONE stable, distinct colour + silhouette (bat sliver, zombie disc,
   skeleton diamond, ghost hollow ring, mudman hexagon, werewolf chevron, mantis
   square, elite large octagon in a halo ring with a dark core). The old
   time-based "danger band" colour ramp was dropped so a type reads by colour +
   shape, not by run-time; the band now only nudges size and stamps a dark core
   at the top band. Elites are unmistakable (big magenta octagon + halo + core).

## Deviations from the literal briefs (flagged for the developer)

- **Enemy speeds are tuned below the exact VS ratios.** VS bats are 1.27x and
  ghosts 1.82x the player. At those speeds anything faster than the player
  *glues* onto a fleeing player whose (facing-based) whip points away, killing in
  ~4s regardless of skill — an unfun, unavoidable death with our movement. So
  fodder is kiteable (~0.85-0.96x), the low-HP GHOST is the sole enemy that
  outruns you (1.30x, and it dies fast to a grown build), and werewolf sits at
  ~player speed. VS px-speeds are unpublished anyway (the research had to pick
  them), so this trades a little literal ratio-fidelity for fairness. Easy to
  push back up if the developer wants more "bats catch you" bite.
- **The whip cracks front + back from tier 1** (the AskUserQuestion preview
  showed tier-1 = one lane). One forward lane was a death-trap: a kiting player
  fires it into empty space while the horde chases from behind. Front+back from
  tier 1 (→ all four directions at tier 4) keeps the whip identity while making
  the mandatory starter fair.
- **Contact i-frame** is the official 240ms (a third-party guide claimed ~100ms;
  rejected).

## Verification

- `tsc --noEmit` clean; `vite build` clean.
- Headless bot: AFK dies ~0:20-0:26 (canary trips — being still is never safe);
  kiter spread ~3:30-5:20 across random/deep/wide/focus:kick with builds growing
  to lv 10-16 and occasional wins; the finale overwhelms most runs; every weapon
  carries real damage share in diversified builds. Per-weapon solo floors are
  healthy except hat/riser as forced solo starts — a **bot artifact**: the real
  game always opens on the kick (`hud.ts`), riser is barred from the start offer,
  and no player ever starts hat.
- Chrome (live, `npm run dev`): boots to the start screen; a run renders the whip
  (front+back at low tiers, a four-way cross at tier 4), VS-scale floating damage
  numbers (~33-39 at tier 4), the pixel-dissolve on kills, XP gems, the crash
  shockwave, and clearly distinct enemy silhouettes (elite unmistakable). Zero
  console errors on load or under heavy weapon fire.
- Adversarial code review (4 dimensions, each finding independently verified):
  4 findings, all fixed — whip double-counting walls (deduped per crack), a
  mis-ordered spawn beat (reordered), stale comments (corrected), and acid pull
  ignoring knockback-immunity (guarded).

## Open flags for the ear/hands/eye gate

- Enemy speeds are the main "make it bite more like VS" knob (see deviations).
- acid still reads as a strong control weapon (pre-existing); the whip is a
  reliable mandatory carry (focus:kick ~5:19, kick ~33% share) — intended, but
  the developer decides if it wants trimming.
- Not committed (per the harness rule of committing only when asked).

## Follow-up: the swarm-feel pass (July 11, 2026)

The developer played this pass and it **did not feel like Vampire Survivors** —
the horde never packed into a wall. A review diagnosed and fixed the cause; full
report and dials in `docs/phases/vs-swarm-review.md`. The root cause was **packing,
not quantity**: on-screen counts were already in VS's band, but a moving player
strung the horde into a thin trailing tail (only ~4 enemies ever in the close
bubble). Changes layered on top of this spec (same files):

- **Density FLOOR (new).** Each `SPAWN_DIRECTOR` phase carries a `floor`
  (VS wave-minimum); the director refills toward it at `FLOOR_REFILL_RATE`/s so
  you are always surrounded no matter how fast you clear. Rate-only spawning let a
  strong build empty the screen; the floor is the core "always swarmed" guarantee.
- **VS-faithful fodder speed.** zombie/skeleton/mudman 195 → **209 (0.91×)**, bat
  220 → **210**, so a circling player no longer outruns the pack. (Deviation #1 in
  this spec — fodder deliberately slower-than-VS to keep a *fleeing* bot alive — is
  partly reversed: the fleeing `kiter` was the wrong proxy. A circle-strafe
  `orbiter` mover was added as the honest one.)
- **Denser, slower sweep.** `SWEEP` is now a compact multi-rank block (bandFrac
  0.36, spacingMul 2.4) at 860 px/s, not a 1460 px/s screen-wide sparse line — the
  "chunky group of bats" the developer asked for.
- **Packing knobs.** separation weight 1.5 → **0.7** (enemies stack into a wall,
  VS overlaps heavily); off-screen recycle 1.7 → **2.6** (the trailing horde
  persists so circling re-enters it); caps 420/640 → **480/700**.
- Slightly chunkier fodder radii (bat 7→8, zombie/skel 9→10).

Awaiting the developer's re-test. The **floor values** are the primary "more/less
swarmed" dial.
