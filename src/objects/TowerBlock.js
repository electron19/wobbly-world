import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat } from '../core/Materials.js';

/**
 * Wieżowiec-blok — prosta prostopadłościenna wieża bez setbacków.
 *
 * Styl modernistyczny lat 60.–80. (brutalistyczny / prefabrykat).
 * Poziome pasy okien, balkony co kilka pięter, płaski dach z paraptem.
 *
 * Parametry cfg:
 *   w, d    — rzut poziomy (domyślnie 12 × 14)
 *   h       — całkowita wysokość (domyślnie 36)
 *   bodyColor   — kolor betonu/elewacji
 *   trimColor   — kolor akcentów (balkony, gzyms)
 *   glassColor  — kolor pasów okiennych
 *   facing  — obrót Y
 */
export class TowerBlock extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w:         12,
      d:         14,
      h:         36,
      bodyColor:  0xABA89E,
      trimColor:  0x3A3A3A,
      glassColor: 0x5A8A9F,
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w, d, h, bodyColor, trimColor, glassColor, facing } = this.cfg;

    const bodyMat  = toonMat(bodyColor);
    const trimMat  = toonMat(trimColor);
    const glassMat = new THREE.MeshToonMaterial({
      color: glassColor, transparent: true, opacity: 0.80,
    });

    this.root.rotation.y = facing;

    // ── Bryła główna ─────────────────────────────────────────────────────────
    this._box(0, h / 2, 0, w, h, d, bodyMat);

    // ── Płaski dach z paraptem ────────────────────────────────────────────────
    this._box(0, h + 0.25, 0, w + 0.50, 0.50, d + 0.50, trimMat);
    this._box(0, h + 0.70, 0, w + 0.40, 0.40, d + 0.40, bodyMat);

    // ── Poziome pasy okien (co ~3.5 jednostki = 1 piętro) ────────────────────
    const floorH = 3.5;
    const winH   = floorH * 0.52;
    const nFloors = Math.floor(h / floorH);

    for (let f = 0; f < nFloors; f++) {
      const wy = f * floorH + floorH * 0.55;
      // Przód i tył — ciągły pas szklany przez całą szerokość
      [d / 2 + 0.05, -(d / 2 + 0.05)].forEach(gz => {
        this._box(0, wy, gz, w - 0.50, winH, 0.07, glassMat);
      });
      // Boki
      [w / 2 + 0.05, -(w / 2 + 0.05)].forEach(gx => {
        this._box(gx, wy, 0, 0.07, winH, d - 0.50, glassMat);
      });
      // Pozioma listwa między piętrami (beton)
      this._box(0, wy + winH * 0.58, 0, w + 0.08, floorH * 0.22, d + 0.08, bodyMat);
    }

    // ── Balkony co 4 piętra ───────────────────────────────────────────────────
    for (let f = 3; f < nFloors; f += 4) {
      const by = f * floorH + 0.10;
      // Przód
      this._box(0, by + 0.10, d / 2 + 0.85, w - 0.60, 0.18, 1.60, trimMat);
      // Balustrada (pionowe słupki i górna belka)
      this._box(0, by + 0.76, d / 2 + 1.60, w - 0.60, 0.14, 0.08, trimMat);
      for (let si = -2; si <= 2; si++) {
        this._box(si * (w / 6), by + 0.44, d / 2 + 1.60, 0.08, 0.60, 0.08, trimMat);
      }
    }

    // ── Parter — portyk wejściowy ─────────────────────────────────────────────
    const loH = 4.20;
    const loD = 1.40;
    this._box(0, loH / 2, d / 2 + loD / 2, w * 0.65, loH, loD, bodyMat);
    // Szklana fasada parteru
    this._box(0, loH / 2, d / 2 + loD + 0.02, w * 0.55, loH - 0.40, 0.07, glassMat);
    // Poziome ramy okienne
    [1.0, 2.0, 3.0].forEach(ly => {
      this._box(0, ly, d / 2 + loD + 0.03, w * 0.55, 0.08, 0.09, trimMat);
    });
    // Daszek nad portykiem
    this._box(0, loH + 0.15, d / 2 + loD / 2, w * 0.70, 0.26, loD + 0.30, trimMat);

    // ── Ścieżka przed wejściem ────────────────────────────────────────────────
    this._box(0, 0.025, d / 2 + loD + 3.5, w * 0.65, 0.05, 7.0, toonMat(0xC8C4B8));
  }

  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    this._addPhysicsBox(wx, wy + (h + 0.9) / 2, wz, w / 2, (h + 0.9) / 2, d / 2);
  }
}
