# The Mixer: Arsenal, Complexity, Power (branch `mixer-system`)

**Status: experimental side branch, built July 10, 2026 at the developer's direction.
NOT a grilled/locked phase spec — this replaces the tier-card level-up system as an
alternative version, awaiting the developer's ear/hands verdict. If adopted, it should
go through a grilling pass and be locked properly.**

Plain-word glossary: a **bar** is one short cycle of the beat (~2s at 122 BPM). A
**phrase** is 4 bars (~8s), the natural "sentence" of the music — all charts are
written in 4-bar phrases. "**Hot**" below means a busy, flashy pattern; "**stale**"
means that pattern has run unchanged long enough that the track feels flat.

## The three resources

- **Arsenal** — which instruments you own, one per band slot (Beat/Snap/Tick/Groove/
  FX/Low/Color/Hook). Hiring is permanent, as before.
- **Complexity (C)**, per instrument, 0–4 — which pattern it plays. Maps 1:1 onto the
  existing four-tier chart ladders: more complexity = more notes per phrase = more
  damage events. **C0 = muted** (plays nothing, fires nothing).
- **Power (P)**, per instrument, 1–4 — how strong each note is. Maps 1:1 onto the
  existing `WEAPONS[role][p-1]` stat blocks. Audio: a per-voice tone filter + level
  opens with power (P1 thin/dark/quiet → P4 the full sound plus a small push).

The old tier T is exactly (C=T, P=T). All authored charts and stat blocks are reused.

## Level-up economy

- Every level-up is worth exactly **2 points**: +1 C and +1 P into unspent pools
  (a toast, no card screen, no pause).
- **Hire levels 2, 3, 5, 7, 9, 11, 13** (`mixer.ts HIRE_LEVELS`): the familiar
  3-card screen instead, one candidate per unopened band slot, early-drum-nudge
  weighting kept. The hire joins at C1/P1 — the granted pair seeded into it, still
  redistributable later. A hire level with all slots open falls back to points.
- **Start:** kick only, C1/P1 (level 1's pair seeded).
- Budget over ~13 level-ups: 14 C + 14 P = 28 points = the old 14 tier-picks, so
  enemy scaling and the spawn director stand unchanged.
- **Items and weapon effects left the level-up flow entirely on this branch** (their
  code remains; the sandbox still dials items). Where they return (elite drops, boss
  rewards, a mixer row) is an open question for the developer.

## The mixer panel

Open anytime mid-run with **Tab** (or the `mixer` debug button). The run and the
clock freeze; closing (✓ done or Tab) commits the draft, which **lands at the start
of the next bar** (the musical entry rule). Zero mechanical friction — the pacing
comes from the freshness clock below. Validation is live: caps, pool balance, and
the silence rule (**at least one instrument must be playing**) are enforced by
disabled buttons with the reason as tooltip. Muting an instrument returns ALL of its
points to the pools; unmuting costs the minimum ◆1 ■1 back.

## Freshness: hot / stale / primed (the anti-camping system)

Rule one: **low complexity never fatigues.** C1–C2 is the sustainable groove. Only
hot patterns (C ≥ 3) wear out. All state advances on phrase boundaries only
(`RunWorld.tickFreshness`, driven by world time — deterministic, bot-identical).

| Knob | Value (mixer.ts) |
|---|---|
| Hot threshold | C ≥ 3 (`HOT_C`) |
| Fresh window | 8 hot phrases ≈ 63s (`FRESH_PHRASES`) |
| Warning shown | from 6/8 (`WARN_PHRASES`, amber on the rack) |
| Stale penalty | ×0.6 per-note damage, flat (`STALE_MUL`) + dulled voicing |
| Rest requirement | 2 full phrases at C ≤ 2 or muted (`REST_PHRASES`) |
| Primed (the drop) | ×1.5 damage for 4 phrases on going hot again (`PRIMED_MUL`, `PRIMED_PHRASES`) |

The cycle: run a pattern hot for 8 phrases → it goes **stale** (damage ×0.6, the
voice audibly dulls — a lowpass drop, "the loop went flat") → rest it at C ≤ 2 for
2 full phrases → **primed** (gold star) → push it back to C ≥ 3 and it **drops**:
×1.5 damage for 4 phrases, then a fresh 8-phrase window. Rotating two staggered
peaks outperforms the no-fatigue baseline (~1.08×); camping stale sits at 0.6×.
Anti-fiddle: a phrase that saw any hot time counts as neither rest nor progress,
and the only way to reset a hot counter is the full 2-phrase rest.

## What changed in code

- `src/game/mixer.ts` (new): caps, hire levels, freshness state machine + knobs,
  allocation validation. Pure, deterministic, headless-safe.
- `src/game/run.ts`: `tiers` replaced by `arsenal`/`complexity`/`power`/`fresh` +
  granted totals (pools derived); `hire`/`grantLevelPoints`/`applyAllocation`/
  `setLoadout`; freshness phrase clock in `update`; `fireWeapon` reads power for
  stats, complexity for gating, freshness for the multiplier.
- `src/audio/engine.ts`: per-voice `tone` lowpass + `toneGain` between gain and duck;
  `setVoiceMix(role, power, stale)` (deduped, click-free). `setVoiceTier` = complexity.
- `src/game/picks.ts`: hire offers only (`rollHireOffers`), shared by game and bot.
- `src/game/mixerui.ts` (new): the channel-strip allocation panel.
- `src/game/hud.ts`: rack shows ◆ complexity + ■ power pips and freshness states
  (hot n/8, amber warn, greyed stale, gold star primed); `showHire` cards.
- `src/game/game.ts`: point-grant level-ups, hire milestones, Tab mixer, per-frame
  engine sync (deduped) + per-phrase rack refresh.
- `src/bot/conductor.ts` + `policies.ts`: policies now own hire choice + a greedy
  allocator with stale-rotation (random/deep/wide rotate; focus:<role> deliberately
  camps — the stale-penalty probe). Replays stay tick-identical (same code, same rng).
- `src/game/sandbox.ts`: loadout rows force-assemble any (C, P) pair per voice.

## First bot numbers (config e94cffe-dirty, 6 runs/arm, kiter)

random 4:31 / deep 4:33 / wide 4:13 median death — inside the old system's band
(the 28-point parity holds). focus:kick 5:21, focus:bass 5:13 (bass 72% share when
camped): focused builds still carry runs despite the stale penalty. Comparative
floors only, per the bot doctrine.

## Open questions for the developer (carried from the design pass)

1. Should muting refund power points too, or complexity only? (Current: both.)
2. Hire levels 2 AND 3 back-to-back: fast start intended — too early on mobile?
3. Where do items/effects re-enter (elite drops, boss rewards, a 9th mixer row)?
4. Tuning levers, in order: primed ×1.5 → ×1.4, then the 8-phrase fresh window.
