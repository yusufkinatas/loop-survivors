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
import { getChart } from '../audio/chartstore';
import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';
import type { EffectId } from '../audio/voicefx';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import { RUN } from '../game/config';
import type { ItemId } from '../game/items';
import { rollOffers, type PickOption } from '../game/picks';
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
  readonly picks: { t: number; role: Role; tier: number }[] = [];

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
    this.world.addWeapon(role, 1);
    this.picks.push({ t: 0, role, tier: 1 });
    this.hooks.onApply?.({ kind: 'weapon', role, tier: 1 });
  }

  /** Wire this to RunEvents.onLevelUp. Rolls the real three-card offer and
   *  lets the policy choose; the choice lands at the next bar. */
  onLevelUp(): void {
    const options = rollOffers(
      this.effectiveTiers(),
      this.effectiveItems(),
      this.effectiveEffects(),
      this.rng,
      this.world.timeS,
    );
    if (options.length === 0) {
      this.world.player.hp = Math.min(RUN.playerHp, this.world.player.hp + 15);
      this.hooks.onHeal?.();
      return;
    }
    const option = this.choose(options, this.world, this.rng);
    this.pending.push(option);
    // The build log stays weapon-shaped (attribution report); item/effect
    // picks aren't logged there.
    if (option.kind === 'weapon')
      this.picks.push({ t: this.world.timeS, role: option.role, tier: option.tier });
    this.hooks.onPick?.(option);
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

  /** Owned tiers plus picks still waiting for their bar: the pool must not
   *  offer what is already on its way in. */
  private effectiveTiers(): Map<Role, number> {
    const tiers = new Map(this.world.tiers);
    for (const p of this.pending) if (p.kind === 'weapon') tiers.set(p.role, p.tier);
    return tiers;
  }

  /** Owned items plus item picks still waiting for their bar. */
  private effectiveItems(): Map<ItemId, number> {
    const items = new Map(this.world.items);
    for (const p of this.pending) if (p.kind === 'item') items.set(p.item, p.level);
    return items;
  }

  /** Owned effects plus effect picks still waiting for their bar. */
  private effectiveEffects(): Map<Role, EffectId> {
    const effects = new Map(this.world.effects);
    for (const p of this.pending) if (p.kind === 'effect') effects.set(p.role, p.effect);
    return effects;
  }

  private onStep(step: number, time: number): void {
    const phraseStep = step % STEPS_PER_PHRASE;
    // bar boundary: queued picks land, exactly like engine.atNextBar
    if (phraseStep % STEPS_PER_BAR === 0 && this.pending.length > 0) {
      const queue = this.pending;
      this.pending = [];
      for (const option of queue) {
        if (option.kind === 'weapon') this.world.addWeapon(option.role, option.tier);
        else if (option.kind === 'item') this.world.addItem(option.item, option.level);
        else this.world.attachEffect(option.role, option.effect);
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
