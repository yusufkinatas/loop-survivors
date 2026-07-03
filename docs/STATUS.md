# Project Status

Last updated: July 3, 2026

## Current phase

**M2, the arc** — picks and leveling across a short full run. Spec: `docs/phases/m2-the-arc.md` (locked July 3, 2026). M1 completed with a pass on the same day.

## Current sub-phase

**Spec locked, implementation not started.** Next up: sub-phase A, the ladders (phrase clock, chart playground, tier charts).

## Gate ledger (M2)

| Gate | Status |
|---|---|
| Sub-phase A: every tier ladder audibly grows; both late-game mix shapes pass the ear | pending |
| Sub-phase B: muted 8-minute run plays as a competent survivors-like with real picks | pending |
| Sub-phase C: M2's question answered by the fused build | pending |
| Verdict: developer's judgment on M2's question | pending |

## Next action

Implement sub-phase A per `docs/phases/m2-the-arc.md`: 4-bar phrase clock, chart playground (editable in the rehearsal room), upgraded progression scrub, six tier ladders (24 charts) drafted for the developer's ear.

## History

- July 3, 2026 — Master plan compiled (`docs/plan.md`).
- July 3, 2026 — M1 grilling session held; three plan inconsistencies fixed (dividing rule reworded, tempo-damage coupling acknowledged, M1 pick scope settled); M1 spec locked (`docs/phases/m1-demo.md`); document structure and agent process established.
- July 3, 2026 — Sub-phase A implemented on branch `m1-claude`: repo scaffold, lookahead scheduler, six synthesized placeholder kits, one chart per kit, rehearsal room (voice toggles, progression scrub, per-voice volume, sample audition, hotkeys), master limiter, `window.loop` dev console handle. Verified end-to-end in Chrome. Awaiting gate A.
- July 3, 2026 — Sample sets added: 22 CC0 samples downloaded from the Sonic Pi library, organized as "808" / "Machine" / "Electro" sets with one-click switching in the rehearsal room, pitched samples retuned to the A root (measured, tune values in `src/audio/samplesets.ts`). All three sets verified audible in Chrome.
- July 3, 2026 — Gate A feedback: Electro bass tail stacked into mud; bass made a choked monophonic kit. **Gate A passed** by the developer. Sub-phase B begins.
- July 3, 2026 — Sub-phase B implemented: PixiJS greybox arena, six weapon archetypes fired by engine triggers, swarmer/tank spawn script, spatial hash, XP/level-up picks, end screens, debug hotkeys, clock pause/resume for picks. All weapon kill paths, death, victory, pick and retry flows verified by simulation in Chrome.
- July 3, 2026 — **Gate B passed** with notes: run too easy end to end, weapons visually unclear, picks same-ish. Sub-phase C begins and absorbs the notes.
- July 3, 2026 — Sub-phase C first pass: difficulty curve steepened (undefended player now dies ~19s in; a defended stationary kick+snare build still survives, developer judges live), distinct projectile silhouettes (snare bolt, hat chip dot, bass wave front, lead seeker arrow), XP gems recolored white so they can't read as hat shots, clap removed from the snare chart per feedback, homing turn tightened, per-weapon kill attribution in the overlay and on end screens, on-screen debug buttons mirroring the hotkeys, rehearsal room linked from the start screen with a back button. All verified in Chrome.
- July 3, 2026 — **Gate C passed** by the developer: the fused build answers M1's question. Verdict protocol begins; log created at `docs/phases/m1-verdict-log.md`.
- July 3, 2026 — Verdict protocol simplified with developer sign-off: the written run log (file deleted), the three formal questions, and the outside-tester step removed from `docs/phases/m1-demo.md` and `docs/plan.md`. The developer's own judgment is the whole protocol, at M1 and at every future milestone exit.
- July 3, 2026 — **M1 verdict: pass**, declared by the developer. M1 complete. Next: M2 grilling session.
- July 3, 2026 — M2 grilling session held. Locked: 4-bar phrase clock; four tiers per weapon as single hand-authored chart ladders with per-weapon character (hat=density, lead=richness, bass=weight with a top-tier subwoofer peak); pick pool of weapons and tier-ups only, three options per level-up, terse VS-style pick cards with no music text; 8-minute run at ~12–14 level-ups; no weapon cap (wide-vs-deep carried by the pick budget); next-bar entry for all picks; one new darter enemy plus wave events; real death, tuned so attentive play usually completes the arc; chart playground (editable in rehearsal room, read-only in-game overlay) and enemy/weapon sandbox as first-class dev tools. Two decisions parked in `docs/plan.md` (multi-axis growth, future slot cap). Spec locked at `docs/phases/m2-the-arc.md`.
