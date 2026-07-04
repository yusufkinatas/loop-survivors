// Seeded randomness (docs/tools/autoplay-bot.md): every bot run records its
// seed and can be replayed identically. Human play keeps Math.random.

export type Rng = () => number;

/** mulberry32: small, fast, good-enough PRNG for gameplay randomness. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
