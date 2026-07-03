# M2 Arc Spec

Phase: M2, the arc. Locked July 3, 2026, after a grilling session. Parent plan: `docs/plan.md`.

Picks and leveling across a short full run. Answers M2's question: **does music growing with the build create the "I'm making a track" feeling?**

Everything from the M1 spec carries forward unchanged unless amended here (platform, input, collision, non-build audio policy, visual style, the six kits).

## Musical skeleton amendment: the phrase

- One **phrase = 4 bars**. The master clock counts bars 1–4 and rolls over.
- Charts may be up to 4 bars long. Shorter charts (1 or 2 bars) repeat inside the phrase, exactly as they do today. All existing M1 charts remain valid without changes.
- The phrase makes once-per-phrase material expressible: fills in bar 4, accents that land only on the top of the cycle. High tiers use this for personality without adding volume.

## Weapon tiers (the engine of this phase)

- **Four tiers per weapon.** Tier 1 is what a weapon does when first picked. Picking an owned weapon again raises its tier. 6 weapons × 4 tiers = 24 charts; M1's charts are recycled as material for the ladders.
- **Each tier is one hand-authored chart plus gameplay stats.** A single linear ladder per weapon. No separate density/richness axes (parked, see plan).
- **Ladder shape:** early tiers sparse and simple, late tiers dense *and* rich. Density is the spine (more hits per bar = more damage triggers, music and power grow in the same stroke); richness lands at specific tiers (new notes, variant sounds, once-per-phrase fills) so six dense weapons never stack into mush.
- **Ladder character is a per-weapon design choice.** The hat ladder leans density. The lead ladder leans richness (the melody grows phrase-aware). The bass ladder leans weight: barely more hits, harder per-trigger damage, fatter variants, and a designed top-tier peak — screen shake on bass hits, one special sub-drop sample. "Bigger sound" exists only as per-weapon flavor at designed moments, never as a per-tier asset pipeline.
- Every tier-up must be **audibly different** from the tier below. An inaudible tier is a failed chart, not a stat bump.

## Pick economy

- The pool contains **new weapons and tier-ups only**. No passives, no stat items, no music-modifying items (those are parked for M3+, where they become genre-recipe ingredients).
- **Three options per level-up**, drawn from unowned weapons and tier-ups of owned weapons. Weapons at tier 4 leave the pool.
- **No cap on owned weapons**: all six can be collected. The pick budget is the constraint — maxing everything takes 24 picks and a run grants ~12–14, so builds go *wide* (all voices, low tiers, full-but-thin arrangement) or *deep* (few voices, high tiers, sparse-but-powerful) but never both.
- **Pick cards are terse**: weapon name, tier numeral, one honest gameplay-effect line ("pierces 1 more enemy"). Zero music description, no audio preview. The sound change is discovered by ear. (If playtesting says picks feel blind, an audible preview is the pre-agreed fix candidate, added inside M2.)
- **Run start:** choose one starting kit on the start screen; it begins at tier 1. The lone-instrument opening is the first note of the arc.

## Musical entry rule

- Every pick lands on the **next bar**: the clock resumes, the old chart finishes its current bar, and the new chart (or new voice) enters on the following "1". Instant enough to feel responsive, clean enough to sound intentional. Once-per-phrase material simply plays when its slot next comes around.
- The M1 visual pulse on a new voice joining is kept and also fires on tier-ups, so eye and ear agree on the moment.

## Stage

- **8-minute run**, XP pacing tuned for roughly 12–14 level-ups (average pick gap ~35–40 seconds, long enough for each new layer to register).
- Enemy roster: M1's swarmer and tank, plus one new **darter** — fast, fragile, rushes the player in straight bursts. Threatens by demanding dodges rather than attrition.
- **Wave events** as pure spawn-script data: surrounding rings, directional surges, giving minutes 5–8 texture. No new systems.
- **Death is real.** Tuning target: an attentive player making reasonable picks reaches minute 8 most of the time, dying mainly when greeding a deep build past its defensive means. Wide builds safer, deep builds spikier — the wide-vs-deep choice is a survival decision too.
- The stage carries no musical meaning (dividing rule). Neither stage hook (tempo modulation, injected voice) is implemented in M2.

## Developer tools (first-class deliverables)

- **Chart playground.** One panel component: one row per sound in a kit, one column per grid step across the full 4-bar phrase, a playhead sweeping in time, cells lighting as they fire. Charts of all active weapons stack vertically — the whole arrangement at a glance.
  - In the **rehearsal room**: fully editable. Click a cell to place or remove a hit; velocity and note editable on placed hits; the loop keeps playing while editing so every change is heard instantly. This is where tier charts are sculpted by ear. (Persistence of edits back into game chart data is plumbing, handled without developer involvement.)
  - In the **game**: mounted as a read-only debug overlay on a hotkey, showing the live engine state of the current build.
- **Rehearsal room progression scrub** upgraded to walk tier ladders: hear any weapon's I → II → III → IV, and audition full end-of-run mixes in both archetypes (wide-shallow, narrow-deep).
- **The sandbox.** Entered from the start screen like the rehearsal room. The real game arena with the stage script switched off. Dev panel: roster of every enemy type with name and stats, spawn buttons (one, a handful, a ring), clear-all, invulnerability toggle, and a loadout editor (add/remove any weapon at any tier). Includes the read-only chart overlay. This is where enemies are watched, weapons tested, and balance gates run under reproducible conditions.
- Role split: the rehearsal room is for *listening* (no enemies, no noise), the sandbox is for *watching and testing*. Both stay.

## Build sub-phases, each gated by the developer

- **Sub-phase A, the ladders.** Music side only: the 4-bar phrase clock, the chart playground in the rehearsal room, the upgraded progression scrub, and all six tier ladders (24 charts, AI-drafted) auditioned and sculpted. Gate: every ladder audibly grows step by step, and both late-game mix shapes (wide-shallow, narrow-deep) pass the developer's ear.
- **Sub-phase B, the run.** Game side, muted: pick economy with tier-ups, 8-minute stage with the darter and wave events, XP pacing, next-bar entries, the sandbox. Gate: the Pillar 3 muted run — 8 minutes plays as a competent survivors-like where picks feel like real decisions.
- **Sub-phase C, the arc.** Fusion: sound on, in-game chart overlay, pick cards final, balance pass so every ladder kills respectably at every tier. Gate: M2's question itself, judged across full runs.

Nothing advances past a gate without an explicit pass; a failed gate loops within its sub-phase. Between gates, the developer is brought only decisions that need taste, never code plumbing.

## Verdict protocol

After sub-phase C the developer plays full runs and declares pass or fail on M2's question by his own judgment. The outcome is recorded in `docs/STATUS.md`. A pass starts M3 grilling (the drop); a fail gets reworked within M2 at the level the failure points to.

## Decisions parked during this grilling (recorded in `docs/plan.md`)

- Multi-axis weapon growth (separate density/richness tiers or other alternative buff structures).
- A weapon slot cap, once the catalog outgrows six kits.
