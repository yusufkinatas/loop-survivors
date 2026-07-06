// The hype layer: a live, rhythm-driven energy fader the player rides to shape
// the run's dynamic arc.
//
// The problem it solves: a build only ever ADDS instruments, so the track's
// energy is a monotonic ramp — it never breathes. Real tracks rise and fall:
// breakdowns, builds, drops, quiet passages. Hype gives the player one
// expressive, gamified control over that shape WITHOUT changing the build.
//
// How it plays (plain words, no music theory — Pillar 2):
//  - A CROWD meter that constantly drains toward a low resting groove.
//  - Tap SPACE in time with the beat to pump it up. Dead-on taps pump hard and
//    build a streak; sloppy taps barely register.
//  - As the meter climbs, the band assembles from the top down — the snap, the
//    ticks, the color, then the hook and FX layer in — and the whole mix opens
//    up (a filter sweep). Let it fall and the track strips back to just the
//    beat and the low end: an instant breakdown.
//  - Riding it high is a risk/reward dial: more damage dealt and more XP, but
//    you take more damage. Chilling low is safe but quiet and weak.
//
// The gate is coupled to Model A for free: a gated voice fires no trigger, so
// it makes no sound AND deals no damage. Muting the hook silences it in the mix
// and drops its damage in the same instant — the player literally hears and
// feels their firepower breathe with the music.
//
// All state lives here + in game.ts (needs the audio clock and the keyboard).
// The world only reads three neutral-by-default multipliers, so the headless
// bot and seeded replays — which never pump — are untouched.

import type { MusicEngine } from '../audio/engine';
import type { Role } from '../audio/kits';
import type { RunWorld } from './run';
import { slotOf, type Slot } from './band';

/** How much hype each band position needs before it un-gates. Pulse (the beat)
 *  and Bass (the low end) are the always-on floor: a breakdown is kick + bass,
 *  never silence. The rest layer in as the crowd heats up, top-down. */
const SLOT_ENERGY_RANK: Record<Slot, number> = {
  pulse: 0,
  bass: 0,
  backbeat: 1,
  hats: 2,
  motion: 3,
  harmony: 3,
  fx: 4,
  melody: 4,
};

/** Hype needed to reach each rank, with hysteresis (up to enter, down to
 *  leave) so a layer sitting on a threshold doesn't stutter on/off. Index r-1
 *  is the boundary between rank r-1 and rank r. */
const RANK_UP = [0.22, 0.42, 0.62, 0.8];
const RANK_DOWN = [0.15, 0.34, 0.54, 0.72];
const MAX_RANK = 4;

/** The meter drains toward this resting groove and never below it (the track
 *  always keeps its beat + low end), and empties from full at this rate. */
const HYPE_FLOOR = 0.12;
const DRAIN_PER_S = 0.17;

/** Rhythm scoring: seconds of slop allowed for a perfect / good tap, and the
 *  hype each grants. Off-beat taps still nudge (never punishing to a beginner)
 *  but break the streak. */
const PERFECT_S = 0.075;
const GOOD_S = 0.16;
const GAIN_PERFECT = 0.26;
const GAIN_GOOD = 0.15;
const GAIN_OFF = 0.04;
/** Each on-beat tap in a row adds this to a gain multiplier, capped. Rewards
 *  locking into the groove: a long clean streak climbs faster. */
const STREAK_STEP = 0.04;
const STREAK_CAP = 8;
/** Streak resets if you go this long without a good tap (you fell off). */
const STREAK_TIMEOUT_S = 2.2;

/** Consequence maps (all neutral at hype 0). */
const DMG_OUT_AT_PEAK = 0.5; // +50% damage dealt at full hype
const XP_AT_PEAK = 0.6; // +60% XP at full hype
const DMG_TAKEN_AT_PEAK = 0.55; // +55% damage taken at full hype

/** Tone filter cutoff (Hz) mapped from hype, exponential so the low end always
 *  reads and the top opens dramatically. */
const CUTOFF_MIN = 500;
const CUTOFF_MAX = 20000;

const ZONE_NAMES = ['CHILL', 'BUILD', 'GROOVE', 'PUSH', 'PEAK'];

type TapQuality = 'perfect' | 'good' | 'off';

export class HypeController {
  hype = HYPE_FLOOR;
  openRank = 0;
  streak = 0;
  private sinceGoodTap = 999;

  // DOM
  private panel!: HTMLElement;
  private fill!: HTMLElement;
  private zoneEl!: HTMLElement;
  private statEl!: HTMLElement;
  private streakEl!: HTMLElement;
  private blip!: HTMLElement;
  private feedbackEl!: HTMLElement;
  private feedbackT = 0;

  /** Fired when the crowd first hits full peak (openRank climbs to MAX_RANK):
   *  the game answers with a screen flash and a HUD pulse — the payoff of a
   *  build. */
  onPeak: (() => void) | null = null;

  mount(root: HTMLElement): void {
    const panel = document.createElement('div');
    panel.className = 'hype-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="hype-head">
        <span class="hype-zone">CHILL</span>
        <span class="hype-streak"></span>
        <span class="hype-stat"></span>
      </div>
      <div class="hype-bar">
        <div class="hype-fill"></div>
        <i class="hype-tick" style="left:22%"></i>
        <i class="hype-tick" style="left:42%"></i>
        <i class="hype-tick" style="left:62%"></i>
        <i class="hype-tick" style="left:80%"></i>
        <div class="hype-blip"></div>
      </div>
      <div class="hype-hint">SPACE on the beat — build the crowd</div>
      <div class="hype-feedback"></div>`;
    root.appendChild(panel);
    this.panel = panel;
    this.fill = panel.querySelector('.hype-fill') as HTMLElement;
    this.zoneEl = panel.querySelector('.hype-zone') as HTMLElement;
    this.statEl = panel.querySelector('.hype-stat') as HTMLElement;
    this.streakEl = panel.querySelector('.hype-streak') as HTMLElement;
    this.blip = panel.querySelector('.hype-blip') as HTMLElement;
    this.feedbackEl = panel.querySelector('.hype-feedback') as HTMLElement;
  }

  show(on: boolean): void {
    this.panel.style.display = on ? '' : 'none';
  }

  reset(): void {
    this.hype = HYPE_FLOOR;
    this.openRank = 0;
    this.streak = 0;
    this.sinceGoodTap = 999;
    this.feedbackT = 0;
  }

  /** A SPACE press: score it against the live beat grid and pump. */
  pump(engine: MusicEngine): void {
    const err = engine.beatError();
    let quality: TapQuality;
    let gain: number;
    if (err <= PERFECT_S) {
      quality = 'perfect';
      gain = GAIN_PERFECT;
    } else if (err <= GOOD_S) {
      quality = 'good';
      gain = GAIN_GOOD;
    } else {
      quality = 'off';
      gain = GAIN_OFF;
    }
    if (quality === 'off') {
      this.streak = 0;
    } else {
      this.streak = Math.min(STREAK_CAP, this.streak + 1);
      this.sinceGoodTap = 0;
    }
    gain *= 1 + this.streak * STREAK_STEP;
    this.hype = Math.min(1, this.hype + gain);
    this.flashFeedback(quality);
  }

  private flashFeedback(quality: TapQuality): void {
    const label = quality === 'perfect' ? 'PERFECT' : quality === 'good' ? 'nice' : 'off-beat';
    this.feedbackEl.textContent = label;
    this.feedbackEl.className = `hype-feedback ${quality} show`;
    this.feedbackT = 0.5;
  }

  /** One frame: drain, recompute which layers are open, drive the audio and
   *  the world, and repaint. Called every frame of a live run/sandbox. */
  tick(dt: number, engine: MusicEngine, world: RunWorld, tiers: ReadonlyMap<Role, number>): void {
    // Drain toward the resting groove.
    if (this.hype > HYPE_FLOOR) this.hype = Math.max(HYPE_FLOOR, this.hype - DRAIN_PER_S * dt);
    this.sinceGoodTap += dt;
    if (this.sinceGoodTap > STREAK_TIMEOUT_S) this.streak = 0;

    // Recompute the open rank with hysteresis.
    const prevRank = this.openRank;
    while (this.openRank < MAX_RANK && this.hype >= RANK_UP[this.openRank]) this.openRank++;
    while (this.openRank > 0 && this.hype < RANK_DOWN[this.openRank - 1]) this.openRank--;
    if (this.openRank === MAX_RANK && prevRank < MAX_RANK) this.onPeak?.();

    // Drive the world's risk/reward multipliers.
    world.hypeDamageMul = 1 + DMG_OUT_AT_PEAK * this.hype;
    world.hypeXpMul = 1 + XP_AT_PEAK * this.hype;
    world.hypeDamageTakenMul = 1 + DMG_TAKEN_AT_PEAK * this.hype;

    // Open the master tone filter with the energy.
    engine.setToneCutoff(CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, this.hype));

    this.applyGating(engine, tiers);
    this.paint(dt, engine);
  }

  /** Gate every owned voice by its slot's energy rank against the open rank,
   *  but always keep the lowest-rank owned voice(s) sounding so the player is
   *  never left with zero firepower (a lead-only opener still fires). */
  private applyGating(engine: MusicEngine, tiers: ReadonlyMap<Role, number>): void {
    let minRank = MAX_RANK;
    for (const role of tiers.keys()) minRank = Math.min(minRank, SLOT_ENERGY_RANK[slotOf(role)]);
    for (const role of tiers.keys()) {
      const rank = SLOT_ENERGY_RANK[slotOf(role)];
      const gated = rank > this.openRank && rank > minRank;
      engine.setVoiceGated(role, gated);
    }
  }

  private paint(dt: number, engine: MusicEngine): void {
    this.fill.style.width = `${this.hype * 100}%`;
    this.zoneEl.textContent = ZONE_NAMES[this.openRank];
    this.zoneEl.dataset.rank = String(this.openRank);
    this.statEl.textContent = `+${Math.round(DMG_OUT_AT_PEAK * this.hype * 100)}% dmg`;
    this.streakEl.textContent = this.streak >= 2 ? `x${this.streak}` : '';
    // Beat blip: a dot that pulses brightest right on the beat.
    const phase = engine.beatPhase();
    const closeness = Math.max(0, 1 - Math.min(phase, 1 - phase) * 6);
    this.blip.style.opacity = String(0.25 + 0.75 * closeness);
    this.blip.style.transform = `scale(${0.8 + 0.7 * closeness})`;
    if (this.feedbackT > 0) {
      this.feedbackT -= dt;
      if (this.feedbackT <= 0) this.feedbackEl.classList.remove('show');
    }
  }
}
