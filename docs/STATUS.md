# Project Status

Last updated: July 3, 2026

## Current phase

**M1, causality** — the first playable demo. Spec: `docs/phases/m1-demo.md` (locked July 3, 2026).

## Current sub-phase

**M1 complete — verdict: pass.** All three build sub-phases passed (branch `m1-claude`) and the developer declared the M1 verdict a pass on July 3, 2026. Next up is the M2 grilling session.

Sub-phase A shipped: lookahead scheduler, six kits, one chart per kit, rehearsal room with four switchable sample sets ("Synth" builtin placeholders; "808" / "Machine" / "Electro" from CC0 Sonic Pi samples in `public/samples/sonicpi/`, license recorded there). Chord has no pack candidate yet and stays synth in every set. Bass is a choked (monophonic) kit after gate feedback.

## Gate ledger (M1)

| Gate | Status |
|---|---|
| Sub-phase A: rehearsal room mix passes the developer's ear | **passed** (July 3, 2026) |
| Sub-phase B: muted run plays as a competent survivors-like | **passed** (July 3, 2026, with tuning notes) |
| Sub-phase C: M1 question answered by the fused build | **passed** (July 3, 2026) |
| Verdict: developer's judgment on M1's question | **passed** (July 3, 2026) |

## Next action

Hold the M2 grilling session (`/grill-me`) on "the arc": picks and leveling across a short full run, does music growing with the build create the "I'm making a track" feeling? Its decisions get written into a locked spec at `docs/phases/m2-<title>.md`.

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
