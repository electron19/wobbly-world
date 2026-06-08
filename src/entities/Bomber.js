import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

// ── Bomber — B-29 Enola Gay ──────────────────────────────────────────────────
//
// Controls: same as Airplane / FighterJet.
// Physics: heavy, slow, 4 radial engines with spinning propellers.
// Bombs: KeyB (klawiatura) lub pad button 0 (A/Cross) — zrzuca bombę.

const BOMB_GRAVITY = 18;        // m/s² — bombka swobodnie spada
const BOMB_COOLDOWN = 0.45;     // s między zrzutami
const BOMB_EXPLOSION_R = 9;     // promień wybuchu (visual)

export class Bomber {
  constructor(scene, x = 0, y = 2, z = 0) {
    this.scene      = scene;
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
    this._bombs        = [];  // active falling bombs
    this._explosions   = [];  // active explosion meshes
    this._bombCooldown = 0;

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

    // ── Fuselage — cylindrical body ──────────────────────────────────────────
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 8.0, 18), bodyMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    this.root.add(fuselage);
    addOutline(fuselage, 0.08);

    // ── Nose cone — tapers from fuselage to a small radius at front ─────────
    // rotation.x = +PI/2 maps local +Y to world +Z, so radiusTop sits at +Z (front)
    const noseCone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.0, 1.8, 18), bodyMat);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.z = 4.9;
    noseCone.castShadow = true;
    this.root.add(noseCone);
    addOutline(noseCone, 0.07);

    // Glass dome at the very tip (B-29 plexiglas greenhouse)
    const noseGlass = new THREE.Mesh(new THREE.SphereGeometry(0.50, 14, 10), glassMat);
    noseGlass.scale.set(1.0, 1.0, 0.9);
    noseGlass.position.z = 5.75;
    this.root.add(noseGlass);

    // Cockpit window strips on top of the nose cone
    const winMat = new THREE.MeshToonMaterial({ color: 0xCCEEFF, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + Math.PI * (i + 0.5) / 5;   // top semicircle only
      const r = 0.7;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.08), winMat);
      win.position.set(Math.cos(ang) * r, Math.sin(ang) * r * 0.55 + 0.1, 4.65);
      this.root.add(win);
    }

    // ── Tail cone — tapers from fuselage diameter down to a point ───────────
    // rotation.x = -PI/2 maps local +Y to world -Z, so radiusTop sits at -Z (rear)
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.0, 3.2, 14), bodyMat);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.z = -5.6;
    tailCone.castShadow = true;
    this.root.add(tailCone);
    addOutline(tailCone, 0.07);

    // ── Tapered wings via Shape + ExtrudeGeometry ───────────────────────────
    // Shape plane: X = spanwise (0 at root), Y = chord position (-Y = leading edge)
    // After rotation.x = -PI/2: shape X -> world X, shape Y -> world -Z, extrusion -> world Y
    const HALF_SPAN = 8.5;
    const ROOT_LE_Y = -2.6;
    const ROOT_TE_Y =  2.6;
    const TIP_LE_Y  = -1.0;   // swept-back leading edge
    const TIP_TE_Y  =  1.2;
    const WING_THICK = 0.28;

    // World Z of wing leading edge at spanwise distance x (helper for engines)
    const wingLeZ = (x) => {
      const t = Math.min(1, x / HALF_SPAN);
      return -((1 - t) * ROOT_LE_Y + t * TIP_LE_Y);
    };

    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, ROOT_LE_Y);
      shape.lineTo(HALF_SPAN, TIP_LE_Y);
      shape.lineTo(HALF_SPAN, TIP_TE_Y);
      shape.lineTo(0, ROOT_TE_Y);
      shape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(shape, {
        depth: WING_THICK, bevelEnabled: false, curveSegments: 1, steps: 1,
      });
      // Centre thickness around origin
      wingGeo.translate(0, 0, -WING_THICK / 2);
      // Mirror for left wing
      if (sx < 0) wingGeo.scale(-1, 1, 1);

      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.rotation.x = -Math.PI / 2;
      wing.position.set(0, -0.15, 0);
      wing.castShadow = true;
      this.root.add(wing);
      addOutline(wing, 0.05);
    }

    // ── 4 engine nacelles + propellers ──────────────────────────────────────
    // Engines hang under the wing with the prop disc clearly AHEAD of the leading edge.
    const enginePositions = [
      { sx: -1, dist: 3.0 },
      { sx: -1, dist: 5.8 },
      { sx:  1, dist: 3.0 },
      { sx:  1, dist: 5.8 },
    ];
    const NAC_LEN = 2.6;
    const NAC_R_FRONT = 0.42;
    const NAC_R_REAR  = 0.34;

    for (const ep of enginePositions) {
      const nx = ep.sx * ep.dist;
      const ny = -0.32;
      // Nacelle straddles the wing, mostly forward; centre ~0.5 ahead of LE.
      const leZ = wingLeZ(ep.dist);
      const nacZ = leZ + 0.5;

      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(NAC_R_FRONT, NAC_R_REAR, NAC_LEN, 12),
        nacelleMat,
      );
      nacelle.rotation.x = Math.PI / 2;   // long axis along Z, front (radiusTop) at +Z
      nacelle.position.set(nx, ny, nacZ);
      nacelle.castShadow = true;
      this.root.add(nacelle);
      addOutline(nacelle, 0.05);

      const hubZ = nacZ + NAC_LEN / 2 + 0.12;
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), nacelleMat);
      hub.position.set(nx, ny, hubZ);
      this.root.add(hub);

      // Spinner cone in front of the hub
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.36, 10), nacelleMat);
      spinner.rotation.x = Math.PI / 2;   // tip toward +Z
      spinner.position.set(nx, ny, hubZ + 0.26);
      this.root.add(spinner);

      // Prop disc — sits just ahead of the hub, in clear air ahead of the wing
      const propGroup = new THREE.Group();
      propGroup.position.set(nx, ny, hubZ + 0.06);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.10, 2.6, 0.28),
          propMat,
        );
        blade.rotation.z = (i / 4) * Math.PI * 2;
        propGroup.add(blade);
      }
      this.root.add(propGroup);
      this._propGroups.push(propGroup);
    }

    // ── Tail surfaces ───────────────────────────────────────────────────────
    // Vertical fin — tapered trapezoid built from a Shape
    {
      const finShape = new THREE.Shape();
      finShape.moveTo(-1.4, 0);
      finShape.lineTo( 1.2, 0);
      finShape.lineTo( 0.4, 2.6);
      finShape.lineTo(-0.6, 2.6);
      finShape.closePath();
      const finGeo = new THREE.ExtrudeGeometry(finShape, {
        depth: 0.18, bevelEnabled: false, curveSegments: 1, steps: 1,
      });
      finGeo.translate(0, 0, -0.09);
      const vFin = new THREE.Mesh(finGeo, bodyMat);
      vFin.rotation.y = Math.PI / 2;   // place fin in YZ plane
      vFin.position.set(0, 0.45, -5.0);
      vFin.castShadow = true;
      this.root.add(vFin);
      addOutline(vFin, 0.06);
    }

    // Horizontal stabilisers — tapered, mirrored
    {
      const hsShape = new THREE.Shape();
      hsShape.moveTo(0, -0.9);
      hsShape.lineTo(3.0, -0.35);
      hsShape.lineTo(3.0,  0.55);
      hsShape.lineTo(0,  1.0);
      hsShape.closePath();
      for (const sx of [-1, 1]) {
        const hsGeo = new THREE.ExtrudeGeometry(hsShape, {
          depth: 0.18, bevelEnabled: false, curveSegments: 1, steps: 1,
        });
        hsGeo.translate(0, 0, -0.09);
        if (sx < 0) hsGeo.scale(-1, 1, 1);
        const hs = new THREE.Mesh(hsGeo, wingMat);
        hs.rotation.x = -Math.PI / 2;
        hs.position.set(0, 0.55, -5.1);
        hs.castShadow = true;
        this.root.add(hs);
        addOutline(hs, 0.05);
      }
    }

    // ── Defensive gun turrets (decorative) ──────────────────────────────────
    const turretPositions = [
      { x: 0, y: 1.10, z:  1.5 },   // dorsal forward
      { x: 0, y: 1.10, z: -1.8 },   // dorsal aft
      { x: 0, y: -0.95, z:  0.5 },  // ventral
    ];
    for (const tp of turretPositions) {
      const turret = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), turretMat);
      turret.position.set(tp.x, tp.y, tp.z);
      this.root.add(turret);
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.7, 6),
        toonMat(0x333333),
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(tp.x, tp.y, tp.z + 0.45);
      this.root.add(barrel);
    }

    // Tail gunner station — small bubble at the very back
    const tailGun = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glassMat);
    tailGun.position.set(0, 0.15, -6.9);
    this.root.add(tailGun);
    const tailBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.6, 6),
      toonMat(0x333333),
    );
    tailBarrel.rotation.x = Math.PI / 2;
    tailBarrel.position.set(0, 0.15, -7.35);
    this.root.add(tailBarrel);

    // ── Landing gear ────────────────────────────────────────────────────────
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

    // Main gear retracts into the inboard nacelles — anchor under them
    for (const sx of [-1, 1]) {
      for (const dz of [0.2, -0.6]) {
        const ms = new THREE.Mesh(bigStrutGeo, gearMat);
        ms.position.set(sx * 3.0, -1.0, dz);
        this.root.add(ms);
        const mw = new THREE.Mesh(bigWheelGeo, gearMat);
        mw.rotation.z = Math.PI / 2;
        mw.position.set(sx * 3.0, -1.45, dz);
        this.root.add(mw);
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  // ── Bombs ──────────────────────────────────────────────────────────────────

  _dropBomb(audio) {
    const f = this.facing;
    const sinF = Math.sin(f), cosF = Math.cos(f);
    // Spawn pod kadłubem (lokalne y=-0.9), z dziedziczeniem prędkości bombera
    const sx = this.root.position.x;
    const sy = this.root.position.y - 0.9;
    const sz = this.root.position.z;

    const geo = new THREE.CapsuleGeometry(0.22, 0.7, 4, 8);
    const mat = toonMat(0x3A3A3A);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(sx, sy, sz);
    mesh.rotation.x = Math.PI / 2;   // bombka leży poziomo zgodnie z lotem
    mesh.rotation.y = f;
    mesh.castShadow = true;
    this.scene.add(mesh);
    addOutline(mesh, 0.05);

    // Mały statecznik (fin) — krzyż z 2 boxów
    const finMat = toonMat(0x222222);
    const fin1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.30, 0.20), finMat);
    fin1.position.set(0, 0, -0.4);
    mesh.add(fin1);
    const fin2 = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 0.20), finMat);
    fin2.position.set(0, 0, -0.4);
    mesh.add(fin2);

    this._bombs.push({
      mesh,
      vx: sinF * this._speed,
      vy: this._velY,
      vz: cosF * this._speed,
    });

    audio?.playBombDrop?.();
  }

  _updateBombs(dt, audio) {
    for (let i = this._bombs.length - 1; i >= 0; i--) {
      const b = this._bombs[i];
      b.vy -= BOMB_GRAVITY * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      // Bombka "wskazuje" kierunek upadku — pitch w stronę vy/horiz
      const horiz = Math.hypot(b.vx, b.vz);
      const pitch = Math.atan2(-b.vy, horiz);   // 0=poziomo, π/2=pionowo w dół
      b.mesh.rotation.x = Math.PI / 2 - pitch;

      if (b.mesh.position.y <= 0.2) {
        // Eksplozja
        b.mesh.position.y = 0.2;
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this._spawnExplosion(b.mesh.position.x, b.mesh.position.z);
        audio?.playBombExplosion?.(b.mesh.position.x, b.mesh.position.z);
        this._bombs.splice(i, 1);
      }
    }
  }

  _spawnExplosion(wx, wz) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFAA22, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat);
    mesh.position.set(wx, 0.5, wz);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this._explosions.push({ mesh, life: 0, ttl: 0.9 });
  }

  _updateExplosions(dt) {
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const e = this._explosions[i];
      e.life += dt;
      const t = e.life / e.ttl;
      if (t >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this._explosions.splice(i, 1);
        continue;
      }
      // Rozszerzanie się + zanikanie + przejście koloru pomarańcz→czarny dym
      const scale = 1 + t * (BOMB_EXPLOSION_R - 1);
      e.mesh.scale.setScalar(scale);
      e.mesh.position.y = 0.5 + t * 2.5;
      e.mesh.material.opacity = (1 - t) * 0.85;
      const r = 1.0 - t * 0.4;
      const g = 0.66 - t * 0.55;
      const bl = 0.13 - t * 0.13;
      e.mesh.material.color.setRGB(Math.max(0, r), Math.max(0, g), Math.max(0, bl));
    }
  }

  update(dt, input, camera, audio = null) {
    // Spatial engine sound
    const { x, y, z } = this.root.position;
    audio?.updateBomberEngine?.(this, x, y, z, this._throttle);

    // Bomby — aktualizuj nawet gdy gracz nie pilotuje (mogą jeszcze spadać)
    this._updateBombs(dt, audio);
    this._updateExplosions(dt);
    this._bombCooldown = Math.max(0, this._bombCooldown - dt);

    // Zrzut: klawiatura B lub pad button 0 (A/Cross) — każdy niezależnie
    if (this.isOccupied && this._bombCooldown <= 0) {
      const keyDrop = input?.isJustPressed?.('KeyB');
      const padDrop = input?.isPadButtonPressed?.(0);
      if (keyDrop || padDrop) {
        this._dropBomb(audio);
        this._bombCooldown = BOMB_COOLDOWN;
      }
    }

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
