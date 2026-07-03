# Project Status

Last updated: July 3, 2026

## Current phase

**M1, causality** — the first playable demo. Spec: `docs/phases/m1-demo.md` (locked July 3, 2026).

## Current sub-phase

**Sub-phase C, the fusion** — in progress (branch `m1-claude`). Sound on, rough balance pass so every kit kills respectably, debug overlay finished. Gate: M1's question itself.

Gate B notes from the developer (to address in C): too easy across the whole run (never got hit once), early game too empty, late game never threatens; weapons visually unclear; picks feel same-ish as weapons. C therefore includes a real difficulty retune, distinct per-weapon silhouettes, and per-weapon kill attribution for balance reading.

Sub-phase A shipped: lookahead scheduler, six kits, one chart per kit, rehearsal room with four switchable sample sets ("Synth" builtin placeholders; "808" / "Machine" / "Electro" from CC0 Sonic Pi samples in `public/samples/sonicpi/`, license recorded there). Chord has no pack candidate yet and stays synth in every set. Bass is a choked (monophonic) kit after gate feedback.

## Gate ledger (M1)

| Gate | Status |
|---|---|
| Sub-phase A: rehearsal room mix passes the developer's ear | **passed** (July 3, 2026) |
| Sub-phase B: muted run plays as a competent survivors-like | **passed** (July 3, 2026, with tuning notes) |
| Sub-phase C: M1 question answered by the fused build | pending |
| Verdict protocol: 10+ runs, three written questions | pending |
| Outside testers (3-5, one question) | pending |

## Next action

Implement sub-phase C: difficulty retune (death genuinely possible), distinct weapon silhouettes, per-weapon kill attribution in overlay and end screen, rough balance so every kit kills respectably. Then gate C: the developer plays with sound on and judges M1's question, "does it feel like my build and sound like music at the same time?"

## History

- July 3, 2026 — Master plan compiled (`docs/plan.md`).
- July 3, 2026 — M1 grilling session held; three plan inconsistencies fixed (dividing rule reworded, tempo-damage coupling acknowledged, M1 pick scope settled); M1 spec locked (`docs/phases/m1-demo.md`); document structure and agent process established.
- July 3, 2026 — Sub-phase A implemented on branch `m1-claude`: repo scaffold, lookahead scheduler, six synthesized placeholder kits, one chart per kit, rehearsal room (voice toggles, progression scrub, per-voice volume, sample audition, hotkeys), master limiter, `window.loop` dev console handle. Verified end-to-end in Chrome. Awaiting gate A.
- July 3, 2026 — Sample sets added: 22 CC0 samples downloaded from the Sonic Pi library, organized as "808" / "Machine" / "Electro" sets with one-click switching in the rehearsal room, pitched samples retuned to the A root (measured, tune values in `src/audio/samplesets.ts`). All three sets verified audible in Chrome.
- July 3, 2026 — Gate A feedback: Electro bass tail stacked into mud; bass made a choked monophonic kit. **Gate A passed** by the developer. Sub-phase B begins.
- July 3, 2026 — Sub-phase B implemented: PixiJS greybox arena, six weapon archetypes fired by engine triggers, swarmer/tank spawn script, spatial hash, XP/level-up picks, end screens, debug hotkeys, clock pause/resume for picks. All weapon kill paths, death, victory, pick and retry flows verified by simulation in Chrome.
- July 3, 2026 — **Gate B passed** with notes: run too easy end to end, weapons visually unclear, picks same-ish. Sub-phase C begins and absorbs the notes.
- July 3, 2026 — Sub-phase C first pass: difficulty curve steepened (undefended player now dies ~19s in; a defended stationary kick+snare build still survives, developer judges live), distinct projectile silhouettes (snare bolt, hat chip dot, bass wave front, lead seeker arrow), XP gems recolored white so they can't read as hat shots, clap removed from the snare chart per feedback, homing turn tightened, per-weapon kill attribution in the overlay and on end screens, on-screen debug buttons mirroring the hotkeys, rehearsal room linked from the start screen with a back button. All verified in Chrome.
