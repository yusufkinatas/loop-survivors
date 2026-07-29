# The prototype base

The shared branch every round-1 prototype starts from. It is today's game with
the cuts [#256](https://github.com/yusufkinatas/loop-survivors/issues/256)
decided, the evolution gate re-hung, and the seams a new engine needs left
obvious. Built by [#265](https://github.com/yusufkinatas/loop-survivors/issues/265).

Nothing here changes what a run *is*. It changes what a run is made of.

Branch: `prototype-base`. The ~18-voice palette ([#266](https://github.com/yusufkinatas/loop-survivors/issues/266))
builds on this branch, and the five prototypes branch from that.

## What was cut

**All eleven passive items**, and everything that hung off them — the item cap,
the item half of the level-up pool, the forced-passive rule, the passive rack,
the pause screen's passive readout, and the sandbox's passive editor. Every
engine in round 1 spends the build slots passives occupied on its own objects.

**The Afterhours Shop and the whole career layer** — the wallet, the nine
power-up ranks, the versioned save and its migrations, mastery, milestones, and
the run-settlement screen. `meta.ts` is gone. Nothing about a run persists
between runs any more; the only `localStorage` key left is `loop.devrow`, which
remembers whether the dev button row is open.

**The endless director** was already gone before this ticket: the Mad Forest
work replaced it with the authored 30-minute wave table, and `madforest.ts`
says so in its header. Nothing to cut. `docs/field-guide.md` still describes the
endless game and has been stale since then.

## What survives, and why

**The bestiary, untouched.** It is built and free. Each stack rewrites *when*
and *what* pressure arrives; none of them rewrites what an Echo Shard is.

**Evolutions, re-gated on the weapon ladder alone.** The old recipe was *weapon
at max level + own the paired passive*. Passives are gone, so the gate is now
just **the weapon at max level, offered by the next chest** — the offer surface
did not move. The decision it buys is *which weapon you push to max under the
build cap*, which was always where the eight levels of cost lived.

The one thing lost with it is the **recipe teaser** on a pedestal: it named the
other half of a recipe, and there is no other half now. A weapon's last level-up
toast says `EVO READY` instead.

**Chests**, which carry the evolution offer, and the **Sandbox**, which is also
the capture surface (see below).

**Music notes.** The career wallet they banked into is gone, but the pickup, its
cue and its place in the Stage Light drop table all stay, and `notesCollected`
is now a run stat. Cutting the pickup would have meant reweighting the drop
table — notes are ~69% of its weight at level 0 — and floor economy is "what a
run is", which this ticket may not touch. The Tip Jar Encore card therefore now
pays a number that only the run report reads. Say so if a stack wants to fix it.

## The seams

Five branches would otherwise each invent these. They live here.

| Seam | Where | What replaces it |
|---|---|---|
| **Stat modifiers** | `RunWorld.mods` (`build.ts`, `BuildMods`) | A prototype's power currency writes into the struct; every weapon module reads it and never learns where the number came from. Neutral in the base — that is the control. |
| **Run shape** | `RunWorldOpts.stage` (`StageScript` in `run.ts`) | The wave and event tables the director walks are an argument, not a module constant. Four of five stacks replace the run shape. |
| **What a level-up offers** | `rollOffers` in `picks.ts` | One pure function over live state and an RNG. A pattern, a reel of tape or a stage position becomes a new member of `AnyPickOption`, and the shell's exhaustive switches then point at every site that has to learn about it. |
| **Arranging off the clock** | `.pause-arrange` in `game.ts` | An empty, always-mounted slot on the pause screen — the one surface that stops the world without ending the run. #255 named "somewhere to arrange or record" as a dependency several candidates share. |

Two rules that come with them:

- **Do not delete a `BuildMods` field because nothing sets it.** The width is
  the seam.
- **The first branch to hit a shared gap pushes the fix back here**, not into
  its own branch. That is what keeps the five identical rather than
  four-times-similar.

## Producing a `docs/baseline/`-comparable capture

**Unchanged by the cuts, and re-verified on this branch by taking one.** The rig
is a console snippet against `window.loop`, the handle `main.ts` exposes; it
touches `loop.engine` and nothing else — no game code, no build state, no items,
no save. Passives and the career were never in the signal, so a take from this
branch and a take from `main` differ only where the branch differs.

Proof: a take of `kick 8, bass 8, hat 8, chord 8, lead 8` off this branch
measures **-10.6 LUFS, LRA 0.5 LU** — the same build's number in
[`docs/baseline/`](baseline/README.md) (`07-maxed-five`) to the decimal. Same
rig, same tap, same signal.

1. `npm run dev`, open the game, enter the **Sandbox** (link at the foot of the
   title screen). Waves are off there, so the field stays empty and the capture
   is arrangement-only.
2. Start the sink so takes land in the repo: `node docs/baseline/receiver.mjs`
3. Paste `docs/baseline/capture-rig.js` into the console.
4. `await __capture(PLAN)` — the same nine build states, so the sets compare
   point for point. Progress is readable at `__progress`.
5. Regenerate the density table:
   `npx tsx docs/baseline/density.ts > docs/baseline/density.md`

Do not edit anything under `src/` while a capture runs: Vite's hot reload
replaces the page and takes the rig with it.

**Keep the Sandbox link working on every prototype branch.** Without it a branch
cannot produce a comparable arrangement capture.

The played-run trace (`docs/baseline/run-log.patch`) hooks the shell's decision
sites, and this branch moved several of them. Expect it to conflict; reshaping
it to the branch's build model is the right move rather than forcing it.

## What playing this base will feel like, measured

Driving a real `RunWorld` through the full 30 minutes with the level-up economy
and chest payout wired as `game.ts` wires them, on two seeds:

- The run reaches 30:00 and wins. All five evolutions fire from chests with no
  passives anywhere — the re-gate works.
- **The build completes at 13:27 and 14:42.** Five weapons at level VIII, and
  then there is nothing left to offer: every level-up from there to 30:00 is an
  Encore. Roughly the back half of the run has no decision in it.

That is the passive cut showing up as a number. In the shipped game the six
passives' thirty extra levels padded the decision stream out to the full set
length; without them it runs dry at minute fourteen.

**This is a fact about the base, not a fault in any stack.** It is the same bias
in all five, so it does not corrupt the comparison — and *"this felt thin as a
game"* is explicitly not a kill for any stack (#265). Read it the other way
around and it is the room each engine's own currency has to fill.
