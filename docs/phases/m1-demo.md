# M1 Demo Spec

Phase: M1, causality. Locked July 3, 2026, after a grilling session. Parent plan: `docs/plan.md`.

The first playable demo, built for the developer's own playtesting. Answers M1's question: **does it feel like my build and sound like music at the same time?** This is the project's central bet.

## Scope

- **Platform:** desktop browser only. WASD and arrow keys. No touch, no mobile layout, no app wrappers. Renderer stays resolution-independent from day one. Mobile enters when outside testers get links.
- **Input:** movement is the only player verb. Continuous, unquantized, silent. Everything that makes sound is automatic. If a player-activated ability is ever added later, its gameplay effect is instant and its sound is either a non-grid one-shot or an accent on the next subdivision.
- **Weapons:** six kits, one per musical role, each fused to a distinct gameplay archetype. Kick (downbeat aura pulse around the player), snare/clap (backbeat directional shot), hi-hat (dense stream of weak fast hits), bass (slow piercing low wave), chord stab/pad (zone or orbiting field), lead synth (homing projectile whose chart is a melody). One chart per kit, no tiers.
- **Musical skeleton:** one, hardcoded but structured as data. 4/4, ~105-115 BPM fixed for the whole run, minor pentatonic on one root. All pitched kits sampled or pitch-shifted to that note set. The scheduler treats beat length as a variable so tempo never bakes in.
- **Sounds:** curated free-license (prefer CC0) sample packs, so the playtest verdict is about the design and never the sample quality. Pitched kits get note variants by playback-rate pitch shifting from one good sample. AI-generated sound is a separate side experiment: candidate kits get A/B auditioned against pack sounds in the rehearsal room, no game code involved.
- **Stage:** infinite scrolling greybox plane, camera locked on player. Two silent enemy types: a weak swarmer that chases in crowds, and a slow tank with real HP that makes per-trigger damage differences felt. Contact damage against a player HP pool, death genuinely possible. Survive five minutes against a ramping time-scripted spawn density, victory screen at the end. Roughly five to seven level-ups per run.
- **Progression:** enemies drop XP, level-up pauses and offers a pick, every pick is a new weapon kit only. No weapon upgrade tiers, no passives, no stat items, no genres, no tempo events, no bosses. Starting kit is chosen at run start. Weapon tiers are M2's engine, the genre drop is M3's.
- **Non-build audio:** none at launch. Getting hit is screen flash and HP bar, pickups are visual, level-up is the pick screen. UI sounds may be added only as fixes to observed playtest failures, and any such sound must be in-key and grid-quantized so it lands as a musical accent.
- **Visuals and UI:** deliberately ugly, but not feedback-dead. Flat shapes on dark background, each weapon with its own color and silhouette so what is heard is legibly connected to what is seen. Cheap style-agnostic juice: hit flash, death pop, a pulse when a new voice joins the mix. All UI (HUD, pick screen, start screen, rehearsal room) is plain DOM overlaid on the canvas, cheap enough to throw away at M4.
- **Collision:** no physics engine. Circle-versus-circle tests over a per-frame spatial hash grid, plus separation steering. Handles low thousands of entities; escape hatches (typed arrays, particle containers) are incremental, not rewrites.

## Developer tools (first-class deliverable)

A developer console and a **rehearsal room**: a no-pressure mode to assemble any build by hand, add and remove voices live, scrub a simulated progression from lone instrument to full arrangement, and listen. This is where sample packs are curated, AI-drafted charts are approved or rejected, and AI-generated kits are auditioned. Built before the game loop, since the audio engine underneath is the same. Debug hotkeys and overlay ship in the demo alongside it.

## Build sub-phases, each gated by the developer

- **Sub-phase A, the instrument.** Web Audio lookahead scheduler plus the rehearsal room, no game. Gate: "I'd happily listen to this full six-voice mix for five minutes." Iteration on sounds and charts happens here, where a round trip is minutes.
- **Sub-phase B, the toy.** The survivors loop driven by the same scheduler: movement, spawning, spatial hash, contact damage, XP, picks. Gate: the Pillar 3 muted run, "muted, this is a competent little survivors-like."
- **Sub-phase C, the fusion.** Sound on, rough balance pass so every kit kills respectably, debug overlay finished. Gate: M1's question itself.

Nothing advances past a gate without an explicit pass, and a failed gate loops within its sub-phase. Between gates, the developer is brought only decisions that need taste (sample shortlists, chart A/Bs in the rehearsal room), never code. All plumbing (git from first commit, local dev server) is handled without developer involvement.

## Verdict protocol

After sub-phase C: ten-plus full runs spread over several days, never one sitting, deliberately varying builds, including at least two muted runs. Three questions answered in writing, decided in advance:

1. Did specific picks produce a nameable "that's mine" moment? (causality)
2. Was there any build where the mix sounded bad? (Pillar 2; one bad build is a system bug, not a content bug)
3. Did the developer ever replay when not required to? (the honest fun signal)

Pass is yes, no, yes. Then the link goes to three to five outside testers with one question phrased so it can fail, such as "describe what the sounds had to do with your choices," before M2 begins. A fail on question 1 means rework at the coupling level, not more content. Fails on 2 or 3 are fixable within M1 scope.
