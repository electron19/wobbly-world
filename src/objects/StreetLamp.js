import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

/**
 * Latarnia uliczna: słup + ramię + głowica + PointLight.
 * Fizyka: cylinder na słup.
 */
export class StreetLamp extends WorldObject {
  constructor(scene, physics) {
    super(scene, physics);
  }

  _build() {
    const metalMat = toonMat(C.metal);
    const lampMat  = toonMat(C.lamp);

    // Słup
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, 4.5, 8),
      metalMat
    );
    pole.position.y = 2.25;
    pole.castShadow = true;
    addOutline(pole, 0.04);
    this.root.add(pole);

    // Ramię
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.10), metalMat);
    arm.position.set(0.6, 4.45, 0);
    this.root.add(arm);

    // Głowica lampy
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), lampMat);
    head.position.set(1.2, 4.32, 0);
    addOutline(head, 0.04);
    this.root.add(head);

    // Punkt świetlny
    const light = new THREE.PointLight(0xFFF0A0, 0.9, 10);
    light.position.set(1.2, 3.9, 0);
    this.root.add(light);
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY;
    this._build();
    // Cienki cylinder na słup
    this._bodies.push(
      this.physics.addStaticCylinder(x, y + 2.25, z, 2.25, 0.10)
    );
    return this;
  }
}
