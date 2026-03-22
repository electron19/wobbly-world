import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

/**
 * Teren: trawa + siatka dróg + chodniki + fizyczna podłoga.
 */
export class Ground extends WorldObject {
  constructor(scene, physics, size = 200) {
    super(scene, physics);
    this._build(size);
  }

  _build(s) {
    // ─── Trawa ───────────────────────────────────────────────────────────────
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      toonMat(C.grass)
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.root.add(grass);

    // ─── Chodniki (szersze) ───────────────────────────────────────────────────
    const swMat = toonMat(C.sidewalk);
    [[0, 0, s, 9], [0, 0, 9, s]].forEach(([x, z, w, d]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), swMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.005, z);
      m.receiveShadow = true;
      this.root.add(m);
    });

    // ─── Drogi ───────────────────────────────────────────────────────────────
    const roadMat = toonMat(C.road);
    [[0, 0, s, 6], [0, 0, 6, s]].forEach(([x, z, w, d]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      m.receiveShadow = true;
      this.root.add(m);
    });

    // ─── Przerywana linia środkowa ─────────────────────────────────────────
    const lineMat = toonMat(0xFFFFCC);
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) < 0.5) continue;
      [[i * 10, 0, 0.25, 5], [0, i * 10, 5, 0.25]].forEach(([x, z, w, d]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.012, z);
        this.root.add(m);
      });
    }

    // ─── Fizyczna podłoga (gruba warstwa poniżej y=0) ─────────────────────
    this._bodies.push(
      this.physics.addStaticBox(0, -0.5, 0, s / 2, 0.5, s / 2)
    );
  }
}
