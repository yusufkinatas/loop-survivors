# Loop Survivors: Agent Guide

A survivors-like (Vampire Survivors genre) where the weapons are sounds and a
good build makes a track. Solo designer-director, AI writes all the code. The
design intent — pillars, architecture, the rules the game obeys — lives in
`docs/plan.md`. Read it before doing design or implementation work.

## About the developer

The developer is not a musician and does not know music theory or its
vocabulary. Terms like "chord stab", "quartal voicing", "backbeat", or
"pentatonic" mean nothing to him on their own. When a musical term is needed,
explain it in plain words the first time it appears in a conversation (for
example: "chord stab — several notes played together as one short punchy hit"),
or describe the sound and its gameplay role instead of naming the technique.
His ear and hands are the only gate: nothing is done until he has heard or
played it and passed it, and he judges what he hears, not what it is called.
His judgment time is the scarce resource, so optimize for his evaluation speed:
bring him decisions that need his taste, not code plumbing. This mirrors Pillar
2 — the game's players never need theory either.

## Where things are

```
CLAUDE.md      Imports this file, nothing else.
AGENTS.md      This file.
docs/plan.md   The design intent: pillars, architecture, tech-stack reasoning.
src/           Game code.
```

## Orienting

Orient from git: the current branch, recent commits, and open PRs tell you what
is in flight. Read `docs/plan.md` for the current design. Run the game with
`npm run dev`.
