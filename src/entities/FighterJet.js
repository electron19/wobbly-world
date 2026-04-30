import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── FighterJet — rideable F-16 Fighting Falcon ───────────────────────────────
//
// Controls (identical to Airplane):
//   W / ArrowUp    — throttle up
//   S / ArrowDown  — throttle down
//   A / D          — yaw / bank
//   Mouse Y        — pitch
//
// Physics constants match a fast jet:
//   MAX_SPEED: 95 u/s   MIN_LIFT_SPEED: 22 u/s   ACCEL: 32 u/s²

export class FighterJet {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.root       = new THREE.Group();
    this.isOccupied = false;
    this.isDrivable = true;
    this.facing     = 0;
    this.type       = 'jet';

    this._pitch     = 0;
    this._roll      = 0;
    this._speed     = 0;
    this._velY      = 0;
    this._throttle  = 0;   // [0..1]

    this._afterburnerGroup = null;

    this._build();
    this.root.position.set(x, y, z);
    scene.add(this.root);
  }

  // ── Build geometry ─────────────────────────────────────────────────────────

  _build() {
    const bodyMat  = toonMat(0xB0B0BA);   // USAF grey
    const darkMat  = toonMat(0x6A6A74);
    const glassMat = new THREE.MeshToonMaterial({ color: 0x88BBDD, transparent: true, opacity: 0.75 });
    const nozzleMat = toonMat(0x3A3A3A);
    const gearMat  = toonMat(0x555566);
    const whiteMat = toonMat(0xDDDDDD);

    // ── Fuselage ──────────────────────────────────────────────────────────────
    // Main fuselage box (long and narrow)
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 7.0), bodyMat);
    fuselage.castShadow = true;
    this.root.add(fuselage);
    addOutline(fuselage, 0.06);

    // Nose (tapered box)
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.45, 2.4, 8), bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 4.7;
    this.root.add(nose);
    addOutline(nose, 0.05);

    // Air intake humps under fuselage
    const intakeMat = toonMat(0x8888A0);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 2.2), intakeMat);
    intake.position.set(0, -0.45, 1.2);
    this.root.add(intake);

    // Engine nozzle at tail
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 10), nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -4.0;
    this.root.add(nozzle);

    // ── Cockpit canopy ────────────────────────────────────────────────────────
    const canopyBase = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 1.4), bodyMat);
    canopyBase.position.set(0, 0.52, 2.0);
    this.root.add(canopyBase);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), glassMat);
    canopy.scale.set(0.72, 0.72, 1.35);
    canopy.position.set(0, 0.52, 1.9);
    this.root.add(canopy);

    // ── Delta wings ───────────────────────────────────────────────────────────
    // Characteristic F-16 cropped delta wing — wide at root/rear, narrow at tip/front
    for (const side of [-1, 1]) {
      const wingGroup = new THREE.Group();
      wingGroup.position.set(side * 0.5, -0.12, 0);

      // Main delta surface: wide box, skewed with rotation
      const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 3.2), bodyMat);
      wing.castShadow = true;
      // Sweep angle: rotate so leading edge angles forward
      wing.rotation.y = side * 0.32;
      wing.position.set(side * 1.8, 0, -0.4);
      wingGroup.add(wing);
      addOutline(wing, 0.05);

      // Wingtip flat extension
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 1.0), bodyMat);
      tip.position.set(side * 3.85, 0, -1.0);
      wingGroup.add(tip);

      this.root.add(wingGroup);
    }

    // ── Vertical tail fin ─────────────────────────────────────────────────────
    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 2.0), darkMat);
    vFin.position.set(0, 1.3, -2.8);
    vFin.castShadow = true;
    this.root.add(vFin);
    addOutline(vFin, 0.05);

    // ── Horizontal tail stabilators ───────────────────────────────────────────
    for (const sx of [-1, 1]) {
      const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.0), bodyMat);
      stab.position.set(sx * 1.0, -0.2, -2.8);
      stab.rotation.y = sx * 0.15;
      this.root.add(stab);
      addOutline(stab, 0.05);
    }

    // ── Air-to-air missiles on wingtips (decor) ───────────────────────────────
    const missileMat = toonMat(0xCCCCCC);
    for (const sx of [-1, 1]) {
      const missile = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), missileMat);
      missile.rotation.x = Math.PI / 2;
      missile.position.set(sx * 4.2, -0.16, -0.6);
      this.root.add(missile);
    }

    // ── Decals / livery stripes ───────────────────────────────────────────────
    const stripeMat = toonMat(0x444455);
    const stripeTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 3.0), stripeMat);
    stripeTop.position.set(0, 0.47, -0.5);
    this.root.add(stripeTop);

    // Roundel (US star) placeholder
    for (const sx of [-1, 1]) {
      const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 8), toonMat(0xCC2222));
      roundel.rotation.z = Math.PI / 2;
      roundel.position.set(sx * 2.2, -0.08, 0.5);
      this.root.add(roundel);
    }

    // ── Landing gear ──────────────────────────────────────────────────────────
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 8);
    const strutGeo = new THREE.BoxGeometry(0.1, 0.55, 0.1);

    // Nose gear
    const noseStrut = new THREE.Mesh(strutGeo, gearMat);
    noseStrut.position.set(0, -0.65, 3.0);
    this.root.add(noseStrut);
    const noseWheel = new THREE.Mesh(wheelGeo, gearMat);
    noseWheel.rotation.z = Math.PI / 2;
    noseWheel.position.set(0, -1.0, 3.0);
    this.root.add(noseWheel);

    // Main gear (under wings)
    for (const sx of [-1.4, 1.4]) {
      const ms = new THREE.Mesh(strutGeo, gearMat);
      ms.position.set(sx, -0.65, 0.2);
      this.root.add(ms);
      const mw = new THREE.Mesh(wheelGeo, gearMat);
      mw.rotation.z = Math.PI / 2;
      mw.position.set(sx, -1.0, 0.2);
      this.root.add(mw);
    }

    // ── Afterburner group (visible when throttle > 0.7) ───────────────────────
    this._afterburnerGroup = new THREE.Group();
    this._afterburnerGroup.position.set(0, 0, -4.6);

    const abMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.8 });
    const abCore = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 10, 1, true), abMat);
    abCore.rotation.x = -Math.PI / 2;  // point rearward
    abCore.position.z = -0.8;
    this._afterburnerGroup.add(abCore);

    const abGlowMat = new THREE.MeshBasicMaterial({ color: 0xFFFF44, transparent: true, opacity: 0.5 });
    const abGlow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 8, 1, true), abGlowMat);
    abGlow.rotation.x = -Math.PI / 2;
    abGlow.position.z = -0.4;
    this._afterburnerGroup.add(abGlow);

    this._afterburnerGroup.visible = false;
    this.root.add(this._afterburnerGroup);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt, input, camera, audio = null) {
    // Spatial engine sound — always update position/throttle
    const { x, y, z } = this.root.position;
    audio?.updateJetEngine?.(this, x, y, z, this._throttle);

    if (!this.isOccupied) return;

    const MAX_SPEED      = 95;
    const MIN_LIFT_SPEED = 22;
    const ACCEL          = 32;
    const DRAG           = 0.32;
    const TURN_RATE      = 2.4;
    const PITCH_LIMIT    = 0.65;
    const PITCH_LEVEL    = 3.0;
    const GRAVITY        = 12;

    // ── Throttle ──────────────────────────────────────────────────────────────
    const throttleIn = input.isDown('KeyW') || input.isDown('ArrowUp')   ?  1 :
                       input.isDown('KeyS') || input.isDown('ArrowDown') ? -0.5 : 0;

    this._throttle += throttleIn * dt * 0.85;
    this._throttle  = Math.max(0, Math.min(1, this._throttle));

    // Speed from throttle
    const thrustForce = throttleIn > 0 ? throttleIn * ACCEL : throttleIn * (ACCEL * 0.4);
    this._speed += thrustForce * dt;
    this._speed -= this._speed * DRAG * dt;
    this._speed  = Math.max(-8, Math.min(MAX_SPEED, this._speed));

    // ── Yaw ───────────────────────────────────────────────────────────────────
    const turnIn = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ?  1 : 0)
                 - (input.isDown('KeyD') || input.isDown('ArrowRight') ?  1 : 0);
    const yawRate = TURN_RATE * Math.min(1, Math.abs(this._speed) / 30 + 0.12);
    this.facing += turnIn * yawRate * dt;

    // ── Pitch ─────────────────────────────────────────────────────────────────
    const pitchIn = -(input.mouse.dy ?? 0) * 0.0018
                  - (input.pad?.rightY ?? 0) * 1.6 * dt;
    this._pitch += pitchIn;
    this._pitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch));
    this._pitch -= this._pitch * PITCH_LEVEL * dt;

    // ── Position update ───────────────────────────────────────────────────────
    const sinF   = Math.sin(this.facing);
    const cosF   = Math.cos(this.facing);
    const cosPit = Math.cos(this._pitch);
    const sinPit = Math.sin(this._pitch);

    this.root.position.x += sinF * this._speed * cosPit * dt;
    this.root.position.z += cosF * this._speed * cosPit * dt;

    // ── Vertical ──────────────────────────────────────────────────────────────
    const speedFrac = Math.max(0, this._speed) / MAX_SPEED;
    const lift = Math.min(1.1, speedFrac * 1.7);
    this._velY += (-GRAVITY * (1 - lift) + sinPit * Math.abs(this._speed) * 3.2) * dt;
    this._velY  = Math.max(-32, Math.min(32, this._velY));
    this.root.position.y += this._velY * dt;

    const minY = 1.2;
    if (this.root.position.y < minY) {
      this.root.position.y = minY;
      if (this._velY < 0) this._velY = 0;
      this._speed -= this._speed * 1.0 * dt;
    }

    // ── Visual roll ───────────────────────────────────────────────────────────
    const rollTarget = -turnIn * Math.min(1, Math.abs(this._speed) / 40) * 0.68;
    this._roll += (rollTarget - this._roll) * (1 - Math.exp(-dt * 6));

    // ── Apply rotation ────────────────────────────────────────────────────────
    this.root.rotation.y = this.facing;
    this.root.rotation.z = this._roll;
    this.root.rotation.x = -this._pitch;

    // ── Afterburner visibility ────────────────────────────────────────────────
    if (this._afterburnerGroup) {
      this._afterburnerGroup.visible = this._throttle > 0.7;
      if (this._throttle > 0.7) {
        // Flicker scale
        const flicker = 0.85 + Math.sin(performance.now() * 0.02) * 0.15;
        this._afterburnerGroup.scale.setScalar(flicker);
      }
    }
  }

  resetFlightState() {
    this._speed    = 0;
    this._velY     = 0;
    this._pitch    = 0;
    this._roll     = 0;
    this._throttle = 0;
    if (this._afterburnerGroup) this._afterburnerGroup.visible = false;
  }
}
