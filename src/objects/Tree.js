import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

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
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
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
      new THREE.CylinderGeometry(trunkR * 0.65, trunkR, trunkH, 6),
      toonMat(trunkColor),
    );
    trunk.position.y = trunkH / 2;
    this.root.add(trunk);

    // ─── Korona (2 sfery zamiast 3, mniej segmentów) ─────────────────────
    const leafMat = toonMat(leavesColor);
    [
      [0,    trunkH + leavesR * 0.72,  0,     leavesR],
      [0.38, trunkH + leavesR * 0.28, -0.22,  leavesR * 0.80],
    ].forEach(([x, y, z, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), leafMat);
      m.position.set(x, y, z);
      this.root.add(m);
    });
  }

  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    this._build();
    // Kolizja tylko na pień (cylinder) — Rapier + cannon-es
    const { trunkH, trunkR } = this.cfg;
    this._bodies.push(
      this.physics.addStaticCylinder(x, y + trunkH / 2, z, trunkH / 2, trunkR)
    );
    if (this.vehiclePhysics) {
      this.vehiclePhysics.addStaticCylinder(x, y + trunkH / 2, z, trunkH / 2, trunkR, 'wood');
    }
    return this;
  }
}
