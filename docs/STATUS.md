# Project Status

Last updated: July 3, 2026

## Current phase

**M1, causality** — the first playable demo. Spec: `docs/phases/m1-demo.md` (locked July 3, 2026).

## Current sub-phase

**Sub-phase A, the instrument** — implemented, awaiting the gate (branch `m1-claude`). The repo is scaffolded (TypeScript, Vite, PixiJS v8 installed for sub-phase B). The Web Audio lookahead scheduler, six kits with charts, and the rehearsal room are built and verified running in-browser. Run with `npm run dev`.

Sounds: four switchable sample sets via buttons in the rehearsal room. "Synth" is the builtin placeholder kit; "808", "Machine", and "Electro" use CC0 samples from the Sonic Pi library (`public/samples/sonicpi/`, license recorded there). Pack sets cover drums, bass, and (Machine/Electro) lead; chord stays synth everywhere until a good pack candidate is curated. Single files can still be auditioned per voice via "load sample".

## Gate ledger (M1)

| Gate | Status |
|---|---|
| Sub-phase A: rehearsal room mix passes the developer's ear | awaiting developer listen |
| Sub-phase B: muted run plays as a competent survivors-like | pending |
| Sub-phase C: M1 question answered by the fused build | pending |
| Verdict protocol: 10+ runs, three written questions | pending |
| Outside testers (3-5, one question) | pending |

## Next action

Gate A: the developer opens the rehearsal room (`npm run dev`), assembles the six-voice mix, and judges it against "I'd happily listen to this full six-voice mix for five minutes." A fail loops within sub-phase A (sounds and charts iterate in the room); a pass starts sub-phase B, the toy.

## History

- July 3, 2026 — Master plan compiled (`docs/plan.md`).
- July 3, 2026 — M1 grilling session held; three plan inconsistencies fixed (dividing rule reworded, tempo-damage coupling acknowledged, M1 pick scope settled); M1 spec locked (`docs/phases/m1-demo.md`); document structure and agent process established.
- July 3, 2026 — Sub-phase A implemented on branch `m1-claude`: repo scaffold, lookahead scheduler, six synthesized placeholder kits, one chart per kit, rehearsal room (voice toggles, progression scrub, per-voice volume, sample audition, hotkeys), master limiter, `window.loop` dev console handle. Verified end-to-end in Chrome. Awaiting gate A.
- July 3, 2026 — Sample sets added: 22 CC0 samples downloaded from the Sonic Pi library, organized as "808" / "Machine" / "Electro" sets with one-click switching in the rehearsal room, pitched samples retuned to the A root (measured, tune values in `src/audio/samplesets.ts`). All three sets verified audible in Chrome.
