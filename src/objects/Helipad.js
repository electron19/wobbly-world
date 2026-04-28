import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';

/**
 * Helipad — concrete landing pad with "H" marking and yellow circle.
 * Pure visual (no Rapier physics — flat ground handles collision).
 */
export class Helipad extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
  }

  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    this._build();
    return this;
  }

  _build() {
    // ── Base pad (octagon, concrete) ─────────────────────────────────────────
    const padGeo  = new THREE.CylinderGeometry(4.8, 4.8, 0.12, 8);
    const padMat  = new THREE.MeshToonMaterial({ color: 0x5A5A5A });
    const pad     = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.06;
    pad.receiveShadow = true;
    this.root.add(pad);

    // ── Yellow border ring ────────────────────────────────────────────────────
    const ringGeo = new THREE.TorusGeometry(4.2, 0.32, 6, 16);
    const ringMat = new THREE.MeshToonMaterial({ color: 0xF5C518 });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    this.root.add(ring);

    // ── Inner circle ─────────────────────────────────────────────────────────
    const circleGeo = new THREE.TorusGeometry(2.8, 0.18, 6, 16);
    const circle    = new THREE.Mesh(circleGeo, ringMat);
    circle.rotation.x = Math.PI / 2;
    circle.position.y = 0.14;
    this.root.add(circle);

    // ── "H" marking (3 rectangles: left bar, right bar, crossbar) ────────────
    const hMat = new THREE.MeshToonMaterial({ color: 0xFFFFFF });

    const bar = new THREE.BoxGeometry(0.38, 0.06, 2.40);
    const cross = new THREE.BoxGeometry(0.38, 0.06, 1.20);

    const leftBar  = new THREE.Mesh(bar, hMat);
    leftBar.position.set(-0.88, 0.16, 0);
    this.root.add(leftBar);

    const rightBar = new THREE.Mesh(bar, hMat);
    rightBar.position.set(0.88, 0.16, 0);
    this.root.add(rightBar);

    const crossBar = new THREE.Mesh(cross, hMat);
    crossBar.rotation.y = Math.PI / 2;
    crossBar.position.set(0, 0.16, 0);
    this.root.add(crossBar);
  }
}
