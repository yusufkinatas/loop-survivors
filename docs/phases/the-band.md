# The Band Spec

> **Superseded July 10, 2026.** The developer's autonomous clean-slate
> direction replaces this phase's 24-role catalog, item/effect economy, and
> pending B+C gate with `house-foundation-refactor.md`. The eight-slot ownership
> idea survives there; this file remains unchanged below as design history.

Phase: the band (interstitial, before M4). Locked July 6, 2026, after a
grilling session. Parent plan: `docs/plan.md`. Everything from M1, M2, and
`genres-and-weapons.md` carries forward unchanged unless amended here.

The session used three expert sub-agent reviews as gates on the way to the
lock: a taxonomy review (verdict: endorse-with-changes → the 8-slot cut), a
genre × slot stress test (verdict: no locks or rule-breaks needed, five design
rules recorded), and an assignments review (verdict: endorse-with-changes →
tom moved to Pulse). A fourth sub-agent drafted the twelve new instruments.
The developer approved each step explicitly.

Answers this phase's question: **does capping the build into a band keep a
full build sounding like a track while making every pick feel like hiring a
character?**

## The problem

As a build accumulates instruments the mix turns chaotic, two ways at once:
raw count (up to twelve simultaneous voices) and role collision (several
instruments doing the same musical job, e.g. hat + cowbell + arp all filling
the fast ticking layer). Both worsen as the catalog grows. This phase fixes
both structurally and resolves the parked M2 decision ("a weapon slot cap,
once the catalog outgrows six kits").

## The slot system (locked)

- **Eight typed band-position slots.** Each slot holds at most ONE instrument,
  chosen from that slot's roster. A full build is a complete band: 8 voices,
  each in its own frequency lane and rhythmic job. Slots cap **ownership**,
  not just audibility (a silent damage-dealer would break Pillar 1).
- **Picks are permanent.** Once a slot is filled, its other roster instruments
  leave the pick pool for the rest of the run. You hired your drummer; the
  audition is over. Mid-run swapping is deliberately absent (parked as a
  possible future meta unlock).
- **One slot structure for all genres.** The genre stress test found no genre
  needing a slot locked, disabled, or rule-broken. All genre identity lives in
  pattern authoring within slots (see the design rules below).
- **Tier-ups compete across the whole band**, so M2's wide-vs-deep pick
  tension survives unchanged, just with slot-shaped walls.

| Slot (design name) | Player-facing | Job, in plain words | Roster (new in bold) |
|---|---|---|---|
| Pulse | Beat | steady low drum heartbeat | kick, tom, **heartbeat** |
| Backbeat | Snap | the sharp answering hit on the off-counts | snare, clap, **rimshot** |
| Hats | Tick | fast high metallic ticking | hi-hat, **shaker**, **ride** |
| Motion | Groove | constant tonal running/rippling layer | arp, cowbell, **acid** |
| FX/Transition | FX | sparse dramatic punctuation, section markers | crash, zap, **riser** |
| Bass | Low | deep tonal foundation | bass, **Reese**, **pluck bass** |
| Harmony | Color | chords: sustained pad or rhythmic stab color | chord, **Rhodes**, **choir pad** |
| Melody | Hook | the singable top line | lead, **bell**, **whistle** |

Design names live in docs and code. Only the plain player-facing words appear
on screen (Pillar 2: never producer vocabulary). Exact on-screen wording is
the developer's call at gate time.

**Assignment change from the shipped game:** tom moves from an FX/fill idea to
**Pulse**. Its actual sound is a pitched low-mid drum (a low drum foundation,
not broadband punctuation), and the shipped Techno tom chart already plays it
as a steady groove — that chart is the template. Tom's other five genre
ladders are rewritten from phrase-end rolls into steady low grooves (tier-4
roll flourishes may stay).

## The twelve new instruments

Each stays in its slot's frequency lane, carries a gameplay archetype no other
weapon uses, and must be voiceable in all six genres by patterns alone. All
are synthesized in the `kits.ts` style; any that sound cheap to the
developer's ear swap to CC0 samples, same as the M1 kits.

| Instrument | Slot | Sound, plain words | Gameplay archetype |
|---|---|---|---|
| Heartbeat | Pulse | soft round "lub-dub" double-thud, pillowy, no click | breathing field: pushes enemies out, then drags them back |
| Rimshot | Backbeat | dry woody "tock", tapping the drum's rim | crack that chains from enemy to enemy in a cluster |
| Shaker | Hats | soft "chh-chh" sizzle, the hi-hat's smooth cousin | damage trail left behind while moving |
| Ride | Hats | bright sustained metallic ping that rings | thin radar beam sweeping a circle — **the freeze weapon** |
| Acid | Motion | squelchy rubbery synth line that slides between notes | gravity well pulling enemies toward a point |
| Riser | FX | reversed-cymbal swell that builds and lifts | **the auto-dash**: the release grants a short movement surge |
| Reese | Bass | thick growling detuned bass (the Drum & Bass monster) | placed bass wall that blocks and grinds |
| Pluck bass | Bass | round short "bomp", a picked upright-bass note | lobbed note that arcs and explodes on landing |
| Rhodes | Harmony | warm bell-like electric-piano chords (warm keys) | chord pools placed as mines that bloom when stepped in |
| Choir pad | Harmony | airy sung "aah" chord, lush and held | summoned singing orb that stays and pulses damage |
| Bell | Melody | twinkly music-box ping | notes that shatter into shards on impact |
| Whistle | Melody | pure smooth sung line with a gentle wobble | tags an enemy; it pops one beat later |

Synthesis risk flags: **ride** and **choir pad** are the hardest to synthesize
convincingly — first candidates for CC0 samples if they fail the ear.

## Utility weapons (exactly two)

- **Ride** deals token damage and briefly **freezes** what its sweep crosses
  (Vampire Survivors' Clock Lancet is the ancestor).
- **Riser** deals token damage; its build-and-release grants the player a
  short **automatic dash / speed surge** on the phrase. Sound anticipates,
  body responds.
- **Small damage, never zero.** Model A stays intact (every trigger is still
  damage + sound), the autoplay bot's damage-share floor checks keep working
  without special cases, and the weapon reads alive on pickup.
- The utility count is **capped at two**. Milder effects already in the
  catalog (chord's slow, acid's pull, crash's knockback, heartbeat's drag) are
  seasoning and do not count. A third utility weapon costs a redesign
  discussion, never a quiet addition.

## Recorded design rules (from the genre stress test)

1. **Kick ducks bass** (engine, all genres): when the kick fires, the bass
   voice dips a few dB for a split second so the two subs never stack.
2. **Hip-hop bass re-authored** so its notes land between kick hits, never on
   them (shipped bug today: both hit step 0 at every tier).
3. **Motion charts thinned** in Hip-Hop (sparse offbeats; the hats own the
   fast layer) and Drum & Bass (8th notes max — 16ths at 174 BPM read as an
   error tone).
4. **Zap tier 4 thinned** (~4 hits) or built across the phrase like crash, so
   it stays punctuation, not texture.
5. **FX slot is barred from the starting-weapon offer** (tier-1 FX is near
   silent for minutes; musically dead first pick).
6. **Genre-weighted roster draws**: when an offer shows a slot, the roster
   instrument drawn is weighted toward the genre's idiomatic option (House
   leads with clap, DnB with snare).
7. **Genre chart discipline:** Techno lead charts stay short, low, repetitive
   riffs — a tune-like techno lead is a genre bug. (Lo-Fi's sparseness rule
   retired with the genre on July 8, 2026.)

Flagged for M4, not this phase: the shared sample set is a genre-identity
ceiling patterns cannot fix. Re-audit timbre per genre at the M4 style gate.

## Pick economy

- **At most one instrument candidate per slot per offer.** An offer never
  shows two hires for the same band position; three cards span three
  different questions.
- **A gentle early drum nudge:** for roughly the first two minutes, empty
  Pulse and Backbeat slots draw with higher weight. A thumb on the scale, not
  a guarantee — an all-melody build stays possible and stays the player's
  fault.
- **The pick budget is untouched.** ~13 level-ups per run against 8 slots +
  tier-ups + items + effects means most runs end at 5–7 band members; a
  deliberate full-8 band is achievable but costs nearly the whole budget.
- Items and per-weapon sound effects stay in the pool as shipped in the July 6
  experiment commit.

## UI: the band rack

- The HUD shows **8 sockets** (VS-style build row): empty sockets visible and
  asking to be filled, filled sockets showing instrument icon + tier pips.
- The same rack appears in the **pause menu**.
- Pick cards carry a **slot badge** (the plain player-facing word) so every
  hire visibly plugs a hole in the rack and every card answers "what does
  taking this cost me?" at a glance.
- A full band screen (per-member stats page) is parked for M4 polish.

## Build sub-phases, each gated by the developer

- **Sub-phase A, the system.** Slots + permanent picks + the three offer rules
  + the band rack (HUD and pause) on **today's twelve instruments, no new
  content** — plus tom's move to Pulse with its chart rewrites, design rules
  1–5 (duck, hip-hop bass, Motion thinning, zap tier 4, FX start bar). Gate:
  a run built as a band sounds cleaner at full size and feels like assembling
  a character.
- **Sub-phase B, the first six hires.** Heartbeat, rimshot, shaker, acid,
  pluck bass, Rhodes — one per starving slot, all pure damage weapons (field,
  chain, trail, pull, lob, mine). Kits, per-genre four-tier ladders,
  genre-weighted draws (rule 6). Gate: each sounds like itself across genres
  in the developer's ear, and each slot's choice now feels like a real fork.
- **Sub-phase C, the last six and the utility systems.** Ride (freeze status
  system), riser (auto-dash hook), bell, whistle, Reese, choir pad. All the
  riskiest material — two new gameplay systems and the two hardest sounds —
  loops in one sub-phase. Gate: the utility weapons feel worth a band slot;
  nothing sounds cheap.

Dependency note: this phase stacks on the `worktree-genres-and-weapons`
branch plus the July 6 experiment commit (items, effects, new enemies), whose
own ear gate is still pending. Gate A implicitly co-judges whatever of that
material the developer has not formally passed; the spec does not pretend they
are separable.

Content math, priced: 12 new kits, 12 new weapon behaviors, and 288 new charts
(12 instruments × 6 genres × 4 tiers), plus 6 rewritten tom ladders and the
rule-2/3/4 chart fixes. Chart authoring is AI-drafted, approved by ear, as
always.

## Verdict protocol

After sub-phase C the developer plays full runs across genres and declares
pass or fail on the phase's question by his own judgment. The outcome is
recorded in `docs/STATUS.md`. A pass starts the next phase's grilling (M4
vertical slice, per `docs/plan.md`); a fail gets reworked at the level the
failure points to.
