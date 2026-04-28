import * as THREE from 'three';
import { toonMat } from '../core/Materials.js';

export class UFO {
  constructor(scene, {
    centerX = 0,
    centerZ = 0,
    radiusX = 120,
    radiusZ = 78,
    baseY = 34,
    speed = 0.16,
    phase = 0,
  } = {}) {
    this._scene = scene;
    this.root = new THREE.Group();

    this._centerX = centerX;
    this._centerZ = centerZ;
    this._radiusX = radiusX;
    this._radiusZ = radiusZ;
    this._baseY = baseY;
    this._speed = speed;
    this._t = phase;
    this._beamRadius = 6.8;
    this._beamHeight = 22;
    this._beamStrength = 0;
    this._captureRadius = 3.1;
    this._state = 'orbit';
    this._target = null;
    this._departTimer = 0;
    this._departDir = new THREE.Vector3(0, 0.1, 1);
    this._carryPose = null;

    this._build();
    this.update(0);
    scene.add(this.root);
  }

  _build() {
    const hullMat = toonMat(0xB7D7E8);
    const hullDarkMat = toonMat(0x6B788A);
    const rimMat = toonMat(0x7E8FA3);
    const domeMat = new THREE.MeshToonMaterial({
      color: 0xA8F6FF,
      transparent: true,
      opacity: 0.58,
    });
    const cabinMat = toonMat(0x314255);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x7DF9FF,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lightOffMat = new THREE.MeshBasicMaterial({ color: 0x355A66 });

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(2.95, 22, 14),
      hullMat,
    );
    body.scale.set(1.62, 0.28, 1.18);
    body.castShadow = true;
    this.root.add(body);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(2.55, 20, 12),
      hullDarkMat,
    );
    belly.scale.set(1.48, 0.20, 1.06);
    belly.position.y = -0.42;
    belly.castShadow = true;
    this.root.add(belly);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(3.0, 0.28, 8, 32),
      rimMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    this.root.add(rim);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat,
    );
    dome.position.y = 0.22;
    dome.scale.set(1.0, 0.82, 1.0);
    this.root.add(dome);

    const cabin = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 10),
      cabinMat,
    );
    cabin.position.y = 0.28;
    cabin.scale.set(1.0, 0.52, 1.0);
    this.root.add(cabin);

    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.38, 0.34, 10),
      toonMat(0x5A2B32),
    );
    seat.position.y = 0.06;
    this.root.add(seat);

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.54, 8),
      toonMat(0x7D8B9B),
    );
    column.position.set(0, -0.05, 0);
    this.root.add(column);

    this._cargo = new THREE.Group();
    this._cargo.visible = false;
    const cargoBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 0.32, 4, 8),
      toonMat(0xF6E08E),
    );
    cargoBody.rotation.z = Math.PI / 2;
    this._cargo.add(cargoBody);
    const cargoHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 7),
      toonMat(0xFFE8B3),
    );
    cargoHead.position.set(0, 0.21, 0.02);
    this._cargo.add(cargoHead);
    this._cargo.position.set(0, 0.38, -0.04);
    this.root.add(this._cargo);

    this._beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.7, 10, 32, 1, true),
      glowMat,
    );
    this._beam.position.y = -4.9;
    this._beam.rotation.x = Math.PI;
    this._beam.scale.set(0.95, 1.0, 0.82);
    this.root.add(this._beam);

    this._lights = [];
    this._lightHalos = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        lightOffMat.clone(),
      );
      light.position.set(Math.sin(a) * 2.55, -0.12, Math.cos(a) * 2.18);
      this.root.add(light);
      this._lights.push(light);

      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.24, 14),
        new THREE.MeshBasicMaterial({
          color: 0x8FFFFF,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      halo.position.set(Math.sin(a) * 2.55, -0.03, Math.cos(a) * 2.18);
      halo.rotation.x = -Math.PI / 2;
      this.root.add(halo);
      this._lightHalos.push(halo);
    }
  }

  update(dt, abductables = [], audio = null) {
    this._t += dt * this._speed;

    if (this._state === 'orbit') {
      this._updateOrbit();
      this._searchTarget(abductables);
    } else {
      this._updateCaptureState(dt);
    }

    this._updateVisuals(audio);
  }

  _updateOrbit() {
    const orbit = this._t;
    const x = this._centerX + Math.cos(orbit) * this._radiusX;
    const z = this._centerZ + Math.sin(orbit) * this._radiusZ;
    const y = this._baseY
      + Math.sin(this._t * 2.4) * 2.4
      + Math.sin(this._t * 0.7 + 1.2) * 1.1;

    const nextX = this._centerX + Math.cos(orbit + 0.02) * this._radiusX;
    const nextZ = this._centerZ + Math.sin(orbit + 0.02) * this._radiusZ;

    this.root.position.set(x, y, z);
    this.root.rotation.y = Math.atan2(nextX - x, nextZ - z);
    this.root.rotation.z = Math.sin(this._t * 1.9) * 0.04;
    this.root.rotation.x = Math.cos(this._t * 1.3) * 0.03;
    this._beamHeight = 22;
    this._beamStrength = 0.65 + (Math.sin(this._t * 4.2) * 0.5 + 0.5) * 0.35;
    this._carryPose = null;
  }

  _searchTarget(abductables) {
    for (const target of abductables) {
      if (!target?.canBeAbducted?.()) continue;
      const dx = target.root.position.x - this.root.position.x;
      const dz = target.root.position.z - this.root.position.z;
      if (dx * dx + dz * dz > this._captureRadius * this._captureRadius) continue;
      if (!target.startAbduction?.(this)) continue;
      this._target = target;
      this._state = 'lowering';
      this._cargo.visible = false;
      return;
    }
  }

  _updateCaptureState(dt) {
    if (!this._target || this._target._abductedGone) {
      this._target = null;
      this._carryPose = null;
      this._state = 'orbit';
      return;
    }

    const targetPos = this._target.root.position;
    const hoverY = Math.max(this._baseY - 8, targetPos.y + 8.5);
    const dx = targetPos.x - this.root.position.x;
    const dz = targetPos.z - this.root.position.z;
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this._state === 'lowering') {
      this.root.position.x += dx * Math.min(1, dt * 2.1);
      this.root.position.z += dz * Math.min(1, dt * 2.1);
      this.root.position.y += (hoverY - this.root.position.y) * Math.min(1, dt * 1.5);
      this.root.rotation.z *= 0.88;
      this.root.rotation.x *= 0.88;
      this._beamStrength = 1.15;
      this._beamHeight = Math.max(16, this.root.position.y + 2);
      if (Math.abs(this.root.position.y - hoverY) < 0.45 && Math.hypot(dx, dz) < 0.85) {
        this._state = 'lifting';
      }
      return;
    }

    if (this._state === 'lifting') {
      this.root.position.x += dx * Math.min(1, dt * 1.8);
      this.root.position.z += dz * Math.min(1, dt * 1.8);
      this.root.position.y += (hoverY - this.root.position.y) * Math.min(1, dt * 1.4);
      this._beamStrength = 1.3;
      this._beamHeight = Math.max(16, this.root.position.y + 2);
      this._carryPose = {
        x: this.root.position.x,
        y: this.root.position.y - 1.6,
        z: this.root.position.z,
        facing: this.root.rotation.y + Math.PI,
      };
      if (Math.abs(targetPos.y - this._carryPose.y) < 0.7 && Math.hypot(targetPos.x - this._carryPose.x, targetPos.z - this._carryPose.z) < 0.65) {
        this._target.finishAbduction?.();
        this._target = null;
        this._carryPose = null;
        this._cargo.visible = true;
        this._state = 'departing';
        this._departTimer = 4.5;
        this._departDir.set(Math.sin(this.root.rotation.y), 0.12, Math.cos(this.root.rotation.y)).normalize();
      }
      return;
    }

    if (this._state === 'departing') {
      this._departTimer -= dt;
      this.root.position.addScaledVector(this._departDir, dt * 22);
      this.root.position.y += dt * 5.5;
      this.root.rotation.z = Math.sin(this._t * 4.8) * 0.03;
      this.root.rotation.x = Math.cos(this._t * 3.9) * 0.02;
      this._beamStrength = 0.3;
      this._beamHeight = 12;
      if (this._departTimer <= 0) {
        this._cargo.visible = false;
        this._state = 'orbit';
      }
    }
  }

  _updateVisuals(audio) {
    const beamActive = this._state === 'lowering' || this._state === 'lifting';
    if (beamActive) audio?.startUFOBeam?.(); else audio?.stopUFOBeam?.();
    const beamPulse = beamActive
      ? 0.42 + (Math.sin(this._t * 9.0) * 0.5 + 0.5) * 0.22
      : 0.18 + (Math.sin(this._t * 5.4) * 0.5 + 0.5) * 0.12;

    this._beam.material.opacity = beamPulse;
    this._beam.scale.x = beamActive ? 1.16 : 0.88 + Math.sin(this._t * 3.3) * 0.08;
    this._beam.scale.z = beamActive ? 1.00 : 0.74 + Math.cos(this._t * 2.8) * 0.08;
    this._beam.scale.y = this._beamHeight / 10;
    this._beam.position.y = -(this._beamHeight * 0.5) + 0.1;
    if (this._cargo.visible) {
      this._cargo.rotation.y += 0.03;
      this._cargo.position.y = 0.38 + Math.sin(this._t * 5.4) * 0.08;
    }

    for (let i = 0; i < this._lights.length; i++) {
      const blink = Math.sin(this._t * (beamActive ? 15 : 8) + i * 0.75) > 0;
      const color = beamActive
        ? (i % 2 === 0 ? 0xFF5577 : 0x8FFFFF)
        : (blink ? 0x8FFFFF : 0x355A66);
      this._lights[i].material.color.setHex(color);
      this._lightHalos[i].material.color.setHex(color);
      this._lightHalos[i].material.opacity = beamActive ? 0.26 : (blink ? 0.14 : 0.04);
    }
  }

  getCarryPose() {
    return this._carryPose;
  }

  getBeamInfluence(x, y, z) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    const distXZ = Math.hypot(dx, dz);
    const dy = this.root.position.y - y;
    if (distXZ > this._beamRadius || dy < 0 || dy > this._beamHeight) return 0;

    const radial = 1 - distXZ / this._beamRadius;
    const vertical = 1 - dy / this._beamHeight;
    return Math.max(0, radial * vertical * this._beamStrength);
  }

  dispose() {
    this._scene.remove(this.root);
  }
}
