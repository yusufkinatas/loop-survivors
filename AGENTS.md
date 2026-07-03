# Loop Survivors: Agent Guide

Read this first. It tells you what this project is, where every document lives, what process the project follows, and how to find out what is being worked on right now.

## What this project is

A survivors-like (Vampire Survivors genre) where the weapons are sounds and a good build makes a track. Solo designer-director, AI writes all the code. Full design rationale, pillars, architecture, and roadmap: `docs/plan.md`. Read it before doing any design or implementation work.

## About the developer

The developer is not a musician and does not know music theory or its vocabulary. Terms like "chord stab", "quartal voicing", "backbeat", or "pentatonic" mean nothing to him on their own. When a musical term is needed, explain it in plain words the first time it appears in a conversation (for example: "chord stab — several notes played together as one short punchy hit"), or describe the sound and its gameplay role instead of naming the technique. His ear is still the gate for every sound decision: he judges what he hears, not what it is called. This mirrors Pillar 2, the game's players never need theory either.

## Where things are

```
CLAUDE.md            Imports this file, nothing else.
AGENTS.md            This file. Process and document map. Changes rarely.
docs/
  plan.md            The master plan: pillars, architecture, roadmap (M1-M5),
                     parked decisions. The source of truth for design intent.
  STATUS.md          Current state: which phase we are in, which sub-phase and
                     gate, what the next action is. Read this at the start of
                     EVERY session. Update it whenever state changes.
  phases/
    m1-demo.md       Locked spec for phase M1 (the first playable demo).
    m2-*.md ...      Future phase specs land here, one file per phase,
                     named <phase>-<short-title>.md.
src/ etc.            Game code (appears once M1 implementation starts).
```

## The phase process

The roadmap in `docs/plan.md` defines phases M1 through M5. Every phase ends in something playable and answers one named question. Each phase moves through the same cycle:

1. **Grill.** Before a phase is implemented, the developer and the agent hold a grilling session (the `/grill-me` skill): one question at a time, recommended answers, walking every branch of the phase's design tree until decisions are locked. Contradictions found in `docs/plan.md` during grilling get fixed in `docs/plan.md` as part of the session.
2. **Spec.** The session's decisions are written into a new locked spec at `docs/phases/<phase>-<title>.md`, following the shape of `m1-demo.md`: scope, build sub-phases with developer gates, and a verdict protocol that defines pass and fail in advance. `docs/plan.md` gets a one-line pointer to the spec. `docs/STATUS.md` is updated.
3. **Implement.** The agent builds the phase per its spec, sub-phase by sub-phase. Each sub-phase ends at a gate only the developer can pass (his ear, his hands). A failed gate loops within its sub-phase, never pushes problems downstream. Between gates, bring the developer only decisions that need taste, never code plumbing.
4. **Verdict.** The phase's verdict protocol runs. Its outcome decides whether the next phase's grilling session begins or the current phase gets reworked. Record the outcome in `docs/STATUS.md`.

When a phase completes, the cycle restarts at step 1 for the next phase. Never start implementing a phase that has no locked spec in `docs/phases/`.

## Rules for agents

- **Start every session by reading `docs/STATUS.md`**, then the spec of the current phase. That is the answer to "what are we doing right now."
- **Specs are locked.** After grilling, a phase spec changes only with the developer's explicit sign-off. If implementation reveals a problem with a spec decision, surface it, do not silently deviate.
- **The developer is the only gatekeeper.** Nothing advances past a gate without his explicit pass. His judgment hours are the project's scarce resource: optimize for his evaluation speed, not construction speed.
- **Respect the parked decisions** list in `docs/plan.md`. Those are deliberately deferred; do not resolve them ad hoc in code.
- **Keep `docs/STATUS.md` truthful.** Whenever a sub-phase starts, a gate passes or fails, or a verdict lands, update it in the same working session.
- **Pillar 3 discipline:** the game must be a good survivors-like muted. Do not let music excuse broken gameplay.
