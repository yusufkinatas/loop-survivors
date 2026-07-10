// The virtual clock (docs/tools/autoplay-bot.md): what the music engine's
// Web Audio clock does for the real game, this does for bot runs — steps the
// same charts through the same chartEventsAtStep and fires the same triggers
// into the same world, on a simulated timeline with no audio and no real
// time. Entry keeps the game's musical rule: hires chosen at level-up and
// allocation changes both land at the next bar boundary.
//
// Both the headless simulator and the browser replay drive runs through this
// class with a fixed 60 Hz dt, which is why a replay is tick-identical to
// the batch run that produced it.
//
// The mixer (branch mixer-system): a level-up grants points (or a hire on
// milestone levels); the policy owns WHERE the points go and how the build
// rotates its hot patterns. The conductor asks the policy for a fresh
// allocation whenever the build changed or a phrase rolled over, and applies
// it at the next bar, exactly like the player's mixer panel.

import { chartEventsAtStep } from '../audio/arranger';
import { getChart } from '../audio/chartstore';
import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { isHireLevel, validateAllocation } from '../game/mixer';
import { rollHireOffers } from '../game/picks';
import type { Rng } from '../game/rng';
import type { RunWorld } from '../game/run';
import type { Policy } from './policies';

export interface ConductorHooks {
  /** A hire was chosen (it lands at the next bar). */
  onHire?(role: Role): void;
  /** A change landed (hire or allocation). Replay mirrors sound here. */
  onApply?(): void;
}

export const SIM_DT = 1 / 60;

export class VirtualConductor {
  /** The build as it unfolded: every hire with the time it was chosen. */
  readonly picks: { t: number; role: Role; tier: number }[] = [];

  private world: RunWorld;
  private policy: Policy;
  private rng: Rng;
  private hooks: ConductorHooks;

  private musicT = 0;
  private nextStepT = 0;
  private step = 0;
  private pendingHire: Role | null = null;
  /** The build changed (points granted / hire landed / phrase rolled): ask
   *  the policy for a fresh allocation at the next bar. */
  private mixDirty = false;

  constructor(world: RunWorld, policy: Policy, rng: Rng, hooks: ConductorHooks = {}) {
    this.world = world;
    this.policy = policy;
    this.rng = rng;
    this.hooks = hooks;
  }

  /** The starting instrument enters immediately, like the game's startRun:
   *  level 1's point pair granted and seeded into the hire at C1/P1. */
  start(role: Role): void {
    this.world.grantLevelPoints();
    this.world.hire(role);
    this.picks.push({ t: 0, role, tier: 1 });
    this.hooks.onApply?.();
  }

  /** Wire this to RunEvents.onLevelUp. Grants the level's points; milestone
   *  levels roll the real hire offer and let the policy choose. Both the hire
   *  and the re-allocation land at the next bar. */
  onLevelUp(): void {
    this.world.grantLevelPoints();
    if (isHireLevel(this.world.level) && this.pendingHire === null) {
      const offers = rollHireOffers(this.world.arsenal, this.rng, this.world.timeS);
      if (offers.length > 0) {
        this.pendingHire = this.policy.chooseHire(offers, this.world, this.rng);
        this.picks.push({ t: this.world.timeS, role: this.pendingHire, tier: 1 });
        this.hooks.onHire?.(this.pendingHire);
      }
    }
    this.mixDirty = true;
  }

  /** Advance the virtual clock by dt and fire every due grid step. Call
   *  once per tick, before world.update. */
  tick(dt: number): void {
    this.musicT += dt;
    const stepDur = 60 / SOUNDSET.bpm / SKELETON.stepsPerBeat;
    while (this.nextStepT <= this.musicT) {
      this.onStep(this.step, this.nextStepT);
      this.nextStepT += stepDur;
      this.step += 1;
    }
  }

  private onStep(step: number, time: number): void {
    const phraseStep = step % STEPS_PER_PHRASE;
    // Bar boundary: queued changes land, exactly like engine.atNextBar. A
    // phrase boundary additionally re-opens the mix (freshness rotation).
    if (phraseStep % STEPS_PER_BAR === 0) {
      if (phraseStep === 0) this.mixDirty = true;
      let changed = false;
      if (this.pendingHire) {
        this.world.hire(this.pendingHire);
        this.pendingHire = null;
        changed = true;
      }
      if (this.mixDirty) {
        this.mixDirty = false;
        const alloc = this.policy.mix(this.world, this.rng);
        if (alloc && validateAllocation(alloc, this.world.totalC, this.world.totalP) === null) {
          this.world.applyAllocation(alloc);
          changed = true;
        }
      }
      if (changed) this.hooks.onApply?.();
    }
    for (const [role, c] of this.world.complexity) {
      for (const ev of chartEventsAtStep(getChart(role, c), phraseStep)) {
        this.world.fireTrigger({
          role,
          time,
          velocity: ev.velocity,
          step: phraseStep,
          variant: ev.variant,
          note: ev.note,
        });
      }
    }
  }
}
