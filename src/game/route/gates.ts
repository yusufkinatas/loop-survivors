// THE TOLL — the constraint (#267, package 13 of #255): every gate takes
// something, and what you feed it comes back transformed onto something you kept.
//
// THE ONE THING THAT WOULD KILL THIS LAYER is a right answer. #267's own kill
// criterion says so, and #249 measured the failure: "a constraint with one right
// answer is not a constraint." A toll the player pays out of whatever they happen
// to value least is a tax with a ceremony around it.
//
// So the toll is not a bill presented at a gate. IT IS THE PRICE ON A DOOR. Three
// doors stand at every gate, each showing three things together:
//
//   what is behind it   the room: its bodies, and what an arrangement needs to be
//   what it pays        the reward for clearing it, named — often a named pattern
//   what it costs       the toll: a pattern, a level, or a whole instrument
//
// and the three doors never ask for the same thing. The player is not choosing
// what to give up; they are choosing which room to walk into, and the price comes
// attached. That is what makes the answer move: the cheapest toll may sit in front
// of the room your band is worst suited to, and the expensive one may be the only
// door that pays the pattern you need.
//
// Everything here is pure in the build and the rng.

import type { Role } from '../../audio/kits';
import { WEAPON_MAX_LEVEL } from '../weapons/levels';
import type { Rng } from '../rng';
import type { RouteBuild } from './build';
import {
  hasPattern,
  isBedRole,
  pattern,
  patternDensity,
  PATTERN_IDS,
  registerPattern,
  shellFits,
  SHELL_CEILING,
  type Pattern,
  type PatternBars,
  type PatternId,
  type PatternStep,
} from './patterns';
import { crowdsAvailableAt, makeRoom, type Crowd, type RoomSpec } from './rooms';
import { toggles } from './toggles';

// ---------------------------------------------------------------------------
// What a gate can take, and what it gives back
// ---------------------------------------------------------------------------

/** What a door eats. `none` is what every door is with The Toll switched off. */
export type TollKind = 'none' | 'level' | 'pattern' | 'instrument';

/** What the sacrifice comes back as, on a shell the player keeps. Every one of
 *  these is CONCENTRATION rather than breadth — #255's word for this package's
 *  engine — so the band gets smaller and what is left gets bigger. */
type TollReturn =
  | { kind: 'levels'; levels: number }
  | { kind: 'weight'; stacks: number }
  | { kind: 'fuse'; stacks: number };

export interface TollSpec {
  kind: TollKind;
  gives: TollReturn;
}

/** THE THREE PRICES, and what each one buys.
 *
 *  The returns are deliberately not proportional in the same currency: a level
 *  comes back as levels, a pattern as loudness and damage, an instrument as a
 *  pattern the player could not otherwise have made. If they were all "weight, in
 *  bigger amounts", the biggest sacrifice would always be the right one and the
 *  layer would be a tax again with extra steps. */
export const TOLLS: Readonly<Record<Exclude<TollKind, 'none'>, TollSpec>> = {
  // Cheapest, smallest. NET +1 LEVEL, moved and concentrated: one shell drops a
  // rung and another gains two.
  level: { kind: 'level', gives: { kind: 'levels', levels: 2 } },
  // A voice goes quiet — the authored valley, in one act — and a voice you kept
  // gets heavier and LOUDER. Weight is the only thing in this stack that makes
  // power audible, which is what the run's loudness range is made of.
  pattern: { kind: 'pattern', gives: { kind: 'weight', stacks: 1 } },
  // The most expensive and the most interesting: the whole instrument goes, and
  // its notes come back FUSED onto one you kept. #248 found the gated combination
  // object is synergy's most legible form; this is that object, and its ingredient
  // is genuinely spent.
  instrument: { kind: 'instrument', gives: { kind: 'fuse', stacks: 2 } },
};

// ---------------------------------------------------------------------------
// What a room pays for being cleared
// ---------------------------------------------------------------------------

/** THE REWARD IS NAMED ON THE DOOR, and where it is a pattern the pattern's own
 *  name is on it. That is #253's discovery clause taken literally: "discovery is
 *  musical with a combat payoff and must be visible on screen." Walking into a
 *  room to go and get The Rush is a different act from walking into a room and
 *  hoping. */
export type RoomReward =
  | { kind: 'pattern'; pattern: PatternId }
  | { kind: 'instrument' }
  | { kind: 'levels'; levels: number }
  | { kind: 'weight'; stacks: number };

export interface DoorOffer {
  room: RoomSpec;
  reward: RoomReward;
  toll: TollSpec;
}

// ---------------------------------------------------------------------------
// Rolling the doors
// ---------------------------------------------------------------------------

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Patterns worth offering: within the unlocked bar count, playable by at least
 *  one shell the player owns, and not already in the band. Falls back to the
 *  whole unlocked pool rather than paying nothing. */
function rewardPatternPool(build: RouteBuild, rng: Rng): PatternId {
  const held = new Set<PatternId>();
  for (const shell of build.shells.values()) if (shell.pattern) held.add(shell.pattern);
  if (build.case) held.add(build.case);
  const owned = [...build.shells.keys()].filter((role) => !isBedRole(role));
  const fits = (id: PatternId): boolean =>
    pattern(id).bars <= build.unlockedBars && owned.some((role) => shellFits(role, pattern(id)));

  const fresh = PATTERN_IDS.filter((id) => fits(id) && !held.has(id) && !build.seenPatterns.has(id));
  if (fresh.length > 0) return pick(fresh, rng);
  const unheld = PATTERN_IDS.filter((id) => fits(id) && !held.has(id));
  if (unheld.length > 0) return pick(unheld, rng);
  const any = PATTERN_IDS.filter(fits);
  return any.length > 0 ? pick(any, rng) : PATTERN_IDS[0];
}

function rollReward(build: RouteBuild, depth: number, crowd: Crowd, rng: Rng): RoomReward {
  // A Balcony already pays a chest off its Giant, so its door leads with
  // something a chest cannot give.
  const roll = rng();
  if (crowd === 'boss') {
    if (build.canHire(anyHirable(build, rng) ?? 'kick')) return { kind: 'instrument' };
    return { kind: 'weight', stacks: 1 };
  }
  if (roll < 0.55) return { kind: 'pattern', pattern: rewardPatternPool(build, rng) };
  if (roll < 0.75 && build.canHire(anyHirable(build, rng) ?? 'kick')) return { kind: 'instrument' };
  if (roll < 0.9) return { kind: 'levels', levels: depth < 5 ? 2 : 3 };
  return { kind: 'weight', stacks: 1 };
}

/** Any instrument this build could still take on, so a reward that promises one
 *  can check that the promise is keepable. */
function anyHirable(build: RouteBuild, rng: Rng): Role | null {
  const candidates = (Object.keys(SHELL_CEILING) as Role[]).filter((role) => build.canHire(role));
  return candidates.length > 0 ? pick(candidates, rng) : null;
}

/** Which shells could pay this toll without breaking the floor rule. */
export function payersFor(build: RouteBuild, kind: TollKind): Role[] {
  const owned = [...build.shells.values()];
  if (kind === 'none') return [];
  if (kind === 'level') return owned.filter((s) => s.level > 1).map((s) => s.role);
  if (kind === 'pattern') {
    // NEVER THE LAST VOICE. #255's floor rule is absolute — "no mechanic may make
    // the opening feel powerless" — and a gate that silences the only thing still
    // playing does exactly that. So a pattern toll needs a band with something
    // left over.
    const playing = owned.filter((s) => s.pattern !== null);
    return playing.length > 1 ? playing.map((s) => s.role) : [];
  }
  // Same rule one level up: a route cannot eat your last instrument.
  return owned.length > 1 ? owned.map((s) => s.role) : [];
}

/** Shells that can RECEIVE what a toll pays back. Everything owned, minus
 *  whatever is being fed to the gate, minus (for a fusion) anything that cannot
 *  hold notes at all. */
export function receiversFor(build: RouteBuild, spec: TollSpec, payer: Role | null): Role[] {
  const owned = [...build.shells.values()].filter((s) => s.role !== payer);
  if (spec.gives.kind === 'levels') return owned.filter((s) => s.level < WEAPON_MAX_LEVEL).map((s) => s.role);
  // A shell at the weight cap is not a receiver: the toll would be paid and land
  // on nothing, which is the one outcome a sacrifice may never have. This is also
  // what makes a long route spread its weight over two or three voices instead of
  // piling all eleven gates onto one — see WEIGHT_CAP in route/build.ts.
  if (spec.gives.kind === 'fuse') {
    return owned.filter((s) => !isBedRole(s.role) && build.canTakeWeight(s.role)).map((s) => s.role);
  }
  return owned.filter((s) => build.canTakeWeight(s.role)).map((s) => s.role);
}

/** Whether a toll of this kind can be paid at all right now. */
function payable(build: RouteBuild, kind: TollKind): boolean {
  if (kind === 'none') return true;
  const spec = TOLLS[kind as Exclude<TollKind, 'none'>];
  const payers = payersFor(build, kind);
  return payers.some((payer) => receiversFor(build, spec, payer).length > 0);
}

/**
 * The three doors at one gate.
 *
 * Three different rooms and, wherever the build allows it, three different
 * prices. A door whose price cannot be paid becomes a free door rather than
 * disappearing: the alternative is a gate that quietly stops charging once a
 * build is small, which is the shape a player learns to farm.
 */
export function rollDoors(build: RouteBuild, depth: number, rng: Rng): DoorOffer[] {
  const crowds = shuffle(crowdsAvailableAt(depth), rng).slice(0, DOORS_PER_GATE);
  const kinds = assignTolls(build, crowds.length, rng);
  return crowds.map((crowd, i) => ({
    room: makeRoom(crowd, depth + 1),
    reward: rollReward(build, depth + 1, crowd, rng),
    toll: kinds[i] === 'none' ? { kind: 'none', gives: { kind: 'weight', stacks: 0 } } : TOLLS[kinds[i]],
  }));
}

const DOORS_PER_GATE = 3;

/**
 * One price per door, and NEVER THE SAME PRICE TWICE while a different one is
 * payable.
 *
 * The first pass rolled each door's price independently and fell back to "the
 * cheapest thing this build can give up" when a roll landed on something
 * unpayable. At the first gate every shell is at level one, so the level toll is
 * unpayable, both fallbacks landed on `pattern`, and the gate offered two doors
 * asking for the identical thing — which is the layer's own kill criterion
 * happening at the first opportunity. A gate whose doors all charge the same thing
 * is not a choice of price; it is a bill with a room attached.
 *
 * So the prices are dealt out across the gate rather than rolled per door: walk a
 * shuffled list, hand each door the first price nobody has taken that this build
 * can actually pay, and hand out a FREE door when the prices run out. A build too
 * small to be charged gets a free gate, which is the honest answer and the one the
 * floor rule wants.
 */
function assignTolls(build: RouteBuild, count: number, rng: Rng): TollKind[] {
  if (!toggles().toll) return Array.from({ length: count }, () => 'none' as TollKind);
  const available = shuffle(['level', 'pattern', 'instrument'] as TollKind[], rng)
    .filter((kind) => payable(build, kind));
  return Array.from({ length: count }, (_, i) => available[i] ?? 'none');
}

function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Paying
// ---------------------------------------------------------------------------

export interface TollPayment {
  /** The shell that gives something up. */
  payer: Role;
  /** The shell the transformation lands on. */
  receiver: Role;
}

export interface TollResult {
  /** One line, in the player's words, for the toast and the run log. */
  line: string;
  /** The pattern a fusion produced, if it produced one. */
  made: Pattern | null;
}

/** Pay a door's toll. Mutates the build; the caller re-derives the whole band
 *  from it afterwards, which is why nothing here has to be undoable. */
export function payToll(build: RouteBuild, spec: TollSpec, payment: TollPayment): TollResult {
  const { payer, receiver } = payment;
  if (spec.kind === 'none') return { line: 'The door was open.', made: null };

  const fed = build.shells.get(payer);
  const kept = build.shells.get(receiver);
  if (!fed || !kept) return { line: 'Nothing changed hands.', made: null };

  // What goes in.
  let gave = '';
  let fedPattern: PatternId | null = null;
  if (spec.kind === 'level') {
    build.levelDown(payer, 1);
    gave = `${name(payer)} gave up a level`;
  } else if (spec.kind === 'pattern') {
    fedPattern = fed.pattern;
    fed.pattern = null;
    gave = `${name(payer)} gave up ${fedPattern ? pattern(fedPattern).name : 'its notes'} and went quiet`;
  } else {
    fedPattern = fed.pattern;
    build.release(payer);
    gave = `${name(payer)} went into the gate whole`;
  }

  // What comes back, on something kept.
  let got = '';
  let made: Pattern | null = null;
  if (spec.gives.kind === 'levels') {
    const landed = build.levelUp(receiver, spec.gives.levels);
    got = `${name(receiver)} took ${landed} level${landed === 1 ? '' : 's'}`;
  } else if (spec.gives.kind === 'weight') {
    const landed = build.addWeight(receiver, spec.gives.stacks);
    got = landed > 0
      ? `${name(receiver)} came back heavier and louder`
      : `${name(receiver)} is already as heavy as it gets`;
  } else {
    build.addWeight(receiver, spec.gives.stacks);
    made = fedPattern && kept.pattern
      ? fuse(receiver, pattern(kept.pattern), pattern(fedPattern), build.unlockedBars)
      : fedPattern
        ? pattern(fedPattern)
        : null;
    if (made && build.slot(receiver, made.id).ok) {
      got = `${name(receiver)} is playing ${made.name}`;
    } else {
      // The fusion did not fit the receiving shell. Pay the weight and say so
      // rather than silently swallowing the ingredient.
      build.addWeight(receiver, 1);
      got = `${name(receiver)} could not hold it, and took the weight instead`;
    }
  }

  return { line: `${gave}. ${got}.`, made };
}

function name(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// ---------------------------------------------------------------------------
// Fusion: the gated combination object
// ---------------------------------------------------------------------------

/** Names for the shapes a fusion comes out as. A fused pattern is something the
 *  player made and has to be able to talk about, so it gets a real name by the
 *  same rule as the catalog — by feel, by how busy it ends up. */
const FUSION_NAMES: readonly { upTo: number; name: string }[] = [
  { upTo: 2, name: 'The Weight' },
  { upTo: 4, name: 'The Frame' },
  { upTo: 7, name: 'The Pump' },
  { upTo: 11, name: 'The Machine' },
  { upTo: Infinity, name: 'The Flood' },
];

/** A few pairings worth naming outright, because the player will make them and
 *  they deserve better than a size bracket. */
const NAMED_FUSIONS: Readonly<Record<string, string>> = {
  'anchor+push': 'The Pump',
  'question+answer': 'The Conversation',
  'sprint+knock': 'The Engine',
  'climb+fall': 'The Arch',
  'hold+hold': 'The Double Weight',
};

/**
 * Fuse the pattern a kept shell is playing with the pattern fed to the gate.
 *
 * The keeper's notes are the spine: its steps and its contour survive intact, and
 * the fed pattern's steps fill in around them wherever there is room under the
 * receiving shell's ceiling. So a fusion is audibly the thing you kept, with the
 * thing you gave up folded into it — which is the sentence the mechanic is
 * supposed to make true.
 *
 * The ceiling is what stops this from being a way to build a wall out of two
 * sparse patterns: the arithmetic is capped by what the voice can play.
 */
function fuse(role: Role, keeper: Pattern, fed: Pattern, unlockedBars: PatternBars): Pattern {
  const bars = Math.min(unlockedBars, Math.max(keeper.bars, fed.bars)) as PatternBars;
  const total = bars * 16;
  const ceiling = SHELL_CEILING[role] ?? 0;
  const room = Math.max(0, Math.floor(ceiling * bars) - keeper.steps.length);

  const taken = new Set<number>();
  const steps: PatternStep[] = [];
  // The spine, repeated out to the fused length if the keeper is shorter.
  for (const step of keeper.steps) {
    for (let at = step.step; at < total; at += keeper.bars * 16) {
      if (taken.has(at)) continue;
      taken.add(at);
      steps.push({ ...step, step: at });
    }
  }
  // The fed pattern's steps, in its own order, as far as the ceiling allows.
  let added = 0;
  for (const step of fed.steps) {
    if (added >= room) break;
    for (let at = step.step; at < total && added < room; at += fed.bars * 16) {
      if (taken.has(at)) continue;
      taken.add(at);
      // A folded-in step arrives as a GHOST unless the fed pattern accented it:
      // the fusion should sound like the keeper with more going on underneath,
      // not like two parts fighting for the front.
      steps.push({ step: at, weight: step.weight === 'accent' ? 'hit' : 'ghost', degree: step.degree });
      added += 1;
    }
  }
  steps.sort((a, b) => a.step - b.step);

  const density = steps.length / bars;
  const key = `${keeper.id}+${fed.id}`;
  const label = NAMED_FUSIONS[key]
    ?? FUSION_NAMES.find((entry) => density <= entry.upTo)!.name;
  const id = `fused:${key}:${role}`;
  if (hasPattern(id)) return pattern(id);
  return registerPattern({
    id,
    name: label,
    feel: `${keeper.name} with ${fed.name} folded into it. You made this one.`,
    bars,
    steps,
  });
}

/** For the door copy: how busy a pattern is, in words rather than a number. No
 *  arithmetic on screen (pillar 2's L2 ceiling). */
export function busyness(id: PatternId): string {
  const density = patternDensity(pattern(id));
  if (density <= 1) return 'very sparse';
  if (density <= 2.5) return 'sparse';
  if (density <= 5) return 'steady';
  if (density <= 9) return 'busy';
  return 'relentless';
}
