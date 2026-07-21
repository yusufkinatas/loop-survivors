# Loop Survivors: Agent Guide

A survivors-like (Vampire Survivors genre) where the weapons are sounds and a
good build makes a track. Solo designer-director, AI writes all the code. The
design intent — pillars, architecture, the rules the game obeys — lives in
`docs/plan.md`. Read it before doing design or implementation work.

Built with TypeScript and Vite, PixiJS for rendering, Web Audio for sound. No
test framework.

## Communication guide

You are not talking with a music producer. So when you are going to use a musical term,
explain it in plain words the first time it appears in a conversation (for
example: "chord stab — several notes played together as one short punchy hit")

## Where things are

```
docs/plan.md   The design intent: pillars, architecture, tech-stack reasoning.
src/           Game code.
```

## Commands

```
npm run dev     Vite dev server; play the game in the browser
npm run check   Typecheck (tsc --noEmit)
```

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`yusufkinatas/loop-survivors`, via the
`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

