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
