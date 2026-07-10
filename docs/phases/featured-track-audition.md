# Featured Track Candidate Audition

Phase: development audition extension, before M4. Locked July 10, 2026 from
the developer's explicit implementation direction. Parent plan:
`docs/plan.md`. This temporarily supersedes the House foundation's one-fixed-
soundset start flow for the purpose of choosing that eventual fixed soundset;
it does not choose or ship a winner by itself.

## Question

**Which of Show Me Love, Animals, Pursuit, and Satisfaction feels best both as
a complete arrangement and as a track the player gradually builds through
weapons?**

The developer's ear and hands decide. Engineering can establish that the four
options are complete, reachable, coherent, and comparable, but cannot rank
their sound or feel.

## Scope

- The Experimentation room keeps all historical studies, while these four
  candidates gain an authored full-section playthrough and an obvious one-click
  full-arrangement transport.
- Each candidate is an instrumental development study. No original master,
  stem, vocal, vocal imitation, proprietary synth ROM, or downloaded MIDI is a
  game dependency. Reusable one-shots are downloaded from documented sources,
  corrected with the project's ffmpeg pipeline, and accompanied by source,
  license, and health reports.
- Before a normal run, the developer explicitly selects one of the four
  candidates. The sandbox exposes the same selector and can force the selected
  track's complete maximum-level band.
- A track exposes only the weapons used by its declared strongest section. A
  musical lane maps onto an existing gameplay `Role`, band slot, combat shape,
  and color; the candidate supplies its name, sample family, tempo, feel, and
  chart.
- Every available weapon has exactly four levels. Level IV is an exact copy of
  that lane in the candidate's declared strongest section; levels I-III reveal
  progressively richer subsets without changing the final target.
- Eight-bar phrases and track-specific notes are preserved. A four-bar or
  A-minor-pentatonic conversion is not allowed to erase a candidate's bar-eight
  turnaround or characteristic outside note.
- Track changes are explicit state, not a mutable module-global assumption.
  Rapid sandbox changes cannot let an older asynchronous kit render overwrite a
  newer choice. The rehearsal room and headless House balance baseline remain
  available.
- The existing locally supplied commercial `public/boss/pursuit.mp3` is not a
  source for these playable profiles. It cannot provide per-weapon causality and
  requires separate copyright cleanup.

## Candidate maximum sections

| Candidate | Maximum section | Playable lanes |
|---|---|---|
| Show Me Love | club peak | kick, heavy snap, hats, percussion, organ bassline, quiet strings, transition FX |
| Animals | drop variation | kick, backbeat, hats, low bass, wooden drop hook, transition FX |
| Pursuit | drop variation | kick, clap, hats, sub pulse, metal stab |
| Satisfaction | drop | kick, clap, hats, lower riff, upper riff layer, transition FX |

These are intentionally not padded to eight voices. A reference arrangement
that creates impact by removing parts must stay sparse.

## Gates

1. **Asset and content gate.** Every downloaded one-shot has a reproducible
   source, processing entry, and green format/onset/peak report. Every track and
   arrangement validates; each playable lane has four non-silent tiers and an
   exact Level-IV match to the declared maximum section.
2. **Integration gate.** The four choices work from the start screen and
   sandbox; tempo, samples, charts, names, offers, build cap, full-band action,
   reset, and rapid switching all follow the selected profile. Static build,
   Track Lab validation, browser desktop/phone flows, and representative combat
   triggers pass without new errors.
3. **Developer gate.** The developer listens to all four full arrangements,
   force-plays all four maximum sandbox builds, and builds each through a normal
   run. He may reject individual sounds, tiers, or mappings without choosing a
   winner yet.

## Verdict

On a pass, the developer names one candidate as the demo's fixed default track;
only then is the audition selector removed or demoted and the winner promoted
into the normal first-time path. On a fail, rework stays within the named
candidate or shared progression seam. No implementation or automated metric
may silently pick the winner.

