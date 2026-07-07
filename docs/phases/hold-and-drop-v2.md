# Hold & Drop v2 Spec

Status: **Proposed v2. Supersedes the v1 prototype note (`docs/phases/hold-and-drop.md`).** This is the design after the beat-maker / designer convergence. It is written to be implemented by an agent who was not in that conversation. Every decision below is locked EXCEPT the items in "Open questions / parked decisions."

**Gate ledger:**
- **Sub-phase A — the drop event (build → gap → slam): PASSED** (July 7, 2026, developer's ear/hands: "drop feels right"). Committed on `prototype-hold-drop` (`13b72ca`). Debug-triggered (KeyP), fixed 2-bar House build, guaranteed riser+kick, render-clock juice; bot-determinism preserved.
- **Sub-phase B (ARM + tension economy) — first pass BUILT, then SENT BACK at an informal gate** (July 7, 2026). The shipped pass (committed `4a6bdbb`) used a danger-priced GLOBAL tension pool; Q committed all armed voices into the sub-phase-A build sized by tension × combo, on a 13s cooldown, with a sub-minimum fizzle. The developer's hands rejected it on four counts: (1) closed sockets don't look like they're charging; (2) the meter is illegible — no read on what tension is or why it fills; (3) the borrowed build voices (a generic snare/hat/kick/sub) clash with the player's owned instruments; (4) P (a leftover debug drop) vs Q is confusing and Q is never taught. A three-expert review (code / game-design / music) traced all four to one mental-model mismatch and a real design flaw (the danger-priced pool punishes good positioning and locks a safe player out of the toy). **The rework is specified below in "Sub-phase B rework (v2.1)" and is signed off by the developer.** The shipped `4a6bdbb` pass is superseded.
- **Sub-phase B rework (v2.1) — SPEC LOCKED, not yet implemented** (July 7, 2026). See the dedicated section below. The pivot: charge is per-voice and anchored to arming (not the horde); the drop is rebuilt from the player's OWN instruments; one taught verb (Q); a short anti-double-tap cooldown; the synchronized full-band bonus wired behind a flag. This is the current build target.
- Sub-phase C (all six genres + grid-flex + gap scaling) — not started. **Note:** the "reclaim/resolve-by-slot" audio work the spec originally parked here is pulled FORWARD into the B rework (you cannot honestly gate "does the drop sound earned" with clashing foreign audio). Sub-phase C keeps the multi-genre port, grid-flex, and per-genre gap scaling.
- Sub-phase D (balance + across-the-run pass) — not started.

Music terms are explained in plain words the first time they appear. The developer is not a musician; his ear is the gate.

---

## The problem (what v1 got wrong)

v1 let the player pull instruments back with number keys 1–8 (each goes silent and banks "charge" over ~7 seconds while a global TENSION meter rises), then toggle them back on for up to 4× damage plus an area "slam." Q dropped everything at once. Four complaints killed it:

1. **It doesn't feel like making a drop.** A "drop" in dance music is the moment the full beat crashes back in after a tense pause — the payoff everyone waits for. Pull-then-toggle produced neither the audio of a drop nor the gameplay juice ("that landed hard").
2. **Tension is too cheap.** It filled from a plain wall-clock timer (7s and it's full), so a drop-worthy meter was always a few seconds away. No cost, no scarcity, no decision.
3. **No build-up.** A real drop needs a build first — a rising, tightening section that promises the crash. v1 jumped straight from "held" to "slam," skipping the climb. The game needs a distinct **build-up phase** and then a **drop phase**, not an instant toggle.
4. **Breaks with few instruments.** With only 2 owned voices (say kick + snare) there is nothing to thin and nothing to re-stack, so early-run drops were meaningless. The mechanic must work from 2 voices at minute one to 8+ voices late.

The goal: across a playthrough the game should **sound like a natural flow of music** (tension builds, floor drops out, beat crashes back) AND **feel satisfying to play** (the crash lands hard in the hands and on screen). Both channels must sell "that's a drop!" on the same frame.

---

## The v2 design in one paragraph

Tension becomes a **spendable resource that fills from danger, not from a clock**: it climbs with nearby enemy count, near-misses, and kill streaks, and sits near zero when you are safe. Holding an instrument back thins the mix into an **ambient breakdown** (a quiet, sparse section) — that is the survival tax and the risk, but it does NOT itself make the audible build. When the player **commits to a drop**, a fixed, grid-locked **build** fires: a riser swell (a rising "whoosh" that anticipates a hit), the surviving loop's filter opening up (getting brighter and fuller), and the hats/snare accelerating into a **roll** (hits packed tighter and tighter). The build ends in a **one-beat gap** where the floor drops out (kick and bass cut, only the riser screaming), and resolves on the next **downbeat** (the first, strongest beat of a bar) as a **slam**: sub-bass hit plus the full loop crashing back in, riser cut to hard silence exactly as the kick lands. The satisfaction is the **contrast event** — subtraction then slam, landing in both channels at once: silence-into-slam in audio, freeze-into-flash in visuals, on the same frame.

Two phases, two verbs:

- **ARM** — pull voices back. Fire thins, tension climbs faster the more danger you are in. This is the setup and the vulnerability.
- **DROP** — commit. The build fires immediately and the payoff quantizes (snaps) to the next downbeat. This is the release.

---

## Terminology (plain words, used throughout)

- **Bar** — one musical measure, here always 4 beats. Its length in seconds depends on tempo (see the tempo table).
- **Beat** — one pulse; 4 to a bar. The **downbeat** is beat 1, the strongest.
- **Quantize** — snap an event to the nearest grid position (beat or bar) instead of firing on a wall-clock timer, so it lands in time with the music.
- **Riser** — a rising "whoosh" that swells up and cuts off, telling the ear a hit is coming. The game already has this voice (`kits.ts renderRiser`: 0.85s reversed-cymbal swell, a bandpass filter sweeping 600 Hz up to ~9 kHz, gain ramping up then cut).
- **Roll** — the same drum hit repeated at an accelerating rate (eighth-notes doubling to sixteenth-notes), a classic "here it comes" fill.
- **Filter open** — a low-pass filter (which muffles the sound) sweeping open so the loop gets brighter and fuller through the build.
- **The gap** — the last beat before the drop, where the beat cuts out and only the riser is left. The floor dropping out.
- **The slam / the one** — the downbeat the whole build resolves onto: sub-bass hit + full loop re-entry + all the juice.
- **Sidechain** — the pumping "breathing" effect where the kick briefly ducks the bass so the kick punches through. Already wired for every Bass-slot sub (see `run.ts` kick-ducks-bass).

---

## Sub-phase B rework (v2.1) — THE CURRENT BUILD TARGET

This section supersedes the original "Gameplay anatomy → tension economy", "ARM", "DROP", "How it works from 2 instruments to 8+", and the borrowing rules in "Audio anatomy" below. Everything else in this doc (terminology, the timeline shape, Pillar 3, determinism, the verdict protocol) still holds. Where this section and the older prose disagree, **this section wins**; the older prose is kept as design history.

Signed off by the developer (July 7, 2026): the per-voice charge pivot, rebuilding the drop from owned voices, a short anti-double-tap cooldown, and the synchronized full-band bonus (the only skill topping in scope; solo long-hold and the perfect-release ring are parked).

### Why the first pass was sent back (the root cause)

The developer's mental model is *"each instrument I close charges up like a capacitor; when they're loaded I release them."* The shipped pass built *"one hidden global pool that fills from how surrounded I am."* Those are different games, and the gap produced all four complaints. Worse, the danger-priced pool has a real design flaw: it fills fastest when you're swarmed, and arming (losing fire) makes you *more* swarmed, so the optimal line is a near-death spiral — while a well-positioned player who stays safe **can never charge a drop at all**. A toy that is available only when you are dying rewards the wrong behavior and reads as random. The fix re-anchors charge onto the thing the hands are on (the armed voices) and rebuilds the drop out of the player's own track.

### The charge economy (replaces the danger-priced tension pool)

Charge is now **per-armed-voice**, not one global pool.

- **Arming charges the voice.** While a voice is armed (pulled back, silent), it banks its own charge `0..1`. Each armed voice charges at a slow **base rate** (`chargeBaseRate`, charge/s) so that a careful, well-positioned player can *always eventually* load a drop — the toy is never locked out.
- **Danger multiplies the rate, it is not the source.** A live danger read (`danger01` = enemies inside `pressureRadius` weighted by closeness, plus kill streak) multiplies the base rate up to `chargeDangerMul` (≈3×) at max danger. So charging under fire is faster and bigger — the "earned by surviving danger" identity is preserved for the marquee drops — but safety no longer zeroes it out. Charging under pressure remains genuinely risky because arming costs fire (Pillar 3, below).
- **The HUD meter is the live SUM of armed charges** = a preview of how big the drop will be. There is no separate mystery pool. `tension01()` becomes that normalized sum (kept as the meter's name-agnostic accessor).
- **Overflow bleeds per voice.** Once a voice tops out (charge = 1) and stays armed, it bleeds at `overflowBleedPerS` (≈15%/s) — spend it or lose it — with the existing detune/wobble reserved as the *overflow* audio cue (distinct from the rising charge hum below).
- **The two gates that keep it earned:** (a) the fire loss during ARM (real DPS you gave up, the tactical cost muted), and (b) overflow decay (you cannot bank forever). Danger is a bonus on top, not the gate.

### ARM / DISARM (number keys 1–8) — winding up, not switching off

- Pressing an owned slot's key **arms** that voice: it leaves the mix **on the next beat** (quantized, with a short filter/reverb ring-out — a musical breakdown, not an instant mid-bar cut that sounds like a glitch), its socket begins filling with its own color, and it starts banking charge and emitting a rising charge tone (see audio).
- Pressing again **disarms**: the voice returns on the next beat, no build, no slam. Banked charge on that voice is **forfeit** (start value; revisit at gate — the bet is the commitment).
- Arming is still the vulnerability: thinner fire is the risk, and it must bite (Pillar 3).

### DROP (Q) — one taught verb

- **Q is the only player-facing commit.** It commits every currently-armed voice into one build → gap → slam, sized by the summed banked charge × combo (`comboBonus` per extra voice, kept). It spends the charge and locks a **short anti-double-tap cooldown** (`fullBandCooldownS` ≈ 2–3s, shown as the meter briefly refusing to refill — per-voice recharge is now the real rate limit, so the old hard 13s is gone).
- **Fizzle unchanged in spirit:** committing below `fizzleBelow` summed charge fizzles for free (weak `fizzleSlamMul` pop, voices pop back, no amplified window, no cooldown) — an unearned drop punishing itself.
- **The P debug drop leaves the player build.** `triggerDebugDrop` stays only behind the debug overlay (KeyO); remove the on-screen "drop (v2)" button and the bare KeyP binding. It made the identical sound as Q while bypassing the economy — the mechanical half of complaint 4.
- **Teach Q in place** (Pillar 2, no producer vocabulary): a pulsing **"DROP [Q]"** prompt lights on the meter when the summed charge clears the fizzle floor and the cooldown is clear; it shows a distinct greyed/"too weak" state below the floor. The player learns the verb, when it's worth firing, and that a fizzle was foreseeable — in one glance.

### The drop is REBUILT from the player's own instruments (fixes complaint 3)

The single biggest change. The old `scheduleDrop` borrowed voices by literal role (`'hat'`, `'snare'`, `'kick'`, `'bass'`) — but the band is organized by **typed slots**, each holding one of three different-sounding members (a Backbeat can be clap/rimshot, a Pulse tom/heartbeat, a Bass reese/pluck). So it pasted foreign timbres on top of the player's own (an ear-level "mistake"), the guaranteed sub wasn't in the run's key, and the gap only stripped the low end so a non-`kick` Pulse never dropped the floor out. Rebuild it by **slot**:

- **The roll** uses the player's owned **Hats-slot and Backbeat-slot** voices (accelerating eighth→sixteenth). Borrow the generic `hat`/`snare` **only** if those slots are empty.
- **The gap** strips the **whole loop** to near-silence (scaled by the existing per-genre `gapDuck`), not just the low end, leaving only the riser — so the floor actually drops out in a busy mix.
- **The one (slam)** re-fires the player's owned **Pulse and Bass** voices with their existing `voice.tune` (in key). A generic **in-key** kick+sub is synthesized **only** when those slots are unowned. So a 2-voice loadout still lands a minimal riser+kick drop; an 8-voice loadout drops entirely in its own timbres with nothing foreign added.
- **The riser is the one allowed foreign voice** (a rising whoosh reads as "a hit is coming", not as an instrument in the kit) — always present. Boost its peak so it survives a busy mix and clearly becomes the last thing standing in the gap.
- **The slam audio scales with the number of voices returning together** — a 6-voice synchronized re-entry sounds categorically fuller/wider/brighter than a 2-voice one, so "open everything at once" is rewarded in the channel that matters most.
- The engine needs the owned-slot map (from `run.ts` `tiers` / `band.ts` `ownerOfSlot`) passed into `scheduleDrop` at drop time.

### Audible + visible charge (fixes complaints 1 & 2 with the same change)

- **Socket = the gauge.** Re-drive the per-socket `--charge` in `hud.ts` `updateHold` from that voice's `charge01`, filling the socket bottom-to-top in the voice's color, ramping the border dim→full, and firing the (currently dead) `.charged` pulse when a voice tops out. Kill the permanently-empty-ring artifact.
- **Diegetic danger read.** Show the danger multiplier as a **pressure aura/ring** around the player (`view.ts`, render-clock only) that heats cool→red as the crowd tightens, plus a small live "×1.9"-style multiplier tag on the meter. This doubles as the positioning read the player already wants. The unspoken sentence: *"closed instruments fill up, and they fill faster when the ring is hot."*
- **Audible charging.** Each armed voice emits a low filtered hum whose brightness/pitch climbs with its `charge01` and whose rate-of-rise tracks `danger01`, so the player HEARS the bet banking and hears it accelerate under pressure. Multiple armed voices give multiple rising tails that converge into the gap (run through the shared build filter, staggered peaks). Reserve the detune/wobble for the overflow zone so *banking* and *overcooking* sound distinct.

### Skill topping in scope: the synchronized full-band drop

The one adopted skill mechanic (behind a config flag, conservative by default). Arming your **last remaining owned voices within a short window** (`syncWindowBeats`, all remaining voices armed within ~2 beats) locks the rack: a shared tether/ring draws across all armed sockets, and the pending drop earns a bonus **beyond** the linear `comboBonus` (`syncBonus`) plus a distinctly bigger build (deeper gap, brighter/wider slam). The skill is picking the moment and surviving a near-fireless gap. Muted, the whole lit-and-tethered rack reads as "you are all-in" and the payoff is a visibly larger shockwave + longer burst window. Keep the DPS loss biting so it never becomes the only line. (Solo long-hold and the perfect-release ring are **parked** — not in this rework.)

### One real correctness bug to fix regardless

The shipped pass captured slam power at COMMIT (`game.ts` `dropAll`) but `landDrop` recomputed it from charge read ~4s later at LAND time, so the visual juice and the actual sim slam diverged (a full-charge commit could land near-floor). **Freeze the sized power at commit and pass it into `landDrop`** so the juice and the sim slam share one number and "a drop spends what it was sized by" holds literally. Also guard the stray `killStreak++` write in `run.ts` behind `this.fx` (keep the bot path clean) and delete the dead v1 config `chargeFullS` / `tensionFull`.

### Config (`config.ts` HOLD block) — reworked

Replace the flat danger-priced `tension` block with a `charge` model:
- Add: `chargeBaseRate` (per-voice charge/s at zero danger — the "always available" floor), `chargeDangerMul` (max rate multiplier at `danger01`=1, ≈3), `perVoiceMax` (1.0).
- Keep for the `danger01` multiplier input: `pressureRadius`, `crowdFull`, `killRateFull`, `killStreakScale`. **Fix the constant hacks** so the knobs mean what they say — the shipped code uses `nearMissBonus*10` as a closeness weight (there is no real near-miss event) and `killStreakScale*2` (which cancels to 1.0 for the shipped 0.5). Rename/repurpose honestly.
- Keep: `overflowBleedPerS` (now per-voice), `fizzleBelow`.
- Change: `fullBandCooldownS` → ≈2–3s (short anti-double-tap floor).
- Add (behind the sync flag): `syncWindowBeats`, `syncBonus`.
- Remove: dead `chargeFullS`, `tensionFull`.

### Build order (each step developer-gateable; matches AGENTS.md sub-phase discipline)

0. **Correctness** (unblocks an honest gate): freeze slam power at commit; guard `killStreak++` behind `this.fx`; delete dead config.
1. **The pivot** (`run.ts`): per-voice charge = `chargeBaseRate` × danger multiplier; per-voice overflow bleed; `tension01()` = normalized sum of armed charges; fix the constant hacks. All writes stay on the fx/player path (determinism unchanged).
2. **Socket = gauge** (`hud.ts`): re-drive `--charge` per socket in the voice color; fire `.charged` at max; meter = summed preview.
3. **Diegetic danger** (`view.ts`): pressure aura + the "×1.9" multiplier tag.
4. **One taught verb** (`game.ts`): pull the P button + bare KeyP from the player build; add the "DROP [Q]" prompt with lit / "too weak" states.
5. **Build from owned voices** (`engine.ts`): resolve roll/gap/slam by slot via `ownerOfSlot`; strip the whole loop in the gap (scaled by `gapDuck`); re-fire owned Pulse/Bass in key; borrow a root-tuned kick+sub only for empty slots; riser always-on + boosted; slam audio scales with voice count.
6. **Audible charge** (`engine.ts`): quantize arm-silence to the next beat with a ring-out; per-armed-voice charge hum bound to `charge01` (rate-of-rise tracks danger), detune-wobble reserved for overflow.
7. **Synchronized full-band** (behind a flag): the sync window + `syncBonus` + bigger build; ship conservative, tune at the gate.

### Gate B (rework) — the developer's ear and hands

Muted first (Pillar 3): does each closed socket read as a capacitor loading; is which-voices-and-how-loaded legible at a glance; is arming a real, dangerous, *authored* decision (not a two-button chore); does the release feel worth mastering? Then sound on: does closing an instrument SOUND like winding it up; does the drop sound like the player's own band crashing back (no foreign clash); does the pressure aura + charge hum make "why is it filling" felt without words; is Q's affordance clear and the fizzle foreseeable? A failed gate loops within the rework.

---

## Gameplay anatomy

> **Superseded by "Sub-phase B rework (v2.1)" above for the charge/ARM/DROP/borrowing rules.** Kept as design history from the first pass (the danger-priced pool). Read the rework section for the current target.

### The tension economy (the gate that stops spam)

Tension is a 0..1 resource shown on the HUD. It replaces v1's clock-fill entirely.

- **Fills from pressure, not time.** The fill rate scales with a live danger read: `danger01` = a blend of nearby enemy count (enemies within a pressure radius of the player), recent near-misses (an enemy passing very close without a hit), and kill streak (kills-per-second). Safe and open = fill near zero. Surrounded = fill at max. Standing still in a clear field never charges a drop.
- **Holding amplifies the fill.** While one or more voices are ARMED, tension fills faster (armed voices are the "bet"; the more you hold under danger, the faster tension banks). This is the loop: arm under pressure, survive the thinned-fire gauntlet, bank tension.
- **Overflow bleeds (no indefinite banking).** Past 100%, tension stops storing and begins to **destabilize the held voice** — its charge bleeds at ~15%/s and the ambient breakdown audibly wavers (a de-tune / wobble on the held voice's tail). You cannot sit at full forever waiting for the perfect moment; a held bet decays if you overcook it.
- **A drop spends tension.** DROP consumes the banked tension to size the payoff. After a full-band drop (Q), a **global cooldown** (12–15s) locks the full-band drop so it reads as a spent resource, not a button you mash.

Why this fixes complaint 2: a drop is now earned by surviving danger, priced by a real resource, and rate-limited by a cooldown. It is never "always a few seconds away."

### ARM (build-up setup) — number keys 1–8

- Each number key toggles the instrument in that band-rack slot (Pulse=1, Backbeat=2, Hats=3, Motion=4, FX=5, Bass=6, Harmony=7, Melody=8 — the eight typed slots from `the-band.md`; a key with no owned instrument does nothing).
- Pressing an owned slot's key **arms** that voice: it goes silent and stops firing immediately (its sound leaves the mix — an instant, audible thinning), the socket desaturates, and it begins contributing to the tension fill. This is v1's `holdRole`, kept.
- Arming is the **vulnerability**: fire is thinner, so armed time under pressure is genuinely dangerous. The DPS loss is the risk and it must bite (Pillar 3 — this is a real tactical cost even muted).
- Pressing the same key again **disarms** without dropping (voice returns on the next beat, no build, no payoff) — an escape valve if you armed by mistake or need the fire back.

### DROP (commit) — the drop verb

- **Q — full-band drop.** Commits every currently-armed voice into one synchronized drop. This is the marquee moment. It spends tension, fires the full build, and is on the 12–15s cooldown.
- A drop with **any** armed voices runs the full build→gap→slam. The payoff is scaled by banked tension × the number of voices dropped (v1's `comboBonus`, kept).
- **Minimum build = 1 bar.** If the player commits with essentially no banked tension and the grid gives less than one bar of build, the drop **fizzles for free**: no riser swell, voices just pop back in, ~25% slam, no amplified-fire window. It sounds cheap on its own — the system punishes an unearned drop rather than rewarding it. This is deliberate: a sub-minimum drop is its own tell.

### How it works from 2 instruments to 8+ (fixes complaint 4)

Subtraction, not addition, so **two elements suffice** to make a drop:

- **The riser is guaranteed present in every build, even if unowned.** During a build the game reclaims the riser voice (`kits.ts renderRiser`) for the build device. If the player owns the riser (the FX auto-dash), it cannot be double-booked mid-build — the build has priority and the auto-dash is suppressed for the build's duration. If the player does not own it, the build borrows it anyway. So the "here it comes" swell is always there.
- **A sub/kick is guaranteed at the one.** The slam always lands a sub-bass hit on the downbeat regardless of what the player owns. A minimal drop is therefore **riser + kick** — which is exactly how minimal tracks actually drop.
- **The gate is tension, not instrument count.** You can drop with 2 owned voices or 8; the gap is a real thinned-fire vulnerability window at any count, so the drop is always a risk you took, never a free nuke handed to a thin build.
- With more voices, the build has more to thin and re-stack, so the contrast is bigger — the mechanic scales up naturally without special cases.

### Juice stack (priority order, all locked to the slam frame)

At detonation (**the one**), in priority order:

1. **Hitstop** (the whole picture freezes for a beat) 80 ms minimum → 120 ms at max (tension × combo). Render-clock only.
2. **Slow-mo ramp** to ~0.4× immediately after hitstop, for 0.2–0.3s, then ramping back to 1× over the next ~0.2s. Render-clock only.
3. **Camera punch + trauma-decay shake**, amplitude scaled by tension × combo (extends v1 `dropSlam` shake, which already scales with power).
4. **~6% zoom-in-then-settle** over ~0.3s.
5. **Fat escalating damage numbers** in the dropped instrument's color (`KIT_COLORS[role]`).
6. **Synchronized radial death wave** — ONE shockwave/ring from the player (v1 `dropSlam` already pushes one `slam` fx + one expanding shock), not independent per-enemy poofs.
7. **Flash bloom + chromatic edge** far past v1's 0.1 alpha (v1 flash alpha `0.1 + 0.14*power`; v2 pushes brighter at high power).

The **pre-punch** (camera zoom-in / brace) fires one beat earlier, at the gap — see the timeline.

---

## Audio anatomy (what the coder schedules and when)

Everything **quantizes to bars**, never to a wall-clock timer. One shared **beat-skeleton** across all six genres — the build, gap, and slam land on identical beat counts. Genre changes only the **texture** on those beats.

### Build devices (fixed 1–2 bars)

Fired the instant the player commits, scheduled forward on the grid:

- **Riser** (`renderRiser`): enters low and swells across the build, its pitch/brightness climbing so the ear (and the hands — see timeline) can tell how much build remains.
- **Filter open:** the surviving loop's low-pass filter opens bar by bar, from muffled to fully bright.
- **Roll:** hats/snare accelerate from eighth-notes to sixteenth-notes, drawing on the tier-4 fill vocabulary already in the charts (the dense `x.xx` / `x.-x` patterns).

Two-bar build shape:
- **Bar 1:** riser low, filter starts opening, roll at half-speed.
- **Bar 2:** riser near peak, filter fully open, roll doubles.

A one-bar build compresses both stages into one bar.

### The gap (last beat, or last half-bar for very fast genres)

- Cut the kick and the bass. Leave only the riser screaming at peak.
- The floor drops out. This is the "brace" — fire is at its thinnest and a telegraphed enemy surge gives the slam a wall to hit.

### The drop (on the one)

- **Sub-bass slam** + **full loop re-entry** on the downbeat.
- **Riser tail cut to hard silence** exactly as the kick lands. That **silence-into-slam** is the whole trick — the ear expects the riser to keep going and instead the beat is just THERE.

### Timing rules

- **Minimum build = 1 bar, always.** It auto-scales with tempo (~2.9s in Lo-Fi, ~1.4s in Drum & Bass).
- **Slow genres default to a 2-bar build, fast genres to 1-bar** (see tuning). Slower tempos need two bars to feel like a climb; fast tempos would drag.
- **Wait cap = one beat** (the tie-break, recommended by the convergence). The build starts immediately on commit and the payoff quantizes to the next downbeat, but the player never stares at "nothing happening" for more than one beat: if the next downbeat is more than ~600 ms out, run a 1-bar build to the following downbeat; if it is imminent, **compress to a half-bar build** so it still lands on the grid. Build length flexes to hit the grid, but a panic-button drop never stalls long enough to get the player killed.
- **A sub-minimum drop fizzles** (see gameplay): no riser swell, voices just pop, ~25% slam, no payoff window.

### Audio never slows down

Hitstop and slow-mo are **picture effects only**. The audio loop keeps running at real tempo through the freeze and the slow-mo, so the beat continues while the picture holds. If the loop were slowed it would detune and desync off the grid.

### Per-genre notes (same skeleton, different texture)

- **Lo-Fi (84 bpm):** soft tape swell, warm re-entry, not an explosion. The gap is a soft **duck** (a gentle volume dip), not a hard cut (see open question on Lo-Fi gap).
- **House (124):** kick cuts for the gap bar; four-on-the-floor (a kick on every beat) plus sidechain slams back in.
- **Synthwave (100):** gated snare (a snare chopped into a rhythmic stutter) plus an arp; a reverb tail bleeds into the gap.
- **Hip-Hop (140, halftime):** the halftime feel (beat felt at half speed) makes the gap feel huge; an 808 (deep sub-bass) booms back on the one.
- **Drum & Bass (174):** a stutter / pitch-up snare into the gap; the reese bass (the growling monster bass) drops out then slams back as sub.
- **Techno (130):** a long minimal filter sweep; the kick punches in on the one.

### Few-instruments handling (audio side)

The riser is guaranteed in every build (reclaimed from the auto-dash, never double-booked mid-build), and a sub/kick is guaranteed at the one. Minimal drop = riser + kick. Subtraction, not addition, so two elements always make a legible drop.

---

## Locked-together timeline

Beat-by-beat, keyed to a **2-bar build in Lo-Fi (84 bpm, 1 bar = 2.86s, 1 beat = 0.71s)** as the worked example. The same skeleton runs in every genre at that genre's bar/beat length.

| Phase | Grid position | Time (Lo-Fi 2-bar) | Audio | Visual / juice | Gameplay |
|---|---|---|---|---|---|
| **Commit** | t = press | 0.00s | Build starts immediately; payoff scheduled to next downbeat (grid-flexed, wait cap ≤ 1 beat) | Held-voice color begins bleeding outward | Player commits (Q). Voices already armed. |
| **Build bar 1** | t−2 bars → t−1 bar | 0.00–2.86s | Riser low; filter starts opening; roll at half-speed | Held color bleeds out; screen edge starts to brighten; a ring begins tightening toward the player | Survive gauntlet with **thinned fire**. No freeze yet — this is the climb. |
| **Build bar 2** | t−1 bar → t−1 beat | 2.86–5.00s | Riser near peak; filter fully open; roll doubles to sixteenths | Edge brightens further; ring tightens; riser pitch tells the hands how long remains to reposition | Still climbing; last chance to reposition. |
| **The gap** | t−1 beat | 5.00–5.71s | **Kick + bass CUT.** Only the riser at peak | **Camera pre-punch / zoom-in fires here.** Floor drops out in both channels | Fire at its thinnest = "brace." Telegraphed enemy surge so the slam has a wall to hit. |
| **The one (detonation)** | t = 0 | 5.71s | **Sub-bass slam + full loop re-entry; riser tail cut to hard silence as the kick lands** | SAME FRAME: hitstop (80–120ms), flash bloom, chromatic edge, trauma shake, one synchronized death wave, camera punch. Audio keeps running through the hitstop | Slam clears space; amplified-fire window opens (dropped voices fire up to 4× for 4s). |
| **Ring-out** | t + first returned bar | 5.71–8.57s | Full loop at **real tempo** (audio never slows) | Slow-mo ramp-out 0.4× → 1×; death wave reads over this bar; zoom settles | Amplified-fire window burns down; horde re-forms. |

Fast genres (DnB 174) run the same table with a **1-bar build** (~1.38s) and a **half-bar gap** (~0.69s, because a single beat at 174 bpm is too short to read).

---

## Pillar 3 (plays well muted)

The entire mechanic lives in the pure simulation, exactly as v1: tension fill, arm/disarm, the build's timing, the gap's thinned-fire window, the slam's damage/knockback, and the amplified-fire window are all real gameplay with the sound off. Muted, this reads as a **chargeable panic-clear you earn by surviving danger**: arm voices to bank tension under pressure (accepting a DPS loss), brace through a vulnerable gap, then release a screen-clearing slam plus a burst window. That is a legible survivors-like tool on its own. The audio drop is the multiplier on top, never the excuse — a muted run must still play as a good survivors-like, and the danger-priced economy plus the real fire-loss during ARM make it one.

The build-up phase adds a genuine **risk/reward decision layer** muted: hold and starve your fire to bank a bomb, or keep firing. That is the mechanic earning its place independent of sound.

---

## Determinism (player-driven, off the replay path)

- The mechanic is **player-driven only**. The autoplay bot never arms and never drops. The world's hold/tension/payoff/build state stays empty on the bot and replay paths, so seeded replays are **bit-identical** to before — no re-baselining needed (matches v1's guarantee and the `dmath.ts` determinism rule).
- **Hitstop and slow-mo are render-clock only.** They must never touch the hashed fixed timestep. The simulation ticks at the fixed 60 Hz regardless of picture freeze; only the renderer holds the frame. If slow-mo or hitstop ever scaled the sim `dt`, seeded replays would desync. This is a hard invariant.
- All new tension inputs (danger read, near-miss, kill streak) are computed from already-deterministic world state, so they do not introduce nondeterminism even though the bot never uses them.

---

## Tuning knobs (config.ts — extends the existing `HOLD` block)

The v1 `HOLD` block stays; v2 adds the fields below. Starting numbers:

```ts
export const HOLD = {
  // ---- v1, kept (the payoff) ----
  payoffS: 4,            // amplified-fire window after a drop (s)
  maxFireMul: 4,         // fire damage multiplier at full power
  slamRadius: 300,       // drop-slam base radius (px) at power 1
  slamDamage: 90,        // drop-slam base damage at power 1
  slamKnockback: 460,
  comboBonus: 0.5,       // extra multiplier per extra voice in a full-band drop

  // ---- v2: tension economy (replaces v1 chargeFullS clock-fill) ----
  tension: {
    // Danger read: tension fills 0 (safe) → 1.0 (surrounded).
    pressureRadius: 260,       // px; enemies inside feed the danger read
    fillAtMaxDanger: 0.55,     // tension/s gained when danger01 = 1 (safe ≈ 0)
    heldFillBonus: 0.35,       // extra tension/s per armed voice under danger
    nearMissBonus: 0.04,       // tension per near-miss event
    killStreakScale: 0.5,      // weight of kills/s in danger01
    // Overflow: past full, no banking — the held voice destabilizes.
    overflowBleedPerS: 0.15,   // charge drained per second past 100%
  },

  // ---- v2: full-band drop is a spent resource ----
  fullBandCooldownS: 13,       // 12–15 window; Q locked this long after a drop

  // ---- v2: the build (grid-locked) ----
  build: {
    minBars: 1,                // minimum build; sub-minimum drops fizzle
    slowGenreBars: 2,          // Lo-Fi, Synthwave default to 2-bar builds
    fastGenreBars: 1,          // Hip-Hop, DnB, House, Techno default to 1-bar
    waitCapMs: 600,            // if next downbeat > this out, run 1 bar to the following one
    compressToHalfBar: true,   // else compress to a half-bar build to hit the grid
    gapBeats: 1,               // gap = last beat...
    gapBeatsFast: 0.5,         // ...or last half-bar for very fast genres (DnB)
    fizzleSlamMul: 0.25,       // sub-minimum drop slam power, no payoff window
  },

  // ---- v2: gap intensity per genre (mandatory gap everywhere, scaled) ----
  gapDuck: {                   // 1.0 = full cut; <1 = a duck, not a cut
    lofi: 0.4, house: 1.0, synthwave: 0.7,
    hiphop: 1.0, dnb: 1.0, techno: 0.85,
  },

  // ---- v2: juice (render-clock only) ----
  juice: {
    hitstopMinMs: 80, hitstopMaxMs: 120,   // scales with tension × combo
    slowMoScale: 0.4, slowMoHoldS: 0.25, slowMoRampS: 0.2,
    zoomIn: 0.06, zoomSettleS: 0.3,
    // shake amplitude reuses v1 dropSlam scaling (5 + 9*k), scaled by tension×combo
    flashAlphaMax: 0.45,                    // far past v1's 0.1
  },
};
```

Numbers are starting points for gate tuning, not final. The no-equalization doctrine applies: the developer's hands decide, batch numbers inform.

---

## Build sub-phases (each ends in a developer gate)

Ordered so the **riskiest feel/sound question is answered first**: does the build→gap→slam actually SOUND and FEEL like a drop? Everything else is plumbing that only matters if that lands.

### Sub-phase A — the drop event itself (the core bet)

Build ONLY the audio+juice of a single drop, triggered crudely (a debug key or the sandbox), on a fixed 2-bar build in ONE genre (House, the clearest four-on-the-floor). Wire: riser swell, filter open, accelerating roll, the one-beat gap (kick+bass cut), the slam (sub-bass + full loop re-entry + riser tail cut to silence on the one). Wire the full juice stack locked to the slam frame (hitstop, slow-mo, shake, flash, zoom, one death wave), all render-clock. Guarantee riser + kick present even with a 2-voice loadout.

**Gate A:** With sound on, does the build→gap→slam land as "that's a drop!" in both channels on the same frame? Does the silence-into-slam trick work? Does the freeze/flash feel like it landed hard? This is the central bet — if it does not feel like a drop here, the mechanic is wrong and we stop. Judge in the sandbox at 2 voices and at 8 voices.

### Sub-phase B — ARM + the tension economy

Add the two-phase action on top of a passing A: number keys 1–8 arm/disarm owned slots (voice thins instantly), the danger-priced tension fill, the held-fill bonus, overflow bleed/destabilize, Q as the committing full-band drop with its cooldown, and the minimum-build fizzle. HUD: tension meter + per-socket armed state.

**Gate B:** Muted first (Pillar 3) — is arming a real, dangerous decision, and is the earned drop satisfying to release with the sound off? Then sound on — does tension feel earned (not cheap), does the fizzle correctly punish an unearned drop, does the cooldown make Q feel like a spent resource?

### Sub-phase C — all six genres + grid-flex + gap scaling

Port the one-genre build to the shared beat-skeleton across all six genres (texture per genre, identical beat counts), implement the wait cap / grid-flex (1-bar vs 2-bar defaults, half-bar compression, ≤1-beat wait), and the per-genre gap intensity (mandatory gap everywhere, Lo-Fi as a soft duck). Reclaim/never-double-book the riser for owned-FX players.

**Gate C:** Does each genre's drop sound like itself and good (Lo-Fi warm, DnB violent, House pumping)? Does a panic-drop with an imminent downbeat still land cleanly (grid-flex)? Does the Lo-Fi duck read as a drop without a hard cut?

### Sub-phase D — balance + across-the-run pass

Bot floor-checks (mechanic off the bot path, so this is about the rest of the game staying balanced with the new fire-loss during ARM and the slam damage), slam-damage scaling against the late-game 16× enemy-HP curve, and a full 8-minute play pass early-to-late.

**Gate D:** Across a full run, does the game "sound like a natural flow of music" (builds and drops punctuating the monotonic add-ramp)? Does the mechanic stay meaningful from minute 1 (2 voices) to minute 8 (8 voices)? Is the slam still proportional late-game?

---

## Verdict protocol (pass/fail defined in advance)

Run after Sub-phase D passes its gate. The developer is the sole judge (per AGENTS.md). Defined now so the outcome is not argued after the fact.

**PASS** requires all four, by the developer's ear and hands:

1. **It sounds like a drop.** With sound on, the build→gap→slam reads unmistakably as a musical drop — the silence-into-slam trick works and the developer says "that's a drop!" unprompted.
2. **It feels like it landed hard.** The juice stack on the one (freeze → flash → wave) makes the release satisfying in the hands.
3. **It is earned, not cheap.** Tension is priced by danger and the full-band drop is a spent resource; the developer cannot spam drop-worthy tension while safe, and an unearned drop fizzles.
4. **It works across the whole run.** The mechanic is meaningful with 2 voices early and 8+ voices late, and a full playthrough breathes (builds/drops) instead of being a flat add-ramp — while a **muted run still plays as a good survivors-like** (Pillar 3).

**FAIL** is any one of:

- The drop does not read as a drop (the core audio contrast fails) → rework loops in Sub-phase A.
- The release feels flat / the juice does not sell the landing → Sub-phase A.
- Tension is still cheap or spammable, or the fizzle/cooldown do not bite → Sub-phase B.
- A genre's drop sounds wrong or the grid-flex/gap breaks the rhythm → Sub-phase C.
- The mechanic is dead at 2 voices, or breaks late-game balance, or the muted run degrades → Sub-phase D.

A failed gate loops **within its own sub-phase**, never pushes the problem downstream (AGENTS.md).

---

## Open questions / parked decisions

Locked by the convergence, recorded so they are not re-litigated in code:

- **Wait cap = one beat** (compress to a half-bar build if the downbeat is imminent), NOT up-to-2-bars. Rationale: a panic button that stalls 5.7s in Lo-Fi gets someone killed; a half-bar build still lands on the grid. This is the tie-break — implement the one-beat cap.
- **Gap is mandatory in every genre, scaled by intensity.** Lo-Fi is a soft duck (`gapDuck.lofi ≈ 0.4`), not a full cut. The gap cannot be dropped entirely in any genre without breaking the one-rhythm-across-genres rule, because it is the shared gameplay vulnerability window. **Open sub-question for gate C:** is `0.4` the right Lo-Fi duck depth, or does Lo-Fi want an even gentler duck? Developer's ear at gate C.

Open decisions for the B rework (v2.1), tuned by the developer's hands at gate B:

- **Base charge rate (`chargeBaseRate`).** How slow should a fully-safe player charge? Slow enough that arming-and-running is a real vulnerable commitment; fast enough that the toy never feels absent. This number decides whether the "always available" floor feels earned or free.
- **Danger-multiplier ceiling (`chargeDangerMul`, ≈3×).** Too high re-creates the "reward recklessness" spiral; too low and charging-under-fire feels no different from safe.
- **Full-band cooldown.** Locked to a short ~2–3s anti-double-tap floor (down from 13s) — but confirm the exact value feels like a beat, not a lockout.
- **Disarm refund vs forfeit.** Now a per-voice question. Start: forfeit. Revisit at gate B.
- **Sync-bonus ceiling (`syncBonus`).** Must not make the synchronized full-band drop the only viable line — keep the fire loss biting. Tune live.
- **Lo-Fi gap depth under a WHOLE-loop strip.** `gapDuck.lofi = 0.4` was tuned for a low-end-only cut; a whole-loop strip at 0.4 may read differently. Confirm at the (now-earlier) audio gate.

Genuinely open / parked to gate tuning:

- **Slam damage vs. the 16× late-game enemy-HP curve.** Carried from v1: should the slam scale with the dropped instrument's own DPS so it stays proportional across the run, or stay a fixed breathing-room tool? Decide at Sub-phase D.
- **Skill toppings parked from the B rework:** solo long-hold (hold one voice to a gold "max" → a concentrated single-voice slam) and the perfect-release timing ring. Both were designed in the three-expert review but cut from this rework's scope; reconsider after the base loop passes gate B.
- **A small live benefit while under tension** (a nudge to move speed or pickup range during ARM) — does it make holding feel better moment-to-moment, or muddy the risk? v1 parked this; still open. Try at gate B if arming feels purely punitive.
- **Exact HUD treatment** of tension, per-socket armed state, and the "brace" telegraph — developer's call at gate time (Pillar 2: no producer vocabulary on screen, ever).
- **Whether disarm (tap-off without dropping) should refund any banked tension** or forfeit it. Start: forfeit (arming is a commitment). Revisit at gate B.
- **Interaction with the owned-riser auto-dash:** the build reclaims the riser and suppresses the auto-dash for the build's duration. Confirm this suppression feels fair to a player who picked the FX auto-dash (gate C).
