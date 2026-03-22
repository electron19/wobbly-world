import * as THREE from 'three';
import { Entity } from './Entity.js';
import { toonMat, addOutline } from '../core/Materials.js';

// ─── Fizyczne wymiary boxa (world units) ─────────────────────────────────────
export const CAR_BOX_HH = 0.65;  // half-height (środek ciała nad ziemią)
export const CAR_BOX_HW = 1.05;  // half-width  (oś X)
export const CAR_BOX_HD = 2.05;  // half-depth  (oś Z, kierunek jazdy)

const WHEEL_R       = 0.34;

const CAR_ACCEL     = 13;
const CAR_MAX_FWD   = 15;
const CAR_MAX_REV   = 5;
const CAR_BRAKE     = 22;
const CAR_DECEL     = 5;
const CAR_STEER_SPD = 2.0;   // rad/s obrotu przy pełnej prędkości
const MAX_STEER_VIS = 0.42;  // kąt wizualny przednich kół

export class Car extends Entity {
  constructor(scene, color = 0xFF4444) {
    super(scene);
    this.color      = color;
    this.speed      = 0;
    this.facing     = 0;   // kąt Y (rad), 0 = jedziemy w +Z
    this.isOccupied = false;
    this._wheels    = [];  // { outer, inner, isFront }
    this._build();
  }

  // ─── Siatka 3D ────────────────────────────────────────────────────────────

  _build() {
    const bodyMat   = toonMat(this.color);
    const glassMat  = toonMat(0xAADDFF);
    const tireMat   = toonMat(0x111111);
    const rimMat    = toonMat(0xCCCCCC);
    const headMat   = toonMat(0xFFFF88);
    const tailMat   = toonMat(0xFF2020);
    const bumperMat = toonMat(0xDDDDDD);

    // Podwozie — front = +Z
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 4.2), bodyMat);
    chassis.position.y = 0.275;
    chassis.castShadow = true;
    addOutline(chassis, 0.04);
    this.root.add(chassis);

    // Kabina (lekko ku przodowi)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.92, 2.4), bodyMat);
    cabin.position.set(0, 0.55 + 0.46, 0.3);
    cabin.castShadow = true;
    addOutline(cabin, 0.04);
    this.root.add(cabin);

    // Dach (okapy)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.08, 2.5), bodyMat);
    roof.position.set(0, 0.55 + 0.92 + 0.04, 0.3);
    this.root.add(roof);

    // Zderzaki
    [2.17, -2.17].forEach((z, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.3, 0.14), bumperMat);
      b.position.set(0, 0.18, z);
      addOutline(b, 0.025);
      this.root.add(b);
    });

    // Szyba przednia i tylna
    const cabinY = 0.55 + 0.46;
    [[0.3 + 1.2 + 0.025, 1.62, 0.74], [0.3 - 1.2 - 0.025, 1.55, 0.66]].forEach(([z, w, h]) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), glassMat);
      win.position.set(0, cabinY, z);
      this.root.add(win);
    });

    // Szyby boczne
    [-0.928, 0.928].forEach(x => {
      const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 2.05), glassMat);
      ws.position.set(x, cabinY, 0.3);
      this.root.add(ws);
    });

    // Reflektory
    [-0.62, 0.62].forEach(x => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.06), headMat);
      hl.position.set(x, 0.42, 2.13);
      addOutline(hl, 0.025);
      this.root.add(hl);
    });

    // Tylne światła
    [-0.62, 0.62].forEach(x => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.06), tailMat);
      tl.position.set(x, 0.42, -2.13);
      addOutline(tl, 0.025);
      this.root.add(tl);
    });

    // Koła — outer = skręt (przednie), inner = toczenie
    [
      { x: -1.12, z:  1.38, isFront: true  },
      { x:  1.12, z:  1.38, isFront: true  },
      { x: -1.12, z: -1.38, isFront: false },
      { x:  1.12, z: -1.38, isFront: false },
    ].forEach(({ x, z, isFront }) => {
      const outer = new THREE.Group();
      const inner = new THREE.Group();

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.24, 14), tireMat
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      addOutline(tire, 0.04);
      inner.add(tire);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.26, 8), rimMat
      );
      rim.rotation.z = Math.PI / 2;
      inner.add(rim);

      outer.add(inner);
      outer.position.set(x, WHEEL_R, z);
      this.root.add(outer);
      this._wheels.push({ outer, inner, isFront });
    });
  }

  // ─── Fizyka ───────────────────────────────────────────────────────────────

  /**
   * Stwórz fizyczne ciało (box collider, kinematic).
   * Wywołaj po new Car(), przed game.start().
   */
  initPhysics(physics, x, y, z) {
    this._body = physics.addVehicleBox(
      x, y + CAR_BOX_HH, z,
      CAR_BOX_HW, CAR_BOX_HH, CAR_BOX_HD
    );
    this.root.position.set(x, y, z);
    this.root.rotation.y = this.facing;
  }

  // ─── Cykl klatki ─────────────────────────────────────────────────────────

  /** Wywołaj PRZED physics.step(). */
  update(dt, input) {
    const steerIn = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
    const accelIn = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);

    // Skręt — proporcjonalny do prędkości, odwrócony w biegu wstecznym
    const steerFactor = Math.min(1, Math.abs(this.speed) / 2.5);
    this.facing += steerIn * CAR_STEER_SPD * steerFactor * dt
      * (this.speed >= 0 ? 1 : -1);

    // Przyspieszenie / hamowanie / bezwładność
    if (accelIn > 0) {
      this.speed = Math.min(this.speed + CAR_ACCEL * dt, CAR_MAX_FWD);
    } else if (accelIn < 0) {
      if (this.speed > 0.3) {
        this.speed = Math.max(0, this.speed - CAR_BRAKE * dt);   // hamowanie
      } else {
        this.speed = Math.max(this.speed - CAR_ACCEL * 0.55 * dt, -CAR_MAX_REV); // wsteczny
      }
    } else {
      // Bezwładność / tarcie
      if (this.speed > 0) this.speed = Math.max(0, this.speed - CAR_DECEL * dt);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + CAR_DECEL * dt);
    }

    // Przesuń ciało kinematyczne bezpośrednio
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + Math.sin(this.facing) * this.speed * dt,
      y: CAR_BOX_HH,    // płaski teren — trzymamy stałe Y
      z: pos.z + Math.cos(this.facing) * this.speed * dt,
    });

    // Animacja kół
    const steerAngle = steerIn * MAX_STEER_VIS * steerFactor;
    const rollDelta  = (this.speed * dt) / WHEEL_R;
    this._wheels.forEach(({ outer, inner, isFront }) => {
      if (isFront) outer.rotation.y = steerAngle;
      inner.rotation.x -= rollDelta;
    });
  }

  /** Wywołaj PO physics.step() — sync mesh z body. */
  lateUpdate() {
    const t = this._body.translation();
    this.root.position.set(t.x, t.y - CAR_BOX_HH, t.z);
    this.root.rotation.y = this.facing;
  }
}
