import * as THREE from 'three';
import { Building } from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Warehouse — duży magazyn/hala przemysłowa.
 *
 * Bryła: szeroka, niska + dwuspadowy metalowy dach (lekko zaokrąglony).
 * Styl: blacha falista (szara), kilkoro bram, pionowe rygle.
 */
export class Warehouse extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      bodyColor: 0xB0B8C0,   // stalowoszary
      roofColor: 0x8A9299,   // ciemniejszy dach
      doorColor: 0x445566,   // ciemnoniebieska brama
      trimColor: 0xD0D8DF,   // jaśniejszy listwa
      facing:    0,
      w: 24, h: 7, d: 16,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { bodyColor, roofColor, doorColor, trimColor, facing } = this.cfg;
    const W = this.cfg.w, H = this.cfg.h, D = this.cfg.d;

    const bodyMat = toonMat(bodyColor);
    const roofMat = toonMat(roofColor);
    const doorMat = toonMat(doorColor);
    const trimMat = toonMat(trimColor);

    this.root.rotation.y = facing;

    // ── Główne pudło hali ─────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
    body.position.set(0, H / 2, 0);
    addOutline(body, 0.06);
    this.root.add(body);

    // ── Dach dwuspadowy — CylinderGeometry(0, r, h, 4) obrócony ──────────
    const roofH = 2.8;
    const roofGeo = new THREE.CylinderGeometry(0, W * 0.58, roofH, 4, 1);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, H + roofH / 2, 0);
    roof.scale.set(1, 1, D / W * 1.05);
    this.root.add(roof);

    // ── Pionowe rygle na ścianie frontowej (co 4j) ────────────────────────
    const rigelMat = trimMat;
    const nRigels = Math.floor(W / 4);
    for (let i = 0; i <= nRigels; i++) {
      const rx = -W / 2 + i * (W / nRigels);
      this._box(rx, H / 2, D / 2 + 0.04, 0.18, H, 0.12, rigelMat);
    }

    // ── Bramy garażowe na frontowej ścianie ──────────────────────────────
    const gateH = H * 0.75, gateW = 3.6;
    const gateCount = Math.floor(W / 6);
    const gateSpacing = W / gateCount;
    for (let i = 0; i < gateCount; i++) {
      const gx = -W / 2 + gateSpacing * (i + 0.5);
      this._box(gx, gateH / 2, D / 2 + 0.05, gateW, gateH, 0.12, doorMat);
      // Pozioma listwa nad bramą
      this._box(gx, gateH + 0.14, D / 2 + 0.06, gateW + 0.20, 0.28, 0.10, trimMat);
    }

    // ── Listwa pozioma przy ziemi (cokół) ─────────────────────────────────
    this._box(0, 0.18, D / 2 + 0.04, W + 0.2, 0.36, 0.12, trimMat);
    this._box(0, 0.18, -D / 2 - 0.04, W + 0.2, 0.36, 0.12, trimMat);

    // ── Rynna dachowa ─────────────────────────────────────────────────────
    [-W / 2 - 0.08, W / 2 + 0.08].forEach(rx => {
      this._box(rx, H + 0.08, 0, 0.16, 0.16, D, trimMat);
    });
  }

  _buildColliders(wx, wy, wz) {
    const { w: W, h: H, d: D } = this.cfg;
    this._addPhysicsBox(wx, wy + H / 2, wz, W / 2, H / 2, D / 2);
  }
}
