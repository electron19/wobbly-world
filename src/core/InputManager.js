/**
 * Zarządza wejściem klawiatury, myszy (pointer lock) i pada (Gamepad API).
 * Użycie:
 *   input.isDown('KeyW')         → bool (klawiatura)
 *   input.isPadButtonPressed(0)  → bool (przycisk pada, tylko przez 1 klatkę)
 *   input.isPadButtonDown(0)     → bool (przycisk pada, trzymany)
 *   input.pad.l2 / .r2           → 0–1 (triggery analogowe)
 *   input.pad.leftX/Y            → ±1 (lewy analog)
 *   input.pad.rightX/Y           → ±1 (prawy analog)
 *   input.flush()                → czyści mouse.dx/dy + odpytuje pad
 */
export class InputManager {
  constructor() {
    this.keys       = {};
    this._prevKeys  = {};   // previous frame state — for isJustPressed()
    this.mouse = { dx: 0, dy: 0 };
    this._pdx  = 0;
    this._pdy  = 0;
    this._locked = false;

    // Stan pada
    this.pad = {
      connected: false,
      leftX: 0, leftY: 0,
      rightX: 0, rightY: 0,
      l2: 0, r2: 0,
      _prev: {},
      _curr: {},
    };

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
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

  isDown(code)        { return !!this.keys[code]; }

  /** Klawisz wciśnięty dokładnie w tej klatce (krawędź narastająca). */
  isJustPressed(code) { return !!(this.keys[code] && !this._prevKeys[code]); }

  /** Przycisk pada wciśnięty w tej klatce (krawędź narastająca) */
  isPadButtonPressed(idx) {
    return !!(this.pad._curr[idx] && !this.pad._prev[idx]);
  }

  /** Przycisk pada trzymany */
  isPadButtonDown(idx) {
    return !!this.pad._curr[idx];
  }

  /** Odpytuje Gamepad API (polling) — wywołaj raz na klatkę w flush() */
  _pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of gamepads) { if (g) { gp = g; break; } }

    if (!gp) { this.pad.connected = false; return; }
    this.pad.connected = true;

    const dead = 0.12;
    const ax = v => Math.abs(v) > dead ? v : 0;

    this.pad.leftX  = ax(gp.axes[0] ?? 0);
    this.pad.leftY  = ax(gp.axes[1] ?? 0);
    this.pad.rightX = ax(gp.axes[2] ?? 0);
    this.pad.rightY = ax(gp.axes[3] ?? 0);

    // Triggery: standard mapping buttons[6]/[7] (.value 0-1)
    // Fallback: axes[4]/[5] (zakres -1..+1 gdzie -1=puszczony, +1=wciśnięty)
    this.pad.l2 = gp.buttons[6]
      ? gp.buttons[6].value
      : Math.max(0, ((gp.axes[4] ?? -1) + 1) / 2);
    this.pad.r2 = gp.buttons[7]
      ? gp.buttons[7].value
      : Math.max(0, ((gp.axes[5] ?? -1) + 1) / 2);

    // Przyciski — wykrywanie krawędzi (poprzednia i bieżąca klatka)
    this.pad._prev = { ...this.pad._curr };
    this.pad._curr = {};
    for (let i = 0; i < gp.buttons.length; i++) {
      this.pad._curr[i] = gp.buttons[i].pressed;
    }
  }

  /** Przepisz nagromadzone delty do mouse, wyczyść bufor, odpytaj pad */
  flush() {
    this._prevKeys = { ...this.keys };
    this._pollGamepad();
    this.mouse.dx       = this._pdx;
    this.mouse.dy       = this._pdy;
    this.mouse.padRightX = this.pad.rightX;
    this.mouse.padRightY = this.pad.rightY;
    this._pdx = 0;
    this._pdy = 0;
  }
}
