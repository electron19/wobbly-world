/**
 * Zarządza wejściem klawiatury, myszy (pointer lock) i pada (Gamepad API).
 * Użycie:
 *   input.isDown('KeyW')         → bool (klawiatura)
 *   input.isJustPressed('KeyE')  → bool (tylko 1 klatka po wciśnięciu — event-queue)
 *   input.isPadButtonPressed(0)  → bool (przycisk pada, tylko przez 1 klatkę)
 *   input.isPadButtonDown(0)     → bool (przycisk pada, trzymany)
 *   input.pad.l2 / .r2           → 0–1 (triggery analogowe)
 *   input.pad.leftX/Y            → ±1 (lewy analog)
 *   input.pad.rightX/Y           → ±1 (prawy analog)
 *   input.flush()                → czyści mouse.dx/dy + odpytuje pad + przesuwa kolejkę
 */
export class InputManager {
  constructor() {
    this.keys       = {};
    this.mouse = { dx: 0, dy: 0 };
    this._pdx  = 0;
    this._pdy  = 0;
    this._locked = false;

    // Queue-based isJustPressed — niezależna od kolejności RAF vs keydown
    this._jpQueue   = new Set();  // klawisze wciśnięte od ostatniego flush()
    this._jpFrame   = new Set();  // klawisze "just pressed" w bieżącej klatce

    // Przyciski myszy (0=LMB, 1=MMB, 2=RMB)
    this._mouseButtons = {};
    this._mbQueue      = new Set();
    this._mbFrame      = new Set();

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
      if (!this.keys[e.code]) {
        // Pierwsze wciśnięcie (nie autorepeat) → wrzuć do kolejki
        this._jpQueue.add(e.code);
      }
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
    });

    // Request pointer lock immediately on first user gesture (keydown works too)
    const _tryLock = () => {
      if (!this._locked) document.body.requestPointerLock();
    };
    document.addEventListener('click',   _tryLock, { once: false });
    document.addEventListener('keydown',  _tryLock, { once: true  });
    document.addEventListener('mousedown', _tryLock, { once: true  });

    document.addEventListener('mousedown', e => {
      if (!this._locked) return;
      if (!this._mouseButtons[e.button]) this._mbQueue.add(e.button);
      this._mouseButtons[e.button] = true;
    });
    document.addEventListener('mouseup', e => {
      this._mouseButtons[e.button] = false;
    });
  }

  isDown(code)              { return !!this.keys[code]; }
  isMouseDown(button)       { return !!this._mouseButtons[button]; }
  isMouseJustPressed(button){ return this._mbFrame.has(button); }

  /**
   * Zwraca true dokładnie przez 1 klatkę po wciśnięciu klawisza.
   * Oparty na event-queue — działa niezależnie od kolejności keydown vs RAF.
   */
  isJustPressed(code) { return this._jpFrame.has(code); }

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

  /** Przepisz nagromadzone delty do mouse, wyczyść bufor, odpytaj pad, przesuń kolejkę JP */
  flush() {
    // Przesuń kolejkę: to co było wciśnięte od ostatniego flush() → bieżąca klatka
    this._jpFrame = new Set(this._jpQueue);
    this._jpQueue.clear();
    this._mbFrame = new Set(this._mbQueue);
    this._mbQueue.clear();

    this._pollGamepad();
    this.mouse.dx        = this._pdx;
    this.mouse.dy        = this._pdy;
    this.mouse.padRightX = this.pad.rightX;
    this.mouse.padRightY = this.pad.rightY;
    this._pdx = 0;
    this._pdy = 0;
  }
}
