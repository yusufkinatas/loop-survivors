import assert from 'node:assert/strict';
import type { ScheduledTrigger } from '../src/audio/engine';
import type { Role } from '../src/audio/kits';
import { ARP_OMEGA, BELL, WEAPONS, type EnemyKind } from '../src/game/config';
import { EVOLUTION_TUNING, GEAR_BY_ROLE, GEAR_TUNING } from '../src/game/evolutions';
import { mulberry32 } from '../src/game/rng';
import { RunWorld, type Enemy } from '../src/game/run';

const DT = 1 / 120;

function world(): RunWorld {
  return new RunWorld(
    { width: 1000, height: 800 },
    {
      onLevelUp() {},
      onChestCollected() {},
      onDeath() {},
      onVictory() {},
      onHit() {},
    },
    { scripted: false, fx: false, rng: mulberry32(11), control: () => ({ x: 0, y: 0 }) },
  );
}

function enemy(w: RunWorld, x: number, y: number, hp = 1000): Enemy {
  const e = w.spawnEnemyAt('skeleton', x, y);
  assert.ok(e);
  e.speed = 0;
  e.hp = hp;
  return e;
}

function evolve(w: RunWorld, role: Role): void {
  w.addWeapon(role, 4);
  const gear = GEAR_BY_ROLE.get(role);
  assert.ok(gear);
  w.addGear(gear.id);
  w.setEvolved(role, true);
}

function fire(
  w: RunWorld,
  role: Role,
  extras: Partial<Omit<ScheduledTrigger, 'role' | 'time' | 'velocity' | 'step' | 'evolved'>> &
    { step?: number; velocity?: number; evolved?: boolean } = {},
): void {
  w.fireTrigger({
    role,
    time: 0,
    velocity: extras.velocity ?? 1,
    step: extras.step ?? 0,
    variant: extras.variant,
    note: extras.note,
    evolved: extras.evolved ?? true,
  });
}

function advance(w: RunWorld, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) w.update(Math.min(DT, seconds - t));
}

function close(actual: number, expected: number, message: string, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

// Base parity correction + Dancefloor: either side starts the shared base
// cooldown, while the beat-four echoes share their own one-hit-per-bar set.
{
  const w = world();
  evolve(w, 'kick');
  const e = enemy(w, 100, 0);
  fire(w, 'kick', { step: 0 });
  advance(w, 0.22);
  close(1000 - e.hp, WEAPONS.kick![3].damage, 'base Kick first hit');
  fire(w, 'kick', { step: 4 });
  advance(w, 0.22);
  close(1000 - e.hp, WEAPONS.kick![3].damage, 'base Kick shared re-hit lock');
  advance(w, EVOLUTION_TUNING.dancefloor.kickRehitS);
  fire(w, 'kick', { step: 8 });
  advance(w, 0.22);
  close(1000 - e.hp, WEAPONS.kick![3].damage * 2, 'base Kick lock expiry');
}
{
  const w = world();
  evolve(w, 'kick');
  const e = enemy(w, 100, 0);
  for (const step of [0, 4, 8, 12]) fire(w, 'kick', { step });
  advance(w, 0.22);
  close(
    1000 - e.hp,
    WEAPONS.kick![3].damage * (1 + EVOLUTION_TUNING.dancefloor.echoDamageMul),
    'Dancefloor one base hit plus one shared-set echo hit',
  );
}

// Dead Center: highest-current-HP target, ordered line hits, and capped lesser
// target charge.
{
  const w = world();
  evolve(w, 'snare');
  const a = enemy(w, 100, 0, 40);
  const b = enemy(w, 200, 0, 80);
  const target = enemy(w, 400, 0, 1000);
  fire(w, 'snare');
  close(40 - a.hp, 13 * 1.25, 'Dead Center first line hit');
  close(80 - b.hp, 13 * 1.25, 'Dead Center second line hit');
  close(1000 - target.hp, 13 * 1.25 * 1.3, 'Dead Center lesser-HP charge');
}

// Needle Storm: closed hits stack up to the enemy-owned timed counter; open
// damage lands normally and consumes the stored cuts as one Hat-attributed hit.
{
  const w = world();
  evolve(w, 'hat');
  const e = enemy(w, 30, 0);
  for (let i = 0; i < 3; i++) {
    fire(w, 'hat', { variant: 'closed', step: i });
    advance(w, 0.12);
  }
  assert.equal(e.hatCuts, 3);
  fire(w, 'hat', { variant: 'open', step: 4 });
  advance(w, 0.12);
  assert.equal(e.hatCuts, 0);
  close(1000 - e.hp, (3 * 2 + 2 + 2 * 1.5 * 3) * 1.25, 'Needle Storm consume damage');
}

// Orrery: first note holds, higher note expands both opposite-rotating rings,
// smooth movement reaches the target, and each ring caps at six.
{
  const w = world();
  evolve(w, 'arp');
  fire(w, 'arp', { note: 0, step: 0 });
  fire(w, 'arp', { note: 10, step: 4 });
  advance(w, 0.14);
  assert.equal(w.projectiles.length, 2);
  const inner = w.projectiles.find((pr) => pr.orbitRing === -1)!;
  const outer = w.projectiles.find((pr) => pr.orbitRing === 1)!;
  close(inner.orbitRadius, 90, 'Orrery inner note movement', 0.02);
  close(outer.orbitRadius, 134, 'Orrery outer note movement', 0.02);
  close(Math.abs(inner.orbitOmega), ARP_OMEGA * GEAR_TUNING.gyroscopeSpeedMul, 'Orrery Gyroscope speed');
  assert.equal(Math.sign(inner.orbitOmega), -Math.sign(outer.orbitOmega));
  for (let i = 0; i < 12; i++) fire(w, 'arp', { note: i, step: 8 + i });
  assert.equal(w.projectiles.filter((pr) => pr.role === 'arp').length, 12);
}
{
  const w = world();
  evolve(w, 'arp');
  w.addGear('heavyBoots');
  fire(w, 'arp', { note: 0, step: 0 });
  close(w.projectiles[0].orbitRadius, 82 * GEAR_TUNING.heavyBootsReachMul, 'Orrery Heavy Boots reach');
}

// Undertow: ordinary waves carry Lead Weight's damage/shove snapshots; step
// 31 becomes the one moving wall and carries a normal enemy at wall speed.
{
  const w = world();
  evolve(w, 'bass');
  enemy(w, 20, 0);
  fire(w, 'bass', { step: 0 });
  const wave = w.projectiles[0];
  close(wave.damage, 13 * 1.25 * GEAR_TUNING.leadWeightDamageMul, 'Undertow ordinary wave damage');
  close(wave.shove, EVOLUTION_TUNING.undertow.shove * GEAR_TUNING.leadWeightShoveMul, 'Undertow ordinary shove');
  fire(w, 'bass', { step: 31 });
  assert.equal(w.undertowWalls.length, 1);
  const wall = w.undertowWalls[0];
  close(wall.lifeS, EVOLUTION_TUNING.undertow.wallLifeS, 'Undertow wall lifetime');
  advance(w, 0.03);
  assert.ok(w.enemies[0].wallCarryT > 0, 'Undertow wall carries normal enemies');
}
{
  const w = world();
  evolve(w, 'bass');
  w.addGear('hourglass');
  fire(w, 'bass', { step: 31 });
  close(
    w.undertowWalls[0].lifeS,
    EVOLUTION_TUNING.undertow.wallLifeS * GEAR_TUNING.hourglassLifetimeMul,
    'Undertow Hourglass lifetime',
  );
}

// Cathedral: one event constructs one snapshotted group of three circles;
// stacked circles apply the locked 0.18 movement multiplier.
{
  const w = world();
  evolve(w, 'chord');
  const e = enemy(w, 30, 0);
  fire(w, 'chord', { variant: 'pad' });
  assert.equal(w.zones.length, 3);
  assert.equal(new Set(w.zones.map((z) => z.groupId)).size, 1);
  assert.ok(w.zones.every((z) => z.cathedral));
  close(
    w.zones[0].lifeS,
    1.45 * 2 * GEAR_TUNING.hourglassLifetimeMul,
    'Cathedral Hourglass snapshot',
  );
  advance(w, DT);
  close(e.slowMul, EVOLUTION_TUNING.cathedral.overlapSlowMul, 'Cathedral overlap slow');
}

// Headliner: persistent soloist selects fresh targets within the phrase and
// the second different target receives the first +10% combo step.
{
  const w = world();
  evolve(w, 'lead');
  const a = enemy(w, 60, 0);
  const b = enemy(w, 100, 0);
  fire(w, 'lead', { step: 0 });
  advance(w, 0.13);
  close(1000 - a.hp, 4 * 1.25 * 2, 'Headliner first dash');
  fire(w, 'lead', { step: 4 });
  advance(w, 0.13);
  close(1000 - b.hp, 4 * 1.25 * 2 * 1.1, 'Headliner combo dash');
  assert.equal(w.headliner?.visited.size, 2);
}

// Standing Ovation: the corridor catches once, deals the final event damage,
// stuns, then releases the same caught set without a second damage event.
{
  const w = world();
  evolve(w, 'clap');
  const e = enemy(w, 70, 0);
  fire(w, 'clap');
  advance(w, 0.13);
  const expected = 6 * 1.15 * 1.75 * GEAR_TUNING.boxingDamageMul;
  close(1000 - e.hp, expected, 'Standing Ovation catch damage');
  assert.ok(e.stunT > 0, 'Standing Ovation stuns normal enemies');
  advance(w, 0.09);
  close(1000 - e.hp, expected, 'Standing Ovation release has no damage');
  assert.ok(e.knockT > 0, 'Standing Ovation release throws caught enemies');
}

// Glass Choir: main hit creates exactly eight secondary shards; nearby living
// enemies receive distinct stable assignments, with Prism already baked in.
{
  const w = world();
  evolve(w, 'bell');
  for (let i = 0; i < 9; i++) enemy(w, 180 + (i % 3) * 18, (Math.floor(i / 3) - 1) * 18);
  fire(w, 'bell');
  for (let i = 0; i < 100 && !w.projectiles.some((pr) => pr.shard); i++) advance(w, DT);
  const shards = w.projectiles.filter((pr) => pr.shard);
  assert.equal(shards.length, EVOLUTION_TUNING.glassChoir.shards);
  const assigned = shards.map((pr) => pr.assignedTargetId).filter((id): id is number => id !== null);
  assert.equal(new Set(assigned).size, assigned.length, 'Glass Choir assignments are unique');
  close(shards[0].damage, 5 * 1.2 * BELL.shardDamageMul * GEAR_TUNING.prismDamageMul, 'Glass Choir Prism damage');
  close(shards[0].lifeS, BELL.shardLifeS * GEAR_TUNING.prismLifetimeMul, 'Glass Choir Prism lifetime', 0.02);
}

// Reset/deactivation invariants: world reset clears every bounded aftermath;
// Lead deactivation hides its soloist while already-live ordinary entities are
// allowed to finish their snapshotted lifetime.
{
  const w = world();
  evolve(w, 'lead');
  assert.ok(w.headliner?.visible);
  w.setWeaponActive('lead', false);
  assert.equal(w.headliner, null);
  w.setWeaponActive('lead', true);
  assert.ok(w.headliner?.visible);
  w.clearSandboxEntities();
  assert.equal(w.projectiles.length + w.zones.length + w.undertowWalls.length + w.standingOvations.length, 0);
  assert.ok(w.headliner?.visible, 'sandbox reset recreates the active evolved Lead marker');
}

// Production-shape matrix: every Base IV and evolution runs against a single
// target, dense pack, boss, and knockback-immune target. Effective damage must
// exactly match the surviving enemies' HP loss, and every aftermath stays
// inside its authored cap.
const roles: Role[] = ['kick', 'snare', 'hat', 'arp', 'bass', 'chord', 'lead', 'clap', 'bell'];
const scenarios: Array<{ name: string; kind: EnemyKind; count: number }> = [
  { name: 'single', kind: 'skeleton', count: 1 },
  { name: 'dense', kind: 'skeleton', count: 10 },
  { name: 'boss', kind: 'mantis', count: 1 },
  { name: 'knockback-immune', kind: 'ghost', count: 1 },
];

function fireMatrixSequence(w: RunWorld, role: Role, evolved: boolean): void {
  const send = (extras: Parameters<typeof fire>[2] = {}): void => fire(w, role, { ...extras, evolved });
  switch (role) {
    case 'kick':
      for (const step of [0, 4, 8, 12]) send({ step });
      break;
    case 'hat':
      send({ step: 0, variant: 'closed' });
      send({ step: 2, variant: 'closed' });
      send({ step: 4, variant: 'open' });
      break;
    case 'arp':
      send({ step: 0, note: 0 });
      send({ step: 4, note: 10 });
      send({ step: 8, note: 3 });
      break;
    case 'bass':
      send({ step: 0, variant: 'fat' });
      send({ step: 31, variant: 'sub' });
      break;
    case 'chord':
      send({ step: 0, variant: 'stab' });
      send({ step: 16, variant: 'pad' });
      break;
    case 'lead':
      send({ step: 0, note: 0 });
      send({ step: 4, note: 3 });
      break;
    case 'bell':
      send({ step: 0, note: 0 });
      break;
    default:
      send({ step: 4 });
  }
}

for (const role of roles) {
  for (const evolved of [false, true]) {
    for (const scenario of scenarios) {
      const w = world();
      if (evolved) evolve(w, role);
      else w.addWeapon(role, 4);
      const distance = role === 'hat' ? 25 : role === 'bass' ? 40 : 100;
      const targets: Enemy[] = [];
      for (let i = 0; i < scenario.count; i++) {
        const angle = scenario.count === 1 ? 0 : ((i - (scenario.count - 1) / 2) * 0.035);
        const e = w.spawnEnemyAt(scenario.kind, Math.cos(angle) * distance, Math.sin(angle) * distance);
        assert.ok(e);
        e.speed = 0;
        e.hp = 10_000;
        targets.push(e);
      }
      w.update(DT); // prime the same spatial hash a live trigger sees
      const before = targets.reduce((sum, e) => sum + e.hp, 0);
      fireMatrixSequence(w, role, evolved);
      advance(w, 2);
      const hpLoss = before - targets.reduce((sum, e) => sum + e.hp, 0);
      const attributed = w.damageByRole[role] ?? 0;
      assert.ok(hpLoss > 0, `${role}/${evolved ? 'evolved' : 'base'}/${scenario.name} dealt no damage`);
      close(attributed, hpLoss, `${role}/${evolved ? 'evolved' : 'base'}/${scenario.name} attribution`, 1e-4);
      assert.ok(w.projectiles.length <= 24, `${role} projectile cap leaked`);
      assert.ok(w.zones.length <= 6, `${role} zone group cap leaked`);
      assert.ok(w.undertowWalls.length <= 1, `${role} wall cap leaked`);
      assert.ok(w.standingOvations.length <= 1, `${role} palm aftermath cap leaked`);
      for (const e of targets) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp), `${role} produced invalid enemy state`);
      }
    }
  }
}

console.log('weapon evolution Sub-phase C combat checks passed');
