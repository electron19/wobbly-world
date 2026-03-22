import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

/**
 * Drzewo: pień + 3 nakładające się kule liści.
 * Fizyka: cylinder na pień (nie można przejść przez drzewo).
 *
 * Konfiguracja:
 *   trunkH      — wysokość pnia (default 1.8)
 *   trunkR      — promień pnia (default 0.18)
 *   leavesR     — promień korony (default 1.0)
 *   trunkColor  — kolor pnia
 *   leavesColor — kolor liści
 */
export class Tree extends WorldObject {
  constructor(scene, physics, cfg = {}) {
    super(scene, physics);
    this.cfg = {
      trunkH:      1.8,
      trunkR:      0.18,
      leavesR:     1.0,
      trunkColor:  C.bark,
      leavesColor: C.leaves,
      ...cfg,
    };
  }

  _build() {
    const { trunkH, trunkR, leavesR, trunkColor, leavesColor } = this.cfg;

    // ─── Pień ─────────────────────────────────────────────────────────────
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.65, trunkR, trunkH, 8),
      toonMat(trunkColor)
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow  = true;
    addOutline(trunk, 0.04);
    this.root.add(trunk);

    // ─── Korona (3 sfery = puszysty efekt) ────────────────────────────────
    const leafMat = toonMat(leavesColor);
    [
      [0,     trunkH + leavesR * 0.75,  0,     leavesR],
      [-0.4,  trunkH + leavesR * 0.35,  0.3,   leavesR * 0.82],
      [ 0.45, trunkH + leavesR * 0.30, -0.25,  leavesR * 0.78],
    ].forEach(([x, y, z, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), leafMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      addOutline(m, 0.04);
      this.root.add(m);
    });
  }

  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    this._build();
    // Kolizja tylko na pień (cylinder)
    const { trunkH, trunkR } = this.cfg;
    this._bodies.push(
      this.physics.addStaticCylinder(x, y + trunkH / 2, z, trunkH / 2, trunkR)
    );
    return this;
  }
}
