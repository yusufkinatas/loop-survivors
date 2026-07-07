// The Tension Cycle (Hype Layer v3), sub-phase A. Full spec:
// docs/phases/hype-layer-v3.md.
//
// The run's live arrangement dynamics, rebuilt after v2 ("The Conducted Grid")
// was rejected on playtest for one reason: it could only filter one fixed pattern
// louder/quieter, so the "drop" sounded exactly like the peak. v3 instead
// TRANSFORMS what the band plays (via src/audio/program.ts): the groove gently
// intensifies as tension winds up, then a committed BUILD -> HOLD -> DROP ->
// RELEASE sequence lands a big HALF-TIME drop that's emptier, lower, and heavier
// than the groove — a genuine transformation, not a volume boost.
//
// SUB-PHASE A scope (this file): prove the SOUND. Tension winds automatically to a
// held READY plateau; the player releases with SPACE / the DROP button to fire the
// cycle so the developer can judge, by ear, whether the drop finally lands as
// something different. It is LIVE-ONLY (drives the engine's arrangement context +
// riser/slam), so the headless bot and seeded replays are untouched. Sub-phase B
// replaces the auto-wind with real combat aggression, moves the state machine onto
// the shared deterministic path, adds the overdrive, and re-baselines the bot.

import type { MusicEngine } from '../audio/engine';
import type { Role } from '../audio/kits';
import {
  BUILD_BARS,
  HOLD_BARS,
  DROP_BARS,
  RELEASE_BARS,
  type ArrangeCtx,
  type Section,
} from '../audio/program';
import type { RunWorld } from './run';

/** Tension floor after a drop, and the ready threshold. */
const TENSION_FLOOR = 0.15;
const TENSION_READY = 1;
/** Sub-phase A: tension winds automatically to READY in ~this many seconds so the
 *  developer can hear the groove intensify then release. (Real aggression winding
 *  is sub-phase B.) */
const AUTO_WIND_SECONDS = 14;

const SECTION_LABEL: Record<Section, string> = {
  groove: 'GROOVE',
  build: 'BUILD',
  hold: 'HOLD',
  drop: 'DROP',
  release: 'SETTLE',
};

export class ConductedGrid {
  private section: Section = 'groove';
  private sectionBar = 0;
  tension = TENSION_FLOOR;
  private pendingRelease = false;
  private curBar = 0;

  private active = false;
  private engine: MusicEngine | null = null;

  /** Fired on the drop's downbeat: the game answers with a flash + HUD pulse. */
  onPeak: (() => void) | null = null;

  // DOM
  private panel!: HTMLElement;
  private sectionEl!: HTMLElement;
  private stateEl!: HTMLElement;
  private fill!: HTMLElement;
  private dropBtn!: HTMLButtonElement;

  mount(root: HTMLElement): void {
    const panel = document.createElement('div');
    panel.className = 'hype-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="hype-head">
        <span class="hype-zone">GROOVE</span>
        <span class="hype-state"></span>
      </div>
      <div class="hype-bar">
        <div class="hype-fill"></div>
      </div>
      <button class="hype-drop" type="button">DROP</button>`;
    root.appendChild(panel);
    this.panel = panel;
    this.sectionEl = panel.querySelector('.hype-zone') as HTMLElement;
    this.stateEl = panel.querySelector('.hype-state') as HTMLElement;
    this.fill = panel.querySelector('.hype-fill') as HTMLElement;
    this.dropBtn = panel.querySelector('.hype-drop') as HTMLButtonElement;
    this.dropBtn.addEventListener('click', () => {
      this.release();
      this.dropBtn.blur(); // keep SPACE/hotkeys with the game
    });
  }

  show(on: boolean): void {
    this.panel.style.display = on ? '' : 'none';
    if (!on) {
      this.engine?.setArrangement(null);
      this.active = false;
    }
  }

  reset(): void {
    this.section = 'groove';
    this.sectionBar = 0;
    this.tension = TENSION_FLOOR;
    this.pendingRelease = false;
    this.curBar = 0;
    this.engine?.setArrangement(null);
  }

  /** The player's one input: commit a drop. Only valid at READY in the groove; it
   *  fires on the next bar (the state machine picks it up in onBar). */
  release(): void {
    if (!this.active) return;
    if (this.section === 'groove' && this.tension >= TENSION_READY) {
      this.pendingRelease = true;
      this.flash();
    }
  }

  private flash(): void {
    this.panel.classList.remove('flash');
    void this.panel.offsetWidth;
    this.panel.classList.add('flash');
  }

  /** Per frame (live only): wind tension while grooving, publish the arrangement
   *  context to the engine, and repaint. Section transitions happen in onBar. */
  tick(dt: number, engine: MusicEngine, _world: RunWorld, _tiers: ReadonlyMap<Role, number>): void {
    this.active = true;
    this.engine = engine;
    if (this.section === 'groove' && this.tension < TENSION_READY) {
      this.tension = Math.min(TENSION_READY, this.tension + dt / AUTO_WIND_SECONDS);
    }
    const ctx: ArrangeCtx = {
      section: this.section,
      tension: this.tension,
      sectionBar: this.sectionBar,
      bar: this.curBar,
      seed: 0,
    };
    engine.setArrangement(ctx);
    this.paint();
  }

  /** A bar boundary (the engine's phrase clock): advance the cycle. */
  onBar(bar: number): void {
    if (!this.active || !this.engine) return;
    this.curBar = bar;
    switch (this.section) {
      case 'groove':
        if (this.pendingRelease && this.tension >= TENSION_READY) {
          this.pendingRelease = false;
          this.section = 'build';
          this.sectionBar = 0;
          // Riser spans the build + the hold so it peaks right into the slam.
          this.engine.playRiser(BUILD_BARS + HOLD_BARS);
        }
        return;
      case 'build':
        if (++this.sectionBar >= BUILD_BARS) this.enter('hold');
        return;
      case 'hold':
        if (++this.sectionBar >= HOLD_BARS) {
          this.enter('drop');
          this.engine.playSlam();
          this.onPeak?.();
        }
        return;
      case 'drop':
        if (++this.sectionBar >= DROP_BARS) this.enter('release');
        return;
      case 'release':
        if (++this.sectionBar >= RELEASE_BARS) {
          this.enter('groove');
          this.tension = TENSION_FLOOR;
        }
        return;
    }
  }

  private enter(section: Section): void {
    this.section = section;
    this.sectionBar = 0;
  }

  private paint(): void {
    this.sectionEl.textContent = SECTION_LABEL[this.section];
    this.sectionEl.dataset.rank = this.section === 'drop' ? '2' : this.section === 'groove' ? '0' : '1';
    this.fill.style.width = `${this.tension * 100}%`;
    let state: string;
    let ready = false;
    if (this.section === 'groove') {
      ready = this.tension >= TENSION_READY;
      state = ready ? 'READY — DROP' : 'winding up';
    } else if (this.section === 'build') {
      state = 'winding up…';
    } else if (this.section === 'hold') {
      state = '…';
    } else if (this.section === 'drop') {
      state = 'DROP!';
    } else {
      state = 'settle';
    }
    this.stateEl.textContent = state;
    this.dropBtn.disabled = !ready;
    this.dropBtn.classList.toggle('ready', ready);
  }
}
