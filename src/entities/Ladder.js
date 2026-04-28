import * as THREE from 'three';
import { toonMat } from '../core/Materials.js';

/**
 * Drabinka przemysłowa — wspinanie na dach.
 *
 * Interakcja (Game.js):
 *   - Podejdź do podstawy (getBaseApproachPos) + E → gracz teleportuje się na szczyt
 *   - Stój na szczycie (getTopApproachPos)  + E → gracz teleportuje się na dół
 *
 * Brak własnej fizyki — ściana budynku blokuje gracza od tyłu.
 */
export class Ladder {
  constructor(scene, x, y, z, height, facingY = 0) {
    this.x       = x;
    this.y       = y;
    this.z       = z;
    this.height  = height;
    this.facingY = facingY;   // kierunek "na zewnątrz" (skąd gracz podchodzi)

    this.root = new THREE.Group();
    this.root.position.set(x, y, z);
    this.root.rotation.y = facingY;
    scene.add(this.root);
    this._build();
  }

  _build() {
    const H     = this.height;
    const RAIL  = 0.08;   // grubość szyny
    const GAP   = 0.44;   // half-rozstaw szyn
    const RUNG  = 0.06;   // grubość szczebla
    const STEP  = 0.44;   // odstęp między szczeblami

    const steel = toonMat(0x888888);
    const dark  = toonMat(0x444444);
    const warn  = toonMat(0xFF5500);   // co 4. szczebel ostrzegawczo

    // Szyny boczne
    for (const rx of [-GAP, GAP]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RAIL, H, RAIL), steel);
      rail.position.set(rx, H / 2, 0);
      this.root.add(rail);
    }

    // Szczeble
    const count = Math.floor(H / STEP);
    for (let i = 1; i < count; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(GAP * 2 + RAIL * 2, RUNG, RUNG * 2),
        i % 4 === 0 ? warn : dark,
      );
      rung.position.set(0, i * STEP, 0);
      this.root.add(rung);
    }

    // Klatka bezpieczeństwa (górne 2 m)
    const cageH = Math.min(2.0, H * 0.25);
    for (const cx of [-0.58, 0.58]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(RAIL * 2, cageH, RAIL * 2), steel);
      bar.position.set(cx, H - cageH / 2, -0.20);
      this.root.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.24, RAIL * 2, RAIL * 2), steel);
    cross.position.set(0, H - 0.45, -0.20);
    this.root.add(cross);

    // Poręcz na szczycie
    const hr = new THREE.Mesh(
      new THREE.BoxGeometry(GAP * 2 + 0.36, RAIL * 2, RAIL * 2), steel,
    );
    hr.position.set(0, H + 0.85, 0.18);
    this.root.add(hr);
  }

  // ─── Pozycje interakcji ────────────────────────────────────────────────────

  /** Punkt podejścia u podstawy drabinki (gracz tu staje, by wspiąć się). */
  getBaseApproachPos() {
    const s = Math.sin(this.facingY), c = Math.cos(this.facingY);
    return { x: this.x + s * 1.4, y: this.y + 1.0, z: this.z + c * 1.4 };
  }

  /** Gdzie gracz ląduje po wspięciu się na górę. */
  getTopLandPos() {
    const s = Math.sin(this.facingY), c = Math.cos(this.facingY);
    return { x: this.x + s * 1.4, y: this.y + this.height + 0.8, z: this.z + c * 1.4 };
  }

  /** Punkt podejścia na szczycie (gracz stoi przy krawędzi dachu, by zjechać). */
  getTopApproachPos() {
    const s = Math.sin(this.facingY), c = Math.cos(this.facingY);
    return { x: this.x + s * 1.4, y: this.y + this.height, z: this.z + c * 1.4 };
  }

  /** Gdzie gracz ląduje po zejściu na dół. */
  getBaseLandPos() {
    const s = Math.sin(this.facingY), c = Math.cos(this.facingY);
    return { x: this.x + s * 2.2, y: this.y + 1.0, z: this.z + c * 2.2 };
  }
}
