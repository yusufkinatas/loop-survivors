// Per-frame spatial hash over circles (docs/phases/m1-demo.md, collision).
// Rebuilt every frame; queries return candidates whose cells overlap a
// circle. No physics engine, circle-versus-circle only.

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

const CELL = 64;

export class SpatialHash<T extends Circle> {
  private cells = new Map<number, T[]>();

  private static key(cx: number, cy: number): number {
    // pack two small signed ints into one number key
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const minX = Math.floor((item.x - item.radius) / CELL);
    const maxX = Math.floor((item.x + item.radius) / CELL);
    const minY = Math.floor((item.y - item.radius) / CELL);
    const maxY = Math.floor((item.y + item.radius) / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const k = SpatialHash.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) this.cells.set(k, (bucket = []));
        bucket.push(item);
      }
    }
  }

  /** Distinct items whose cells overlap the query circle. Callers still do
   *  the exact circle-vs-circle test. */
  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(SpatialHash.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          if (!out.includes(item)) out.push(item);
        }
      }
    }
    return out;
  }
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}
