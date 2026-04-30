import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── Bomber — B-29 Enola Gay ──────────────────────────────────────────────────
//
// Controls: same as Airplane / FighterJet.
// Physics: heavy, slow, 4 radial engines with spinning propellers.

export class Bomber {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.root       = new THREE.Group();
    this.isOccupied = false;
    this.isDrivable = true;
    this.facing     = 0;
    this.type       = 'bomber';

    this._pitch     = 0;
    this._roll      = 0;
    this._speed     = 0;
    this._velY      = 0;
    this._throttle  = 0;

    this._propGroups = [];   // 4 prop groups

    this._build();
    this.root.position.set(x, y, z);
    scene.add(this.root);
  }

  // ── Build geometry ─────────────────────────────────────────────────────────

  _build() {
    const bodyMat    = toonMat(0x4A5C2A);   // olive drab
    const wingMat    = toonMat(0xC8B870);   // natural metal
    const glassMat   = new THREE.MeshToonMaterial({ color: 0xAADDEE, transparent: true, opacity: 0.70 });
    const nacelleMat = toonMat(0x888870);
    const propMat    = toonMat(0x1A1A1A);
    const gearMat    = toonMat(0x444444);
    const turretMat  = toonMat(0x3A4A1A);

    // ── Fuselage — long fat cylinder along Z ──────────────────────────────────
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 9.0, 14), bodyMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    this.root.add(fuselage);
    addOutline(fuselage, 0.09);

    // Nose — rounded sphere flattened forward
    const noseSphere = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), glassMat);
    noseSphere.scale.set(0.85, 0.85, 0.7);
    noseSphere.position.z = 4.7;
    this.root.add(noseSphere);

    // Tail cone
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.80, 2.0, 10), bodyMat);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.z = -5.5;
    this.root.add(tailCone);
    addOutline(tailCone, 0.06);

    // Nose greenhouse windows (small boxes on the nose)
    const winMat = new THREE.MeshToonMaterial({ color: 0xCCEEFF, transparent: true, opacity: 0.65 });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.08), winMat);
      win.position.set(Math.cos(ang) * 0.68, Math.sin(ang) * 0.65 - 0.1, 4.5);
      this.root.add(win);
    }

    // ── Large straight wings ──────────────────────────────────────────────────
    // Total span ~44 units — each half = 22 units extending from root
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 5), wingMat);
      wing.castShadow = true;
      wing.position.set(sx * 11.5, -0.15, 0.2);
      // Slight dihedral
      wing.rotation.z = sx * 0.04;
      this.root.add(wing);
      addOutline(wing, 0.06);
    }

    // ── 4 engine nacelles + propellers ───────────────────────────────────────
    // 2 per wing: inboard at ±5, outboard at ±12
    const enginePositions = [
      { sx: -1, dist: 4.5 },
      { sx: -1, dist: 10.5 },
      { sx:  1, dist: 4.5 },
      { sx:  1, dist: 10.5 },
    ];

    for (const ep of enginePositions) {
      const nx = ep.sx * ep.dist;
      const ny = -0.35;
      const nz = 0.8;

      // Nacelle
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 1.6, 10), nacelleMat);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(nx, ny, nz);
      this.root.add(nacelle);
      addOutline(nacelle, 0.05);

      // Prop hub
      const hubGeo = new THREE.SphereGeometry(0.18, 7, 6);
      const hub = new THREE.Mesh(hubGeo, nacelleMat);
      hub.position.set(nx, ny, nz + 0.90);
      this.root.add(hub);

      // Prop group
      const propGroup = new THREE.Group();
      propGroup.position.set(nx, ny, nz + 0.92);

      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.10, 2.4, 0.28),
          propMat,
        );
        blade.rotation.z = (i / 4) * Math.PI * 2;
        propGroup.add(blade);
      }
      this.root.add(propGroup);
      this._propGroups.push(propGroup);
    }

    // ── Tail surfaces ──────────────────────────────────────────────────────────
    // Vertical fin
    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 2.4), bodyMat);
    vFin.position.set(0, 1.7, -5.0);
    this.root.add(vFin);
    addOutline(vFin, 0.07);

    // Horizontal stabilisers
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.18, 2.0), wingMat);
    hStab.position.set(0, 0.4, -5.2);
    this.root.add(hStab);
    addOutline(hStab, 0.06);

    // ── Defensive gun turrets (decorative) ────────────────────────────────────
    const turretPositions = [
      { x: 0,    y: 1.15, z:  1.5 },   // dorsal front
      { x: 0,    y: 1.15, z: -2.0 },   // dorsal rear
      { x: 0,    y: -0.9, z:  0.5 },   // ventral
    ];
    for (const tp of turretPositions) {
      const turret = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), turretMat);
      turret.position.set(tp.x, tp.y, tp.z);
      this.root.add(turret);
      // Gun barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 5), toonMat(0x333333));
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(tp.x + 0.38, tp.y, tp.z);
      this.root.add(barrel);
    }

    // ── Landing gear ──────────────────────────────────────────────────────────
    const bigWheelGeo  = new THREE.CylinderGeometry(0.28, 0.28, 0.20, 10);
    const bigStrutGeo  = new THREE.BoxGeometry(0.14, 0.80, 0.14);
    const smallWheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 8);
    const smallStrutGeo = new THREE.BoxGeometry(0.10, 0.58, 0.10);

    // Nose gear
    const ns = new THREE.Mesh(smallStrutGeo, gearMat);
    ns.position.set(0, -1.0, 3.5);
    this.root.add(ns);
    const nw = new THREE.Mesh(smallWheelGeo, gearMat);
    nw.rotation.z = Math.PI / 2;
    nw.position.set(0, -1.4, 3.5);
    this.root.add(nw);

    // Main gear (2 per side)
    for (const sx of [-1, 1]) {
      for (const dz of [0.2, -0.6]) {
        const ms = new THREE.Mesh(bigStrutGeo, gearMat);
        ms.position.set(sx * 3.2, -1.0, dz);
        this.root.add(ms);
        const mw = new THREE.Mesh(bigWheelGeo, gearMat);
        mw.rotation.z = Math.PI / 2;
        mw.position.set(sx * 3.2, -1.45, dz);
        this.root.add(mw);
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt, input, camera, audio = null) {
    // Spatial engine sound
    const { x, y, z } = this.root.position;
    audio?.updateBomberEngine?.(this, x, y, z, this._throttle);

    const propIdle  = 1.8;
    const propFull  = 12;
    const propSpeed = this.isOccupied
      ? propIdle + (Math.abs(this._speed) / 36) * (propFull - propIdle)
      : propIdle;
    // Alternating rotation direction for realism
    for (let i = 0; i < this._propGroups.length; i++) {
      const dir = (i % 2 === 0) ? 1 : -1;
      this._propGroups[i].rotation.z += dir * dt * propSpeed;
    }

    if (!this.isOccupied) return;

    const MAX_SPEED      = 36;
    const MIN_LIFT_SPEED = 10;
    const ACCEL          = 10;
    const DRAG           = 0.28;
    const TURN_RATE      = 0.85;
    const PITCH_LIMIT    = 0.40;
    const PITCH_LEVEL    = 1.6;
    const GRAVITY        = 10;

    // ── Throttle ──────────────────────────────────────────────────────────────
    const throttleIn = input.isDown('KeyW') || input.isDown('ArrowUp')   ?  1 :
                       input.isDown('KeyS') || input.isDown('ArrowDown') ? -0.4 : 0;

    this._throttle += throttleIn * dt * 0.6;
    this._throttle  = Math.max(0, Math.min(1, this._throttle));

    this._speed += throttleIn * ACCEL * dt;
    this._speed -= this._speed * DRAG * dt;
    this._speed  = Math.max(-4, Math.min(MAX_SPEED, this._speed));

    // ── Yaw ───────────────────────────────────────────────────────────────────
    const turnIn = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ?  1 : 0)
                 - (input.isDown('KeyD') || input.isDown('ArrowRight') ?  1 : 0);
    const yawRate = TURN_RATE * Math.min(1, Math.abs(this._speed) / 12 + 0.15);
    this.facing += turnIn * yawRate * dt;

    // ── Pitch ─────────────────────────────────────────────────────────────────
    const pitchIn = -(input.mouse.dy ?? 0) * 0.0016
                  - (input.pad?.rightY ?? 0) * 1.4 * dt;
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
    const lift = Math.min(1.06, speedFrac * 1.5);
    this._velY += (-GRAVITY * (1 - lift) + sinPit * Math.abs(this._speed) * 2.4) * dt;
    this._velY  = Math.max(-20, Math.min(18, this._velY));
    this.root.position.y += this._velY * dt;

    const minY = 1.5;
    if (this.root.position.y < minY) {
      this.root.position.y = minY;
      if (this._velY < 0) this._velY = 0;
      this._speed -= this._speed * 0.9 * dt;
    }

    // ── Visual roll ───────────────────────────────────────────────────────────
    const rollTarget = -turnIn * Math.min(1, Math.abs(this._speed) / 20) * 0.45;
    this._roll += (rollTarget - this._roll) * (1 - Math.exp(-dt * 4));

    // ── Apply rotation ────────────────────────────────────────────────────────
    this.root.rotation.y = this.facing;
    this.root.rotation.z = this._roll;
    this.root.rotation.x = -this._pitch;
  }

  resetFlightState() {
    this._speed    = 0;
    this._velY     = 0;
    this._pitch    = 0;
    this._roll     = 0;
    this._throttle = 0;
  }
}
