// Per-frame spatial hash over circles (collision).
// Rebuilt every frame; queries return candidates whose cells overlap a
// circle. No physics engine, circle-versus-circle only.

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

// Sized to the smallest bodies, the ones that pack: big cells return the
// whole packed wall as candidates for every tiny separation query.
const CELL = 32;

export class SpatialHash<T extends Circle> {
  private cells = new Map<number, T[]>();
  /** Largest inserted radius: queries widen by this so an item whose body
   *  crosses cell borders is still found from its single center cell. */
  private maxR = 0;

  private static key(cx: number, cy: number): number {
    // pack two small signed ints into one number key
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    this.cells.clear();
    this.maxR = 0;
  }

  /** One cell per item (its center). Multi-cell insertion needed a dedup
   *  scan on every query — quadratic inside a packed horde bucket, and the
   *  frame's hot spot above ~2000 alive. */
  insert(item: T): void {
    const k = SpatialHash.key(Math.floor(item.x / CELL), Math.floor(item.y / CELL));
    let bucket = this.cells.get(k);
    if (!bucket) this.cells.set(k, (bucket = []));
    bucket.push(item);
    if (item.radius > this.maxR) this.maxR = item.radius;
  }

  /** Items whose cells overlap the query circle (a superset; callers still
   *  do the exact circle-vs-circle test). Never contains duplicates. */
  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const reach = radius + this.maxR;
    const minX = Math.floor((x - reach) / CELL);
    const maxX = Math.floor((x + reach) / CELL);
    const minY = Math.floor((y - reach) / CELL);
    const maxY = Math.floor((y + reach) / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(SpatialHash.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) out.push(item);
      }
    }
    return out;
  }
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  halfW: number,
  halfH: number,
): boolean {
  const qx = Math.max(rx - halfW, Math.min(cx, rx + halfW));
  const qy = Math.max(ry - halfH, Math.min(cy, ry + halfH));
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Shortest distance from a point to a line SEGMENT.
 *
 *  The rotation-free half of a capsule test, and the honest shape for anything
 *  that runs at an arbitrary angle: circleIntersectsRect above is axis-aligned,
 *  so it cannot describe a blade turned 40 degrees or a cable strung between two
 *  points the player chose. Callers compare the result against their own
 *  half-thickness plus the body's radius. The organ's beam keeps its own inlined
 *  copy of this arithmetic, because it needs the clamped distance ALONG the beam
 *  as well and this returns only the distance across it. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // A degenerate segment is a real case, not a guard against nonsense: two drone
  // fields land on the same spot whenever the player stands still through two
  // triggers, and then the honest answer is the distance to that point.
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}
