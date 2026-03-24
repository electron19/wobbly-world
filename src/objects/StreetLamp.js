import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

/**
 * Latarnia uliczna: słup + ramię + głowica + PointLight.
 * Fizyka: cylinder na słup.
 */
export class StreetLamp extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
  }

  _build() {
    const metalMat = toonMat(C.metal);
    // Głowica emituje własne światło wizualnie (MeshBasicMaterial = zawsze jasna, niezależnie od cieni)
    const headMat = new THREE.MeshBasicMaterial({ color: C.lamp });

    // Słup
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, 4.5, 6),
      metalMat,
    );
    pole.position.y = 2.25;
    this.root.add(pole);

    // Ramię
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.10), metalMat);
    arm.position.set(0.6, 4.45, 0);
    this.root.add(arm);

    // Głowica — MeshBasicMaterial zamiast PointLight (identyczny efekt wizualny, zero kosztu GPU)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), headMat);
    head.position.set(1.2, 4.32, 0);
    this.root.add(head);
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY;
    this._build();
    // Cienki cylinder na słup — Rapier + cannon-es
    this._bodies.push(
      this.physics.addStaticCylinder(x, y + 2.25, z, 2.25, 0.10)
    );
    if (this.vehiclePhysics) {
      this.vehiclePhysics.addStaticCylinder(x, y + 2.25, z, 2.25, 0.10, 'metal');
    }
    return this;
  }
}
