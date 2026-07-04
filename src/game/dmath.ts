// Deterministic sin/cos for the simulation (docs/tools/autoplay-bot.md).
//
// Why: V8's Math.sin/Math.cos give bitwise-different results across VM
// versions (Node vs Chrome), which made browser replays drift off their
// batch runs after ~2 minutes until a kill flipped and the RNG stream
// diverged. These implementations use only +, -, * and Math.round — all
// IEEE-exact-rounded operations — so every VM computes the same bits.
// Accuracy is ~1e-16 on the reduced range (fdlibm kernel polynomials),
// far beyond what aim angles and spawn rings need. Gameplay code (run.ts)
// must use these instead of Math.sin/Math.cos; view/audio code may keep
// the natives.

const PIO2_HI = 1.57079632679489655800e0;
const PIO2_LO = 6.12323399573676603587e-17;

// fdlibm k_sin / k_cos polynomial coefficients
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** sin on |r| <= pi/4. */
function kSin(r: number): number {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

/** cos on |r| <= pi/4. */
function kCos(r: number): number {
  const z = r * r;
  return 1 - z * 0.5 + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** Reduce to r in [-pi/4, pi/4] plus a quadrant count. Fine for the game's
 *  angle magnitudes (|a| stays well under 1e6). */
function reduce(a: number): { r: number; q: number } {
  const n = Math.round(a / PIO2_HI);
  const r = a - n * PIO2_HI - n * PIO2_LO;
  return { r, q: ((n % 4) + 4) % 4 };
}

export function dsin(a: number): number {
  const { r, q } = reduce(a);
  switch (q) {
    case 0:
      return kSin(r);
    case 1:
      return kCos(r);
    case 2:
      return -kSin(r);
    default:
      return -kCos(r);
  }
}

export function dcos(a: number): number {
  const { r, q } = reduce(a);
  switch (q) {
    case 0:
      return kCos(r);
    case 1:
      return -kSin(r);
    case 2:
      return -kCos(r);
    default:
      return kSin(r);
  }
}
