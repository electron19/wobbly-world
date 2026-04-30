import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── Helicopter — rideable police helicopter (black & white) ──────────────────
//
// Controls (when occupied):
//   W / S / ArrowUp/Down  — fly forward / backward
//   A / D / ArrowLeft/Right — yaw left / right
//   Space                 — ascend   |  Shift/Ctrl — descend
//   Pad left stick Y      — forward/backward
//   Pad left stick X      — strafe
//   Pad right stick X     — yaw
//   Pad right stick Y     — altitude (up/down)
//
// Physics: kinematic. Hovers in place when idle.
// Forward convention: facing=0 → +Z (same as Car/Airplane).

const H_ACCEL     = 14;    // przyspieszenie poziome [m/s²]
const H_DRAG      = 0.9;   // opór powietrza poziomo — mała wartość = duża bezwładność
const V_ACCEL     = 10;    // przyspieszenie pionowe
const V_DRAG      = 1.4;   // opór pionowy
const H_MAX_SPD   = 28;    // max prędkość pozioma [m/s]
const V_MAX_SPD   = 10;    // max prędkość pionowa [m/s]
const YAW_SPD     = 1.9;
const BULLET_SPD  = 65;    // prędkość pocisku [m/s]
const BULLET_LIFE = 2.8;   // max czas życia pocisku [s]
const SHOOT_CD    = 0.14;  // cooldown strzału [s] — ~7 pocisków/s

export class Helicopter {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.root       = new THREE.Group();
    this.isOccupied = false;
    this.isDrivable = true;
    this.facing     = 0;
    this.type       = 'helicopter';
    this._scene     = scene;

    this._velX = 0;
    this._velY = 0;
    this._velZ = 0;

    // Strzelanie
    this._bullets      = [];
    this._shootCooldown = 0;

    this._mainRotorGroup  = null;
    this._tailRotorGroup  = null;
    this._policeLightsRed = [];
    this._policeLightsBlue = [];
    this._searchlightCone = null;

    this._build();
    this.root.position.set(x, y, z);
    scene.add(this.root);
  }

  // ── Build geometry ────────────────────────────────────────────────────────

  _build() {
    const blackMat  = toonMat(0x1A1A1A);
    const whiteMat  = toonMat(0xEEEEEE);
    const glassMat  = new THREE.MeshToonMaterial({
      color: 0x9DD3F5, transparent: true, opacity: 0.72,
    });
    const metalMat  = toonMat(0x778899);
    const rotorMat  = toonMat(0x1A1A1A);
    const badgeMat  = toonMat(0x1144BB);

    // ── Fuselage ──────────────────────────────────────────────────────────────

    // Rear body (black)
    const bodyRear = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.4, 2.8),
      blackMat,
    );
    bodyRear.position.set(0, 0, -0.5);
    bodyRear.castShadow = true;
    this.root.add(bodyRear);
    addOutline(bodyRear, 0.07);

    // White nose/cockpit section
    const bodyNose = new THREE.Mesh(
      new THREE.BoxGeometry(1.80, 1.28, 1.80),
      whiteMat,
    );
    bodyNose.position.set(0, -0.02, 1.4);
    bodyNose.castShadow = true;
    this.root.add(bodyNose);
    addOutline(bodyNose, 0.07);

    // Mid transition connector (fills visual gap between front/rear)
    const bodyMid = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 1.36, 0.50),
      blackMat,
    );
    bodyMid.position.set(0, -0.01, 0.26);
    bodyMid.castShadow = true;
    this.root.add(bodyMid);
    addOutline(bodyMid, 0.05);

    // Cockpit glass bubble (front)
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      glassMat,
    );
    cockpit.rotation.x = -Math.PI * 0.22;
    cockpit.scale.set(1.08, 0.90, 1.05);
    cockpit.position.set(0, 0.05, 2.00);
    this.root.add(cockpit);

    // Side windows
    for (const sx of [-0.91, 0.91]) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.40, 0.55),
        glassMat,
      );
      win.position.set(sx, 0.10, 1.36);
      this.root.add(win);
    }

    // ── Police livery ──────────────────────────────────────────────────────────

    // White diagonal stripe across the black rear body
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.30, 1.10),
      toonMat(0xDDDDDD),
    );
    stripe.position.set(0, 0.42, -0.08);
    this.root.add(stripe);

    // Blue "POLICJA" badge on each side
    for (const sx of [-0.96, 0.96]) {
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.24, 0.85),
        badgeMat,
      );
      badge.position.set(sx, 0.34, 0.90);
      this.root.add(badge);
    }

    // Tail registration number
    const numMat = toonMat(0xFFFFFF);
    for (const sx of [-0.96, 0.96]) {
      const num = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.18, 0.40),
        numMat,
      );
      num.position.set(sx, 0.22, -1.20);
      this.root.add(num);
    }

    // ── Tail boom ─────────────────────────────────────────────────────────────

    const tailBoom = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.46, 3.4),
      blackMat,
    );
    tailBoom.position.set(0, 0.16, -2.9);
    tailBoom.castShadow = true;
    this.root.add(tailBoom);
    addOutline(tailBoom, 0.06);

    // Exhaust vent on top of tail boom
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.36),
      toonMat(0x333333),
    );
    vent.position.set(0, 0.40, -1.80);
    this.root.add(vent);

    // Tail fin (vertical stabilizer)
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.0, 0.75),
      blackMat,
    );
    tailFin.position.set(0, 0.72, -4.55);
    this.root.add(tailFin);
    addOutline(tailFin, 0.06);

    // Tail horizontal stabilizer
    const hStab = new THREE.Mesh(
      new THREE.BoxGeometry(1.80, 0.12, 0.55),
      blackMat,
    );
    hStab.position.set(0, 0.16, -4.55);
    this.root.add(hStab);
    addOutline(hStab, 0.06);

    // ── Main rotor mast + hub + blades ────────────────────────────────────────

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.72, 6),
      metalMat,
    );
    mast.position.set(0, 0.56, 0);
    this.root.add(mast);

    this._mainRotorGroup = new THREE.Group();
    this._mainRotorGroup.position.set(0, 0.94, 0);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.20, 0.22, 8),
      metalMat,
    );
    this._mainRotorGroup.add(hub);

    // 4 rotor blades, evenly spaced
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.09, 0.38),
        rotorMat,
      );
      blade.rotation.y = (i / 4) * Math.PI * 2;
      blade.position.set(0, 0.16, 0);
      this._mainRotorGroup.add(blade);
    }
    this.root.add(this._mainRotorGroup);

    // ── Tail rotor + guard ────────────────────────────────────────────────────

    this._tailRotorGroup = new THREE.Group();
    this._tailRotorGroup.position.set(0.28, 0.42, -4.55);

    const tailHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6),
      metalMat,
    );
    tailHub.rotation.z = Math.PI / 2;
    this._tailRotorGroup.add(tailHub);

    for (let i = 0; i < 2; i++) {
      const tb = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.30, 0.22),
        rotorMat,
      );
      tb.rotation.x = (i / 2) * Math.PI;
      this._tailRotorGroup.add(tb);
    }
    this.root.add(this._tailRotorGroup);

    // Tail rotor protective ring
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.055, 6, 18),
      toonMat(0x111111),
    );
    guard.position.set(0.28, 0.42, -4.55);
    guard.rotation.y = Math.PI / 2;
    this.root.add(guard);

    // ── Landing skids ──────────────────────────────────────────────────────────

    for (const sx of [-0.90, 0.90]) {
      // Longitudinal skid rail
      const sk = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 3.20),
        metalMat,
      );
      sk.position.set(sx, -0.82, -0.22);
      this.root.add(sk);

      // Mounting struts — connect fuselage to skid rails
      for (const sz of [0.75, -1.25]) {
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.52, 0.09),
          metalMat,
        );
        strut.position.set(sx, -0.50, sz);
        this.root.add(strut);
      }
    }

    // Cross rails connecting both skid rails
    for (const sz of [0.75, -1.25]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(1.80, 0.08, 0.09),
        metalMat,
      );
      rail.position.set(0, -0.82, sz);
      this.root.add(rail);
    }

    // ── Police lightbar (top of fuselage) ─────────────────────────────────────

    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.30, 0.14, 0.54),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    barBase.position.set(0, 0.79, 0.42);
    this.root.add(barBase);

    const lbGeoRed  = new THREE.SphereGeometry(0.14, 7, 6);
    const lbGeoBlue = new THREE.SphereGeometry(0.14, 7, 6);

    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 0.40;

      const rl = new THREE.Mesh(lbGeoRed, new THREE.MeshBasicMaterial({ color: 0xFF1111 }));
      rl.position.set(sx, 0.94, 0.24);
      this.root.add(rl);
      this._policeLightsRed.push(rl);

      const bl = new THREE.Mesh(lbGeoBlue, new THREE.MeshBasicMaterial({ color: 0x1144FF }));
      bl.position.set(sx, 0.94, 0.60);
      this.root.add(bl);
      this._policeLightsBlue.push(bl);
    }

    // Antenna on tail transition
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.55, 4),
      metalMat,
    );
    antenna.position.set(0.55, 0.98, -0.60);
    this.root.add(antenna);

    // Searchlight housing (under nose)
    const slight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 0.30, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFFFCC }),
    );
    slight.position.set(0, -0.76, 1.55);
    this.root.add(slight);

    // Searchlight cone (visible glow when occupied)
    this._searchlightCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xFFFFAA,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this._searchlightCone.position.set(0, -1.88, 1.55);
    this._searchlightCone.rotation.x = Math.PI;
    this.root.add(this._searchlightCone);
  }

  // ── Update (called every frame) ──────────────────────────────────────────────

  /**
   * @returns {THREE.Vector3[]} pozycje pocisków które trafiły w coś (do sprawdzenia NPC)
   */
  update(dt, input, audio = null) {
    // Rotor spin — faster when occupied
    const mainSpeed = this.isOccupied ? 15 : 4;
    const tailSpeed = this.isOccupied ? 30 : 8;
    if (this._mainRotorGroup) this._mainRotorGroup.rotation.y -= dt * mainSpeed;
    if (this._tailRotorGroup) this._tailRotorGroup.rotation.x += dt * tailSpeed;

    // Police lights — alternating red / blue
    const phase = Math.floor(performance.now() / 160) % 2;
    this._policeLightsRed.forEach(l  => l.material.color.setHex(phase === 0 ? 0xFF1111 : 0x1A0000));
    this._policeLightsBlue.forEach(l => l.material.color.setHex(phase === 1 ? 0x2255FF : 0x00051A));

    // Searchlight glow — only when occupied
    if (this._searchlightCone) {
      this._searchlightCone.material.opacity = this.isOccupied
        ? 0.12 + Math.sin(performance.now() * 0.004) * 0.03
        : 0;
    }

    // ── Silnik helikoptera — spatial, co klatkę ───────────────────────────────
    const { x: hx, y: hy, z: hz } = this.root.position;
    audio?.updateHeliEngine?.(this, hx, hy, hz, this.isOccupied);

    // ── Aktualizacja pocisków ─────────────────────────────────────────────────
    this._shootCooldown = Math.max(0, this._shootCooldown - dt);
    const hitPositions = [];
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];
      b.life += dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.vy -= 6 * dt; // grawitacja na pocisk
      if (b.life > BULLET_LIFE || b.mesh.position.y < -2) {
        this._scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this._bullets.splice(i, 1);
      } else {
        hitPositions.push(b.mesh.position);
      }
    }

    if (!this.isOccupied) return hitPositions;

    // ── Yaw: A/D keyboard + pad right stick X ────────────────────────────────
    const kbYaw = (input.isDown('KeyA') || input.isDown('ArrowLeft')  ? 1 : 0)
                - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
    const padRX  = input.pad?.rightX ?? 0;
    const yawIn  = kbYaw - (Math.abs(padRX) > 0.12 ? padRX * 1.4 : 0);
    this.facing += yawIn * YAW_SPD * dt;

    const sinF = Math.sin(this.facing);
    const cosF = Math.cos(this.facing);

    // ── Forward/backward: W/S keyboard + pad left stick Y ────────────────────
    const kbFwd  = (input.isDown('KeyW') || input.isDown('ArrowUp')   ?  1 : 0)
                 - (input.isDown('KeyS') || input.isDown('ArrowDown') ?  1 : 0);
    const padLY  = input.pad?.leftY ?? 0;
    const padFwd = Math.abs(padLY) > 0.12 ? -padLY : 0;
    const fwdIn  = kbFwd + padFwd;

    // ── Strafe: pad left stick X ───────────────────────────────────────────────
    const padLX  = input.pad?.leftX ?? 0;
    const strafe = Math.abs(padLX) > 0.12 ? padLX : 0;

    // ── Prawdziwa bezwładność — przyspieszenie zamiast interpolacji ───────────
    // Siła napędu w kierunku lokalnym, opór powietrza proporcjonalny do prędkości²
    const thrustX  = (fwdIn * sinF + strafe * cosF) * H_ACCEL;
    const thrustZ  = (fwdIn * cosF - strafe * sinF) * H_ACCEL;
    const horizSpd = Math.hypot(this._velX, this._velZ);

    this._velX += (thrustX - this._velX * H_DRAG * (1 + horizSpd * 0.04)) * dt;
    this._velZ += (thrustZ - this._velZ * H_DRAG * (1 + horizSpd * 0.04)) * dt;

    // Ogranicz prędkość poziomą
    if (horizSpd > H_MAX_SPD) {
      const scale = H_MAX_SPD / horizSpd;
      this._velX *= scale;
      this._velZ *= scale;
    }

    this.root.position.x += this._velX * dt;
    this.root.position.z += this._velZ * dt;

    // ── Pionowe — lekka grawitacja gdy nie ma wejścia ─────────────────────────
    const upIn = input.isDown('Space') ? 1 : 0;
    const dnIn = (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ||
                  input.isDown('ControlLeft') || input.isDown('ControlRight')) ? 1 : 0;
    const padRY = input.pad?.rightY ?? 0;
    const padV  = Math.abs(padRY) > 0.12 ? -padRY : 0;
    const vIn   = (upIn - dnIn) + padV;

    // Bez wejścia: lekkie opadanie (bezwładność ciężkiego helikoptera)
    const vThrust = vIn * V_ACCEL;
    const vGravity = this.isOccupied && vIn === 0 ? -1.8 : 0;
    this._velY += (vThrust + vGravity - this._velY * V_DRAG) * dt;
    this._velY = Math.max(-V_MAX_SPD, Math.min(V_MAX_SPD, this._velY));

    this.root.position.y += this._velY * dt;
    if (this.root.position.y < 1.0) {
      this.root.position.y = 1.0;
      if (this._velY < 0) this._velY = 0;
    }

    // ── Strzelanie: LMB / pad R2 ──────────────────────────────────────────────
    const shootInput = (input.isMouseDown?.(0) || (input.pad?.r2 ?? 0) > 0.5);
    if (shootInput && this._shootCooldown <= 0) {
      this._shootCooldown = SHOOT_CD;
      audio?.playGunshot();
      const bx = this.root.position.x + sinF * 2.2;
      const by = this.root.position.y - 0.5;
      const bz = this.root.position.z + cosF * 2.2;
      const geo  = new THREE.SphereGeometry(0.10, 5, 4);
      const mat  = new THREE.MeshBasicMaterial({ color: 0xFFEE00 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx, by, bz);
      this._scene.add(mesh);
      this._bullets.push({
        mesh,
        vx: sinF * BULLET_SPD + this._velX,
        vy: 0,
        vz: cosF * BULLET_SPD + this._velZ,
        life: 0,
      });
    }

    // ── Visual tilt (nose pitch + banking) ───────────────────────────────────
    const fwdSpeed  = this._velX * sinF + this._velZ * cosF;
    const sideSpeed = this._velX * cosF - this._velZ * sinF;
    this.root.rotation.y = this.facing;
    this.root.rotation.x = THREE.MathUtils.lerp(
      this.root.rotation.x, -fwdSpeed * 0.048, 1 - Math.exp(-dt * 4),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(
      this.root.rotation.z, yawIn * -0.09 + sideSpeed * -0.035, 1 - Math.exp(-dt * 4),
    );

    return hitPositions;
  }

  /** Reset flight state on exit */
  resetFlightState() {
    this._velX = 0;
    this._velY = 0;
    this._velZ = 0;
  }
}
