// THE STAGE PLOT: this stack's whole build, as a thing standing on the floor.
//
// The Load-In's premise (package 16, #255) is that the player is not the weapon
// platform. Instruments are PLACED on the map and play from where they stand;
// the player is a roadie who positions, protects and hauls them. So the build
// stops being a list and becomes a geometry — where the band stands — and the
// constraint stops being a menu rule and becomes a picture:
//
//   two pieces too close      they mask each other and both go quiet and weak
//   two pieces just apart     a cable runs between them and both get louder
//   a piece on a socket       it is plugged in, louder still, and bolted down
//
// THREE THINGS THIS FILE IS CAREFUL ABOUT
//
// 1. POSITION PANS, IT NEVER MUTES (locked, #255). A rig's distance from the
//    camera changes NOTHING about its level. What changes its level is its
//    distance from the OTHER RIGS, which is the build's own doing rather than
//    the camera's. That distinction is the whole reason this stack is allowed to
//    have a geometry-driven mix at all: if walking away from the bass thinned
//    the low end, the camera would be doing the mixing and the build would stop
//    determining the music (Bandwagon's rubber band, #258).
//
// 2. SILENT MEANS NOT ATTACKING (the audibility rule, #255). A carried rig and a
//    knocked-over rig are both silent, and both deal no damage — not because
//    anything here subtracts their damage, but because the shell disables their
//    VOICE, and a disabled voice generates no triggers at all. The coupling is
//    the engine's, exactly as Model A has it; this file only decides which rigs
//    are audible.
//
// 3. OUTPUT IS ONE NUMBER. Masking, cables, sockets and (with The Crowd on) fans
//    all land in `rig.output`, and that ONE number scales both the voice's gain
//    and the weapon's damage. Sound and damage move together or the stack has
//    quietly broken the thing the map exists to fix.

import { PALETTE_SEATS, type Role } from '../../audio/kits';
import type { Enemy, FxEvent } from '../run';
import { WEAPON_MAX_LEVEL } from '../weapons/levels';
import { CREW, GEAR, HAUL, STAGE } from './config';
import type { Layers } from './layers';
import { clampToVenue, type Venue } from './venue';

/** Which seat a voice sits in. #266 shipped the seat grid as a MIXING taxonomy
 *  and said nothing in the game reads it; #256 then ruled that GROUPING IS
 *  PER-STACK. This stack reads it, for two things and no others: which pieces
 *  merge into one kit, and (with the `exclusivity` layer on) how many slots
 *  there are. See the grouping note in docs/loadin.md. */
export const SEAT_OF: ReadonlyMap<Role, string> = new Map(
  Object.entries(PALETTE_SEATS).flatMap(([seat, roles]) =>
    (roles as readonly Role[]).map((role) => [role, seat] as const),
  ),
);

/** One piece of gear standing on the floor. */
export interface Rig {
  /** Voices this piece plays. More than one only when the merged-kit layer has
   *  folded a percussion seat's several hires into a single riser (#258's
   *  unclaimed finding: one member covering a whole kit under one visual). */
  roles: Role[];
  /** The seat this piece belongs to; also its identity for the merge test. */
  seat: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Knocked over: silent, harmless, and lying there until the player rights it. */
  down: boolean;
  downAt: number;
  carried: boolean;
  /** Order picked up, so the carried stack draws in the order it was gathered. */
  carryIndex: number;
  /** Seconds since a body last touched it, for the regen delay. */
  quietT: number;
  flashT: number;
  /** Index of the socket this piece is plugged into, or -1. */
  socket: number;
  // ---- derived every frame, read by the world, the shell and the view ----
  /** How much floor this piece claims. Masking is measured on it. */
  presence: number;
  /** 0..1, how buried in other pieces this one is. */
  maskLoad: number;
  /** Pieces this one is wired to. */
  cabled: Rig[];
  /** The one number: what this piece's voices are worth right now, in both
   *  loudness and damage. */
  output: number;
  /** Stereo placement, -1..1, derived from x against the camera. */
  pan: number;
  /** Unit vector toward the nearest body, for directional weapons. Holds its
   *  last value when the field is empty, exactly as the player's walk heading
   *  does. */
  aimX: number;
  aimY: number;
}

/** What the stage needs from the world. A narrow surface rather than the whole
 *  RunWorld, so the geometry can be reasoned about without the simulation. */
export interface StageHost {
  readonly timeS: number;
  readonly player: { x: number; y: number };
  readonly worldW: number;
  readonly worldH: number;
  /** Live bodies within `radius` of a point — the world's spatial hash. */
  near(x: number, y: number, radius: number): readonly Enemy[];
  fx(event: FxEvent): void;
}

/** How wide the band is allowed to spread. Short of 1 on purpose: an instrument
 *  hard in one ear reads as a fault rather than as a placement, and a track that
 *  collapses when heard in mono is not a track. */
const PAN_WIDTH = 0.85;

export class Stage {
  readonly rigs: Rig[] = [];
  /** Which piece plays a given voice. */
  private readonly byRole = new Map<Role, Rig>();
  private nextCarryIndex = 0;
  /** Extra output every rig receives from the crowd, written by the crowd layer
   *  each frame and zero without it. Kept as a per-rig lookup rather than folded
   *  into `output` directly so the crowd can be switched off without this file
   *  learning what a fan is. */
  private fanGain = new Map<Rig, number>();

  constructor(
    private readonly host: StageHost,
    readonly venue: Venue,
    private readonly layers: Layers,
  ) {}

  /** Crew level, written by the shell when a crew pick lands. Everything the
   *  roadhands buy is derived from it here. */
  crew = 0;

  get carriedCount(): number {
    let n = 0;
    for (const rig of this.rigs) if (rig.carried) n++;
    return n;
  }

  /** The move-speed multiplier a full haul costs. One expression, so the floor
   *  and the crew relief cannot drift apart from the cost. */
  get carryMoveMul(): number {
    const carried = this.carriedCount;
    if (carried === 0) return 1;
    const cost = HAUL.costPerPiece * Math.max(0.2, 1 - CREW.costReliefPerLevel * this.crew);
    const floor = Math.min(0.9, HAUL.minMoveMul + CREW.floorPerLevel * this.crew);
    return Math.max(floor, 1 - carried * cost);
  }

  private get gearMaxHp(): number {
    return GEAR.hp + CREW.gearHpPerLevel * this.crew;
  }

  private get gearRegen(): number {
    return GEAR.regenPerS + CREW.gearRegenPerLevel * this.crew;
  }

  /** Where a voice's weapon fires from. The player when this stack's placement
   *  layer is off, which is the base game and the in-branch control. */
  originOf(role: Role): { x: number; y: number } {
    return this.byRole.get(role) ?? this.host.player;
  }

  /** A voice's aim line when it has no walk heading of its own — a stationary
   *  amp points at the crowd. */
  aimOf(role: Role): { x: number; y: number } {
    const rig = this.byRole.get(role);
    return rig ? { x: rig.aimX, y: rig.aimY } : { x: 1, y: 0 };
  }

  /** What this voice is worth right now, in loudness AND in damage. */
  outputOf(role: Role): number {
    return this.byRole.get(role)?.output ?? 1;
  }

  /** Stereo placement for this voice. */
  panOf(role: Role): number {
    if (!this.layers.panning) return 0;
    return this.byRole.get(role)?.pan ?? 0;
  }

  /** Whether this voice can be heard — and therefore, by the audibility rule,
   *  whether it is attacking at all. */
  audible(role: Role): boolean {
    const rig = this.byRole.get(role);
    if (!rig) return true; // no placement layer: the base's own answer
    return !rig.carried && !rig.down;
  }

  rigFor(role: Role): Rig | undefined {
    return this.byRole.get(role);
  }

  /** A newly hired voice arrives as gear, standing where the player was when
   *  they took it. THE LEVEL-UP IS THEREFORE A PLACEMENT: you are choosing a
   *  spot as much as an instrument, and where you happened to be standing when
   *  the pedestal was scooped is where the amp goes. Nothing else in the game
   *  makes the player's position at a reward moment mean anything. */
  hire(role: Role): void {
    // With the placement layer off there is no gear at all: `originOf` falls
    // back to the player and every weapon behaves exactly as the base does. That
    // is the in-branch control, and it is one boolean rather than a checkout.
    if (!this.layers.placement) return;
    if (this.byRole.has(role)) return;
    const seat = SEAT_OF.get(role) ?? 'percussion';
    // The merged kit: a second drum joins the riser already standing rather than
    // becoming a sixth box to read, place and haul.
    if (this.layers.mergedKit && seat === 'percussion') {
      const kit = this.rigs.find((rig) => rig.seat === 'percussion');
      if (kit) {
        kit.roles.push(role);
        this.byRole.set(role, kit);
        return;
      }
    }
    const spot = clampToVenue(this.venue, this.host.player.x, this.host.player.y, GEAR.radius);
    const rig: Rig = {
      roles: [role],
      seat,
      x: spot.x,
      y: spot.y,
      hp: this.gearMaxHp,
      maxHp: this.gearMaxHp,
      down: false,
      downAt: 0,
      carried: false,
      carryIndex: 0,
      quietT: GEAR.regenDelayS,
      flashT: 0,
      socket: -1,
      presence: STAGE.presenceRadius,
      maskLoad: 0,
      cabled: [],
      output: 1,
      pan: 0,
      aimX: 1,
      aimY: 0,
    };
    this.rigs.push(rig);
    this.byRole.set(role, rig);
    this.host.fx({ type: 'ring', x: rig.x, y: rig.y, radius: rig.presence, color: 0xffd45c, dur: 0.7 });
  }

  /** The Sandbox's loadout editor can drop a weapon mid-session; the gear has to
   *  go with it, and a merged kit that loses one voice keeps standing. */
  retire(role: Role): void {
    const rig = this.byRole.get(role);
    if (!rig) return;
    this.byRole.delete(role);
    rig.roles = rig.roles.filter((r) => r !== role);
    if (rig.roles.length > 0) return;
    const index = this.rigs.indexOf(rig);
    if (index >= 0) this.rigs.splice(index, 1);
  }

  /** Sandbox and capture surface: stand a piece of gear at an explicit spot, so
   *  a specific stage plot (a blob, a perfect spread, a half-hauled band) can be
   *  put on the floor and measured. Hires the voice's gear first if it has none. */
  placeAt(role: Role, x: number, y: number): void {
    this.hire(role);
    const rig = this.byRole.get(role);
    if (!rig) return;
    const spot = clampToVenue(this.venue, x, y, GEAR.radius);
    rig.x = spot.x;
    rig.y = spot.y;
    rig.carried = false;
    rig.down = false;
    rig.hp = this.gearMaxHp;
  }

  /** Lift the nearest piece that is not already on your back. Returns it, or
   *  null when nothing is in reach — the caller turns that into the "nothing to
   *  grab" feedback. */
  grabNearest(): Rig | null {
    if (!this.layers.hauling) return null;
    const p = this.host.player;
    let best: Rig | null = null;
    let bestD = HAUL.grabRadius * HAUL.grabRadius;
    for (const rig of this.rigs) {
      if (rig.carried) continue;
      const dx = rig.x - p.x;
      const dy = rig.y - p.y;
      const d = dx * dx + dy * dy;
      if (d > bestD) continue;
      bestD = d;
      best = rig;
    }
    if (!best) return null;
    // A downed piece is righted by picking it up: you cannot carry a broken amp
    // and set down a broken amp, so the trip to fetch it is the repair.
    best.down = false;
    best.hp = this.gearMaxHp;
    best.carried = true;
    best.carryIndex = this.nextCarryIndex++;
    return best;
  }

  /** THE DROP. Everything carried goes down at once, in a ring around the
   *  player — "depth is how much you picked up; the drop is setting it all down
   *  at once" (#255, package 16). Returns how many landed. */
  dropAll(): number {
    const carried = this.rigs.filter((rig) => rig.carried);
    if (carried.length === 0) return 0;
    carried.sort((a, b) => a.carryIndex - b.carryIndex);
    const p = this.host.player;
    // THE DROP HAS TO BE A PAYOFF, so the band does not land in a heap.
    //
    // The first pass dropped everything on a fixed small ring, and the result
    // was that setting your stage down INSTANTLY masked it — the moment the
    // whole run builds toward was also the moment the mix got worst. So the ring
    // is sized from what is on your back: wide enough that adjacent pieces clear
    // each other's presence and land in the cable band instead. Set the band
    // down and it comes back WIRED.
    //
    // That does not hand the geometry away. The ring is centred on YOU, so where
    // you choose to stand still decides everything that matters — which sockets
    // you land on, how close the walls are, and whether the ring lands on top of
    // whatever you left standing. And a single piece can still be carried and
    // placed by hand, to the unit.
    const radius = this.dropRingRadius(carried);
    for (let i = 0; i < carried.length; i++) {
      const angle = (i / carried.length) * Math.PI * 2 - Math.PI / 2;
      const spot = clampToVenue(
        this.venue,
        p.x + Math.cos(angle) * radius,
        p.y + Math.sin(angle) * radius,
        GEAR.radius,
      );
      const rig = carried[i];
      rig.x = spot.x;
      rig.y = spot.y;
      rig.carried = false;
      rig.quietT = GEAR.regenDelayS;
    }
    this.host.fx({ type: 'ring', x: p.x, y: p.y, radius: Math.max(HAUL.dropRadius, radius) * 1.6, color: 0xffd45c, dur: 0.5 });
    return carried.length;
  }

  /** Ring radius that puts adjacent pieces just past each other's presence — in
   *  the cable band rather than in each other's way.
   *
   *  Adjacent separation on a ring of n points is `2R·sin(π/n)`, so solving for
   *  the separation we want gives the radius. The target is the widest pair's
   *  reach plus a third of the cable band, which lands the ring inside the wire
   *  zone with room for the presences to grow a level or two before the plot
   *  starts masking itself — which is the erosion, arriving as geometry. */
  private dropRingRadius(carried: readonly Rig[]): number {
    if (carried.length < 2) return 0;
    let widest = 0;
    for (const rig of carried) widest = Math.max(widest, rig.presence);
    const want = widest * 2 + STAGE.cableBand / 3;
    return Math.min(
      want / (2 * Math.sin(Math.PI / carried.length)),
      // A ring that would not fit in the room is pointless: cap it at what the
      // smaller half-extent allows, and accept the masking in a small venue.
      // That IS the Basement's problem, and it is supposed to be its problem.
      Math.max(HAUL.dropRadius, Math.min(this.venue.halfW, this.venue.halfH) * 0.55),
    );
  }

  /** Everything the stage owes the world each simulation step: carry the
   *  carried, let bodies chew on what is standing, then re-derive the geometry
   *  the whole stack is made of. */
  update(dt: number, tierOf: (role: Role) => number): void {
    if (!this.layers.placement) return;
    this.carryStack();
    this.rightDownedGear();
    if (this.layers.knockdown) this.wearGear(dt);
    this.deriveGeometry(tierOf);
  }

  /** Carried gear rides with the player. It keeps its world position so nothing
   *  downstream has to know it is on someone's back — but it is excluded from
   *  every geometry pass below, because a band in a pile on one person's
   *  shoulders is not a stage plot. */
  private carryStack(): void {
    const p = this.host.player;
    for (const rig of this.rigs) {
      if (!rig.carried) continue;
      rig.x = p.x;
      rig.y = p.y;
      rig.pan = 0;
      rig.output = 0;
      rig.maskLoad = 0;
      rig.cabled.length = 0;
    }
  }

  /** Walking onto a downed piece stands it back up. Instant, after a short
   *  beat so a piece that falls under your feet does not silently pop back:
   *  the cost of a knockdown is the TRIP, not a repair timer, because a timer
   *  spent standing still in the crowd is a punishment with no decision in it. */
  private rightDownedGear(): void {
    const p = this.host.player;
    for (const rig of this.rigs) {
      if (!rig.down || rig.carried) continue;
      if (this.host.timeS - rig.downAt < GEAR.rightDelayS) continue;
      const reach = GEAR.radius + HAUL.grabRadius * 0.5;
      if (Math.hypot(rig.x - p.x, rig.y - p.y) > reach) continue;
      rig.down = false;
      rig.hp = this.gearMaxHp;
      rig.quietT = GEAR.regenDelayS;
      this.host.fx({ type: 'ring', x: rig.x, y: rig.y, radius: rig.presence * 0.8, color: 0x76ff92, dur: 0.5 });
    }
  }

  /** Bodies standing in a piece of gear wear it down.
   *
   *  THEY DO NOT TARGET IT. Enemies chase the player and always have; gear takes
   *  damage only from what happens to be standing on it. That is what keeps
   *  kiting intact — pull the crowd away and your stage is safe — and it is what
   *  makes the roadie's real job LURE rather than defence: your band only hits
   *  what walks near it, so you have to drag the crowd across your own stage,
   *  and every second you leave them there costs the gear. Being unarmed is not
   *  passive when you are the bait. */
  private wearGear(dt: number): void {
    for (const rig of this.rigs) {
      if (rig.carried || rig.down) continue;
      if (rig.flashT > 0) rig.flashT -= dt;
      if (rig.socket >= 0) continue; // bolted in: a plugged rig cannot be knocked over
      let incoming = 0;
      for (const e of this.host.near(rig.x, rig.y, GEAR.radius + 40)) {
        if (e.dead || e.dummy) continue;
        const reach = GEAR.radius + e.radius;
        const dx = e.x - rig.x;
        const dy = e.y - rig.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        incoming += e.damage;
      }
      if (incoming > 0) {
        rig.hp -= incoming * GEAR.contactDpsScale * dt;
        rig.quietT = 0;
        rig.flashT = 0.08;
        if (rig.hp <= 0) {
          rig.hp = 0;
          rig.down = true;
          rig.downAt = this.host.timeS;
          this.host.fx({ type: 'spark', x: rig.x, y: rig.y, color: 0xff665a, n: 10, spread: 26 });
        }
        continue;
      }
      rig.quietT += dt;
      if (rig.quietT >= GEAR.regenDelayS && rig.hp < this.gearMaxHp) {
        rig.hp = Math.min(this.gearMaxHp, rig.hp + this.gearRegen * dt);
      }
    }
  }

  /** THE CONSTRAINT, computed. Everything the player can see on the floor is
   *  decided here and nowhere else.
   *
   *  Order matters: presence first (it depends on level, and everything else
   *  depends on it), then sockets, then masking, then cables — because a cable
   *  is defined as "far enough apart not to mask", so the mask distance has to
   *  exist before the cable band can start where it ends. */
  private deriveGeometry(tierOf: (role: Role) => number): void {
    const standing = this.rigs.filter((rig) => !rig.carried);
    const camX = this.host.player.x;
    const halfView = Math.max(1, this.host.worldW / 2);

    for (const rig of standing) {
      // Presence grows with the loudest voice on the piece. A merged kit at
      // level 8 claims as much floor as any single maxed weapon, not five times
      // as much — it is one object, and the whole point of merging it was that
      // it reads as one.
      let top = 1;
      for (const role of rig.roles) top = Math.max(top, tierOf(role));
      rig.presence = STAGE.presenceRadius *
        (1 + STAGE.presencePerLevel * (Math.min(WEAPON_MAX_LEVEL, top) - 1));
      rig.maskLoad = 0;
      rig.cabled.length = 0;
      rig.socket = -1;
      rig.pan = Math.max(-1, Math.min(1, (rig.x - camX) / halfView)) * PAN_WIDTH;
      // The aim line: toward the nearest body, held when the field is empty.
      const nearest = this.nearestBody(rig.x, rig.y);
      if (nearest) {
        const dx = nearest.x - rig.x;
        const dy = nearest.y - rig.y;
        const d = Math.hypot(dx, dy) || 1;
        rig.aimX = dx / d;
        rig.aimY = dy / d;
      }
    }

    if (this.layers.sockets) {
      for (const rig of standing) {
        for (let i = 0; i < this.venue.sockets.length; i++) {
          const socket = this.venue.sockets[i];
          const d = Math.hypot(rig.x - socket.x, rig.y - socket.y);
          if (d > STAGE.socketRadius) continue;
          rig.socket = i;
          break;
        }
      }
    }

    // Masking and cabling, one pass over the pairs. The two are mutually
    // exclusive by construction — a pair either overlaps or it does not — which
    // is what makes the picture on the floor unambiguous.
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i];
        const b = standing[j];
        const reach = a.presence + b.presence;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < reach) {
          if (!this.layers.masking) continue;
          // Normalised overlap: 1 when the two are standing in the same spot,
          // 0 the instant their edges part.
          const m = Math.max(0, Math.min(1, (reach - d) / reach));
          a.maskLoad += m;
          b.maskLoad += m;
          continue;
        }
        if (!this.layers.cables) continue;
        if (d > reach + STAGE.cableBand) continue;
        if (a.cabled.length >= STAGE.cablesPerRig || b.cabled.length >= STAGE.cablesPerRig) continue;
        a.cabled.push(b);
        b.cabled.push(a);
      }
    }

    for (const rig of standing) {
      rig.maskLoad = Math.min(1, rig.maskLoad);
      let output = 1 - rig.maskLoad * STAGE.maskDepth;
      output += rig.cabled.length * STAGE.cableGain;
      if (rig.socket >= 0) output += STAGE.socketGain;
      output += this.fanGain.get(rig) ?? 0;
      // A downed piece is not quiet, it is OFF: the shell disables its voice, so
      // this number is only ever read for something that is playing. Clamped at
      // both ends so no arrangement of gear can mute a voice the player is still
      // taking damage for owning, or hand the limiter the job of mixing.
      rig.output = Math.max(STAGE.minOutput, Math.min(STAGE.maxOutput, output));
    }
  }

  private nearestBody(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.host.near(x, y, AIM_REACH)) {
      if (e.dead || e.dummy) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d >= bestD) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /** The crowd layer's contribution, handed in rather than computed here: this
   *  file knows what an output bonus is and deliberately does not know what a
   *  fan is. */
  setFanGain(gains: Map<Rig, number>): void {
    this.fanGain = gains;
  }

  /** Live stage-plot statistics, for the HUD, the pause-screen plot and the run
   *  report. One place, so the number the player sees and the number the report
   *  prints cannot disagree. */
  report(): { masked: number; cables: number; plugged: number; down: number; carried: number; output: number } {
    let masked = 0;
    let cables = 0;
    let plugged = 0;
    let down = 0;
    let carried = 0;
    let output = 0;
    let counted = 0;
    for (const rig of this.rigs) {
      if (rig.carried) { carried++; continue; }
      if (rig.down) down++;
      if (rig.maskLoad > 0.02) masked++;
      if (rig.socket >= 0) plugged++;
      cables += rig.cabled.length;
      output += rig.output;
      counted++;
    }
    return {
      masked, cables: cables / 2, plugged, down, carried,
      output: counted > 0 ? output / counted : 0,
    };
  }
}

/** How far a stationary amp looks for something to point at. Wider than the
 *  base's AIM_RANGE because a rig cannot walk toward its target. */
const AIM_REACH = 900;
