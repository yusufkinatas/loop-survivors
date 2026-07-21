# Arp orbiters chip on a timer, not on pierce

Every projectile weapon spends one pierce per enemy hit and dies at zero. Arp
orbiters are exempt: they skip the shared rule at `run.ts:2359-2361` and gate
re-hits by time instead, re-damaging the same enemy every `ORBIT_REHIT_S`
(0.35s, or 0.45s evolved). We decided (2026-07-20, issue #138) that this is
the arp's identity, not an accident: an orbiter is a sweeping field that keeps
chipping whatever it passes through, so a slow sweep through a pack is the
weapon's whole appeal. The alternative — making orbiters spend pierce like
every other projectile — was rejected because a pierce-limited orbiter dies
mid-sweep and stops being an orbit at all; it becomes a short-range shot that
happens to curve.

Orbiters are exempt from arena-rail bounces too (`run.ts:2378`), for the same
underlying reason: an orbiter is bound to the player, not travelling through
the arena.

## Consequences

- The exemption must be **visible as a stat**, not a buried branch. When the
  arp weapon module lands, its stats block names the timer re-hit
  (see #144); until then the `run.ts` branch comment is the only signal.
- The weapon-module migration ports this behavior **verbatim**. Porting is not
  the moment to reconsider it — changing it means re-litigating this ADR.
- Arp's stat ladder carries no `pierce` key, so the `+pierce` half of Needle
  Tips is a no-op on arp while its `+shot damage` half still applies. That
  half-dead item interaction is a real player-facing gap tracked separately
  (see #145) — it is a consequence of this decision, not a reason to revisit
  it.

### Update 2026-07-20 (#145, #146)

The two issues named above have landed, and they change the facts in that last
bullet without changing this decision.

- #145 made Needle Tips **pierce-only**: the `+shot damage` half is gone. So
  the item is no longer half-dead on arp — it is now a **100% no-op** there.
  Arp still carries no `pierce` key, and per the decision above that is
  correct; an orbiter gates re-hits on a timer, so there is no pierce budget
  for the item to add to. The gap is therefore wider than this ADR originally
  recorded, and it is a pure item-coverage question, not an arp question.
- #146 found the same shape of bug one weapon over, and fixed it: evolved lead
  (Neon Serpent) was overwriting its pierce with a hardcoded `6` *after* the
  build pipeline had run, so Needle Tips did nothing on the evolution it
  unlocks. That 6 is now a base the pipeline builds on
  (`LEAD_SERPENT.basePierce`), so the item applies. Unlike arp, lead has a
  real pierce budget, so routing it was the whole fix. The lesson generalises:
  an evolution stating a signature stat must state it as an **input** to the
  build pipeline, never as a write over the pipeline's output.
