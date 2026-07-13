import { Application, type Ticker } from 'pixi.js';
import type { MusicEngine } from '../audio/engine';
import type { Kit, Role } from '../audio/kits';
import { SIM_DT } from '../bot/conductor';
import { MOVERS, type Mover } from '../bot/movers';
import { SOUNDSET } from '../audio/soundset';
import { ENEMIES, RUN, type EnemyKind } from '../game/config';
import { Input } from '../game/input';
import { mulberry32 } from '../game/rng';
import { RunWorld, type RunEvents } from '../game/run';
import { RunView } from '../game/view';
import type { DisposableSession } from '../lifecycle';
import { ACTIVE_ENEMIES, ACTIVE_WEAPONS } from './catalog';
import type { DevRoomDef } from './rooms';

export interface ScenarioFixture {
  room: string;
  preset: string;
  seed: number;
  role?: Role;
  tier?: number;
  enemy?: EnemyKind;
  level?: number;
  muted?: boolean;
  overlays?: boolean;
  speed?: number;
  paused?: boolean;
}

export interface ScenarioMetrics {
  levelUps: number;
  hits: number;
  deaths: number;
  victories: number;
  fixedSteps: number;
  droppedFrameDebt: number;
}

export interface ScenarioSession extends DisposableSession {
  readonly world: RunWorld;
  readonly engine: MusicEngine;
  readonly metrics: ScenarioMetrics;
  setPlaying(playing: boolean): void;
  isPlaying(): boolean;
  step(): void;
  setSpeed(speed: number): void;
  setMuted(muted: boolean): void;
  setOverlays(show: boolean): void;
  snapshot(): string;
}

export interface ScenarioDeps {
  createEngine(): MusicEngine;
  kits: Map<Role, Kit>;
}

const stableNumber = (value: number): number => Math.round(value * 1000) / 1000;

function worldSnapshot(world: RunWorld, metrics: ScenarioMetrics): string {
  const enemies = world.enemies
    .map((e) => [e.id, e.kind, stableNumber(e.x), stableNumber(e.y), stableNumber(e.hp), e.dead])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  return JSON.stringify({
    time: stableNumber(world.timeS),
    player: [stableNumber(world.player.x), stableNumber(world.player.y), stableNumber(world.player.hp)],
    level: world.level,
    xp: stableNumber(world.xp),
    kills: world.kills,
    tiers: [...world.tiers.entries()],
    enemies,
    projectiles: world.projectiles.map((p) => [p.role, stableNumber(p.x), stableNumber(p.y), stableNumber(p.lifeS)]),
    zones: world.zones.map((z) => [z.source, stableNumber(z.x), stableNumber(z.y), stableNumber(z.lifeS)]),
    gems: world.gems.map((g) => [stableNumber(g.x), stableNumber(g.y), stableNumber(g.xp), g.tier]),
    fixedSteps: metrics.fixedSteps,
  });
}

function moverFor(fixture: ScenarioFixture): Mover | null {
  if (fixture.preset.includes('manual') || fixture.room === 'movement' || fixture.room === 'devices') return null;
  if (fixture.preset.includes('greedy')) return MOVERS.harvester();
  return MOVERS.kiter();
}

function selectedRole(fixture: ScenarioFixture): Role {
  return fixture.role && ACTIVE_WEAPONS.some((entry) => entry.role === fixture.role)
    ? fixture.role
    : 'kick';
}

function selectedEnemy(fixture: ScenarioFixture): EnemyKind {
  return fixture.enemy && ACTIVE_ENEMIES.includes(fixture.enemy as never) ? fixture.enemy : 'zombie';
}

function spawnCountFor(room: DevRoomDef, preset: string): number {
  const stress = preset.match(/^(45|90|150|240|300|500)-enemies$/);
  if (stress) return Number(stress[1]);
  if (room.slug === 'hordes') return preset === 'hard-cap' ? 500 : 90;
  if (room.slug === 'movement') return preset === 'dense-overlap' ? 24 : preset === 'squeeze' ? 8 : preset === 'empty' ? 0 : 1;
  if (room.slug === 'weapons' || room.slug === 'kick' || room.slug === 'sync') {
    return preset === 'single' || preset.startsWith('tier-') ? 1 : preset === 'line' ? 8 : 28;
  }
  if (room.slug === 'enemies') return preset === 'overlap' ? 24 : 8;
  if (room.slug === 'scratch') return preset === 'empty' ? 0 : preset === 'dense-horde' ? 150 : 32;
  return 32;
}

function configureWorld(room: DevRoomDef, fixture: ScenarioFixture, world: RunWorld, engine: MusicEngine): void {
  world.powerMul = SOUNDSET.powerMul;
  world.invincible = !['parity-run'].includes(room.slug);
  world.level = Math.max(1, Math.min(99, fixture.level ?? 1));

  const role = selectedRole(fixture);
  const tier = Math.max(1, Math.min(4, fixture.tier ?? (room.slug === 'kick' ? 4 : 1)));
  if (!['movement', 'enemies'].includes(room.slug)) {
    world.addWeapon(role, tier);
    engine.setVoiceTier(role, tier);
    engine.setVoiceEnabled(role, true);
  }

  if (fixture.preset === 'full-band' || fixture.preset === 'projectile-heavy') {
    for (const entry of ACTIVE_WEAPONS.filter((_entry, i) => i % 2 === 0)) {
      world.addWeapon(entry.role, fixture.preset === 'projectile-heavy' ? 4 : 2);
      engine.setVoiceTier(entry.role, fixture.preset === 'projectile-heavy' ? 4 : 2);
      engine.setVoiceEnabled(entry.role, true);
    }
  }

  if (room.slug === 'parity-run' || room.slug === 'stage') return;

  const kind = selectedEnemy(fixture);
  const count = spawnCountFor(room, fixture.preset);
  if (fixture.preset === 'ring' || fixture.preset === 'enemy-ring' || room.slug === 'hordes') {
    world.spawnRingOf(kind, count);
  } else {
    for (let i = 0; i < count; i++) world.spawnEnemy(kind, (i / Math.max(1, count)) * Math.PI * 2, 0.35);
  }

  if (room.slug === 'movement' && fixture.preset === 'knockback-immune') {
    world.clearEnemies();
    world.spawnEnemy('ghost', 0, 0.1);
  }
  if (room.slug === 'weapons' && fixture.preset === 'high-health') {
    world.clearEnemies();
    world.spawnEnemy('mantis', 0, 0.25);
  }
  if (room.slug === 'weapons' && fixture.preset === 'knockback-immune') {
    world.clearEnemies();
    world.spawnEnemy('ghost', 0, 0.25);
  }
}

export async function mountScenario(
  root: HTMLElement,
  room: DevRoomDef,
  fixture: ScenarioFixture,
  deps: ScenarioDeps,
): Promise<ScenarioSession> {
  const engine = deps.createEngine();
  const input = new Input();
  const canvasHost = document.createElement('div');
  canvasHost.className = 'dev-sim-canvas';
  const metricsEl = document.createElement('pre');
  metricsEl.className = 'dev-live-metrics';
  root.append(canvasHost, metricsEl);

  const app = new Application();
  await app.init({
    background: 0x0a0b0f,
    resizeTo: canvasHost,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  canvasHost.appendChild(app.canvas);

  const metrics: ScenarioMetrics = {
    levelUps: 0,
    hits: 0,
    deaths: 0,
    victories: 0,
    fixedSteps: 0,
    droppedFrameDebt: 0,
  };
  const mover = moverFor(fixture);
  let world!: RunWorld;
  const events: RunEvents = {
    onLevelUp: () => metrics.levelUps++,
    onHit: () => metrics.hits++,
    onDeath: () => metrics.deaths++,
    onVictory: () => metrics.victories++,
  };
  world = new RunWorld(app.screen, events, {
    rng: mulberry32(fixture.seed),
    scripted: room.slug === 'parity-run' || room.slug === 'stage',
    control: () => (mover ? mover(world) : input.axis()),
  });
  configureWorld(room, fixture, world, engine);
  const view = new RunView(world, app.screen);
  app.stage.addChild(view.stage);

  let playing = !(fixture.paused ?? false);
  let speed = Math.max(0.25, Math.min(10, fixture.speed ?? 1));
  let accumulator = 0;
  let disposed = false;
  const removeTriggerListener = engine.addTriggerListener((trigger) => world.fireTrigger(trigger));
  engine.setMasterGain(fixture.muted ? 0 : 0.8);
  engine.clock.rate = speed;
  void engine.ctx.resume();
  engine.clock.start();
  if (!playing) engine.clock.pause();

  const updateMetrics = (ticker?: Ticker): void => {
    const role = selectedRole(fixture);
    const tier = world.tiers.get(role) ?? 0;
    const enemy = world.enemies[0];
    metricsEl.textContent = [
      `seed ${fixture.seed} · fixed tick ${(SIM_DT * 1000).toFixed(2)} ms · speed ${speed.toFixed(2)}×`,
      `time ${world.timeS.toFixed(2)} s · fixed steps ${metrics.fixedSteps} · fps ${ticker ? Math.round(ticker.FPS) : 'paused'}`,
      `player (${world.player.x.toFixed(1)}, ${world.player.y.toFixed(1)}) · hp ${world.player.hp.toFixed(1)}/${RUN.playerHp} · level ${world.level}`,
      `weapon ${role} tier ${tier || 'off'} · enemies ${world.enemyCount} · shots ${world.projectileCount} · zones ${world.zones.length} · gems ${world.gems.length}`,
      enemy ? `first target ${enemy.kind} · hp ${enemy.hp.toFixed(1)} · radius ${enemy.radius.toFixed(1)} · knockback ${enemy.knockbackMul}` : 'first target —',
      `hits ${metrics.hits} · level-ups ${metrics.levelUps} · deaths ${metrics.deaths} · victories ${metrics.victories}`,
    ].join('\n');
  };

  const fixedStep = (): void => {
    world.update(SIM_DT);
    metrics.fixedSteps++;
  };

  const onTick = (ticker: Ticker): void => {
    if (disposed) return;
    engine.update();
    if (playing) {
      const frame = Math.min(ticker.deltaMS / 1000, 0.1) * speed;
      accumulator += frame;
      let steps = 0;
      while (accumulator >= SIM_DT && steps < 60) {
        accumulator -= SIM_DT;
        steps++;
        fixedStep();
      }
      if (accumulator > SIM_DT * 60) {
        metrics.droppedFrameDebt += accumulator;
        accumulator = 0;
      }
      view.update(Math.min(ticker.deltaMS / 1000, 0.05) * speed);
    }
    updateMetrics(ticker);
  };
  app.ticker.add(onTick);
  updateMetrics();

  return {
    world,
    engine,
    metrics,
    setPlaying(on: boolean): void {
      playing = on;
      accumulator = 0;
      if (on) engine.clock.resume();
      else engine.clock.pause();
      updateMetrics();
    },
    isPlaying(): boolean {
      return playing;
    },
    step(): void {
      if (playing) return;
      fixedStep();
      view.update(SIM_DT);
      updateMetrics();
    },
    setSpeed(value: number): void {
      speed = Math.max(0.25, Math.min(10, value));
      engine.clock.rate = speed;
      updateMetrics();
    },
    setMuted(muted: boolean): void {
      engine.setMasterGain(muted ? 0 : 0.8);
    },
    setOverlays(show: boolean): void {
      metricsEl.style.display = show ? '' : 'none';
    },
    snapshot(): string {
      return worldSnapshot(world, metrics);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      removeTriggerListener();
      app.ticker.remove(onTick);
      engine.dispose();
      input.dispose();
      view.destroy();
      app.destroy(true, { children: true });
      canvasHost.remove();
      metricsEl.remove();
    },
  };
}

export function defaultFixture(room: DevRoomDef, preset: string, seed: number): ScenarioFixture {
  const tierMatch = preset.match(/tier-(I|II|III|IV)/);
  const tier = tierMatch ? ['I', 'II', 'III', 'IV'].indexOf(tierMatch[1]) + 1 : undefined;
  return {
    room: room.slug,
    preset,
    seed,
    role: room.slug === 'kick' ? 'kick' : undefined,
    tier,
    enemy: room.slug === 'movement' && preset === 'knockback-immune' ? 'ghost' : undefined,
    level: 1,
    overlays: true,
    speed: 1,
    paused: false,
  };
}

export function productionEnemyConfig(kind: EnemyKind) {
  return ENEMIES[kind];
}
