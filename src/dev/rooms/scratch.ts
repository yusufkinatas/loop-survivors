import { SIM_DT } from '../../bot/conductor';
import { RunWorld } from '../../game/run';
import { mulberry32 } from '../../game/rng';
import { registerRoom, type DevContext } from '../registry';
import { DisposableScope, type RoomFixture } from '../lifecycle';
import { mountScenarioControls } from '../scenario';
import { session } from './shared';

registerRoom({
  id: 'scratch', kind: 'gym', title: 'Scratch Gym', status: 'CURRENT',
  description: 'Free-form combat in an isolated production world.',
  tags: ['sandbox', 'combat', 'spawn', 'loadout'],
  create: (_context: DevContext) => ({
    id: 'scratch', defaultFixture: { preset: 'empty', seed: 271828 },
    async mount(root, initial) {
      const scope = new DisposableScope();
      let fixture = initial;
      let world = makeWorld(fixture);
      let paused = false;
      let speed = 1;
      const output = document.createElement('pre');
      output.className = 'dev-world-readout';
      root.appendChild(output);
      const render = () => {
        output.textContent = JSON.stringify({
          timeS: Number(world.timeS.toFixed(3)), level: world.level, hp: world.player.hp,
          enemies: world.enemyCount, gems: world.gems.length, weapons: [...world.tiers], seed: fixture.seed,
        }, null, 2);
      };
      const controller = {
        presets: ['empty', 'bat-ring', 'mixed-horde'],
        capabilities: { pause: true, step: true, speed: true, overlays: true },
        fixture: () => fixture,
        reset(next: RoomFixture) { fixture = next; world = makeWorld(next); render(); },
        setPaused(value: boolean) { paused = value; },
        step(dt: number) { world.update(dt); render(); },
        setSpeed(value: number) { speed = value; },
      };
      const controls = mountScenarioControls(root, scope, controller);
      root.insertBefore(controls, output);
      scope.animationFrame(() => {
        if (!paused && speed > 0) { world.update(SIM_DT * speed); render(); }
      });
      render();
      return session(scope, () => fixture, controller.reset, () => JSON.parse(output.textContent || '{}'));
    },
  }),
});

function makeWorld(fixture: RoomFixture): RunWorld {
  const rng = mulberry32(fixture.seed);
  const world = new RunWorld({ width: 1280, height: 800 }, {
    onLevelUp() {}, onDeath() {}, onVictory() {}, onHit() {},
  }, { scripted: false, fx: false, rng });
  world.invincible = true;
  if (fixture.preset === 'bat-ring') world.spawnRingOf('bat', 24);
  if (fixture.preset === 'mixed-horde') {
    for (const kind of ['bat', 'zombie', 'skeleton', 'ghost'] as const) world.spawnRingOf(kind, 12);
  }
  return world;
}
