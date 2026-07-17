// Movement is the only player verb: continuous, unquantized, silent
// (docs/phases/m1-demo.md). WASD/arrows on keyboard; on touch devices the
// floating joystick (joystick.ts) writes into touchAxis and wins while a
// finger is down. The joystick vector is analog: partial deflection walks.

export const touchAxis = { x: 0, y: 0, active: false };

/** Auto-move modes take the movement verb away from the player: 'kiter' flees
 *  the horde, while 'greedy' also detours for XP. 'off' is manual play. */
export type AutoMoveMode = 'off' | 'kiter' | 'greedy';

/** True while an auto-move mode drives the player. The keyboard/touch axis is
 *  ignored (the sim reads the mover instead) and the touch joystick never
 *  summons — the player has no movement input to give. */
export const autoMove = { active: false };

export class Input {
  private down = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.down.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.down.clear();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
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

  /** Rooms that navigate without a page reload must not accumulate global
   * keyboard listeners. The normal game lives for the page lifetime and may
   * ignore this disposer; callers that tear down mid-page call it on exit. */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}
