# Project Status

Last updated: July 3, 2026

## Current phase

**M1, causality** — the first playable demo. Spec: `docs/phases/m1-demo.md` (locked July 3, 2026).

## Current sub-phase

**Sub-phase B, the toy** — implemented, awaiting the gate (branch `m1-claude`). The survivors loop is playable at `npm run dev`: pick a starting kit, WASD movement, swarmers and tanks on a ramping five-minute spawn script, spatial hash collision with separation steering, contact damage with iframes, XP gems, level-up picks (new kits only), victory and death screens. Weapons fire from the engine's chart triggers (one trigger, two outputs). Debug hotkeys: M mute, I invincible, X +xp, K kill screen, O overlay. The rehearsal room moved to `#rehearsal`. Gate: the Pillar 3 muted run, "muted, this is a competent little survivors-like."

Sub-phase A shipped: lookahead scheduler, six kits, one chart per kit, rehearsal room with four switchable sample sets ("Synth" builtin placeholders; "808" / "Machine" / "Electro" from CC0 Sonic Pi samples in `public/samples/sonicpi/`, license recorded there). Chord has no pack candidate yet and stays synth in every set. Bass is a choked (monophonic) kit after gate feedback.

## Gate ledger (M1)

| Gate | Status |
|---|---|
| Sub-phase A: rehearsal room mix passes the developer's ear | **passed** (July 3, 2026) |
| Sub-phase B: muted run plays as a competent survivors-like | pending |
| Sub-phase C: M1 question answered by the fused build | pending |
| Verdict protocol: 10+ runs, three written questions | pending |
| Outside testers (3-5, one question) | pending |

## Next action

Gate B: the developer plays runs with M held down (muted) and judges "muted, this is a competent little survivors-like." Tuning numbers all live in `src/game/config.ts`. A fail loops within sub-phase B; a pass starts sub-phase C, the fusion (sound on, rough balance so every kit kills respectably, debug overlay finished).

## History

- July 3, 2026 — Master plan compiled (`docs/plan.md`).
- July 3, 2026 — M1 grilling session held; three plan inconsistencies fixed (dividing rule reworded, tempo-damage coupling acknowledged, M1 pick scope settled); M1 spec locked (`docs/phases/m1-demo.md`); document structure and agent process established.
- July 3, 2026 — Sub-phase A implemented on branch `m1-claude`: repo scaffold, lookahead scheduler, six synthesized placeholder kits, one chart per kit, rehearsal room (voice toggles, progression scrub, per-voice volume, sample audition, hotkeys), master limiter, `window.loop` dev console handle. Verified end-to-end in Chrome. Awaiting gate A.
- July 3, 2026 — Sample sets added: 22 CC0 samples downloaded from the Sonic Pi library, organized as "808" / "Machine" / "Electro" sets with one-click switching in the rehearsal room, pitched samples retuned to the A root (measured, tune values in `src/audio/samplesets.ts`). All three sets verified audible in Chrome.
- July 3, 2026 — Gate A feedback: Electro bass tail stacked into mud; bass made a choked monophonic kit. **Gate A passed** by the developer. Sub-phase B begins.
- July 3, 2026 — Sub-phase B implemented: PixiJS greybox arena, six weapon archetypes fired by engine triggers, swarmer/tank spawn script, spatial hash, XP/level-up picks, end screens, debug hotkeys, clock pause/resume for picks. All weapon kill paths, death, victory, pick and retry flows verified by simulation in Chrome. Awaiting gate B (muted runs).
