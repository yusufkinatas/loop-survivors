// THE STAGE PLOT, on the pause screen — what fills `.pause-arrange`, the empty
// named slot #265 left in the base for exactly this.
//
// That slot was reserved as "somewhere to arrange off the clock", and for this
// stack arranging IS the stage plot: where the band stands. The pause screen is
// the one surface in the game that stops the world without ending the run, which
// makes it the only place you can look at the whole room at once — in play the
// camera only ever shows you the part of your stage you are standing in.
//
// It is a READOUT, not an editor. You cannot drag an amp here: moving gear is
// the valley, and a valley you can take from a menu is not a valley. What this
// buys is the thing the ticket asks for in as many words — "coverage versus
// coherence, VISIBLE" — at a scale the camera cannot show.

import { ROLE_COLORS } from '../../audio/kits';
import type { Stage } from './stage';

const NS = 'http://www.w3.org/2000/svg';
/** Wide enough that the Festival Field — the biggest room, 6600 units across —
 *  still shows a presence ring as a ring rather than as a dot. */
const WIDTH = 430;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Repaint the plot from live world state. Cheap enough to call on every pause
 *  and on every level-up behind one, which is what keeps it truthful. */
export function paintStagePlot(
  into: HTMLElement,
  plot: Stage,
  player: { x: number; y: number },
  placement: boolean,
): void {
  into.textContent = '';
  if (!placement) return;

  const venue = plot.venue;
  // A venue with no walls (the `venue` layer off) has nothing to frame, so the
  // plot draws a window around the gear instead of a ten-million-unit room.
  const bounded = venue.halfW < 1e6;
  let halfW = venue.halfW;
  let halfH = venue.halfH;
  if (!bounded) {
    let reach = 900;
    for (const rig of plot.rigs) reach = Math.max(reach, Math.abs(rig.x), Math.abs(rig.y));
    halfW = reach * 1.2;
    halfH = reach * 1.2 * 0.68;
  }
  const height = Math.round((WIDTH * halfH) / halfW);
  const scale = WIDTH / (halfW * 2);
  const px = (x: number): number => (x + halfW) * scale;
  const py = (y: number): number => (y + halfH) * scale;

  const header = document.createElement('div');
  header.className = 'plot-title';
  header.textContent = venue.name;
  into.appendChild(header);

  const board = svg('svg', {
    width: WIDTH, height,
    viewBox: `0 0 ${WIDTH} ${height}`,
    class: 'stage-plot',
  });
  board.appendChild(svg('rect', {
    x: 0.5, y: 0.5, width: WIDTH - 1, height: height - 1,
    fill: 'rgba(10,14,26,0.85)',
    stroke: bounded ? 'rgba(255,212,92,0.55)' : 'rgba(140,150,180,0.25)',
    'stroke-dasharray': bounded ? '' : '4 4',
    'stroke-width': 1,
  }));

  for (const socket of venue.sockets) {
    board.appendChild(svg('circle', {
      cx: px(socket.x), cy: py(socket.y), r: 4.5,
      fill: 'none', stroke: 'rgba(255,212,92,0.7)', 'stroke-width': 1.4,
    }));
  }

  const standing = plot.rigs.filter((rig) => !rig.carried);

  // The overlaps, first and under everything: the same smear the floor draws, so
  // the plot and the arena are the same picture at two zooms.
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = standing[i];
      const b = standing[j];
      const reach = a.presence + b.presence;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= reach) continue;
      const depth = Math.max(0, Math.min(1, (reach - d) / reach));
      board.appendChild(svg('line', {
        x1: px(a.x), y1: py(a.y), x2: px(b.x), y2: py(b.y),
        stroke: `rgba(255,102,90,${0.3 + depth * 0.5})`,
        'stroke-width': 2 + depth * 5,
      }));
    }
  }

  // Cables next, under the gear: a wire runs behind the box it plugs into.
  const drawn = new Set<string>();
  for (const rig of standing) {
    for (const other of rig.cabled) {
      const a = plot.rigs.indexOf(rig);
      const b = plot.rigs.indexOf(other);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      board.appendChild(svg('line', {
        x1: px(rig.x), y1: py(rig.y), x2: px(other.x), y2: py(other.y),
        stroke: 'rgba(110,235,255,0.9)', 'stroke-width': 1.8,
      }));
    }
  }

  for (const rig of standing) {
    const color = hex(ROLE_COLORS[rig.roles[0]]);
    // The presence ring is the thing masking is measured on, so it is the thing
    // the plot has to show.
    board.appendChild(svg('circle', {
      cx: px(rig.x), cy: py(rig.y), r: Math.max(3, rig.presence * scale),
      fill: rig.maskLoad > 0.02 ? `rgba(255,102,90,${0.1 + rig.maskLoad * 0.2})` : 'rgba(255,255,255,0.05)',
      stroke: rig.maskLoad > 0.02 ? 'rgba(255,102,90,0.7)' : `${color}66`,
      'stroke-width': 1.2,
    }));
    board.appendChild(svg('rect', {
      x: px(rig.x) - 5.5, y: py(rig.y) - 5.5, width: 11, height: 11,
      fill: rig.down ? 'rgba(90,96,116,0.9)' : color,
      stroke: rig.socket >= 0 ? 'rgba(255,212,92,1)' : 'rgba(0,0,0,0.6)',
      'stroke-width': rig.socket >= 0 ? 2 : 1,
    }));
  }

  board.appendChild(svg('circle', {
    cx: px(player.x), cy: py(player.y), r: 4,
    fill: '#ffffff', stroke: 'rgba(0,0,0,0.7)', 'stroke-width': 1.5,
  }));
  into.appendChild(board);

  const report = plot.report();
  const line = document.createElement('div');
  line.className = 'plot-readout';
  // Plain words for every one of these. No music-theory term reaches the screen
  // (pillar 2's L2 ceiling, #255): "masked" and "wired" are what you can see on
  // the picture directly above.
  line.textContent =
    `${report.cables} wired · ${report.masked} masked · ${report.plugged} plugged in` +
    (report.carried > 0 ? ` · ${report.carried} on your back` : '') +
    (report.down > 0 ? ` · ${report.down} knocked over` : '') +
    ` · stage output ${Math.round(report.output * 100)}%`;
  into.appendChild(line);
}
