// Per-frame spatial hash over circles (collision).
// Rebuilt every frame; queries return candidates whose cells overlap a
// circle. No physics engine, circle-versus-circle only.

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

// Sized to the swarmer, the entity that packs: big cells return the whole
// packed wall as candidates for every tiny separation query.
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

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}
