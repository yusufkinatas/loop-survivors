import type { Role } from '../../audio/kits';
import type { WeaponConf } from '../config';
import type { BuildMods } from '../items';
import type { FxEvent, GravityWell, Projectile, Shockwave, Zone } from '../run';

export interface WeaponTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly dead: boolean;
  /** Chase speed. The kick's fallback knock distance derives from it. */
  readonly speed: number;
  /** Per-bestiary knockback resistance; 0 means immune. */
  readonly knockbackMul: number;
  /** Sandbox practice target: undying, immobile, harmless. Read by exactly one
   *  weapon — a Gravity Bell's well SKIPS dummies rather than dragging them —
   *  and that skip is observable precisely because a dummy is never reaped, so
   *  a dragged one would still be sitting somewhere else at the end of the
   *  frame. Do not confuse it with the `dead` guard beside it in the same loop,
   *  whose effect reapEnemies discards the same frame. */
  readonly dummy: boolean;
  /** Velocity the target actually moved by on the last movement step. Zeroed at
   *  the top of every frame and never set for practice dummies, which is why
   *  the kick's two knock branches are not interchangeable and a dummy always
   *  takes the fallback. */
  readonly lastMoveX: number;
  readonly lastMoveY: number;
}

/** Read-only player state. Modules never move the player. */
interface WeaponPlayer {
  readonly x: number;
  readonly y: number;
  readonly facingX: 1 | -1;
}

export interface WeaponContext {
  // ---------------- identity (bound by the world; a module cannot forge it) ----

  /** The role every damage/kill is attributed to. Bound at construction, NOT a
   *  parameter, so a module physically cannot bill another weapon. */
  readonly role: Role;
  /** ROLE_COLORS[role]. One value for base and evolved alike. */
  readonly color: number;
  /** THE mode flip. A LIVE getter over RunWorld.evolved — not stored state — so
   *  there is no second source of truth and no sync hook at evolve() or
   *  clearEvolutionForSandbox(). Readable from fire() and tick() alike. */
  readonly evolved: boolean;

  // ---------------- queries in ----------------

  /** Simulation clock, seconds. The kick's only scheduling reference. */
  readonly timeS: number;
  /** LIVE player state, re-read on every access — not a snapshot. Load-bearing:
   *  the kick's follow-up strip resamples position and facing 100 ms after the
   *  trigger that scheduled it. */
  readonly player: WeaponPlayer;
  /** Visible world extent (screen pixels / zoom). Redline Stomp's reach is a
   *  fraction of these, so the evolved footprint genuinely depends on canvas
   *  size and aspect ratio. */
  readonly worldW: number;
  readonly worldH: number;
  /** Derived passive + encore multipliers, for the numbers applyBuild does not
   *  reach. Redline Stomp reads knockbackMul; the base strip's knock
   *  deliberately does not. ALLOCATES A NEW OBJECT PER ACCESS
   *  (deriveBuildMods) — read it once per fire, never per enemy. */
  readonly buildMods: BuildMods;
  /** The run's main random stream (RunWorld.rng). Draw order is part of a run's
   *  identity: a module must draw exactly as often as the world code it
   *  replaced, at the same statement. The kick draws ZERO times. */
  rng(): number;

  /** How many times THIS weapon has been triggered in this run, including the
   *  trigger currently being served. RunWorld.fireTrigger increments the
   *  world's per-role counter as part of its shared preamble, BEFORE it calls
   *  fire(), so the fourth trigger reads 4 and Railshot's `% 4 === 0` cadence
   *  is true on it — not on the fifth.
   *
   *  A LIVE getter over the world's counter, never module state. The world
   *  keeps counting whether or not a weapon is migrated, and nothing resets it,
   *  so a module-local tally would be a second source of truth that reset() and
   *  the sandbox loadout editor could drift apart from. */
  readonly triggerCount: number;

  /** The world's auto-aim, as a unit vector: toward the nearest live enemy
   *  inside AIM_RANGE, then jittered by +/- `spread` radians.
   *
   *  THE DRAW COUNT IS NOT CONSTANT. With a target it draws ONCE (the jitter);
   *  with an empty screen it draws TWICE (a random heading, then the jitter).
   *  That asymmetry is part of a run's rng identity, which is why aiming is a
   *  world query and not something a module reimplements over all(). */
  aimDir(spread: number): { x: number; y: number };

  /** Aim ONCE, then hand back one direction per shot this trigger owes —
   *  Double Take's extra shots alternate to either side of the aim line so the
   *  volley stays centred. Exactly one aimDir() no matter how many directions
   *  come back, so the draw count above is per TRIGGER, not per shot. */
  aimFan(spread: number): Array<{ x: number; y: number }>;

  /** The player's persisted WALK HEADING as a unit vector. No targeting, no
   *  jitter, and NO RNG DRAW AT ALL — two triggers while holding one direction
   *  produce the exact same angle. The hat is the only weapon that aims by
   *  steering, and this is the whole of how.
   *
   *  Standing still keeps the LAST heading rather than zeroing it (movePlayer
   *  only writes it when the stick clears its deadzone), and the player starts
   *  the run pointing at (1, 0), so this never comes back as a zero vector. */
  moveDir(): { x: number; y: number };

  /** Spread this trigger's shots around an ALREADY-CHOSEN direction — the same
   *  Double Take fan aimFan applies, minus the aiming. Split out of aimFan for
   *  the hat, which fans around its walk heading and must never consult a
   *  target: `fanAround(moveDir())` is not a spelling of `aimFan(0)`, it is the
   *  version that draws no rng. */
  fanAround(base: { x: number; y: number }): Array<{ x: number; y: number }>;

  /** Candidates from THIS frame's spatial-hash snapshot, in hash bucket order
   *  (cells minX..maxX outer, minY..maxY inner, insertion order within a
   *  bucket). A SUPERSET including dead enemies; callers still run the exact
   *  shape test. That visit order is the base strip's kill order and therefore
   *  its rng draw order; it is NOT world-array order and the two are not
   *  interchangeable.
   *
   *  Returns a scratch buffer owned by THIS context, valid only until the next
   *  near() call on this context. Per-context buffers mean one weapon can never
   *  corrupt another's iteration; a module that calls near() twice with the
   *  first result still live still corrupts itself. */
  near(x: number, y: number, radius: number): readonly WeaponTarget[];

  /** The single closest LIVE enemy inside `range` of the player, or null when
   *  the screen is empty inside that radius. Compares SQUARED distances against
   *  `range * range` with a STRICT `<`, so a body sitting exactly on the
   *  boundary is out of range, not in it.
   *
   *  DRAWS NO RNG. This is the half of aimDir() that does the looking, without
   *  the jitter that costs a draw — which is the whole reason the chord can
   *  throw its zone at a pack for zero draws per trigger. `aimDir(0)` is NOT a
   *  tidier spelling of it: aimDir draws once with a target and twice without.
   *
   *  Reads the world's enemy array in ARRAY order and keeps the FIRST strictly
   *  closest body, so an exact tie goes to whichever spawned earlier. */
  nearestEnemy(range: number): WeaponTarget | null;

  /** The `count` closest LIVE enemies inside `range` of the player, NEAREST
   *  FIRST. For weapons that work on more than one picked target at a time —
   *  Two Hands is the only one, and it snaps a pincer shut on each.
   *
   *  DRAWS NO RNG, like nearestEnemy. Fewer than `count` come back when the
   *  screen is thin, and an EMPTY ARRAY when nothing is in range; Two Hands
   *  branches on that emptiness, so the length is meaningful and not a
   *  convenience.
   *
   *  Reads the world's enemy array, keeps everything with a squared distance
   *  STRICTLY below `range * range`, then SORTS by that distance. The sort is
   *  Array.prototype.sort — not stable across equal distances by specification,
   *  though V8's is — so two bodies at exactly the same distance are not
   *  guaranteed to be handed back in spawn order. Nothing today depends on it.
   *
   *  NOT a repeated nearestEnemy: that one hands back the FIRST strictly closest
   *  body and has no notion of a second place. */
  nearestEnemies(range: number, count: number): readonly WeaponTarget[];

  withExtraPierce(basePierce: number): number;

  /** The world's LIVE enemy array, in array order, by reference — not a copy,
   *  not a snapshot. Includes practice dummies and enemies spawned this frame
   *  that are not yet in the hash, both of which Redline Stomp hits today.
   *
   *  Live is load-bearing: pushEnemy appends, and a JS array iterator re-reads
   *  length, so Redline Stomp's `for..of` visits splitter children that its own
   *  kills push mid-pass. A defensive `[...this.enemies]` would delete those
   *  hits and every rng draw behind them. */
  all(): readonly WeaponTarget[];

  // ---------------- effects out ----------------

  /** Damage with attribution. Routes straight to RunWorld.damageEnemy(target,
   *  amount, role) — one statement, no buffering, no deferral, no batching, no
   *  return value to branch on — so the kill consequences and their rng draws
   *  land at exactly the statement in the module where the old world code
   *  stood. The world sink keeps owning the 'dmg' fx, shield absorption, dummy
   *  absorb-and-refill, Math.min(hp, amount) effective-damage attribution,
   *  damageByRole/killsByRole, the 'death' fx, gem/note/magnet/chest drops and
   *  splitter children. None of that moves. */
  damage(target: WeaponTarget, amount: number): void;

  /** Radial push away from a point (RunWorld.shove). Scales `dist` by the
   *  target's own knockbackMul and EXTENDS any knock in flight
   *  (Math.max(knockT, SHOVE_S)). */
  shove(target: WeaponTarget, fromX: number, fromY: number, dist: number): void;

  /** Raw write of the shared knock channel: velocity assigned, duration
   *  ASSIGNED — not max()'d, so it can SHORTEN a longer knock in flight.
   *  Deliberately distinct from shove(): the kick's reverse-pursuit branch
   *  overwrites where its fallback extends, and it ignores buildMods.knockbackMul
   *  where every other weapon applies it. Two named primitives is how that
   *  asymmetry stays visible instead of being unified away. */
  setKnock(target: WeaponTarget, vx: number, vy: number, durationS: number): void;

  /** Move a body DIRECTLY, by adding a world-space delta to its position. No
   *  knock channel, no knockbackMul, no duration, no suppression of pursuit —
   *  the body is simply somewhere else, and it chases again on the very next
   *  movement step.
   *
   *  DELIBERATELY NOT A THIRD SPELLING OF shove(). shove() and setKnock() both
   *  write a VELOCITY the world then rides for a while, which is why they
   *  interact with each other and with Heavy Amp. A Gravity Bell's well does
   *  not push, it DRAGS: it writes `enemy.x/y` every frame for its whole life,
   *  capped at `min(distance, pullSpeed * dt)` so it can never overshoot its own
   *  centre, and it neither reads nor disturbs a knock in flight. Expressing
   *  that as a knock would change what happens when a body is shoved and pulled
   *  in the same frame — today the pull wins, because the wells run last of all
   *  the damage phases and write position after everything else wrote velocity.
   *
   *  The bell is the only caller. If a second weapon ever wants it, that is the
   *  moment to ask whether it wants a drag or a knock. */
  displace(target: WeaponTarget, dx: number, dy: number): void;

  /** Write the shared SLOW channel on a body: `mul` is FOLDED IN WITH min()
   *  against whatever is already there, `durationS` is ASSIGNED outright.
   *
   *  The asymmetry is the point and it is not tidy-able. Two chord zones
   *  overlapping one enemy must leave it moving at the HARSHER of the two
   *  multipliers, which is what min() gives; the timer is a plain refresh, so
   *  the last zone to tick decides how long the slow outlasts it. A weapon
   *  cannot read the channel back — only fold into it — so there is no route by
   *  which a module could observe, and then undo, another weapon's slow.
   *
   *  The channel is consumed in moveEnemies (`speed *= e.zoneSlowMul` while
   *  `slowT > 0`, and zoneSlowMul resets to 1 the frame the timer runs out), so
   *  a zone that stops renewing releases the body one frame later, not
   *  instantly. Chord is the only weapon that writes here today. */
  slow(target: WeaponTarget, mul: number, durationS: number): void;

  /** Queue a visual. A no-op when the world was built with fx:false, so a
   *  module never branches on whether effects are enabled. */
  fx(event: FxEvent): void;

  // ---------------- projectiles (#140) ----------------
  //
  // The kick spawned nothing, so #139 left every spawn effect off this
  // interface deliberately, to be designed by the first weapon that needed one.
  // The arp is that weapon. STORAGE STAYS WORLD-SIDE — view.ts iterates
  // world.projectiles and the live-shot ceiling in pushProjectile has to hold
  // across every weapon at once — so what a module gets is a spawn effect plus
  // a query over its OWN shots, exactly as the note at the bottom of this file
  // predicted.

  /** Spawn one projectile attributed to this weapon. Routes to the world's own
   *  baseProjectile + pushProjectile — the module owns none of the defaulting
   *  and none of the ceiling.
   *
   *  Returns the LIVE object, already in the world, so the module can set the
   *  few fields only it understands (the arp's orbit angle, radius and
   *  direction). It is genuinely mutable, unlike WeaponTarget: the seam already
   *  hands modules real Projectiles through ProjectileBehavior.steer, which
   *  cannot do its job without writing pr.x and pr.y. One mutable type, used
   *  consistently, beats a parallel readonly view that steer() would have to
   *  cast away anyway. */
  spawnProjectile(conf: WeaponConf, damage: number): Projectile;

  /** This weapon's live projectiles, in world-array order — oldest spawned
   *  first. A fresh array per call, so it is safe to splice from while
   *  retiring. Does NOT include other weapons' shots: a module cannot see, let
   *  alone retire, another weapon's projectiles. */
  projectiles(): readonly Projectile[];

  /** Remove one projectile from the world immediately, by identity. Event
   *  Horizon's orbiter cap is the only caller: it retires its own oldest
   *  orbiters at fire time rather than waiting for them to expire. */
  retireProjectile(projectile: Projectile): void;

  // ---------------- shockwaves (#141) ----------------
  //
  // The bass is the weapon the note at the bottom of this file reserved these
  // for, and it needed them for its EVOLUTION rather than its base mode: a
  // Subquake is an expanding ring living in world.shockwaves, an array the view
  // draws and clearSandboxEntities empties. So STORAGE STAYS WORLD-SIDE for
  // exactly the reason projectile storage did, and what a module gets is a
  // spawn effect plus a query over its OWN rings — the same three-member shape
  // spawnProjectile/projectiles/retireProjectile set.
  //
  // What is DIFFERENT here, and the reason this trio is not just a copy: the
  // world has no update loop for these any more. RunWorld.updateShockwaves is
  // gone, and the module's own tick() (tickAt 'shockwaves') is the only code
  // that grows a ring, tests it against bodies or retires it. The module is the
  // array's SOLE MUTATOR; the world only stores and draws.

  /** Spawn one shockwave attributed to this weapon, and return the LIVE object
   *  already in the world so the module's tick() can grow it.
   *
   *  The module supplies the geometry and the payload; the world supplies the
   *  identity (`source`, `color`) and the bookkeeping every ring starts with
   *  (`age` 0, an empty `hit` set) — a module cannot forge attribution here any
   *  more than it can through damage(). */
  spawnShockwave(spec: ShockwaveSpec): Shockwave;

  /** This weapon's live shockwaves, in world-array order — oldest spawned
   *  first. A fresh array per call, so it is safe to retire from while walking
   *  it. Does NOT include another weapon's rings. */
  shockwaves(): readonly Shockwave[];

  /** Remove one shockwave from the world immediately, by identity. This is how
   *  a ring that has run out of life leaves; there is no world-side sweep. */
  retireShockwave(wave: Shockwave): void;

  // ---------------- zones (#141) --------------------------------------------
  //
  // The chord is the weapon the note at the bottom of this file reserved these
  // for, and it is the third time the same three-member shape has been the
  // right answer: world-side STORAGE (view.ts draws world.zones and
  // clearSandboxEntities empties it), a spawn effect, and a query over the
  // module's OWN zones.
  //
  // As with shockwaves, the world has no update loop for these any more.
  // RunWorld.updateZones is gone — ticks, the Afterhours drift, the merge pass
  // and retirement all live in weapons/chord.ts, which is the array's SOLE
  // MUTATOR. That matters more here than it did for the bass: updateZones was
  // inside the shared-physics guard's protected set, so the alternative to
  // moving the whole loop was leaving a per-weapon branch in shared physics.

  /** Spawn one zone attributed to this weapon, and return the LIVE object
   *  already in the world so the module's tick() can grow, drift and merge it.
   *
   *  The module supplies the geometry, the payload and the zone's whole
   *  character; the world supplies the identity (`source`, `color`) and the one
   *  piece of bookkeeping every zone starts with — `tickT` at ZERO, which is
   *  why a zone always lands one tick on the first frame it exists rather than
   *  waiting out an interval first. */
  spawnZone(spec: ZoneSpec): Zone;

  /** This weapon's live zones, in world-array order — oldest spawned first. A
   *  fresh array per call, so it is safe to retire from while walking it. Does
   *  NOT include another weapon's zones. */
  zones(): readonly Zone[];

  /** Remove one zone from the world immediately, by identity. Both a zone that
   *  ran out of life and a zone absorbed by a merge leave this way; there is no
   *  world-side sweep. */
  retireZone(zone: Zone): void;

  // ---------------- gravity wells (#141) ------------------------------------
  //
  // The FOURTH and LAST entity kind, and the one the note at the bottom of this
  // file reserved by name. The bell is the weapon that needed it, and the shape
  // is the same one projectiles, shockwaves and zones settled into: world-side
  // STORAGE (view.ts draws world.gravityWells and clearSandboxEntities empties
  // it), a spawn effect, and a query over this module's OWN wells.
  //
  // Like the shockwave and zone trios, and unlike the projectile one, the world
  // has no update loop for these any more. RunWorld.updateGravityWells is gone
  // and weapons/bell.ts is the array's SOLE MUTATOR. That was the last method in
  // the shared-physics guard's protected set that belonged to one weapon, so the
  // guard now watches only the two genuinely shared projectile loops.

  /** Spawn one gravity well attributed to this weapon, and return the LIVE
   *  object already in the world so the module's tick() can age it.
   *
   *  The module supplies the geometry and the burst payload; the world supplies
   *  the identity (`source`, `color`) and the bookkeeping every well starts with
   *  — `burst` false, i.e. its one burst is still owed. */
  spawnGravityWell(spec: GravityWellSpec): GravityWell;

  /** This weapon's live wells, in world-array order — oldest spawned first. A
   *  fresh array per call, so it is safe to retire from while walking it. */
  gravityWells(): readonly GravityWell[];

  /** Remove one well from the world immediately, by identity. A well that ran
   *  out of life leaves this way; there is no world-side sweep. */
  retireGravityWell(well: GravityWell): void;
}

/** Everything a module chooses about a new gravity well. Deliberately NOT the
 *  whole GravityWell: `source`, `color` and `burst` are the world's to fill in,
 *  so they cannot be got wrong from a module. */
interface GravityWellSpec {
  /** Well centre, in world coordinates. A POINT, not a body, and it never
   *  moves: a well is anchored where the note that opened it made contact, and
   *  the player walking away does not drag it. */
  readonly x: number;
  readonly y: number;
  /** How far the pull reaches. Bodies outside are untouched. */
  readonly radius: number;
  /** Seconds the well lives. */
  readonly lifeS: number;
  /** Units per second a body is dragged toward the centre, capped per frame at
   *  the remaining distance so the pull never overshoots. */
  readonly pullSpeed: number;
  /** Seconds until the well throws its single shard burst. Counts down from
   *  spawn and is allowed to go negative; `burst` is what makes it once-only. */
  readonly burstT: number;
  /** Damage each shard of that burst carries. */
  readonly burstDamage: number;
}

/** Everything a module chooses about a new zone. Deliberately NOT the whole
 *  Zone: `source`, `color` and `tickT` are the world's to fill in, so they
 *  cannot be got wrong from a module. */
interface ZoneSpec {
  /** Zone centre, in world coordinates. A POINT, not a body — an Afterhours
   *  zone moves under its own drift and a base zone never moves at all, so
   *  neither one tracks anything it was spawned on. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Damage dealt to everything inside, ONCE PER TICK, for the zone's whole
   *  life — not once per zone. */
  readonly damage: number;
  readonly lifeS: number;
  /** Whether a tick also slows what it covers. */
  readonly slow: boolean;
  /** Frozen at spawn, and NOT a live read of ctx.evolved: a zone thrown before
   *  the weapon evolved keeps base behavior — no drift, the base slow, and
   *  immunity from the merge pass — for the rest of its life, while Afterhours
   *  zones spawned after it drift straight over the top of it. */
  readonly evolved: boolean;
  /** Units per second the zone crawls toward the densest pack. 0 pins it. */
  readonly driftSpeed: number;
  /** Ceiling on what merging can raise `damage` to. Frozen at spawn from the
   *  zone's own damage, so a merged supercell's ceiling is the ceiling of
   *  whichever zone SURVIVED the merge. */
  readonly damageCap: number;
  /** Speed multiplier written onto everything a tick covers. */
  readonly slowMul: number;
}

/** Everything a module chooses about a new shockwave. Deliberately NOT the
 *  whole Shockwave: `source`, `color`, `age` and `hit` are the world's to fill
 *  in, so they cannot be got wrong from a module. */
interface ShockwaveSpec {
  /** Ring centre, in world coordinates. A POINT, not a body: Subquake anchors
   *  at the fire-time player position and never moves afterwards, which is why
   *  this is passed once at spawn rather than re-read in tick(). */
  readonly x: number;
  readonly y: number;
  /** Radius the ring starts at, before its first growth step. */
  readonly radius: number;
  /** Radius it reaches at the end of its growth. */
  readonly maxRadius: number;
  /** Seconds the ring lives. */
  readonly lifeS: number;
  /** Damage dealt to each body the edge crosses, once each. */
  readonly damage: number;
  /** Knock distance away from the ring's CENTRE on that hit, already scaled by
   *  buildMods.knockbackMul — the world does not scale it again. */
  readonly shove: number;
}

