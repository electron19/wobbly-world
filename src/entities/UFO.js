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

    this._build();
    this.update(0);
    scene.add(this.root);
  }

  _build() {
    const hullMat = toonMat(0xB7D7E8);
    const rimMat = toonMat(0x7E8FA3);
    const domeMat = new THREE.MeshToonMaterial({
      color: 0x9EF2FF,
      transparent: true,
      opacity: 0.82,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x7DF9FF,
      transparent: true,
      opacity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lightOffMat = new THREE.MeshBasicMaterial({ color: 0x355A66 });

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(2.9, 20, 12),
      hullMat,
    );
    body.scale.set(1.55, 0.28, 1.15);
    body.castShadow = true;
    this.root.add(body);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.95, 0.26, 8, 28),
      rimMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    this.root.add(rim);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat,
    );
    dome.position.y = 0.18;
    dome.scale.set(1.0, 0.72, 1.0);
    this.root.add(dome);

    this._beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 10, 28, 1, true),
      glowMat,
    );
    this._beam.position.y = -4.9;
    this._beam.rotation.x = Math.PI;
    this._beam.scale.set(1.0, 1.0, 0.82);
    this.root.add(this._beam);

    this._lights = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        lightOffMat.clone(),
      );
      light.position.set(Math.sin(a) * 2.45, -0.18, Math.cos(a) * 2.15);
      this.root.add(light);
      this._lights.push(light);
    }
  }

  update(dt) {
    this._t += dt * this._speed;

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

    const beamPulse = 0.22 + (Math.sin(this._t * 5.4) * 0.5 + 0.5) * 0.16;
    this._beamStrength = 0.65 + (Math.sin(this._t * 4.2) * 0.5 + 0.5) * 0.35;
    this._beam.material.opacity = beamPulse;
    this._beam.scale.x = 0.88 + Math.sin(this._t * 3.3) * 0.08;
    this._beam.scale.z = 0.74 + Math.cos(this._t * 2.8) * 0.08;

    for (let i = 0; i < this._lights.length; i++) {
      const on = Math.sin(this._t * 8 + i * 0.75) > 0;
      this._lights[i].material.color.setHex(on ? 0x8FFFFF : 0x355A66);
    }
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
