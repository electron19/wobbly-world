import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── Helicopter — rideable police helicopter (black & white) ──────────────────
//
// Controls (when occupied):
//   W / ArrowUp   — fly forward
//   S / ArrowDown — fly backward
//   A             — rotate (yaw) left
//   D             — rotate (yaw) right
//   Space         — ascend
//   Shift / Ctrl  — descend
//
// Physics: pure kinematic (no Rapier). Hovers in place by default.
// Forward direction convention: facing=0 → +Z direction (same as Car/Airplane).
//
export class Helicopter {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.root       = new THREE.Group();
    this.isOccupied = false;
    this.isDrivable = true;
    this.facing     = 0;     // yaw [rad], root.rotation.y = facing
    this.type       = 'helicopter';

    this._velX = 0;
    this._velY = 0;
    this._velZ = 0;

    this._mainRotorGroup = null;
    this._tailRotorGroup = null;

    this._build();
    this.root.position.set(x, y, z);
    scene.add(this.root);
  }

  // ── Build geometry ────────────────────────────────────────────────────────

  _build() {
    const blackMat  = toonMat(0x1A1A1A);  // police black
    const whiteMat  = toonMat(0xF5F5F5);  // police white
    const glassMat  = new THREE.MeshToonMaterial({
      color: 0x9DD3F5, transparent: true, opacity: 0.68,
    });
    const metalMat  = toonMat(0x667788);
    const rotorMat  = toonMat(0x222222);

    // ── Main fuselage ──────────────────────────────────────────────────────
    // Body: black rear section
    const bodyRear = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.4, 2.8),
      blackMat,
    );
    bodyRear.position.set(0, 0, -0.4);
    bodyRear.castShadow = true;
    this.root.add(bodyRear);
    addOutline(bodyRear, 0.07);

    // White nose/cockpit section
    const bodyNose = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 1.3, 1.6),
      whiteMat,
    );
    bodyNose.position.set(0, 0, 1.4);
    bodyNose.castShadow = true;
    this.root.add(bodyNose);
    addOutline(bodyNose, 0.07);

    // Cockpit glass bubble (front)
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
      glassMat,
    );
    cockpit.rotation.x = -Math.PI * 0.25;
    cockpit.scale.set(1.05, 0.85, 0.95);
    cockpit.position.set(0, 0.08, 2.0);
    this.root.add(cockpit);

    // ── Police stripe (white diagonal across black body) ──────────────────
    const stripeMat = whiteMat;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.32, 1.0),
      stripeMat,
    );
    stripe.position.set(0, 0.45, -0.1);
    this.root.add(stripe);

    // "POLICJA" text badge (blue rectangle on side)
    const badgeMat = toonMat(0x1144AA);
    for (const sx of [-0.96, 0.96]) {
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.28, 0.9),
        badgeMat,
      );
      badge.position.set(sx, 0.36, 0.9);
      this.root.add(badge);
    }

    // ── Tail boom ─────────────────────────────────────────────────────────
    const tailBoom = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 3.2),
      blackMat,
    );
    tailBoom.position.set(0, 0.22, -2.8);
    tailBoom.castShadow = true;
    this.root.add(tailBoom);
    addOutline(tailBoom, 0.06);

    // Tail fin (vertical)
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.9, 0.7),
      blackMat,
    );
    tailFin.position.set(0, 0.68, -4.18);
    this.root.add(tailFin);
    addOutline(tailFin, 0.06);

    // Tail horizontal stabiliser
    const hStab = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 0.5),
      blackMat,
    );
    hStab.position.set(0, 0.22, -4.18);
    this.root.add(hStab);
    addOutline(hStab, 0.06);

    // ── Main rotor hub + blades ────────────────────────────────────────────
    this._mainRotorGroup = new THREE.Group();
    this._mainRotorGroup.position.set(0, 0.92, 0);

    // Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.25, 8),
      metalMat,
    );
    this._mainRotorGroup.add(hub);

    // 3 rotor blades
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 0.1, 0.34),
        rotorMat,
      );
      blade.rotation.y = (i / 3) * Math.PI * 2;
      blade.position.set(0, 0.18, 0);
      this._mainRotorGroup.add(blade);
    }
    this.root.add(this._mainRotorGroup);

    // Rotor mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6),
      metalMat,
    );
    mast.position.set(0, 0.57, 0);
    this.root.add(mast);

    // ── Tail rotor ────────────────────────────────────────────────────────
    this._tailRotorGroup = new THREE.Group();
    this._tailRotorGroup.position.set(0.24, 0.22, -4.18);

    const tailHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.18, 6),
      metalMat,
    );
    tailHub.rotation.z = Math.PI / 2;
    this._tailRotorGroup.add(tailHub);

    for (let i = 0; i < 2; i++) {
      const tb = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.2, 0.2),
        rotorMat,
      );
      tb.rotation.x = (i / 2) * Math.PI;
      this._tailRotorGroup.add(tb);
    }
    this.root.add(this._tailRotorGroup);

    // ── Landing skids ──────────────────────────────────────────────────────
    const skidMat = metalMat;
    const crossBar = new THREE.BoxGeometry(0.08, 0.08, 1.85);
    const skid     = new THREE.BoxGeometry(2.2, 0.07, 0.08);

    for (const sx of [-0.88, 0.88]) {
      // Longitudinal skid bar
      const sk = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 3.0),
        skidMat,
      );
      sk.position.set(sx, -0.78, -0.2);
      this.root.add(sk);

      // Cross struts (front + rear)
      for (const sz of [0.8, -1.2]) {
        const cs = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.55, 0.08),
          skidMat,
        );
        cs.position.set(sx, -0.5, sz);
        this.root.add(cs);
      }
    }
    // Skid foot rail (connects both skids)
    for (const sz of [0.8, -1.2]) {
      const rail = new THREE.Mesh(skid, skidMat);
      rail.position.set(0, -0.78, sz);
      this.root.add(rail);
    }

    // ── Police lightbar (top of fuselage) ─────────────────────────────────
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.14, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    barBase.position.set(0, 0.77, 0.5);
    this.root.add(barBase);

    this._policeLightsRed  = [];
    this._policeLightsBlue = [];

    const lbGeoRed  = new THREE.SphereGeometry(0.13, 7, 6);
    const lbGeoBlue = new THREE.SphereGeometry(0.13, 7, 6);

    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 0.38;

      const rl = new THREE.Mesh(lbGeoRed, new THREE.MeshBasicMaterial({ color: 0xFF1111 }));
      rl.position.set(sx, 0.91, 0.28);
      this.root.add(rl);
      this._policeLightsRed.push(rl);

      const bl = new THREE.Mesh(lbGeoBlue, new THREE.MeshBasicMaterial({ color: 0x1144FF }));
      bl.position.set(sx, 0.91, 0.72);
      this.root.add(bl);
      this._policeLightsBlue.push(bl);
    }

    // Searchlight (under nose)
    const slightMat = new THREE.MeshBasicMaterial({ color: 0xFFFFDD });
    const slight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.32, 8), slightMat);
    slight.position.set(0, -0.72, 1.6);
    this.root.add(slight);
  }

  // ── Update (called every frame by Game.js) ────────────────────────────────

  update(dt, input) {
    // Always spin rotors (faster when occupied)
    const mainSpeed = this.isOccupied ? 14 : 4;
    const tailSpeed = this.isOccupied ? 28 : 8;
    if (this._mainRotorGroup) this._mainRotorGroup.rotation.y -= dt * mainSpeed;
    if (this._tailRotorGroup) this._tailRotorGroup.rotation.x += dt * tailSpeed;

    // Flash police lights
    const flash = Math.floor(performance.now() / 180) % 2 === 0;
    this._policeLightsRed?.forEach(l  => l.material.color.setHex(flash ? 0xFF1111 : 0x330000));
    this._policeLightsBlue?.forEach(l => l.material.color.setHex(flash ? 0x2255FF : 0x000822));

    if (!this.isOccupied) return;

    const H_SPEED = 9;
    const V_SPEED = 7;
    const DRAG    = 4.5;

    // ── Yaw (A/D keys) ────────────────────────────────────────────────────
    const yawIn = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ?  1 : 0)
                - (input.isDown('KeyD') || input.isDown('ArrowRight') ?  1 : 0);
    this.facing += yawIn * 1.8 * dt;

    // ── Horizontal thrust in facing direction ─────────────────────────────
    const sinF = Math.sin(this.facing);
    const cosF = Math.cos(this.facing);

    const fwdIn  = (input.isDown('KeyW') || input.isDown('ArrowUp')   ?  1 : 0)
                 - (input.isDown('KeyS') || input.isDown('ArrowDown') ?  1 : 0);

    const padLX  = input.pad?.leftX  ?? 0;
    const padLY  = input.pad?.leftY  ?? 0;

    const thrustX = fwdIn * sinF * H_SPEED + padLX * cosF * H_SPEED;
    const thrustZ = fwdIn * cosF * H_SPEED - padLX * sinF * H_SPEED;

    this._velX += (thrustX - this._velX) * (1 - Math.exp(-DRAG * dt));
    this._velZ += (thrustZ - this._velZ) * (1 - Math.exp(-DRAG * dt));

    this.root.position.x += this._velX * dt;
    this.root.position.z += this._velZ * dt;

    // ── Vertical ──────────────────────────────────────────────────────────
    const upIn  = (input.isDown('Space') ? 1 : 0);
    const dnIn  = (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ||
                   input.isDown('ControlLeft') || input.isDown('ControlRight') ? 1 : 0);
    const vTgt  = (upIn - dnIn) * V_SPEED + (input.pad?.leftY < -0.12 ? -V_SPEED : 0);
    this._velY  += (vTgt - this._velY) * (1 - Math.exp(-DRAG * 1.2 * dt));

    this.root.position.y += this._velY * dt;

    // Ground clamp
    const minY = 1.0;
    if (this.root.position.y < minY) {
      this.root.position.y = minY;
      if (this._velY < 0) this._velY = 0;
    }

    // ── Visual tilt ───────────────────────────────────────────────────────
    // Nose pitches forward when flying forward, sideways tilt when strafing
    const fwdSpeed = this._velX * sinF + this._velZ * cosF;
    this.root.rotation.y = this.facing;
    this.root.rotation.x = THREE.MathUtils.lerp(
      this.root.rotation.x, -fwdSpeed * 0.04, 1 - Math.exp(-dt * 6),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(
      this.root.rotation.z, yawIn * -0.06, 1 - Math.exp(-dt * 5),
    );
  }

  /** Reset flight state on exit */
  resetFlightState() {
    this._velX = 0;
    this._velY = 0;
    this._velZ = 0;
  }
}
