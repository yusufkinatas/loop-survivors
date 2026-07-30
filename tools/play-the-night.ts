// THE CIRCUIT (#270), driven headless for a full night.
//
//   npx tsx tools/play-the-night.ts [seed] [--route=greedy|summit|loiter]
//
// WHY THIS EXISTS. #270's hard floor is a MEASUREMENT, not a feeling:
//
//   > A run's density must fall at least once because the player chose it, and
//   > the run's loudness range must clear 0.6 LU.
//
// The second half is an audio capture and needs a browser. The FIRST half does
// not, and it is the half a browser is worst at judging — "did density fall, and
// was it the player's choice or the game's?" is a question about a whole run's
// trace, and reading it off a live playthrough by ear is exactly how
// `docs/baseline/` ended up needing nine captures to say something a table says
// in one line.
//
// So this drives a real RunWorld through a real night with a real route, and
// reports the trace. `tools/verify-weapons.ts` established the pattern and its
// reasoning applies unchanged: the world and the weapon modules touch no DOM, and
// requestAnimationFrame does not run in a hidden tab, so driving the world
// directly is both honest and faster than automating a browser.
//
// WHAT IT HAS TO SIMULATE ITSELF. The bar line lives in the shell (game.ts), not
// in the world, because pricing a bar needs the audio clock. So this file carries
// its own copy of the four shell behaviours the economy depends on — the bar
// tick, the brownout, the Blackout, and the level-up scoop — and says so loudly:
// if the shell's rules change, this harness is a second place to change. It is
// worth that, because the alternative is not measuring the run shape at all.

import { PALETTE_ATTACK, type Attack, type Role } from '../src/audio/kits';
import { RunWorld } from '../src/game/run';
import { rollOffers, rollStartingWeapons } from '../src/game/picks';
import { WEAPON_MAX_LEVEL, chartStageForLevel } from '../src/game/weapons/levels';
import { VICTORY } from '../src/game/config';
import { mulberry32 } from '../src/game/rng';
import { createGreedyMover } from '../src/game/auto-move';
import { costPerBar, upkeepFloor } from '../src/circuit/upkeep';
import { coveredAttacks } from '../src/circuit/coverage';
import { STREET_REGEN_MUL, VENUES, venueWants, type Venue } from '../src/circuit/venues';
import { doorBlockedReason } from '../src/circuit/venues';
import { ATTACK_VERB } from '../src/circuit/coverage';
import { CIRCUIT } from '../src/circuit/toggles';

const SIM_DT = 1 / 60;
/** `--invincible` drives the WHOLE night rather than however long a bot survives.
 *
 *  Needed because the interesting half of this economy is late: a five-weapon maxed
 *  band draws 34 units a bar against an opening budget of 8, and the bot dies at
 *  four or five minutes with three level-2 voices drawing 4.3. Every mortal run
 *  measures the opening and nothing else, and "does the budget bite" is a question
 *  about minute twenty.
 *
 *  It is an INSTRUMENT, not a claim about difficulty: an invincible run says what the
 *  economy does to a build that keeps growing, and says nothing about whether the
 *  pressure is fair. Both numbers are reported separately for that reason. */
const INVINCIBLE = process.argv.includes('--invincible');
const seedArg = process.argv.find((a) => /^\d+$/.test(a));
const SEED = seedArg ? Number(seedArg) : 0xc19c1;
const routeArg = process.argv.find((a) => a.startsWith('--route='))?.slice(8) ?? 'greedy';

/** THE PLAYER. Three routes, because the whole question this stack asks is which
 *  route a player takes and what it costs them:
 *
 *   `greedy` — play every room you can reach, nearest first. The wide build.
 *   `summit` — the minimum three rooms, then straight to the Attic. The rush.
 *   `loiter` — never leave the street after the first room. The degenerate case,
 *              included because "kite on the street forever" is the obvious
 *              exploit and a design that only works when the player cooperates
 *              is not a design. */
type Route = 'greedy' | 'summit' | 'loiter';
const ROUTE = (['greedy', 'summit', 'loiter'] as Route[]).includes(routeArg as Route)
  ? (routeArg as Route)
  : 'greedy';

interface Sample {
  timeS: number;
  level: number;
  kills: number;
  alive: number;
  /** Triggers a bar the PLAYING band fires: the density number. */
  density: number;
  /** Triggers a bar everything OWNED would fire, playing or not. The gap between
   *  this and `density` is the thinning the player chose. */
  ownedDensity: number;
  pool01: number;
  bank01: number;
  where: string;
  blackout: boolean;
  covered: number;
}

const log: string[] = [];
const samples: Sample[] = [];
let brownoutEvents = 0;
let blackoutEvents = 0;
let densityFalls: { timeS: number; from: number; to: number; cause: string }[] = [];

const deactivated = new Set<Role>();
const rng = mulberry32(SEED);
/** The reason the LAST change to the playing band happened, so a fall in density
 *  can be attributed. This is the whole point of the harness: the hard floor asks
 *  for a fall the PLAYER chose, and "the player chose it" is a fact about the
 *  cause, not about the shape of the curve. */
let lastCause = 'opening';

const world = new RunWorld(
  { width: 1280, height: 800 },
  {
    onLevelUp: () => {
      pendingLevels += 1;
    },
    onDeath: () => {
      died = true;
    },
    onVictory: () => {
      won = true;
    },
    onHit: () => {},
    onVenueEntered: (venue, set) => {
      bpm = set.bpm;
      log.push(`${clock()}  ENTER ${venue.name} — ${set.act} @ ${set.bpm}bpm, wants ${venueWants(set).map((a) => ATTACK_VERB[a]).join('+') || 'nothing'}`);
    },
    onVenueBlocked: (_venue, reason) => log.push(`${clock()}  SHUT  ${reason}`),
    onVenueLeft: (venue, midSet) => {
      bpm = 122;
      log.push(`${clock()}  LEAVE ${venue.name}${midSet ? ' (mid-set)' : ''}`);
    },
    onVenueFinished: (venue, _set, headliner) => {
      bpm = 122;
      log.push(`${clock()}  DONE  ${venue.name}${headliner ? ' — THE HEADLINE SLOT' : ''}`);
    },
    onCoverageChip: (armour, needs) => log.push(`${clock()}  LEARN ${armour} needs ${ATTACK_VERB[needs]}`),
  },
  { fx: false, rng, control: () => steer(), deactivated },
);

/** Null with every layer switched off, which is the CONTROL this harness has to be
 *  able to run: `CIRCUIT=none npx tsx tools/play-the-night.ts` drives the base's own
 *  Mad Forest run through the identical player, so the branch's numbers have
 *  something to be numbers next to. Every read of it below is guarded. */
const circuit = world.circuit;
let bpm = 122;
let pendingLevels = 0;
let died = false;
let won = false;
let barAcc = 0;
/** Fractional triggers each voice is owed, so a chart's rate survives a
 *  sub-trigger frame instead of being rounded away sixty times a second. */
const triggerDebt = new Map<Role, number>();

function clock(): string {
  const t = world.timeS;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

/**
 * THE PLAYER'S HANDS: the game's own kiter, plus a pull toward the room the route
 * wants next.
 *
 * The first version of this harness walked to the middle of a room and stood
 * there. It died at 0:18 to eight bats, which measured the harness's inability to
 * dodge rather than anything about the run shape. `createKiter` is the mover the
 * game itself ships behind its auto-move button, so a run driven by it is a run
 * the branch can actually be watched playing.
 *
 * The route pull is scaled by how close the room is: strong out on the street,
 * weak once inside, so a set is played by circling the room rather than by
 * standing in the doorway. The mover's own vector always survives, which is what
 * keeps the harness alive through a boss.
 *
 * `createGreedyMover` rather than `createKiter`, and the difference is measurable:
 * the pure kiter flees everything, so with a weak build it simply outruns the crowd
 * and kills nothing — 29 kills in two and a half minutes. The greedy mover chases
 * experience while still orbiting away from packs, which is what a player actually
 * does and what makes the build grow at all.
 */
const kite = createGreedyMover();

function steer(): { x: number; y: number } {
  const evade = kite(world);
  const target = routeTarget();
  if (!target) return evade;
  const dx = target.x - world.player.x;
  const dy = target.y - world.player.y;
  const d = Math.hypot(dx, dy) || 1;
  // Inside the room already: a light pull toward the middle, so the kiter cannot
  // wander out of the door it just came through and pause its own set.
  const inside = d < target.radius * 0.7;
  const pull = inside ? 0.1 : 2.2;
  const x = evade.x + (dx / d) * pull;
  const y = evade.y + (dy / d) * pull;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function routeTarget(): Venue | null {
  // No map: the base's single arena. Stand and fight, which is what Mad Forest is.
  if (!circuit || !CIRCUIT.nightOut) return null;
  if (ROUTE === 'loiter') {
    // One room, then out to a fixed spot on the street and stay there.
    if (circuit.finishedCount === 0) return VENUES[0];
    return null;
  }
  const covered = circuit.covered(world.tiers);
  const open = (venue: Venue): boolean =>
    !circuit.finished.has(venue.id) &&
    !doorBlockedReason(venue, covered, circuit.finishedCount, (a) => ATTACK_VERB[a]);
  const attic = VENUES.find((v) => v.headliner)!;
  if (ROUTE === 'summit' && open(attic)) return attic;
  // Stay put while the room you are in is still playing its set.
  if (circuit.place.venue && circuit.place.playing) return circuit.place.venue;

  /** Can this band answer what the room's crowd is made of? THE TELEGRAPH, READ.
   *
   *  Added because the harness died without it, and the death was the design
   *  working rather than failing: a band covering impact and sustained walked into
   *  a room whose entire crowd is shielded, correctly muted its impact voice
   *  because the room did not need it, and then had nothing that could hurt
   *  anything. 320 off-kind hits, 0% answered, dead at 3:56.
   *
   *  A human does not do that. They read the floor plate — "SPEED NIGHT · WANTS
   *  CUT" — see no CUT on the wheel, and walk somewhere else. That IS the route
   *  decision this stack exists to create, and a harness that ignores it is not
   *  measuring the stack. */
  const answerable = (venue: Venue): boolean => {
    if (!CIRCUIT.coverage) return true;
    const wants = venueWants(circuit.bill.get(venue.id)!);
    return wants.every((attack) => covered.has(attack));
  };

  let best: Venue | null = null;
  let bestD = Infinity;
  let fallback: Venue | null = null;
  let fallbackD = Infinity;
  for (const venue of VENUES) {
    if (!open(venue)) continue;
    // The Attic ends the night, so the greedy route saves it for last.
    if (ROUTE === 'greedy' && venue.headliner && circuit.finishedCount < VENUES.length - 1) continue;
    const d = (venue.x - world.player.x) ** 2 + (venue.y - world.player.y) ** 2;
    if (answerable(venue)) {
      if (d < bestD) {
        bestD = d;
        best = venue;
      }
    } else if (d < fallbackD) {
      fallbackD = d;
      fallback = venue;
    }
  }
  // Nothing the band can answer: take the nearest room anyway rather than standing
  // still forever. A player in that spot is in real trouble and should be — it is a
  // build that bet on a kind not turning up and lost the bet.
  return best ?? fallback ?? (open(attic) ? attic : null);
}

/** The band as it is playing — everything owned when there is no economy to mute
 *  anything, which is what the control is. */
function playingBand(): Role[] {
  if (!circuit) return [...world.tiers.keys()];
  return circuit.activeBand(world.tiers);
}

/** Triggers a bar for a set of roles at their live levels. */
function density(roles: readonly Role[]): number {
  let total = 0;
  for (const role of roles) total += costPerBar(role, world.tiers.get(role) ?? 0);
  return total;
}

/** THE SHELL'S BAR LINE, replayed. Kept deliberately close to game.ts's
 *  addBarListener so the two can be diffed by eye. */
function barLine(): void {
  if (!circuit || !CIRCUIT.headroom) return;
  const headroom = circuit.headroom;
  // Blackout: spend a full bank the moment it is full. A real player picks their
  // moment; a harness that waited for one would be measuring its own judgment.
  if (circuit.blackoutAvailable()) {
    if (headroom.startBlackout()) {
      blackoutEvents += 1;
      for (const role of [...deactivated]) deactivated.delete(role);
      lastCause = 'blackout';
      log.push(`${clock()}  PEAK  blackout — everything owned, ${headroom.blackoutBars} bars`);
      return;
    }
  }
  const wasBlackout = headroom.blackout;
  const before = density(circuit.activeBand(world.tiers));
  const outcome = headroom.atBarLine(circuit.activeBand(world.tiers), (role) => world.tiers.get(role) ?? 0);
  if (wasBlackout && !headroom.blackout) {
    log.push(`${clock()}  ---   lights back up`);
    lastCause = 'blackout ended';
  }
  if (outcome.brownedOut.length > 0) {
    brownoutEvents += 1;
    for (const role of outcome.brownedOut) deactivated.add(role);
    lastCause = `brownout (${outcome.brownedOut.join(', ')})`;
    log.push(`${clock()}  CUT   brownout dropped ${outcome.brownedOut.join(', ')}`);
  }

  // THE PLAYER'S OWN THINNING, and this is the behaviour the hard floor is about.
  //
  // Two reasons a real player mutes, in priority order, and both are the design
  // asking for it rather than the harness being clever:
  //
  //  1. THE ROOM DOES NOT NEED THIS VOICE. In a room whose whole roster is
  //     shielded, an impact voice is doing 12% damage while eating full upkeep.
  //     Switching it off costs almost nothing and banks the difference. This is
  //     the interlock the stack was assembled for — Coverage tells you WHICH voice
  //     to drop and Headroom pays you for dropping it — and it is why the density
  //     fall is a choice rather than a sacrifice.
  //  2. THE BAND IS OVER BUDGET. Failing that, drop the most expensive thing you
  //     can spare before the brownout drops it for you.
  //
  // Every mute made here is recorded as a PLAYER cause, which is what the hard
  // floor's "because the player chose it" clause is checked against.
  const band = circuit.activeBand(world.tiers);
  const room = circuit.place.playing ? circuit.place.set : null;
  const needed = new Set<Attack>(room && CIRCUIT.coverage ? venueWants(room) : []);
  /** Voices that can be dropped without leaving the room's demand unanswered. */
  const sparable = (roles: readonly Role[]): Role[] =>
    roles
      .filter((role) => {
        const attack = PALETTE_ATTACK[role];
        if (!attack || !needed.has(attack)) return true;
        return roles.filter((other) => PALETTE_ATTACK[other] === attack).length > 1;
      })
      .sort((a, b) => costPerBar(b, world.tiers.get(b) ?? 0) - costPerBar(a, world.tiers.get(a) ?? 0));

  // A TWO-VOICE BAND DOES NOT SPECIALISE. Muting the off-kind half of a two-piece
  // leaves one voice and almost no output, which is how the harness talked itself
  // into 29 kills in three minutes. Three playing voices is the floor at which
  // dropping one is a decision rather than a collapse — and it is the same
  // judgment a player makes without being told.
  if (!headroom.blackout && band.length >= 3) {
    const useless = needed.size > 0
      ? sparable(band).filter((role) => {
          const attack = PALETTE_ATTACK[role];
          return !attack || !needed.has(attack);
        })
      : [];
    if (useless.length > 0) {
      deactivated.add(useless[0]);
      lastCause = `player muted ${useless[0]}`;
      log.push(`${clock()}  THIN  player muted ${useless[0]} — this room does not need it`);
    } else if (density(band) > headroom.regen * 1.15) {
      const spare = sparable(band);
      if (spare.length > 0) {
        deactivated.add(spare[0]);
        lastCause = `player muted ${spare[0]}`;
        log.push(`${clock()}  THIN  player muted ${spare[0]} to stay inside the budget`);
      }
    }
  }
  // And back on when the room changes or there is room in the budget again: the
  // resting state is partial, not permanently minimal.
  if (!headroom.blackout && deactivated.size > 0) {
    // A voice this room DOES need comes straight back on, whatever it costs: being
    // unable to hurt the thing in front of you outranks the budget.
    //
    // ONLY voices the room specifically needs. The first version treated "the room
    // needs nothing" as "the room needs everything", so in a room with no armour at
    // all every muted voice qualified — and the over-budget mute and this rule took
    // turns on the same voice every two seconds for the whole set.
    const wanted = needed.size === 0
      ? []
      : [...deactivated].filter((role) => {
          const attack = PALETTE_ATTACK[role];
          return world.tiers.has(role) && attack && needed.has(attack);
        });
    // Only fall back to "there is budget room, bring something back" when the room
    // is not asking for anything in particular. Without that guard the two rules
    // fight: the room-does-not-need-it mute switches the kick off, the there-is-
    // room rule switches it straight back on, and the trace oscillates every two
    // seconds. A player who muted a voice on purpose does not un-mute it until
    // the reason changes.
    // A DOOR YOU ARE ONE KEY AWAY FROM. Standing on the street with nothing in
    // front of you, the reason to switch a voice back on is not the room you are in
    // — it is the room you cannot get into. Without this the harness sat between the
    // street and a finished room for the last fourteen minutes of a night, owning a
    // muted bright-transient voice and locked out of both remaining doors.
    const opensADoor = needed.size > 0 ? undefined : [...deactivated].find((role) => {
      const attack = PALETTE_ATTACK[role];
      if (!attack || !world.tiers.has(role)) return false;
      const withIt = new Set([...circuit.covered(world.tiers), attack]);
      return VENUES.some((venue) =>
        !circuit.finished.has(venue.id)
        && doorBlockedReason(venue, circuit.covered(world.tiers), circuit.finishedCount, (a) => ATTACK_VERB[a])
        && !doorBlockedReason(venue, withIt, circuit.finishedCount, (a) => ATTACK_VERB[a]));
    });
    const back = wanted[0] ?? opensADoor
      ?? (needed.size > 0 ? undefined : [...deactivated]
        .filter((role) => world.tiers.has(role))
        .sort((a, b) => costPerBar(a, world.tiers.get(a) ?? 0) - costPerBar(b, world.tiers.get(b) ?? 0))
        // Against the band as it stands NOW, not as it stood before this bar line's
        // mute — a stale read here is the other half of the same oscillation.
        .find((role) => headroom.pool01 > 0.8
          && density(circuit.activeBand(world.tiers)) + costPerBar(role, world.tiers.get(role) ?? 0)
            <= headroom.regen * 1.1));
    if (back) {
      deactivated.delete(back);
      lastCause = `player unmuted ${back}`;
      log.push(`${clock()}  BACK  player switched ${back} back on${back === opensADoor ? ' — it opens a door' : ''}`);
    }
  }

  const after = density(circuit.activeBand(world.tiers));
  if (after < before - 0.01) densityFalls.push({ timeS: world.timeS, from: before, to: after, cause: lastCause });
}

/** The level-up scoop, replayed. Takes the first offer every time, which is a
 *  worse player than a human but a CONSISTENT one — the point is the run shape,
 *  not the build's quality. Weapon levels land immediately rather than at a bar
 *  line: the harness has no audio, so there is no old-tier trigger in the air to
 *  protect. */
const headroomTaken = new Map<'capacity' | 'regen' | 'bank', number>();
function scoop(): void {
  while (pendingLevels > 0) {
    pendingLevels -= 1;
    const offers = rollOffers({
      tiers: world.tiers,
      pendingTiers: new Map(),
      rng,
      timeS: world.timeS,
      headroomTaken: CIRCUIT.headroom && circuit ? headroomTaken : undefined,
      covered: CIRCUIT.coverage ? coveredAttacks([...world.tiers.keys()]) : undefined,
    });
    // A PLAUSIBLE PLAYER, in three priorities, and the ordering is measured rather
    // than assumed:
    //
    //  1. Fill a coverage hole while fewer than two kinds are answered. Below two
    //     the build cannot fight most of the bestiary.
    //  2. Otherwise LEVEL SOMETHING YOU ALREADY OWN. The first version always took
    //     the widest option, which spread five slots across five level-1 weapons and
    //     produced a build with no damage anywhere — three level-1 voices at 2:30,
    //     which is not a player, it is a collector.
    //  3. Failing both, whatever is on the table.
    const covered = coveredAttacks([...world.tiers.keys()]);
    const fillHole = covered.size < 2
      ? offers.find((o) => o.kind === 'weapon' && !covered.has(PALETTE_ATTACK[o.role]!))
      : undefined;
    const pick =
      fillHole ??
      offers.find((o) => o.kind === 'weapon' && (world.tiers.get(o.role) ?? 0) > 0) ??
      offers.find((o) => o.kind === 'weapon') ??
      offers[0];
    if (pick.kind === 'weapon') {
      const level = Math.min(WEAPON_MAX_LEVEL, (world.tiers.get(pick.role) ?? 0) + 1);
      world.addWeapon(pick.role, level);
      lastCause = `hired/levelled ${pick.role}`;
    } else if (pick.kind === 'headroom' && circuit) {
      headroomTaken.set(pick.upgrade, (headroomTaken.get(pick.upgrade) ?? 0) + 1);
      const floor = upkeepFloor();
      const headroom = circuit.headroom;
      if (pick.upgrade === 'capacity') headroom.poolMax += floor * 4;
      else if (pick.upgrade === 'regen') headroom.regen += floor;
      else {
        headroom.bankMax += floor;
        headroom.blackoutBars += 1;
      }
    } else {
      world.applyEncoreChoice(pick.encore);
    }
  }
}

// ---- the night ------------------------------------------------------------

// The opening hire, as startRun does it.
if (INVINCIBLE) world.invincible = true;
const opening = rollStartingWeapons({ tiers: world.tiers, rng, timeS: 0 });
world.addWeapon(opening[0].role, 1);
log.push(`${clock()}  OPEN  ${opening[0].role} (offered ${opening.map((o) => o.role).join(', ')})`);

let step = 0;
const MAX_STEPS = Math.ceil((VICTORY.atS + 5) / SIM_DT);
while (step < MAX_STEPS && !died && !won) {
  step += 1;
  world.update(SIM_DT);
  scoop();
  // The audio clock's bar, derived from the live tempo exactly as the shell does.
  // THE BAND, PLAYED AT ITS REAL RATE. The first version of this loop fired each
  // playing role ONCE a bar, which is between a quarter and a thirteenth of what
  // its chart actually fires — so the harness killed four enemies in a minute and
  // forty, never reached level 2, and measured nothing but its own starvation.
  //
  // `costPerBar` IS the trigger count (upkeep is priced per trigger), so the same
  // number that prices a voice also paces it. Spread across the bar rather than
  // burst at the bar line, because the pool's within-bar shape is the thing the
  // player is supposed to feel.
  //
  // And the pool is charged by `world.fireTrigger`, exactly as it is in the game —
  // the first version ALSO charged it by hand here, which double-billed every note.
  const barsThisStep = (bpm * SIM_DT) / 240;
  for (const role of playingBand()) {
    const owed = (triggerDebt.get(role) ?? 0) + costPerBar(role, world.tiers.get(role) ?? 0) * barsThisStep;
    let left = owed;
    while (left >= 1) {
      left -= 1;
      world.fireTrigger({ role, time: 0, velocity: 0.9, step: step % 64 });
    }
    triggerDebt.set(role, left);
  }
  barAcc += barsThisStep;
  while (barAcc >= 1) {
    barAcc -= 1;
    if (circuit && CIRCUIT.headroom) {
      circuit.tickEconomy(
        1,
        circuit.activeBeds(world.tiers),
        CIRCUIT.nightOut && !circuit.place.playing ? STREET_REGEN_MUL : 1,
      );
    }
    barLine();
  }
  if (step % 60 === 0) {
    samples.push({
      timeS: world.timeS,
      level: world.level,
      kills: world.kills,
      alive: world.enemyCount,
      density: density(playingBand()),
      ownedDensity: density([...world.tiers.keys()]),
      pool01: circuit?.headroom.pool01 ?? 1,
      bank01: circuit?.headroom.bank01 ?? 0,
      where: circuit && CIRCUIT.nightOut ? (circuit.place.venue?.name ?? 'street') : 'the arena',
      blackout: circuit?.headroom.blackout ?? false,
      covered: circuit ? circuit.covered(world.tiers).size : 3,
    });
  }
}

// ---- the report -----------------------------------------------------------

const playerFalls = densityFalls.filter((f) => f.cause.startsWith('player'));
const peak = Math.max(...samples.map((s) => s.density));
const trough = Math.min(...samples.map((s) => s.density));

console.log(`\n=== THE CIRCUIT — one night, seed ${SEED}, route ${ROUTE} ===`);
console.log(`layers: headroom=${CIRCUIT.headroom} coverage=${CIRCUIT.coverage} nightOut=${CIRCUIT.nightOut}${INVINCIBLE ? ' · INVINCIBLE (measuring the economy, not the difficulty)' : ''}\n`);
for (const line of log) console.log(line);

console.log(`\n--- outcome ---`);
// Design call 9: only the Headliner is a win. Closing time is survival.
const ending = died
  ? 'DIED'
  : world.nightOutcome === 'headliner'
    ? 'WON — PLAYED THE HEADLINE SLOT'
    : won
      ? 'SURVIVED TO CLOSING — not a win, the night ran out'
      : 'ran out of steps';
console.log(`ended ${clock()} · ${ending}`);
if (circuit && CIRCUIT.nightOut) console.log(`rooms played ${circuit.finishedCount}/${VENUES.length}`);
console.log(`level ${world.level} · kills ${world.kills}`);
console.log(`band owned ${[...world.tiers.keys()].join(', ') || 'none'}`);
if (circuit) console.log(`covered ${[...circuit.covered(world.tiers)].map((a) => ATTACK_VERB[a]).join('+') || 'NOTHING'}`);

console.log(`\n--- the hard floor (#256) ---`);
console.log(`density peak ${peak.toFixed(1)} triggers/bar, trough ${trough.toFixed(1)}`);
console.log(`density falls: ${densityFalls.length} total, ${playerFalls.length} caused by a player choice`);
console.log(playerFalls.length > 0
  ? `PASS — density fell because the player chose it (first at ${fmt(playerFalls[0].timeS)}: ${playerFalls[0].from.toFixed(1)} -> ${playerFalls[0].to.toFixed(1)}, ${playerFalls[0].cause})`
  : 'FAIL — density never fell by the player\'s choice');
console.log(`(loudness range is an audio measurement and needs the browser rig — see docs/circuit.md)`);

if (circuit && CIRCUIT.headroom) {
  console.log(`\n--- the economy ---`);
  console.log(`regeneration ${circuit.headroom.regen.toFixed(1)}/bar (floor ${upkeepFloor().toFixed(1)}) · pool depth ${circuit.headroom.poolMax.toFixed(1)}`);
  console.log(`brownouts ${brownoutEvents} · blackouts ${blackoutEvents}`);
  console.log(`drawn ${Math.round(circuit.headroom.drawnTotal)} · banked ${Math.round(circuit.headroom.bankedTotal)}`);
}

if (CIRCUIT.coverage) {
  console.log(`\n--- coverage ---`);
  const hits = world.onKindHits + world.offKindHits;
  console.log(`hits answered ${hits > 0 ? Math.round((world.onKindHits / hits) * 100) : 0}% (${world.onKindHits} on-kind, ${world.offKindHits} off-kind)`);
  console.log(`damage into the wrong body ${Math.round(world.chipWasted)}`);
}

console.log(`\n--- the trace (every 30 s) ---`);
console.log('time   where            lvl  kills alive  playing  owned   pool  bank  answers');
for (const s of samples.filter((_, i) => i % 30 === 0)) {
  console.log(
    `${fmt(s.timeS).padEnd(6)} ${s.where.padEnd(16)} ${String(s.level).padStart(3)} ${String(s.kills).padStart(6)} ${String(s.alive).padStart(5)} ` +
    `${s.density.toFixed(1).padStart(8)} ${s.ownedDensity.toFixed(1).padStart(6)} ` +
    `${bar(s.pool01)} ${bar(s.bank01)} ${s.covered}/3${s.blackout ? '  BLACKOUT' : ''}`,
  );
}

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
function bar(v: number): string {
  const n = Math.round(v * 5);
  return '#'.repeat(n) + '.'.repeat(5 - n);
}
void chartStageForLevel;
