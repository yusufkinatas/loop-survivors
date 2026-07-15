// Shared live world for the in-game documentation suite. Every room borrows
// this one RunWorld/RunView/engine wiring instead of constructing a lighter
// imitation of gameplay. Room changes reset the arena but do not re-require or
// remount the heavy systems.

import { Application, Container, Text, TextStyle } from 'pixi.js';
import type { MusicEngine, ScheduledTrigger } from '../audio/engine';
import { SOUNDSET, supportedRoles } from '../audio/soundset';
import { ROLE_META, type Kit, type Role } from '../audio/kits';
import type { ChartEvent } from '../audio/charts';
import { SIM_DT } from '../game/timing';
import { RUN } from '../game/config';
import { Input, autoMove, touchAxis } from '../game/input';
import { mountJoystick, type JoystickHandle } from '../game/joystick';
import { mulberry32 } from '../game/rng';
import { RunWorld, type Enemy } from '../game/run';
import { RunView } from '../game/view';

interface VoiceSnapshot {
  enabled: boolean;
  tier: number;
  evolved: boolean;
  gain: number;
}

interface EngineSnapshot {
  contextState: AudioContextState;
  running: boolean;
  bpm: number;
  swing: number;
  rate: number;
  voices: Map<Role, VoiceSnapshot>;
}

export type LabFrame = (dt: number) => void;
export type LabTrigger = (trigger: ScheduledTrigger) => void;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 13,
  fill: 0xf3f6ff,
  stroke: { color: 0x080a0f, width: 4 },
  align: 'center',
  lineHeight: 16,
});

export class LabSandbox {
  readonly app: Application;
  readonly world: RunWorld;
  readonly view: RunView;
  /** Room-owned world-space diagrams and labels. Re-topped every frame because
   * RunView appends real entities as they spawn. */
  readonly overlay = new Container();
  readonly kits: Map<Role, Kit>;

  private readonly root: HTMLElement;
  private readonly engine: MusicEngine;
  private readonly input: Input;
  private readonly joystick: JoystickHandle;
  private readonly snapshot: EngineSnapshot;
  private readonly touchSnapshot: Readonly<{ x: number; y: number; active: boolean }>;
  private readonly autoMoveSnapshot: boolean;
  private readonly triggerWatchers = new Set<LabTrigger>();
  private unsubscribeTrigger: () => void;
  private frame: LabFrame | null = null;
  private acc = 0;
  private paused = false;
  private destroyed = false;
  private lastAxis = { x: 0, y: 0 };
  hitCount = 0;
  triggerCount = 0;

  private constructor(
    root: HTMLElement,
    engine: MusicEngine,
    kits: Map<Role, Kit>,
    app: Application,
  ) {
    this.root = root;
    this.engine = engine;
    this.kits = kits;
    this.app = app;
    this.snapshot = this.captureEngine();
    this.touchSnapshot = { ...touchAxis };
    this.autoMoveSnapshot = autoMove.active;
    this.input = new Input();
    this.joystick = mountJoystick(root);
    autoMove.active = false;
    touchAxis.x = 0;
    touchAxis.y = 0;
    touchAxis.active = false;

    const events = {
      onLevelUp(): void {},
      onChestCollected(): void {},
      onDeath: (): void => {
        // Documentation rooms are observation spaces, never run-ending states.
        this.world.player.hp = RUN.playerHp;
        this.world.player.iframesT = 0;
      },
      onVictory(): void {},
      onHit: (): void => {
        this.hitCount++;
      },
    };
    this.world = new RunWorld(app.screen, events, {
      scripted: false,
      rng: mulberry32(0x1ab2026),
      control: () => {
        this.lastAxis = this.input.axis();
        return this.lastAxis;
      },
    });
    this.world.powerMul = SOUNDSET.powerMul;
    this.world.invincible = true;
    this.view = new RunView(this.world, app.screen);
    app.stage.addChild(this.view.stage);
    this.view.stage.addChild(this.overlay);

    // One suite-level router preserves Model A: an engine event is both the
    // heard onset and the real gameplay trigger. The disposer is mandatory —
    // room navigation must never stack callbacks or make a later game fire a
    // weapon twice.
    this.unsubscribeTrigger = engine.addTriggerListener((trigger) => {
      if (this.world.tiers.has(trigger.role)) this.world.fireTrigger(trigger);
      this.triggerCount++;
      for (const watcher of this.triggerWatchers) watcher(trigger);
    });

    app.ticker.add((ticker) => this.tick(Math.min(ticker.deltaMS / 1000, 0.1)));
  }

  static async create(
    root: HTMLElement,
    engine: MusicEngine,
    kits: Map<Role, Kit>,
  ): Promise<LabSandbox> {
    const app = new Application();
    await app.init({
      background: 0x0a0b0f,
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    root.appendChild(app.canvas);
    return new LabSandbox(root, engine, kits, app);
  }

  get movementAxis(): Readonly<{ x: number; y: number }> {
    return this.lastAxis;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.acc = 0;
  }

  setFrame(frame: LabFrame | null): void {
    this.frame = frame;
  }

  watchTriggers(watcher: LabTrigger): () => void {
    this.triggerWatchers.add(watcher);
    return () => this.triggerWatchers.delete(watcher);
  }

  /** A real world-space label, transformed by the real camera with the entity
   * it documents. Rooms update its position/text from live state each frame. */
  worldLabel(text: string, color = 0xf3f6ff): Text {
    const label = new Text({ text, style: LABEL_STYLE });
    label.anchor.set(0.5, 1);
    label.tint = color;
    this.overlay.addChild(label);
    return label;
  }

  /** Select one real instrument and its real tier. The clock remains stopped
   * until a room explicitly asks for pattern playback; manual preview still
   * routes through the normal trigger pipeline. */
  selectInstrument(role: Role, tier: number): void {
    this.engine.clearTransientSchedule();
    for (const active of supportedRoles()) {
      this.engine.setVoiceEnabled(active, false);
      this.world.removeWeapon(active);
    }
    this.engine.setVoiceTier(role, tier);
    this.engine.setVoiceEnabled(role, true);
    this.world.addWeapon(role, tier);
  }

  pulse(role: Role, event?: ChartEvent): void {
    void this.engine.ctx.resume();
    this.engine.preview(role, event);
    // A suspended AudioContext does not advance, but preview at currentTime is
    // already due. Drain once synchronously so auto-drive and manual rooms use
    // the exact same deterministic trigger path without waiting for rAF.
    this.engine.update();
  }

  setPatternPlaying(on: boolean): void {
    if (on) {
      void this.engine.ctx.resume();
      this.engine.clock.start();
    } else {
      this.engine.clearTransientSchedule();
    }
  }

  /** Exact-position adapter over RunWorld's real enemy constructor. */
  spawnEnemy(kind: Parameters<RunWorld['spawnEnemyAt']>[0], x: number, y: number): Enemy | null {
    return this.world.spawnEnemyAt(kind, x, y);
  }

  /** Run exact fixed simulation ticks for a paused exhibit. */
  runSteps(count: number): void {
    for (let i = 0; i < count; i++) this.world.update(SIM_DT);
  }

  /** Deterministic Movement Gym helper that drives the real Input keyboard
   * listeners. This keeps diagonal normalization inside Input.axis(), so the
   * comparison fails if production input ever regresses. */
  runWithKeys(codes: readonly string[], count: number): void {
    for (const code of codes) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    try {
      this.runSteps(count);
    } finally {
      for (const code of codes) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      this.lastAxis = { x: 0, y: 0 };
    }
  }

  /** Reset between rooms. This calls the world's full sandbox cleanup, not
   * clearEnemies(), so stale spatial-hash entries, zones, projectiles, gems,
   * effects, or delayed Kick strips cannot leak into the next exhibit. */
  resetRoom(): void {
    this.engine.clearTransientSchedule();
    for (const role of this.engine.voices.keys()) {
      this.engine.setVoiceEnabled(role, false);
      this.engine.setVoiceTier(role, 1);
      this.engine.setVoiceEvolved(role, false);
    }
    this.world.clearSandboxEntities();
    this.world.tiers.clear();
    this.world.gear.clear();
    this.world.evolved.clear();
    this.world.player.x = 0;
    this.world.player.y = 0;
    this.world.player.hp = RUN.playerHp;
    this.world.player.iframesT = 0;
    this.world.player.facingX = 1;
    this.world.level = 1;
    this.world.xp = 0;
    this.world.timeS = 0;
    this.world.kills = 0;
    this.world.killsByRole = {};
    this.world.damageByRole = {};
    this.world.invincible = true;
    this.hitCount = 0;
    this.triggerCount = 0;
    this.lastAxis = { x: 0, y: 0 };
    touchAxis.x = 0;
    touchAxis.y = 0;
    touchAxis.active = false;
    this.triggerWatchers.clear();
    this.frame = null;
    this.paused = false;
    this.acc = 0;
    for (const child of this.overlay.removeChildren()) child.destroy();
  }

  /** Restore every shared engine field this suite changes. This invariant is
   * intentionally explicit: after leaving the lab, a normal game starts with
   * the same engine state it would have had if the lab had never opened. Hash
   * exit additionally reloads the page and constructs a fresh AudioContext. */
  restoreEngine(): void {
    this.engine.clearTransientSchedule();
    const now = this.engine.ctx.currentTime;
    for (const [role, saved] of this.snapshot.voices) {
      const voice = this.engine.voices.get(role);
      if (!voice) continue;
      this.engine.setVoiceTier(role, saved.tier);
      this.engine.setVoiceEvolved(role, saved.evolved);
      this.engine.setVoiceEnabled(role, saved.enabled);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.value = saved.gain;
    }
    this.engine.clock.bpm = this.snapshot.bpm;
    this.engine.clock.swing = this.snapshot.swing;
    this.engine.clock.rate = this.snapshot.rate;
    if (this.snapshot.running) this.engine.clock.start();
  }

  async restoreSnapshot(): Promise<void> {
    this.restoreEngine();
    touchAxis.x = this.touchSnapshot.x;
    touchAxis.y = this.touchSnapshot.y;
    touchAxis.active = this.touchSnapshot.active;
    autoMove.active = this.autoMoveSnapshot;
    try {
      if (this.snapshot.contextState === 'suspended' && this.engine.ctx.state === 'running') {
        await this.engine.ctx.suspend();
      } else if (this.snapshot.contextState === 'running' && this.engine.ctx.state === 'suspended') {
        await this.engine.ctx.resume();
      }
    } catch {
      // snapshotMatches() remains false and the exit URL records the failed
      // restore, but teardown can still dispose every listener and canvas.
    }
  }

  engineMatchesSnapshot(): boolean {
    if (
      this.engine.clock.running !== this.snapshot.running ||
      this.engine.clock.bpm !== this.snapshot.bpm ||
      this.engine.clock.swing !== this.snapshot.swing ||
      this.engine.clock.rate !== this.snapshot.rate
    ) {
      return false;
    }
    for (const [role, saved] of this.snapshot.voices) {
      const voice = this.engine.voices.get(role);
      if (
        !voice ||
        voice.enabled !== saved.enabled ||
        voice.tier !== saved.tier ||
        voice.evolved !== saved.evolved
      ) return false;
      if (Math.abs(voice.gain.gain.value - saved.gain) > 1e-6) return false;
    }
    return true;
  }

  snapshotMatches(): boolean {
    return (
      this.engineMatchesSnapshot() &&
      this.engine.transientScheduleEmpty() &&
      this.engine.ctx.state === this.snapshot.contextState &&
      touchAxis.x === this.touchSnapshot.x &&
      touchAxis.y === this.touchSnapshot.y &&
      touchAxis.active === this.touchSnapshot.active &&
      autoMove.active === this.autoMoveSnapshot
    );
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resetRoom();
    this.unsubscribeTrigger();
    this.input.destroy();
    this.joystick.destroy();
    await this.restoreSnapshot();
    this.view.destroy();
    this.app.destroy();
    this.root.classList.remove('game-root', 'lab-root');
  }

  private captureEngine(): EngineSnapshot {
    const voices = new Map<Role, VoiceSnapshot>();
    for (const [role, voice] of this.engine.voices) {
      voices.set(role, {
        enabled: voice.enabled,
        tier: voice.tier,
        evolved: voice.evolved,
        gain: voice.gain.gain.value,
      });
    }
    return {
      contextState: this.engine.ctx.state,
      running: this.engine.clock.running,
      bpm: this.engine.clock.bpm,
      swing: this.engine.clock.swing,
      rate: this.engine.clock.rate,
      voices,
    };
  }

  private tick(frameS: number): void {
    if (this.destroyed) return;
    this.engine.update();
    if (!this.paused) {
      this.acc = Math.min(this.acc + frameS, SIM_DT * 6);
      while (this.acc >= SIM_DT) {
        this.acc -= SIM_DT;
        this.world.update(SIM_DT);
      }
    }
    this.view.update(frameS);
    this.frame?.(frameS);
    if (this.overlay.parent === this.view.stage) {
      this.view.stage.setChildIndex(this.overlay, this.view.stage.children.length - 1);
    }
  }
}

export function instrumentName(role: Role): string {
  return ROLE_META[role].name;
}
