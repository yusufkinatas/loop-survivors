// The virtual music clock used by headless runs and browser replays. It plays
// the same charts and weapon-only offers as the Web Audio engine, with chosen
// tiers entering on the next bar boundary.

import { chartEventsAtStep } from '../audio/arranger';
import { getChart } from '../audio/chartstore';
import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { rollOffers, type PickOption } from '../game/picks';
import type { Rng } from '../game/rng';
import type { RunWorld } from '../game/run';

export type PickChooser = (options: PickOption[], world: RunWorld, rng: Rng) => PickOption;

export interface ConductorHooks {
  onPick?(option: PickOption): void;
  onApply?(option: PickOption): void;
  onHeal?(): void;
}

export const SIM_DT = 1 / 60;

export class VirtualConductor {
  readonly picks: { t: number; role: Role; tier: number }[] = [];

  private musicT = 0;
  private nextStepT = 0;
  private step = 0;
  private pending: PickOption[] = [];

  constructor(
    private world: RunWorld,
    private choose: PickChooser,
    private rng: Rng,
    private hooks: ConductorHooks = {},
  ) {}

  start(role: Role): void {
    this.world.addWeapon(role, 1);
    const option = { role, tier: 1 };
    this.picks.push({ t: 0, ...option });
    this.hooks.onApply?.(option);
  }

  onLevelUp(): void {
    const options = rollOffers(this.effectiveTiers(), this.rng, this.world.timeS);
    if (options.length === 0) {
      this.hooks.onHeal?.();
      return;
    }
    const option = this.choose(options, this.world, this.rng);
    this.pending.push(option);
    this.picks.push({ t: this.world.timeS, role: option.role, tier: option.tier });
    this.hooks.onPick?.(option);
  }

  tick(dt: number): void {
    this.musicT += dt;
    const stepDur = 60 / SOUNDSET.bpm / SKELETON.stepsPerBeat;
    while (this.nextStepT <= this.musicT) {
      this.onStep(this.step, this.nextStepT);
      this.nextStepT += stepDur;
      this.step += 1;
    }
  }

  private effectiveTiers(): Map<Role, number> {
    const tiers = new Map(this.world.tiers);
    for (const option of this.pending) tiers.set(option.role, option.tier);
    return tiers;
  }

  private onStep(step: number, time: number): void {
    const phraseStep = step % STEPS_PER_PHRASE;
    if (phraseStep % STEPS_PER_BAR === 0 && this.pending.length > 0) {
      const queue = this.pending;
      this.pending = [];
      for (const option of queue) {
        this.world.addWeapon(option.role, option.tier);
        this.hooks.onApply?.(option);
      }
    }
    for (const [role, tier] of this.world.tiers) {
      for (const ev of chartEventsAtStep(getChart(role, tier), phraseStep)) {
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
