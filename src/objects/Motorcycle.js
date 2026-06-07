import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

// ─── Stałe geometrii motocykla ───────────────────────────────────────────────
const WHEEL_R   = 0.32;
const WHEEL_W   = 0.18;
const WHEELBASE = 1.55;
const SEAT_Y    = 0.85;
const TANK_Y    = 0.78;
const HBAR_Y    = 1.18;

// Lokalny układ: przód na +Z. Kierunek jazdy w świecie = facing (rotation.y).
// Sterowanie: WASD + obrót root.rotation.y, lekki lean w skrętach.

export class Motorcycle extends WorldObject {
  constructor(scene, physics, color = 0xFF3344, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this.color = color;
    this.type = 'motorcycle';
    this.isDrivable = true;
    this.isOccupied = false;
    this.facing     = 0;
    this._speed     = 0;
    this._lean      = 0;
    this._groundY   = 0;     // wysokość terenu pod motocyklem (ustawiana przy placeAt)
    this._wheels    = [];
    this._hbar      = null;
    this._stand     = null;
  }

  _build() {
    const bodyMat    = toonMat(this.color);
    const blackMat   = toonMat(0x222222);
    const metalMat   = toonMat(C.metal);
    const seatMat    = toonMat(0x1a1a1a);
    const tireMat    = toonMat(0x111111);
    const headMat    = new THREE.MeshBasicMaterial({ color: 0xFFF0B0 });
    const exhaustMat = toonMat(0xAAAABB);

    // Koła
    const wheelGeom = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12);
    [+WHEELBASE / 2, -WHEELBASE / 2].forEach((z) => {
      const wheel = new THREE.Mesh(wheelGeom, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, WHEEL_R, z);
      addOutline(wheel, 0.04);
      this.root.add(wheel);
      this._wheels.push(wheel);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_W + 0.02, 8),
        metalMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(0, WHEEL_R, z);
      this.root.add(rim);
      // Felgi obracają się razem z oponą
      wheel.userData.rim = rim;
    });

    // Rama
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.08, WHEELBASE * 0.85), metalMat,
    );
    frame.position.set(0, 0.46, 0);
    addOutline(frame, 0.05);
    this.root.add(frame);

    // Bak (kolorowy)
    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.28, 0.70), bodyMat,
    );
    tank.position.set(0, TANK_Y, 0.05);
    addOutline(tank, 0.04);
    this.root.add(tank);

    // Pasek na baku
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.04, 0.72),
      toonMat(0xFFFFFF),
    );
    stripe.position.set(0, TANK_Y + 0.14, 0.05);
    this.root.add(stripe);

    // Siedzenie
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.10, 0.60), seatMat,
    );
    seat.position.set(0, SEAT_Y, -0.45);
    addOutline(seat, 0.04);
    this.root.add(seat);

    // Tylny garb
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.30), bodyMat,
    );
    tail.position.set(0, SEAT_Y + 0.05, -0.78);
    addOutline(tail, 0.04);
    this.root.add(tail);

    // Widelec
    [-0.10, +0.10].forEach((sx) => {
      const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), metalMat,
      );
      fork.position.set(sx, 0.62, WHEELBASE / 2 + 0.02);
      fork.rotation.x = -0.18;
      this.root.add(fork);
    });

    // Reflektor
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8), headMat,
    );
    head.position.set(0, 1.00, WHEELBASE / 2 + 0.18);
    this.root.add(head);
    const headRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10), blackMat,
    );
    headRim.rotation.x = Math.PI / 2;
    headRim.position.set(0, 1.00, WHEELBASE / 2 + 0.12);
    this.root.add(headRim);

    // Kierownica — w grupie, żeby móc obracać przy skręcie
    const hbarGroup = new THREE.Group();
    hbarGroup.position.set(0, HBAR_Y, WHEELBASE / 2 + 0.08);
    this.root.add(hbarGroup);
    this._hbar = hbarGroup;

    const hbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.70, 0.05, 0.05), metalMat,
    );
    addOutline(hbar, 0.04);
    hbarGroup.add(hbar);

    // Manetki
    [-0.32, +0.32].forEach((sx) => {
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6), blackMat,
      );
      grip.rotation.z = Math.PI / 2;
      grip.position.set(sx, 0, 0);
      hbarGroup.add(grip);
    });

    // Wydech
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8), exhaustMat,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.18, 0.45, -0.50);
    addOutline(exhaust, 0.04);
    this.root.add(exhaust);

    // Błotniki (kolorowe)
    const fenderF = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 0.45), bodyMat,
    );
    fenderF.position.set(0, WHEEL_R + 0.22, WHEELBASE / 2);
    fenderF.rotation.x = -0.10;
    this.root.add(fenderF);

    const fenderR = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.45), bodyMat,
    );
    fenderR.position.set(0, WHEEL_R + 0.22, -WHEELBASE / 2);
    fenderR.rotation.x = 0.10;
    this.root.add(fenderR);

    // Nóżka (chowana podczas jazdy)
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), blackMat,
    );
    stand.position.set(-0.22, 0.20, -0.05);
    stand.rotation.z = 0.20;
    this.root.add(stand);
    this._stand = stand;

    // Domyślny przechył parkingowy (kickstand) — usuwany podczas jazdy
    this.root.rotation.z = 0.12;
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY;
    this.facing = rotY;
    this._groundY = y;
    this._build();
    // Brak statycznego ciała kolizyjnego — motocykl porusza się kinematycznie.
    // Auta mogą przeniknąć przez zaparkowane motocykle, ale dzięki temu da się nimi jeździć.
    return this;
  }

  // ── Sterowanie i symulacja ────────────────────────────────────────────────

  /** Wywołane przez Game.update() co klatkę gdy isOccupied=true. */
  update(dt, input) {
    if (!this.isOccupied) {
      // Parkowane — lekkie wygładzanie do przechyłu kickstanda
      this.root.rotation.z += (0.12 - this.root.rotation.z) * Math.min(1, dt * 8);
      return;
    }

    const MAX_SPEED = 22;     // m/s ≈ 80 km/h
    const ACCEL     = 14;
    const BRAKE     = 22;
    const DRAG      = 0.55;
    const TURN_RATE = 1.6;    // rad/s @ pełna prędkość

    // ── Gaz / hamulec ─────────────────────────────────────────────────────
    const fwd = input.isDown('KeyW') || input.isDown('ArrowUp');
    const rev = input.isDown('KeyS') || input.isDown('ArrowDown');
    if (fwd) this._speed += ACCEL * dt;
    if (rev) this._speed -= BRAKE * dt;
    this._speed -= this._speed * DRAG * dt;
    this._speed  = Math.max(-6, Math.min(MAX_SPEED, this._speed));

    // ── Skręt ─────────────────────────────────────────────────────────────
    const turnIn = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ?  1 : 0)
                 - (input.isDown('KeyD') || input.isDown('ArrowRight') ?  1 : 0);
    // Skręt skaluje się prędkością — w spoczynku motocykl prawie się nie skręca
    const speedFactor = Math.min(1, Math.abs(this._speed) / 6 + 0.15);
    // Przy cofaniu skręt jest odwrócony (jak w aucie)
    const dirSign = this._speed >= 0 ? 1 : -1;
    this.facing += turnIn * TURN_RATE * speedFactor * dt * dirSign;

    // ── Pozycja ───────────────────────────────────────────────────────────
    const sinF = Math.sin(this.facing);
    const cosF = Math.cos(this.facing);
    this.root.position.x += sinF * this._speed * dt;
    this.root.position.z += cosF * this._speed * dt;
    // Stała wysokość — wheel-grounded
    this.root.position.y = this._groundY;

    // ── Lean w skręcie (visual) ───────────────────────────────────────────
    const leanTarget = -turnIn * Math.min(1, Math.abs(this._speed) / 10) * 0.40 * dirSign;
    this._lean += (leanTarget - this._lean) * (1 - Math.exp(-dt * 6));

    // ── Aplikacja rotacji ─────────────────────────────────────────────────
    this.root.rotation.y = this.facing;
    this.root.rotation.z = this._lean;

    // ── Kierownica obraca się przy skręcie ────────────────────────────────
    if (this._hbar) {
      const target = turnIn * 0.35;
      this._hbar.rotation.y += (target - this._hbar.rotation.y) * (1 - Math.exp(-dt * 10));
    }

    // ── Obrót kół (animacja prędkości jazdy) ──────────────────────────────
    // Lokalne X koła to oś obrotu (po rotation.z = π/2 lokalna Y staje się X-świata).
    const wheelOmega = this._speed / WHEEL_R;
    for (const w of this._wheels) {
      w.rotation.x += wheelOmega * dt;
      if (w.userData.rim) w.userData.rim.rotation.x = w.rotation.x;
    }

    // Chowa nóżkę podczas jazdy
    if (this._stand) this._stand.visible = false;
  }

  /** Reset stanu jazdy gdy gracz wysiada. */
  resetDriveState() {
    this._speed = 0;
    this._lean = 0;
    if (this._stand) this._stand.visible = true;
    if (this._hbar) this._hbar.rotation.y = 0;
  }
}
