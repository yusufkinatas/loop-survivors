// THE CORRIDOR — the surface between two rooms, and the bench The Shell needs.
//
// #255 named "somewhere to arrange or record" as a dependency several candidates
// share, and named The Rooms as the shape that supplies it: "the space between
// rooms is where arranging happens". This is that space. Three things happen here
// and they happen in this order, because each one changes what the next is worth:
//
//   THE ROOM PAYS   what you cleared it for, claimed onto something
//   THE DOOR CHARGES  the toll: what you feed it and what you keep
//   THE BENCH       move the notes around, off the clock
//
// THE BAND KEEPS PLAYING THROUGHOUT, and that is the whole reason the bench is
// here rather than on a paused screen. You are arranging something you can hear.
// The world is stopped and the crowd is gone, but the transport runs, so every
// change lands on the next bar line and you find out immediately whether it was a
// good idea.
//
// Plain DOM over the canvas, like every other screen in the game (hud.ts).

import { ROLE_META, type Role } from '../../audio/kits';
import type { RouteBuild } from './build';
import { SEAT_OF, WEIGHT_CAP } from './build';
import {
  busyness,
  payersFor,
  receiversFor,
  type DoorOffer,
  type RoomReward,
} from './gates';
import { CROWDS } from './rooms';
import {
  isBedRole,
  pattern,
  shellFits,
  SHELL_CEILING,
  type Dial,
  type PatternId,
} from './patterns';
import { describeReward, describeToll, type RouteRun } from './run';
import { toggles } from './toggles';

const STEPS_PER_BAR = 16;

export interface GateCallbacks {
  /** The build changed. The caller re-derives the band on the next bar line. */
  onChanged(summary: string): void;
  /** Take on an instrument (a room's `instrument` reward). */
  onHire(role: Role): void;
  /** Pay the door: the rules live in `gates.ts`, the caller applies them so the
   *  band and the toast are its business rather than the screen's. */
  onPayToll(payer: Role, receiver: Role): void;
  /** Everything the corridor wanted is done: walk through. */
  onOpen(): void;
}

export interface GateScreen {
  refresh(): void;
  destroy(): void;
}

/** The corridor. Mounted when a door is taken, destroyed when it opens. */
export function mountGateScreen(
  host: HTMLElement,
  run: RouteRun,
  hirable: readonly Role[],
  cb: GateCallbacks,
): GateScreen {
  const screen = el('div', 'screen route-gate', host);

  /** Bench selection state: the row waiting to be traded with another. */
  let holding: Role | null = null;
  /** Toll selection state. */
  let payer: Role | null = null;
  let receiver: Role | null = null;

  function change(summary: string): void {
    holding = null;
    cb.onChanged(summary);
    refresh();
  }

  function refresh(): void {
    screen.replaceChildren();
    const door = run.chosen;

    const head = el('div', 'gate-head', screen);
    el('span', 'eyebrow', head, `THE CORRIDOR · ROOM ${run.depth + 1} OF 12`);
    el('h1', '', head, door ? `Ahead: ${door.room.name}` : 'The Corridor');
    if (door) el('p', 'sub', head, CROWDS[door.room.crowd].bodies);
    if (door) el('p', 'gate-asks', head, CROWDS[door.room.crowd].asks);

    paintMeters(el('div', 'gate-meters', screen), run.build);

    if (!run.rewardClaimed) paintReward(el('section', 'gate-block', screen));
    else if (door && !run.tollPaid) paintToll(el('section', 'gate-block', screen), door);

    paintBench(el('section', 'gate-block gate-bench', screen));

    const foot = el('div', 'gate-foot', screen);
    const blockers = run.gateBlockers();
    const open = el('button', 'big gate-open', foot,
      door ? `OPEN THE DOOR · ${door.room.name.toUpperCase()}` : 'CARRY ON') as HTMLButtonElement;
    open.disabled = blockers.length > 0;
    if (blockers.length > 0) el('p', 'hint', foot, `Still to do: ${blockers.join(', ')}.`);
    else el('p', 'hint', foot, 'The band keeps playing while you work. Every change lands on the next bar.');
    open.onclick = () => cb.onOpen();
  }

  // ---- the room's payout ------------------------------------------------

  function paintReward(into: HTMLElement): void {
    const reward = run.pendingReward;
    blockHead(into, 'THE ROOM PAID', describeReward(reward));
    const row = el('div', 'gate-row', into);

    if (reward.kind === 'pattern') {
      const p = pattern(reward.pattern);
      const card = el('div', 'gate-card wide', row);
      el('strong', '', card, p.name);
      el('span', 'gate-feel', card, p.feel);
      el('span', 'gate-meta', card, `${busyness(p.id)} · ${p.bars} bar${p.bars === 1 ? '' : 's'}`);
      const take = el('button', 'small', card, 'INTO THE CASE');
      take.onclick = () => {
        const displaced = run.build.case;
        run.build.case = p.id;
        run.build.seenPatterns.add(p.id);
        run.rewardClaimed = true;
        run.note(`took ${p.name}${displaced ? ` (dropped ${pattern(displaced).name})` : ''}`);
        change(`${p.name} is in the case`);
      };
      if (run.build.case) {
        el('span', 'gate-warn', card, `The case is holding ${pattern(run.build.case).name}. Taking this drops it.`);
      }
      return;
    }

    if (reward.kind === 'instrument') {
      if (hirable.length === 0) {
        el('p', 'gate-feel', row, 'No room on the stage for another one. The gate paid weight instead.');
        const only = [...run.build.shells.keys()][0];
        const take = el('button', 'small', row, 'TAKE THE WEIGHT');
        take.onclick = () => {
          if (only) run.build.addWeight(only, 1);
          run.rewardClaimed = true;
          run.note('band was full; took weight instead of an instrument');
          change('the weight landed');
        };
        return;
      }
      for (const role of hirable) {
        const card = el('div', 'gate-card', row);
        card.style.setProperty('--voice-color', ROLE_META[role].color);
        el('strong', '', card, ROLE_META[role].name);
        el('span', 'gate-meta', card, `plays up to ${busynessOfCeiling(role)}`);
        const take = el('button', 'small', card, 'BRING IT IN');
        take.onclick = () => {
          cb.onHire(role);
          run.rewardClaimed = true;
          run.note(`brought in the ${ROLE_META[role].name}`);
          change(`${ROLE_META[role].name} is on stage`);
        };
      }
      return;
    }

    // Levels or weight: choose which shell it lands on.
    const isLevels = reward.kind === 'levels';
    for (const [role, shell] of run.build.shells) {
      if (isLevels && shell.level >= 8) continue;
      const card = el('div', 'gate-card', row);
      card.style.setProperty('--voice-color', ROLE_META[role].color);
      el('strong', '', card, ROLE_META[role].name);
      el('span', 'gate-meta', card, `level ${shell.level}${shell.weight ? ` · ${shell.weight} weight` : ''}`);
      const take = el('button', 'small', card, isLevels ? `+${reward.levels}` : 'HEAVIER');
      take.onclick = () => {
        if (isLevels) run.build.levelUp(role, reward.levels);
        else run.build.addWeight(role, reward.stacks);
        run.rewardClaimed = true;
        run.note(`${ROLE_META[role].name} took the room's ${isLevels ? 'levels' : 'weight'}`);
        change(`${ROLE_META[role].name} ${isLevels ? 'levelled' : 'got heavier'}`);
      };
    }
  }

  // ---- the toll ---------------------------------------------------------

  function paintToll(into: HTMLElement, door: DoorOffer): void {
    blockHead(into, 'THE DOOR WANTS', describeToll(door));
    el('p', 'gate-feel', into, tollExplanation(door));

    const payers = payersFor(run.build, door.toll.kind);
    if (payers.length === 0) {
      el('p', 'gate-warn', into, 'Nothing here can pay that, so the gate waved you through.');
      const skip = el('button', 'small', into, 'GO ON THROUGH');
      skip.onclick = () => {
        run.tollPaid = true;
        run.note('gate could not be paid; passed free');
        change('the gate let you past');
      };
      return;
    }
    if (payer && !payers.includes(payer)) payer = null;

    const columns = el('div', 'gate-toll', into);
    const left = el('div', 'gate-toll-col', columns);
    el('span', 'eyebrow', left, 'FEED THE GATE');
    for (const role of payers) {
      const btn = el('button', `gate-pick ${payer === role ? 'on' : ''}`, left) as HTMLButtonElement;
      btn.style.setProperty('--voice-color', ROLE_META[role].color);
      el('strong', '', btn, ROLE_META[role].name);
      el('span', '', btn, lossLine(door, role));
      btn.onclick = () => {
        payer = role;
        if (receiver === role) receiver = null;
        refresh();
      };
    }

    const right = el('div', 'gate-toll-col', columns);
    el('span', 'eyebrow', right, 'ONTO');
    const receivers = receiversFor(run.build, door.toll, payer);
    if (receiver && !receivers.includes(receiver)) receiver = null;
    for (const role of receivers) {
      const btn = el('button', `gate-pick ${receiver === role ? 'on' : ''}`, right) as HTMLButtonElement;
      btn.style.setProperty('--voice-color', ROLE_META[role].color);
      el('strong', '', btn, ROLE_META[role].name);
      el('span', '', btn, gainLine(door, role));
      btn.onclick = () => {
        receiver = role;
        refresh();
      };
    }

    const pay = el('button', 'big gate-pay', into, 'PAY IT') as HTMLButtonElement;
    pay.disabled = !payer || !receiver;
    pay.onclick = () => {
      if (!payer || !receiver) return;
      cb.onPayToll(payer, receiver);
      payer = null;
      receiver = null;
      refresh();
    };
  }

  function tollExplanation(door: DoorOffer): string {
    switch (door.toll.gives.kind) {
      case 'levels':
        return `One instrument drops a level, and another takes ${door.toll.gives.levels}.`;
      case 'weight':
        return 'One instrument gives up its notes and goes quiet. Another comes back heavier and louder.';
      case 'fuse':
        return 'One instrument goes into the gate whole, and its notes come back folded into one you keep.';
    }
  }

  function lossLine(door: DoorOffer, role: Role): string {
    const shell = run.build.shells.get(role)!;
    if (door.toll.kind === 'level') return `level ${shell.level} → ${shell.level - 1}`;
    if (door.toll.kind === 'pattern') {
      return shell.pattern ? `loses ${pattern(shell.pattern).name} and goes quiet` : 'goes quiet';
    }
    return 'gone, and everything it carries';
  }

  function gainLine(door: DoorOffer, role: Role): string {
    const shell = run.build.shells.get(role)!;
    if (door.toll.gives.kind === 'levels') {
      return `level ${shell.level} → ${Math.min(8, shell.level + door.toll.gives.levels)}`;
    }
    if (door.toll.gives.kind === 'weight') {
      return `${shell.weight} → ${Math.min(WEIGHT_CAP, shell.weight + door.toll.gives.stacks)} weight`;
    }
    return shell.pattern ? `${pattern(shell.pattern).name}, with more folded in` : 'takes the notes whole';
  }

  // ---- the bench --------------------------------------------------------

  function paintBench(into: HTMLElement): void {
    blockHead(into, 'THE BENCH', 'who is playing what');

    const collisions = run.build.collisions();
    const collided = new Map<Role, Set<number>>();
    for (const clash of collisions) {
      const shared = sharedStepsBetween(run.build, clash.a, clash.b);
      for (const role of [clash.a, clash.b]) {
        const set = collided.get(role) ?? new Set<number>();
        for (const step of shared) set.add(step);
        collided.set(role, set);
      }
    }

    const width = Math.max(STEPS_PER_BAR, run.build.unlockedBars * STEPS_PER_BAR);
    const grid = el('div', 'bench-grid', into);
    grid.style.setProperty('--steps', String(width));

    for (const [role, shell] of run.build.shells) {
      const row = el('div', `bench-row ${holding === role ? 'holding' : ''}`, grid);
      row.style.setProperty('--voice-color', ROLE_META[role].color);

      const label = el('div', 'bench-label', row);
      el('strong', '', label, ROLE_META[role].name);
      const held = shell.pattern
        ? pattern(shell.pattern).name
        : isBedRole(role) ? 'held, always on' : 'SILENT';
      el('span', `bench-holding ${shell.pattern || isBedRole(role) ? '' : 'silent'}`, label, held);
      el('span', 'bench-meta', label,
        `LV ${shell.level}${shell.weight ? ` · ${shell.weight}w` : ''} · ${seatName(role)}`);

      const lane = el('div', 'bench-lane', row);
      paintLane(lane, run.build, role, width, collided.get(role));

      const verbs = el('div', 'bench-verbs', row);
      if (!isBedRole(role)) {
        if (shell.pattern) {
          const pull = el('button', 'small', verbs, 'PULL OUT');
          pull.title = 'This shell goes silent. The pattern waits in the case.';
          pull.onclick = () => {
            const result = run.build.pull(role);
            if (!result.ok) return;
            run.note(`pulled ${pattern(shell.pattern!).name} out of the ${ROLE_META[role].name}`);
            change(`${ROLE_META[role].name} went quiet`);
          };
        }
        if (run.build.case && shellFits(role, pattern(run.build.case))) {
          const put = el('button', 'small', verbs, `PUT IN ${pattern(run.build.case).name.toUpperCase()}`);
          put.onclick = () => {
            const id = run.build.case!;
            const result = run.build.put(role);
            if (!result.ok) return;
            run.note(`put ${pattern(id).name} into the ${ROLE_META[role].name}`);
            change(`${ROLE_META[role].name} is playing ${pattern(id).name}`);
          };
        }
        const trade = el('button', `small ${holding === role ? 'on' : ''}`, verbs, holding === role ? 'CANCEL' : 'TRADE');
        trade.title = 'Trade notes with another instrument.';
        trade.onclick = () => {
          if (holding === role) {
            holding = null;
            refresh();
            return;
          }
          if (holding === null) {
            holding = role;
            refresh();
            return;
          }
          const from = holding;
          if (run.build.swap(from, role)) {
            run.note(`traded notes between the ${ROLE_META[from].name} and the ${ROLE_META[role].name}`);
            change('the notes changed hands');
          } else {
            holding = null;
            refresh();
          }
        };
        if (toggles().dial) paintDial(verbs, run.build, role, shell.dial, change);
      }
    }

    const caseRow = el('div', 'bench-case', into);
    el('span', 'eyebrow', caseRow, 'THE CASE');
    if (run.build.case) {
      const p = pattern(run.build.case);
      el('strong', '', caseRow, p.name);
      el('span', 'gate-feel', caseRow, p.feel);
    } else {
      el('span', 'gate-feel', caseRow, 'Empty. Pull a pattern out of a shell and it waits here.');
    }

    if (collisions.length > 0) {
      const warn = el('p', 'gate-warn', into, '');
      warn.textContent = collisions
        .map((c) => `${ROLE_META[c.a].name} and ${ROLE_META[c.b].name} are landing together in ${
          seatName(c.a)} — they will blur into one.`)
        .join(' ');
    }
  }

  refresh();

  return {
    refresh,
    destroy(): void {
      screen.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// The doors panel — shown while the three door pedestals are on the ground
// ---------------------------------------------------------------------------

/** The pedestals carry a name and a badge; a door carries three facts. This is
 *  where the player reads them without leaving the fight — and reading them under
 *  pressure is deliberate, because the crowd from the room you just played is
 *  still on the field. */
export function paintDoorsPanel(into: HTMLElement, doors: readonly DoorOffer[]): void {
  into.replaceChildren();
  if (doors.length === 0) return;
  el('span', 'eyebrow', into, `${doors.length === 3 ? 'THREE' : String(doors.length).toUpperCase()} WAYS OUT — WALK ONTO ONE`);
  const row = el('div', 'doors-row', into);
  for (const door of doors) {
    const card = el('div', 'door-card', row);
    el('strong', '', card, door.room.name);
    el('span', 'door-bodies', card, CROWDS[door.room.crowd].bodies);
    el('span', 'door-asks', card, CROWDS[door.room.crowd].asks);
    el('span', 'door-pays', card, `PAYS · ${describeReward(door.reward)}`);
    el('span', `door-costs ${door.toll.kind === 'none' ? 'free' : ''}`, card,
      `COSTS · ${describeToll(door)}`);
  }
}

/** A door's pedestal copy: what the badge and the name say in-world. */
export function doorPedestal(door: DoorOffer): { name: string; badge: string; color: number } {
  const colors: Record<string, number> = {
    swarm: 0x6febff, wall: 0x91ad59, cellar: 0xa06bff, rush: 0xff6bd6, boss: 0xffd45c,
  };
  return {
    name: door.room.name,
    badge: door.toll.kind === 'none' ? 'FREE' : `COSTS ${describeToll(door).toUpperCase()}`,
    color: colors[door.room.crowd] ?? 0xffd45c,
  };
}

/** What a room reward is worth saying on a toast. */
export function rewardToast(reward: RoomReward): string {
  return `ROOM CLEARED · ${describeReward(reward).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function paintLane(
  lane: HTMLElement,
  build: RouteBuild,
  role: Role,
  width: number,
  clash: Set<number> | undefined,
): void {
  const chart = build.chartFor(role);
  const len = Math.max(1, chart.bars) * STEPS_PER_BAR;
  const byStep = new Map<number, number>();
  for (const ev of chart.events) {
    for (let at = ev.step; at < width; at += len) byStep.set(at, ev.velocity);
  }
  for (let step = 0; step < width; step++) {
    const velocity = byStep.get(step);
    const beat = step % 4 === 0;
    const barLine = step % STEPS_PER_BAR === 0;
    const weight = velocity === undefined ? '' : velocity > 0.9 ? 'accent' : velocity > 0.5 ? 'hit' : 'ghost';
    const cell = el('span',
      `bench-cell ${weight} ${beat ? 'beat' : ''} ${barLine ? 'barline' : ''} ${clash?.has(step) ? 'clash' : ''}`,
      lane);
    // Past the pattern's own length nothing repeats into: mark it as dead space so
    // a one-bar pattern in a four-bar grid reads as a one-bar pattern.
    if (step >= len && len < width) cell.classList.add('beyond');
  }
}

function paintDial(
  into: HTMLElement,
  build: RouteBuild,
  role: Role,
  dial: Dial,
  change: (summary: string) => void,
): void {
  const wrap = el('div', 'bench-dial', into);
  el('span', '', wrap, 'DIAL');
  for (const [value, label] of [[-1, 'thin'], [0, 'as written'], [1, 'thick']] as [Dial, string][]) {
    const btn = el('button', `small ${dial === value ? 'on' : ''}`, wrap, label);
    btn.onclick = () => {
      build.setDial(role, value);
      change(`${ROLE_META[role].name} dialled ${label}`);
    };
  }
}

function paintMeters(into: HTMLElement, build: RouteBuild): void {
  const density = build.density();
  meter(into, 'PLAYING', `${build.playingCount()} of ${build.shells.size}`);
  meter(into, 'HITS A BAR', density.toFixed(1));
  meter(into, 'ARRANGING', `${build.unlockedBars} bar${build.unlockedBars === 1 ? '' : 's'}`);
  if (build.playingCount() === 0) {
    el('span', 'gate-warn', into, 'Nothing is playing. Nothing is attacking either.');
  }
}

function meter(into: HTMLElement, label: string, value: string): void {
  const box = el('div', 'gate-meter', into);
  el('span', '', box, label);
  el('strong', '', box, value);
}

function blockHead(into: HTMLElement, title: string, subtitle: string): void {
  const head = el('div', 'gate-block-head', into);
  el('span', 'eyebrow', head, title);
  el('span', '', head, subtitle);
}

function seatName(role: Role): string {
  const seat = SEAT_OF[role];
  if (!seat) return 'no seat';
  return seat === 'lowAnchor' ? 'the bottom'
    : seat === 'harmonicBody' ? 'the middle'
      : seat === 'brightLine' ? 'the top'
        : seat === 'percussion' ? 'the kit' : 'the background';
}

/** How busy a shell is ALLOWED to get, in words. What a hire card promises. */
function busynessOfCeiling(role: Role): string {
  const ceiling = SHELL_CEILING[role];
  if (ceiling === undefined) return 'one held sound, always on';
  if (ceiling <= 1) return 'one hit a bar';
  if (ceiling <= 3) return 'a few hits a bar';
  if (ceiling <= 7) return 'a steady part';
  return 'anything, however fast';
}

/** Which steps two shells actually land on together, for the grid's clash marks. */
function sharedStepsBetween(build: RouteBuild, a: Role, b: Role): number[] {
  const expand = (role: Role): Set<number> => {
    const chart = build.chartFor(role);
    const len = Math.max(1, chart.bars) * STEPS_PER_BAR;
    const out = new Set<number>();
    for (const ev of chart.events) {
      for (let at = ev.step; at < 4 * STEPS_PER_BAR; at += len) out.add(at);
    }
    return out;
  };
  const left = expand(a);
  return [...expand(b)].filter((step) => left.has(step));
}

/** The pattern a pedestal is offering, for its copy. */
export function patternPedestal(id: PatternId, role: Role, displaced: PatternId | null): {
  name: string;
  badge: string;
} {
  const p = pattern(id);
  return {
    name: p.name,
    badge: displaced
      ? `${ROLE_META[role].name.toUpperCase()} · DROPS ${pattern(displaced).name.toUpperCase()}`
      : `${ROLE_META[role].name.toUpperCase()} · ${busyness(id).toUpperCase()}`,
  };
}

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}
