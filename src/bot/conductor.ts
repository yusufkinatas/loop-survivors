// The virtual clock (docs/tools/autoplay-bot.md): what the music engine's
// Web Audio clock does for the real game, this does for bot runs — steps the
// same charts through the same chartEventsAtStep and fires the same triggers
// into the same world, on a simulated timeline with no audio and no real
// time. Pick entry keeps the game's musical rule: chosen at level-up,
// applied at the next bar boundary.
//
// Both the headless simulator and the browser replay drive runs through this
// class with a fixed 60 Hz dt, which is why a replay is tick-identical to
// the batch run that produced it.

import { chartEventsAtStep } from '../audio/arranger';
import { complexityCap, getComplexityChart } from '../audio/complexity';
import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { rollOffers, type PickOption } from '../game/picks';
import { allocatedComplexity, allocatedPower } from '../game/progression';
import type { Rng } from '../game/rng';
import type { RunWorld } from '../game/run';

export type PickChooser = (options: PickOption[], world: RunWorld, rng: Rng) => PickOption;

export interface ConductorHooks {
  /** A pick was chosen (it lands at the next bar). */
  onPick?(option: PickOption): void;
  /** A pick landed (next-bar entry). Replay mirrors sound here. */
  onApply?(option: PickOption): void;
  /** Pool exhausted: the heal fallback fired. */
  onHeal?(): void;
}

export const SIM_DT = 1 / 60;

export class VirtualConductor {
  /** The build as it unfolded: every pick with the time it was chosen. */
  readonly picks: { t: number; role: Role; complexity: number; power: number }[] = [];

  private world: RunWorld;
  private choose: PickChooser;
  private rng: Rng;
  private hooks: ConductorHooks;

  private musicT = 0;
  private nextStepT = 0;
  private step = 0;
  private pending: PickOption[] = [];

  constructor(world: RunWorld, choose: PickChooser, rng: Rng, hooks: ConductorHooks = {}) {
    this.world = world;
    this.choose = choose;
    this.rng = rng;
    this.hooks = hooks;
  }

  /** The starting instrument enters immediately, like the game's startRun. */
  start(role: Role): void {
    const complexity = Math.min(16, complexityCap(role));
    this.world.addWeapon(role, 1, complexity);
    this.picks.push({ t: 0, role, complexity, power: 1 });
    this.hooks.onApply?.({ kind: 'arsenal', role });
  }

  /** Wire this to RunEvents.onLevelUp. Rolls the real three-card offer and
   *  lets the policy choose; the choice lands at the next bar. */
  onLevelUp(): void {
    this.world.grantLevelRewards();
    const options = rollOffers(this.world.weapons, this.world.lifetimePower, this.rng, this.world.timeS);
    if (options.length > 0) {
      const option = this.choose(options, this.world, this.rng);
      this.world.addWeapon(option.role);
      this.pending.push(option);
      this.hooks.onPick?.(option);
    }
    this.autoAllocate();
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

  private autoAllocate(): void {
    const roles = [...this.world.weapons.keys()];
    while (allocatedPower(this.world.weapons) < this.world.powerBudget) {
      const eligible = roles.filter((r) => this.world.weapons.get(r)!.power < 5);
      if (eligible.length === 0) break;
      this.world.weapons.get(eligible[Math.floor(this.rng() * eligible.length)])!.power += 1;
    }
    while (allocatedComplexity(this.world.weapons) < this.world.complexityBudget) {
      const eligible = roles.filter((r) => this.world.weapons.get(r)!.complexity < complexityCap(r));
      if (eligible.length === 0) break;
      this.world.weapons.get(eligible[Math.floor(this.rng() * eligible.length)])!.complexity += 1;
    }
    for (const state of this.world.weapons.values()) {
      state.active = state.power > 0 && state.complexity > 0;
    }
  }

  private onStep(step: number, time: number): void {
    const phraseStep = step % STEPS_PER_PHRASE;
    // bar boundary: queued picks land, exactly like engine.atNextBar
    if (phraseStep % STEPS_PER_BAR === 0 && this.pending.length > 0) {
      const queue = this.pending;
      this.pending = [];
      for (const option of queue) {
        this.hooks.onApply?.(option);
        const state = this.world.weapons.get(option.role)!;
        this.picks.push({ t: this.world.timeS, role: option.role, complexity: state.complexity, power: state.power });
      }
    }
    for (const [role, state] of this.world.weapons) {
      if (!state.active || state.power === 0 || state.complexity === 0) continue;
      for (const ev of chartEventsAtStep(getComplexityChart(role, state.complexity), phraseStep)) {
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
