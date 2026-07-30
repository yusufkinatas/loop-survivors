// THE NIGHT OUT (#255 package 7): the handcrafted map and the night clock.
//
// A handcrafted map entered from the same door every time, and an in-world
// clock: the night runs from doors-open to closing time, and closing comes
// wherever you are. Zones are venues with their own genre, tempo and pressure.
// TRAVELLING IS QUIET; ARRIVING IS LOUD. Instruments open routes, so recruiting
// unlocks MAP rather than only power, and the reason for run two is a place you
// have never been.
//
// This is #249's clock-to-place move at full strength, which #258 watched
// Bandwagon make cleanly: a hand-made map too big for one run plus an in-world
// day that ends at midnight, so the run boundary falls out of the fiction.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 5: A VENUE IS A SET, NOT A REGION OF ENDLESS PRESSURE.
// ---------------------------------------------------------------------------
// The obvious reading of "zones with their own pressure" is a region that spawns
// its roster for as long as you stand in it. That gives the map no rhythm: every
// venue is the same shape at every length, and there is no reason to leave one
// except boredom. Instead a venue PLAYS A SET — an authored pressure curve with
// a beginning, a climax and an end. Survive it and the room is finished: it pays
// a chest and goes quiet.
//
// This buys four things #253 asked for and one thing #270 demands:
//  - an authored valley: the walk out, with nothing chasing you.
//  - authored peaks: the climax of each set, and you can see it coming.
//  - a summit: the Headliner's set is the last one, and finishing it ends the
//    night. The run's ending is a PLACE, not a timer.
//  - discovery with a combat payoff: the room you have never played.
//  - and it is what makes time the constraint. Sets and walks together are
//    priced so the whole bill does not fit in one night. You choose a route.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 6: VENUE TEMPO IS REAL, AND THE PAD'S PITCH RIDES IT.
// ---------------------------------------------------------------------------
// "Genre" is the venue's identity and tempo is the cheapest lever for it. One
// thing in the palette blocks a live tempo change: the pad is a COMPOSED bed —
// four bars of real music baked into a file at 122 bpm — and #266 left a
// build-time error saying so. Nothing else cares, because every other voice is
// triggered per note and gets its pitch from the chart.
//
// So the pad's loop is re-rated to match the room, which shifts its PITCH with
// its tempo. Rather than fight that, the three venue tempos were chosen so the
// shift lands on a note the skeleton already allows (minor pentatonic, 0/3/5/7/10
// from the root):
//
//   109 bpm  = 122 x 2^(-2/12)  -> the pad sits a whole tone down: the b7.
//   122 bpm  = the composed tempo -> the root.
//   145 bpm  = 122 x 2^(+3/12)  -> a minor third up: the b3.
//
// So a slow room's harmony is darker and a fast room's is brighter, and both are
// in key. The alternative was dropping per-venue tempo entirely and making genre
// mean roster-plus-groove; that is a smaller game and this is a prototype.
//
// The tempo also has a GAMEPLAY consequence that fell out for free and is kept
// deliberately: upkeep regenerates per BAR, so a fast room regenerates less per
// second. The Balcony is expensive to play in. Nobody has to be told this — it
// is felt as the pool draining faster.

import type { EnemyKind } from '../game/config';
import type { StageEvent, StageWave } from '../game/madforest';
import { ATTACKS, type Attack } from '../audio/kits';
import { ANSWERS, ARMOUR_BY_KIND } from './coverage';
import { PALETTE_COMPOSED_BPM } from '../audio/palette-samples';
import type { Rng } from '../game/rng';

/** The three tempos, and the pad-pitch reasoning is in call 6 above. */
const VENUE_TEMPO = {
  slow: Math.round(PALETTE_COMPOSED_BPM * Math.pow(2, -2 / 12)),
  room: PALETTE_COMPOSED_BPM,
  fast: Math.round(PALETTE_COMPOSED_BPM * Math.pow(2, 3 / 12)),
} as const;

/** What is playing in a room tonight: its roster, its pressure and its tempo.
 *  A venue holds two of these and the night's bill picks one (call 7). */
export interface VenueSet {
  /** The act on tonight. Player-facing, and the one place a genre word is
   *  allowed — a genre is a thing a room books, not a thing the music theory
   *  says about it. */
  act: string;
  bpm: number;
  /** Shuffle depth, 0 straight. The room's groove. */
  swing: number;
  /** Seconds the set runs. Survive it and the room is finished. */
  lengthS: number;
  /** Pressure, in seconds from ARRIVAL rather than from the run clock. */
  waves: readonly StageWave[];
  events: readonly StageEvent[];
  /** What the door burst throws at you the instant you walk in. Arriving is
   *  loud: the room does not ease you in. */
  arrivalKind: EnemyKind;
  arrivalCount: number;
}

/** A room on the map. Geography is FIXED — the same map, entered from the same
 *  door, every run (call 7 rolls what is playing in it, never where it is). */
export interface Venue {
  id: string;
  /** Player-facing name. */
  name: string;
  x: number;
  y: number;
  /** How far from the middle of the room counts as being inside it.
   *
   *  MEASURED UP from about one screen (620-780) to about one and a quarter
   *  (880-1040). At one screen a set could not be survived: the room is a pen you
   *  must stay inside to keep your set running, and a survivors-like player needs
   *  somewhere to run to. The control harness — the base's open arena, same player,
   *  same mover — lived through pressure the same player died to inside a room, and
   *  the difference was room to kite rather than anything about the build.
   *
   *  Still a pen, and deliberately: leaving pauses the set. What changed is that
   *  the pen is now big enough to circle in. */
  radius: number;
  /** What the door asks of your band before it opens. `null` is an open door.
   *  THIS IS "INSTRUMENTS OPEN ROUTES" (#255): the door reads what your band can
   *  ANSWER, so recruiting the right voice unlocks map. */
  door: Attack | null;
  /** Rooms that must be FINISHED before this door opens at all. The Headliner's
   *  gate: a summit you have to earn a route to. */
  needsFinished: number;
  /** True for the room that ends the night. */
  headliner: boolean;
  /** The two possible bills. One is drawn per run. */
  sets: readonly [VenueSet, VenueSet];
}

// ---------------------------------------------------------------------------
// Pressure curves. Every row's `atS` is seconds SINCE ARRIVAL, so a room plays
// the same set whenever in the night you walk into it.
//
// Shape, in all of them: open on a light roster, thicken through the middle,
// and put the room's own boss on the climax about three-quarters through. That
// is #253's "peaks the player authors" seen from the other side — the room
// offers a peak and the player decides what to be playing when it lands.
// ---------------------------------------------------------------------------

function set(
  act: string,
  bpm: number,
  swing: number,
  lengthS: number,
  /** THE ROOM'S OPENING CROWD FLOOR. Authored per room rather than derived from a
   *  single formula, because a crowd's danger is bodies TIMES weight and the rooms
   *  differ by a factor of fifty in weight: Doors is 1-5 hp mites, the Loading Bay
   *  is 30-180 hp bodies. One formula sized both, and it sized one of them wrong —
   *  the Stairwell's last row held 58 fifty-hp shielded bodies against a level-5
   *  build with one voice that could cut, which killed the harness at 4:21 in every
   *  configuration. Grows 40% a row across the set. */
  crowd: number,
  roster: readonly EnemyKind[][],
  boss: { atS: number; kind: EnemyKind },
  arrival: { kind: EnemyKind; count: number },
  extra: readonly StageEvent[] = [],
): VenueSet {
  const step = lengthS / roster.length;
  const waves: StageWave[] = roster.map((pattern, i) => ({
    atS: Math.round(i * step),
    pattern,
    // The floor climbs across the set: the room fills up as its set runs.
    //
    // MEASURED. Mad Forest's own early floors are the reference — 15 at minute 0,
    // 30 at minute 1, 40 at minute 3 — and these sit just under them, because a
    // venue's set is two to four minutes rather than thirty and its crowd has to
    // pay a whole build's worth of experience inside that.
    //
    // Went 18+16i -> 12+10i -> 16+14i across three measured nights. The dip was an
    // over-correction for the armour HP multiplier that no longer exists (see
    // ARMOUR_HP_MUL): with the double tax gone, a lighter crowd starved the build
    // instead — level 3 at four minutes, against the baseline run's level 12.
    minimum: Math.round(crowd * Math.pow(1.4, i)),
    // A ROOM IS A PEN, AND THAT CHANGES WHAT AN INTERVAL COSTS.
    //
    // `spawnWaveAttempt` emits a complete pattern on EVERY attempt, floor met or
    // not (the base's own semantics), so the interval is the real arrival rate and
    // the floor is only where it starts. In the base's unbounded arena that is
    // survivable at any rate, because walking in a straight line permanently sheds
    // the crowd — `recycleEnemies` despawns whatever falls behind, and a
    // survivors-like leans on that valve far more than it looks like it does.
    //
    // Inside a venue there is nowhere to walk to. You circle, nothing falls behind,
    // and the crowd accumulates to the global cap: measured 227 alive at 4:31 in a
    // room whose floor was 38. So a room's interval has to be gentle where an
    // arena's can be brutal. These sit near Mad Forest's OPENING rates (1.0, 0.5)
    // rather than its late ones (0.1), for a run shape whose rooms are all early.
    intervalS: Math.max(0.5, 1.2 - i * 0.15),
  }));
  return {
    act,
    bpm,
    swing,
    lengthS,
    waves,
    events: [{ atS: boss.atS, type: 'boss', kind: boss.kind, chest: true }, ...extra],
    arrivalKind: arrival.kind,
    arrivalCount: arrival.count,
  };
}

/** THE MAP. Seven rooms, hand-placed, and the geometry is the design.
 *
 *  Doors sits at the origin. The three near rooms are 2,400-3,000 units out —
 *  roughly 15-20 seconds of walking, which at 122 bpm is 8-10 bars of banking.
 *  The two far rooms are past them. The Attic is 3,900 north of Doors with
 *  nothing on the way, so the run to the summit is the longest quiet stretch in
 *  the game and the one where a full bank is genuinely buyable.
 *
 *  The door requirements are laid out so that no single attack kind opens
 *  everything: PUNCH opens the Back Room and the Loading Bay, CUT opens the
 *  Balcony, HOLD opens the Cellar. A band that took the impact voice in every
 *  seat — a complete-looking mix — is locked out of two rooms on this map. That
 *  is Coverage constraining the ROUTE and not merely the damage, which is the
 *  interlock #270 called unusually tight. */
export const VENUES: readonly Venue[] = [
  {
    id: 'doors',
    name: 'Doors',
    x: 0,
    y: 0,
    radius: 880,
    door: null,
    needsFinished: 0,
    headliner: false,
    sets: [
      set(
        'THE SUPPORT ACT', VENUE_TEMPO.room, 0.1, 150, 26,
        [['redBat2'], ['redBat2', 'bat'], ['bat', 'redBat']],
        { atS: 84, kind: 'glowingBat' },
        { kind: 'redBat2', count: 4 },
      ),
      set(
        'SOUNDCHECK', VENUE_TEMPO.room, 0.1, 150, 26,
        [['bat'], ['bat', 'redBat'], ['redBat', 'redBat2']],
        { atS: 84, kind: 'glowingBat' },
        { kind: 'bat', count: 4 },
      ),
    ],
  },
  {
    id: 'backroom',
    name: 'The Back Room',
    x: 2700,
    y: -520,
    radius: 940,
    door: 'impact',
    needsFinished: 1,
    headliner: false,
    sets: [
      set(
        'SLUDGE NIGHT', VENUE_TEMPO.slow, 0.16, 175, 14,
        [['zombie'], ['zombie', 'redBat'], ['zombie', 'grayMudman'], ['grayMudman', 'zombie']],
        { atS: 136, kind: 'giantWerewolf' },
        { kind: 'zombie', count: 5 },
      ),
      set(
        'DOOM DISCO', VENUE_TEMPO.slow, 0.2, 175, 14,
        [['zombie'], ['zombie', 'redBat2'], ['grayMudman', 'zombie'], ['grayMudman', 'greenMudman']],
        { atS: 136, kind: 'giantWerewolf' },
        { kind: 'zombie', count: 4 },
      ),
    ],
  },
  {
    id: 'stairwell',
    name: 'The Stairwell',
    x: -2500,
    y: -1000,
    radius: 900,
    door: null,
    needsFinished: 1,
    headliner: false,
    sets: [
      set(
        'SPEED NIGHT', VENUE_TEMPO.fast, 0, 165, 15,
        [['skeleton'], ['skeleton', 'bat'], ['skeleton', 'glowingBat'], ['glowingBat', 'silverBat']],
        { atS: 128, kind: 'giantMantis' },
        { kind: 'skeleton', count: 6 },
      ),
      set(
        'WIRE POP', VENUE_TEMPO.fast, 0.06, 165, 15,
        [['skeleton'], ['skeleton', 'redBat'], ['silverBat', 'skeleton'], ['glowingBat', 'silverBat']],
        { atS: 128, kind: 'giantMantis' },
        { kind: 'skeleton', count: 5 },
      ),
    ],
  },
  {
    id: 'cellar',
    name: 'The Cellar',
    x: -3100,
    y: 2000,
    radius: 940,
    door: 'sustained',
    needsFinished: 2,
    headliner: false,
    sets: [
      set(
        'AMBIENT ALL-NIGHTER', VENUE_TEMPO.slow, 0.14, 190, 18,
        [['ghost'], ['ghost', 'flower'], ['flower', 'ghost'], ['flower', 'ghost', 'greenMudman']],
        { atS: 148, kind: 'giantBlueVenus' },
        { kind: 'ghost', count: 5 },
        [{ atS: 96, type: 'flowerWall', kind: 'flower', ringCount: 60, durationS: 22, chance: 1, occurrences: 1, spacingS: 0 }],
      ),
      set(
        'DRONE MASS', VENUE_TEMPO.room, 0.1, 190, 18,
        [['flower'], ['flower', 'ghost'], ['ghost', 'flower'], ['flower', 'ghost', 'grayMudman']],
        { atS: 148, kind: 'giantBlueVenus' },
        { kind: 'flower', count: 6 },
        [{ atS: 124, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 1, occurrences: 6, spacingS: 5 }],
      ),
    ],
  },
  {
    id: 'balcony',
    name: 'The Balcony',
    x: 3500,
    y: 2200,
    radius: 960,
    door: 'bright-transient',
    needsFinished: 2,
    headliner: false,
    sets: [
      set(
        'PEAK-TIME ROOM', VENUE_TEMPO.fast, 0.08, 195, 14,
        [['skeleton', 'zombie'], ['skeleton', 'grayMudman'], ['silverBat', 'grayMudman'], ['glowingBat', 'greenMudman']],
        { atS: 152, kind: 'giantMantis' },
        { kind: 'skeleton', count: 5 },
        [{ atS: 88, type: 'sweep', kind: 'batSwarm', countPer: 40, chance: 1, occurrences: 4, spacingS: 8 }],
      ),
      set(
        'AFTERS', VENUE_TEMPO.fast, 0.12, 195, 13,
        [['glowingBat', 'zombie'], ['skeleton', 'grayMudman'], ['silverBat', 'greenMudman'], ['silverBat', 'giantBat']],
        { atS: 152, kind: 'giantWerewolf' },
        { kind: 'glowingBat', count: 4 },
      ),
    ],
  },
  {
    id: 'loadingbay',
    name: 'The Loading Bay',
    x: 700,
    y: 3200,
    radius: 940,
    door: 'impact',
    needsFinished: 2,
    headliner: false,
    sets: [
      set(
        'LOCK-IN', VENUE_TEMPO.room, 0.1, 190, 10,
        [['greenMudman', 'ghost'], ['werewolf', 'ghost'], ['werewolf', 'flower'], ['werewolf', 'grayMudman', 'flower']],
        { atS: 148, kind: 'giantMummy' },
        { kind: 'greenMudman', count: 4 },
      ),
      set(
        'CARGO NIGHT', VENUE_TEMPO.room, 0.14, 190, 10,
        [['grayMudman', 'flower'], ['werewolf', 'flower'], ['giantBat', 'ghost'], ['werewolf', 'giantBat', 'flower']],
        { atS: 148, kind: 'giantWerewolf' },
        { kind: 'grayMudman', count: 4 },
      ),
    ],
  },
  {
    id: 'attic',
    name: 'The Attic',
    x: -200,
    y: -4100,
    radius: 1040,
    // THE SUMMIT'S DOOR. `door: null` and the gate is `needsFinished` plus the
    // coverage rule in `doorOpen` below: the Attic asks for ALL THREE answers,
    // which no single attack kind can supply. You cannot rush it with a
    // one-kind band however early you get there.
    door: null,
    needsFinished: 3,
    headliner: true,
    sets: [
      set(
        'THE HEADLINER', VENUE_TEMPO.fast, 0.06, 230, 12,
        [
          ['grayMudman', 'skeleton', 'flower'],
          ['werewolf', 'silverBat', 'ghost'],
          ['werewolf', 'glowingBat', 'flower'],
          ['giantBat', 'silverBat', 'greenMudman', 'flower'],
        ],
        { atS: 188, kind: 'giantBlueVenus' },
        { kind: 'skeleton', count: 7 },
        [
          { atS: 124, type: 'boss', kind: 'giantMummy', chest: true },
          { atS: 164, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 1, occurrences: 8, spacingS: 4 },
        ],
      ),
      set(
        'LAST CALL', VENUE_TEMPO.room, 0.1, 230, 12,
        [
          ['zombie', 'glowingBat', 'ghost'],
          ['grayMudman', 'skeleton', 'flower'],
          ['werewolf', 'silverBat', 'ghost'],
          ['giantBat', 'silverBat', 'greenMudman', 'flower'],
        ],
        { atS: 188, kind: 'giantWerewolf' },
        { kind: 'zombie', count: 6 },
        [
          { atS: 124, type: 'boss', kind: 'giantMantis', chest: true },
          { atS: 164, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 1, occurrences: 8, spacingS: 4 },
        ],
      ),
    ],
  },
];

/** WHAT A ROOM IS ASKING FOR — the telegraph, and #255 left this as Coverage's
 *  outstanding debt: *how does the player retool against what is in front of
 *  them?* This is the answer. Every body a room's set can spawn is read off its
 *  own tables — waves, boss rows, the door burst — and reduced to the attacks its
 *  armoured bodies need. A room that wants PUNCH and HOLD says so on its floor
 *  plate, from across the map, before you have walked in.
 *
 *  Derived rather than authored, so a roster edit can never leave the telegraph
 *  lying. A telegraph that has drifted from its room is worse than no telegraph:
 *  it makes the player's knowledge the thing that betrays them. */
export function venueWants(set: VenueSet): Attack[] {
  // THE CROWD, NOT THE BILL. Read off the wave rows and the door burst — the
  // bodies that keep arriving — and deliberately NOT off the boss rows.
  //
  // Measured: with boss rows counted, Doors "wanted CUT" because its one
  // glowing-bat boss is shielded, while ninety-five per cent of its crowd is bare
  // mites that anything kills. A player reading that telegraph correctly mutes
  // their impact voice for the whole set and starves — the harness did exactly
  // that, collapsing to one voice and 29 kills in three minutes.
  //
  // A boss is one body and a wave row is a crowd, so a telegraph that treats them
  // as equals is lying about the room. The bosses are still armoured and still
  // want the right tool; that is what the ring on the body is for.
  const kinds = new Set<EnemyKind>([set.arrivalKind]);
  for (const wave of set.waves) for (const kind of wave.pattern) kinds.add(kind);
  for (const event of set.events) {
    if (event.type === 'sweep' || event.type === 'flowerWall') kinds.add(event.kind);
  }
  const wants = new Set<Attack>();
  for (const kind of kinds) {
    const armour = ARMOUR_BY_KIND[kind];
    if (armour !== 'none') wants.add(ANSWERS[armour]);
  }
  // In the order the wheel draws them, so the plate and the HUD agree.
  return ATTACKS.filter((attack) => wants.has(attack));
}

/** The street: what plays while you are between rooms.
 *
 *  Nearly nothing, and that is the whole point. #255's valley for this package
 *  is "choose the long quiet route to a better venue; the quiet is the price".
 *  Under Headroom the quiet is also the INCOME — a thin band on the street banks
 *  fast — so the walk is mechanically rewarding rather than thematically
 *  rewarding, which is what #270 calls the corridor problem's escape (b) at full
 *  strength: the shape offers, the player disposes.
 *
 *  Not literally empty. A completely safe corridor is rest, not a valley, and
 *  #255 named that as The Route's stated weakness. A handful of bare mites keeps
 *  a thin band honest and keeps the player's hands busy while they bank. */
export const STREET_WAVES: readonly StageWave[] = [
  { atS: 0, pattern: ['redBat2'], minimum: 5, intervalS: 3 },
];

/** Regeneration multiplier while travelling. The street pays DOUBLE.
 *
 *  This is the one number that decides whether the walk is worth taking or is
 *  just downtime between the parts of the game that are the game. At 2x, ten
 *  bars of street with a two-voice band fills about half a bank — so a walk
 *  taken lean is a Blackout you arrive holding. */
export const STREET_REGEN_MUL = 2;

/** THE NIGHT. Doors open at 21:00 and closing is 03:00 — six in-world hours over
 *  the run's thirty real minutes, so one real minute is twelve in-world minutes.
 *  The HUD clock reads in-world time, because "closing time is coming" is a
 *  sentence about a night and "you have 7:12 left" is a sentence about a timer. */
const NIGHT = {
  opensAtHour: 21,
  /** In-world hours the night runs. */
  hours: 6,
} as const;

/** The in-world time, as hours and minutes, for a run clock of `timeS` out of
 *  `lengthS`. */
function nightClock(timeS: number, lengthS: number): { h: number; m: number } {
  const progress = lengthS > 0 ? Math.max(0, Math.min(1, timeS / lengthS)) : 0;
  const minutes = progress * NIGHT.hours * 60;
  const total = NIGHT.opensAtHour * 60 + minutes;
  return { h: Math.floor(total / 60) % 24, m: Math.floor(total % 60) };
}

export function formatNightClock(timeS: number, lengthS: number): string {
  const { h, m } = nightClock(timeS, lengthS);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Which room the player is standing in, or null for the street. */
export function venueAt(x: number, y: number): Venue | null {
  for (const venue of VENUES) {
    const dx = x - venue.x;
    const dy = y - venue.y;
    if (dx * dx + dy * dy <= venue.radius * venue.radius) return venue;
  }
  return null;
}

/**
 * Why a door will not open, in the player's own words, or null if it will.
 *
 * The door reads the ACTIVE band, exactly as the coverage wheel does: walking up to
 * the Cellar with your only sustained voice muted to save upkeep means the door
 * stays shut until you switch it back on. That is the moment the whole stack locks
 * together in one gesture, and it is deliberate.
 *
 * IT IS ALSO A TRAP, AND THE MESSAGE IS WHAT DISARMS IT. Measured over a whole
 * night: a band that OWNED a bright-transient voice, muted, was locked out of the
 * last two rooms on the map for fourteen minutes while the readout said only "DOOR
 * NEEDS CUT". The player is one key away and the game will not say which key. So the
 * reason distinguishes the two cases outright — nothing that answers this versus
 * something that answers it and is switched off — because a constraint the player
 * cannot see the way out of is not a constraint, it is a bug they will report.
 */
export function doorBlockedReason(
  venue: Venue,
  /** What the PLAYING band answers. What the door actually tests. */
  covered: ReadonlySet<Attack>,
  finishedCount: number,
  verb: (attack: Attack) => string,
  /** What the OWNED band answers, playing or not. Only used to phrase the reason:
   *  omit it and the message falls back to the plain "needs X" form. */
  owned?: ReadonlySet<Attack>,
): string | null {
  if (finishedCount < venue.needsFinished) {
    const short = venue.needsFinished - finishedCount;
    return `${venue.name.toUpperCase()} · PLAY ${short} MORE ROOM${short === 1 ? '' : 'S'} FIRST`;
  }
  const missing = venue.headliner
    ? ATTACKS.filter((attack) => !covered.has(attack))
    : venue.door && !covered.has(venue.door)
      ? [venue.door]
      : [];
  if (missing.length === 0) return null;
  // The one-key case: you have the answer, it is just switched off.
  const silent = owned ? missing.filter((attack) => owned.has(attack)) : [];
  const head = venue.headliner
    ? `${venue.name.toUpperCase()} · THE HEADLINER WANTS A FULL BAND`
    : `${venue.name.toUpperCase()} · DOOR NEEDS ${missing.map(verb).join(' + ')}`;
  if (silent.length === missing.length) {
    return `${head} · YOU HAVE ${silent.map(verb).join(' + ')} — SWITCH IT BACK ON`;
  }
  if (silent.length > 0) {
    return `${head} · SWITCH ${silent.map(verb).join(' + ')} BACK ON, THEN FIND THE REST`;
  }
  return venue.headliner ? `${head} · NEEDS ${missing.map(verb).join(' + ')}` : head;
}

/** THE NIGHT'S BILL — DESIGN CALL 7, and this stack's answer to run-to-run
 *  variance.
 *
 *  The map is handcrafted and fixed: same seven rooms, same distances, same
 *  door requirements, entered from the same door every time. What is ROLLED is
 *  what is playing in each room tonight — one of two authored sets per venue,
 *  each with its own act, tempo, groove, roster and boss.
 *
 *  That is deliberately variance in the ROUTE rather than in the numbers. Run
 *  two plays differently because the room that wants PUNCH tonight is the room
 *  that wanted HOLD last night, so the band that opens the map is a different
 *  band — and #256 required variance that makes a run PLAY differently, not
 *  merely sound different. Rolling the geography instead would have made the map
 *  stop being knowledge, which is the one thing #253 said the map was for. */
export function rollBill(rng: Rng): Map<string, VenueSet> {
  const bill = new Map<string, VenueSet>();
  for (const venue of VENUES) {
    bill.set(venue.id, venue.sets[rng() < 0.5 ? 0 : 1]);
  }
  return bill;
}
