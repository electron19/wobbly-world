import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── Airplane — rideable 2-engine propeller plane ─────────────────────────────
//
// Controls (when occupied):
//   W / ArrowUp   — throttle up (accelerate)
//   S / ArrowDown — throttle down (decelerate / gentle dive)
//   A / ArrowLeft — yaw left  (also auto-banks)
//   D / ArrowRight— yaw right
//   Mouse Y / right stick Y — pitch (nose up/down)
//
// Physics: pure kinematic (no Rapier) — direct position update each frame.
// Forward direction convention: facing=0 → +Z direction (same as Car).
//
export class Airplane {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.root       = new THREE.Group();
    this.isOccupied = false;
    this.isDrivable = true;
    this.facing     = 0;     // yaw  [rad], root.rotation.y = facing
    this.type       = 'airplane';

    this._pitch     = 0;     // current pitch offset  [rad]
    this._roll      = 0;     // visual roll           [rad]
    this._speed     = 0;     // forward speed         [units/s]
    this._velY      = 0;     // vertical velocity     [units/s]

    this._propGroupL = null;
    this._propGroupR = null;

    this._build();
    this.root.position.set(x, y, z);
    scene.add(this.root);
  }

  // ── Build geometry ────────────────────────────────────────────────────────

  _build() {
    const bodyMat   = toonMat(0xF0F0F5);  // white-grey fuselage
    const wingMat   = toonMat(0xDDDDEE);  // slightly cream wing
    const engineMat = toonMat(0x888899);  // grey nacelle
    const propMat   = toonMat(0x222233);  // dark propeller
    const glassMat  = new THREE.MeshToonMaterial({
      color: 0x9DD3F5, transparent: true, opacity: 0.72,
    });
    const stripeMat = toonMat(0x1155CC);  // blue livery stripe
    const tailMat   = toonMat(0xCC2233);  // red tail accent
    const gearMat   = toonMat(0x555566);

    // ── Fuselage (elongated cylinder along Z) ──────────────────────────────
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.46, 5.6, 12),
      bodyMat,
    );
    fuselage.rotation.x = Math.PI / 2;   // cylinder along Z (nose → +Z)
    fuselage.castShadow = true;
    this.root.add(fuselage);
    addOutline(fuselage, 0.07);

    // Nose cone (at +Z)
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.56, 1.25, 12),
      bodyMat,
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 3.42;
    this.root.add(nose);
    addOutline(nose, 0.07);

    // Tail cone (at -Z)
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 0.85, 12),
      bodyMat,
    );
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -3.22;
    this.root.add(tail);
    addOutline(tail, 0.06);

    // ── Cockpit window ─────────────────────────────────────────────────────
    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.52, 0.72),
      glassMat,
    );
    cockpit.position.set(0, 0.55, 1.95);
    this.root.add(cockpit);

    // ── Blue livery stripe ─────────────────────────────────────────────────
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.17, 3.2),
      stripeMat,
    );
    stripe.position.set(0, 0.38, -0.3);
    this.root.add(stripe);

    // ── Main wings (left = -X, right = +X) ────────────────────────────────
    // Each wing extends outward in ±X, chord along Z
    const makeWing = (side) => {
      const g = new THREE.Group();
      // Chord root at fuselage, tip at ±4.6 X
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.18, 1.25),
        wingMat,
      );
      wing.castShadow = true;
      g.add(wing);
      addOutline(wing, 0.06);
      // Wingtip dihedral (~3°)
      wing.rotation.z = side * 0.055;
      // Position: half-span offset from fuselage centre
      g.position.set(side * 2.62, -0.08, 0.12);
      this.root.add(g);
    };
    makeWing(-1);
    makeWing( 1);

    // ── Tail surfaces ──────────────────────────────────────────────────────
    // Vertical fin
    const vFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.35, 0.88),
      tailMat,
    );
    vFin.position.set(0, 0.78, -2.8);
    vFin.castShadow = true;
    this.root.add(vFin);
    addOutline(vFin, 0.06);

    // Horizontal stabilisers
    const hStabMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.14, 0.68),
      wingMat,
    );
    hStabMesh.position.set(0, 0.14, -2.78);
    hStabMesh.castShadow = true;
    this.root.add(hStabMesh);
    addOutline(hStabMesh, 0.06);

    // ── Engine nacelles under wings ────────────────────────────────────────
    for (const sx of [-2.1, 2.1]) {
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.20, 0.95, 8),
        engineMat,
      );
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(sx, -0.28, 0.12);
      this.root.add(nacelle);
      addOutline(nacelle, 0.06);

      // Propeller group (spins around Z axis = forward axis)
      const propGroup = new THREE.Group();
      propGroup.position.set(sx, -0.28, 0.64);

      for (let i = 0; i < 2; i++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 2.0, 0.20),
          propMat,
        );
        blade.rotation.z = i * Math.PI / 2;
        propGroup.add(blade);
      }
      this.root.add(propGroup);
      if (sx < 0) this._propGroupL = propGroup;
      else        this._propGroupR = propGroup;
    }

    // ── Landing gear ───────────────────────────────────────────────────────
    const wheelGeo  = new THREE.CylinderGeometry(0.17, 0.17, 0.13, 8);
    const strut     = new THREE.BoxGeometry(0.09, 0.62, 0.09);

    // Nose gear
    const noseStrut = new THREE.Mesh(strut, gearMat);
    noseStrut.position.set(0, -0.66, 2.2);
    this.root.add(noseStrut);
    const noseWheel = new THREE.Mesh(wheelGeo, gearMat);
    noseWheel.rotation.z = Math.PI / 2;
    noseWheel.position.set(0, -1.05, 2.2);
    this.root.add(noseWheel);

    // Main gear (under each engine)
    for (const sx of [-2.1, 2.1]) {
      const ms = new THREE.Mesh(strut, gearMat);
      ms.position.set(sx, -0.66, -0.4);
      this.root.add(ms);
      const mw = new THREE.Mesh(wheelGeo, gearMat);
      mw.rotation.z = Math.PI / 2;
      mw.position.set(sx, -1.05, -0.4);
      this.root.add(mw);
    }
  }

  // ── Update (called every frame by Game.js) ────────────────────────────────

  update(dt, input, camera) {
    // Propellers always spin; faster when occupied
    const propIdle  = 2.2;
    const propFull  = 22;
    const propSpeed = this.isOccupied
      ? propIdle + (Math.abs(this._speed) / 28) * (propFull - propIdle)
      : propIdle;
    if (this._propGroupL) this._propGroupL.rotation.z += dt * propSpeed;
    if (this._propGroupR) this._propGroupR.rotation.z -= dt * propSpeed;

    if (!this.isOccupied) return;

    const MAX_SPEED      = 30;
    const MIN_LIFT_SPEED = 7;   // below this: not enough lift to stay airborne
    const GRAVITY        = 10;

    // ── Throttle ──────────────────────────────────────────────────────────
    const throttleIn = input.isDown('KeyW') || input.isDown('ArrowUp')   ?  1 :
                       input.isDown('KeyS') || input.isDown('ArrowDown') ? -0.45 : 0;
    this._speed += throttleIn * 14 * dt;
    this._speed  = Math.max(-4, Math.min(MAX_SPEED, this._speed));
    // Aerodynamic drag
    this._speed -= this._speed * 0.55 * dt;

    // ── Yaw (A/D) ─────────────────────────────────────────────────────────
    const turnIn = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ?  1 : 0)
                 - (input.isDown('KeyD') || input.isDown('ArrowRight') ?  1 : 0);
    // Yaw rate proportional to speed (faster = more responsive)
    const yawRate = 1.1 * Math.min(1, Math.abs(this._speed) / 10 + 0.2);
    this.facing  += turnIn * yawRate * dt;

    // ── Pitch (mouse Y / right stick) ─────────────────────────────────────
    const pitchIn = -(input.mouse.dy ?? 0) * 0.0022
                  - (input.pad?.rightY ?? 0) * 1.8 * dt;
    this._pitch += pitchIn;
    this._pitch  = Math.max(-0.52, Math.min(0.52, this._pitch));
    // Auto-level pitch toward 0
    this._pitch -= this._pitch * 2.2 * dt;

    // ── Position update ───────────────────────────────────────────────────
    const sinF   = Math.sin(this.facing);
    const cosF   = Math.cos(this.facing);
    const cosPit = Math.cos(this._pitch);
    const sinPit = Math.sin(this._pitch);

    // Forward movement in XZ plane (forward = (sin, cos) * speed * cos(pitch))
    this.root.position.x += sinF * this._speed * cosPit * dt;
    this.root.position.z += cosF * this._speed * cosPit * dt;

    // ── Vertical velocity ──────────────────────────────────────────────────
    const speedFrac = Math.max(0, this._speed) / MAX_SPEED;
    const lift      = Math.min(1.08, speedFrac * 1.6);  // >1 = can gain altitude at full speed
    this._velY     += (-GRAVITY * (1 - lift) + sinPit * Math.abs(this._speed) * 2.8) * dt;
    this._velY      = Math.max(-22, Math.min(22, this._velY));
    this.root.position.y += this._velY * dt;

    // Ground clamp (wheels just above y=0)
    const minY = 1.1;
    if (this.root.position.y < minY) {
      this.root.position.y = minY;
      if (this._velY < 0) this._velY = 0;
      // Rolling friction when on ground
      this._speed -= this._speed * 1.2 * dt;
    }

    // ── Visual roll (bank into turns) ─────────────────────────────────────
    const rollTarget = -turnIn * Math.min(1, Math.abs(this._speed) / 14) * 0.55;
    this._roll += (rollTarget - this._roll) * (1 - Math.exp(-dt * 5));

    // ── Apply rotation ─────────────────────────────────────────────────────
    this.root.rotation.y = this.facing;
    this.root.rotation.z = this._roll;
    this.root.rotation.x = -this._pitch;
  }

  /** Called when player exits — reset flight state */
  resetFlightState() {
    this._speed  = 0;
    this._velY   = 0;
    this._pitch  = 0;
    this._roll   = 0;
  }
}
