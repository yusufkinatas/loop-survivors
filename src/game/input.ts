// Movement is the only player verb: continuous, unquantized, silent
// (docs/phases/m1-demo.md). WASD/arrows on keyboard; on touch devices the
// floating joystick (joystick.ts) writes into touchAxis and wins while a
// finger is down. The joystick vector is analog: partial deflection walks.

export const touchAxis = { x: 0, y: 0, active: false };

export class Input {
  private down = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => this.down.add(e.code));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  /** Movement vector, magnitude 0..1. */
  axis(): { x: number; y: number } {
    if (touchAxis.active) return { x: touchAxis.x, y: touchAxis.y };
    let x = 0;
    let y = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
