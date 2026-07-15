# Instrument Activate / Deactivate Spec

Feature spec. Locked July 15, 2026, after a grilling session. Parent plan: `docs/plan.md`. Not a milestone phase; a self-contained dev-tool change on the scale of the global `timeScale` tool.

Turns the developer number-key toggles into a true **activate / deactivate**, quantized to the next heard bar. This replaces today's instant, audio-only mute (`setVoiceGain(role, 0)`), which silenced a voice while it kept dealing damage.

## Scope

- **Trigger, unchanged surface.** Keys `Digit1`–`Digit7` map to the seven band slots in rack order; the key acts on the instrument owning that slot. An empty slot does nothing. This stays a developer-only keyboard tool, never a player-facing control.
- **What it does now.** The toggle flips the owning voice's `enabled` flag via `engine.setVoiceEnabled`, scheduled through `engine.atNextBar`. Because a live run's damage rides the audio engine's triggers (`addTriggerListener` → `world.fireTrigger`) and a disabled voice generates no notes (`engine.ts` scheduler `if (!voice.enabled) continue`), the sound and the damage stop together at the next heard bar, and return together on reactivation. `run.ts` and the deterministic sim graph are untouched.
- **Timing.** The effect lands exactly on the next heard bar (the existing `atNextBar` seam). Projectiles, zones, and orbiters already alive when the change lands play out their normal (bounded) lifetime; only new triggers stop. In-flight effects are never force-killed.
- **Pending UI (the change is honest about the wait).** The moment a key is pressed, the rack shows a **pulse** on that slot until the bar lands, then snaps to the settled look. A pending *deactivate* (voice currently on) pulses down from full; a pending *reactivate* (voice currently off) pulses up from the dim. Settled-off is the existing dim. Shown on all three surfaces that already reflect the off-state: the HUD band rack, the pause menu's copy of that rack, and the track overlay (hotkey C).
- **Double-tap.** Each press flips the *target* state and updates the pulse immediately, so the rack always shows where the change is heading. Whatever the target is when the bar lands is what applies. Pressing back to the already-settled state before the bar clears the pending and nothing changes at the bar (a round-trip self-cancels).
- **Sticky across tier-ups.** A deactivated instrument still owns its build slot, so its tier-up can still be offered and picked. Applying that tier-up sets the new tier but leaves the voice deactivated (the level-up entry enables a voice only if it is not in the deactivated set). It returns at the higher tier when reactivated.
- **Run + sandbox only.** Dropped from replay: a replay is deterministic re-simulation driven by the `VirtualConductor` reading `world.tiers`, where `setVoiceEnabled` could only silence audio, never stop damage — so the button would lie. Sandbox keeps it (its live trigger listener makes deactivation real there).
- **Vocabulary.** The track overlay's `m` mark becomes `off`. Internals are renamed off the mute concept: `mutedRoles` → `deactivatedRoles`, plus a new `pendingRoles`; `toggleRoleMute` → the activate/deactivate toggle; the CSS `.muted` class; and the "audio-muted" comments.
- **Housekeeping.** A new run / sandbox clears all deactivations and any pending changes (and the shared `clearBarQueue` drops the queued callbacks). A queued change guards against the run having ended or the world having swapped, the same pattern the level-up entry uses.

## Build sub-phases, each gated by the developer

- **Sub-phase A, the mechanic.** The toggle becomes activate/deactivate via `setVoiceEnabled` on the next bar, gated to run + sandbox, sticky across tier-ups, with the double-tap and housekeeping rules. No new visuals yet beyond reusing the existing dim. Gate: on `npm run dev`, pressing a live instrument's key makes it go silent **and** stop dealing damage on the next bar (not instantly), and pressing again brings both back on the next bar.
- **Sub-phase B, the pending pulse.** The scheduled-but-not-landed state renders as a pulse on all three surfaces, pulsing the correct direction, settling on the bar; the `m` mark becomes `off`. Gate: the developer sees the pulse read clearly as "about to change," and its stopping reads as "it happened now."

A failed gate loops within its sub-phase. Between gates, the developer is brought only taste decisions (the pulse's feel), never plumbing.

## Verdict protocol

The developer drives it on `npm run dev`. **Pass** = deactivation is quantized to the bar (never instant), a deactivated instrument is verifiably silent and dealing no damage, reactivation restores both on the bar, double-tap nets out, a deactivated instrument stays off through a tier-up, and the pending pulse reads clearly. **Fail** = any of: an instant (non-quantized) effect, damage continuing while shown off, a replay desync, or a confusing pending state. Engineering gate alongside: `tsc --noEmit` + `vite build` clean, and a headless bot batch byte-identical to before (proving the sim graph is untouched). The outcome is recorded in `docs/STATUS.md`.
