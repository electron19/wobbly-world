/**
 * Zarządza wejściem klawiatury i myszy (pointer lock).
 * Użycie:
 *   input.isDown('KeyW')   → bool
 *   input.flush()          → czyści mouse.dx/dy po klatce
 *   input.mouse.dx/dy      → delta myszy z tej klatki
 */
export class InputManager {
  constructor() {
    this.keys  = {};
    this.mouse = { dx: 0, dy: 0 };
    this._pdx  = 0;
    this._pdy  = 0;
    this._locked = false;

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      // Blokuj scroll na klawiszach sterowania
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this._pdx += e.movementX;
      this._pdy += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this._locked = !!document.pointerLockElement;
      const hint = document.getElementById('hint');
      if (hint) hint.style.display = this._locked ? 'none' : 'block';
    });

    document.addEventListener('click', () => {
      if (!this._locked) document.body.requestPointerLock();
    });
  }

  isDown(code) { return !!this.keys[code]; }

  /** Przepisz nagromadzone delty do mouse i wyczyść bufor */
  flush() {
    this.mouse.dx = this._pdx;
    this.mouse.dy = this._pdy;
    this._pdx = 0;
    this._pdy = 0;
  }
}
