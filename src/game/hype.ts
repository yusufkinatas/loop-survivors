// The Conducted Grid (Hype Layer v2) — the run's live arrangement dynamics.
// Full spec: docs/phases/hype-layer-v2.md.
//
// The problem it solves: a build only ever ADDS instruments, so once the band
// fills, every voice plays on every loop forever and the track never breathes.
// Real tracks rise and fall — grooves, breakdowns, builds, drops. The Conducted
// Grid gives the run a real energy curve WITHOUT a new attention cost, in two
// layers on one bar clock:
//
//  LAYER 1 — the Auto-Arranger (always on, no input, no combat cost). Every
//  8 bars it reads a combat INTENSITY derived from how the fight is going
//  (how swarmed you are, how fast you're killing, whether you just got hit) and
//  moves the arrangement between three nested tiers (Breakdown / Groove / Full).
//  A voice that isn't in the current tier is FILTERED down to a distant whisper
//  — it still fires, still deals damage (Model A holds; a breakdown costs no
//  firepower), only its brightness breathes. Because energy is READ from the
//  fight and only ever changes on a bar, it can't be farmed for a bonus and it
//  always sounds timed. This is v1's fatal "hold the meter at max for +50%
//  damage" lever, deleted.
//
//  LAYER 2 — the Drop (player-committed, the payoff). Playing well charges a
//  Drop meter (faster while you're quiet). One tap ARMS it; on the next bar the
//  band strips to its foundation (real, chosen exposure — fewer voices firing),
//  a riser winds up, then the whole build SLAMS back in at once on a downbeat
//  with a short overdrive window (+damage, +area). The drop lands because the
//  strip before it made the contrast, and you time the slam onto an incoming
//  wave. It's earned and spent, so it can never be "always on".
//
// DETERMINISM: like v1, this whole controller is LIVE-ONLY. It reads world state
// and drives the audio engine + HUD; it is ticked only in the live game loop,
// never in the headless bot or seeded replays. The one sim-visible field it
// touches (world.hypeDamageMul / hypeAreaMul, during a Drop slam) defaults to 1
// and is only moved live, so batch runs and replays stay bit-identical. The
// phrase clock rides the engine's bar-boundary callback (audio-clock derived,
// which is fine because nothing here feeds the deterministic sim).

import type { MusicEngine } from '../audio/engine';
import type { Role } from '../audio/kits';
import { STEPS_PER_BAR } from '../audio/scale';
import type { RunWorld } from './run';
import { slotOf, type Slot } from './band';

// ---- Layer 1: the arrangement tiers -----------------------------------------

/** The tier at which each band slot becomes ACTIVE (fully present). Below its
 *  tier a slot's voice is filtered to a whisper, not silenced. Nested so a
 *  higher tier always contains every lower tier's voices:
 *   Breakdown (0): Beat + Low + Color — the spacious foundation.
 *   Groove   (1): + Snap + Tick + Groove — the pocket, the body of the track.
 *   Full     (2): + Hook + FX — everything, brightest and widest. */
const SLOT_TIER: Record<Slot, number> = {
  pulse: 0,
  bass: 0,
  harmony: 0,
  backbeat: 1,
  hats: 1,
  motion: 1,
  melody: 2,
  fx: 2,
};
const MAX_TIER = 2;

/** Player-facing vibe words per tier (Pillar 2: never keys/BPM/voice names). */
const TIER_NAME = ['CHILL', 'GROOVE', 'PEAK'];

/** Per-voice cutoff (Hz) by how many tiers a voice sits ABOVE the open tier.
 *  0 = in the tier, fully open. Deeper gap = darker, more distant. */
const CUTOFF_OPEN = 20000;
const CUTOFF_BY_GAP = [20000, 1400, 550];
/** Master tone cutoff (Hz) per tier — a gentle overall brightening on top. */
const MASTER_TONE_BY_TIER = [5000, 10000, 20000];

// ---- Intensity (the derived spine) ------------------------------------------

/** Radius (px) around the player counted as "close threat". */
const THREAT_RADIUS = 250;
const THREAT_RADIUS_SQ = THREAT_RADIUS * THREAT_RADIUS;
/** Normalizers: this many close enemies / kills-per-second reads as "1". */
const THREAT_FULL = 14;
const KILLFLUX_FULL = 10;
/** Intensity is a weighted blend of the three inputs, clamped to 0..1. */
const W_THREAT = 0.55;
const W_KILLFLUX = 0.35;
const W_DAMAGE = 0.45;
/** Asymmetric smoothing: intensity rises fairly quickly, falls slowly, so it
 *  moves at musical time (a lull doesn't instantly collapse the arrangement). */
const RISE_TAU = 1.2;
const FALL_TAU = 3.5;
/** "Recent damage taken" spike decays over this time constant. */
const DAMAGE_TAU = 1.6;
/** Kill-flux is itself smoothed before normalizing (kills are bursty). */
const KILLFLUX_TAU = 1.5;

/** Tier thresholds with a hysteresis dead-band so intensity hovering near a
 *  boundary doesn't toggle the arrangement. Index i is the boundary between
 *  tier i and tier i+1. UP to climb, DOWN (lower) to fall back. */
const TIER_UP = [0.32, 0.62];
const TIER_DOWN = [0.18, 0.48];
/** Arrangement tier is only ever RESOLVED on a phrase boundary (every 8 bars),
 *  which is also the minimum dwell — a state can't change more often. */
const PHRASE_BARS = 8;

// ---- Layer 2: the Drop ------------------------------------------------------

/** Seconds of solid engagement to fill the Drop meter from empty. */
const CHARGE_SECONDS = 26;
/** Charge is faster while quiet (the incentive to disengage and breathe), but
 *  only while you're still killing — the meter comes from playing, not parking. */
const QUIET_INTENSITY = 0.3;
const QUIET_CHARGE_MUL = 2;
/** Land no kill for this long and the meter DECAYS, so flatline-fleeing or
 *  parking in an empty corner never earns a Drop (the anti-farm rule). You have
 *  to actually dip in and out. */
const KILL_RECENT_S = 8;
const CHARGE_DECAY_PER_S = 0.6 / CHARGE_SECONDS;

/** The armed Drop's bar sequence: strip → build → slam, quantized to bars so it
 *  lands on the grid at any tempo. Overdrive is live for the slam bars. */
const STRIP_BARS = 1;
const BUILD_BARS = 2;
const SLAM_BARS = 2;
/** The slam overdrive: every weapon hits harder and wider for the slam window
 *  (all voices firing at once — a real spike, not an abstract multiplier). */
const OVERDRIVE_DAMAGE = 1.45;
const OVERDRIVE_AREA = 1.4;
/** Slots that stay firing through the strip (the foundation a breakdown keeps).
 *  Even a hard drop leaves Beat + Low so the player is never at zero firepower. */
const FOUNDATION: ReadonlySet<Slot> = new Set<Slot>(['pulse', 'bass']);
/** Utility voices whose crowd-control gameplay must never be gated out, even in
 *  an exposed strip (design rule 6). The arranger may filter them, not cut them. */
const UTILITY_ROLES: ReadonlySet<Role> = new Set<Role>(['ride', 'riser']);

type DropPhase = 'idle' | 'armed' | 'strip' | 'build' | 'slam';

export class ConductedGrid {
  // Intensity spine
  intensity = 0;
  private killFlux = 0;
  private damageSpike = 0;
  private prevKills = 0;
  private prevHp = 0;
  private sinceKill = 999;

  // Arrangement
  tier = MAX_TIER;

  // Drop
  charge = 0;
  private dropPhase: DropPhase = 'idle';
  private dropBar = 0;
  private phaseT = 0; // seconds in the current drop phase (for the audio sweep)

  // Live wiring (set each tick; only valid while a run is active)
  private active = false;
  private engine: MusicEngine | null = null;
  private world: RunWorld | null = null;
  private tiers: ReadonlyMap<Role, number> = new Map();

  /** Fired on the Drop slam downbeat: the game answers with a flash + HUD pulse. */
  onPeak: (() => void) | null = null;

  // DOM
  private panel!: HTMLElement;
  private energyEl!: HTMLElement;
  private stateEl!: HTMLElement;
  private fill!: HTMLElement;
  private dropBtn!: HTMLButtonElement;

  mount(root: HTMLElement): void {
    const panel = document.createElement('div');
    panel.className = 'hype-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="hype-head">
        <span class="hype-zone">CHILL</span>
        <span class="hype-state"></span>
      </div>
      <div class="hype-bar">
        <div class="hype-fill"></div>
      </div>
      <button class="hype-drop" type="button">DROP</button>`;
    root.appendChild(panel);
    this.panel = panel;
    this.energyEl = panel.querySelector('.hype-zone') as HTMLElement;
    this.stateEl = panel.querySelector('.hype-state') as HTMLElement;
    this.fill = panel.querySelector('.hype-fill') as HTMLElement;
    this.dropBtn = panel.querySelector('.hype-drop') as HTMLButtonElement;
    this.dropBtn.addEventListener('click', () => {
      this.arm();
      this.dropBtn.blur(); // keep SPACE/hotkeys with the game (hud.ts convention)
    });
  }

  show(on: boolean): void {
    this.panel.style.display = on ? '' : 'none';
    if (!on) {
      // Leaving a run: neutralize the audio + sim state so menus and replays
      // (which reuse the same engine/world plumbing) are never left mid-drop.
      this.neutralize();
      this.active = false;
    }
  }

  reset(): void {
    this.intensity = 0;
    this.killFlux = 0;
    this.damageSpike = 0;
    this.prevKills = 0;
    this.prevHp = 0;
    this.sinceKill = 999;
    this.tier = MAX_TIER;
    this.charge = 0;
    this.dropPhase = 'idle';
    this.dropBar = 0;
    this.phaseT = 0;
  }

  /** The Drop tap (SPACE or the on-screen button). Arms a charged Drop; the
   *  strip/build/slam then unfolds on the bar clock. Only an input flag — no
   *  audio/sim state changes here (that happens on the next bar boundary). */
  arm(): void {
    if (!this.active) return;
    if (this.dropPhase === 'idle' && this.charge >= 1 && this.hasStrippable()) {
      this.dropPhase = 'armed';
      this.flashState();
    }
  }

  /** True if the band owns any voice a Drop would actually strip. With only
   *  foundation (Beat/Low) and/or utility (freeze/dash) voices there is nothing
   *  to expose, so a Drop would be a free overdrive with no cost — disallow it. */
  private hasStrippable(): boolean {
    for (const role of this.tiers.keys()) {
      if (!FOUNDATION.has(slotOf(role)) && !UTILITY_ROLES.has(role)) return true;
    }
    return false;
  }

  private flashState(): void {
    this.panel.classList.remove('flash');
    // reflow to restart the CSS animation
    void this.panel.offsetWidth;
    this.panel.classList.add('flash');
  }

  /** One frame (live only): advance intensity, charge, the drop's audio sweep,
   *  and repaint. Arrangement TIER changes and the drop's strip/build/slam are
   *  driven on bar boundaries by onBar, not here. */
  tick(dt: number, engine: MusicEngine, world: RunWorld, tiers: ReadonlyMap<Role, number>): void {
    this.active = true;
    this.engine = engine;
    this.world = world;
    this.tiers = tiers;

    this.updateIntensity(dt, world);
    this.updateCharge(dt);
    this.updateDropSweep(dt, engine);
    this.paint();
  }

  private updateIntensity(dt: number, world: RunWorld): void {
    // Kill flux: kills since last frame, smoothed into a per-second rate.
    const dk = Math.max(0, world.kills - this.prevKills);
    this.prevKills = world.kills;
    if (dk > 0) this.sinceKill = 0;
    else this.sinceKill += dt;
    const instFlux = dt > 0 ? dk / dt : 0;
    this.killFlux += (instFlux - this.killFlux) * (1 - Math.exp(-dt / KILLFLUX_TAU));

    // Recent damage taken: a spike on any hp loss, decaying away.
    if (this.prevHp === 0) this.prevHp = world.player.hp;
    if (world.player.hp < this.prevHp) this.damageSpike = 1;
    this.prevHp = world.player.hp;
    this.damageSpike *= Math.exp(-dt / DAMAGE_TAU);

    // Threat proximity: close, living enemies around the player.
    const px = world.player.x;
    const py = world.player.y;
    let near = 0;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy <= THREAT_RADIUS_SQ) near++;
    }

    const threat = Math.min(1, near / THREAT_FULL);
    const flux = Math.min(1, this.killFlux / KILLFLUX_FULL);
    const raw = Math.min(1, W_THREAT * threat + W_KILLFLUX * flux + W_DAMAGE * this.damageSpike);

    const tau = raw > this.intensity ? RISE_TAU : FALL_TAU;
    this.intensity += (raw - this.intensity) * (1 - Math.exp(-dt / tau));
  }

  private updateCharge(dt: number): void {
    if (this.dropPhase !== 'idle') return; // no charging mid-drop
    if (this.sinceKill >= KILL_RECENT_S) {
      // Disengaged too long: the meter bleeds. Charge is earned by fighting, so
      // idling or kiting an empty circle can never fill it (anti-farm rule).
      this.charge = Math.max(0, this.charge - CHARGE_DECAY_PER_S * dt);
      return;
    }
    if (this.charge >= 1) return;
    // Killing recently guaranteed here: playing well fills the meter, faster
    // while quiet (the incentive to briefly disengage and breathe).
    let rate = (0.4 + 0.6 * Math.min(1, this.killFlux / KILLFLUX_FULL)) / CHARGE_SECONDS;
    if (this.intensity < QUIET_INTENSITY) rate *= QUIET_CHARGE_MUL;
    this.charge = Math.min(1, this.charge + rate * dt);
  }

  /** During a drop, ride the master tone filter: muffled through the strip,
   *  sweeping open across the build (the riser), wide on the slam. Audio-only. */
  private updateDropSweep(dt: number, engine: MusicEngine): void {
    if (this.dropPhase === 'idle') return;
    this.phaseT += dt;
    const barSeconds = engine.clock.stepDuration * STEPS_PER_BAR;
    if (this.dropPhase === 'strip') {
      engine.setToneCutoff(700);
    } else if (this.dropPhase === 'build') {
      const p = Math.min(1, this.phaseT / (BUILD_BARS * barSeconds));
      engine.setToneCutoff(700 + p * (CUTOFF_OPEN - 700));
    } else if (this.dropPhase === 'slam') {
      engine.setToneCutoff(CUTOFF_OPEN);
    }
  }

  /** A bar boundary from the engine's audio clock: the phrase clock. Advances
   *  the drop's strip/build/slam and, at phrase boundaries, resolves the auto
   *  arrangement tier. Live only (guarded by `active`). */
  onBar(_bar: number): void {
    if (!this.active || !this.engine || !this.world) return;
    const bar = _bar;

    switch (this.dropPhase) {
      case 'armed':
        this.beginDrop();
        return;
      case 'strip':
        this.applyStripGating(); // re-gate any voice added mid-drop
        if (++this.dropBar >= STRIP_BARS) this.enterPhase('build');
        return;
      case 'build':
        this.applyStripGating();
        if (++this.dropBar >= BUILD_BARS) this.slam();
        return;
      case 'slam':
        if (++this.dropBar >= SLAM_BARS) this.endDrop();
        return;
      case 'idle':
        // Auto-arranger: resolve the tier from intensity, only on the phrase grid.
        if (bar % PHRASE_BARS === 0) this.resolveTier();
        return;
    }
  }

  private resolveTier(): void {
    const prev = this.tier;
    let t = this.tier;
    while (t < MAX_TIER && this.intensity >= TIER_UP[t]) t++;
    while (t > 0 && this.intensity < TIER_DOWN[t - 1]) t--;
    if (t !== prev) {
      this.tier = t;
      this.applyArrangement();
    }
  }

  /** Filter every owned voice by its slot's tier against the open tier. In the
   *  tier = full open; above it = filtered to a whisper (still firing → still
   *  dealing damage). Also nudges the master tone. Auto-layer only (never gates). */
  private applyArrangement(): void {
    const engine = this.engine;
    if (!engine) return;
    for (const role of this.tiers.keys()) {
      const gap = Math.max(0, SLOT_TIER[slotOf(role)] - this.tier);
      engine.setVoiceCutoff(role, CUTOFF_BY_GAP[Math.min(gap, CUTOFF_BY_GAP.length - 1)]);
    }
    engine.setToneCutoff(MASTER_TONE_BY_TIER[this.tier]);
  }

  private beginDrop(): void {
    if (!this.engine) return;
    this.charge = 0; // spent
    this.enterPhase('strip');
    this.applyStripGating();
  }

  /** Strip to the foundation: gate every non-foundation, non-utility owned voice
   *  so it fires no trigger (no sound AND no damage — the exposure). Re-run each
   *  strip/build bar so a weapon picked mid-drop is stripped too. */
  private applyStripGating(): void {
    const engine = this.engine;
    if (!engine) return;
    for (const role of this.tiers.keys()) {
      const stripped = !FOUNDATION.has(slotOf(role)) && !UTILITY_ROLES.has(role);
      engine.setVoiceGated(role, stripped);
      // Open the foundation/utility voices so the breakdown reads clean.
      if (!stripped) engine.setVoiceCutoff(role, CUTOFF_OPEN, 0.06);
    }
  }

  private slam(): void {
    const engine = this.engine;
    const world = this.world;
    if (!engine || !world) return;
    this.enterPhase('slam');
    // Everything back in at once, wide open, harder and wider (the overdrive).
    for (const role of this.tiers.keys()) {
      engine.setVoiceGated(role, false);
      engine.setVoiceCutoff(role, CUTOFF_OPEN, 0.02);
    }
    engine.setToneCutoff(CUTOFF_OPEN);
    world.hypeDamageMul = OVERDRIVE_DAMAGE;
    world.hypeAreaMul = OVERDRIVE_AREA;
    this.onPeak?.();
  }

  private endDrop(): void {
    const world = this.world;
    if (world) {
      world.hypeDamageMul = 1;
      world.hypeAreaMul = 1;
    }
    this.dropPhase = 'idle';
    this.dropBar = 0;
    this.phaseT = 0;
    this.applyArrangement(); // hand back to the auto-arranger at the current tier
  }

  private enterPhase(phase: DropPhase): void {
    this.dropPhase = phase;
    this.dropBar = 0;
    this.phaseT = 0;
  }

  /** Reset all audio/sim state the layer drives back to neutral (open filters,
   *  no gating, multipliers at 1). Called on run exit so nothing leaks. */
  private neutralize(): void {
    const engine = this.engine;
    if (engine) {
      engine.setToneCutoff(CUTOFF_OPEN);
      for (const role of engine.voices.keys()) {
        engine.setVoiceGated(role, false);
        engine.setVoiceCutoff(role, CUTOFF_OPEN, 0.02);
      }
    }
    if (this.world) {
      this.world.hypeDamageMul = 1;
      this.world.hypeAreaMul = 1;
    }
    this.dropPhase = 'idle';
    this.dropBar = 0;
    this.phaseT = 0;
  }

  private paint(): void {
    this.energyEl.textContent = TIER_NAME[this.tier];
    this.energyEl.dataset.rank = String(this.tier);
    this.fill.style.width = `${this.charge * 100}%`;

    let state = '';
    let ready = false;
    switch (this.dropPhase) {
      case 'idle':
        ready = this.charge >= 1 && this.hasStrippable();
        state = ready ? 'DROP READY' : 'building the crowd';
        break;
      case 'armed':
        state = 'ARMED';
        break;
      case 'strip':
      case 'build':
        state = 'winding up…';
        break;
      case 'slam':
        state = 'DROP!';
        break;
    }
    this.stateEl.textContent = state;
    this.dropBtn.disabled = !ready;
    this.dropBtn.classList.toggle('ready', ready);
  }
}
